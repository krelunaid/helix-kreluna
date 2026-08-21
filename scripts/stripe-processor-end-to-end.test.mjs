import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

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

test("the durable processor applies a verified top-up through the real SQL lookup", async (t) => {
  const modules = await loadModules(t);
  const sql = await modules.db.getSql();
  const suffix = randomUUID().replaceAll("-", "");
  const userId = `processor-user-${suffix}`;
  const customerRowId = `billing-customer-${suffix}`;
  const stripeCustomerId = `cus_${suffix}`;
  const checkoutId = `checkout-${suffix}`;
  const sessionId = `cs_test_${suffix}`;
  const eventId = `evt_${suffix}`;
  const paymentIntentId = `pi_${suffix}`;

  await sql`
    insert into profiles (user_id, plan, credits_balance)
    values (${userId}, 'free', 10)
  `;
  await sql`
    insert into billing_customers (id, user_id, stripe_customer_id, status, livemode)
    values (${customerRowId}, ${userId}, ${stripeCustomerId}, 'ready', false)
  `;
  await sql`
    insert into billing_checkout_requests (
      id, user_id, client_request_id, kind, sku, stripe_price_id,
      request_fingerprint, status, billing_customer_id, stripe_customer_id,
      stripe_checkout_session_id, stripe_checkout_url, expected_amount_minor,
      expected_currency, expected_credits, livemode
    ) values (
      ${checkoutId}, ${userId}, ${randomUUID()}, 'topup', 'extra_50',
      'price_processor50', ${"b".repeat(64)}, 'open', ${customerRowId},
      ${stripeCustomerId}, ${sessionId}, 'https://checkout.stripe.test/session',
      1500, 'eur', 50, false
    )
  `;

  const event = {
    id: eventId,
    object: "event",
    api_version: "2026-07-29.dahlia",
    created: 1787256000,
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
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
    },
  };
  const payload = JSON.stringify(event);
  const enqueued = await modules.queue.enqueueVerifiedStripeEvent(event, payload);
  assert.deepEqual(enqueued, { eventId, livemode: false, dispatch: true });
  assert.equal(await modules.processor.processStripeEvent(eventId, false), "processed");

  const profile = await sql.query(
    "select plan, credits_balance from profiles where user_id = $1",
    [userId],
  );
  assert.deepEqual(profile[0], { plan: "free", credits_balance: 60 });
  const financial = await sql.query(
    `select checkout.status,
            (select count(*)::int from payment_ledger where user_id = $1) as payments,
            (select count(*)::int from credit_ledger where user_id = $1) as grants,
            event.status as event_status, event.payload
     from billing_checkout_requests as checkout
     join stripe_webhook_events as event on event.event_id = $2
     where checkout.id = $3`,
    [userId, eventId, checkoutId],
  );
  assert.deepEqual(financial[0], {
    status: "completed",
    payments: 1,
    grants: 1,
    event_status: "processed",
    payload: null,
  });
  assert.equal(await modules.processor.processStripeEvent(eventId, false), "not_claimed");
});
