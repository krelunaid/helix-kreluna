import { EXTRA_PACK, PLANS } from "@/lib/plans";
import { serverEnv } from "@/lib/env.server";
import { StripeBillingError, type PaidPlanId } from "./types";

export const STRIPE_API_VERSION = "2026-07-29.dahlia" as const;

export type BillingSku = {
  kind: "subscription" | "topup";
  sku: PaidPlanId | "extra_50";
  priceId: string;
  amountMinor: number;
  currency: "usd" | "eur";
  credits: number;
  plan: PaidPlanId | null;
};

export type StripeBillingConfiguration = {
  mode: "test" | "live";
  livemode: boolean;
  secretKey: string;
  webhookSecret: string;
  portalConfigurationId: string;
  publicOrigin: string;
  dispatchSecret: string;
  skus: Readonly<Record<PaidPlanId | "extra_50", BillingSku>>;
};

export type StripeConfigurationEnvironment = {
  stripeBillingEnabled: boolean;
  STRIPE_MODE?: "test" | "live";
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_STANDARD?: string;
  STRIPE_PRICE_PRO?: string;
  STRIPE_PRICE_TEAM?: string;
  STRIPE_PRICE_EXTRA_50?: string;
  STRIPE_PORTAL_CONFIGURATION_ID?: string;
  HELIX_BILLING_DISPATCH_SECRET?: string;
  publicOrigin: string;
};

function paidPlan(id: PaidPlanId) {
  const plan = PLANS.find((candidate) => candidate.id === id);
  if (!plan) throw new StripeBillingError("INVALID_PLAN", { retryable: false });
  return plan;
}

export function resolveStripeBillingConfiguration(
  environment: StripeConfigurationEnvironment,
): StripeBillingConfiguration | null {
  if (!environment.stripeBillingEnabled) return null;

  const mode = environment.STRIPE_MODE;
  const secretKey = environment.STRIPE_SECRET_KEY;
  const webhookSecret = environment.STRIPE_WEBHOOK_SECRET;
  const standardPrice = environment.STRIPE_PRICE_STANDARD;
  const proPrice = environment.STRIPE_PRICE_PRO;
  const teamPrice = environment.STRIPE_PRICE_TEAM;
  const extraPrice = environment.STRIPE_PRICE_EXTRA_50;
  const portalConfigurationId = environment.STRIPE_PORTAL_CONFIGURATION_ID;
  const dispatchSecret = environment.HELIX_BILLING_DISPATCH_SECRET;
  if (
    !mode ||
    !secretKey ||
    !webhookSecret ||
    !standardPrice ||
    !proPrice ||
    !teamPrice ||
    !extraPrice ||
    !portalConfigurationId ||
    !dispatchSecret ||
    !environment.publicOrigin
  ) {
    throw new StripeBillingError("PAYMENTS_NOT_AVAILABLE");
  }

  const standard = paidPlan("standard");
  const pro = paidPlan("pro");
  const team = paidPlan("team");
  return Object.freeze({
    mode,
    livemode: mode === "live",
    secretKey,
    webhookSecret,
    portalConfigurationId,
    publicOrigin: environment.publicOrigin,
    dispatchSecret,
    skus: Object.freeze({
      standard: {
        kind: "subscription",
        sku: "standard",
        priceId: standardPrice,
        amountMinor: standard.price * 100,
        currency: "usd",
        credits: standard.credits,
        plan: "standard",
      },
      pro: {
        kind: "subscription",
        sku: "pro",
        priceId: proPrice,
        amountMinor: pro.price * 100,
        currency: "usd",
        credits: pro.credits,
        plan: "pro",
      },
      team: {
        kind: "subscription",
        sku: "team",
        priceId: teamPrice,
        amountMinor: team.price * 100,
        currency: "usd",
        credits: team.credits,
        plan: "team",
      },
      extra_50: {
        kind: "topup",
        sku: "extra_50",
        priceId: extraPrice,
        amountMinor: EXTRA_PACK.price * 100,
        currency: "eur",
        credits: EXTRA_PACK.credits,
        plan: null,
      },
    } satisfies Record<PaidPlanId | "extra_50", BillingSku>),
  });
}

export function getStripeBillingConfiguration(): StripeBillingConfiguration | null {
  return resolveStripeBillingConfiguration(serverEnv);
}

export function requireStripeBillingConfiguration(): StripeBillingConfiguration {
  const config = getStripeBillingConfiguration();
  if (!config) throw new StripeBillingError("PAYMENTS_NOT_AVAILABLE");
  return config;
}

export function stripeBillingAvailable(): boolean {
  try {
    return getStripeBillingConfiguration() !== null;
  } catch {
    return false;
  }
}
