import { createFileRoute } from "@tanstack/react-router";
import { acceptStripeWebhook } from "@/lib/server/billing/webhook.server";

export const Route = createFileRoute("/api/webhooks/stripe")({
  server: {
    handlers: {
      POST: ({ request }) => acceptStripeWebhook(request),
    },
  },
});
