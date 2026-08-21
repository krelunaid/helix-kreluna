import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createServer } from "vite";

const ROOT = join(import.meta.dirname, "..");

const VALID_LOCAL_AUTH = {
  NODE_ENV: "test",
  VITE_AUTH_ENABLED: "true",
  VITE_GROK_AUTH_ENABLED: "true",
  VITE_GOOGLE_AUTH_ENABLED: "false",
  VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED: "false",
  GROK_AUTH_CLIENT_ID: "local-admin-test",
  GROK_AUTH_CLIENT_SECRET: "<fixture>",
  BETTER_AUTH_SECRET: "A".repeat(32),
  BETTER_AUTH_URL: "http://localhost:8080",
};

test("private admin console is identity-bound, aggregate-only and read-only", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());

  const [access, middleware, overview, environment, db] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/admin/access.ts"),
    vite.ssrLoadModule("/src/lib/server/admin/middleware.ts"),
    vite.ssrLoadModule("/src/lib/server/admin/overview.ts"),
    vite.ssrLoadModule("/src/lib/env.server.ts"),
    vite.ssrLoadModule("/src/lib/db.ts"),
  ]);
  const pg = await db.getPglite();
  t.after(() => pg.close());

  await t.test("the server-only identity pair is all-or-none and auth-dependent", () => {
    assert.equal(access.resolveAdminBinding({}), null);
    assert.throws(
      () => access.resolveAdminBinding({ HELIX_ADMIN_USER_ID: "operator-1" }),
      /Invalid admin binding configuration/u,
    );
    assert.throws(
      () => access.resolveAdminBinding({ HELIX_ADMIN_EMAIL: "owner@example.test" }),
      /Invalid admin binding configuration/u,
    );
    assert.throws(
      () =>
        access.resolveAdminBinding({
          HELIX_ADMIN_USER_ID: "operator-1",
          HELIX_ADMIN_EMAIL: "not-an-email",
        }),
      /Invalid admin binding configuration/u,
    );

    const binding = access.resolveAdminBinding({
      HELIX_ADMIN_USER_ID: " operator-1 ",
      HELIX_ADMIN_EMAIL: " OWNER@EXAMPLE.TEST ",
    });
    assert.deepEqual(binding, { userId: "operator-1", email: "owner@example.test" });
    assert.equal(
      environment.validateServerEnvironment({
        ...VALID_LOCAL_AUTH,
        HELIX_ADMIN_USER_ID: "operator-1",
        HELIX_ADMIN_EMAIL: "owner@example.test",
      }).adminConsoleEnabled,
      true,
    );
    assert.throws(
      () =>
        environment.validateServerEnvironment({
          ...VALID_LOCAL_AUTH,
          HELIX_ADMIN_USER_ID: "operator-1",
        }),
      /HELIX_ADMIN_EMAIL.*HELIX_ADMIN_USER_ID|HELIX_ADMIN_USER_ID.*HELIX_ADMIN_EMAIL/u,
    );
    assert.throws(
      () =>
        environment.validateServerEnvironment({
          VITE_AUTH_ENABLED: "false",
          HELIX_ADMIN_USER_ID: "operator-1",
          HELIX_ADMIN_EMAIL: "owner@example.test",
        }),
      /VITE_AUTH_ENABLED/u,
    );
  });

  await t.test(
    "signed-out, wrong-id and mismatched database identities are indistinguishable",
    async () => {
      const binding = { userId: "operator-1", email: "owner@example.test" };
      for (const userId of [null, undefined, "another-user"]) {
        assert.throws(
          () => access.assertAdminSessionId(userId, binding),
          (error) => error?.status === 404 && error?.message === "Not Found",
        );
      }
      assert.throws(
        () => access.assertAdminSessionId("operator-1", null),
        (error) => error?.status === 404 && error?.message === "Not Found",
      );
      assert.doesNotThrow(() => access.assertAdminSessionId("operator-1", binding));

      const calls = [];
      await assert.rejects(
        middleware.assertDatabaseAdminBinding(
          {
            query: async (text, params) => {
              calls.push({ text, params });
              return [];
            },
          },
          binding,
        ),
        (error) => error?.status === 404 && error?.message === "Not Found",
      );
      assert.equal(calls.length, 1);
      assert.match(calls[0].text, /"id" = \$1/u);
      assert.match(calls[0].text, /lower\("email"\) = \$2/u);
      assert.match(calls[0].text, /"emailVerified" = true/u);
      assert.deepEqual(calls[0].params, ["operator-1", "owner@example.test"]);
    },
  );

  await t.test("overview reports only aggregates and counts only paid Stripe money", async () => {
    const operatorId = "admin-console-fixture";
    await pg.query(
      `insert into "user" (
         "id", "name", "email", "emailVerified", "createdAt", "updatedAt"
       ) values ($1, $2, $3, true, now(), now())`,
      [operatorId, "Private Operator", "private-admin@example.test"],
    );
    await pg.query(
      `insert into "user" (
         "id", "name", "email", "emailVerified", "createdAt", "updatedAt"
       ) values ($1, $2, $3, false, now(), now())`,
      ["admin-console-customer", "Private Customer", "private-customer@example.test"],
    );
    await pg.query(
      "insert into profiles (user_id, plan, credits_balance) values ($1, 'free', 7), ($2, 'free', 13)",
      [operatorId, "admin-console-customer"],
    );
    await pg.query(
      `insert into projects (id, user_id, title, prompt, hosted)
       values ($1, $2, 'Private project', 'private fixture prompt', true)`,
      ["admin-console-project", operatorId],
    );
    await pg.query(
      `insert into credit_ledger (user_id, action, credits, note, idempotency_key)
       values
         ($1, 'fixture_grant', 15, 'private fixture', 'admin:grant:fixture'),
         ($1, 'fixture_spend', -5, 'private fixture', 'admin:spend:fixture')`,
      [operatorId],
    );
    await pg.query(
      `insert into build_jobs (
         id, project_id, user_id, payload, queue_status, idempotency_key,
         request_fingerprint, pipeline_version
       ) values ($1, $2, $3, $4, 'queued', $5, $6, 'helix-v3')`,
      [
        "admin-console-job",
        "admin-console-project",
        operatorId,
        JSON.stringify({ checkpoint: { pipelineVersion: "helix-v3" } }),
        "admin:job:fixture",
        "a".repeat(64),
      ],
    );
    await pg.query(
      `insert into build_job_ai_calls (
         call_id, job_id, attempt_number, logical_call_key, retry_index,
         agent_id, contract_id, provider, requested_model, reported_model,
         result_sha256, request_sha256, maximum_cost_usd_ticks, status,
         input_tokens, output_tokens, total_tokens, latency_ms,
         cost_usd_ticks, cost_kind, started_at, finished_at
       ) values (
         $1, $2, 1, 'fixture', 0, 'nova', 'fixture', 'openai', 'terra', 'terra',
         $3, $4, 9000000, 'succeeded', 20, 10, 30, 50,
         8000000, 'provider_actual', now(), now()
       )`,
      ["admin-console-call", "admin-console-job", "b".repeat(64), "c".repeat(64)],
    );

    for (const [eventId, livemode] of [
      ["evt_admin_paid", true],
      ["evt_admin_pending", true],
      ["evt_admin_test", false],
    ]) {
      await pg.query(
        `insert into stripe_webhook_events (
           event_id, event_type, livemode, provider_created,
           signature_verified_at, payload_sha256, status
         ) values ($1, 'checkout.session.completed', $2, 1, now(), $3, 'processed')`,
        [eventId, livemode, "d".repeat(64)],
      );
    }
    await pg.query(
      `insert into payment_ledger (
         kind, provider_object_id, livemode, user_id, status,
         amount_minor, currency, stripe_event_id
       ) values
         ('topup', 'pi_admin_paid', true, $1, 'paid', 2500, 'eur', 'evt_admin_paid'),
         ('topup', 'pi_admin_pending', true, $1, 'pending', 999999, 'eur', 'evt_admin_pending'),
         ('topup', 'pi_admin_test', false, $1, 'paid', 500, 'usd', 'evt_admin_test')`,
      [operatorId],
    );

    await middleware.assertDatabaseAdminBinding(await db.getSql(), {
      userId: operatorId,
      email: "private-admin@example.test",
    });
    const result = await overview.readAdminOverview(await db.getSql(), {
      dbSource: "pglite",
      stripeBillingEnabled: true,
      stripeMode: "test",
      aiGatewayEnabled: true,
      googleAuthEnabled: true,
    });

    assert.equal(result.users.total, 2);
    assert.equal(result.users.verified, 1);
    assert.deepEqual(result.projects, { total: 1, online: 1 });
    assert.equal(result.jobs.queued, 1);
    assert.deepEqual(result.credits, { balance: 20, granted: 15, spent: 5 });
    assert.equal(result.ai.calls, 1);
    assert.equal(result.ai.totalTokens, 30);
    assert.equal(result.ai.providerCostUsdTicks, "8000000");
    assert.deepEqual(result.revenue, [
      { currency: "eur", mode: "live", payments: 1, amountMinor: "2500" },
      { currency: "usd", mode: "test", payments: 1, amountMinor: "500" },
    ]);
    assert.equal(JSON.stringify(result).includes("private-admin@example.test"), false);
    assert.equal(JSON.stringify(result).includes("Private Operator"), false);
    assert.equal(JSON.stringify(result).includes("private fixture prompt"), false);
  });

  await t.test("source exposes no secret editor, raw key or public navigation", async () => {
    const [route, index, overviewSource, envPublic, header] = await Promise.all([
      readFile(join(ROOT, "src/routes/ops.tsx"), "utf8"),
      readFile(join(ROOT, "src/lib/server/admin/index.ts"), "utf8"),
      readFile(join(ROOT, "src/lib/server/admin/overview.ts"), "utf8"),
      readFile(join(ROOT, "src/lib/env.public.ts"), "utf8"),
      readFile(join(ROOT, "src/components/site-header.tsx"), "utf8"),
    ]);
    assert.match(route, /noindex, nofollow, noarchive, nosnippet/u);
    assert.match(
      index,
      /setResponseHeader\("Cache-Control", "private, no-store, max-age=0"\)/u,
    );
    assert.match(index, /setResponseHeader\("Referrer-Policy", "no-referrer"\)/u);
    assert.match(
      index,
      /setResponseHeader\("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet"\)/u,
    );
    assert.doesNotMatch(route, /title:\s*["']Helix Control["']/u);
    assert.match(route, /non si inseriscono e non si leggono/u);
    assert.doesNotMatch(route, /STRIPE_SECRET_KEY|GOOGLE_CLIENT_SECRET|OPENAI_API_KEY/u);
    assert.doesNotMatch(index, /\.\.\.serverEnv|STRIPE_SECRET_KEY|GOOGLE_CLIENT_SECRET/u);
    assert.match(overviewSource, /where provider = \$1 and status = \$2/u);
    assert.match(overviewSource, /\["stripe", "paid"\]/u);
    assert.doesNotMatch(
      overviewSource,
      /select\s+(?:"email"|email|"name"|name|prompt|receipt_url)/iu,
    );
    assert.doesNotMatch(envPublic, /HELIX_ADMIN_/u);
    assert.doesNotMatch(header, /["']\/ops["']/u);
    assert.doesNotMatch(route, /<input|<textarea|method=["']post["']/iu);
  });
});
