import { BasaltArtifactSchema } from "@/lib/production-artifact-graph";
import {
  deriveProductionDomainResources,
  productionPascalIdentifier,
} from "@/lib/server/production/domain";
import type { ProductionStageGeneratorInput } from "@/lib/server/production/types";
import {
  artifactBase,
  generatedFile,
  javascriptValue,
  makeStageDelivery,
  parseStageInput,
} from "@/lib/server/production/stages/shared";

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function generateBasaltDelivery(input: ProductionStageGeneratorInput) {
  const requirements = parseStageInput("basalt", input);
  const resources = deriveProductionDomainResources(requirements);
  const requiredEnv = requirements.dataModel === "server_persistent" ? ["DATABASE_URL"] : [];
  const outputPaths = [
    ...resources.map((resource) => resource.repositoryPath),
    "server/env.js",
    "server/errors.js",
    "server/index.js",
  ].sort(compareText);
  const testPath = "tests/basalt/backend-contract.test.mjs";
  const envSource = `export const requiredServerEnvironment = Object.freeze(${javascriptValue(
    requiredEnv,
  )});

/** @param {Record<string, string | undefined>} source */
export function readServerEnvironment(source) {
  /** @type {Record<string, string>} */
  const values = {};
  for (const name of requiredServerEnvironment) {
    const value = source[name]?.trim();
    if (!value) throw new Error("Missing required server environment name: " + name);
    values[name] = value;
  }
  return Object.freeze(values);
}
`;
  const errorsSource = `export class ApplicationError extends Error {
  /** @param {string} code @param {string} message @param {number} status */
  constructor(code, message, status) {
    super(message);
    this.name = "ApplicationError";
    this.code = code;
    this.status = status;
  }
}

/** @param {unknown} error */
export function publicError(error) {
  if (error instanceof ApplicationError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  return { code: "INTERNAL_ERROR", message: "Unexpected server error", status: 500 };
}
`;
  const repositoryFiles = resources.map((resource) => {
    const functionName = `create${productionPascalIdentifier(resource.singularId)}Repository`;
    const source = `/**
 * @typedef {{
 *   get(id: string, ownerId?: string): Promise<unknown>,
 *   put(id: string, value: unknown, ownerId?: string): Promise<void>,
 *   list?(ownerId?: string): Promise<readonly unknown[]>,
 *   remove?(id: string, ownerId?: string): Promise<boolean>
 * }} StoragePort
 */

/** @param {StoragePort} storage */
export function ${functionName}(storage) {
  if (!storage || typeof storage.get !== "function" || typeof storage.put !== "function") {
    throw new TypeError("A concrete ${resource.id} storage port is required");
  }
  return Object.freeze({
    /** @param {string} id @param {string} [ownerId] */
    async get(id, ownerId) {
      if (!id.trim()) throw new TypeError("${resource.singularId} id is required");
      return storage.get(id, ownerId);
    },
    /** @param {string} id @param {unknown} value @param {string} [ownerId] */
    async put(id, value, ownerId) {
      if (!id.trim()) throw new TypeError("${resource.singularId} id is required");
      await storage.put(id, value, ownerId);
    },
    /** @param {string} [ownerId] */
    async list(ownerId) {
      if (typeof storage.list !== "function") throw new Error("PERSISTENCE_LIST_NOT_CONFIGURED");
      return storage.list(ownerId);
    },
    /** @param {string} id @param {string} [ownerId] */
    async remove(id, ownerId) {
      if (!id.trim()) throw new TypeError("${resource.singularId} id is required");
      if (typeof storage.remove !== "function") throw new Error("PERSISTENCE_DELETE_NOT_CONFIGURED");
      return storage.remove(id, ownerId);
    },
  });
}
`;
    return { ...resource, functionName, source };
  });
  const imports = repositoryFiles
    .map(
      (resource) =>
        `import { ${resource.functionName} } from "./core/${resource.tableName}-repository.js";`,
    )
    .join("\n");
  const storageType = repositoryFiles
    .map(
      (resource) => `${resource.id}: Parameters<typeof ${resource.functionName}>[0]`,
    )
    .join(", ");
  const repositories = repositoryFiles
    .map(
      (resource) =>
        `    ${resource.id}: ${resource.functionName}(storagePorts.${resource.id}),`,
    )
    .join("\n");
  const indexSource = `${imports}
import { readServerEnvironment } from "./env.js";

/**
 * @param {Record<string, string | undefined>} environment
 * @param {{ ${storageType} }} storagePorts
 */
export function createApplicationServices(environment, storagePorts) {
  if (!storagePorts || typeof storagePorts !== "object") {
    throw new TypeError("Concrete domain storage ports are required");
  }
  return Object.freeze({
    environment: readServerEnvironment(environment),
    repositories: Object.freeze({
${repositories}
    }),
  });
}
`;
  const artifact = BasaltArtifactSchema.parse({
    ...artifactBase(
      "basalt_backend_artifact",
      "docs/artifacts/basalt.json",
      outputPaths,
      [testPath],
      `Node 22 ES module ports and repositories for ${resources
        .map((resource) => resource.id)
        .join(", ")} were derived from approved API domains; concrete external bindings remain unconfigured.`,
    ),
    runtime: "node_22_es_modules",
    sourceRoot: "server/index.js",
    serverEntrypoints: ["server/index.js"],
    envSchemaPath: "server/env.js",
    errorContractPath: "server/errors.js",
    modules: repositoryFiles.map((resource) => ({
      id: resource.id,
      sourcePath: resource.repositoryPath,
      responsibilities: [
        `Keep ${resource.id} persistence behind an injected storage port.`,
        `Reject empty ${resource.singularId} identifiers before storage access.`,
      ],
    })),
    businessRules: [
      "External resources are supplied through explicit ports rather than created at module load.",
      "Required server environment names are validated before application services are exposed.",
      ...requirements.apiOperations.map(
        (operation) =>
          `${operation.operationId} must enforce its approved ${operation.access.kind} access contract.`,
      ),
    ],
  });
  const testResource = repositoryFiles[0];
  if (!testResource) throw new Error("Basalt requires at least one approved domain resource");
  const test = `import assert from "node:assert/strict";
import test from "node:test";
import { ${testResource.functionName} } from "../../${testResource.repositoryPath}";
import { readServerEnvironment } from "../../server/env.js";
import { ApplicationError, publicError } from "../../server/errors.js";

test("Basalt validates domain ports, environment names, and public errors without external calls", async () => {
  const values = new Map();
  const repository = ${testResource.functionName}({
    async get(id) { return values.get(id); },
    async put(id, value) { values.set(id, value); },
  });
  await repository.put("${testResource.singularId}-1", { ok: true });
  assert.deepEqual(await repository.get("${testResource.singularId}-1"), { ok: true });
  ${requiredEnv.length > 0 ? `assert.throws(() => readServerEnvironment({}), /${requiredEnv[0]}/u);` : "assert.deepEqual(readServerEnvironment({}), {});"}
  assert.deepEqual(publicError(new ApplicationError("INVALID_INPUT", "Invalid", 400)), {
    code: "INVALID_INPUT", message: "Invalid", status: 400,
  });
});
`;
  return makeStageDelivery(
    "basalt",
    input,
    artifact,
    [
      ...repositoryFiles.map((resource) =>
        generatedFile(resource.repositoryPath, resource.source),
      ),
      generatedFile("server/env.js", envSource),
      generatedFile("server/errors.js", errorsSource),
      generatedFile("server/index.js", indexSource),
    ],
    [generatedFile(testPath, test)],
  );
}
