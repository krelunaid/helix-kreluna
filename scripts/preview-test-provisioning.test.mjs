import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { verifyPassword } from "better-auth/crypto";
import { createServer } from "vite";

const execFileAsync = promisify(execFile);
const ROOT = join(import.meta.dirname, "..");
const TEST_PASSWORD = ["preview", "only", "passphrase", "32"].join("-");
const TARGET_ID = "helix-preview-tester-v1";
const TARGET_EMAIL = "krelunaid@example.test";
const ENVIRONMENT_NAMES = [
  "BETTER_AUTH_SECRET",
  "HELIX_PREVIEW_CREDIT_GRANT_ENABLED",
  "HELIX_PREVIEW_CREDIT_GRANT_AMOUNT",
  "HELIX_PREVIEW_CREDIT_GRANT_USER_ID",
  "HELIX_PREVIEW_CREDIT_GRANT_EMAIL",
  "HELIX_PREVIEW_TESTER_PROVISION_ENABLED",
  "HELIX_PREVIEW_TEST_PASSWORD",
  "HELIX_RUNTIME_ENV",
  "STRIPE_BILLING_ENABLED",
  "NETLIFY",
  "NETLIFY_DEPLOY_ID",
  "DEPLOY_ID",
  "SITE_ID",
  "SITE_NAME",
  "PULL_REQUEST",
  "REVIEW_ID",
  "COMMIT_REF",
  "DEPLOY_PRIME_URL",
  "HELIX_PREVIEW_EXPECTED_REVIEW_ID",
  "HELIX_PREVIEW_EXPECTED_COMMIT_REF",
  "CONTEXT",
  "DATABASE_URL",
  "NETLIFY_DB_URL",
  "VITE_AUTH_ENABLED",
  "NODE_ENV",
];

function setEnvironment(values) {
  for (const name of ENVIRONMENT_NAMES) delete process.env[name];
  Object.assign(process.env, values);
}

function testerEnvironment(overrides = {}) {
  return {
    NODE_ENV: "test",
    STRIPE_BILLING_ENABLED: "false",
    BETTER_AUTH_SECRET: "A".repeat(32),
    HELIX_PREVIEW_CREDIT_GRANT_ENABLED: "true",
    HELIX_PREVIEW_CREDIT_GRANT_AMOUNT: "10",
    HELIX_PREVIEW_CREDIT_GRANT_USER_ID: TARGET_ID,
    HELIX_PREVIEW_CREDIT_GRANT_EMAIL: TARGET_EMAIL,
    HELIX_PREVIEW_TESTER_PROVISION_ENABLED: "true",
    ...overrides,
  };
}

test("operator-only preview tester provisioning is exact and replay-safe", async (t) => {
  const previousEnvironment = Object.fromEntries(
    ENVIRONMENT_NAMES.map((name) => [name, process.env[name]]),
  );
  setEnvironment(testerEnvironment());
  t.after(() => {
    for (const name of ENVIRONMENT_NAMES) {
      const value = previousEnvironment[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const [provisioner, db] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/preview-test-provisioning.ts"),
    vite.ssrLoadModule("/src/lib/db.ts"),
  ]);
  const pg = await db.getPglite();
  t.after(() => pg.close());

  async function counts() {
    const [users, accounts, sessions, profiles, ledger] = await Promise.all([
      pg.query('select count(*)::bigint as count from "user"'),
      pg.query('select count(*)::bigint as count from "account"'),
      pg.query('select count(*)::bigint as count from "session"'),
      pg.query("select count(*)::bigint as count from profiles"),
      pg.query("select count(*)::bigint as count from credit_ledger"),
    ]);
    return [users, accounts, sessions, profiles, ledger].map((result) =>
      Number(result.rows[0].count),
    );
  }

  await t.test("migration 0001-0025 proof precedes every identity mutation", async () => {
    await pg.query("delete from _migrations where name = $1", [
      "0025_store_production_provenance.sql",
    ]);
    await assert.rejects(
      provisioner.provisionConfiguredPreviewTester(TEST_PASSWORD, { allowTestRuntime: true }),
      /PREVIEW_TEST_DATABASE_MIGRATIONS_INCOMPLETE/u,
    );
    assert.deepEqual(await counts(), [0, 0, 0, 0, 0]);
    await pg.query("insert into _migrations (name) values ($1)", [
      "0025_store_production_provenance.sql",
    ]);
  });

  await t.test("first creation rejects orphan rows in every application table", async () => {
    await pg.query(
      `insert into projects (id, user_id, title, prompt)
       values ($1, $2, $3, $4)`,
      ["orphan-project", TARGET_ID, "Orphan", "Must fail closed"],
    );
    await assert.rejects(
      provisioner.provisionConfiguredPreviewTester(TEST_PASSWORD, { allowTestRuntime: true }),
      /PREVIEW_TESTER_PROVISION_CONFLICT/u,
    );
    assert.deepEqual(await counts(), [0, 0, 0, 0, 0]);
    await pg.query("delete from projects where id = $1", ["orphan-project"]);

    await pg.query(
      `insert into "verification" (
         "id", "identifier", "value", "expiresAt", "createdAt", "updatedAt"
       ) values ($1, $2, $3, now() + interval '1 hour', now(), now())`,
      ["orphan-verification", TARGET_EMAIL, "opaque-test-value"],
    );
    await assert.rejects(
      provisioner.provisionConfiguredPreviewTester(TEST_PASSWORD, { allowTestRuntime: true }),
      /PREVIEW_TESTER_PROVISION_CONFLICT/u,
    );
    assert.deepEqual(await counts(), [0, 0, 0, 0, 0]);
    await pg.query('delete from "verification" where "id" = $1', ["orphan-verification"]);
  });

  await t.test("short password and missing operator flag fail without mutation", async () => {
    await assert.rejects(
      provisioner.provisionConfiguredPreviewTester(TEST_PASSWORD),
      /PREVIEW_TESTER_PROVISION_FORBIDDEN/u,
    );
    await assert.rejects(
      provisioner.provisionConfiguredPreviewTester("short", { allowTestRuntime: true }),
      /PREVIEW_TESTER_PROVISION_CONFIGURATION_INVALID/u,
    );
    setEnvironment(testerEnvironment({ HELIX_PREVIEW_TESTER_PROVISION_ENABLED: "false" }));
    await assert.rejects(
      provisioner.provisionConfiguredPreviewTester(TEST_PASSWORD, { allowTestRuntime: true }),
      /PREVIEW_TESTER_PROVISION_FORBIDDEN/u,
    );
    assert.deepEqual(await counts(), [0, 0, 0, 0, 0]);
    setEnvironment(testerEnvironment());
  });

  await t.test(
    "Better Auth creates one credential, no session, profile zero then ledger 10",
    async () => {
      const first = await provisioner.provisionConfiguredPreviewTester(TEST_PASSWORD, {
        allowTestRuntime: true,
      });
      assert.deepEqual(
        {
          created: first.created,
          userId: first.userId,
          email: first.email,
          grantWasApplied: first.grantWasApplied,
          balanceAfter: first.balanceAfter,
        },
        {
          created: true,
          userId: TARGET_ID,
          email: TARGET_EMAIL,
          grantWasApplied: true,
          balanceAfter: 10,
        },
      );
      assert.deepEqual(await counts(), [1, 1, 0, 1, 1]);

      const users = await pg.query(
        'select "id", "name", "email", "emailVerified", "image" from "user"',
      );
      assert.deepEqual(users.rows, [
        {
          id: TARGET_ID,
          name: "Helix Preview Tester",
          email: TARGET_EMAIL,
          emailVerified: false,
          image: null,
        },
      ]);
      const accounts = await pg.query(
        `select "accountId", "providerId", "userId", "password",
              "accessToken", "refreshToken", "idToken", "scope"
       from "account"`,
      );
      assert.equal(accounts.rows.length, 1);
      assert.equal(accounts.rows[0].accountId, TARGET_ID);
      assert.equal(accounts.rows[0].providerId, "credential");
      assert.equal(accounts.rows[0].userId, TARGET_ID);
      assert.notEqual(accounts.rows[0].password, TEST_PASSWORD);
      assert.equal(
        await verifyPassword({ hash: accounts.rows[0].password, password: TEST_PASSWORD }),
        true,
      );
      for (const name of ["accessToken", "refreshToken", "idToken", "scope"]) {
        assert.equal(accounts.rows[0][name], null);
      }
      const profiles = await pg.query(
        "select user_id, plan, credits_balance from profiles order by user_id",
      );
      assert.deepEqual(profiles.rows, [{ user_id: TARGET_ID, plan: "free", credits_balance: 10 }]);
      const ledger = await pg.query(
        `select user_id, action, credits, project_id, note, idempotency_key
       from credit_ledger order by id`,
      );
      assert.deepEqual(ledger.rows, [
        {
          user_id: TARGET_ID,
          action: "preview_test_grant",
          credits: 10,
          project_id: null,
          note: "Manual preview/test credit grant v1",
          idempotency_key: "preview-test-grant:manual:v1",
        },
      ]);
    },
  );

  await t.test("exact rerun verifies password and reuses the immutable ledger entry", async () => {
    const replay = await provisioner.provisionConfiguredPreviewTester(TEST_PASSWORD, {
      allowTestRuntime: true,
    });
    assert.equal(replay.created, false);
    assert.equal(replay.grantWasApplied, false);
    assert.equal(replay.balanceAfter, 10);
    assert.deepEqual(await counts(), [1, 1, 0, 1, 1]);

    await assert.rejects(
      provisioner.provisionConfiguredPreviewTester(["different", "passphrase", "32"].join("-"), {
        allowTestRuntime: true,
      }),
      /PREVIEW_TESTER_PROVISION_CONFLICT/u,
    );
    assert.deepEqual(await counts(), [1, 1, 0, 1, 1]);
  });

  await t.test("any second global identity makes a rerun fail closed", async () => {
    await pg.query(
      `insert into "user" (
         "id", "name", "email", "emailVerified", "createdAt", "updatedAt"
       ) values ($1, $2, $3, false, now(), now())`,
      ["unexpected-user", "Unexpected", "unexpected@example.test"],
    );
    await assert.rejects(
      provisioner.provisionConfiguredPreviewTester(TEST_PASSWORD, { allowTestRuntime: true }),
      /PREVIEW_TESTER_PROVISION_CONFLICT/u,
    );
    assert.deepEqual(await counts(), [2, 1, 0, 1, 1]);
  });
});

test("provisioning CLI is explicit, stdin-only and never mounted on HTTP", async () => {
  const scriptPath = join(ROOT, "scripts/provision-preview-user.mjs");
  const [scriptSource, moduleSource, packageSource, routeNames, sourceNames] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(join(ROOT, "src/lib/server/preview-test-provisioning.ts"), "utf8"),
    readFile(join(ROOT, "package.json"), "utf8"),
    readdir(join(ROOT, "src/routes"), { recursive: true }),
    readdir(join(ROOT, "src"), { recursive: true }),
  ]);
  assert.match(scriptSource, /--confirm-preview-user-provision/u);
  assert.doesNotMatch(scriptSource, /--from-netlify-build|HELIX_PREVIEW_TESTER_PASSWORD/u);
  assert.match(scriptSource, /process\.stdin/u);
  assert.match(scriptSource, /input hidden/u);
  assert.match(scriptSource, /attestPreviewDatabaseMutation\(\)/u);
  assert.match(moduleSource, /autoSignIn:\s*false/u);
  assert.match(moduleSource, /auth\.api\.signUpEmail/u);
  assert.match(moduleSource, /pg_catalog\.pg_class/u);
  assert.match(moduleSource, /PREVIEW_DATABASE_METADATA_ROW_ALLOWLIST/u);
  assert.doesNotMatch(moduleSource, /createServerFn|\.listen\(|fetch\(/u);
  assert.doesNotMatch(packageSource, /preview:user:provision:netlify/u);
  assert.match(packageSource, /preview:database:prepare:netlify/u);

  for (const name of routeNames.filter((value) => /\.(?:ts|tsx)$/u.test(value))) {
    const source = await readFile(join(ROOT, "src/routes", name), "utf8");
    assert.doesNotMatch(source, /preview-test-provisioning|provisionConfiguredPreviewTester/u);
  }
  for (const name of sourceNames.filter((value) => /\.(?:ts|tsx)$/u.test(value))) {
    const source = await readFile(join(ROOT, "src", name), "utf8");
    assert.doesNotMatch(source, /HELIX_PREVIEW_TESTER_PASSWORD/u);
  }

  await assert.rejects(
    execFileAsync(process.execPath, [scriptPath, "--confirm-preview-user-provision"], {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: "production",
        HELIX_PREVIEW_TESTER_PROVISION_ENABLED: "false",
      },
    }),
    (error) => {
      assert.match(error.stderr, /HELIX_PREVIEW_TESTER_PROVISION_ENABLED=true/u);
      return true;
    },
  );
});
