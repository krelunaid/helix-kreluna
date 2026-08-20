import { getSql } from "@/lib/db";
import type { BuildJob } from "@/lib/agent-types";
import { HELIX_PIPELINE_VERSION } from "@/lib/server/jobs/pipeline";
import { sha256Hex } from "@/lib/server/agents/patch";
import {
  assertAegisReleasePassed,
  runAegisStaticScan,
} from "@/lib/server/quality/aegis";
import { createBrowserQualityNotRun } from "@/lib/server/quality/browser";
import {
  EchoAccessibilityReportSchema,
  SwiftPerformanceReportSchema,
  TwinBrowserReportSchema,
} from "@/lib/server/quality/types";
import { createTwinNotRunReport } from "@/lib/server/twin";
import { normalizePersistedScore } from "@/lib/score";
import { parseBuildLevel } from "@/lib/build-level";
import { sealBuildJobWorkspace } from "@/lib/server/release/workspace";

export type BuildQueueStatus = NonNullable<BuildJob["queue"]>["status"];

export type EnqueueBuildJobInput = {
  job: BuildJob;
  idempotencyKey: string;
  requestFingerprint: string;
  maxAttempts?: number;
};

type BuildJobRow = {
  id: string;
  payload: string;
  project_id: string | null;
  user_id: string | null;
  guest_access_token_hash: string | null;
  guest_access_expires_at: Date | string | null;
  request_fingerprint: string;
  pipeline_version: string;
  queue_status: BuildQueueStatus;
  attempt_count: number;
  max_attempts: number;
  heartbeat_at: Date | string | null;
  artifact_sha256: string | null;
};

type EnqueuedRow = { job_id: string; was_created: boolean };

export class BuildJobLeaseLostError extends Error {
  constructor() {
    super("BUILD_JOB_LEASE_LOST");
    this.name = "BuildJobLeaseLostError";
  }
}

function timestampToMillis(value: Date | string | null): number | undefined {
  if (!value) return undefined;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function publicStatus(queueStatus: BuildQueueStatus): BuildJob["status"] {
  if (queueStatus === "cancelled") return "cancelled";
  if (queueStatus === "failed" || queueStatus === "rejected") return "error";
  if (queueStatus === "queued" || queueStatus === "running" || queueStatus === "retry") {
    return "running";
  }
  return "ready";
}

function legacyStepKind(id: string): NonNullable<BuildJob["steps"]>[number]["kind"] {
  if (id === "gemini") return "orchestrator";
  if (["nova", "atlas", "lumen", "forge", "iris", "patch"].includes(id)) {
    return "ai_agent";
  }
  if (["aegis", "veil", "echo"].includes(id)) return "scanner";
  if (["twin", "storm", "harbor", "nimbus", "warden", "orbit", "cedar"].includes(id)) {
    return "service";
  }
  if (id === "seal") return "gate";
  return "validator";
}

export function serializeBuildJob(
  job: BuildJob,
  requestFingerprint = job.requestFingerprint,
): string {
  if (requestFingerprint) {
    job.requestFingerprint = requestFingerprint;
    if (job.checkpoint) job.checkpoint.requestFingerprint = requestFingerprint;
  }
  const { runtime: _runtime, ...persisted } = job;
  return JSON.stringify(persisted);
}

function hydrateBuildJob(row: BuildJobRow): BuildJob {
  const payload = JSON.parse(row.payload) as BuildJob;
  return {
    ...payload,
    id: row.id,
    buildLevel: parseBuildLevel(payload.buildLevel),
    status: publicStatus(row.queue_status),
    steps: (payload.steps ?? []).map((step) => ({
      ...step,
      kind: step.kind ?? legacyStepKind(step.id),
    })),
    score: normalizePersistedScore(
      payload.score,
      row.artifact_sha256 ?? undefined,
    ),
    currentHtml: payload.currentHtml ?? payload.html,
    projectId: row.project_id ?? undefined,
    userId: row.user_id ?? undefined,
    guestAccessTokenHash: row.guest_access_token_hash ?? undefined,
    guestAccessExpiresAt: timestampToMillis(row.guest_access_expires_at),
    requestFingerprint: row.request_fingerprint,
    checkpoint: {
      ...(payload.checkpoint ?? {}),
      pipelineVersion: row.pipeline_version,
      requestFingerprint: row.request_fingerprint,
      stage: payload.checkpoint?.stage ?? "queued",
    },
    queue: {
      status: row.queue_status,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      heartbeatAt: timestampToMillis(row.heartbeat_at),
      artifactSha256: row.artifact_sha256 ?? undefined,
    },
  };
}

const RETURNING_COLUMNS = `
  id, payload, project_id, user_id, guest_access_token_hash,
  guest_access_expires_at, queue_status, attempt_count, max_attempts,
  heartbeat_at, request_fingerprint, pipeline_version, artifact_sha256
`;

const RETURNING_JOB_COLUMNS = `
  job.id as id, job.payload, job.project_id, job.user_id,
  job.guest_access_token_hash, job.guest_access_expires_at,
  job.queue_status, job.attempt_count, job.max_attempts, job.heartbeat_at,
  job.request_fingerprint, job.pipeline_version, job.artifact_sha256
`;

export async function enqueueBuildJob({
  job,
  idempotencyKey,
  requestFingerprint,
  maxAttempts = 2,
}: EnqueueBuildJobInput): Promise<{ jobId: string; wasCreated: boolean }> {
  const sql = await getSql();
  const rows = await sql<EnqueuedRow>`
    select job_id, was_created
    from enqueue_build_job(
      ${job.id},
      ${job.projectId ?? null},
      ${job.userId ?? null},
      ${job.guestAccessTokenHash ?? null},
      ${job.guestAccessExpiresAt
        ? new Date(job.guestAccessExpiresAt).toISOString()
        : null},
      ${serializeBuildJob(job, requestFingerprint)},
      ${idempotencyKey},
      ${requestFingerprint},
      ${maxAttempts}
    )
  `;
  if (!rows[0]) throw new Error("BUILD_JOB_ENQUEUE_FAILED");
  return { jobId: rows[0].job_id, wasCreated: rows[0].was_created };
}

export async function loadBuildJob(jobId: string): Promise<BuildJob | null> {
  const sql = await getSql();
  const rows = await sql.query<BuildJobRow>(
    `select ${RETURNING_COLUMNS} from build_jobs where id = $1`,
    [jobId],
  );
  return rows[0] ? hydrateBuildJob(rows[0]) : null;
}

export async function findLatestBuildJob(projectId: string): Promise<BuildJob | null> {
  const sql = await getSql();
  const rows = await sql.query<BuildJobRow>(
    `select ${RETURNING_COLUMNS}
     from build_jobs
     where project_id = $1
     order by created_at desc, updated_at desc
     limit 1`,
    [projectId],
  );
  return rows[0] ? hydrateBuildJob(rows[0]) : null;
}

export async function claimBuildJob(
  jobId: string,
  workerId: string,
  leaseMs = 90_000,
): Promise<BuildJob | null> {
  const sql = await getSql();
  const rows = await sql.query<BuildJobRow>(
    `with candidate as (
       select id
       from build_jobs
       where id = $1
         and cancel_requested_at is null
         and attempt_count < max_attempts
         and available_at <= now()
         and (
           queue_status in ('queued', 'retry')
           or (queue_status = 'running' and lock_expires_at <= now())
         )
       for update skip locked
     )
     , claimed as (
       update build_jobs as job
     set queue_status = 'running',
         attempt_count = attempt_count + 1,
         locked_by = $2,
         lock_expires_at = now() + ($3 * interval '1 millisecond'),
         heartbeat_at = now(),
         started_at = coalesce(started_at, now()),
         updated_at = now()
     from candidate
     where job.id = candidate.id
       returning ${RETURNING_JOB_COLUMNS}
     ), attempt as (
       insert into build_job_attempts (job_id, attempt_number, worker_id)
       select id, attempt_count, $2 from claimed
       on conflict (job_id, attempt_number) do update
         set worker_id = excluded.worker_id,
             started_at = now(),
             finished_at = null,
             outcome = null,
             error_code = null,
             error_message = null
       returning job_id
     )
     select ${RETURNING_COLUMNS}
     from claimed
     where exists (select 1 from attempt)`,
    [jobId, workerId, leaseMs],
  );
  return rows[0] ? hydrateBuildJob(rows[0]) : null;
}

export async function heartbeatBuildJob(
  jobId: string,
  workerId: string,
  leaseMs = 90_000,
): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(
    `update build_jobs
     set heartbeat_at = now(),
         lock_expires_at = now() + ($3 * interval '1 millisecond'),
         updated_at = now()
     where id = $1
       and locked_by = $2
       and queue_status = 'running'
       and cancel_requested_at is null
       and lock_expires_at > now()
     returning id`,
    [jobId, workerId, leaseMs],
  );
  return Boolean(rows[0]);
}

export async function saveBuildJobSnapshot(
  job: BuildJob,
  workerId: string,
): Promise<void> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    update build_jobs
    set payload = ${serializeBuildJob(job)},
        stage = ${job.checkpoint?.stage ?? "queued"},
        project_id = ${job.projectId ?? null},
        user_id = ${job.userId ?? null},
        guest_access_token_hash = ${job.guestAccessTokenHash ?? null},
        guest_access_expires_at = ${job.guestAccessExpiresAt
          ? new Date(job.guestAccessExpiresAt).toISOString()
          : null},
        heartbeat_at = now(),
        pipeline_version = ${job.checkpoint?.pipelineVersion ?? HELIX_PIPELINE_VERSION},
        lock_expires_at = now() + interval '90 seconds',
        updated_at = now()
    where id = ${job.id}
      and locked_by = ${workerId}
      and queue_status = 'running'
      and cancel_requested_at is null
      and lock_expires_at > now()
    returning id
  `;
  if (!rows[0]) throw new BuildJobLeaseLostError();
}

export async function markBuildJobReady(job: BuildJob, workerId: string): Promise<void> {
  if (!job.html) throw new Error("BUILD_JOB_ARTIFACT_MISSING");
  const artifactSha256 = await sha256Hex(job.html);
  const suppliedBrowserEvidence = [
    job.quality?.twin,
    job.quality?.echo,
    job.quality?.swift,
  ];
  if (suppliedBrowserEvidence.every((report) => report === undefined)) {
    const [twin, browser] = await Promise.all([
      createTwinNotRunReport(
        job.html,
        "browser_runner_unconfigured",
        "No browser evidence was dispatched before the release candidate was sealed.",
      ),
      createBrowserQualityNotRun({
        html: job.html,
        detail:
          "No browser evidence was dispatched before the release candidate was sealed.",
      }),
    ]);
    job.quality = { ...(job.quality ?? {}), twin, ...browser };
  } else if (suppliedBrowserEvidence.some((report) => report === undefined)) {
    throw new Error("BUILD_JOB_BROWSER_EVIDENCE_INCOMPLETE");
  }
  const parsedBrowserEvidence = [
    TwinBrowserReportSchema.safeParse(job.quality?.twin),
    EchoAccessibilityReportSchema.safeParse(job.quality?.echo),
    SwiftPerformanceReportSchema.safeParse(job.quality?.swift),
  ];
  if (
    parsedBrowserEvidence.some(
      (result) =>
        !result.success || result.data.artifactSha256 !== artifactSha256,
    )
  ) {
    throw new Error("BUILD_JOB_BROWSER_EVIDENCE_INVALID");
  }
  const browserReports = parsedBrowserEvidence.map((result) => {
    if (!result.success) throw new Error("BUILD_JOB_BROWSER_EVIDENCE_INVALID");
    const report = result.data;
    return {
      report_kind: report.kind,
      artifact_sha256: report.artifactSha256,
      evidence_kind: report.evidence,
      status: report.status,
      runner: report.status === "not_run" ? null : report.runner,
      report,
    };
  });
  const browserReportsJson = JSON.stringify(browserReports);
  const aegis = await runAegisStaticScan(job.html);
  assertAegisReleasePassed(aegis, artifactSha256);
  job.quality = { ...(job.quality ?? {}), aegis };
  await sealBuildJobWorkspace(job);
  const aegisJson = JSON.stringify(aegis);
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    with eligible as materialized (
      select id, attempt_count
      from build_jobs
      where id = ${job.id}
        and locked_by = ${workerId}
        and queue_status = 'running'
        and cancel_requested_at is null
        and lock_expires_at > now()
      for update
    ), browser_input as materialized (
      select *
      from jsonb_to_recordset(${browserReportsJson}::jsonb) as evidence (
        report_kind text,
        artifact_sha256 text,
        evidence_kind text,
        status text,
        runner text,
        report jsonb
      )
    ), browser_quality as (
      insert into build_job_browser_reports (
        job_id, report_kind, artifact_sha256, evidence_kind,
        status, runner, report
      )
      select eligible.id, evidence.report_kind, evidence.artifact_sha256,
             evidence.evidence_kind, evidence.status, evidence.runner,
             evidence.report
      from eligible cross join browser_input as evidence
      on conflict (job_id, report_kind, artifact_sha256) do nothing
      returning report_kind
    ), browser_verified as (
      select report_kind from browser_quality
      union
      select existing.report_kind
      from build_job_browser_reports as existing
      join eligible on eligible.id = existing.job_id
      join browser_input as evidence
        on evidence.report_kind = existing.report_kind
       and evidence.artifact_sha256 = existing.artifact_sha256
       and evidence.evidence_kind = existing.evidence_kind
       and evidence.status = existing.status
       and evidence.runner is not distinct from existing.runner
       and evidence.report = existing.report
    ), quality as (
      insert into build_job_quality_reports (
        job_id, report_kind, artifact_sha256, evidence_kind,
        scanner, scanner_version, passed, blocker_count, report
      )
      select id, ${aegis.kind}, ${artifactSha256}, ${aegis.evidence},
             ${aegis.scanner}, ${aegis.version}, ${aegis.passed},
             ${aegis.blockerCount}, ${aegisJson}::jsonb
      from eligible
      on conflict (job_id, report_kind, artifact_sha256) do nothing
      returning job_id
    ), completed as (
      update build_jobs as job
      set payload = ${serializeBuildJob(job)},
          queue_status = 'awaiting_human_approval',
          stage = 'human_gate',
          artifact_sha256 = ${artifactSha256},
          completed_at = now(),
          locked_by = null,
          lock_expires_at = null,
          heartbeat_at = now(),
          last_error_code = null,
          last_error_message = null,
          last_error_trace = null,
          updated_at = now()
      from eligible
      where job.id = eligible.id
        and (select count(*) from browser_verified) = 3
        and (
          exists (select 1 from quality where quality.job_id = eligible.id)
          or exists (
            select 1
            from build_job_quality_reports as existing
            where existing.job_id = eligible.id
              and existing.report_kind = ${aegis.kind}
              and existing.artifact_sha256 = ${artifactSha256}
              and existing.evidence_kind = ${aegis.evidence}
              and existing.passed
              and existing.blocker_count = 0
              and existing.report = ${aegisJson}::jsonb
          )
        )
      returning job.id, eligible.attempt_count
    ), attempt as (
      update build_job_attempts
      set outcome = 'succeeded', finished_at = now()
      from completed
      where job_id = completed.id
        and attempt_number = completed.attempt_count
      returning job_id
    )
    select id from completed
  `;
  if (!rows[0]) throw new BuildJobLeaseLostError();
}

function errorDetails(error: unknown): {
  code: string;
  message: string;
  trace: string | null;
} {
  const message = error instanceof Error ? error.message : String(error);
  const rawCode =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  return {
    code: String(rawCode ?? (error instanceof Error ? error.name : "UNKNOWN_ERROR")).slice(
      0,
      80,
    ),
    message: message.slice(0, 500),
    trace: error instanceof Error && error.stack ? error.stack.slice(0, 8_000) : null,
  };
}

export async function markBuildJobFailed(
  job: BuildJob,
  workerId: string,
  error: unknown,
  options: { retryable?: boolean } = {},
): Promise<{ retry: boolean }> {
  const sql = await getSql();
  const details = errorDetails(error);
  const retryable = options.retryable ?? true;
  const rows = await sql<{ queue_status: BuildQueueStatus }>`
    with failed as (
      update build_jobs
      set payload = ${serializeBuildJob(job)},
          queue_status = case
            when ${retryable} and attempt_count < max_attempts then 'retry'
            else 'failed'
          end,
          available_at = now(),
          completed_at = case
            when ${retryable} and attempt_count < max_attempts then null
            else now()
          end,
          locked_by = null,
          lock_expires_at = null,
          heartbeat_at = now(),
          last_error_code = ${details.code},
          last_error_message = ${details.message},
          last_error_trace = ${details.trace},
          updated_at = now()
      where id = ${job.id}
        and locked_by = ${workerId}
        and queue_status = 'running'
        and cancel_requested_at is null
        and lock_expires_at > now()
      returning id, attempt_count, queue_status
    ), attempt as (
      update build_job_attempts
      set outcome = case when failed.queue_status = 'retry' then 'retry' else 'failed' end,
          finished_at = now(),
          error_code = ${details.code},
          error_message = ${details.message}
      from failed
      where job_id = failed.id
        and attempt_number = failed.attempt_count
      returning job_id
    )
    select queue_status from failed
  `;
  if (!rows[0]) throw new BuildJobLeaseLostError();
  return { retry: rows[0].queue_status === "retry" };
}

export async function requestBuildJobCancel(jobId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    update build_jobs
    set cancel_requested_at = now(),
        queue_status = case
          when queue_status in ('queued', 'retry', 'failed') then 'cancelled'
          else queue_status
        end,
        completed_at = case
          when queue_status in ('queued', 'retry', 'failed') then now()
          else completed_at
        end,
        updated_at = now()
    where id = ${jobId}
      and queue_status in ('queued', 'retry', 'running', 'failed')
    returning id
  `;
  return Boolean(rows[0]);
}

export async function markBuildJobCancelled(
  job: BuildJob,
  workerId: string,
): Promise<void> {
  const sql = await getSql();
  job.status = "cancelled";
  const rows = await sql<{ id: string }>`
    with cancelled as (
      update build_jobs
      set payload = ${serializeBuildJob(job)},
          queue_status = 'cancelled',
          completed_at = now(),
          locked_by = null,
          lock_expires_at = null,
          heartbeat_at = now(),
          updated_at = now()
      where id = ${job.id}
        and locked_by = ${workerId}
        and queue_status = 'running'
        and lock_expires_at > now()
      returning id, attempt_count
    ), attempt as (
      update build_job_attempts
      set outcome = 'cancelled', finished_at = now()
      from cancelled
      where job_id = cancelled.id
        and attempt_number = cancelled.attempt_count
      returning job_id
    )
    select id from cancelled
  `;
  if (!rows[0]) throw new BuildJobLeaseLostError();
}

export async function resumeBuildJob(jobId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    update build_jobs
    set queue_status = 'queued',
        max_attempts = greatest(max_attempts, attempt_count + 1),
        available_at = now(),
        cancel_requested_at = null,
        completed_at = null,
        locked_by = null,
        lock_expires_at = null,
        last_error_code = null,
        last_error_message = null,
        last_error_trace = null,
        updated_at = now()
    where id = ${jobId}
      and queue_status in ('failed', 'cancelled')
      and attempt_count < 5
    returning id
  `;
  return Boolean(rows[0]);
}
