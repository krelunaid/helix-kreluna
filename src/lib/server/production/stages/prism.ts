import {
  PrismArtifactSchema,
  deriveProductionCapabilityRequirements,
} from "@/lib/production-artifact-graph";
import type { ProductionStageGeneratorInput } from "@/lib/server/production/types";
import { deriveProductionDomainResources } from "@/lib/server/production/domain";
import {
  artifactBase,
  generatedFile,
  makeStageDelivery,
  parseStageInput,
} from "@/lib/server/production/stages/shared";

export function generatePrismDelivery(input: ProductionStageGeneratorInput) {
  const requirements = parseStageInput("prism", input);
  const owned = deriveProductionCapabilityRequirements(requirements).auth;
  const resources = deriveProductionDomainResources(requirements);
  const idempotencyRequired = requirements.apiOperations.some(
    (operation) => operation.idempotencyRequired,
  );
  const rateLimitRequired = requirements.apiOperations.some(
    (operation) => operation.rateLimitRequired,
  );
  const userTable = owned
    ? `CREATE TABLE app_users (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_users_id_nonempty CHECK (length(id) > 0)
);\n\n`
    : "";
  const resourceSchemas = resources.map(({ tableName }) => {
    const ownerColumn = owned ? "  owner_id text NOT NULL REFERENCES app_users(id),\n" : "";
    const ownerIndex = owned
      ? `CREATE INDEX ${tableName}_owner_id_idx ON ${tableName}(owner_id);\n`
      : "";
    const idColumn = owned ? "  id text NOT NULL,\n" : "  id text PRIMARY KEY,\n";
    const primaryKey = owned ? `  PRIMARY KEY (owner_id, id),\n` : "";
    return `CREATE TABLE ${tableName} (
${idColumn}${ownerColumn}  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
${primaryKey}  CONSTRAINT ${tableName}_id_nonempty CHECK (length(id) > 0)
);
${ownerIndex}`;
  });
  const idempotencySchema = idempotencyRequired
    ? `CREATE TABLE helix_runtime_idempotency (
  operation_id text NOT NULL,
  subject_sha256 text NOT NULL,
  idempotency_key text NOT NULL,
  request_sha256 text NOT NULL,
  state text NOT NULL DEFAULT 'pending',
  response_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (operation_id, subject_sha256, idempotency_key),
  CONSTRAINT helix_runtime_idempotency_subject_sha256 CHECK (subject_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT helix_runtime_idempotency_request_sha256 CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT helix_runtime_idempotency_state CHECK (state IN ('pending', 'completed')),
  CONSTRAINT helix_runtime_idempotency_completion CHECK (
    (state = 'pending' AND completed_at IS NULL) OR
    (state = 'completed' AND completed_at IS NOT NULL)
  )
);
CREATE INDEX helix_runtime_idempotency_created_at_idx ON helix_runtime_idempotency(created_at);
`
    : "";
  const rateLimitSchema = rateLimitRequired
    ? `CREATE TABLE helix_runtime_rate_limits (
  operation_id text NOT NULL,
  subject_sha256 text NOT NULL,
  window_number bigint NOT NULL,
  request_count integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operation_id, subject_sha256, window_number),
  CONSTRAINT helix_runtime_rate_limits_subject_sha256 CHECK (subject_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT helix_runtime_rate_limits_request_count CHECK (request_count > 0)
);
CREATE INDEX helix_runtime_rate_limits_updated_at_idx ON helix_runtime_rate_limits(updated_at);
`
    : "";
  const schema = `${userTable}${resourceSchemas.join("\n")}${
    resourceSchemas.length > 0 ? "\n" : ""
  }${idempotencySchema}${rateLimitSchema}`;
  const migration = `BEGIN;\n\n${schema}\nCOMMIT;\n`;
  const outputPaths = ["db/migrations/0001_core.sql", "db/schema.sql"];
  const testPath = "tests/prism/database-contract.test.mjs";
  const tables = [
    ...(owned
      ? [
          {
            name: "app_users",
            sensitivity: "system" as const,
            primaryKey: "id",
            ownershipField: null,
            createdAtField: "created_at",
            updatedAtField: "updated_at",
            foreignKeys: [],
            indexes: [],
            constraints: ["app_users_id_nonempty"],
          },
        ]
      : []),
    ...resources.map(({ tableName }) => ({
      name: tableName,
      sensitivity: owned ? ("owned" as const) : ("public" as const),
      primaryKey: owned ? "owner_id,id" : "id",
      ownershipField: owned ? "owner_id" : null,
      createdAtField: "created_at",
      updatedAtField: "updated_at",
      foreignKeys: owned ? [`${tableName}.owner_id -> app_users.id`] : [],
      indexes: owned ? [`${tableName}_owner_id_idx`] : [],
      constraints: [`${tableName}_id_nonempty`],
    })),
    ...(idempotencyRequired
      ? [
          {
            name: "helix_runtime_idempotency",
            sensitivity: "system" as const,
            primaryKey: "operation_id,subject_sha256,idempotency_key",
            ownershipField: null,
            createdAtField: "created_at",
            updatedAtField: "completed_at",
            foreignKeys: [],
            indexes: ["helix_runtime_idempotency_created_at_idx"],
            constraints: [
              "helix_runtime_idempotency_request_sha256",
              "helix_runtime_idempotency_subject_sha256",
              "helix_runtime_idempotency_state",
              "helix_runtime_idempotency_completion",
            ],
          },
        ]
      : []),
    ...(rateLimitRequired
      ? [
          {
            name: "helix_runtime_rate_limits",
            sensitivity: "system" as const,
            primaryKey: "operation_id,subject_sha256,window_number",
            ownershipField: null,
            createdAtField: "updated_at",
            updatedAtField: "updated_at",
            foreignKeys: [],
            indexes: ["helix_runtime_rate_limits_updated_at_idx"],
            constraints: [
              "helix_runtime_rate_limits_subject_sha256",
              "helix_runtime_rate_limits_request_count",
            ],
          },
        ]
      : []),
  ];
  const artifact = PrismArtifactSchema.parse({
    ...artifactBase(
      "prism_database_artifact",
      "docs/artifacts/prism.json",
      outputPaths,
      [testPath],
      "PostgreSQL schema and additive migration source were derived from approved persistence and ownership requirements; no database execution is asserted.",
    ),
    dialect: "postgresql",
    schemaPaths: ["db/schema.sql"],
    migrationPaths: ["db/migrations/0001_core.sql"],
    tables,
    retentionPolicy:
      "Records remain subject to product-specific retention approval; deletion must preserve referential integrity and an audit trail.",
    integrityTestPaths: [testPath],
  });
  const test = `import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Prism migration preserves the declared integrity contract", async () => {
  const sql = await readFile(new URL("../../db/migrations/0001_core.sql", import.meta.url), "utf8");
  assert.match(sql, /^BEGIN;/u);
  ${resources
    .map(({ tableName }) => `assert.match(sql, /CREATE TABLE ${tableName}/u);`)
    .join("\n  ")}
  ${
    idempotencyRequired
      ? "assert.match(sql, /CREATE TABLE helix_runtime_idempotency/u);"
      : "assert.doesNotMatch(sql, /helix_runtime_idempotency/u);"
  }
  ${
    rateLimitRequired
      ? "assert.match(sql, /CREATE TABLE helix_runtime_rate_limits/u);"
      : "assert.doesNotMatch(sql, /helix_runtime_rate_limits/u);"
  }
  assert.match(sql, /PRIMARY KEY/u);
  assert.match(sql, /created_at timestamptz NOT NULL/u);
  assert.match(sql, /updated_at timestamptz NOT NULL/u);
  ${
    owned
      ? "assert.match(sql, /owner_id text NOT NULL REFERENCES app_users\\(id\\)[\\s\\S]*PRIMARY KEY \\(owner_id, id\\)/u);"
      : "assert.doesNotMatch(sql, /owner_id/u);"
  }
  assert.match(sql, /COMMIT;\\s*$/u);
});
`;
  return makeStageDelivery(
    "prism",
    input,
    artifact,
    [
      generatedFile("db/migrations/0001_core.sql", migration),
      generatedFile("db/schema.sql", schema),
    ],
    [generatedFile(testPath, test)],
  );
}
