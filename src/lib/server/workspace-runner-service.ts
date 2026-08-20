import { sha256Hex } from "@/lib/server/agents/patch";
import {
  MAX_RUNNER_CLOCK_SKEW_MS,
  MAX_RUNNER_DURATION_MS,
  MAX_RUNNER_REQUEST_BYTES,
  WorkspaceRunnerReportSchema,
  WorkspaceRunnerRequestSchema,
  assertNodeWebProfile,
  workspaceRunnerHmacHex,
  workspaceRunnerSignatureEqual,
  type WorkspaceRunnerReport,
  type WorkspaceRunnerStep,
  type WorkspaceRunnerStepId,
} from "@/lib/server/workspace-runner";
import { verifyProductionWorkspaceCandidate } from "@/lib/workspace";
import { z } from "zod";

const WORKSPACE_ROOT = "/workspace/project";
const REGISTRY_HOSTS = ["registry.npmjs.org"] as const;
const NONCE_TTL_MS = MAX_RUNNER_CLOCK_SKEW_MS + MAX_RUNNER_DURATION_MS + 5 * 60 * 1_000;
const SETUP_TIMEOUT_MS = 30_000;
const DESTROY_TIMEOUT_MS = 30_000;
const OUTPUT_LIMIT_BYTES = 16 * 1024;
const MAX_PROCESSES = 32;

const FIXED_PROFILE = [
  {
    id: "install",
    argv: ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
    tool: "npm ci --ignore-scripts",
    timeoutMs: 150_000,
    networkPolicy: "package_registry_only",
  },
  {
    id: "typecheck",
    argv: ["npm", "run", "typecheck", "--"],
    tool: "npm run typecheck",
    timeoutMs: 75_000,
    networkPolicy: "disabled",
  },
  {
    id: "lint",
    argv: ["npm", "run", "lint", "--"],
    tool: "npm run lint",
    timeoutMs: 60_000,
    networkPolicy: "disabled",
  },
  {
    id: "test",
    argv: ["npm", "run", "test", "--"],
    tool: "npm run test",
    timeoutMs: 120_000,
    networkPolicy: "disabled",
  },
  {
    id: "build",
    argv: ["npm", "run", "build", "--"],
    tool: "npm run build",
    timeoutMs: 120_000,
    networkPolicy: "disabled",
  },
  {
    id: "security",
    argv: ["npm", "audit", "--omit=dev", "--audit-level=high", "--json"],
    tool: "npm audit --omit=dev --audit-level=high",
    timeoutMs: 45_000,
    networkPolicy: "package_registry_only",
  },
] as const satisfies readonly {
  id: WorkspaceRunnerStepId;
  argv: readonly string[];
  tool: string;
  timeoutMs: number;
  networkPolicy: "disabled" | "package_registry_only";
}[];

const SandboxCommandResultSchema = z
  .object({
    exitCode: z.number().int().min(0).max(255).nullable(),
    timedOut: z.boolean(),
    outputLimitExceeded: z.boolean(),
    stdout: z.string(),
    stderr: z.string(),
  })
  .strict();

export type WorkspaceRunnerNetworkPolicy =
  | { mode: "disabled"; allowedHosts: readonly [] }
  | { mode: "package_registry_only"; allowedHosts: readonly string[] };

export type WorkspaceRunnerSandboxCommandResult = z.infer<typeof SandboxCommandResultSchema>;

export type WorkspaceRunnerSandbox = {
  readonly provider: string;
  readonly id: string;
  writeFiles(
    files: readonly { path: string; content: string }[],
    options: { root: string; timeoutMs: number },
  ): Promise<void>;
  setNetworkPolicy(
    policy: WorkspaceRunnerNetworkPolicy,
    options: { timeoutMs: number },
  ): Promise<void>;
  exec(
    argv: readonly string[],
    options: {
      cwd: string;
      timeoutMs: number;
      maxOutputBytes: number;
      killProcessTreeOnTimeout: true;
    },
  ): Promise<WorkspaceRunnerSandboxCommandResult>;
  destroy(options: { timeoutMs: number }): Promise<void>;
};

export type WorkspaceRunnerSandboxFactory = {
  create(options: {
    sandboxId: string;
    root: string;
    limits: {
      timeoutMs: number;
      maxProcesses: number;
      memoryMb: number;
      diskMb: number;
    };
    environment: Readonly<Record<string, string>>;
    inheritServiceEnvironment: false;
    networkDefault: "disabled";
  }): Promise<WorkspaceRunnerSandbox>;
};

export type WorkspaceRunnerReplayStore = {
  claim(input: { nonceSha256: string; expiresAtMs: number }): Promise<boolean>;
};

export type WorkspaceRunnerServiceDependencies = {
  secret: string;
  replayStore: WorkspaceRunnerReplayStore;
  sandboxFactory: WorkspaceRunnerSandboxFactory;
  now?: () => number;
};

class ServiceRejection extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "ServiceRejection";
    this.status = status;
    this.code = code;
  }
}

function errorResponse(status: number, code: string): Response {
  return new Response(
    JSON.stringify({
      kind: "helix_workspace_validation_error",
      schemaVersion: "1.1.0",
      error: code,
    }),
    {
      status,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}

function integerHeader(value: string | null): number {
  if (!value || !/^\d{10,16}$/u.test(value)) {
    throw new ServiceRejection(401, "WORKSPACE_RUNNER_AUTH_INVALID");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new ServiceRejection(401, "WORKSPACE_RUNNER_AUTH_INVALID");
  }
  return parsed;
}

async function readBoundedBody(request: Request): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/u.test(declared)) {
      throw new ServiceRejection(400, "WORKSPACE_RUNNER_CONTENT_LENGTH_INVALID");
    }
    if (Number(declared) > MAX_RUNNER_REQUEST_BYTES) {
      throw new ServiceRejection(413, "WORKSPACE_RUNNER_REQUEST_TOO_LARGE");
    }
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_RUNNER_REQUEST_BYTES) {
        await reader.cancel();
        throw new ServiceRejection(413, "WORKSPACE_RUNNER_REQUEST_TOO_LARGE");
      }
      chunks.push(next.value);
    }
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
    throw new ServiceRejection(400, "WORKSPACE_RUNNER_REQUEST_INVALID");
  }
}

function redactOutput(value: string, secret: string): string {
  let redacted = value.split(secret).join("[REDACTED]");
  redacted = redacted
    .replace(
      /-----BEGIN [^-\r\n]{0,80}PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]{0,80}PRIVATE KEY-----/giu,
      "[REDACTED_PRIVATE_KEY]",
    )
    .replace(
      /\b(?:sk|xai|ghp|gho|ghu|ghs|github_pat)[-_][A-Za-z0-9_-]{16,}\b/gu,
      "[REDACTED_TOKEN]",
    )
    .replace(
      /\b(?:authorization|api[_-]?key|client[_-]?secret|password|token)\s*[:=]\s*[^\s,;]+/giu,
      "credential=[REDACTED]",
    )
    .replace(/https?:\/\/[^\s/@:]+:[^\s/@]+@/giu, "https://[REDACTED]@");
  return redacted;
}

async function boundedOutputEvidence(
  value: string,
  secret: string,
  limitBytes: number,
): Promise<{ sha256: string; truncated: boolean; retainedBytes: number }> {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(value);
  const redactedBytes = encoder.encode(redactOutput(value, secret));
  const boundedBytes = redactedBytes.subarray(0, limitBytes);
  const bounded = new TextDecoder().decode(boundedBytes);
  return {
    sha256: await sha256Hex(bounded),
    truncated: rawBytes.byteLength > limitBytes || redactedBytes.byteLength > limitBytes,
    retainedBytes: boundedBytes.byteLength,
  };
}

function notRunStep(id: WorkspaceRunnerStepId, reason: string): WorkspaceRunnerStep {
  return {
    id,
    status: "not_run",
    evidence: "not_run",
    tool: "not_run",
    exitCode: null,
    startedAt: null,
    completedAt: null,
    durationMs: 0,
    networkPolicy: "not_applied",
    stdoutSha256: null,
    stderrSha256: null,
    outputTruncated: false,
    detail: reason,
  };
}

function disabledNetworkPolicy(): WorkspaceRunnerNetworkPolicy {
  return { mode: "disabled", allowedHosts: [] };
}

function networkPolicyFor(
  mode: "disabled" | "package_registry_only",
): WorkspaceRunnerNetworkPolicy {
  return mode === "disabled"
    ? disabledNetworkPolicy()
    : { mode: "package_registry_only", allowedHosts: REGISTRY_HOSTS };
}

async function runFixedProfile(input: {
  sandbox: WorkspaceRunnerSandbox;
  secret: string;
  startedAtMs: number;
  now: () => number;
}): Promise<WorkspaceRunnerStep[]> {
  const steps: WorkspaceRunnerStep[] = [];
  let blockedReason: string | undefined;

  for (const profile of FIXED_PROFILE) {
    if (blockedReason) {
      steps.push(notRunStep(profile.id, blockedReason));
      continue;
    }
    const elapsed = Math.max(0, input.now() - input.startedAtMs);
    const remaining = MAX_RUNNER_DURATION_MS - elapsed;
    if (remaining <= 0) {
      blockedReason = "Not run because the runner-wide deadline was reached";
      steps.push(notRunStep(profile.id, blockedReason));
      continue;
    }

    const timeoutMs = Math.max(1, Math.min(profile.timeoutMs, remaining));
    let policyApplied = false;
    let commandStartedAtMs: number | undefined;
    let commandCompletedAtMs: number | undefined;
    let commandResult: WorkspaceRunnerSandboxCommandResult | undefined;
    let commandFailure = false;
    let resetFailure = false;

    try {
      await input.sandbox.setNetworkPolicy(networkPolicyFor(profile.networkPolicy), {
        timeoutMs: SETUP_TIMEOUT_MS,
      });
      policyApplied = true;
      commandStartedAtMs = input.now();
      try {
        commandResult = SandboxCommandResultSchema.parse(
          await input.sandbox.exec(profile.argv, {
            cwd: WORKSPACE_ROOT,
            timeoutMs,
            maxOutputBytes: OUTPUT_LIMIT_BYTES,
            killProcessTreeOnTimeout: true,
          }),
        );
      } catch {
        commandFailure = true;
      }
      commandCompletedAtMs = Math.max(commandStartedAtMs, input.now());
    } catch {
      policyApplied = false;
    } finally {
      try {
        await input.sandbox.setNetworkPolicy(disabledNetworkPolicy(), {
          timeoutMs: SETUP_TIMEOUT_MS,
        });
      } catch {
        resetFailure = true;
      }
    }

    if (!policyApplied || commandStartedAtMs === undefined || commandCompletedAtMs === undefined) {
      blockedReason = resetFailure
        ? "Not run because the sandbox network policy could not be safely reset"
        : "Not run because the required sandbox network policy could not be applied";
      steps.push(notRunStep(profile.id, blockedReason));
      continue;
    }

    const stdout = await boundedOutputEvidence(
      commandResult?.stdout ?? "",
      input.secret,
      OUTPUT_LIMIT_BYTES,
    );
    const stderr = await boundedOutputEvidence(
      commandFailure ? "WORKSPACE_RUNNER_EXECUTION_ERROR" : (commandResult?.stderr ?? ""),
      input.secret,
      Math.max(0, OUTPUT_LIMIT_BYTES - stdout.retainedBytes),
    );
    const outputTruncated =
      stdout.truncated || stderr.truncated || Boolean(commandResult?.outputLimitExceeded);
    let status: "passed" | "failed" | "timed_out";
    let exitCode: number | null;
    let detail: string;
    if (commandFailure || !commandResult || resetFailure) {
      status = "failed";
      exitCode = null;
      detail = resetFailure
        ? `${profile.id} failed because the sandbox network policy could not be reset`
        : `${profile.id} failed inside the isolated runner`;
    } else if (commandResult.timedOut) {
      status = "timed_out";
      exitCode = commandResult.exitCode === 0 ? null : commandResult.exitCode;
      detail = `${profile.id} exceeded its isolated runner deadline`;
    } else if (outputTruncated) {
      status = "failed";
      exitCode = commandResult.exitCode === 0 ? null : commandResult.exitCode;
      detail = `${profile.id} exceeded the isolated runner output limit`;
    } else if (commandResult.exitCode === 0) {
      status = "passed";
      exitCode = 0;
      detail = `${profile.id} completed successfully in the isolated runner`;
    } else {
      status = "failed";
      exitCode = commandResult.exitCode;
      detail = `${profile.id} failed in the isolated runner`;
    }

    steps.push({
      id: profile.id,
      status,
      evidence: "measured",
      tool: profile.tool,
      exitCode,
      startedAt: new Date(commandStartedAtMs).toISOString(),
      completedAt: new Date(commandCompletedAtMs).toISOString(),
      durationMs: commandCompletedAtMs - commandStartedAtMs,
      networkPolicy: profile.networkPolicy,
      stdoutSha256: stdout.sha256,
      stderrSha256: stderr.sha256,
      outputTruncated,
      detail,
    });
    if (status !== "passed") {
      blockedReason = `Not run because the preceding ${profile.id} step did not pass`;
    }
  }

  return steps;
}

async function validateIncomingRequest(input: {
  request: Request;
  secret: string;
  replayStore: WorkspaceRunnerReplayStore;
  now: () => number;
}): Promise<z.infer<typeof WorkspaceRunnerRequestSchema>> {
  if (input.request.method !== "POST") {
    throw new ServiceRejection(405, "WORKSPACE_RUNNER_METHOD_NOT_ALLOWED");
  }
  if (!input.request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ServiceRejection(415, "WORKSPACE_RUNNER_CONTENT_TYPE_INVALID");
  }
  const receivedAtMs = input.now();
  const timestampText = input.request.headers.get("x-helix-runner-timestamp");
  const timestampMs = integerHeader(timestampText);
  if (Math.abs(receivedAtMs - timestampMs) > MAX_RUNNER_CLOCK_SKEW_MS) {
    throw new ServiceRejection(401, "WORKSPACE_RUNNER_TIMESTAMP_INVALID");
  }
  const headerNonce = input.request.headers.get("x-helix-runner-nonce")?.trim() ?? "";
  const presentedSignature =
    input.request.headers.get("x-helix-runner-signature")?.trim().toLowerCase() ?? "";
  const body = await readBoundedBody(input.request);
  const expectedSignature = await workspaceRunnerHmacHex(
    input.secret,
    `${timestampText}\n${headerNonce}\n${body}`,
  );
  if (!workspaceRunnerSignatureEqual(presentedSignature, expectedSignature)) {
    throw new ServiceRejection(401, "WORKSPACE_RUNNER_AUTH_INVALID");
  }

  let json: unknown;
  try {
    json = JSON.parse(body) as unknown;
  } catch {
    throw new ServiceRejection(400, "WORKSPACE_RUNNER_REQUEST_INVALID");
  }
  const parsed = WorkspaceRunnerRequestSchema.safeParse(json);
  if (!parsed.success) {
    throw new ServiceRejection(400, "WORKSPACE_RUNNER_REQUEST_INVALID");
  }
  if (parsed.data.requestNonce !== headerNonce) {
    throw new ServiceRejection(401, "WORKSPACE_RUNNER_AUTH_INVALID");
  }
  if (Date.parse(parsed.data.requestedAt) !== timestampMs) {
    throw new ServiceRejection(401, "WORKSPACE_RUNNER_TIMESTAMP_INVALID");
  }
  const nonceSha256 = await sha256Hex(parsed.data.requestNonce);
  const claimed = await input.replayStore.claim({
    nonceSha256,
    expiresAtMs: receivedAtMs + NONCE_TTL_MS,
  });
  if (!claimed) {
    throw new ServiceRejection(409, "WORKSPACE_RUNNER_REPLAY_DETECTED");
  }

  const verification = await verifyProductionWorkspaceCandidate(
    parsed.data.files,
    parsed.data.candidate,
  );
  if (!verification.valid) {
    throw new ServiceRejection(422, "WORKSPACE_RUNNER_CANDIDATE_INVALID");
  }
  try {
    assertNodeWebProfile(parsed.data.files);
  } catch {
    throw new ServiceRejection(422, "WORKSPACE_RUNNER_PROFILE_INVALID");
  }
  return parsed.data;
}

export function createWorkspaceRunnerService(
  dependencies: WorkspaceRunnerServiceDependencies,
): (request: Request) => Promise<Response> {
  const secret = dependencies.secret.trim();
  if (secret.length < 32) {
    throw new Error("WORKSPACE_RUNNER_CONFIGURATION_INVALID");
  }
  const now = dependencies.now ?? Date.now;

  return async (request: Request): Promise<Response> => {
    let validated: z.infer<typeof WorkspaceRunnerRequestSchema>;
    try {
      validated = await validateIncomingRequest({
        request,
        secret,
        replayStore: dependencies.replayStore,
        now,
      });
    } catch (error) {
      if (error instanceof ServiceRejection) {
        return errorResponse(error.status, error.code);
      }
      return errorResponse(500, "WORKSPACE_RUNNER_SERVICE_ERROR");
    }

    const executionStartedAtMs = now();
    const nonceSha256 = await sha256Hex(validated.requestNonce);
    const sandboxId = `helix-${nonceSha256.slice(0, 32)}`;
    let sandbox: WorkspaceRunnerSandbox | undefined;
    let steps: WorkspaceRunnerStep[] | undefined;
    let destroyed = false;
    let executionError = false;

    try {
      sandbox = await dependencies.sandboxFactory.create({
        sandboxId,
        root: WORKSPACE_ROOT,
        limits: {
          timeoutMs: MAX_RUNNER_DURATION_MS,
          maxProcesses: MAX_PROCESSES,
          memoryMb: 1_024,
          diskMb: 2_048,
        },
        environment: {
          CI: "true",
          NODE_ENV: "test",
          npm_config_audit: "false",
          npm_config_fund: "false",
          npm_config_registry: "https://registry.npmjs.org/",
        },
        inheritServiceEnvironment: false,
        networkDefault: "disabled",
      });
      const files = validated.candidate.files.map((descriptor) => ({
        path: `${WORKSPACE_ROOT}/${descriptor.path}`,
        content: validated.files[descriptor.path] ?? "",
      }));
      await sandbox.writeFiles(files, { root: WORKSPACE_ROOT, timeoutMs: SETUP_TIMEOUT_MS });
      steps = await runFixedProfile({
        sandbox,
        secret,
        startedAtMs: executionStartedAtMs,
        now,
      });
    } catch {
      executionError = true;
    } finally {
      if (sandbox) {
        try {
          await sandbox.destroy({ timeoutMs: DESTROY_TIMEOUT_MS });
          destroyed = true;
        } catch {
          destroyed = false;
        }
      }
    }

    if (executionError || !sandbox || !steps || !destroyed) {
      return errorResponse(503, "WORKSPACE_RUNNER_SANDBOX_FAILED");
    }
    const completedAtMs = Math.max(executionStartedAtMs, now());
    const durationMs = completedAtMs - executionStartedAtMs;
    if (durationMs > MAX_RUNNER_DURATION_MS) {
      return errorResponse(504, "WORKSPACE_RUNNER_DEADLINE_EXCEEDED");
    }

    let report: WorkspaceRunnerReport;
    try {
      report = WorkspaceRunnerReportSchema.parse({
        kind: "helix_workspace_validation_report",
        schemaVersion: "1.1.0",
        requestNonce: validated.requestNonce,
        candidateSha256: validated.candidate.sourceSha256,
        runner: {
          provider: sandbox.provider,
          isolation: "container",
          sandboxIdSha256: await sha256Hex(sandbox.id),
          destroyed: true,
          networkDefault: "disabled",
        },
        startedAt: new Date(executionStartedAtMs).toISOString(),
        completedAt: new Date(completedAtMs).toISOString(),
        durationMs,
        steps,
      });
    } catch {
      return errorResponse(500, "WORKSPACE_RUNNER_REPORT_INVALID");
    }

    const body = JSON.stringify(report);
    const signature = await workspaceRunnerHmacHex(secret, `${validated.requestNonce}\n${body}`);
    return new Response(body, {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "content-length": String(new TextEncoder().encode(body).byteLength),
        "x-helix-runner-signature": signature,
      },
    });
  };
}

export const WORKSPACE_RUNNER_FIXED_PROFILE = FIXED_PROFILE;
