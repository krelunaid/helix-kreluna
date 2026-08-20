import { getSql } from "@/lib/db";
import { AiBudgetError, type AiJobBudgetPolicy } from "@/lib/server/ai/budget";
import { BuildJobLeaseLostError } from "@/lib/server/jobs/queue";
import {
  parseUsdTicks,
  type AiCompletionResult,
  type AiJobUsageSummary,
  type UsdTicks,
} from "@/lib/server/ai/types";

type ReservationInput = Readonly<{
  callId: string;
  jobId: string;
  workerId: string;
  logicalCallKey: string;
  retryIndex: number;
  agentId: string;
  contractId: string;
  provider: string;
  requestedModel: string;
  requestSha256: string;
  maximumCostUsdTicks: UsdTicks;
  policy: AiJobBudgetPolicy & { maxCostUsdTicks: UsdTicks };
}>;

const DATABASE_BUDGET_CODES = [
  "AI_BUDGET_MAX_CALLS",
  "AI_BUDGET_MAX_RETRIES",
  "AI_BUDGET_MAX_DURATION",
  "AI_BUDGET_MAX_COST",
  "AI_BUDGET_POLICY_INVALID",
  "AI_BUDGET_RESERVATION_REJECTED",
  "AI_BUDGET_RECOVERY_FAILED",
  "AI_CALL_RESERVATION_NOT_FOUND",
  "BUILD_JOB_LEASE_LOST",
  "BUILD_JOB_NOT_FOUND",
] as const;

function databaseBudgetError(error: unknown): Error {
  const detail = [
    error instanceof Error ? error.message : String(error),
    typeof error === "object" && error !== null && "detail" in error
      ? String((error as { detail?: unknown }).detail ?? "")
      : "",
  ].join("\n");
  const code = DATABASE_BUDGET_CODES.find((candidate) => detail.includes(candidate));
  if (code === "BUILD_JOB_LEASE_LOST") {
    return new BuildJobLeaseLostError();
  }
  return new AiBudgetError(code ?? "AI_TELEMETRY_PERSISTENCE_FAILED");
}

function exactTicks(value: unknown): UsdTicks {
  const parsed = parseUsdTicks(typeof value === "bigint" ? value.toString() : value);
  if (parsed === null) throw new AiBudgetError("AI_TELEMETRY_COST_INVALID");
  return parsed;
}

function safeCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new AiBudgetError("AI_TELEMETRY_AGGREGATE_INVALID");
  }
  return parsed;
}

export async function recoverStaleAiCalls(input: {
  jobId: string;
  workerId: string;
}): Promise<number> {
  try {
    const sql = await getSql();
    const rows = await sql.query<{ recovered: number }>(
      "select recover_build_job_ai_calls($1, $2) as recovered",
      [input.jobId, input.workerId],
    );
    return safeCount(rows[0]?.recovered ?? 0);
  } catch (error) {
    throw databaseBudgetError(error);
  }
}

export async function reserveAiCallTelemetry(input: ReservationInput): Promise<number> {
  try {
    const sql = await getSql();
    const rows = await sql.query<{ attempt_number: number }>(
      `select reserve_build_job_ai_call(
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11::numeric, $12, $13, $14, $15::numeric
       ) as attempt_number`,
      [
        input.callId,
        input.jobId,
        input.workerId,
        input.logicalCallKey,
        input.retryIndex,
        input.agentId,
        input.contractId,
        input.provider,
        input.requestedModel,
        input.requestSha256,
        input.maximumCostUsdTicks,
        input.policy.maxCalls,
        input.policy.maxRetries,
        input.policy.maxDurationMs,
        input.policy.maxCostUsdTicks,
      ],
    );
    return safeCount(rows[0]?.attempt_number);
  } catch (error) {
    throw databaseBudgetError(error);
  }
}

export async function settleAiCallTelemetry(input: {
  callId: string;
  jobId: string;
  workerId: string;
  status: "succeeded" | "failed";
  result?: AiCompletionResult;
  resultSha256?: string;
  latencyMs: number;
  errorCode?: string;
}): Promise<"AI_COST_RESERVATION_EXCEEDED" | null> {
  const result = input.result;
  const usage = result?.usage;
  const cost = result?.cost;
  try {
    const sql = await getSql();
    const rows = await sql.query<{ violation_code: string | null }>(
      `select settle_build_job_ai_call(
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13::numeric, $14, $15, $16
       ) as violation_code`,
      [
        input.callId,
        input.jobId,
        input.workerId,
        input.status,
        result?.reportedModel ?? null,
        result?.responseId ?? null,
        input.resultSha256 ?? null,
        usage?.inputTokens ?? null,
        usage?.outputTokens ?? null,
        usage?.cachedInputTokens ?? null,
        usage?.totalTokens ?? null,
        input.latencyMs,
        cost?.usdTicks ?? null,
        cost?.kind ?? "unknown",
        cost?.pricingVersion ?? null,
        input.status === "failed" ? (input.errorCode ?? "AI_PROVIDER_ERROR").slice(0, 160) : null,
      ],
    );
    const violation = rows[0]?.violation_code ?? null;
    if (violation !== null && violation !== "AI_COST_RESERVATION_EXCEEDED") {
      throw new AiBudgetError("AI_TELEMETRY_SETTLEMENT_INVALID");
    }
    return violation;
  } catch (error) {
    if (error instanceof AiBudgetError) throw error;
    throw databaseBudgetError(error);
  }
}

type UsageAggregateRow = {
  call_count: number;
  retry_count: number;
  active_count: number;
  succeeded_count: number;
  failed_count: number;
  unknown_outcome_count: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  total_tokens: number;
  unknown_usage_count: number;
  unknown_cost_count: number;
  total_latency_ms: number;
  elapsed_ms: number;
  actual_cost_ticks: string;
  accounted_cost_ticks: string;
};

export async function readAiJobUsageSummary(input: {
  jobId: string;
  policy: AiJobBudgetPolicy & { maxCostUsdTicks: UsdTicks };
}): Promise<AiJobUsageSummary> {
  const sql = await getSql();
  const rows = await sql.query<UsageAggregateRow>(
    `select
       count(call.call_id)::integer as call_count,
       count(*) filter (where call.retry_index > 0)::integer as retry_count,
       count(*) filter (where call.status = 'started')::integer as active_count,
       count(*) filter (where call.status = 'succeeded')::integer as succeeded_count,
       count(*) filter (where call.status = 'failed')::integer as failed_count,
       count(*) filter (where call.status = 'unknown')::integer as unknown_outcome_count,
       coalesce(sum(call.input_tokens), 0)::bigint as input_tokens,
       coalesce(sum(call.output_tokens), 0)::bigint as output_tokens,
       coalesce(sum(call.cached_input_tokens), 0)::bigint as cached_input_tokens,
       coalesce(sum(call.total_tokens), 0)::bigint as total_tokens,
       count(*) filter (
         where call.status <> 'started'
           and (call.input_tokens is null or call.output_tokens is null
             or call.total_tokens is null)
       )::integer as unknown_usage_count,
       count(*) filter (
         where call.status <> 'started'
           and call.cost_kind <> 'provider_actual'
       )::integer as unknown_cost_count,
       coalesce(sum(call.latency_ms), 0)::bigint as total_latency_ms,
       coalesce(
         floor(extract(epoch from (
           coalesce(max(call.finished_at), now()) - min(call.started_at)
         )) * 1000),
         0
       )::bigint as elapsed_ms,
       coalesce(sum(call.cost_usd_ticks) filter (
         where call.cost_kind = 'provider_actual'
       ), 0)::text as actual_cost_ticks,
       job.ai_accounted_cost_usd_ticks::text as accounted_cost_ticks
     from build_jobs job
     left join build_job_ai_calls call on call.job_id = job.id
     where job.id = $1
     group by job.id, job.ai_accounted_cost_usd_ticks`,
    [input.jobId],
  );
  const row = rows[0];
  if (!row) throw new AiBudgetError("BUILD_JOB_NOT_FOUND");
  const unknownOutcomeCallCount = safeCount(row.unknown_outcome_count);
  const failedCallCount = safeCount(row.failed_count);
  const unknownUsageCallCount = safeCount(row.unknown_usage_count);
  const unknownCostCallCount = safeCount(row.unknown_cost_count);
  const activeCallCount = safeCount(row.active_count);
  return Object.freeze({
    evidence: "provider_telemetry",
    callCount: safeCount(row.call_count),
    retryCount: safeCount(row.retry_count),
    activeCallCount,
    succeededCallCount: safeCount(row.succeeded_count),
    failedCallCount,
    unknownOutcomeCallCount,
    knownInputTokens: safeCount(row.input_tokens),
    knownOutputTokens: safeCount(row.output_tokens),
    knownCachedInputTokens: safeCount(row.cached_input_tokens),
    knownTotalTokens: safeCount(row.total_tokens),
    unknownUsageCallCount,
    unknownCostCallCount,
    totalProviderLatencyMs: safeCount(row.total_latency_ms),
    elapsedMs: safeCount(row.elapsed_ms),
    providerActualCostUsdTicks: exactTicks(row.actual_cost_ticks),
    accountedCostUsdTicks: exactTicks(row.accounted_cost_ticks),
    actualCostComplete:
      activeCallCount === 0 && unknownCostCallCount === 0 && unknownOutcomeCallCount === 0,
    budget: Object.freeze({
      maxCalls: input.policy.maxCalls,
      maxRetries: input.policy.maxRetries,
      maxDurationMs: input.policy.maxDurationMs,
      maxCostUsdTicks: input.policy.maxCostUsdTicks,
    }),
  });
}
