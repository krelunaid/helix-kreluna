import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createServer } from "vite";

const ROOT = join(import.meta.dirname, "..");
const ENVIRONMENT_NAMES = [
  "HELIX_PREVIEW_CREDIT_GRANT_ENABLED",
  "HELIX_PREVIEW_CREDIT_GRANT_AMOUNT",
  "HELIX_PREVIEW_CREDIT_GRANT_USER_ID",
  "HELIX_PREVIEW_CREDIT_GRANT_EMAIL",
  "HELIX_PREVIEW_TESTER_PROVISION_ENABLED",
  "HELIX_PREVIEW_EXPECTED_REVIEW_ID",
  "HELIX_PREVIEW_EXPECTED_COMMIT_REF",
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
  "AWS_LAMBDA_FUNCTION_NAME",
  "LAMBDA_TASK_ROOT",
  "CONTEXT",
  "DATABASE_URL",
  "NETLIFY_DB_URL",
  "VITE_AUTH_ENABLED",
  "VITE_GROK_AUTH_ENABLED",
  "VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED",
  "NODE_ENV",
];

function setGrantEnvironment(values) {
  for (const name of ENVIRONMENT_NAMES) delete process.env[name];
  Object.assign(process.env, values);
}

function configuredTarget(overrides = {}) {
  return {
    NODE_ENV: "test",
    STRIPE_BILLING_ENABLED: "false",
    HELIX_PREVIEW_CREDIT_GRANT_ENABLED: "true",
    HELIX_PREVIEW_CREDIT_GRANT_AMOUNT: "10",
    HELIX_PREVIEW_CREDIT_GRANT_USER_ID: "preview-target",
    HELIX_PREVIEW_CREDIT_GRANT_EMAIL: "target@example.test",
    ...overrides,
  };
}

test("manual preview/test credit grant is target-bound, idempotent and production-impossible", async (t) => {
  const previousEnvironment = Object.fromEntries(
    ENVIRONMENT_NAMES.map((name) => [name, process.env[name]]),
  );
  setGrantEnvironment({
    NODE_ENV: "test",
    HELIX_PREVIEW_CREDIT_GRANT_ENABLED: "false",
    STRIPE_BILLING_ENABLED: "false",
  });
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
  const [grant, db, environment] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/preview-credit-grant.ts"),
    vite.ssrLoadModule("/src/lib/db.ts"),
    vite.ssrLoadModule("/src/lib/env.server.ts"),
  ]);
  const pg = await db.getPglite();
  t.after(() => pg.close());

  async function account(id, email) {
    await pg.query(
      `insert into "user" (
         "id", "name", "email", "emailVerified", "createdAt", "updatedAt"
       ) values ($1, $2, $3, false, now(), now())`,
      [id, id, email],
    );
    await pg.query(
      "insert into profiles (user_id, plan, credits_balance) values ($1, 'free', 10)",
      [id],
    );
  }

  async function state(userId) {
    const balance = await pg.query("select credits_balance from profiles where user_id = $1", [
      userId,
    ]);
    const ledger = await pg.query(
      `select action, credits, note, project_id, idempotency_key
       from credit_ledger where user_id = $1 order by id`,
      [userId],
    );
    return { balance: balance.rows[0].credits_balance, ledger: ledger.rows };
  }

  await t.test("policy requires exact Netlify deploy-preview and database evidence", () => {
    assert.equal(grant.previewCreditGrantMode({}), "disabled");
    assert.equal(
      grant.previewCreditGrantMode({
        HELIX_PREVIEW_CREDIT_GRANT_ENABLED: "true",
        NODE_ENV: "test",
        STRIPE_BILLING_ENABLED: "false",
      }),
      "test",
    );
    assert.equal(
      grant.previewCreditGrantMode({
        HELIX_PREVIEW_CREDIT_GRANT_ENABLED: "true",
        NODE_ENV: "development",
      }),
      "forbidden",
    );
    assert.equal(
      grant.previewCreditGrantMode(
        {
          HELIX_PREVIEW_CREDIT_GRANT_ENABLED: "true",
          CONTEXT: "branch-deploy",
          NETLIFY: "true",
          DEPLOY_ID: "branch-id",
          SITE_ID: "site-id",
          VITE_AUTH_ENABLED: "true",
        },
        { databaseSource: "netlify" },
      ),
      "forbidden",
    );
    const deployPreview = {
      HELIX_PREVIEW_CREDIT_GRANT_ENABLED: "true",
      STRIPE_BILLING_ENABLED: "false",
      CONTEXT: "deploy-preview",
      NETLIFY: "true",
      DEPLOY_ID: "preview-id",
      SITE_ID: "89a00a91-8730-40e6-ac92-be473f106a78",
      SITE_NAME: "helix-kreluna",
      PULL_REQUEST: "true",
      REVIEW_ID: "314",
      COMMIT_REF: "a".repeat(40),
      DEPLOY_PRIME_URL: "https://deploy-preview-314--helix-kreluna.netlify.app",
      HELIX_PREVIEW_EXPECTED_REVIEW_ID: "314",
      HELIX_PREVIEW_EXPECTED_COMMIT_REF: "a".repeat(40),
      VITE_AUTH_ENABLED: "true",
      VITE_GROK_AUTH_ENABLED: "false",
      VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED: "true",
      HELIX_PREVIEW_TESTER_PROVISION_ENABLED: "true",
    };
    assert.equal(grant.previewCreditGrantMode(deployPreview), "forbidden");
    assert.equal(
      grant.previewCreditGrantMode(deployPreview, { databaseSource: "postgres" }),
      "forbidden",
    );
    assert.equal(
      grant.previewCreditGrantMode(deployPreview, { databaseSource: "netlify" }),
      "deploy_preview",
    );
    for (const unsafeAuthEnvironment of [
      { ...deployPreview, VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED: "false" },
      {
        ...deployPreview,
        VITE_GROK_AUTH_ENABLED: "true",
        GROK_AUTH_CLIENT_ID: "preview-broker",
        GROK_AUTH_CLIENT_SECRET: ["not", "a", "real", "secret"].join("-"),
      },
      { ...deployPreview, GROK_AUTH_CLIENT_ID: "dormant-broker" },
      { ...deployPreview, HELIX_PREVIEW_TESTER_PROVISION_ENABLED: "false" },
    ]) {
      assert.equal(
        grant.previewCreditGrantMode(unsafeAuthEnvironment, { databaseSource: "netlify" }),
        "forbidden",
      );
    }
    assert.equal(
      grant.previewCreditGrantMode(
        { ...deployPreview, HELIX_RUNTIME_ENV: "production" },
        { databaseSource: "netlify" },
      ),
      "forbidden",
    );
    assert.equal(
      grant.previewCreditGrantMode({
        HELIX_PREVIEW_CREDIT_GRANT_ENABLED: "true",
        NODE_ENV: "test",
        STRIPE_BILLING_ENABLED: "true",
      }),
      "forbidden",
    );
  });

  await t.test("server environment validates one complete bounded target", () => {
    assert.throws(
      () =>
        environment.validateServerEnvironment({
          NODE_ENV: "test",
          HELIX_PREVIEW_CREDIT_GRANT_ENABLED: "true",
        }),
      /HELIX_PREVIEW_CREDIT_GRANT_AMOUNT.*HELIX_PREVIEW_CREDIT_GRANT_EMAIL.*HELIX_PREVIEW_CREDIT_GRANT_USER_ID/u,
    );
    assert.throws(
      () =>
        environment.validateServerEnvironment({
          ...configuredTarget(),
          HELIX_PREVIEW_CREDIT_GRANT_ENABLED: "false",
        }),
      /HELIX_PREVIEW_CREDIT_GRANT_ENABLED/u,
    );
    for (const amount of ["9", "11", "20", "50"]) {
      assert.throws(
        () =>
          environment.validateServerEnvironment({
            ...configuredTarget(),
            HELIX_PREVIEW_CREDIT_GRANT_AMOUNT: amount,
          }),
        /HELIX_PREVIEW_CREDIT_GRANT_AMOUNT/u,
      );
    }
    assert.throws(
      () =>
        environment.validateServerEnvironment({
          ...configuredTarget(),
          NODE_ENV: "development",
        }),
      /HELIX_PREVIEW_CREDIT_GRANT_ENABLED/u,
    );
    const local = environment.validateServerEnvironment(configuredTarget());
    assert.equal(local.previewCreditGrantEnabled, true);
    assert.equal(local.previewCreditGrantAmount, 10);

    const hostedPreview = {
      ...configuredTarget({ NODE_ENV: "production" }),
      NETLIFY: "true",
      DEPLOY_ID: "preview-id",
      SITE_ID: "89a00a91-8730-40e6-ac92-be473f106a78",
      SITE_NAME: "helix-kreluna",
      PULL_REQUEST: "true",
      REVIEW_ID: "314",
      COMMIT_REF: "a".repeat(40),
      DEPLOY_PRIME_URL: "https://deploy-preview-314--helix-kreluna.netlify.app",
      HELIX_PREVIEW_EXPECTED_REVIEW_ID: "314",
      HELIX_PREVIEW_EXPECTED_COMMIT_REF: "a".repeat(40),
      CONTEXT: "deploy-preview",
      NETLIFY_DB_URL: "postgresql://preview:fixture@database.example.test/helix",
      VITE_PUBLIC_HOSTNAME: "deploy-preview-314--helix-kreluna.netlify.app",
      VITE_AUTH_ENABLED: "true",
      VITE_GROK_AUTH_ENABLED: "false",
      VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED: "true",
      BETTER_AUTH_SECRET: "A".repeat(32),
      BETTER_AUTH_URL: "https://deploy-preview-314--helix-kreluna.netlify.app",
      HELIX_AI_GATEWAY_ENABLED: "false",
      HELIX_QUEUE_DISPATCH_SECRET: "Q".repeat(32),
      GITHUB_TOKEN_ENCRYPTION_KEY: "1".repeat(64),
      GITHUB_TOKEN_KEY_VERSION: "v1",
    };
    assert.equal(
      environment.validateServerEnvironment(hostedPreview).previewCreditGrantEnabled,
      true,
    );
    assert.equal(environment.validateServerEnvironment(hostedPreview).grokAuthEnabled, false);
    assert.throws(
      () =>
        environment.validateServerEnvironment({
          ...hostedPreview,
          CONTEXT: "branch-deploy",
        }),
      /HELIX_PREVIEW_CREDIT_GRANT_ENABLED/u,
    );
    assert.throws(
      () =>
        environment.validateServerEnvironment({
          ...hostedPreview,
          DEPLOY_ID: undefined,
        }),
      /HELIX_PREVIEW_CREDIT_GRANT_ENABLED/u,
    );
    assert.throws(
      () =>
        environment.validateServerEnvironment({
          ...hostedPreview,
          CONTEXT: "production",
        }),
      /HELIX_PREVIEW_CREDIT_GRANT_ENABLED/u,
    );
    assert.throws(
      () =>
        environment.validateServerEnvironment({
          ...hostedPreview,
          STRIPE_BILLING_ENABLED: "true",
        }),
      /HELIX_PREVIEW_CREDIT_GRANT_ENABLED/u,
    );
  });

  await t.test("broker credentials remain a separate all-or-none opt-in", () => {
    const base = {
      NODE_ENV: "test",
      VITE_AUTH_ENABLED: "false",
      VITE_GROK_AUTH_ENABLED: "false",
    };
    assert.equal(environment.validateServerEnvironment(base).grokAuthEnabled, false);
    assert.throws(
      () =>
        environment.validateServerEnvironment({
          ...base,
          VITE_AUTH_ENABLED: "true",
          VITE_GROK_AUTH_ENABLED: "true",
        }),
      /GROK_AUTH_CLIENT_ID.*GROK_AUTH_CLIENT_SECRET/u,
    );
    assert.throws(
      () =>
        environment.validateServerEnvironment({
          ...base,
          GROK_AUTH_CLIENT_ID: "offline-client-id",
          GROK_AUTH_CLIENT_SECRET: "S".repeat(32),
        }),
      /VITE_GROK_AUTH_ENABLED/u,
    );
    assert.equal(
      environment.validateServerEnvironment({
        ...base,
        VITE_AUTH_ENABLED: "true",
        VITE_GROK_AUTH_ENABLED: "true",
        BETTER_AUTH_SECRET: "A".repeat(32),
        BETTER_AUTH_URL: "http://localhost:8080",
        GROK_AUTH_CLIENT_ID: "offline-client-id",
        GROK_AUTH_CLIENT_SECRET: "S".repeat(32),
      }).grokAuthEnabled,
      true,
    );
  });

  await t.test("the configured immutable target receives one concurrent ledger grant", async () => {
    await account("preview-target", "Target@Example.Test");
    await account("preview-decoy", "decoy@example.test");
    setGrantEnvironment(configuredTarget());

    assert.equal(grant.grantConfiguredPreviewTestCredits.length, 0);
    const [first, replay] = await Promise.all([
      grant.grantConfiguredPreviewTestCredits(),
      grant.grantConfiguredPreviewTestCredits(),
    ]);
    assert.deepEqual([first.was_applied, replay.was_applied].sort(), [false, true]);
    assert.deepEqual(await state("preview-target"), {
      balance: 20,
      ledger: [
        {
          action: "preview_test_grant",
          credits: 10,
          note: "Manual preview/test credit grant v1",
          project_id: null,
          idempotency_key: "preview-test-grant:manual:v1",
        },
      ],
    });
    assert.deepEqual(await state("preview-decoy"), { balance: 10, ledger: [] });
  });

  await t.test("a missing or email-mismatched target fails before the ledger", async () => {
    setGrantEnvironment(
      configuredTarget({ HELIX_PREVIEW_CREDIT_GRANT_EMAIL: "wrong@example.test" }),
    );
    await assert.rejects(
      grant.grantConfiguredPreviewTestCredits(),
      /PREVIEW_TEST_CREDIT_GRANT_TARGET_MISMATCH/u,
    );
    setGrantEnvironment(
      configuredTarget({
        HELIX_PREVIEW_CREDIT_GRANT_USER_ID: "missing-target",
        HELIX_PREVIEW_CREDIT_GRANT_EMAIL: "target@example.test",
      }),
    );
    await assert.rejects(
      grant.grantConfiguredPreviewTestCredits(),
      /PREVIEW_TEST_CREDIT_GRANT_TARGET_MISMATCH/u,
    );
    assert.deepEqual(await state("preview-target"), {
      balance: 20,
      ledger: [
        {
          action: "preview_test_grant",
          credits: 10,
          note: "Manual preview/test credit grant v1",
          project_id: null,
          idempotency_key: "preview-test-grant:manual:v1",
        },
      ],
    });
    assert.deepEqual(await state("preview-decoy"), { balance: 10, ledger: [] });
  });

  await t.test(
    "noncanonical amounts, hosted-only CLI mode, production and Stripe fail closed",
    async () => {
      for (const amount of ["9", "11", "20", "50"]) {
        setGrantEnvironment(configuredTarget({ HELIX_PREVIEW_CREDIT_GRANT_AMOUNT: amount }));
        assert.throws(
          () => grant.readPreviewTestCreditGrantConfiguration(),
          /PREVIEW_TEST_CREDIT_GRANT_CONFIGURATION_INVALID/u,
        );
        await assert.rejects(
          grant.grantConfiguredPreviewTestCredits(),
          /PREVIEW_TEST_CREDIT_GRANT_CONFIGURATION_INVALID/u,
        );
      }
      setGrantEnvironment(configuredTarget());
      await assert.rejects(
        grant.grantConfiguredPreviewTestCredits({ requireHostedPreview: true }),
        /PREVIEW_TEST_CREDIT_GRANT_FORBIDDEN/u,
      );
      setGrantEnvironment(configuredTarget({ CONTEXT: "production" }));
      await assert.rejects(
        grant.grantConfiguredPreviewTestCredits(),
        /PREVIEW_TEST_CREDIT_GRANT_FORBIDDEN/u,
      );
      setGrantEnvironment(configuredTarget({ STRIPE_BILLING_ENABLED: "true" }));
      await assert.rejects(
        grant.grantConfiguredPreviewTestCredits(),
        /PREVIEW_TEST_CREDIT_GRANT_FORBIDDEN/u,
      );
      assert.equal((await state("preview-target")).balance, 20);
    },
  );

  await t.test("no request path or standalone CLI can invoke the ledger helper", async () => {
    const vetraSource = await readFile(join(ROOT, "src/lib/server/vetra.ts"), "utf8");
    const ensureProfile = vetraSource.slice(
      vetraSource.indexOf("async function ensureProfile"),
      vetraSource.indexOf("function requestId"),
    );
    assert.match(ensureProfile, /values \(\$\{userId\}, 'free', 10\)/u);
    assert.doesNotMatch(vetraSource, /preview-credit-grant|grantConfiguredPreviewTestCredits/u);
    await assert.rejects(
      readFile(join(ROOT, "scripts/grant-preview-test-credits.mjs"), "utf8"),
      (error) => error?.code === "ENOENT",
    );
  });
});
