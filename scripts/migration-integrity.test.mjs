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
         'build_job_ai_calls'
       )
     order by table_name`,
  );
  assert.deepEqual(
    tables.rows.map((row) => row.table_name),
    [
      "build_job_ai_calls",
      "build_job_attempts",
      "build_job_browser_reports",
      "build_job_gate_events",
      "build_job_quality_reports",
      "build_jobs",
      "credit_ledger",
      "profiles",
      "public_apps",
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
