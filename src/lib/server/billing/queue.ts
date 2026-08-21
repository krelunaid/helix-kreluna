import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { getSql } from "@/lib/db";
import { isHostedRuntimeEnvironment } from "@/lib/hosted-runtime";
import { requireStripeBillingConfiguration } from "./config";
import { StripeBillingError } from "./types";

export const HELIX_BILLING_HEADER = "x-helix-billing-token";
export const STRIPE_BACKGROUND_FUNCTION_PATH = "/.netlify/functions/helix-stripe-background";

export type StripeEventReference = {
  eventId: string;
  livemode: boolean;
};

export type QueuedStripeEvent = StripeEventReference & {
  eventType: string;
  payload: string;
  payloadSha256: string;
  attemptCount: number;
  maxAttempts: number;
  workerId: string;
};

function eventObjectId(event: Stripe.Event): string | null {
  const object = event.data?.object as { id?: unknown } | undefined;
  return typeof object?.id === "string" ? object.id : null;
}

export function stripePayloadSha256(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export async function enqueueVerifiedStripeEvent(
  event: Stripe.Event,
  rawPayload: string,
): Promise<StripeEventReference & { dispatch: boolean }> {
  const sql = await getSql();
  const payloadSha256 = stripePayloadSha256(rawPayload);
  await sql`
    insert into stripe_webhook_events (
      event_id, event_type, object_id, api_version, livemode,
      provider_created, signature_verified_at, payload, payload_sha256
    ) values (
      ${event.id}, ${event.type}, ${eventObjectId(event)}, ${event.api_version ?? null},
      ${event.livemode}, ${event.created}, now(), ${rawPayload}, ${payloadSha256}
    )
    on conflict (event_id, livemode) do nothing
  `;
  const rows = await sql<{
    event_type: string;
    payload_sha256: string;
    livemode: boolean;
    status: string;
  }>`
    select event_type, payload_sha256, livemode, status
    from stripe_webhook_events
    where event_id = ${event.id} and livemode = ${event.livemode}
  `;
  const row = rows[0];
  if (
    !row ||
    row.event_type !== event.type ||
    row.payload_sha256 !== payloadSha256 ||
    Boolean(row.livemode) !== event.livemode
  ) {
    throw new StripeBillingError("STRIPE_EVENT_REUSED", { retryable: false });
  }
  return {
    eventId: event.id,
    livemode: event.livemode,
    dispatch: !["processed", "ignored", "manual_review"].includes(row.status),
  };
}

export async function claimStripeEvent(
  reference: StripeEventReference,
  workerId: string,
  leaseMs = 60_000,
): Promise<QueuedStripeEvent | null> {
  const sql = await getSql();
  const rows = await sql<{
    event_id: string;
    event_type: string;
    payload: string | null;
    payload_sha256: string;
    attempt_count: number;
    max_attempts: number;
  }>`
    update stripe_webhook_events
    set status = 'processing', lease_owner = ${workerId},
        lease_expires_at = now() + (${leaseMs} * interval '1 millisecond'),
        attempt_count = attempt_count + 1, updated_at = now()
    where event_id = ${reference.eventId}
      and livemode = ${reference.livemode}
      and payload is not null
      and attempt_count < max_attempts
      and (
        (status in ('queued', 'retry') and available_at <= now())
        or (status = 'processing' and lease_expires_at < now())
      )
    returning event_id, event_type, payload, payload_sha256,
              attempt_count, max_attempts
  `;
  const row = rows[0];
  if (!row?.payload) return null;
  return {
    eventId: row.event_id,
    livemode: reference.livemode,
    eventType: row.event_type,
    payload: row.payload,
    payloadSha256: row.payload_sha256,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    workerId,
  };
}

export async function markStripeEventRetry(
  event: QueuedStripeEvent,
  errorCode: string,
): Promise<"retry" | "manual_review"> {
  const terminal = event.attemptCount >= event.maxAttempts;
  const delaySeconds = Math.min(300, 2 ** Math.max(0, event.attemptCount - 1) * 5);
  const sql = await getSql();
  await sql`
    update stripe_webhook_events
    set status = ${terminal ? "manual_review" : "retry"},
        available_at = now() + (${delaySeconds} * interval '1 second'),
        lease_owner = null, lease_expires_at = null,
        last_error_code = ${errorCode.slice(0, 120)}, updated_at = now()
    where event_id = ${event.eventId}
      and livemode = ${event.livemode}
      and lease_owner = ${event.workerId}
  `;
  return terminal ? "manual_review" : "retry";
}

export async function markStripeEventHandled(
  reference: StripeEventReference,
  outcome: "processed" | "ignored" | "manual_review",
  errorCode: string | null = null,
): Promise<void> {
  const sql = await getSql();
  await sql`
    update stripe_webhook_events
    set status = ${outcome}, payload = case when ${outcome} in ('processed', 'ignored')
          then null else payload end,
        processed_at = case when ${outcome} in ('processed', 'ignored') then now() else null end,
        lease_owner = null, lease_expires_at = null,
        last_error_code = ${errorCode}, updated_at = now()
    where event_id = ${reference.eventId} and livemode = ${reference.livemode}
  `;
}

export async function listDispatchableStripeEvents(
  limit = 100,
): Promise<StripeEventReference[]> {
  const bounded = Math.max(1, Math.min(250, Math.trunc(limit)));
  const sql = await getSql();
  const rows = await sql<{ event_id: string; livemode: boolean }>`
    select event_id, livemode
    from stripe_webhook_events
    where payload is not null
      and attempt_count < max_attempts
      and (
        (status in ('queued', 'retry') and available_at <= now())
        or (status = 'processing' and lease_expires_at < now())
      )
    order by provider_created, event_id, livemode
    limit ${bounded}
  `;
  return rows.map((row) => ({ eventId: row.event_id, livemode: Boolean(row.livemode) }));
}

export async function dispatchStripeEventToOrigin(
  reference: StripeEventReference,
  origin: string,
  secret = requireStripeBillingConfiguration().dispatchSecret,
): Promise<void> {
  const response = await fetch(new URL(STRIPE_BACKGROUND_FUNCTION_PATH, origin), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [HELIX_BILLING_HEADER]: secret,
    },
    body: JSON.stringify(reference),
  });
  if (!response.ok) throw new Error(`STRIPE_EVENT_DISPATCH_FAILED_${response.status}`);
}

export async function dispatchStripeEvent(reference: StripeEventReference): Promise<void> {
  if (isHostedRuntimeEnvironment()) {
    const { getRequestUrl } = await import("@tanstack/react-start/server");
    await dispatchStripeEventToOrigin(reference, getRequestUrl().origin);
    return;
  }
  queueMicrotask(() => {
    void import("./processor")
      .then(({ processStripeEvent }) =>
        processStripeEvent(reference.eventId, reference.livemode),
      )
      .catch((error: unknown) => {
        console.error(
          JSON.stringify({
            level: "error",
            event: "stripe_event_local_dispatch_failed",
            stripeEventId: reference.eventId,
            livemode: reference.livemode,
            errorName: error instanceof Error ? error.name : "UnknownError",
          }),
        );
      });
  });
}
