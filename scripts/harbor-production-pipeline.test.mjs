import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";

const ROOT = join(import.meta.dirname, "..");
const NOW = Date.parse("2026-08-21T10:00:00.000Z");
const SECRET = "offline-harbor-contract-secret-32-bytes";
const HUMAN_GATE_SHA = "a".repeat(64);

async function loadModules(t) {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  return {
    workspace: await vite.ssrLoadModule("/src/lib/workspace.ts"),
    artifact: await vite.ssrLoadModule("/src/lib/server/release/harbor-production-artifact.ts"),
    runner: await vite.ssrLoadModule("/src/lib/server/release/harbor-production-runner.ts"),
    release: await vite.ssrLoadModule("/src/lib/server/release/harbor-production-release.ts"),
    sweeper: await vite.ssrLoadModule("/src/lib/server/release/harbor-production-sweeper.ts"),
  };
}

function productionFiles() {
  return {
    "README.md": "# Harbor Production workspace\n",
    "docs/prd.json": '{"goal":"publish exact source"}\n',
    "docs/architecture.json": '{"runtime":"static"}\n',
    "apps/web/index.html": "<!doctype html><html><body>Harbor</body></html>\n",
    "apps/web/src/main.ts": "document.body.dataset.ready = 'true';\n",
    ".env.example": "PUBLIC_ORIGIN=\n",
    "db/migrations/0001_initial.sql": "create table example(id text primary key);\n",
    "tests/app.test.ts": "export const testExists = true;\n",
    "netlify.toml": '[build]\ncommand = "npm run build"\n',
    "infra/monitoring.ts": "export const monitoringConfigured = true;\n",
    "docs/decisions.json": '{"decision":"static"}\n',
    "docs/score.json": '{"score":100}\n',
    "docs/Éclair.txt": "UTF-8 path round trip\n",
  };
}

function capabilities() {
  const architecture = ["docs/architecture.json"];
  return [
    {
      id: "frontend",
      status: "implemented",
      detail: "Frontend is present.",
      evidencePaths: ["apps/web/index.html"],
    },
    {
      id: "backend",
      status: "not_required",
      detail: "Static architecture.",
      evidencePaths: architecture,
    },
    { id: "api", status: "not_required", detail: "No API required.", evidencePaths: architecture },
    {
      id: "database",
      status: "not_required",
      detail: "No runtime database.",
      evidencePaths: ["db/migrations/0001_initial.sql"],
    },
    {
      id: "auth",
      status: "not_required",
      detail: "No identity required.",
      evidencePaths: ["docs/prd.json"],
    },
    {
      id: "integrations",
      status: "not_required",
      detail: "No integrations.",
      evidencePaths: architecture,
    },
    {
      id: "tests",
      status: "implemented",
      detail: "Tests passed.",
      evidencePaths: ["tests/app.test.ts"],
    },
    {
      id: "deployment",
      status: "implemented",
      detail: "Deployment config passed.",
      evidencePaths: ["netlify.toml"],
    },
    {
      id: "monitoring",
      status: "implemented",
      detail: "Monitoring source passed.",
      evidencePaths: ["infra/monitoring.ts"],
    },
  ];
}

function validations() {
  return ["typecheck", "lint", "test", "build", "security"].map((scope) => ({
    scope,
    status: "passed",
    evidence: "measured",
    detail: `${scope} passed against the exact candidate.`,
    tool: `offline-${scope}`,
    completedAt: new Date(NOW).toISOString(),
    evidencePaths: [],
  }));
}

async function sealedArtifact(modules, files = productionFiles(), identity = {}) {
  const jobId = identity.jobId ?? "harbor-production-job-1";
  const projectId = identity.projectId ?? "harbor-production-project-1";
  const sealed = await modules.workspace.sealWorkspace({
    jobId,
    projectId,
    locale: "it",
    pipelineVersion: "helix-v3",
    createdAt: new Date(NOW).toISOString(),
    buildLevel: "production",
    entrypoint: "apps/web/index.html",
    files,
    capabilities: capabilities(),
    validations: validations(),
  });
  const artifact = await modules.artifact.createHarborProductionArtifact({
    buildJobId: jobId,
    projectId,
    humanGateArtifactSha256: HUMAN_GATE_SHA,
    files: sealed.files,
    workspace: sealed.manifest,
  });
  return { sealed, artifact };
}

function providerOptions(runner, stateForAction) {
  let nonceCounter = 1;
  return {
    now: () => NOW,
    nonce: () => `00000000-0000-4000-8000-${String(nonceCounter++).padStart(12, "0")}`,
    env: {
      HELIX_HARBOR_RUNNER_URL: "http://127.0.0.1:8791/",
      HELIX_HARBOR_RUNNER_SECRET: SECRET,
    },
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init.body));
      assert.equal(init.method, "POST");
      assert.match(init.headers["x-helix-harbor-signature"], /^[0-9a-f]{64}$/);
      const state = stateForAction(request.action);
      const active = state === "active";
      const failed = state === "failed" || state === "action_required";
      const providerStatus = {
        accepted: "accepted",
        queued: "queued",
        deploying: "building",
        active: "ready",
        failed: "failed",
        action_required: "action_required",
      }[state];
      const report = {
        kind: "helix_harbor_production_report",
        schemaVersion: "1.0.0",
        action: request.action,
        requestNonce: request.requestNonce,
        releaseId: request.releaseId,
        idempotencyKey: request.idempotencyKey,
        identity: request.identity,
        state,
        runnerReleaseId: "runner-release-harbor-1",
        providerEvidence: {
          provider: "offline_provider",
          providerDeploymentId: active ? "provider-deploy-current" : null,
          status: providerStatus,
          publicUrl: active ? "https://harbor-production.example.test/" : null,
          observedAt: new Date(NOW).toISOString(),
          deployedAt: active ? new Date(NOW).toISOString() : null,
          rollback: active
            ? {
                kind: "provider_snapshot",
                reference: "provider-snapshot-empty-baseline",
                status: "ready",
                observedAt: new Date(NOW).toISOString(),
              }
            : null,
          rawReportSha256: "b".repeat(64),
        },
        acceptedAt: new Date(NOW).toISOString(),
        observedAt: new Date(NOW).toISOString(),
        retryAfterSeconds: active || failed ? null : 5,
        error: failed
          ? {
              code: "OFFLINE_PROVIDER_BUILD_FAILED",
              message: "The offline provider reported an immediate build failure.",
              retryable: false,
            }
          : null,
      };
      const body = JSON.stringify(report);
      const signature = await runner.harborProductionHmacHex(
        SECRET,
        `${request.requestNonce}\n${body}`,
      );
      return new Response(body, {
        headers: { "x-helix-harbor-signature": signature },
      });
    },
  };
}

test("Harbor packages the exact multi-file Production workspace and provenance", async (t) => {
  const modules = await loadModules(t);
  const first = await sealedArtifact(modules);
  const reversed = await sealedArtifact(
    modules,
    Object.fromEntries(Object.entries(productionFiles()).reverse()),
  );
  assert.deepEqual(first.artifact.provenance, reversed.artifact.provenance);
  assert.equal(first.artifact.sourcePackage.sha256, reversed.artifact.sourcePackage.sha256);
  assert.equal(first.artifact.sourcePackage.fileCount, first.sealed.manifest.fileCount + 2);
  await modules.artifact.verifyHarborProductionArtifact(first.artifact);
  const zipBytes = Buffer.from(first.artifact.sourcePackage.base64, "base64");
  let zipOffset = 0;
  let unicodeEntryVerified = false;
  while (zipBytes.readUInt32LE(zipOffset) === 0x04034b50) {
    const flags = zipBytes.readUInt16LE(zipOffset + 6);
    const size = zipBytes.readUInt32LE(zipOffset + 18);
    const nameLength = zipBytes.readUInt16LE(zipOffset + 26);
    const extraLength = zipBytes.readUInt16LE(zipOffset + 28);
    const name = zipBytes.subarray(zipOffset + 30, zipOffset + 30 + nameLength).toString("utf8");
    if (name === "docs/Éclair.txt") {
      assert.equal(flags & 0x0800, 0x0800, "Unicode ZIP paths must carry the UTF-8 flag");
      unicodeEntryVerified = true;
    }
    zipOffset += 30 + nameLength + extraLength + size;
  }
  assert.equal(unicodeEntryVerified, true);

  await assert.rejects(
    modules.artifact.verifyHarborProductionArtifact({
      ...first.artifact,
      sourcePackage: {
        ...first.artifact.sourcePackage,
        base64: `${first.artifact.sourcePackage.base64.startsWith("A") ? "B" : "A"}${first.artifact.sourcePackage.base64.slice(1)}`,
      },
    }),
    /HARBOR_PRODUCTION_PACKAGE_INTEGRITY_FAILED/,
  );
  await assert.rejects(
    modules.artifact.verifyHarborProductionArtifact({
      ...first.artifact,
      sourcePackage: {
        ...first.artifact.sourcePackage,
        byteLength: first.artifact.sourcePackage.byteLength + 1,
      },
    }),
    /HARBOR_PRODUCTION_PACKAGE_INTEGRITY_FAILED/,
  );
  await assert.rejects(
    modules.artifact.createHarborProductionArtifact({
      buildJobId: "another-job",
      projectId: "harbor-production-project-1",
      humanGateArtifactSha256: HUMAN_GATE_SHA,
      files: first.sealed.files,
      workspace: first.sealed.manifest,
    }),
    /HARBOR_PRODUCTION_PROVENANCE_MISMATCH/,
  );
  await assert.rejects(
    sealedArtifact(modules, {
      ...productionFiles(),
      "HELIX.HARBOR-PROVENANCE.JSON": "portable collision\n",
    }),
    /HARBOR_PRODUCTION_PROVENANCE_PATH_COLLISION/,
  );
});

test("Harbor accepts only authenticated, request-bound provider reports without network", async (t) => {
  const modules = await loadModules(t);
  const { artifact } = await sealedArtifact(modules);
  const identity = {
    target: "web",
    projectId: artifact.provenance.projectId,
    buildJobId: artifact.provenance.buildJobId,
    humanGateArtifactSha256: artifact.provenance.humanGateArtifactSha256,
    workspaceArtifactSha256: artifact.provenance.workspaceArtifactSha256,
    packageSha256: artifact.sourcePackage.sha256,
    provenanceSha256: artifact.sourcePackage.provenanceSha256,
  };
  assert.throws(
    () => modules.runner.createAuthenticatedHarborProductionProvider({ env: {} }),
    /HARBOR_PRODUCTION_RUNNER_UNCONFIGURED/,
  );
  assert.throws(
    () =>
      modules.runner.assertHarborProductionPublishingConfigured({
        HELIX_HARBOR_RUNNER_URL: "https://harbor.example.test/",
        HELIX_HARBOR_RUNNER_SECRET: SECRET,
      }),
    /HARBOR_PRODUCTION_RECOVERY_UNCONFIGURED/,
  );
  assert.doesNotThrow(() =>
    modules.runner.assertHarborProductionPublishingConfigured({
      HELIX_HARBOR_RUNNER_URL: "https://harbor.example.test/",
      HELIX_HARBOR_RUNNER_SECRET: SECRET,
      HELIX_HARBOR_SWEEPER_ENABLED: "true",
      HELIX_HARBOR_SWEEPER_DISPATCH_SECRET: "D".repeat(32),
    }),
  );
  const provider = modules.runner.createAuthenticatedHarborProductionProvider(
    providerOptions(modules.runner, () => "accepted"),
  );
  const verified = await provider.execute({
    action: "accept",
    releaseId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: `harbor-production:v1:${"c".repeat(64)}`,
    identity,
    sourcePackage: artifact.sourcePackage,
  });
  assert.equal(verified.report.state, "accepted");
  assert.equal(modules.runner.isVerifiedHarborProductionRunnerReport(verified), true);

  const failedProvider = modules.runner.createAuthenticatedHarborProductionProvider(
    providerOptions(modules.runner, () => "failed"),
  );
  const failed = await failedProvider.execute({
    action: "activate",
    releaseId: "99999999-9999-4999-8999-999999999999",
    idempotencyKey: `harbor-production:v1:${"9".repeat(64)}`,
    identity,
    sourcePackage: null,
  });
  assert.equal(failed.report.state, "failed");
  assert.equal(failed.report.error.code, "OFFLINE_PROVIDER_BUILD_FAILED");
  assert.equal(
    modules.runner.HarborProductionRunnerReportSchema.safeParse({
      ...failed.report,
      error: { ...failed.report.error, retryable: true },
    }).success,
    false,
    "terminal provider failures cannot masquerade as retryable in-flight states",
  );

  const activeWithoutRollback = {
    ...failed.report,
    state: "active",
    error: null,
    providerEvidence: {
      ...failed.report.providerEvidence,
      status: "ready",
      providerDeploymentId: "provider-deploy-no-rollback",
      publicUrl: "https://no-rollback.example.test/",
      deployedAt: new Date(NOW).toISOString(),
      rollback: null,
    },
  };
  assert.equal(
    modules.runner.HarborProductionRunnerReportSchema.safeParse(activeWithoutRollback).success,
    false,
  );
  assert.equal(
    modules.runner.HarborProductionRunnerReportSchema.safeParse({
      ...activeWithoutRollback,
      retryAfterSeconds: 30,
      providerEvidence: {
        ...activeWithoutRollback.providerEvidence,
        rollback: {
          kind: "prior_deployment",
          reference: "provider-deploy-previous",
          providerDeploymentId: "provider-deploy-previous",
          status: "ready",
          publicUrl: "https://rollback.example.test/",
          observedAt: new Date(NOW).toISOString(),
        },
      },
    }).success,
    false,
    "terminal reports must not request another poll",
  );
  const priorRollback = {
    ...activeWithoutRollback,
    providerEvidence: {
      ...activeWithoutRollback.providerEvidence,
      rollback: {
        kind: "prior_deployment",
        reference: "provider-deploy-previous",
        providerDeploymentId: "provider-deploy-previous",
        status: "ready",
        publicUrl: "https://rollback.example.test/",
        observedAt: new Date(NOW).toISOString(),
      },
    },
  };
  assert.equal(
    modules.runner.HarborProductionRunnerReportSchema.safeParse(priorRollback).success,
    true,
  );
  assert.equal(
    modules.runner.HarborProductionRunnerReportSchema.safeParse({
      ...priorRollback,
      providerEvidence: {
        ...priorRollback.providerEvidence,
        rollback: {
          ...priorRollback.providerEvidence.rollback,
          providerDeploymentId: priorRollback.providerEvidence.providerDeploymentId,
        },
      },
    }).success,
    false,
    "rollback cannot point at the active provider deployment",
  );

  assert.equal(
    modules.release.harborProductionReadiness(undefined, {
      HELIX_HARBOR_RUNNER_URL: "https://harbor.example.test/",
      HELIX_HARBOR_RUNNER_SECRET: SECRET,
      HELIX_HARBOR_SWEEPER_ENABLED: "true",
      HELIX_HARBOR_SWEEPER_DISPATCH_SECRET: "D".repeat(32),
    }).reason,
    "HARBOR_PRODUCTION_SOURCE_PENDING",
  );

  const unsignedProvider = modules.runner.createAuthenticatedHarborProductionProvider({
    ...providerOptions(modules.runner, () => "accepted"),
    fetch: async () =>
      new Response("{}", {
        headers: { "x-helix-harbor-signature": "0".repeat(64) },
      }),
  });
  await assert.rejects(
    unsignedProvider.execute({
      action: "accept",
      releaseId: "22222222-2222-4222-8222-222222222222",
      idempotencyKey: `harbor-production:v1:${"d".repeat(64)}`,
      identity,
      sourcePackage: artifact.sourcePackage,
    }),
    /HARBOR_PRODUCTION_RUNNER_SIGNATURE_INVALID/,
  );
});

async function migratedDatabase(t) {
  const pg = new PGlite();
  await pg.waitReady;
  t.after(() => pg.close());
  const directory = join(ROOT, "migrations");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of names) await pg.exec(await readFile(join(directory, name), "utf8"));
  const sql = async () => {
    throw new Error("Tagged SQL is not used by the Harbor release repository");
  };
  sql.query = async (text, params = []) => (await pg.query(text, params)).rows;
  return { pg, sql };
}

async function preparedReservationFixture(t, modules, identity) {
  const { projectId, jobId, userId, releaseId, requestId, gateRequestId } = identity;
  const { artifact, sealed } = await sealedArtifact(modules, productionFiles(), {
    projectId,
    jobId,
  });
  const { pg, sql } = await migratedDatabase(t);
  await pg.query("insert into profiles (user_id, credits_balance) values ($1, 100)", [userId]);
  await pg.query(
    `insert into projects (id, user_id, title, prompt, build_level)
     values ($1, $2, 'Harbor Recovery', 'Recover exact reservation', 'production')`,
    [projectId, userId],
  );
  await pg.query(
    `insert into build_jobs (
       id, project_id, user_id, payload, idempotency_key, request_fingerprint,
       pipeline_version, stage, queue_status, artifact_sha256
     ) values ($1, $2, $3, $4, $5, $6, 'helix-v3', 'production_finalized',
               'approved', $7)`,
    [
      jobId,
      projectId,
      userId,
      JSON.stringify({ buildLevel: "production", workspace: sealed.manifest }),
      `${jobId}:idempotency`,
      "6".repeat(64),
      HUMAN_GATE_SHA,
    ],
  );
  await pg.query("update projects set current_build_job_id = $1 where id = $2", [jobId, projectId]);
  await pg.query(
    `insert into build_job_gate_events (
       job_id, project_id, actor_type, actor_user_id, decision, from_status,
       to_status, request_id, artifact_sha256
     ) values ($1, $2, 'user', $3, 'approve', 'awaiting_human_approval',
               'approved', $4, $5)`,
    [jobId, projectId, userId, gateRequestId, HUMAN_GATE_SHA],
  );
  const prepared = await modules.release.prepareHarborProductionRelease({
    sql,
    releaseId,
    requestId,
    projectId,
    buildJobId: jobId,
    userId,
    artifact,
  });
  return { artifact, pg, sql, prepared, projectId, jobId, userId };
}

async function leaveRetryableReservation(modules, fixture) {
  await assert.rejects(
    modules.release.acceptHarborProductionRelease({
      sql: fixture.sql,
      row: fixture.prepared,
      artifact: fixture.artifact,
      provider: {
        execute: async () => {
          throw new modules.runner.HarborProductionRunnerError(
            "HARBOR_PRODUCTION_RUNNER_REQUEST_FAILED",
            true,
            5,
          );
        },
      },
      creditCost: 50,
    }),
    /HARBOR_PRODUCTION_RUNNER_REQUEST_FAILED/,
  );
  await fixture.pg.query(
    `update harbor_production_releases
     set credit_reserved_at = now() - interval '20 minutes',
         accept_dispatch_intent_at = now() - interval '20 minutes',
         credit_reservation_expires_at = now() - interval '5 minutes'
     where id = $1`,
    [fixture.prepared.id],
  );
}

test("Harbor prepare, accept, activate, and replay persist exactly once", async (t) => {
  const modules = await loadModules(t);
  const { artifact, sealed } = await sealedArtifact(modules);
  const { pg, sql } = await migratedDatabase(t);
  const userId = "harbor-production-user-1";
  const projectId = artifact.provenance.projectId;
  const jobId = artifact.provenance.buildJobId;
  await pg.query("insert into profiles (user_id, credits_balance) values ($1, 100)", [userId]);
  await pg.query(
    `insert into projects (id, user_id, title, prompt, build_level)
     values ($1, $2, 'Harbor Production', 'Publish exact workspace', 'production')`,
    [projectId, userId],
  );
  await pg.query(
    `insert into build_jobs (
       id, project_id, user_id, payload, idempotency_key, request_fingerprint,
       pipeline_version, stage, queue_status, artifact_sha256
     ) values ($1, $2, $3, $4, $5, $6, 'helix-v3', 'production_finalized',
               'approved', $7)`,
    [
      jobId,
      projectId,
      userId,
      JSON.stringify({ buildLevel: "production", workspace: sealed.manifest }),
      "harbor-build-idempotency-1",
      "e".repeat(64),
      HUMAN_GATE_SHA,
    ],
  );
  await pg.query("update projects set current_build_job_id = $1 where id = $2", [jobId, projectId]);
  await pg.query(
    `insert into build_job_gate_events (
       job_id, project_id, actor_type, actor_user_id, decision, from_status,
       to_status, request_id, artifact_sha256
     ) values ($1, $2, 'user', $3, 'approve', 'awaiting_human_approval',
               'approved', $4, $5)`,
    [jobId, projectId, userId, "33333333-3333-4333-8333-333333333333", HUMAN_GATE_SHA],
  );

  const prepared = await modules.release.prepareHarborProductionRelease({
    sql,
    releaseId: "44444444-4444-4444-8444-444444444444",
    requestId: "55555555-5555-4555-8555-555555555555",
    projectId,
    buildJobId: jobId,
    userId,
    artifact,
  });
  assert.equal(prepared.state, "prepared");
  assert.equal(prepared.provider, null);
  assert.equal(prepared.public_url, null);

  const provider = modules.runner.createAuthenticatedHarborProductionProvider(
    providerOptions(modules.runner, (action) => (action === "accept" ? "accepted" : "active")),
  );
  const accepted = await modules.release.acceptHarborProductionRelease({
    sql,
    row: prepared,
    artifact,
    provider,
    creditCost: 50,
  });
  assert.equal(accepted.state, "accepted");
  assert.equal(accepted.provider, "offline_provider");
  assert.equal(accepted.provider_deployment_id, null);
  assert.equal(accepted.public_url, null);
  assert.equal(accepted.package_base64, null, "accepted releases purge the recovery payload");
  await assert.rejects(
    modules.release.persistHarborProductionProgressReport({
      sql,
      row: accepted,
      verified: { report: {}, responseBodySha256: "f".repeat(64), signatureSha256: "f".repeat(64) },
      claimToken: "unsigned-claim",
    }),
    /HARBOR_PRODUCTION_UNSIGNED_REPORT/,
  );

  await assert.rejects(
    modules.release.advanceHarborProductionRelease({ sql, row: accepted, provider }),
    /HARBOR_PRODUCTION_RETRY_NOT_DUE/,
  );
  await pg.query("update harbor_production_releases set next_poll_at = now() where id = $1", [
    accepted.id,
  ]);
  const due = await modules.release.loadHarborProductionRelease({
    sql,
    releaseId: accepted.id,
    projectId,
    userId,
  });
  assert.ok(due);

  const newerJobId = "harbor-production-job-newer";
  await pg.query(
    `insert into build_jobs (
       id, project_id, user_id, payload, idempotency_key, request_fingerprint,
       pipeline_version, stage, queue_status, artifact_sha256
     ) values ($1, $2, $3, $4, $5, $6, 'helix-v3', 'production_finalized',
               'approved', $7)`,
    [
      newerJobId,
      projectId,
      userId,
      JSON.stringify({ buildLevel: "production", workspace: sealed.manifest }),
      "harbor-build-idempotency-newer",
      "9".repeat(64),
      "8".repeat(64),
    ],
  );
  await pg.query(
    `insert into build_job_gate_events (
       job_id, project_id, actor_type, actor_user_id, decision, from_status,
       to_status, request_id, artifact_sha256
     ) values ($1, $2, 'user', $3, 'approve', 'awaiting_human_approval',
               'approved', $4, $5)`,
    [newerJobId, projectId, userId, "91919191-9191-4191-8191-919191919191", "8".repeat(64)],
  );
  await pg.query("update projects set current_build_job_id = $1 where id = $2", [
    newerJobId,
    projectId,
  ]);

  const baseOptions = providerOptions(modules.runner, (action) =>
    action === "accept" ? "accepted" : "failed",
  );
  const baseFetch = baseOptions.fetch;
  let unblockRunner;
  let markRunnerStarted;
  const runnerStarted = new Promise((resolve) => {
    markRunnerStarted = resolve;
  });
  const runnerBlocked = new Promise((resolve) => {
    unblockRunner = resolve;
  });
  let activationCalls = 0;
  const blockingProvider = modules.runner.createAuthenticatedHarborProductionProvider({
    ...baseOptions,
    fetch: async (...args) => {
      activationCalls += 1;
      markRunnerStarted();
      await runnerBlocked;
      return baseFetch(...args);
    },
  });
  const activation = modules.release.advanceHarborProductionRelease({
    sql,
    row: due,
    provider: blockingProvider,
  });
  await runnerStarted;
  await assert.rejects(
    modules.release.advanceHarborProductionRelease({ sql, row: due, provider }),
    /HARBOR_PRODUCTION_ACTION_IN_PROGRESS/,
  );
  unblockRunner();
  const failed = await activation;
  assert.equal(activationCalls, 1);
  assert.equal(failed.state, "failed");
  assert.equal(failed.provider_deployment_id, null);
  assert.equal(failed.public_url, null);

  const currentAfterFailure = await pg.query(
    "select current_build_job_id from projects where id = $1",
    [projectId],
  );
  assert.equal(
    currentAfterFailure.rows[0].current_build_job_id,
    newerJobId,
    "a bound Harbor release must not replace a newer current build pointer",
  );

  let resumeCalls = 0;
  const resumeBaseOptions = providerOptions(modules.runner, () => "queued");
  const resumeProvider = modules.runner.createAuthenticatedHarborProductionProvider({
    ...resumeBaseOptions,
    fetch: async (...args) => {
      resumeCalls += 1;
      return resumeBaseOptions.fetch(...args);
    },
  });
  const resumeRequestId = "ABCDEF12-3456-7123-8123-ABCDEF123456";
  await pg.query(
    `insert into harbor_production_release_events (
       release_id, event_key, from_state, to_state, source, action, evidence
     ) values ($1, $2, 'failed', 'failed', 'helix', 'reconcile', $3::jsonb)`,
    [
      failed.id,
      `resume-request:${resumeRequestId.toLowerCase()}`,
      JSON.stringify({ requestId: resumeRequestId.toLowerCase() }),
    ],
  );
  const queued = await modules.release.resumeHarborProductionRelease({
    sql,
    row: failed,
    provider: resumeProvider,
    requestId: resumeRequestId,
  });
  const replayedResume = await modules.release.resumeHarborProductionRelease({
    sql,
    row: queued,
    provider: resumeProvider,
    requestId: resumeRequestId.toLowerCase(),
  });
  assert.equal(resumeCalls, 1, "a response-loss replay must not call the runner twice");
  assert.equal(replayedResume.state, "queued");
  await pg.query("update harbor_production_releases set next_poll_at = now() where id = $1", [
    queued.id,
  ]);
  const dueAfterResume = await modules.release.loadHarborProductionRelease({
    sql,
    releaseId: queued.id,
    projectId,
    userId,
  });
  assert.ok(dueAfterResume);
  let finalReconcileCalls = 0;
  const finalOptions = providerOptions(modules.runner, () => "active");
  const finalProvider = modules.runner.createAuthenticatedHarborProductionProvider({
    ...finalOptions,
    fetch: async (...args) => {
      finalReconcileCalls += 1;
      return finalOptions.fetch(...args);
    },
  });
  const active = await modules.release.advanceHarborProductionRelease({
    sql,
    row: dueAfterResume,
    provider: finalProvider,
  });
  assert.equal(finalReconcileCalls, 1);
  assert.equal(active.state, "active");
  assert.equal(active.provider_deployment_id, "provider-deploy-current");
  assert.equal(active.public_url, "https://harbor-production.example.test/");
  assert.equal(active.rollback_ref, "provider-snapshot-empty-baseline");
  assert.equal(active.runner_response_body.length > 0, true);
  assert.match(active.runner_signature, /^[0-9a-f]{64}$/);

  await assert.rejects(
    modules.release.prepareHarborProductionRelease({
      sql,
      releaseId: "61616161-6161-4616-8616-616161616161",
      requestId: "71717171-7171-4717-8717-717171717171",
      projectId,
      buildJobId: jobId,
      userId,
      artifact,
    }),
    /HARBOR_PRODUCTION_PREPARE_CONFLICT/,
    "prepared/replay remains fenced to the current Human Gate",
  );
  await pg.query("update projects set current_build_job_id = $1 where id = $2", [jobId, projectId]);

  const replay = await modules.release.prepareHarborProductionRelease({
    sql,
    releaseId: "66666666-6666-4666-8666-666666666666",
    requestId: "77777777-7777-4777-8777-777777777777",
    projectId,
    buildJobId: jobId,
    userId,
    artifact,
  });
  assert.equal(replay.id, prepared.id);
  assert.equal(replay.state, "active");
  const balance = await pg.query("select credits_balance from profiles where user_id = $1", [
    userId,
  ]);
  assert.equal(balance.rows[0].credits_balance, 50);
  const deploy = await pg.query(
    `select status, provider, provider_deploy_id, url, rollback_ref,
            artifact_sha256, published_sha256, completed_at
     from deploys where id = $1`,
    [active.deploy_id],
  );
  assert.deepEqual(
    {
      status: deploy.rows[0].status,
      provider: deploy.rows[0].provider,
      providerDeployId: deploy.rows[0].provider_deploy_id,
      url: deploy.rows[0].url,
      rollbackRef: deploy.rows[0].rollback_ref,
      artifactSha256: deploy.rows[0].artifact_sha256,
      publishedSha256: deploy.rows[0].published_sha256,
      completed: Boolean(deploy.rows[0].completed_at),
    },
    {
      status: "deployed",
      provider: "offline_provider",
      providerDeployId: "provider-deploy-current",
      url: "https://harbor-production.example.test/",
      rollbackRef: "provider-snapshot-empty-baseline",
      artifactSha256: HUMAN_GATE_SHA,
      publishedSha256: null,
      completed: true,
    },
  );
  const job = await pg.query("select queue_status from build_jobs where id = $1", [jobId]);
  assert.equal(job.rows[0].queue_status, "deployed");
  const events = await pg.query(
    "select source, to_state from harbor_production_release_events where release_id = $1 order by id",
    [prepared.id],
  );
  assert.deepEqual(
    events.rows.map((row) => [row.source, row.to_state]),
    [
      ["helix", "prepared"],
      ["runner", "accepted"],
      ["runner", "failed"],
      ["helix", "failed"],
      ["helix", "queued"],
      ["runner", "queued"],
      ["runner", "active"],
    ],
  );
});

test("Harbor does not reserve credit or call the runner for a non-current prepared job", async (t) => {
  const modules = await loadModules(t);
  const fixture = await preparedReservationFixture(t, modules, {
    projectId: "harbor-stale-accept-project",
    jobId: "harbor-stale-accept-job",
    userId: "harbor-stale-accept-user",
    releaseId: "11112222-3333-4444-8555-666677778888",
    requestId: "22223333-4444-4555-8666-777788889999",
    gateRequestId: "33334444-5555-4666-8777-888899990000",
  });
  await fixture.pg.query("update projects set current_build_job_id = null where id = $1", [
    fixture.projectId,
  ]);
  let providerCalls = 0;
  await assert.rejects(
    modules.release.acceptHarborProductionRelease({
      sql: fixture.sql,
      row: fixture.prepared,
      artifact: fixture.artifact,
      provider: {
        execute: async () => {
          providerCalls += 1;
          throw new Error("stale jobs must not reach the runner");
        },
      },
      creditCost: 50,
    }),
    /HARBOR_PRODUCTION_ACTION_IN_PROGRESS/,
  );
  assert.equal(providerCalls, 0);
  const row = await modules.release.loadHarborProductionRelease({
    sql: fixture.sql,
    releaseId: fixture.prepared.id,
    projectId: fixture.projectId,
    userId: fixture.userId,
  });
  assert.equal(row.state, "prepared");
  assert.equal(row.credit_reserved_at, null);
  const account = await fixture.pg.query(
    `select profile.credits_balance, project.credits_spent
     from profiles as profile
     join projects as project on project.user_id = profile.user_id
     where profile.user_id = $1 and project.id = $2`,
    [fixture.userId, fixture.projectId],
  );
  assert.deepEqual(account.rows[0], { credits_balance: 100, credits_spent: 0 });
  const ledger = await fixture.pg.query("select id from credit_ledger where user_id = $1", [
    fixture.userId,
  ]);
  assert.deepEqual(ledger.rows, []);
});

test("Harbor retry-limit terminalization cannot refund a live accept claim", async (t) => {
  const modules = await loadModules(t);
  const fixture = await preparedReservationFixture(t, modules, {
    projectId: "harbor-live-claim-project",
    jobId: "harbor-live-claim-job",
    userId: "harbor-live-claim-user",
    releaseId: "15151515-1515-4151-8151-151515151515",
    requestId: "16161616-1616-4161-8161-161616161616",
    gateRequestId: "17171717-1717-4171-8171-171717171717",
  });
  await fixture.pg.query(
    "update harbor_production_releases set action_attempt_count = 63 where id = $1",
    [fixture.prepared.id],
  );
  let unblock;
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const blocked = new Promise((resolve) => {
    unblock = resolve;
  });
  const options = providerOptions(modules.runner, () => "accepted");
  const provider = modules.runner.createAuthenticatedHarborProductionProvider({
    ...options,
    fetch: async (...args) => {
      markStarted();
      await blocked;
      return options.fetch(...args);
    },
  });
  const first = modules.release.acceptHarborProductionRelease({
    sql: fixture.sql,
    row: fixture.prepared,
    artifact: fixture.artifact,
    provider,
    creditCost: 50,
  });
  await started;
  const claimed = await modules.release.loadHarborProductionRelease({
    sql: fixture.sql,
    releaseId: fixture.prepared.id,
    projectId: fixture.projectId,
    userId: fixture.userId,
  });
  assert.equal(claimed.action_attempt_count, 64);
  assert.ok(claimed.action_claim_token);
  let secondProviderCalls = 0;
  await assert.rejects(
    modules.release.acceptHarborProductionRelease({
      sql: fixture.sql,
      row: claimed,
      artifact: fixture.artifact,
      provider: {
        execute: async () => {
          secondProviderCalls += 1;
          throw new Error("a live claim must be fenced");
        },
      },
      creditCost: 50,
    }),
    /HARBOR_PRODUCTION_ACTION_IN_PROGRESS/,
  );
  assert.equal(secondProviderCalls, 0);
  const during = await modules.release.loadHarborProductionRelease({
    sql: fixture.sql,
    releaseId: fixture.prepared.id,
    projectId: fixture.projectId,
    userId: fixture.userId,
  });
  assert.equal(during.state, "prepared");
  assert.equal(during.credit_refunded_at, null);
  unblock();
  const accepted = await first;
  assert.equal(accepted.state, "accepted");
  const account = await fixture.pg.query(
    `select profile.credits_balance, project.credits_spent
     from profiles as profile
     join projects as project on project.user_id = profile.user_id
     where profile.user_id = $1 and project.id = $2`,
    [fixture.userId, fixture.projectId],
  );
  assert.deepEqual(account.rows[0], { credits_balance: 50, credits_spent: 50 });
  const ledger = await fixture.pg.query(
    "select credits, action from credit_ledger where user_id = $1 order by id",
    [fixture.userId],
  );
  assert.deepEqual(ledger.rows, [{ credits: -50, action: "host" }]);
});

test("Harbor refunds a pre-accept reservation after a non-retryable runner failure", async (t) => {
  const modules = await loadModules(t);
  const projectId = "harbor-refund-project-1";
  const jobId = "harbor-refund-job-1";
  const userId = "harbor-refund-user-1";
  const { artifact, sealed } = await sealedArtifact(modules, productionFiles(), {
    projectId,
    jobId,
  });
  const { pg, sql } = await migratedDatabase(t);
  await pg.query("insert into profiles (user_id, credits_balance) values ($1, 100)", [userId]);
  await pg.query(
    `insert into projects (id, user_id, title, prompt, build_level)
     values ($1, $2, 'Harbor Refund', 'Fail before acceptance', 'production')`,
    [projectId, userId],
  );
  await pg.query(
    `insert into build_jobs (
       id, project_id, user_id, payload, idempotency_key, request_fingerprint,
       pipeline_version, stage, queue_status, artifact_sha256
     ) values ($1, $2, $3, $4, $5, $6, 'helix-v3', 'production_finalized',
               'approved', $7)`,
    [
      jobId,
      projectId,
      userId,
      JSON.stringify({ buildLevel: "production", workspace: sealed.manifest }),
      "harbor-refund-build-idempotency",
      "7".repeat(64),
      HUMAN_GATE_SHA,
    ],
  );
  await pg.query("update projects set current_build_job_id = $1 where id = $2", [jobId, projectId]);
  await pg.query(
    `insert into build_job_gate_events (
       job_id, project_id, actor_type, actor_user_id, decision, from_status,
       to_status, request_id, artifact_sha256
     ) values ($1, $2, 'user', $3, 'approve', 'awaiting_human_approval',
               'approved', $4, $5)`,
    [jobId, projectId, userId, "88888888-8888-4888-8888-888888888888", HUMAN_GATE_SHA],
  );
  const prepared = await modules.release.prepareHarborProductionRelease({
    sql,
    releaseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    projectId,
    buildJobId: jobId,
    userId,
    artifact,
  });
  let providerCalls = 0;
  const rejectedProvider = {
    execute: async () => {
      providerCalls += 1;
      throw new modules.runner.HarborProductionRunnerError(
        "HARBOR_PRODUCTION_RUNNER_RESPONSE_INVALID",
      );
    },
  };
  await assert.rejects(
    modules.release.acceptHarborProductionRelease({
      sql,
      row: prepared,
      artifact,
      provider: rejectedProvider,
      creditCost: 50,
    }),
    /HARBOR_PRODUCTION_RUNNER_RESPONSE_INVALID/,
  );
  assert.equal(providerCalls, 1);
  const terminal = await modules.release.loadHarborProductionRelease({
    sql,
    releaseId: prepared.id,
    projectId,
    userId,
  });
  assert.ok(terminal);
  assert.equal(terminal.state, "retry_exhausted");
  assert.equal(terminal.credit_cost, 50);
  assert.equal(terminal.credit_reserved_at !== null, true);
  assert.equal(terminal.credit_refunded_at !== null, true);
  assert.equal(terminal.deploy_id, null);
  assert.equal(terminal.runner_release_id, null);
  assert.equal(terminal.provider, null);
  assert.equal(terminal.provider_deployment_id, null);
  assert.equal(terminal.public_url, null);
  assert.equal(terminal.rollback_ref, null);
  const account = await pg.query(
    `select profile.credits_balance, project.credits_spent
     from profiles as profile
     join projects as project on project.user_id = profile.user_id
     where profile.user_id = $1 and project.id = $2`,
    [userId, projectId],
  );
  assert.deepEqual(account.rows[0], { credits_balance: 100, credits_spent: 0 });
  const ledger = await pg.query(
    `select credits, action from credit_ledger
     where user_id = $1 order by id`,
    [userId],
  );
  assert.deepEqual(ledger.rows, [
    { credits: -50, action: "host" },
    { credits: 50, action: "refund" },
  ]);
});

test("Harbor recovers one expired reservation once across concurrent sweepers", async (t) => {
  const modules = await loadModules(t);
  const fixture = await preparedReservationFixture(t, modules, {
    projectId: "harbor-sweep-recover-project",
    jobId: "harbor-sweep-recover-job",
    userId: "harbor-sweep-recover-user",
    releaseId: "10101010-1010-4010-8010-101010101010",
    requestId: "20202020-2020-4020-8020-202020202020",
    gateRequestId: "30303030-3030-4030-8030-303030303030",
  });
  await leaveRetryableReservation(modules, fixture);

  let recoveryCalls = 0;
  const options = providerOptions(modules.runner, () => "accepted");
  const provider = modules.runner.createAuthenticatedHarborProductionProvider({
    ...options,
    fetch: async (...args) => {
      recoveryCalls += 1;
      return options.fetch(...args);
    },
  });
  const results = await Promise.all([
    modules.release.sweepExpiredHarborProductionReservations({
      sql: fixture.sql,
      provider,
      limit: 1,
    }),
    modules.release.sweepExpiredHarborProductionReservations({
      sql: fixture.sql,
      provider,
      limit: 1,
    }),
  ]);
  assert.equal(recoveryCalls, 1, "the atomic recovery claim permits one runner call");
  assert.equal(
    results.reduce((total, result) => total + result.accepted, 0),
    1,
  );
  assert.equal(
    results.reduce((total, result) => total + result.failed, 0),
    0,
  );
  assert.deepEqual(
    results.flatMap((result) => result.errors),
    [],
  );

  const recovered = await modules.release.loadHarborProductionRelease({
    sql: fixture.sql,
    releaseId: fixture.prepared.id,
    projectId: fixture.projectId,
    userId: fixture.userId,
  });
  assert.ok(recovered);
  assert.equal(recovered.state, "accepted");
  assert.equal(recovered.package_base64, null);
  assert.equal(recovered.provider, "offline_provider");
  assert.equal(recovered.provider_deployment_id, null);
  assert.equal(recovered.public_url, null);
  assert.ok(recovered.deploy_id);

  const account = await fixture.pg.query(
    `select profile.credits_balance, project.credits_spent
     from profiles as profile
     join projects as project on project.user_id = profile.user_id
     where profile.user_id = $1 and project.id = $2`,
    [fixture.userId, fixture.projectId],
  );
  assert.deepEqual(account.rows[0], { credits_balance: 50, credits_spent: 50 });
  const ledger = await fixture.pg.query(
    "select credits, action from credit_ledger where user_id = $1 order by id",
    [fixture.userId],
  );
  assert.deepEqual(ledger.rows, [{ credits: -50, action: "host" }]);
});

test("Harbor refunds an expired reservation once when runner configuration disappears", async (t) => {
  const modules = await loadModules(t);
  const fixture = await preparedReservationFixture(t, modules, {
    projectId: "harbor-sweep-refund-project",
    jobId: "harbor-sweep-refund-job",
    userId: "harbor-sweep-refund-user",
    releaseId: "40404040-4040-4040-8040-404040404040",
    requestId: "50505050-5050-4050-8050-505050505050",
    gateRequestId: "60606060-6060-4060-8060-606060606060",
  });
  await leaveRetryableReservation(modules, fixture);
  await fixture.pg.query(
    "update harbor_production_releases set action_attempt_count = 64 where id = $1",
    [fixture.prepared.id],
  );

  const result = await modules.sweeper.runConfiguredHarborProductionSweep({
    environment: {
      HELIX_HARBOR_SWEEPER_ENABLED: "true",
      HELIX_HARBOR_SWEEPER_DISPATCH_SECRET: "D".repeat(32),
    },
    sql: fixture.sql,
    limit: 1,
  });
  assert.deepEqual(result, {
    listed: 1,
    accepted: 0,
    refunded: 1,
    skipped: 0,
    failed: 0,
    errors: [],
  });

  const terminal = await modules.release.loadHarborProductionRelease({
    sql: fixture.sql,
    releaseId: fixture.prepared.id,
    projectId: fixture.projectId,
    userId: fixture.userId,
  });
  assert.ok(terminal);
  assert.equal(terminal.state, "retry_exhausted");
  assert.equal(terminal.retry_count, 1, "expiry must not falsify the runner retry counter");
  assert.equal(terminal.last_error_code, "HARBOR_PRODUCTION_RESERVATION_EXPIRED");
  assert.equal(terminal.credit_refunded_at !== null, true);
  assert.equal(terminal.package_base64, null);
  assert.equal(terminal.deploy_id, null);
  assert.equal(terminal.runner_release_id, null);
  assert.equal(terminal.provider, null);
  assert.equal(terminal.provider_deployment_id, null);
  assert.equal(terminal.public_url, null);
  assert.equal(terminal.rollback_ref, null);

  const account = await fixture.pg.query(
    `select profile.credits_balance, project.credits_spent
     from profiles as profile
     join projects as project on project.user_id = profile.user_id
     where profile.user_id = $1 and project.id = $2`,
    [fixture.userId, fixture.projectId],
  );
  assert.deepEqual(account.rows[0], { credits_balance: 100, credits_spent: 0 });
  const ledger = await fixture.pg.query(
    "select credits, action from credit_ledger where user_id = $1 order by id",
    [fixture.userId],
  );
  assert.deepEqual(ledger.rows, [
    { credits: -50, action: "host" },
    { credits: 50, action: "refund" },
  ]);
  const deploys = await fixture.pg.query(
    "select provider, provider_deploy_id, url from deploys where project_id = $1",
    [fixture.projectId],
  );
  assert.deepEqual(deploys.rows, []);

  const replay = await modules.sweeper.runConfiguredHarborProductionSweep({
    environment: {
      HELIX_HARBOR_SWEEPER_ENABLED: "true",
      HELIX_HARBOR_SWEEPER_DISPATCH_SECRET: "D".repeat(32),
    },
    sql: fixture.sql,
    limit: 1,
  });
  assert.equal(replay.listed, 0);
  const ledgerAfterReplay = await fixture.pg.query(
    "select credits, action from credit_ledger where user_id = $1 order by id",
    [fixture.userId],
  );
  assert.deepEqual(ledgerAfterReplay.rows, ledger.rows);
});

test("Harbor rejects a tampered persisted recovery package before runner I/O", async (t) => {
  const modules = await loadModules(t);
  const fixture = await preparedReservationFixture(t, modules, {
    projectId: "harbor-sweep-tamper-project",
    jobId: "harbor-sweep-tamper-job",
    userId: "harbor-sweep-tamper-user",
    releaseId: "70707070-7070-4070-8070-707070707070",
    requestId: "80808080-8080-4080-8080-808080808080",
    gateRequestId: "90909090-9090-4090-8090-909090909090",
  });
  await leaveRetryableReservation(modules, fixture);
  await fixture.pg.query(
    "update harbor_production_releases set package_base64 = 'AAAA' where id = $1",
    [fixture.prepared.id],
  );
  let providerCalls = 0;
  const result = await modules.release.sweepExpiredHarborProductionReservations({
    sql: fixture.sql,
    provider: {
      execute: async () => {
        providerCalls += 1;
        throw new Error("runner must not see corrupt bytes");
      },
    },
    limit: 1,
  });
  assert.equal(providerCalls, 0);
  assert.equal(result.refunded, 1);
  assert.equal(result.failed, 0);
  const terminal = await modules.release.loadHarborProductionRelease({
    sql: fixture.sql,
    releaseId: fixture.prepared.id,
    projectId: fixture.projectId,
    userId: fixture.userId,
  });
  assert.equal(terminal.state, "retry_exhausted");
  assert.equal(terminal.provider, null);
  assert.equal(terminal.deploy_id, null);
});

test("Harbor refunds rather than re-accepting an expired superseded prepared release", async (t) => {
  const modules = await loadModules(t);
  const fixture = await preparedReservationFixture(t, modules, {
    projectId: "harbor-sweep-superseded-project",
    jobId: "harbor-sweep-superseded-job",
    userId: "harbor-sweep-superseded-user",
    releaseId: "12121212-1212-4121-8121-121212121212",
    requestId: "13131313-1313-4131-8131-131313131313",
    gateRequestId: "14141414-1414-4141-8141-141414141414",
  });
  await leaveRetryableReservation(modules, fixture);
  await fixture.pg.query("update projects set current_build_job_id = null where id = $1", [
    fixture.projectId,
  ]);
  let providerCalls = 0;
  const result = await modules.release.sweepExpiredHarborProductionReservations({
    sql: fixture.sql,
    provider: {
      execute: async () => {
        providerCalls += 1;
        throw new Error("superseded prepared releases must not reach the runner");
      },
    },
    limit: 1,
  });
  assert.equal(providerCalls, 0);
  assert.equal(result.refunded, 1);
  const terminal = await modules.release.loadHarborProductionRelease({
    sql: fixture.sql,
    releaseId: fixture.prepared.id,
    projectId: fixture.projectId,
    userId: fixture.userId,
  });
  assert.equal(terminal.state, "retry_exhausted");
  assert.equal(terminal.provider, null);
  assert.equal(terminal.deploy_id, null);
  const account = await fixture.pg.query(
    `select profile.credits_balance, project.credits_spent
     from profiles as profile
     join projects as project on project.user_id = profile.user_id
     where profile.user_id = $1 and project.id = $2`,
    [fixture.userId, fixture.projectId],
  );
  assert.deepEqual(account.rows[0], { credits_balance: 100, credits_spent: 0 });
});
