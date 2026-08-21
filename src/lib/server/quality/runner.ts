import { z } from "zod";
import { sha256Hex } from "@/lib/server/agents/patch";
import { createBrowserQualityNotRun } from "@/lib/server/quality/browser";
import {
  EchoAccessibilityReportSchema,
  SwiftPerformanceReportSchema,
  TwinBrowserReportSchema,
  type EchoAccessibilityReport,
  type SwiftPerformanceReport,
  type TwinBrowserReport,
} from "@/lib/server/quality/types";
import { createTwinNotRunReport } from "@/lib/server/twin";

const MAX_BROWSER_RUNNER_RESPONSE_BYTES = 9 * 1024 * 1024;
const MAX_INLINE_SCREENSHOT_BYTES = 3 * 1024 * 1024;
const RUNNER_TIMEOUT_MS = 150_000;

const InlineScreenshotSchema = z
  .object({
    viewport: z.string().min(1).max(80),
    mediaType: z.literal("image/png"),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    dataBase64: z.string().min(1).max(Math.ceil((MAX_INLINE_SCREENSHOT_BYTES * 4) / 3) + 8),
  })
  .strict();

const BrowserRunnerResponseSchema = z
  .object({
    twin: TwinBrowserReportSchema,
    echo: EchoAccessibilityReportSchema,
    swift: SwiftPerformanceReportSchema,
    screenshots: z.array(InlineScreenshotSchema).max(4).default([]),
  })
  .strict();

export type BrowserQualityRun = {
  twin: TwinBrowserReport;
  echo: EchoAccessibilityReport;
  swift: SwiftPerformanceReport;
  /** Ephemeral evidence for Iris. It is deliberately not stored in BuildJob. */
  screenshotBase64?: string;
};

export class BrowserRunnerError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable = false) {
    super(code);
    this.name = "BrowserRunnerError";
    this.code = code;
    this.retryable = retryable;
  }
}

function runnerConfiguration(): { url: URL; secret: string } | null {
  const rawUrl = process.env.HELIX_BROWSER_RUNNER_URL?.trim();
  const secret = process.env.HELIX_BROWSER_RUNNER_SECRET?.trim();
  if (!rawUrl && !secret) return null;
  if (!rawUrl || !secret || secret.length < 32) {
    throw new BrowserRunnerError("BROWSER_RUNNER_CONFIGURATION_INVALID");
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BrowserRunnerError("BROWSER_RUNNER_CONFIGURATION_INVALID");
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(
    url.hostname,
  );
  if (
    (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new BrowserRunnerError("BROWSER_RUNNER_CONFIGURATION_INVALID");
  }
  return { url, secret };
}

function ownedArrayBuffer(bytes: ArrayLike<number>): ArrayBuffer {
  const output = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    output[index] = bytes[index] ?? 0;
  }
  return output.buffer;
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(encoder.encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    ownedArrayBuffer(encoder.encode(value)),
  );
  return Buffer.from(signature).toString("hex");
}

async function sha256BytesHex(bytes: ArrayLike<number>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes));
  return Buffer.from(digest).toString("hex");
}

function redactEvidenceText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:gh[oprsu]|github_pat)_[A-Za-z0-9_]{12,}\b/gi, "[REDACTED_TOKEN]")
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]{12,}\b/gi, "[REDACTED_TOKEN]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]")
    .replace(/https?:\/\/[^\s?#]+\?[^\s#]*/gi, (url) => `${url.split("?", 1)[0]}?[REDACTED_QUERY]`)
    .replace(/\b(password|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 2_000);
}

function sanitizeReports(
  input: z.infer<typeof BrowserRunnerResponseSchema>,
): z.infer<typeof BrowserRunnerResponseSchema> {
  const twin =
    input.twin.status === "completed"
      ? {
          ...input.twin,
          consoleErrors: input.twin.consoleErrors.map(redactEvidenceText),
          runtimeErrors: input.twin.runtimeErrors.map(redactEvidenceText),
          actions: input.twin.actions.map((action) => ({
            ...action,
            label: redactEvidenceText(action.label).slice(0, 240),
            ...(action.detail
              ? { detail: redactEvidenceText(action.detail).slice(0, 500) }
              : {}),
          })),
          screenshots: input.twin.screenshots.map((screenshot) => ({
            ...screenshot,
            path: `evidence://${screenshot.viewport}/${screenshot.sha256}.png`,
          })),
        }
      : input.twin.status === "failed"
        ? { ...input.twin, detail: redactEvidenceText(input.twin.detail) }
        : { ...input.twin, detail: redactEvidenceText(input.twin.detail) };
  const echo =
    input.echo.status === "completed"
      ? {
          ...input.echo,
          findings: input.echo.findings.map((finding) => ({
            ...finding,
            message: redactEvidenceText(finding.message).slice(0, 500),
            samples: finding.samples.map((sample) =>
              redactEvidenceText(sample).slice(0, 240),
            ),
          })),
        }
      : { ...input.echo, detail: redactEvidenceText(input.echo.detail) };
  const swift =
    input.swift.status === "completed"
      ? input.swift
      : { ...input.swift, detail: redactEvidenceText(input.swift.detail) };
  return BrowserRunnerResponseSchema.parse({ ...input, twin, echo, swift });
}

function constantTimeEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(RUNNER_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function notRun(html: string): Promise<BrowserQualityRun> {
  const [twin, browser] = await Promise.all([
    createTwinNotRunReport(
      html,
      "browser_runner_unconfigured",
      "No authenticated browser runner is configured; no browser actions were executed.",
    ),
    createBrowserQualityNotRun({
      html,
      reasonCode: "browser_runner_unconfigured",
      detail:
        "No authenticated browser runner is configured; accessibility and performance were not measured.",
    }),
  ]);
  return { twin, ...browser };
}

async function validateScreenshotEvidence(
  parsed: z.infer<typeof BrowserRunnerResponseSchema>,
): Promise<string | undefined> {
  if (parsed.twin.status !== "completed") {
    if (parsed.screenshots.length) {
      throw new BrowserRunnerError("BROWSER_RUNNER_UNEXPECTED_SCREENSHOTS");
    }
    return undefined;
  }
  const evidenceByViewport = new Map(
    parsed.screenshots.map((screenshot) => [screenshot.viewport, screenshot]),
  );
  for (const metadata of parsed.twin.screenshots) {
    const evidence = evidenceByViewport.get(metadata.viewport);
    if (!evidence || evidence.sha256 !== metadata.sha256) {
      throw new BrowserRunnerError("BROWSER_RUNNER_SCREENSHOT_MISMATCH");
    }
    const bytes = Buffer.from(evidence.dataBase64, "base64");
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (
      bytes.byteLength === 0 ||
      bytes.byteLength > MAX_INLINE_SCREENSHOT_BYTES ||
      pngSignature.some((byte, index) => bytes[index] !== byte) ||
      bytes.byteLength !== metadata.bytes ||
      (await sha256BytesHex(bytes)) !== metadata.sha256
    ) {
      throw new BrowserRunnerError("BROWSER_RUNNER_SCREENSHOT_MISMATCH");
    }
  }
  const desktop =
    parsed.screenshots.find((screenshot) => screenshot.viewport === "desktop") ??
    parsed.screenshots[0];
  return desktop?.dataBase64;
}

export async function runBrowserQuality(input: {
  html: string;
  jobId: string;
  signal?: AbortSignal;
}): Promise<BrowserQualityRun> {
  const configured = runnerConfiguration();
  if (!configured) return notRun(input.html);

  const artifactSha256 = await sha256Hex(input.html);
  const requestBody = JSON.stringify({
    version: "1.0.0",
    jobId: input.jobId,
    artifactSha256,
    html: input.html,
    requested: ["twin", "echo", "swift"],
    viewports: [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "phone", width: 390, height: 844 },
    ],
  });
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const requestSignature = await hmacHex(
    configured.secret,
    `${timestamp}\n${nonce}\n${requestBody}`,
  );

  let response: Response;
  try {
    response = await fetch(configured.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-helix-runner-timestamp": timestamp,
        "x-helix-runner-nonce": nonce,
        "x-helix-runner-signature": requestSignature,
      },
      body: requestBody,
      redirect: "error",
      signal: requestSignal(input.signal),
    });
  } catch {
    throw new BrowserRunnerError("BROWSER_RUNNER_REQUEST_FAILED", true);
  }
  if (!response.ok) {
    throw new BrowserRunnerError("BROWSER_RUNNER_REQUEST_FAILED", response.status >= 500);
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_BROWSER_RUNNER_RESPONSE_BYTES
  ) {
    throw new BrowserRunnerError("BROWSER_RUNNER_RESPONSE_TOO_LARGE");
  }
  const responseText = await response.text();
  if (Buffer.byteLength(responseText, "utf8") > MAX_BROWSER_RUNNER_RESPONSE_BYTES) {
    throw new BrowserRunnerError("BROWSER_RUNNER_RESPONSE_TOO_LARGE");
  }
  const presentedSignature =
    response.headers.get("x-helix-runner-signature")?.trim().toLowerCase() ?? "";
  const expectedSignature = await hmacHex(
    configured.secret,
    `${nonce}\n${responseText}`,
  );
  if (!constantTimeEqual(presentedSignature, expectedSignature)) {
    throw new BrowserRunnerError("BROWSER_RUNNER_SIGNATURE_INVALID");
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(responseText) as unknown;
  } catch {
    throw new BrowserRunnerError("BROWSER_RUNNER_RESPONSE_INVALID");
  }
  const parsed = BrowserRunnerResponseSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new BrowserRunnerError("BROWSER_RUNNER_RESPONSE_INVALID");
  }
  for (const report of [parsed.data.twin, parsed.data.echo, parsed.data.swift]) {
    if (report.artifactSha256 !== artifactSha256) {
      throw new BrowserRunnerError("BROWSER_RUNNER_ARTIFACT_MISMATCH");
    }
  }
  const screenshotBase64 = await validateScreenshotEvidence(parsed.data);
  const sanitized = sanitizeReports(parsed.data);
  return {
    twin: sanitized.twin,
    echo: sanitized.echo,
    swift: sanitized.swift,
    ...(screenshotBase64 ? { screenshotBase64 } : {}),
  };
}
