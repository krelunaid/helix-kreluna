import type { DbSource, Sql } from "@/lib/db";

export const ADMIN_JOB_STATUSES = [
  "queued",
  "running",
  "retry",
  "awaiting_human_approval",
  "approved",
  "rejected",
  "deploying",
  "deployed",
  "failed",
  "cancelled",
] as const;

export type AdminJobStatus = (typeof ADMIN_JOB_STATUSES)[number];

export type AdminOverviewEnvironment = Readonly<{
  dbSource: DbSource;
  stripeBillingEnabled: boolean;
  stripeMode: "test" | "live" | null;
  aiGatewayEnabled: boolean;
  googleAuthEnabled: boolean;
}>;

type CoreRow = {
  user_count: number;
  verified_user_count: number;
  project_count: number;
  hosted_project_count: number;
  credit_balance: number;
  credits_granted: number;
  credits_spent: number;
};

type JobRow = { status: string; count: number };

type AiRow = {
  call_count: number;
  succeeded_count: number;
  failed_count: number;
  active_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  provider_cost_usd_ticks: string;
};

type RevenueRow = {
  currency: string;
  livemode: boolean;
  payment_count: number;
  amount_minor: string;
};

function safeInteger(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function exactUnsignedInteger(value: unknown): string {
  const text = typeof value === "bigint" ? value.toString() : String(value ?? "0");
  return /^\d+$/u.test(text) ? text : "0";
}

function safeCurrency(value: unknown): string {
  const currency = String(value ?? "").toLowerCase();
  return /^[a-z]{3}$/u.test(currency) ? currency : "unknown";
}

export async function readAdminOverview(sql: Sql, environment: AdminOverviewEnvironment) {
  const [coreRows, jobRows, aiRows, revenueRows] = await Promise.all([
    sql.query<CoreRow>(
      `select
         (select count(*)::integer from "user") as user_count,
         (select count(*)::integer from "user" where "emailVerified" = true)
           as verified_user_count,
         (select count(*)::integer from projects) as project_count,
         (select count(*)::integer from projects where hosted = true)
           as hosted_project_count,
         (select coalesce(sum(credits_balance), 0)::bigint from profiles)
           as credit_balance,
         (select coalesce(sum(credits), 0)::bigint from credit_ledger where credits > $1)
           as credits_granted,
         (select coalesce(abs(sum(credits)), 0)::bigint from credit_ledger where credits < $1)
           as credits_spent`,
      [0],
    ),
    sql.query<JobRow>(
      `select queue_status as status, count(*)::integer as count
         from build_jobs
        group by queue_status
        order by queue_status`,
    ),
    sql.query<AiRow>(
      `select
         count(*)::integer as call_count,
         count(*) filter (where status = $1)::integer as succeeded_count,
         count(*) filter (where status in ($2, $3))::integer as failed_count,
         count(*) filter (where status = $4)::integer as active_count,
         coalesce(sum(input_tokens), 0)::bigint as input_tokens,
         coalesce(sum(output_tokens), 0)::bigint as output_tokens,
         coalesce(sum(total_tokens), 0)::bigint as total_tokens,
         coalesce(sum(cost_usd_ticks) filter (
           where status = $1 and cost_kind = $5
         ), 0)::text as provider_cost_usd_ticks
       from build_job_ai_calls`,
      ["succeeded", "failed", "unknown", "started", "provider_actual"],
    ),
    sql.query<RevenueRow>(
      `select
         currency,
         livemode,
         count(*)::integer as payment_count,
         coalesce(sum(amount_minor), 0)::text as amount_minor
       from payment_ledger
       where provider = $1 and status = $2
       group by currency, livemode
       order by livemode desc, currency`,
      ["stripe", "paid"],
    ),
  ]);

  const core = coreRows[0];
  const ai = aiRows[0];
  const jobs = Object.fromEntries(
    ADMIN_JOB_STATUSES.map((status) => [
      status,
      safeInteger(jobRows.find((row) => row.status === status)?.count ?? 0),
    ]),
  ) as Record<AdminJobStatus, number>;

  return Object.freeze({
    generatedAt: new Date().toISOString(),
    users: Object.freeze({
      total: safeInteger(core?.user_count),
      verified: safeInteger(core?.verified_user_count),
    }),
    projects: Object.freeze({
      total: safeInteger(core?.project_count),
      online: safeInteger(core?.hosted_project_count),
    }),
    jobs: Object.freeze(jobs),
    credits: Object.freeze({
      balance: safeInteger(core?.credit_balance),
      granted: safeInteger(core?.credits_granted),
      spent: safeInteger(core?.credits_spent),
    }),
    ai: Object.freeze({
      calls: safeInteger(ai?.call_count),
      succeeded: safeInteger(ai?.succeeded_count),
      failed: safeInteger(ai?.failed_count),
      active: safeInteger(ai?.active_count),
      inputTokens: safeInteger(ai?.input_tokens),
      outputTokens: safeInteger(ai?.output_tokens),
      totalTokens: safeInteger(ai?.total_tokens),
      providerCostUsdTicks: exactUnsignedInteger(ai?.provider_cost_usd_ticks),
    }),
    revenue: Object.freeze(
      revenueRows.map((row) =>
        Object.freeze({
          currency: safeCurrency(row.currency),
          mode: row.livemode ? ("live" as const) : ("test" as const),
          payments: safeInteger(row.payment_count),
          amountMinor: exactUnsignedInteger(row.amount_minor),
        }),
      ),
    ),
    integrations: Object.freeze({
      database: Object.freeze({ enabled: true, label: environment.dbSource }),
      google: Object.freeze({
        enabled: environment.googleAuthEnabled,
        label: environment.googleAuthEnabled ? "Google OAuth" : "Non configurato",
      }),
      ai: Object.freeze({
        enabled: environment.aiGatewayEnabled,
        label: environment.aiGatewayEnabled ? "Netlify AI Gateway" : "Non configurato",
      }),
      stripe: Object.freeze({
        enabled: environment.stripeBillingEnabled,
        label: environment.stripeBillingEnabled
          ? `Stripe ${environment.stripeMode === "live" ? "Live" : "Test"}`
          : "Non configurato",
      }),
    }),
  });
}

export type AdminOverview = Awaited<ReturnType<typeof readAdminOverview>>;
