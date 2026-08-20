import type { BuildJob } from "@/lib/agent-types";
import { t } from "@/lib/i18n-core";
import { isValidHtmlArtifact } from "@/lib/server/agents/html";
import { runCrew } from "@/lib/server/orchestrator/helix";
import { persistBuildJob } from "@/lib/server/persistence/build-jobs";
import {
  BuildJobLeaseLostError,
  claimBuildJob,
  heartbeatBuildJob,
  markBuildJobCancelled,
  markBuildJobFailed,
  markBuildJobReady,
} from "@/lib/server/jobs/queue";

export type ProcessBuildJobResult =
  | "completed"
  | "retry"
  | "failed"
  | "cancelled"
  | "not_claimed";

const HEARTBEAT_MS = 20_000;
const LEASE_MS = 90_000;
const WORKER_DEADLINE_MS = 12 * 60_000;

type AbortKind = "lease_or_cancel" | "heartbeat_error" | "deadline" | null;

function errorCode(error: unknown): string {
  const rawCode =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  return String(
    rawCode ?? (error instanceof Error ? error.name : "UNKNOWN_BUILD_ERROR"),
  ).slice(0, 80);
}

function isRetryable(error: unknown): boolean {
  return !(
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    (error as { retryable?: unknown }).retryable === false
  );
}

async function releaseGuestLease(job: BuildJob): Promise<void> {
  const lease = job.guestBudgetLease;
  if (!lease) return;
  const { releaseGuestBudget } = await import("@/lib/server/guest-abuse.server");
  await releaseGuestBudget(lease);
  job.guestBudgetLease = undefined;
}

function logWorkerFailure(
  event: string,
  jobId: string,
  workerId: string,
  error: unknown,
): void {
  console.error(
    JSON.stringify({
      level: "error",
      event,
      jobId,
      workerId,
      errorCode: errorCode(error),
      errorName: error instanceof Error ? error.name : "UnknownError",
    }),
  );
}

export async function processBuildJob(jobId: string): Promise<ProcessBuildJobResult> {
  const workerId = crypto.randomUUID();
  const job = await claimBuildJob(jobId, workerId, LEASE_MS);
  if (!job) return "not_claimed";

  const controller = new AbortController();
  let abortKind: AbortKind = null;
  let heartbeatInFlight = false;
  job.runtime = { workerId, abortSignal: controller.signal };

  const deadline = setTimeout(() => {
    abortKind = "deadline";
    controller.abort(new Error("BUILD_JOB_DEADLINE_EXCEEDED"));
  }, WORKER_DEADLINE_MS);

  const heartbeat = setInterval(() => {
    if (heartbeatInFlight || controller.signal.aborted) return;
    heartbeatInFlight = true;
    void heartbeatBuildJob(job.id, workerId, LEASE_MS)
      .then((alive) => {
        if (!alive && !controller.signal.aborted) {
          abortKind = "lease_or_cancel";
          controller.abort(new BuildJobLeaseLostError());
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          abortKind = "heartbeat_error";
          controller.abort(
            error instanceof Error ? error : new Error("BUILD_JOB_HEARTBEAT_FAILED"),
          );
        }
      })
      .finally(() => {
        heartbeatInFlight = false;
      });
  }, HEARTBEAT_MS);

  try {
    const result = await runCrew(job);
    controller.signal.throwIfAborted();
    if (!result.usedAi || !isValidHtmlArtifact(result.html)) {
      const error = new Error("HELIX_ARTIFACT_NOT_PRODUCED");
      error.name = "AgentOutputError";
      throw error;
    }

    job.html = result.html;
    job.usedAi = true;
    job.title = result.title || job.title;
    job.status = "ready";
    job.error = undefined;
    job.wire = `Validated model artifact · ${Math.round(result.html.length / 1024)} KB`;
    await persistBuildJob(job, [
      {
        role: "assistant",
        content: t(job.locale, "agent.ready"),
        kind:
          job.mode === "debug"
            ? "debug"
            : job.mode === "iterate"
              ? "iterate"
              : "build",
        agent: "Helix",
      },
    ]);
    await markBuildJobReady(job, workerId);
    try {
      await releaseGuestLease(job);
    } catch (error) {
      logWorkerFailure("guest_budget_lease_release_failed", job.id, workerId, error);
    }
    return "completed";
  } catch (error) {
    if (abortKind === "lease_or_cancel") {
      try {
        await markBuildJobCancelled(job, workerId);
        try {
          await releaseGuestLease(job);
        } catch (releaseError) {
          logWorkerFailure(
            "guest_budget_lease_release_failed",
            job.id,
            workerId,
            releaseError,
          );
        }
        return "cancelled";
      } catch (cancelError) {
        if (cancelError instanceof BuildJobLeaseLostError) return "not_claimed";
        throw cancelError;
      }
    }

    if (error instanceof BuildJobLeaseLostError) return "not_claimed";
    if (abortKind === "deadline" || abortKind === "heartbeat_error") {
      // The work signal is intentionally dead, but fenced queue/project failure
      // persistence still has to complete while this worker owns the lease.
      job.runtime = {
        workerId,
        abortSignal: new AbortController().signal,
      };
    }
    const retryable = isRetryable(error);
    const willRetry = Boolean(
      retryable && job.queue && job.queue.attemptCount < job.queue.maxAttempts,
    );
    job.status = willRetry ? "running" : "error";
    job.error = error instanceof Error ? error.message : "Crew failed";
    const failedCode = errorCode(error);
    job.steps = job.steps.map((step) =>
      step.status === "running"
        ? {
            ...step,
            status: "error",
            detail: failedCode,
            errorCode: failedCode,
            validation: "not_run",
          }
        : step,
    );

    try {
      await persistBuildJob(
        job,
        willRetry
          ? []
          : [
              {
                role: "assistant",
                content: `Helix failed: ${errorCode(error)}`,
                kind: "build",
                agent: "Helix",
              },
            ],
      );
      const outcome = await markBuildJobFailed(job, workerId, error, { retryable });
      if (!outcome.retry) {
        try {
          await releaseGuestLease(job);
        } catch (releaseError) {
          logWorkerFailure(
            "guest_budget_lease_release_failed",
            job.id,
            workerId,
            releaseError,
          );
        }
      }
      logWorkerFailure("build_job_attempt_failed", job.id, workerId, error);
      return outcome.retry ? "retry" : "failed";
    } catch (persistenceError) {
      if (persistenceError instanceof BuildJobLeaseLostError) return "not_claimed";
      logWorkerFailure(
        "build_job_failure_persistence_failed",
        job.id,
        workerId,
        persistenceError,
      );
      throw persistenceError;
    }
  } finally {
    clearTimeout(deadline);
    clearInterval(heartbeat);
    job.runtime = undefined;
  }
}
