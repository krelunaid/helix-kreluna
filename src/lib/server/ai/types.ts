/**
 * Provider-neutral AI completion contracts.
 *
 * Costs use xAI's integer USD ticks end-to-end when the provider supplies
 * them. One USD is 10^10 ticks. Decimal strings keep the value exact and JSON
 * safe; callers must never turn ticks into a floating-point source of truth.
 */
export type UsdTicks = string & { readonly __usdTicks: unique symbol };

export type AiContentPart =
  { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export type AiTokenUsage = Readonly<{
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  totalTokens: number | null;
}>;

export type AiCost = Readonly<{
  /** Exact integer USD ticks, or null when the provider did not measure cost. */
  usdTicks: UsdTicks | null;
  kind: "provider_actual" | "configured_estimate" | "unknown";
  /** Required for configured estimates; absent for provider actuals/unknowns. */
  pricingVersion: string | null;
}>;

export type AiCompletionRequest = Readonly<{
  model: string;
  system: string;
  user: string | AiContentPart[];
  maxOutputTokens: number;
  timeoutMs: number;
  temperature: number;
  effort?: "low" | "high";
  signal?: AbortSignal;
}>;

export type AiCompletionResult = Readonly<{
  provider: string;
  requestedModel: string;
  /** Null unless the provider explicitly returned its resolved model id. */
  reportedModel: string | null;
  responseId: string | null;
  content: string;
  latencyMs: number;
  usage: AiTokenUsage;
  cost: AiCost;
  /** Application cache is distinct from provider-side cached token evidence. */
  delivery?: "provider" | "application_cache";
}>;

/** Pure, side-effect-free validation of the provider/cache content boundary. */
export type AiContentValidator = (content: string) => boolean;

export type AiJobUsageSummary = Readonly<{
  evidence: "provider_telemetry";
  callCount: number;
  applicationCacheHitCount: number;
  retryCount: number;
  activeCallCount: number;
  succeededCallCount: number;
  failedCallCount: number;
  unknownOutcomeCallCount: number;
  knownInputTokens: number;
  knownOutputTokens: number;
  knownCachedInputTokens: number;
  knownTotalTokens: number;
  unknownUsageCallCount: number;
  unknownCostCallCount: number;
  totalProviderLatencyMs: number;
  elapsedMs: number;
  /** Sum of exact provider-reported costs only. */
  providerActualCostUsdTicks: UsdTicks;
  /** Actual costs plus conservative reservations for unknown-cost calls. */
  accountedCostUsdTicks: UsdTicks;
  actualCostComplete: boolean;
  budget: Readonly<{
    maxCalls: number;
    maxRetries: number;
    maxDurationMs: number;
    maxCostUsdTicks: UsdTicks;
  }>;
}>;

export interface AiCompletionProvider {
  readonly id: string;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}

export class AiProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(
    code: string,
    options: { retryable: boolean; status?: number | null; cause?: unknown },
  ) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AiProviderError";
    this.code = code;
    this.retryable = options.retryable;
    this.status = options.status ?? null;
  }
}

export const UNKNOWN_AI_USAGE: AiTokenUsage = Object.freeze({
  inputTokens: null,
  outputTokens: null,
  cachedInputTokens: null,
  totalTokens: null,
});

export const UNKNOWN_AI_COST: AiCost = Object.freeze({
  usdTicks: null,
  kind: "unknown",
  pricingVersion: null,
});

export function parseUsdTicks(value: unknown): UsdTicks | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return String(value) as UsdTicks;
  }
  if (typeof value !== "string" || value.length > 30 || !/^(?:0|[1-9]\d*)$/.test(value)) {
    return null;
  }
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) return null;
    return parsed.toString() as UsdTicks;
  } catch {
    return null;
  }
}

export function isValidAiCost(value: AiCost): boolean {
  const validTicks = value.usdTicks === null ? null : parseUsdTicks(value.usdTicks);
  if (value.kind === "unknown") {
    return value.usdTicks === null && value.pricingVersion === null;
  }
  if (validTicks === null) return false;
  if (value.kind === "provider_actual") return value.pricingVersion === null;
  return Boolean(value.pricingVersion?.trim());
}
