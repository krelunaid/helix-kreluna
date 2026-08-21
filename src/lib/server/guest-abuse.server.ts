import { getRequest, getRequestIP } from "@tanstack/react-start/server";
import { getSql, type Sql } from "@/lib/db";
import { hashOpaqueToken } from "@/lib/guest-security";
import {
  isHostedRuntimeEnvironment,
  isNetlifyRuntimeEnvironment,
} from "@/lib/hosted-runtime";

export type GuestBudgetPolicy = {
  action: "publish" | "ai_generation";
  windowMs: number;
  maxRequests: number;
  maxBytesPerRequest: number;
  maxBytesPerWindow: number;
  maxEstimatedCostMicroUsd: number;
  leaseMs: number;
};

export type GuestBudgetLease = {
  identityHash: string;
  action: GuestBudgetPolicy["action"];
  leaseId: string;
  windowStart: string;
};

export const GUEST_PUBLISH_BUDGET: GuestBudgetPolicy = {
  action: "publish",
  windowMs: 60 * 60 * 1000,
  maxRequests: 3,
  maxBytesPerRequest: 512 * 1024,
  maxBytesPerWindow: 1536 * 1024,
  maxEstimatedCostMicroUsd: 0,
  leaseMs: 30 * 1000,
};

export const GUEST_AI_BUDGET: GuestBudgetPolicy = {
  action: "ai_generation",
  windowMs: 60 * 60 * 1000,
  maxRequests: 4,
  maxBytesPerRequest: 128 * 1024,
  maxBytesPerWindow: 512 * 1024,
  maxEstimatedCostMicroUsd: 500_000,
  leaseMs: 10 * 60 * 1000,
};

export class GuestBudgetExceededError extends Error {
  readonly code = "GUEST_BUDGET_EXCEEDED";
  readonly status = 429;
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Guest limit reached. Sign in or retry later.");
    this.name = "GuestBudgetExceededError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function trustedClientAddress(): string {
  const request = getRequest();
  const isNetlify = isNetlifyRuntimeEnvironment();
  if (isNetlify) {
    const netlifyIp = request.headers.get("x-nf-client-connection-ip")?.trim();
    if (netlifyIp) return netlifyIp;
  }
  // Never use X-Forwarded-For supplied directly by an untrusted client. If the
  // platform address is unavailable, all unknown callers deliberately share a
  // fail-closed bucket rather than receiving spoofable identities.
  return getRequestIP()?.trim() || "unknown";
}

async function requestIdentityHash(): Promise<string> {
  const secret =
    process.env.GUEST_RATE_LIMIT_SALT?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    (isHostedRuntimeEnvironment() ? "" : "helix-local-guest-budget");
  if (!secret) {
    throw new Error(
      "Invalid or missing environment variables: GUEST_RATE_LIMIT_SALT or BETTER_AUTH_SECRET",
    );
  }
  return hashOpaqueToken(`${secret}\u0000${trustedClientAddress()}`);
}

function validateUsage(
  policy: GuestBudgetPolicy,
  inputBytes: number,
  estimatedCostMicroUsd: number,
): void {
  if (
    !Number.isSafeInteger(inputBytes) ||
    inputBytes < 0 ||
    inputBytes > policy.maxBytesPerRequest
  ) {
    throw new GuestBudgetExceededError(Math.ceil(policy.windowMs / 1000));
  }
  if (
    !Number.isSafeInteger(estimatedCostMicroUsd) ||
    estimatedCostMicroUsd < 0 ||
    estimatedCostMicroUsd > policy.maxEstimatedCostMicroUsd
  ) {
    throw new GuestBudgetExceededError(Math.ceil(policy.windowMs / 1000));
  }
}

async function releaseLeaseWithSql(sql: Sql, lease: GuestBudgetLease): Promise<void> {
  await sql.query(
    `delete from guest_active_leases
     where identity_hash = $1 and action = $2 and lease_id = $3`,
    [lease.identityHash, lease.action, lease.leaseId],
  );
}

export async function reserveGuestBudgetForIdentity(
  sql: Sql,
  identityHash: string,
  policy: GuestBudgetPolicy,
  usage: { inputBytes: number; estimatedCostMicroUsd?: number },
  now = Date.now(),
): Promise<GuestBudgetLease> {
  const estimatedCostMicroUsd = usage.estimatedCostMicroUsd ?? 0;
  validateUsage(policy, usage.inputBytes, estimatedCostMicroUsd);
  const windowStartMs = Math.floor(now / policy.windowMs) * policy.windowMs;
  const windowStart = new Date(windowStartMs).toISOString();
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowStartMs + policy.windowMs - now) / 1000),
  );
  const lease: GuestBudgetLease = {
    identityHash,
    action: policy.action,
    leaseId: crypto.randomUUID(),
    windowStart,
  };

  const leaseRows = await sql.query<{ lease_id: string }>(
    `insert into guest_active_leases (
       identity_hash, action, lease_id, expires_at, created_at
     ) values ($1, $2, $3, $4, now())
     on conflict (identity_hash, action) do update
       set lease_id = excluded.lease_id,
           expires_at = excluded.expires_at,
           created_at = now()
       where guest_active_leases.expires_at <= now()
     returning lease_id`,
    [
      identityHash,
      policy.action,
      lease.leaseId,
      new Date(now + policy.leaseMs).toISOString(),
    ],
  );
  if (!leaseRows[0]) throw new GuestBudgetExceededError(retryAfterSeconds);

  try {
    const usageRows = await sql.query<{ request_count: number }>(
      `insert into guest_rate_limits (
         identity_hash, action, window_start, request_count, total_bytes,
         estimated_cost_micro_usd, updated_at
       ) values ($1, $2, $3, 1, $4, $5, now())
       on conflict (identity_hash, action, window_start) do update
         set request_count = guest_rate_limits.request_count + 1,
             total_bytes = guest_rate_limits.total_bytes + excluded.total_bytes,
             estimated_cost_micro_usd =
               guest_rate_limits.estimated_cost_micro_usd + excluded.estimated_cost_micro_usd,
             updated_at = now()
         where guest_rate_limits.request_count < $6
           and guest_rate_limits.total_bytes + excluded.total_bytes <= $7
           and guest_rate_limits.estimated_cost_micro_usd
                 + excluded.estimated_cost_micro_usd <= $8
       returning request_count`,
      [
        identityHash,
        policy.action,
        windowStart,
        usage.inputBytes,
        estimatedCostMicroUsd,
        policy.maxRequests,
        policy.maxBytesPerWindow,
        policy.maxEstimatedCostMicroUsd,
      ],
    );
    if (!usageRows[0]) throw new GuestBudgetExceededError(retryAfterSeconds);
    return lease;
  } catch (error) {
    await releaseLeaseWithSql(sql, lease);
    throw error;
  }
}

export async function reserveGuestBudget(
  policy: GuestBudgetPolicy,
  usage: { inputBytes: number; estimatedCostMicroUsd?: number },
): Promise<GuestBudgetLease> {
  const sql = await getSql();
  await sql.query("delete from guest_active_leases where expires_at <= now()");
  await sql.query(
    "delete from guest_rate_limits where window_start < now() - interval '48 hours'",
  );
  return reserveGuestBudgetForIdentity(
    sql,
    await requestIdentityHash(),
    policy,
    usage,
  );
}

export function reserveGuestAiBudget(input: {
  inputBytes: number;
  estimatedCostMicroUsd?: number;
}): Promise<GuestBudgetLease> {
  return reserveGuestBudget(GUEST_AI_BUDGET, {
    inputBytes: input.inputBytes,
    estimatedCostMicroUsd: input.estimatedCostMicroUsd ?? 125_000,
  });
}

export async function releaseGuestBudget(lease: GuestBudgetLease): Promise<void> {
  const sql = await getSql();
  await releaseLeaseWithSql(sql, lease);
}

export async function withGuestAiBudget<T>(
  input: { inputBytes: number; estimatedCostMicroUsd?: number },
  work: () => Promise<T>,
): Promise<T> {
  const lease = await reserveGuestAiBudget(input);
  try {
    return await work();
  } finally {
    await releaseGuestBudget(lease);
  }
}
