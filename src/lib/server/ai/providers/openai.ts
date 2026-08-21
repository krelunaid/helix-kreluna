import {
  AiProviderError,
  UNKNOWN_AI_COST,
  UNKNOWN_AI_USAGE,
  type AiCompletionProvider,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiTokenUsage,
} from "@/lib/server/ai/types";

export const HELIX_OPENAI_MODEL = "gpt-5.6-terra" as const;
export const MIN_REASONING_PROVIDER_OUTPUT_TOKENS = 25_000;

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

/** Parse only OpenAI's documented Chat Completions token fields. */
export function parseOpenAiChatUsage(payload: unknown): {
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

  // Contradictory provider fields are discarded rather than repaired or guessed.
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

  // Chat Completions does not provide authoritative invoiced cost evidence.
  return {
    usage: {
      inputTokens,
      outputTokens,
      cachedInputTokens,
      totalTokens,
    },
    cost: UNKNOWN_AI_COST,
  };
}

function incompleteResponseError(finishReason: string | null): AiProviderError {
  if (finishReason === "length") {
    return new AiProviderError("OPENAI_GATEWAY_RESPONSE_INCOMPLETE_MAX_OUTPUT_TOKENS", {
      retryable: false,
    });
  }
  if (finishReason === "content_filter") {
    return new AiProviderError("OPENAI_GATEWAY_RESPONSE_CONTENT_FILTERED", {
      retryable: false,
    });
  }
  return new AiProviderError("OPENAI_GATEWAY_RESPONSE_INCOMPLETE", { retryable: false });
}

export function parseOpenAiChatCompletion(
  payload: unknown,
  options: { requestedModel: string; latencyMs: number },
): AiCompletionResult {
  const root = record(payload);
  const choices = Array.isArray(root?.choices) ? root.choices : [];
  const choice = record(choices[0]);
  const message = record(choice?.message);
  const refusal = nonEmptyString(message?.refusal);
  if (refusal) {
    throw new AiProviderError("OPENAI_GATEWAY_RESPONSE_REFUSED", { retryable: false });
  }

  const finishReason = nonEmptyString(choice?.finish_reason);
  if (finishReason !== "stop") throw incompleteResponseError(finishReason);

  const content = nonEmptyString(message?.content);
  if (!content) {
    throw new AiProviderError("OPENAI_GATEWAY_RESPONSE_EMPTY", { retryable: true });
  }

  const telemetry = parseOpenAiChatUsage(root);
  return {
    provider: "openai",
    requestedModel: options.requestedModel,
    reportedModel: nonEmptyString(root?.model),
    responseId: nonEmptyString(root?.id),
    content,
    latencyMs: options.latencyMs,
    usage: telemetry.usage,
    cost: telemetry.cost,
    delivery: "provider",
  };
}

function retryableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function validUserInput(user: unknown): user is AiCompletionRequest["user"] {
  if (typeof user === "string") return Boolean(user.trim());
  if (!Array.isArray(user)) return false;
  return (
    user.length > 0 &&
    user.every((part) => {
      const contentPart = record(part);
      if (contentPart?.type === "text") {
        return typeof contentPart.text === "string" && Boolean(contentPart.text.trim());
      }
      const imageUrl = record(contentPart?.image_url);
      return (
        contentPart?.type === "image_url" &&
        typeof imageUrl?.url === "string" &&
        Boolean(imageUrl.url.trim())
      );
    })
  );
}

function gatewayEndpoint(baseUrl: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(baseUrl);
  } catch (error) {
    throw new AiProviderError("NETLIFY_AI_GATEWAY_CONFIGURATION_INVALID", {
      retryable: false,
      cause: error,
    });
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(endpoint.hostname);
  if (
    (endpoint.protocol !== "https:" && !(loopback && endpoint.protocol === "http:")) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new AiProviderError("NETLIFY_AI_GATEWAY_CONFIGURATION_INVALID", {
      retryable: false,
    });
  }
  const basePath = endpoint.pathname.replace(/\/+$/, "");
  const versionedBasePath = basePath.endsWith("/v1") ? basePath : `${basePath}/v1`;
  endpoint.pathname = `${versionedBasePath}/chat/completions`;
  return endpoint.toString();
}

function validateRequest(request: AiCompletionRequest): void {
  const effort = request.effort ?? "low";
  if (
    request.model !== HELIX_OPENAI_MODEL ||
    typeof request.system !== "string" ||
    !request.system.trim() ||
    !validUserInput(request.user) ||
    !Number.isSafeInteger(request.maxOutputTokens) ||
    request.maxOutputTokens <= 0 ||
    !Number.isSafeInteger(request.providerMaxOutputTokens) ||
    request.providerMaxOutputTokens < request.maxOutputTokens ||
    (effort !== "low" && effort !== "high") ||
    (effort === "low" && request.providerMaxOutputTokens !== request.maxOutputTokens) ||
    (effort === "high" &&
      request.providerMaxOutputTokens < MIN_REASONING_PROVIDER_OUTPUT_TOKENS) ||
    !Number.isSafeInteger(request.timeoutMs) ||
    request.timeoutMs <= 0 ||
    !Number.isFinite(request.temperature) ||
    request.temperature < 0 ||
    request.temperature > 2 ||
    (request.safetyIdentifier !== undefined &&
      (typeof request.safetyIdentifier !== "string" ||
        !/^[0-9a-f]{64}$/.test(request.safetyIdentifier)))
  ) {
    throw new AiProviderError("AI_REQUEST_INVALID", { retryable: false });
  }
}

function assertVisibleOutputTokenBudget(
  payload: unknown,
  request: AiCompletionRequest,
): void {
  const usage = record(record(payload)?.usage);
  const completionTokens = nonNegativeSafeInteger(usage?.completion_tokens);
  if (completionTokens !== null && completionTokens > request.providerMaxOutputTokens) {
    throw new AiProviderError("OPENAI_GATEWAY_OUTPUT_TOKEN_EVIDENCE_INVALID", {
      retryable: false,
    });
  }

  if (request.effort !== "high") {
    if (completionTokens !== null && completionTokens > request.maxOutputTokens) {
      throw new AiProviderError("OPENAI_GATEWAY_VISIBLE_OUTPUT_LIMIT_EXCEEDED", {
        retryable: false,
      });
    }
    return;
  }

  const completionDetails = record(usage?.completion_tokens_details);
  const reasoningTokens = nonNegativeSafeInteger(completionDetails?.reasoning_tokens);
  if (
    completionTokens === null ||
    reasoningTokens === null ||
    reasoningTokens > completionTokens
  ) {
    throw new AiProviderError("OPENAI_GATEWAY_OUTPUT_TOKEN_EVIDENCE_INVALID", {
      retryable: false,
    });
  }
  if (completionTokens - reasoningTokens > request.maxOutputTokens) {
    throw new AiProviderError("OPENAI_GATEWAY_VISIBLE_OUTPUT_LIMIT_EXCEEDED", {
      retryable: false,
    });
  }
}

export function createOpenAiGatewayChatCompletionProvider(options: {
  gatewayKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): AiCompletionProvider {
  const gatewayKey = options.gatewayKey.trim();
  const baseUrl = options.baseUrl.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = baseUrl ? gatewayEndpoint(baseUrl) : null;

  return {
    id: "openai",
    async complete(request) {
      validateRequest(request);
      if (!gatewayKey || !endpoint) {
        throw new AiProviderError("NETLIFY_AI_GATEWAY_CONFIGURATION_MISSING", {
          retryable: false,
        });
      }
      const reasoningEffort = request.effort === "high" ? "high" : "none";
      const startedAt = Date.now();
      const timeoutSignal = AbortSignal.timeout(request.timeoutMs);
      const signal = request.signal
        ? AbortSignal.any([timeoutSignal, request.signal])
        : timeoutSignal;
      try {
        const body: JsonRecord = {
          model: request.model,
          messages: [
            { role: "developer", content: request.system },
            { role: "user", content: request.user },
          ],
          max_completion_tokens: request.providerMaxOutputTokens,
          reasoning_effort: reasoningEffort,
          store: false,
        };
        if (request.safetyIdentifier) body.safety_identifier = request.safetyIdentifier;
        // GPT-5.6 supports temperature only with reasoning disabled. High-effort
        // requests deliberately omit it instead of relying on provider coercion.
        if (reasoningEffort === "none") body.temperature = request.temperature;

        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${gatewayKey}`,
          },
          signal,
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          throw new AiProviderError(`OPENAI_GATEWAY_HTTP_${response.status}`, {
            retryable: retryableHttpStatus(response.status),
            status: response.status,
          });
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch (error) {
          throw new AiProviderError("OPENAI_GATEWAY_RESPONSE_INVALID", {
            retryable: true,
            cause: error,
          });
        }
        const result = parseOpenAiChatCompletion(payload, {
          requestedModel: request.model,
          latencyMs: Date.now() - startedAt,
        });
        assertVisibleOutputTokenBudget(payload, request);
        return result;
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        if (request.signal?.aborted) {
          throw new AiProviderError("AI_REQUEST_ABORTED", {
            retryable: false,
            cause: error,
          });
        }
        if (timeoutSignal.aborted) {
          throw new AiProviderError("OPENAI_GATEWAY_TIMEOUT", {
            retryable: true,
            cause: error,
          });
        }
        throw new AiProviderError("OPENAI_GATEWAY_NETWORK_ERROR", {
          retryable: true,
          cause: error,
        });
      }
    },
  };
}
