import type { PlanId } from "@/lib/plans";

export const STRIPE_BILLING_ERROR_CODES = [
  "PAYMENTS_NOT_AVAILABLE",
  "INVALID_PLAN",
  "INVALID_BILLING_REQUEST",
  "BILLING_REQUEST_REUSED",
  "CHECKOUT_IN_PROGRESS",
  "SUBSCRIPTION_ALREADY_EXISTS",
  "CHECKOUT_CREATION_FAILED",
  "BILLING_CUSTOMER_NOT_FOUND",
  "BILLING_PORTAL_NOT_AVAILABLE",
  "BILLING_PORTAL_POLICY_UNVERIFIED",
  "STRIPE_WEBHOOK_INVALID",
  "STRIPE_EVENT_REUSED",
] as const;

export type StripeBillingErrorCode = (typeof STRIPE_BILLING_ERROR_CODES)[number];

const BAD_REQUEST = new Set<StripeBillingErrorCode>([
  "INVALID_PLAN",
  "INVALID_BILLING_REQUEST",
  "BILLING_REQUEST_REUSED",
]);

export class StripeBillingError extends Error {
  readonly code: StripeBillingErrorCode;
  readonly status: 400 | 409 | 503;
  readonly retryable: boolean;

  constructor(code: StripeBillingErrorCode, options?: { cause?: unknown; retryable?: boolean }) {
    super(code, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "StripeBillingError";
    this.code = code;
    this.status = BAD_REQUEST.has(code)
      ? 400
      : code === "CHECKOUT_IN_PROGRESS" || code === "SUBSCRIPTION_ALREADY_EXISTS"
        ? 409
        : 503;
    this.retryable = options?.retryable ?? this.status === 503;
  }
}

export type PaidPlanId = Exclude<PlanId, "free">;
export type BillingPurchaseKind = "subscription" | "topup";

export type CheckoutResult = {
  kind: "checkout";
  sessionId: string;
  url: string;
};

export type BillingSubscriptionSnapshot = {
  plan: PaidPlanId;
  status:
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "paused";
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
};

export type BillingPaymentSnapshot = {
  id: number;
  kind: "topup" | "subscription_invoice";
  status: "pending" | "paid" | "failed" | "action_required" | "void";
  amountMinor: number;
  currency: string;
  credits: number;
  plan: PaidPlanId | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  receiptUrl: string | null;
  createdAt: string;
};

export type BillingAccountSnapshot = {
  available: boolean;
  hasCustomer: boolean;
  subscription: BillingSubscriptionSnapshot | null;
  payments: BillingPaymentSnapshot[];
};
