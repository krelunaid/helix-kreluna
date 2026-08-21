import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("AI provider usage and budget accounting stay evidence-bound", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(async () => {
    await vite.close();
  });

  const [xai, budget, providerTypes, providerRegistry] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/ai/providers/xai.ts"),
    vite.ssrLoadModule("/src/lib/server/ai/budget.ts"),
    vite.ssrLoadModule("/src/lib/server/ai/types.ts"),
    vite.ssrLoadModule("/src/lib/server/ai/provider.ts"),
  ]);

  await t.test("xAI documented token and integer-cost fields are preserved", () => {
    const result = xai.parseXaiChatCompletion(
      {
        id: "response-1",
        model: "grok-resolved",
        choices: [{ message: { content: "Delivered artifact" } }],
        usage: {
          prompt_tokens: 120,
          completion_tokens: 30,
          total_tokens: 150,
          prompt_tokens_details: { cached_tokens: 45 },
          cost_in_usd_ticks: "12345678901234567890",
        },
      },
      { requestedModel: "grok-requested", latencyMs: 84 },
    );

    assert.deepEqual(result.usage, {
      inputTokens: 120,
      outputTokens: 30,
      cachedInputTokens: 45,
      totalTokens: 150,
    });
    assert.deepEqual(result.cost, {
      usdTicks: "12345678901234567890",
      kind: "provider_actual",
      pricingVersion: null,
    });
    assert.equal(result.requestedModel, "grok-requested");
    assert.equal(result.reportedModel, "grok-resolved");
    assert.equal(result.responseId, "response-1");
    assert.equal(result.latencyMs, 84);
    assert.equal(result.delivery, "provider");
  });

  await t.test("missing or contradictory provider evidence remains null", () => {
    const missing = xai.parseXaiChatUsage({ usage: {} });
    assert.deepEqual(missing.usage, {
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
      totalTokens: null,
    });
    assert.deepEqual(missing.cost, {
      usdTicks: null,
      kind: "unknown",
      pricingVersion: null,
    });

    const invalid = xai.parseXaiChatUsage({
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 4,
        prompt_tokens_details: { cached_tokens: 11 },
        cost_in_usd_ticks: 1.25,
      },
    });
    assert.deepEqual(invalid.usage, {
      inputTokens: 10,
      outputTokens: 5,
      cachedInputTokens: null,
      totalTokens: null,
    });
    assert.equal(invalid.cost.kind, "unknown");
    assert.equal(invalid.cost.usdTicks, null);
    assert.equal(providerTypes.parseUsdTicks(Number.MAX_SAFE_INTEGER + 1), null);
    assert.equal(providerTypes.parseUsdTicks("1.5"), null);
    assert.equal(providerTypes.parseUsdTicks("0001"), null);
    assert.equal(providerTypes.parseUsdTicks("1".repeat(31)), null);
  });

  await t.test("the xAI adapter sends one explicit provider request", async () => {
    let observed;
    const adapter = xai.createXaiChatCompletionProvider({
      apiKey: "test-only-key",
      fetchImpl: async (url, init) => {
        observed = { url, init };
        return new Response(
          JSON.stringify({
            id: "response-adapter",
            model: "grok-returned",
            choices: [{ message: { content: "ok" } }],
            usage: {
              prompt_tokens: 5,
              completion_tokens: 1,
              total_tokens: 6,
              cost_in_usd_ticks: 2500,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    const result = await adapter.complete({
      model: "grok-requested",
      system: "System contract",
      user: "User request",
      maxOutputTokens: 40,
      timeoutMs: 1_000,
      temperature: 0.2,
      effort: "low",
    });
    const body = JSON.parse(observed.init.body);
    assert.equal(observed.url, "https://api.x.ai/v1/chat/completions");
    assert.equal(observed.init.headers.Authorization, "Bearer test-only-key");
    assert.equal(body.model, "grok-requested");
    assert.equal(body.max_tokens, 40);
    assert.equal(result.cost.usdTicks, "2500");

    const registry = new providerRegistry.AiProviderRegistry([adapter]);
    assert.deepEqual(registry.ids(), ["xai"]);
    assert.equal(registry.get("xai"), adapter);
    assert.throws(() => registry.get("unconfigured"), /AI_PROVIDER_NOT_CONFIGURED/);
    assert.throws(() => registry.register(adapter), /AI_PROVIDER_DUPLICATE/);
  });

  await t.test("HTTP retryability is typed and no provider fallback occurs", async () => {
    for (const [status, retryable] of [
      [400, false],
      [429, true],
      [503, true],
    ]) {
      const adapter = xai.createXaiChatCompletionProvider({
        apiKey: "test-only-key",
        fetchImpl: async () => new Response("no", { status }),
      });
      await assert.rejects(
        adapter.complete({
          model: "grok-test",
          system: "system",
          user: "user",
          maxOutputTokens: 10,
          timeoutMs: 1_000,
          temperature: 0,
        }),
        (error) => {
          assert.equal(error.code, `XAI_HTTP_${status}`);
          assert.equal(error.retryable, retryable);
          return true;
        },
      );
    }
  });

  await t.test("hard cost budgets require exact conservative reservations", () => {
    const policy = budget.defineAiJobBudgetPolicy({
      maxCalls: 2,
      maxRetries: 1,
      maxDurationMs: 1_000,
      maxCostUsdTicks: "1000",
    });
    let state = budget.createAiJobBudgetState(10_000);
    assert.throws(
      () =>
        budget.reserveAiBudgetCall({
          policy,
          state,
          reservationId: "call-without-cost-bound",
          nowMs: 10_001,
          retry: false,
        }),
      /AI_COST_RESERVATION_REQUIRED/,
    );

    const first = budget.reserveAiBudgetCall({
      policy,
      state,
      reservationId: "call-1",
      nowMs: 10_001,
      retry: false,
      maximumCostUsdTicks: "400",
    });
    state = first.state;
    assert.throws(
      () =>
        budget.reserveAiBudgetCall({
          policy,
          state,
          reservationId: "too-expensive-concurrent-call",
          nowMs: 10_002,
          retry: true,
          maximumCostUsdTicks: "700",
        }),
      /AI_BUDGET_MAX_COST/,
    );

    state = budget.settleAiBudgetCall({
      policy,
      state,
      reservationId: first.reservation.id,
      cost: {
        usdTicks: providerTypes.parseUsdTicks("300"),
        kind: "provider_actual",
        pricingVersion: null,
      },
    }).state;
    assert.equal(state.knownCostUsdTicks, "300");
    assert.equal(state.accountedCostUsdTicks, "300");

    const retry = budget.reserveAiBudgetCall({
      policy,
      state,
      reservationId: "call-2-retry",
      nowMs: 10_003,
      retry: true,
      maximumCostUsdTicks: "600",
    });
    state = budget.settleAiBudgetCall({
      policy,
      state: retry.state,
      reservationId: retry.reservation.id,
      cost: { usdTicks: null, kind: "unknown", pricingVersion: null },
    }).state;
    assert.equal(state.knownCostUsdTicks, "300");
    assert.equal(state.accountedCostUsdTicks, "900");
    assert.equal(state.unknownCostCalls, 1);
    assert.equal(state.retryCount, 1);
    assert.throws(
      () =>
        budget.reserveAiBudgetCall({
          policy,
          state,
          reservationId: "call-3",
          nowMs: 10_004,
          retry: false,
          maximumCostUsdTicks: "1",
        }),
      /AI_BUDGET_MAX_CALLS/,
    );
  });

  await t.test("duration, retry and reservation breaches fail closed", () => {
    const policy = budget.defineAiJobBudgetPolicy({
      maxCalls: 3,
      maxRetries: 0,
      maxDurationMs: 50,
      maxCostUsdTicks: "1000",
    });
    const initial = budget.createAiJobBudgetState(1_000);
    assert.throws(
      () =>
        budget.reserveAiBudgetCall({
          policy,
          state: initial,
          reservationId: "late",
          nowMs: 1_050,
          retry: false,
          maximumCostUsdTicks: "1",
        }),
      /AI_BUDGET_MAX_DURATION/,
    );
    assert.throws(
      () =>
        budget.reserveAiBudgetCall({
          policy,
          state: initial,
          reservationId: "retry",
          nowMs: 1_001,
          retry: true,
          maximumCostUsdTicks: "1",
        }),
      /AI_BUDGET_MAX_RETRIES/,
    );
    const reserved = budget.reserveAiBudgetCall({
      policy,
      state: initial,
      reservationId: "under-reserved",
      nowMs: 1_001,
      retry: false,
      maximumCostUsdTicks: "10",
    });
    const settlement = budget.settleAiBudgetCall({
      policy,
      state: reserved.state,
      reservationId: reserved.reservation.id,
      cost: {
        usdTicks: providerTypes.parseUsdTicks("11"),
        kind: "provider_actual",
        pricingVersion: null,
      },
    });
    assert.equal(settlement.violationCode, "AI_COST_RESERVATION_EXCEEDED");
    assert.equal(settlement.state.accountedCostUsdTicks, "11");
    assert.throws(
      () =>
        budget.settleAiBudgetCall({
          policy,
          state: reserved.state,
          reservationId: reserved.reservation.id,
          cost: {
            usdTicks: providerTypes.parseUsdTicks("1"),
            kind: "unknown",
            pricingVersion: null,
          },
        }),
      /AI_COST_EVIDENCE_INVALID/,
    );
  });
});

test("the gateway enforces and persists the real Helix call path", async (t) => {
  const previousKey = process.env.XAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.XAI_API_KEY = ["gateway", "test", "key"].join("-");
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    if (providerCalls === 3) return new Response("unavailable", { status: 503 });
    const cost = providerCalls === 1 ? 1000 : 2500000001;
    return new Response(
      JSON.stringify({
        id: `gateway-response-${providerCalls}`,
        model: "grok-4.5",
        choices: [{ message: { content: `gateway-result-${providerCalls}` } }],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 3,
          total_tokens: 15,
          prompt_tokens_details: { cached_tokens: providerCalls - 1 },
          cost_in_usd_ticks: cost,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
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
  const [create, queue, gateway, telemetry, db] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/jobs/create.ts"),
    vite.ssrLoadModule("/src/lib/server/jobs/queue.ts"),
    vite.ssrLoadModule("/src/lib/server/ai/gateway.ts"),
    vite.ssrLoadModule("/src/lib/server/ai/telemetry.ts"),
    vite.ssrLoadModule("/src/lib/db.ts"),
  ]);
  const pg = await db.getPglite();
  t.after(async () => {
    await vite.close();
    await pg.close();
  });

  const draft = await create.createBuildJobDraft({
    prompt: "Track a provider call without storing its prompt",
    locale: "en",
    mode: "generate",
    currentHtml: null,
  });
  await queue.enqueueBuildJob({
    job: draft.job,
    idempotencyKey: `ai-gateway:${crypto.randomUUID()}`,
    requestFingerprint: draft.requestFingerprint,
  });
  const workerId = crypto.randomUUID();
  const job = await queue.claimBuildJob(draft.job.id, workerId);
  assert.ok(job);
  job.runtime = { workerId, abortSignal: new AbortController().signal };

  const first = await gateway.requestAgentCompletion({
    job,
    contractId: "nova",
    agentId: "Nova",
    logicalCallKey: "nova:gateway-test",
    system: "Stable system prefix",
    user: "Private prompt body",
    temperature: 0.2,
    effort: "low",
    validateContent: () => true,
  });
  assert.equal(first.content, "gateway-result-1");
  assert.equal(job.aiUsage.callCount, 1);
  assert.equal(job.aiUsage.applicationCacheHitCount, 0);
  assert.equal(job.aiUsage.knownInputTokens, 12);
  assert.equal(job.aiUsage.knownCachedInputTokens, 0);
  assert.equal(job.aiUsage.providerActualCostUsdTicks, "1000");
  assert.equal(job.aiUsage.actualCostComplete, true);

  await assert.rejects(
    gateway.requestAgentCompletion({
      job,
      contractId: "nova",
      agentId: "Nova",
      logicalCallKey: "nova:gateway-cost-breach",
      system: "Stable system prefix",
      user: "A second private prompt body",
      temperature: 0.2,
      effort: "low",
      validateContent: () => true,
    }),
    (error) => {
      assert.equal(error.code, "AI_COST_RESERVATION_EXCEEDED");
      assert.equal(error.retryable, false);
      return true;
    },
  );
  assert.equal(providerCalls, 2);
  assert.equal(job.aiUsage.callCount, 2);
  assert.equal(job.aiUsage.providerActualCostUsdTicks, "2500001001");

  await assert.rejects(
    gateway.requestAgentCompletion({
      job,
      contractId: "atlas",
      agentId: "Atlas",
      logicalCallKey: "atlas:gateway-provider-failure",
      system: "Stable architecture prefix",
      user: "Private architecture input",
      temperature: 0.2,
      effort: "low",
      validateContent: () => true,
    }),
    (error) => {
      assert.equal(error.code, "XAI_HTTP_503");
      assert.equal(error.retryable, true);
      return true;
    },
  );
  assert.equal(job.aiUsage.callCount, 3);
  assert.equal(job.aiUsage.failedCallCount, 1);
  assert.equal(job.aiUsage.unknownCostCallCount, 1);
  assert.equal(job.aiUsage.actualCostComplete, false);
  assert.equal(job.aiUsage.accountedCostUsdTicks, "5500001001");

  const calls = await pg.query(
    `select logical_call_key, status, provider, requested_model, input_tokens,
            cached_input_tokens, cost_usd_ticks::text as cost_usd_ticks,
            maximum_cost_usd_ticks::text as maximum_cost_usd_ticks,
            request_sha256, result_sha256
     from build_job_ai_calls
     where job_id = $1
     order by case logical_call_key
       when 'nova:gateway-test' then 1
       when 'nova:gateway-cost-breach' then 2
       else 3
     end`,
    [job.id],
  );
  assert.equal(calls.rows.length, 3);
  assert.deepEqual(
    calls.rows.map((row) => [
      row.status,
      row.provider,
      row.requested_model,
      row.input_tokens,
      row.maximum_cost_usd_ticks,
    ]),
    [
      ["succeeded", "xai", "grok-4.5", 12, "2500000000"],
      ["succeeded", "xai", "grok-4.5", 12, "2500000000"],
      ["failed", "xai", "grok-4.5", null, "3000000000"],
    ],
  );
  assert.match(calls.rows[0].request_sha256, /^[0-9a-f]{64}$/);
  assert.match(calls.rows[0].result_sha256, /^[0-9a-f]{64}$/);
  assert.equal(calls.rows[2].result_sha256, null);
  assert.notEqual(calls.rows[0].request_sha256, calls.rows[1].request_sha256);
  const columns = await pg.query(
    `select column_name from information_schema.columns
     where table_name = 'build_job_ai_calls'`,
  );
  const names = new Set(columns.rows.map((row) => row.column_name));
  assert.equal(names.has("prompt"), false);
  assert.equal(names.has("response_content"), false);
  assert.equal(names.has("api_key"), false);

  const abandonedCallId = crypto.randomUUID();
  await pg.query(
    `select reserve_build_job_ai_call(
       $1, $2, $3, 'iris:abandoned', 0, 'Iris', 'iris', 'xai',
       'grok-4.5', $4, 2000000000, 16, 2, 600000, 90000000000
     )`,
    [abandonedCallId, job.id, workerId, "d".repeat(64)],
  );
  const recoveryWorkerId = crypto.randomUUID();
  await pg.query(
    `update build_jobs
     set attempt_count = 2,
         locked_by = $2,
         lock_expires_at = now() + interval '90 seconds'
     where id = $1`,
    [job.id, recoveryWorkerId],
  );
  assert.equal(
    await telemetry.recoverStaleAiCalls({
      jobId: job.id,
      workerId: recoveryWorkerId,
    }),
    1,
  );
  const recovered = await pg.query(
    `select status, cost_kind, error_code
     from build_job_ai_calls where call_id = $1`,
    [abandonedCallId],
  );
  assert.deepEqual(recovered.rows[0], {
    status: "unknown",
    cost_kind: "unknown",
    error_code: "AI_CALL_OUTCOME_UNKNOWN_AFTER_WORKER_RESTART",
  });
  const recoveredBudget = await pg.query(
    `select ai_reserved_cost_usd_ticks::text as reserved,
            ai_accounted_cost_usd_ticks::text as accounted
     from build_jobs where id = $1`,
    [job.id],
  );
  assert.deepEqual(recoveredBudget.rows[0], {
    reserved: "0",
    accounted: "7500001001",
  });
});

test("AI call telemetry migration stores exact evidence and seals terminal rows", async (t) => {
  const pg = new PGlite();
  await pg.waitReady;
  t.after(() => pg.close());
  const migrationsUrl = new URL("../migrations/", import.meta.url);
  const names = (await readdir(migrationsUrl)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of names) {
    await pg.exec(await readFile(new URL(name, migrationsUrl), "utf8"));
  }
  await pg.exec(await readFile(new URL("0017_ai_call_telemetry.sql", migrationsUrl), "utf8"));

  await pg.query(
    `insert into build_jobs (
       id, payload, idempotency_key, request_fingerprint
     ) values ($1, $2, $3, $4)`,
    [
      "job-ai-telemetry",
      JSON.stringify({ buildLevel: "prototype" }),
      "ai-telemetry-idempotency",
      "a".repeat(64),
    ],
  );
  await pg.query(
    `insert into build_job_ai_calls (
       call_id, job_id, attempt_number, logical_call_key, retry_index,
       agent_id, contract_id, provider, requested_model, request_sha256,
       maximum_cost_usd_ticks
     ) values ($1, $2, 1, $3, 0, $4, $5, $6, $7, $8, 2000000000)`,
    [
      "call-ai-telemetry",
      "job-ai-telemetry",
      "nova:plan",
      "Nova",
      "nova",
      "xai",
      "grok-requested",
      "b".repeat(64),
    ],
  );
  await pg.query(
    `update build_job_ai_calls
     set status = 'succeeded',
         reported_model = 'grok-resolved',
         response_id = 'response-1',
         result_sha256 = '${"e".repeat(64)}',
         input_tokens = 120,
         output_tokens = 30,
         cached_input_tokens = 45,
         total_tokens = 150,
         latency_ms = 84,
         cost_usd_ticks = 12345678901234567890,
         cost_kind = 'provider_actual',
         finished_at = now()
     where call_id = 'call-ai-telemetry'`,
  );
  const stored = await pg.query(
    `select status, input_tokens, output_tokens, cached_input_tokens,
            cost_usd_ticks::text as cost_usd_ticks, cost_kind
     from build_job_ai_calls
     where call_id = 'call-ai-telemetry'`,
  );
  assert.deepEqual(stored.rows[0], {
    status: "succeeded",
    input_tokens: 120,
    output_tokens: 30,
    cached_input_tokens: 45,
    cost_usd_ticks: "12345678901234567890",
    cost_kind: "provider_actual",
  });

  await assert.rejects(
    pg.query(
      "update build_job_ai_calls set response_id = 'changed' where call_id = 'call-ai-telemetry'",
    ),
    /AI_CALL_TELEMETRY_IMMUTABLE/,
  );
  await assert.rejects(
    pg.query("delete from build_job_ai_calls where call_id = 'call-ai-telemetry'"),
    /AI_CALL_TELEMETRY_IMMUTABLE/,
  );
  await assert.rejects(
    pg.query(
      `insert into build_job_ai_calls (
         call_id, job_id, attempt_number, logical_call_key, agent_id,
         contract_id, provider, requested_model, request_sha256,
         maximum_cost_usd_ticks, status, latency_ms, cost_kind, finished_at
       ) values (
         'call-invalid-cost', 'job-ai-telemetry', 1, 'atlas:architecture',
         'Atlas', 'atlas', 'xai', 'grok-test', $1, 3000000000,
         'succeeded', 1, 'provider_actual', now()
       )`,
      ["c".repeat(64)],
    ),
    /build_job_ai_calls.*check|violates check constraint/i,
  );
});
