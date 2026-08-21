import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrls = [
  "../migrations/0002_vetra.sql",
  "../migrations/0003_deploys.sql",
  "../migrations/0005_billing_integrity.sql",
  "../migrations/0006_build_jobs_access.sql",
  "../migrations/0008_build_job_queue.sql",
  "../migrations/0009_human_gate_release.sql",
  "../migrations/0016_build_level_workspace.sql",
  "../migrations/0020_pipeline_version.sql",
  "../migrations/0026_atomic_project_build_enqueue.sql",
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
    checkpoint: {
      pipelineVersion: "helix-v3",
      requestFingerprint: fingerprint,
      stage: "queued",
    },
  });
  return pg.query(
    `select job_id, project_was_created, job_was_created
     from create_project_and_enqueue_build_job(
       $2, $1, 'Durable app', $4, 'prototype', '<html></html>', '[]',
       8, 'Generate', $3, $5, $6, $7, $8, 2
     )`,
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
    checkpoint: {
      pipelineVersion: "helix-v3",
      requestFingerprint: fingerprint,
      stage: "queued",
    },
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
  assert.match(vetraSource, /from create_project_and_enqueue_build_job\(/);
  assert.equal(vetraSource.match(/await dispatchCommittedBuildJob\(jobId\)/g)?.length, 2);
});

test("create retry preserves worker-mutated project state and charges/queues once", async (t) => {
  const pg = await database();
  t.after(() => pg.close());

  const first = await createAndQueue(pg);
  const workerMessages = JSON.stringify([
    { role: "assistant", content: "The durable app is ready", kind: "build" },
  ]);
  await pg.query(
    `update projects
     set title = 'Worker-generated title',
         status = 'ready',
         html = '<html><body>worker output</body></html>',
         messages = $2
     where id = $1`,
    ["018f0ec6-3d28-7b64-9c12-2f6358b82111", workerMessages],
  );
  const retry = await createAndQueue(pg, { jobId: "job-create-candidate-retry" });
  assert.deepEqual(first.rows[0], {
    job_id: "job-create-candidate-1",
    project_was_created: true,
    job_was_created: true,
  });
  assert.deepEqual(retry.rows[0], {
    job_id: first.rows[0].job_id,
    project_was_created: false,
    job_was_created: false,
  });

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
  const projects = await pg.query(
    `select id, title, status, html, messages, credits_spent, current_build_job_id
     from projects`,
  );
  const jobs = await pg.query(
    "select id, project_id, user_id, queue_status, idempotency_key from build_jobs",
  );
  assert.deepEqual(projects.rows, [
    {
      id: "018f0ec6-3d28-7b64-9c12-2f6358b82111",
      title: "Worker-generated title",
      status: "ready",
      html: "<html><body>worker output</body></html>",
      messages: workerMessages,
      credits_spent: 8,
      current_build_job_id: "job-create-candidate-1",
    },
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

test("a retry repairs the observed debit-plus-project state without charging again", async (t) => {
  const pg = await database();
  t.after(() => pg.close());
  const projectId = "018f0ec6-3d28-7b64-9c12-2f6358b82111";
  const billingKey = `generate:${projectId}`;

  // This is the durable state left by the production CTE bug: the debit and
  // project committed, while no build_jobs row or current binding existed.
  await pg.query(
    `with credit as materialized (
       select was_applied
       from apply_credit_entry('user-1', -8, 'generate', $1, 'Generate', $2)
     )
     insert into projects (
       id, user_id, title, prompt, kind, build_level, status, html, messages, credits_spent
     )
     select $1, 'user-1', 'Durable app', 'Create a durable app', 'web', 'prototype',
            'building', '<html></html>', '[]', 8
     from credit
     where credit.was_applied`,
    [projectId, billingKey],
  );
  assert.deepEqual(await accountState(pg), {
    balance: 12,
    ledger: [{ action: "generate", credits: -8, idempotency_key: billingKey }],
  });
  assert.equal((await pg.query("select id from build_jobs")).rows.length, 0);

  const repaired = await createAndQueue(pg, { jobId: "job-create-repair-1" });
  assert.deepEqual(repaired.rows[0], {
    job_id: "job-create-repair-1",
    project_was_created: false,
    job_was_created: true,
  });
  assert.deepEqual(await accountState(pg), {
    balance: 12,
    ledger: [{ action: "generate", credits: -8, idempotency_key: billingKey }],
  });
  const project = await pg.query(
    "select current_build_job_id from projects where id = $1",
    [projectId],
  );
  assert.equal(project.rows[0].current_build_job_id, "job-create-repair-1");
  assert.equal((await pg.query("select id from build_jobs")).rows.length, 1);
});

test("an enqueue failure rolls the create debit and project back", async (t) => {
  const pg = await database();
  t.after(() => pg.close());

  await assert.rejects(createAndQueue(pg, { fingerprint: "invalid" }), /INVALID_JOB_FINGERPRINT/);
  assert.deepEqual(await accountState(pg), { balance: 20, ledger: [] });
  assert.equal((await pg.query("select id from projects")).rows.length, 0);
  assert.equal((await pg.query("select id from build_jobs")).rows.length, 0);
});

test("a changed request cannot mutate an immutable project replay", async (t) => {
  const pg = await database();
  t.after(() => pg.close());

  await createAndQueue(pg);
  await assert.rejects(
    createAndQueue(pg, {
      jobId: "job-create-conflict",
      prompt: "A different request",
      fingerprint: "c".repeat(64),
    }),
    /PROJECT_CREATE_REPLAY_MISMATCH/,
  );
  const state = await accountState(pg);
  assert.equal(state.balance, 12);
  assert.equal(state.ledger.length, 1);
  assert.equal((await pg.query("select id from projects")).rows.length, 1);
  assert.equal((await pg.query("select id from build_jobs")).rows.length, 1);
});

test("a delayed create replay preserves a newer current build binding", async (t) => {
  const pg = await database();
  t.after(() => pg.close());
  const projectId = "018f0ec6-3d28-7b64-9c12-2f6358b82111";

  const created = await createAndQueue(pg);
  const newerFingerprint = "d".repeat(64);
  const newerPayload = JSON.stringify({
    id: "job-newer-candidate-1",
    projectId,
    userId: "user-1",
    checkpoint: {
      pipelineVersion: "helix-v3",
      requestFingerprint: newerFingerprint,
      stage: "queued",
    },
  });
  await pg.query(
    `select * from enqueue_build_job(
       'job-newer-candidate-1', $1, 'user-1', null, null, $2,
       'build:iterate:newer-candidate-1', $3, 2
     )`,
    [projectId, newerPayload, newerFingerprint],
  );
  await pg.query(
    "update projects set current_build_job_id = 'job-newer-candidate-1' where id = $1",
    [projectId],
  );

  const replay = await createAndQueue(pg, { jobId: "job-create-delayed-retry" });
  assert.equal(replay.rows[0].job_id, created.rows[0].job_id);
  const project = await pg.query(
    "select current_build_job_id from projects where id = $1",
    [projectId],
  );
  assert.equal(project.rows[0].current_build_job_id, "job-newer-candidate-1");
  assert.deepEqual(await accountState(pg), {
    balance: 12,
    ledger: [
      {
        action: "generate",
        credits: -8,
        idempotency_key: `generate:${projectId}`,
      },
    ],
  });
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
