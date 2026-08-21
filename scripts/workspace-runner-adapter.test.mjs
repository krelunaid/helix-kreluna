import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer as createViteServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function productionFiles() {
  return {
    ".env.example": "PUBLIC_ORIGIN=\n",
    "README.md": "# Workspace runner fixture\n",
    "apps/web/app.ts": "export const application = 'fixture';\n",
    "apps/web/index.ts": "export const ready = true;\n",
    "docs/architecture.md": "# Architecture\n\nIsolated validation fixture.\n",
    "docs/decisions.md": "# Decisions\n\n- Use a fixed validation profile.\n",
    "docs/prd.md": "# PRD\n\nValidate a bounded workspace.\n",
    "docs/score.md": "# Score\n\nNo product score is claimed by this fixture.\n",
    "migrations/0001_init.sql": "create table runner_fixture (id text primary key);\n",
    "netlify.toml": "[build]\ncommand = 'npm run build'\n",
    "package-lock.json": JSON.stringify({
      name: "workspace-runner-fixture",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: { "": { name: "workspace-runner-fixture", version: "1.0.0" } },
    }),
    "package.json": JSON.stringify({
      name: "workspace-runner-fixture",
      private: true,
      version: "1.0.0",
      scripts: {
        typecheck: "tsc --noEmit",
        lint: "eslint .",
        test: "node --test",
        build: "vite build",
      },
    }),
    "tests/runner.test.ts": "export const fixtureTest = true;\n",
  };
}

function runnerReport(request, mode = "valid") {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 60_000).toISOString();
  const emptySha256 = sha256("");
  const steps = request.steps.map((id) => ({
    id,
    status: id === "test" && mode === "failed_step" ? "failed" : "passed",
    evidence: "measured",
    tool: id === "install" ? "npm-ci" : `npm-script-${id}`,
    exitCode: id === "test" && mode === "failed_step" ? 1 : 0,
    startedAt: now,
    completedAt: id === "build" && mode === "invalid_timestamps" ? future : now,
    durationMs: 0,
    networkPolicy:
      mode === "open_build_network" && id === "build"
        ? "package_registry_only"
        : id === "install" || id === "security"
          ? "package_registry_only"
          : "disabled",
    stdoutSha256: emptySha256,
    stderrSha256: emptySha256,
    outputTruncated: false,
    detail: `${id} executed by the isolated runner fixture`,
  }));
  return {
    kind: "helix_workspace_validation_report",
    schemaVersion: "1.1.0",
    requestNonce: mode === "wrong_nonce" ? crypto.randomUUID() : request.requestNonce,
    candidateSha256: mode === "wrong_hash" ? "0".repeat(64) : request.candidate.sourceSha256,
    runner: {
      provider: "isolated-runner-contract-fixture",
      isolation: "container",
      sandboxIdSha256: sha256(`sandbox:${request.requestNonce}`),
      destroyed: true,
      networkDefault: "disabled",
    },
    startedAt: now,
    completedAt: now,
    durationMs: 0,
    steps,
  };
}

async function startRunner(secret, mode = "valid") {
  const requests = [];
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
    requests.push(input);
    const responseBody =
      mode === "oversized_response" || mode === "oversized_chunked"
        ? JSON.stringify("x".repeat(256 * 1024 + 1))
        : JSON.stringify(runnerReport(input, mode));
    const signature =
      mode === "invalid_signature"
        ? "0".repeat(64)
        : createHmac("sha256", secret).update(`${nonce}\n${responseBody}`).digest("hex");
    const headers = {
      "content-type": "application/json",
      "x-helix-runner-signature": signature,
    };
    if (mode !== "oversized_chunked") {
      headers["content-length"] = String(Buffer.byteLength(responseBody));
    }
    response.writeHead(200, headers);
    response.end(responseBody);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/validate`,
    requests,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

test("Production workspace validation is hash-bound, signed and fail-closed", async (t) => {
  const priorUrl = process.env.HELIX_WORKSPACE_RUNNER_URL;
  const priorSecret = process.env.HELIX_WORKSPACE_RUNNER_SECRET;
  const vite = await createViteServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  const workspace = await vite.ssrLoadModule("/src/lib/workspace.ts");
  const adapter = await vite.ssrLoadModule("/src/lib/server/workspace-runner.ts");
  t.after(async () => {
    if (priorUrl === undefined) delete process.env.HELIX_WORKSPACE_RUNNER_URL;
    else process.env.HELIX_WORKSPACE_RUNNER_URL = priorUrl;
    if (priorSecret === undefined) delete process.env.HELIX_WORKSPACE_RUNNER_SECRET;
    else process.env.HELIX_WORKSPACE_RUNNER_SECRET = priorSecret;
    await vite.close();
  });

  const prepared = await workspace.createProductionWorkspaceCandidate({
    jobId: "workspace-runner-job",
    projectId: "workspace-runner-project",
    locale: "it",
    pipelineVersion: "contract-test-v1",
    createdAt: new Date(),
    entrypoint: "apps/web/index.ts",
    files: productionFiles(),
  });
  assert.equal(prepared.candidate.buildLevel, "production");
  assert.equal(
    (await workspace.verifyProductionWorkspaceCandidate(prepared.files, prepared.candidate)).valid,
    true,
  );

  delete process.env.HELIX_WORKSPACE_RUNNER_URL;
  delete process.env.HELIX_WORKSPACE_RUNNER_SECRET;
  await assert.rejects(
    adapter.runProductionWorkspaceValidation(prepared),
    (error) => error?.code === "WORKSPACE_RUNNER_UNCONFIGURED",
  );

  const secret = randomBytes(32).toString("hex");
  const valid = await startRunner(secret);
  t.after(() => valid.close());
  process.env.HELIX_WORKSPACE_RUNNER_URL = valid.url;
  process.env.HELIX_WORKSPACE_RUNNER_SECRET = secret;
  const result = await adapter.runProductionWorkspaceValidation(prepared);
  assert.equal(result.report.runner.destroyed, true);
  assert.equal(result.report.runner.networkDefault, "disabled");
  assert.equal(
    result.report.steps
      .filter((step) => !["install", "security"].includes(step.id))
      .every((step) => step.networkPolicy === "disabled"),
    true,
  );
  assert.equal(result.validations.length, 5);
  assert.equal(
    result.validations.every((validation) => validation.status === "passed"),
    true,
  );
  assert.equal(valid.requests.length, 1);
  assert.deepEqual(valid.requests[0].steps, [
    "install",
    "typecheck",
    "lint",
    "test",
    "build",
    "security",
  ]);
  assert.equal(Object.hasOwn(valid.requests[0], "commands"), false);
  assert.equal(valid.requests[0].candidate.sourceSha256, prepared.candidate.sourceSha256);

  const tampered = {
    ...prepared,
    files: { ...prepared.files, "apps/web/index.ts": "export const ready = false;\n" },
  };
  await assert.rejects(
    adapter.runProductionWorkspaceValidation(tampered),
    (error) => error?.code === "WORKSPACE_RUNNER_CANDIDATE_INVALID",
  );

  for (const [mode, code] of [
    ["invalid_signature", "WORKSPACE_RUNNER_SIGNATURE_INVALID"],
    ["wrong_nonce", "WORKSPACE_RUNNER_REPLAY_DETECTED"],
    ["wrong_hash", "WORKSPACE_RUNNER_CANDIDATE_MISMATCH"],
    ["failed_step", "WORKSPACE_RUNNER_VALIDATION_FAILED"],
    ["open_build_network", "WORKSPACE_RUNNER_RESPONSE_INVALID"],
    ["invalid_timestamps", "WORKSPACE_RUNNER_TIMESTAMPS_INVALID"],
    ["oversized_response", "WORKSPACE_RUNNER_RESPONSE_TOO_LARGE"],
    ["oversized_chunked", "WORKSPACE_RUNNER_RESPONSE_TOO_LARGE"],
  ]) {
    const runner = await startRunner(secret, mode);
    t.after(() => runner.close());
    process.env.HELIX_WORKSPACE_RUNNER_URL = runner.url;
    await assert.rejects(
      adapter.runProductionWorkspaceValidation(prepared),
      (error) => error?.code === code,
      mode,
    );
  }
});

test("workspace runner environment values are paired and HTTPS-only off loopback", async (t) => {
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
        HELIX_WORKSPACE_RUNNER_URL: "https://runner.example.test/validate",
      }),
    /HELIX_WORKSPACE_RUNNER_SECRET/,
  );
  assert.throws(
    () =>
      env.validateServerEnvironment({
        HELIX_WORKSPACE_RUNNER_URL: "http://runner.example.test/validate",
        HELIX_WORKSPACE_RUNNER_SECRET: "S".repeat(32),
      }),
    /HELIX_WORKSPACE_RUNNER_URL/,
  );
  assert.doesNotThrow(() =>
    env.validateServerEnvironment({
      HELIX_WORKSPACE_RUNNER_URL: "https://runner.example.test/validate",
      HELIX_WORKSPACE_RUNNER_SECRET: "S".repeat(32),
    }),
  );

  const configuredProduction = {
    VITE_PRODUCTION_BUILDS_ENABLED: "true",
    VITE_PRODUCTION_CREDITS: "40",
    VITE_AUTH_ENABLED: "true",
    VITE_GROK_AUTH_ENABLED: "true",
    BETTER_AUTH_SECRET: "A".repeat(32),
    BETTER_AUTH_URL: "http://localhost:8080",
    GROK_AUTH_CLIENT_ID: "production-test-client",
    GROK_AUTH_CLIENT_SECRET: "production-example-secret",
    HELIX_WORKSPACE_RUNNER_URL: "https://runner.example.test/validate",
    HELIX_WORKSPACE_RUNNER_SECRET: "S".repeat(32),
  };
  const validated = env.validateServerEnvironment(configuredProduction);
  assert.equal(validated.productionBuildsEnabled, true);
  assert.equal(validated.productionBuildCredits, 40);

  for (const [name, value] of [
    ["VITE_PRODUCTION_CREDITS", undefined],
    ["HELIX_WORKSPACE_RUNNER_URL", undefined],
    ["HELIX_WORKSPACE_RUNNER_SECRET", undefined],
    ["VITE_AUTH_ENABLED", "false"],
    ["VITE_PRODUCTION_CREDITS", "0"],
  ]) {
    assert.throws(
      () => env.validateServerEnvironment({ ...configuredProduction, [name]: value }),
      new RegExp(name),
    );
  }
  assert.throws(
    () =>
      env.validateServerEnvironment({
        ...configuredProduction,
        VITE_PRODUCTION_BUILDS_ENABLED: "false",
      }),
    /VITE_PRODUCTION_BUILDS_ENABLED/,
  );
});
