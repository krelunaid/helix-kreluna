import type { Config } from "@netlify/functions";

function stripeBillingEnabled(): boolean {
  return Netlify.env.get("STRIPE_BILLING_ENABLED")?.trim() === "true";
}

function billingSecret(): string {
  const secret = Netlify.env.get("HELIX_BILLING_DISPATCH_SECRET")?.trim();
  if (!secret || secret.length < 32) throw new Error("HELIX_BILLING_DISPATCH_SECRET_MISSING");
  return secret;
}

function siteOrigin(request: Request): string {
  const configuredUrl = Netlify.env.get("URL")?.trim();
  return new URL(configuredUrl || request.url).origin;
}

export default async function helixStripeSweep(request: Request): Promise<void> {
  if (!stripeBillingEnabled()) {
    console.info(
      JSON.stringify({
        level: "info",
        event: "stripe_event_sweep_skipped",
        reason: "billing_disabled",
      }),
    );
    return;
  }

  const secret = billingSecret();
  const origin = siteOrigin(request);
  // Keep DB/config modules behind the explicit feature gate. A disabled
  // scheduled invocation is a true no-op and needs no Stripe secret.
  const { dispatchStripeEventToOrigin, listDispatchableStripeEvents } =
    await import("../../src/lib/server/billing/queue");
  const events = await listDispatchableStripeEvents(100);
  const dispatches = await Promise.allSettled(
    events.map((event) => dispatchStripeEventToOrigin(event, origin, secret)),
  );
  const failed = dispatches.filter(
    (dispatch): dispatch is PromiseRejectedResult => dispatch.status === "rejected",
  );
  console.info(
    JSON.stringify({
      level: failed.length ? "warn" : "info",
      event: "stripe_event_sweep",
      listed: events.length,
      dispatched: events.length - failed.length,
      failed: failed.length,
    }),
  );
  if (failed.length) throw new Error("STRIPE_EVENT_SWEEP_DISPATCH_FAILED");
}

export const config: Config = {
  schedule: "* * * * *",
};
