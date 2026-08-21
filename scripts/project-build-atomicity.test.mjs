import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrls = [
  "../migrations/0002_vetra.sql",
  "../migrations/0005_billing_integrity.sql",
  "../migrations/0006_build_jobs_access.sql",
  "../migrations/0008_build_job_queue.sql",
].map((path) => new URL(path, import.meta.url));

const migrations = await Promise.all(migrationUrls.map((url) => readFile(url, "utf8")));
const vetraSource = await readFile(
  new URL("../src/lib/server/vetra.ts", import.meta.url),
  "utf8",
);

async function database(balance = 20) {
  const pg = new PGlite();
  await pg.waitReady;
  for (const migration of migrations) await pg.exec(migration);
  await pg.query("insert into profiles (user_id, plan, credits_balance) values ($1, 'free', $2)", [
    "user-1",
    balance,
  ]);
  return pg;
}

async function createAndQueue(
  pg,
  {
    projectId = "018f0ec6-3d28-7b64-9c12-2f6358b82111",
    jobId = "job-create-candidate-1",
    billingKey = "generate:018f0ec6-3d28-7b64-9c12-2f6358b82111",
    queueKey = "build:generate:018f0ec6-3d28-7b64-9c12-2f6358b82111",
    fingerprint = "a".repeat(64),
    prompt = "Create a durable app",
  } = {},
) {
  const payload = JSON.stringify({
    id: jobId,
    prompt,
    locale: "en",
    mode: "generate",
    status: "running",
  });
  return pg.query(
    `with credit as materialized (
       select was_applied
       from apply_credit_entry($1, -8, 'generate', $2, 'Generate', $3)
     ),
     created as (
       insert into projects (
         id, user_id, title, prompt, kind, status, html, messages, credits_spent
       )
       select $2, $1, 'Durable app', $4, 'web', 'building', '<html></html>', '[]', 8
       from credit
       where credit.was_applied
       returning projects.id
     ),
     project_ready as materialized (
       select id from created
       union all
       select projects.id
       from projects
       cross join credit
       where not credit.was_applied
         and projects.id = $2
         and projects.user_id = $1
     )
     select queued.job_id
     from project_ready
     cross join lateral enqueue_build_job(
       $5, project_ready.id, $1, null, null, $6, $7, $8, 2
     ) as queued`,
    ["user-1", projectId, billingKey, prompt, jobId, payload, queueKey, fingerprint],
  );
}

async function iterateAndQueue(
  pg,
  {
    projectId = "project-iterate-1",
    jobId = "job-iterate-candidate-1",
    billingKey = "iterate:project-iterate-1:request-1",
    queueKey = "build:iterate:project-iterate-1:request-1",
    fingerprint = "b".repeat(64),
    prompt = "Add a search field",
  } = {},
) {
  const message = JSON.stringify({ role: "user", content: prompt, kind: "iterate" });
  const payload = JSON.stringify({
    id: jobId,
    prompt,
    locale: "en",
    mode: "iterate",
    status: "running",
    projectId,
  });
  return pg.query(
    `with owned as materialized (
       select id
       from projects
       where id = $2 and user_id = $1
       for update
     ),
     credit as materialized (
       select owned.id as project_id, mutation.was_applied
       from owned
       cross join lateral apply_credit_entry(
         $1, -3, 'iterate', owned.id, $3, $4
       ) as mutation
     ),
     changed as (
       update projects
       set status = 'building',
           messages = (
             coalesce(nullif(projects.messages, ''), '[]')::jsonb
             || jsonb_build_array($5::jsonb)
           )::text,
           credits_spent = credits_spent + 3,
           updated_at = now()
       from credit
       where projects.id = credit.project_id
         and projects.user_id = $1
         and credit.was_applied
       returning projects.id
     ),
     project_ready as materialized (
       select id from changed
       union all
       select project_id as id from credit where not was_applied
     )
     select queued.job_id
     from project_ready
     cross join lateral enqueue_build_job(
       $6, project_ready.id, $1, null, null, $7, $8, $9, 2
     ) as queued`,
    [
      "user-1",
      projectId,
      prompt.slice(0, 80),
      billingKey,
      message,
      jobId,
      payload,
      queueKey,
      fingerprint,
    ],
  );
}

async function accountState(pg) {
  const balance = await pg.query("select credits_balance from profiles where user_id = 'user-1'");
  const ledger = await pg.query(
    "select action, credits, idempotency_key from credit_ledger where user_id = 'user-1' order by id",
  );
  return { balance: balance.rows[0].credits_balance, ledger: ledger.rows };
}

test("the legacy preview endpoint is retired with a typed 410 and no direct provider path", () => {
  assert.match(vetraSource, /class LegacyGeneratorRetiredError extends Error/);
  assert.match(vetraSource, /readonly code = "LEGACY_GENERATOR_RETIRED"/);
  assert.match(vetraSource, /readonly status = 410/);
  assert.match(vetraSource, /throw new LegacyGeneratorRetiredError\(\)/);
  assert.doesNotMatch(
    vetraSource,
    /function generateHtml|api\.x\.ai|XAI_API_KEY|NETLIFY_AI_GATEWAY_(?:KEY|BASE_URL)/,
  );
  assert.match(vetraSource, /event: "build_job_dispatch_deferred"/);
  assert.equal(vetraSource.match(/await dispatchCommittedBuildJob\(jobId\)/g)?.length, 2);
});

test("create debit, project, and persistent job commit once across retries", async (t) => {
  const pg = await database();
  t.after(() => pg.close());

  const first = await createAndQueue(pg);
  const retry = await createAndQueue(pg, { jobId: "job-create-candidate-retry" });
  assert.equal(first.rows[0].job_id, "job-create-candidate-1");
  assert.equal(retry.rows[0].job_id, first.rows[0].job_id);

  assert.deepEqual(await accountState(pg), {
    balance: 12,
    ledger: [
      {
        action: "generate",
        credits: -8,
        idempotency_key: "generate:018f0ec6-3d28-7b64-9c12-2f6358b82111",
      },
    ],
  });
  const projects = await pg.query("select id, credits_spent from projects");
  const jobs = await pg.query(
    "select id, project_id, user_id, queue_status, idempotency_key from build_jobs",
  );
  assert.deepEqual(projects.rows, [
    { id: "018f0ec6-3d28-7b64-9c12-2f6358b82111", credits_spent: 8 },
  ]);
  assert.deepEqual(jobs.rows, [
    {
      id: "job-create-candidate-1",
      project_id: "018f0ec6-3d28-7b64-9c12-2f6358b82111",
      user_id: "user-1",
      queue_status: "queued",
      idempotency_key: "build:generate:018f0ec6-3d28-7b64-9c12-2f6358b82111",
    },
  ]);
});

test("an enqueue failure rolls the create debit and project back", async (t) => {
  const pg = await database();
  t.after(() => pg.close());

  await assert.rejects(createAndQueue(pg, { fingerprint: "invalid" }), /INVALID_JOB_FINGERPRINT/);
  assert.deepEqual(await accountState(pg), { balance: 20, ledger: [] });
  assert.equal((await pg.query("select id from projects")).rows.length, 0);
  assert.equal((await pg.query("select id from build_jobs")).rows.length, 0);
});

test("a changed request cannot reuse a committed build idempotency key", async (t) => {
  const pg = await database();
  t.after(() => pg.close());

  await createAndQueue(pg);
  await assert.rejects(
    createAndQueue(pg, {
      jobId: "job-create-conflict",
      prompt: "A different request",
      fingerprint: "c".repeat(64),
    }),
    /JOB_IDEMPOTENCY_KEY_REUSED/,
  );
  const state = await accountState(pg);
  assert.equal(state.balance, 12);
  assert.equal(state.ledger.length, 1);
  assert.equal((await pg.query("select id from projects")).rows.length, 1);
  assert.equal((await pg.query("select id from build_jobs")).rows.length, 1);
});

test("iterate appends and charges once, then returns the same job after worker mutation", async (t) => {
  const pg = await database();
  t.after(() => pg.close());
  await pg.query(
    `insert into projects (
       id, user_id, title, prompt, kind, status, html, messages, credits_spent
     ) values ($1, 'user-1', 'App', 'Original', 'web', 'ready', '<html>v1</html>', '[]', 0)`,
    ["project-iterate-1"],
  );

  const first = await iterateAndQueue(pg);
  await pg.query(
    "update projects set html = '<html>worker-result</html>', status = 'ready' where id = $1",
    ["project-iterate-1"],
  );
  const retry = await iterateAndQueue(pg, { jobId: "job-iterate-candidate-retry" });
  assert.equal(first.rows[0].job_id, "job-iterate-candidate-1");
  assert.equal(retry.rows[0].job_id, first.rows[0].job_id);

  const project = await pg.query(
    "select status, html, messages, credits_spent from projects where id = $1",
    ["project-iterate-1"],
  );
  assert.equal(project.rows[0].status, "ready");
  assert.equal(project.rows[0].html, "<html>worker-result</html>");
  assert.equal(project.rows[0].credits_spent, 3);
  assert.deepEqual(JSON.parse(project.rows[0].messages), [
    { role: "user", content: "Add a search field", kind: "iterate" },
  ]);
  assert.deepEqual(await accountState(pg), {
    balance: 17,
    ledger: [
      {
        action: "iterate",
        credits: -3,
        idempotency_key: "iterate:project-iterate-1:request-1",
      },
    ],
  });
  assert.equal((await pg.query("select id from build_jobs")).rows.length, 1);
});

test("an enqueue failure rolls an iteration debit and project mutation back", async (t) => {
  const pg = await database();
  t.after(() => pg.close());
  await pg.query(
    `insert into projects (
       id, user_id, title, prompt, kind, status, html, messages, credits_spent
     ) values ($1, 'user-1', 'App', 'Original', 'web', 'ready', '<html>v1</html>', '[]', 0)`,
    ["project-iterate-1"],
  );

  await assert.rejects(iterateAndQueue(pg, { fingerprint: "invalid" }), /INVALID_JOB_FINGERPRINT/);
  assert.deepEqual(await accountState(pg), { balance: 20, ledger: [] });
  const project = await pg.query(
    "select status, messages, credits_spent from projects where id = $1",
    ["project-iterate-1"],
  );
  assert.deepEqual(project.rows, [{ status: "ready", messages: "[]", credits_spent: 0 }]);
  assert.equal((await pg.query("select id from build_jobs")).rows.length, 0);
});
