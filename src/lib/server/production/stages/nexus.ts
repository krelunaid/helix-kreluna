import { NexusArtifactSchema } from "@/lib/production-artifact-graph";
import type {
  ProductionGeneratedFile,
  ProductionStageGeneratorInput,
} from "@/lib/server/production/types";
import {
  artifactBase,
  generatedFile,
  javascriptValue,
  makeStageDelivery,
  parseStageInput,
} from "@/lib/server/production/stages/shared";

const RETRY_POLICY = Object.freeze({ maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 2_000 });

export function generateNexusDelivery(input: ProductionStageGeneratorInput) {
  const requirements = parseStageInput("nexus", input);
  const outputFiles: ProductionGeneratedFile[] = [];
  const testFiles: ProductionGeneratedFile[] = [];
  const integrations = requirements.integrations.map((integration) => {
    const root = `server/integrations/${integration.id}`;
    const adapterPath = `${root}/adapter.js`;
    const envSchemaPath = `${root}/environment.js`;
    const errorMapPath = `${root}/errors.js`;
    const connectionTestPath = `tests/nexus/${integration.id}-adapter.test.mjs`;
    const webhookPath = `${root}/webhook.js`;
    const oauthCallbackPath = `${root}/oauth-callback.js`;
    const adapterSource = `import { mapIntegrationError } from "./errors.js";

export const retryPolicy = Object.freeze(${javascriptValue(RETRY_POLICY)});

/** @param {unknown} error */
function defaultShouldRetry(error) {
  return error !== null && typeof error === "object" && Reflect.get(error, "retryable") === true;
}

/** @param {number} delayMs */
function defaultSleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * @param {{ request(input: unknown): Promise<unknown> }} transport
 * @param {{ sleep?(delayMs: number): Promise<void>, shouldRetry?(error: unknown): boolean }} [options]
 */
export function createAdapter(transport, options = {}) {
  if (!transport || typeof transport.request !== "function") throw new TypeError("Integration transport is required");
  const sleep = options.sleep ?? defaultSleep;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;
  if (typeof sleep !== "function" || typeof shouldRetry !== "function") throw new TypeError("Invalid retry ports");
  return Object.freeze({
    /** @param {unknown} request */
    async execute(request) {
      for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt += 1) {
        try {
          return await transport.request(request);
        } catch (error) {
          if (attempt === retryPolicy.maxAttempts || !shouldRetry(error)) {
            throw mapIntegrationError(error);
          }
          const delayMs = Math.min(
            retryPolicy.maxDelayMs,
            retryPolicy.baseDelayMs * (2 ** (attempt - 1)),
          );
          await sleep(delayMs);
        }
      }
      throw new Error("UNREACHABLE_RETRY_STATE");
    },
  });
}
`;
    const environmentSource = `export const requiredEnvironmentNames = Object.freeze(${javascriptValue(
      integration.envNames,
    )});

/** @param {Record<string, string | undefined>} source */
export function readIntegrationEnvironment(source) {
  return Object.freeze(Object.fromEntries(requiredEnvironmentNames.map((name) => {
    const value = source[name]?.trim();
    if (!value) throw new Error("Missing integration environment name: " + name);
    return [name, value];
  })));
}
`;
    const errorsSource = `export class IntegrationUnavailableError extends Error {
  /** @param {unknown} cause */
  constructor(cause) {
    super("Integration ${integration.id} is unavailable", { cause });
    this.name = "IntegrationUnavailableError";
    this.code = "INTEGRATION_UNAVAILABLE";
  }
}

/** @param {unknown} error */
export function mapIntegrationError(error) {
  return error instanceof IntegrationUnavailableError ? error : new IntegrationUnavailableError(error);
}
`;
    outputFiles.push(
      generatedFile(adapterPath, adapterSource),
      generatedFile(envSchemaPath, environmentSource),
      generatedFile(errorMapPath, errorsSource),
    );

    const webhooks = [];
    let webhookTest = "";
    if (integration.kind === "stripe") {
      const route =
        requirements.apiOperations.find(
          (operation) =>
            operation.access.kind === "signed_webhook" &&
            operation.access.integrationId === integration.id,
        )?.path ?? `/api/webhooks/${integration.id}`;
      outputFiles.push(
        generatedFile(
          webhookPath,
          `/**
 * Signature verification must return the authenticated event, including its provider-owned id.
 * The idempotency port owns the atomic reservation/commit boundary around the consumer callback.
 * @param {{ verify(payload: Uint8Array, signature: string): Promise<unknown> }} signatures
 * @param {{ executeOnce(key: string, invoke: () => Promise<unknown>): Promise<{ status: "processed" | "duplicate", value?: unknown }> }} idempotency
 * @param {{ handle(event: unknown): Promise<unknown> }} consumer
 */
export function createWebhookHandler(signatures, idempotency, consumer) {
  if (!signatures || typeof signatures.verify !== "function") throw new TypeError("Webhook signature port is required");
  if (!idempotency || typeof idempotency.executeOnce !== "function") throw new TypeError("Webhook idempotency port is required");
  if (!consumer || typeof consumer.handle !== "function") throw new TypeError("Webhook consumer port is required");
  /** @param {Uint8Array} payload @param {string} signature */
  async function handleWebhook(payload, signature) {
    if (!(payload instanceof Uint8Array) || typeof signature !== "string" || !signature) {
      throw new Error("INVALID_WEBHOOK");
    }
    const event = await signatures.verify(payload, signature);
    if (event === null || typeof event !== "object") throw new Error("INVALID_SIGNATURE");
    const eventId = Reflect.get(event, "id");
    if (typeof eventId !== "string" || !eventId.trim()) throw new Error("INVALID_SIGNATURE");
    const outcome = await idempotency.executeOnce(eventId, () => consumer.handle(event));
    if (!outcome || !["processed", "duplicate"].includes(outcome.status)) {
      throw new Error("INVALID_IDEMPOTENCY_OUTCOME");
    }
    return Object.freeze({
      accepted: true,
      duplicate: outcome.status === "duplicate",
      ...(outcome.status === "processed" ? { value: outcome.value } : {}),
    });
  }
  return handleWebhook;
}
`,
        ),
      );
      webhooks.push({
        route,
        handlerPath: webhookPath,
        signatureVerified: true as const,
        idempotencyKey: "provider_event_id",
        testPath: connectionTestPath,
      });
      webhookTest = `
  const { createWebhookHandler } = await import("../../${webhookPath}");
  /** @type {Set<string>} */
  const seen = new Set();
  let consumed = 0;
  const handler = createWebhookHandler(
    { async verify(_payload, signature) { return signature === "valid" ? { id: "event-1", type: "paid" } : null; } },
    {
      async executeOnce(id, invoke) {
        if (seen.has(id)) return { status: "duplicate" };
        seen.add(id);
        return { status: "processed", value: await invoke() };
      },
    },
    { async handle(event) { consumed += 1; assert.ok(event && typeof event === "object"); return { type: Reflect.get(event, "type") }; } },
  );
  assert.deepEqual(
    await handler(new Uint8Array([1]), "valid"),
    { accepted: true, duplicate: false, value: { type: "paid" } },
  );
  assert.deepEqual(
    await handler(new Uint8Array([1]), "valid"),
    { accepted: true, duplicate: true },
  );
  assert.equal(consumed, 1);
  await assert.rejects(() => handler(new Uint8Array([1]), "invalid"), /INVALID_SIGNATURE/u);
  assert.equal(consumed, 1);`;
    }

    let oauthTest = "";
    if (["google_oauth", "apple_oauth"].includes(integration.kind)) {
      outputFiles.push(
        generatedFile(
          oauthCallbackPath,
          `export const oauthProvider = ${JSON.stringify(integration.kind)};

/**
 * The state port must atomically consume a one-time state record created before redirect.
 * The OAuth port must verify the identity token signature and claims for the declared provider.
 * @param {{ exchangeCode(input: unknown): Promise<unknown>, verifyIdentity(idToken: string, expected: unknown): Promise<unknown> }} oauth
 * @param {{ consume(state: string): Promise<unknown> }} states
 */
export function createOAuthCallbackHandler(oauth, states) {
  if (!oauth || typeof oauth.exchangeCode !== "function" || typeof oauth.verifyIdentity !== "function") {
    throw new TypeError("OAuth exchange and verification ports are required");
  }
  if (!states || typeof states.consume !== "function") throw new TypeError("OAuth state port is required");
  /** @param {unknown} query */
  async function handleOAuthCallback(query) {
    if (query === null || typeof query !== "object") throw new Error("INVALID_OAUTH_CALLBACK");
    const providerError = Reflect.get(query, "error");
    if (typeof providerError === "string" && providerError) throw new Error("OAUTH_PROVIDER_REJECTED");
    const code = Reflect.get(query, "code");
    const state = Reflect.get(query, "state");
    if (typeof code !== "string" || !code || typeof state !== "string" || !state) {
      throw new Error("INVALID_OAUTH_CALLBACK");
    }
    const pending = await states.consume(state);
    if (pending === null || typeof pending !== "object" || Reflect.get(pending, "provider") !== oauthProvider) {
      throw new Error("INVALID_OAUTH_STATE");
    }
    const codeVerifier = Reflect.get(pending, "codeVerifier");
    const nonce = Reflect.get(pending, "nonce");
    const redirectUri = Reflect.get(pending, "redirectUri");
    if (![codeVerifier, nonce, redirectUri].every((value) => typeof value === "string" && value.length > 0)) {
      throw new Error("INVALID_OAUTH_STATE");
    }
    const tokens = await oauth.exchangeCode(Object.freeze({ code, codeVerifier, redirectUri }));
    if (tokens === null || typeof tokens !== "object") throw new Error("INVALID_OAUTH_TOKEN_RESPONSE");
    const idToken = Reflect.get(tokens, "idToken");
    if (typeof idToken !== "string" || !idToken) throw new Error("INVALID_OAUTH_TOKEN_RESPONSE");
    const identity = await oauth.verifyIdentity(
      idToken,
      Object.freeze({ nonce, provider: oauthProvider }),
    );
    if (identity === null || typeof identity !== "object") throw new Error("INVALID_OAUTH_IDENTITY");
    const subject = Reflect.get(identity, "subject");
    if (typeof subject !== "string" || !subject) throw new Error("INVALID_OAUTH_IDENTITY");
    return Object.freeze({ provider: oauthProvider, subject });
  }
  return handleOAuthCallback;
}
`,
        ),
      );
      oauthTest = `
  const { createOAuthCallbackHandler } = await import("../../${oauthCallbackPath}");
  /** @type {string[]} */
  const oauthOrder = [];
  const callback = createOAuthCallbackHandler(
    {
      async exchangeCode(input) { oauthOrder.push("exchange"); assert.ok(input && typeof input === "object"); assert.equal(Reflect.get(input, "codeVerifier"), "verifier"); return { idToken: "signed-token" }; },
      async verifyIdentity(idToken, expected) { oauthOrder.push("verify_identity"); assert.equal(idToken, "signed-token"); assert.ok(expected && typeof expected === "object"); assert.equal(Reflect.get(expected, "nonce"), "nonce"); return { subject: "user-1" }; },
    },
    {
      async consume(state) {
        oauthOrder.push("consume_state");
        return state === "valid-state"
          ? { provider: ${JSON.stringify(integration.kind)}, codeVerifier: "verifier", nonce: "nonce", redirectUri: "https://app.example/callback" }
          : null;
      },
    },
  );
  assert.deepEqual(
    await callback({ code: "code", state: "valid-state" }),
    { provider: ${JSON.stringify(integration.kind)}, subject: "user-1" },
  );
  assert.deepEqual(oauthOrder, ["consume_state", "exchange", "verify_identity"]);
  await assert.rejects(() => callback({ code: "code", state: "unknown" }), /INVALID_OAUTH_STATE/u);`;
    }

    testFiles.push(
      generatedFile(
        connectionTestPath,
        `import assert from "node:assert/strict";
import test from "node:test";
import { createAdapter, retryPolicy } from "../../${adapterPath}";
import { readIntegrationEnvironment } from "../../${envSchemaPath}";

test("Nexus ${integration.id} enforces bounded retries and verified inbound flows", async () => {
  /** @type {number[]} */
  const delays = [];
  let attempts = 0;
  const adapter = createAdapter(
    {
      async request(value) {
        attempts += 1;
        if (attempts < retryPolicy.maxAttempts) throw Object.assign(new Error("transient"), { retryable: true });
        return { received: value };
      },
    },
    { async sleep(delayMs) { delays.push(delayMs); } },
  );
  assert.deepEqual(await adapter.execute({ id: "request-1" }), { received: { id: "request-1" } });
  assert.equal(attempts, retryPolicy.maxAttempts);
  assert.deepEqual(delays, [100, 200]);

  let terminalAttempts = 0;
  const terminal = createAdapter({
    async request() {
      terminalAttempts += 1;
      throw Object.assign(new Error("still unavailable"), { retryable: true });
    },
  }, { async sleep() {} });
  await assert.rejects(() => terminal.execute({}), { code: "INTEGRATION_UNAVAILABLE" });
  assert.equal(terminalAttempts, retryPolicy.maxAttempts);
  ${integration.envNames.length > 0 ? `assert.throws(() => readIntegrationEnvironment({}), /${integration.envNames[0]}/u);` : "assert.deepEqual(readIntegrationEnvironment({}), {});"}${webhookTest}${oauthTest}
});
`,
      ),
    );
    return {
      id: integration.id,
      kind: integration.kind,
      execution: integration.execution,
      adapterPath,
      envSchemaPath,
      requiredEnv: integration.envNames,
      connectionTestPath,
      retry: RETRY_POLICY,
      errorMapPath,
      webhooks,
    };
  });
  const artifact = NexusArtifactSchema.parse({
    ...artifactBase(
      "nexus_integrations_artifact",
      "docs/artifacts/nexus.json",
      outputFiles.map((file) => file.path),
      testFiles.map((file) => file.path),
      "Integration source executes bounded retries, one-time OAuth state and identity verification, and raw-body webhook signature/idempotency ports; no provider connection is asserted.",
    ),
    integrations,
  });
  return makeStageDelivery("nexus", input, artifact, outputFiles, testFiles);
}
