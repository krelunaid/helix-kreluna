import type { BuildJob } from "@/lib/agent-types";
import { AGENT_CONTRACTS, type AgentContractId } from "@/lib/server/agents/contracts";
import { sha256Hex } from "@/lib/server/agents/patch";
import { defineAiJobBudgetPolicy, AiBudgetError } from "@/lib/server/ai/budget";
import {
  evictAiResponseCache,
  readAiResponseCache,
  recordAiResponseCacheHit,
  writeAiResponseCache,
} from "@/lib/server/ai/cache";
import { AiProviderRegistry } from "@/lib/server/ai/provider";
import {
  createOpenAiGatewayChatCompletionProvider,
  MIN_REASONING_PROVIDER_OUTPUT_TOKENS,
} from "@/lib/server/ai/providers/openai";
import {
  AiProviderError,
  parseUsdTicks,
  type AiCompletionResult,
  type AiContentValidator,
  type AiContentPart,
  type UsdTicks,
} from "@/lib/server/ai/types";
import {
  readAiJobUsageSummary,
  recoverStaleAiCalls,
  reserveAiCallTelemetry,
  settleAiCallTelemetry,
} from "@/lib/server/ai/telemetry";
import { persistBuildJob } from "@/lib/server/persistence/build-jobs";

const configuredPolicy = defineAiJobBudgetPolicy({
  maxCalls: 16,
  maxRetries: 2,
  maxDurationMs: 10 * 60_000,
  maxCostUsdTicks: "90000000000",
});
if (configuredPolicy.maxCostUsdTicks === null) {
  throw new Error("HELIX_AI_HARD_COST_BUDGET_REQUIRED");
}

export const HELIX_AI_JOB_BUDGET = Object.freeze({
  ...configuredPolicy,
  maxCostUsdTicks: configuredPolicy.maxCostUsdTicks,
}) as typeof configuredPolicy & { maxCostUsdTicks: UsdTicks };

export type AgentCompletionInput = Readonly<{
  job: BuildJob;
  contractId: Exclude<AgentContractId, "helix">;
  agentId: string;
  logicalCallKey: string;
  retryIndex?: number;
  providerId?: string;
  system: string;
  user: string | AiContentPart[];
  temperature: number;
  effort?: "low" | "high";
  validateContent: AiContentValidator;
}>;

function configuredProviders(): AiProviderRegistry {
  const gatewayKey = process.env.NETLIFY_AI_GATEWAY_KEY?.trim();
  const baseUrl = process.env.NETLIFY_AI_GATEWAY_BASE_URL?.trim();
  return new AiProviderRegistry(
    gatewayKey && baseUrl
      ? [createOpenAiGatewayChatCompletionProvider({ gatewayKey, baseUrl })]
      : [],
  );
}

function errorCode(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  return String(code ?? (error instanceof Error ? error.name : "AI_PROVIDER_ERROR"))
    .replace(/[^A-Z0-9_:-]/gi, "_")
    .slice(0, 160);
}

async function refreshUsage(job: BuildJob): Promise<void> {
  job.aiUsage = await readAiJobUsageSummary({
    jobId: job.id,
    policy: HELIX_AI_JOB_BUDGET,
  });
  if (!job.runtime?.abortSignal.aborted) await persistBuildJob(job);
}

function assertContractInput(input: AgentCompletionInput): {
  model: string;
  maximumCostUsdTicks: UsdTicks;
  retryIndex: number;
  maxOutputTokens: number;
  providerMaxOutputTokens: number;
} {
  const contract = AGENT_CONTRACTS[input.contractId];
  const model = contract.model;
  const retryIndex = input.retryIndex ?? 0;
  const maximumCostUsdTicks = parseUsdTicks(contract.maxCostUsdTicks);
  const maxOutputTokens = contract.maxTokens;
  const providerMaxOutputTokens =
    input.effort === "high"
      ? Math.max(MIN_REASONING_PROVIDER_OUTPUT_TOKENS, maxOutputTokens)
      : maxOutputTokens;
  const highEffortAllowed =
    (input.contractId === "forgeUi" || input.contractId === "forgeLogic") &&
    maximumCostUsdTicks !== null &&
    BigInt(maximumCostUsdTicks) >= 15_000_000_000n;
  if (
    !model ||
    !contract.allowedTools.includes("requestAiCompletion") ||
    maximumCostUsdTicks === null ||
    !Number.isSafeInteger(retryIndex) ||
    retryIndex < 0 ||
    retryIndex > contract.maxRetries ||
    !input.agentId.trim() ||
    !input.logicalCallKey.trim() ||
    (input.effort === "high" && !highEffortAllowed) ||
    typeof input.validateContent !== "function"
  ) {
    throw new AiBudgetError("AI_AGENT_CONTRACT_INVALID");
  }
  return {
    model,
    maximumCostUsdTicks,
    retryIndex,
    maxOutputTokens,
    providerMaxOutputTokens,
  };
}

function contentPassesValidator(validator: AiContentValidator, content: string): boolean {
  try {
    return validator(content) === true;
  } catch {
    return false;
  }
}

/**
 * The only model-call gateway used by Helix. It reserves a durable budget and
 * writes a prompt-free telemetry row before any provider request is sent.
 */
export async function requestAgentCompletion(
  input: AgentCompletionInput,
): Promise<AiCompletionResult> {
  const { job } = input;
  const runtime = job.runtime;
  if (!runtime) throw new AiBudgetError("BUILD_JOB_WORKER_CONTEXT_MISSING");
  runtime.abortSignal.throwIfAborted();

  const {
    model,
    maximumCostUsdTicks,
    retryIndex,
    maxOutputTokens,
    providerMaxOutputTokens,
  } = assertContractInput(input);
  const providerId = input.providerId ?? "openai";
  const safetyIdentifier = job.userId
    ? await sha256Hex(`helix-openai-safety:${job.userId}`)
    : undefined;
  await recoverStaleAiCalls({ jobId: job.id, workerId: runtime.workerId });

  const callId = crypto.randomUUID();
  const requestSha256 = await sha256Hex(
    JSON.stringify({
      provider: providerId,
      contractId: input.contractId,
      model,
      system: input.system,
      user: input.user,
      maxOutputTokens,
      providerMaxOutputTokens,
      temperature: input.temperature,
      effort: input.effort ?? "low",
      safetyIdentifier: safetyIdentifier ?? null,
    }),
  );
  const cacheKey = job.userId
    ? {
        userId: job.userId,
        provider: providerId,
        requestedModel: model,
        contractId: input.contractId,
        contractVersion: AGENT_CONTRACTS[input.contractId].version,
        requestSha256,
      }
    : null;

  // Guest jobs deliberately bypass this cache. For authenticated jobs a hit is
  // returned only after durable hit evidence has been written; otherwise the
  // normal provider path remains the source of truth.
  if (cacheKey) {
    const lookupStartedAt = Date.now();
    let cached: Awaited<ReturnType<typeof readAiResponseCache>> = null;
    try {
      const candidate = await readAiResponseCache(cacheKey);
      if (candidate) {
        if (!contentPassesValidator(input.validateContent, candidate.result.content)) {
          await evictAiResponseCache({ key: cacheKey, cacheId: candidate.cacheId });
          console.error(
            JSON.stringify({
              level: "error",
              event: "ai_response_cache_contract_invalid",
              jobId: job.id,
              contractId: input.contractId,
            }),
          );
        } else {
          await recordAiResponseCacheHit({
            jobId: job.id,
            cacheId: candidate.cacheId,
            logicalCallKey: input.logicalCallKey,
            contractId: input.contractId,
            requestSha256,
            lookupLatencyMs: Date.now() - lookupStartedAt,
          });
          cached = candidate;
        }
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "ai_response_cache_lookup_failed",
          jobId: job.id,
          errorCode: errorCode(error),
        }),
      );
    }
    if (cached) {
      await refreshUsage(job);
      return cached.result;
    }
  }

  // Configuration is validated before reserving a call because no provider
  // request (and therefore no charge) can occur without a configured adapter.
  if (providerId === "openai" && process.env.HELIX_AI_GATEWAY_ENABLED !== "true") {
    throw new AiProviderError("HELIX_AI_DISABLED", { retryable: false });
  }
  const providers = configuredProviders();
  if (providerId === "openai" && !providers.ids().includes("openai")) {
    throw new AiProviderError("NETLIFY_AI_GATEWAY_CONFIGURATION_MISSING", {
      retryable: false,
    });
  }
  const provider = providers.get(providerId);
  await reserveAiCallTelemetry({
    callId,
    jobId: job.id,
    workerId: runtime.workerId,
    logicalCallKey: input.logicalCallKey.trim().slice(0, 240),
    retryIndex,
    agentId: input.agentId.trim().slice(0, 120),
    contractId: input.contractId,
    provider: providerId,
    requestedModel: model,
    requestSha256,
    maximumCostUsdTicks,
    policy: HELIX_AI_JOB_BUDGET,
  });

  try {
    await refreshUsage(job);
  } catch (error) {
    try {
      await settleAiCallTelemetry({
        callId,
        jobId: job.id,
        workerId: runtime.workerId,
        status: "failed",
        latencyMs: 0,
        errorCode: "AI_BUDGET_STATE_PERSIST_FAILED",
      });
    } catch (settlementError) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "ai_call_reservation_cleanup_failed",
          jobId: job.id,
          callId,
          errorCode: errorCode(settlementError),
        }),
      );
    }
    throw error;
  }

  const startedAt = Date.now();
  let result: AiCompletionResult;
  try {
    result = await provider.complete({
      model,
      system: input.system,
      user: input.user,
      maxOutputTokens,
      providerMaxOutputTokens,
      timeoutMs: AGENT_CONTRACTS[input.contractId].timeoutMs,
      temperature: input.temperature,
      effort: input.effort,
      safetyIdentifier,
      signal: runtime.abortSignal,
    });
  } catch (error) {
    await settleAiCallTelemetry({
      callId,
      jobId: job.id,
      workerId: runtime.workerId,
      status: "failed",
      latencyMs: Math.max(0, Date.now() - startedAt),
      errorCode: errorCode(error),
    });
    await refreshUsage(job);
    throw error;
  }

  const violation = await settleAiCallTelemetry({
    callId,
    jobId: job.id,
    workerId: runtime.workerId,
    status: "succeeded",
    result,
    resultSha256: await sha256Hex(result.content),
    latencyMs: result.latencyMs,
  });
  await refreshUsage(job);
  if (violation) throw new AiBudgetError(violation);
  const validForContract = contentPassesValidator(input.validateContent, result.content);
  if (cacheKey && validForContract) {
    try {
      await writeAiResponseCache({ key: cacheKey, result });
    } catch (error) {
      // A cache write is an optimization failure, not a provider-call failure.
      // Log only a normalized code; prompts and response content stay redacted.
      console.error(
        JSON.stringify({
          level: "error",
          event: "ai_response_cache_write_failed",
          jobId: job.id,
          callId,
          errorCode: errorCode(error),
        }),
      );
    }
  } else if (!validForContract) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "ai_provider_response_contract_invalid",
        jobId: job.id,
        callId,
        contractId: input.contractId,
      }),
    );
  }
  return result;
}
