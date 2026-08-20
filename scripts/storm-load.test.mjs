import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { STORM_LIMITS, runStormLoad, validateStormTarget } from "./storm-load.mjs";

const RUNNER = fileURLToPath(new URL("./storm-load.mjs", import.meta.url));

async function localServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP test server address.");
  }
  return {
    url: `http://127.0.0.1:${address.port}/storm`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function runCli(arguments_, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RUNNER, ...arguments_], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

test("Storm sends no traffic unless the explicit confirmation flag is present", async (t) => {
  let requests = 0;
  const server = await localServer((_request, response) => {
    requests += 1;
    response.end("unexpected");
  });
  t.after(server.close);

  const result = await runCli(["--target", server.url, "--requests", "5"]);
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "not_run");
  assert.equal(report.evidence, "not_run");
  assert.equal(report.reasonCode, "confirmation_required");
  assert.equal(Object.hasOwn(report, "metrics"), false);
  assert.equal(requests, 0);
  assert.match(report.targetSha256, /^[0-9a-f]{64}$/);
  assert.match(report.artifactSha256, /^[0-9a-f]{64}$/);
});

test("Storm performs a bounded real HTTP load test and reports measured metrics", async (t) => {
  let requests = 0;
  const server = await localServer((request, response) => {
    requests += 1;
    const requestNumber = requests;
    assert.equal(request.method, "GET");
    response.statusCode = requestNumber % 4 === 0 ? 503 : 200;
    response.setHeader("content-type", "text/plain");
    response.end(`response-${requestNumber}`);
  });
  t.after(server.close);

  const result = await runCli([
    "--confirm-load-test",
    "--target",
    server.url,
    "--requests",
    "12",
    "--concurrency",
    "3",
    "--duration-ms",
    "30000",
    "--timeout-ms",
    "10000",
  ]);
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);

  assert.equal(report.status, "completed");
  assert.equal(report.evidence, "measured");
  assert.equal(report.runner, "helix-storm-node-fetch");
  assert.equal(report.method, "GET");
  assert.equal(requests, 12);
  assert.equal(report.metrics.attemptedRequests, 12);
  assert.equal(report.metrics.responseCount, 12);
  assert.equal(report.metrics.successfulRequests, 9);
  assert.equal(report.metrics.failedRequests, 3);
  assert.equal(report.metrics.httpErrorResponses, 3);
  assert.equal(report.metrics.transportErrors, 0);
  assert.equal(report.metrics.statusCounts["200"], 9);
  assert.equal(report.metrics.statusCounts["503"], 3);
  assert.equal(report.metrics.errorCounts.http_5xx, 3);
  assert.equal(report.metrics.errorRate, 0.25);
  assert.equal(report.metrics.errorRatePercent, 25);
  assert.equal(report.metrics.concurrency.configured, 3);
  assert.equal(report.metrics.concurrency.peak, 3);
  assert.ok(report.metrics.requestsPerSecond > 0);
  assert.ok(report.metrics.elapsedMs > 0);
  assert.equal(report.metrics.latencyMs.sampleCount, 12);
  assert.ok(report.metrics.latencyMs.min <= report.metrics.latencyMs.p50);
  assert.ok(report.metrics.latencyMs.p50 <= report.metrics.latencyMs.p95);
  assert.ok(report.metrics.latencyMs.p95 <= report.metrics.latencyMs.p99);
  assert.ok(report.metrics.latencyMs.p99 <= report.metrics.latencyMs.max);
  assert.match(report.targetSha256, /^[0-9a-f]{64}$/);
  assert.match(report.artifactSha256, /^[0-9a-f]{64}$/);
});

test("external targets require an exact explicitly allowlisted origin", async () => {
  const denied = await runStormLoad({
    target: "https://example.com/load?token=secret",
    confirmed: true,
    requests: 1,
    env: {},
  });
  assert.equal(denied.status, "not_run");
  assert.equal(denied.reasonCode, "target_not_allowed");
  assert.equal(denied.target, "https://example.com/load?[REDACTED]");
  assert.doesNotMatch(JSON.stringify(denied), /token=secret/);

  const allowed = validateStormTarget("https://example.com/load", {
    HELIX_STORM_ALLOWED_ORIGINS: "https://example.com",
  });
  assert.equal(allowed.origin, "https://example.com");
  assert.throws(
    () =>
      validateStormTarget("https://other.example/load", {
        HELIX_STORM_ALLOWED_ORIGINS: "https://example.com",
      }),
    /only targets loopback/i,
  );
});

test("hard bounds refuse oversized runs instead of silently clamping them", async () => {
  const report = await runStormLoad({
    target: "http://127.0.0.1:1/",
    confirmed: true,
    requests: STORM_LIMITS.requests.max + 1,
  });
  assert.equal(report.status, "not_run");
  assert.equal(report.reasonCode, "option_out_of_bounds");
  assert.equal(Object.hasOwn(report, "metrics"), false);
});
