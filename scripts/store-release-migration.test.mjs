import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const storeMigrationUrl = new URL("../migrations/0022_store_release_pipeline.sql", import.meta.url);
const productionMigrationUrl = new URL(
  "../migrations/0025_store_production_provenance.sql",
  import.meta.url,
);
const deploySourceUrl = new URL("../src/lib/server/deploy.ts", import.meta.url);

async function deploySqlAfter(marker) {
  const source = await readFile(deploySourceUrl, "utf8");
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing deploy SQL marker: ${marker}`);
  const templateStart = source.indexOf("`", markerIndex + marker.length);
  const templateEnd = source.indexOf("`", templateStart + 1);
  assert.notEqual(templateStart, -1, `Missing SQL template after ${marker}`);
  assert.notEqual(templateEnd, -1, `Unterminated SQL template after ${marker}`);
  return source.slice(templateStart + 1, templateEnd);
}

async function database() {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec(`
    create table projects (
      id text primary key,
      user_id text,
      current_build_job_id text
    );
    create table build_jobs (
      id text primary key,
      project_id text,
      user_id text,
      queue_status text,
      artifact_sha256 text
    );
    create table build_job_gate_events (
      job_id text,
      decision text,
      artifact_sha256 text
    );
    create table deploys (
      id text primary key,
      status text not null default 'prepared',
      log text not null default '[]',
      completed_at timestamptz,
      error_code text,
      error_message text,
      updated_at timestamptz not null default now()
    );
  `);
  return pg;
}

const prototypeDescriptor = {
  kind: "helix_store_artifact_descriptor",
  schemaVersion: "1.0.0",
  sourceBuildLevel: "prototype",
  artifactKind: "legacy_web_to_native_wrapper",
  packagingProfile: "legacy_expo_wrapper_v1",
  nativeImplementation: false,
  runtimeProfile: "prototype_preview",
  sourcePreviewSha256: null,
  sourceWorkspaceSha256: null,
  packageManifestSha256: null,
};

test("Store release migration is rerunnable and preserves fail-closed state evidence", async (t) => {
  const pg = await database();
  t.after(() => pg.close());
  const storeMigration = await readFile(storeMigrationUrl, "utf8");
  const productionMigration = await readFile(productionMigrationUrl, "utf8");
  await pg.exec(storeMigration);
  await pg.exec(storeMigration);
  await pg.exec(productionMigration);
  await pg.exec(productionMigration);

  await pg.exec(`
    insert into projects (id) values ('project-1');
    insert into build_jobs (id) values ('build-1');
    insert into deploys (id) values ('deploy-1');
  `);
  const hash = "a".repeat(64);
  await pg.query(
    `insert into store_release_jobs (
       id, project_id, build_job_id, user_id, platform, destination,
       request_id, idempotency_key, source_artifact_sha256, package_sha256,
       package_bytes, package_filename, app_identifier, eas_project_id,
       apple_team_id, state
     ) values (
       'release-1', 'project-1', 'build-1', 'user-1', 'ios', 'testflight',
       'request-1', 'idempotency-key-1', $1, $1,
       128, 'ios-source.zip', 'com.kreluna.contract',
       '11111111-1111-4111-8111-111111111111', 'AB12C3D4E5', 'prepared'
     )`,
    [hash],
  );

  await assert.rejects(
    pg.query("update store_release_jobs set state = 'dispatch_accepted' where id = 'release-1'"),
    /store_release_jobs_check/i,
  );
  await pg.query(
    `update store_release_jobs
     set state = 'dispatch_accepted', runner_job_id = 'runner-job-1',
         accepted_at = now(), credential_evidence = '{"mappingAccepted":true}'::jsonb,
         provider_evidence = '{"state":"dispatch_accepted"}'::jsonb
     where id = 'release-1'`,
  );
  const persisted = await pg.query(
    `select state, runner_job_id, credential_evidence, provider_evidence
     from store_release_jobs where id = 'release-1'`,
  );
  assert.equal(persisted.rows[0].state, "dispatch_accepted");
  assert.equal(persisted.rows[0].runner_job_id, "runner-job-1");
  assert.equal(persisted.rows[0].credential_evidence.mappingAccepted, true);

  const legacyProvenance = await pg.query(
    `select source_build_level, source_workspace_sha256,
            package_manifest_sha256, packaging_profile
     from store_release_jobs where id = 'release-1'`,
  );
  assert.deepEqual(legacyProvenance.rows[0], {
    source_build_level: "prototype",
    source_workspace_sha256: null,
    package_manifest_sha256: null,
    packaging_profile: "legacy_expo_wrapper_v1",
  });
  await assert.rejects(
    pg.query(
      `update store_release_jobs
       set source_build_level = 'production'
       where id = 'release-1'`,
    ),
    /store_release_jobs_source_provenance_ck/i,
  );
  await pg.query(
    `update store_release_jobs
     set source_build_level = 'production',
         source_workspace_sha256 = $1,
         package_manifest_sha256 = $2,
         packaging_profile = 'orbit_expo_static_wrapper_v1'
     where id = 'release-1'`,
    ["b".repeat(64), "c".repeat(64)],
  );
  await pg.query(
    `insert into store_release_jobs (
       id, project_id, build_job_id, user_id, platform, destination,
       request_id, idempotency_key, source_artifact_sha256, package_sha256,
       package_bytes, package_filename, app_identifier, eas_project_id,
       apple_team_id, state, source_build_level, source_workspace_sha256,
       package_manifest_sha256, packaging_profile
     ) values (
       'release-production', 'project-1', 'build-1', 'user-1', 'android',
       'play_internal', 'request-production', 'idempotency-production', $1, $1,
       512, 'android-production-source.zip', 'com.kreluna.production',
       '22222222-2222-4222-8222-222222222222', null, 'prepared',
       'production', $2, $3, 'orbit_expo_static_wrapper_v1'
     )`,
    [hash, "e".repeat(64), "f".repeat(64)],
  );
  const productionProvenance = await pg.query(
    `select source_build_level, source_workspace_sha256,
            package_manifest_sha256, packaging_profile
     from store_release_jobs where id = 'release-production'`,
  );
  assert.deepEqual(productionProvenance.rows[0], {
    source_build_level: "production",
    source_workspace_sha256: "e".repeat(64),
    package_manifest_sha256: "f".repeat(64),
    packaging_profile: "orbit_expo_static_wrapper_v1",
  });
  const productionDescriptor = {
    kind: "helix_store_artifact_descriptor",
    schemaVersion: "1.0.0",
    sourceBuildLevel: "production",
    artifactKind: "web_to_native_wrapper",
    packagingProfile: "orbit_expo_static_wrapper_v1",
    nativeImplementation: false,
    runtimeProfile: "static_site",
    sourcePreviewSha256: hash,
    sourceWorkspaceSha256: "e".repeat(64),
    packageManifestSha256: "f".repeat(64),
  };
  const productionReport = {
    state: "distributed",
    workflowRunId: "workflow-production",
    workflowBuildJobId: "workflow-build-production",
    workflowDistributionJobId: "workflow-submit-production",
    providerBuildId: "provider-build-production",
    providerSubmissionId: "provider-submission-production",
    providerReleaseId: "play-release-production",
    artifactDescriptor: productionDescriptor,
    providerEvidence: {
      workflowStatus: "success",
      buildStatus: "succeeded",
      submissionStatus: "succeeded",
    },
  };
  await pg.query(
    `update store_release_jobs
     set state = 'distributed', runner_job_id = 'runner-production',
         workflow_run_id = 'workflow-production',
         provider_build_id = 'provider-build-production',
         provider_submission_id = 'provider-submission-production',
         provider_release_id = 'play-release-production', play_track = 'internal',
         credential_evidence = '{"mappingAccepted":true}'::jsonb,
         provider_evidence = $1::jsonb, accepted_at = now(), completed_at = now()
     where id = 'release-production'`,
    [JSON.stringify(productionReport)],
  );
  await assert.rejects(
    pg.query(
      `update store_release_jobs
       set provider_evidence = jsonb_set(
         provider_evidence,
         '{artifactDescriptor,sourceWorkspaceSha256}',
         to_jsonb($1::text)
       )
       where id = 'release-production'`,
      ["0".repeat(64)],
    ),
    /store_release_jobs_distributed_artifact_descriptor_ck/i,
  );

  await pg.exec(`
    insert into store_release_events (
      release_id, event_key, from_state, to_state, source, evidence
    ) values (
      'release-1', 'accepted:hash', 'prepared', 'dispatch_accepted', 'runner',
      '{"signed":true}'::jsonb
    );
    insert into store_release_events (
      release_id, event_key, from_state, to_state, source, evidence
    ) values (
      'release-1', 'accepted:hash', 'prepared', 'dispatch_accepted', 'runner',
      '{"signed":true}'::jsonb
    ) on conflict (release_id, event_key) do nothing;
  `);
  const events = await pg.query(
    "select count(*)::int as count from store_release_events where release_id = 'release-1'",
  );
  assert.equal(events.rows[0].count, 1);

  await assert.rejects(
    pg.query(
      `insert into store_release_jobs (
         id, project_id, build_job_id, user_id, platform, destination,
         request_id, idempotency_key, source_artifact_sha256, package_sha256,
         package_bytes, package_filename, app_identifier, eas_project_id,
         apple_team_id, state
       ) values (
         'release-invalid', 'project-1', 'build-1', 'user-1', 'android',
         'play_internal', 'request-invalid', 'idempotency-invalid', $1, $1,
         128, 'android-source.zip', 'com.kreluna.contract',
         '11111111-1111-4111-8111-111111111111', 'AB12C3D4E5', 'prepared'
       )`,
      [hash],
    ),
    /store_release_jobs_check/i,
  );
});

test("Store Production migration demotes unsupported distributed claims atomically", async (t) => {
  const pg = await database();
  t.after(() => pg.close());
  const storeMigration = await readFile(storeMigrationUrl, "utf8");
  const productionMigration = await readFile(productionMigrationUrl, "utf8");
  await pg.exec(storeMigration);
  // Model a database that briefly received Production provenance columns
  // before the final 0025 descriptor-binding CHECK was installed.
  await pg.exec(`
    alter table store_release_jobs
      add column source_build_level text not null default 'prototype';
    alter table store_release_jobs add column source_workspace_sha256 text;
    alter table store_release_jobs add column package_manifest_sha256 text;
    alter table store_release_jobs
      add column packaging_profile text not null default 'legacy_expo_wrapper_v1';
  `);
  await pg.exec(`
    insert into projects (id) values ('project-legacy');
    insert into build_jobs (id) values ('build-legacy');
    insert into deploys (id, status, log, completed_at)
      values (
        'deploy-legacy', 'distributed',
        '[{"id":"upload","status":"done","detail":"unsupported completion claim"}]',
        now()
      );
    insert into deploys (id, status, log, completed_at)
      values (
        'deploy-production-mismatch', 'distributed',
        '[{"id":"upload","status":"done","detail":"mismatched artifact"}]',
        now()
      );
  `);
  const hash = "d".repeat(64);
  await pg.query(
    `insert into store_release_jobs (
       id, project_id, build_job_id, deploy_id, user_id, platform, destination,
       request_id, idempotency_key, source_artifact_sha256, package_sha256,
       package_bytes, package_filename, app_identifier, eas_project_id,
       apple_team_id, state, runner_job_id, workflow_run_id, provider_build_id,
       credential_evidence, provider_evidence, accepted_at, completed_at
     ) values (
       'release-legacy', 'project-legacy', 'build-legacy', 'deploy-legacy',
       'user-legacy', 'ios', 'testflight', 'request-legacy',
       'idempotency-legacy', $1, $1, 256, 'legacy-ios-source.zip',
       'com.kreluna.legacy', '11111111-1111-4111-8111-111111111111',
       'AB12C3D4E5', 'distributed', 'runner-legacy', 'workflow-legacy',
       'build-provider-legacy', '{"mappingAccepted":true}'::jsonb,
       '{"state":"distributed"}'::jsonb, now(), now()
     )`,
    [hash],
  );
  await pg.query(
    `insert into store_release_jobs (
       id, project_id, build_job_id, deploy_id, user_id, platform, destination,
       request_id, idempotency_key, source_artifact_sha256, package_sha256,
       package_bytes, package_filename, app_identifier, eas_project_id,
       apple_team_id, state, runner_job_id, workflow_run_id, provider_build_id,
       provider_submission_id, provider_release_id, credential_evidence,
       provider_evidence, accepted_at, completed_at, source_build_level,
       source_workspace_sha256, package_manifest_sha256, packaging_profile
     ) values (
       'release-production-mismatch', 'project-legacy', 'build-legacy',
       'deploy-production-mismatch', 'user-legacy', 'ios', 'testflight',
       'request-production-mismatch', 'idempotency-production-mismatch',
       $1, $1, 512, 'production-ios-wrapper.zip', 'com.kreluna.production',
       '22222222-2222-4222-8222-222222222222', 'AB12C3D4E5', 'distributed',
       'runner-production-mismatch', 'workflow-production-mismatch',
       'build-production-mismatch', 'submission-production-mismatch', null,
       '{"mappingAccepted":true}'::jsonb, $2::jsonb, now(), now(),
       'production', $3, $4, 'orbit_expo_static_wrapper_v1'
     )`,
    [
      hash,
      JSON.stringify({
        state: "distributed",
        workflowRunId: "workflow-production-mismatch",
        workflowBuildJobId: "workflow-build-production-mismatch",
        workflowDistributionJobId: "workflow-submit-production-mismatch",
        providerBuildId: "build-production-mismatch",
        providerSubmissionId: "submission-production-mismatch",
        providerReleaseId: null,
        artifactDescriptor: {
          sourceBuildLevel: "production",
          sourcePreviewSha256: "0".repeat(64),
          sourceWorkspaceSha256: "b".repeat(64),
          packageManifestSha256: "c".repeat(64),
          packagingProfile: "orbit_expo_static_wrapper_v1",
        },
        providerEvidence: {
          workflowStatus: "success",
          buildStatus: "succeeded",
          submissionStatus: "succeeded",
        },
      }),
      "b".repeat(64),
      "c".repeat(64),
    ],
  );

  await pg.exec(productionMigration);
  await pg.exec(productionMigration);

  const release = await pg.query(
    `select state, completed_at, last_error_code, last_error_retryable,
            provider_evidence, source_build_level, packaging_profile
     from store_release_jobs where id = 'release-legacy'`,
  );
  assert.equal(release.rows[0].state, "action_required");
  assert.equal(release.rows[0].completed_at, null);
  assert.equal(release.rows[0].last_error_code, "STORE_DISTRIBUTED_PROVIDER_EVIDENCE_INCOMPLETE");
  assert.equal(release.rows[0].last_error_retryable, false);
  assert.deepEqual(release.rows[0].provider_evidence, { state: "distributed" });
  assert.equal(release.rows[0].source_build_level, "prototype");
  assert.equal(release.rows[0].packaging_profile, "legacy_expo_wrapper_v1");

  const deploy = await pg.query(
    `select status, log, completed_at, error_code
     from deploys where id = 'deploy-legacy'`,
  );
  assert.equal(deploy.rows[0].status, "action_required");
  assert.equal(deploy.rows[0].completed_at, null);
  assert.equal(deploy.rows[0].error_code, "STORE_DISTRIBUTED_PROVIDER_EVIDENCE_INCOMPLETE");
  const migrationLog = JSON.parse(deploy.rows[0].log);
  assert.deepEqual(migrationLog.map((step) => step.status), ["blocked"]);
  assert.doesNotMatch(deploy.rows[0].log, /unsupported completion claim|"status":"done"/);
  const events = await pg.query(
    `select count(*)::int as count
     from store_release_events
     where release_id = 'release-legacy'
       and event_key = 'migration:0025:provider-evidence-incomplete'`,
  );
  assert.equal(events.rows[0].count, 1);

  const mismatchedProduction = await pg.query(
    `select release.state, release.last_error_code, deploy.status, deploy.log
     from store_release_jobs as release
     join deploys as deploy on deploy.id = release.deploy_id
     where release.id = 'release-production-mismatch'`,
  );
  assert.equal(mismatchedProduction.rows[0].state, "action_required");
  assert.equal(
    mismatchedProduction.rows[0].last_error_code,
    "STORE_DISTRIBUTED_PROVIDER_EVIDENCE_INCOMPLETE",
  );
  assert.equal(mismatchedProduction.rows[0].status, "action_required");
  assert.deepEqual(
    JSON.parse(mismatchedProduction.rows[0].log).map((step) => step.status),
    ["blocked"],
  );

  await assert.rejects(
    pg.query(
      `update store_release_jobs
       set state = 'distributed'
       where id = 'release-legacy'`,
    ),
    /store_release_jobs_distributed_evidence_ck/i,
  );

  await pg.query(
    `update store_release_jobs
     set state = 'distributed',
         provider_submission_id = 'submission-provider-verified',
         provider_release_id = null,
         completed_at = now(),
         last_error_code = null,
         last_error_message = null,
         last_error_retryable = null,
         provider_evidence = jsonb_build_object(
           'state', 'distributed',
           'workflowRunId', workflow_run_id,
           'workflowBuildJobId', 'workflow-build-job-verified',
           'workflowDistributionJobId', 'workflow-submit-job-verified',
           'providerBuildId', provider_build_id,
           'providerSubmissionId', 'submission-provider-verified',
           'providerReleaseId', null,
           'providerEvidence', jsonb_build_object(
             'workflowStatus', 'success',
             'buildStatus', 'succeeded',
             'submissionStatus', 'succeeded'
           )
         )
     where id = 'release-legacy'`,
  );
  const verified = await pg.query(
    "select state, provider_release_id from store_release_jobs where id = 'release-legacy'",
  );
  assert.equal(verified.rows[0].state, "distributed");
  assert.equal(verified.rows[0].provider_release_id, null);

  await pg.query(
    `update store_release_jobs
     set state = 'action_required',
         platform = 'android',
         destination = 'play_internal',
         apple_team_id = null,
         completed_at = null
     where id = 'release-legacy'`,
  );
  await assert.rejects(
    pg.query(
      `update store_release_jobs
       set state = 'distributed', completed_at = now()
       where id = 'release-legacy'`,
    ),
    /store_release_jobs_distributed_evidence_ck/i,
  );
});

test("Store prepare SQL reuses an immutable legacy v1 Prototype release", async (t) => {
  const pg = await database();
  t.after(() => pg.close());
  await pg.exec(await readFile(storeMigrationUrl, "utf8"));
  await pg.exec(await readFile(productionMigrationUrl, "utf8"));
  const prepareSql = await deploySqlAfter("const preparedRows = await sql.query<StoreReleaseRow>");
  const sourceHash = "1".repeat(64);
  const packageHash = "2".repeat(64);
  const legacyKey = `store-release:v1:${"3".repeat(64)}`;
  await pg.exec(`
    insert into projects (id, user_id, current_build_job_id)
      values ('project-rollout', 'user-rollout', 'build-rollout');
    insert into build_jobs (
      id, project_id, user_id, queue_status, artifact_sha256
    ) values (
      'build-rollout', 'project-rollout', 'user-rollout', 'approved', '${sourceHash}'
    );
    insert into build_job_gate_events (job_id, decision, artifact_sha256)
      values ('build-rollout', 'approve', '${sourceHash}');
  `);
  await pg.query(
    `insert into store_release_jobs (
       id, project_id, build_job_id, user_id, platform, destination,
       request_id, idempotency_key, source_artifact_sha256, package_sha256,
       package_bytes, package_filename, app_identifier, eas_project_id,
       apple_team_id, state
     ) values (
       'release-v1', 'project-rollout', 'build-rollout', 'user-rollout',
       'ios', 'testflight', 'request-v1', $1, $2, $3, 256,
       'contract-ios-source.zip', 'com.kreluna.rollout',
       '33333333-3333-4333-8333-333333333333', 'AB12C3D4E5', 'prepared'
     )`,
    [legacyKey, sourceHash, packageHash],
  );

  const baseParameters = [
    "build-rollout",
    "project-rollout",
    "user-rollout",
    sourceHash,
    "release-v2-candidate",
    "ios",
    "testflight",
    "request-v2",
    `store-release:v2:${"4".repeat(64)}`,
    packageHash,
    256,
    "contract-ios-source.zip",
    "com.kreluna.rollout",
    "33333333-3333-4333-8333-333333333333",
    "AB12C3D4E5",
    "prototype",
    null,
    null,
    "legacy_expo_wrapper_v1",
    JSON.stringify(prototypeDescriptor),
    legacyKey,
  ];
  const replay = await pg.query(prepareSql, baseParameters);
  assert.deepEqual(
    replay.rows.map((row) => [row.id, row.idempotency_key]),
    [["release-v1", legacyKey]],
  );
  const reusedCount = await pg.query(
    "select count(*)::int as count from store_release_jobs where build_job_id = 'build-rollout'",
  );
  assert.equal(reusedCount.rows[0].count, 1);

  const changedPackageHash = "5".repeat(64);
  const changed = [...baseParameters];
  changed[4] = "release-v2-changed-package";
  changed[7] = "request-v2-changed-package";
  changed[8] = `store-release:v2:${"6".repeat(64)}`;
  changed[9] = changedPackageHash;
  const next = await pg.query(prepareSql, changed);
  assert.deepEqual(
    next.rows.map((row) => [row.id, row.idempotency_key]),
    [["release-v2-changed-package", changed[8]]],
  );
  const splitCount = await pg.query(
    "select count(*)::int as count from store_release_jobs where build_job_id = 'build-rollout'",
  );
  assert.equal(splitCount.rows[0].count, 2);
});

test("Store runner terminal failure SQL synchronizes release, deploy, log and polling", async (t) => {
  const pg = await database();
  t.after(() => pg.close());
  await pg.exec(await readFile(storeMigrationUrl, "utf8"));
  await pg.exec(await readFile(productionMigrationUrl, "utf8"));
  const failureSql = await deploySqlAfter("await input.sql.query(");
  const hash = "7".repeat(64);
  await pg.exec(`
    insert into projects (id) values ('project-failure');
    insert into build_jobs (id) values ('build-failure');
    insert into deploys (id, status, log)
      values ('deploy-nonretryable', 'dispatch_accepted', '[]'),
             ('deploy-exhausted', 'build_in_progress', '[]');
  `);
  for (const release of [
    {
      id: "release-nonretryable",
      deployId: "deploy-nonretryable",
      requestId: "request-nonretryable",
      key: "idempotency-nonretryable",
      state: "dispatch_accepted",
      retryCount: 0,
    },
    {
      id: "release-exhausted",
      deployId: "deploy-exhausted",
      requestId: "request-exhausted",
      key: "idempotency-exhausted",
      state: "build_in_progress",
      retryCount: 4,
    },
  ]) {
    await pg.query(
      `insert into store_release_jobs (
         id, project_id, build_job_id, deploy_id, user_id, platform, destination,
         request_id, idempotency_key, source_artifact_sha256, package_sha256,
         package_bytes, package_filename, app_identifier, eas_project_id,
         apple_team_id, state, runner_job_id, credential_evidence,
         provider_evidence, accepted_at, next_poll_at, retry_count
       ) values (
         $1, 'project-failure', 'build-failure', $2, 'user-failure',
         'ios', 'testflight', $3, $4, $5, $5, 256,
         'failure-ios-source.zip', 'com.kreluna.failure',
         '44444444-4444-4444-8444-444444444444', 'AB12C3D4E5', $6,
         $7, '{"mappingAccepted":true}'::jsonb, '{}'::jsonb, now(), now(), $8
       )`,
      [
        release.id,
        release.deployId,
        release.requestId,
        release.key,
        hash,
        release.state,
        `runner-${release.id}`,
        release.retryCount,
      ],
    );
  }

  const terminalLog = JSON.stringify([
    { id: "runner-verification", status: "blocked", detail: "operator action required" },
  ]);
  await pg.query(failureSql, [
    "release-nonretryable",
    "project-failure",
    "user-failure",
    false,
    "STORE_RUNNER_PACKAGE_MISMATCH",
    "runner-error:nonretryable",
    "dispatch_accepted",
    terminalLog,
  ]);
  await pg.query(failureSql, [
    "release-exhausted",
    "project-failure",
    "user-failure",
    true,
    "STORE_RUNNER_REQUEST_FAILED",
    "runner-error:exhausted",
    "build_in_progress",
    terminalLog,
  ]);

  const terminal = await pg.query(
    `select release.id, release.state, release.retry_count,
            release.last_error_retryable, release.next_poll_at,
            deploy.status, deploy.log
     from store_release_jobs as release
     join deploys as deploy on deploy.id = release.deploy_id
     order by release.id`,
  );
  assert.deepEqual(
    terminal.rows.map((row) => ({
      id: row.id,
      state: row.state,
      retryCount: row.retry_count,
      retryable: row.last_error_retryable,
      nextPollAt: row.next_poll_at,
      deployStatus: row.status,
      log: JSON.parse(row.log),
    })),
    [
      {
        id: "release-exhausted",
        state: "action_required",
        retryCount: 5,
        retryable: false,
        nextPollAt: null,
        deployStatus: "action_required",
        log: JSON.parse(terminalLog),
      },
      {
        id: "release-nonretryable",
        state: "action_required",
        retryCount: 1,
        retryable: false,
        nextPollAt: null,
        deployStatus: "action_required",
        log: JSON.parse(terminalLog),
      },
    ],
  );
});
