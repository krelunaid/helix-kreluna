import {
  ForgeIntegrationArtifactSchema,
  type ForgeIntegrationArtifact,
} from "@/lib/production-artifact-graph";
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

const REQUIRED_STATES = ["idle", "loading", "success", "empty", "error"] as const;

export function generateForgeIntegrationDelivery(input: ProductionStageGeneratorInput) {
  const requirements = parseStageInput("forgeIntegration", input);
  const outputFiles: ProductionGeneratedFile[] = [];
  const testFiles: ProductionGeneratedFile[] = [];
  const browserOperations = requirements.apiOperations.filter(
    (operation) => operation.access.kind !== "signed_webhook",
  );
  const bindings: ForgeIntegrationArtifact["bindings"] = browserOperations.map((operation) => {
    const clientPath = `apps/web/src/integrations/${operation.operationId}.js`;
    const testPath = `tests/forgeIntegration/${operation.operationId}-binding.test.mjs`;
    const contract = {
      operationId: operation.operationId,
      method: operation.method,
      path: operation.path,
      idempotencyRequired: operation.idempotencyRequired,
    };
    const pathParameterNames = [...operation.path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/gu)].map(
      (match) => match[1],
    );
    const testPathParams = Object.fromEntries(
      pathParameterNames.map((name) => [name, "record-1"]),
    );
    const testOperationPath = operation.path.replace(
      /:([A-Za-z][A-Za-z0-9_]*)/gu,
      "record-1",
    );
    const mutation = operation.method !== "GET";
    outputFiles.push(
      generatedFile(
        clientPath,
        `export const operation = Object.freeze(${javascriptValue(contract)});

function defaultCreateIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("IDEMPOTENCY_KEY_GENERATOR_UNAVAILABLE");
  }
  return globalThis.crypto.randomUUID();
}

/** @param {Record<string, string> | undefined} pathParams */
function operationPath(pathParams) {
  return operation.path.replace(/:([A-Za-z][A-Za-z0-9_]*)/gu, (segment, name) => {
    const value = pathParams?.[name];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error("MISSING_PATH_PARAMETER_" + name.toUpperCase());
    }
    return encodeURIComponent(value.trim());
  });
}

/**
 * @typedef {{ ok: boolean, status: number, json(): Promise<unknown> }} OperationResponse
 * @param {(url: string, init: RequestInit) => Promise<OperationResponse>} fetcher
 * @param {{ createIdempotencyKey?(): string }} [ports]
 */
export function createOperationClient(fetcher, ports = {}) {
  if (typeof fetcher !== "function") throw new TypeError("A fetch transport is required");
  const createIdempotencyKey = ports.createIdempotencyKey ?? defaultCreateIdempotencyKey;
  if (operation.idempotencyRequired && typeof createIdempotencyKey !== "function") {
    throw new TypeError("An idempotency-key port is required");
  }
  return Object.freeze({
    /** @param {unknown} input @param {{ requestId?: string, pathParams?: Record<string, string> }} [options] */
    async execute(input, options = {}) {
      ${
        mutation
          ? `/** @type {Record<string, string>} */
      const headers = { "content-type": "application/json" };
      if (operation.idempotencyRequired) {
        const key = options.requestId ?? createIdempotencyKey();
        if (typeof key !== "string" || !key.trim()) throw new Error("INVALID_IDEMPOTENCY_KEY");
        headers["Idempotency-Key"] = key.trim();
      }`
          : "const headers = undefined;"
      }
      const response = await fetcher(operationPath(options.pathParams), {
        method: operation.method,
        credentials: "same-origin",
        headers,
        body: ${mutation ? "JSON.stringify(input)" : "undefined"},
      });
      if (!response.ok) throw new Error("REQUEST_FAILED_" + response.status);
      return response.status === 204 ? null : response.json();
    },
  });
}
`,
      ),
    );
    testFiles.push(
      generatedFile(
        testPath,
        `import assert from "node:assert/strict";
import test from "node:test";
import { createOperationClient, operation } from "../../${clientPath}";

test("Forge Integration binds ${operation.operationId} without a provider call", async () => {
  /** @type {{ url: string, init: RequestInit }[]} */
  const calls = [];
  let keySequence = 0;
  const client = createOperationClient(async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, async json() { return { accepted: true }; } };
  }, { createIdempotencyKey() { keySequence += 1; return "mutation-" + keySequence; } });
  assert.deepEqual(await client.execute({ value: 1 }, ${JSON.stringify(
    pathParameterNames.length > 0 ? { pathParams: testPathParams } : {},
  )}), { accepted: true });
  assert.equal(calls[0].url, ${JSON.stringify(testOperationPath)});
  assert.equal(calls[0].init.method, operation.method);${
    mutation
      ? `
  assert.equal(new Headers(calls[0].init.headers).get("Idempotency-Key"), "mutation-1");
  await client.execute({ value: 2 }, ${JSON.stringify(
    pathParameterNames.length > 0 ? { pathParams: testPathParams } : {},
  )});
  assert.equal(new Headers(calls[1].init.headers).get("Idempotency-Key"), "mutation-2");

  let lostResponseAttempts = 0;
  const retrying = createOperationClient(async (url, init) => {
    calls.push({ url, init });
    lostResponseAttempts += 1;
    if (lostResponseAttempts === 1) throw new Error("RESPONSE_LOST_AFTER_SERVER_COMMIT");
    return { ok: true, status: 200, async json() { return { replayed: true }; } };
  });
  await assert.rejects(
    () => retrying.execute({ value: 3 }, ${JSON.stringify({
      requestId: "logical-mutation-1",
      ...(pathParameterNames.length > 0 ? { pathParams: testPathParams } : {}),
    })}),
    /RESPONSE_LOST_AFTER_SERVER_COMMIT/u,
  );
  assert.deepEqual(
    await retrying.execute({ value: 3 }, ${JSON.stringify({
      requestId: "logical-mutation-1",
      ...(pathParameterNames.length > 0 ? { pathParams: testPathParams } : {}),
    })}),
    { replayed: true },
  );
  const firstRetryCall = calls.at(-2);
  const secondRetryCall = calls.at(-1);
  if (!firstRetryCall || !secondRetryCall) throw new Error("Expected two logical mutation attempts");
  assert.equal(new Headers(firstRetryCall.init.headers).get("Idempotency-Key"), "logical-mutation-1");
  assert.equal(new Headers(secondRetryCall.init.headers).get("Idempotency-Key"), "logical-mutation-1");`
      : `
  assert.equal(calls[0].init.headers, undefined);
  assert.equal(keySequence, 0);`
  }
});
`,
      ),
    );
    return {
      id: operation.operationId,
      componentPath: "apps/web/src/main.js",
      clientPath,
      target: { kind: "api" as const, operationId: operation.operationId },
      transport: "http" as const,
      auth: ["authenticated", "roles"].includes(operation.access.kind)
        ? ("session" as const)
        : ("public" as const),
      states: [...REQUIRED_STATES],
      testPath,
    };
  });
  if (bindings.length === 0) {
    const clientPath = "apps/web/src/integrations/local-state.js";
    const testPath = "tests/forgeIntegration/local-state-binding.test.mjs";
    outputFiles.push(
      generatedFile(
        clientPath,
        `export function createLocalState(initialValue = null) {
  let state = Object.freeze({ status: "idle", value: initialValue, error: null });
  const listeners = new Set();
  const publish = (next) => { state = Object.freeze(next); for (const listener of listeners) listener(state); };
  return Object.freeze({
    getSnapshot: () => state,
    set(value) { publish({ status: value == null ? "empty" : "success", value, error: null }); },
    fail(error) { publish({ status: "error", value: null, error }); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  });
}
`,
      ),
    );
    testFiles.push(
      generatedFile(
        testPath,
        `import assert from "node:assert/strict";
import test from "node:test";
import { createLocalState } from "../../${clientPath}";

test("Forge Integration exposes deterministic local client state", () => {
  const state = createLocalState();
  assert.equal(state.getSnapshot().status, "idle");
  state.set({ value: 1 });
  assert.equal(state.getSnapshot().status, "success");
  state.set(null);
  assert.equal(state.getSnapshot().status, "empty");
});
`,
      ),
    );
    bindings.push({
      id: "local_state",
      componentPath: "apps/web/src/main.js",
      clientPath,
      target: { kind: "local", capability: "Approved client-local application state" },
      transport: "local",
      auth: "public",
      states: [...REQUIRED_STATES],
      testPath,
    });
  }
  const artifact = ForgeIntegrationArtifactSchema.parse({
    ...artifactBase(
      "forge_integration_artifact",
      "docs/artifacts/forge-integration.json",
      outputFiles.map((file) => file.path),
      testFiles.map((file) => file.path),
      "Browser bindings exclude signed webhook endpoints and accept a stable logical request id for safe mutation retries; no endpoint availability is asserted.",
    ),
    bindings,
  });
  return makeStageDelivery("forgeIntegration", input, artifact, outputFiles, testFiles);
}
