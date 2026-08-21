import { createServerFn } from "@tanstack/react-start";
import type { BuildJob } from "@/lib/agent-types";
import type { Sql } from "@/lib/db";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { hashGuestBuildToken } from "@/lib/server/build-job-access";
import { isValidHtmlArtifact } from "@/lib/server/agents/html";
import { sha256Hex } from "@/lib/server/agents/patch";
import { serializeBuildJob } from "@/lib/server/jobs/queue";
import { parseBuildLevel, type BuildLevel } from "@/lib/build-level";
import {
  verifyWorkspace,
  type WorkspaceManifest,
} from "@/lib/workspace";
import { assertSealedProductionBuildJobWorkspace } from "@/lib/server/release/production-workspace";
import { HELIX_PIPELINE_VERSION } from "@/lib/server/jobs/pipeline";

export type HumanGateDecision = "approve" | "reject" | "modify";
export type HumanGateActor = "user" | "guest";

export type HumanGateEvent = {
  id: number;
  jobId: string;
  projectId: string | null;
  actorType: HumanGateActor;
  decision: HumanGateDecision;
  fromStatus: "awaiting_human_approval";
  toStatus: "approved" | "rejected";
  requestId: string;
  reason: string | null;
  artifactSha256: string;
  resultJobId: string | null;
  createdAt: string;
};

type GateEventRow = {
  id: number;
  job_id: string;
  project_id: string | null;
  actor_type: HumanGateActor;
  decision: HumanGateDecision;
  from_status: "awaiting_human_approval";
  to_status: "approved" | "rejected";
  request_id: string;
  reason: string | null;
  artifact_sha256: string;
  result_job_id: string | null;
  created_at: string;
};

export type ApprovedBuildArtifact = {
  jobId: string;
  projectId: string | null;
  title: string;
  html: string;
  artifactSha256: string;
  buildLevel: BuildLevel;
  files: Record<string, string>;
  workspace?: WorkspaceManifest;
};

type GateJobRow = {
  id: string;
  project_id: string | null;
  user_id: string | null;
  payload: string;
  pipeline_version: string;
  request_fingerprint: string;
  queue_status: string;
  artifact_sha256: string | null;
  guest_access_token_hash: string | null;
  guest_access_expires_at: string | Date | null;
  current_build_job_id?: string | null;
  approval_recorded?: boolean | number;
  security_passed?: boolean | number;
};

export class HumanGateError extends Error {
  readonly status: 403 | 409;
  readonly code:
    | "HUMAN_GATE_FORBIDDEN"
    | "HUMAN_GATE_CLOSED"
    | "HUMAN_GATE_ARTIFACT_NOT_SEALED"
    | "HUMAN_GATE_SECURITY_NOT_PASSED"
    | "HUMAN_GATE_REQUEST_REUSED";

  constructor(
    code: HumanGateError["code"],
    status: HumanGateError["status"] = code === "HUMAN_GATE_FORBIDDEN" ? 403 : 409,
  ) {
    super(code);
    this.name = "HumanGateError";
    this.code = code;
    this.status = status;
  }
}

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeGateRequestId(value: unknown): string {
  if (typeof value !== "string" || !REQUEST_ID_PATTERN.test(value)) {
    throw new HumanGateError("HUMAN_GATE_REQUEST_REUSED");
  }
  return value.toLowerCase();
}

function normalizeJobId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 8) {
    throw new HumanGateError("HUMAN_GATE_FORBIDDEN", 403);
  }
  return value.trim().slice(0, 128);
}

function normalizeReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.trim().slice(0, 1_000);
  return reason || null;
}

function mapEvent(row: GateEventRow): HumanGateEvent {
  return {
    id: Number(row.id),
    jobId: row.job_id,
    projectId: row.project_id,
    actorType: row.actor_type,
    decision: row.decision,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    requestId: row.request_id,
    reason: row.reason,
    artifactSha256: row.artifact_sha256,
    resultJobId: row.result_job_id,
    createdAt: String(row.created_at),
  };
}

function parseJobPayload(row: GateJobRow): BuildJob {
  let payload: BuildJob;
  try {
    payload = JSON.parse(row.payload) as BuildJob;
  } catch {
    throw new HumanGateError("HUMAN_GATE_ARTIFACT_NOT_SEALED");
  }
  if (
    row.pipeline_version !== HELIX_PIPELINE_VERSION ||
    payload.checkpoint?.pipelineVersion !== HELIX_PIPELINE_VERSION ||
    payload.checkpoint.requestFingerprint !== row.request_fingerprint ||
    payload.requestFingerprint !== row.request_fingerprint
  ) {
    throw new HumanGateError("HUMAN_GATE_ARTIFACT_NOT_SEALED");
  }
  if (!isValidHtmlArtifact(payload.html)) {
    throw new HumanGateError("HUMAN_GATE_ARTIFACT_NOT_SEALED");
  }
  return payload;
}

async function verifySealedArtifact(
  row: GateJobRow,
): Promise<ApprovedBuildArtifact> {
  const payload = parseJobPayload(row);
  const buildLevel = parseBuildLevel(payload.buildLevel);
  const digest = await sha256Hex(payload.html as string);
  if (!row.artifact_sha256 || row.artifact_sha256 !== digest) {
    throw new HumanGateError("HUMAN_GATE_ARTIFACT_NOT_SEALED");
  }
  const files = payload.files ?? { "index.html": payload.html as string };
  if (buildLevel === "production") {
    try {
      await assertSealedProductionBuildJobWorkspace(payload);
    } catch {
      throw new HumanGateError("HUMAN_GATE_ARTIFACT_NOT_SEALED");
    }
  } else if (files["index.html"] !== payload.html) {
    throw new HumanGateError("HUMAN_GATE_ARTIFACT_NOT_SEALED");
  } else if (payload.workspace) {
    const verification = await verifyWorkspace(files, payload.workspace);
    if (
      !verification.valid ||
      payload.workspace.buildLevel !== buildLevel ||
      payload.workspace.jobId !== row.id ||
      payload.workspace.projectId !== (row.project_id ?? undefined)
    ) {
      throw new HumanGateError("HUMAN_GATE_ARTIFACT_NOT_SEALED");
    }
  }
  return {
    jobId: row.id,
    projectId: row.project_id,
    title: payload.title,
    html: payload.html as string,
    artifactSha256: digest,
    buildLevel,
    files,
    workspace: payload.workspace,
  };
}

function assertReleaseSecurity(row: GateJobRow): void {
  if (!row.security_passed) {
    throw new HumanGateError("HUMAN_GATE_SECURITY_NOT_PASSED");
  }
}

async function existingEvent(
  sql: Sql,
  input: {
    jobId: string;
    actorType: HumanGateActor;
    requestId: string;
    actorUserId?: string;
    actorGuestHash?: string;
  },
): Promise<GateEventRow | null> {
  const rows = await sql.query<GateEventRow>(
    `select id, job_id, project_id, actor_type, decision, from_status,
            to_status, request_id, reason, artifact_sha256,
            result_job_id, created_at
     from build_job_gate_events
     where job_id = $1
       and actor_type = $2
       and request_id = $3
       and (
         ($2 = 'user' and actor_user_id = $4 and actor_guest_hash is null)
         or
         ($2 = 'guest' and actor_guest_hash = $5 and actor_user_id is null)
       )`,
    [
      input.jobId,
      input.actorType,
      input.requestId,
      input.actorUserId ?? null,
      input.actorGuestHash ?? null,
    ],
  );
  return rows[0] ?? null;
}

function assertIdempotentDecision(
  event: GateEventRow | null,
  decision: HumanGateDecision,
): HumanGateEvent | null {
  if (!event) return null;
  if (event.decision !== decision) {
    throw new HumanGateError("HUMAN_GATE_REQUEST_REUSED");
  }
  return mapEvent(event);
}

async function decideOwnedJob(input: {
  jobId: string;
  userId: string;
  decision: "approve" | "reject";
  requestId: string;
  reason: string | null;
}): Promise<HumanGateEvent> {
  const sql = await getSql();
  const replay = assertIdempotentDecision(
    await existingEvent(sql, {
      jobId: input.jobId,
      actorType: "user",
      requestId: input.requestId,
      actorUserId: input.userId,
    }),
    input.decision,
  );
  if (replay) return replay;

  const owned = await sql.query<GateJobRow>(
    `select job.id, job.project_id, job.user_id, job.payload,
            job.pipeline_version, job.request_fingerprint,
            job.queue_status, job.artifact_sha256,
            job.guest_access_token_hash, job.guest_access_expires_at,
            project.current_build_job_id,
            exists (
              select 1
              from build_job_quality_reports as report
              where report.job_id = job.id
                and report.report_kind = 'aegis_static_security'
                and report.artifact_sha256 = job.artifact_sha256
                and report.evidence_kind = 'measured'
                and report.passed
                and report.blocker_count = 0
            ) as security_passed
     from build_jobs as job
     join projects as project on project.id = job.project_id
     where job.id = $1
       and job.user_id = $2
       and project.user_id = $2`,
    [input.jobId, input.userId],
  );
  const row = owned[0];
  if (!row) throw new HumanGateError("HUMAN_GATE_FORBIDDEN", 403);
  if (
    row.current_build_job_id !== row.id ||
    row.queue_status !== "awaiting_human_approval"
  ) {
    throw new HumanGateError("HUMAN_GATE_CLOSED");
  }
  const artifact = await verifySealedArtifact(row);
  if (input.decision === "approve") assertReleaseSecurity(row);
  const target = input.decision === "approve" ? "approved" : "rejected";
  const inserted = await sql.query<GateEventRow>(
    `with transitioned as (
       update build_jobs as job
       set queue_status = $4,
           stage = $4,
           updated_at = now()
       from projects as project
       where job.id = $1
         and job.user_id = $2
         and project.id = job.project_id
         and project.user_id = $2
         and project.current_build_job_id = job.id
         and job.queue_status = 'awaiting_human_approval'
         and job.artifact_sha256 = $5
         and job.payload = $6
         and job.pipeline_version = '${HELIX_PIPELINE_VERSION}'
         and job.request_fingerprint = $9
       returning job.id, job.project_id
     )
     insert into build_job_gate_events (
       job_id, project_id, actor_type, actor_user_id, decision,
       from_status, to_status, request_id, reason, artifact_sha256
     )
     select id, project_id, 'user', $2, $3,
            'awaiting_human_approval', $4, $7, $8, $5
     from transitioned
     returning id, job_id, project_id, actor_type, decision, from_status,
               to_status, request_id, reason, artifact_sha256,
               result_job_id, created_at`,
    [
      input.jobId,
      input.userId,
      input.decision,
      target,
      artifact.artifactSha256,
      row.payload,
      input.requestId,
      input.reason,
      row.request_fingerprint,
    ],
  );
  if (inserted[0]) return mapEvent(inserted[0]);
  const concurrent = assertIdempotentDecision(
    await existingEvent(sql, {
      jobId: input.jobId,
      actorType: "user",
      requestId: input.requestId,
      actorUserId: input.userId,
    }),
    input.decision,
  );
  if (concurrent) return concurrent;
  throw new HumanGateError("HUMAN_GATE_CLOSED");
}

async function decideGuestJob(input: {
  jobId: string;
  guestAccessToken: string;
  decision: "approve" | "reject";
  requestId: string;
  reason: string | null;
}): Promise<HumanGateEvent> {
  const tokenHash = await hashGuestBuildToken(input.guestAccessToken);
  const sql = await getSql();
  const replay = assertIdempotentDecision(
    await existingEvent(sql, {
      jobId: input.jobId,
      actorType: "guest",
      requestId: input.requestId,
      actorGuestHash: tokenHash,
    }),
    input.decision,
  );
  if (replay) return replay;

  const rows = await sql.query<GateJobRow>(
    `select id, project_id, user_id, payload, pipeline_version,
            request_fingerprint, queue_status,
            artifact_sha256, guest_access_token_hash,
            guest_access_expires_at,
            exists (
              select 1
              from build_job_quality_reports as report
              where report.job_id = job.id
                and report.report_kind = 'aegis_static_security'
                and report.artifact_sha256 = job.artifact_sha256
                and report.evidence_kind = 'measured'
                and report.passed
                and report.blocker_count = 0
            ) as security_passed
     from build_jobs as job
     where job.id = $1
       and job.user_id is null
       and job.project_id is null
       and job.guest_access_token_hash = $2
       and job.guest_access_expires_at > now()`,
    [input.jobId, tokenHash],
  );
  const row = rows[0];
  if (!row) throw new HumanGateError("HUMAN_GATE_FORBIDDEN", 403);
  if (row.queue_status !== "awaiting_human_approval") {
    throw new HumanGateError("HUMAN_GATE_CLOSED");
  }
  const artifact = await verifySealedArtifact(row);
  if (input.decision === "approve") assertReleaseSecurity(row);
  const target = input.decision === "approve" ? "approved" : "rejected";
  const inserted = await sql.query<GateEventRow>(
    `with transitioned as (
       update build_jobs
       set queue_status = $3,
           stage = $3,
           updated_at = now()
       where id = $1
         and user_id is null
         and project_id is null
         and queue_status = 'awaiting_human_approval'
         and guest_access_token_hash = $2
         and guest_access_expires_at > now()
         and artifact_sha256 = $4
         and payload = $5
         and pipeline_version = '${HELIX_PIPELINE_VERSION}'
         and request_fingerprint = $9
       returning id
     )
     insert into build_job_gate_events (
       job_id, project_id, actor_type, actor_guest_hash, decision,
       from_status, to_status, request_id, reason, artifact_sha256
     )
     select id, null, 'guest', $2, $6,
            'awaiting_human_approval', $3, $7, $8, $4
     from transitioned
     returning id, job_id, project_id, actor_type, decision, from_status,
               to_status, request_id, reason, artifact_sha256,
               result_job_id, created_at`,
    [
      input.jobId,
      tokenHash,
      target,
      artifact.artifactSha256,
      row.payload,
      input.decision,
      input.requestId,
      input.reason,
      row.request_fingerprint,
    ],
  );
  if (inserted[0]) return mapEvent(inserted[0]);
  const concurrent = assertIdempotentDecision(
    await existingEvent(sql, {
      jobId: input.jobId,
      actorType: "guest",
      requestId: input.requestId,
      actorGuestHash: tokenHash,
    }),
    input.decision,
  );
  if (concurrent) return concurrent;
  throw new HumanGateError("HUMAN_GATE_CLOSED");
}

export async function getApprovedOwnedBuild(input: {
  jobId: string;
  projectId: string;
  userId: string;
}): Promise<ApprovedBuildArtifact> {
  const sql = await getSql();
  const rows = await sql.query<GateJobRow>(
    `select job.id, job.project_id, job.user_id, job.payload,
            job.pipeline_version, job.request_fingerprint,
            job.queue_status, job.artifact_sha256,
            job.guest_access_token_hash, job.guest_access_expires_at,
            project.current_build_job_id,
            exists (
              select 1
              from build_job_gate_events as event
              where event.job_id = job.id
                and event.decision = 'approve'
                and event.artifact_sha256 = job.artifact_sha256
            ) as approval_recorded,
            exists (
              select 1
              from build_job_quality_reports as report
              where report.job_id = job.id
                and report.report_kind = 'aegis_static_security'
                and report.artifact_sha256 = job.artifact_sha256
                and report.evidence_kind = 'measured'
                and report.passed
                and report.blocker_count = 0
            ) as security_passed
     from build_jobs as job
     join projects as project on project.id = job.project_id
     where job.id = $1
       and job.project_id = $2
       and job.user_id = $3
       and project.user_id = $3`,
    [input.jobId, input.projectId, input.userId],
  );
  if (!rows[0]) throw new HumanGateError("HUMAN_GATE_FORBIDDEN", 403);
  if (
    rows[0].current_build_job_id !== rows[0].id ||
    !["approved", "deployed"].includes(rows[0].queue_status) ||
    !rows[0].approval_recorded
  ) {
    throw new HumanGateError("HUMAN_GATE_CLOSED");
  }
  const artifact = await verifySealedArtifact(rows[0]);
  assertReleaseSecurity(rows[0]);
  return artifact;
}

export async function getApprovedGuestBuild(input: {
  jobId: string;
  guestAccessToken: string;
}): Promise<ApprovedBuildArtifact> {
  const tokenHash = await hashGuestBuildToken(input.guestAccessToken);
  const sql = await getSql();
  const rows = await sql.query<GateJobRow>(
    `select id, project_id, user_id, payload, pipeline_version,
            request_fingerprint, queue_status,
            artifact_sha256, guest_access_token_hash,
            guest_access_expires_at,
            exists (
              select 1
              from build_job_gate_events as event
              where event.job_id = job.id
                and event.decision = 'approve'
                and event.artifact_sha256 = job.artifact_sha256
            ) as approval_recorded,
            exists (
              select 1
              from build_job_quality_reports as report
              where report.job_id = job.id
                and report.report_kind = 'aegis_static_security'
                and report.artifact_sha256 = job.artifact_sha256
                and report.evidence_kind = 'measured'
                and report.passed
                and report.blocker_count = 0
            ) as security_passed
     from build_jobs as job
     where job.id = $1
       and user_id is null
       and project_id is null
       and guest_access_token_hash = $2
       and guest_access_expires_at > now()`,
    [input.jobId, tokenHash],
  );
  if (!rows[0]) throw new HumanGateError("HUMAN_GATE_FORBIDDEN", 403);
  if (
    !["approved", "deployed"].includes(rows[0].queue_status) ||
    !rows[0].approval_recorded
  ) {
    throw new HumanGateError("HUMAN_GATE_CLOSED");
  }
  const artifact = await verifySealedArtifact(rows[0]);
  assertReleaseSecurity(rows[0]);
  return artifact;
}

export async function enqueueGuestGateModification(input: {
  sourceJobId: string;
  sourceGuestAccessToken: string;
  requestId: string;
  reason: string;
  childJob: BuildJob;
  childRequestFingerprint: string;
}): Promise<{ jobId: string; wasCreated: boolean; expiresAt: number }> {
  const sql = await getSql();
  const sourceTokenHash = await hashGuestBuildToken(
    input.sourceGuestAccessToken,
  );
  const replay = await existingEvent(sql, {
    jobId: input.sourceJobId,
    actorType: "guest",
    requestId: input.requestId,
    actorGuestHash: sourceTokenHash,
  });
  if (replay) {
    if (replay.decision !== "modify" || !replay.result_job_id) {
      throw new HumanGateError("HUMAN_GATE_REQUEST_REUSED");
    }
    const child = await sql.query<{
      guest_access_expires_at: string | Date;
      request_fingerprint: string;
    }>(
      `select guest_access_expires_at, request_fingerprint
       from build_jobs
       where id = $1 and parent_job_id = $2`,
      [replay.result_job_id, input.sourceJobId],
    );
    if (child[0]?.request_fingerprint !== input.childRequestFingerprint) {
      throw new HumanGateError("HUMAN_GATE_REQUEST_REUSED");
    }
    const expiresAt = child[0]?.guest_access_expires_at
      ? new Date(child[0].guest_access_expires_at).getTime()
      : Number.NaN;
    if (!Number.isFinite(expiresAt)) {
      throw new HumanGateError("HUMAN_GATE_CLOSED");
    }
    return { jobId: replay.result_job_id, wasCreated: false, expiresAt };
  }

  const sourceRows = await sql.query<GateJobRow>(
    `select id, project_id, user_id, payload, pipeline_version,
            request_fingerprint, queue_status,
            artifact_sha256, guest_access_token_hash,
            guest_access_expires_at
     from build_jobs
     where id = $1
       and user_id is null
       and project_id is null
       and guest_access_token_hash = $2
       and guest_access_expires_at > now()`,
    [input.sourceJobId, sourceTokenHash],
  );
  const source = sourceRows[0];
  if (!source) throw new HumanGateError("HUMAN_GATE_FORBIDDEN", 403);
  if (source.queue_status !== "awaiting_human_approval") {
    throw new HumanGateError("HUMAN_GATE_CLOSED");
  }
  const artifact = await verifySealedArtifact(source);
  const childExpiry = input.childJob.guestAccessExpiresAt;
  if (
    !input.childJob.guestAccessTokenHash ||
    !childExpiry ||
    input.childJob.userId ||
    input.childJob.projectId
  ) {
    throw new HumanGateError("HUMAN_GATE_FORBIDDEN", 403);
  }

  const rows = await sql.query<{
    job_id: string;
    was_created: boolean;
    guest_access_expires_at: string | Date;
  }>(
    `with gate as materialized (
       select id, payload, artifact_sha256
       from build_jobs
       where id = $1
         and user_id is null
         and project_id is null
         and queue_status = 'awaiting_human_approval'
         and guest_access_token_hash = $2
         and guest_access_expires_at > now()
         and artifact_sha256 = $3
         and payload = $4
         and pipeline_version = '${HELIX_PIPELINE_VERSION}'
         and request_fingerprint = $13
       for update
     ), queued as materialized (
       select queued.job_id, queued.was_created,
              queued.guest_access_expires_at
       from gate
       cross join lateral enqueue_linked_build_job(
         $5, $1, null, null, $6, $7, $8, $9, $10, 2
       ) as queued
     ), decision as (
       insert into build_job_gate_events (
         job_id, project_id, actor_type, actor_guest_hash, decision,
         from_status, to_status, request_id, reason, artifact_sha256,
         result_job_id
       )
       select gate.id, null, 'guest', $2, 'modify',
              'awaiting_human_approval', 'rejected', $11, $12,
              gate.artifact_sha256, queued.job_id
       from gate
       cross join queued
       returning job_id, result_job_id
     ), closed as (
       update build_jobs as source
       set queue_status = 'rejected',
           stage = 'modified',
           updated_at = now()
       from decision
       where source.id = decision.job_id
         and source.queue_status = 'awaiting_human_approval'
       returning source.id
     )
     select queued.job_id, queued.was_created,
            queued.guest_access_expires_at
     from queued
     where exists (select 1 from closed)`,
    [
      input.sourceJobId,
      sourceTokenHash,
      artifact.artifactSha256,
      source.payload,
      input.childJob.id,
      input.childJob.guestAccessTokenHash,
      new Date(childExpiry).toISOString(),
      serializeBuildJob(input.childJob, input.childRequestFingerprint),
      `build:guest-modify:${input.sourceJobId}:${input.requestId}`,
      input.childRequestFingerprint,
      input.requestId,
      input.reason.slice(0, 1_000),
      source.request_fingerprint,
    ],
  );
  if (rows[0]) {
    return {
      jobId: rows[0].job_id,
      wasCreated: rows[0].was_created,
      expiresAt: new Date(rows[0].guest_access_expires_at).getTime(),
    };
  }
  const concurrent = await existingEvent(sql, {
    jobId: input.sourceJobId,
    actorType: "guest",
    requestId: input.requestId,
    actorGuestHash: sourceTokenHash,
  });
  if (concurrent?.decision === "modify" && concurrent.result_job_id) {
    const child = await sql.query<{
      guest_access_expires_at: string | Date;
      request_fingerprint: string;
    }>(
      `select guest_access_expires_at, request_fingerprint
       from build_jobs where id = $1`,
      [concurrent.result_job_id],
    );
    if (child[0]?.request_fingerprint !== input.childRequestFingerprint) {
      throw new HumanGateError("HUMAN_GATE_REQUEST_REUSED");
    }
    const expiresAt = child[0]?.guest_access_expires_at
      ? new Date(child[0].guest_access_expires_at).getTime()
      : Number.NaN;
    if (Number.isFinite(expiresAt)) {
      return {
        jobId: concurrent.result_job_id,
        wasCreated: false,
        expiresAt,
      };
    }
  }
  if (concurrent) throw new HumanGateError("HUMAN_GATE_REQUEST_REUSED");
  throw new HumanGateError("HUMAN_GATE_CLOSED");
}

export const approveBuildJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string; requestId: string; reason?: string }) => ({
    jobId: normalizeJobId(input.jobId),
    requestId: normalizeGateRequestId(input.requestId),
    reason: normalizeReason(input.reason),
  }))
  .handler(({ context, data }) =>
    decideOwnedJob({
      ...data,
      userId: context.userId,
      decision: "approve",
    }),
  );

export const rejectBuildJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string; requestId: string; reason?: string }) => ({
    jobId: normalizeJobId(input.jobId),
    requestId: normalizeGateRequestId(input.requestId),
    reason: normalizeReason(input.reason),
  }))
  .handler(({ context, data }) =>
    decideOwnedJob({
      ...data,
      userId: context.userId,
      decision: "reject",
    }),
  );

export const decideGuestBuildJob = createServerFn({ method: "POST" })
  .validator(
    (input: {
      jobId: string;
      guestAccessToken: string;
      decision: "approve" | "reject";
      requestId: string;
      reason?: string;
    }) => ({
      jobId: normalizeJobId(input.jobId),
      guestAccessToken:
        typeof input.guestAccessToken === "string"
          ? input.guestAccessToken.trim().slice(0, 128)
          : "",
      decision: input.decision === "reject" ? ("reject" as const) : ("approve" as const),
      requestId: normalizeGateRequestId(input.requestId),
      reason: normalizeReason(input.reason),
    }),
  )
  .handler(({ data }) => decideGuestJob(data));

export const listBuildJobGateEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((jobId: string) => normalizeJobId(jobId))
  .handler(async ({ context, data: jobId }) => {
    const sql = await getSql();
    const rows = await sql.query<GateEventRow>(
      `select event.id, event.job_id, event.project_id, event.actor_type,
              event.decision, event.from_status, event.to_status,
              event.request_id, event.reason, event.artifact_sha256,
              event.result_job_id, event.created_at
       from build_job_gate_events as event
       join build_jobs as job on job.id = event.job_id
       join projects as project on project.id = job.project_id
       where event.job_id = $1
         and job.user_id = $2
         and project.user_id = $2
       order by event.created_at asc, event.id asc`,
      [jobId, context.userId],
    );
    return rows.map(mapEvent);
  });
