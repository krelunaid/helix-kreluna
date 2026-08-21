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

  const [openai, budget, providerTypes, providerRegistry] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/ai/providers/openai.ts"),
    vite.ssrLoadModule("/src/lib/server/ai/budget.ts"),
    vite.ssrLoadModule("/src/lib/server/ai/types.ts"),
    vite.ssrLoadModule("/src/lib/server/ai/provider.ts"),
  ]);

  await t.test("OpenAI documented token fields are preserved without invented cost", () => {
    const result = openai.parseOpenAiChatCompletion(
      {
        id: "response-1",
        model: "gpt-5.6-terra-resolved",
        choices: [
          {
            finish_reason: "stop",
            message: { content: "Delivered artifact", refusal: null },
          },
        ],
        usage: {
          prompt_tokens: 120,
          completion_tokens: 30,
          total_tokens: 150,
          prompt_tokens_details: { cached_tokens: 45 },
        },
      },
      { requestedModel: "gpt-5.6-terra", latencyMs: 84 },
    );

    assert.deepEqual(result.usage, {
      inputTokens: 120,
      outputTokens: 30,
      cachedInputTokens: 45,
      totalTokens: 150,
    });
    assert.deepEqual(result.cost, {
      usdTicks: null,
      kind: "unknown",
      pricingVersion: null,
    });
    assert.equal(result.requestedModel, "gpt-5.6-terra");
    assert.equal(result.reportedModel, "gpt-5.6-terra-resolved");
    assert.equal(result.responseId, "response-1");
    assert.equal(result.latencyMs, 84);
    assert.equal(result.delivery, "provider");
  });

  await t.test("missing or contradictory provider evidence remains null", () => {
    const missing = openai.parseOpenAiChatUsage({ usage: {} });
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

    const invalid = openai.parseOpenAiChatUsage({
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 4,
        prompt_tokens_details: { cached_tokens: 11 },
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

  await t.test("the Gateway adapter sends one explicit, non-stored OpenAI request", async () => {
    let observed;
    const adapter = openai.createOpenAiGatewayChatCompletionProvider({
      gatewayKey: "test-only-key",
      baseUrl: "https://gateway.test",
      fetchImpl: async (url, init) => {
        observed = { url, init };
        return new Response(
          JSON.stringify({
            id: "response-adapter",
            model: "gpt-5.6-terra",
            choices: [
              { finish_reason: "stop", message: { content: "ok", refusal: null } },
            ],
            usage: {
              prompt_tokens: 5,
              completion_tokens: 1,
              total_tokens: 6,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    const result = await adapter.complete({
      model: "gpt-5.6-terra",
      system: "System contract",
      user: "User request",
      maxOutputTokens: 40,
      providerMaxOutputTokens: 40,
      timeoutMs: 1_000,
      temperature: 0.2,
      effort: "low",
      safetyIdentifier: "a".repeat(64),
    });
    const body = JSON.parse(observed.init.body);
    assert.equal(observed.url, "https://gateway.test/v1/chat/completions");
    assert.equal(observed.init.headers.Authorization, "Bearer test-only-key");
    assert.equal(body.model, "gpt-5.6-terra");
    assert.equal(body.max_completion_tokens, 40);
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.temperature, 0.2);
    assert.equal(body.store, false);
    assert.equal(body.safety_identifier, "a".repeat(64));
    assert.deepEqual(body.messages, [
      { role: "developer", content: "System contract" },
      { role: "user", content: "User request" },
    ]);
    assert.equal(result.cost.usdTicks, null);

    const alreadyVersioned = openai.createOpenAiGatewayChatCompletionProvider({
      gatewayKey: "test-only-key",
      baseUrl: "https://gateway.test/v1/",
      fetchImpl: async (url, init) => {
        assert.equal(url, "https://gateway.test/v1/chat/completions");
        const highBody = JSON.parse(init.body);
        assert.equal(highBody.max_completion_tokens, 25_000);
        assert.equal(highBody.reasoning_effort, "high");
        assert.equal("temperature" in highBody, false);
        assert.equal(highBody.store, false);
        return new Response(
          JSON.stringify({
            id: "high-effort",
            model: "gpt-5.6-terra",
            choices: [{ finish_reason: "stop", message: { content: "ok" } }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 9_000,
              total_tokens: 9_010,
              completion_tokens_details: { reasoning_tokens: 1_000 },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    await alreadyVersioned.complete({
      model: "gpt-5.6-terra",
      system: "System contract",
      user: "User request",
      maxOutputTokens: 8_192,
      providerMaxOutputTokens: 25_000,
      timeoutMs: 1_000,
      temperature: 0.2,
      effort: "high",
    });

    const multimodalUser = [
      { type: "text", text: "Inspect this evidence" },
      { type: "image_url", image_url: { url: "data:image/png;base64,aGVsaXg=" } },
    ];
    const multimodal = openai.createOpenAiGatewayChatCompletionProvider({
      gatewayKey: "test-only-key",
      baseUrl: "http://127.0.0.1:9999",
      fetchImpl: async (_url, init) => {
        const multimodalBody = JSON.parse(init.body);
        assert.deepEqual(multimodalBody.messages[1], {
          role: "user",
          content: multimodalUser,
        });
        return new Response(
          JSON.stringify({
            id: "multimodal",
            model: "gpt-5.6-terra",
            choices: [{ finish_reason: "stop", message: { content: "reviewed" } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    await multimodal.complete({
      model: "gpt-5.6-terra",
      system: "Review evidence",
      user: multimodalUser,
      maxOutputTokens: 800,
      providerMaxOutputTokens: 800,
      timeoutMs: 1_000,
      temperature: 0.1,
      effort: "low",
    });

    assert.throws(
      () =>
        openai.createOpenAiGatewayChatCompletionProvider({
          gatewayKey: "test-only-key",
          baseUrl: "http://gateway.test",
        }),
      /NETLIFY_AI_GATEWAY_CONFIGURATION_INVALID/,
    );
    assert.throws(
      () =>
        openai.createOpenAiGatewayChatCompletionProvider({
          gatewayKey: "test-only-key",
          baseUrl: "https://api.openai.com",
        }),
      /NETLIFY_AI_GATEWAY_CONFIGURATION_INVALID/,
    );
    await assert.rejects(
      adapter.complete({
        model: "gpt-5.6-terra",
        system: "system",
        user: "user",
        maxOutputTokens: 40,
        providerMaxOutputTokens: 40,
        timeoutMs: 1_000,
        temperature: 0.2,
        effort: "medium",
      }),
      (error) => error?.code === "AI_REQUEST_INVALID" && error.retryable === false,
    );

    const registry = new providerRegistry.AiProviderRegistry([adapter]);
    assert.deepEqual(registry.ids(), ["openai"]);
    assert.equal(registry.get("openai"), adapter);
    assert.throws(() => registry.get("unconfigured"), /AI_PROVIDER_NOT_CONFIGURED/);
    assert.throws(() => registry.register(adapter), /AI_PROVIDER_DUPLICATE/);

    const compatibilityFallback = openai.resolveOpenAiGatewayConfiguration({
      NETLIFY_AI_GATEWAY_KEY: "partial-native-placeholder",
      OPENAI_API_KEY: "compatibility-placeholder-key",
      OPENAI_BASE_URL: "https://compatibility-gateway.test/v1",
    });
    assert.deepEqual(compatibilityFallback, {
      gatewayKey: "compatibility-placeholder-key",
      baseUrl: "https://compatibility-gateway.test/v1",
      source: "openai_compatibility",
    });

    const nativePreferred = openai.resolveOpenAiGatewayConfiguration({
      NETLIFY_AI_GATEWAY_KEY: "native-placeholder-key",
      NETLIFY_AI_GATEWAY_BASE_URL: "https://native-gateway.test",
      OPENAI_API_KEY: "compatibility-placeholder-key",
      OPENAI_BASE_URL: "https://compatibility-gateway.test/v1",
    });
    assert.deepEqual(nativePreferred, {
      gatewayKey: "native-placeholder-key",
      baseUrl: "https://native-gateway.test",
      source: "netlify",
    });
    assert.equal(
      openai.resolveOpenAiGatewayConfiguration({
        NETLIFY_AI_GATEWAY_KEY: "partial-native-placeholder",
        OPENAI_BASE_URL: "https://partial-compatibility.test",
      }),
      null,
    );
    assert.throws(
      () =>
        openai.resolveOpenAiGatewayConfiguration({
          OPENAI_API_KEY: "direct-provider-placeholder",
          OPENAI_BASE_URL: "https://api.openai.com/v1",
        }),
      /NETLIFY_AI_GATEWAY_CONFIGURATION_INVALID/u,
    );
  });

  await t.test("incomplete, filtered and refused responses fail closed", () => {
    for (const [payload, code] of [
      [
        { choices: [{ finish_reason: "length", message: { content: "partial" } }] },
        "OPENAI_GATEWAY_RESPONSE_INCOMPLETE_MAX_OUTPUT_TOKENS",
      ],
      [
        { choices: [{ finish_reason: "content_filter", message: { content: null } }] },
        "OPENAI_GATEWAY_RESPONSE_CONTENT_FILTERED",
      ],
      [
        { choices: [{ finish_reason: "tool_calls", message: { content: "unsupported" } }] },
        "OPENAI_GATEWAY_RESPONSE_INCOMPLETE",
      ],
      [
        {
          choices: [
            {
              finish_reason: "stop",
              message: { content: "unsafe fallback", refusal: "Cannot comply" },
            },
          ],
        },
        "OPENAI_GATEWAY_RESPONSE_REFUSED",
      ],
    ]) {
      assert.throws(
        () =>
          openai.parseOpenAiChatCompletion(payload, {
            requestedModel: "gpt-5.6-terra",
            latencyMs: 1,
          }),
        (error) => error.code === code && error.retryable === false,
      );
    }
  });

  await t.test("the visible artifact token ceiling is enforced after reasoning", async () => {
    for (const [usage, effort, code] of [
      [
        { completion_tokens: 9_000 },
        "high",
        "OPENAI_GATEWAY_OUTPUT_TOKEN_EVIDENCE_INVALID",
      ],
      [
        {
          completion_tokens: 9_000,
          completion_tokens_details: { reasoning_tokens: 100 },
        },
        "high",
        "OPENAI_GATEWAY_VISIBLE_OUTPUT_LIMIT_EXCEEDED",
      ],
      [
        { completion_tokens: 41 },
        "low",
        "OPENAI_GATEWAY_OUTPUT_TOKEN_EVIDENCE_INVALID",
      ],
    ]) {
      const adapter = openai.createOpenAiGatewayChatCompletionProvider({
        gatewayKey: "test-only-key",
        baseUrl: "https://gateway.test",
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              id: "token-boundary",
              model: "gpt-5.6-terra",
              choices: [{ finish_reason: "stop", message: { content: "complete" } }],
              usage,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      });
      await assert.rejects(
        adapter.complete({
          model: "gpt-5.6-terra",
          system: "system",
          user: "user",
          maxOutputTokens: effort === "high" ? 8_192 : 40,
          providerMaxOutputTokens: effort === "high" ? 25_000 : 40,
          timeoutMs: 1_000,
          temperature: 0.2,
          effort,
        }),
        (error) => error?.code === code && error.retryable === false,
      );
    }
  });

  await t.test("HTTP retryability is typed and no provider fallback occurs", async () => {
    for (const [status, retryable] of [
      [400, false],
      [429, true],
      [503, true],
    ]) {
      const adapter = openai.createOpenAiGatewayChatCompletionProvider({
        gatewayKey: "test-only-key",
        baseUrl: "https://gateway.test",
        fetchImpl: async () => new Response("no", { status }),
      });
      await assert.rejects(
        adapter.complete({
          model: "gpt-5.6-terra",
          system: "system",
          user: "user",
          maxOutputTokens: 10,
          providerMaxOutputTokens: 10,
          timeoutMs: 1_000,
          temperature: 0,
        }),
        (error) => {
          assert.equal(error.code, `OPENAI_GATEWAY_HTTP_${status}`);
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
  const previousEnabled = process.env.HELIX_AI_GATEWAY_ENABLED;
  const previousKey = process.env.NETLIFY_AI_GATEWAY_KEY;
  const previousBaseUrl = process.env.NETLIFY_AI_GATEWAY_BASE_URL;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousOpenAiBaseUrl = process.env.OPENAI_BASE_URL;
  const previousFetch = globalThis.fetch;
  process.env.HELIX_AI_GATEWAY_ENABLED = "true";
  process.env.NETLIFY_AI_GATEWAY_KEY = ["gateway", "test", "key"].join("-");
  process.env.NETLIFY_AI_GATEWAY_BASE_URL = "https://gateway.test";
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  let providerCalls = 0;
  globalThis.fetch = async (url, init) => {
    providerCalls += 1;
    assert.equal(url, "https://gateway.test/v1/chat/completions");
    const request = JSON.parse(init.body);
    assert.equal(request.model, "gpt-5.6-terra");
    assert.equal(request.store, false);
    if (providerCalls === 4) {
      assert.equal(request.reasoning_effort, "high");
      assert.equal(request.max_completion_tokens, 25_000);
      assert.equal("temperature" in request, false);
    } else {
      assert.equal(request.reasoning_effort, "none");
      assert.equal(request.max_completion_tokens, providerCalls === 3 ? 800 : 2_400);
      assert.equal(request.temperature, 0.2);
    }
    if (providerCalls === 3) return new Response("unavailable", { status: 503 });
    return new Response(
      JSON.stringify({
        id: `gateway-response-${providerCalls}`,
        model: "gpt-5.6-terra",
        choices: [
          {
            finish_reason: "stop",
            message: { content: `gateway-result-${providerCalls}`, refusal: null },
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 3,
          total_tokens: 15,
          prompt_tokens_details: { cached_tokens: providerCalls - 1 },
          completion_tokens_details: { reasoning_tokens: providerCalls === 4 ? 1 : 0 },
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
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    if (previousOpenAiBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previousOpenAiBaseUrl;
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

  delete process.env.HELIX_AI_GATEWAY_ENABLED;
  process.env.NETLIFY_AI_GATEWAY_KEY = "partial-native-placeholder";
  delete process.env.NETLIFY_AI_GATEWAY_BASE_URL;
  process.env.OPENAI_API_KEY = "platform-compatibility-placeholder";
  process.env.OPENAI_BASE_URL = "https://platform-gateway.test/v1";
  await assert.rejects(
    gateway.requestAgentCompletion({
      job,
      contractId: "nova",
      agentId: "Nova",
      logicalCallKey: "nova:disabled",
      system: "Stable system prefix",
      user: "Private prompt body",
      temperature: 0.2,
      effort: "low",
      validateContent: () => true,
    }),
    (error) => error?.code === "HELIX_AI_DISABLED" && error.retryable === false,
  );
  process.env.HELIX_AI_GATEWAY_ENABLED = "true";
  delete process.env.NETLIFY_AI_GATEWAY_KEY;
  delete process.env.NETLIFY_AI_GATEWAY_BASE_URL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  await assert.rejects(
    gateway.requestAgentCompletion({
      job,
      contractId: "nova",
      agentId: "Nova",
      logicalCallKey: "nova:gateway-missing",
      system: "Stable system prefix",
      user: "Private prompt body",
      temperature: 0.2,
      effort: "low",
      validateContent: () => true,
    }),
    (error) =>
      error?.code === "NETLIFY_AI_GATEWAY_CONFIGURATION_MISSING" &&
      error.retryable === false,
  );
  process.env.NETLIFY_AI_GATEWAY_KEY = ["gateway", "test", "key"].join("-");
  process.env.NETLIFY_AI_GATEWAY_BASE_URL = "https://gateway.test";
  await assert.rejects(
    gateway.requestAgentCompletion({
      job,
      contractId: "nova",
      agentId: "Nova",
      logicalCallKey: "nova:invalid-high-effort",
      system: "Stable system prefix",
      user: "Private prompt body",
      temperature: 0.2,
      effort: "high",
      validateContent: () => true,
    }),
    (error) => error?.code === "AI_AGENT_CONTRACT_INVALID",
  );
  assert.equal(providerCalls, 0);
  const noPrematureReservation = await pg.query(
    "select count(*)::integer as count from build_job_ai_calls where job_id = $1",
    [job.id],
  );
  assert.equal(noPrematureReservation.rows[0].count, 0);

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
  assert.equal(job.aiUsage.providerActualCostUsdTicks, "0");
  assert.equal(job.aiUsage.accountedCostUsdTicks, "2500000000");
  assert.equal(job.aiUsage.actualCostComplete, false);

  const second = await gateway.requestAgentCompletion({
    job,
    contractId: "nova",
    agentId: "Nova",
    logicalCallKey: "nova:gateway-second",
    system: "Stable system prefix",
    user: "A second private prompt body",
    temperature: 0.2,
    effort: "low",
    validateContent: () => true,
  });
  assert.equal(second.content, "gateway-result-2");
  assert.equal(providerCalls, 2);
  assert.equal(job.aiUsage.callCount, 2);
  assert.equal(job.aiUsage.providerActualCostUsdTicks, "0");
  assert.equal(job.aiUsage.accountedCostUsdTicks, "5000000000");

  await assert.rejects(
    gateway.requestAgentCompletion({
      job,
      contractId: "iris",
      agentId: "Iris",
      logicalCallKey: "iris:gateway-provider-failure",
      system: "Stable review prefix",
      user: "Private review input",
      temperature: 0.2,
      effort: "low",
      validateContent: () => true,
    }),
    (error) => {
      assert.equal(error.code, "OPENAI_GATEWAY_HTTP_503");
      assert.equal(error.retryable, true);
      return true;
    },
  );
  assert.equal(job.aiUsage.callCount, 3);
  assert.equal(job.aiUsage.failedCallCount, 1);
  assert.equal(job.aiUsage.unknownCostCallCount, 3);
  assert.equal(job.aiUsage.actualCostComplete, false);
  assert.equal(job.aiUsage.accountedCostUsdTicks, "7000000000");

  const highDraft = await create.createBuildJobDraft({
    prompt: "Exercise the high-effort Forge provider ceiling",
    locale: "en",
    mode: "generate",
    currentHtml: null,
  });
  await queue.enqueueBuildJob({
    job: highDraft.job,
    idempotencyKey: `ai-gateway-high:${crypto.randomUUID()}`,
    requestFingerprint: highDraft.requestFingerprint,
  });
  const highWorkerId = crypto.randomUUID();
  const highJob = await queue.claimBuildJob(highDraft.job.id, highWorkerId);
  assert.ok(highJob);
  highJob.runtime = {
    workerId: highWorkerId,
    abortSignal: new AbortController().signal,
  };
  const high = await gateway.requestAgentCompletion({
    job: highJob,
    contractId: "forgeUi",
    agentId: "Forge",
    logicalCallKey: "forge:gateway-high-effort",
    system: "Stable Forge system prefix",
    user: "Private Forge input",
    temperature: 0.2,
    effort: "high",
    validateContent: () => true,
  });
  assert.equal(high.content, "gateway-result-4");
  assert.equal(providerCalls, 4);
  assert.equal(highJob.aiUsage.accountedCostUsdTicks, "15000000000");
  assert.equal(highJob.aiUsage.actualCostComplete, false);

  const calls = await pg.query(
    `select logical_call_key, status, provider, requested_model, input_tokens,
            cached_input_tokens, cost_usd_ticks::text as cost_usd_ticks,
            maximum_cost_usd_ticks::text as maximum_cost_usd_ticks,
            request_sha256, result_sha256
     from build_job_ai_calls
     where job_id = $1
     order by case logical_call_key
       when 'nova:gateway-test' then 1
       when 'nova:gateway-second' then 2
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
      ["succeeded", "openai", "gpt-5.6-terra", 12, "2500000000"],
      ["succeeded", "openai", "gpt-5.6-terra", 12, "2500000000"],
      ["failed", "openai", "gpt-5.6-terra", null, "2000000000"],
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
       $1, $2, $3, 'iris:abandoned', 0, 'Iris', 'iris', 'openai',
       'gpt-5.6-terra', $4, 2000000000, 16, 2, 600000, 90000000000
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
    accounted: "9000000000",
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
