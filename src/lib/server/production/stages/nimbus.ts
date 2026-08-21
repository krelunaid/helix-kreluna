import {
  NimbusArtifactSchema,
  deriveProductionCapabilityRequirements,
  type ProductionRequirements,
} from "@/lib/production-artifact-graph";
import type { ProductionStageGeneratorInput } from "@/lib/server/production/types";
import {
  deriveProductionDomainResources,
  resourceIdFromApiPath,
} from "@/lib/server/production/domain";
import {
  nimbusDecisionFailureCode,
  resolveVerifiedNimbusStageDecision,
  type VerifiedNimbusStageDecision,
} from "@/lib/server/production/nimbus-decision";
import {
  artifactBase,
  generatedFile,
  javascriptValue,
  makeStageDelivery,
  parseStageInput,
  uniqueSorted,
} from "@/lib/server/production/stages/shared";

function netlifyAdapterSource(
  requirements: ProductionRequirements,
  bindingContracts: readonly string[],
  runtimeComposable: boolean,
): string {
  const operations = requirements.apiOperations.map((operation) => ({
    operationId: operation.operationId,
    method: operation.method,
    path: operation.path,
  }));
  const routeImports = operations
    .map(
      (operation, index) =>
        `import { createRouteHandler as createRouteHandler${index} } from "../../../server/api/${operation.operationId}.js";`,
    )
    .join("\n");
  const routeFactoryCases = operations
    .map(
      (operation, index) =>
        `  if (operationId === ${JSON.stringify(operation.operationId)}) return createRouteHandler${index};`,
    )
    .join("\n");
  const compositionImport = runtimeComposable
    ? 'import { composeProductionRuntimeBindings, runtimeSourceConfiguration } from "../../../server/runtime/composition.js";\n'
    : "";
  return `import { ApplicationError, publicError } from "../../../server/errors.js";
${compositionImport}${routeImports}

/**
 * @typedef {{ operationId: string, method: string, path: string }} ApiOperation
 * @typedef {{
 *   database?: Record<string, unknown>,
 *   objectStorage?: Record<string, unknown>,
 *   authorization?: { authorize(input: unknown): Promise<boolean> },
 *   idempotency?: { execute(input: unknown, invoke: () => Promise<unknown>): Promise<{ status: "executed" | "replayed" | "conflict", value?: unknown }> },
 *   monitoring?: { observeRequest(input: { operationId: string, method: string, path: string }, invoke: () => Promise<Response>): Promise<Response> },
 *   rateLimit?: { consume(input: unknown): Promise<boolean> },
 *   operationHandlers?: Record<string, (input: unknown, context: unknown) => Promise<unknown>>,
 * }} RuntimeBindings
 */

export const requiredBindingContracts = Object.freeze(${javascriptValue(bindingContracts)});
export const apiOperations = Object.freeze(${javascriptValue(operations)}.map((operation) => Object.freeze(operation)));
export const runtimeActivation = Object.freeze({
  status: "not_verified",
  sourceCapability: ${JSON.stringify(runtimeComposable ? "configured" : "not_configured")},
  evidence: "not_run",
  automaticDeployment: false,
});

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @param {readonly string[]} methods */
function hasMethods(value, methods) {
  return isRecord(value) && methods.every((method) => typeof value[method] === "function");
}

/** @param {RuntimeBindings | undefined} bindings */
function hasOperationHandlers(bindings) {
  return (
    isRecord(bindings?.operationHandlers) &&
    apiOperations.every(
      (operation) => typeof bindings.operationHandlers?.[operation.operationId] === "function",
    )
  );
}

/** @param {string} contract @param {RuntimeBindings | undefined} bindings */
function bindingIsConcrete(contract, bindings) {
  if (contract === "authorization") return hasMethods(bindings?.authorization, ["authorize"]);
  if (contract === "database") return hasMethods(bindings?.database, ["get", "put"]);
  if (contract === "idempotency") return hasMethods(bindings?.idempotency, ["execute"]);
  if (contract === "monitoring") return hasMethods(bindings?.monitoring, ["observeRequest"]);
  if (contract === "object_storage") return hasMethods(bindings?.objectStorage, ["get", "put"]);
  if (contract === "operation_handlers") return hasOperationHandlers(bindings);
  if (contract === "rate_limit") return hasMethods(bindings?.rateLimit, ["consume"]);
  return false;
}

/** @param {RuntimeBindings | undefined} bindings */
export function missingRuntimeBindings(bindings) {
  return requiredBindingContracts.filter((contract) => !bindingIsConcrete(contract, bindings));
}

/** @param {number} status @param {Record<string, unknown>} payload */
function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

/** @param {readonly string[]} missing */
function configurationMissing(missing) {
  return json(503, {
    code: "PRODUCTION_RUNTIME_CONFIGURATION_MISSING",
    message: "Concrete runtime bindings are required before this API can serve requests.",
    missingBindings: missing,
  });
}

/** @param {string} template @param {string} pathname */
function pathMatches(template, pathname) {
  const expected = template.split("/").filter(Boolean);
  const actual = pathname.split("/").filter(Boolean);
  return (
    expected.length === actual.length &&
    expected.every((segment, index) => segment.startsWith(":") ? actual[index].length > 0 : segment === actual[index])
  );
}

/** @param {string} pathname */
function normalizedApiPath(pathname) {
  const functionPrefix = "/.netlify/functions/api";
  if (!pathname.startsWith(functionPrefix)) return pathname;
  return "/api" + pathname.slice(functionPrefix.length);
}

/** @param {string} operationId */
function routeFactory(operationId) {
${routeFactoryCases}
  return null;
}

/** @param {Request} request @param {ApiOperation} operation */
async function readRequestInput(request, operation) {
  if (operation.method === "GET") return null;
  try {
    return await request.json();
  } catch {
    throw new ApplicationError("INVALID_REQUEST", "The request body must be valid JSON.", 400);
  }
}

/** @param {unknown} error */
function routeErrorResponse(error) {
  const code = error instanceof Error ? error.message : "";
  const statusByCode = {
    ACCESS_DENIED: 403,
    AUTHENTICATION_REQUIRED: 401,
    AUTHORIZATION_REQUIRED: 403,
    IDEMPOTENCY_CONFLICT: 409,
    IDEMPOTENCY_KEY_REQUIRED: 400,
    IDEMPOTENCY_SUBJECT_REQUIRED: 400,
    INVALID_REQUEST: 400,
    RATE_LIMITED: 429,
  };
  if (Object.hasOwn(statusByCode, code)) {
    const status = statusByCode[/** @type {keyof typeof statusByCode} */ (code)];
    return json(status, { code, message: code.replaceAll("_", " ").toLowerCase() });
  }
  const exposed = publicError(error);
  return json(exposed.status, { code: exposed.code, message: exposed.message });
}

/** @param {RuntimeBindings | undefined} bindings */
export function createNetlifyApiHandler(bindings) {
  const missing = missingRuntimeBindings(bindings);
  /** @param {Request} request */
  async function netlifyApiHandler(request) {
    if (missing.length > 0 || !bindings) return configurationMissing(missing);
    const pathname = normalizedApiPath(new URL(request.url).pathname);
    const operation = apiOperations.find(
      (candidate) => candidate.method === request.method && pathMatches(candidate.path, pathname),
    );
    if (!operation) {
      return json(404, { code: "API_OPERATION_NOT_FOUND", message: "No approved API operation matches this request." });
    }
    const useCase = bindings.operationHandlers?.[operation.operationId];
    const createRouteHandler = routeFactory(operation.operationId);
    const authorization = bindings.authorization;
    const monitoring = bindings.monitoring;
    if (!authorization) return configurationMissing(["authorization"]);
    if (!monitoring) return configurationMissing(["monitoring"]);
    if (typeof useCase !== "function" || typeof createRouteHandler !== "function") {
      return configurationMissing(["operation_handlers"]);
    }
    return monitoring.observeRequest(
      Object.freeze({ operationId: operation.operationId, method: request.method, path: pathname }),
      async () => {
        try {
          const requestForAuthorization = request.clone();
          const input = await readRequestInput(request, operation);
          const routeHandler = createRouteHandler(useCase, {
            authorization,
            rateLimit: bindings.rateLimit,
            idempotency: bindings.idempotency,
          });
          const value = await routeHandler(input, Object.freeze({
            bindings,
            idempotencyKey: request.headers.get("idempotency-key")?.trim(),
            request: requestForAuthorization,
          }));
          return value instanceof Response ? value : json(200, { result: value });
        } catch (error) {
          return routeErrorResponse(error);
        }
      },
    );
  }
  return netlifyApiHandler;
}

${
  runtimeComposable
    ? `/** @type {Promise<ReturnType<typeof createNetlifyApiHandler>> | undefined} */
let configuredHandler;

async function environmentConfiguredHandler() {
  configuredHandler ??= composeProductionRuntimeBindings(process.env).then((bindings) =>
    createNetlifyApiHandler(bindings),
  );
  return configuredHandler;
}

/**
 * Compose only declared, concrete runtime adapters. Missing environment or
 * dependencies remain fail-closed; this source does not claim deployment or
 * provider activation evidence.
 * @param {Request} request
 */
export default async function configuredNetlifyApiHandler(request) {
  try {
    return await (await environmentConfiguredHandler())(request);
  } catch (error) {
    configuredHandler = undefined;
    const candidateNames = error !== null && typeof error === "object"
      ? Reflect.get(error, "missingNames")
      : null;
    const missingNames = Array.isArray(candidateNames)
      ? (/** @type {unknown[]} */ (candidateNames)).filter((name) => typeof name === "string")
      : [];
    if (missingNames.length > 0) return configurationMissing(missingNames);
    return json(503, {
      code: "PRODUCTION_RUNTIME_COMPOSITION_FAILED",
      message: "The declared runtime adapters could not be composed.",
      sourceCapability: runtimeSourceConfiguration.status,
    });
  }
}`
    : `/**
 * This candidate has unresolved capability contracts, so it cannot compose a
 * service runtime. It remains fail-closed without provider interaction.
 * @param {Request} _request
 */
export default async function unconfiguredNetlifyApiHandler(_request) {
  return configurationMissing(requiredBindingContracts);
}`
}
`;
}

function runtimeEnvironmentSource(requiredNames: readonly string[]): string {
  return `export const requiredRuntimeEnvironmentNames = Object.freeze(${javascriptValue(
    requiredNames,
  )});

export class RuntimeConfigurationError extends Error {
  /** @param {readonly string[]} missingNames */
  constructor(missingNames) {
    super("Missing required Production runtime environment: " + missingNames.join(", "));
    this.name = "RuntimeConfigurationError";
    this.code = "PRODUCTION_RUNTIME_CONFIGURATION_MISSING";
    this.missingNames = Object.freeze([...missingNames]);
  }
}

/** @param {Record<string, string | undefined>} source */
export function readProductionRuntimeEnvironment(source) {
  /** @type {Record<string, string>} */
  const values = {};
  const missing = [];
  for (const name of requiredRuntimeEnvironmentNames) {
    const value = source[name]?.trim();
    if (!value) missing.push(name);
    else values[name] = value;
  }
  if (missing.length > 0) throw new RuntimeConfigurationError(missing);
  if (values.SESSION_SIGNING_SECRET && new TextEncoder().encode(values.SESSION_SIGNING_SECRET).byteLength < 32) {
    throw new RuntimeConfigurationError(["SESSION_SIGNING_SECRET"]);
  }
  if (values.DATABASE_URL) {
    let databaseUrl;
    try {
      databaseUrl = new URL(values.DATABASE_URL);
    } catch {
      throw new RuntimeConfigurationError(["DATABASE_URL"]);
    }
    if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
      throw new RuntimeConfigurationError(["DATABASE_URL"]);
    }
  }
  return Object.freeze(values);
}
`;
}

function authorizationRuntimeSource(authenticationRequired: boolean): string {
  const imports = authenticationRequired
    ? `import { requireAuthorization } from "../auth/authorization.js";
import { createSignedSessionCodec } from "../auth/session.js";
`
    : "";
  return `${imports}/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} context */
function requestFromContext(context) {
  if (!isRecord(context)) return null;
  const request = context.request;
  return request instanceof Request ? request : null;
}

/** @param {string | null} header */
function sessionCookie(header) {
  if (!header) return null;
  for (const segment of header.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0) continue;
    const name = segment.slice(0, separator).trim();
    if (name !== "helix_session") continue;
    const value = segment.slice(separator + 1).trim();
    return value || null;
  }
  return null;
}

/** @param {Readonly<Record<string, string>>} environment */
export async function createAuthorizationRuntime(environment) {
  const identities = new WeakMap();
${
    authenticationRequired
      ? `  const secret = environment.SESSION_SIGNING_SECRET;
  if (!secret) throw Object.assign(new Error("SESSION_SIGNING_SECRET is required"), { missingNames: ["SESSION_SIGNING_SECRET"] });
  const sessions = await createSignedSessionCodec(secret);`
      : ""
  }
  return Object.freeze({
    authorization: Object.freeze({
      /** @param {unknown} input */
      async authorize(input) {
        if (!isRecord(input) || !isRecord(input.access)) throw new Error("ACCESS_DENIED");
        const access = input.access;
        if (access.kind === "public") return true;
        if (access.kind === "signed_webhook") throw new Error("INTEGRATION_SIGNATURE_REQUIRED");
        ${
          authenticationRequired
            ? `const context = input.context;
        const request = requestFromContext(context);
        if (!request) throw new Error("AUTHENTICATION_REQUIRED");
        const session = await sessions.decode(sessionCookie(request.headers.get("cookie")));
        const roles = access.kind === "roles" && Array.isArray(access.roles) ? access.roles : [];
        const authorized = requireAuthorization(session, roles);
        identities.set(request, authorized);
        return true;`
            : 'throw new Error("AUTHENTICATION_REQUIRED");'
        }
      },
    }),
    /** @param {unknown} context */
    identityForContext(context) {
      const request = requestFromContext(context);
      return request ? identities.get(request) ?? null : null;
    },
  });
}
`;
}

function postgresRuntimeSource(requirements: ProductionRequirements): string {
  const resources = deriveProductionDomainResources(requirements);
  const owned = deriveProductionCapabilityRequirements(requirements).auth;
  const idempotencyRequired = requirements.apiOperations.some(
    (operation) => operation.idempotencyRequired,
  );
  const rateLimitRequired = requirements.apiOperations.some(
    (operation) => operation.rateLimitRequired,
  );
  const storageEntries = resources
    .map((resource) => {
      const getQuery = owned
        ? `"SELECT payload FROM ${resource.tableName} WHERE id = $1 AND owner_id = $2"`
        : `"SELECT payload FROM ${resource.tableName} WHERE id = $1"`;
      const getValues = owned ? "[id, requiredOwner(ownerId)]" : "[id]";
      const putQuery = owned
        ? `"WITH ensured_user AS (INSERT INTO app_users(id) VALUES ($3) ON CONFLICT (id) DO UPDATE SET updated_at = app_users.updated_at RETURNING id) INSERT INTO ${resource.tableName}(id, payload, owner_id) SELECT $1, $2::jsonb, id FROM ensured_user ON CONFLICT (owner_id, id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now() RETURNING id"`
        : `"INSERT INTO ${resource.tableName}(id, payload) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now() RETURNING id"`;
      const putValues = owned
        ? "[id, JSON.stringify(value), requiredOwner(ownerId)]"
        : "[id, JSON.stringify(value)]";
      const listQuery = owned
        ? `"SELECT id, payload FROM ${resource.tableName} WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 100"`
        : `"SELECT id, payload FROM ${resource.tableName} ORDER BY updated_at DESC LIMIT 100"`;
      const listValues = owned ? "[requiredOwner(ownerId)]" : "[]";
      const removeQuery = owned
        ? `"DELETE FROM ${resource.tableName} WHERE id = $1 AND owner_id = $2"`
        : `"DELETE FROM ${resource.tableName} WHERE id = $1"`;
      const removeValues = owned ? "[id, requiredOwner(ownerId)]" : "[id]";
      return `${JSON.stringify(resource.id)}: Object.freeze({
      /** @param {string} id @param {string} [ownerId] */
      async get(id, ownerId) {
        const result = await activeQueryable().query(${getQuery}, ${getValues});
        return result.rows[0]?.payload ?? null;
      },
      /** @param {string} id @param {unknown} value @param {string} [ownerId] */
      async put(id, value, ownerId) {
        const result = await activeQueryable().query(${putQuery}, ${putValues});
        if (result.rowCount !== 1) throw new Error("PERSISTENCE_WRITE_FAILED");
      },
      /** @param {string} [ownerId] */
      async list(ownerId) {
        const result = await activeQueryable().query(${listQuery}, ${listValues});
        return result.rows.map((row) => Object.freeze({ id: row.id, item: row.payload }));
      },
      /** @param {string} id @param {string} [ownerId] */
      async remove(id, ownerId) {
        const result = await activeQueryable().query(${removeQuery}, ${removeValues});
        return result.rowCount === 1;
      },
    })`;
    })
    .join(",\n    ");
  const firstResource = resources[0];
  if (!firstResource) throw new Error("A PostgreSQL Production runtime requires a domain resource");
  return `import { AsyncLocalStorage } from "node:async_hooks";

/**
 * @typedef {{ rows: Array<Record<string, unknown>>, rowCount: number | null }} QueryResult
 * @typedef {{ query(sql: string, values?: readonly unknown[]): Promise<QueryResult> }} QueryClient
 * @typedef {QueryClient & { release(): void }} TransactionClient
 * @typedef {QueryClient & { connect(): Promise<TransactionClient> }} Queryable
 */

/** @param {unknown} value @returns {asserts value is Queryable} */
function assertQueryable(value) {
  if (value === null || typeof value !== "object" || typeof Reflect.get(value, "query") !== "function" || typeof Reflect.get(value, "connect") !== "function") {
    throw new TypeError("A concrete PostgreSQL query pool is required");
  }
}

/** @param {string | undefined} ownerId */
function requiredOwner(ownerId) {
  if (typeof ownerId !== "string" || !ownerId.trim()) throw new Error("AUTHENTICATION_REQUIRED");
  return ownerId.trim();
}

/** @param {unknown} value @returns {string} */
function stableJson(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => JSON.stringify(key) + ":" + stableJson(item)).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}

/** @param {string} value */
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** @param {unknown} input */
function operationInput(input) {
  if (input === null || typeof input !== "object") throw new Error("INVALID_REQUEST");
  const key = Reflect.get(input, "key");
  const operationId = Reflect.get(input, "operationId");
  const request = Reflect.get(input, "request");
  if (typeof key !== "string" || !key.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  if (typeof operationId !== "string" || !operationId.trim()) throw new Error("INVALID_REQUEST");
  return { key: key.trim(), operationId: operationId.trim(), request, context: Reflect.get(input, "context") };
}

/** @param {unknown} input */
function requestContext(input) {
  if (input === null || typeof input !== "object") return null;
  const context = Reflect.get(input, "context");
  return context !== null && typeof context === "object" ? context : null;
}

/** @param {unknown} input */
function clientAddress(input) {
  const context = requestContext(input);
  const request = context ? Reflect.get(context, "request") : null;
  if (!(request instanceof Request)) return null;
  return request.headers.get("x-nf-client-connection-ip")?.trim() || null;
}

/** @param {string} databaseUrl */
export async function createPostgresPool(databaseUrl) {
  const module = await import("pg");
  return new module.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: 10,
  });
}

/**
 * @param {Queryable} queryable
 * @param {{ identityForContext?(context: unknown): { subject?: string } | null }} [options]
 */
export function createPostgresRuntime(queryable, options = {}) {
  assertQueryable(queryable);
  const transactionQueries = new AsyncLocalStorage();
  /** @returns {QueryClient} */
  const activeQueryable = () => transactionQueries.getStore() ?? queryable;
  const storagePorts = Object.freeze({
    ${storageEntries}
  });
  const database = storagePorts[${JSON.stringify(firstResource.id)}];
  const identityForContext = options.identityForContext ?? (() => null);
  const idempotency = ${
    idempotencyRequired
      ? `Object.freeze({
    /**
     * @param {unknown} input
     * @param {() => Promise<unknown>} invoke
     * @returns {Promise<{ status: "executed" | "replayed" | "conflict", value?: unknown }>}
     */
    async execute(input, invoke) {
      if (typeof invoke !== "function") throw new TypeError("Idempotency callback is required");
      const request = operationInput(input);
      const requestSha256 = await sha256(stableJson(request.request));
      const identity = identityForContext(request.context);
      const clientIp = clientAddress({ context: request.context });
      const subject = typeof identity?.subject === "string" && identity.subject.trim()
        ? "account:" + identity.subject.trim()
        : clientIp ? "ip:" + clientIp : null;
      if (!subject) throw new Error("IDEMPOTENCY_SUBJECT_REQUIRED");
      const subjectSha256 = await sha256(subject);
      const client = await queryable.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          "INSERT INTO helix_runtime_idempotency(operation_id, subject_sha256, idempotency_key, request_sha256) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING operation_id",
          [request.operationId, subjectSha256, request.key, requestSha256],
        );
        if (inserted.rowCount !== 1) {
          const existing = await client.query(
            "SELECT request_sha256, state, response_payload FROM helix_runtime_idempotency WHERE operation_id = $1 AND subject_sha256 = $2 AND idempotency_key = $3 FOR UPDATE",
            [request.operationId, subjectSha256, request.key],
          );
          const row = existing.rows[0];
          if (!row || row.request_sha256 !== requestSha256 || row.state !== "completed") {
            await client.query("ROLLBACK");
            return { status: "conflict" };
          }
          await client.query("COMMIT");
          return { status: "replayed", value: row.response_payload };
        }
        const value = await transactionQueries.run(client, invoke);
        const completed = await client.query(
          "UPDATE helix_runtime_idempotency SET state = 'completed', response_payload = $4::jsonb, completed_at = now() WHERE operation_id = $1 AND subject_sha256 = $2 AND idempotency_key = $3 AND request_sha256 = $5 AND state = 'pending'",
          [request.operationId, subjectSha256, request.key, JSON.stringify(value), requestSha256],
        );
        if (completed.rowCount !== 1) throw new Error("IDEMPOTENCY_COMMIT_FAILED");
        await client.query("COMMIT");
        return { status: "executed", value };
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { /* the original failure remains authoritative */ }
        throw error;
      } finally {
        client.release();
      }
    },
  })`
      : "undefined"
  };
  const rateLimit = ${
    rateLimitRequired
      ? `Object.freeze({
    /** @param {unknown} input */
    async consume(input) {
      const context = requestContext(input);
      const identity = identityForContext(context);
      const subject = typeof identity?.subject === "string" && identity.subject.trim()
        ? "account:" + identity.subject.trim()
        : clientAddress(input) ? "ip:" + clientAddress(input) : null;
      if (!subject) return false;
      const operationId = input !== null && typeof input === "object" ? Reflect.get(input, "operationId") : null;
      if (typeof operationId !== "string" || !operationId.trim()) return false;
      const subjectSha256 = await sha256(subject);
      const windowNumber = Math.floor(Date.now() / 60_000);
      const result = await activeQueryable().query(
        "INSERT INTO helix_runtime_rate_limits(operation_id, subject_sha256, window_number, request_count) VALUES ($1, $2, $3, 1) ON CONFLICT (operation_id, subject_sha256, window_number) DO UPDATE SET request_count = helix_runtime_rate_limits.request_count + 1, updated_at = now() WHERE helix_runtime_rate_limits.request_count < 60 RETURNING request_count",
        [operationId.trim(), subjectSha256, windowNumber],
      );
      return result.rowCount === 1;
    },
  })`
      : "undefined"
  };
  return Object.freeze({ database, idempotency, rateLimit, storagePorts });
}
`;
}

function operationHandlersSource(requirements: ProductionRequirements): string {
  const resources = deriveProductionDomainResources(requirements);
  const fallbackResource = resources[0];
  if (!fallbackResource) throw new Error("Production operation handlers require a domain resource");
  const operations = requirements.apiOperations.map((operation) => ({
    operationId: operation.operationId,
    method: operation.method,
    path: operation.path,
    resourceId: resourceIdFromApiPath(operation.path) ?? fallbackResource.id,
  }));
  const owned = deriveProductionCapabilityRequirements(requirements).auth;
  return `import { randomUUID } from "node:crypto";
import { ApplicationError } from "../errors.js";
import { createApplicationServices } from "../index.js";

export const operationPlans = Object.freeze(${javascriptValue(operations)}.map((plan) => Object.freeze(plan)));

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} context */
function requestFromContext(context) {
  if (!isRecord(context)) return null;
  return context.request instanceof Request ? context.request : null;
}

/** @param {string} template @param {string} pathname */
function routeIdentifier(template, pathname) {
  const expected = template.split("/").filter(Boolean);
  const actual = pathname.split("/").filter(Boolean);
  const index = expected.findIndex((segment) => segment.startsWith(":"));
  return index >= 0 ? actual[index] ?? null : null;
}

/** @param {unknown} input @param {string | null} pathId @param {boolean} allowGenerated */
function recordIdentifier(input, pathId, allowGenerated) {
  if (pathId?.trim()) return pathId.trim();
  if (isRecord(input) && typeof input.id === "string" && input.id.trim()) return input.id.trim();
  if (allowGenerated) return randomUUID();
  throw new ApplicationError("INVALID_REQUEST", "A record id is required.", 400);
}

/**
 * @param {Readonly<Record<string, string>>} environment
 * @param {Record<string, { get(id: string, ownerId?: string): Promise<unknown>, put(id: string, value: unknown, ownerId?: string): Promise<void>, list(ownerId?: string): Promise<readonly unknown[]>, remove(id: string, ownerId?: string): Promise<boolean> }>} storagePorts
 * @param {(context: unknown) => { subject?: string } | null} identityForContext
 */
export function createOperationHandlers(environment, storagePorts, identityForContext) {
  const services = createApplicationServices(
    environment,
    /** @type {Parameters<typeof createApplicationServices>[1]} */ (storagePorts),
  );
  /** @type {Record<string, { get(id: string, ownerId?: string): Promise<unknown>, put(id: string, value: unknown, ownerId?: string): Promise<void>, list(ownerId?: string): Promise<readonly unknown[]>, remove(id: string, ownerId?: string): Promise<boolean> }>} */
  const repositories = services.repositories;
  /** @type {Record<string, (input: unknown, context: unknown) => Promise<unknown>>} */
  const handlers = {};
  for (const plan of operationPlans) {
    const repository = repositories[plan.resourceId];
    if (!repository) throw new Error("Missing generated repository: " + plan.resourceId);
    handlers[plan.operationId] = async (input, context) => {
      const request = requestFromContext(context);
      if (!request) throw new ApplicationError("INVALID_REQUEST", "Request context is required.", 400);
      const pathname = new URL(request.url).pathname.replace(/^\\/\\.netlify\\/functions\\/api/u, "/api");
      const pathId = routeIdentifier(plan.path, pathname);
      const identity = identityForContext(context);
      const ownerId = ${owned ? 'typeof identity?.subject === "string" ? identity.subject : undefined' : "undefined"};
${
        owned
          ? '      if (!ownerId) throw new ApplicationError("AUTHENTICATION_REQUIRED", "Authentication is required.", 401);'
          : ""
      }
      if (plan.method === "GET") {
        if (!pathId) return Object.freeze({ items: await repository.list(ownerId) });
        const item = await repository.get(pathId, ownerId);
        if (item === null) throw new ApplicationError("NOT_FOUND", "Record not found.", 404);
        return Object.freeze({ id: pathId, item });
      }
      const id = recordIdentifier(input, pathId, plan.method === "POST");
      if (plan.method === "DELETE") {
        if (!(await repository.remove(id, ownerId))) throw new ApplicationError("NOT_FOUND", "Record not found.", 404);
        return Object.freeze({ deleted: true, id });
      }
      if (!isRecord(input)) throw new ApplicationError("INVALID_REQUEST", "A JSON object is required.", 400);
      await repository.put(id, input, ownerId);
      return Object.freeze({ id, item: Object.freeze({ ...input }) });
    };
  }
  return Object.freeze(handlers);
}
`;
}

function runtimeCompositionSource(requiredNames: readonly string[]): string {
  return `import { createMonitoringRuntime } from "../../infra/monitoring.js";
import { createAuthorizationRuntime } from "./authorization.js";
import { readProductionRuntimeEnvironment } from "./environment.js";
import { createOperationHandlers } from "./operations.js";
import { createPostgresPool, createPostgresRuntime } from "./postgres.js";

export const runtimeSourceConfiguration = Object.freeze({
  status: "configured",
  evidence: "source_contract",
  providerActivation: "not_verified",
  runtimeExecution: "not_run",
  requiredEnvironmentNames: Object.freeze(${javascriptValue(requiredNames)}),
});

/**
 * @param {Record<string, string | undefined>} environment
 * @param {{ queryable?: Parameters<typeof createPostgresRuntime>[0], monitoringSink?: Parameters<typeof createMonitoringRuntime>[0] }} [options]
 */
export async function composeProductionRuntimeBindings(environment, options = {}) {
  const values = readProductionRuntimeEnvironment(environment);
  const authorization = await createAuthorizationRuntime(values);
  const databaseUrl = values.DATABASE_URL;
  if (!databaseUrl) throw Object.assign(new Error("DATABASE_URL is required"), { missingNames: ["DATABASE_URL"] });
  const queryable = options.queryable ?? await createPostgresPool(databaseUrl);
  const postgres = createPostgresRuntime(queryable, {
    identityForContext: authorization.identityForContext,
  });
  const operationHandlers = createOperationHandlers(
    values,
    postgres.storagePorts,
    authorization.identityForContext,
  );
  const monitoring = createMonitoringRuntime(options.monitoringSink);
  return Object.freeze({
    authorization: authorization.authorization,
    database: postgres.database,
    ...(postgres.idempotency ? { idempotency: postgres.idempotency } : {}),
    monitoring,
    operationHandlers,
    ...(postgres.rateLimit ? { rateLimit: postgres.rateLimit } : {}),
  });
}
`;
}

export function generateNimbusDelivery(input: ProductionStageGeneratorInput) {
  const requirements = parseStageInput("nimbus", input);
  const capabilities = deriveProductionCapabilityRequirements(requirements);
  const domainResources = deriveProductionDomainResources(requirements);
  const databaseNames = capabilities.database ? ["DATABASE_URL"] : [];
  const storageNames = requirements.storage === "object_storage" ? ["OBJECT_STORAGE_URL"] : [];
  const secretNames = uniqueSorted([
    ...(capabilities.auth ? ["SESSION_SIGNING_SECRET"] : []),
    ...requirements.integrations.flatMap((integration) => integration.envNames),
  ]).filter((name) => !databaseNames.includes(name) && !storageNames.includes(name));
  const allNames = uniqueSorted([...databaseNames, ...storageNames, ...secretNames]);
  const serviceRuntime = requirements.runtimeProfile === "service_app";
  const idempotencyRequired = requirements.apiOperations.some(
    (operation) => operation.idempotencyRequired,
  );
  const rateLimitRequired = requirements.apiOperations.some(
    (operation) => operation.rateLimitRequired,
  );
  const bindingContracts = uniqueSorted([
    ...(serviceRuntime ? ["authorization"] : []),
    ...(capabilities.database ? ["database"] : []),
    ...(capabilities.auth ? ["identity_issuer"] : []),
    ...(idempotencyRequired ? ["idempotency"] : []),
    ...(serviceRuntime ? ["monitoring"] : []),
    ...(requirements.storage === "object_storage" ? ["object_storage"] : []),
    ...(serviceRuntime ? ["operation_handlers"] : []),
    ...(rateLimitRequired ? ["rate_limit"] : []),
  ]);
  const envExample =
    allNames.length > 0
      ? `${allNames.map((name) => `${name}=`).join("\n")}\n`
      : "# The approved profile declares no runtime environment bindings.\n";
  let verifiedDecision: VerifiedNimbusStageDecision | null = null;
  let decisionFailureCode = "NIMBUS_DECISION_EVIDENCE_MISSING";
  if (input.nimbusDecisionEvidence) {
    try {
      verifiedDecision = resolveVerifiedNimbusStageDecision({
        productionRequirements: requirements,
        baseWorkspaceSha256: input.baseWorkspaceSha256,
        evidence: input.nimbusDecisionEvidence,
      });
    } catch (error) {
      decisionFailureCode = nimbusDecisionFailureCode(error);
    }
  }
  const providerSelected = verifiedDecision?.configurationAdapter === "netlify";
  const unresolvedRuntimeContracts = uniqueSorted([
    ...(!capabilities.database ? ["postgresql_persistence"] : []),
    ...(capabilities.auth ? ["identity_issuer"] : []),
    ...(requirements.storage === "object_storage" ? ["object_storage"] : []),
    ...(requirements.integrations.some((integration) => integration.execution === "server")
      ? ["server_integrations"]
      : []),
    ...(requirements.apiOperations.some(
      (operation) => operation.access.kind === "signed_webhook",
    )
      ? ["signed_webhook_handlers"]
      : []),
  ]);
  const runtimeComposable = Boolean(
    providerSelected && serviceRuntime && unresolvedRuntimeContracts.length === 0,
  );
  const runtimeOutputPaths = runtimeComposable
    ? [
        "server/runtime/authorization.js",
        "server/runtime/composition.js",
        "server/runtime/environment.js",
        "server/runtime/operations.js",
        "server/runtime/postgres.js",
      ]
    : [];
  const netlify = `[build]
command = "npm run build"
publish = "dist"

[build.environment]
NODE_VERSION = "22"

[[headers]]
for = "/assets/*"
[headers.values]
Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
for = "/*"
[headers.values]
Cache-Control = "public, max-age=0, must-revalidate"
${
  serviceRuntime
    ? `
[functions]
directory = "dist/infra/netlify/functions"
node_bundler = "esbuild"

[[redirects]]
from = "/api/*"
to = "/.netlify/functions/api/:splat"
status = 200
force = true

[[headers]]
for = "/api/*"
[headers.values]
Cache-Control = "no-store"
`
    : ""
}`;
  const monitoring = `export const monitoringScope = ${JSON.stringify(
    requirements.monitoringScope,
  )};

/** @typedef {{ info(payload: string): void, error(payload: string): void }} MonitoringSink */

/** @param {string} name @param {Record<string, string | number | boolean>} fields */
export function createMonitoringEvent(name, fields = {}) {
  if (!name.trim()) throw new TypeError("Monitoring event name is required");
  return Object.freeze({ name, fields: Object.freeze({ ...fields }) });
}

/** @param {MonitoringSink} [sink] */
export function createMonitoringRuntime(sink = console) {
  if (!sink || typeof sink.info !== "function" || typeof sink.error !== "function") {
    throw new TypeError("A concrete monitoring sink is required");
  }
  return Object.freeze({
    /**
     * @param {{ operationId: string, method: string, path: string }} input
     * @param {() => Promise<Response>} invoke
     */
    async observeRequest(input, invoke) {
      if (typeof invoke !== "function") throw new TypeError("A monitored request callback is required");
      const startedAt = Date.now();
      try {
        const response = await invoke();
        const event = createMonitoringEvent(
          response.status >= 500 ? "production_request_failed" : "production_request_completed",
          {
            durationMs: Math.max(0, Date.now() - startedAt),
            method: input.method,
            operationId: input.operationId,
            path: input.path,
            status: response.status,
          },
        );
        (response.status >= 500 ? sink.error : sink.info)(JSON.stringify(event));
        return response;
      } catch (error) {
        const event = createMonitoringEvent("production_request_failed", {
          durationMs: Math.max(0, Date.now() - startedAt),
          errorType: error instanceof Error ? error.name : "UnknownError",
          method: input.method,
          operationId: input.operationId,
          path: input.path,
          status: 500,
        });
        sink.error(JSON.stringify(event));
        throw error;
      }
    },
  });
}
`;
  const cdnPolicy = `# CDN policy

Netlify source configuration sets immutable fingerprinted assets to a one-year cache lifetime, revalidates application documents, and prevents API responses from being cached. Provider activation still requires deployment evidence.
`;
  const outputPaths = uniqueSorted([
    ".env.example",
    "infra/cdn-policy.md",
    "infra/monitoring.js",
    "infra/nimbus-decision.json",
    ...(providerSelected && serviceRuntime ? ["infra/netlify/functions/api.js"] : []),
    ...runtimeOutputPaths,
    ...(providerSelected ? ["netlify.toml"] : []),
  ]);
  const testPath = "tests/nimbus/infrastructure-contract.test.mjs";
  const decisionEvidence = verifiedDecision
    ? {
        status: "verified" as const,
        sourceId: verifiedDecision.source.id,
        keyId: verifiedDecision.source.keyId,
        authentication: verifiedDecision.source.authentication,
        verifiedAt: verifiedDecision.verifiedAt,
        candidateWorkspaceSha256: verifiedDecision.candidateWorkspaceSha256,
        productionRequirementsSha256: verifiedDecision.productionRequirementsSha256,
        infrastructureRequirementsSha256:
          verifiedDecision.infrastructureRequirementsSha256,
        evidenceEnvelopeSha256: verifiedDecision.evidenceEnvelopeSha256,
        decisionInputSha256: verifiedDecision.decisionInputSha256,
        decisionSha256: verifiedDecision.decisionSha256,
        automaticProvisioning: false as const,
        automaticDeployment: false as const,
      }
    : {
        status: "not_configured" as const,
        reasonCode: decisionFailureCode,
        automaticProvisioning: false as const,
        automaticDeployment: false as const,
      };
  const decisionDocument = verifiedDecision
    ? {
        kind: "nimbus_source_configuration_plan",
        version: "1.0.0",
        evidence: decisionEvidence,
        decision: verifiedDecision.decision,
        limitations: [
          "This is authenticated, hash-bound source configuration evidence, not provider provisioning or deployment proof.",
          runtimeComposable
            ? "Concrete runtime bindings are composed from declared environment names, but deployment and provider activation remain unverified."
            : `Runtime composition is blocked by unresolved contracts: ${unresolvedRuntimeContracts.join(
                ", ",
              )}.`,
        ],
      }
    : {
        kind: "nimbus_source_configuration_plan",
        version: "1.0.0",
        evidence: decisionEvidence,
        decision: null,
        limitations: [
          "No provider, runtime, region, or cost is selected without fresh authenticated evidence.",
          "No infrastructure resource, secret value, deploy, or rollback was created.",
        ],
      };
  const artifact = NimbusArtifactSchema.parse({
    ...artifactBase(
      "nimbus_infrastructure_artifact",
      "docs/artifacts/nimbus.json",
      outputPaths,
      [testPath],
      verifiedDecision
        ? serviceRuntime
          ? runtimeComposable
            ? "Fresh authenticated provider/quote evidence selected a hash-bound adapter, and generated source composes request authorization, PostgreSQL persistence, idempotency, rate limiting, and approved operation handlers. Runtime execution, provisioning, and deployment remain not run."
            : "Fresh authenticated provider/quote evidence selected a source adapter, but unresolved capability contracts keep runtime composition not_configured; no provisioning or deployment occurred."
          : "Fresh authenticated provider/quote evidence selected a static source configuration and hash-bound plan. No provisioning or deployment occurred."
        : "Nimbus generated only a requirements-derived, fail-closed source plan. No provider, runtime, region, cost, provisioning, or deployment is claimed without verified evidence.",
    ),
    decision: decisionEvidence,
    provider: verifiedDecision ? verifiedDecision.decision.provider : null,
    runtime: verifiedDecision ? verifiedDecision.decision.runtime : null,
    configurationAdapter: verifiedDecision?.configurationAdapter ?? null,
    activation:
      verifiedDecision && (!serviceRuntime || runtimeComposable)
        ? "source_configured"
        : "not_configured",
    activationEvidence: {
      status: "not_verified",
      evidence: "not_run",
      automaticDeployment: false,
      reasonCode: verifiedDecision
        ? "PROVIDER_ACTIVATION_NOT_RUN"
        : "PROVIDER_DECISION_NOT_CONFIGURED",
    },
    rationale: verifiedDecision
      ? serviceRuntime
        ? runtimeComposable
          ? `Authenticated evidence selected ${verifiedDecision.decision.provider.displayName} in ${verifiedDecision.decision.provider.region} with runtime ${verifiedDecision.decision.runtime.id}. Generated source composes every declared runtime port from validated environment names and PostgreSQL-backed adapters; activation evidence is still not run and no provider action occurred.`
          : `Authenticated evidence selected ${verifiedDecision.decision.provider.displayName} in ${verifiedDecision.decision.provider.region} with runtime ${verifiedDecision.decision.runtime.id}, but runtime composition remains fail-closed for ${unresolvedRuntimeContracts.join(
              ", ",
            )}; no provider action ran.`
        : `Authenticated evidence selected ${verifiedDecision.decision.provider.displayName} in ${verifiedDecision.decision.provider.region} with runtime ${verifiedDecision.decision.runtime.id}. This is source configuration only; no provider action ran.`
      : `Nimbus is not configured (${decisionFailureCode}). Requirements are recorded, but no provider, runtime, region, or cost is selected without fresh authenticated candidate and quote evidence.`,
    configPaths: providerSelected
      ? ["infra/nimbus-decision.json", "netlify.toml"]
      : ["infra/nimbus-decision.json"],
    functionPaths:
      providerSelected && serviceRuntime ? ["infra/netlify/functions/api.js"] : [],
    runtimeSourcePaths: runtimeOutputPaths,
    bindingContracts,
    monitoringPaths: ["infra/monitoring.js"],
    database: { required: capabilities.database, bindingNames: databaseNames },
    storage: {
      required: requirements.storage === "object_storage",
      bindingNames: storageNames,
    },
    cdn: {
      required: true,
      selectedInPlan: verifiedDecision?.decision.cdn.selectedInPlan ?? false,
      policyPath: "infra/cdn-policy.md",
    },
    secretNames,
    costEstimate: verifiedDecision
      ? {
          evidence: "authenticated_provider_quote",
          currency: verifiedDecision.decision.monthlyCostEstimate.currency,
          monthlyMin: verifiedDecision.decision.monthlyCostEstimate.minimumUsd,
          monthlyMax: verifiedDecision.decision.monthlyCostEstimate.maximumUsd,
          assumptions: verifiedDecision.decision.monthlyCostEstimate.components.map(
            (component) => component.assumption,
          ),
        }
      : { evidence: "unavailable", reasonCode: decisionFailureCode },
  });
  const roundTripTest = runtimeComposable
    ? `
  const persistedRows = new Map();
  const roundTripRuntime = createPostgresRuntime({
    /** @param {string} sql @param {readonly unknown[]} [values] */
    async query(sql, values = []) {
      if (sql.startsWith("INSERT INTO ${domainResources[0]?.tableName ?? "domain_items"}")) {
        persistedRows.set(String(values[0]), JSON.parse(String(values[1])));
        return { rows: [{ id: values[0] }], rowCount: 1 };
      }
      if (sql.startsWith("SELECT payload FROM ${
        domainResources[0]?.tableName ?? "domain_items"
      }")) {
        const item = persistedRows.get(String(values[0]));
        return { rows: item === undefined ? [] : [{ payload: item }], rowCount: item === undefined ? 0 : 1 };
      }
      if (sql.startsWith("SELECT id, payload FROM ${
        domainResources[0]?.tableName ?? "domain_items"
      }")) {
        return {
          rows: [...persistedRows].map(([id, payload]) => ({ id, payload })),
          rowCount: persistedRows.size,
        };
      }
      if (sql.startsWith("DELETE FROM ${domainResources[0]?.tableName ?? "domain_items"}")) {
        return { rows: [], rowCount: persistedRows.delete(String(values[0])) ? 1 : 0 };
      }
      throw new Error("UNEXPECTED_QUERY_CONTRACT: " + sql);
    },
    async connect() { throw new Error("TRANSACTION_NOT_EXPECTED_FOR_REPOSITORY_ROUND_TRIP"); },
  });
  const roundTripRepository = roundTripRuntime.storagePorts[${JSON.stringify(
    domainResources[0]?.id ?? "domain_items",
  )}];
  await roundTripRepository.put("stable-record", { value: 1 });
  assert.deepEqual(await roundTripRepository.list(), [
    { id: "stable-record", item: { value: 1 } },
  ]);
  assert.deepEqual(await roundTripRepository.get("stable-record"), { value: 1 });
  await roundTripRepository.put("stable-record", { value: 2 });
  assert.deepEqual(await roundTripRepository.get("stable-record"), { value: 2 });
  assert.equal(await roundTripRepository.remove("stable-record"), true);
  assert.equal(await roundTripRepository.get("stable-record"), null);

  const rejectedWriteRuntime = createPostgresRuntime({
    async query() { return { rows: [], rowCount: 0 }; },
    async connect() { throw new Error("TRANSACTION_NOT_EXPECTED_FOR_REJECTED_WRITE"); },
  });
  await assert.rejects(
    () => rejectedWriteRuntime.storagePorts[${JSON.stringify(
      domainResources[0]?.id ?? "domain_items",
    )}].put("rejected-record", { value: 3 }),
    /PERSISTENCE_WRITE_FAILED/u,
  );`
    : "";
  const test = `import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Nimbus declares names without embedding credentials or deployment claims", async () => {
  const environment = await readFile(new URL("../../.env.example", import.meta.url), "utf8");
  const decision = JSON.parse(await readFile(new URL("../../infra/nimbus-decision.json", import.meta.url), "utf8"));
  for (const line of environment.split(/\\r?\\n/u).filter((line) => /^[A-Z]/u.test(line))) {
    assert.match(line, /^[A-Z][A-Z0-9_]*=$/u);
  }
  ${
    providerSelected
      ? `const config = await readFile(new URL("../../netlify.toml", import.meta.url), "utf8");
  assert.match(config, /command = "npm run build"/u);
  assert.match(config, /publish = "dist"/u);
  assert.match(config, /for = "\\/assets\\/\\*"[\\s\\S]*max-age=31536000, immutable/u);
  assert.equal(decision.evidence.status, "verified");
  assert.equal(decision.evidence.authentication, "hmac_sha256");
  assert.equal(decision.evidence.automaticProvisioning, false);
  assert.equal(decision.evidence.automaticDeployment, false);
  ${serviceRuntime ? `assert.match(config, /directory = "dist\\/infra\\/netlify\\/functions"/u);
  assert.match(config, /from = "\\/api\\/\\*"/u);
  const { createNetlifyApiHandler, default: handler, missingRuntimeBindings, requiredBindingContracts, runtimeActivation } = await import("../../infra/netlify/functions/api.js");
  assert.equal(runtimeActivation.status, "not_verified");
  assert.equal(runtimeActivation.evidence, "not_run");
  assert.equal(runtimeActivation.automaticDeployment, false);
  ${
    runtimeComposable
      ? `assert.equal(runtimeActivation.sourceCapability, "configured");
  const { composeProductionRuntimeBindings, runtimeSourceConfiguration } = await import("../../server/runtime/composition.js");
  const { requiredRuntimeEnvironmentNames } = await import("../../server/runtime/environment.js");
  assert.equal(runtimeSourceConfiguration.providerActivation, "not_verified");
  assert.equal(runtimeSourceConfiguration.runtimeExecution, "not_run");
  const priorEnvironment = Object.fromEntries(requiredRuntimeEnvironmentNames.map((name) => [name, process.env[name]]));
  try {
    for (const name of requiredRuntimeEnvironmentNames) delete process.env[name];
    const response = await handler(new Request(${JSON.stringify(
      `https://example.test${requirements.apiOperations[0]?.path ?? "/api/not-configured"}`,
    )}, { method: ${JSON.stringify(requirements.apiOperations[0]?.method ?? "GET")} }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const payload = await response.json();
    assert.equal(payload.code, "PRODUCTION_RUNTIME_CONFIGURATION_MISSING");
    assert.deepEqual(payload.missingBindings, requiredRuntimeEnvironmentNames);
  } finally {
    for (const [name, value] of Object.entries(priorEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  const sourceEnvironment = Object.fromEntries(requiredRuntimeEnvironmentNames.map((name) => [
    name,
    name === "DATABASE_URL" ? ["postgresql:", "//database.invalid/helix"].join("") :
      name === "SESSION_SIGNING_SECRET" ? "s".repeat(48) : "configured-source-only",
  ]));
  let providerQueries = 0;
  /** @type {Array<{ level: string, payload: string }>} */
  const monitoringEvents = [];
  const bindings = await composeProductionRuntimeBindings(sourceEnvironment, {
    monitoringSink: {
      /** @param {string} payload */
      info(payload) { monitoringEvents.push({ level: "info", payload }); },
      /** @param {string} payload */
      error(payload) { monitoringEvents.push({ level: "error", payload }); },
    },
    queryable: {
      async query() { providerQueries += 1; throw new Error("PROVIDER_QUERY_FORBIDDEN_IN_SOURCE_TEST"); },
      async connect() { providerQueries += 1; throw new Error("PROVIDER_QUERY_FORBIDDEN_IN_SOURCE_TEST"); },
    },
  });
  assert.deepEqual(missingRuntimeBindings(bindings), []);
  const monitoredFailure = await bindings.monitoring.observeRequest(
    { operationId: "monitoring-contract", method: "GET", path: "/api/monitoring-contract" },
    async () => new Response(null, { status: 503 }),
  );
  assert.equal(monitoredFailure.status, 503);
  assert.equal(monitoringEvents.length, 1);
  assert.equal(monitoringEvents[0]?.level, "error");
  assert.match(monitoringEvents[0]?.payload ?? "", /production_request_failed/u);
  const configured = createNetlifyApiHandler(bindings);
  const notFound = await configured(new Request("https://example.test/api/not-approved", { method: "GET" }));
  assert.equal(notFound.status, 404);
  assert.equal(providerQueries, 0);
${
    idempotencyRequired
      ? `
  const { createPostgresRuntime } = await import("../../server/runtime/postgres.js");
  /** @type {Array<{ sql: string, values: readonly unknown[] }>} */
  const poolQueries = [];
  /** @type {Array<{ sql: string, values: readonly unknown[] }>} */
  const transactionQueries = [];
  const transactionClient = {
    /** @param {string} sql @param {readonly unknown[]} [values] */
    async query(sql, values = []) {
      transactionQueries.push({ sql, values });
      if (sql.startsWith("INSERT INTO helix_runtime_idempotency")) return { rows: [{ operation_id: values[0] }], rowCount: 1 };
      if (sql.startsWith("UPDATE helix_runtime_idempotency")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: sql.startsWith("INSERT INTO ") ? 1 : null };
    },
    release() {},
  };
  const postgres = createPostgresRuntime({
    /** @param {string} sql @param {readonly unknown[]} [values] */
    async query(sql, values = []) { poolQueries.push({ sql, values }); return { rows: [], rowCount: 1 }; },
    async connect() { return transactionClient; },
  }, {
    /** @param {unknown} context */
    identityForContext(context) {
      return context && typeof context === "object" && typeof Reflect.get(context, "subject") === "string"
        ? { subject: Reflect.get(context, "subject") }
        : null;
    },
  });
  const repository = postgres.storagePorts[${JSON.stringify(
    domainResources[0]?.id ?? "domain_items",
  )}];
  if (!postgres.idempotency) throw new Error("Expected generated idempotency adapter");
  /** @param {string} subject @param {string} key @param {() => Promise<unknown>} invoke */
  const executeForSubject = (subject, key, invoke) => postgres.idempotency.execute({
    key,
    operationId: ${JSON.stringify(requirements.apiOperations[0]?.operationId ?? "operation")},
    request: { value: 1 },
    context: { subject },
  }, invoke);
  await executeForSubject("account-a", "shared-logical-key", async () => {
    await repository.put("shared-item", { value: 1 }, "account-a");
    return { id: "shared-item" };
  });
  await executeForSubject("account-b", "shared-logical-key", async () => {
    await repository.put("shared-item", { value: 1 }, "account-b");
    return { id: "shared-item" };
  });
  const reservations = transactionQueries.filter(({ sql }) => sql.startsWith("INSERT INTO helix_runtime_idempotency"));
  assert.equal(reservations.length, 2);
  assert.notEqual(reservations[0].values[1], reservations[1].values[1]);
  const domainWrites = transactionQueries.filter(({ sql }) => sql.includes("INSERT INTO ${
    domainResources[0]?.tableName ?? "domain_items"
  }"));
  assert.equal(domainWrites.length, 2);
  assert.equal(domainWrites.every(({ sql }) => sql.includes("ON CONFLICT (id)")), true);
  assert.equal(poolQueries.length, 0, "domain writes must use the active idempotency transaction client");

  const beforeFailure = transactionQueries.length;
  await assert.rejects(
    () => executeForSubject("account-c", "rollback-key", async () => {
      await repository.put("item-c", { value: 2 }, "account-c");
      throw new Error("USE_CASE_FAILED_AFTER_WRITE");
    }),
    /USE_CASE_FAILED_AFTER_WRITE/u,
  );
  const failedTransaction = transactionQueries.slice(beforeFailure).map(({ sql }) => sql);
  assert.equal(failedTransaction.some((sql) => sql.includes("INSERT INTO ${
    domainResources[0]?.tableName ?? "domain_items"
  }")), true);
  assert.equal(failedTransaction.at(-1), "ROLLBACK");
  assert.equal(failedTransaction.includes("COMMIT"), false);
  assert.equal(poolQueries.length, 0);`
      : `
  const { createPostgresRuntime } = await import("../../server/runtime/postgres.js");
  const postgres = createPostgresRuntime({
    async query() { throw new Error("PROVIDER_QUERY_FORBIDDEN_IN_SOURCE_TEST"); },
    async connect() { throw new Error("PROVIDER_QUERY_FORBIDDEN_IN_SOURCE_TEST"); },
  });
  assert.equal(postgres.idempotency, undefined);`
  }${roundTripTest}`
      : `assert.equal(runtimeActivation.sourceCapability, "not_configured");
  const response = await handler(new Request(${JSON.stringify(
    `https://example.test${requirements.apiOperations[0]?.path ?? "/api/not-configured"}`,
  )}, { method: ${JSON.stringify(requirements.apiOperations[0]?.method ?? "GET")} }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const payload = await response.json();
  assert.equal(payload.code, "PRODUCTION_RUNTIME_CONFIGURATION_MISSING");
  assert.deepEqual(payload.missingBindings, requiredBindingContracts);`
  }` : `assert.doesNotMatch(config, /\\[functions\\]|\\[\\[redirects\\]\\]/u);`}`
      : `assert.equal(decision.evidence.status, "not_configured");
  assert.equal(decision.decision, null);
  await assert.rejects(readFile(new URL("../../netlify.toml", import.meta.url), "utf8"), /ENOENT/u);`
  }
  assert.doesNotMatch(JSON.stringify(decision), /hmacSecret|bearerToken|auth_token|access_token/iu);
});
`;
  return makeStageDelivery(
    "nimbus",
    input,
    artifact,
    [
      generatedFile(".env.example", envExample),
      generatedFile("infra/cdn-policy.md", cdnPolicy),
      generatedFile("infra/monitoring.js", monitoring),
      generatedFile("infra/nimbus-decision.json", `${javascriptValue(decisionDocument)}\n`),
      ...(providerSelected && serviceRuntime
        ? [
            generatedFile(
              "infra/netlify/functions/api.js",
              netlifyAdapterSource(requirements, bindingContracts, runtimeComposable),
            ),
          ]
        : []),
      ...(runtimeComposable
        ? [
            generatedFile(
              "server/runtime/authorization.js",
              authorizationRuntimeSource(capabilities.auth),
            ),
            generatedFile(
              "server/runtime/composition.js",
              runtimeCompositionSource(allNames),
            ),
            generatedFile(
              "server/runtime/environment.js",
              runtimeEnvironmentSource(allNames),
            ),
            generatedFile(
              "server/runtime/operations.js",
              operationHandlersSource(requirements),
            ),
            generatedFile(
              "server/runtime/postgres.js",
              postgresRuntimeSource(requirements),
            ),
          ]
        : []),
      ...(providerSelected ? [generatedFile("netlify.toml", netlify)] : []),
    ],
    [generatedFile(testPath, test)],
  );
}
