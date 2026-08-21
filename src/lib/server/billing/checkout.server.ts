import { createHash, randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { getSql } from "@/lib/db";
import type { PlanId } from "@/lib/plans";
import {
  getStripeBillingConfiguration,
  requireStripeBillingConfiguration,
  type BillingSku,
  type StripeBillingConfiguration,
} from "./config";
import { getStripeClient } from "./stripe.server";
import {
  StripeBillingError,
  type BillingAccountSnapshot,
  type BillingPaymentSnapshot,
  type BillingSubscriptionSnapshot,
  type CheckoutResult,
  type PaidPlanId,
} from "./types";

const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BillingCustomerRow = {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  status: string;
  livemode: boolean;
};

type CheckoutRow = {
  id: string;
  user_id: string;
  client_request_id: string;
  kind: "subscription" | "topup";
  sku: string;
  stripe_price_id: string;
  request_fingerprint: string;
  expected_amount_minor: number;
  expected_currency: string;
  expected_credits: number;
  livemode: boolean;
  status: string;
  stripe_checkout_session_id: string | null;
  stripe_checkout_url: string | null;
};

type CheckoutRequestIdentity = {
  userId: string;
  clientRequestId: string;
  kind: "subscription" | "topup";
  sku: string;
  priceId: string;
  requestFingerprint: string;
  amountMinor: number;
  currency: string;
  credits: number;
  livemode: boolean;
};

export function normalizeBillingRequestId(value: unknown): string {
  if (typeof value === "string" && REQUEST_ID_RE.test(value)) return value.toLowerCase();
  throw new StripeBillingError("INVALID_BILLING_REQUEST", { retryable: false });
}

function fingerprint(input: {
  userId: string;
  clientRequestId: string;
  sku: BillingSku;
  livemode: boolean;
  publicOrigin: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: "helix-stripe-checkout-v2",
        userId: input.userId,
        clientRequestId: input.clientRequestId,
        kind: input.sku.kind,
        sku: input.sku.sku,
        priceId: input.sku.priceId,
        amountMinor: input.sku.amountMinor,
        currency: input.sku.currency,
        credits: input.sku.credits,
        plan: input.sku.plan,
        livemode: input.livemode,
        publicOrigin: input.publicOrigin,
      }),
    )
    .digest("hex");
}

function postgresErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

/**
 * A stored Checkout URL is a bearer capability. It may only be replayed for
 * the exact immutable request that originally created it.
 */
export function isImmutableCheckoutReplay(
  row: CheckoutRow,
  expected: CheckoutRequestIdentity,
): boolean {
  return (
    row.user_id === expected.userId &&
    row.client_request_id === expected.clientRequestId &&
    row.kind === expected.kind &&
    row.sku === expected.sku &&
    row.stripe_price_id === expected.priceId &&
    row.request_fingerprint === expected.requestFingerprint &&
    Number(row.expected_amount_minor) === expected.amountMinor &&
    row.expected_currency === expected.currency &&
    Number(row.expected_credits) === expected.credits &&
    Boolean(row.livemode) === expected.livemode
  );
}

export function replayImmutableCheckoutOrThrow(
  row: CheckoutRow | undefined,
  expected: CheckoutRequestIdentity,
  cause?: unknown,
): CheckoutResult {
  if (
    !row ||
    !isImmutableCheckoutReplay(row, expected) ||
    !row.stripe_checkout_session_id ||
    !row.stripe_checkout_url
  ) {
    throw new StripeBillingError("CHECKOUT_IN_PROGRESS", { cause, retryable: false });
  }
  return {
    kind: "checkout",
    sessionId: row.stripe_checkout_session_id,
    url: row.stripe_checkout_url,
  };
}

function stripeId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function ensureBillingCustomer(
  userId: string,
  config: StripeBillingConfiguration,
  stripe: Stripe,
): Promise<BillingCustomerRow & { stripe_customer_id: string }> {
  const sql = await getSql();
  await sql`
    insert into profiles (user_id, plan, credits_balance)
    values (${userId}, 'free', 10)
    on conflict (user_id) do nothing
  `;
  const internalId = randomUUID();
  await sql`
    insert into billing_customers (id, user_id, livemode)
    values (${internalId}, ${userId}, ${config.livemode})
    on conflict (user_id, livemode) do nothing
  `;
  const rows = await sql<BillingCustomerRow>`
    select id, user_id, stripe_customer_id, status, livemode
    from billing_customers
    where user_id = ${userId} and livemode = ${config.livemode}
  `;
  const row = rows[0];
  if (!row) {
    throw new StripeBillingError("BILLING_CUSTOMER_NOT_FOUND");
  }
  if (row.stripe_customer_id) return { ...row, stripe_customer_id: row.stripe_customer_id };

  const users = await sql<{ email: string | null; name: string | null }>`
    select "email" as email, "name" as name
    from "user"
    where "id" = ${userId}
  `;
  const user = users[0];
  let customer: Stripe.Customer;
  try {
    customer = await stripe.customers.create(
      {
        ...(user?.email ? { email: user.email } : {}),
        ...(user?.name ? { name: user.name } : {}),
        metadata: {
          helix_billing_customer_id: row.id,
          helix_schema: "v1",
        },
      },
      { idempotencyKey: `helix:customer:v1:${row.id}` },
    );
  } catch (error) {
    await sql`
      update billing_customers
      set status = 'error', last_error_code = 'STRIPE_CUSTOMER_CREATE_FAILED', updated_at = now()
      where id = ${row.id} and stripe_customer_id is null
    `;
    throw new StripeBillingError("CHECKOUT_CREATION_FAILED", { cause: error });
  }

  const updated = await sql<BillingCustomerRow>`
    update billing_customers
    set stripe_customer_id = ${customer.id}, status = 'ready',
        last_error_code = null, updated_at = now()
    where id = ${row.id}
      and (stripe_customer_id is null or stripe_customer_id = ${customer.id})
    returning id, user_id, stripe_customer_id, status, livemode
  `;
  if (!updated[0]?.stripe_customer_id) {
    throw new StripeBillingError("BILLING_CUSTOMER_NOT_FOUND");
  }
  return { ...updated[0], stripe_customer_id: updated[0].stripe_customer_id };
}

async function existingCurrentSubscription(userId: string, livemode: boolean): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ exists: boolean }>`
    select exists (
      select 1
      from billing_subscriptions
      where user_id = ${userId}
        and livemode = ${livemode}
        and status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused')
    ) as exists
  `;
  return Boolean(rows[0]?.exists);
}

async function createCheckout(
  userId: string,
  clientRequestId: string,
  sku: BillingSku,
): Promise<CheckoutResult> {
  const config = requireStripeBillingConfiguration();
  if (sku.kind === "subscription" && (await existingCurrentSubscription(userId, config.livemode))) {
    throw new StripeBillingError("SUBSCRIPTION_ALREADY_EXISTS", { retryable: false });
  }
  const stripe = getStripeClient();
  const customer = await ensureBillingCustomer(userId, config, stripe);
  const requestFingerprint = fingerprint({
    userId,
    clientRequestId,
    sku,
    livemode: config.livemode,
    publicOrigin: config.publicOrigin,
  });
  const expectedRequest: CheckoutRequestIdentity = {
    userId,
    clientRequestId,
    kind: sku.kind,
    sku: sku.sku,
    priceId: sku.priceId,
    requestFingerprint,
    amountMinor: sku.amountMinor,
    currency: sku.currency,
    credits: sku.credits,
    livemode: config.livemode,
  };
  const checkoutId = randomUUID();
  const sql = await getSql();

  try {
    await sql`
      insert into billing_checkout_requests (
        id, user_id, client_request_id, kind, sku, stripe_price_id, request_fingerprint,
        billing_customer_id, stripe_customer_id, expected_amount_minor,
        expected_currency, expected_credits, livemode
      ) values (
        ${checkoutId}, ${userId}, ${clientRequestId}, ${sku.kind}, ${sku.sku},
        ${sku.priceId}, ${requestFingerprint}, ${customer.id}, ${customer.stripe_customer_id},
        ${sku.amountMinor}, ${sku.currency}, ${sku.credits}, ${config.livemode}
      )
      on conflict (user_id, client_request_id, livemode) do nothing
    `;
  } catch (error) {
    if (sku.kind === "subscription" && postgresErrorCode(error) === "23505") {
      const open = await sql<CheckoutRow>`
        select id, user_id, client_request_id, kind, sku, stripe_price_id, request_fingerprint,
               expected_amount_minor, expected_currency, expected_credits, livemode,
               status, stripe_checkout_session_id, stripe_checkout_url
        from billing_checkout_requests
        where user_id = ${userId}
          and livemode = ${config.livemode}
          and kind = 'subscription'
          and status in ('creating', 'open', 'awaiting_payment')
        order by created_at desc
        limit 1
      `;
      return replayImmutableCheckoutOrThrow(open[0], expectedRequest, error);
    }
    throw error;
  }

  const matches = await sql<CheckoutRow>`
    select id, user_id, client_request_id, kind, sku, stripe_price_id, request_fingerprint,
           expected_amount_minor, expected_currency, expected_credits, livemode,
           status, stripe_checkout_session_id, stripe_checkout_url
    from billing_checkout_requests
    where user_id = ${userId}
      and client_request_id = ${clientRequestId}
      and livemode = ${config.livemode}
  `;
  const request = matches[0];
  if (!request || !isImmutableCheckoutReplay(request, expectedRequest)) {
    throw new StripeBillingError("BILLING_REQUEST_REUSED", { retryable: false });
  }
  if (request.stripe_checkout_session_id && request.stripe_checkout_url) {
    return {
      kind: "checkout",
      sessionId: request.stripe_checkout_session_id,
      url: request.stripe_checkout_url,
    };
  }

  const metadata: Stripe.MetadataParam = {
    helix_checkout_id: request.id,
    helix_schema: "v1",
  };
  const successUrl = `${config.publicOrigin}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${config.publicOrigin}/pricing?checkout=cancelled`;
  const common: Pick<
    Stripe.Checkout.SessionCreateParams,
    | "customer"
    | "client_reference_id"
    | "line_items"
    | "success_url"
    | "cancel_url"
    | "allow_promotion_codes"
    | "metadata"
  > = {
    customer: customer.stripe_customer_id,
    client_reference_id: request.id,
    line_items: [{ price: sku.priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: false,
    metadata,
  };

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(
      sku.kind === "subscription"
        ? {
            ...common,
            mode: "subscription",
            subscription_data: { metadata },
          }
        : {
            ...common,
            mode: "payment",
            payment_intent_data: { metadata },
            invoice_creation: { enabled: true, invoice_data: { metadata } },
          },
      { idempotencyKey: `helix:checkout:v1:${request.id}` },
    );
  } catch (error) {
    await sql`
      update billing_checkout_requests
      set status = 'failed', last_error_code = 'STRIPE_CHECKOUT_CREATE_FAILED', updated_at = now()
      where id = ${request.id} and stripe_checkout_session_id is null
    `;
    throw new StripeBillingError("CHECKOUT_CREATION_FAILED", { cause: error });
  }
  if (!session.url) throw new StripeBillingError("CHECKOUT_CREATION_FAILED");

  const stored = await sql<{
    stripe_checkout_session_id: string;
    stripe_checkout_url: string;
  }>`
    update billing_checkout_requests
    set stripe_checkout_session_id = ${session.id}, stripe_checkout_url = ${session.url},
        status = 'open', expires_at = ${new Date(session.expires_at * 1000).toISOString()},
        last_error_code = null, updated_at = now()
    where id = ${request.id}
      and (stripe_checkout_session_id is null or stripe_checkout_session_id = ${session.id})
    returning stripe_checkout_session_id, stripe_checkout_url
  `;
  if (!stored[0]) throw new StripeBillingError("CHECKOUT_CREATION_FAILED");
  return {
    kind: "checkout",
    sessionId: stored[0].stripe_checkout_session_id,
    url: stored[0].stripe_checkout_url,
  };
}

export function startSubscriptionCheckout(input: {
  userId: string;
  planId: PaidPlanId;
  requestId: string;
}): Promise<CheckoutResult> {
  const config = requireStripeBillingConfiguration();
  return createCheckout(
    input.userId,
    normalizeBillingRequestId(input.requestId),
    config.skus[input.planId],
  );
}

export function startTopUpCheckout(input: {
  userId: string;
  requestId: string;
}): Promise<CheckoutResult> {
  const config = requireStripeBillingConfiguration();
  return createCheckout(
    input.userId,
    normalizeBillingRequestId(input.requestId),
    config.skus.extra_50,
  );
}

/**
 * The Portal is intentionally limited to ending an existing subscription at
 * period end. In particular, Helix has no webhook-safe plan-change workflow,
 * so subscription updates must remain disabled at the provider configuration.
 */
export function isCancellationOnlyPortalConfiguration(
  configuration: Stripe.BillingPortal.Configuration,
  expected: { id: string; livemode: boolean },
): boolean {
  return (
    configuration.id === expected.id &&
    configuration.object === "billing_portal.configuration" &&
    configuration.active === true &&
    configuration.livemode === expected.livemode &&
    configuration.login_page.enabled === false &&
    configuration.features.subscription_cancel.enabled === true &&
    configuration.features.subscription_cancel.mode === "at_period_end" &&
    configuration.features.subscription_cancel.proration_behavior === "none" &&
    configuration.features.subscription_update.enabled === false &&
    configuration.features.customer_update.enabled === false &&
    configuration.features.invoice_history.enabled === false &&
    configuration.features.payment_method_update.enabled === false
  );
}

export async function createBillingPortal(input: { userId: string }): Promise<{ url: string }> {
  const config = requireStripeBillingConfiguration();
  const sql = await getSql();
  const rows = await sql<{ stripe_customer_id: string | null }>`
    select stripe_customer_id
    from billing_customers
    where user_id = ${input.userId}
      and livemode = ${config.livemode}
      and status = 'ready'
  `;
  const customerId = rows[0]?.stripe_customer_id;
  if (!customerId) {
    throw new StripeBillingError("BILLING_PORTAL_NOT_AVAILABLE", { retryable: false });
  }
  const stripe = getStripeClient();
  const expectedPolicy = {
    id: config.portalConfigurationId,
    livemode: config.livemode,
  };
  let providerConfiguration: Stripe.BillingPortal.Configuration;
  try {
    providerConfiguration = await stripe.billingPortal.configurations.retrieve(
      config.portalConfigurationId,
    );
  } catch (error) {
    throw new StripeBillingError("BILLING_PORTAL_POLICY_UNVERIFIED", {
      cause: error,
      retryable: true,
    });
  }
  if (!isCancellationOnlyPortalConfiguration(providerConfiguration, expectedPolicy)) {
    throw new StripeBillingError("BILLING_PORTAL_POLICY_UNVERIFIED", { retryable: false });
  }

  let session: Stripe.BillingPortal.Session;
  try {
    session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${config.publicOrigin}/pricing`,
      configuration: config.portalConfigurationId,
      expand: ["configuration"],
    });
  } catch (error) {
    throw new StripeBillingError("BILLING_PORTAL_NOT_AVAILABLE", { cause: error });
  }
  if (
    typeof session.configuration === "string" ||
    !isCancellationOnlyPortalConfiguration(session.configuration, expectedPolicy)
  ) {
    // Never disclose the bearer URL if the session response cannot attest the
    // exact cancellation-only policy that was checked immediately beforehand.
    throw new StripeBillingError("BILLING_PORTAL_POLICY_UNVERIFIED", { retryable: false });
  }
  return { url: session.url };
}

export async function getBillingAccountSnapshot(userId: string): Promise<BillingAccountSnapshot> {
  const config = getStripeBillingConfiguration();
  if (!config) {
    return {
      available: false,
      hasCustomer: false,
      subscription: null,
      payments: [],
    };
  }
  const sql = await getSql();
  const customers = await sql<{ stripe_customer_id: string | null }>`
    select stripe_customer_id
    from billing_customers
    where user_id = ${userId} and livemode = ${config.livemode}
  `;
  const subscriptions = await sql<{
    plan: PaidPlanId;
    status: BillingSubscriptionSnapshot["status"];
    cancel_at_period_end: boolean;
    current_period_end: string | null;
  }>`
    select plan, status, cancel_at_period_end, current_period_end
    from billing_subscriptions
    where user_id = ${userId}
      and livemode = ${config.livemode}
    order by
      case when status in ('active', 'trialing', 'past_due', 'incomplete', 'unpaid', 'paused')
        then 0 else 1 end,
      updated_at desc
    limit 1
  `;
  const payments = await sql<{
    id: number;
    kind: BillingPaymentSnapshot["kind"];
    status: BillingPaymentSnapshot["status"];
    amount_minor: number;
    currency: string;
    credits: number;
    plan: PaidPlanId | null;
    hosted_invoice_url: string | null;
    invoice_pdf_url: string | null;
    receipt_url: string | null;
    created_at: string;
  }>`
    select id, kind, status, amount_minor, currency, credits, plan,
           hosted_invoice_url, invoice_pdf_url, receipt_url, created_at
    from payment_ledger
    where user_id = ${userId}
      and livemode = ${config.livemode}
    order by id desc
    limit 20
  `;
  return {
    available: true,
    hasCustomer: Boolean(customers[0]?.stripe_customer_id),
    subscription: subscriptions[0]
      ? {
          plan: subscriptions[0].plan,
          status: subscriptions[0].status,
          cancelAtPeriodEnd: Boolean(subscriptions[0].cancel_at_period_end),
          currentPeriodEnd: subscriptions[0].current_period_end,
        }
      : null,
    payments: payments.map((payment) => ({
      id: payment.id,
      kind: payment.kind,
      status: payment.status,
      amountMinor: payment.amount_minor,
      currency: payment.currency,
      credits: payment.credits,
      plan: payment.plan,
      hostedInvoiceUrl: payment.hosted_invoice_url,
      invoicePdfUrl: payment.invoice_pdf_url,
      receiptUrl: payment.receipt_url,
      createdAt: payment.created_at,
    })),
  };
}

export async function hasCurrentPaidSubscription(userId: string): Promise<boolean> {
  const config = requireStripeBillingConfiguration();
  return existingCurrentSubscription(userId, config.livemode);
}

export function isPaidPlanId(value: PlanId): value is PaidPlanId {
  return value === "standard" || value === "pro" || value === "team";
}

export const billingStripeId = stripeId;
