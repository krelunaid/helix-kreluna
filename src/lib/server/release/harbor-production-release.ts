import type { Sql } from "@/lib/db";
import { sha256Utf8Hex } from "@/lib/server/release/integrity";
import {
  verifyHarborProductionPackage,
  type HarborProductionArtifact,
} from "@/lib/server/release/harbor-production-artifact";
import {
  HarborProductionIdentitySchema,
  HarborProductionRunnerError,
  isHarborProductionRecoveryConfigured,
  isHarborProductionRunnerConfigured,
  isVerifiedHarborProductionRunnerReport,
  type HarborProductionAction,
  type HarborProductionIdentity,
  type HarborProductionProviderAdapter,
  type HarborProductionReleaseState,
  type VerifiedHarborProductionRunnerReport,
} from "@/lib/server/release/harbor-production-runner";

export type HarborProductionReleaseRow = {
  id: string;
  project_id: string;
  build_job_id: string;
  deploy_id: string | null;
  user_id: string;
  request_id: string;
  idempotency_key: string;
  human_gate_artifact_sha256: string;
  workspace_artifact_sha256: string;
  package_sha256: string;
  provenance_sha256: string;
  package_bytes: number;
  package_file_count: number;
  package_filename: string;
  package_base64: string | null;
  credit_cost: number | null;
  credit_reserved_at: string | null;
  credit_reservation_expires_at: string | null;
  credit_refunded_at: string | null;
  accept_dispatch_intent_at: string | null;
  state: "prepared" | "retry_exhausted" | HarborProductionReleaseState;
  runner_release_id: string | null;
  provider: string | null;
  provider_deployment_id: string | null;
  public_url: string | null;
  rollback_ref: string | null;
  provider_report: unknown;
  runner_response_body: string | null;
  runner_signature: string | null;
  runner_response_sha256: string | null;
  runner_signature_sha256: string | null;
  accepted_at: string | null;
  provider_observed_at: string | null;
  deployed_at: string | null;
  last_reconciled_at: string | null;
  next_poll_at: string | null;
  action_claim_token: string | null;
  action_claimed_at: string | null;
  action_claim_expires_at: string | null;
  action_attempt_count: number;
  retry_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
  last_error_retryable: boolean | null;
  created_at: string;
  updated_at: string;
};

export type HarborProductionReleaseResult = {
  releaseId: string;
  deployId: string | null;
  state: HarborProductionReleaseRow["state"];
  sourceArtifactSha256: string;
  workspaceArtifactSha256: string;
  packageSha256: string;
  provider: string | null;
  providerDeploymentId: string | null;
  publicUrl: string | null;
  deployedAt: string | null;
  rollbackRef: string | null;
  retryCount: number;
  error: { code: string; message: string; retryable: boolean } | null;
};

export type HarborProductionReadiness = {
  sourcePackageReady: boolean;
  runnerConfigured: boolean;
  providerAccepted: boolean;
  deploymentActive: boolean;
  reason:
    | "HARBOR_PRODUCTION_RUNNER_UNCONFIGURED"
    | "HARBOR_PRODUCTION_SOURCE_PENDING"
    | "HARBOR_PRODUCTION_READY"
    | "HARBOR_PRODUCTION_ACCEPTED"
    | "HARBOR_PRODUCTION_ACTION_REQUIRED"
    | "HARBOR_PRODUCTION_ACTIVE";
};

export function harborProductionReadiness(
  row?: HarborProductionReleaseRow | null,
  env: Record<string, string | undefined> = process.env,
): HarborProductionReadiness {
  const runnerConfigured =
    isHarborProductionRunnerConfigured(env) && isHarborProductionRecoveryConfigured(env);
  if (!runnerConfigured) {
    return {
      sourcePackageReady: row !== undefined && row !== null,
      runnerConfigured: false,
      providerAccepted: false,
      deploymentActive: false,
      reason: "HARBOR_PRODUCTION_RUNNER_UNCONFIGURED",
    };
  }
  if (row?.state === "active") {
    return {
      sourcePackageReady: true,
      runnerConfigured: true,
      providerAccepted: true,
      deploymentActive: true,
      reason: "HARBOR_PRODUCTION_ACTIVE",
    };
  }
  if (row && ["failed", "action_required", "retry_exhausted"].includes(row.state)) {
    return {
      sourcePackageReady: true,
      runnerConfigured: true,
      providerAccepted: row.state !== "retry_exhausted" || row.runner_release_id !== null,
      deploymentActive: false,
      reason: "HARBOR_PRODUCTION_ACTION_REQUIRED",
    };
  }
  if (row && row.state !== "prepared") {
    return {
      sourcePackageReady: true,
      runnerConfigured: true,
      providerAccepted: true,
      deploymentActive: false,
      reason: "HARBOR_PRODUCTION_ACCEPTED",
    };
  }
  return {
    sourcePackageReady: row !== undefined && row !== null,
    runnerConfigured: true,
    providerAccepted: false,
    deploymentActive: false,
    reason: row ? "HARBOR_PRODUCTION_READY" : "HARBOR_PRODUCTION_SOURCE_PENDING",
  };
}

export function harborProductionReleaseResult(
  row: HarborProductionReleaseRow,
): HarborProductionReleaseResult {
  return {
    releaseId: row.id,
    deployId: row.deploy_id,
    state: row.state,
    sourceArtifactSha256: row.human_gate_artifact_sha256,
    workspaceArtifactSha256: row.workspace_artifact_sha256,
    packageSha256: row.package_sha256,
    provider: row.provider,
    providerDeploymentId: row.provider_deployment_id,
    publicUrl: row.public_url,
    deployedAt: row.deployed_at,
    rollbackRef: row.rollback_ref,
    retryCount: row.retry_count,
    error:
      row.last_error_code && row.last_error_message
        ? {
            code: row.last_error_code,
            message: row.last_error_message,
            retryable: row.last_error_retryable === true,
          }
        : null,
  };
}

export function harborProductionIdentity(
  row: Pick<
    HarborProductionReleaseRow,
    | "project_id"
    | "build_job_id"
    | "human_gate_artifact_sha256"
    | "workspace_artifact_sha256"
    | "package_sha256"
    | "provenance_sha256"
  >,
): HarborProductionIdentity {
  return HarborProductionIdentitySchema.parse({
    target: "web",
    projectId: row.project_id,
    buildJobId: row.build_job_id,
    humanGateArtifactSha256: row.human_gate_artifact_sha256,
    workspaceArtifactSha256: row.workspace_artifact_sha256,
    packageSha256: row.package_sha256,
    provenanceSha256: row.provenance_sha256,
  });
}

export async function harborProductionIdempotencyKey(input: {
  projectId: string;
  buildJobId: string;
  humanGateArtifactSha256: string;
  workspaceArtifactSha256: string;
  packageSha256: string;
}): Promise<string> {
  const digest = await sha256Utf8Hex(
    JSON.stringify({
      schemaVersion: "1.0.0",
      target: "web",
      ...input,
    }),
  );
  return `harbor-production:v1:${digest}`;
}

export async function prepareHarborProductionRelease(input: {
  sql: Sql;
  releaseId: string;
  requestId: string;
  projectId: string;
  buildJobId: string;
  userId: string;
  artifact: HarborProductionArtifact;
}): Promise<HarborProductionReleaseRow> {
  const { provenance, sourcePackage } = input.artifact;
  const idempotencyKey = await harborProductionIdempotencyKey({
    projectId: input.projectId,
    buildJobId: input.buildJobId,
    humanGateArtifactSha256: provenance.humanGateArtifactSha256,
    workspaceArtifactSha256: provenance.workspaceArtifactSha256,
    packageSha256: sourcePackage.sha256,
  });
  const rows = await input.sql.query<HarborProductionReleaseRow>(
    `with gate as materialized (
       select job.id
       from build_jobs as job
       join projects as owned on owned.id = job.project_id
       where job.id = $1 and job.project_id = $2 and job.user_id = $3
         and owned.user_id = $3 and owned.current_build_job_id = job.id
         and job.queue_status in ('approved', 'deployed')
         and job.artifact_sha256 = $4
         and job.payload::jsonb #>> '{workspace,artifactSha256}' = $5
         and job.payload::jsonb #>> '{buildLevel}' = 'production'
         and exists (
           select 1 from build_job_gate_events as event
           where event.job_id = job.id and event.decision = 'approve'
             and event.artifact_sha256 = job.artifact_sha256
         )
       for update of job
     ), prepared as (
       insert into harbor_production_releases (
         id, project_id, build_job_id, user_id, request_id, idempotency_key,
         human_gate_artifact_sha256, workspace_artifact_sha256,
         package_sha256, provenance_sha256, package_bytes,
         package_file_count, package_filename, package_base64, state
       )
       select $6, $2, gate.id, $3, $7, $8, $4, $5, $9, $10, $11, $12, $13, $14,
              'prepared'
       from gate
       on conflict (idempotency_key) do update
         set updated_at = harbor_production_releases.updated_at
       where harbor_production_releases.project_id = excluded.project_id
         and harbor_production_releases.build_job_id = excluded.build_job_id
         and harbor_production_releases.user_id = excluded.user_id
         and harbor_production_releases.human_gate_artifact_sha256 = excluded.human_gate_artifact_sha256
         and harbor_production_releases.workspace_artifact_sha256 = excluded.workspace_artifact_sha256
         and harbor_production_releases.package_sha256 = excluded.package_sha256
         and harbor_production_releases.provenance_sha256 = excluded.provenance_sha256
       returning *
     ), event as (
       insert into harbor_production_release_events (
         release_id, event_key, from_state, to_state, source, evidence
       )
       select prepared.id, 'prepared:' || prepared.package_sha256,
              null, 'prepared', 'helix',
              jsonb_build_object(
                'humanGateArtifactSha256', prepared.human_gate_artifact_sha256,
                'workspaceArtifactSha256', prepared.workspace_artifact_sha256,
                'packageSha256', prepared.package_sha256,
                'provenanceSha256', prepared.provenance_sha256
              )
       from prepared
       on conflict (release_id, event_key) do nothing
     )
     select * from prepared`,
    [
      input.buildJobId,
      input.projectId,
      input.userId,
      provenance.humanGateArtifactSha256,
      provenance.workspaceArtifactSha256,
      input.releaseId,
      input.requestId,
      idempotencyKey,
      sourcePackage.sha256,
      sourcePackage.provenanceSha256,
      sourcePackage.byteLength,
      sourcePackage.fileCount,
      sourcePackage.filename,
      sourcePackage.base64,
    ],
  );
  if (!rows[0]) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_PREPARE_CONFLICT");
  }
  return rows[0];
}

export async function loadHarborProductionRelease(input: {
  sql: Sql;
  releaseId: string;
  projectId: string;
  userId: string;
}): Promise<HarborProductionReleaseRow | null> {
  const rows = await input.sql.query<HarborProductionReleaseRow>(
    `select * from harbor_production_releases
     where id = $1 and project_id = $2 and user_id = $3`,
    [input.releaseId, input.projectId, input.userId],
  );
  return rows[0] ?? null;
}

type HarborProductionActionClaim = {
  row: HarborProductionReleaseRow;
  action: HarborProductionAction;
  token: string;
};

type HarborProductionResumeClaim =
  | { replayed: false; row: HarborProductionReleaseRow; token: string }
  | { replayed: true; row: HarborProductionReleaseRow; token: null };

function resumeEventKey(requestId: string): string {
  return `resume-request:${requestId}`;
}

function normalizeHarborProductionResumeRequestId(requestId: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(requestId)
  ) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RESUME_REQUEST_INVALID");
  }
  return requestId.toLowerCase();
}

async function claimHarborProductionResume(input: {
  sql: Sql;
  row: HarborProductionReleaseRow;
  requestId: string;
}): Promise<HarborProductionResumeClaim> {
  const token = crypto.randomUUID();
  const eventKey = resumeEventKey(input.requestId);
  if (!["failed", "action_required"].includes(input.row.state)) {
    const prior = await input.sql.query<{ exists: boolean }>(
      `select exists (
         select 1 from harbor_production_release_events
         where release_id = $1 and event_key = 'resume-complete:' || $2::text
       ) as exists`,
      [input.row.id, input.requestId],
    );
    if (prior[0]?.exists) return { replayed: true, row: input.row, token: null };
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RESUME_STATE_INVALID");
  }
  // Persist the operator intent before taking the lease. If the process dies
  // between these statements, the same request ID can safely reacquire after
  // the lease instead of being mistaken for a completed response replay.
  await input.sql.query(
    `insert into harbor_production_release_events (
       release_id, event_key, from_state, to_state, source, action, evidence
     )
     select release.id, $5, release.state, release.state,
            'helix', 'reconcile', jsonb_build_object('requestId', $6::text)
     from harbor_production_releases as release
     where release.id = $1 and release.project_id = $2 and release.user_id = $3
       and release.state = $4 and release.state in ('failed', 'action_required')
     on conflict (release_id, event_key) do nothing`,
    [
      input.row.id,
      input.row.project_id,
      input.row.user_id,
      input.row.state,
      eventKey,
      input.requestId,
    ],
  );
  const rows = await input.sql.query<HarborProductionReleaseRow>(
    `update harbor_production_releases as release
     set action_claim_token = $6, action_claimed_at = now(),
         action_claim_expires_at = now() + interval '90 seconds',
         action_attempt_count = release.action_attempt_count + 1,
         updated_at = now()
     where release.id = $1 and release.project_id = $2 and release.user_id = $3
       and release.state = $4 and release.state in ('failed', 'action_required')
       and release.action_attempt_count < 64
       and (release.action_claim_token is null or release.action_claim_expires_at <= now())
       and exists (
         select 1 from harbor_production_release_events as requested
         where requested.release_id = release.id and requested.event_key = $5
       )
       and not exists (
         select 1 from harbor_production_release_events as completed
         where completed.release_id = release.id
           and completed.event_key = 'resume-complete:' || $7::text
       )
     returning release.*`,
    [
      input.row.id,
      input.row.project_id,
      input.row.user_id,
      input.row.state,
      eventKey,
      token,
      input.requestId,
    ],
  );
  if (rows[0]) return { replayed: false, row: rows[0], token };
  const current = await loadHarborProductionRelease({
    sql: input.sql,
    releaseId: input.row.id,
    projectId: input.row.project_id,
    userId: input.row.user_id,
  });
  if (!current) throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RELEASE_NOT_FOUND");
  const prior = await input.sql.query<{ exists: boolean }>(
    `select exists (
       select 1 from harbor_production_release_events
       where release_id = $1 and event_key = 'resume-complete:' || $2::text
     ) as exists`,
    [current.id, input.requestId],
  );
  if (prior[0]?.exists) return { replayed: true, row: current, token: null };
  assertNoActiveHarborProductionClaim(current);
  if (current.action_attempt_count >= 64) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RETRY_LIMIT_REACHED");
  }
  throw new HarborProductionRunnerError("HARBOR_PRODUCTION_ACTION_IN_PROGRESS", true, 1);
}

function harborProductionAttemptLimitReached(row: HarborProductionReleaseRow): boolean {
  return row.retry_count >= 20 || row.action_attempt_count >= 64;
}

async function persistHarborProductionRetryExhausted(input: {
  sql: Sql;
  row: HarborProductionReleaseRow;
}): Promise<HarborProductionReleaseRow> {
  const rows = await input.sql.query<HarborProductionReleaseRow>(
    `with current as materialized (
       select * from harbor_production_releases
       where id = $1 and project_id = $2 and user_id = $3
         and state = $4
         and (retry_count >= 20 or action_attempt_count >= 64)
         and state not in ('active', 'failed', 'action_required', 'retry_exhausted')
         and (action_claim_token is null or action_claim_expires_at <= now())
       for update
     ), refund as materialized (
       select current.id, mutation.was_applied
       from current
       cross join lateral apply_credit_entry(
         current.user_id, current.credit_cost, 'refund', current.project_id,
         'Harbor Production reservation refund', $5
       ) as mutation
       where current.state = 'prepared' and current.credit_cost is not null
         and current.credit_reserved_at is not null
         and current.credit_refunded_at is null
     ), project_refund as (
       update projects
       set credits_spent = greatest(
             0,
             credits_spent - case when refund.was_applied then current.credit_cost else 0 end
           ),
           updated_at = now()
       from refund
       join current on current.id = refund.id
       where projects.id = current.project_id and projects.user_id = current.user_id
       returning projects.id
     ), updated as (
       update harbor_production_releases as release
       set state = 'retry_exhausted', next_poll_at = null, package_base64 = null,
           action_claim_token = null, action_claimed_at = null,
           action_claim_expires_at = null,
           credit_refunded_at = case when refund.id is not null
             then coalesce(release.credit_refunded_at, now())
             else release.credit_refunded_at end,
           last_error_code = 'HARBOR_PRODUCTION_RETRY_LIMIT_REACHED',
           last_error_message = 'HARBOR_PRODUCTION_RETRY_LIMIT_REACHED',
           last_error_retryable = false, updated_at = now()
       from current
       left join refund on refund.id = current.id
       where release.id = current.id
       returning release.*
     ), deploy_updated as (
       update deploys as deploy
       set status = 'retry_exhausted',
           error_code = 'HARBOR_PRODUCTION_RETRY_LIMIT_REACHED',
           error_message = 'HARBOR_PRODUCTION_RETRY_LIMIT_REACHED',
           updated_at = now()
       from updated
       where deploy.id = updated.deploy_id
       returning deploy.id
     ), event as (
       insert into harbor_production_release_events (
         release_id, event_key, from_state, to_state, source,
         error_code, error_message, retryable
       )
       select updated.id, 'retry-exhausted:' || updated.retry_count,
              $4, 'retry_exhausted', 'helix',
              'HARBOR_PRODUCTION_RETRY_LIMIT_REACHED',
              'HARBOR_PRODUCTION_RETRY_LIMIT_REACHED', false
       from updated
       on conflict (release_id, event_key) do nothing
     )
     select * from updated`,
    [
      input.row.id,
      input.row.project_id,
      input.row.user_id,
      input.row.state,
      `${input.row.idempotency_key}:credit-refund`,
    ],
  );
  if (rows[0]) return rows[0];
  return (
    (await loadHarborProductionRelease({
      sql: input.sql,
      releaseId: input.row.id,
      projectId: input.row.project_id,
      userId: input.row.user_id,
    })) ?? input.row
  );
}

function harborProductionActiveClaimRetryAfter(row: HarborProductionReleaseRow): number | null {
  if (!row.action_claim_token || !row.action_claim_expires_at) return null;
  const remainingMs = Date.parse(String(row.action_claim_expires_at)) - Date.now();
  return Number.isFinite(remainingMs) && remainingMs > 0
    ? Math.max(1, Math.ceil(remainingMs / 1_000))
    : null;
}

function assertNoActiveHarborProductionClaim(row: HarborProductionReleaseRow): void {
  const retryAfterSeconds = harborProductionActiveClaimRetryAfter(row);
  if (retryAfterSeconds !== null) {
    throw new HarborProductionRunnerError(
      "HARBOR_PRODUCTION_ACTION_IN_PROGRESS",
      true,
      retryAfterSeconds,
    );
  }
}

async function terminalizeHarborProductionAttemptLimit(input: {
  sql: Sql;
  row: HarborProductionReleaseRow;
}): Promise<HarborProductionReleaseRow> {
  assertNoActiveHarborProductionClaim(input.row);
  const row = await persistHarborProductionRetryExhausted(input);
  assertNoActiveHarborProductionClaim(row);
  return row;
}

async function claimHarborProductionAction(input: {
  sql: Sql;
  row: HarborProductionReleaseRow;
  action: HarborProductionAction;
  creditCost?: number;
}): Promise<HarborProductionActionClaim> {
  if (harborProductionAttemptLimitReached(input.row)) {
    const exhausted = await terminalizeHarborProductionAttemptLimit({
      sql: input.sql,
      row: input.row,
    });
    throw new HarborProductionRunnerError(
      exhausted.last_error_code ?? "HARBOR_PRODUCTION_RETRY_LIMIT_REACHED",
    );
  }
  const token = crypto.randomUUID();
  const claimParameters = [
    input.row.id,
    input.row.project_id,
    input.row.user_id,
    input.row.state,
    token,
  ];
  const rows =
    input.creditCost === undefined
      ? await input.sql.query<HarborProductionReleaseRow>(
          `update harbor_production_releases as release
           set action_claim_token = $5, action_claimed_at = now(),
               action_claim_expires_at = now() + interval '90 seconds',
               action_attempt_count = action_attempt_count + 1,
               updated_at = now()
           from projects as owned, build_jobs as job
           where release.id = $1 and release.project_id = $2
             and release.user_id = $3 and release.state = $4
             and owned.id = release.project_id and owned.user_id = release.user_id
             and job.id = release.build_job_id and job.project_id = release.project_id
             and job.user_id = release.user_id
             and job.queue_status in ('approved', 'deployed')
             and job.artifact_sha256 = release.human_gate_artifact_sha256
             and job.payload::jsonb #>> '{workspace,artifactSha256}' = release.workspace_artifact_sha256
             and job.payload::jsonb #>> '{buildLevel}' = 'production'
             and exists (
               select 1 from build_job_gate_events as gate
               where gate.job_id = job.id and gate.decision = 'approve'
                 and gate.artifact_sha256 = job.artifact_sha256
             )
             and release.state not in ('active', 'failed', 'action_required', 'retry_exhausted')
             and release.retry_count < 20 and release.action_attempt_count < 64
             and (release.next_poll_at is null or release.next_poll_at <= now())
             and (release.action_claim_token is null or release.action_claim_expires_at <= now())
           returning release.*`,
          claimParameters,
        )
      : await input.sql.query<HarborProductionReleaseRow>(
          `with current as materialized (
             select release.*
             from harbor_production_releases as release
             join projects as owned on owned.id = release.project_id
               and owned.user_id = release.user_id
               and owned.current_build_job_id = release.build_job_id
             join build_jobs as job on job.id = release.build_job_id
               and job.project_id = release.project_id and job.user_id = release.user_id
               and job.queue_status in ('approved', 'deployed')
               and job.artifact_sha256 = release.human_gate_artifact_sha256
               and job.payload::jsonb #>> '{workspace,artifactSha256}' = release.workspace_artifact_sha256
               and job.payload::jsonb #>> '{buildLevel}' = 'production'
             where release.id = $1 and release.project_id = $2
               and release.user_id = $3 and release.state = $4
               and release.state = 'prepared' and release.retry_count < 20
               and release.action_attempt_count < 64
               and (
                 release.credit_reservation_expires_at is null
                 or release.credit_reservation_expires_at > now()
               )
               and (release.next_poll_at is null or release.next_poll_at <= now())
               and (release.action_claim_token is null or release.action_claim_expires_at <= now())
               and exists (
                 select 1 from build_job_gate_events as gate
                 where gate.job_id = job.id and gate.decision = 'approve'
                   and gate.artifact_sha256 = job.artifact_sha256
               )
             for update of release, owned, job
           ), credit as materialized (
             select current.id, mutation.was_applied
             from current
             cross join lateral apply_credit_entry(
               $3, -($6::integer), 'host', $2, 'Production web provider reservation',
               current.idempotency_key || ':credit'
             ) as mutation
           ), project_cost as (
             update projects
             set credits_spent = credits_spent
                   + case when credit.was_applied then $6::integer else 0 end,
                 updated_at = now()
             from credit
             where projects.id = $2 and projects.user_id = $3
             returning projects.id
           )
           update harbor_production_releases as release
           set action_claim_token = $5, action_claimed_at = now(),
               action_claim_expires_at = now() + interval '90 seconds',
               credit_cost = coalesce(release.credit_cost, $6::integer),
               credit_reserved_at = coalesce(release.credit_reserved_at, now()),
               credit_reservation_expires_at = coalesce(
                 release.credit_reservation_expires_at,
                 now() + interval '15 minutes'
               ),
               accept_dispatch_intent_at = coalesce(release.accept_dispatch_intent_at, now()),
               action_attempt_count = release.action_attempt_count + 1,
               updated_at = now()
           from current, project_cost
           where release.id = current.id
             and (release.credit_cost is null or release.credit_cost = $6::integer)
           returning release.*`,
          [...claimParameters, input.creditCost],
        );
  if (rows[0]) return { row: rows[0], action: input.action, token };
  const current = await loadHarborProductionRelease({
    sql: input.sql,
    releaseId: input.row.id,
    projectId: input.row.project_id,
    userId: input.row.user_id,
  });
  if (!current) throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RELEASE_NOT_FOUND");
  assertNoActiveHarborProductionClaim(current);
  if (harborProductionAttemptLimitReached(current)) {
    await terminalizeHarborProductionAttemptLimit({ sql: input.sql, row: current });
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RETRY_LIMIT_REACHED");
  }
  const now = Date.now();
  const reservationExpiresAt = current.credit_reservation_expires_at
    ? Date.parse(String(current.credit_reservation_expires_at))
    : Number.NaN;
  if (
    current.state === "prepared" &&
    Number.isFinite(reservationExpiresAt) &&
    reservationExpiresAt <= now
  ) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RESERVATION_EXPIRED");
  }
  const nextPollAt = current.next_poll_at ? Date.parse(String(current.next_poll_at)) : Number.NaN;
  if (Number.isFinite(nextPollAt) && nextPollAt > now) {
    throw new HarborProductionRunnerError(
      "HARBOR_PRODUCTION_RETRY_NOT_DUE",
      true,
      Math.max(1, Math.ceil((nextPollAt - now) / 1_000)),
    );
  }
  throw new HarborProductionRunnerError("HARBOR_PRODUCTION_ACTION_IN_PROGRESS", true, 1);
}

function reportEventKey(verified: VerifiedHarborProductionRunnerReport): string {
  return `report:${verified.report.action}:${verified.responseBodySha256}`;
}

function nextPollAt(verified: VerifiedHarborProductionRunnerReport): string | null {
  const seconds = verified.report.retryAfterSeconds;
  return seconds === null
    ? null
    : new Date(Date.parse(verified.report.observedAt) + seconds * 1_000).toISOString();
}

function harborProductionLog(verified: VerifiedHarborProductionRunnerReport): string {
  const report = verified.report;
  const evidence = report.providerEvidence;
  const active = report.state === "active";
  const failed = report.state === "failed" || report.state === "action_required";
  return JSON.stringify([
    {
      id: "gate",
      label: "Human Gate",
      status: "done",
      detail: "Approved Production preview and sealed workspace hashes verified",
    },
    {
      id: "package",
      label: "Harbor · Production workspace",
      status: "done",
      detail: "Exact multi-file package and provenance hashes verified",
    },
    {
      id: "accept",
      label: "Harbor · authenticated runner",
      status: "done",
      detail: `Signed runner release ${report.runnerReleaseId}`,
    },
    {
      id: "activate",
      label: "Harbor · provider activation",
      status: active
        ? "done"
        : failed
          ? "error"
          : report.state === "accepted"
            ? "queued"
            : "running",
      detail: evidence.providerDeploymentId
        ? `${evidence.provider} deployment ${evidence.providerDeploymentId}`
        : `${evidence.provider} has not reported a deployment ID`,
    },
    {
      id: "url",
      label: "Harbor · public URL",
      status: active ? "done" : failed ? "blocked" : "queued",
      detail: active && evidence.publicUrl ? evidence.publicUrl : "No verified public URL yet",
    },
    {
      id: "rollback",
      label: "Harbor · rollback",
      status: evidence.rollback ? "done" : "skipped",
      detail: evidence.rollback
        ? `Ready provider rollback ${evidence.rollback.reference}`
        : "No signed rollback target was reported",
    },
  ]);
}

function assertVerifiedReportMatches(
  row: HarborProductionReleaseRow,
  verified: VerifiedHarborProductionRunnerReport,
): void {
  if (!isVerifiedHarborProductionRunnerReport(verified)) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_UNSIGNED_REPORT");
  }
  const report = verified.report;
  if (
    report.releaseId !== row.id ||
    report.idempotencyKey !== row.idempotency_key ||
    JSON.stringify(report.identity) !== JSON.stringify(harborProductionIdentity(row)) ||
    (row.runner_release_id !== null && row.runner_release_id !== report.runnerReleaseId) ||
    (row.provider !== null && row.provider !== report.providerEvidence.provider)
  ) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_RELEASE_MISMATCH");
  }
}

export async function persistAcceptedHarborProductionReport(input: {
  sql: Sql;
  row: HarborProductionReleaseRow;
  verified: VerifiedHarborProductionRunnerReport;
  deployId: string;
  creditCost: number;
  claimToken: string;
}): Promise<HarborProductionReleaseRow> {
  assertVerifiedReportMatches(input.row, input.verified);
  const report = input.verified.report;
  if (input.row.state !== "prepared" || report.action !== "accept" || report.state !== "accepted") {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_ACCEPT_STATE_INVALID");
  }
  const evidence = report.providerEvidence;
  const reportJson = JSON.stringify(report);
  const log = harborProductionLog(input.verified);
  const eventKey = reportEventKey(input.verified);
  const artifactRef = `runner:${report.runnerReleaseId}:sha256:${input.row.package_sha256}`;
  const creditKey = `${input.row.idempotency_key}:credit`;
  const rows = await input.sql.query<HarborProductionReleaseRow>(
    `with current as materialized (
       select release.*
       from harbor_production_releases as release
       join build_jobs as job on job.id = release.build_job_id
       join projects as owned on owned.id = release.project_id
       where release.id = $1 and release.project_id = $2 and release.user_id = $3
         and release.state = 'prepared' and release.build_job_id = $4
         and release.human_gate_artifact_sha256 = $5
         and release.workspace_artifact_sha256 = $6
         and release.package_sha256 = $7 and release.provenance_sha256 = $8
         and owned.user_id = $3 and job.project_id = release.project_id
         and job.user_id = release.user_id
         and job.queue_status in ('approved', 'deployed')
         and job.artifact_sha256 = $5
         and job.payload::jsonb #>> '{workspace,artifactSha256}' = $6
         and job.payload::jsonb #>> '{buildLevel}' = 'production'
         and exists (
           select 1 from build_job_gate_events as gate
           where gate.job_id = job.id and gate.decision = 'approve'
             and gate.artifact_sha256 = job.artifact_sha256
         )
         and release.action_claim_token = $27
       for update of release, job
     ), credit as materialized (
       select current.id, mutation.was_applied
       from current
       cross join lateral apply_credit_entry(
         $3, $9, 'host', $2, 'Production web provider dispatch', $10
       ) as mutation
     ), project_cost as (
       update projects
       set credits_spent = credits_spent + case when credit.was_applied then $11 else 0 end,
           updated_at = now()
       from credit
       where projects.id = $2 and projects.user_id = $3
       returning projects.id
     ), deployed as (
       insert into deploys (
         id, project_id, user_id, target, status, url, log, build_job_id,
         provider, provider_deploy_id, artifact_ref, artifact_sha256,
         published_sha256, output_integrity_version, release_key
       )
       select $12, project_cost.id, $3, 'web', 'accepted', null, $13,
              current.build_job_id, $14, $15, $16,
              current.human_gate_artifact_sha256, null, null,
              current.idempotency_key
       from current, project_cost
       on conflict (release_key) where release_key is not null do update
         set updated_at = deploys.updated_at
       where deploys.artifact_sha256 = excluded.artifact_sha256
         and deploys.published_sha256 is null
         and deploys.output_integrity_version is null
         and deploys.provider = excluded.provider
         and deploys.provider_deploy_id is not distinct from excluded.provider_deploy_id
       returning id
     ), updated as (
       update harbor_production_releases as release
       set deploy_id = deployed.id, state = 'accepted',
           runner_release_id = $17, provider = $14,
           provider_deployment_id = $15, provider_report = $18::jsonb,
           runner_response_body = $25, runner_signature = $26,
           runner_response_sha256 = $19, runner_signature_sha256 = $20,
           accepted_at = $21::timestamptz,
           provider_observed_at = $22::timestamptz,
           next_poll_at = $23::timestamptz,
           package_base64 = null,
           retry_count = 0, last_error_code = null,
           last_error_message = null, last_error_retryable = null,
           action_claim_token = null, action_claimed_at = null,
           action_claim_expires_at = null,
           updated_at = now()
       from deployed
       where release.id = $1
       returning release.*
     ), event as (
       insert into harbor_production_release_events (
         release_id, event_key, from_state, to_state, source, action,
         provider_observed_at, response_sha256, signature_sha256, evidence,
         response_body, signature
       )
       select updated.id, $24, 'prepared', 'accepted', 'runner', 'accept',
              $22::timestamptz, $19, $20, $18::jsonb, $25, $26
       from updated
       on conflict (release_id, event_key) do nothing
     )
     select * from updated`,
    [
      input.row.id,
      input.row.project_id,
      input.row.user_id,
      input.row.build_job_id,
      input.row.human_gate_artifact_sha256,
      input.row.workspace_artifact_sha256,
      input.row.package_sha256,
      input.row.provenance_sha256,
      -input.creditCost,
      creditKey,
      input.creditCost,
      input.deployId,
      log,
      evidence.provider,
      evidence.providerDeploymentId,
      artifactRef,
      report.runnerReleaseId,
      reportJson,
      input.verified.responseBodySha256,
      input.verified.signatureSha256,
      report.acceptedAt,
      report.observedAt,
      nextPollAt(input.verified),
      eventKey,
      input.verified.responseBody,
      input.verified.signature,
      input.claimToken,
    ],
  );
  if (!rows[0]) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_ACCEPT_COMMIT_FAILED");
  }
  return rows[0];
}

function stateRank(state: HarborProductionReleaseRow["state"]): number {
  return {
    prepared: 0,
    accepted: 1,
    queued: 2,
    deploying: 3,
    active: 4,
    failed: 90,
    action_required: 91,
    retry_exhausted: 92,
  }[state];
}

export async function persistHarborProductionProgressReport(input: {
  sql: Sql;
  row: HarborProductionReleaseRow;
  verified: VerifiedHarborProductionRunnerReport;
  claimToken: string;
  resumeRequestId?: string;
}): Promise<HarborProductionReleaseRow> {
  assertVerifiedReportMatches(input.row, input.verified);
  const report = input.verified.report;
  const resuming =
    input.resumeRequestId !== undefined &&
    ["failed", "action_required"].includes(input.row.state) &&
    report.action === "reconcile";
  if (
    report.action === "accept" ||
    input.row.state === "prepared" ||
    input.row.state === "active" ||
    input.row.state === "retry_exhausted" ||
    (["failed", "action_required"].includes(input.row.state) && !resuming) ||
    (!resuming && stateRank(report.state) < stateRank(input.row.state))
  ) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_STATE_REGRESSION");
  }
  const evidence = report.providerEvidence;
  const reportJson = JSON.stringify(report);
  const log = harborProductionLog(input.verified);
  const eventKey = reportEventKey(input.verified);
  const errorCode = report.error?.code ?? null;
  const errorMessage = report.error?.message ?? null;
  const errorRetryable = report.error?.retryable ?? null;
  const rollbackRef = evidence.rollback?.reference ?? null;
  const rollbackKind = evidence.rollback?.kind ?? null;
  const rollbackProviderDeploymentId =
    evidence.rollback?.kind === "prior_deployment" ? evidence.rollback.providerDeploymentId : null;
  const rollbackPublicUrl =
    evidence.rollback?.kind === "prior_deployment" ? evidence.rollback.publicUrl : null;
  const rows = await input.sql.query<HarborProductionReleaseRow>(
    `with current as materialized (
       select release.*
       from harbor_production_releases as release
       join deploys as bound_deploy
         on bound_deploy.id = release.deploy_id
        and bound_deploy.release_key = release.idempotency_key
        and bound_deploy.artifact_sha256 = release.human_gate_artifact_sha256
        and bound_deploy.published_sha256 is null
        and bound_deploy.output_integrity_version is null
       join projects as owned on owned.id = release.project_id
         and owned.user_id = release.user_id
       where release.id = $1 and release.project_id = $2 and release.user_id = $3
         and release.build_job_id = $4 and release.idempotency_key = $5
         and release.human_gate_artifact_sha256 = $6
         and release.workspace_artifact_sha256 = $7
         and release.package_sha256 = $8 and release.provenance_sha256 = $9
         and release.runner_release_id = $10 and release.provider = $11
         and (
           release.state not in ('active', 'failed', 'action_required', 'retry_exhausted')
           or (
             $34::text is not null and release.state in ('failed', 'action_required')
             and exists (
               select 1 from harbor_production_release_events as resume
               where resume.release_id = release.id
                 and resume.event_key = 'resume-request:' || $34::text
             )
           )
         )
         and release.action_claim_token = $30
         and (
           coalesce($31, '') <> 'prior_deployment'
           or exists (
             select 1 from harbor_production_releases as rollback
             where rollback.project_id = release.project_id
               and rollback.user_id = release.user_id
               and rollback.provider = $11 and rollback.state = 'active'
               and rollback.provider_deployment_id = $32
               and rollback.public_url = $33
               and rollback.id <> release.id
           )
         )
         and (
           $34::text is not null
           or case $12
             when 'accepted' then 1 when 'queued' then 2 when 'deploying' then 3
             when 'active' then 4 when 'failed' then 90
             when 'action_required' then 91 else 0
           end >= case release.state
             when 'accepted' then 1 when 'queued' then 2 when 'deploying' then 3
             when 'active' then 4 when 'failed' then 90
             when 'action_required' then 91 else 999
           end
         )
       for update of release, bound_deploy, owned
     ), updated as (
       update harbor_production_releases as release
       set state = $12, provider_deployment_id = $13,
           public_url = $14, rollback_ref = $15,
           provider_report = $16::jsonb,
           runner_response_body = $28, runner_signature = $29,
           runner_response_sha256 = $17, runner_signature_sha256 = $18,
           provider_observed_at = $19::timestamptz,
           deployed_at = $20::timestamptz,
           last_reconciled_at = case when $21 = 'reconcile' then $19::timestamptz
             else release.last_reconciled_at end,
           next_poll_at = $22::timestamptz, retry_count = 0,
           last_error_code = $23, last_error_message = $24,
           last_error_retryable = $25,
           action_claim_token = null, action_claimed_at = null,
           action_claim_expires_at = null, updated_at = now()
       from current
       where release.id = current.id
       returning release.*, current.state as previous_state
     ), deploy_updated as (
       update deploys as deploy
       set status = case when updated.state = 'active' then 'deployed' else updated.state end,
           provider = $11,
           provider_deploy_id = updated.provider_deployment_id,
           url = updated.public_url, rollback_ref = updated.rollback_ref,
           log = $26, completed_at = case when updated.state = 'active'
             then updated.deployed_at else deploy.completed_at end,
           error_code = updated.last_error_code,
           error_message = updated.last_error_message,
           updated_at = now()
       from updated
       where deploy.id = updated.deploy_id
         and deploy.release_key = updated.idempotency_key
         and deploy.artifact_sha256 = updated.human_gate_artifact_sha256
         and deploy.published_sha256 is null
         and deploy.output_integrity_version is null
       returning deploy.id
     ), hosted as (
       update projects
       set hosted = true, hosted_until = now() + interval '30 days', updated_at = now()
       from updated, deploy_updated
       where updated.state = 'active' and projects.id = updated.project_id
         and projects.user_id = updated.user_id
       returning projects.id
     ), completed as (
       select completion.release_id
       from updated, deploy_updated
       cross join lateral complete_build_job_release(
         updated.build_job_id, updated.human_gate_artifact_sha256, updated.deploy_id
       ) as completion
       where updated.state = 'active'
       union all
       select updated.deploy_id
       from updated, deploy_updated
       where updated.state <> 'active'
     ), event as (
       insert into harbor_production_release_events (
         release_id, event_key, from_state, to_state, source, action,
         provider_observed_at, response_sha256, signature_sha256, evidence,
         error_code, error_message, retryable, response_body, signature
       )
       select updated.id, $27, updated.previous_state, updated.state, 'runner', $21,
              $19::timestamptz, $17, $18, $16::jsonb, $23, $24, $25, $28, $29
       from updated
       on conflict (release_id, event_key) do nothing
     ), resume_completed as (
       insert into harbor_production_release_events (
         release_id, event_key, from_state, to_state, source, action, evidence
       )
       select updated.id, 'resume-complete:' || $34::text,
              updated.previous_state, updated.state, 'helix', 'reconcile',
              jsonb_build_object(
                'requestId', $34::text,
                'responseSha256', $17::text,
                'signedState', updated.state
              )
       from updated, deploy_updated, completed
       where $34::text is not null
       on conflict (release_id, event_key) do nothing
     )
     select updated.id, updated.project_id, updated.build_job_id,
            updated.deploy_id, updated.user_id, updated.request_id,
            updated.idempotency_key, updated.human_gate_artifact_sha256,
            updated.workspace_artifact_sha256, updated.package_sha256,
            updated.provenance_sha256, updated.package_bytes,
            updated.package_file_count, updated.package_filename,
            updated.package_base64,
            updated.credit_cost, updated.credit_reserved_at,
            updated.credit_reservation_expires_at,
            updated.credit_refunded_at, updated.accept_dispatch_intent_at,
            updated.state,
            updated.runner_release_id, updated.provider,
            updated.provider_deployment_id, updated.public_url,
            updated.rollback_ref, updated.provider_report,
            updated.runner_response_body, updated.runner_signature,
            updated.runner_response_sha256, updated.runner_signature_sha256,
            updated.accepted_at, updated.provider_observed_at,
            updated.deployed_at, updated.last_reconciled_at,
            updated.next_poll_at, updated.retry_count, updated.last_error_code,
            updated.last_error_message, updated.last_error_retryable,
            updated.action_claim_token, updated.action_claimed_at,
            updated.action_claim_expires_at, updated.action_attempt_count,
            updated.created_at, updated.updated_at
     from updated, deploy_updated, completed`,
    [
      input.row.id,
      input.row.project_id,
      input.row.user_id,
      input.row.build_job_id,
      input.row.idempotency_key,
      input.row.human_gate_artifact_sha256,
      input.row.workspace_artifact_sha256,
      input.row.package_sha256,
      input.row.provenance_sha256,
      report.runnerReleaseId,
      evidence.provider,
      report.state,
      evidence.providerDeploymentId,
      evidence.publicUrl,
      rollbackRef,
      reportJson,
      input.verified.responseBodySha256,
      input.verified.signatureSha256,
      report.observedAt,
      evidence.deployedAt,
      report.action,
      nextPollAt(input.verified),
      errorCode,
      errorMessage,
      errorRetryable,
      log,
      eventKey,
      input.verified.responseBody,
      input.verified.signature,
      input.claimToken,
      rollbackKind,
      rollbackProviderDeploymentId,
      rollbackPublicUrl,
      input.resumeRequestId ?? null,
    ],
  );
  if (!rows[0]) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_PROGRESS_COMMIT_FAILED");
  }
  return rows[0];
}

export async function recordHarborProductionRunnerFailure(input: {
  sql: Sql;
  row: HarborProductionReleaseRow;
  action: HarborProductionAction;
  claimToken: string;
  error: unknown;
}): Promise<void> {
  const error =
    input.error instanceof HarborProductionRunnerError
      ? input.error
      : new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_REQUEST_FAILED", true);
  const eventKey = `failure:${input.action}:${crypto.randomUUID()}`;
  const committed = await input.sql.query<{ release_id: string }>(
    `with current as materialized (
       select release.*,
              (
                release.state = 'prepared'
                and (not $5 or release.retry_count + 1 >= 20
                     or release.action_attempt_count >= 64)
              ) as should_terminalize
       from harbor_production_releases as release
       where release.id = $1 and release.project_id = $2 and release.user_id = $3
         and release.state = $6 and release.action_claim_token = $9
         and release.state not in ('active', 'failed', 'action_required', 'retry_exhausted')
       for update
     ), refund as materialized (
       select current.id, mutation.was_applied
       from current
       cross join lateral apply_credit_entry(
         current.user_id, current.credit_cost, 'refund', current.project_id,
         'Harbor Production pre-accept failure refund',
         current.idempotency_key || ':credit-refund'
       ) as mutation
       where current.should_terminalize
         and current.credit_cost is not null and current.credit_reserved_at is not null
         and current.credit_refunded_at is null
     ), project_refund as (
       update projects
       set credits_spent = greatest(
             0,
             credits_spent - case when refund.was_applied then current.credit_cost else 0 end
           ),
           updated_at = now()
       from refund
       join current on current.id = refund.id
       where projects.id = current.project_id and projects.user_id = current.user_id
       returning projects.id
     ), mutation_guard as (
       select current.id
       from current
       left join refund on refund.id = current.id
       left join project_refund on project_refund.id = current.project_id
       where not current.should_terminalize
          or (refund.id is not null and project_refund.id is not null)
     ), updated as (
       update harbor_production_releases as release
       set retry_count = least(current.retry_count + 1, 20),
           state = case when current.should_terminalize
             then 'retry_exhausted' else current.state end,
           package_base64 = case when current.should_terminalize
             then null else release.package_base64 end,
           credit_refunded_at = case when refund.id is not null
             then coalesce(release.credit_refunded_at, now())
             else release.credit_refunded_at end,
           last_error_code = $4, last_error_message = $4,
           last_error_retryable = case when current.should_terminalize then false else $5 end,
           next_poll_at = case
             when current.should_terminalize or not $5 then null
             else now() + make_interval(secs => coalesce($10, 60))
           end,
           action_claim_token = null, action_claimed_at = null,
           action_claim_expires_at = null, updated_at = now()
       from current
       join mutation_guard on mutation_guard.id = current.id
       left join refund on refund.id = current.id
       where release.id = current.id
       returning release.id, release.state, current.state as previous_state,
                 release.deploy_id, release.last_error_code,
                 release.last_error_message, release.last_error_retryable
     ), deploy_updated as (
       update deploys as deploy
       set status = case when updated.state = 'retry_exhausted'
             then 'retry_exhausted' else deploy.status end,
           error_code = updated.last_error_code,
           error_message = updated.last_error_message,
           updated_at = now()
       from updated
       where deploy.id = updated.deploy_id
       returning deploy.id
     )
     insert into harbor_production_release_events (
       release_id, event_key, from_state, to_state, source, action,
       error_code, error_message, retryable, evidence
     )
     select updated.id, $7, updated.previous_state, updated.state, 'helix', $8,
            updated.last_error_code, updated.last_error_message,
            updated.last_error_retryable,
            jsonb_build_object('runnerErrorCode', $4::text)
     from updated
     on conflict (release_id, event_key) do nothing
     returning release_id`,
    [
      input.row.id,
      input.row.project_id,
      input.row.user_id,
      error.code,
      error.retryable,
      input.row.state,
      eventKey,
      input.action,
      input.claimToken,
      error.retryAfterSeconds,
    ],
  );
  if (!committed[0]) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_FAILURE_COMMIT_CONFLICT");
  }
}

async function releaseHarborProductionActionClaim(input: {
  sql: Sql;
  row: HarborProductionReleaseRow;
  claimToken: string;
}): Promise<void> {
  await input.sql.query(
    `update harbor_production_releases
     set action_claim_token = null, action_claimed_at = null,
         action_claim_expires_at = null, updated_at = now()
     where id = $1 and project_id = $2 and user_id = $3
       and action_claim_token = $4`,
    [input.row.id, input.row.project_id, input.row.user_id, input.claimToken],
  );
}

async function recordHarborProductionResumeFailure(input: {
  sql: Sql;
  row: HarborProductionReleaseRow;
  claimToken: string;
  requestId: string;
  error: unknown;
}): Promise<void> {
  const error =
    input.error instanceof HarborProductionRunnerError
      ? input.error
      : new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_REQUEST_FAILED", true);
  await input.sql.query(
    `with updated as (
       update harbor_production_releases
       set retry_count = least(retry_count + 1, 20),
           last_error_code = $5, last_error_message = $5,
           last_error_retryable = $6, next_poll_at = null,
           action_claim_token = null, action_claimed_at = null,
           action_claim_expires_at = null, updated_at = now()
       where id = $1 and project_id = $2 and user_id = $3
         and state = $4 and state in ('failed', 'action_required')
         and action_claim_token = $7
       returning id, state
     )
     insert into harbor_production_release_events (
       release_id, event_key, from_state, to_state, source, action,
       error_code, error_message, retryable, evidence
     )
     select updated.id, 'resume-failure:' || $8, updated.state, updated.state,
            'helix', 'reconcile', $5, $5, $6,
            jsonb_build_object('requestId', $8)
     from updated
     on conflict (release_id, event_key) do nothing`,
    [
      input.row.id,
      input.row.project_id,
      input.row.user_id,
      input.row.state,
      error.code,
      error.retryable,
      input.claimToken,
      input.requestId,
    ],
  );
}

export async function acceptHarborProductionRelease(input: {
  sql: Sql;
  row: HarborProductionReleaseRow;
  artifact: HarborProductionArtifact;
  provider: HarborProductionProviderAdapter;
  creditCost: number;
}): Promise<HarborProductionReleaseRow> {
  if (input.row.state !== "prepared") return input.row;
  if (harborProductionAttemptLimitReached(input.row)) {
    return terminalizeHarborProductionAttemptLimit({ sql: input.sql, row: input.row });
  }
  const claim = await claimHarborProductionAction({
    sql: input.sql,
    row: input.row,
    action: "accept",
    creditCost: input.creditCost,
  });
  let verified: VerifiedHarborProductionRunnerReport;
  try {
    verified = await input.provider.execute({
      action: "accept",
      releaseId: claim.row.id,
      idempotencyKey: claim.row.idempotency_key,
      identity: harborProductionIdentity(claim.row),
      sourcePackage: input.artifact.sourcePackage,
    });
  } catch (error) {
    await recordHarborProductionRunnerFailure({
      sql: input.sql,
      row: claim.row,
      action: "accept",
      claimToken: claim.token,
      error,
    });
    throw error;
  }
  try {
    return await persistAcceptedHarborProductionReport({
      sql: input.sql,
      row: claim.row,
      verified,
      deployId: crypto.randomUUID(),
      creditCost: input.creditCost,
      claimToken: claim.token,
    });
  } catch (error) {
    await releaseHarborProductionActionClaim({
      sql: input.sql,
      row: claim.row,
      claimToken: claim.token,
    });
    throw error;
  }
}

export async function advanceHarborProductionRelease(input: {
  sql: Sql;
  row: HarborProductionReleaseRow;
  provider: HarborProductionProviderAdapter;
}): Promise<HarborProductionReleaseRow> {
  if (["active", "failed", "action_required", "retry_exhausted"].includes(input.row.state)) {
    return input.row;
  }
  if (input.row.state === "prepared") {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RELEASE_NOT_ACCEPTED");
  }
  if (harborProductionAttemptLimitReached(input.row)) {
    return terminalizeHarborProductionAttemptLimit({ sql: input.sql, row: input.row });
  }
  const action: HarborProductionAction = input.row.state === "accepted" ? "activate" : "reconcile";
  const claim = await claimHarborProductionAction({ sql: input.sql, row: input.row, action });
  let verified: VerifiedHarborProductionRunnerReport;
  try {
    verified = await input.provider.execute({
      action,
      releaseId: claim.row.id,
      idempotencyKey: claim.row.idempotency_key,
      identity: harborProductionIdentity(claim.row),
      sourcePackage: null,
    });
  } catch (error) {
    await recordHarborProductionRunnerFailure({
      sql: input.sql,
      row: claim.row,
      action,
      claimToken: claim.token,
      error,
    });
    throw error;
  }
  try {
    return await persistHarborProductionProgressReport({
      sql: input.sql,
      row: claim.row,
      verified,
      claimToken: claim.token,
    });
  } catch (error) {
    await releaseHarborProductionActionClaim({
      sql: input.sql,
      row: claim.row,
      claimToken: claim.token,
    });
    throw error;
  }
}

export async function resumeHarborProductionRelease(input: {
  sql: Sql;
  row: HarborProductionReleaseRow;
  provider: HarborProductionProviderAdapter;
  requestId: string;
}): Promise<HarborProductionReleaseRow> {
  const requestId = normalizeHarborProductionResumeRequestId(input.requestId);
  const claim = await claimHarborProductionResume({
    sql: input.sql,
    row: input.row,
    requestId,
  });
  if (claim.replayed) return claim.row;
  let verified: VerifiedHarborProductionRunnerReport;
  try {
    verified = await input.provider.execute({
      action: "reconcile",
      releaseId: claim.row.id,
      idempotencyKey: claim.row.idempotency_key,
      identity: harborProductionIdentity(claim.row),
      sourcePackage: null,
    });
  } catch (error) {
    await recordHarborProductionResumeFailure({
      sql: input.sql,
      row: claim.row,
      claimToken: claim.token,
      requestId,
      error,
    });
    throw error;
  }
  try {
    return await persistHarborProductionProgressReport({
      sql: input.sql,
      row: claim.row,
      verified,
      claimToken: claim.token,
      resumeRequestId: requestId,
    });
  } catch (error) {
    await releaseHarborProductionActionClaim({
      sql: input.sql,
      row: claim.row,
      claimToken: claim.token,
    });
    throw error;
  }
}

type HarborProductionReservationRecovery = "accepted" | "refunded" | "skipped";

type HarborProductionReservationCandidate = Pick<
  HarborProductionReleaseRow,
  "id" | "project_id" | "user_id"
>;

async function claimExpiredHarborProductionReservation(input: {
  sql: Sql;
  row: HarborProductionReservationCandidate;
}): Promise<HarborProductionActionClaim | null> {
  const token = crypto.randomUUID();
  const rows = await input.sql.query<HarborProductionReleaseRow>(
    `update harbor_production_releases
     set action_claim_token = $4, action_claimed_at = now(),
         action_claim_expires_at = now() + interval '90 seconds',
         action_attempt_count = least(action_attempt_count + 1, 64),
         updated_at = now()
     where id = $1 and project_id = $2 and user_id = $3
       and state = 'prepared' and credit_cost is not null
       and credit_reserved_at is not null and credit_refunded_at is null
       and credit_reservation_expires_at <= now()
       and accept_dispatch_intent_at is not null and package_base64 is not null
       and (action_claim_token is null or action_claim_expires_at <= now())
     returning *`,
    [input.row.id, input.row.project_id, input.row.user_id, token],
  );
  return rows[0] ? { row: rows[0], action: "accept", token } : null;
}

async function expireHarborProductionReservation(input: {
  sql: Sql;
  row: HarborProductionReleaseRow;
  claimToken: string;
  recoveryErrorCode: string;
}): Promise<HarborProductionReleaseRow> {
  const rows = await input.sql.query<HarborProductionReleaseRow>(
    `with current as materialized (
       select * from harbor_production_releases
       where id = $1 and project_id = $2 and user_id = $3
         and state = 'prepared' and action_claim_token = $4
         and credit_cost is not null and credit_reserved_at is not null
         and credit_refunded_at is null and credit_reservation_expires_at <= now()
       for update
     ), refund as materialized (
       select current.id, mutation.was_applied
       from current
       cross join lateral apply_credit_entry(
         current.user_id, current.credit_cost, 'refund', current.project_id,
         'Expired Harbor Production reservation refund',
         current.idempotency_key || ':credit-refund'
       ) as mutation
     ), project_refund as (
       update projects
       set credits_spent = greatest(
             0,
             credits_spent - case when refund.was_applied then current.credit_cost else 0 end
           ),
           updated_at = now()
       from refund
       join current on current.id = refund.id
       where projects.id = current.project_id and projects.user_id = current.user_id
       returning projects.id
     ), updated as (
       update harbor_production_releases as release
       set state = 'retry_exhausted', credit_refunded_at = now(),
           package_base64 = null,
           next_poll_at = null,
           last_error_code = 'HARBOR_PRODUCTION_RESERVATION_EXPIRED',
           last_error_message = 'HARBOR_PRODUCTION_RESERVATION_EXPIRED',
           last_error_retryable = false,
           action_claim_token = null, action_claimed_at = null,
           action_claim_expires_at = null, updated_at = now()
       from current, refund, project_refund
       where release.id = current.id
       returning release.*
     ), event as (
       insert into harbor_production_release_events (
         release_id, event_key, from_state, to_state, source, action,
         error_code, error_message, retryable, evidence
       )
       select updated.id,
              'reservation-expired:' || extract(epoch from updated.credit_reservation_expires_at),
              'prepared', 'retry_exhausted', 'helix', 'accept',
              'HARBOR_PRODUCTION_RESERVATION_EXPIRED',
              'HARBOR_PRODUCTION_RESERVATION_EXPIRED', false,
              jsonb_build_object(
                'creditReservedAt', updated.credit_reserved_at,
                'creditReservationExpiresAt', updated.credit_reservation_expires_at,
                'packageSha256', updated.package_sha256,
                'recoveryErrorCode', $5::text
              )
       from updated
       on conflict (release_id, event_key) do nothing
     )
     select * from updated`,
    [
      input.row.id,
      input.row.project_id,
      input.row.user_id,
      input.claimToken,
      input.recoveryErrorCode,
    ],
  );
  if (!rows[0]) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RESERVATION_EXPIRE_CONFLICT");
  }
  return rows[0];
}

export async function recoverExpiredHarborProductionReservation(input: {
  sql: Sql;
  row: HarborProductionReservationCandidate;
  provider: HarborProductionProviderAdapter;
}): Promise<HarborProductionReservationRecovery> {
  const claim = await claimExpiredHarborProductionReservation(input);
  if (!claim) return "skipped";
  const creditCost = claim.row.credit_cost;
  if (typeof creditCost !== "number" || !Number.isInteger(creditCost) || creditCost <= 0) {
    await expireHarborProductionReservation({
      sql: input.sql,
      row: claim.row,
      claimToken: claim.token,
      recoveryErrorCode: "HARBOR_PRODUCTION_RESERVATION_INVALID",
    });
    return "refunded";
  }
  let gateStillCurrent: boolean;
  try {
    const gate = await input.sql.query<{ exists: boolean }>(
      `select exists (
         select 1
         from harbor_production_releases as release
         join projects as owned on owned.id = release.project_id
           and owned.user_id = release.user_id
           and owned.current_build_job_id = release.build_job_id
         join build_jobs as job on job.id = release.build_job_id
           and job.project_id = release.project_id and job.user_id = release.user_id
           and job.queue_status in ('approved', 'deployed')
           and job.artifact_sha256 = release.human_gate_artifact_sha256
           and job.payload::jsonb #>> '{workspace,artifactSha256}' = release.workspace_artifact_sha256
           and job.payload::jsonb #>> '{buildLevel}' = 'production'
         where release.id = $1 and release.project_id = $2 and release.user_id = $3
           and release.state = 'prepared' and release.action_claim_token = $4
           and exists (
             select 1 from build_job_gate_events as approved
             where approved.job_id = job.id and approved.decision = 'approve'
               and approved.artifact_sha256 = job.artifact_sha256
           )
       ) as exists`,
      [claim.row.id, claim.row.project_id, claim.row.user_id, claim.token],
    );
    gateStillCurrent = gate[0]?.exists === true;
  } catch (error) {
    await releaseHarborProductionActionClaim({
      sql: input.sql,
      row: claim.row,
      claimToken: claim.token,
    });
    throw error;
  }
  if (!gateStillCurrent) {
    await expireHarborProductionReservation({
      sql: input.sql,
      row: claim.row,
      claimToken: claim.token,
      recoveryErrorCode: "HARBOR_PRODUCTION_GATE_NOT_CURRENT",
    });
    return "refunded";
  }
  let verified: VerifiedHarborProductionRunnerReport;
  try {
    const sourcePackage = await verifyHarborProductionPackage({
      filename: claim.row.package_filename,
      sha256: claim.row.package_sha256,
      byteLength: claim.row.package_bytes,
      fileCount: claim.row.package_file_count,
      provenanceSha256: claim.row.provenance_sha256,
      base64: claim.row.package_base64,
    });
    verified = await input.provider.execute({
      action: "accept",
      releaseId: claim.row.id,
      idempotencyKey: claim.row.idempotency_key,
      identity: harborProductionIdentity(claim.row),
      sourcePackage,
    });
  } catch (error) {
    const code =
      error instanceof HarborProductionRunnerError
        ? error.code
        : "HARBOR_PRODUCTION_RESERVATION_RECOVERY_FAILED";
    await expireHarborProductionReservation({
      sql: input.sql,
      row: claim.row,
      claimToken: claim.token,
      recoveryErrorCode: code,
    });
    return "refunded";
  }
  try {
    await persistAcceptedHarborProductionReport({
      sql: input.sql,
      row: claim.row,
      verified,
      deployId: crypto.randomUUID(),
      creditCost,
      claimToken: claim.token,
    });
    return "accepted";
  } catch (error) {
    await releaseHarborProductionActionClaim({
      sql: input.sql,
      row: claim.row,
      claimToken: claim.token,
    });
    throw error;
  }
}

export type HarborProductionSweepResult = {
  listed: number;
  accepted: number;
  refunded: number;
  skipped: number;
  failed: number;
  errors: Array<{ releaseId: string; code: string }>;
};

function boundedHarborProductionSweepErrorCode(error: unknown): string {
  const sqlState =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const candidate =
    error instanceof HarborProductionRunnerError
      ? error.code
      : /^[0-9A-Z]{5}$/u.test(sqlState)
        ? `HARBOR_PRODUCTION_SWEEP_SQL_${sqlState}`
        : "HARBOR_PRODUCTION_SWEEP_FAILED";
  return /^[A-Z0-9_]{1,120}$/u.test(candidate) ? candidate : "HARBOR_PRODUCTION_SWEEP_FAILED";
}

async function recordHarborProductionSweepFailure(input: {
  sql: Sql;
  row: HarborProductionReservationCandidate;
  errorCode: string;
}): Promise<void> {
  await input.sql.query(
    `insert into harbor_production_release_events (
       release_id, event_key, from_state, to_state, source, action,
       error_code, error_message, retryable, evidence
     )
     select release.id,
            'sweep-failure:' || release.action_attempt_count || ':' || $4,
            release.state, release.state, 'helix', 'accept', $4, $4, true,
            jsonb_build_object('actionAttemptCount', release.action_attempt_count)
     from harbor_production_releases as release
     where release.id = $1 and release.project_id = $2 and release.user_id = $3
     on conflict (release_id, event_key) do nothing`,
    [input.row.id, input.row.project_id, input.row.user_id, input.errorCode],
  );
}

export async function sweepExpiredHarborProductionReservations(input: {
  sql: Sql;
  provider: HarborProductionProviderAdapter;
  limit?: number;
}): Promise<HarborProductionSweepResult> {
  // A Netlify background invocation has a finite runtime. Ten sequential
  // runner calls at the adapter's 30-second ceiling stay bounded to five
  // minutes while avoiding a burst of large package uploads.
  const limit = Math.max(1, Math.min(10, Math.trunc(input.limit ?? 10)));
  const rows = await input.sql.query<HarborProductionReservationCandidate>(
    `select id, project_id, user_id from harbor_production_releases
     where state = 'prepared' and credit_cost is not null
       and credit_reserved_at is not null and credit_refunded_at is null
       and credit_reservation_expires_at <= now()
       and accept_dispatch_intent_at is not null and package_base64 is not null
       and (action_claim_token is null or action_claim_expires_at <= now())
     order by credit_reservation_expires_at, id
     limit $1`,
    [limit],
  );
  const result: HarborProductionSweepResult = {
    listed: rows.length,
    accepted: 0,
    refunded: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  for (const row of rows) {
    try {
      const recovery = await recoverExpiredHarborProductionReservation({
        sql: input.sql,
        row,
        provider: input.provider,
      });
      result[recovery] += 1;
    } catch (error) {
      const code = boundedHarborProductionSweepErrorCode(error);
      result.failed += 1;
      result.errors.push({ releaseId: row.id, code });
      await recordHarborProductionSweepFailure({ sql: input.sql, row, errorCode: code });
    }
  }
  return result;
}
