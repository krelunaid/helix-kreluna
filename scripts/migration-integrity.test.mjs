import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationsUrl = new URL("../migrations/", import.meta.url);

async function migration(name) {
  return readFile(new URL(name, migrationsUrl), "utf8");
}

async function pglite() {
  const pg = new PGlite();
  await pg.waitReady;
  return pg;
}

test("the complete ordered migration chain applies on a clean database", async (t) => {
  const pg = await pglite();
  t.after(() => pg.close());
  const files = (await readdir(migrationsUrl)).filter((name) => name.endsWith(".sql")).sort();

  for (const name of files) await pg.exec(await migration(name));

  const tables = await pg.query(
    `select table_name
     from information_schema.tables
     where table_schema = 'public'
       and table_name in (
         'profiles', 'credit_ledger', 'public_apps', 'build_jobs',
         'build_job_attempts', 'build_job_gate_events',
         'build_job_quality_reports', 'build_job_browser_reports',
         'build_job_ai_calls', 'billing_customers',
         'billing_checkout_requests', 'billing_subscriptions',
         'payment_ledger', 'stripe_webhook_events',
         'stripe_invoice_receipts', 'stripe_financial_adjustment_reviews',
         'ai_response_cache', 'build_job_ai_cache_hits',
         'warden_observations', 'warden_alert_claims',
         'warden_alert_evidence', 'store_release_jobs',
         'augur_capacity_evidence', 'augur_capacity_ingestion_claims',
         'augur_capacity_ingestion_requests',
         'store_release_events'
       )
     order by table_name`,
  );
  assert.deepEqual(
    tables.rows.map((row) => row.table_name),
    [
      "ai_response_cache",
      "augur_capacity_evidence",
      "augur_capacity_ingestion_claims",
      "augur_capacity_ingestion_requests",
      "billing_checkout_requests",
      "billing_customers",
      "billing_subscriptions",
      "build_job_ai_cache_hits",
      "build_job_ai_calls",
      "build_job_attempts",
      "build_job_browser_reports",
      "build_job_gate_events",
      "build_job_quality_reports",
      "build_jobs",
      "credit_ledger",
      "payment_ledger",
      "profiles",
      "public_apps",
      "store_release_events",
      "store_release_jobs",
      "stripe_financial_adjustment_reviews",
      "stripe_invoice_receipts",
      "stripe_webhook_events",
      "warden_alert_claims",
      "warden_alert_evidence",
      "warden_observations",
    ],
  );

  // Recovery/manual reruns must not collide on named constraints or indexes.
  for (const name of [
    "0005_billing_integrity.sql",
    "0006_build_jobs_access.sql",
    "0007_public_app_integrity.sql",
    "0008_build_job_queue.sql",
    "0009_human_gate_release.sql",
    "0010_linked_build_enqueue.sql",
    "0011_release_state_transition.sql",
    "0012_quality_evidence.sql",
    "0013_github_token_encryption.sql",
    "0014_published_artifact_integrity.sql",
    "0015_browser_quality_evidence.sql",
    "0016_build_level_workspace.sql",
    "0017_ai_call_telemetry.sql",
    "0018_stripe_billing.sql",
    "0019_ai_response_cache.sql",
    "0020_pipeline_version.sql",
    "0021_warden_operations.sql",
    "0022_store_release_pipeline.sql",
    "0023_augur_capacity_evidence.sql",
  ]) {
    await pg.exec(await migration(name));
  }

  const githubColumns = await pg.query(
    `select column_name
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'profiles'
       and column_name like 'github_token%'
     order by column_name`,
  );
  assert.deepEqual(
    githubColumns.rows.map((row) => row.column_name),
    ["github_token", "github_token_ciphertext", "github_token_key_version", "github_token_nonce"],
  );

  const pipelinePayload = JSON.stringify({
    checkpoint: { pipelineVersion: "helix-v3", stage: "queued" },
  });
  const queued = await pg.query(
    `select * from enqueue_build_job(
       'pipeline-v3-job', null, null, null, null, $1,
       'pipeline-v3-request', $2, 2
     )`,
    [pipelinePayload, "c".repeat(64)],
  );
  assert.deepEqual(queued.rows[0], {
    job_id: "pipeline-v3-job",
    was_created: true,
  });
  const pipeline = await pg.query(
    "select pipeline_version from build_jobs where id = 'pipeline-v3-job'",
  );
  assert.equal(pipeline.rows[0].pipeline_version, "helix-v3");
  await assert.rejects(
    pg.query(
      `select * from enqueue_build_job(
         'pipeline-invalid-job', null, null, null, null, '{}',
         'pipeline-invalid-request', $1, 2
       )`,
      ["d".repeat(64)],
    ),
    /INVALID_JOB_PIPELINE_VERSION/,
  );

  await pg.query(
    "insert into profiles (user_id, plan, credits_balance) values ('github-user', 'free', 0)",
  );
  const legacyToken = `legacy-${randomUUID()}-${randomUUID()}`;
  await assert.rejects(
    pg.query("update profiles set github_token = $1 where user_id = 'github-user'", [legacyToken]),
    (error) => {
      const serialized = [
        String(error),
        error?.message,
        error?.detail,
        error?.hint,
        error?.where,
      ].join("\n");
      assert.match(serialized, /GITHUB_TOKEN_PLAINTEXT_FORBIDDEN/);
      assert.equal(serialized.includes(legacyToken), false);
      return true;
    },
  );
  await assert.rejects(
    pg.query("update profiles set github_login = 'partial' where user_id = 'github-user'"),
    /profiles_github_token_envelope_ck/,
  );
  await pg.query(
    `update profiles
     set github_login = 'encrypted',
         github_token_ciphertext = $1,
         github_token_nonce = $2,
         github_token_key_version = 'v1'
     where user_id = 'github-user'`,
    ["ciphertext".repeat(4), "nonce-value-1234"],
  );
});

test("the v3 migration preserves only fingerprint-bound in-flight v2 checkpoints", async (t) => {
  const pg = await pglite();
  t.after(() => pg.close());
  const files = (await readdir(migrationsUrl))
    .filter((name) => name.endsWith(".sql") && name < "0020_pipeline_version.sql")
    .sort();
  for (const name of files) await pg.exec(await migration(name));

  const requestFingerprint = "a".repeat(64);
  const preservedArtifacts = {
    plan: { title: "Preserved v2 plan" },
    html: "<!doctype html><html><body>preserved</body></html>",
    usedAi: true,
  };
  const resumablePayload = JSON.stringify({
    checkpoint: {
      pipelineVersion: "helix-v2",
      requestFingerprint,
      stage: "gems",
      artifacts: preservedArtifacts,
      gemIndex: 2,
    },
    gems: [{ id: "sable", name: "Sable", did: "Preserved v2 gem" }],
    files: { "legacy-v2.html": "must be rebuilt" },
    workspace: { kind: "untrusted-v2-workspace" },
    production: { legacy: true },
    html: preservedArtifacts.html,
    usedAi: true,
    quality: { legacy: true },
    score: { legacy: true },
    wire: "untrusted v2 release output",
    liveUrl: "https://untrusted.invalid",
    stores: { testersCode: "UNTRUSTED" },
  });
  const mismatchedPayload = JSON.stringify({
    checkpoint: {
      pipelineVersion: "helix-v2",
      requestFingerprint: "b".repeat(64),
      stage: "finalized",
      artifacts: preservedArtifacts,
      gemIndex: 1,
    },
    gems: [{ id: "wren", name: "Wren", did: "Must not authorize resume" }],
  });

  await pg.query(
    `select * from enqueue_build_job(
       'v2-resumable-job', null, null, null, null, $1,
       'v2-resumable-request', $2, 2
     )`,
    [resumablePayload, requestFingerprint],
  );
  await pg.query(
    `select * from enqueue_build_job(
       'v2-mismatch-job', null, null, null, null, $1,
       'v2-mismatch-request', $2, 2
     )`,
    [mismatchedPayload, requestFingerprint],
  );
  await pg.query(
    `select * from enqueue_build_job(
       'v2-running-job', null, null, null, null, $1,
       'v2-running-request', $2, 2
     )`,
    [resumablePayload, requestFingerprint],
  );
  await pg.query(
    `update build_jobs
     set queue_status = 'running', attempt_count = 1,
         locked_by = 'pre-v3-worker', lock_expires_at = now() + interval '10 minutes',
         heartbeat_at = now()
     where id = 'v2-running-job'`,
  );
  await pg.query(
    `insert into build_job_attempts (job_id, attempt_number, worker_id)
     values ('v2-running-job', 1, 'pre-v3-worker')`,
  );

  await pg.exec(await migration("0020_pipeline_version.sql"));
  const migrated = await pg.query(
    `select pipeline_version, payload::jsonb as payload
     from build_jobs
     where id in ('v2-resumable-job', 'v2-mismatch-job')
     order by id`,
  );
  const mismatch = migrated.rows[0];
  const resumable = migrated.rows[1];
  assert.equal(mismatch.pipeline_version, "helix-v2");
  assert.equal(mismatch.payload.checkpoint.pipelineVersion, "helix-v2");
  assert.equal(mismatch.payload.checkpoint.stage, "finalized");
  assert.deepEqual(mismatch.payload.checkpoint.artifacts, preservedArtifacts);
  assert.equal(mismatch.payload.checkpoint.gemIndex, 1);
  assert.equal(mismatch.payload.gems[0].id, "wren");

  assert.equal(resumable.pipeline_version, "helix-v3");
  assert.equal(resumable.payload.checkpoint.pipelineVersion, "helix-v3");
  assert.equal(resumable.payload.checkpoint.requestFingerprint, requestFingerprint);
  assert.equal(resumable.payload.checkpoint.stage, "gems");
  assert.deepEqual(resumable.payload.checkpoint.artifacts, preservedArtifacts);
  assert.equal(resumable.payload.checkpoint.gemIndex, 2);
  assert.equal(resumable.payload.gems[0].id, "sable");
  assert.equal(resumable.payload.html, null);
  assert.equal(resumable.payload.usedAi, false);
  for (const key of [
    "files",
    "workspace",
    "production",
    "quality",
    "score",
    "wire",
    "liveUrl",
    "stores",
  ]) {
    assert.equal(Object.hasOwn(resumable.payload, key), false);
  }

  const fenced = await pg.query(
    `select job.pipeline_version, job.queue_status, job.locked_by,
            job.lock_expires_at, job.attempt_count,
            attempt.outcome, attempt.error_code
     from build_jobs as job
     join build_job_attempts as attempt on attempt.job_id = job.id
     where job.id = 'v2-running-job' and attempt.attempt_number = 1`,
  );
  assert.deepEqual(fenced.rows[0], {
    pipeline_version: "helix-v3",
    queue_status: "retry",
    locked_by: null,
    lock_expires_at: null,
    attempt_count: 0,
    outcome: "retry",
    error_code: "PIPELINE_UPGRADE_FENCED",
  });
  const staleWorkerWrite = await pg.query(
    `update build_jobs set stage = 'stale-v2-worker'
     where id = 'v2-running-job'
       and locked_by = 'pre-v3-worker'
       and queue_status = 'running'
     returning id`,
  );
  assert.equal(staleWorkerWrite.rows.length, 0);

  // Recovery reruns are idempotent and do not broaden migration eligibility.
  await pg.exec(await migration("0020_pipeline_version.sql"));
  const afterRerun = await pg.query(
    `select id, pipeline_version from build_jobs
     where id in ('v2-resumable-job', 'v2-mismatch-job', 'v2-running-job')
     order by id`,
  );
  assert.deepEqual(
    afterRerun.rows.map((row) => [row.id, row.pipeline_version]),
    [
      ["v2-mismatch-job", "helix-v2"],
      ["v2-resumable-job", "helix-v3"],
      ["v2-running-job", "helix-v3"],
    ],
  );
});

test("negative legacy balances stop migration with a reconciliation contract", async (t) => {
  const pg = await pglite();
  t.after(() => pg.close());
  await pg.exec(await migration("0002_vetra.sql"));
  await pg.query(
    "insert into profiles (user_id, plan, credits_balance) values ('legacy-user', 'free', -1)",
  );

  await assert.rejects(
    pg.exec(await migration("0005_billing_integrity.sql")),
    /NEGATIVE_CREDIT_BALANCES_REQUIRE_RECONCILIATION/,
  );

  await pg.query("update profiles set credits_balance = 0 where user_id = 'legacy-user'");
  await pg.exec(await migration("0005_billing_integrity.sql"));
});

test("build job ownership is backfilled from its legacy project", async (t) => {
  const pg = await pglite();
  t.after(() => pg.close());
  await pg.exec(await migration("0002_vetra.sql"));
  await pg.query(
    `insert into projects (id, user_id, title, prompt)
     values ('project-legacy', 'owner-1', 'Legacy', 'Legacy')`,
  );
  await pg.query(
    `create table build_jobs (
       id text primary key,
       project_id text,
       payload text not null,
       updated_at timestamptz not null default now()
     )`,
  );
  await pg.query(
    `insert into build_jobs (id, project_id, payload)
     values ('job-legacy', 'project-legacy', '{}')`,
  );

  await pg.exec(await migration("0006_build_jobs_access.sql"));
  const owner = await pg.query("select user_id from build_jobs where id = 'job-legacy'");
  assert.equal(owner.rows[0].user_id, "owner-1");
});

test("public app metadata, capability shape and lookup uniqueness are enforced", async (t) => {
  const pg = await pglite();
  t.after(() => pg.close());
  for (const name of ["0002_vetra.sql", "0003_deploys.sql", "0004_guest_security.sql"]) {
    await pg.exec(await migration(name));
  }
  await pg.query(
    `insert into public_apps (slug, title, html, testers_code, project_id)
     values ('legacy', 'Legacy', '<p>è</p>', 'LEGACYCODE12', 'project-1')`,
  );
  await pg.exec(await migration("0007_public_app_integrity.sql"));

  const legacy = await pg.query(
    "select content_bytes, octet_length(html) as actual_bytes from public_apps where slug = 'legacy'",
  );
  assert.equal(legacy.rows[0].content_bytes, legacy.rows[0].actual_bytes);

  await assert.rejects(
    pg.query(
      `insert into public_apps (
         slug, title, html, visibility, content_bytes
       ) values ('invalid-visibility', 'Bad', '<p>x</p>', 'private', 8)`,
    ),
    /public_apps_(visibility|guest_metadata)_ck/,
  );
  await assert.rejects(
    pg.query(
      `insert into public_apps (
         slug, title, html, visibility, content_bytes, expires_at
       ) values ('bad-guest', 'Bad', '<p>x</p>', 'guest', 8, now() + interval '1 hour')`,
    ),
    /public_apps_guest_metadata_ck/,
  );
  await assert.rejects(
    pg.query(
      `insert into public_apps (
         slug, title, html, testers_code, project_id, content_bytes
       ) values ('duplicate', 'Duplicate', '<p>x</p>', 'LEGACYCODE12', 'project-2', 8)`,
    ),
    /public_apps_testers_code_unique_idx/,
  );
});

test("the deploy migrator serializes and guards production migration passes", async () => {
  const source = await readFile(new URL("./migrate.mjs", import.meta.url), "utf8");
  assert.match(source, /--netlify-production/);
  assert.match(source, /NETLIFY !== "true"/);
  assert.match(source, /CONTEXT !== "production"/);
  assert.match(source, /pg_advisory_lock/);
  assert.match(source, /pg_advisory_unlock/);
  assert.match(source, /ON CONFLICT \(name\) DO NOTHING/);
});
