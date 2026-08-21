import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer as createViteServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const START_MS = Date.parse("2026-08-20T12:00:00.000Z");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function productionFiles() {
  return {
    ".env.example": "PUBLIC_ORIGIN=\n",
    "README.md": "# Workspace service fixture\n",
    "apps/web/app.ts": "export const application = 'fixture';\n",
    "apps/web/index.ts": "export const ready = true;\n",
    "docs/architecture.md": "# Architecture\n\nIsolated service fixture.\n",
    "docs/decisions.md": "# Decisions\n\n- Use a fixed validation profile.\n",
    "docs/prd.md": "# PRD\n\nValidate a bounded workspace.\n",
    "docs/score.md": "# Score\n\nNo product score is claimed by this fixture.\n",
    "migrations/0001_init.sql": "create table runner_fixture (id text primary key);\n",
    "netlify.toml": "[build]\ncommand = 'npm run build'\n",
    "package-lock.json": JSON.stringify({
      name: "workspace-service-fixture",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: { "": { name: "workspace-service-fixture", version: "1.0.0" } },
    }),
    "package.json": JSON.stringify({
      name: "workspace-service-fixture",
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

function createClock(initial = START_MS) {
  let value = initial;
  return {
    now: () => value,
    advance: (milliseconds) => {
      value += milliseconds;
    },
  };
}

function replayStore() {
  const claimed = new Set();
  const calls = [];
  return {
    calls,
    async claim(input) {
      calls.push(input);
      if (claimed.has(input.nonceSha256)) return false;
      claimed.add(input.nonceSha256);
      return true;
    },
  };
}

function sandboxHarness(clock, options = {}) {
  const events = [];
  let created = 0;
  let destroyed = 0;
  let executed = 0;
  const sandbox = {
    provider: "fake-isolated-container",
    id: "fake-sandbox-id",
    async writeFiles(files, writeOptions) {
      events.push({ kind: "write", files, options: writeOptions });
      if (options.writeFails) throw new Error("fixture write failure");
    },
    async setNetworkPolicy(policy, policyOptions) {
      events.push({ kind: "network", policy, options: policyOptions });
      if (options.resetFails && policy.mode === "disabled" && executed > 0) {
        throw new Error("fixture reset failure");
      }
    },
    async exec(argv, execOptions) {
      const id =
        argv[1] === "ci"
          ? "install"
          : argv[1] === "audit"
            ? "security"
            : String(argv[2] ?? argv[1]);
      executed += 1;
      events.push({ kind: "exec", id, argv: [...argv], options: execOptions });
      clock.advance(options.stepDurationMs ?? 25);
      if (options.throwStep === id) throw new Error("fixture execution failure");
      const failed = options.failStep === id;
      const timedOut = options.timeoutStep === id;
      const overflow = options.overflowStep === id;
      return {
        exitCode: timedOut ? null : failed ? 1 : 0,
        timedOut,
        outputLimitExceeded: overflow,
        stdout: options.stdout ?? (overflow ? "x".repeat(20_000) : `${id} output`),
        stderr: options.stderr ?? "",
      };
    },
    async destroy(destroyOptions) {
      destroyed += 1;
      events.push({ kind: "destroy", options: destroyOptions });
      if (options.destroyFails) throw new Error("fixture destroy failure");
    },
  };
  return {
    events,
    get created() {
      return created;
    },
    get destroyed() {
      return destroyed;
    },
    factory: {
      async create(createOptions) {
        created += 1;
        events.push({ kind: "create", options: createOptions });
        if (options.createFails) throw new Error("fixture create failure");
        return sandbox;
      },
    },
  };
}

function runnerRequest(prepared, secret, clock, options = {}) {
  const requestNonce = options.requestNonce ?? crypto.randomUUID();
  const headerNonce = options.headerNonce ?? requestNonce;
  const timestampMs = options.timestampMs ?? clock.now();
  const payload = {
    kind: "helix_workspace_validation_request",
    schemaVersion: options.schemaVersion ?? "1.1.0",
    requestNonce,
    requestedAt: new Date(timestampMs).toISOString(),
    profile: "node_web_v1",
    candidate: prepared.candidate,
    files: options.files ?? prepared.files,
    steps: ["install", "typecheck", "lint", "test", "build", "security"],
    limits: { timeoutMs: 600_000, maxOutputBytesPerStep: 16_384, maxProcesses: 32 },
  };
  const body = JSON.stringify(payload);
  const timestamp = String(timestampMs);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}\n${headerNonce}\n${body}`)
    .digest("hex");
  return new Request("https://runner.example.test/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-helix-runner-timestamp": timestamp,
      "x-helix-runner-nonce": headerNonce,
      "x-helix-runner-signature": options.invalidSignature ? "0".repeat(64) : signature,
    },
    body,
  });
}

async function responseJson(response) {
  return JSON.parse(await response.text());
}

async function serve(handler) {
  const server = createHttpServer(async (incoming, outgoing) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const request = new Request(`http://127.0.0.1${incoming.url ?? "/"}`, {
      method: incoming.method,
      headers: incoming.headers,
      body: body.byteLength > 0 ? body : undefined,
    });
    const response = await handler(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/validate`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

test("workspace runner service enforces the isolated fixed profile", async (t) => {
  const vite = await createViteServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const workspace = await vite.ssrLoadModule("/src/lib/workspace.ts");
  const protocol = await vite.ssrLoadModule("/src/lib/server/workspace-runner.ts");
  const serviceModule = await vite.ssrLoadModule("/src/lib/server/workspace-runner-service.ts");
  const prepared = await workspace.createProductionWorkspaceCandidate({
    jobId: "workspace-service-job",
    projectId: "workspace-service-project",
    locale: "it",
    pipelineVersion: "service-test-v1",
    createdAt: new Date(START_MS),
    entrypoint: "apps/web/index.ts",
    files: productionFiles(),
  });
  const secret = randomBytes(32).toString("hex");

  await t.test("runs only fixed argv with bounded resources and destroys the sandbox", async () => {
    const clock = createClock();
    const replay = replayStore();
    const harness = sandboxHarness(clock);
    const service = serviceModule.createWorkspaceRunnerService({
      secret,
      replayStore: replay,
      sandboxFactory: harness.factory,
      now: clock.now,
    });
    const response = await service(runnerRequest(prepared, secret, clock));
    assert.equal(response.status, 200);
    const body = await response.text();
    const report = protocol.WorkspaceRunnerReportSchema.parse(JSON.parse(body));
    const signature = response.headers.get("x-helix-runner-signature");
    assert.equal(
      signature,
      createHmac("sha256", secret).update(`${report.requestNonce}\n${body}`).digest("hex"),
    );
    assert.deepEqual(
      report.steps.map((step) => [step.id, step.status, step.evidence]),
      [
        ["install", "passed", "measured"],
        ["typecheck", "passed", "measured"],
        ["lint", "passed", "measured"],
        ["test", "passed", "measured"],
        ["build", "passed", "measured"],
        ["security", "passed", "measured"],
      ],
    );
    assert.equal(harness.created, 1);
    assert.equal(harness.destroyed, 1);
    const create = harness.events.find((event) => event.kind === "create");
    assert.equal(create.options.inheritServiceEnvironment, false);
    assert.equal(create.options.networkDefault, "disabled");
    assert.equal(create.options.limits.maxProcesses, 32);
    assert.equal(Object.values(create.options.environment).includes(secret), false);
    const write = harness.events.find((event) => event.kind === "write");
    assert.equal(
      write.files.every((file) => file.path.startsWith("/workspace/project/")),
      true,
    );
    const execs = harness.events.filter((event) => event.kind === "exec");
    assert.deepEqual(
      execs.map((event) => event.argv),
      serviceModule.WORKSPACE_RUNNER_FIXED_PROFILE.map((step) => [...step.argv]),
    );
    assert.equal(
      execs.every(
        (event) =>
          event.options.cwd === "/workspace/project" &&
          event.options.killProcessTreeOnTimeout === true &&
          event.options.maxOutputBytes === 16_384,
      ),
      true,
    );
    const network = harness.events.filter((event) => event.kind === "network");
    assert.equal(
      network
        .filter((event) => event.policy.mode === "package_registry_only")
        .every(
          (event) =>
            event.policy.allowedHosts.length === 1 &&
            event.policy.allowedHosts[0] === "registry.npmjs.org",
        ),
      true,
    );
    assert.equal(network.at(-1).policy.mode, "disabled");
  });

  await t.test(
    "rejects invalid auth, stale timestamps and nonce mismatch before sandbox",
    async () => {
      for (const mode of ["signature", "timestamp", "nonce"]) {
        const clock = createClock();
        const replay = replayStore();
        const harness = sandboxHarness(clock);
        const service = serviceModule.createWorkspaceRunnerService({
          secret,
          replayStore: replay,
          sandboxFactory: harness.factory,
          now: clock.now,
        });
        const response = await service(
          runnerRequest(prepared, secret, clock, {
            invalidSignature: mode === "signature",
            timestampMs: mode === "timestamp" ? clock.now() - 5 * 60 * 1_000 - 1 : clock.now(),
            headerNonce: mode === "nonce" ? crypto.randomUUID() : undefined,
          }),
        );
        assert.equal(response.status, 401, mode);
        assert.equal(harness.created, 0, mode);
        assert.equal(replay.calls.length, 0, mode);
      }
    },
  );

  await t.test("atomically rejects a concurrent nonce replay", async () => {
    const clock = createClock();
    const replay = replayStore();
    const harness = sandboxHarness(clock);
    const service = serviceModule.createWorkspaceRunnerService({
      secret,
      replayStore: replay,
      sandboxFactory: harness.factory,
      now: clock.now,
    });
    const nonce = crypto.randomUUID();
    const responses = await Promise.all([
      service(runnerRequest(prepared, secret, clock, { requestNonce: nonce })),
      service(runnerRequest(prepared, secret, clock, { requestNonce: nonce })),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    assert.equal(harness.created, 1);
    assert.equal(replay.calls.length, 2);
    assert.equal(replay.calls[0].nonceSha256, sha256(nonce));
  });

  await t.test("rejects a hash-tampered candidate before sandbox execution", async () => {
    const clock = createClock();
    const harness = sandboxHarness(clock);
    const service = serviceModule.createWorkspaceRunnerService({
      secret,
      replayStore: replayStore(),
      sandboxFactory: harness.factory,
      now: clock.now,
    });
    const response = await service(
      runnerRequest(prepared, secret, clock, {
        files: { ...prepared.files, "apps/web/index.ts": "export const ready = false;\n" },
      }),
    );
    assert.equal(response.status, 422);
    assert.equal(harness.created, 0);
  });

  await t.test("rejects declared and streamed oversized bodies", async () => {
    const clock = createClock();
    const harness = sandboxHarness(clock);
    const service = serviceModule.createWorkspaceRunnerService({
      secret,
      replayStore: replayStore(),
      sandboxFactory: harness.factory,
      now: clock.now,
    });
    const timestamp = String(clock.now());
    const nonce = crypto.randomUUID();
    const headers = {
      "content-type": "application/json",
      "x-helix-runner-timestamp": timestamp,
      "x-helix-runner-nonce": nonce,
      "x-helix-runner-signature": "0".repeat(64),
    };
    const declared = new Request("https://runner.example.test/validate", {
      method: "POST",
      headers: { ...headers, "content-length": String(6 * 1024 * 1024 + 1) },
      body: "{}",
    });
    assert.equal((await service(declared)).status, 413);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(6 * 1024 * 1024 + 1));
        controller.close();
      },
    });
    const streamed = new Request("https://runner.example.test/validate", {
      method: "POST",
      headers,
      body: stream,
      duplex: "half",
    });
    assert.equal((await service(streamed)).status, 413);
    assert.equal(harness.created, 0);
  });

  await t.test("records failure and timeout honestly and leaves later steps not-run", async () => {
    for (const [mode, harnessOptions, expectedStatus] of [
      ["failure", { failStep: "test" }, "failed"],
      ["timeout", { timeoutStep: "test" }, "timed_out"],
    ]) {
      const clock = createClock();
      const harness = sandboxHarness(clock, harnessOptions);
      const service = serviceModule.createWorkspaceRunnerService({
        secret,
        replayStore: replayStore(),
        sandboxFactory: harness.factory,
        now: clock.now,
      });
      const response = await service(runnerRequest(prepared, secret, clock));
      assert.equal(response.status, 200, mode);
      const report = protocol.WorkspaceRunnerReportSchema.parse(await responseJson(response));
      assert.equal(report.steps.find((step) => step.id === "test").status, expectedStatus);
      for (const id of ["build", "security"]) {
        const step = report.steps.find((candidate) => candidate.id === id);
        assert.equal(step.status, "not_run", `${mode}:${id}`);
        assert.equal(step.evidence, "not_run", `${mode}:${id}`);
        assert.equal(step.networkPolicy, "not_applied", `${mode}:${id}`);
        assert.equal(step.stdoutSha256, null, `${mode}:${id}`);
      }
      assert.equal(harness.destroyed, 1, mode);
    }
  });

  await t.test("redacts output evidence and fails closed on overflow", async () => {
    const clock = createClock();
    const harness = sandboxHarness(clock, {
      overflowStep: "install",
      stdout: `authorization=${secret}`,
    });
    const service = serviceModule.createWorkspaceRunnerService({
      secret,
      replayStore: replayStore(),
      sandboxFactory: harness.factory,
      now: clock.now,
    });
    const response = await service(runnerRequest(prepared, secret, clock));
    const body = await response.text();
    const report = protocol.WorkspaceRunnerReportSchema.parse(JSON.parse(body));
    assert.equal(body.includes(secret), false);
    assert.equal(body.includes("authorization="), false);
    assert.equal(report.steps[0].status, "failed");
    assert.equal(report.steps[0].outputTruncated, true);
    assert.equal(report.steps[0].stdoutSha256, sha256("credential=[REDACTED]"));
    assert.equal(
      report.steps.slice(1).every((step) => step.status === "not_run"),
      true,
    );
  });

  await t.test(
    "destroys and blocks the profile when network reset cannot be confirmed",
    async () => {
      const clock = createClock();
      const harness = sandboxHarness(clock, { resetFails: true });
      const service = serviceModule.createWorkspaceRunnerService({
        secret,
        replayStore: replayStore(),
        sandboxFactory: harness.factory,
        now: clock.now,
      });
      const response = await service(runnerRequest(prepared, secret, clock));
      assert.equal(response.status, 200);
      const report = protocol.WorkspaceRunnerReportSchema.parse(await responseJson(response));
      assert.equal(report.steps[0].status, "failed");
      assert.match(report.steps[0].detail, /network policy/u);
      assert.equal(
        report.steps.slice(1).every((step) => step.status === "not_run"),
        true,
      );
      assert.equal(harness.destroyed, 1);
    },
  );

  await t.test("never signs trusted evidence when sandbox destruction fails", async () => {
    const clock = createClock();
    const harness = sandboxHarness(clock, { destroyFails: true });
    const service = serviceModule.createWorkspaceRunnerService({
      secret,
      replayStore: replayStore(),
      sandboxFactory: harness.factory,
      now: clock.now,
    });
    const response = await service(runnerRequest(prepared, secret, clock));
    assert.equal(response.status, 503);
    assert.equal(response.headers.has("x-helix-runner-signature"), false);
    assert.equal(harness.destroyed, 1);
  });

  await t.test("interoperates end-to-end with the fail-closed Helix adapter", async (t) => {
    const priorUrl = process.env.HELIX_WORKSPACE_RUNNER_URL;
    const priorSecret = process.env.HELIX_WORKSPACE_RUNNER_SECRET;
    t.after(() => {
      if (priorUrl === undefined) delete process.env.HELIX_WORKSPACE_RUNNER_URL;
      else process.env.HELIX_WORKSPACE_RUNNER_URL = priorUrl;
      if (priorSecret === undefined) delete process.env.HELIX_WORKSPACE_RUNNER_SECRET;
      else process.env.HELIX_WORKSPACE_RUNNER_SECRET = priorSecret;
    });
    const harness = sandboxHarness({ now: Date.now, advance() {} });
    const service = serviceModule.createWorkspaceRunnerService({
      secret,
      replayStore: replayStore(),
      sandboxFactory: harness.factory,
    });
    const server = await serve(service);
    t.after(() => server.close());
    process.env.HELIX_WORKSPACE_RUNNER_URL = server.url;
    process.env.HELIX_WORKSPACE_RUNNER_SECRET = secret;
    const result = await protocol.runProductionWorkspaceValidation(prepared);
    assert.equal(result.validations.length, 5);
    assert.equal(result.report.runner.destroyed, true);
    assert.equal(
      result.report.steps.every((step) => step.status === "passed"),
      true,
    );

    const failedHarness = sandboxHarness({ now: Date.now, advance() {} }, { failStep: "test" });
    const failedService = serviceModule.createWorkspaceRunnerService({
      secret,
      replayStore: replayStore(),
      sandboxFactory: failedHarness.factory,
    });
    const failedServer = await serve(failedService);
    t.after(() => failedServer.close());
    process.env.HELIX_WORKSPACE_RUNNER_URL = failedServer.url;
    await assert.rejects(
      protocol.runProductionWorkspaceValidation(prepared),
      (error) => error?.code === "WORKSPACE_RUNNER_VALIDATION_FAILED",
    );
    assert.equal(failedHarness.destroyed, 1);
  });
});
