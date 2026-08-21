import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { join } from "node:path";
import test from "node:test";
import { expoFiles } from "../src/lib/expo-pack.ts";
import { callStoreRunner, StoreRunnerError } from "../src/lib/server/store-runner.ts";
import { zipFiles } from "../src/lib/zip.ts";
import {
  assertPinnedEasCli,
  createCredentialAuthority,
  createEasWorkflowExecutor,
  createStoreRunnerHandler,
  nodeHandler,
  normalizeEasWorkflowView,
  parseStoreRunnerConfiguration,
} from "./store-runner-service.mjs";

// These fixtures prove the local authenticated contract and command boundary.
// They never contact EAS, Apple or Google and are not provider proof.

const NOW = Date.parse("2026-08-20T10:00:00.000Z");
const SECRET = "contract-secret-0123456789abcdef0123456789";
const EAS_PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const RELEASE_ID = "22222222-2222-4222-8222-222222222222";
const IDENTITY = {
  platform: "android",
  appIdentifier: "com.kreluna.contract",
  easProjectId: EAS_PROJECT_ID,
  version: "1.0.0",
  appleTeamId: null,
  destination: "play_internal",
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function runnerEnvironment(overrides = {}) {
  const databaseUrl = `${"postgresql"}://${"runner"}:${["runtime", "fixture"].join("-")}@db.invalid/runner`;
  return {
    HELIX_STORE_RUNNER_SECRET: SECRET,
    HELIX_STORE_RUNNER_DATABASE_URL: databaseUrl,
    HELIX_STORE_EAS_CLI_PATH: "/opt/helix/eas-cli/13.2.1/eas",
    HELIX_STORE_EAS_CLI_VERSION: "13.2.1",
    HELIX_STORE_EXPO_ACCOUNT_ID: "expo-account-contract",
    EXPO_TOKEN: "expo-contract-token-with-more-than-twenty-characters",
    HELIX_STORE_IOS_CREDENTIALS_JSON: "",
    HELIX_STORE_ANDROID_CREDENTIALS_JSON: JSON.stringify([
      {
        easProjectId: EAS_PROJECT_ID,
        appIdentifier: IDENTITY.appIdentifier,
        easCredentialsPreuploaded: true,
        keystoreCertificateSha256: "a".repeat(64),
        playServiceAccountEmail: "helix-store@contract.iam.gserviceaccount.com",
      },
    ]),
    ...overrides,
  };
}

function sourcePackage() {
  const files = expoFiles({
    title: "Store contract",
    slug: "store-contract",
    html: "<!doctype html><html><body>Contract fixture</body></html>",
    bundleId: IDENTITY.appIdentifier,
    easProjectId: EAS_PROJECT_ID,
    liveUrl: "https://example.invalid/a/store-contract",
    platform: "android",
  });
  const bytes = zipFiles(files);
  return { files, bytes: Buffer.from(bytes), sha256: sha256(bytes) };
}

function createMemoryPersistence() {
  const nonces = new Set();
  const jobs = new Map();
  return {
    jobs,
    async claimNonce({ nonceSha256 }) {
      if (nonces.has(nonceSha256)) return false;
      nonces.add(nonceSha256);
      return true;
    },
    async accept(input) {
      const existing = jobs.get(input.releaseId);
      if (existing) return existing;
      const row = {
        release_id: input.releaseId,
        idempotency_key: input.idempotencyKey,
        package_sha256: input.packageSha256,
        source_zip: Buffer.from(input.sourceZip),
        identity: structuredClone(input.identity),
        credential_evidence: structuredClone(input.credentialEvidence),
        state: "dispatch_accepted",
        runner_job_id: `eas-${input.releaseId}`,
        workflow_run_id: null,
        activation_started_at: null,
        accepted_at: new Date(NOW).toISOString(),
      };
      jobs.set(input.releaseId, row);
      return row;
    },
    async get(releaseId) {
      const row = jobs.get(releaseId);
      if (!row) throw new Error("STORE_RUNNER_JOB_NOT_FOUND");
      return row;
    },
    async claimActivation(releaseId) {
      const row = await this.get(releaseId);
      if (row.workflow_run_id || row.activation_started_at) {
        return { row, mayDispatch: false };
      }
      row.activation_started_at = new Date(NOW).toISOString();
      return { row, mayDispatch: true };
    },
    async recordWorkflow(releaseId, workflowRunId) {
      const row = await this.get(releaseId);
      row.workflow_run_id = workflowRunId;
      row.state = "workflow_queued";
      return row;
    },
    async markReconciliationRequired(releaseId) {
      const row = await this.get(releaseId);
      row.state = "action_required";
    },
    async recordRetryableActivationFailure(releaseId) {
      const row = await this.get(releaseId);
      row.activation_started_at = null;
    },
    async recordObservation(releaseId, report) {
      const row = await this.get(releaseId);
      row.state = report.state;
      row.latest_report = structuredClone(report);
      return row;
    },
  };
}

function runnerDependencies({ inspectRaw, onDispatch } = {}) {
  const configuration = parseStoreRunnerConfiguration(runnerEnvironment());
  const persistence = createMemoryPersistence();
  let dispatchCount = 0;
  const executor = {
    async dispatch() {
      dispatchCount += 1;
      await onDispatch?.();
      return { workflowRunId: "workflow-run-contract", processStarted: true };
    },
    async inspect() {
      return inspectRaw ?? JSON.stringify({ status: "new", jobs: [] });
    },
  };
  return {
    configuration,
    persistence,
    executor,
    dispatchCount: () => dispatchCount,
  };
}

function throughHandler(handler, transform) {
  return async (url, init) => {
    const response = await handler(new Request(url, init));
    return transform ? transform(response) : response;
  };
}

function appRequest(packageFixture, action = "accept", releaseId = RELEASE_ID) {
  return {
    action,
    releaseId,
    idempotencyKey: "contract-store-release-idempotency-key",
    packageSha256: packageFixture.sha256,
    identity: IDENTITY,
    sourcePackage:
      action === "accept"
        ? {
            filename: "store-contract-android-source.zip",
            sha256: packageFixture.sha256,
            byteLength: packageFixture.bytes.byteLength,
            base64: packageFixture.bytes.toString("base64"),
          }
        : null,
  };
}

function appOptions(fetch, nonce, now = NOW) {
  return {
    fetch,
    now: () => now,
    nonce: () => nonce,
    env: {
      HELIX_STORE_RUNNER_URL: "http://127.0.0.1:8790/",
      HELIX_STORE_RUNNER_SECRET: SECRET,
    },
  };
}

test("Store runner startup configuration fails closed (contract; not provider proof)", () => {
  assert.throws(() => parseStoreRunnerConfiguration({}), /HELIX_STORE_RUNNER_SECRET/);
  assert.throws(
    () => parseStoreRunnerConfiguration(runnerEnvironment({ HELIX_STORE_RUNNER_DATABASE_URL: "" })),
    /no volatile fallback/,
  );
  assert.throws(
    () => parseStoreRunnerConfiguration(runnerEnvironment({ HELIX_STORE_EAS_CLI_PATH: "eas" })),
    /absolute path/,
  );
  assert.throws(
    () => parseStoreRunnerConfiguration(runnerEnvironment({ HELIX_STORE_EAS_CLI_VERSION: ">=13" })),
    /exact semver pin/,
  );
  const configured = parseStoreRunnerConfiguration(runnerEnvironment());
  assert.equal(configured.easCliVersion, "13.2.1");
  assert.equal(Object.hasOwn(configured, "playServiceJson"), false);
});

test("the Node adapter bounds chunked bodies before authentication", async (t) => {
  let fetchHandlerCalls = 0;
  const server = createHttpServer(
    nodeHandler(async () => {
      fetchHandlerCalls += 1;
      return new Response(null, { status: 204 });
    }),
  );
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const status = await new Promise((resolve, reject) => {
    let responseReceived = false;
    const request = httpRequest(
      {
        host: "127.0.0.1",
        port: address.port,
        method: "POST",
        path: "/",
        headers: { "content-type": "application/json" },
      },
      (response) => {
        responseReceived = true;
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      },
    );
    request.on("error", (error) => {
      if (!responseReceived) reject(error);
    });
    const chunk = Buffer.alloc(512 * 1024, 0x20);
    for (let index = 0; index < 18; index += 1) request.write(chunk);
    request.end();
  });
  assert.equal(status, 413);
  assert.equal(fetchHandlerCalls, 0);
});

test("the Node adapter rejects unsupported methods without an unhandled rejection", async (t) => {
  let fetchHandlerCalls = 0;
  const server = createHttpServer(
    nodeHandler(async () => {
      fetchHandlerCalls += 1;
      return new Response(null, { status: 204 });
    }),
  );
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const status = await new Promise((resolve, reject) => {
    const request = httpRequest(
      { host: "127.0.0.1", port: address.port, method: "TRACE", path: "/" },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      },
    );
    request.once("error", reject);
    request.end();
  });
  assert.equal(status, 405);
  assert.equal(fetchHandlerCalls, 0);
});

test("the Node adapter survives an aborted request and caps concurrent body buffering", async (t) => {
  let fetchHandlerCalls = 0;
  const server = createHttpServer(
    nodeHandler(
      async () => {
        fetchHandlerCalls += 1;
        return new Response(null, { status: 204 });
      },
      { maxConcurrentRequests: 1 },
    ),
  );
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const held = httpRequest({
    host: "127.0.0.1",
    port: address.port,
    method: "POST",
    path: "/",
    headers: { "content-type": "application/json" },
  });
  held.on("error", () => undefined);
  held.write("{");

  await new Promise((resolve) => setTimeout(resolve, 20));
  const overloadedStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: "127.0.0.1",
        port: address.port,
        method: "POST",
        path: "/",
        headers: { "content-type": "application/json", "content-length": "2" },
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      },
    );
    request.once("error", reject);
    request.end("{}");
  });
  assert.equal(overloadedStatus, 503);

  held.destroy();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const recoveredStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: "127.0.0.1",
        port: address.port,
        method: "POST",
        path: "/",
        headers: { "content-type": "application/json", "content-length": "2" },
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      },
    );
    request.once("error", reject);
    request.end("{}");
  });
  assert.equal(recoveredStatus, 204);
  assert.equal(fetchHandlerCalls, 1);
});

test("the configured EAS pin matches real oclif version output exactly (contract; not provider proof)", async () => {
  const configuration = parseStoreRunnerConfiguration(runnerEnvironment());
  const calls = [];
  await assertPinnedEasCli(configuration, async (executable, argv) => {
    calls.push({ executable, argv });
    return {
      stdout: `eas-cli/${configuration.easCliVersion} darwin-arm64 node-v22.23.0`,
      stderr: "",
    };
  });
  assert.deepEqual(calls, [{ executable: configuration.easCliPath, argv: ["--version"] }]);
  await assert.rejects(
    assertPinnedEasCli(configuration, async () => ({
      stdout: "eas-cli/13.2.2 darwin-arm64 node-v22.23.0",
      stderr: "",
    })),
    /HELIX_STORE_EAS_CLI_VERSION_MISMATCH/,
  );
});

test("credential mapping requires pre-upload acknowledgement and nonempty identifiers (contract; not provider proof)", () => {
  const configuration = parseStoreRunnerConfiguration(runnerEnvironment());
  const evidence = createCredentialAuthority(configuration).verify(IDENTITY);
  assert.equal(evidence.platform, "android");
  assert.equal(evidence.track, "internal");
  assert.equal(evidence.playServiceAccountEmailSha256.length, 64);

  const unacknowledged = parseStoreRunnerConfiguration(
    runnerEnvironment({
      HELIX_STORE_ANDROID_CREDENTIALS_JSON: JSON.stringify([
        {
          easProjectId: EAS_PROJECT_ID,
          appIdentifier: IDENTITY.appIdentifier,
          easCredentialsPreuploaded: false,
          keystoreCertificateSha256: "a".repeat(64),
          playServiceAccountEmail: "helix-store@contract.iam.gserviceaccount.com",
        },
      ]),
    }),
  );
  assert.throws(
    () => createCredentialAuthority(unacknowledged).verify(IDENTITY),
    /STORE_EAS_CREDENTIALS_NOT_ACKNOWLEDGED/,
  );

  const iosIdentity = {
    ...IDENTITY,
    platform: "ios",
    destination: "testflight",
    appleTeamId: "AB12C3D4E5",
  };
  const iosConfiguration = parseStoreRunnerConfiguration(
    runnerEnvironment({
      HELIX_STORE_ANDROID_CREDENTIALS_JSON: "",
      HELIX_STORE_IOS_CREDENTIALS_JSON: JSON.stringify([
        {
          easProjectId: EAS_PROJECT_ID,
          appIdentifier: IDENTITY.appIdentifier,
          appleTeamId: "AB12C3D4E5",
          easCredentialsPreuploaded: true,
          distributionCertificateSha256: "b".repeat(64),
          provisioningProfileSha256: "c".repeat(64),
          appStoreConnectKeyId: "",
        },
      ]),
    }),
  );
  assert.throws(
    () => createCredentialAuthority(iosConfiguration).verify(iosIdentity),
    /STORE_APP_STORE_CONNECT_KEY_ID_INVALID/,
  );
});

test("HMAC, replay and exact ZIP hash are enforced end to end (contract; not provider proof)", async () => {
  const fixture = sourcePackage();
  const dependencies = runnerDependencies();
  let clock = NOW;
  const handler = createStoreRunnerHandler({
    secret: SECRET,
    persistence: dependencies.persistence,
    credentialAuthority: createCredentialAuthority(dependencies.configuration),
    executor: dependencies.executor,
    easCliVersion: dependencies.configuration.easCliVersion,
    now: () => clock,
  });
  const fetch = throughHandler(handler);
  const first = await callStoreRunner(
    appRequest(fixture),
    appOptions(fetch, "33333333-3333-4333-8333-333333333333"),
  );
  assert.equal(first.state, "dispatch_accepted");
  assert.equal(first.packageSha256, fixture.sha256);
  assert.equal(dependencies.persistence.jobs.size, 1);

  const replay = callStoreRunner(
    appRequest(fixture),
    appOptions(fetch, "33333333-3333-4333-8333-333333333333"),
  );
  await assert.rejects(replay, (error) => {
    assert.ok(error instanceof StoreRunnerError);
    assert.equal(error.code, "STORE_RUNNER_REQUEST_FAILED");
    return true;
  });

  // A fresh signed retry remains idempotent even when the original durable
  // acceptance is older than the request replay window.
  clock += 10 * 60 * 1_000;
  const idempotent = await callStoreRunner(
    appRequest(fixture),
    appOptions(fetch, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", clock),
  );
  assert.equal(idempotent.state, "dispatch_accepted");
  assert.equal(idempotent.acceptedAt, first.acceptedAt);
  assert.equal(dependencies.persistence.jobs.size, 1);

  const wrongHashFixture = { ...fixture, sha256: "f".repeat(64) };
  await assert.rejects(
    callStoreRunner(
      { ...appRequest(wrongHashFixture), releaseId: "44444444-4444-4444-8444-444444444444" },
      appOptions(fetch, "55555555-5555-4555-8555-555555555555", clock),
    ),
    /STORE_RUNNER_REQUEST_FAILED/,
  );
  assert.equal(dependencies.persistence.jobs.size, 1);

  const badAuth = await handler(
    new Request("http://127.0.0.1:8790/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-helix-store-timestamp": String(clock),
        "x-helix-store-nonce": "66666666-6666-4666-8666-666666666666",
        "x-helix-store-signature": "0".repeat(64),
      },
      body: "{}",
    }),
  );
  assert.equal(badAuth.status, 401);
});

test("the app rejects an unsigned runner acceptance (contract; not provider proof)", async () => {
  const fixture = sourcePackage();
  const dependencies = runnerDependencies();
  const handler = createStoreRunnerHandler({
    secret: SECRET,
    persistence: dependencies.persistence,
    credentialAuthority: createCredentialAuthority(dependencies.configuration),
    executor: dependencies.executor,
    easCliVersion: dependencies.configuration.easCliVersion,
    now: () => NOW,
  });
  const fetch = throughHandler(
    handler,
    async (response) =>
      new Response(await response.text(), {
        status: response.status,
        headers: {
          "content-type": "application/json",
          "x-helix-store-signature": "0".repeat(64),
        },
      }),
  );
  await assert.rejects(
    callStoreRunner(appRequest(fixture), appOptions(fetch, "77777777-7777-4777-8777-777777777777")),
    (error) => {
      assert.ok(error instanceof StoreRunnerError);
      assert.equal(error.code, "STORE_RUNNER_SIGNATURE_INVALID");
      return true;
    },
  );
});

test("an uncertain prior activation fails closed without a second dispatch (contract; not provider proof)", async () => {
  const fixture = sourcePackage();
  const dependencies = runnerDependencies();
  const handler = createStoreRunnerHandler({
    secret: SECRET,
    persistence: dependencies.persistence,
    credentialAuthority: createCredentialAuthority(dependencies.configuration),
    executor: dependencies.executor,
    easCliVersion: dependencies.configuration.easCliVersion,
    now: () => NOW,
  });
  const fetch = throughHandler(handler);
  await callStoreRunner(
    appRequest(fixture),
    appOptions(fetch, "12121212-1212-4212-8212-121212121212"),
  );
  dependencies.persistence.jobs.get(RELEASE_ID).activation_started_at = new Date(
    NOW - 10 * 60 * 1_000,
  ).toISOString();
  const blocked = await callStoreRunner(
    appRequest(fixture, "activate"),
    appOptions(fetch, "13131313-1313-4313-8313-131313131313"),
  );
  assert.equal(blocked.state, "action_required");
  assert.equal(blocked.error.code, "STORE_RUNNER_ACTIVATION_RECONCILIATION_REQUIRED");
  assert.equal(dependencies.dispatchCount(), 0);
});

test("concurrent activation reports in-flight and never orphans a real workflow", async () => {
  const fixture = sourcePackage();
  let releaseDispatch;
  let dispatchStarted;
  const started = new Promise((resolve) => {
    dispatchStarted = resolve;
  });
  const dependencies = runnerDependencies({
    onDispatch: () =>
      new Promise((resolve) => {
        releaseDispatch = resolve;
        dispatchStarted();
      }),
  });
  const handler = createStoreRunnerHandler({
    secret: SECRET,
    persistence: dependencies.persistence,
    credentialAuthority: createCredentialAuthority(dependencies.configuration),
    executor: dependencies.executor,
    easCliVersion: dependencies.configuration.easCliVersion,
    now: () => NOW,
  });
  const fetch = throughHandler(handler);
  await callStoreRunner(
    appRequest(fixture),
    appOptions(fetch, "14141414-1414-4414-8414-141414141414"),
  );

  const firstActivation = callStoreRunner(
    appRequest(fixture, "activate"),
    appOptions(fetch, "15151515-1515-4515-8515-151515151515"),
  );
  await started;
  const concurrent = await callStoreRunner(
    appRequest(fixture, "activate"),
    appOptions(fetch, "16161616-1616-4616-8616-161616161616"),
  );
  assert.equal(concurrent.state, "dispatch_accepted");
  assert.equal(concurrent.retryAfterSeconds, 5);
  assert.equal(concurrent.error, null);
  assert.equal(dependencies.dispatchCount(), 1);

  releaseDispatch();
  const queued = await firstActivation;
  assert.equal(queued.state, "workflow_queued");
  const replay = await callStoreRunner(
    appRequest(fixture, "activate"),
    appOptions(fetch, "17171717-1717-4717-8717-171717171717"),
  );
  assert.equal(replay.state, "workflow_queued");
  assert.equal(replay.workflowRunId, "workflow-run-contract");
  assert.equal(dependencies.dispatchCount(), 1);
});

test("activation is idempotent and distribution is persisted only from explicit evidence (contract; not provider proof)", async () => {
  const fixture = sourcePackage();
  const successView = JSON.stringify({
    status: "SUCCESS",
    jobs: [
      {
        id: "workflow-build-job",
        key: "build_android",
        status: "SUCCESS",
        outputs: { build_id: "eas-build-id" },
      },
      {
        id: "workflow-submit-job",
        key: "submit_play_internal",
        status: "SUCCESS",
        outputs: { android_package_id: IDENTITY.appIdentifier },
      },
    ],
  });
  const dependencies = runnerDependencies({ inspectRaw: successView });
  const handler = createStoreRunnerHandler({
    secret: SECRET,
    persistence: dependencies.persistence,
    credentialAuthority: createCredentialAuthority(dependencies.configuration),
    executor: dependencies.executor,
    easCliVersion: dependencies.configuration.easCliVersion,
    now: () => NOW,
  });
  const fetch = throughHandler(handler);
  await callStoreRunner(
    appRequest(fixture),
    appOptions(fetch, "88888888-8888-4888-8888-888888888888"),
  );
  const queued = await callStoreRunner(
    appRequest(fixture, "activate"),
    appOptions(fetch, "99999999-9999-4999-8999-999999999999"),
  );
  assert.equal(queued.state, "workflow_queued");
  const queuedReplay = await callStoreRunner(
    appRequest(fixture, "activate"),
    appOptions(fetch, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
  );
  assert.equal(queuedReplay.workflowRunId, "workflow-run-contract");
  assert.equal(dependencies.dispatchCount(), 1);

  const distributed = await callStoreRunner(
    appRequest(fixture, "status"),
    appOptions(fetch, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
  );
  assert.equal(distributed.state, "distributed");
  assert.equal(distributed.workflowBuildJobId, "workflow-build-job");
  assert.equal(distributed.workflowDistributionJobId, "workflow-submit-job");
  assert.equal(distributed.providerBuildId, "eas-build-id");
  assert.equal(distributed.providerSubmissionId, null);
  assert.equal(distributed.providerReleaseId, null);
  assert.equal(dependencies.persistence.jobs.get(RELEASE_ID).state, "distributed");
});

test("documented hyphenated statuses normalize and unknown values fail closed (contract; not provider proof)", () => {
  const configuration = parseStoreRunnerConfiguration(runnerEnvironment());
  const credentialEvidence = createCredentialAuthority(configuration).verify(IDENTITY);
  const job = {
    requestNonce: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    releaseId: RELEASE_ID,
    idempotencyKey: "contract-store-release-idempotency-key",
    packageSha256: "d".repeat(64),
    identity: IDENTITY,
    runnerJobId: `eas-${RELEASE_ID}`,
    workflowRunId: "workflow-run-contract",
    credentialEvidence,
    acceptedAt: new Date(NOW).toISOString(),
    easCliVersion: configuration.easCliVersion,
  };
  const observedAt = new Date(NOW).toISOString();

  const inProgress = normalizeEasWorkflowView({
    raw: JSON.stringify({
      status: "in-progress",
      jobs: [{ key: "build_android", status: "in-progress" }],
    }),
    job,
    observedAt,
  });
  assert.equal(inProgress.state, "build_in_progress");
  assert.equal(inProgress.providerEvidence.workflowStatus, "in_progress");

  const actionRequired = normalizeEasWorkflowView({
    raw: JSON.stringify({ status: "action-required", jobs: [] }),
    job,
    observedAt,
  });
  assert.equal(actionRequired.state, "action_required");
  assert.equal(actionRequired.providerEvidence.workflowStatus, "action_required");

  assert.throws(
    () =>
      normalizeEasWorkflowView({
        raw: JSON.stringify({ status: "unexpected", jobs: [] }),
        job,
        observedAt,
      }),
    /STORE_EAS_WORKFLOW_STATUS_UNKNOWN/,
  );
  assert.throws(
    () =>
      normalizeEasWorkflowView({
        raw: JSON.stringify({
          status: "in-progress",
          jobs: [{ key: "build_android", status: "unexpected" }],
        }),
        job,
        observedAt,
      }),
    /STORE_EAS_JOB_STATUS_UNKNOWN/,
  );
});

test("EAS executor uses exact noninteractive workflow argv and never writes a key file (contract; not provider proof)", async () => {
  const fixture = sourcePackage();
  const configuration = parseStoreRunnerConfiguration(runnerEnvironment());
  const calls = [];
  const executor = createEasWorkflowExecutor(configuration, {
    run: async (executable, argv, options) => {
      calls.push({ executable, argv, cwd: options.cwd });
      assert.equal(executable, configuration.easCliPath);
      assert.deepEqual(argv, [
        "workflow:run",
        ".eas/workflows/helix-store.yml",
        "--non-interactive",
        "--no-wait",
        "--json",
      ]);
      const eas = JSON.parse(await readFile(join(options.cwd, "eas.json"), "utf8"));
      assert.equal(Object.hasOwn(eas.submit.production.android, "serviceAccountKeyPath"), false);
      await assert.rejects(
        access(join(options.cwd, ".helix/google-play-service-account.json")),
        (error) => error?.code === "ENOENT",
      );
      return { stdout: JSON.stringify({ id: "workflow-run-contract" }), stderr: "" };
    },
  });
  const result = await executor.dispatch({ sourceZip: fixture.bytes, identity: IDENTITY });
  assert.equal(result.workflowRunId, "workflow-run-contract");
  assert.equal(calls.length, 1);
});
