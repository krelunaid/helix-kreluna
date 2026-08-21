import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requestHash({ system, user }) {
  return sha256(
    JSON.stringify({
      provider: "xai",
      contractId: "nova",
      model: "grok-4.5",
      system,
      user,
      maxOutputTokens: 1_200,
      temperature: 0.2,
      effort: "low",
    }),
  );
}

test("authenticated AI response caching is isolated, evidenced and TTL-bound", async (t) => {
  const previousKey = process.env.XAI_API_KEY;
  const previousFetch = globalThis.fetch;
  delete process.env.XAI_API_KEY;
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = previousKey;
  });

  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  const [create, queue, gateway, cache, forge, db] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/jobs/create.ts"),
    vite.ssrLoadModule("/src/lib/server/jobs/queue.ts"),
    vite.ssrLoadModule("/src/lib/server/ai/gateway.ts"),
    vite.ssrLoadModule("/src/lib/server/ai/cache.ts"),
    vite.ssrLoadModule("/src/lib/server/agents/forge.ts"),
    vite.ssrLoadModule("/src/lib/db.ts"),
  ]);
  const pg = await db.getPglite();
  t.after(async () => {
    await vite.close();
    await pg.close();
  });

  for (const userId of ["cache-owner-a", "cache-owner-b"]) {
    await pg.query(
      `insert into "user" (
         "id", "name", "email", "emailVerified", "createdAt", "updatedAt"
       ) values ($1, $2, $3, true, now(), now())`,
      [userId, userId, `${userId}@example.invalid`],
    );
  }

  const system = "Stable, versioned Nova system contract";
  const user = "Create the same private plan without calling the provider";
  const cacheKey = {
    userId: "cache-owner-a",
    provider: "xai",
    requestedModel: "grok-4.5",
    contractId: "nova",
    contractVersion: "2.0.0",
    requestSha256: requestHash({ system, user }),
  };
  await cache.writeAiResponseCache({
    key: cacheKey,
    result: {
      provider: "xai",
      requestedModel: "grok-4.5",
      reportedModel: "grok-4.5-resolved",
      responseId: "provider-response-redacted-from-cache",
      content: "cached authenticated result",
      latencyMs: 91,
      usage: {
        inputTokens: 99,
        outputTokens: 8,
        cachedInputTokens: 12,
        totalTokens: 107,
      },
      cost: { usdTicks: "1234", kind: "provider_actual", pricingVersion: null },
      delivery: "provider",
    },
  });

  async function claimedJob(input) {
    const draft = await create.createBuildJobDraft({
      prompt: "Cache isolation test",
      locale: "en",
      mode: "generate",
      currentHtml: null,
      userId: input.userId,
    });
    await queue.enqueueBuildJob({
      job: draft.job,
      idempotencyKey: `cache-test:${randomUUID()}`,
      requestFingerprint: draft.requestFingerprint,
    });
    const workerId = randomUUID();
    const job = await queue.claimBuildJob(draft.job.id, workerId);
    assert.ok(job);
    job.runtime = { workerId, abortSignal: new AbortController().signal };
    return job;
  }

  const ownerJob = await claimedJob({ userId: "cache-owner-a" });
  const hit = await gateway.requestAgentCompletion({
    job: ownerJob,
    contractId: "nova",
    agentId: "Nova",
    logicalCallKey: "nova:cache-hit",
    system,
    user,
    temperature: 0.2,
    effort: "low",
    validateContent: (content) => content === "cached authenticated result",
  });
  assert.equal(hit.delivery, "application_cache");
  assert.equal(hit.content, "cached authenticated result");
  assert.equal(hit.responseId, null);
  assert.deepEqual(hit.usage, {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    totalTokens: 0,
  });
  assert.equal(ownerJob.aiUsage.callCount, 0);
  assert.equal(ownerJob.aiUsage.applicationCacheHitCount, 1);
  assert.equal(ownerJob.aiUsage.knownCachedInputTokens, 0);
  await assert.rejects(
    gateway.requestAgentCompletion({
      job: ownerJob,
      contractId: "nova",
      agentId: "Nova",
      logicalCallKey: "nova:missing-content-validator",
      system,
      user,
      temperature: 0.2,
      effort: "low",
    }),
    (error) => error?.code === "AI_AGENT_CONTRACT_INVALID",
  );

  const evidence = await pg.query(
    `select hit.cache_id, hit.contract_id, hit.request_sha256,
            count(call.call_id)::integer as provider_calls
     from build_job_ai_cache_hits hit
     left join build_job_ai_calls call on call.job_id = hit.job_id
     where hit.job_id = $1
     group by hit.cache_id, hit.contract_id, hit.request_sha256`,
    [ownerJob.id],
  );
  assert.equal(evidence.rows.length, 1);
  assert.equal(evidence.rows[0].contract_id, "nova");
  assert.equal(evidence.rows[0].request_sha256, cacheKey.requestSha256);
  assert.equal(evidence.rows[0].provider_calls, 0);

  const otherOwnerJob = await claimedJob({ userId: "cache-owner-b" });
  await assert.rejects(
    gateway.requestAgentCompletion({
      job: otherOwnerJob,
      contractId: "nova",
      agentId: "Nova",
      logicalCallKey: "nova:cross-tenant-miss",
      system,
      user,
      temperature: 0.2,
      effort: "low",
      validateContent: (content) => content === "cached authenticated result",
    }),
    /XAI_API_KEY_MISSING/,
  );

  const guestJob = await claimedJob({ userId: undefined });
  await assert.rejects(
    gateway.requestAgentCompletion({
      job: guestJob,
      contractId: "nova",
      agentId: "Nova",
      logicalCallKey: "nova:guest-cache-bypass",
      system,
      user,
      temperature: 0.2,
      effort: "low",
      validateContent: (content) => content === "cached authenticated result",
    }),
    /XAI_API_KEY_MISSING/,
  );
  const unauthorizedHits = await pg.query(
    `select count(*)::integer as count
     from build_job_ai_cache_hits
     where job_id in ($1, $2)`,
    [otherOwnerJob.id, guestJob.id],
  );
  assert.equal(unauthorizedHits.rows[0].count, 0);

  await pg.query(
    `update ai_response_cache
     set created_at = now() - interval '2 seconds',
         expires_at = now() - interval '1 second'
     where user_id = $1`,
    [cacheKey.userId],
  );
  assert.equal(await cache.readAiResponseCache(cacheKey), null);
  const purged = await pg.query("select purge_expired_ai_response_cache(10) as count");
  assert.equal(purged.rows[0].count, 1);
  const retainedEvidence = await pg.query(
    "select count(*)::integer as count from build_job_ai_cache_hits where job_id = $1",
    [ownerJob.id],
  );
  assert.equal(retainedEvidence.rows[0].count, 1);

  const corruptKey = { ...cacheKey, requestSha256: "f".repeat(64) };
  await cache.writeAiResponseCache({
    key: corruptKey,
    result: {
      provider: "xai",
      requestedModel: "grok-4.5",
      reportedModel: null,
      responseId: null,
      content: "integrity-bound content",
      latencyMs: 0,
      usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, totalTokens: 2 },
      cost: { usdTicks: null, kind: "unknown", pricingVersion: null },
    },
  });
  await pg.query("update ai_response_cache set content = 'tampered' where request_sha256 = $1", [
    corruptKey.requestSha256,
  ]);
  assert.equal(await cache.readAiResponseCache(corruptKey), null);
  const corruptRows = await pg.query(
    "select count(*)::integer as count from ai_response_cache where request_sha256 = $1",
    [corruptKey.requestSha256],
  );
  assert.equal(corruptRows.rows[0].count, 0);

  process.env.XAI_API_KEY = "cache-placeholder-key";
  const sourceHtml = `<!doctype html><html><head><title>Source</title></head><body><main>${"source interaction ".repeat(
    28,
  )}</main><script>document.body.dataset.ready = "true";</script></body></html>`;
  const validProviderHtml = `<!doctype html><html><head><title>Validated</title></head><body><main>${"validated interaction ".repeat(
    28,
  )}</main><button id="primary">Continue</button><script>document.querySelector("#primary").addEventListener("click", () => { document.body.dataset.clicked = "true"; });</script></body></html>`;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    const content =
      providerCalls === 1
        ? "This is not an HTML document"
        : providerCalls === 2
          ? validProviderHtml
          : "provider-valid-after-eviction";
    return new Response(
      JSON.stringify({
        id: `cache-boundary-provider-${providerCalls}`,
        model: providerCalls <= 2 ? "grok-4.6" : "grok-4.5",
        choices: [{ message: { content } }],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
          prompt_tokens_details: { cached_tokens: 0 },
          cost_in_usd_ticks: 1000,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const forgeJob = await claimedJob({ userId: "cache-owner-a" });
  const forgeInput = {
    prompt: "Add a deterministic primary interaction",
    locale: "en",
    lang: "English",
    mode: "generate",
    currentHtml: sourceHtml,
    plan: null,
    architecture: null,
    design: null,
    extra: [],
    job: forgeJob,
  };
  const invalidFirst = await forge.agentBuild(forgeInput, "logic", 0, "forge:cache-contract");
  assert.equal(invalidFirst, null);
  assert.equal(providerCalls, 1);
  const afterInvalidProvider = await pg.query(
    `select count(*)::integer as count
     from ai_response_cache
     where user_id = $1 and contract_id = 'forgeLogic'`,
    [forgeJob.userId],
  );
  assert.equal(afterInvalidProvider.rows[0].count, 0);

  const retry = await forge.agentBuild(forgeInput, "logic", 1, "forge:cache-contract");
  assert.equal(retry, validProviderHtml);
  assert.equal(providerCalls, 2);
  const validHit = await forge.agentBuild(forgeInput, "logic", 0, "forge:cache-contract");
  assert.equal(validHit, validProviderHtml);
  assert.equal(providerCalls, 2);
  assert.equal(forgeJob.aiUsage.callCount, 2);
  assert.equal(forgeJob.aiUsage.applicationCacheHitCount, 1);

  const invalidRowSystem = "Nova cache contract eviction boundary";
  const invalidRowUser = "Return the provider-valid cache replacement";
  const invalidRowKey = {
    ...cacheKey,
    requestSha256: requestHash({ system: invalidRowSystem, user: invalidRowUser }),
  };
  await cache.writeAiResponseCache({
    key: invalidRowKey,
    result: {
      provider: "xai",
      requestedModel: "grok-4.5",
      reportedModel: "grok-4.5",
      responseId: null,
      content: "preexisting contract-invalid content",
      latencyMs: 1,
      usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, totalTokens: 2 },
      cost: { usdTicks: null, kind: "unknown", pricingVersion: null },
      delivery: "provider",
    },
  });
  const invalidRowJob = await claimedJob({ userId: "cache-owner-a" });
  const invalidRowRequest = {
    job: invalidRowJob,
    contractId: "nova",
    agentId: "Nova",
    logicalCallKey: "nova:invalid-row-eviction",
    system: invalidRowSystem,
    user: invalidRowUser,
    temperature: 0.2,
    effort: "low",
    validateContent: (content) => content === "provider-valid-after-eviction",
  };
  const replaced = await gateway.requestAgentCompletion(invalidRowRequest);
  assert.equal(replaced.delivery, "provider");
  assert.equal(replaced.content, "provider-valid-after-eviction");
  assert.equal(providerCalls, 3);
  assert.equal(invalidRowJob.aiUsage.applicationCacheHitCount, 0);
  const noInvalidHitEvidence = await pg.query(
    `select count(*)::integer as count
     from build_job_ai_cache_hits
     where job_id = $1`,
    [invalidRowJob.id],
  );
  assert.equal(noInvalidHitEvidence.rows[0].count, 0);

  const replacementHit = await gateway.requestAgentCompletion(invalidRowRequest);
  assert.equal(replacementHit.delivery, "application_cache");
  assert.equal(replacementHit.content, "provider-valid-after-eviction");
  assert.equal(providerCalls, 3);
  assert.equal(invalidRowJob.aiUsage.applicationCacheHitCount, 1);
  const storedReplacement = await pg.query(
    `select content
     from ai_response_cache
     where user_id = $1 and request_sha256 = $2`,
    [invalidRowKey.userId, invalidRowKey.requestSha256],
  );
  assert.deepEqual(storedReplacement.rows, [{ content: "provider-valid-after-eviction" }]);
});
