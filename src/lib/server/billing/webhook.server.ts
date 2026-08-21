import { STRIPE_API_VERSION, requireStripeBillingConfiguration } from "./config";
import { dispatchStripeEvent, enqueueVerifiedStripeEvent, markStripeEventHandled } from "./queue";
import { getStripeClient, verifyStripeWebhookPayload } from "./stripe.server";
import { StripeBillingError } from "./types";

const MAX_WEBHOOK_BYTES = 1024 * 1024;

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function acceptStripeWebhook(request: Request): Promise<Response> {
  if (request.method.toUpperCase() !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  let config;
  try {
    config = requireStripeBillingConfiguration();
  } catch {
    return json(503, { error: "PAYMENTS_NOT_AVAILABLE" });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    return json(413, { error: "PAYLOAD_TOO_LARGE" });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return json(400, { error: "STRIPE_WEBHOOK_INVALID" });

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json(400, { error: "STRIPE_WEBHOOK_INVALID" });
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
    return json(413, { error: "PAYLOAD_TOO_LARGE" });
  }

  let event;
  try {
    event = verifyStripeWebhookPayload(rawBody, signature, config.webhookSecret, getStripeClient());
  } catch {
    return json(400, { error: "STRIPE_WEBHOOK_INVALID" });
  }
  if (event.livemode !== config.livemode) {
    return json(400, { error: "STRIPE_LIVEMODE_MISMATCH" });
  }

  try {
    const queued = await enqueueVerifiedStripeEvent(event, rawBody);
    if (event.api_version !== STRIPE_API_VERSION) {
      await markStripeEventHandled(
        { eventId: event.id, livemode: event.livemode },
        "manual_review",
        "STRIPE_API_VERSION_MISMATCH",
      );
      return json(200, { received: true });
    }
    if (queued.dispatch) {
      try {
        await dispatchStripeEvent(queued);
      } catch (error) {
        // The signed event is already durable. The scheduled sweep can dispatch
        // it later, so returning 2xx prevents an unnecessary duplicate storm.
        console.warn(
          JSON.stringify({
            level: "warn",
            event: "stripe_event_dispatch_deferred",
            stripeEventId: queued.eventId,
            errorName: error instanceof Error ? error.name : "UnknownError",
          }),
        );
      }
    }
    return json(200, { received: true });
  } catch (error) {
    if (error instanceof StripeBillingError && !error.retryable) {
      return json(400, { error: error.code });
    }
    return json(503, { error: "STRIPE_WEBHOOK_PERSISTENCE_FAILED" });
  }
}
