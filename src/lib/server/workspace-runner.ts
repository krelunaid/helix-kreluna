import { z } from "zod";
import {
  WorkspaceCandidateSchema,
  WorkspaceValidationSchema,
  verifyProductionWorkspaceCandidate,
  type WorkspaceCandidate,
  type WorkspaceValidation,
} from "@/lib/workspace";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
export const MAX_RUNNER_REQUEST_BYTES = 6 * 1024 * 1024;
export const MAX_RUNNER_RESPONSE_BYTES = 256 * 1024;
export const MAX_RUNNER_DURATION_MS = 10 * 60 * 1_000;
const RUNNER_REQUEST_TIMEOUT_MS = 12 * 60 * 1_000;
export const MAX_RUNNER_CLOCK_SKEW_MS = 5 * 60 * 1_000;

export const WorkspaceRunnerStepIdSchema = z.enum([
  "install",
  "typecheck",
  "lint",
  "test",
  "build",
  "security",
]);
export type WorkspaceRunnerStepId = z.infer<typeof WorkspaceRunnerStepIdSchema>;

const WorkspaceRunnerLimitsSchema = z
  .object({
    timeoutMs: z.literal(MAX_RUNNER_DURATION_MS),
    maxOutputBytesPerStep: z.literal(16 * 1024),
    maxProcesses: z.literal(32),
  })
  .strict();

export const WorkspaceRunnerRequestSchema = z
  .object({
    kind: z.literal("helix_workspace_validation_request"),
    schemaVersion: z.literal("1.1.0"),
    requestNonce: z.string().uuid(),
    requestedAt: z.string().datetime({ offset: true }),
    profile: z.literal("node_web_v1"),
    candidate: WorkspaceCandidateSchema,
    files: z.record(z.string(), z.string()),
    steps: z.tuple([
      z.literal("install"),
      z.literal("typecheck"),
      z.literal("lint"),
      z.literal("test"),
      z.literal("build"),
      z.literal("security"),
    ]),
    limits: WorkspaceRunnerLimitsSchema,
  })
  .strict();
export type WorkspaceRunnerRequest = z.infer<typeof WorkspaceRunnerRequestSchema>;

export const WorkspaceRunnerStepSchema = z
  .object({
    id: WorkspaceRunnerStepIdSchema,
    status: z.enum(["passed", "failed", "timed_out", "not_run"]),
    evidence: z.enum(["measured", "not_run"]),
    tool: z.string().trim().min(1).max(160),
    exitCode: z.number().int().min(0).max(255).nullable(),
    startedAt: z.string().datetime({ offset: true }).nullable(),
    completedAt: z.string().datetime({ offset: true }).nullable(),
    durationMs: z.number().int().nonnegative().max(MAX_RUNNER_DURATION_MS),
    networkPolicy: z.enum(["disabled", "package_registry_only", "not_applied"]),
    stdoutSha256: z.string().regex(SHA256_PATTERN).nullable(),
    stderrSha256: z.string().regex(SHA256_PATTERN).nullable(),
    outputTruncated: z.boolean(),
    detail: z.string().trim().min(1).max(1_000),
  })
  .strict()
  .superRefine((step, context) => {
    if (step.status === "not_run") {
      if (
        step.evidence !== "not_run" ||
        step.exitCode !== null ||
        step.startedAt !== null ||
        step.completedAt !== null ||
        step.durationMs !== 0 ||
        step.networkPolicy !== "not_applied" ||
        step.stdoutSha256 !== null ||
        step.stderrSha256 !== null ||
        step.outputTruncated
      ) {
        context.addIssue({
          code: "custom",
          message: "A not-run step cannot claim measured execution evidence",
        });
      }
      return;
    }
    const expectedNetworkPolicy =
      step.id === "install" || step.id === "security" ? "package_registry_only" : "disabled";
    if (step.networkPolicy !== expectedNetworkPolicy) {
      context.addIssue({
        code: "custom",
        path: ["networkPolicy"],
        message: `${step.id} must use ${expectedNetworkPolicy} network policy`,
      });
    }
    if (step.evidence !== "measured" || step.startedAt === null || step.completedAt === null) {
      context.addIssue({
        code: "custom",
        message: "An executed runner step requires measured evidence and timestamps",
      });
    }
    if (step.stdoutSha256 === null || step.stderrSha256 === null) {
      context.addIssue({
        code: "custom",
        message: "An executed runner step requires bounded output hashes",
      });
    }
    if (step.status === "passed" && step.exitCode !== 0) {
      context.addIssue({
        code: "custom",
        path: ["exitCode"],
        message: "A passed runner step must have exit code 0",
      });
    }
    if (step.status !== "passed" && step.exitCode === 0) {
      context.addIssue({
        code: "custom",
        path: ["exitCode"],
        message: "A failed runner step cannot have exit code 0",
      });
    }
  });
export type WorkspaceRunnerStep = z.infer<typeof WorkspaceRunnerStepSchema>;

export const WorkspaceRunnerReportSchema = z
  .object({
    kind: z.literal("helix_workspace_validation_report"),
    schemaVersion: z.literal("1.1.0"),
    requestNonce: z.string().uuid(),
    candidateSha256: z.string().regex(SHA256_PATTERN),
    runner: z
      .object({
        provider: z.string().trim().min(1).max(120),
        isolation: z.literal("container"),
        sandboxIdSha256: z.string().regex(SHA256_PATTERN),
        destroyed: z.literal(true),
        networkDefault: z.literal("disabled"),
      })
      .strict(),
    startedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }),
    durationMs: z.number().int().nonnegative().max(MAX_RUNNER_DURATION_MS),
    steps: z.array(WorkspaceRunnerStepSchema).length(6),
  })
  .strict()
  .superRefine((report, context) => {
    const expected = WorkspaceRunnerStepIdSchema.options;
    const ids = report.steps.map((step) => step.id);
    if (ids.some((id, index) => id !== expected[index])) {
      context.addIssue({
        code: "custom",
        path: ["steps"],
        message: "Runner report steps must use the fixed profile order",
      });
    }
  });
export type WorkspaceRunnerReport = z.infer<typeof WorkspaceRunnerReportSchema>;

export type WorkspaceRunnerValidationResult = {
  candidate: WorkspaceCandidate;
  report: WorkspaceRunnerReport;
  validations: WorkspaceValidation[];
};

export class WorkspaceRunnerError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable = false) {
    super(code);
    this.name = "WorkspaceRunnerError";
    this.code = code;
    this.retryable = retryable;
  }
}

function runnerConfiguration(): { url: URL; secret: string } {
  const rawUrl = process.env.HELIX_WORKSPACE_RUNNER_URL?.trim();
  const secret = process.env.HELIX_WORKSPACE_RUNNER_SECRET?.trim();
  if (!rawUrl && !secret) {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_UNCONFIGURED");
  }
  if (!rawUrl || !secret || secret.length < 32) {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_CONFIGURATION_INVALID");
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_CONFIGURATION_INVALID");
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_CONFIGURATION_INVALID");
  }
  return { url, secret };
}

/** Validate the server-only runner boundary without exposing its URL or secret. */
export function assertProductionWorkspaceRunnerConfigured(): void {
  runnerConfiguration();
}

function ownedArrayBuffer(bytes: ArrayLike<number>): ArrayBuffer {
  const output = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    output[index] = bytes[index] ?? 0;
  }
  return output.buffer;
}

export async function workspaceRunnerHmacHex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(encoder.encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, ownedArrayBuffer(encoder.encode(value)));
  return Buffer.from(signature).toString("hex");
}

export function workspaceRunnerSignatureEqual(left: string, right: string): boolean {
  if (!SHA256_PATTERN.test(left) || !SHA256_PATTERN.test(right)) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(RUNNER_REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function readBoundedRunnerResponse(response: Response): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/u.test(declared)) {
      await response.body?.cancel().catch(() => undefined);
      throw new WorkspaceRunnerError("WORKSPACE_RUNNER_RESPONSE_INVALID");
    }
    if (Number(declared) > MAX_RUNNER_RESPONSE_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw new WorkspaceRunnerError("WORKSPACE_RUNNER_RESPONSE_TOO_LARGE");
    }
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
      if (total > MAX_RUNNER_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new WorkspaceRunnerError("WORKSPACE_RUNNER_RESPONSE_TOO_LARGE");
      }
      chunks.push(next.value);
    }
  } catch (error) {
    if (error instanceof WorkspaceRunnerError) throw error;
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_REQUEST_FAILED", true);
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_RESPONSE_INVALID");
  }
}

function stepTimestampIsValid(step: WorkspaceRunnerStep): boolean {
  if (step.status === "not_run") {
    return step.startedAt === null && step.completedAt === null && step.durationMs === 0;
  }
  if (step.startedAt === null || step.completedAt === null) return false;
  const started = Date.parse(step.startedAt);
  const completed = Date.parse(step.completedAt);
  const measuredDuration = completed - started;
  return (
    completed >= started &&
    measuredDuration <= MAX_RUNNER_DURATION_MS &&
    Math.abs(measuredDuration - step.durationMs) <= 1_000
  );
}

function reportTimestampIsValid(report: WorkspaceRunnerReport, requestedAtMs: number): boolean {
  const started = Date.parse(report.startedAt);
  const completed = Date.parse(report.completedAt);
  const now = Date.now();
  const measuredDuration = completed - started;
  return (
    started >= requestedAtMs - MAX_RUNNER_CLOCK_SKEW_MS &&
    completed >= started &&
    measuredDuration <= MAX_RUNNER_DURATION_MS &&
    Math.abs(measuredDuration - report.durationMs) <= 1_000 &&
    completed <= now + MAX_RUNNER_CLOCK_SKEW_MS &&
    report.steps.every(
      (step) =>
        stepTimestampIsValid(step) &&
        (step.status === "not_run" ||
          (step.startedAt !== null &&
            step.completedAt !== null &&
            Date.parse(step.startedAt) >= started - 1_000 &&
            Date.parse(step.completedAt) <= completed + 1_000)),
    )
  );
}

function validationsFromReport(report: WorkspaceRunnerReport): WorkspaceValidation[] {
  const scopes = ["typecheck", "lint", "test", "build", "security"] as const;
  return scopes.map((scope) => {
    const step = report.steps.find((candidate) => candidate.id === scope);
    if (!step || step.status !== "passed" || step.exitCode !== 0) {
      throw new WorkspaceRunnerError("WORKSPACE_RUNNER_VALIDATION_FAILED");
    }
    return WorkspaceValidationSchema.parse({
      scope,
      status: "passed",
      evidence: "measured",
      detail: step.detail,
      tool: step.tool,
      completedAt: step.completedAt,
      evidencePaths: [],
    });
  });
}

export function assertNodeWebProfile(files: Readonly<Record<string, string>>): void {
  if (!files["package.json"] || !files["package-lock.json"]) {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_PROFILE_INVALID");
  }
  let packageJson: unknown;
  try {
    packageJson = JSON.parse(files["package.json"]);
  } catch {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_PROFILE_INVALID");
  }
  const parsed = z
    .object({
      scripts: z
        .object({
          typecheck: z.string().trim().min(1).max(500),
          lint: z.string().trim().min(1).max(500),
          test: z.string().trim().min(1).max(500),
          build: z.string().trim().min(1).max(500),
        })
        .passthrough(),
    })
    .passthrough()
    .safeParse(packageJson);
  if (!parsed.success) {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_PROFILE_INVALID");
  }
  try {
    const lockfile = JSON.parse(files["package-lock.json"]) as {
      lockfileVersion?: unknown;
    };
    if (
      typeof lockfile.lockfileVersion !== "number" ||
      !Number.isInteger(lockfile.lockfileVersion) ||
      lockfile.lockfileVersion < 2
    ) {
      throw new Error("unsupported lockfile");
    }
  } catch {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_PROFILE_INVALID");
  }
}

export async function runProductionWorkspaceValidation(input: {
  files: Readonly<Record<string, string>>;
  candidate: WorkspaceCandidate;
  signal?: AbortSignal;
}): Promise<WorkspaceRunnerValidationResult> {
  const verification = await verifyProductionWorkspaceCandidate(input.files, input.candidate);
  if (!verification.valid) {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_CANDIDATE_INVALID");
  }
  assertNodeWebProfile(input.files);
  const configured = runnerConfiguration();
  const requestNonce = crypto.randomUUID();
  const requestedAt = new Date();
  const request = WorkspaceRunnerRequestSchema.parse({
    kind: "helix_workspace_validation_request",
    schemaVersion: "1.1.0",
    requestNonce,
    requestedAt: requestedAt.toISOString(),
    profile: "node_web_v1",
    candidate: input.candidate,
    files: input.files,
    steps: ["install", "typecheck", "lint", "test", "build", "security"],
    limits: {
      timeoutMs: MAX_RUNNER_DURATION_MS,
      maxOutputBytesPerStep: 16 * 1024,
      maxProcesses: 32,
    },
  });
  const requestBody = JSON.stringify(request);
  if (Buffer.byteLength(requestBody, "utf8") > MAX_RUNNER_REQUEST_BYTES) {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_REQUEST_TOO_LARGE");
  }
  const timestamp = requestedAt.getTime().toString();
  const requestSignature = await workspaceRunnerHmacHex(
    configured.secret,
    `${timestamp}\n${requestNonce}\n${requestBody}`,
  );

  let response: Response;
  try {
    response = await fetch(configured.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-helix-runner-timestamp": timestamp,
        "x-helix-runner-nonce": requestNonce,
        "x-helix-runner-signature": requestSignature,
      },
      body: requestBody,
      redirect: "error",
      signal: requestSignal(input.signal),
    });
  } catch {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_REQUEST_FAILED", true);
  }
  if (!response.ok) {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_REQUEST_FAILED", response.status >= 500);
  }
  const responseText = await readBoundedRunnerResponse(response);
  const presentedSignature =
    response.headers.get("x-helix-runner-signature")?.trim().toLowerCase() ?? "";
  const expectedSignature = await workspaceRunnerHmacHex(
    configured.secret,
    `${requestNonce}\n${responseText}`,
  );
  if (!workspaceRunnerSignatureEqual(presentedSignature, expectedSignature)) {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_SIGNATURE_INVALID");
  }

  let candidateResponse: unknown;
  try {
    candidateResponse = JSON.parse(responseText) as unknown;
  } catch {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_RESPONSE_INVALID");
  }
  const parsed = WorkspaceRunnerReportSchema.safeParse(candidateResponse);
  if (!parsed.success) {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_RESPONSE_INVALID");
  }
  const report = parsed.data;
  if (report.requestNonce !== requestNonce) {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_REPLAY_DETECTED");
  }
  if (report.candidateSha256 !== input.candidate.sourceSha256) {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_CANDIDATE_MISMATCH");
  }
  if (!reportTimestampIsValid(report, requestedAt.getTime())) {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_TIMESTAMPS_INVALID");
  }
  if (report.steps.some((step) => step.status !== "passed" || step.exitCode !== 0)) {
    throw new WorkspaceRunnerError("WORKSPACE_RUNNER_VALIDATION_FAILED");
  }

  return {
    candidate: input.candidate,
    report,
    validations: validationsFromReport(report),
  };
}
