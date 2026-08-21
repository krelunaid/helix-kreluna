import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createServer as createViteServer } from "vite";

const ROOT = join(import.meta.dirname, "..");

async function loadServerModule(t, path) {
  const vite = await createViteServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  return vite.ssrLoadModule(path);
}

function loadCheckout(t) {
  return loadServerModule(t, "/src/lib/server/billing/checkout.server.ts");
}

function expectedRequest(overrides = {}) {
  return {
    userId: "user-one",
    clientRequestId: "e89e1f9e-d2c2-44dc-8640-00d3c261af64",
    kind: "subscription",
    sku: "standard",
    priceId: "price_standard",
    requestFingerprint: "a".repeat(64),
    amountMinor: 1900,
    currency: "usd",
    credits: 100,
    livemode: false,
    ...overrides,
  };
}

function checkoutRow(overrides = {}) {
  const expected = expectedRequest();
  return {
    id: "checkout-one",
    user_id: expected.userId,
    client_request_id: expected.clientRequestId,
    kind: expected.kind,
    sku: expected.sku,
    stripe_price_id: expected.priceId,
    request_fingerprint: expected.requestFingerprint,
    expected_amount_minor: expected.amountMinor,
    expected_currency: expected.currency,
    expected_credits: expected.credits,
    livemode: expected.livemode,
    status: "open",
    stripe_checkout_session_id: "cs_test_original",
    stripe_checkout_url: "https://checkout.stripe.test/original",
    ...overrides,
  };
}

function cancellationOnlyConfiguration(overrides = {}) {
  return {
    id: "bpc_cancellationonly",
    object: "billing_portal.configuration",
    active: true,
    livemode: false,
    login_page: { enabled: false, url: null },
    features: {
      customer_update: { enabled: false, allowed_updates: [] },
      invoice_history: { enabled: false },
      payment_method_update: { enabled: false, payment_method_configuration: null },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
        cancellation_reason: { enabled: false, options: [] },
      },
      subscription_update: {
        enabled: false,
        default_allowed_updates: [],
      },
    },
    ...overrides,
  };
}

test("Checkout replays only the exact immutable request", async (t) => {
  const checkout = await loadCheckout(t);
  const expected = expectedRequest();
  const stored = checkoutRow();

  assert.equal(checkout.isImmutableCheckoutReplay(stored, expected), true);
  assert.deepEqual(checkout.replayImmutableCheckoutOrThrow(stored, expected), {
    kind: "checkout",
    sessionId: "cs_test_original",
    url: "https://checkout.stripe.test/original",
  });

  for (const changed of [
    { clientRequestId: "a99f9a8b-b70c-472c-a880-82471b24046a" },
    { sku: "pro" },
    { priceId: "price_pro" },
    { requestFingerprint: "b".repeat(64) },
    { amountMinor: 4900 },
    { credits: 500 },
    { livemode: true },
  ]) {
    assert.equal(checkout.isImmutableCheckoutReplay(stored, expectedRequest(changed)), false);
    assert.throws(
      () => checkout.replayImmutableCheckoutOrThrow(stored, expectedRequest(changed)),
      (error) => error?.code === "CHECKOUT_IN_PROGRESS" && error?.retryable === false,
    );
  }

  assert.throws(
    () =>
      checkout.replayImmutableCheckoutOrThrow(
        checkoutRow({ stripe_checkout_session_id: null, stripe_checkout_url: null }),
        expected,
      ),
    (error) => error?.code === "CHECKOUT_IN_PROGRESS",
  );
});

test("Portal policy accepts only an active, mode-bound cancellation-only configuration", async (t) => {
  const checkout = await loadCheckout(t);
  const expected = { id: "bpc_cancellationonly", livemode: false };
  const valid = cancellationOnlyConfiguration();
  assert.equal(checkout.isCancellationOnlyPortalConfiguration(valid, expected), true);

  const invalidConfigurations = [
    cancellationOnlyConfiguration({ id: "bpc_other" }),
    cancellationOnlyConfiguration({ active: false }),
    cancellationOnlyConfiguration({ livemode: true }),
    cancellationOnlyConfiguration({ login_page: { enabled: true, url: "https://example.test" } }),
    cancellationOnlyConfiguration({
      features: {
        ...valid.features,
        subscription_cancel: { ...valid.features.subscription_cancel, enabled: false },
      },
    }),
    cancellationOnlyConfiguration({
      features: {
        ...valid.features,
        subscription_cancel: { ...valid.features.subscription_cancel, mode: "immediately" },
      },
    }),
    cancellationOnlyConfiguration({
      features: {
        ...valid.features,
        subscription_update: { ...valid.features.subscription_update, enabled: true },
      },
    }),
    cancellationOnlyConfiguration({
      features: {
        ...valid.features,
        customer_update: { enabled: true, allowed_updates: ["email"] },
      },
    }),
    cancellationOnlyConfiguration({
      features: { ...valid.features, invoice_history: { enabled: true } },
    }),
    cancellationOnlyConfiguration({
      features: {
        ...valid.features,
        payment_method_update: { enabled: true, payment_method_configuration: null },
      },
    }),
  ];
  for (const configuration of invalidConfigurations) {
    assert.equal(checkout.isCancellationOnlyPortalConfiguration(configuration, expected), false);
  }
});

test("billing configuration requires the explicit Portal configuration ID", async (t) => {
  const config = await loadServerModule(t, "/src/lib/server/billing/config.ts");
  const valid = {
    stripeBillingEnabled: true,
    STRIPE_MODE: "test",
    STRIPE_SECRET_KEY: "sk_test_localonly",
    STRIPE_WEBHOOK_SECRET: "whsec_localonly",
    STRIPE_PRICE_STANDARD: "price_standard",
    STRIPE_PRICE_PRO: "price_pro",
    STRIPE_PRICE_TEAM: "price_team",
    STRIPE_PRICE_EXTRA_50: "price_extra50",
    STRIPE_PORTAL_CONFIGURATION_ID: "bpc_cancellationonly",
    HELIX_BILLING_DISPATCH_SECRET: "D".repeat(32),
    publicOrigin: "http://localhost:8080",
  };

  assert.equal(
    config.resolveStripeBillingConfiguration({ ...valid, stripeBillingEnabled: false }),
    null,
  );
  assert.throws(
    () =>
      config.resolveStripeBillingConfiguration({
        ...valid,
        STRIPE_PORTAL_CONFIGURATION_ID: undefined,
      }),
    (error) => error?.code === "PAYMENTS_NOT_AVAILABLE",
  );
  assert.equal(
    config.resolveStripeBillingConfiguration(valid).portalConfigurationId,
    "bpc_cancellationonly",
  );
});

test("the open-subscription race leaves one winner and cannot leak its URL", async (t) => {
  const checkout = await loadCheckout(t);
  const pg = new PGlite();
  await pg.waitReady;
  t.after(() => pg.close());
  for (const name of ["0002_vetra.sql", "0005_billing_integrity.sql", "0018_stripe_billing.sql"]) {
    const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8");
    await pg.exec(sql);
  }

  await pg.query(
    `insert into billing_customers (id, user_id, stripe_customer_id, status, livemode)
     values ('customer-one', 'user-one', 'cus_test_one', 'ready', false)`,
  );
  const insert = (id, requestId, sku, priceId, fingerprint) =>
    pg.query(
      `insert into billing_checkout_requests (
         id, user_id, client_request_id, kind, sku, stripe_price_id,
         request_fingerprint, status, billing_customer_id, stripe_customer_id,
         stripe_checkout_session_id, stripe_checkout_url, expected_amount_minor,
         expected_currency, expected_credits, livemode
       ) values (
         $1, 'user-one', $2, 'subscription', $3, $4, $5, 'open',
         'customer-one', 'cus_test_one', $6, $7, 1900, 'usd', 100, false
       )`,
      [
        id,
        requestId,
        sku,
        priceId,
        fingerprint,
        `cs_test_${id}`,
        `https://checkout.stripe.test/${id}`,
      ],
    );

  const requests = [
    {
      id: "winner-standard",
      requestId: "e89e1f9e-d2c2-44dc-8640-00d3c261af64",
      sku: "standard",
      priceId: "price_standard",
      fingerprint: "a".repeat(64),
    },
    {
      id: "loser-pro",
      requestId: "a99f9a8b-b70c-472c-a880-82471b24046a",
      sku: "pro",
      priceId: "price_pro",
      fingerprint: "b".repeat(64),
    },
  ];
  const race = await Promise.allSettled(
    requests.map((request) =>
      insert(request.id, request.requestId, request.sku, request.priceId, request.fingerprint),
    ),
  );
  assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(race.filter((result) => result.status === "rejected").length, 1);

  const result = await pg.query(
    `select id, user_id, client_request_id, kind, sku, stripe_price_id,
            request_fingerprint, expected_amount_minor, expected_currency,
            expected_credits, livemode, status, stripe_checkout_session_id,
            stripe_checkout_url
     from billing_checkout_requests where user_id = 'user-one' and livemode = false`,
  );
  assert.equal(result.rows.length, 1);
  const stored = result.rows[0];
  const losingRequest = requests.find((request) => request.id !== stored.id);
  assert.ok(losingRequest);
  assert.throws(
    () =>
      checkout.replayImmutableCheckoutOrThrow(stored, {
        userId: "user-one",
        clientRequestId: losingRequest.requestId,
        kind: "subscription",
        sku: losingRequest.sku,
        priceId: losingRequest.priceId,
        requestFingerprint: losingRequest.fingerprint,
        amountMinor: 1900,
        currency: "usd",
        credits: 100,
        livemode: false,
      }),
    (error) => error?.code === "CHECKOUT_IN_PROGRESS",
  );
});
