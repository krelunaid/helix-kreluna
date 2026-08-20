import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer as createViteServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==",
  "base64",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fixtureHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Runner adapter</title></head><body><main><h1>Runner adapter fixture</h1><p>${"Authenticated browser evidence. ".repeat(20)}</p><button id="open">Open</button><output>Closed</output><script>open.onclick=()=>document.querySelector('output').textContent='Open'</script></main></body></html>`;
}

function completedResponse(artifactSha256) {
  const screenshotSha256 = sha256(PNG);
  const generatedAt = new Date().toISOString();
  const viewports = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "phone", width: 390, height: 844 },
  ];
  const metric = (viewport) => ({
    viewport,
    loadMs: 100,
    domContentLoadedMs: 80,
    fcpMs: 60,
    lcpMs: 90,
    cls: 0,
    tbtMs: 0,
    requestCount: 1,
    transferBytes: 1_000,
    decodedBytes: 2_000,
    sourceBytes: Buffer.byteLength(fixtureHtml()),
  });
  return {
    twin: {
      kind: "twin_browser",
      version: "1.0.0",
      status: "completed",
      evidence: "measured",
      artifactSha256,
      generatedAt,
      runner: "adapter-contract-fixture",
      browser: "Chromium contract fixture",
      durationMs: 100,
      viewports,
      actions: [
        {
          id: "desktop-click-1",
          viewport: "desktop",
          type: "click",
          label: "Open",
          status: "changed",
          changed: true,
          beforeSha256: "b".repeat(64),
          afterSha256: "c".repeat(64),
        },
      ],
      consoleErrors: [
        "token=runtime-sensitive-value https://example.test/path?signature=sensitive",
      ],
      runtimeErrors: [],
      screenshots: viewports.map((viewport) => ({
        viewport: viewport.name,
        path: `/private/runner/${viewport.name}.png`,
        sha256: screenshotSha256,
        bytes: PNG.byteLength,
      })),
      summary: {
        controlsDiscovered: 1,
        controlsExercised: 1,
        changedActions: 1,
        formsDiscovered: 0,
        formsExercised: 0,
        navigations: 0,
        dialogs: 0,
        blockedExternalRequests: 0,
      },
    },
    echo: {
      kind: "echo_accessibility",
      version: "1.0.0",
      status: "completed",
      evidence: "measured",
      artifactSha256,
      generatedAt,
      runner: "adapter-contract-fixture",
      browser: "Chromium contract fixture",
      durationMs: 100,
      viewports,
      passed: true,
      findings: [],
      summary: {
        checksRun: 16,
        high: 0,
        medium: 0,
        low: 0,
        focusableElements: 2,
        keyboardTargetsReached: 2,
      },
      limitations: ["Adapter contract fixture; not a browser execution claim."],
    },
    swift: {
      kind: "swift_performance",
      version: "1.0.0",
      status: "completed",
      evidence: "measured",
      artifactSha256,
      generatedAt,
      runner: "adapter-contract-fixture",
      browser: "Chromium contract fixture",
      durationMs: 100,
      metrics: [metric("desktop"), metric("phone")],
      limitations: ["Adapter contract fixture; not a browser execution claim."],
    },
    screenshots: viewports.map((viewport) => ({
      viewport: viewport.name,
      mediaType: "image/png",
      sha256: screenshotSha256,
      dataBase64: PNG.toString("base64"),
    })),
  };
}

async function startRunner(secret, { validResponseSignature = true } = {}) {
  const server = createHttpServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    const timestamp = request.headers["x-helix-runner-timestamp"];
    const nonce = request.headers["x-helix-runner-nonce"];
    const presented = request.headers["x-helix-runner-signature"];
    const expected = createHmac("sha256", secret)
      .update(`${timestamp}\n${nonce}\n${body}`)
      .digest("hex");
    if (request.method !== "POST" || presented !== expected) {
      response.writeHead(401).end();
      return;
    }
    const input = JSON.parse(body);
    if (sha256(input.html) !== input.artifactSha256) {
      response.writeHead(400).end();
      return;
    }
    const responseBody = JSON.stringify(completedResponse(input.artifactSha256));
    const signature = validResponseSignature
      ? createHmac("sha256", secret)
          .update(`${nonce}\n${responseBody}`)
          .digest("hex")
      : "0".repeat(64);
    response.writeHead(200, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(responseBody),
      "x-helix-runner-signature": signature,
    });
    response.end(responseBody);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  let closed = false;
  return {
    url: `http://127.0.0.1:${address.port}/run`,
    close: () => {
      if (closed) return Promise.resolve();
      closed = true;
      return new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

test("the job pipeline accepts only signed, hash-bound browser evidence", async (t) => {
  const previousUrl = process.env.HELIX_BROWSER_RUNNER_URL;
  const previousSecret = process.env.HELIX_BROWSER_RUNNER_SECRET;
  const vite = await createViteServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  const runner = await vite.ssrLoadModule("/src/lib/server/quality/runner.ts");
  t.after(async () => {
    if (previousUrl === undefined) delete process.env.HELIX_BROWSER_RUNNER_URL;
    else process.env.HELIX_BROWSER_RUNNER_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.HELIX_BROWSER_RUNNER_SECRET;
    else process.env.HELIX_BROWSER_RUNNER_SECRET = previousSecret;
    await vite.close();
  });

  delete process.env.HELIX_BROWSER_RUNNER_URL;
  delete process.env.HELIX_BROWSER_RUNNER_SECRET;
  const absent = await runner.runBrowserQuality({
    html: fixtureHtml(),
    jobId: "adapter-job-not-run",
  });
  assert.equal(absent.twin.status, "not_run");
  assert.equal(absent.echo.status, "not_run");
  assert.equal(absent.swift.status, "not_run");

  const secret = randomBytes(32).toString("hex");
  const trusted = await startRunner(secret);
  t.after(() => trusted.close());
  process.env.HELIX_BROWSER_RUNNER_URL = trusted.url;
  process.env.HELIX_BROWSER_RUNNER_SECRET = secret;
  const measured = await runner.runBrowserQuality({
    html: fixtureHtml(),
    jobId: "adapter-job-measured",
  });
  assert.equal(measured.twin.status, "completed");
  assert.equal(measured.echo.status, "completed");
  assert.equal(measured.swift.status, "completed");
  assert.equal(measured.screenshotBase64, PNG.toString("base64"));
  assert.match(measured.twin.screenshots[0].path, /^evidence:\/\//);
  assert.equal(measured.twin.consoleErrors[0].includes("runtime-sensitive-value"), false);
  assert.equal(measured.twin.consoleErrors[0].includes("signature=sensitive"), false);

  await trusted.close();
  const untrusted = await startRunner(secret, { validResponseSignature: false });
  t.after(() => untrusted.close());
  process.env.HELIX_BROWSER_RUNNER_URL = untrusted.url;
  await assert.rejects(
    runner.runBrowserQuality({
      html: fixtureHtml(),
      jobId: "adapter-job-untrusted",
    }),
    (error) => error?.code === "BROWSER_RUNNER_SIGNATURE_INVALID",
  );
});

test("browser runner environment configuration is paired and fail-closed", async (t) => {
  const vite = await createViteServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const env = await vite.ssrLoadModule("/src/lib/env.server.ts");
  assert.throws(
    () =>
      env.validateServerEnvironment({
        HELIX_BROWSER_RUNNER_URL: "https://runner.example.test/run",
      }),
    /HELIX_BROWSER_RUNNER_SECRET/,
  );
  assert.throws(
    () =>
      env.validateServerEnvironment({
        HELIX_BROWSER_RUNNER_URL: "http://runner.example.test/run",
        HELIX_BROWSER_RUNNER_SECRET: "S".repeat(32),
      }),
    /HELIX_BROWSER_RUNNER_URL/,
  );
  assert.doesNotThrow(() =>
    env.validateServerEnvironment({
      HELIX_BROWSER_RUNNER_URL: "https://runner.example.test/run",
      HELIX_BROWSER_RUNNER_SECRET: "S".repeat(32),
    }),
  );
});
