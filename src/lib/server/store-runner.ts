import { z } from "zod";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const APP_IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*){2,}$/;
const APPLE_TEAM_PATTERN = /^[A-Z0-9]{10}$/;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 128 * 1024;
export const MAX_STORE_PACKAGE_BYTES = 6 * 1024 * 1024;

const StoreRunnerActionSchema = z.enum(["accept", "activate", "status"]);
export type StoreRunnerAction = z.infer<typeof StoreRunnerActionSchema>;

export const StoreIdentitySchema = z
  .object({
    platform: z.enum(["ios", "android"]),
    appIdentifier: z.string().trim().min(5).max(160).regex(APP_IDENTIFIER_PATTERN),
    easProjectId: z.string().uuid(),
    version: z.string().trim().min(1).max(40),
    appleTeamId: z.string().regex(APPLE_TEAM_PATTERN).nullable(),
    destination: z.enum(["testflight", "play_internal"]),
  })
  .strict()
  .superRefine((identity, context) => {
    if (
      identity.platform === "ios" &&
      (identity.destination !== "testflight" || identity.appleTeamId === null)
    ) {
      context.addIssue({ code: "custom", message: "iOS requires TestFlight and Apple Team ID" });
    }
    if (
      identity.platform === "android" &&
      (identity.destination !== "play_internal" || identity.appleTeamId !== null)
    ) {
      context.addIssue({ code: "custom", message: "Android requires the Play internal track" });
    }
  });
export type StoreIdentity = z.infer<typeof StoreIdentitySchema>;

const StorePackageSchema = z
  .object({
    filename: z
      .string()
      .trim()
      .min(5)
      .max(200)
      .regex(/\.zip$/),
    sha256: z.string().regex(SHA256_PATTERN),
    byteLength: z.number().int().positive().max(MAX_STORE_PACKAGE_BYTES),
    base64: z
      .string()
      .min(4)
      .max(Math.ceil(MAX_STORE_PACKAGE_BYTES / 3) * 4 + 16),
  })
  .strict();

export const StoreRunnerRequestSchema = z
  .object({
    kind: z.literal("helix_store_release_request"),
    schemaVersion: z.literal("1.0.0"),
    action: StoreRunnerActionSchema,
    requestNonce: z.string().uuid(),
    requestedAt: z.string().datetime({ offset: true }),
    releaseId: z.string().uuid(),
    idempotencyKey: z.string().trim().min(16).max(240),
    packageSha256: z.string().regex(SHA256_PATTERN),
    identity: StoreIdentitySchema,
    sourcePackage: StorePackageSchema.nullable(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.action === "accept") {
      if (!request.sourcePackage || request.sourcePackage.sha256 !== request.packageSha256) {
        context.addIssue({ code: "custom", message: "Accept requires the exact source package" });
      }
    } else if (request.sourcePackage !== null) {
      context.addIssue({ code: "custom", message: "Only accept may carry source bytes" });
    }
  });
export type StoreRunnerRequest = z.infer<typeof StoreRunnerRequestSchema>;

const IosCredentialEvidenceSchema = z
  .object({
    platform: z.literal("ios"),
    easProjectId: z.string().uuid(),
    bundleId: z.string().regex(APP_IDENTIFIER_PATTERN),
    appleTeamId: z.string().regex(APPLE_TEAM_PATTERN),
    expoAccountIdSha256: z.string().regex(SHA256_PATTERN),
    distributionCertificateSha256: z.string().regex(SHA256_PATTERN),
    provisioningProfileSha256: z.string().regex(SHA256_PATTERN),
    appStoreConnectKeyIdSha256: z.string().regex(SHA256_PATTERN),
  })
  .strict();

const AndroidCredentialEvidenceSchema = z
  .object({
    platform: z.literal("android"),
    easProjectId: z.string().uuid(),
    packageName: z.string().regex(APP_IDENTIFIER_PATTERN),
    expoAccountIdSha256: z.string().regex(SHA256_PATTERN),
    keystoreCertificateSha256: z.string().regex(SHA256_PATTERN),
    playServiceAccountEmailSha256: z.string().regex(SHA256_PATTERN),
    artifactType: z.literal("aab"),
    track: z.literal("internal"),
  })
  .strict();

export const StoreCredentialEvidenceSchema = z.discriminatedUnion("platform", [
  IosCredentialEvidenceSchema,
  AndroidCredentialEvidenceSchema,
]);
export type StoreCredentialEvidence = z.infer<typeof StoreCredentialEvidenceSchema>;

const ProviderStateSchema = z.enum([
  "dispatch_accepted",
  "workflow_queued",
  "build_in_progress",
  "build_succeeded",
  "submission_in_progress",
  "distributed",
  "failed",
  "action_required",
]);
export type StoreProviderState = z.infer<typeof ProviderStateSchema>;

const StoreProviderEvidenceSchema = z
  .object({
    provider: z.literal("eas_workflows"),
    easCliVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
    workflowStatus: z.enum([
      "not_started",
      "new",
      "in_progress",
      "success",
      "failure",
      "action_required",
      "canceled",
    ]),
    buildStatus: z.enum(["not_started", "in_progress", "succeeded", "failed"]),
    submissionStatus: z.enum([
      "not_started",
      "in_progress",
      "succeeded",
      "failed",
      "action_required",
    ]),
    observedAt: z.string().datetime({ offset: true }),
    rawReportSha256: z.string().regex(SHA256_PATTERN).nullable(),
  })
  .strict();
export type StoreProviderEvidence = z.infer<typeof StoreProviderEvidenceSchema>;

const StoreRunnerErrorEvidenceSchema = z
  .object({
    code: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(500),
    retryable: z.boolean(),
  })
  .strict();

export const StoreRunnerReportSchema = z
  .object({
    kind: z.literal("helix_store_release_report"),
    schemaVersion: z.literal("1.0.0"),
    action: StoreRunnerActionSchema,
    requestNonce: z.string().uuid(),
    releaseId: z.string().uuid(),
    idempotencyKey: z.string().trim().min(16).max(240),
    packageSha256: z.string().regex(SHA256_PATTERN),
    identity: StoreIdentitySchema,
    state: ProviderStateSchema,
    runnerJobId: z.string().trim().min(8).max(200),
    workflowRunId: z.string().trim().min(1).max(200).nullable(),
    workflowBuildJobId: z.string().trim().min(1).max(200).nullable(),
    workflowDistributionJobId: z.string().trim().min(1).max(200).nullable(),
    providerBuildId: z.string().trim().min(1).max(200).nullable(),
    providerSubmissionId: z.string().trim().min(1).max(200).nullable(),
    providerReleaseId: z.string().trim().min(1).max(200).nullable(),
    credentialEvidence: StoreCredentialEvidenceSchema,
    providerEvidence: StoreProviderEvidenceSchema,
    acceptedAt: z.string().datetime({ offset: true }),
    observedAt: z.string().datetime({ offset: true }),
    retryAfterSeconds: z.number().int().min(5).max(3_600).nullable(),
    error: StoreRunnerErrorEvidenceSchema.nullable(),
  })
  .strict()
  .superRefine((report, context) => {
    const identity = report.identity;
    const credentials = report.credentialEvidence;
    const identityMatches =
      credentials.platform === identity.platform &&
      credentials.easProjectId === identity.easProjectId &&
      (credentials.platform === "ios"
        ? credentials.bundleId === identity.appIdentifier &&
          credentials.appleTeamId === identity.appleTeamId
        : credentials.packageName === identity.appIdentifier && credentials.track === "internal");
    if (!identityMatches) {
      context.addIssue({ code: "custom", message: "Credential evidence targets another app" });
    }
    if (report.action === "accept" && report.state !== "dispatch_accepted") {
      context.addIssue({ code: "custom", message: "Accept must report durable acceptance only" });
    }
    if (
      report.action === "activate" &&
      report.state !== "dispatch_accepted" &&
      report.state !== "workflow_queued" &&
      report.state !== "action_required"
    ) {
      context.addIssue({
        code: "custom",
        message: "Activation must be in flight, queued, or blocked for reconciliation",
      });
    }
    if (
      report.action === "activate" &&
      report.state === "dispatch_accepted" &&
      report.retryAfterSeconds === null
    ) {
      context.addIssue({
        code: "custom",
        message: "In-flight activation must include a retry interval",
      });
    }
    if (report.state === "workflow_queued" && report.workflowRunId === null) {
      context.addIssue({ code: "custom", message: "Queued state requires workflow run ID" });
    }
    if (report.state === "distributed") {
      if (
        report.workflowRunId === null ||
        report.providerBuildId === null ||
        report.workflowBuildJobId === null ||
        report.workflowDistributionJobId === null ||
        report.providerEvidence.workflowStatus !== "success" ||
        report.providerEvidence.buildStatus !== "succeeded" ||
        report.providerEvidence.submissionStatus !== "succeeded" ||
        report.error !== null
      ) {
        context.addIssue({
          code: "custom",
          message: "Distributed state requires explicit successful workflow/build IDs and evidence",
        });
      }
    }
    if (
      (report.state === "failed" || report.state === "action_required") !==
      (report.error !== null)
    ) {
      context.addIssue({ code: "custom", message: "Only blocked terminal reports carry errors" });
    }
  });
export type StoreRunnerReport = z.infer<typeof StoreRunnerReportSchema>;

export class StoreRunnerError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable = false) {
    super(code);
    this.name = "StoreRunnerError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type StoreRunnerConfiguration = { url: URL; secret: string };

export function storeRunnerConfiguration(
  env: Record<string, string | undefined> = process.env,
): StoreRunnerConfiguration {
  const rawUrl = env.HELIX_STORE_RUNNER_URL?.trim();
  const secret = env.HELIX_STORE_RUNNER_SECRET?.trim();
  if (!rawUrl && !secret) throw new StoreRunnerError("STORE_RUNNER_UNCONFIGURED");
  if (!rawUrl || !secret || secret.length < 32) {
    throw new StoreRunnerError("STORE_RUNNER_CONFIGURATION_INVALID");
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new StoreRunnerError("STORE_RUNNER_CONFIGURATION_INVALID");
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new StoreRunnerError("STORE_RUNNER_CONFIGURATION_INVALID");
  }
  return { url, secret };
}

export function isStoreRunnerConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  try {
    storeRunnerConfiguration(env);
    return true;
  } catch {
    return false;
  }
}

function ownedArrayBuffer(bytes: ArrayLike<number>): ArrayBuffer {
  const output = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) output[index] = bytes[index] ?? 0;
  return output.buffer;
}

export async function storeRunnerHmacHex(secret: string, value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const key = await crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(new TextEncoder().encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, ownedArrayBuffer(bytes));
  return Buffer.from(signed).toString("hex");
}

export function storeRunnerSignatureEqual(left: string, right: string): boolean {
  if (!SHA256_PATTERN.test(left) || !SHA256_PATTERN.test(right)) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function readBoundedResponse(response: Response): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    await response.body?.cancel().catch(() => undefined);
    throw new StoreRunnerError("STORE_RUNNER_RESPONSE_TOO_LARGE");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new StoreRunnerError("STORE_RUNNER_RESPONSE_TOO_LARGE");
      }
      chunks.push(next.value);
    }
  } catch (error) {
    if (error instanceof StoreRunnerError) throw error;
    throw new StoreRunnerError("STORE_RUNNER_REQUEST_FAILED", true);
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(output);
  } catch {
    throw new StoreRunnerError("STORE_RUNNER_RESPONSE_INVALID");
  }
}

function sameIdentity(left: StoreIdentity, right: StoreIdentity): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function callStoreRunner(
  input: Omit<StoreRunnerRequest, "kind" | "schemaVersion" | "requestNonce" | "requestedAt">,
  options: {
    fetch?: typeof fetch;
    signal?: AbortSignal;
    env?: Record<string, string | undefined>;
    now?: () => number;
    nonce?: () => string;
  } = {},
): Promise<StoreRunnerReport> {
  const configured = storeRunnerConfiguration(options.env);
  const now = options.now ?? Date.now;
  const requestNonce = options.nonce?.() ?? crypto.randomUUID();
  const requestedAtMs = now();
  const request = StoreRunnerRequestSchema.parse({
    kind: "helix_store_release_request",
    schemaVersion: "1.0.0",
    requestNonce,
    requestedAt: new Date(requestedAtMs).toISOString(),
    ...input,
  });
  const body = JSON.stringify(request);
  const timestamp = String(requestedAtMs);
  const signature = await storeRunnerHmacHex(
    configured.secret,
    `${timestamp}\n${requestNonce}\n${body}`,
  );
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    response = await (options.fetch ?? fetch)(configured.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-helix-store-timestamp": timestamp,
        "x-helix-store-nonce": requestNonce,
        "x-helix-store-signature": signature,
      },
      body,
      redirect: "error",
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    });
  } catch {
    throw new StoreRunnerError("STORE_RUNNER_REQUEST_FAILED", true);
  }
  if (!response.ok) {
    throw new StoreRunnerError("STORE_RUNNER_REQUEST_FAILED", response.status >= 500);
  }
  const responseBody = await readBoundedResponse(response);
  const presented = response.headers.get("x-helix-store-signature")?.trim().toLowerCase() ?? "";
  const expected = await storeRunnerHmacHex(configured.secret, `${requestNonce}\n${responseBody}`);
  if (!storeRunnerSignatureEqual(presented, expected)) {
    throw new StoreRunnerError("STORE_RUNNER_SIGNATURE_INVALID");
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(responseBody) as unknown;
  } catch {
    throw new StoreRunnerError("STORE_RUNNER_RESPONSE_INVALID");
  }
  const parsed = StoreRunnerReportSchema.safeParse(candidate);
  if (!parsed.success) throw new StoreRunnerError("STORE_RUNNER_RESPONSE_INVALID");
  const report = parsed.data;
  if (report.requestNonce !== requestNonce)
    throw new StoreRunnerError("STORE_RUNNER_REPLAY_DETECTED");
  if (
    report.action !== request.action ||
    report.releaseId !== request.releaseId ||
    report.idempotencyKey !== request.idempotencyKey ||
    report.packageSha256 !== request.packageSha256 ||
    !sameIdentity(report.identity, request.identity)
  ) {
    throw new StoreRunnerError("STORE_RUNNER_RELEASE_MISMATCH");
  }
  const acceptedAt = Date.parse(report.acceptedAt);
  const observedAt = Date.parse(report.observedAt);
  if (
    !Number.isFinite(acceptedAt) ||
    !Number.isFinite(observedAt) ||
    observedAt < requestedAtMs - MAX_CLOCK_SKEW_MS ||
    observedAt < acceptedAt ||
    observedAt > now() + MAX_CLOCK_SKEW_MS
  ) {
    throw new StoreRunnerError("STORE_RUNNER_TIMESTAMPS_INVALID");
  }
  return report;
}
