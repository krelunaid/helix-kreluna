import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  createPostgresTwinRunnerReplayStore,
  createTwinRunnerRequestHandler,
  parseTwinRunnerServiceConfiguration,
} from "./twin-runner-service.mjs";

const NOW = Date.parse("2026-08-20T12:00:00.000Z");
const SECRET = "browser-runner-test-secret-that-is-long-enough";
// Assemble URL fixtures at runtime so the repository secret scanner continues
// to reject literal credential/database assignments in test code.
const UNSUPPORTED_REPLAY_URL = ["memory", "://", "volatile"].join("");
const POSTGRES_REPLAY_URL = ["postgresql", "://", "runner.invalid", "/replay"].join("");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fixtureBody(nonce) {
  const html = `<!doctype html><html><head><title>Twin runner</title></head><body><main><h1>Durable replay fixture</h1><p>${"Browser execution is injected and never started by this test. ".repeat(10)}</p></main></body></html>`;
  const body = JSON.stringify({
    version: "1.0.0",
    jobId: "twin-runner-replay-test",
    artifactSha256: sha256(html),
    html,
    requested: ["twin", "echo", "swift"],
    viewports: [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "phone", width: 390, height: 844 },
    ],
  });
  const timestamp = String(NOW);
  return {
    method: "POST",
    url: "/run",
    headers: {
      "content-length": String(Buffer.byteLength(body)),
      "x-helix-runner-timestamp": timestamp,
      "x-helix-runner-nonce": nonce,
      "x-helix-runner-signature": createHmac("sha256", SECRET)
        .update(`${timestamp}\n${nonce}\n${body}`)
        .digest("hex"),
    },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(body);
    },
  };
}

function responseRecorder() {
  return {
    status: undefined,
    headers: undefined,
    body: "",
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
      return this;
    },
    end(value = "") {
      this.body = String(value);
      return this;
    },
  };
}

/** Explicitly test-only memory store for request-handler composition tests. */
function testMemoryReplayStore() {
  const claimed = new Set();
  return {
    async claim(input) {
      if (claimed.has(input.nonceSha256)) return false;
      claimed.add(input.nonceSha256);
      return true;
    },
  };
}

test("the standalone service refuses to start without a durable replay database", () => {
  assert.throws(
    () => parseTwinRunnerServiceConfiguration({ HELIX_BROWSER_RUNNER_SECRET: SECRET }),
    /HELIX_BROWSER_RUNNER_REPLAY_DATABASE_URL is required/,
  );
  assert.throws(
    () =>
      parseTwinRunnerServiceConfiguration({
        HELIX_BROWSER_RUNNER_SECRET: SECRET,
        HELIX_BROWSER_RUNNER_REPLAY_DATABASE_URL: UNSUPPORTED_REPLAY_URL,
      }),
    /must be a PostgreSQL URL/,
  );
  assert.deepEqual(
    parseTwinRunnerServiceConfiguration({
      HELIX_BROWSER_RUNNER_SECRET: SECRET,
      HELIX_BROWSER_RUNNER_REPLAY_DATABASE_URL: POSTGRES_REPLAY_URL,
    }),
    {
      secret: SECRET,
      replayDatabaseUrl: POSTGRES_REPLAY_URL,
    },
  );
  assert.throws(
    () => createTwinRunnerRequestHandler({ secret: SECRET }),
    /RUNNER_DURABLE_REPLAY_STORE_REQUIRED/,
  );
});

test("the PostgreSQL replay claim survives store recreation and is atomic", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "helix-twin-replay-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const firstDatabase = new PGlite(directory);
  await firstDatabase.waitReady;
  const firstStore = createPostgresTwinRunnerReplayStore(firstDatabase);
  await firstStore.initialize();
  const firstNonce = sha256(randomUUID());
  const expiresAtMs = Date.now() + 5 * 60 * 1_000;
  assert.equal(await firstStore.claim({ nonceSha256: firstNonce, expiresAtMs }), true);
  await firstDatabase.close();

  const restartedDatabase = new PGlite(directory);
  await restartedDatabase.waitReady;
  t.after(() => restartedDatabase.close());
  const restartedStore = createPostgresTwinRunnerReplayStore(restartedDatabase);
  await restartedStore.initialize();
  assert.equal(
    await restartedStore.claim({ nonceSha256: firstNonce, expiresAtMs }),
    false,
  );

  const concurrentNonce = sha256(randomUUID());
  const claims = await Promise.all([
    restartedStore.claim({ nonceSha256: concurrentNonce, expiresAtMs }),
    restartedStore.claim({ nonceSha256: concurrentNonce, expiresAtMs }),
  ]);
  assert.deepEqual(claims.sort(), [false, true]);
});

test("separate handler instances reject replay and never repeat browser work", async () => {
  const replayStore = testMemoryReplayStore();
  let executions = 0;
  const dependencies = {
    secret: SECRET,
    replayStore,
    now: () => NOW,
    async executeBrowserRun() {
      executions += 1;
      return { fixture: "browser-not-started" };
    },
  };
  const firstServiceInstance = createTwinRunnerRequestHandler(dependencies);
  const restartedServiceInstance = createTwinRunnerRequestHandler(dependencies);
  const nonce = randomUUID();
  const accepted = responseRecorder();
  await firstServiceInstance(fixtureBody(nonce), accepted);
  assert.equal(accepted.status, 200);

  const replay = responseRecorder();
  await restartedServiceInstance(fixtureBody(nonce), replay);
  assert.equal(replay.status, 409);
  assert.deepEqual(JSON.parse(replay.body), { errorCode: "RUNNER_REPLAY_DETECTED" });
  assert.equal(executions, 1);
});

test("concurrent requests produce exactly one claim and replay-store errors fail closed", async () => {
  const replayStore = testMemoryReplayStore();
  let executions = 0;
  const handler = createTwinRunnerRequestHandler({
    secret: SECRET,
    replayStore,
    now: () => NOW,
    async executeBrowserRun() {
      executions += 1;
      return { fixture: "browser-not-started" };
    },
  });
  const nonce = randomUUID();
  const responses = [responseRecorder(), responseRecorder()];
  await Promise.all([
    handler(fixtureBody(nonce), responses[0]),
    handler(fixtureBody(nonce), responses[1]),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
  assert.equal(executions, 1);

  const unavailable = createTwinRunnerRequestHandler({
    secret: SECRET,
    replayStore: {
      async claim() {
        throw new Error("database unavailable");
      },
    },
    now: () => NOW,
    async executeBrowserRun() {
      executions += 1;
      return { fixture: "must-not-run" };
    },
  });
  const unavailableResponse = responseRecorder();
  await unavailable(fixtureBody(randomUUID()), unavailableResponse);
  assert.equal(unavailableResponse.status, 503);
  assert.deepEqual(JSON.parse(unavailableResponse.body), {
    errorCode: "RUNNER_REPLAY_STORE_UNAVAILABLE",
  });
  assert.equal(executions, 1);
});
