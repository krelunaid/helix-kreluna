import type { PublicBuildJob } from "@/lib/agent-types";
import { getSql } from "@/lib/db";
import {
  HELIX_PREVIEW_ORIGIN_HEADER,
  netlifyPreviewDispatchCredentials,
  type NetlifyPreviewDispatchContext,
} from "@/lib/server/jobs/netlify-preview-dispatch";

const DEFAULT_SWEEP_LIMIT = 25;
const MAX_SWEEP_LIMIT = 100;
const POLL_REDISPATCH_THROTTLE_MS = 2_000;
const BACKGROUND_FUNCTION_PATH = "/.netlify/functions/helix-job-background";
export const HELIX_QUEUE_HEADER = "x-helix-queue-token";

export class BuildRecoveryDispatchError extends Error {
  readonly code = "BUILD_JOB_DISPATCH_FAILED";
  readonly upstreamStatus: number;

  constructor(upstreamStatus: number) {
    super(`BUILD_JOB_DISPATCH_FAILED_${upstreamStatus}`);
    this.name = "BuildRecoveryDispatchError";
    this.upstreamStatus = upstreamStatus;
  }
}

export type PolledBuildRecoveryOutcome = "not_eligible" | "throttled" | "accepted" | "deferred";

type BuildJobDispatcher = (jobId: string) => Promise<void>;
type BuildJobRedispatchReservation = (jobId: string) => Promise<boolean>;

async function dispatchThroughCurrentRequest(jobId: string): Promise<void> {
  const { dispatchBuildJob } = await import("@/lib/server/jobs/dispatch.server");
  await dispatchBuildJob(jobId);
}

/**
 * Durable, cross-instance throttle for browser-poll recovery. A queued row has
 * no worker heartbeat, so heartbeat_at can safely record the last dispatch
 * attempt until a worker claims it. The worker claim remains the sole execution
 * lease and overwrites this timestamp when it starts.
 */
export async function reservePolledBuildJobRedispatch(jobId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(
    `update build_jobs
     set heartbeat_at = now()
     where id = $1
       and cancel_requested_at is null
       and attempt_count < max_attempts
       and available_at <= now()
       and (
         queue_status in ('queued', 'retry')
         or (queue_status = 'running' and lock_expires_at <= now())
       )
       and (
         heartbeat_at is null
         or heartbeat_at <= now() - ($2 * interval '1 millisecond')
       )
     returning id`,
    [jobId, POLL_REDISPATCH_THROTTLE_MS],
  );
  return Boolean(rows[0]);
}

/**
 * Call only after the poll endpoint has verified job ownership or its guest
 * bearer capability. The durable row decides eligibility again, closing races
 * between authorization, polling and a worker claim.
 */
export async function recoverPolledBuildJob(
  job: PublicBuildJob | null,
  dispatch: BuildJobDispatcher = dispatchThroughCurrentRequest,
  reserve: BuildJobRedispatchReservation = reservePolledBuildJobRedispatch,
): Promise<PolledBuildRecoveryOutcome> {
  if (
    !job?.queue ||
    (job.queue.status !== "queued" &&
      job.queue.status !== "retry" &&
      job.queue.status !== "running")
  ) {
    return "not_eligible";
  }
  let reserved: boolean;
  try {
    reserved = await reserve(job.id);
  } catch (error) {
    logPolledBuildRecoveryDeferred(job.id, "reserve", error);
    return "deferred";
  }
  if (!reserved) return "throttled";

  try {
    await dispatch(job.id);
    return "accepted";
  } catch (error) {
    logPolledBuildRecoveryDeferred(job.id, "dispatch", error);
    return "deferred";
  }
}

function logPolledBuildRecoveryDeferred(
  jobId: string,
  phase: "reserve" | "dispatch",
  error: unknown,
): void {
  console.error(
    JSON.stringify({
      level: "error",
      event: "build_job_poll_redispatch_deferred",
      phase,
      jobId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode:
        error && typeof error === "object" && "code" in error ? String(error.code) : undefined,
    }),
  );
}

export async function dispatchBuildJobFromNetlify(
  jobId: string,
  origin: string,
  secret: string,
  requestContext?: NetlifyPreviewDispatchContext,
): Promise<void> {
  const target = new URL(BACKGROUND_FUNCTION_PATH, origin);
  const headers = new Headers({
    "content-type": "application/json",
    [HELIX_QUEUE_HEADER]: secret,
  });
  const previewCredentials = netlifyPreviewDispatchCredentials(target, requestContext);
  if (previewCredentials) {
    headers.set("cookie", previewCredentials.cookieHeader);
    headers.set(HELIX_PREVIEW_ORIGIN_HEADER, previewCredentials.previewOrigin);
  }

  const response = await fetch(target, {
    method: "POST",
    headers,
    body: JSON.stringify({ jobId }),
    redirect: "manual",
  });
  if (response.status !== 202) {
    throw new BuildRecoveryDispatchError(response.status);
  }
}

/**
 * Lists work that a background worker can attempt to claim. This is deliberately
 * read-only: claimBuildJob remains the sole authority for leases and attempts.
 */
export async function listDispatchableBuildJobIds(limit = DEFAULT_SWEEP_LIMIT): Promise<string[]> {
  const boundedLimit = Math.min(
    MAX_SWEEP_LIMIT,
    Math.max(1, Math.trunc(Number.isFinite(limit) ? limit : DEFAULT_SWEEP_LIMIT)),
  );
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(
    `select id
     from build_jobs
     where cancel_requested_at is null
       and attempt_count < max_attempts
       and available_at <= now()
       and (
         queue_status in ('queued', 'retry')
         or (queue_status = 'running' and lock_expires_at <= now())
       )
     order by available_at asc, created_at asc
     limit $1`,
    [boundedLimit],
  );
  return rows.map((row) => row.id);
}
