import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const API_VERSION = "2026-07-29.dahlia";

async function loadModules(t) {
  const priorDatabaseUrl = process.env.DATABASE_URL;
  const priorNetlify = process.env.NETLIFY;
  delete process.env.DATABASE_URL;
  delete process.env.NETLIFY;
  t.after(() => {
    if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = priorDatabaseUrl;
    if (priorNetlify === undefined) delete process.env.NETLIFY;
    else process.env.NETLIFY = priorNetlify;
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
  return {
    db: await vite.ssrLoadModule("/src/lib/db.ts"),
    queue: await vite.ssrLoadModule("/src/lib/server/billing/queue.ts"),
    processor: await vite.ssrLoadModule("/src/lib/server/billing/processor.ts"),
  };
}

function stripeEvent({ id, type, livemode, created, object }) {
  return {
    id,
    object: "event",
    api_version: API_VERSION,
    created,
    livemode,
    pending_webhooks: 1,
    request: null,
    type,
    data: { object },
  };
}

async function processEvent(modules, event, expected = "processed") {
  const payload = JSON.stringify(event);
  assert.deepEqual(await modules.queue.enqueueVerifiedStripeEvent(event, payload), {
    eventId: event.id,
    livemode: event.livemode,
    dispatch: true,
  });
  const actual = await modules.processor.processStripeEvent(event.id, event.livemode);
  if (actual !== expected) {
    const sql = await modules.db.getSql();
    const failure = await sql.query(
      `select status, last_error_code, attempt_count
       from stripe_webhook_events where event_id = $1 and livemode = $2`,
      [event.id, event.livemode],
    );
    assert.equal(actual, expected, JSON.stringify(failure[0] ?? null));
  }
}

async function seedProfile(sql, userId) {
  await sql`
    insert into profiles (user_id, plan, credits_balance)
    values (${userId}, 'free', 10)
  `;
}

async function seedCustomer(sql, input) {
  await sql`
    insert into billing_customers (
      id, user_id, stripe_customer_id, status, livemode
    ) values (
      ${input.id}, ${input.userId}, ${input.stripeCustomerId}, 'ready', ${input.livemode}
    )
  `;
}

async function seedCheckout(sql, input) {
  await sql`
    insert into billing_checkout_requests (
      id, user_id, client_request_id, kind, sku, stripe_price_id,
      request_fingerprint, status, billing_customer_id, stripe_customer_id,
      stripe_checkout_session_id, stripe_checkout_url, expected_amount_minor,
      expected_currency, expected_credits, livemode, created_at
    ) values (
      ${input.id}, ${input.userId}, ${input.clientRequestId}, ${input.kind}, ${input.sku},
      ${input.priceId}, ${"c".repeat(64)}, 'open', ${input.customerId},
      ${input.stripeCustomerId}, ${input.sessionId},
      'https://checkout.stripe.test/session', ${input.amountMinor}, ${input.currency},
      ${input.credits}, ${input.livemode}, ${input.createdAt ?? "2026-08-20T10:00:00Z"}
    )
  `;
}

test("a subscription keeps its immutable Checkout relation when a newer top-up exists", async (t) => {
  const modules = await loadModules(t);
  const sql = await modules.db.getSql();
  const suffix = randomUUID().replaceAll("-", "");
  const userId = `relation-user-${suffix}`;
  const customerId = `relation-customer-${suffix}`;
  const stripeCustomerId = `cus_relation_${suffix}`;
  const subscriptionCheckoutId = `checkout_subscription_${suffix}`;
  const subscriptionSessionId = `cs_test_subscription_${suffix}`;
  const subscriptionId = `sub_relation_${suffix}`;
  const topupCheckoutId = `checkout_topup_${suffix}`;

  await seedProfile(sql, userId);
  await seedCustomer(sql, { id: customerId, userId, stripeCustomerId, livemode: false });
  await seedCheckout(sql, {
    id: subscriptionCheckoutId,
    userId,
    clientRequestId: randomUUID(),
    kind: "subscription",
    sku: "standard",
    priceId: "price_relationstandard",
    customerId,
    stripeCustomerId,
    sessionId: subscriptionSessionId,
    amountMinor: 2000,
    currency: "usd",
    credits: 100,
    livemode: false,
    createdAt: "2026-08-20T10:00:00Z",
  });
  await processEvent(
    modules,
    stripeEvent({
      id: `evt_subscription_created_${suffix}`,
      type: "customer.subscription.created",
      livemode: false,
      created: 1787210000,
      object: {
        id: subscriptionId,
        customer: stripeCustomerId,
        status: "incomplete",
        cancel_at_period_end: false,
        metadata: { helix_checkout_id: subscriptionCheckoutId },
        items: {
          data: [
            {
              price: { id: "price_relationstandard" },
              current_period_start: 1787210000,
              current_period_end: 1789802000,
            },
          ],
        },
      },
    }),
  );

  await seedCheckout(sql, {
    id: topupCheckoutId,
    userId,
    clientRequestId: randomUUID(),
    kind: "topup",
    sku: "extra_50",
    priceId: "price_relationextra50",
    customerId,
    stripeCustomerId,
    sessionId: `cs_test_newer_topup_${suffix}`,
    amountMinor: 1500,
    currency: "eur",
    credits: 50,
    livemode: false,
    createdAt: "2026-08-20T11:00:00Z",
  });

  await processEvent(
    modules,
    stripeEvent({
      id: `evt_subscription_invoice_${suffix}`,
      type: "invoice.paid",
      livemode: false,
      created: 1787211000,
      object: {
        id: `in_relation_${suffix}`,
        status: "paid",
        billing_reason: "subscription_cycle",
        amount_paid: 2000,
        currency: "usd",
        customer: stripeCustomerId,
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: subscriptionId, metadata: {} },
        },
        lines: {
          data: [
            {
              pricing: { price_details: { price: "price_relationstandard" } },
              period: { start: 1787211000, end: 1789803000 },
            },
          ],
        },
      },
    }),
  );

  const state = await sql.query(
    `select subscription.checkout_request_id, subscription.status,
            profile.plan, profile.credits_balance
     from billing_subscriptions as subscription
     join profiles as profile on profile.user_id = subscription.user_id
     where subscription.stripe_subscription_id = $1 and subscription.livemode = false`,
    [subscriptionId],
  );
  assert.deepEqual(state[0], {
    checkout_request_id: subscriptionCheckoutId,
    status: "active",
    plan: "standard",
    credits_balance: 110,
  });
  await assert.rejects(
    sql.query(
      `update billing_subscriptions set checkout_request_id = $1
       where stripe_subscription_id = $2 and livemode = false`,
      [topupCheckoutId, subscriptionId],
    ),
    /BILLING_SUBSCRIPTION_IDENTITY_IMMUTABLE/,
  );
});

test("test and live Stripe ids remain independent across inbox and ledgers", async (t) => {
  const modules = await loadModules(t);
  const sql = await modules.db.getSql();
  const suffix = randomUUID().replaceAll("-", "");
  const userId = `dual-mode-user-${suffix}`;
  const stripeCustomerId = `cus_shared_${suffix}`;
  const sessionId = `cs_shared_${suffix}`;
  const eventId = `evt_shared_${suffix}`;
  const requestId = randomUUID();
  await seedProfile(sql, userId);

  for (const livemode of [false, true]) {
    const mode = livemode ? "live" : "test";
    const customerId = `customer_${mode}_${suffix}`;
    const checkoutId = `checkout_${mode}_${suffix}`;
    await seedCustomer(sql, { id: customerId, userId, stripeCustomerId, livemode });
    await seedCheckout(sql, {
      id: checkoutId,
      userId,
      clientRequestId: requestId,
      kind: "topup",
      sku: "extra_50",
      priceId: `price_${mode}${suffix}`,
      customerId,
      stripeCustomerId,
      sessionId,
      amountMinor: 1500,
      currency: "eur",
      credits: 50,
      livemode,
    });
    await processEvent(
      modules,
      stripeEvent({
        id: eventId,
        type: "checkout.session.completed",
        livemode,
        created: livemode ? 1787220001 : 1787220000,
        object: {
          id: sessionId,
          mode: "payment",
          payment_status: "paid",
          amount_subtotal: 1500,
          amount_total: 1500,
          currency: "eur",
          customer: stripeCustomerId,
          payment_intent: `pi_${mode}_${suffix}`,
          client_reference_id: checkoutId,
          metadata: { helix_checkout_id: checkoutId },
        },
      }),
    );
  }

  const state = await sql.query(
    `select
       (select count(*)::int from billing_customers where user_id = $1) as customers,
       (select count(*)::int from billing_checkout_requests where user_id = $1) as checkouts,
       (select count(*)::int from stripe_webhook_events where event_id = $2) as events,
       (select count(*)::int from payment_ledger where user_id = $1) as payments,
       (select count(*)::int from credit_ledger where user_id = $1) as grants,
       credits_balance
     from profiles where user_id = $1`,
    [userId, eventId],
  );
  assert.deepEqual(state[0], {
    customers: 2,
    checkouts: 2,
    events: 2,
    payments: 2,
    grants: 2,
    credits_balance: 110,
  });
});

test("a top-up invoice arriving first is persisted and reconciled after Checkout", async (t) => {
  const modules = await loadModules(t);
  const sql = await modules.db.getSql();
  const suffix = randomUUID().replaceAll("-", "");
  const userId = `receipt-user-${suffix}`;
  const customerId = `receipt-customer-${suffix}`;
  const stripeCustomerId = `cus_receipt_${suffix}`;
  const checkoutId = `checkout_receipt_${suffix}`;
  const sessionId = `cs_test_receipt_${suffix}`;
  const invoiceId = `in_receipt_${suffix}`;
  const paymentIntentId = `pi_receipt_${suffix}`;
  await seedProfile(sql, userId);
  await seedCustomer(sql, { id: customerId, userId, stripeCustomerId, livemode: false });
  await seedCheckout(sql, {
    id: checkoutId,
    userId,
    clientRequestId: randomUUID(),
    kind: "topup",
    sku: "extra_50",
    priceId: "price_receiptextra50",
    customerId,
    stripeCustomerId,
    sessionId,
    amountMinor: 1500,
    currency: "eur",
    credits: 50,
    livemode: false,
  });

  await processEvent(
    modules,
    stripeEvent({
      id: `evt_invoice_first_${suffix}`,
      type: "invoice.paid",
      livemode: false,
      created: 1787230000,
      object: {
        id: invoiceId,
        status: "paid",
        amount_paid: 1500,
        currency: "eur",
        customer: stripeCustomerId,
        metadata: { helix_checkout_id: checkoutId },
        hosted_invoice_url: `https://invoice.stripe.test/${invoiceId}`,
        invoice_pdf: `https://invoice.stripe.test/${invoiceId}.pdf`,
        lines: {
          data: [{ pricing: { price_details: { price: "price_receiptextra50" } } }],
        },
      },
    }),
  );
  const pending = await sql.query(
    `select receipt.payment_ledger_id, profile.credits_balance
     from stripe_invoice_receipts as receipt
     join billing_checkout_requests as checkout on checkout.id = receipt.checkout_request_id
     join profiles as profile on profile.user_id = checkout.user_id
     where receipt.stripe_invoice_id = $1 and receipt.livemode = false`,
    [invoiceId],
  );
  assert.deepEqual(pending[0], { payment_ledger_id: null, credits_balance: 10 });

  await processEvent(
    modules,
    stripeEvent({
      id: `evt_checkout_after_invoice_${suffix}`,
      type: "checkout.session.completed",
      livemode: false,
      created: 1787230001,
      object: {
        id: sessionId,
        mode: "payment",
        payment_status: "paid",
        amount_subtotal: 1500,
        amount_total: 1500,
        currency: "eur",
        customer: stripeCustomerId,
        payment_intent: paymentIntentId,
        client_reference_id: checkoutId,
        metadata: { helix_checkout_id: checkoutId },
      },
    }),
  );
  const reconciled = await sql.query(
    `select payment.stripe_invoice_id, payment.hosted_invoice_url,
            payment.invoice_pdf_url, receipt.payment_ledger_id,
            payment.id, profile.credits_balance,
            (select count(*)::int from credit_ledger where user_id = $2) as grants
     from payment_ledger as payment
     join stripe_invoice_receipts as receipt
       on receipt.stripe_invoice_id = payment.stripe_invoice_id
      and receipt.livemode = payment.livemode
     join profiles as profile on profile.user_id = payment.user_id
     where payment.stripe_checkout_session_id = $1 and payment.user_id = $2`,
    [sessionId, userId],
  );
  assert.equal(reconciled[0].stripe_invoice_id, invoiceId);
  assert.equal(reconciled[0].payment_ledger_id, reconciled[0].id);
  assert.equal(reconciled[0].hosted_invoice_url, `https://invoice.stripe.test/${invoiceId}`);
  assert.equal(reconciled[0].invoice_pdf_url, `https://invoice.stripe.test/${invoiceId}.pdf`);
  assert.equal(reconciled[0].credits_balance, 60);
  assert.equal(reconciled[0].grants, 1);
});

test("refund and dispute events are durable manual reviews and never revoke credits", async (t) => {
  const modules = await loadModules(t);
  const sql = await modules.db.getSql();
  const suffix = randomUUID().replaceAll("-", "");
  const userId = `adjustment-user-${suffix}`;
  const customerId = `adjustment-customer-${suffix}`;
  const stripeCustomerId = `cus_adjustment_${suffix}`;
  const checkoutId = `checkout_adjustment_${suffix}`;
  const sessionId = `cs_test_adjustment_${suffix}`;
  const paymentIntentId = `pi_adjustment_${suffix}`;
  const chargeId = `ch_adjustment_${suffix}`;
  await seedProfile(sql, userId);
  await seedCustomer(sql, { id: customerId, userId, stripeCustomerId, livemode: false });
  await seedCheckout(sql, {
    id: checkoutId,
    userId,
    clientRequestId: randomUUID(),
    kind: "topup",
    sku: "extra_50",
    priceId: "price_adjustmentextra50",
    customerId,
    stripeCustomerId,
    sessionId,
    amountMinor: 1500,
    currency: "eur",
    credits: 50,
    livemode: false,
  });
  await processEvent(
    modules,
    stripeEvent({
      id: `evt_adjustment_payment_${suffix}`,
      type: "checkout.session.completed",
      livemode: false,
      created: 1787240000,
      object: {
        id: sessionId,
        mode: "payment",
        payment_status: "paid",
        amount_subtotal: 1500,
        currency: "eur",
        customer: stripeCustomerId,
        payment_intent: paymentIntentId,
        client_reference_id: checkoutId,
        metadata: { helix_checkout_id: checkoutId },
      },
    }),
  );

  const refundEvent = stripeEvent({
    id: `evt_refund_${suffix}`,
    type: "charge.refunded",
    livemode: false,
    created: 1787240100,
    object: {
      id: chargeId,
      payment_intent: paymentIntentId,
      amount_refunded: 1500,
      currency: "eur",
    },
  });
  await processEvent(modules, refundEvent, "manual_review");
  const disputeEvent = stripeEvent({
    id: `evt_dispute_${suffix}`,
    type: "charge.dispute.created",
    livemode: false,
    created: 1787240200,
    object: {
      id: `dp_${suffix}`,
      charge: chargeId,
      payment_intent: paymentIntentId,
      amount: 1500,
      currency: "eur",
      reason: "fraudulent",
    },
  });
  await processEvent(modules, disputeEvent, "manual_review");

  const state = await sql.query(
    `select profile.credits_balance,
       (select count(*)::int from credit_ledger where user_id = $1) as grants,
       (select count(*)::int from stripe_financial_adjustment_reviews
         where user_id = $1 and review_status = 'manual_review'
           and policy_decision = 'not_evaluated'
           and automatic_credit_action = false) as reviews,
       (select count(*)::int from stripe_webhook_events
         where event_id in ($2, $3) and livemode = false
           and status = 'manual_review' and payload is not null) as retained_events
     from profiles as profile where profile.user_id = $1`,
    [userId, refundEvent.id, disputeEvent.id],
  );
  assert.deepEqual(state[0], {
    credits_balance: 60,
    grants: 1,
    reviews: 2,
    retained_events: 2,
  });
});

test("a terminal event for an old subscription cannot downgrade a newer active plan", async (t) => {
  const modules = await loadModules(t);
  const sql = await modules.db.getSql();
  const suffix = randomUUID().replaceAll("-", "");
  const userId = `replacement-user-${suffix}`;
  const customerId = `replacement-customer-${suffix}`;
  const stripeCustomerId = `cus_replacement_${suffix}`;
  const oldCheckoutId = `checkout_old_${suffix}`;
  const newCheckoutId = `checkout_new_${suffix}`;
  const oldSubscriptionId = `sub_old_${suffix}`;
  const newSubscriptionId = `sub_new_${suffix}`;

  await seedProfile(sql, userId);
  await sql`update profiles set plan = 'pro' where user_id = ${userId}`;
  await seedCustomer(sql, { id: customerId, userId, stripeCustomerId, livemode: false });

  await seedCheckout(sql, {
    id: oldCheckoutId,
    userId,
    clientRequestId: randomUUID(),
    kind: "subscription",
    sku: "standard",
    priceId: "price_replacementstandard",
    customerId,
    stripeCustomerId,
    sessionId: `cs_old_${suffix}`,
    amountMinor: 2000,
    currency: "usd",
    credits: 100,
    livemode: false,
  });
  await sql`
    update billing_checkout_requests set status = 'completed'
    where id = ${oldCheckoutId} and livemode = false
  `;
  await sql`
    insert into billing_subscriptions (
      stripe_subscription_id, checkout_request_id, user_id, billing_customer_id,
      stripe_customer_id, plan, stripe_price_id, status, cancel_at_period_end,
      current_period_start, current_period_end, livemode, last_event_created,
      last_event_id, ended_at
    ) values (
      ${oldSubscriptionId}, ${oldCheckoutId}, ${userId}, ${customerId},
      ${stripeCustomerId}, 'standard', 'price_replacementstandard', 'canceled', false,
      '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z', false, 1785000000,
      ${`evt_old_canceled_${suffix}`}, '2026-08-01T00:00:00Z'
    )
  `;

  await seedCheckout(sql, {
    id: newCheckoutId,
    userId,
    clientRequestId: randomUUID(),
    kind: "subscription",
    sku: "pro",
    priceId: "price_replacementpro",
    customerId,
    stripeCustomerId,
    sessionId: `cs_new_${suffix}`,
    amountMinor: 4000,
    currency: "usd",
    credits: 200,
    livemode: false,
  });
  await sql`
    update billing_checkout_requests set status = 'completed'
    where id = ${newCheckoutId} and livemode = false
  `;
  await sql`
    insert into billing_subscriptions (
      stripe_subscription_id, checkout_request_id, user_id, billing_customer_id,
      stripe_customer_id, plan, stripe_price_id, status, cancel_at_period_end,
      current_period_start, current_period_end, livemode, last_event_created,
      last_event_id
    ) values (
      ${newSubscriptionId}, ${newCheckoutId}, ${userId}, ${customerId},
      ${stripeCustomerId}, 'pro', 'price_replacementpro', 'active', false,
      '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', false, 1786000000,
      ${`evt_new_active_${suffix}`}
    )
  `;

  const lateOldEvent = stripeEvent({
    id: `evt_old_replayed_${suffix}`,
    type: "customer.subscription.deleted",
    livemode: false,
    created: 1787240300,
    object: {
      id: oldSubscriptionId,
      customer: stripeCustomerId,
      status: "canceled",
      cancel_at_period_end: false,
      ended_at: 1785000000,
      metadata: { helix_checkout_id: oldCheckoutId },
      items: {
        data: [
          {
            price: { id: "price_replacementstandard" },
            current_period_start: 1782326400,
            current_period_end: 1785004800,
          },
        ],
      },
    },
  });
  await processEvent(modules, lateOldEvent);

  const state = await sql.query(
    `select profile.plan,
            old_subscription.status as old_status,
            new_subscription.status as new_status,
            event.status as event_status
     from profiles as profile
     join billing_subscriptions as old_subscription
       on old_subscription.user_id = profile.user_id
      and old_subscription.stripe_subscription_id = $2
      and old_subscription.livemode = false
     join billing_subscriptions as new_subscription
       on new_subscription.user_id = profile.user_id
      and new_subscription.stripe_subscription_id = $3
      and new_subscription.livemode = false
     join stripe_webhook_events as event
       on event.event_id = $4 and event.livemode = false
     where profile.user_id = $1`,
    [userId, oldSubscriptionId, newSubscriptionId, lateOldEvent.id],
  );
  assert.deepEqual(state[0], {
    plan: "pro",
    old_status: "canceled",
    new_status: "active",
    event_status: "processed",
  });
});
