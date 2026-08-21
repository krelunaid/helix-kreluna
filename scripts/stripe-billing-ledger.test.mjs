import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationsUrl = new URL("../migrations/", import.meta.url);

async function applyMigration(pg, name) {
  await pg.exec(await readFile(new URL(name, migrationsUrl), "utf8"));
}

async function billingDatabase(t) {
  const pg = new PGlite();
  await pg.waitReady;
  t.after(() => pg.close());
  for (const name of ["0002_vetra.sql", "0005_billing_integrity.sql", "0018_stripe_billing.sql"]) {
    await applyMigration(pg, name);
  }
  return pg;
}

async function insertVerifiedEvent(pg, id, type, livemode = false) {
  await pg.query(
    `insert into stripe_webhook_events (
       event_id, event_type, api_version, livemode, provider_created,
       signature_verified_at, payload, payload_sha256
     ) values ($1, $2, '2026-07-29.dahlia', $3, 1787256000, now(), '{}', $4)`,
    [id, type, livemode, "a".repeat(64)],
  );
}

async function applyVerifiedCredit(pg, input) {
  return pg.query(
    `select * from apply_verified_stripe_credit(
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
     )`,
    [
      input.eventId,
      input.kind,
      input.providerObjectId,
      input.userId,
      input.amountMinor,
      input.currency,
      input.credits,
      input.plan ?? null,
      input.checkoutSessionId ?? null,
      input.paymentIntentId ?? null,
      input.invoiceId ?? null,
      input.subscriptionId ?? null,
      null,
      null,
      null,
      null,
      "2026-08-20T12:00:00.000Z",
      input.livemode ?? false,
      "Stripe payment verified by test",
    ],
  );
}

async function seedCheckout(pg, input) {
  await pg.query(
    `insert into billing_customers (
       id, user_id, stripe_customer_id, status, livemode
     ) values ($1, $2, $3, 'ready', $4)`,
    [input.customerRowId, input.userId, input.stripeCustomerId, input.livemode ?? false],
  );
  await pg.query(
    `insert into billing_checkout_requests (
       id, user_id, client_request_id, kind, sku, stripe_price_id,
       request_fingerprint, status, billing_customer_id, stripe_customer_id,
       stripe_checkout_session_id, stripe_checkout_url, expected_amount_minor,
       expected_currency, expected_credits, livemode
     ) values (
       $1, $2, $3, $4, $5, $6, $7, 'open', $8, $9, $10,
       'https://checkout.stripe.test/session', $11, $12, $13, $14
     )`,
    [
      input.checkoutId,
      input.userId,
      input.clientRequestId,
      input.kind,
      input.sku,
      input.priceId,
      "b".repeat(64),
      input.customerRowId,
      input.stripeCustomerId,
      input.sessionId,
      input.amountMinor,
      input.currency,
      input.credits,
      input.livemode ?? false,
    ],
  );
}

test("verified top-up grants once and an economic replay is rejected", async (t) => {
  const pg = await billingDatabase(t);
  await pg.query(
    "insert into profiles (user_id, plan, credits_balance) values ('user-topup', 'free', 10)",
  );
  await seedCheckout(pg, {
    customerRowId: "billing_customer_topup",
    userId: "user-topup",
    stripeCustomerId: "cus_topup",
    checkoutId: "checkout_topup",
    clientRequestId: "90db1682-7465-4da5-9c0b-b96b1cfd8cb6",
    kind: "topup",
    sku: "extra_50",
    priceId: "price_extra50",
    sessionId: "cs_test_topup",
    amountMinor: 1500,
    currency: "eur",
    credits: 50,
  });
  await insertVerifiedEvent(pg, "evt_topup_paid_1", "checkout.session.completed");

  const first = await applyVerifiedCredit(pg, {
    eventId: "evt_topup_paid_1",
    kind: "topup",
    providerObjectId: "cs_test_topup",
    userId: "user-topup",
    amountMinor: 1500,
    currency: "eur",
    credits: 50,
    checkoutSessionId: "cs_test_topup",
    paymentIntentId: "pi_topup",
  });
  assert.equal(first.rows[0].was_applied, true);
  assert.equal(first.rows[0].balance_after, 60);

  await insertVerifiedEvent(pg, "evt_topup_paid_2", "checkout.session.async_payment_succeeded");
  const replay = await applyVerifiedCredit(pg, {
    eventId: "evt_topup_paid_2",
    kind: "topup",
    providerObjectId: "cs_test_topup",
    userId: "user-topup",
    amountMinor: 1500,
    currency: "eur",
    credits: 50,
    checkoutSessionId: "cs_test_topup",
    paymentIntentId: "pi_topup",
  });
  assert.equal(replay.rows[0].was_applied, false);
  assert.equal(replay.rows[0].balance_after, 60);

  await insertVerifiedEvent(pg, "evt_topup_conflict", "checkout.session.completed");
  await assert.rejects(
    applyVerifiedCredit(pg, {
      eventId: "evt_topup_conflict",
      kind: "topup",
      providerObjectId: "cs_test_topup",
      userId: "user-topup",
      amountMinor: 1600,
      currency: "eur",
      credits: 50,
      checkoutSessionId: "cs_test_topup",
    }),
    /STRIPE_ECONOMIC_REPLAY_CONFLICT/,
  );

  await insertVerifiedEvent(pg, "evt_topup_relation_conflict", "checkout.session.completed");
  await assert.rejects(
    applyVerifiedCredit(pg, {
      eventId: "evt_topup_relation_conflict",
      kind: "topup",
      providerObjectId: "cs_test_topup",
      userId: "user-topup",
      amountMinor: 1500,
      currency: "eur",
      credits: 50,
      checkoutSessionId: "cs_test_topup",
      paymentIntentId: "pi_conflicting_relation",
    }),
    /STRIPE_ECONOMIC_REPLAY_CONFLICT/,
  );

  const state = await pg.query(
    `select p.credits_balance, c.status as checkout_status,
       (select count(*)::int from payment_ledger where user_id = p.user_id) as payments,
       (select count(*)::int from credit_ledger where user_id = p.user_id) as grants
     from profiles p
     join billing_checkout_requests c on c.user_id = p.user_id
     where p.user_id = 'user-topup'`,
  );
  assert.deepEqual(state.rows[0], {
    credits_balance: 60,
    checkout_status: "completed",
    payments: 1,
    grants: 1,
  });
  await applyMigration(pg, "0018_stripe_billing.sql");
  const afterRerun = await pg.query(
    "select credits_balance from profiles where user_id = 'user-topup'",
  );
  assert.equal(afterRerun.rows[0].credits_balance, 60);
});

test("a verified paid subscription invoice activates the plan atomically with its grant", async (t) => {
  const pg = await billingDatabase(t);
  await pg.query(
    "insert into profiles (user_id, plan, credits_balance) values ('user-plan', 'free', 10)",
  );
  await seedCheckout(pg, {
    customerRowId: "billing_customer_plan",
    userId: "user-plan",
    stripeCustomerId: "cus_plan",
    checkoutId: "checkout_plan",
    clientRequestId: "5ad848a8-c9b7-4d03-94c6-692e817ffbc9",
    kind: "subscription",
    sku: "standard",
    priceId: "price_standard",
    sessionId: "cs_test_plan",
    amountMinor: 2000,
    currency: "usd",
    credits: 100,
  });
  await insertVerifiedEvent(pg, "evt_invoice_paid", "invoice.paid");
  await pg.query(
    `insert into billing_subscriptions (
       stripe_subscription_id, checkout_request_id, user_id, billing_customer_id,
       stripe_customer_id,
       plan, stripe_price_id, status, livemode, last_event_created, last_event_id
     ) values (
       'sub_plan', 'checkout_plan', 'user-plan', 'billing_customer_plan', 'cus_plan',
       'standard', 'price_standard', 'active', false, 1787256000, 'evt_invoice_paid'
     )`,
  );

  const result = await applyVerifiedCredit(pg, {
    eventId: "evt_invoice_paid",
    kind: "subscription_invoice",
    providerObjectId: "in_paid_cycle_1",
    userId: "user-plan",
    amountMinor: 2000,
    currency: "usd",
    credits: 100,
    plan: "standard",
    checkoutSessionId: "cs_test_plan",
    invoiceId: "in_paid_cycle_1",
    subscriptionId: "sub_plan",
  });
  assert.equal(result.rows[0].was_applied, true);

  const profile = await pg.query(
    "select plan, credits_balance from profiles where user_id = 'user-plan'",
  );
  assert.deepEqual(profile.rows[0], { plan: "standard", credits_balance: 110 });
  const event = await pg.query(
    "select status, payload from stripe_webhook_events where event_id = 'evt_invoice_paid'",
  );
  assert.deepEqual(event.rows[0], { status: "processed", payload: null });

  // A real paid invoice can be delivered late. It still receives its paid
  // credits, but must not resurrect a subscription already canceled by a
  // newer lifecycle event.
  await pg.query(
    `update billing_subscriptions
     set status = 'canceled', last_event_created = 1787257000,
         last_event_id = 'evt_subscription_deleted'
     where stripe_subscription_id = 'sub_plan'`,
  );
  await pg.query("update profiles set plan = 'free' where user_id = 'user-plan'");
  await insertVerifiedEvent(pg, "evt_invoice_paid_late", "invoice.paid");
  await applyVerifiedCredit(pg, {
    eventId: "evt_invoice_paid_late",
    kind: "subscription_invoice",
    providerObjectId: "in_paid_cycle_late",
    userId: "user-plan",
    amountMinor: 2000,
    currency: "usd",
    credits: 100,
    plan: "standard",
    checkoutSessionId: "cs_test_plan",
    invoiceId: "in_paid_cycle_late",
    subscriptionId: "sub_plan",
  });
  const afterLateInvoice = await pg.query(
    "select plan, credits_balance from profiles where user_id = 'user-plan'",
  );
  assert.deepEqual(afterLateInvoice.rows[0], { plan: "free", credits_balance: 210 });
});

test("the financial boundary refuses a missing verified-event record", async (t) => {
  const pg = await billingDatabase(t);
  await pg.query(
    "insert into profiles (user_id, plan, credits_balance) values ('user-unsigned', 'free', 10)",
  );
  await assert.rejects(
    applyVerifiedCredit(pg, {
      eventId: "evt_never_verified",
      kind: "topup",
      providerObjectId: "cs_unsigned",
      userId: "user-unsigned",
      amountMinor: 1500,
      currency: "eur",
      credits: 50,
      checkoutSessionId: "cs_unsigned",
    }),
    /STRIPE_EVENT_NOT_FOUND/,
  );
  const profile = await pg.query(
    "select credits_balance from profiles where user_id = 'user-unsigned'",
  );
  assert.equal(profile.rows[0].credits_balance, 10);
});
