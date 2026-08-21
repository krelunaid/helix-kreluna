import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { bundleIdFromTitle, expoFiles, slugify, withPwa, windowsFiles } from "@/lib/expo-pack";
import { archivedFor, featuredFor, featuredHtml } from "@/lib/templates";
import { normalizeLocale } from "@/lib/i18n-core";
import { toBase64, zipFiles } from "@/lib/zip";
import { publicOriginFromHostname } from "@/lib/env.shared";
import type { BuildLevel } from "@/lib/build-level";
import { protectGeneratedHtml } from "@/lib/generated-content-policy";
import {
  GUEST_PUBLISH_TTL_MS,
  hashOpaqueToken,
  isOpaqueGuestToken,
  utf8ByteLength,
} from "@/lib/guest-security";
import { initialWebHostingIdempotencyKey, rethrowCreditMutationError } from "@/lib/server/credits";
import { hashGuestBuildToken } from "@/lib/server/build-job-access";
import {
  getApprovedGuestBuild,
  getApprovedOwnedBuild,
  HumanGateError,
  normalizeGateRequestId,
  type ApprovedBuildArtifact,
} from "@/lib/server/review/human-gate";
import {
  assertPublishedUtf8,
  PublishedArtifactIntegrityError,
  sha256BytesHex,
  sha256Utf8Hex,
} from "@/lib/server/release/integrity";
import { deleteExpiredGuestPublications } from "@/lib/server/persistence/guest-publications";
import {
  callStoreRunner,
  isStoreRunnerConfigured,
  LEGACY_PROTOTYPE_STORE_ARTIFACT_DESCRIPTOR,
  LegacyStoreRunnerReportSchema,
  StoreArtifactDescriptorSchema,
  StoreRunnerError,
  StoreIdentitySchema,
  StoreRunnerReportSchema,
  type StoreArtifactDescriptor,
  type StoreIdentity,
  type LegacyStoreRunnerReport,
  type StoreRunnerReport,
} from "@/lib/server/store-runner";
import {
  prepareApprovedProductionStorePackage,
  StoreProductionPackagingError,
  type ApprovedProductionStoreSource,
} from "@/lib/server/release/store-production-artifact";
import { createHarborProductionArtifact } from "@/lib/server/release/harbor-production-artifact";
import {
  acceptHarborProductionRelease,
  advanceHarborProductionRelease,
  harborProductionReadiness,
  harborProductionReleaseResult,
  loadHarborProductionRelease,
  prepareHarborProductionRelease,
  resumeHarborProductionRelease,
  type HarborProductionReadiness,
} from "@/lib/server/release/harbor-production-release";
import {
  assertHarborProductionPublishingConfigured,
  createAuthenticatedHarborProductionProvider,
  HarborProductionRunnerError,
} from "@/lib/server/release/harbor-production-runner";

export type { HarborProductionReadiness } from "@/lib/server/release/harbor-production-release";

let schemaReady: Promise<void> | null = null;

async function ensureSchema() {
  schemaReady ??= (async () => {
    const sql = await getSql();
    await sql.query(`
      create table if not exists deploys (
        id text primary key,
        project_id text,
        user_id text,
        target text not null,
        status text not null,
        slug text,
        bundle_id text,
        apple_team text,
        version text not null default '1.0.0',
        testers_code text,
        url text,
        log text not null default '[]',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);
    await sql.query(`
      create table if not exists public_apps (
        slug text primary key,
        title text not null,
        html text not null,
        testers_code text,
        project_id text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);
  })();
  return schemaReady;
}

// Windows currently prepares a source-only Electron wrapper and performs no
// provider build, signing or submission. The endpoint does not debit credits,
// so its displayed cost must remain zero until an atomic paid flow exists.
export const DEPLOY_COST = { web: 50, ios: 80, android: 80, windows: 0 } as const;
export type DeployTarget = keyof typeof DEPLOY_COST;

export class HarborPublishError extends Error {
  readonly code = "HARBOR_PRODUCTION_WEB_PUBLISH_UNAVAILABLE";
  readonly status = 409;
  readonly retryable = false;
  readonly buildLevel = "production";
  readonly target = "web";

  constructor() {
    super("HARBOR_PRODUCTION_WEB_PUBLISH_UNAVAILABLE");
    this.name = "HarborPublishError";
  }
}

export function assertHarborWebPublishable(
  buildLevel: BuildLevel,
): asserts buildLevel is "prototype" {
  if (buildLevel === "production") {
    throw new HarborPublishError();
  }
}

function approvedProductionStoreSource(
  artifact: ApprovedBuildArtifact,
): ApprovedProductionStoreSource {
  if (artifact.buildLevel !== "production" || !artifact.workspace) {
    throw new StoreProductionPackagingError("STORE_PRODUCTION_WORKSPACE_INVALID");
  }
  return {
    jobId: artifact.jobId,
    buildLevel: "production",
    html: artifact.html,
    artifactSha256: artifact.artifactSha256,
    files: artifact.files,
    workspace: artifact.workspace,
  };
}

export type StoreReadiness = {
  sourcePackageReady: true;
  runnerConfigured: boolean;
  mappingAccepted: boolean;
  credentialsConfigured: boolean;
  nativeBuildReady: boolean;
  signingReady: boolean;
  submissionReady: boolean;
  missingCredentials: string[];
  reason:
    | "STORE_RUNNER_UNCONFIGURED"
    | "STORE_CREDENTIAL_MAPPING_PENDING"
    | "STORE_CREDENTIAL_MAPPING_ACCEPTED"
    | "STORE_DISPATCH_ACCEPTED"
    | "STORE_WORKFLOW_IN_PROGRESS"
    | "STORE_DISTRIBUTED"
    | "STORE_ACTION_REQUIRED";
};

export function storeReadiness(
  target: "ios" | "android",
  env: Record<string, string | undefined> = process.env,
): StoreReadiness {
  const runnerConfigured = isStoreRunnerConfigured(env);
  return {
    sourcePackageReady: true,
    runnerConfigured,
    // A configured endpoint and a local mapping are not provider proof.
    mappingAccepted: false,
    credentialsConfigured: false,
    nativeBuildReady: false,
    signingReady: false,
    submissionReady: false,
    missingCredentials: runnerConfigured
      ? [
          target === "ios"
            ? "EAS iOS build/signing and TestFlight credentials not yet proven"
            : "EAS Android build/signing and Play credentials not yet proven",
        ]
      : ["HELIX_STORE_RUNNER_URL", "HELIX_STORE_RUNNER_SECRET"],
    reason: runnerConfigured ? "STORE_CREDENTIAL_MAPPING_PENDING" : "STORE_RUNNER_UNCONFIGURED",
  };
}

export function storeReadinessFromReport(
  report: StoreRunnerReport | LegacyStoreRunnerReport,
): StoreReadiness {
  const buildReady =
    report.providerBuildId !== null && report.providerEvidence.buildStatus === "succeeded";
  const androidReleaseEvidenceRequired =
    report.identity.platform === "android" &&
    report.error?.code === "STORE_ANDROID_PLAY_RELEASE_EVIDENCE_REQUIRED";
  const submissionReady =
    report.workflowDistributionJobId !== null &&
    report.providerEvidence.submissionStatus === "succeeded" &&
    report.state === "distributed";
  return {
    sourcePackageReady: true,
    runnerConfigured: true,
    // Accept proves only that the authenticated runner recognized an
    // operator-supplied app mapping. Successful provider work is the proof for
    // build/signing credentials; complete distribution is the proof that the
    // store credential also worked.
    mappingAccepted: true,
    credentialsConfigured: submissionReady,
    nativeBuildReady: buildReady,
    signingReady: buildReady,
    submissionReady,
    missingCredentials: submissionReady
      ? []
      : androidReleaseEvidenceRequired
        ? ["Verified Google Play release ID is still required after EAS submission"]
        : [
            buildReady
              ? "EAS store submission credential not yet proven"
              : "EAS build/signing and store credentials not yet proven",
          ],
    reason:
      report.state === "distributed"
        ? "STORE_DISTRIBUTED"
        : report.state === "failed" || report.state === "action_required"
          ? "STORE_ACTION_REQUIRED"
          : report.state === "dispatch_accepted"
            ? "STORE_CREDENTIAL_MAPPING_ACCEPTED"
            : "STORE_WORKFLOW_IN_PROGRESS",
  };
}

export type DeployStep = {
  id: string;
  label: string;
  status: "queued" | "running" | "done" | "blocked" | "skipped" | "error";
  detail: string;
};

export type Deploy = {
  id: string;
  project_id: string | null;
  user_id: string | null;
  target: DeployTarget;
  status: string;
  slug: string | null;
  bundle_id: string | null;
  apple_team: string | null;
  version: string;
  testers_code: string | null;
  url: string | null;
  log: DeployStep[];
  created_at: string;
  updated_at: string;
  build_job_id: string | null;
  provider: string | null;
  provider_deploy_id: string | null;
  artifact_ref: string | null;
  /** SHA-256 of the source HTML sealed by Human Gate. */
  artifact_sha256: string | null;
  /** SHA-256 of the exact HTML or ZIP bytes persisted/exported by Harbor. */
  published_sha256: string | null;
  output_integrity_version: number | null;
  rollback_ref: string | null;
  release_key: string | null;
  completed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  store_release_id: string | null;
  harbor_release_id: string | null;
  harbor_release_state: string | null;
};

export type PublicApp = {
  slug: string;
  title: string;
  html: string;
  isGuest: boolean;
  expiresAt: string | null;
  sourceArtifactSha256: string | null;
  servedSha256: string | null;
};

type PublicAppRow = {
  slug: string;
  title: string;
  html: string;
  visibility: string;
  expires_at: string | null;
  source_job_id: string | null;
  source_artifact_sha256: string | null;
  served_sha256: string | null;
  publication_integrity_version: number | null;
};

type DeployRow = Omit<Deploy, "log"> & { log: string };

function parseLog(raw: string): DeployStep[] {
  try {
    const v = JSON.parse(raw) as DeployStep[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function mapDeploy(row: DeployRow): Deploy {
  return { ...row, log: parseLog(row.log) };
}

function publicOrigin() {
  const host =
    (typeof process !== "undefined" ? process.env.VITE_PUBLIC_HOSTNAME : undefined) ??
    (import.meta.env.VITE_PUBLIC_HOSTNAME as string | undefined);
  return host ? publicOriginFromHostname(host) : "";
}

function appUrl(slug: string, accessToken?: string) {
  const origin = publicOrigin();
  const path = `/a/${slug}`;
  const url = origin ? `${origin}${path}` : path;
  return accessToken ? `${url}?access=${encodeURIComponent(accessToken)}` : url;
}

function trackUrl(code: string) {
  const origin = publicOrigin();
  return origin ? `${origin}/t/${code}` : `/t/${code}`;
}

function testersCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const random = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(random, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function uniqueSlug(base: string) {
  await ensureSchema();
  const sql = await getSql();
  const root = slugify(base);
  for (let i = 0; i < 8; i++) {
    const slug = i === 0 ? root : `${root}-${Math.random().toString(36).slice(2, 5)}`;
    const rows = await sql<{ slug: string }>`select slug from public_apps where slug = ${slug}`;
    if (!rows[0]) return slug;
  }
  return `${root}-${Date.now().toString(36).slice(-4)}`;
}

async function cleanupExpiredGuestPublishes() {
  await ensureSchema();
  await deleteExpiredGuestPublications();
}

async function markResponsePrivate() {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "private, no-store, max-age=0");
  setResponseHeader("Referrer-Policy", "no-referrer");
}

async function toPublicApp(row: PublicAppRow): Promise<PublicApp> {
  const isGuest = row.visibility === "guest";
  const protectedHtml = protectGeneratedHtml(row.html, { noIndex: isGuest });
  if (row.publication_integrity_version === 1) {
    if (!row.source_job_id || !row.source_artifact_sha256) {
      throw new PublishedArtifactIntegrityError();
    }
    await assertPublishedUtf8({
      value: protectedHtml,
      expectedSha256: row.served_sha256,
    });
  } else if (row.publication_integrity_version !== null) {
    throw new PublishedArtifactIntegrityError();
  }
  return {
    slug: row.slug,
    title: row.title,
    html: protectedHtml,
    isGuest,
    expiresAt: row.expires_at,
    sourceArtifactSha256: row.source_artifact_sha256,
    servedSha256: row.publication_integrity_version === 1 ? row.served_sha256 : null,
  };
}

function harborWeb(): DeployStep[] {
  return [
    {
      id: "gate",
      label: "Human Gate",
      status: "done",
      detail: "Approved artifact hash verified",
    },
    {
      id: "persist",
      label: "Harbor · Kreluna hosting",
      status: "done",
      detail: "Exact served HTML bytes persisted with a separate SHA-256",
    },
    {
      id: "url",
      label: "Harbor · public route",
      status: "done",
      detail: "Public Kreluna URL created",
    },
    {
      id: "cdn",
      label: "Harbor · CDN verification",
      status: "skipped",
      detail: "No independent CDN probe was executed",
    },
  ];
}

function harborStore(target: "ios" | "android", report: StoreRunnerReport): DeployStep[] {
  const store = target === "ios" ? "TestFlight" : "Google Play internal track";
  const buildStatus = report.providerEvidence.buildStatus;
  const submissionStatus = report.providerEvidence.submissionStatus;
  const androidReleaseEvidenceRequired =
    target === "android" && report.error?.code === "STORE_ANDROID_PLAY_RELEASE_EVIDENCE_REQUIRED";
  const buildStepStatus: DeployStep["status"] =
    buildStatus === "succeeded"
      ? "done"
      : buildStatus === "failed" || buildStatus === "skipped" || buildStatus === "unknown"
        ? "error"
        : buildStatus === "action_required"
          ? "blocked"
          : buildStatus === "in_progress" || buildStatus === "pending_cancel"
            ? "running"
            : "queued";
  const submissionStepStatus: DeployStep["status"] = androidReleaseEvidenceRequired
    ? "blocked"
    : submissionStatus === "succeeded"
      ? "done"
      : submissionStatus === "failed" ||
          submissionStatus === "skipped" ||
          submissionStatus === "unknown"
        ? "error"
        : submissionStatus === "action_required"
          ? "blocked"
          : submissionStatus === "in_progress" || submissionStatus === "pending_cancel"
            ? "running"
            : "queued";
  return [
    {
      id: "gate",
      label: "Human Gate",
      status: "done",
      detail: "Approved artifact hash verified",
    },
    {
      id: "pack",
      label: "Harbor · web-to-native source package",
      status: "done",
      detail: `Expo source workspace prepared for ${target} with exact ZIP SHA-256`,
    },
    {
      id: "accept",
      label: "Harbor · authenticated Store runner",
      status: "done",
      detail: "The durable runner accepted the exact ZIP hash and credential mapping",
    },
    {
      id: "build",
      label: "Harbor · native binary build",
      status: buildStepStatus,
      detail:
        report.providerBuildId === null
          ? "No completed EAS build has been reported"
          : `EAS build ID ${report.providerBuildId}`,
    },
    {
      id: "sign",
      label: "Harbor · signing",
      status: buildStepStatus,
      detail:
        buildStatus === "succeeded"
          ? "The store-distribution EAS build completed with runner-bound credential evidence"
          : "Signing is not claimed until the store-distribution build succeeds",
    },
    {
      id: "upload",
      label: `Harbor · ${store}`,
      status: submissionStepStatus,
      detail: androidReleaseEvidenceRequired
        ? report.providerSubmissionId
          ? `EAS submission ID ${report.providerSubmissionId}; verified Google Play release ID is still missing`
          : "Verified Google Play release ID is still missing"
        : report.workflowDistributionJobId === null
          ? `No successful ${store} distribution has been reported`
          : `EAS workflow distribution job ${report.workflowDistributionJobId}`,
    },
  ];
}

type StoreReleaseRow = {
  id: string;
  project_id: string;
  build_job_id: string;
  deploy_id: string | null;
  user_id: string;
  platform: "ios" | "android";
  destination: "testflight" | "play_internal";
  request_id: string;
  idempotency_key: string;
  source_artifact_sha256: string;
  package_sha256: string;
  package_bytes: number;
  package_filename: string;
  app_identifier: string;
  eas_project_id: string;
  apple_team_id: string | null;
  source_build_level: "prototype" | "production";
  source_workspace_sha256: string | null;
  package_manifest_sha256: string | null;
  packaging_profile: "legacy_expo_wrapper_v1" | "orbit_expo_static_wrapper_v1";
  state: StoreRunnerReport["state"] | "prepared";
  runner_job_id: string | null;
  workflow_run_id: string | null;
  provider_build_id: string | null;
  provider_submission_id: string | null;
  provider_release_id: string | null;
  play_track: string | null;
  credential_evidence: unknown;
  provider_evidence: unknown;
  retry_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
  last_error_retryable: boolean | null;
  created_at: string;
  updated_at: string;
};

function storeArtifactDescriptorFromRow(row: StoreReleaseRow): StoreArtifactDescriptor {
  return StoreArtifactDescriptorSchema.parse(
    row.source_build_level === "production"
      ? {
          kind: "helix_store_artifact_descriptor",
          schemaVersion: "1.0.0",
          sourceBuildLevel: "production",
          artifactKind: "web_to_native_wrapper",
          packagingProfile: row.packaging_profile,
          nativeImplementation: false,
          runtimeProfile: "static_site",
          sourcePreviewSha256: row.source_artifact_sha256,
          sourceWorkspaceSha256: row.source_workspace_sha256,
          packageManifestSha256: row.package_manifest_sha256,
        }
      : {
          ...LEGACY_PROTOTYPE_STORE_ARTIFACT_DESCRIPTOR,
          packagingProfile: row.packaging_profile,
        },
  );
}

function storedStoreReportMatchesRow(
  report: StoreRunnerReport | LegacyStoreRunnerReport,
  row: StoreReleaseRow,
): boolean {
  const identity = report.identity;
  if (
    report.state !== row.state ||
    report.releaseId !== row.id ||
    report.idempotencyKey !== row.idempotency_key ||
    report.packageSha256 !== row.package_sha256 ||
    report.runnerJobId !== row.runner_job_id ||
    report.workflowRunId !== row.workflow_run_id ||
    report.providerBuildId !== row.provider_build_id ||
    report.providerSubmissionId !== row.provider_submission_id ||
    report.providerReleaseId !== row.provider_release_id ||
    identity.platform !== row.platform ||
    identity.destination !== row.destination ||
    identity.appIdentifier !== row.app_identifier ||
    identity.easProjectId !== row.eas_project_id ||
    identity.appleTeamId !== row.apple_team_id
  ) {
    return false;
  }
  if (report.schemaVersion === "1.0.0") {
    return row.source_build_level === "prototype";
  }
  return (
    JSON.stringify(report.artifactDescriptor) === JSON.stringify(storeArtifactDescriptorFromRow(row))
  );
}

function parseStoredStoreReport(
  row: StoreReleaseRow,
): StoreRunnerReport | LegacyStoreRunnerReport | null {
  const current = StoreRunnerReportSchema.safeParse(row.provider_evidence);
  if (current.success && storedStoreReportMatchesRow(current.data, row)) return current.data;
  const legacy = LegacyStoreRunnerReportSchema.safeParse(row.provider_evidence);
  if (legacy.success && storedStoreReportMatchesRow(legacy.data, row)) return legacy.data;
  return null;
}

function failedClosedStoreReadiness(row: StoreReleaseRow): StoreReadiness {
  const readiness = storeReadiness(row.platform);
  return row.state === "failed" || row.state === "action_required"
    ? { ...readiness, reason: "STORE_ACTION_REQUIRED" }
    : readiness;
}

function storeReleaseResult(row: StoreReleaseRow) {
  const evidence = parseStoredStoreReport(row);
  const artifactDescriptor = storeArtifactDescriptorFromRow(row);
  return {
    id: row.id,
    deployId: row.deploy_id,
    status: row.state,
    submissionStatus:
      row.state === "distributed"
        ? ("distributed" as const)
        : row.state === "failed" || row.state === "action_required"
          ? ("blocked" as const)
          : row.state === "prepared"
            ? ("not_dispatched" as const)
            : ("in_progress" as const),
    target: row.platform,
    destination: row.destination,
    bundleId: row.app_identifier,
    easProjectId: row.eas_project_id,
    runnerJobId: row.runner_job_id,
    workflowRunId: row.workflow_run_id,
    providerBuildId: row.provider_build_id,
    providerSubmissionId: row.provider_submission_id,
    providerReleaseId: row.provider_release_id,
    playTrack: row.play_track,
    packageSha256: row.package_sha256,
    sourceArtifactSha256: row.source_artifact_sha256,
    sourceBuildLevel: row.source_build_level,
    sourceWorkspaceSha256: row.source_workspace_sha256,
    packageManifestSha256: row.package_manifest_sha256,
    packagingProfile: row.packaging_profile,
    artifactKind: artifactDescriptor.artifactKind,
    nativeImplementation: artifactDescriptor.nativeImplementation,
    runtimeProfile: artifactDescriptor.runtimeProfile,
    artifactDescriptor,
    readiness: evidence ? storeReadinessFromReport(evidence) : failedClosedStoreReadiness(row),
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

function storeReportEventKey(report: StoreRunnerReport): string {
  return `report:${report.action}:${report.state}:${
    report.providerEvidence.rawReportSha256 ?? report.observedAt
  }`;
}

async function persistStoreRunnerReport(input: {
  sql: Sql;
  report: StoreRunnerReport;
  releaseId: string;
  projectId: string;
  userId: string;
  buildJobId: string;
  artifactSha256: string;
  target: "ios" | "android";
}): Promise<StoreReleaseRow> {
  const { report } = input;
  const log = JSON.stringify(harborStore(input.target, report));
  const reportJson = JSON.stringify(report);
  const credentialsJson = JSON.stringify(report.credentialEvidence);
  const eventKey = storeReportEventKey(report);
  const errorCode = report.error?.code ?? null;
  const errorMessage = report.error?.message ?? null;
  const errorRetryable = report.error?.retryable ?? null;
  const descriptor = report.artifactDescriptor;
  const nextPollAt = report.retryAfterSeconds
    ? new Date(Date.parse(report.observedAt) + report.retryAfterSeconds * 1_000).toISOString()
    : null;
  const rows = await input.sql.query<StoreReleaseRow>(
    `with current as materialized (
       select * from store_release_jobs
       where id = $1 and project_id = $2 and user_id = $3
         and build_job_id = $4 and source_artifact_sha256 = $5
         and package_sha256 = $6 and runner_job_id = $7
         and (workflow_run_id is null or workflow_run_id = $8)
         and source_build_level = $23
         and source_workspace_sha256 is not distinct from $24
         and package_manifest_sha256 is not distinct from $25
         and packaging_profile = $26
         and ($23 = 'prototype' or source_artifact_sha256 = $27)
         and (
           state not in ('distributed', 'failed', 'action_required')
           or state = $9
         )
         and case $9
           when 'dispatch_accepted' then 1
           when 'workflow_queued' then 2
           when 'build_in_progress' then 3
           when 'build_succeeded' then 4
           when 'submission_in_progress' then 5
           when 'distributed' then 6
           when 'failed' then 90
           when 'action_required' then 91
           else 0
         end >= case state
           when 'prepared' then 0
           when 'dispatch_accepted' then 1
           when 'workflow_queued' then 2
           when 'build_in_progress' then 3
           when 'build_succeeded' then 4
           when 'submission_in_progress' then 5
           when 'distributed' then 6
           when 'failed' then 90
           when 'action_required' then 91
           else 999
         end
       for update
     ), updated as (
       update store_release_jobs as release
       set state = $9,
           workflow_run_id = coalesce($8, release.workflow_run_id),
           provider_build_id = coalesce($10, release.provider_build_id),
           provider_submission_id = coalesce($11, release.provider_submission_id),
           provider_release_id = coalesce($12, release.provider_release_id),
           play_track = case when release.platform = 'android' and $9 = 'distributed'
             then 'internal' else release.play_track end,
           credential_evidence = $13::jsonb,
           provider_evidence = $14::jsonb,
           dispatched_at = case when $9 <> 'dispatch_accepted'
             then coalesce(release.dispatched_at, $15::timestamptz) else release.dispatched_at end,
           completed_at = case when $9 = 'distributed' then $15::timestamptz
             else release.completed_at end,
           last_polled_at = case when $16 = 'status' then $15::timestamptz
             else release.last_polled_at end,
           next_poll_at = $17::timestamptz,
           last_error_code = $18,
           last_error_message = $19,
           last_error_retryable = $20,
           updated_at = now()
       from current
       where release.id = current.id
       returning release.*
     ), deploy_updated as (
       update deploys as deploy
       set status = $9, provider_deploy_id = $7,
           log = $21, error_code = $18, error_message = $19,
           completed_at = case when $9 = 'distributed' then $15::timestamptz
             else deploy.completed_at end,
           updated_at = now()
       from updated
       where deploy.id = updated.deploy_id
       returning deploy.id
     ), event as (
       insert into store_release_events (
         release_id, event_key, from_state, to_state, source,
         provider_observed_at, evidence, error_code, error_message, retryable
       )
       select updated.id, $22, current.state, $9, 'runner', $15::timestamptz,
              $14::jsonb, $18, $19, $20
       from updated join current on current.id = updated.id
       on conflict (release_id, event_key) do nothing
     ), completed as (
       select complete_build_job_release($4, $5, updated.deploy_id)
       from updated
       where $9 = 'distributed' and updated.deploy_id is not null
         and not exists (
           select 1 from current where current.state = 'distributed'
         )
     )
     select updated.* from updated
     left join deploy_updated on true
     left join completed on true`,
    [
      input.releaseId,
      input.projectId,
      input.userId,
      input.buildJobId,
      input.artifactSha256,
      report.packageSha256,
      report.runnerJobId,
      report.workflowRunId,
      report.state,
      report.providerBuildId,
      report.providerSubmissionId,
      report.providerReleaseId,
      credentialsJson,
      reportJson,
      report.observedAt,
      report.action,
      nextPollAt,
      errorCode,
      errorMessage,
      errorRetryable,
      log,
      eventKey,
      descriptor.sourceBuildLevel,
      descriptor.sourceWorkspaceSha256,
      descriptor.packageManifestSha256,
      descriptor.packagingProfile,
      descriptor.sourcePreviewSha256,
    ],
  );
  if (!rows[0]) throw new StoreRunnerError("STORE_RELEASE_STATE_CONFLICT");
  return rows[0];
}

async function recordStoreRunnerFailure(input: {
  sql: Sql;
  releaseId: string;
  projectId: string;
  userId: string;
  expectedState: StoreReleaseRow["state"];
  error: unknown;
}): Promise<void> {
  const runnerError =
    input.error instanceof StoreRunnerError
      ? input.error
      : new StoreRunnerError("STORE_RUNNER_REQUEST_FAILED", true);
  const eventKey = `runner-error:${crypto.randomUUID()}`;
  const terminalLog = JSON.stringify([
    {
      id: "runner-verification",
      label: "Harbor · Store runner verification",
      status: "blocked",
      detail: `${runnerError.code}: provider state could not be verified; operator action is required`,
    },
  ] satisfies DeployStep[]);
  await input.sql.query(
    `with updated as (
       update store_release_jobs
       set retry_count = least(retry_count + 1, 20),
           state = case
             when not $4 or retry_count >= 4 then 'action_required'
             else state
           end,
           last_error_code = $5,
           last_error_message = $5,
           last_error_retryable = $4 and retry_count < 4,
           next_poll_at = case when $4 and retry_count < 4
             then now() + make_interval(secs => least(300, 15 * (retry_count + 1)))
             else null end,
           updated_at = now()
       where id = $1 and project_id = $2 and user_id = $3
         and state = $7
         and state not in ('distributed', 'failed', 'action_required')
       returning id, state, source_build_level, source_artifact_sha256,
                 source_workspace_sha256, package_manifest_sha256, packaging_profile
     ), deploy_updated as (
       update deploys
       set status = updated.state,
           log = case when updated.state = 'action_required' then $8 else deploys.log end,
           error_code = $5, error_message = $5, updated_at = now()
       from updated where deploys.id = (
         select deploy_id from store_release_jobs where id = updated.id
       )
     )
     insert into store_release_events (
       release_id, event_key, to_state, source, evidence,
       error_code, error_message, retryable
     )
     select updated.id, $6, updated.state, 'helix',
            jsonb_build_object(
              'sourceBuildLevel', updated.source_build_level,
              'sourcePreviewSha256', case when updated.source_build_level = 'production'
                then updated.source_artifact_sha256 else null end,
              'sourceWorkspaceSha256', updated.source_workspace_sha256,
              'packageManifestSha256', updated.package_manifest_sha256,
              'packagingProfile', updated.packaging_profile,
              'nativeImplementation', false
            ),
            $5, $5, $4
     from updated`,
    [
      input.releaseId,
      input.projectId,
      input.userId,
      runnerError.retryable,
      runnerError.code,
      eventKey,
      input.expectedState,
      terminalLog,
    ],
  );
}

export const getPublicApp = createServerFn({ method: "GET" })
  .validator((input: { slug: string; accessToken?: string; locale?: string }) => ({
    slug: input.slug.trim().slice(0, 64),
    accessToken: input.accessToken?.trim().slice(0, 128) || "",
    locale: normalizeLocale(input.locale),
  }))
  .handler(async ({ data }) => {
    await markResponsePrivate();
    // Built-in examples use a reserved namespace and never depend on a
    // database row. This keeps the showcase deterministic, localizable and
    // available even when the application database is offline.
    const builtIn = [...featuredFor(data.locale), ...archivedFor(data.locale)].find(
      (entry) => entry.id === data.slug,
    );
    if (builtIn) {
      return {
        slug: data.slug,
        title: builtIn.title,
        html: protectGeneratedHtml(featuredHtml(data.slug, data.locale)),
        isGuest: false,
        expiresAt: null,
        sourceArtifactSha256: null,
        servedSha256: null,
      };
    }
    await ensureSchema();
    await cleanupExpiredGuestPublishes();
    const sql = await getSql();
    const tokenHash = isOpaqueGuestToken(data.accessToken)
      ? await hashOpaqueToken(data.accessToken)
      : null;
    const rows = await sql<PublicAppRow>`
      select slug, title, html, visibility, expires_at, source_job_id,
             source_artifact_sha256, served_sha256,
             publication_integrity_version
      from public_apps
      where slug = ${data.slug}
        and (
          visibility <> 'guest'
          or (
            expires_at > now()
            and guest_token_hash = ${tokenHash}
          )
        )
    `;
    return rows[0] ? await toPublicApp(rows[0]) : null;
  });

export const getPublicByCode = createServerFn({ method: "GET" })
  .validator((code: string) => code.trim().toUpperCase().slice(0, 12))
  .handler(async ({ data: code }) => {
    await markResponsePrivate();
    await ensureSchema();
    await cleanupExpiredGuestPublishes();
    const sql = await getSql();
    const rows = await sql<PublicAppRow>`
      select slug, title, html, visibility, expires_at, source_job_id,
             source_artifact_sha256, served_sha256,
             publication_integrity_version
      from public_apps
      where testers_code = ${code} and visibility = 'public'
    `;
    return rows[0] ? await toPublicApp(rows[0]) : null;
  });

export const listDeploys = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((projectId: string) => projectId)
  .handler(async ({ context, data: projectId }) => {
    await ensureSchema();
    const sql = await getSql();
    const rows = await sql<DeployRow>`
      select deploy.id, deploy.project_id, deploy.user_id, deploy.target,
             deploy.status, deploy.slug, deploy.bundle_id, deploy.apple_team,
             deploy.version, deploy.testers_code, deploy.url, deploy.log,
             deploy.created_at, deploy.updated_at, deploy.build_job_id,
             deploy.provider, deploy.provider_deploy_id, deploy.artifact_ref,
             deploy.artifact_sha256, deploy.published_sha256,
             deploy.output_integrity_version, deploy.rollback_ref,
             deploy.release_key, deploy.completed_at, deploy.error_code,
             deploy.error_message, store.id as store_release_id,
             harbor.id as harbor_release_id, harbor.state as harbor_release_state
      from deploys as deploy
      left join store_release_jobs as store on store.deploy_id = deploy.id
      left join harbor_production_releases as harbor on harbor.deploy_id = deploy.id
      where deploy.project_id = ${projectId} and deploy.user_id = ${context.userId}
      order by deploy.created_at desc
    `;
    return rows.map(mapDeploy);
  });

export const publishWeb = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { projectId: string; jobId: string; requestId: string }) => ({
    projectId: input.projectId.trim().slice(0, 128),
    jobId: input.jobId.trim().slice(0, 128),
    requestId: normalizeGateRequestId(input.requestId),
  }))
  .handler(async ({ context, data }) => {
    const artifact = await getApprovedOwnedBuild({
      jobId: data.jobId,
      projectId: data.projectId,
      userId: context.userId,
    });
    assertHarborWebPublishable(artifact.buildLevel);
    await ensureSchema();
    const sql = await getSql();
    const releaseKey = `web:${data.jobId}:${data.requestId}`;
    const replay = await sql<{
      id: string;
      slug: string;
      url: string;
      testers_code: string;
      html: string;
      source_artifact_sha256: string | null;
      served_sha256: string | null;
      publication_integrity_version: number | null;
      artifact_sha256: string | null;
      published_sha256: string | null;
      output_integrity_version: number | null;
    }>`
      select deploy.id, deploy.slug, deploy.url, app.testers_code, app.html,
             app.source_artifact_sha256, app.served_sha256,
             app.publication_integrity_version, deploy.artifact_sha256,
             deploy.published_sha256, deploy.output_integrity_version
      from deploys as deploy
      join public_apps as app on app.slug = deploy.slug
      where deploy.release_key = ${releaseKey}
        and deploy.user_id = ${context.userId}
        and deploy.project_id = ${data.projectId}
        and deploy.status = 'deployed'
    `;
    if (replay[0]) {
      if (
        replay[0].output_integrity_version !== 1 ||
        replay[0].publication_integrity_version !== 1 ||
        replay[0].artifact_sha256 !== artifact.artifactSha256 ||
        replay[0].source_artifact_sha256 !== artifact.artifactSha256 ||
        replay[0].published_sha256 !== replay[0].served_sha256
      ) {
        throw new PublishedArtifactIntegrityError();
      }
      await assertPublishedUtf8({
        value: protectGeneratedHtml(replay[0].html),
        expectedSha256: replay[0].served_sha256,
      });
      return {
        slug: replay[0].slug,
        url: replay[0].url,
        testersCode: replay[0].testers_code,
        testersUrl: trackUrl(replay[0].testers_code),
        deployId: replay[0].id,
        sourceArtifactSha256: replay[0].artifact_sha256,
        publishedSha256: replay[0].published_sha256,
      };
    }
    const rows = await sql<{
      id: string;
      title: string;
      hosted: boolean | number;
    }>`
      select id, title, hosted from projects
      where id = ${data.projectId} and user_id = ${context.userId}
    `;
    if (!rows[0]) throw new HumanGateError("HUMAN_GATE_FORBIDDEN", 403);
    const project = rows[0];
    const existing = await sql<{ slug: string; testers_code: string | null }>`
      select slug, testers_code from public_apps where project_id = ${project.id}
    `;
    const slug = existing[0]?.slug ?? (await uniqueSlug(project.title));
    const code = existing[0]?.testers_code ?? testersCode();
    const html = protectGeneratedHtml(
      withPwa(artifact.html, artifact.title || project.title, slug),
    );
    const publishedSha256 = await sha256Utf8Hex(html);
    const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const id = crypto.randomUUID();
    let deployId: string = id;
    const url = appUrl(slug);
    const shouldCharge = !existing[0] && !project.hosted;
    const previous = await sql<{ id: string }>`
      select id
      from deploys
      where project_id = ${project.id}
        and user_id = ${context.userId}
        and target = 'web'
        and status = 'deployed'
      order by completed_at desc nulls last, created_at desc
      limit 1
    `;
    const rollbackRef = previous[0]?.id ?? null;
    try {
      const deployed = await sql<{ id: string }>`
        with gate as materialized (
          select job.id
          from build_jobs as job
          join projects as owned on owned.id = job.project_id
          where job.id = ${data.jobId}
            and job.project_id = ${project.id}
            and job.user_id = ${context.userId}
            and owned.user_id = ${context.userId}
            and owned.current_build_job_id = job.id
            and job.queue_status in ('approved', 'deployed')
            and job.artifact_sha256 = ${artifact.artifactSha256}
            and not exists (
              select 1
              from deploys as prior_release
              where prior_release.release_key = ${releaseKey}
                and (
                  prior_release.artifact_sha256 is distinct from ${artifact.artifactSha256}
                  or prior_release.published_sha256 is distinct from ${publishedSha256}
                )
            )
            and exists (
              select 1 from build_job_gate_events as event
              where event.job_id = job.id
                and event.decision = 'approve'
                and event.artifact_sha256 = job.artifact_sha256
            )
          for update of job
        ), credit as (
          select mutation.was_applied
          from gate
          cross join (select 1 where ${shouldCharge}) as charge_required
          cross join lateral apply_credit_entry(
            ${context.userId},
            ${-DEPLOY_COST.web},
            'host',
            ${project.id},
            'Web + TestTrack',
            ${initialWebHostingIdempotencyKey(project.id)}
          ) as mutation
        ),
        permitted as (
          select false as charge_applied
          from gate
          where not ${shouldCharge}
          union all
          select was_applied as charge_applied from credit
          limit 1
        ),
        published as (
          insert into public_apps (
            slug, title, html, testers_code, project_id, visibility,
            guest_token_hash, expires_at, content_bytes, source_job_id,
            source_artifact_sha256, served_sha256
          )
          select
            ${slug}, ${artifact.title || project.title}, ${html}, ${code}, ${project.id}, 'public',
            null, null, ${utf8ByteLength(html)}, ${data.jobId},
            ${artifact.artifactSha256}, ${publishedSha256}
          from permitted
          on conflict (slug) do update
            set html = excluded.html,
                title = excluded.title,
                visibility = 'public',
                guest_token_hash = null,
                expires_at = null,
                content_bytes = excluded.content_bytes,
                source_job_id = excluded.source_job_id,
                source_artifact_sha256 = excluded.source_artifact_sha256,
                served_sha256 = excluded.served_sha256,
                publication_integrity_version = excluded.publication_integrity_version,
                updated_at = now()
          returning slug, served_sha256
        ),
        hosted as (
          update projects
          set hosted = true,
              hosted_until = ${until},
              html = ${html},
              credits_spent = credits_spent
                + case when permitted.charge_applied then ${DEPLOY_COST.web} else 0 end,
              updated_at = now()
          from published, permitted
          where projects.id = ${project.id}
            and projects.user_id = ${context.userId}
          returning projects.id, published.served_sha256
        ),
        release as (
          insert into deploys (
            id, project_id, user_id, target, status, slug, testers_code, url, log,
            build_job_id, provider, provider_deploy_id, artifact_ref,
            artifact_sha256, published_sha256, rollback_ref, release_key,
            completed_at
          )
          select
            ${id}, hosted.id, ${context.userId}, 'web', 'deployed', ${slug}, ${code}, ${url},
            ${JSON.stringify(harborWeb())}, ${data.jobId}, 'kreluna-public-apps', ${id},
            ${`build-job:${data.jobId}`}, ${artifact.artifactSha256},
            hosted.served_sha256, ${rollbackRef},
            ${releaseKey}, now()
          from hosted
          on conflict (release_key) where release_key is not null
          do update set updated_at = deploys.updated_at
          where deploys.artifact_sha256 = excluded.artifact_sha256
            and deploys.published_sha256 = excluded.published_sha256
          returning id
        ), completed as (
          select completed.release_id as id
          from release
          cross join lateral complete_build_job_release(
            ${data.jobId}, ${artifact.artifactSha256}, release.id
          ) as completed
        )
        select id from completed
      `;
      if (!deployed[0]) throw new Error("Web publish did not commit");
      deployId = deployed[0].id;
    } catch (error) {
      rethrowCreditMutationError(error);
    }
    return {
      slug,
      url,
      testersCode: code,
      testersUrl: trackUrl(code),
      deployId,
      sourceArtifactSha256: artifact.artifactSha256,
      publishedSha256,
    };
  });

export const getHarborProductionReadiness = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<HarborProductionReadiness> => harborProductionReadiness());

export const publishProductionWeb = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { projectId: string; jobId: string; requestId: string }) => ({
    projectId: input.projectId.trim().slice(0, 128),
    jobId: input.jobId.trim().slice(0, 128),
    requestId: normalizeGateRequestId(input.requestId),
  }))
  .handler(async ({ context, data }) => {
    // Configuration is checked before any durable release or debit. Production
    // never falls back to the Prototype HTML publisher.
    assertHarborProductionPublishingConfigured();
    const provider = createAuthenticatedHarborProductionProvider();
    const approved = await getApprovedOwnedBuild({
      jobId: data.jobId,
      projectId: data.projectId,
      userId: context.userId,
    });
    if (approved.buildLevel !== "production" || !approved.workspace) {
      throw new HarborProductionRunnerError("HARBOR_PRODUCTION_ARTIFACT_REQUIRED");
    }
    const artifact = await createHarborProductionArtifact({
      buildJobId: data.jobId,
      projectId: data.projectId,
      humanGateArtifactSha256: approved.artifactSha256,
      files: approved.files,
      workspace: approved.workspace,
    });
    await ensureSchema();
    const sql = await getSql();
    let release = await prepareHarborProductionRelease({
      sql,
      releaseId: crypto.randomUUID(),
      requestId: data.requestId,
      projectId: data.projectId,
      buildJobId: data.jobId,
      userId: context.userId,
      artifact,
    });
    if (release.state === "prepared") {
      try {
        release = await acceptHarborProductionRelease({
          sql,
          row: release,
          artifact,
          provider,
          creditCost: DEPLOY_COST.web,
        });
      } catch (error) {
        rethrowCreditMutationError(error);
        throw error;
      }
    }
    // Keep the synchronous function to one bounded runner call. Activation and
    // reconciliation use the durable release through the refresh endpoint.
    return harborProductionReleaseResult(release);
  });

export const refreshProductionWebRelease = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { projectId: string; releaseId: string }) => ({
    projectId: input.projectId.trim().slice(0, 128),
    releaseId: input.releaseId.trim().slice(0, 128),
  }))
  .handler(async ({ context, data }) => {
    const provider = createAuthenticatedHarborProductionProvider();
    await ensureSchema();
    const sql = await getSql();
    const release = await loadHarborProductionRelease({
      sql,
      releaseId: data.releaseId,
      projectId: data.projectId,
      userId: context.userId,
    });
    if (!release) throw new HumanGateError("HUMAN_GATE_FORBIDDEN", 403);
    const updated = await advanceHarborProductionRelease({ sql, row: release, provider });
    return harborProductionReleaseResult(updated);
  });

export const resumeProductionWebRelease = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { projectId: string; releaseId: string; requestId: string }) => ({
    projectId: input.projectId.trim().slice(0, 128),
    releaseId: input.releaseId.trim().slice(0, 128),
    requestId: normalizeGateRequestId(input.requestId),
  }))
  .handler(async ({ context, data }) => {
    const provider = createAuthenticatedHarborProductionProvider();
    await ensureSchema();
    const sql = await getSql();
    const release = await loadHarborProductionRelease({
      sql,
      releaseId: data.releaseId,
      projectId: data.projectId,
      userId: context.userId,
    });
    if (!release) throw new HumanGateError("HUMAN_GATE_FORBIDDEN", 403);
    const updated = await resumeHarborProductionRelease({
      sql,
      row: release,
      provider,
      requestId: data.requestId,
    });
    return harborProductionReleaseResult(updated);
  });

export const publishGuest = createServerFn({ method: "POST" })
  .validator((input: { jobId: string; guestAccessToken: string; requestId: string }) => ({
    jobId: input.jobId.trim().slice(0, 128),
    guestAccessToken: input.guestAccessToken.trim().slice(0, 128),
    requestId: normalizeGateRequestId(input.requestId),
  }))
  .handler(async ({ data }) => {
    await markResponsePrivate();
    const artifact = await getApprovedGuestBuild(data);
    const accessToken = await hashOpaqueToken(
      `helix-guest-publish-v1\u0000${data.guestAccessToken}\u0000${data.jobId}`,
    );
    const tokenHash = await hashOpaqueToken(accessToken);
    const slugHash = await hashOpaqueToken(`helix-guest-slug-v1\u0000${accessToken}`);
    const slug = `g-${slugHash.slice(0, 40)}`;
    const expiresAt = new Date(Date.now() + GUEST_PUBLISH_TTL_MS).toISOString();
    const releaseKey = `guest-preview:${data.jobId}`;
    const html = protectGeneratedHtml(withPwa(artifact.html, artifact.title, slug), {
      noIndex: true,
    });
    const publishedSha256 = await sha256Utf8Hex(html);
    const sql = await getSql();
    const existing = await sql<{
      slug: string;
      expires_at: string;
      html: string;
      source_artifact_sha256: string | null;
      served_sha256: string | null;
      publication_integrity_version: number | null;
      artifact_sha256: string | null;
      published_sha256: string | null;
      output_integrity_version: number | null;
    }>`
      select app.slug, app.expires_at, app.html,
             app.source_artifact_sha256, app.served_sha256,
             app.publication_integrity_version, deploy.artifact_sha256,
             deploy.published_sha256, deploy.output_integrity_version
      from public_apps as app
      join deploys as deploy on deploy.release_key = ${releaseKey}
      where app.source_job_id = ${data.jobId}
        and app.visibility = 'guest'
        and app.expires_at > now()
    `;
    if (existing[0]) {
      if (
        existing[0].output_integrity_version !== 1 ||
        existing[0].publication_integrity_version !== 1 ||
        existing[0].artifact_sha256 !== artifact.artifactSha256 ||
        existing[0].source_artifact_sha256 !== artifact.artifactSha256 ||
        existing[0].published_sha256 !== existing[0].served_sha256 ||
        existing[0].published_sha256 !== publishedSha256
      ) {
        throw new PublishedArtifactIntegrityError();
      }
      await assertPublishedUtf8({
        value: protectGeneratedHtml(existing[0].html, { noIndex: true }),
        expectedSha256: existing[0].served_sha256,
      });
      const url = appUrl(existing[0].slug, accessToken);
      return {
        slug: existing[0].slug,
        url,
        accessToken,
        testersCode: accessToken,
        testersUrl: url,
        expiresAt: String(existing[0].expires_at),
        sourceArtifactSha256: existing[0].artifact_sha256,
        publishedSha256: existing[0].published_sha256,
      };
    }
    const { GUEST_PUBLISH_BUDGET, releaseGuestBudget, reserveGuestBudget } =
      await import("@/lib/server/guest-abuse.server");
    const lease = await reserveGuestBudget(GUEST_PUBLISH_BUDGET, {
      inputBytes: utf8ByteLength(artifact.html),
    });
    try {
      await cleanupExpiredGuestPublishes();
      const id = crypto.randomUUID();
      const url = appUrl(slug, accessToken);
      const privateAuditUrl = appUrl(slug);
      const guestLog: DeployStep[] = [
        {
          id: "gate",
          label: "Human Gate",
          status: "done",
          detail: "Guest capability and approved artifact hash verified",
        },
        {
          id: "temporary",
          label: "Harbor · temporary guest preview",
          status: "done",
          detail: `Expires ${expiresAt}`,
        },
      ];
      const buildTokenHash = await hashGuestBuildToken(data.guestAccessToken);
      const deployed = await sql<{ id: string }>`
        with gate as materialized (
          select job.id
          from build_jobs as job
          where job.id = ${data.jobId}
            and job.user_id is null
            and job.project_id is null
            and job.guest_access_token_hash = ${buildTokenHash}
            and job.guest_access_expires_at > now()
            and job.queue_status in ('approved', 'deployed')
            and job.artifact_sha256 = ${artifact.artifactSha256}
            and not exists (
              select 1
              from deploys as prior_release
              where prior_release.release_key = ${releaseKey}
                and (
                  prior_release.artifact_sha256 is distinct from ${artifact.artifactSha256}
                  or prior_release.published_sha256 is distinct from ${publishedSha256}
                )
            )
            and exists (
              select 1 from build_job_gate_events as event
              where event.job_id = job.id
                and event.decision = 'approve'
                and event.artifact_sha256 = job.artifact_sha256
            )
          for update
        ), published as (
          insert into public_apps (
            slug, title, html, testers_code, project_id, visibility,
            guest_token_hash, expires_at, content_bytes, source_job_id,
            source_artifact_sha256, served_sha256
          )
          select
            ${slug}, ${artifact.title}, ${html}, null, null, 'guest',
            ${tokenHash}, ${expiresAt}, ${utf8ByteLength(html)}, ${data.jobId},
            ${artifact.artifactSha256}, ${publishedSha256}
          from gate
          on conflict (source_job_id) where source_job_id is not null
          do update set
            title = excluded.title,
            html = excluded.html,
            guest_token_hash = excluded.guest_token_hash,
            expires_at = excluded.expires_at,
            content_bytes = excluded.content_bytes,
            source_artifact_sha256 = excluded.source_artifact_sha256,
            served_sha256 = excluded.served_sha256,
            publication_integrity_version = excluded.publication_integrity_version,
            updated_at = now()
          returning slug, served_sha256
        ), release as (
          insert into deploys (
            id, target, status, slug, testers_code, url, log,
            build_job_id, provider, provider_deploy_id, artifact_ref,
            artifact_sha256, published_sha256, release_key, completed_at
          )
          select
            ${id}, 'web', 'deployed', published.slug, null, ${privateAuditUrl},
            ${JSON.stringify(guestLog)}, ${data.jobId},
            'kreluna-temporary-preview', ${id}, ${`build-job:${data.jobId}`},
            ${artifact.artifactSha256}, published.served_sha256,
            ${releaseKey}, now()
          from published
          on conflict (release_key) where release_key is not null
          do update set updated_at = deploys.updated_at
          where deploys.artifact_sha256 = excluded.artifact_sha256
            and deploys.published_sha256 = excluded.published_sha256
          returning id
        ), completed as (
          select completed.release_id as id
          from release
          cross join lateral complete_build_job_release(
            ${data.jobId}, ${artifact.artifactSha256}, release.id
          ) as completed
        )
        select id from completed
      `;
      if (!deployed[0]) throw new HumanGateError("HUMAN_GATE_CLOSED");
      return {
        slug,
        url,
        accessToken,
        testersCode: accessToken,
        testersUrl: url,
        expiresAt,
        sourceArtifactSha256: artifact.artifactSha256,
        publishedSha256,
      };
    } finally {
      try {
        await releaseGuestBudget(lease);
      } catch (error) {
        console.error("[guest-publish] failed to release concurrency lease", {
          error: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }
  });

export const getStoreReadiness = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((target: "ios" | "android") => target)
  .handler(async ({ data: target }) => storeReadiness(target));

async function advanceStoreRelease(input: {
  sql: Sql;
  row: StoreReleaseRow;
  identity: StoreIdentity;
  userId: string;
}): Promise<StoreReleaseRow> {
  if (["distributed", "failed", "action_required"].includes(input.row.state)) return input.row;
  const action = input.row.state === "dispatch_accepted" ? "activate" : "status";
  try {
    const report = await callStoreRunner({
      action,
      releaseId: input.row.id,
      idempotencyKey: input.row.idempotency_key,
      packageSha256: input.row.package_sha256,
      identity: input.identity,
      artifactDescriptor: storeArtifactDescriptorFromRow(input.row),
      sourcePackage: null,
    });
    return await persistStoreRunnerReport({
      sql: input.sql,
      report,
      releaseId: input.row.id,
      projectId: input.row.project_id,
      userId: input.userId,
      buildJobId: input.row.build_job_id,
      artifactSha256: input.row.source_artifact_sha256,
      target: input.row.platform,
    });
  } catch (error) {
    await recordStoreRunnerFailure({
      sql: input.sql,
      releaseId: input.row.id,
      projectId: input.row.project_id,
      userId: input.userId,
      expectedState: input.row.state,
      error,
    });
    const refreshed = await input.sql.query<StoreReleaseRow>(
      `select * from store_release_jobs where id = $1 and user_id = $2`,
      [input.row.id, input.userId],
    );
    return refreshed[0] ?? input.row;
  }
}

export const shipStore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      projectId: string;
      jobId: string;
      target: "ios" | "android";
      appleTeam?: string;
      bundleId: string;
      easProjectId: string;
      requestId: string;
      confirmSubmission: boolean;
    }) => ({
      projectId: input.projectId.trim().slice(0, 128),
      jobId: input.jobId.trim().slice(0, 128),
      target: input.target,
      appleTeam: input.appleTeam?.trim().toUpperCase().slice(0, 10) || "",
      bundleId: input.bundleId.trim().slice(0, 160),
      easProjectId: input.easProjectId.trim().slice(0, 64),
      requestId: normalizeGateRequestId(input.requestId),
      confirmSubmission: input.confirmSubmission === true,
    }),
  )
  .handler(async ({ context, data }) => {
    if (!data.confirmSubmission) {
      throw new StoreRunnerError("STORE_SUBMISSION_CONFIRMATION_REQUIRED");
    }
    const artifact = await getApprovedOwnedBuild({
      jobId: data.jobId,
      projectId: data.projectId,
      userId: context.userId,
    });
    const title = artifact.title || "App";
    const slug = slugify(title);
    const identity = StoreIdentitySchema.parse({
      platform: data.target,
      appIdentifier: data.bundleId,
      easProjectId: data.easProjectId,
      version: "1.0.0",
      appleTeamId: data.target === "ios" ? data.appleTeam : null,
      destination: data.target === "ios" ? "testflight" : "play_internal",
    });
    const productionPackage =
      artifact.buildLevel === "production"
        ? await prepareApprovedProductionStorePackage({
            source: approvedProductionStoreSource(artifact),
            identity,
            title,
            slug,
            liveUrl: appUrl(slug),
          })
        : null;
    const files =
      productionPackage?.files ??
      expoFiles({
        title,
        slug,
        html: artifact.html,
        bundleId: data.bundleId,
        easProjectId: data.easProjectId,
        appleTeam: data.target === "ios" ? data.appleTeam : undefined,
        liveUrl: appUrl(slug),
        platform: data.target,
      });
    const artifactDescriptor: StoreArtifactDescriptor =
      productionPackage?.descriptor ?? LEGACY_PROTOTYPE_STORE_ARTIFACT_DESCRIPTOR;
    if (!storeReadiness(data.target).runnerConfigured) {
      throw new StoreRunnerError("STORE_RUNNER_UNCONFIGURED");
    }
    await ensureSchema();
    const sql = await getSql();
    const projects = await sql<{ id: string }>`
      select id from projects
      where id = ${data.projectId} and user_id = ${context.userId}
    `;
    if (!projects[0]) throw new HumanGateError("HUMAN_GATE_FORBIDDEN", 403);
    const project = projects[0];
    const zip = zipFiles(files);
    const packageSha256 = await sha256BytesHex(zip);
    const packageKind =
      artifactDescriptor.sourceBuildLevel === "production" ? "production-wrapper" : "source";
    const packageFilename = `${slug}-${data.target}-${packageKind}.zip`;
    const releaseIdentitySha256 = await sha256Utf8Hex(
      JSON.stringify({
        schemaVersion: "2.0.0",
        jobId: data.jobId,
        sourceArtifactSha256: artifact.artifactSha256,
        packageSha256,
        identity,
        artifactDescriptor,
      }),
    );
    const legacyReleaseIdentitySha256 =
      artifactDescriptor.sourceBuildLevel === "prototype"
        ? await sha256Utf8Hex(
            JSON.stringify({
              version: identity.version,
              jobId: data.jobId,
              target: data.target,
              appIdentifier: identity.appIdentifier,
              easProjectId: identity.easProjectId,
            }),
          )
        : null;
    // The release identity, not a browser-generated retry nonce, is the
    // provider/debit idempotency boundary. A lost HTTP response can therefore
    // be retried without creating another workflow or charging twice.
    const idempotencyKey = `store-release:v2:${releaseIdentitySha256}`;
    const legacyIdempotencyKey = legacyReleaseIdentitySha256
      ? `store-release:v1:${legacyReleaseIdentitySha256}`
      : null;
    const candidateReleaseId = crypto.randomUUID();
    const preparedRows = await sql.query<StoreReleaseRow>(
      `with gate as materialized (
         select job.id
         from build_jobs as job
         join projects as owned on owned.id = job.project_id
         where job.id = $1 and job.project_id = $2 and job.user_id = $3
           and owned.user_id = $3 and owned.current_build_job_id = job.id
           and job.queue_status in ('approved', 'deployed')
           and job.artifact_sha256 = $4
           and exists (
             select 1 from build_job_gate_events as event
             where event.job_id = job.id and event.decision = 'approve'
               and event.artifact_sha256 = job.artifact_sha256
           )
         for update of job
       ), legacy as materialized (
         select release.*
         from store_release_jobs as release
         join gate on gate.id = release.build_job_id
         where $21::text is not null and release.idempotency_key = $21::text
           and release.project_id = $2 and release.user_id = $3
           and release.platform = $6 and release.destination = $7
           and release.source_artifact_sha256 = $4
           and release.package_sha256 = $10
           and release.package_bytes = $11
           and release.package_filename = $12
           and release.app_identifier = $13
           and release.eas_project_id = $14
           and release.apple_team_id is not distinct from $15
           and release.source_build_level = 'prototype'
           and release.source_workspace_sha256 is null
           and release.package_manifest_sha256 is null
           and release.packaging_profile = 'legacy_expo_wrapper_v1'
         for update of release
       ), prepared as (
         insert into store_release_jobs (
           id, project_id, build_job_id, user_id, platform, destination,
           request_id, idempotency_key, source_artifact_sha256, package_sha256,
           package_bytes, package_filename, app_identifier, eas_project_id,
           apple_team_id, play_track, source_build_level,
           source_workspace_sha256, package_manifest_sha256, packaging_profile, state
         )
         select $5, $2, gate.id, $3, $6, $7, $8, $9, $4, $10,
                $11, $12, $13, $14, $15, null, $16, $17, $18, $19, 'prepared'
         from gate
         where not exists (select 1 from legacy)
         on conflict (idempotency_key) do update
           set updated_at = store_release_jobs.updated_at
         where store_release_jobs.project_id = excluded.project_id
           and store_release_jobs.build_job_id = excluded.build_job_id
           and store_release_jobs.user_id = excluded.user_id
           and store_release_jobs.platform = excluded.platform
           and store_release_jobs.destination = excluded.destination
           and store_release_jobs.source_artifact_sha256 = excluded.source_artifact_sha256
           and store_release_jobs.package_sha256 = excluded.package_sha256
           and store_release_jobs.app_identifier = excluded.app_identifier
           and store_release_jobs.eas_project_id = excluded.eas_project_id
           and store_release_jobs.apple_team_id is not distinct from excluded.apple_team_id
           and store_release_jobs.source_build_level = excluded.source_build_level
           and store_release_jobs.source_workspace_sha256
             is not distinct from excluded.source_workspace_sha256
           and store_release_jobs.package_manifest_sha256
             is not distinct from excluded.package_manifest_sha256
           and store_release_jobs.packaging_profile = excluded.packaging_profile
         returning *
       ), event as (
         insert into store_release_events (
           release_id, event_key, from_state, to_state, source, evidence
         )
         select prepared.id, 'prepared:' || prepared.package_sha256,
                null, 'prepared', 'helix',
                jsonb_build_object('packageSha256', prepared.package_sha256,
                                   'packageBytes', prepared.package_bytes,
                                   'artifactDescriptor', $20::jsonb,
                                   'sourceBuildLevel', prepared.source_build_level,
                                   'sourceWorkspaceSha256', prepared.source_workspace_sha256,
                                   'packageManifestSha256', prepared.package_manifest_sha256,
                                   'packagingProfile', prepared.packaging_profile,
                                   'nativeImplementation', false)
         from prepared
         on conflict (release_id, event_key) do nothing
       )
       select * from legacy
       union all
       select * from prepared`,
      [
        data.jobId,
        project.id,
        context.userId,
        artifact.artifactSha256,
        candidateReleaseId,
        data.target,
        identity.destination,
        data.requestId,
        idempotencyKey,
        packageSha256,
        zip.byteLength,
        packageFilename,
        identity.appIdentifier,
        identity.easProjectId,
        identity.appleTeamId,
        artifactDescriptor.sourceBuildLevel,
        artifactDescriptor.sourceWorkspaceSha256,
        artifactDescriptor.packageManifestSha256,
        artifactDescriptor.packagingProfile,
        JSON.stringify(artifactDescriptor),
        legacyIdempotencyKey,
      ],
    );
    let release = preparedRows[0];
    if (!release) throw new StoreRunnerError("STORE_RELEASE_IDEMPOTENCY_CONFLICT");

    if (release.state !== "prepared") {
      release = await advanceStoreRelease({ sql, row: release, identity, userId: context.userId });
      return storeReleaseResult(release);
    }

    const accepted = await callStoreRunner({
      action: "accept",
      releaseId: release.id,
      idempotencyKey: release.idempotency_key,
      packageSha256,
      identity,
      artifactDescriptor,
      sourcePackage: {
        filename: packageFilename,
        sha256: packageSha256,
        byteLength: zip.byteLength,
        base64: toBase64(zip),
      },
    });
    const deployId = crypto.randomUUID();
    const acceptedLog = JSON.stringify(harborStore(data.target, accepted));
    const acceptedReport = JSON.stringify(accepted);
    const acceptedCredentials = JSON.stringify(accepted.credentialEvidence);
    try {
      const committed = await sql.query<StoreReleaseRow>(
        `with gate as materialized (
           select release.id
           from store_release_jobs as release
           join build_jobs as job on job.id = release.build_job_id
           join projects as owned on owned.id = release.project_id
           where release.id = $1 and release.project_id = $2 and release.user_id = $3
             and release.state = 'prepared' and release.build_job_id = $4
             and release.source_artifact_sha256 = $5 and release.package_sha256 = $6
             and release.source_build_level = $24
             and release.source_workspace_sha256 is not distinct from $25
             and release.package_manifest_sha256 is not distinct from $26
             and release.packaging_profile = $27
             and ($24 = 'prototype' or release.source_artifact_sha256 = $28)
             and owned.user_id = $3 and owned.current_build_job_id = job.id
             and job.queue_status in ('approved', 'deployed')
             and job.artifact_sha256 = $5
             and exists (
               select 1 from build_job_gate_events as event
               where event.job_id = job.id and event.decision = 'approve'
                 and event.artifact_sha256 = job.artifact_sha256
             )
           for update of release, job
         ), credit as materialized (
           select gate.id, mutation.was_applied
           from gate
           cross join lateral apply_credit_entry(
             $3, $7, $8, $2, $9, $10
           ) as mutation
         ), project_cost as (
           update projects
           set credits_spent = credits_spent
                 + case when credit.was_applied then $11 else 0 end,
               updated_at = now()
           from credit
           where projects.id = $2 and projects.user_id = $3
           returning projects.id
         ), deployed as (
           insert into deploys (
             id, project_id, user_id, target, status, slug, bundle_id, apple_team,
             testers_code, url, log, build_job_id, provider, provider_deploy_id,
             artifact_ref, artifact_sha256, published_sha256, release_key
           )
           select $12, project_cost.id, $3, $8, 'dispatch_accepted', $13, $14, $15,
                  null, null, $16, $4, 'eas-workflows', $17,
                  $18, $5, $6, $10
           from project_cost
           on conflict (release_key) where release_key is not null do update
             set updated_at = deploys.updated_at
           where deploys.artifact_sha256 = excluded.artifact_sha256
             and deploys.published_sha256 = excluded.published_sha256
             and deploys.provider_deploy_id = excluded.provider_deploy_id
           returning id
         ), updated as (
           update store_release_jobs as release
           set deploy_id = deployed.id, state = 'dispatch_accepted',
               runner_job_id = $17, credential_evidence = $19::jsonb,
               provider_evidence = $20::jsonb, accepted_at = $21::timestamptz,
               next_poll_at = now(), last_error_code = null,
               last_error_message = null, last_error_retryable = null,
               updated_at = now()
           from deployed
           where release.id = $1
           returning release.*
         ), event as (
           insert into store_release_events (
             release_id, event_key, from_state, to_state, source,
             provider_observed_at, evidence
           )
           select updated.id, $22, 'prepared', 'dispatch_accepted', 'runner',
                  $23::timestamptz, $20::jsonb
           from updated
           on conflict (release_id, event_key) do nothing
         )
         select * from updated`,
        [
          release.id,
          project.id,
          context.userId,
          data.jobId,
          artifact.artifactSha256,
          packageSha256,
          -DEPLOY_COST[data.target],
          data.target,
          data.target === "ios"
            ? "iOS TestFlight workflow dispatch"
            : "Android Play workflow dispatch",
          release.idempotency_key,
          DEPLOY_COST[data.target],
          deployId,
          slug,
          data.bundleId,
          identity.appleTeamId,
          acceptedLog,
          accepted.runnerJobId,
          `runner:${accepted.runnerJobId}:sha256:${packageSha256}`,
          acceptedCredentials,
          acceptedReport,
          accepted.acceptedAt,
          storeReportEventKey(accepted),
          accepted.observedAt,
          accepted.artifactDescriptor.sourceBuildLevel,
          accepted.artifactDescriptor.sourceWorkspaceSha256,
          accepted.artifactDescriptor.packageManifestSha256,
          accepted.artifactDescriptor.packagingProfile,
          accepted.artifactDescriptor.sourcePreviewSha256,
        ],
      );
      if (!committed[0]) throw new StoreRunnerError("STORE_RELEASE_ACCEPT_COMMIT_FAILED");
      release = committed[0];
    } catch (error) {
      rethrowCreditMutationError(error);
    }

    release = await advanceStoreRelease({ sql, row: release, identity, userId: context.userId });
    return storeReleaseResult(release);
  });

export const refreshStoreSubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { projectId: string; releaseId: string }) => ({
    projectId: input.projectId.trim().slice(0, 128),
    releaseId: input.releaseId.trim().slice(0, 128),
  }))
  .handler(async ({ context, data }) => {
    await ensureSchema();
    const sql = await getSql();
    const rows = await sql.query<StoreReleaseRow>(
      `select * from store_release_jobs
       where id = $1 and project_id = $2 and user_id = $3`,
      [data.releaseId, data.projectId, context.userId],
    );
    const release = rows[0];
    if (!release) throw new HumanGateError("HUMAN_GATE_FORBIDDEN", 403);
    if (release.state === "prepared") {
      throw new StoreRunnerError("STORE_RELEASE_NOT_ACCEPTED");
    }
    const identity: StoreIdentity = {
      platform: release.platform,
      appIdentifier: release.app_identifier,
      easProjectId: release.eas_project_id,
      version: "1.0.0",
      appleTeamId: release.apple_team_id,
      destination: release.destination,
    };
    const updated = await advanceStoreRelease({
      sql,
      row: release,
      identity,
      userId: context.userId,
    });
    return storeReleaseResult(updated);
  });

export const downloadNativePack = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      projectId: string;
      jobId: string;
      target: "ios" | "android" | "windows";
      appleTeam?: string;
      bundleId?: string;
      easProjectId?: string;
    }) => ({
      projectId: input.projectId.trim().slice(0, 128),
      jobId: input.jobId.trim().slice(0, 128),
      target: input.target,
      appleTeam: input.appleTeam?.trim().toUpperCase().slice(0, 10) || "",
      bundleId: input.bundleId?.trim().slice(0, 160) || "",
      easProjectId: input.easProjectId?.trim().slice(0, 64) || "",
    }),
  )
  .handler(async ({ context, data }) => {
    const artifact = await getApprovedOwnedBuild({
      jobId: data.jobId,
      projectId: data.projectId,
      userId: context.userId,
    });
    const title = artifact.title || "App";
    const slug = slugify(title);
    const bundleId = data.bundleId || bundleIdFromTitle(title);
    const liveUrl = appUrl(slug);
    if (data.target === "windows") {
      const files = windowsFiles({ title, slug, html: artifact.html, liveUrl });
      const zip = zipFiles(files);
      const publishedSha256 = await sha256BytesHex(zip);
      return {
        filename: `${slug}-${data.target}-source.zip`,
        base64: toBase64(zip),
        status: "source_package_prepared" as const,
        submissionStatus: "not_executed" as const,
        sourceArtifactSha256: artifact.artifactSha256,
        publishedSha256,
      };
    }
    const productionPackage =
      artifact.buildLevel === "production"
        ? await prepareApprovedProductionStorePackage({
            source: approvedProductionStoreSource(artifact),
            identity: StoreIdentitySchema.parse({
              platform: data.target,
              appIdentifier: bundleId,
              easProjectId: data.easProjectId,
              version: "1.0.0",
              appleTeamId: data.target === "ios" ? data.appleTeam : null,
              destination: data.target === "ios" ? "testflight" : "play_internal",
            }),
            title,
            slug,
            liveUrl,
          })
        : null;
    const files =
      productionPackage?.files ??
      expoFiles({
        title,
        slug,
        html: artifact.html,
        bundleId,
        easProjectId: data.easProjectId || undefined,
        appleTeam: data.appleTeam,
        liveUrl,
        platform: data.target,
      });
    const artifactDescriptor: StoreArtifactDescriptor =
      productionPackage?.descriptor ?? LEGACY_PROTOTYPE_STORE_ARTIFACT_DESCRIPTOR;
    const zip = zipFiles(files);
    const publishedSha256 = await sha256BytesHex(zip);
    const packageKind =
      artifactDescriptor.sourceBuildLevel === "production" ? "production-wrapper" : "source";
    return {
      filename: `${slug}-${data.target}-${packageKind}.zip`,
      base64: toBase64(zip),
      status: "source_package_prepared" as const,
      submissionStatus: "not_executed" as const,
      sourceArtifactSha256: artifact.artifactSha256,
      publishedSha256,
      sourceBuildLevel: artifactDescriptor.sourceBuildLevel,
      sourceWorkspaceSha256: artifactDescriptor.sourceWorkspaceSha256,
      packageManifestSha256: artifactDescriptor.packageManifestSha256,
      packagingProfile: artifactDescriptor.packagingProfile,
      artifactKind: artifactDescriptor.artifactKind,
      nativeImplementation: artifactDescriptor.nativeImplementation,
      runtimeProfile: artifactDescriptor.runtimeProfile,
      artifactDescriptor,
    };
  });
