import Stripe from "stripe";
import {
  STRIPE_API_VERSION,
  requireStripeBillingConfiguration,
  type StripeBillingConfiguration,
} from "./config";

let stripeClient: Stripe | null = null;
let stripeKey = "";

export function createStripeClient(config: Pick<StripeBillingConfiguration, "secretKey">): Stripe {
  return new Stripe(config.secretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 10_000,
    appInfo: { name: "Helix Kreluna" },
  });
}

export function getStripeClient(): Stripe {
  const config = requireStripeBillingConfiguration();
  if (!stripeClient || stripeKey !== config.secretKey) {
    stripeClient = createStripeClient(config);
    stripeKey = config.secretKey;
  }
  return stripeClient;
}

export function verifyStripeWebhookPayload(
  rawBody: string,
  signature: string,
  webhookSecret: string,
  client = new Stripe("sk_test_placeholder", {
    apiVersion: STRIPE_API_VERSION,
  }),
): Stripe.Event {
  return client.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
