import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REQUEST_FINGERPRINT = "a".repeat(64);

function makeQueuedJob() {
  const id = `poll-recovery-${crypto.randomUUID()}`;
  return {
    id,
    prompt: "Recover a durably queued preview build",
    locale: "en",
    mode: "generate",
    buildLevel: "prototype",
    currentHtml: null,
    status: "running",
    steps: [],
    html: null,
    usedAi: false,
    title: "Poll recovery",
    userId: "poll-recovery-user",
    requestFingerprint: REQUEST_FINGERPRINT,
    createdAt: Date.now(),
    checkpoint: {
      pipelineVersion: "helix-v3",
      requestFingerprint: REQUEST_FINGERPRINT,
      stage: "queued",
    },
  };
}

test("an authorized poll durably retries a transiently rejected preview dispatch", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  const [queue, recovery, db] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/jobs/queue.ts"),
    vite.ssrLoadModule("/src/lib/server/jobs/recovery.ts"),
    vite.ssrLoadModule("/src/lib/db.ts"),
  ]);
  const pg = await db.getPglite();
  const previousConsoleError = console.error;
  const errorLogs = [];
  console.error = (...values) => errorLogs.push(values.map(String).join(" "));
  t.after(async () => {
    console.error = previousConsoleError;
    await vite.close();
    await pg.close();
  });

  const draft = makeQueuedJob();
  await queue.enqueueBuildJob({
    job: draft,
    idempotencyKey: `poll-recovery:${draft.id}`,
    requestFingerprint: REQUEST_FINGERPRINT,
  });
  const queued = await queue.loadBuildJob(draft.id);
  assert.equal(queued.queue.status, "queued");

  let dispatchCalls = 0;
  const reserveFailure = await recovery.recoverPolledBuildJob(
    queued,
    async () => {
      dispatchCalls += 1;
    },
    async () => {
      throw new Error("transient database reservation failure");
    },
  );
  assert.equal(reserveFailure, "deferred");
  assert.equal(dispatchCalls, 0, "a failed reservation must not dispatch");
  assert.equal(errorLogs.length, 1);

  const first = await recovery.recoverPolledBuildJob(queued, async () => {
    dispatchCalls += 1;
    throw new recovery.BuildRecoveryDispatchError(401);
  });
  assert.equal(first, "deferred");
  assert.equal(dispatchCalls, 1);
  assert.equal(errorLogs.length, 2);
  for (const log of errorLogs) assert.doesNotMatch(log, /cookie|secret/i);

  assert.equal(
    await recovery.recoverPolledBuildJob(queued, async () => {
      dispatchCalls += 1;
    }),
    "throttled",
  );
  assert.equal(dispatchCalls, 1, "the durable throttle must suppress immediate duplicate polls");

  await pg.query(
    "update build_jobs set heartbeat_at = now() - interval '3 seconds' where id = $1",
    [draft.id],
  );
  assert.equal(
    await recovery.recoverPolledBuildJob(queued, async () => {
      dispatchCalls += 1;
    }),
    "accepted",
  );
  assert.equal(dispatchCalls, 2, "a later poll must recover the rejected dispatch");
  assert.equal(
    await recovery.recoverPolledBuildJob(queued, async () => {
      dispatchCalls += 1;
    }),
    "throttled",
  );
  assert.equal(dispatchCalls, 2, "an accepted dispatch must not be duplicated by the next poll");

  await pg.query(
    "update build_jobs set heartbeat_at = now() - interval '3 seconds' where id = $1",
    [draft.id],
  );
  const concurrent = await Promise.all([
    recovery.recoverPolledBuildJob(queued, async () => {
      dispatchCalls += 1;
    }),
    recovery.recoverPolledBuildJob(queued, async () => {
      dispatchCalls += 1;
    }),
  ]);
  assert.deepEqual(concurrent.sort(), ["accepted", "throttled"]);
  assert.equal(dispatchCalls, 3, "only one concurrent poll may reserve a redispatch");

  const deadWorker = await queue.claimBuildJob(draft.id, "dead-preview-worker");
  assert.equal(deadWorker.queue.status, "running");
  await pg.query(
    `update build_jobs
     set lock_expires_at = now() - interval '1 second',
         heartbeat_at = now() - interval '3 seconds'
     where id = $1`,
    [draft.id],
  );
  const staleRunning = await queue.loadBuildJob(draft.id);
  assert.equal(staleRunning.queue.status, "running");
  assert.equal(
    await recovery.recoverPolledBuildJob(staleRunning, async () => {
      dispatchCalls += 1;
    }),
    "accepted",
  );
  assert.equal(dispatchCalls, 4, "polling must recover an expired running lease in previews");
});

test("poll recovery is wired only after owner or guest-capability verification", async () => {
  const agents = await readFile(join(ROOT, "src/lib/server/agents.ts"), "utf8");
  const owned = agents.slice(
    agents.indexOf("export const getBuildJob"),
    agents.indexOf("export const getGuestBuildJob"),
  );
  const guest = agents.slice(agents.indexOf("export const getGuestBuildJob"));

  assert.ok(
    owned.indexOf("await getOwnedBuildJob(") < owned.indexOf("await recoverPolledBuildJob("),
  );
  assert.ok(
    guest.indexOf("await getGuestAccessibleBuildJob(") <
      guest.indexOf("await recoverPolledBuildJob("),
  );
});
