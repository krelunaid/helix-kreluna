import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  attestPreviewDatabaseMutation,
  PREVIEW_DATABASE_FORBIDDEN_PG_ENVIRONMENT,
  previewDatabaseMutationsEnabled,
  reportPreviewDatabaseAttestation,
} from "./preview-database-mutation-gate.mjs";

const execFileAsync = promisify(execFile);
const ROOT = join(import.meta.dirname, "..");
const DATABASE_ENDPOINT = [
  "postgresql",
  "://",
  "preview-user",
  ":a",
  "@database.example.test/helix",
  "?channel_binding=require&sslmode=require",
].join("");
const SAME_TARGET_VARIANT = [
  "postgresql",
  "://",
  "preview-user",
  ":b",
  "@database.example.test/helix?sslmode=require&channel_binding=require",
].join("");
const REQUIRED_FORBIDDEN_PG_ENVIRONMENT = [
  "PGHOST",
  "PGHOSTADDR",
  "PGPORT",
  "PGUSER",
  "PGDATABASE",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGOPTIONS",
  "PGSSLMODE",
  "PGCHANNELBINDING",
];
const PG_ENVIRONMENT_REGRESSIONS = [
  ...PREVIEW_DATABASE_FORBIDDEN_PG_ENVIRONMENT,
  "PGFUTURE_CONNECTION_OVERRIDE",
];

function pinnedEnvironment(overrides = {}) {
  return {
    NETLIFY: "true",
    CONTEXT: "deploy-preview",
    PULL_REQUEST: "true",
    REVIEW_ID: "314",
    COMMIT_REF: "a".repeat(40),
    DEPLOY_ID: "deploy-id",
    SITE_ID: "89a00a91-8730-40e6-ac92-be473f106a78",
    SITE_NAME: "helix-kreluna",
    DEPLOY_PRIME_URL: "https://deploy-preview-314--helix-kreluna.netlify.app",
    HELIX_PREVIEW_EXPECTED_REVIEW_ID: "314",
    HELIX_PREVIEW_EXPECTED_COMMIT_REF: "a".repeat(40),
    STRIPE_BILLING_ENABLED: "false",
    ...overrides,
  };
}

const DATABASE_ATTESTATION_SHA256 = reportPreviewDatabaseAttestation(
  pinnedEnvironment({ HELIX_PREVIEW_DB_MUTATIONS_ENABLED: "false" }),
  () => DATABASE_ENDPOINT,
).databaseAttestationSha256;

function attestedEnvironment(overrides = {}) {
  return pinnedEnvironment({
    HELIX_PREVIEW_DB_MUTATIONS_ENABLED: "true",
    HELIX_PREVIEW_DATABASE_URL_SHA256: DATABASE_ATTESTATION_SHA256,
    ...overrides,
  });
}

test("preview database mutations require exact PR and canonical-target SHA-256", () => {
  assert.equal(previewDatabaseMutationsEnabled({}), false);
  assert.equal(
    previewDatabaseMutationsEnabled({ HELIX_PREVIEW_DB_MUTATIONS_ENABLED: "false" }),
    false,
  );
  assert.throws(
    () => previewDatabaseMutationsEnabled({ HELIX_PREVIEW_DB_MUTATIONS_ENABLED: "yes" }),
    /PREVIEW_DATABASE_MUTATION_FORBIDDEN/u,
  );
  assert.throws(
    () => attestPreviewDatabaseMutation({}, () => DATABASE_ENDPOINT),
    /PREVIEW_DATABASE_MUTATION_DISABLED/u,
  );

  const evidence = attestPreviewDatabaseMutation(attestedEnvironment(), () => DATABASE_ENDPOINT);
  assert.deepEqual(evidence, {
    reviewId: "314",
    commitRef: "a".repeat(40),
    deployId: "deploy-id",
  });
  assert.doesNotMatch(JSON.stringify(evidence), /postgres|database\.example/u);

  const report = reportPreviewDatabaseAttestation(
    attestedEnvironment({
      HELIX_PREVIEW_DB_MUTATIONS_ENABLED: "false",
      HELIX_PREVIEW_DATABASE_URL_SHA256: undefined,
    }),
    () => DATABASE_ENDPOINT,
  );
  assert.equal(report.databaseAttestationSha256, DATABASE_ATTESTATION_SHA256);
  assert.doesNotMatch(JSON.stringify(report), /postgres|database\.example/u);

  const sameTargetReport = reportPreviewDatabaseAttestation(
    pinnedEnvironment({ HELIX_PREVIEW_DB_MUTATIONS_ENABLED: "false" }),
    () => SAME_TARGET_VARIANT,
  );
  assert.equal(sameTargetReport.databaseAttestationSha256, DATABASE_ATTESTATION_SHA256);
  for (const incompleteUrl of [
    "postgresql://:a@database.example.test/helix?channel_binding=require&sslmode=require",
    "postgresql://preview-user@database.example.test/helix?channel_binding=require&sslmode=require",
    "postgresql://preview-user:a@database.example.test/?channel_binding=require&sslmode=require",
  ]) {
    assert.throws(
      () =>
        reportPreviewDatabaseAttestation(
          pinnedEnvironment({ HELIX_PREVIEW_DB_MUTATIONS_ENABLED: "false" }),
          () => incompleteUrl,
        ),
      /PREVIEW_DATABASE_ATTESTATION_INVALID/u,
      incompleteUrl,
    );
  }
  for (const differentTarget of [
    "postgresql://different-user:a@database.example.test/helix?channel_binding=require&sslmode=require",
    "postgresql://preview-user:a@other-database.example.test/helix?channel_binding=require&sslmode=require",
    "postgresql://preview-user:a@database.example.test:6543/helix?channel_binding=require&sslmode=require",
    "postgresql://preview-user:a@database.example.test/other-branch?channel_binding=require&sslmode=require",
  ]) {
    const differentTargetReport = reportPreviewDatabaseAttestation(
      pinnedEnvironment({ HELIX_PREVIEW_DB_MUTATIONS_ENABLED: "false" }),
      () => differentTarget,
    );
    assert.notEqual(differentTargetReport.databaseAttestationSha256, DATABASE_ATTESTATION_SHA256);
  }

  for (const forbiddenQuery of [
    "host=production.example.test",
    "user=admin",
    "port=6543",
    "dbname=production",
    "database=production",
    "hostaddr=192.0.2.10",
    "service=production",
    "options=--search_path%3Dprivate",
    "sslmode=disable",
    "ssl=0",
    "token=benign-fixture",
    "channel_binding=disable",
    "channel_binding=require&channel_binding=require",
  ]) {
    const separator = forbiddenQuery.startsWith("sslmode=")
      ? "channel_binding=require&"
      : forbiddenQuery.startsWith("channel_binding=")
        ? "sslmode=require&"
        : "channel_binding=require&sslmode=require&";
    const candidate = `postgresql://preview-user:b@database.example.test/helix?${separator}${forbiddenQuery}`;
    assert.throws(
      () => attestPreviewDatabaseMutation(attestedEnvironment(), () => candidate),
      /PREVIEW_DATABASE_ATTESTATION_INVALID/u,
      forbiddenQuery,
    );
  }

  for (const name of REQUIRED_FORBIDDEN_PG_ENVIRONMENT) {
    assert.equal(PREVIEW_DATABASE_FORBIDDEN_PG_ENVIRONMENT.includes(name), true, name);
  }
  for (const name of PG_ENVIRONMENT_REGRESSIONS) {
    let connectionStringRead = false;
    assert.throws(
      () =>
        attestPreviewDatabaseMutation(attestedEnvironment({ [name]: "fixture" }), () => {
          connectionStringRead = true;
          return DATABASE_ENDPOINT;
        }),
      /PREVIEW_DATABASE_ATTESTATION_INVALID/u,
      name,
    );
    assert.equal(connectionStringRead, false, name);
  }

  for (const environment of [
    attestedEnvironment({ CONTEXT: "production" }),
    attestedEnvironment({ CONTEXT: "branch-deploy" }),
    attestedEnvironment({ PULL_REQUEST: "false" }),
    attestedEnvironment({ REVIEW_ID: "315" }),
    attestedEnvironment({ COMMIT_REF: "b".repeat(40) }),
    attestedEnvironment({ DEPLOY_PRIME_URL: "https://helix-kreluna.netlify.app" }),
    attestedEnvironment({ SITE_ID: "wrong-site" }),
    attestedEnvironment({ STRIPE_BILLING_ENABLED: "true" }),
  ]) {
    assert.throws(
      () => attestPreviewDatabaseMutation(environment, () => DATABASE_ENDPOINT),
      /PREVIEW_DATABASE_MUTATION_FORBIDDEN/u,
    );
  }

  assert.throws(
    () =>
      attestPreviewDatabaseMutation(
        attestedEnvironment({ HELIX_PREVIEW_DATABASE_URL_SHA256: "0".repeat(64) }),
        () => DATABASE_ENDPOINT,
      ),
    /PREVIEW_DATABASE_ATTESTATION_INVALID/u,
  );
  assert.throws(
    () =>
      attestPreviewDatabaseMutation(
        attestedEnvironment({ NETLIFY_DB_URL: `${DATABASE_ENDPOINT}-different` }),
        () => DATABASE_ENDPOINT,
      ),
    /PREVIEW_DATABASE_ATTESTATION_INVALID/u,
  );
  assert.throws(
    () => attestPreviewDatabaseMutation(attestedEnvironment(), () => "not-a-database-url"),
    /PREVIEW_DATABASE_ATTESTATION_INVALID/u,
  );
});

test("branch wrapper is default no-op, migration re-attests and provisioning stays manual", async () => {
  const wrapperPath = join(ROOT, "scripts/prepare-preview-database.mjs");
  const [wrapperSource, migrateSource, provisionSource, exampleSource, deploySource] =
    await Promise.all([
      readFile(wrapperPath, "utf8"),
      readFile(join(ROOT, "scripts/migrate.mjs"), "utf8"),
      readFile(join(ROOT, "scripts/provision-preview-user.mjs"), "utf8"),
      readFile(join(ROOT, ".env.example"), "utf8"),
      readFile(join(ROOT, "src/lib/preview-deploy.ts"), "utf8"),
    ]);

  assert.ok(
    wrapperSource.indexOf("attestPreviewDatabaseMutation()") <
      wrapperSource.indexOf('run("scripts/migrate.mjs"'),
  );
  assert.match(migrateSource, /strictNetlifyBranch[\s\S]*attestPreviewDatabaseMutation\(\)/u);
  assert.match(provisionSource, /attestPreviewDatabaseMutation\(\)[\s\S]*operatorPassword\(\)/u);
  assert.match(deploySource, /89a00a91-8730-40e6-ac92-be473f106a78/u);
  assert.match(deploySource, /helix-kreluna/u);
  assert.match(exampleSource, /^HELIX_PREVIEW_DB_MUTATIONS_ENABLED=false$/mu);
  assert.match(exampleSource, /^HELIX_PREVIEW_DATABASE_URL_SHA256=$/mu);
  assert.match(exampleSource, /^HELIX_PREVIEW_TESTER_PROVISION_ENABLED=false$/mu);
  assert.match(exampleSource, /Password environment variables are intentionally unsupported/u);
  assert.doesNotMatch(exampleSource, /^HELIX_PREVIEW_TESTER_PASSWORD=/mu);
  assert.doesNotMatch(wrapperSource, /provision-preview-user/u);

  const disabled = await execFileAsync(
    process.execPath,
    [wrapperPath, "--confirm-preview-database-mutations"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        HELIX_PREVIEW_DB_MUTATIONS_ENABLED: "false",
      },
    },
  );
  assert.match(disabled.stdout, /mutations disabled;.*skipped/u);

  const reportEnvironment = attestedEnvironment({
    HELIX_PREVIEW_DB_MUTATIONS_ENABLED: "false",
    HELIX_PREVIEW_DATABASE_URL_SHA256: "",
    NETLIFY_DB_URL: DATABASE_ENDPOINT,
  });
  const reported = await execFileAsync(
    process.execPath,
    [wrapperPath, "--confirm-preview-database-mutations"],
    { cwd: ROOT, env: { ...process.env, ...reportEnvironment } },
  );
  assert.match(
    reported.stdout,
    new RegExp(`database_attestation_sha256=${DATABASE_ATTESTATION_SHA256}`, "u"),
  );
  assert.doesNotMatch(`${reported.stdout}\n${reported.stderr}`, /postgresql|database\.example/u);

  await assert.rejects(
    execFileAsync(process.execPath, [wrapperPath, "--confirm-preview-database-mutations"], {
      cwd: ROOT,
      env: {
        ...process.env,
        HELIX_PREVIEW_DB_MUTATIONS_ENABLED: "invalid",
        NETLIFY_DB_URL: DATABASE_ENDPOINT,
      },
    }),
    (error) => {
      assert.match(error.stderr, /PREVIEW_DATABASE_MUTATION_FORBIDDEN/u);
      assert.equal(`${error.stdout}\n${error.stderr}`.includes(DATABASE_ENDPOINT), false);
      return true;
    },
  );
});
