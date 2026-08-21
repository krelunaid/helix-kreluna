import type { BuildJob } from "@/lib/agent-types";
import { craftOf } from "@/lib/house";
import type { AgentContractId } from "@/lib/server/agents/contracts";
import type { ChatGrokOptions } from "@/lib/server/agents/types";
import { requestAgentCompletion } from "@/lib/server/ai/gateway";
import { AiProviderError } from "@/lib/server/ai/types";
import { BuildJobLeaseLostError } from "@/lib/server/jobs/queue";
import { think } from "@/lib/server/orchestrator/state";
import { persistBuildJob } from "@/lib/server/persistence/build-jobs";

export type TrackedChatOptions = ChatGrokOptions & {
  job: BuildJob;
  agent: string;
  contractId: Exclude<AgentContractId, "helix">;
  logicalCallKey: string;
  retryIndex?: number;
  validateContent: (content: string) => boolean;
};

/** Provider-neutral tracked model call. Provider selection remains explicit in the gateway. */
export async function chatModel(options: TrackedChatOptions): Promise<string> {
  const { job, agent } = options;
  const model = options.model ?? "grok-4.5";
  const startedAt = Date.now();
  const craft = craftOf(agent, job.locale);
  job.beat = startedAt;
  job.wire =
    job.locale === "it"
      ? `${agent} · ${craft} · al lavoro · 0s · segnale vivo`
      : `${agent} · ${craft} · working · 0s · live signal`;
  await persistBuildJob(job);
  const ticker = setInterval(() => {
    const seconds = Math.round((Date.now() - startedAt) / 1e3);
    job.beat = Date.now();
    job.wire =
      job.locale === "it"
        ? `${agent} · ${craft} · al lavoro · ${seconds}s · segnale vivo`
        : `${agent} · ${craft} · working · ${seconds}s · live signal`;
  }, 2_500);
  try {
    const response = await requestAgentCompletion({
      job,
      contractId: options.contractId,
      agentId: agent,
      logicalCallKey: options.logicalCallKey,
      retryIndex: options.retryIndex,
      system: options.system,
      user: options.user,
      temperature: options.temperature,
      effort: options.effort,
      validateContent: options.validateContent,
    });
    job.beat = Date.now();
    job.wire =
      job.locale === "it"
        ? `${agent} · ${craft} · ha consegnato · ${response.latencyMs}ms`
        : `${agent} · ${craft} · delivered · ${response.latencyMs}ms`;
    await persistBuildJob(job);
    return response.content;
  } catch (error) {
    if (error instanceof BuildJobLeaseLostError) throw error;
    const normalized =
      error instanceof AiProviderError
        ? error
        : typeof error === "object" && error !== null && "code" in error
          ? (error as { code: string; retryable: boolean })
          : new AiProviderError(
              job.runtime?.abortSignal.aborted
                ? "BUILD_JOB_ABORTED"
                : error instanceof DOMException && error.name === "TimeoutError"
                  ? "AI_PROVIDER_TIMEOUT"
                  : "AI_PROVIDER_NETWORK_ERROR",
              { retryable: true, cause: error },
            );
    job.beat = Date.now();
    job.wire = `${agent} · ${craft} · ${normalized.code}`;
    think(
      job,
      agent,
      `Errore modello: ${normalized.code}. Il job non viene dichiarato completato.`,
      `Model error: ${normalized.code}. The job will not be marked complete.`,
    );
    if (!job.runtime?.abortSignal.aborted) await persistBuildJob(job);
    console.error(
      JSON.stringify({
        level: "error",
        event: "ai_provider_request_failed",
        provider: "xai",
        jobId: job.id,
        agent,
        model,
        code: normalized.code,
        retryable: normalized.retryable,
      }),
    );
    throw normalized;
  } finally {
    clearInterval(ticker);
  }
}
