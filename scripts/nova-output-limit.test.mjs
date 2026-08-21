import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("Nova has room to close its PRD JSON and still rejects a length-truncated response", async (t) => {
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

  const [{ AGENT_CONTRACTS }, { novaSystemPrompt }, openai] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/agents/contracts.ts"),
    vite.ssrLoadModule("/src/lib/server/prompts/helix.ts"),
    vite.ssrLoadModule("/src/lib/server/ai/providers/openai.ts"),
  ]);
  const nova = AGENT_CONTRACTS.nova;

  assert.equal(nova.version, "3.1.0");
  assert.equal(nova.maxTokens, 2_400);
  assert.equal(nova.maxRetries, 0, "a truncated PRD must not trigger a second paid call");
  assert.equal(nova.maxCostUsd, 0.25);
  assert.equal(nova.maxCostUsdTicks, "2500000000");
  assert.match(
    novaSystemPrompt("Italian", "Locked brief", "prototype"),
    /Complete every required key and close the JSON[\s\S]*under 1,800 tokens/u,
  );

  let providerCalls = 0;
  let requestBody;
  const provider = openai.createOpenAiGatewayChatCompletionProvider({
    gatewayKey: "test-only-key",
    baseUrl: "https://gateway.test",
    fetchImpl: async (_url, init) => {
      providerCalls += 1;
      requestBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          id: "nova-truncated-at-contract-ceiling",
          model: "gpt-5.6-terra",
          choices: [
            {
              finish_reason: "length",
              message: { content: '{"title":"Partial PRD"', refusal: null },
            },
          ],
          usage: {
            prompt_tokens: 400,
            completion_tokens: nova.maxTokens,
            total_tokens: 400 + nova.maxTokens,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  await assert.rejects(
    provider.complete({
      model: nova.model,
      system: novaSystemPrompt("Italian", "Locked brief", "prototype"),
      user: "Crea un gestionale per commercialisti",
      maxOutputTokens: nova.maxTokens,
      providerMaxOutputTokens: nova.maxTokens,
      timeoutMs: nova.timeoutMs,
      temperature: 0.2,
      effort: "low",
    }),
    (error) => {
      assert.equal(error.code, "OPENAI_GATEWAY_RESPONSE_INCOMPLETE_MAX_OUTPUT_TOKENS");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.equal(providerCalls, 1);
  assert.equal(requestBody.max_completion_tokens, 2_400);
  assert.equal(requestBody.reasoning_effort, "none");
  assert.equal(requestBody.store, false);
});

test("a length-truncated Nova call is charged once against the unchanged conservative cap", async (t) => {
  const previousEnabled = process.env.HELIX_AI_GATEWAY_ENABLED;
  const previousKey = process.env.NETLIFY_AI_GATEWAY_KEY;
  const previousBaseUrl = process.env.NETLIFY_AI_GATEWAY_BASE_URL;
  const previousFetch = globalThis.fetch;
  process.env.HELIX_AI_GATEWAY_ENABLED = "true";
  process.env.NETLIFY_AI_GATEWAY_KEY = "test-only-key";
  process.env.NETLIFY_AI_GATEWAY_BASE_URL = "https://gateway.test";

  let providerCalls = 0;
  globalThis.fetch = async (_url, init) => {
    providerCalls += 1;
    const body = JSON.parse(init.body);
    assert.equal(body.max_completion_tokens, 2_400);
    return new Response(
      JSON.stringify({
        id: "nova-accounted-length-failure",
        model: "gpt-5.6-terra",
        choices: [
          {
            finish_reason: "length",
            message: { content: '{"title":"Still partial"', refusal: null },
          },
        ],
        usage: {
          prompt_tokens: 400,
          completion_tokens: 2_400,
          total_tokens: 2_800,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousEnabled === undefined) delete process.env.HELIX_AI_GATEWAY_ENABLED;
    else process.env.HELIX_AI_GATEWAY_ENABLED = previousEnabled;
    if (previousKey === undefined) delete process.env.NETLIFY_AI_GATEWAY_KEY;
    else process.env.NETLIFY_AI_GATEWAY_KEY = previousKey;
    if (previousBaseUrl === undefined) delete process.env.NETLIFY_AI_GATEWAY_BASE_URL;
    else process.env.NETLIFY_AI_GATEWAY_BASE_URL = previousBaseUrl;
  });

  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  const [create, queue, gateway, db] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/jobs/create.ts"),
    vite.ssrLoadModule("/src/lib/server/jobs/queue.ts"),
    vite.ssrLoadModule("/src/lib/server/ai/gateway.ts"),
    vite.ssrLoadModule("/src/lib/db.ts"),
  ]);
  const pg = await db.getPglite();
  t.after(async () => {
    await vite.close();
    await pg.close();
  });

  const draft = await create.createBuildJobDraft({
    prompt: "Crea un gestionale per commercialisti",
    locale: "it",
    mode: "generate",
    currentHtml: null,
  });
  await queue.enqueueBuildJob({
    job: draft.job,
    idempotencyKey: `nova-output-limit:${crypto.randomUUID()}`,
    requestFingerprint: draft.requestFingerprint,
  });
  const workerId = crypto.randomUUID();
  const job = await queue.claimBuildJob(draft.job.id, workerId);
  assert.ok(job);
  job.runtime = { workerId, abortSignal: new AbortController().signal };

  await assert.rejects(
    gateway.requestAgentCompletion({
      job,
      contractId: "nova",
      agentId: "Nova",
      logicalCallKey: "nova:length-regression",
      system: "Return a complete PRD JSON",
      user: draft.job.prompt,
      temperature: 0.2,
      effort: "low",
      validateContent: () => false,
    }),
    (error) =>
      error?.code === "OPENAI_GATEWAY_RESPONSE_INCOMPLETE_MAX_OUTPUT_TOKENS" &&
      error.retryable === false,
  );

  assert.equal(providerCalls, 1);
  assert.equal(job.aiUsage.callCount, 1);
  assert.equal(job.aiUsage.failedCallCount, 1);
  assert.equal(job.aiUsage.unknownCostCallCount, 1);
  assert.equal(job.aiUsage.providerActualCostUsdTicks, "0");
  assert.equal(job.aiUsage.accountedCostUsdTicks, "2500000000");
  assert.equal(job.aiUsage.actualCostComplete, false);

  const evidence = await pg.query(
    `select status, error_code,
            maximum_cost_usd_ticks::text as maximum_cost_usd_ticks,
            result_sha256
     from build_job_ai_calls
     where job_id = $1 and logical_call_key = 'nova:length-regression'`,
    [job.id],
  );
  assert.deepEqual(evidence.rows, [
    {
      status: "failed",
      error_code: "OPENAI_GATEWAY_RESPONSE_INCOMPLETE_MAX_OUTPUT_TOKENS",
      maximum_cost_usd_ticks: "2500000000",
      result_sha256: null,
    },
  ]);
});
