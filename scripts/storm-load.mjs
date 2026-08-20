#!/usr/bin/env node

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DEFAULT_TARGET = "http://127.0.0.1:8080/";
const ALLOWLIST_ENV = "HELIX_STORM_ALLOWED_ORIGINS";
const MAX_RESPONSE_BYTES = 1_048_576;

export const STORM_LIMITS = Object.freeze({
  requests: Object.freeze({ default: 20, min: 1, max: 500 }),
  concurrency: Object.freeze({ default: 2, min: 1, max: 20 }),
  durationMs: Object.freeze({ default: 5_000, min: 100, max: 30_000 }),
  timeoutMs: Object.freeze({ default: 2_000, min: 50, max: 10_000 }),
});

class StormConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StormConfigurationError";
    this.code = code;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function boundedInteger(value, name, limits) {
  if (!/^\d+$/.test(String(value))) {
    throw new StormConfigurationError(
      "invalid_numeric_option",
      `${name} must be an integer between ${limits.min} and ${limits.max}.`,
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < limits.min || parsed > limits.max) {
    throw new StormConfigurationError(
      "option_out_of_bounds",
      `${name} must be between ${limits.min} and ${limits.max}.`,
    );
  }
  return parsed;
}

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new StormConfigurationError("missing_option_value", `${option} requires a value.`);
  }
  return value;
}

export function parseStormArguments(argv = []) {
  const config = {
    target: DEFAULT_TARGET,
    confirmed: false,
    requests: STORM_LIMITS.requests.default,
    concurrency: STORM_LIMITS.concurrency.default,
    durationMs: STORM_LIMITS.durationMs.default,
    timeoutMs: STORM_LIMITS.timeoutMs.default,
  };
  const seen = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (seen.has(option)) {
      throw new StormConfigurationError("duplicate_option", `${option} may only be provided once.`);
    }
    seen.add(option);

    if (option === "--confirm-load-test") {
      config.confirmed = true;
      continue;
    }
    if (option === "--help") {
      config.help = true;
      continue;
    }

    const value = optionValue(argv, index, option);
    index += 1;
    if (option === "--target") {
      config.target = value;
    } else if (option === "--requests") {
      config.requests = boundedInteger(value, option, STORM_LIMITS.requests);
    } else if (option === "--concurrency") {
      config.concurrency = boundedInteger(value, option, STORM_LIMITS.concurrency);
    } else if (option === "--duration-ms") {
      config.durationMs = boundedInteger(value, option, STORM_LIMITS.durationMs);
    } else if (option === "--timeout-ms") {
      config.timeoutMs = boundedInteger(value, option, STORM_LIMITS.timeoutMs);
    } else {
      throw new StormConfigurationError("unknown_option", `Unsupported Storm option: ${option}.`);
    }
  }

  return config;
}

function normalizeUrl(rawTarget) {
  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    throw new StormConfigurationError(
      "invalid_target",
      "The Storm target must be a valid http or https URL.",
    );
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new StormConfigurationError(
      "invalid_target_protocol",
      "The Storm target must use http or https.",
    );
  }
  if (target.username || target.password) {
    throw new StormConfigurationError(
      "target_credentials_forbidden",
      "Credentials are not allowed in a Storm target URL.",
    );
  }
  target.hash = "";
  return target;
}

function loopbackHostname(hostname) {
  const unwrapped =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  const normalized = unwrapped.toLowerCase();
  if (normalized === "localhost" || normalized === "::1") return true;
  if (isIP(normalized) !== 4) return false;
  return normalized.split(".")[0] === "127";
}

function configuredOrigins(env) {
  const value = env?.[ALLOWLIST_ENV]?.trim();
  if (!value) return new Set();
  const origins = new Set();
  for (const entry of value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)) {
    const allowed = normalizeUrl(entry);
    if (
      allowed.pathname !== "/" ||
      allowed.search ||
      allowed.hash ||
      allowed.username ||
      allowed.password
    ) {
      throw new StormConfigurationError(
        "invalid_target_allowlist",
        `${ALLOWLIST_ENV} entries must be exact origins without paths or credentials.`,
      );
    }
    origins.add(allowed.origin);
  }
  return origins;
}

export function validateStormTarget(rawTarget, env = process.env) {
  const target = normalizeUrl(rawTarget);
  if (!loopbackHostname(target.hostname) && !configuredOrigins(env).has(target.origin)) {
    throw new StormConfigurationError(
      "target_not_allowed",
      `Storm only targets loopback by default. Add an exact origin to ${ALLOWLIST_ENV} to opt in to an external target.`,
    );
  }
  return target;
}

function validateRunBounds(options) {
  return {
    requests: boundedInteger(
      options.requests ?? STORM_LIMITS.requests.default,
      "requests",
      STORM_LIMITS.requests,
    ),
    concurrency: boundedInteger(
      options.concurrency ?? STORM_LIMITS.concurrency.default,
      "concurrency",
      STORM_LIMITS.concurrency,
    ),
    durationMs: boundedInteger(
      options.durationMs ?? STORM_LIMITS.durationMs.default,
      "durationMs",
      STORM_LIMITS.durationMs,
    ),
    timeoutMs: boundedInteger(
      options.timeoutMs ?? STORM_LIMITS.timeoutMs.default,
      "timeoutMs",
      STORM_LIMITS.timeoutMs,
    ),
  };
}

function canonicalTarget(target) {
  return `${target.origin}${target.pathname}${target.search}`;
}

function publicTarget(target) {
  return `${target.origin}${target.pathname}${target.search ? "?[REDACTED]" : ""}`;
}

function identity(rawTarget, limits) {
  let canonical = String(rawTarget ?? DEFAULT_TARGET);
  let display = "[INVALID_OR_UNPARSED_TARGET]";
  try {
    const target = normalizeUrl(canonical);
    canonical = canonicalTarget(target);
    display = publicTarget(target);
  } catch {
    // Invalid targets are still fingerprinted without being echoed into reports.
  }
  const targetSha256 = sha256(canonical);
  const artifactSha256 = sha256(
    JSON.stringify({
      kind: "storm_load_target",
      targetSha256,
      requests: limits?.requests ?? null,
      concurrency: limits?.concurrency ?? null,
      durationMs: limits?.durationMs ?? null,
      timeoutMs: limits?.timeoutMs ?? null,
    }),
  );
  return { display, targetSha256, artifactSha256 };
}

function baseReport(status, rawTarget, limits) {
  const reportIdentity = identity(rawTarget, limits);
  return {
    kind: "storm_load_test",
    version: "1.0.0",
    status,
    generatedAt: new Date().toISOString(),
    target: reportIdentity.display,
    targetSha256: reportIdentity.targetSha256,
    artifactSha256: reportIdentity.artifactSha256,
  };
}

function notRunReport(rawTarget, limits, reasonCode, detail) {
  return {
    ...baseReport("not_run", rawTarget, limits),
    evidence: "not_run",
    reasonCode,
    detail,
  };
}

function failedReport(rawTarget, limits, reasonCode, detail) {
  return {
    ...baseReport("failed", rawTarget, limits),
    evidence: "failed",
    reasonCode,
    detail,
  };
}

async function consumeBoundedBody(response) {
  if (!response.body) return { bytes: 0, limitExceeded: false };
  const reader = response.body.getReader();
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return { bytes, limitExceeded: false };
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel("STORM_RESPONSE_BODY_LIMIT").catch(() => undefined);
      return { bytes, limitExceeded: true };
    }
  }
}

function transportErrorCode(error, timedOut) {
  if (timedOut || error?.name === "AbortError") return "request_timeout";
  const causeCode = error?.cause?.code;
  if (typeof causeCode === "string" && /^[A-Z0-9_]+$/.test(causeCode)) {
    return causeCode.toLowerCase();
  }
  return "transport_error";
}

async function requestSample(target, timeoutMs) {
  const startedAt = performance.now();
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(target, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "*/*",
        "cache-control": "no-cache",
        "user-agent": "Helix-Storm/1.0",
      },
    });
    const body = await consumeBoundedBody(response);
    const primaryError = body.limitExceeded
      ? "response_body_limit"
      : response.status >= 400
        ? `http_${Math.floor(response.status / 100)}xx`
        : undefined;
    return {
      latencyMs: performance.now() - startedAt,
      statusCode: response.status,
      bytes: body.bytes,
      errorCode: primaryError,
      responseLimitExceeded: body.limitExceeded,
    };
  } catch (error) {
    return {
      latencyMs: performance.now() - startedAt,
      statusCode: undefined,
      bytes: 0,
      errorCode: transportErrorCode(error, timedOut),
      responseLimitExceeded: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function nearestRank(sortedValues, percentile) {
  if (sortedValues.length === 0) return undefined;
  const index = Math.max(0, Math.ceil(percentile * sortedValues.length) - 1);
  return sortedValues[index];
}

function countBy(samples, selector) {
  const counts = {};
  for (const sample of samples) {
    const key = selector(sample);
    if (key === undefined) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function measuredMetrics(samples, elapsedMs, configuredConcurrency, peakConcurrency) {
  const latencies = samples.map((sample) => sample.latencyMs).sort((a, b) => a - b);
  const totalLatency = latencies.reduce((sum, latency) => sum + latency, 0);
  const responseCount = samples.filter((sample) => sample.statusCode !== undefined).length;
  const transportErrors = samples.length - responseCount;
  const httpErrorResponses = samples.filter(
    (sample) => sample.statusCode !== undefined && sample.statusCode >= 400,
  ).length;
  const responseLimitErrors = samples.filter((sample) => sample.responseLimitExceeded).length;
  const failedRequests = samples.filter((sample) => sample.errorCode !== undefined).length;
  const totalResponseBytes = samples.reduce((sum, sample) => sum + sample.bytes, 0);
  const seconds = Math.max(elapsedMs / 1_000, Number.EPSILON);

  return {
    attemptedRequests: samples.length,
    responseCount,
    successfulRequests: samples.length - failedRequests,
    failedRequests,
    transportErrors,
    httpErrorResponses,
    responseLimitErrors,
    totalResponseBytes,
    requestsPerSecond: round(samples.length / seconds),
    errorRate: round(failedRequests / samples.length, 6),
    errorRatePercent: round((failedRequests / samples.length) * 100, 4),
    elapsedMs: round(elapsedMs),
    concurrency: {
      configured: configuredConcurrency,
      peak: peakConcurrency,
    },
    latencyMs: {
      sampleCount: latencies.length,
      min: round(latencies[0]),
      mean: round(totalLatency / latencies.length),
      p50: round(nearestRank(latencies, 0.5)),
      p95: round(nearestRank(latencies, 0.95)),
      p99: round(nearestRank(latencies, 0.99)),
      max: round(latencies[latencies.length - 1]),
    },
    statusCounts: countBy(samples, (sample) =>
      sample.statusCode === undefined ? undefined : String(sample.statusCode),
    ),
    errorCounts: countBy(samples, (sample) => sample.errorCode),
  };
}

export async function runStormLoad(options = {}) {
  const rawTarget = options.target ?? DEFAULT_TARGET;
  let limits;
  try {
    limits = validateRunBounds(options);
  } catch (error) {
    if (error instanceof StormConfigurationError) {
      return notRunReport(rawTarget, undefined, error.code, error.message);
    }
    throw error;
  }

  if (options.confirmed !== true) {
    return notRunReport(
      rawTarget,
      limits,
      "confirmation_required",
      "No traffic was sent. Re-run with --confirm-load-test to authorize this bounded load test.",
    );
  }

  let target;
  try {
    target = validateStormTarget(rawTarget, options.env ?? process.env);
  } catch (error) {
    if (error instanceof StormConfigurationError) {
      return notRunReport(rawTarget, limits, error.code, error.message);
    }
    throw error;
  }

  const startedAt = performance.now();
  const deadline = startedAt + limits.durationMs;
  const samples = [];
  let nextRequest = 0;
  let activeRequests = 0;
  let peakConcurrency = 0;

  async function worker() {
    while (nextRequest < limits.requests && performance.now() < deadline) {
      nextRequest += 1;
      activeRequests += 1;
      peakConcurrency = Math.max(peakConcurrency, activeRequests);
      const remainingMs = Math.max(1, deadline - performance.now());
      try {
        samples.push(
          await requestSample(target, Math.max(1, Math.min(limits.timeoutMs, remainingMs))),
        );
      } finally {
        activeRequests -= 1;
      }
    }
  }

  try {
    const workerCount = Math.min(limits.concurrency, limits.requests);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  } catch {
    return failedReport(
      rawTarget,
      limits,
      "runner_failure",
      "The runner failed before it could produce a complete measured report.",
    );
  }

  const elapsedMs = performance.now() - startedAt;
  if (samples.length === 0) {
    return failedReport(
      rawTarget,
      limits,
      "no_requests_executed",
      "Storm was authorized but did not execute a request.",
    );
  }

  return {
    ...baseReport("completed", rawTarget, limits),
    evidence: "measured",
    runner: "helix-storm-node-fetch",
    method: "GET",
    redirectPolicy: "manual",
    limits: {
      requestedRequests: limits.requests,
      requestedConcurrency: limits.concurrency,
      maxDurationMs: limits.durationMs,
      requestTimeoutMs: limits.timeoutMs,
      maxResponseBytes: MAX_RESPONSE_BYTES,
    },
    metrics: measuredMetrics(samples, elapsedMs, limits.concurrency, peakConcurrency),
  };
}

function usage() {
  return [
    "Storm sends no traffic without --confirm-load-test.",
    `Default target: ${DEFAULT_TARGET}`,
    "Options: --target URL --requests N --concurrency N --duration-ms N --timeout-ms N",
    `External targets require an exact origin in ${ALLOWLIST_ENV}.`,
  ].join(" ");
}

export async function runStormCli(argv = process.argv.slice(2), env = process.env) {
  let config;
  try {
    config = parseStormArguments(argv);
  } catch (error) {
    if (error instanceof StormConfigurationError) {
      return {
        report: notRunReport(DEFAULT_TARGET, undefined, error.code, error.message),
        exitCode: 2,
      };
    }
    return {
      report: failedReport(
        DEFAULT_TARGET,
        undefined,
        "runner_failure",
        "Storm could not parse its configuration.",
      ),
      exitCode: 1,
    };
  }

  if (config.help) {
    return {
      report: notRunReport(config.target, config, "help_requested", usage()),
      exitCode: 0,
    };
  }

  const report = await runStormLoad({ ...config, env });
  const exitCode =
    report.status === "failed"
      ? 1
      : report.status === "not_run" && report.reasonCode !== "confirmation_required"
        ? 2
        : 0;
  return { report, exitCode };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  const { report, exitCode } = await runStormCli();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = exitCode;
}
