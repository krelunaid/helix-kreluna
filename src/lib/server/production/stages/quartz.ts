import {
  QuartzArtifactSchema,
  deriveProductionCapabilityRequirements,
} from "@/lib/production-artifact-graph";
import type { ProductionStageGeneratorInput } from "@/lib/server/production/types";
import {
  deriveProductionDomainResources,
  productionIdentifier,
} from "@/lib/server/production/domain";
import {
  artifactBase,
  generatedFile,
  makeStageDelivery,
  parseStageInput,
} from "@/lib/server/production/stages/shared";

export function generateQuartzDelivery(input: ProductionStageGeneratorInput) {
  const requirements = parseStageInput("quartz", input);
  const owned = deriveProductionCapabilityRequirements(requirements).auth;
  const resources = deriveProductionDomainResources(requirements);
  const idempotencyRequired = requirements.apiOperations.some(
    (operation) => operation.idempotencyRequired,
  );
  const rateLimitRequired = requirements.apiOperations.some(
    (operation) => operation.rateLimitRequired,
  );
  const outputPaths = [
    "db/rollback.sql",
    "docs/database/backup-strategy.md",
    "docs/database/review.md",
  ];
  const testPath = "tests/quartz/migration-safety.test.mjs";
  const rollback = `BEGIN;
${[...resources]
  .reverse()
  .map(({ tableName }) => `DROP TABLE IF EXISTS ${tableName};`)
  .join("\n")}
${rateLimitRequired ? "DROP TABLE IF EXISTS helix_runtime_rate_limits;\n" : ""}${
  idempotencyRequired ? "DROP TABLE IF EXISTS helix_runtime_idempotency;\n" : ""
}
${owned ? "DROP TABLE IF EXISTS app_users;\n" : ""}COMMIT;
`;
  const review = `# Database review

The initial migration is additive, transactional, and declares primary keys, timestamps, and integrity constraints. Query plans have not been executed; EXPLAIN evidence remains explicitly \`not_run\` until an isolated PostgreSQL runner is available.

## Required follow-up

- Exercise migration and rollback against an ephemeral database.
- Capture EXPLAIN evidence for each approved domain lookup and owner-scoped listing.
- Confirm the approved product-specific retention period.
`;
  const backup = `# Backup strategy

Use provider-managed PostgreSQL snapshots plus encrypted logical exports before schema changes. Restore drills must target an isolated database, verify row counts and constraints, and record recovery-point and recovery-time measurements. This document does not assert that a provider or schedule is configured.
`;
  const artifact = QuartzArtifactSchema.parse({
    ...artifactBase(
      "quartz_database_review_artifact",
      "docs/artifacts/quartz.json",
      outputPaths,
      [testPath],
      "Static migration review, rollback source, and an unconfigured backup strategy were produced; database execution and query plans remain not run.",
    ),
    reviewedMigrationPaths: ["db/migrations/0001_core.sql"],
    queryReviews: resources.map(({ id, repositoryPath, tableName }) => ({
        id: productionIdentifier(`${id.slice(0, 72)}_lookup`),
        sourcePath: repositoryPath,
        verdict: "accepted" as const,
        requiredIndexes: owned ? [`${tableName}_owner_id_idx`] : [],
        risks: ["Query-plan evidence requires an isolated PostgreSQL execution environment."],
        explainEvidence: "not_run",
        explainTestPath: testPath,
      })),
    backupStrategyPath: "docs/database/backup-strategy.md",
    rollbackPath: "db/rollback.sql",
    migrationSafety:
      "Apply the additive migration in a transaction, take a verified backup first, and exercise the paired rollback only in an isolated environment before release.",
    integrityTestPaths: [testPath],
  });
  const test = `import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Quartz keeps migration and rollback fenced by transactions", async () => {
  const migration = await readFile(new URL("../../db/migrations/0001_core.sql", import.meta.url), "utf8");
  const rollback = await readFile(new URL("../../db/rollback.sql", import.meta.url), "utf8");
  assert.match(migration, /^BEGIN;/u);
  assert.match(migration, /COMMIT;\\s*$/u);
  assert.match(rollback, /^BEGIN;/u);
  ${resources
    .map(({ tableName }) => `assert.match(rollback, /DROP TABLE IF EXISTS ${tableName}/u);`)
    .join("\n  ")}
  ${
    idempotencyRequired
      ? "assert.match(rollback, /DROP TABLE IF EXISTS helix_runtime_idempotency/u);"
      : "assert.doesNotMatch(rollback, /helix_runtime_idempotency/u);"
  }
  ${
    rateLimitRequired
      ? "assert.match(rollback, /DROP TABLE IF EXISTS helix_runtime_rate_limits/u);"
      : "assert.doesNotMatch(rollback, /helix_runtime_rate_limits/u);"
  }
  assert.match(rollback, /COMMIT;\\s*$/u);
});
`;
  return makeStageDelivery(
    "quartz",
    input,
    artifact,
    [
      generatedFile("db/rollback.sql", rollback),
      generatedFile("docs/database/backup-strategy.md", backup),
      generatedFile("docs/database/review.md", review),
    ],
    [generatedFile(testPath, test)],
  );
}
