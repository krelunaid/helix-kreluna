import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import type { BuildJob } from "@/lib/agent-types";
import {
  AugurCapacityEvidenceBodySchema,
  AugurCapacityEvidenceSchema,
  computeCapacityForecast,
  sealCapacityEvidence,
  type CapacityForecast,
} from "@/lib/capacity-evidence";
import { getSql, type Sql } from "@/lib/db";
import { computeScore } from "@/lib/score";
import { HELIX_PIPELINE_VERSION } from "@/lib/server/jobs/pipeline";
import { sha256Json } from "@/lib/server/operations/types";

const SHA256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const UUIDSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const IdentifierSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/);
const HTTPS_OR_LOOPBACK_URL = z.string().url().superRefine((value, context) => {
  const url = new URL(value);
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    context.addIssue({
      code: "custom",
      message:
        "Augur evidence URL must be HTTPS (or loopback HTTP) without credentials/query/fragment",
    });
  }
});

export const AugurEvidenceRequestSchema = z
  .object({
    kind: z.literal("augur_capacity_evidence_request"),
    version: z.literal("1.0.0"),
    requestId: UUIDSchema,
    requestNonce: UUIDSchema,
    jobId: z.string().min(8).max(128),
    projectId: z.string().min(1).max(128),
    artifactSha256: SHA256Schema,
    deployId: z.string().min(1).max(160),
    deploySha256: SHA256Schema,
    requiredProfiles: z.tuple([
      z.literal("storm"),
      z.literal("database"),
      z.literal("topology"),
      z.literal("cost"),
      z.literal("concurrency"),
    ]),
  })
  .strict();

export const AugurEvidenceDeliveryPayloadSchema = z
  .object({
    kind: z.literal("augur_capacity_evidence_delivery"),
    version: z.literal("1.0.0"),
    sourceId: IdentifierSchema,
    keyId: IdentifierSchema,
    observedAt: z.string().datetime(),
    requestId: UUIDSchema,
    requestNonce: UUIDSchema,
    jobId: z.string().min(8).max(128),
    projectId: z.string().min(1).max(128),
    artifactSha256: SHA256Schema,
    deployId: z.string().min(1).max(160),
    deploySha256: SHA256Schema,
    evidence: AugurCapacityEvidenceBodySchema,
  })
  .strict();

export const AugurEvidenceDeliveryEnvelopeSchema = z
  .object({
    payload: AugurEvidenceDeliveryPayloadSchema,
    authentication: z
      .object({
        scheme: z.literal("hmac_sha256"),
        signature: SHA256Schema,
      })
      .strict(),
  })
  .strict();

export const AugurEvidenceSourceConfigurationSchema = z
  .object({
    url: HTTPS_OR_LOOPBACK_URL,
    bearerToken: z.string().min(32).max(4_096),
    expectedSourceId: IdentifierSchema,
    expectedKeyId: IdentifierSchema,
    hmacSecret: z.string().min(32).max(4_096),
    maxEvidenceAgeMs: z.number().int().positive().max(30 * 24 * 60 * 60 * 1_000),
    requestTimeoutMs: z.number().int().positive().max(30_000),
  })
  .strict();

export type AugurEvidenceDeliveryEnvelope = z.infer<
  typeof AugurEvidenceDeliveryEnvelopeSchema
>;
export type AugurEvidenceSourceConfiguration = z.infer<
  typeof AugurEvidenceSourceConfigurationSchema
>;

export type AugurEvidenceHttpRequest = Readonly<{
  url: string;
  headers: Readonly<Record<string, string>>;
  body: string;
  timeoutMs: number;
}>;

/** Tests inject this boundary. A successful test transport is not real provider evidence. */
export interface AugurEvidenceTransport {
  requestJson(input: AugurEvidenceHttpRequest): Promise<unknown>;
}

export const MAX_AUGUR_EVIDENCE_RESPONSE_BYTES = 2 * 1024 * 1024;
export const AUGUR_INGESTION_LEASE_MS = 45_000;
export const AUGUR_INGESTION_COOLDOWN_MS = 60_000;

export class AugurIngestionError extends Error {
  readonly code: string;
  readonly retryAfterMs?: number;

  constructor(code: string, options: { retryAfterMs?: number } = {}) {
    super(code);
    this.name = "AugurIngestionError";
    this.code = code;
    this.retryAfterMs = options.retryAfterMs;
  }
}

/**
 * Read a provider response with a hard limit on both the declared and actual
 * decoded body. The stream is cancelled as soon as it crosses the limit, so a
 * hostile source cannot make the process buffer an unbounded `response.text()`.
 */
export async function readBoundedAugurJsonResponse(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/u.test(declaredLength)) {
      throw new AugurIngestionError("AUGUR_EVIDENCE_CONTENT_LENGTH_INVALID");
    }
    const declaredBytes = Number(declaredLength);
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes > MAX_AUGUR_EVIDENCE_RESPONSE_BYTES
    ) {
      throw new AugurIngestionError("AUGUR_EVIDENCE_RESPONSE_TOO_LARGE");
    }
  }

  const reader = response.body?.getReader();
  if (!reader) throw new AugurIngestionError("AUGUR_EVIDENCE_RESPONSE_INVALID");
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > MAX_AUGUR_EVIDENCE_RESPONSE_BYTES) {
        await reader.cancel("AUGUR_EVIDENCE_RESPONSE_TOO_LARGE");
        throw new AugurIngestionError("AUGUR_EVIDENCE_RESPONSE_TOO_LARGE");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const encoded = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    encoded.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body: string;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(encoded);
  } catch {
    throw new AugurIngestionError("AUGUR_EVIDENCE_RESPONSE_INVALID");
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new AugurIngestionError("AUGUR_EVIDENCE_RESPONSE_INVALID");
  }
}

export const fetchAugurEvidenceTransport: AugurEvidenceTransport = {
  async requestJson(input) {
    const response = await fetch(input.url, {
      method: "POST",
      headers: input.headers,
      body: input.body,
      redirect: "error",
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    if (!response.ok) throw new AugurIngestionError(`AUGUR_EVIDENCE_HTTP_${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!/^application\/json(?:;|$)/iu.test(contentType)) {
      throw new AugurIngestionError("AUGUR_EVIDENCE_CONTENT_TYPE_INVALID");
    }
    return readBoundedAugurJsonResponse(response);
  },
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function deliverySignature(payload: unknown, secret: string): string {
  return createHmac("sha256", secret)
    .update(`helix-augur-capacity-evidence-v1\n${stableJson(payload)}`, "utf8")
    .digest("hex");
}

export function signAugurEvidenceDeliveryEnvelope(
  rawPayload: unknown,
  hmacSecret: string,
): AugurEvidenceDeliveryEnvelope {
  const payload = AugurEvidenceDeliveryPayloadSchema.parse(rawPayload);
  const secret = z.string().min(32).max(4_096).parse(hmacSecret);
  return AugurEvidenceDeliveryEnvelopeSchema.parse({
    payload,
    authentication: {
      scheme: "hmac_sha256",
      signature: deliverySignature(payload, secret),
    },
  });
}

const AUGUR_ENVIRONMENT_NAMES = [
  "HELIX_AUGUR_EVIDENCE_URL",
  "HELIX_AUGUR_EVIDENCE_TOKEN",
  "HELIX_AUGUR_EVIDENCE_SOURCE_ID",
  "HELIX_AUGUR_EVIDENCE_KEY_ID",
  "HELIX_AUGUR_EVIDENCE_HMAC_SECRET",
  "HELIX_AUGUR_EVIDENCE_MAX_AGE_MS",
] as const;

export function configuredAugurEvidenceSource(
  environment: Readonly<Record<string, string | undefined>>,
): AugurEvidenceSourceConfiguration | undefined {
  const values = Object.fromEntries(
    AUGUR_ENVIRONMENT_NAMES.map((name) => [name, environment[name]?.trim()]),
  ) as Record<(typeof AUGUR_ENVIRONMENT_NAMES)[number], string | undefined>;
  const present = AUGUR_ENVIRONMENT_NAMES.filter((name) => values[name]);
  if (present.length === 0) return undefined;
  const missing = AUGUR_ENVIRONMENT_NAMES.filter((name) => !values[name]);
  if (missing.length > 0) {
    throw new AugurIngestionError(`AUGUR_EVIDENCE_CONFIGURATION_MISSING:${missing.join(",")}`);
  }
  return AugurEvidenceSourceConfigurationSchema.parse({
    url: values.HELIX_AUGUR_EVIDENCE_URL,
    bearerToken: values.HELIX_AUGUR_EVIDENCE_TOKEN,
    expectedSourceId: values.HELIX_AUGUR_EVIDENCE_SOURCE_ID,
    expectedKeyId: values.HELIX_AUGUR_EVIDENCE_KEY_ID,
    hmacSecret: values.HELIX_AUGUR_EVIDENCE_HMAC_SECRET,
    maxEvidenceAgeMs: Number(values.HELIX_AUGUR_EVIDENCE_MAX_AGE_MS),
    requestTimeoutMs: 10_000,
  });
}

type CapacityBindingRow = {
  job_id: string;
  project_id: string;
  user_id: string;
  payload: string;
  artifact_sha256: string;
  request_fingerprint: string;
  pipeline_version: string;
  queue_status: string;
  deploy_id: string;
  deploy_sha256: string;
};

type PersistedEvidenceRow = {
  id: string;
  artifact_sha256: string;
  deploy_id: string;
  deploy_sha256: string;
  envelope_sha256: string;
  evidence_sha256: string;
  evidence: unknown;
};

type AugurClaimResult =
  | Readonly<{ acquired: true; claimToken: string }>
  | Readonly<{
      acquired: false;
      code: "AUGUR_INGESTION_BUSY" | "AUGUR_INGESTION_COOLDOWN" | "AUGUR_JOB_CHANGED";
      retryAfterMs?: number;
    }>;

async function resolveCapacityBinding(input: {
  sql: Sql;
  userId: string;
  projectId: string;
  jobId: string;
}): Promise<CapacityBindingRow> {
  const rows = await input.sql.query<CapacityBindingRow>(
    `select
       job.id as job_id,
       job.project_id,
       job.user_id,
       job.payload,
       job.artifact_sha256,
       job.request_fingerprint,
       job.pipeline_version,
       job.queue_status,
       deploy.id as deploy_id,
       deploy.published_sha256 as deploy_sha256
     from build_jobs as job
     join projects as project
       on project.id = job.project_id
      and project.user_id = job.user_id
      and project.current_build_job_id = job.id
     join lateral (
       select id, published_sha256
       from deploys
       where build_job_id = job.id
         and project_id = job.project_id
         and user_id = job.user_id
         and target = 'web'
         and status = 'deployed'
         and artifact_sha256 = job.artifact_sha256
         and output_integrity_version = 1
         and published_sha256 ~ '^[0-9a-f]{64}$'
       order by completed_at desc nulls last, updated_at desc, id desc
       limit 1
     ) as deploy on true
     where job.id = $1
       and job.project_id = $2
       and job.user_id = $3
       and job.queue_status = 'deployed'
       and job.pipeline_version = $4
       and job.artifact_sha256 ~ '^[0-9a-f]{64}$'`,
    [input.jobId, input.projectId, input.userId, HELIX_PIPELINE_VERSION],
  );
  if (!rows[0]) throw new AugurIngestionError("AUGUR_DEPLOY_BINDING_NOT_FOUND");
  return rows[0];
}

function parseBoundBuildJob(row: CapacityBindingRow): BuildJob {
  let value: unknown;
  try {
    value = JSON.parse(row.payload) as unknown;
  } catch {
    throw new AugurIngestionError("AUGUR_JOB_PAYLOAD_INVALID");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AugurIngestionError("AUGUR_JOB_PAYLOAD_INVALID");
  }
  const job = value as BuildJob;
  if (
    job.id !== row.job_id ||
    job.projectId !== row.project_id ||
    job.userId !== row.user_id ||
    job.requestFingerprint !== row.request_fingerprint ||
    job.checkpoint?.pipelineVersion !== HELIX_PIPELINE_VERSION ||
    job.checkpoint.requestFingerprint !== row.request_fingerprint ||
    typeof job.html !== "string" ||
    typeof job.prompt !== "string" ||
    typeof job.locale !== "string" ||
    !Array.isArray(job.steps)
  ) {
    throw new AugurIngestionError("AUGUR_JOB_PAYLOAD_INVALID");
  }
  const artifactSha256 = createHash("sha256").update(job.html, "utf8").digest("hex");
  if (artifactSha256 !== row.artifact_sha256) {
    throw new AugurIngestionError("AUGUR_ARTIFACT_BINDING_MISMATCH");
  }
  return job;
}

async function loadExistingEvidence(input: {
  sql: Sql;
  userId: string;
  projectId: string;
  jobId: string;
  requestId: string;
}): Promise<PersistedEvidenceRow | undefined> {
  const rows = await input.sql.query<PersistedEvidenceRow>(
    `select evidence.id, evidence.artifact_sha256, evidence.deploy_id,
            evidence.deploy_sha256, request.envelope_sha256,
            evidence.evidence_sha256, evidence.evidence
     from augur_capacity_ingestion_requests as request
     join augur_capacity_evidence as evidence
       on evidence.id = request.evidence_id
      and evidence.job_id = request.job_id
      and evidence.project_id = request.project_id
      and evidence.user_id = request.user_id
      and evidence.deploy_id = request.deploy_id
     where request.job_id = $1
       and request.project_id = $2
       and request.user_id = $3
       and request.request_id = $4`,
    [input.jobId, input.projectId, input.userId, input.requestId],
  );
  return rows[0];
}

async function acquireAugurClaim(input: {
  sql: Sql;
  userId: string;
  projectId: string;
  jobId: string;
  requestId: string;
  binding: CapacityBindingRow;
}): Promise<AugurClaimResult> {
  const claimToken = randomUUID().toLowerCase();
  const acquired = await input.sql.query<{ claim_token: string }>(
    `with eligible as materialized (
       select job.id
       from build_jobs as job
       join projects as project
         on project.id = job.project_id
        and project.user_id = job.user_id
        and project.current_build_job_id = job.id
       join deploys as deploy
         on deploy.id = $7
        and deploy.build_job_id = job.id
        and deploy.project_id = job.project_id
        and deploy.user_id = job.user_id
        and deploy.target = 'web'
        and deploy.status = 'deployed'
        and deploy.artifact_sha256 = job.artifact_sha256
        and deploy.published_sha256 = $8
        and deploy.output_integrity_version = 1
       where job.id = $1
         and job.project_id = $2
         and job.user_id = $3
         and job.queue_status = 'deployed'
         and job.pipeline_version = $4
         and job.payload::jsonb = $5::jsonb
         and job.artifact_sha256 = $6
       for update of job
     )
     insert into augur_capacity_ingestion_claims (
       user_id, project_id, job_id, deploy_id, request_id, claim_token,
       state, evidence_id, claimed_at, lease_expires_at, next_allowed_at, updated_at
     )
     select $3, $2, eligible.id, $7, $9, $10, 'pending', null, now(),
            now() + ($11::bigint * interval '1 millisecond'),
            now() + ($12::bigint * interval '1 millisecond'), now()
     from eligible
     on conflict (user_id, project_id, job_id, deploy_id) do update
     set request_id = excluded.request_id,
         claim_token = excluded.claim_token,
         state = 'pending',
         evidence_id = null,
         claimed_at = excluded.claimed_at,
         lease_expires_at = excluded.lease_expires_at,
         next_allowed_at = excluded.next_allowed_at,
         updated_at = excluded.updated_at
     where augur_capacity_ingestion_claims.next_allowed_at <= now()
       and (
         augur_capacity_ingestion_claims.state <> 'pending'
         or augur_capacity_ingestion_claims.lease_expires_at <= now()
       )
       and not (
         augur_capacity_ingestion_claims.state = 'completed'
         and augur_capacity_ingestion_claims.request_id = excluded.request_id
       )
     returning claim_token`,
    [
      input.jobId,
      input.projectId,
      input.userId,
      HELIX_PIPELINE_VERSION,
      input.binding.payload,
      input.binding.artifact_sha256,
      input.binding.deploy_id,
      input.binding.deploy_sha256,
      input.requestId,
      claimToken,
      AUGUR_INGESTION_LEASE_MS,
      AUGUR_INGESTION_COOLDOWN_MS,
    ],
  );
  if (acquired[0]?.claim_token === claimToken) {
    return Object.freeze({ acquired: true as const, claimToken });
  }

  const conflicts = await input.sql.query<{
    state: "pending" | "completed" | "failed";
    retry_after_ms: string | number;
  }>(
    `select state,
            ceil(greatest(
              0,
              extract(epoch from (
                greatest(next_allowed_at, coalesce(lease_expires_at, now())) - now()
              )) * 1000
            ))::bigint as retry_after_ms
     from augur_capacity_ingestion_claims
     where user_id = $1 and project_id = $2 and job_id = $3 and deploy_id = $4`,
    [input.userId, input.projectId, input.jobId, input.binding.deploy_id],
  );
  const conflict = conflicts[0];
  if (!conflict) return Object.freeze({ acquired: false as const, code: "AUGUR_JOB_CHANGED" });
  const retryAfterMs = Math.max(1, Number(conflict.retry_after_ms) || 1);
  return Object.freeze({
    acquired: false as const,
    code:
      conflict.state === "pending"
        ? "AUGUR_INGESTION_BUSY"
        : "AUGUR_INGESTION_COOLDOWN",
    retryAfterMs,
  });
}

async function failAugurClaim(input: {
  sql: Sql;
  userId: string;
  projectId: string;
  jobId: string;
  deployId: string;
  requestId: string;
  claimToken: string;
}): Promise<void> {
  await input.sql.query(
    `update augur_capacity_ingestion_claims
     set state = 'failed', evidence_id = null, lease_expires_at = null, updated_at = now()
     where user_id = $1 and project_id = $2 and job_id = $3 and deploy_id = $4
       and request_id = $5 and claim_token = $6 and state = 'pending'`,
    [
      input.userId,
      input.projectId,
      input.jobId,
      input.deployId,
      input.requestId,
      input.claimToken,
    ],
  );
}

async function verifiedEnvelope(input: {
  rawEnvelope: unknown;
  request: z.infer<typeof AugurEvidenceRequestSchema>;
  configuration: AugurEvidenceSourceConfiguration;
  now: number;
}) {
  const envelope = AugurEvidenceDeliveryEnvelopeSchema.parse(input.rawEnvelope);
  const expected = Buffer.from(
    deliverySignature(envelope.payload, input.configuration.hmacSecret),
    "hex",
  );
  const presented = Buffer.from(envelope.authentication.signature, "hex");
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) {
    throw new AugurIngestionError("AUGUR_EVIDENCE_AUTHENTICATION_FAILED");
  }
  const payload = envelope.payload;
  if (
    payload.sourceId !== input.configuration.expectedSourceId ||
    payload.keyId !== input.configuration.expectedKeyId
  ) {
    throw new AugurIngestionError("AUGUR_EVIDENCE_SOURCE_MISMATCH");
  }
  if (
    payload.requestId !== input.request.requestId ||
    payload.requestNonce !== input.request.requestNonce
  ) {
    throw new AugurIngestionError("AUGUR_EVIDENCE_REQUEST_MISMATCH");
  }
  if (
    payload.jobId !== input.request.jobId ||
    payload.projectId !== input.request.projectId ||
    payload.artifactSha256 !== input.request.artifactSha256 ||
    payload.deployId !== input.request.deployId ||
    payload.deploySha256 !== input.request.deploySha256 ||
    payload.evidence.artifactSha256 !== input.request.artifactSha256 ||
    payload.evidence.deploySha256 !== input.request.deploySha256
  ) {
    throw new AugurIngestionError("AUGUR_EVIDENCE_BINDING_MISMATCH");
  }
  const observedAt = Date.parse(payload.observedAt);
  if (!Number.isFinite(observedAt) || observedAt > input.now + 5 * 60 * 1_000) {
    throw new AugurIngestionError("AUGUR_EVIDENCE_FROM_FUTURE");
  }
  if (input.now - observedAt >= input.configuration.maxEvidenceAgeMs) {
    throw new AugurIngestionError("AUGUR_EVIDENCE_STALE");
  }
  const evidence = await sealCapacityEvidence(payload.evidence);
  const forecast = await computeCapacityForecast(
    evidence,
    input.request.artifactSha256,
    "en",
    {
      now: input.now,
      maxAgeMs: input.configuration.maxEvidenceAgeMs,
      expectedDeploySha256: input.request.deploySha256,
    },
  );
  if (forecast.status !== "completed") {
    throw new AugurIngestionError("AUGUR_EVIDENCE_INCOMPLETE");
  }
  return { envelope, evidence, forecast };
}

function markCapacitySteps(job: BuildJob, forecast: Extract<CapacityForecast, { status: "completed" }>) {
  job.steps = job.steps.map((step) => {
    if (step.id === "storm") {
      const storm = job.quality?.capacity?.profiles.storm;
      return {
        ...step,
        status: "done",
        validation: "validated",
        artifact: storm?.runner,
        detail: storm
          ? `Measured saturation: ${storm.metrics.saturationRequestsPerSecond} requests/second`
          : step.detail,
      };
    }
    if (step.id === "augur") {
      return {
        ...step,
        status: "done",
        validation: "estimated",
        artifact: forecast.evidenceSha256,
        detail: `Capacity forecast: ${forecast.range.min}-${forecast.range.max} requests/second from verified evidence`,
      };
    }
    return step;
  });
}

function persistedResult(input: {
  row: PersistedEvidenceRow;
  forecast: CapacityForecast;
  wasInserted: boolean;
}) {
  if (input.forecast.status !== "completed") {
    return Object.freeze({
      status: "not_run" as const,
      evidence: "not_run" as const,
      reasonCode: "augur_persisted_evidence_not_current" as const,
      detail:
        "The idempotently accepted capacity bundle is no longer fresh and cannot authorize a current forecast.",
      wasInserted: input.wasInserted,
      evidenceId: input.row.id,
      artifactSha256: input.row.artifact_sha256,
      deployId: input.row.deploy_id,
      deploySha256: input.row.deploy_sha256,
      evidenceSha256: input.row.evidence_sha256,
      envelopeSha256: input.row.envelope_sha256,
      forecast: input.forecast,
    });
  }
  return Object.freeze({
    status: "completed" as const,
    evidence: "verified" as const,
    wasInserted: input.wasInserted,
    evidenceId: input.row.id,
    artifactSha256: input.row.artifact_sha256,
    deployId: input.row.deploy_id,
    deploySha256: input.row.deploy_sha256,
    evidenceSha256: input.row.evidence_sha256,
    envelopeSha256: input.row.envelope_sha256,
    forecast: input.forecast,
  });
}

export type RunAugurCapacityIngestionInput = {
  environment: Readonly<Record<string, string | undefined>>;
  userId: string;
  projectId: string;
  jobId: string;
  requestId: string;
  transport?: AugurEvidenceTransport;
  sqlProvider?: () => Promise<Sql>;
  now?: number;
  nonceFactory?: () => string;
};

/**
 * Pull, authenticate and persist one capacity bundle. No configuration means
 * NOT_RUN. No quality/score mutation can occur before the signed bundle and
 * its authoritative current-job/deploy binding have both been verified.
 */
export async function runConfiguredAugurCapacityIngestion(
  input: RunAugurCapacityIngestionInput,
) {
  const configuration = configuredAugurEvidenceSource(input.environment);
  if (!configuration) {
    return Object.freeze({
      status: "not_run" as const,
      evidence: "not_run" as const,
      reasonCode: "augur_source_unconfigured" as const,
      detail: "No authenticated Augur capacity evidence source is configured.",
    });
  }
  const userId = z.string().trim().min(1).max(240).parse(input.userId);
  const projectId = z.string().trim().min(1).max(128).parse(input.projectId);
  const jobId = z.string().trim().min(8).max(128).parse(input.jobId);
  const requestId = UUIDSchema.parse(input.requestId.trim().toLowerCase());
  const now = input.now ?? Date.now();
  if (!Number.isFinite(now)) throw new AugurIngestionError("AUGUR_CLOCK_INVALID");
  const sql = await (input.sqlProvider ?? getSql)();
  const binding = await resolveCapacityBinding({ sql, userId, projectId, jobId });
  const job = parseBoundBuildJob(binding);

  const existing = await loadExistingEvidence({ sql, userId, projectId, jobId, requestId });
  if (existing) {
    if (
      existing.artifact_sha256 !== binding.artifact_sha256 ||
      existing.deploy_id !== binding.deploy_id ||
      existing.deploy_sha256 !== binding.deploy_sha256
    ) {
      throw new AugurIngestionError("AUGUR_REQUEST_REUSED");
    }
    const evidence = AugurCapacityEvidenceSchema.parse(existing.evidence);
    const forecast = await computeCapacityForecast(evidence, binding.artifact_sha256, job.locale, {
      now,
      maxAgeMs: configuration.maxEvidenceAgeMs,
      expectedDeploySha256: binding.deploy_sha256,
    });
    return persistedResult({ row: existing, forecast, wasInserted: false });
  }

  const claim = await acquireAugurClaim({
    sql,
    userId,
    projectId,
    jobId,
    requestId,
    binding,
  });
  if (!claim.acquired) {
    // The first lookup can race with a completing request. Re-read the durable
    // request mapping before exposing a busy/cooldown response.
    const completed = await loadExistingEvidence({ sql, userId, projectId, jobId, requestId });
    if (
      completed &&
      completed.artifact_sha256 === binding.artifact_sha256 &&
      completed.deploy_id === binding.deploy_id &&
      completed.deploy_sha256 === binding.deploy_sha256
    ) {
      const acceptedEvidence = AugurCapacityEvidenceSchema.parse(completed.evidence);
      const acceptedForecast = await computeCapacityForecast(
        acceptedEvidence,
        binding.artifact_sha256,
        job.locale,
        {
          now,
          maxAgeMs: configuration.maxEvidenceAgeMs,
          expectedDeploySha256: binding.deploy_sha256,
        },
      );
      return persistedResult({ row: completed, forecast: acceptedForecast, wasInserted: false });
    }
    throw new AugurIngestionError(claim.code, { retryAfterMs: claim.retryAfterMs });
  }

  try {
    const requestNonce = UUIDSchema.parse((input.nonceFactory ?? randomUUID)().toLowerCase());
    const request = AugurEvidenceRequestSchema.parse({
      kind: "augur_capacity_evidence_request",
      version: "1.0.0",
      requestId,
      requestNonce,
      jobId,
      projectId,
      artifactSha256: binding.artifact_sha256,
      deployId: binding.deploy_id,
      deploySha256: binding.deploy_sha256,
      requiredProfiles: ["storm", "database", "topology", "cost", "concurrency"],
    });
    const rawEnvelope = await (input.transport ?? fetchAugurEvidenceTransport).requestJson({
      url: configuration.url,
      headers: Object.freeze({
        accept: "application/json",
        authorization: `Bearer ${configuration.bearerToken}`,
        "content-type": "application/json",
        "x-helix-augur-source": configuration.expectedSourceId,
        "x-helix-augur-key": configuration.expectedKeyId,
      }),
      body: stableJson(request),
      timeoutMs: configuration.requestTimeoutMs,
    });
    const verified = await verifiedEnvelope({ rawEnvelope, request, configuration, now });

    const nonceRows = await sql.query<{ id: string }>(
      `select id from augur_capacity_ingestion_requests
       where source_id = $1 and key_id = $2 and source_nonce = $3`,
      [configuration.expectedSourceId, configuration.expectedKeyId, requestNonce],
    );
    if (nonceRows[0]) throw new AugurIngestionError("AUGUR_SOURCE_NONCE_REPLAY");

    job.quality = {
      ...(job.quality ?? {}),
      capacity: verified.evidence,
      capacityDeploySha256: binding.deploy_sha256,
    };
    job.score = await computeScore(job.html as string, job.prompt, job.quality, job.locale, {
      now,
      capacityMaxAgeMs: configuration.maxEvidenceAgeMs,
      expectedDeploySha256: binding.deploy_sha256,
    });
    if (job.score.capacityForecast.status !== "completed") {
      throw new AugurIngestionError("AUGUR_FORECAST_NOT_COMPLETED");
    }
    markCapacitySteps(job, job.score.capacityForecast);

    const sourcePayloadJson = JSON.stringify(verified.envelope.payload);
    const evidenceJson = JSON.stringify(verified.evidence);
    const updatedPayload = JSON.stringify(job);
    const envelopeSha256 = sha256Json(verified.envelope);
    const evidenceId = `augur_${sha256Json({
      jobId,
      deployId: binding.deploy_id,
      evidenceSha256: verified.evidence.evidenceSha256,
    }).slice(0, 48)}`;
    const completed = await sql.query<{ id: string; was_inserted: boolean }>(
      `with eligible as materialized (
         select job.id
         from build_jobs as job
         join projects as project
           on project.id = job.project_id
          and project.user_id = job.user_id
          and project.current_build_job_id = job.id
         join deploys as deploy
           on deploy.id = $7
          and deploy.build_job_id = job.id
          and deploy.project_id = job.project_id
          and deploy.user_id = job.user_id
          and deploy.target = 'web'
          and deploy.status = 'deployed'
          and deploy.artifact_sha256 = job.artifact_sha256
          and deploy.published_sha256 = $8
          and deploy.output_integrity_version = 1
         join augur_capacity_ingestion_claims as claim
           on claim.user_id = job.user_id
          and claim.project_id = job.project_id
          and claim.job_id = job.id
          and claim.deploy_id = deploy.id
          and claim.request_id = $11
          and claim.claim_token = $20
          and claim.state = 'pending'
          and claim.lease_expires_at > now()
         where job.id = $1
           and job.project_id = $2
           and job.user_id = $3
           and job.queue_status = 'deployed'
           and job.pipeline_version = $4
           and job.artifact_sha256 = $6
           and job.payload::jsonb = $5::jsonb
         for update of job, claim
       ), updated as (
         update build_jobs as job
         set payload = $9, updated_at = now()
         from eligible
         where job.id = eligible.id
         returning job.id
       ), inserted_evidence as (
         insert into augur_capacity_evidence (
           id, job_id, project_id, user_id, deploy_id, request_id,
           source_id, key_id, source_nonce, source_observed_at,
           artifact_sha256, deploy_sha256, envelope_sha256, evidence_sha256,
           source_payload, evidence
         )
         select $10, updated.id, $2, $3, $7, $11,
                $12, $13, $14, $15::timestamptz,
                $6, $8, $16, $17, $18::jsonb, $19::jsonb
         from updated
         on conflict (job_id, deploy_id, evidence_sha256) do nothing
         returning id
       ), chosen_evidence as (
         select id, true as was_inserted from inserted_evidence
         union all
         select evidence.id, false as was_inserted
         from augur_capacity_evidence as evidence
         where evidence.job_id = $1
           and evidence.project_id = $2
           and evidence.user_id = $3
           and evidence.deploy_id = $7
           and evidence.artifact_sha256 = $6
           and evidence.deploy_sha256 = $8
           and evidence.evidence_sha256 = $17
           and not exists (select 1 from inserted_evidence)
       ), mapped_request as (
         insert into augur_capacity_ingestion_requests (
           job_id, project_id, user_id, deploy_id, request_id, evidence_id,
           source_id, key_id, source_nonce, source_observed_at, envelope_sha256
         )
         select $1, $2, $3, $7, $11, chosen.id,
                $12, $13, $14, $15::timestamptz, $16
         from chosen_evidence as chosen
         returning evidence_id
       ), completed_claim as (
         update augur_capacity_ingestion_claims as claim
         set state = 'completed', evidence_id = mapped.evidence_id,
             lease_expires_at = null, updated_at = now()
         from mapped_request as mapped
         where claim.user_id = $3
           and claim.project_id = $2
           and claim.job_id = $1
           and claim.deploy_id = $7
           and claim.request_id = $11
           and claim.claim_token = $20
           and claim.state = 'pending'
         returning mapped.evidence_id
       )
       select completed_claim.evidence_id as id, chosen_evidence.was_inserted
       from completed_claim
       join chosen_evidence on chosen_evidence.id = completed_claim.evidence_id`,
      [
        jobId,
        projectId,
        userId,
        HELIX_PIPELINE_VERSION,
        binding.payload,
        binding.artifact_sha256,
        binding.deploy_id,
        binding.deploy_sha256,
        updatedPayload,
        evidenceId,
        requestId,
        configuration.expectedSourceId,
        configuration.expectedKeyId,
        requestNonce,
        verified.envelope.payload.observedAt,
        envelopeSha256,
        verified.evidence.evidenceSha256,
        sourcePayloadJson,
        evidenceJson,
        claim.claimToken,
      ],
    );
    if (!completed[0]) throw new AugurIngestionError("AUGUR_JOB_CHANGED");
    const row: PersistedEvidenceRow = {
      id: completed[0].id,
      artifact_sha256: binding.artifact_sha256,
      deploy_id: binding.deploy_id,
      deploy_sha256: binding.deploy_sha256,
      envelope_sha256: envelopeSha256,
      evidence_sha256: verified.evidence.evidenceSha256,
      evidence: verified.evidence,
    };
    return persistedResult({
      row,
      forecast: verified.forecast,
      wasInserted: completed[0].was_inserted,
    });
  } catch (error) {
    await failAugurClaim({
      sql,
      userId,
      projectId,
      jobId,
      deployId: binding.deploy_id,
      requestId,
      claimToken: claim.claimToken,
    });
    if (String(error).includes("source_id_key_id_source_nonce")) {
      throw new AugurIngestionError("AUGUR_SOURCE_NONCE_REPLAY");
    }
    throw error;
  }
}
