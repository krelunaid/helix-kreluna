import {
  AiProviderError,
  UNKNOWN_AI_COST,
  UNKNOWN_AI_USAGE,
  parseUsdTicks,
  type AiCompletionProvider,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiTokenUsage,
} from "@/lib/server/ai/types";

const XAI_CHAT_COMPLETIONS_URL = "https://api.x.ai/v1/chat/completions";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function nonNegativeSafeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Parse only fields documented by xAI's current chat-completions response. */
export function parseXaiChatUsage(payload: unknown): {
  usage: AiTokenUsage;
  cost: AiCompletionResult["cost"];
} {
  const usageRecord = record(record(payload)?.usage);
  if (!usageRecord) return { usage: UNKNOWN_AI_USAGE, cost: UNKNOWN_AI_COST };

  const inputTokens = nonNegativeSafeInteger(usageRecord.prompt_tokens);
  const outputTokens = nonNegativeSafeInteger(usageRecord.completion_tokens);
  let totalTokens = nonNegativeSafeInteger(usageRecord.total_tokens);
  const details = record(usageRecord.prompt_tokens_details);
  let cachedInputTokens = nonNegativeSafeInteger(details?.cached_tokens);

  // Contradictory provider fields are not repaired or guessed.
  if (cachedInputTokens !== null && inputTokens !== null && cachedInputTokens > inputTokens) {
    cachedInputTokens = null;
  }
  if (
    totalTokens !== null &&
    inputTokens !== null &&
    outputTokens !== null &&
    totalTokens < inputTokens + outputTokens
  ) {
    totalTokens = null;
  }

  const usdTicks = parseUsdTicks(usageRecord.cost_in_usd_ticks);
  return {
    usage: {
      inputTokens,
      outputTokens,
      cachedInputTokens,
      totalTokens,
    },
    cost: usdTicks ? { usdTicks, kind: "provider_actual", pricingVersion: null } : UNKNOWN_AI_COST,
  };
}

export function parseXaiChatCompletion(
  payload: unknown,
  options: { requestedModel: string; latencyMs: number },
): AiCompletionResult {
  const root = record(payload);
  const choices = Array.isArray(root?.choices) ? root.choices : [];
  const message = record(record(choices[0])?.message);
  const content = nonEmptyString(message?.content);
  const reasoning = nonEmptyString(message?.reasoning_content);
  const htmlReasoning =
    reasoning && /<(?:!doctype\s+html|html)[\s>]/i.test(reasoning) ? reasoning : null;
  const resolvedContent = content ?? htmlReasoning;
  if (!resolvedContent) {
    throw new AiProviderError("XAI_EMPTY_RESPONSE", { retryable: true });
  }

  const telemetry = parseXaiChatUsage(root);
  return {
    provider: "xai",
    requestedModel: options.requestedModel,
    reportedModel: nonEmptyString(root?.model),
    responseId: nonEmptyString(root?.id),
    content: resolvedContent,
    latencyMs: options.latencyMs,
    usage: telemetry.usage,
    cost: telemetry.cost,
  };
}

function retryableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function validateRequest(request: AiCompletionRequest): void {
  if (
    !request.model.trim() ||
    !request.system.trim() ||
    !Number.isSafeInteger(request.maxOutputTokens) ||
    request.maxOutputTokens <= 0 ||
    !Number.isSafeInteger(request.timeoutMs) ||
    request.timeoutMs <= 0 ||
    !Number.isFinite(request.temperature)
  ) {
    throw new AiProviderError("AI_REQUEST_INVALID", { retryable: false });
  }
}

export function createXaiChatCompletionProvider(options: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  endpoint?: string;
}): AiCompletionProvider {
  const apiKey = options.apiKey.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? XAI_CHAT_COMPLETIONS_URL;

  return {
    id: "xai",
    async complete(request) {
      validateRequest(request);
      if (!apiKey) {
        throw new AiProviderError("XAI_API_KEY_MISSING", { retryable: false });
      }

      const startedAt = Date.now();
      const timeoutSignal = AbortSignal.timeout(request.timeoutMs);
      const signal = request.signal
        ? AbortSignal.any([timeoutSignal, request.signal])
        : timeoutSignal;
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          signal,
          body: JSON.stringify({
            model: request.model,
            temperature: request.temperature,
            max_tokens: request.maxOutputTokens,
            reasoning_effort: request.effort ?? "low",
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
          }),
        });
        if (!response.ok) {
          throw new AiProviderError(`XAI_HTTP_${response.status}`, {
            retryable: retryableHttpStatus(response.status),
            status: response.status,
          });
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch (error) {
          throw new AiProviderError("XAI_RESPONSE_INVALID", {
            retryable: true,
            cause: error,
          });
        }
        return parseXaiChatCompletion(payload, {
          requestedModel: request.model,
          latencyMs: Date.now() - startedAt,
        });
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        if (request.signal?.aborted) {
          throw new AiProviderError("AI_REQUEST_ABORTED", {
            retryable: false,
            cause: error,
          });
        }
        if (timeoutSignal.aborted) {
          throw new AiProviderError("XAI_TIMEOUT", {
            retryable: true,
            cause: error,
          });
        }
        throw new AiProviderError("XAI_NETWORK_ERROR", {
          retryable: true,
          cause: error,
        });
      }
    },
  };
}
