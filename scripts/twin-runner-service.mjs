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
const usedNonces = new Map();

const secret = process.env.HELIX_BROWSER_RUNNER_SECRET?.trim();
if (!secret || secret.length < 32) {
  throw new Error("HELIX_BROWSER_RUNNER_SECRET must contain at least 32 characters");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(value) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function equalSignature(left, right) {
  if (!/^[0-9a-f]{64}$/i.test(left ?? "") || !/^[0-9a-f]{64}$/i.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function purgeNonces(now = Date.now()) {
  for (const [nonce, expiresAt] of usedNonces) {
    if (expiresAt <= now) usedNonces.delete(nonce);
  }
}

async function body(request) {
  const declared = Number(request.headers["content-length"] ?? "0");
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    throw new Error("RUNNER_REQUEST_TOO_LARGE");
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.byteLength;
    if (bytes > MAX_REQUEST_BYTES) throw new Error("RUNNER_REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function authenticate(request, requestBody) {
  const timestamp = String(request.headers["x-helix-runner-timestamp"] ?? "");
  const nonce = String(request.headers["x-helix-runner-nonce"] ?? "");
  const signature = String(request.headers["x-helix-runner-signature"] ?? "");
  const timestampNumber = Number(timestamp);
  purgeNonces();
  if (
    !Number.isFinite(timestampNumber) ||
    Math.abs(Date.now() - timestampNumber) > MAX_CLOCK_SKEW_MS ||
    !/^[0-9a-f-]{36}$/i.test(nonce) ||
    usedNonces.has(nonce) ||
    !equalSignature(signature, hmac(`${timestamp}\n${nonce}\n${requestBody}`))
  ) {
    throw new Error("RUNNER_UNAUTHORIZED");
  }
  usedNonces.set(nonce, Date.now() + MAX_CLOCK_SKEW_MS);
  return nonce;
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

function signedJson(response, status, nonce, payload) {
  const responseBody = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(responseBody),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-helix-runner-signature": hmac(`${nonce}\n${responseBody}`),
  });
  response.end(responseBody);
}

const server = createServer(async (request, response) => {
  let nonce = "unauthenticated";
  try {
    if (request.method !== "POST" || request.url !== "/run") {
      response.writeHead(404, { "cache-control": "no-store" }).end();
      return;
    }
    const requestBody = await body(request);
    nonce = authenticate(request, requestBody);
    const input = validateInput(JSON.parse(requestBody));
    signedJson(response, 200, nonce, await executeBrowserRun(input));
  } catch (error) {
    const code = String(error instanceof Error ? error.message : error).slice(0, 120);
    if (nonce === "unauthenticated") {
      response.writeHead(code === "RUNNER_REQUEST_TOO_LARGE" ? 413 : 401, {
        "cache-control": "no-store",
      }).end();
    } else {
      signedJson(response, 500, nonce, { errorCode: code });
    }
  }
});

const port = Number(process.env.HELIX_TWIN_RUNNER_PORT ?? "8787");
const host = process.env.HELIX_TWIN_RUNNER_HOST?.trim() || "127.0.0.1";
server.listen(port, host, () => {
  process.stdout.write(`Helix Twin runner listening on http://${host}:${port}/run\n`);
});
