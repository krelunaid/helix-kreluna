import { z } from "zod";
import {
  HarborProductionPackageSchema,
  type HarborProductionPackage,
} from "@/lib/server/release/harbor-production-artifact";
import { sha256Utf8Hex } from "@/lib/server/release/integrity";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 128 * 1024;

export const HarborProductionActionSchema = z.enum(["accept", "activate", "reconcile"]);
export type HarborProductionAction = z.infer<typeof HarborProductionActionSchema>;

export const HarborProductionIdentitySchema = z
  .object({
    target: z.literal("web"),
    projectId: z.string().trim().min(1).max(200),
    buildJobId: z.string().trim().min(1).max(200),
    humanGateArtifactSha256: z.string().regex(SHA256_PATTERN),
    workspaceArtifactSha256: z.string().regex(SHA256_PATTERN),
    packageSha256: z.string().regex(SHA256_PATTERN),
    provenanceSha256: z.string().regex(SHA256_PATTERN),
  })
  .strict();
export type HarborProductionIdentity = z.infer<typeof HarborProductionIdentitySchema>;

export const HarborProductionRunnerRequestSchema = z
  .object({
    kind: z.literal("helix_harbor_production_request"),
    schemaVersion: z.literal("1.0.0"),
    action: HarborProductionActionSchema,
    requestNonce: z.string().uuid(),
    requestedAt: z.string().datetime({ offset: true }),
    releaseId: z.string().uuid(),
    idempotencyKey: z.string().trim().min(16).max(240),
    identity: HarborProductionIdentitySchema,
    sourcePackage: HarborProductionPackageSchema.nullable(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.action === "accept") {
      if (
        !request.sourcePackage ||
        request.sourcePackage.sha256 !== request.identity.packageSha256 ||
        request.sourcePackage.provenanceSha256 !== request.identity.provenanceSha256
      ) {
        context.addIssue({
          code: "custom",
          message: "Accept requires the exact provenance-bound Production package",
        });
      }
    } else if (request.sourcePackage !== null) {
      context.addIssue({ code: "custom", message: "Only accept may carry source bytes" });
    }
  });
export type HarborProductionRunnerRequest = z.infer<typeof HarborProductionRunnerRequestSchema>;

const HttpsPublicUrlSchema = z
  .string()
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      !url.hostname ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]"
    ) {
      context.addIssue({ code: "custom", message: "Provider URLs must be public HTTPS URLs" });
    }
  });

const HarborPriorDeploymentRollbackEvidenceSchema = z
  .object({
    kind: z.literal("prior_deployment"),
    reference: z.string().trim().min(1).max(240),
    providerDeploymentId: z.string().trim().min(1).max(240),
    status: z.literal("ready"),
    publicUrl: HttpsPublicUrlSchema,
    observedAt: z.string().datetime({ offset: true }),
  })
  .strict();

const HarborOpaqueRollbackEvidenceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("provider_snapshot"),
      reference: z.string().trim().min(1).max(240),
      status: z.literal("ready"),
      observedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      kind: z.literal("rollback_token"),
      reference: z.string().trim().min(1).max(240),
      status: z.literal("ready"),
      observedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
]);

const HarborRollbackEvidenceSchema = z.union([
  HarborPriorDeploymentRollbackEvidenceSchema,
  HarborOpaqueRollbackEvidenceSchema,
]);

export const HarborProductionProviderEvidenceSchema = z
  .object({
    provider: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9_-]*$/u),
    providerDeploymentId: z.string().trim().min(1).max(240).nullable(),
    status: z.enum(["accepted", "queued", "building", "ready", "failed", "action_required"]),
    publicUrl: HttpsPublicUrlSchema.nullable(),
    observedAt: z.string().datetime({ offset: true }),
    deployedAt: z.string().datetime({ offset: true }).nullable(),
    rollback: HarborRollbackEvidenceSchema.nullable(),
    rawReportSha256: z.string().regex(SHA256_PATTERN),
  })
  .strict();
export type HarborProductionProviderEvidence = z.infer<
  typeof HarborProductionProviderEvidenceSchema
>;

export const HarborProductionReleaseStateSchema = z.enum([
  "accepted",
  "queued",
  "deploying",
  "active",
  "failed",
  "action_required",
]);
export type HarborProductionReleaseState = z.infer<typeof HarborProductionReleaseStateSchema>;

const HarborProductionRunnerErrorEvidenceSchema = z
  .object({
    code: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(500),
    retryable: z.boolean(),
  })
  .strict();

export const HarborProductionRunnerReportSchema = z
  .object({
    kind: z.literal("helix_harbor_production_report"),
    schemaVersion: z.literal("1.0.0"),
    action: HarborProductionActionSchema,
    requestNonce: z.string().uuid(),
    releaseId: z.string().uuid(),
    idempotencyKey: z.string().trim().min(16).max(240),
    identity: HarborProductionIdentitySchema,
    state: HarborProductionReleaseStateSchema,
    runnerReleaseId: z.string().trim().min(8).max(240),
    providerEvidence: HarborProductionProviderEvidenceSchema,
    acceptedAt: z.string().datetime({ offset: true }),
    observedAt: z.string().datetime({ offset: true }),
    retryAfterSeconds: z.number().int().min(5).max(3_600).nullable(),
    error: HarborProductionRunnerErrorEvidenceSchema.nullable(),
  })
  .strict()
  .superRefine((report, context) => {
    const evidence = report.providerEvidence;
    const expectedStatus = {
      accepted: "accepted",
      queued: "queued",
      deploying: "building",
      active: "ready",
      failed: "failed",
      action_required: "action_required",
    }[report.state];
    if (evidence.status !== expectedStatus) {
      context.addIssue({ code: "custom", message: "Provider status does not match release state" });
    }
    if (report.action === "accept" && report.state !== "accepted") {
      context.addIssue({ code: "custom", message: "Accept may only report durable acceptance" });
    }
    if (
      report.action === "activate" &&
      !["accepted", "queued", "deploying", "active", "failed", "action_required"].includes(
        report.state,
      )
    ) {
      context.addIssue({ code: "custom", message: "Activation returned an invalid state" });
    }
    if (report.action === "reconcile" && report.state === "accepted") {
      context.addIssue({
        code: "custom",
        message: "Reconciliation cannot invent a pending activation",
      });
    }
    if (report.state === "active") {
      if (
        !evidence.providerDeploymentId ||
        !evidence.publicUrl ||
        !evidence.deployedAt ||
        !evidence.rollback ||
        report.error !== null
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Active releases require provider deployment ID, URL, timestamp, and ready rollback target",
        });
      }
      if (
        evidence.rollback?.kind === "prior_deployment" &&
        evidence.rollback.providerDeploymentId === evidence.providerDeploymentId
      ) {
        context.addIssue({
          code: "custom",
          message: "A prior-deployment rollback target must differ from the active deployment",
        });
      }
    } else if (
      evidence.publicUrl !== null ||
      evidence.deployedAt !== null ||
      evidence.rollback !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "Only an active signed report may expose a public URL, deploy time, or rollback",
      });
    }
    if (
      (report.state === "failed" || report.state === "action_required") !==
      (report.error !== null)
    ) {
      context.addIssue({ code: "custom", message: "Only blocked terminal reports carry errors" });
    }
    if (report.error?.retryable) {
      context.addIssue({
        code: "custom",
        message: "Terminal provider reports must be non-retryable",
      });
    }
    if (
      ["accepted", "queued", "deploying"].includes(report.state) &&
      report.retryAfterSeconds === null
    ) {
      context.addIssue({ code: "custom", message: "In-flight reports require a retry interval" });
    }
    if (
      ["active", "failed", "action_required"].includes(report.state) &&
      report.retryAfterSeconds !== null
    ) {
      context.addIssue({ code: "custom", message: "Terminal reports cannot request polling" });
    }
    if (evidence.observedAt !== report.observedAt) {
      context.addIssue({ code: "custom", message: "Provider and runner observation times differ" });
    }
    const acceptedAt = Date.parse(report.acceptedAt);
    const observedAt = Date.parse(report.observedAt);
    if (evidence.deployedAt) {
      const deployedAt = Date.parse(evidence.deployedAt);
      if (deployedAt < acceptedAt || deployedAt > observedAt) {
        context.addIssue({
          code: "custom",
          message: "Provider deploy time must be inside the signed release observation window",
        });
      }
    }
    if (evidence.rollback) {
      const rollbackObservedAt = Date.parse(evidence.rollback.observedAt);
      if (rollbackObservedAt < acceptedAt || rollbackObservedAt > observedAt) {
        context.addIssue({
          code: "custom",
          message: "Rollback evidence must be inside the signed release observation window",
        });
      }
    }
  });
export type HarborProductionRunnerReport = z.infer<typeof HarborProductionRunnerReportSchema>;

const VERIFIED_REPORT = Symbol("verified-harbor-production-report");
const verifiedReports = new WeakSet<object>();
export type VerifiedHarborProductionRunnerReport = {
  report: HarborProductionRunnerReport;
  responseBody: string;
  signature: string;
  responseBodySha256: string;
  signatureSha256: string;
  [VERIFIED_REPORT]: true;
};

export function isVerifiedHarborProductionRunnerReport(
  value: unknown,
): value is VerifiedHarborProductionRunnerReport {
  return typeof value === "object" && value !== null && verifiedReports.has(value);
}

export class HarborProductionRunnerError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(code: string, retryable = false, retryAfterSeconds: number | null = null) {
    super(code);
    this.name = "HarborProductionRunnerError";
    this.code = code;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type HarborProductionRunnerConfiguration = { url: URL; secret: string };

export function harborProductionRunnerConfiguration(
  env: Record<string, string | undefined> = process.env,
): HarborProductionRunnerConfiguration {
  const rawUrl = env.HELIX_HARBOR_RUNNER_URL?.trim();
  const secret = env.HELIX_HARBOR_RUNNER_SECRET?.trim();
  if (!rawUrl && !secret) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_UNCONFIGURED");
  }
  if (!rawUrl || !secret || secret.length < 32) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_CONFIGURATION_INVALID");
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_CONFIGURATION_INVALID");
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_CONFIGURATION_INVALID");
  }
  return { url, secret };
}

export function isHarborProductionRunnerConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  try {
    harborProductionRunnerConfiguration(env);
    return true;
  } catch {
    return false;
  }
}

export function isHarborProductionRecoveryConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (
    env.HELIX_HARBOR_SWEEPER_ENABLED?.trim() === "true" &&
    (env.HELIX_HARBOR_SWEEPER_DISPATCH_SECRET?.trim().length ?? 0) >= 32
  );
}

export function assertHarborProductionPublishingConfigured(
  env: Record<string, string | undefined> = process.env,
): void {
  harborProductionRunnerConfiguration(env);
  if (!isHarborProductionRecoveryConfigured(env)) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RECOVERY_UNCONFIGURED");
  }
}

function ownedArrayBuffer(bytes: ArrayLike<number>): ArrayBuffer {
  const output = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) output[index] = bytes[index] ?? 0;
  return output.buffer;
}

export async function harborProductionHmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(new TextEncoder().encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    ownedArrayBuffer(new TextEncoder().encode(value)),
  );
  return Buffer.from(signed).toString("hex");
}

function signatureEqual(left: string, right: string): boolean {
  if (!SHA256_PATTERN.test(left) || !SHA256_PATTERN.test(right)) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function readBoundedResponse(response: Response): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    await response.body?.cancel().catch(() => undefined);
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_RESPONSE_TOO_LARGE");
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
        throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_RESPONSE_TOO_LARGE");
      }
      chunks.push(next.value);
    }
  } catch (error) {
    if (error instanceof HarborProductionRunnerError) throw error;
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_REQUEST_FAILED", true);
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
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_RESPONSE_INVALID");
  }
}

function sameIdentity(left: HarborProductionIdentity, right: HarborProductionIdentity): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function verifyRunnerResponse(input: {
  request: HarborProductionRunnerRequest;
  responseBody: string;
  presentedSignature: string;
  secret: string;
  now: () => number;
}): Promise<VerifiedHarborProductionRunnerReport> {
  const expected = await harborProductionHmacHex(
    input.secret,
    `${input.request.requestNonce}\n${input.responseBody}`,
  );
  if (!signatureEqual(input.presentedSignature, expected)) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_SIGNATURE_INVALID");
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(input.responseBody) as unknown;
  } catch {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_RESPONSE_INVALID");
  }
  const parsed = HarborProductionRunnerReportSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_RESPONSE_INVALID");
  }
  const report = parsed.data;
  if (report.requestNonce !== input.request.requestNonce) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_REPLAY_DETECTED");
  }
  if (
    report.action !== input.request.action ||
    report.releaseId !== input.request.releaseId ||
    report.idempotencyKey !== input.request.idempotencyKey ||
    !sameIdentity(report.identity, input.request.identity)
  ) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_RELEASE_MISMATCH");
  }
  const requestedAt = Date.parse(input.request.requestedAt);
  const acceptedAt = Date.parse(report.acceptedAt);
  const observedAt = Date.parse(report.observedAt);
  const now = input.now();
  if (
    !Number.isFinite(requestedAt) ||
    !Number.isFinite(acceptedAt) ||
    !Number.isFinite(observedAt) ||
    observedAt < requestedAt - MAX_CLOCK_SKEW_MS ||
    observedAt < acceptedAt ||
    observedAt > now + MAX_CLOCK_SKEW_MS
  ) {
    throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_TIMESTAMPS_INVALID");
  }
  const verified: VerifiedHarborProductionRunnerReport = {
    report,
    responseBody: input.responseBody,
    signature: input.presentedSignature,
    responseBodySha256: await sha256Utf8Hex(input.responseBody),
    signatureSha256: await sha256Utf8Hex(input.presentedSignature),
    [VERIFIED_REPORT]: true,
  };
  verifiedReports.add(verified);
  return verified;
}

export type HarborProductionProviderAdapter = {
  execute(input: {
    action: HarborProductionAction;
    releaseId: string;
    idempotencyKey: string;
    identity: HarborProductionIdentity;
    sourcePackage: HarborProductionPackage | null;
  }): Promise<VerifiedHarborProductionRunnerReport>;
};

export function createAuthenticatedHarborProductionProvider(
  options: {
    fetch?: typeof fetch;
    signal?: AbortSignal;
    env?: Record<string, string | undefined>;
    now?: () => number;
    nonce?: () => string;
  } = {},
): HarborProductionProviderAdapter {
  const configuration = harborProductionRunnerConfiguration(options.env);
  return {
    async execute(input) {
      const now = options.now ?? Date.now;
      const requestNonce = options.nonce?.() ?? crypto.randomUUID();
      const requestedAtMs = now();
      const request = HarborProductionRunnerRequestSchema.parse({
        kind: "helix_harbor_production_request",
        schemaVersion: "1.0.0",
        requestNonce,
        requestedAt: new Date(requestedAtMs).toISOString(),
        ...input,
      });
      const body = JSON.stringify(request);
      const timestamp = String(requestedAtMs);
      const signature = await harborProductionHmacHex(
        configuration.secret,
        `${timestamp}\n${requestNonce}\n${body}`,
      );
      let response: Response;
      try {
        const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        response = await (options.fetch ?? fetch)(configuration.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-helix-harbor-timestamp": timestamp,
            "x-helix-harbor-nonce": requestNonce,
            "x-helix-harbor-signature": signature,
          },
          body,
          redirect: "error",
          signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
        });
      } catch {
        throw new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_REQUEST_FAILED", true);
      }
      if (!response.ok) {
        throw new HarborProductionRunnerError(
          "HARBOR_PRODUCTION_RUNNER_REQUEST_FAILED",
          response.status >= 500,
        );
      }
      const responseBody = await readBoundedResponse(response);
      const presentedSignature =
        response.headers.get("x-helix-harbor-signature")?.trim().toLowerCase() ?? "";
      return verifyRunnerResponse({
        request,
        responseBody,
        presentedSignature,
        secret: configuration.secret,
        now,
      });
    },
  };
}

export async function callHarborProductionRunner(
  input: {
    action: HarborProductionAction;
    releaseId: string;
    idempotencyKey: string;
    identity: HarborProductionIdentity;
    sourcePackage: HarborProductionPackage | null;
  },
  options: Parameters<typeof createAuthenticatedHarborProductionProvider>[0] = {},
): Promise<VerifiedHarborProductionRunnerReport> {
  return createAuthenticatedHarborProductionProvider(options).execute(input);
}
