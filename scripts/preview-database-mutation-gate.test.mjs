import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  attestPreviewDatabaseMutation,
  previewDatabaseMutationsEnabled,
  reportPreviewDatabaseAttestation,
} from "./preview-database-mutation-gate.mjs";

const execFileAsync = promisify(execFile);
const ROOT = join(import.meta.dirname, "..");
const DATABASE_PASSWORD = ["preview", "pass"].join("-");
const DATABASE_URL = [
  "postgresql",
  "://",
  "preview-user",
  ":",
  DATABASE_PASSWORD,
  "@database.example.test/helix",
].join("");

function attestedEnvironment(overrides = {}) {
  return {
    HELIX_PREVIEW_DB_MUTATIONS_ENABLED: "true",
    HELIX_PREVIEW_DATABASE_URL_SHA256: createHash("sha256")
      .update(DATABASE_URL, "utf8")
      .digest("hex"),
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

test("preview database mutations require exact PR and connection-string SHA-256", () => {
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
    () => attestPreviewDatabaseMutation({}, () => DATABASE_URL),
    /PREVIEW_DATABASE_MUTATION_DISABLED/u,
  );

  const evidence = attestPreviewDatabaseMutation(attestedEnvironment(), () => DATABASE_URL);
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
    () => DATABASE_URL,
  );
  assert.equal(
    report.databaseAttestationSha256,
    createHash("sha256").update(DATABASE_URL, "utf8").digest("hex"),
  );
  assert.doesNotMatch(JSON.stringify(report), /postgres|database\.example/u);

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
      () => attestPreviewDatabaseMutation(environment, () => DATABASE_URL),
      /PREVIEW_DATABASE_MUTATION_FORBIDDEN/u,
    );
  }

  assert.throws(
    () =>
      attestPreviewDatabaseMutation(
        attestedEnvironment({ HELIX_PREVIEW_DATABASE_URL_SHA256: "0".repeat(64) }),
        () => DATABASE_URL,
      ),
    /PREVIEW_DATABASE_ATTESTATION_INVALID/u,
  );
  assert.throws(
    () =>
      attestPreviewDatabaseMutation(
        attestedEnvironment({ NETLIFY_DB_URL: `${DATABASE_URL}-different` }),
        () => DATABASE_URL,
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
    NETLIFY_DB_URL: DATABASE_URL,
  });
  const reported = await execFileAsync(
    process.execPath,
    [wrapperPath, "--confirm-preview-database-mutations"],
    { cwd: ROOT, env: { ...process.env, ...reportEnvironment } },
  );
  const expectedDigest = createHash("sha256").update(DATABASE_URL, "utf8").digest("hex");
  assert.match(reported.stdout, new RegExp(`database_attestation_sha256=${expectedDigest}`, "u"));
  assert.doesNotMatch(`${reported.stdout}\n${reported.stderr}`, /postgresql|database\.example/u);

  await assert.rejects(
    execFileAsync(process.execPath, [wrapperPath, "--confirm-preview-database-mutations"], {
      cwd: ROOT,
      env: {
        ...process.env,
        HELIX_PREVIEW_DB_MUTATIONS_ENABLED: "invalid",
        NETLIFY_DB_URL: DATABASE_URL,
      },
    }),
    (error) => {
      assert.match(error.stderr, /PREVIEW_DATABASE_MUTATION_FORBIDDEN/u);
      assert.doesNotMatch(`${error.stdout}\n${error.stderr}`, new RegExp(DATABASE_URL, "u"));
      return true;
    },
  );
});
