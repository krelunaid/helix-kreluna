import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const baseSchema = await readFile(new URL("../migrations/0002_vetra.sql", import.meta.url), "utf8");
const integrityMigration = await readFile(
  new URL("../migrations/0005_billing_integrity.sql", import.meta.url),
  "utf8",
);

async function database(balance = 10) {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec(baseSchema);
  await pg.exec(integrityMigration);
  await pg.query("insert into profiles (user_id, plan, credits_balance) values ($1, 'free', $2)", [
    "user-1",
    balance,
  ]);
  return pg;
}

async function applyEntry(pg, { delta, key, action = "test", projectId = null, note = "test" }) {
  const result = await pg.query("select * from apply_credit_entry($1, $2, $3, $4, $5, $6)", [
    "user-1",
    delta,
    action,
    projectId,
    note,
    key,
  ]);
  return result.rows[0];
}

async function balanceAndLedger(pg) {
  const balance = await pg.query("select credits_balance from profiles where user_id = $1", [
    "user-1",
  ]);
  const ledger = await pg.query(
    "select action, credits, idempotency_key from credit_ledger where user_id = $1 order by id",
    ["user-1"],
  );
  return { balance: balance.rows[0].credits_balance, ledger: ledger.rows };
}

test("a concurrent retry applies one debit and one ledger entry", async (t) => {
  const pg = await database();
  t.after(() => pg.close());

  const [first, second] = await Promise.all([
    applyEntry(pg, { delta: -3, key: "iterate:request-1" }),
    applyEntry(pg, { delta: -3, key: "iterate:request-1" }),
  ]);

  assert.deepEqual([first.was_applied, second.was_applied].sort(), [false, true]);
  assert.deepEqual(await balanceAndLedger(pg), {
    balance: 7,
    ledger: [
      {
        action: "test",
        credits: -3,
        idempotency_key: "iterate:request-1",
      },
    ],
  });
});

test("concurrent distinct debits cannot overdraw the account", async (t) => {
  const pg = await database();
  t.after(() => pg.close());

  const results = await Promise.allSettled(
    Array.from({ length: 4 }, (_, index) =>
      applyEntry(pg, { delta: -4, key: `generate:request-${index}` }),
    ),
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
  assert.equal(results.filter((result) => result.status === "rejected").length, 2);

  const state = await balanceAndLedger(pg);
  assert.equal(state.balance, 2);
  assert.equal(state.ledger.length, 2);
  assert.equal(state.balance + -state.ledger.reduce((sum, entry) => sum + entry.credits, 0), 10);
});

test("an insufficient debit rolls its ledger claim back", async (t) => {
  const pg = await database(2);
  t.after(() => pg.close());

  await assert.rejects(
    applyEntry(pg, { delta: -3, key: "generate:insufficient" }),
    /INSUFFICIENT_CREDITS/,
  );
  assert.deepEqual(await balanceAndLedger(pg), { balance: 2, ledger: [] });
});

test("a missing profile is not mislabeled as insufficient credit", async (t) => {
  const pg = await database();
  t.after(() => pg.close());

  await assert.rejects(
    pg.query("select * from apply_credit_entry($1, -1, 'test', null, 'test', $2)", [
      "missing-user",
      "missing-profile:key",
    ]),
    /PROFILE_NOT_FOUND/,
  );
});

test("refunds are positive, atomic, and idempotent", async (t) => {
  const pg = await database();
  t.after(() => pg.close());

  await applyEntry(pg, { delta: -8, key: "generate:request-2", action: "generate" });
  const first = await applyEntry(pg, {
    delta: 8,
    key: "refund:request-2",
    action: "generate_refund",
  });
  const retry = await applyEntry(pg, {
    delta: 8,
    key: "refund:request-2",
    action: "generate_refund",
  });

  assert.equal(first.was_applied, true);
  assert.equal(retry.was_applied, false);
  const state = await balanceAndLedger(pg);
  assert.equal(state.balance, 10);
  assert.equal(state.ledger.length, 2);
  assert.equal(
    state.ledger.reduce((sum, entry) => sum + entry.credits, 0),
    0,
  );
});

test("an idempotency key cannot be reused for a different mutation", async (t) => {
  const pg = await database();
  t.after(() => pg.close());

  await applyEntry(pg, { delta: -3, key: "iterate:request-3" });
  await assert.rejects(
    applyEntry(pg, { delta: -2, key: "iterate:request-3" }),
    /IDEMPOTENCY_KEY_REUSED/,
  );

  const state = await balanceAndLedger(pg);
  assert.equal(state.balance, 7);
  assert.equal(state.ledger.length, 1);
});

test("project creation and its debit commit or roll back together", async (t) => {
  const pg = await database();
  t.after(() => pg.close());

  await pg.query(
    `with credit as (
       select was_applied
       from apply_credit_entry($1, $2, 'generate', $3, 'Generate', $4)
     )
     insert into projects (
       id, user_id, title, prompt, kind, status, html, messages, credits_spent
     )
     select $3, $1, 'Test', 'Test', 'web', 'building', '<html></html>', '[]', 8
     from credit`,
    ["user-1", -8, "project-1", "generate:project-1"],
  );

  const state = await balanceAndLedger(pg);
  const projects = await pg.query("select id, credits_spent from projects where user_id = $1", [
    "user-1",
  ]);
  assert.equal(state.balance, 2);
  assert.deepEqual(projects.rows, [{ id: "project-1", credits_spent: 8 }]);

  await assert.rejects(
    pg.query(
      `with credit as (
         select was_applied
         from apply_credit_entry($1, $2, 'generate', $3, 'Generate', $4)
       )
       insert into projects (
         id, user_id, title, prompt, kind, status, html, messages, credits_spent
       )
       select $3, $1, 'Test', 'Test', 'web', 'building', '<html></html>', '[]', 8
       from credit`,
      ["user-1", -8, "project-2", "generate:project-2"],
    ),
    /INSUFFICIENT_CREDITS/,
  );
  const afterFailure = await balanceAndLedger(pg);
  const failedProject = await pg.query("select id from projects where id = 'project-2'");
  assert.equal(afterFailure.balance, 2);
  assert.equal(afterFailure.ledger.length, 1);
  assert.equal(failedProject.rows.length, 0);
});

test("a project mutation is skipped when its debit is an idempotent retry", async (t) => {
  const pg = await database();
  t.after(() => pg.close());
  await pg.query(
    `insert into projects (
       id, user_id, title, prompt, kind, status, html, messages, credits_spent
     ) values ('project-3', $1, 'Test', 'Test', 'web', 'ready', '<html></html>', '[]', 0)`,
    ["user-1"],
  );

  async function iterate() {
    return pg.query(
      `with owned as materialized (
         select id from projects where id = $2 and user_id = $1
       ),
       credit as (
         select mutation.was_applied
         from owned
         cross join lateral apply_credit_entry(
           $1, -3, 'iterate', owned.id, 'Change', $3
         ) as mutation
       ),
       changed as (
         update projects
         set credits_spent = credits_spent + 3
         from credit
         where projects.id = $2
           and projects.user_id = $1
           and credit.was_applied
         returning projects.id
       )
       select was_applied from credit`,
      ["user-1", "project-3", "iterate:project-3:request-1"],
    );
  }

  const first = await iterate();
  const retry = await iterate();
  assert.equal(first.rows[0].was_applied, true);
  assert.equal(retry.rows[0].was_applied, false);

  const project = await pg.query("select credits_spent from projects where id = 'project-3'");
  const state = await balanceAndLedger(pg);
  assert.equal(project.rows[0].credits_spent, 3);
  assert.equal(state.balance, 7);
  assert.equal(state.ledger.length, 1);
});
