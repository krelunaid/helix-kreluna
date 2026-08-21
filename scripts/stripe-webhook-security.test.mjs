import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Stripe from "stripe";

const webhookSource = await readFile(
  new URL("../src/lib/server/billing/webhook.server.ts", import.meta.url),
  "utf8",
);
const processorSource = await readFile(
  new URL("../src/lib/server/billing/processor.ts", import.meta.url),
  "utf8",
);
const migrationSource = await readFile(
  new URL("../migrations/0018_stripe_billing.sql", import.meta.url),
  "utf8",
);

test("Stripe's signed raw-body verification rejects tampering", () => {
  const stripe = new Stripe("sk_test_placeholder");
  const secret = "whsec_local_signature_test";
  const payload = JSON.stringify({
    id: "evt_signature_test",
    object: "event",
    type: "checkout.session.completed",
  });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(stripe.webhooks.constructEvent(payload, signature, secret).id, "evt_signature_test");
  assert.throws(
    () => stripe.webhooks.constructEvent(`${payload} `, signature, secret),
    /signature/i,
  );
});

test("the HTTP webhook verifies raw bytes before durable enqueue", () => {
  assert.match(webhookSource, /rawBody\s*=\s*await request\.text\(\)/);
  assert.doesNotMatch(webhookSource, /request\.json\(\)/);
  const verifyAt = webhookSource.indexOf("verifyStripeWebhookPayload(");
  const enqueueAt = webhookSource.indexOf("enqueueVerifiedStripeEvent(event, rawBody)");
  assert.ok(verifyAt >= 0 && enqueueAt > verifyAt);
  assert.match(webhookSource, /if \(!signature\) return json\(400/);
  assert.match(webhookSource, /event\.livemode !== config\.livemode/);
  assert.match(migrationSource, /STRIPE_EVENT_NOT_FOUND/);
  assert.match(migrationSource, /signature_verified_at timestamptz not null/);
});

test("unpaid Checkout sessions and subscription Checkout completion never grant credits", () => {
  const checkoutHandler = processorSource.slice(
    processorSource.indexOf("async function handleCheckoutEvent"),
    processorSource.indexOf("function invoiceSubscription"),
  );
  const unpaidAt = checkoutHandler.indexOf('session.payment_status !== "paid"');
  const grantAt = checkoutHandler.indexOf("await applyVerifiedCredit({");
  assert.ok(unpaidAt >= 0 && grantAt > unpaidAt);
  assert.match(checkoutHandler.slice(unpaidAt, grantAt), /recordTopupFailure/);
  assert.match(checkoutHandler.slice(unpaidAt, grantAt), /return/);

  const subscriptionBranch = checkoutHandler.slice(
    checkoutHandler.indexOf('checkout.kind === "subscription"'),
    checkoutHandler.indexOf('session.mode !== "payment"'),
  );
  assert.match(subscriptionBranch, /markCheckoutOnly/);
  assert.doesNotMatch(subscriptionBranch, /applyVerifiedCredit/);
});

test("event routing covers payment and subscription lifecycle without client-side grants", () => {
  for (const eventType of [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
    "invoice.paid",
    "invoice.payment_failed",
    "invoice.payment_action_required",
    "invoice.finalization_failed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
    "charge.refunded",
    "charge.dispute.created",
    "charge.dispute.updated",
    "charge.dispute.closed",
    "refund.created",
    "refund.updated",
    "refund.failed",
  ]) {
    assert.ok(processorSource.includes(`event.type === "${eventType}"`), eventType);
  }
  assert.match(processorSource, /billingReason !== "subscription_create"/);
  assert.match(processorSource, /billingReason !== "subscription_cycle"/);
  assert.match(processorSource, /past_due/);
  assert.match(processorSource, /set plan = 'free'/);
});

test("refunds and disputes are fail-closed manual reviews without automatic credit mutation", () => {
  const adjustmentHandler = processorSource.slice(
    processorSource.indexOf("async function recordFinancialAdjustmentForManualReview"),
    processorSource.indexOf("type SubscriptionStatus"),
  );
  assert.match(adjustmentHandler, /stripe_financial_adjustment_reviews/);
  assert.match(adjustmentHandler, /"manual_review"/);
  assert.match(adjustmentHandler, /STRIPE_ADJUSTMENT_POLICY_REQUIRED/);
  assert.doesNotMatch(adjustmentHandler, /apply_credit_entry|applyVerifiedCredit|credits_balance/);
  assert.match(migrationSource, /automatic_credit_action = false/);
  assert.match(migrationSource, /stripe_financial_adjustment_reviews_no_automatic_credit_ck/);
});
