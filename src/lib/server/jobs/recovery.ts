import { getSql } from "@/lib/db";

const DEFAULT_SWEEP_LIMIT = 25;
const MAX_SWEEP_LIMIT = 100;
const BACKGROUND_FUNCTION_PATH = "/.netlify/functions/helix-job-background";
export const HELIX_QUEUE_HEADER = "x-helix-queue-token";

export async function dispatchBuildJobFromNetlify(
  jobId: string,
  origin: string,
  secret: string,
): Promise<void> {
  const response = await fetch(new URL(BACKGROUND_FUNCTION_PATH, origin), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [HELIX_QUEUE_HEADER]: secret,
    },
    body: JSON.stringify({ jobId }),
  });
  if (!response.ok) {
    throw new Error(`BUILD_JOB_DISPATCH_FAILED_${response.status}`);
  }
}

/**
 * Lists work that a background worker can attempt to claim. This is deliberately
 * read-only: claimBuildJob remains the sole authority for leases and attempts.
 */
export async function listDispatchableBuildJobIds(
  limit = DEFAULT_SWEEP_LIMIT,
): Promise<string[]> {
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
