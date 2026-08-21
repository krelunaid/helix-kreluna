import { createHash, timingSafeEqual } from "node:crypto";
import type { Config } from "@netlify/functions";
import {
  dispatchStripeEventToOrigin,
  HELIX_BILLING_HEADER,
} from "../../src/lib/server/billing/queue";

type StripeEventRequest = { eventId?: unknown; livemode?: unknown };

function billingSecret(): string | null {
  const secret = Netlify.env.get("HELIX_BILLING_DISPATCH_SECRET")?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

function constantTimeTokenEqual(presented: string, expected: string): boolean {
  const presentedDigest = createHash("sha256").update(presented, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(presentedDigest, expectedDigest);
}

function validEventId(value: unknown): value is string {
  return typeof value === "string" && /^evt_[A-Za-z0-9_-]{4,250}$/.test(value);
}

function logRejected(reason: "configuration" | "authorization" | "payload"): void {
  console.warn(JSON.stringify({ level: "warn", event: "stripe_background_rejected", reason }));
}

export default async function helixStripeBackground(request: Request): Promise<void> {
  const expected = billingSecret();
  if (!expected) {
    logRejected("configuration");
    return;
  }
  const presented = request.headers.get(HELIX_BILLING_HEADER);
  if (!presented || !constantTimeTokenEqual(presented, expected)) {
    logRejected("authorization");
    return;
  }

  let body: StripeEventRequest;
  try {
    body = (await request.json()) as StripeEventRequest;
  } catch {
    logRejected("payload");
    return;
  }
  if (!validEventId(body.eventId) || typeof body.livemode !== "boolean") {
    logRejected("payload");
    return;
  }

  const { processStripeEvent } = await import("../../src/lib/server/billing/processor");
  const reference = { eventId: body.eventId, livemode: body.livemode };
  const outcome = await processStripeEvent(reference.eventId, reference.livemode);
  if (outcome === "retry") {
    await dispatchStripeEventToOrigin(reference, new URL(request.url).origin, expected);
  }
}

export const config: Config = {
  background: true,
  method: "POST",
};
