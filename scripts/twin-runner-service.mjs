#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EchoAccessibilityReportSchema,
  SwiftPerformanceReportSchema,
  TwinBrowserReportSchema,
} from "../src/lib/server/quality/types.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MAX_REQUEST_BYTES = 384 * 1024;
const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const RUN_TIMEOUT_MS = 180_000;
// A request timestamp may be one full skew window in the future. Keep the
// claim beyond that complete acceptance window and the bounded browser run.
const NONCE_TTL_MS = MAX_CLOCK_SKEW_MS + RUN_TIMEOUT_MS + 5 * 60 * 1_000;
const REPLAY_TABLE = "helix_browser_runner_replay_nonces";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(secret, value) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function equalSignature(left, right) {
  if (!/^[0-9a-f]{64}$/i.test(left ?? "") || !/^[0-9a-f]{64}$/i.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

class RunnerRejection extends Error {
  constructor(status, code, authenticatedNonce) {
    super(code);
    this.name = "RunnerRejection";
    this.status = status;
    this.code = code;
    this.authenticatedNonce = authenticatedNonce;
  }
}

/**
 * Validate the standalone service configuration without opening a connection.
 * The executable intentionally has no volatile replay-store fallback: a real
 * service must have a durable, shared PostgreSQL authority before it listens.
 */
export function parseTwinRunnerServiceConfiguration(environment = process.env) {
  const secret = environment.HELIX_BROWSER_RUNNER_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("HELIX_BROWSER_RUNNER_SECRET must contain at least 32 characters");
  }
  const replayDatabaseUrl =
    environment.HELIX_BROWSER_RUNNER_REPLAY_DATABASE_URL?.trim();
  if (!replayDatabaseUrl) {
    throw new Error(
      "HELIX_BROWSER_RUNNER_REPLAY_DATABASE_URL is required; volatile replay stores are test-only",
    );
  }
  let parsed;
  try {
    parsed = new URL(replayDatabaseUrl);
  } catch {
    throw new Error("HELIX_BROWSER_RUNNER_REPLAY_DATABASE_URL must be a PostgreSQL URL");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.hash
  ) {
    throw new Error("HELIX_BROWSER_RUNNER_REPLAY_DATABASE_URL must be a PostgreSQL URL");
  }
  return { secret, replayDatabaseUrl };
}

/**
 * PostgreSQL is the replay authority for the standalone browser runner. The
 * unique key plus conditional upsert makes `claim` atomic across requests,
 * processes and service restarts. Callers must not substitute a volatile store
 * outside explicit tests.
 */
export function createPostgresTwinRunnerReplayStore(client) {
  if (!client || typeof client.query !== "function") {
    throw new Error("RUNNER_REPLAY_STORE_INVALID");
  }
  return {
    async initialize() {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${REPLAY_TABLE} (
          nonce_sha256 TEXT PRIMARY KEY CHECK (nonce_sha256 ~ '^[0-9a-f]{64}$'),
          expires_at TIMESTAMPTZ NOT NULL,
          claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS helix_browser_runner_replay_expiry_idx
        ON ${REPLAY_TABLE} (expires_at)
      `);
      await client.query(`DELETE FROM ${REPLAY_TABLE} WHERE expires_at <= NOW()`);
    },
    async claim(input) {
      if (
        !/^[0-9a-f]{64}$/.test(input?.nonceSha256 ?? "") ||
        !Number.isSafeInteger(input?.expiresAtMs) ||
        input.expiresAtMs <= 0
      ) {
        throw new Error("RUNNER_REPLAY_CLAIM_INVALID");
      }
      const result = await client.query(
        `
          INSERT INTO ${REPLAY_TABLE} (nonce_sha256, expires_at)
          VALUES ($1, TO_TIMESTAMP($2 / 1000.0))
          ON CONFLICT (nonce_sha256) DO UPDATE
          SET expires_at = EXCLUDED.expires_at, claimed_at = NOW()
          WHERE ${REPLAY_TABLE}.expires_at <= NOW()
          RETURNING nonce_sha256
        `,
        [input.nonceSha256, input.expiresAtMs],
      );
      const claimed = Array.isArray(result?.rows) && result.rows.length === 1;
      // Keep the durable table bounded. Failure is fail-closed even after a
      // successful claim: the nonce remains claimed and browser work never runs.
      await client.query(
        `DELETE FROM ${REPLAY_TABLE} WHERE expires_at <= NOW() AND nonce_sha256 <> $1`,
        [input.nonceSha256],
      );
      return claimed;
    },
  };
}

async function body(request) {
  const declared = Number(request.headers["content-length"] ?? "0");
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    throw new RunnerRejection(413, "RUNNER_REQUEST_TOO_LARGE");
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.byteLength;
    if (bytes > MAX_REQUEST_BYTES) {
      throw new RunnerRejection(413, "RUNNER_REQUEST_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function authenticate(request, requestBody, dependencies) {
  const timestamp = String(request.headers["x-helix-runner-timestamp"] ?? "");
  const nonce = String(request.headers["x-helix-runner-nonce"] ?? "");
  const signature = String(request.headers["x-helix-runner-signature"] ?? "");
  const timestampNumber = Number(timestamp);
  const receivedAtMs = dependencies.now();
  if (
    !Number.isFinite(timestampNumber) ||
    Math.abs(receivedAtMs - timestampNumber) > MAX_CLOCK_SKEW_MS ||
    !/^[0-9a-f-]{36}$/i.test(nonce) ||
    !equalSignature(
      signature,
      hmac(dependencies.secret, `${timestamp}\n${nonce}\n${requestBody}`),
    )
  ) {
    throw new RunnerRejection(401, "RUNNER_UNAUTHORIZED");
  }
  let claimed;
  try {
    claimed = await dependencies.replayStore.claim({
      nonceSha256: sha256(nonce),
      expiresAtMs: receivedAtMs + NONCE_TTL_MS,
    });
  } catch {
    throw new RunnerRejection(503, "RUNNER_REPLAY_STORE_UNAVAILABLE", nonce);
  }
  if (!claimed) {
    throw new RunnerRejection(409, "RUNNER_REPLAY_DETECTED", nonce);
  }
  return nonce;
}

function assertRunRoute(request) {
  if (request.method !== "POST" || request.url !== "/run") {
    throw new RunnerRejection(404, "RUNNER_ROUTE_NOT_FOUND");
  }
}

function validateInput(candidate) {
  if (
    !candidate ||
    candidate.version !== "1.0.0" ||
    typeof candidate.jobId !== "string" ||
    candidate.jobId.length < 8 ||
    candidate.jobId.length > 160 ||
    typeof candidate.html !== "string" ||
    candidate.html.length < 400 ||
    candidate.html.length > 256_000 ||
    !/^[0-9a-f]{64}$/.test(candidate.artifactSha256) ||
    sha256(candidate.html) !== candidate.artifactSha256 ||
    JSON.stringify(candidate.requested) !== JSON.stringify(["twin", "echo", "swift"])
  ) {
    throw new Error("RUNNER_INPUT_INVALID");
  }
  return candidate;
}

function runCli(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "ignore", "pipe"],
      shell: false,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4_000);
    });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      rejectRun(new Error("RUNNER_TIMEOUT"));
    }, RUN_TIMEOUT_MS);
    child.once("error", (error) => {
      clearTimeout(timeout);
      rejectRun(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0 || code === 1 || code === 2) resolveRun();
      else rejectRun(new Error(stderr ? "RUNNER_PROCESS_FAILED" : "RUNNER_PROCESS_EXITED"));
    });
  });
}

async function executeBrowserRun(input) {
  const directory = await mkdtemp(join(tmpdir(), "helix-twin-runner-"));
  try {
    const inputPath = join(directory, "artifact.json");
    const twinPath = join(directory, "twin.json");
    const echoPath = join(directory, "echo.json");
    const swiftPath = join(directory, "swift.json");
    const screenshotsPath = join(directory, "screenshots");
    await writeFile(
      inputPath,
      JSON.stringify({
        html: input.html,
        artifactSha256: input.artifactSha256,
      }),
      "utf8",
    );
    await runCli([
      resolve(ROOT, "scripts/twin-browser.mjs"),
      "--input",
      inputPath,
      "--output",
      twinPath,
      "--echo-output",
      echoPath,
      "--swift-output",
      swiftPath,
      "--screenshots",
      screenshotsPath,
      "--require-browser",
    ]);
    const [twin, echo, swift] = await Promise.all([
      readFile(twinPath, "utf8").then((value) =>
        TwinBrowserReportSchema.parse(JSON.parse(value)),
      ),
      readFile(echoPath, "utf8").then((value) =>
        EchoAccessibilityReportSchema.parse(JSON.parse(value)),
      ),
      readFile(swiftPath, "utf8").then((value) =>
        SwiftPerformanceReportSchema.parse(JSON.parse(value)),
      ),
    ]);
    const screenshots = [];
    if (twin.status === "completed") {
      for (const metadata of twin.screenshots) {
        const screenshot = await readFile(
          join(screenshotsPath, `${metadata.viewport}.png`),
        );
        if (
          screenshot.byteLength > MAX_SCREENSHOT_BYTES ||
          screenshot.byteLength !== metadata.bytes ||
          sha256(screenshot) !== metadata.sha256
        ) {
          throw new Error("RUNNER_SCREENSHOT_INVALID");
        }
        screenshots.push({
          viewport: metadata.viewport,
          mediaType: "image/png",
          sha256: metadata.sha256,
          dataBase64: screenshot.toString("base64"),
        });
      }
    }
    return { twin, echo, swift, screenshots };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function signedJson(response, status, nonce, payload, secret) {
  const responseBody = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(responseBody),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-helix-runner-signature": hmac(secret, `${nonce}\n${responseBody}`),
  });
  response.end(responseBody);
}

export function createTwinRunnerRequestHandler(dependencies) {
  const secret = dependencies?.secret?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("HELIX_BROWSER_RUNNER_SECRET must contain at least 32 characters");
  }
  if (!dependencies.replayStore || typeof dependencies.replayStore.claim !== "function") {
    throw new Error("RUNNER_DURABLE_REPLAY_STORE_REQUIRED");
  }
  const now = dependencies.now ?? Date.now;
  const execute = dependencies.executeBrowserRun ?? executeBrowserRun;

  return async (request, response) => {
    let nonce = "unauthenticated";
    try {
      const requestBody = await body(request);
      nonce = await authenticate(request, requestBody, {
        secret,
        replayStore: dependencies.replayStore,
        now,
      });
      assertRunRoute(request);
      let candidate;
      try {
        candidate = JSON.parse(requestBody);
      } catch {
        throw new RunnerRejection(400, "RUNNER_INPUT_INVALID");
      }
      let input;
      try {
        input = validateInput(candidate);
      } catch {
        throw new RunnerRejection(400, "RUNNER_INPUT_INVALID");
      }
      signedJson(response, 200, nonce, await execute(input), secret);
    } catch (error) {
      const rejection = error instanceof RunnerRejection ? error : undefined;
      if (rejection?.authenticatedNonce) nonce = rejection.authenticatedNonce;
      if (nonce === "unauthenticated") {
        response.writeHead(rejection?.status ?? 401, { "cache-control": "no-store" }).end();
      } else {
        signedJson(
          response,
          rejection?.status ?? 500,
          nonce,
          { errorCode: rejection?.code ?? "RUNNER_EXECUTION_FAILED" },
          secret,
        );
      }
    }
  };
}

export async function startTwinRunnerService(environment = process.env) {
  const configuration = parseTwinRunnerServiceConfiguration(environment);
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: configuration.replayDatabaseUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: 5,
  });
  const replayStore = createPostgresTwinRunnerReplayStore(pool);
  try {
    await replayStore.initialize();
  } catch {
    await pool.end().catch(() => undefined);
    throw new Error("HELIX_BROWSER_RUNNER_REPLAY_STORE_UNAVAILABLE");
  }

  const server = createServer(
    createTwinRunnerRequestHandler({
      secret: configuration.secret,
      replayStore,
    }),
  );
  const port = Number(environment.HELIX_TWIN_RUNNER_PORT ?? "8787");
  const host = environment.HELIX_TWIN_RUNNER_HOST?.trim() || "127.0.0.1";
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    await pool.end();
    throw new Error("HELIX_TWIN_RUNNER_PORT must be an integer between 1 and 65535");
  }

  try {
    await new Promise((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(port, host, resolveListen);
    });
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
  let poolClosed = false;
  const closePool = async () => {
    if (poolClosed) return;
    poolClosed = true;
    await pool.end();
  };
  server.once("close", () => {
    void closePool();
  });
  process.stdout.write(`Helix Twin runner listening on http://${host}:${port}/run\n`);
  return { server, closePool };
}

const isMain = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (isMain) {
  startTwinRunnerService().catch((error) => {
    process.stderr.write(
      `Helix Twin runner failed to start: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  });
}
