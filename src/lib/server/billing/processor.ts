import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { getSql } from "@/lib/db";
import { PLANS, type PlanId } from "@/lib/plans";
import {
  claimStripeEvent,
  markStripeEventHandled,
  markStripeEventRetry,
  stripePayloadSha256,
  type QueuedStripeEvent,
  type StripeEventReference,
} from "./queue";
import type { PaidPlanId } from "./types";

export type ProcessStripeEventResult =
  "processed" | "ignored" | "retry" | "manual_review" | "not_claimed";

type JsonRecord = Record<string, unknown>;

type CheckoutRow = {
  id: string;
  user_id: string;
  kind: "subscription" | "topup";
  sku: string;
  stripe_price_id: string;
  status: string;
  billing_customer_id: string;
  stripe_customer_id: string | null;
  stripe_checkout_session_id: string | null;
  expected_amount_minor: number;
  expected_currency: string;
  expected_credits: number;
  livemode: boolean;
};

class StripeEventValidationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "StripeEventValidationError";
    this.code = code;
  }
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function expandableId(value: unknown): string | null {
  return stringValue(value) ?? stringValue(record(value)?.id);
}

function metadataValue(source: unknown, key: string): string | null {
  return stringValue(record(record(source)?.metadata)?.[key]);
}

function epochIso(value: unknown): string | null {
  const seconds = numberValue(value);
  return seconds === null ? null : new Date(seconds * 1000).toISOString();
}

function paidPlanId(value: string): PaidPlanId | null {
  return value === "standard" || value === "pro" || value === "team" ? value : null;
}

function planCredits(planId: PaidPlanId): number {
  return PLANS.find((plan) => plan.id === planId)?.credits ?? 0;
}

function eventObject(event: Stripe.Event): JsonRecord {
  const object = record(event.data?.object);
  if (!object) throw new StripeEventValidationError("STRIPE_EVENT_OBJECT_INVALID");
  return object;
}

function eventReference(event: Stripe.Event): StripeEventReference {
  return { eventId: event.id, livemode: event.livemode };
}

async function findCheckout(input: {
  checkoutId?: string | null;
  sessionId?: string | null;
  subscriptionId?: string | null;
  livemode: boolean;
}): Promise<CheckoutRow | null> {
  const sql = await getSql();
  const checkoutId = input.checkoutId ?? null;
  const sessionId = input.sessionId ?? null;
  const subscriptionId = input.subscriptionId ?? null;
  const rows = await sql.query<CheckoutRow>(
    `
    select checkout.id, checkout.user_id, checkout.kind, checkout.sku,
           checkout.stripe_price_id, checkout.status, checkout.billing_customer_id,
           checkout.stripe_customer_id, checkout.stripe_checkout_session_id,
           checkout.expected_amount_minor, checkout.expected_currency,
           checkout.expected_credits, checkout.livemode
    from billing_checkout_requests as checkout
    where checkout.livemode = $4::boolean
      and ($1::text is not null or $2::text is not null or $3::text is not null)
      and ($1::text is null or checkout.id = $1::text)
      and ($2::text is null or checkout.stripe_checkout_session_id = $2::text)
      and (
        $3::text is null
        or exists (
          select 1
          from billing_subscriptions as subscription
          where subscription.stripe_subscription_id = $3::text
            and subscription.livemode = $4::boolean
            and subscription.checkout_request_id = checkout.id
        )
        or (
          $1::text is not null
          and not exists (
            select 1
            from billing_subscriptions as subscription
            where subscription.stripe_subscription_id = $3::text
              and subscription.livemode = $4::boolean
              and subscription.checkout_request_id is not null
          )
        )
      )
    limit 1
    `,
    [checkoutId, sessionId, subscriptionId, input.livemode],
  );
  return rows[0] ?? null;
}

function assertCheckoutMode(checkout: CheckoutRow, event: Stripe.Event): void {
  if (Boolean(checkout.livemode) !== event.livemode) {
    throw new StripeEventValidationError("STRIPE_LIVEMODE_MISMATCH");
  }
}

function periodFromLines(invoice: JsonRecord): { start: string | null; end: string | null } {
  const data = record(invoice.lines)?.data;
  if (!Array.isArray(data)) return { start: null, end: null };
  const starts: number[] = [];
  const ends: number[] = [];
  for (const rawLine of data) {
    const period = record(record(rawLine)?.period);
    const start = numberValue(period?.start);
    const end = numberValue(period?.end);
    if (start !== null) starts.push(start);
    if (end !== null) ends.push(end);
  }
  return {
    start: starts.length ? new Date(Math.min(...starts) * 1000).toISOString() : null,
    end: ends.length ? new Date(Math.max(...ends) * 1000).toISOString() : null,
  };
}

function periodFromSubscription(subscription: JsonRecord): {
  start: string | null;
  end: string | null;
} {
  const data = record(subscription.items)?.data;
  if (!Array.isArray(data)) return { start: null, end: null };
  const starts: number[] = [];
  const ends: number[] = [];
  for (const rawItem of data) {
    const item = record(rawItem);
    const start = numberValue(item?.current_period_start);
    const end = numberValue(item?.current_period_end);
    if (start !== null) starts.push(start);
    if (end !== null) ends.push(end);
  }
  return {
    start: starts.length ? new Date(Math.min(...starts) * 1000).toISOString() : null,
    end: ends.length ? new Date(Math.max(...ends) * 1000).toISOString() : null,
  };
}

function priceIdsFromItems(source: JsonRecord): Set<string> {
  const data = record(source.items)?.data ?? record(source.lines)?.data;
  const ids = new Set<string>();
  if (!Array.isArray(data)) return ids;
  for (const rawItem of data) {
    const item = record(rawItem);
    const pricing = record(item?.pricing);
    const details = record(pricing?.price_details);
    const legacyPrice = record(item?.price);
    const legacyPlan = record(item?.plan);
    const id =
      stringValue(details?.price) ??
      stringValue(legacyPrice?.id) ??
      stringValue(item?.price) ??
      stringValue(legacyPlan?.id);
    if (id) ids.add(id);
  }
  return ids;
}

async function markCheckoutOnly(
  event: Stripe.Event,
  checkoutId: string,
  status: "awaiting_payment" | "expired" | "failed" | "completed",
): Promise<void> {
  const sql = await getSql();
  await sql`
    with changed as (
      update billing_checkout_requests
      set status = ${status}, updated_at = now()
      where id = ${checkoutId}
      returning id
    )
    update stripe_webhook_events
    set status = 'processed', payload = null, processed_at = now(),
        lease_owner = null, lease_expires_at = null, last_error_code = null,
        updated_at = now()
    where event_id = ${event.id}
      and livemode = ${event.livemode}
      and exists (select 1 from changed)
  `;
}

async function recordTopupFailure(
  event: Stripe.Event,
  checkout: CheckoutRow,
  session: JsonRecord,
  status: "failed" | "pending",
): Promise<void> {
  const sessionId = stringValue(session.id);
  if (!sessionId) throw new StripeEventValidationError("STRIPE_SESSION_ID_MISSING");
  const sql = await getSql();
  await sql`
    insert into payment_ledger (
      provider, kind, provider_object_id, livemode, user_id, status, amount_minor,
      currency, credits, stripe_event_id, stripe_checkout_session_id,
      stripe_payment_intent_id, stripe_invoice_id, provider_created_at
    ) values (
      'stripe', 'topup', ${sessionId}, ${event.livemode}, ${checkout.user_id}, ${status},
      ${checkout.expected_amount_minor}, ${checkout.expected_currency}, 0,
      ${event.id}, ${sessionId}, ${expandableId(session.payment_intent)},
      ${expandableId(session.invoice)}, ${new Date(event.created * 1000).toISOString()}
    )
    on conflict (provider, kind, provider_object_id, livemode) do update
    set status = case when payment_ledger.status = 'paid' then 'paid' else excluded.status end,
        stripe_event_id = excluded.stripe_event_id,
        stripe_payment_intent_id = coalesce(excluded.stripe_payment_intent_id,
          payment_ledger.stripe_payment_intent_id),
        stripe_invoice_id = coalesce(excluded.stripe_invoice_id,
          payment_ledger.stripe_invoice_id),
        updated_at = now()
  `;
  await markCheckoutOnly(
    event,
    checkout.id,
    status === "failed" ? "failed" : "awaiting_payment",
  );
}

async function applyVerifiedCredit(input: {
  event: Stripe.Event;
  kind: "topup" | "subscription_invoice";
  providerObjectId: string;
  checkout: CheckoutRow;
  amountMinor: number;
  currency: string;
  credits: number;
  plan: PaidPlanId | null;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  invoiceId: string | null;
  subscriptionId: string | null;
  chargeId?: string | null;
  receiptUrl?: string | null;
  hostedInvoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  note: string;
}): Promise<void> {
  const sql = await getSql();
  await sql`
    select * from apply_verified_stripe_credit(
      ${input.event.id}, ${input.kind}, ${input.providerObjectId},
      ${input.checkout.user_id}, ${input.amountMinor}, ${input.currency},
      ${input.credits}, ${input.plan}, ${input.checkoutSessionId},
      ${input.paymentIntentId}, ${input.invoiceId}, ${input.subscriptionId},
      ${input.chargeId ?? null}, ${input.receiptUrl ?? null},
      ${input.hostedInvoiceUrl ?? null}, ${input.invoicePdfUrl ?? null},
      ${new Date(input.event.created * 1000).toISOString()}, ${input.event.livemode},
      ${input.note}
    )
  `;
}

async function handleCheckoutEvent(event: Stripe.Event): Promise<void> {
  const session = eventObject(event);
  const sessionId = stringValue(session.id);
  if (!sessionId) throw new StripeEventValidationError("STRIPE_SESSION_ID_MISSING");
  const checkoutId =
    metadataValue(session, "helix_checkout_id") ?? stringValue(session.client_reference_id);
  const checkout = await findCheckout({ checkoutId, sessionId, livemode: event.livemode });
  if (!checkout) throw new StripeEventValidationError("STRIPE_CHECKOUT_NOT_FOUND");
  assertCheckoutMode(checkout, event);
  if (checkoutId && checkout.id !== checkoutId) {
    throw new StripeEventValidationError("STRIPE_CHECKOUT_REFERENCE_MISMATCH");
  }
  if (checkout.stripe_checkout_session_id && checkout.stripe_checkout_session_id !== sessionId) {
    throw new StripeEventValidationError("STRIPE_SESSION_MISMATCH");
  }
  const customerId = expandableId(session.customer);
  if (checkout.stripe_customer_id && customerId !== checkout.stripe_customer_id) {
    throw new StripeEventValidationError("STRIPE_CUSTOMER_MISMATCH");
  }

  if (event.type === "checkout.session.expired") {
    await markCheckoutOnly(event, checkout.id, "expired");
    return;
  }
  if (event.type === "checkout.session.async_payment_failed") {
    if (checkout.kind === "topup") {
      await recordTopupFailure(event, checkout, session, "failed");
    } else {
      await markCheckoutOnly(event, checkout.id, "failed");
    }
    return;
  }
  if (checkout.kind === "subscription") {
    if (session.mode !== "subscription") {
      throw new StripeEventValidationError("STRIPE_CHECKOUT_MODE_MISMATCH");
    }
    const plan = paidPlanId(checkout.sku);
    const subscriptionId = expandableId(session.subscription);
    if (!plan || !subscriptionId || !customerId) {
      throw new StripeEventValidationError("STRIPE_SUBSCRIPTION_REFERENCE_MISSING");
    }
    const sql = await getSql();
    const linked = await sql<{ checkout_request_id: string }>`
      insert into billing_subscriptions (
        stripe_subscription_id, checkout_request_id, user_id, billing_customer_id,
        stripe_customer_id, plan, stripe_price_id, status, livemode,
        last_event_created, last_event_id
      ) values (
        ${subscriptionId}, ${checkout.id}, ${checkout.user_id}, ${checkout.billing_customer_id},
        ${customerId}, ${plan}, ${checkout.stripe_price_id}, 'incomplete', ${event.livemode},
        ${event.created}, ${event.id}
      )
      on conflict (stripe_subscription_id, livemode) do update
      set stripe_customer_id = excluded.stripe_customer_id,
          checkout_request_id = coalesce(
            billing_subscriptions.checkout_request_id,
            excluded.checkout_request_id
          ),
          last_event_created = greatest(billing_subscriptions.last_event_created,
            excluded.last_event_created),
          last_event_id = case
            when excluded.last_event_created >= billing_subscriptions.last_event_created
              then excluded.last_event_id else billing_subscriptions.last_event_id end,
          updated_at = now()
      where billing_subscriptions.checkout_request_id is null
         or billing_subscriptions.checkout_request_id = excluded.checkout_request_id
      returning checkout_request_id
    `;
    if (linked[0]?.checkout_request_id !== checkout.id) {
      throw new StripeEventValidationError("STRIPE_SUBSCRIPTION_CHECKOUT_CONFLICT");
    }
    await sql`
      update billing_customers
      set stripe_customer_id = ${customerId}, status = 'ready', updated_at = now()
      where id = ${checkout.billing_customer_id}
        and (stripe_customer_id is null or stripe_customer_id = ${customerId})
    `;
    await markCheckoutOnly(event, checkout.id, "completed");
    return;
  }

  if (session.mode !== "payment") {
    throw new StripeEventValidationError("STRIPE_CHECKOUT_MODE_MISMATCH");
  }
  if (session.payment_status !== "paid") {
    await recordTopupFailure(event, checkout, session, "pending");
    return;
  }
  const amount = numberValue(session.amount_subtotal) ?? numberValue(session.amount_total);
  const currency = stringValue(session.currency);
  if (
    amount !== checkout.expected_amount_minor ||
    currency !== checkout.expected_currency ||
    checkout.sku !== "extra_50"
  ) {
    throw new StripeEventValidationError("STRIPE_TOPUP_ECONOMIC_MISMATCH");
  }
  await applyVerifiedCredit({
    event,
    kind: "topup",
    providerObjectId: sessionId,
    checkout,
    amountMinor: amount,
    currency,
    credits: checkout.expected_credits,
    plan: null,
    checkoutSessionId: sessionId,
    paymentIntentId: expandableId(session.payment_intent),
    invoiceId: expandableId(session.invoice),
    subscriptionId: null,
    note: "Pacchetto extra Stripe verificato",
  });
}

function invoiceSubscription(invoice: JsonRecord): {
  subscriptionId: string | null;
  checkoutId: string | null;
} {
  const parent = record(invoice.parent);
  const details =
    parent?.type === "subscription_details" ? record(parent.subscription_details) : null;
  return {
    subscriptionId: expandableId(details?.subscription),
    checkoutId:
      metadataValue(details, "helix_checkout_id") ?? metadataValue(invoice, "helix_checkout_id"),
  };
}

async function upsertSubscriptionFromInvoice(
  event: Stripe.Event,
  invoice: JsonRecord,
  checkout: CheckoutRow,
  subscriptionId: string,
  plan: PaidPlanId,
): Promise<void> {
  const customerId = expandableId(invoice.customer);
  if (!customerId) throw new StripeEventValidationError("STRIPE_CUSTOMER_MISSING");
  if (checkout.stripe_customer_id && customerId !== checkout.stripe_customer_id) {
    throw new StripeEventValidationError("STRIPE_CUSTOMER_MISMATCH");
  }
  const period = periodFromLines(invoice);
  const sql = await getSql();
  const linked = await sql<{ checkout_request_id: string }>`
    insert into billing_subscriptions (
      stripe_subscription_id, checkout_request_id, user_id, billing_customer_id,
      stripe_customer_id,
      plan, stripe_price_id, status, current_period_start, current_period_end,
      livemode, last_event_created, last_event_id
    ) values (
      ${subscriptionId}, ${checkout.id}, ${checkout.user_id}, ${checkout.billing_customer_id},
      ${customerId}, ${plan}, ${checkout.stripe_price_id}, 'active', ${period.start}, ${period.end},
      ${event.livemode}, ${event.created}, ${event.id}
    )
    on conflict (stripe_subscription_id, livemode) do update
    set status = case
          when billing_subscriptions.status in ('canceled', 'incomplete_expired')
            then billing_subscriptions.status
          when excluded.last_event_created >= billing_subscriptions.last_event_created
            then 'active'
          else billing_subscriptions.status
        end,
        plan = case
          when excluded.last_event_created >= billing_subscriptions.last_event_created
            then excluded.plan else billing_subscriptions.plan end,
        stripe_price_id = case
          when excluded.last_event_created >= billing_subscriptions.last_event_created
            then excluded.stripe_price_id else billing_subscriptions.stripe_price_id end,
        current_period_start = case
          when excluded.last_event_created >= billing_subscriptions.last_event_created
            then coalesce(excluded.current_period_start,
              billing_subscriptions.current_period_start)
          else billing_subscriptions.current_period_start
        end,
        current_period_end = case
          when excluded.last_event_created >= billing_subscriptions.last_event_created
            then coalesce(excluded.current_period_end,
              billing_subscriptions.current_period_end)
          else billing_subscriptions.current_period_end
        end,
        last_event_created = case
          when billing_subscriptions.status in ('canceled', 'incomplete_expired')
            then billing_subscriptions.last_event_created
          else greatest(billing_subscriptions.last_event_created,
            excluded.last_event_created)
        end,
        last_event_id = case
          when billing_subscriptions.status in ('canceled', 'incomplete_expired')
            then billing_subscriptions.last_event_id
          when excluded.last_event_created >= billing_subscriptions.last_event_created
            then excluded.last_event_id else billing_subscriptions.last_event_id end,
        checkout_request_id = coalesce(
          billing_subscriptions.checkout_request_id,
          excluded.checkout_request_id
        ),
        updated_at = now()
    where billing_subscriptions.checkout_request_id is null
       or billing_subscriptions.checkout_request_id = excluded.checkout_request_id
    returning checkout_request_id
  `;
  if (linked[0]?.checkout_request_id !== checkout.id) {
    throw new StripeEventValidationError("STRIPE_SUBSCRIPTION_CHECKOUT_CONFLICT");
  }
}

type InvoiceReceiptRow = {
  stripe_invoice_id: string;
  checkout_request_id: string;
  stripe_customer_id: string;
  amount_paid_minor: number;
  currency: string;
  payment_ledger_id: number | null;
};

async function recordTopupInvoiceReceipt(
  event: Stripe.Event,
  invoice: JsonRecord,
  invoiceId: string,
  checkoutId: string | null,
): Promise<void> {
  if (!checkoutId) {
    throw new StripeEventValidationError("STRIPE_TOPUP_INVOICE_CHECKOUT_MISSING");
  }
  const checkout = await findCheckout({ checkoutId, livemode: event.livemode });
  if (!checkout || checkout.kind !== "topup") {
    throw new StripeEventValidationError("STRIPE_TOPUP_INVOICE_CHECKOUT_NOT_FOUND");
  }
  const customerId = expandableId(invoice.customer);
  if (!customerId || (checkout.stripe_customer_id && checkout.stripe_customer_id !== customerId)) {
    throw new StripeEventValidationError("STRIPE_CUSTOMER_MISMATCH");
  }
  const amountPaid = numberValue(invoice.amount_paid);
  const currency = stringValue(invoice.currency);
  if (
    stringValue(invoice.status) !== "paid" ||
    amountPaid !== checkout.expected_amount_minor ||
    currency !== checkout.expected_currency ||
    !priceIdsFromItems(invoice).has(checkout.stripe_price_id)
  ) {
    throw new StripeEventValidationError("STRIPE_TOPUP_INVOICE_ECONOMIC_MISMATCH");
  }

  const sql = await getSql();
  const existing = await sql<InvoiceReceiptRow>`
    select stripe_invoice_id, checkout_request_id, stripe_customer_id,
           amount_paid_minor, currency, payment_ledger_id
    from stripe_invoice_receipts
    where livemode = ${event.livemode}
      and (stripe_invoice_id = ${invoiceId} or checkout_request_id = ${checkout.id})
    for update
  `;
  const prior = existing[0];
  if (
    prior &&
    (prior.stripe_invoice_id !== invoiceId ||
      prior.checkout_request_id !== checkout.id ||
      prior.stripe_customer_id !== customerId ||
      prior.amount_paid_minor !== amountPaid ||
      prior.currency !== currency)
  ) {
    throw new StripeEventValidationError("STRIPE_TOPUP_INVOICE_REPLAY_CONFLICT");
  }
  if (!prior) {
    await sql`
      insert into stripe_invoice_receipts (
        stripe_invoice_id, livemode, checkout_request_id, stripe_event_id,
        stripe_customer_id, amount_paid_minor, currency, hosted_invoice_url,
        invoice_pdf_url, provider_created_at
      ) values (
        ${invoiceId}, ${event.livemode}, ${checkout.id}, ${event.id}, ${customerId},
        ${amountPaid}, ${currency}, ${stringValue(invoice.hosted_invoice_url)},
        ${stringValue(invoice.invoice_pdf)},
        ${new Date(event.created * 1000).toISOString()}
      )
    `;
  } else {
    await sql`
      update stripe_invoice_receipts
      set hosted_invoice_url = coalesce(
            ${stringValue(invoice.hosted_invoice_url)}, hosted_invoice_url
          ),
          invoice_pdf_url = coalesce(${stringValue(invoice.invoice_pdf)}, invoice_pdf_url),
          updated_at = now()
      where stripe_invoice_id = ${invoiceId} and livemode = ${event.livemode}
    `;
  }

  const linked = await sql<{ id: number }>`
    update payment_ledger as payment
    set stripe_invoice_id = ${invoiceId},
        hosted_invoice_url = coalesce(
          ${stringValue(invoice.hosted_invoice_url)}, payment.hosted_invoice_url
        ),
        invoice_pdf_url = coalesce(${stringValue(invoice.invoice_pdf)}, payment.invoice_pdf_url),
        updated_at = now()
    from billing_checkout_requests as checkout
    where checkout.id = ${checkout.id}
      and checkout.livemode = ${event.livemode}
      and payment.kind = 'topup'
      and payment.livemode = ${event.livemode}
      and (
        payment.stripe_invoice_id = ${invoiceId}
        or (
          payment.stripe_invoice_id is null
          and payment.stripe_checkout_session_id = checkout.stripe_checkout_session_id
        )
      )
    returning payment.id
  `;
  if (linked[0]) {
    await sql`
      update stripe_invoice_receipts
      set payment_ledger_id = ${linked[0].id}, updated_at = now()
      where stripe_invoice_id = ${invoiceId}
        and livemode = ${event.livemode}
        and (payment_ledger_id is null or payment_ledger_id = ${linked[0].id})
    `;
  }
  await markStripeEventHandled(eventReference(event), "processed");
}

async function handleInvoicePaid(event: Stripe.Event): Promise<void> {
  const invoice = eventObject(event);
  const invoiceId = stringValue(invoice.id);
  if (!invoiceId) throw new StripeEventValidationError("STRIPE_INVOICE_ID_MISSING");
  const relation = invoiceSubscription(invoice);
  if (!relation.subscriptionId) {
    await recordTopupInvoiceReceipt(event, invoice, invoiceId, relation.checkoutId);
    return;
  }
  const checkout = await findCheckout({
    checkoutId: relation.checkoutId,
    subscriptionId: relation.subscriptionId,
    livemode: event.livemode,
  });
  if (!checkout || checkout.kind !== "subscription") {
    throw new StripeEventValidationError("STRIPE_SUBSCRIPTION_CHECKOUT_NOT_FOUND");
  }
  assertCheckoutMode(checkout, event);
  const plan = paidPlanId(checkout.sku);
  if (!plan || planCredits(plan) !== checkout.expected_credits) {
    throw new StripeEventValidationError("STRIPE_PLAN_MAPPING_INVALID");
  }
  const priceIds = priceIdsFromItems(invoice);
  if (!priceIds.has(checkout.stripe_price_id)) {
    throw new StripeEventValidationError("STRIPE_INVOICE_PRICE_MISMATCH");
  }
  const status = stringValue(invoice.status);
  const amountPaid = numberValue(invoice.amount_paid);
  const currency = stringValue(invoice.currency);
  if (
    status !== "paid" ||
    amountPaid === null ||
    amountPaid < checkout.expected_amount_minor ||
    currency !== checkout.expected_currency
  ) {
    throw new StripeEventValidationError("STRIPE_INVOICE_ECONOMIC_MISMATCH");
  }
  await upsertSubscriptionFromInvoice(event, invoice, checkout, relation.subscriptionId, plan);

  const billingReason = stringValue(invoice.billing_reason);
  if (billingReason !== "subscription_create" && billingReason !== "subscription_cycle") {
    await markStripeEventHandled(eventReference(event), "processed");
    return;
  }
  await applyVerifiedCredit({
    event,
    kind: "subscription_invoice",
    providerObjectId: invoiceId,
    checkout,
    amountMinor: amountPaid,
    currency,
    credits: checkout.expected_credits,
    plan,
    checkoutSessionId: checkout.stripe_checkout_session_id,
    paymentIntentId: null,
    invoiceId,
    subscriptionId: relation.subscriptionId,
    hostedInvoiceUrl: stringValue(invoice.hosted_invoice_url),
    invoicePdfUrl: stringValue(invoice.invoice_pdf),
    note: `Piano ${plan} · fattura Stripe verificata`,
  });
}

async function handleInvoiceFailure(event: Stripe.Event): Promise<void> {
  const invoice = eventObject(event);
  const invoiceId = stringValue(invoice.id);
  if (!invoiceId) throw new StripeEventValidationError("STRIPE_INVOICE_ID_MISSING");
  const relation = invoiceSubscription(invoice);
  if (!relation.subscriptionId) {
    await markStripeEventHandled(eventReference(event), "ignored");
    return;
  }
  const checkout = await findCheckout({
    checkoutId: relation.checkoutId,
    subscriptionId: relation.subscriptionId,
    livemode: event.livemode,
  });
  if (!checkout || checkout.kind !== "subscription") {
    throw new StripeEventValidationError("STRIPE_SUBSCRIPTION_CHECKOUT_NOT_FOUND");
  }
  assertCheckoutMode(checkout, event);
  const plan = paidPlanId(checkout.sku);
  if (!plan) throw new StripeEventValidationError("STRIPE_PLAN_MAPPING_INVALID");
  const failureStatus =
    event.type === "invoice.payment_action_required" ? "action_required" : "failed";
  const amount = numberValue(invoice.amount_due) ?? numberValue(invoice.total) ?? 0;
  const currency = stringValue(invoice.currency) ?? checkout.expected_currency;
  const sql = await getSql();
  await sql`
    insert into payment_ledger (
      provider, kind, provider_object_id, livemode, user_id, status, amount_minor, currency,
      credits, plan, stripe_event_id, stripe_invoice_id,
      stripe_subscription_id, hosted_invoice_url, invoice_pdf_url,
      provider_created_at
    ) values (
      'stripe', 'subscription_invoice', ${invoiceId}, ${event.livemode}, ${checkout.user_id},
      ${failureStatus}, ${amount}, ${currency}, 0, ${plan}, ${event.id},
      ${invoiceId}, ${relation.subscriptionId}, ${stringValue(invoice.hosted_invoice_url)},
      ${stringValue(invoice.invoice_pdf)}, ${new Date(event.created * 1000).toISOString()}
    )
    on conflict (provider, kind, provider_object_id, livemode) do update
    set status = case when payment_ledger.status = 'paid' then 'paid' else excluded.status end,
        stripe_event_id = excluded.stripe_event_id,
        hosted_invoice_url = coalesce(excluded.hosted_invoice_url,
          payment_ledger.hosted_invoice_url),
        invoice_pdf_url = coalesce(excluded.invoice_pdf_url,
          payment_ledger.invoice_pdf_url),
        updated_at = now()
  `;
  await sql`
    update billing_subscriptions
    set status = case when status in ('canceled', 'unpaid', 'paused', 'incomplete_expired')
          then status else 'past_due' end,
        last_event_created = greatest(last_event_created, ${event.created}),
        last_event_id = case when ${event.created} >= last_event_created
          then ${event.id} else last_event_id end,
        updated_at = now()
    where stripe_subscription_id = ${relation.subscriptionId}
      and livemode = ${event.livemode}
      and ${event.created} >= last_event_created
  `;
  await markStripeEventHandled(eventReference(event), "processed");
}

type FinancialAdjustment = {
  providerObjectId: string;
  chargeId: string | null;
  paymentIntentId: string | null;
  amountMinor: number | null;
  currency: string | null;
  reason: string | null;
};

function financialAdjustment(event: Stripe.Event): FinancialAdjustment {
  const object = eventObject(event);
  const providerObjectId = stringValue(object.id);
  if (!providerObjectId) {
    throw new StripeEventValidationError("STRIPE_ADJUSTMENT_ID_MISSING");
  }
  if (event.type === "charge.refunded") {
    return {
      providerObjectId,
      chargeId: providerObjectId,
      paymentIntentId: expandableId(object.payment_intent),
      amountMinor: numberValue(object.amount_refunded),
      currency: stringValue(object.currency),
      reason: null,
    };
  }
  return {
    providerObjectId,
    chargeId: expandableId(object.charge),
    paymentIntentId: expandableId(object.payment_intent),
    amountMinor: numberValue(object.amount),
    currency: stringValue(object.currency),
    reason: stringValue(object.reason) ?? stringValue(object.status),
  };
}

async function recordFinancialAdjustmentForManualReview(event: Stripe.Event): Promise<void> {
  const adjustment = financialAdjustment(event);
  if (adjustment.amountMinor !== null && !adjustment.currency) {
    throw new StripeEventValidationError("STRIPE_ADJUSTMENT_CURRENCY_MISSING");
  }
  const sql = await getSql();
  const payments = await sql<{ id: number; user_id: string }>`
    select id, user_id
    from payment_ledger
    where livemode = ${event.livemode}
      and (
        (${adjustment.chargeId}::text is not null
          and stripe_charge_id = ${adjustment.chargeId})
        or (${adjustment.paymentIntentId}::text is not null
          and stripe_payment_intent_id = ${adjustment.paymentIntentId})
      )
    order by id desc
    limit 1
  `;
  await sql`
    insert into stripe_financial_adjustment_reviews (
      stripe_event_id, livemode, event_type, provider_object_id,
      stripe_charge_id, stripe_payment_intent_id, payment_ledger_id, user_id,
      amount_minor, currency, reason, review_status, policy_decision,
      automatic_credit_action
    ) values (
      ${event.id}, ${event.livemode}, ${event.type}, ${adjustment.providerObjectId},
      ${adjustment.chargeId}, ${adjustment.paymentIntentId}, ${payments[0]?.id ?? null},
      ${payments[0]?.user_id ?? null}, ${adjustment.amountMinor}, ${adjustment.currency},
      ${adjustment.reason}, 'manual_review', 'not_evaluated', false
    )
    on conflict (stripe_event_id, livemode) do nothing
  `;
  await markStripeEventHandled(
    eventReference(event),
    "manual_review",
    "STRIPE_ADJUSTMENT_POLICY_REQUIRED",
  );
}

type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

function subscriptionStatus(value: unknown): SubscriptionStatus | null {
  return [
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ].includes(String(value))
    ? (value as SubscriptionStatus)
    : null;
}

async function handleSubscriptionLifecycle(event: Stripe.Event): Promise<void> {
  const subscription = eventObject(event);
  const subscriptionId = stringValue(subscription.id);
  const checkoutId = metadataValue(subscription, "helix_checkout_id");
  if (!subscriptionId) throw new StripeEventValidationError("STRIPE_SUBSCRIPTION_ID_MISSING");
  const checkout = await findCheckout({ checkoutId, subscriptionId, livemode: event.livemode });
  if (!checkout || checkout.kind !== "subscription") {
    throw new StripeEventValidationError("STRIPE_SUBSCRIPTION_CHECKOUT_NOT_FOUND");
  }
  assertCheckoutMode(checkout, event);
  const plan = paidPlanId(checkout.sku);
  const customerId = expandableId(subscription.customer);
  let status = subscriptionStatus(subscription.status);
  if (event.type === "customer.subscription.deleted") status = "canceled";
  if (!plan || !customerId || !status) {
    throw new StripeEventValidationError("STRIPE_SUBSCRIPTION_INVALID");
  }
  if (checkout.stripe_customer_id && customerId !== checkout.stripe_customer_id) {
    throw new StripeEventValidationError("STRIPE_CUSTOMER_MISMATCH");
  }
  const priceIds = priceIdsFromItems(subscription);
  const existing = await getSql().then(
    (sql) => sql<{ stripe_price_id: string }>`
    select stripe_price_id from billing_subscriptions
    where stripe_subscription_id = ${subscriptionId}
      and livemode = ${event.livemode}
  `,
  );
  const expectedPriceId = existing[0]?.stripe_price_id ?? checkout.stripe_price_id;
  if (!priceIds.has(expectedPriceId)) {
    throw new StripeEventValidationError("STRIPE_SUBSCRIPTION_PRICE_MISMATCH");
  }
  const period = periodFromSubscription(subscription);
  const terminal = ["canceled", "unpaid", "paused", "incomplete_expired"].includes(status);
  const sql = await getSql();
  const linked = await sql<{ checkout_request_id: string }>`
    with linked_subscription as (
    insert into billing_subscriptions (
      stripe_subscription_id, checkout_request_id, user_id, billing_customer_id,
      stripe_customer_id,
      plan, stripe_price_id, status, cancel_at_period_end,
      current_period_start, current_period_end, livemode,
      last_event_created, last_event_id, ended_at
    ) values (
      ${subscriptionId}, ${checkout.id}, ${checkout.user_id}, ${checkout.billing_customer_id},
      ${customerId}, ${plan}, ${existing[0]?.stripe_price_id ?? checkout.stripe_price_id}, ${status},
      ${Boolean(subscription.cancel_at_period_end)}, ${period.start}, ${period.end},
      ${event.livemode}, ${event.created}, ${event.id},
      ${terminal ? (epochIso(subscription.ended_at) ?? new Date(event.created * 1000).toISOString()) : null}
    )
    on conflict (stripe_subscription_id, livemode) do update
    set status = case
          when billing_subscriptions.status = 'canceled' then 'canceled'
          when excluded.last_event_created >= billing_subscriptions.last_event_created
            then excluded.status
          else billing_subscriptions.status
        end,
        cancel_at_period_end = case
          when excluded.last_event_created >= billing_subscriptions.last_event_created
            then excluded.cancel_at_period_end
          else billing_subscriptions.cancel_at_period_end
        end,
        current_period_start = case
          when excluded.last_event_created >= billing_subscriptions.last_event_created
            then coalesce(excluded.current_period_start,
              billing_subscriptions.current_period_start)
          else billing_subscriptions.current_period_start
        end,
        current_period_end = case
          when excluded.last_event_created >= billing_subscriptions.last_event_created
            then coalesce(excluded.current_period_end,
              billing_subscriptions.current_period_end)
          else billing_subscriptions.current_period_end
        end,
        last_event_created = greatest(billing_subscriptions.last_event_created,
          excluded.last_event_created),
        last_event_id = case
          when excluded.last_event_created >= billing_subscriptions.last_event_created
            then excluded.last_event_id else billing_subscriptions.last_event_id end,
        ended_at = coalesce(excluded.ended_at, billing_subscriptions.ended_at),
        checkout_request_id = coalesce(
          billing_subscriptions.checkout_request_id,
          excluded.checkout_request_id
        ),
        updated_at = now()
    where billing_subscriptions.checkout_request_id is null
       or billing_subscriptions.checkout_request_id = excluded.checkout_request_id
    returning checkout_request_id, user_id, status
    ), downgraded_profile as (
      update profiles
      set plan = 'free'
      where user_id = ${checkout.user_id}
        and ${terminal}
        and exists (
          select 1 from linked_subscription
          where user_id = ${checkout.user_id}
            and status in ('canceled', 'unpaid', 'paused', 'incomplete_expired')
        )
        and not exists (
          select 1 from billing_subscriptions
          where user_id = ${checkout.user_id}
            and livemode = ${event.livemode}
            and stripe_subscription_id <> ${subscriptionId}
            and status in ('active', 'trialing')
        )
      returning user_id
    )
    select checkout_request_id from linked_subscription
  `;
  if (linked[0]?.checkout_request_id !== checkout.id) {
    throw new StripeEventValidationError("STRIPE_SUBSCRIPTION_CHECKOUT_CONFLICT");
  }
  await markStripeEventHandled(eventReference(event), "processed");
}

async function routeStripeEvent(
  event: Stripe.Event,
): Promise<"processed" | "ignored" | "manual_review"> {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded" ||
    event.type === "checkout.session.async_payment_failed" ||
    event.type === "checkout.session.expired"
  ) {
    await handleCheckoutEvent(event);
    return "processed";
  }
  if (event.type === "invoice.paid") {
    await handleInvoicePaid(event);
    return "processed";
  }
  if (
    event.type === "invoice.payment_failed" ||
    event.type === "invoice.payment_action_required" ||
    event.type === "invoice.finalization_failed"
  ) {
    await handleInvoiceFailure(event);
    return "processed";
  }
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.paused" ||
    event.type === "customer.subscription.resumed"
  ) {
    await handleSubscriptionLifecycle(event);
    return "processed";
  }
  if (
    event.type === "charge.refunded" ||
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.updated" ||
    event.type === "charge.dispute.closed" ||
    event.type === "refund.created" ||
    event.type === "refund.updated" ||
    event.type === "refund.failed"
  ) {
    await recordFinancialAdjustmentForManualReview(event);
    return "manual_review";
  }
  await markStripeEventHandled(eventReference(event), "ignored");
  return "ignored";
}

function errorCode(error: unknown): string {
  if (error instanceof StripeEventValidationError) return error.code;
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code).slice(0, 120);
  }
  return (error instanceof Error ? error.name : "UNKNOWN_STRIPE_EVENT_ERROR").slice(0, 120);
}

export async function processClaimedStripeEvent(
  queued: QueuedStripeEvent,
): Promise<ProcessStripeEventResult> {
  if (stripePayloadSha256(queued.payload) !== queued.payloadSha256) {
    await markStripeEventHandled(queued, "manual_review", "STRIPE_PAYLOAD_HASH_MISMATCH");
    return "manual_review";
  }
  let event: Stripe.Event;
  try {
    event = JSON.parse(queued.payload) as Stripe.Event;
  } catch {
    await markStripeEventHandled(queued, "manual_review", "STRIPE_PAYLOAD_INVALID_JSON");
    return "manual_review";
  }
  if (
    event.id !== queued.eventId ||
    event.type !== queued.eventType ||
    event.livemode !== queued.livemode
  ) {
    await markStripeEventHandled(queued, "manual_review", "STRIPE_PAYLOAD_ID_MISMATCH");
    return "manual_review";
  }
  try {
    return await routeStripeEvent(event);
  } catch (error) {
    const code = errorCode(error);
    if (error instanceof StripeEventValidationError) {
      await markStripeEventHandled(queued, "manual_review", code);
      return "manual_review";
    }
    return markStripeEventRetry(queued, code);
  }
}

export async function processStripeEvent(
  eventId: string,
  livemode: boolean,
): Promise<ProcessStripeEventResult> {
  const workerId = randomUUID();
  const queued = await claimStripeEvent({ eventId, livemode }, workerId);
  if (!queued) return "not_claimed";
  return processClaimedStripeEvent(queued);
}

export function isPaidPlan(value: PlanId): value is PaidPlanId {
  return paidPlanId(value) !== null;
}
