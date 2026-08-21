import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL("../migrations/0022_store_release_pipeline.sql", import.meta.url);

async function database() {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec(`
    create table projects (id text primary key);
    create table build_jobs (id text primary key);
    create table deploys (id text primary key);
  `);
  return pg;
}

test("Store release migration is rerunnable and preserves fail-closed state evidence", async (t) => {
  const pg = await database();
  t.after(() => pg.close());
  const migration = await readFile(migrationUrl, "utf8");
  await pg.exec(migration);
  await pg.exec(migration);

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
