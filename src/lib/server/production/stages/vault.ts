import { VaultArtifactSchema } from "@/lib/production-artifact-graph";
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

function routeErrorCodes(operation: {
  rateLimitRequired: boolean;
  idempotencyRequired: boolean;
}): string[] {
  return [
    "INVALID_REQUEST",
    "INVALID_RESPONSE",
    "ACCESS_DENIED",
    ...(operation.rateLimitRequired ? ["RATE_LIMITED"] : []),
    ...(operation.idempotencyRequired ? ["IDEMPOTENCY_KEY_REQUIRED", "IDEMPOTENCY_CONFLICT"] : []),
  ].sort();
}

export function generateVaultDelivery(input: ProductionStageGeneratorInput) {
  const requirements = parseStageInput("vault", input);
  const outputFiles: ProductionGeneratedFile[] = [];
  const testFiles: ProductionGeneratedFile[] = [];
  const routes = requirements.apiOperations.map((operation) => {
    const sourcePath = `server/api/${operation.operationId}.js`;
    const responseSchemaPath = `server/schemas/${operation.operationId}-response.js`;
    const requestSchemaPath =
      operation.method === "GET" ? undefined : `server/schemas/${operation.operationId}-request.js`;
    const testPath = `tests/vault/${operation.operationId}-route.test.mjs`;
    const requestImport = requestSchemaPath
      ? `import { validateRequest } from "../schemas/${operation.operationId}-request.js";\n`
      : "";
    const requestValidation = requestSchemaPath
      ? "const request = validateRequest(input);"
      : "const request = input;";
    const expectedOrder = [
      "authorization",
      ...(operation.rateLimitRequired ? ["rate_limit"] : []),
      ...(operation.idempotencyRequired ? ["idempotency"] : []),
      "use_case",
    ];
    const source = `${requestImport}import { validateResponse } from "../schemas/${
      operation.operationId
    }-response.js";

export const routeContract = Object.freeze(${javascriptValue({
      operationId: operation.operationId,
      method: operation.method,
      path: operation.path,
      access: operation.access,
      rateLimitRequired: operation.rateLimitRequired,
      idempotencyRequired: operation.idempotencyRequired,
    })});

/**
 * @typedef {{ authorize(input: unknown): Promise<boolean> }} AuthorizationPort
 * @typedef {{ consume(input: unknown): Promise<boolean> }} RateLimitPort
 * @typedef {{ status: "executed" | "replayed" | "conflict", value?: unknown }} IdempotencyOutcome
 * @typedef {{ execute(input: unknown, invoke: () => Promise<unknown>): Promise<IdempotencyOutcome> }} IdempotencyPort
 * @typedef {{ authorization: AuthorizationPort, rateLimit?: RateLimitPort, idempotency?: IdempotencyPort }} RoutePorts
 */

/** @param {unknown} context */
function readIdempotencyKey(context) {
  if (context === null || typeof context !== "object") throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  const value = Reflect.get(context, "idempotencyKey");
  if (typeof value !== "string" || !value.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  return value.trim();
}

/**
 * @param {(input: unknown, context: unknown) => Promise<unknown>} useCase
 * @param {RoutePorts} ports
 */
export function createRouteHandler(useCase, ports) {
  if (typeof useCase !== "function") throw new TypeError("Route use case is required");
  if (!ports?.authorization || typeof ports.authorization.authorize !== "function") {
    throw new TypeError("Authorization port is required");
  }
  if (routeContract.rateLimitRequired && typeof ports.rateLimit?.consume !== "function") {
    throw new TypeError("Rate-limit port is required");
  }
  if (routeContract.idempotencyRequired && typeof ports.idempotency?.execute !== "function") {
    throw new TypeError("Idempotency port is required");
  }

  /** @param {unknown} input @param {unknown} context */
  async function handle(input, context) {
    ${requestValidation}
    const authorization = await ports.authorization.authorize(Object.freeze({
      access: routeContract.access,
      operationId: routeContract.operationId,
      request,
      context,
    }));
    if (authorization !== true) throw new Error("ACCESS_DENIED");

    if (routeContract.rateLimitRequired) {
      const allowed = await ports.rateLimit?.consume(Object.freeze({
        operationId: routeContract.operationId,
        request,
        context,
      }));
      if (allowed !== true) throw new Error("RATE_LIMITED");
    }

    const invoke = async () => validateResponse(await useCase(request, context));
    if (!routeContract.idempotencyRequired) return invoke();

    const key = readIdempotencyKey(context);
    let invoked = false;
    const invokeOnce = async () => {
      if (invoked) throw new Error("IDEMPOTENCY_CALLBACK_REUSED");
      invoked = true;
      return invoke();
    };
    const outcome = await ports.idempotency?.execute(
      Object.freeze({ key, operationId: routeContract.operationId, request, context }),
      invokeOnce,
    );
    if (!outcome || outcome.status === "conflict") throw new Error("IDEMPOTENCY_CONFLICT");
    if (!["executed", "replayed"].includes(outcome.status)) throw new Error("INVALID_IDEMPOTENCY_OUTCOME");
    return validateResponse(outcome.value);
  }
  return handle;
}
`;
    outputFiles.push(generatedFile(sourcePath, source));
    if (requestSchemaPath) {
      outputFiles.push(
        generatedFile(
          requestSchemaPath,
          `/** @param {unknown} value */
export function validateRequest(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("INVALID_REQUEST");
  return Object.freeze({ ...value });
}
`,
        ),
      );
    }
    outputFiles.push(
      generatedFile(
        responseSchemaPath,
        `/** @param {unknown} value */
export function validateResponse(value) {
  if (value === undefined) throw new TypeError("INVALID_RESPONSE");
  return value;
}
`,
      ),
    );
    testFiles.push(
      generatedFile(
        testPath,
        `import assert from "node:assert/strict";
import test from "node:test";
import { createRouteHandler, routeContract } from "../../${sourcePath}";

test("Vault ${operation.operationId} enforces every declared gate before its use case", async () => {
  assert.deepEqual(routeContract, ${javascriptValue({
    operationId: operation.operationId,
    method: operation.method,
    path: operation.path,
    access: operation.access,
    rateLimitRequired: operation.rateLimitRequired,
    idempotencyRequired: operation.idempotencyRequired,
  })});
  /** @type {string[]} */
  const order = [];
  /** @type {Parameters<typeof createRouteHandler>[1]} */
  const ports = {
    authorization: { async authorize() { order.push("authorization"); return true; } },
    rateLimit: { async consume() { order.push("rate_limit"); return true; } },
    idempotency: {
      async execute(_input, invoke) {
        order.push("idempotency");
        return { status: "executed", value: await invoke() };
      },
    },
  };
  const handler = createRouteHandler(async (request) => {
    order.push("use_case");
    return { accepted: true, request };
  }, ports);
  assert.deepEqual(
    await handler(${operation.method === "GET" ? "null" : "{ value: 1 }"}, { idempotencyKey: "request-1" }),
    { accepted: true, request: ${operation.method === "GET" ? "null" : "{ value: 1 }"} },
  );
  assert.deepEqual(order, ${javascriptValue(expectedOrder)});

  let deniedUseCases = 0;
  const denied = createRouteHandler(async () => { deniedUseCases += 1; return {}; }, {
    ...ports,
    authorization: { async authorize() { return false; } },
  });
  await assert.rejects(
    () => denied(${operation.method === "GET" ? "null" : "{}"}, { idempotencyKey: "denied" }),
    /ACCESS_DENIED/u,
  );
  assert.equal(deniedUseCases, 0);${
    operation.idempotencyRequired
      ? `

  let replayUseCases = 0;
  const replay = createRouteHandler(async () => { replayUseCases += 1; return {}; }, {
    ...ports,
    idempotency: { async execute() { return { status: "replayed", value: { replayed: true } }; } },
  });
  assert.deepEqual(
    await replay(${operation.method === "GET" ? "null" : "{}"}, { idempotencyKey: "existing" }),
    { replayed: true },
  );
  assert.equal(replayUseCases, 0);
  const conflict = createRouteHandler(async () => ({}), {
    ...ports,
    idempotency: { async execute() { return { status: "conflict" }; } },
  });
  await assert.rejects(
    () => conflict(${operation.method === "GET" ? "null" : "{}"}, { idempotencyKey: "conflict" }),
    /IDEMPOTENCY_CONFLICT/u,
  );`
      : ""
  }
});
`,
      ),
    );
    return {
      operationId: operation.operationId,
      method: operation.method,
      path: operation.path,
      sourcePath,
      ...(requestSchemaPath ? { requestSchemaPath } : {}),
      responseSchemaPath,
      access: operation.access,
      businessRules: [
        `Require an authorization-port approval for the ${operation.access.kind} access boundary before invoking ${operation.operationId}.`,
        ...(operation.rateLimitRequired
          ? [
              "Require the declared rate-limit port to allow the request before invoking the use case.",
            ]
          : []),
        ...(operation.idempotencyRequired
          ? [
              "Require a non-empty idempotency key and execute the use case only through the idempotency port.",
            ]
          : []),
      ],
      errorCodes: routeErrorCodes(operation),
      rateLimitPolicyId: operation.rateLimitRequired ? `${operation.operationId}_rate_limit` : null,
      idempotencyKey: operation.idempotencyRequired ? "Idempotency-Key" : null,
      testPaths: [testPath],
    };
  });
  const artifact = VaultArtifactSchema.parse({
    ...artifactBase(
      "vault_api_artifact",
      "docs/artifacts/vault.json",
      outputFiles.map((file) => file.path),
      testFiles.map((file) => file.path),
      "API route source executes authorization, rate-limit, and idempotency ports in fail-closed order; endpoint activation is not asserted.",
    ),
    routes,
  });
  return makeStageDelivery("vault", input, artifact, outputFiles, testFiles);
}
