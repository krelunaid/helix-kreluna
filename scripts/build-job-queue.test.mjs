import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REQUEST_FINGERPRINT = "a".repeat(64);

function makeJob(overrides = {}) {
  return {
    id: `queue-job-${crypto.randomUUID()}`,
    prompt: "Build a queue test app",
    locale: "en",
    mode: "generate",
    currentHtml: "<!doctype html><html><body>queue</body></html>",
    status: "running",
    steps: [],
    html: "<!doctype html><html><body>queue</body></html>",
    usedAi: false,
    title: "Queue test",
    userId: "queue-test-user",
    requestFingerprint: REQUEST_FINGERPRINT,
    createdAt: Date.now(),
    checkpoint: {
      pipelineVersion: "helix-v3",
      requestFingerprint: REQUEST_FINGERPRINT,
      stage: "queued",
    },
    ...overrides,
  };
}

function enqueueInput(job, suffix, overrides = {}) {
  return {
    job,
    idempotencyKey: `queue-test:${suffix}`,
    requestFingerprint: REQUEST_FINGERPRINT,
    ...overrides,
  };
}

test("the persistent build queue enforces its database invariants", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  const queue = await vite.ssrLoadModule("/src/lib/server/jobs/queue.ts");
  const db = await vite.ssrLoadModule("/src/lib/db.ts");
  const pg = await db.getPglite();

  t.after(async () => {
    await vite.close();
    await pg.close();
  });

  await t.test("enqueue is idempotent and rejects a fingerprint mismatch", async () => {
    const suffix = crypto.randomUUID();
    const firstJob = makeJob();
    const first = await queue.enqueueBuildJob(enqueueInput(firstJob, suffix));
    assert.deepEqual(first, { jobId: firstJob.id, wasCreated: true });

    const replay = await queue.enqueueBuildJob(
      enqueueInput(makeJob(), suffix),
    );
    assert.deepEqual(replay, { jobId: firstJob.id, wasCreated: false });

    await assert.rejects(
      queue.enqueueBuildJob(
        enqueueInput(makeJob(), suffix, {
          requestFingerprint: "b".repeat(64),
        }),
      ),
      /JOB_IDEMPOTENCY_KEY_REUSED/,
    );

    const count = await pg.query(
      "select count(*)::int as count from build_jobs where idempotency_key = $1",
      [`queue-test:${suffix}`],
    );
    assert.equal(count.rows[0].count, 1);
  });

  await t.test("two concurrent claims produce one lease and one attempt", async () => {
    const suffix = crypto.randomUUID();
    const job = makeJob();
    await queue.enqueueBuildJob(enqueueInput(job, suffix, { maxAttempts: 3 }));

    const claims = await Promise.all([
      queue.claimBuildJob(job.id, `worker-a:${suffix}`),
      queue.claimBuildJob(job.id, `worker-b:${suffix}`),
    ]);
    const winners = claims.filter(Boolean);
    assert.equal(winners.length, 1);
    assert.equal(winners[0].queue.status, "running");
    assert.equal(winners[0].queue.attemptCount, 1);

    const persisted = await pg.query(
      `select attempt_count, locked_by
       from build_jobs where id = $1`,
      [job.id],
    );
    assert.equal(persisted.rows[0].attempt_count, 1);
    assert.ok([
      `worker-a:${suffix}`,
      `worker-b:${suffix}`,
    ].includes(persisted.rows[0].locked_by));
    const attempts = await pg.query(
      "select count(*)::int as count from build_job_attempts where job_id = $1",
      [job.id],
    );
    assert.equal(attempts.rows[0].count, 1);
  });

  await t.test("an expired lease fences heartbeat and snapshots, then can be reclaimed", async () => {
    const suffix = crypto.randomUUID();
    const oldWorker = `worker-old:${suffix}`;
    const newWorker = `worker-new:${suffix}`;
    const job = makeJob();
    await queue.enqueueBuildJob(enqueueInput(job, suffix, { maxAttempts: 3 }));
    const oldClaim = await queue.claimBuildJob(job.id, oldWorker);
    assert.ok(oldClaim);

    await pg.query(
      "update build_jobs set lock_expires_at = now() - interval '1 second' where id = $1",
      [job.id],
    );
    assert.equal(await queue.heartbeatBuildJob(job.id, oldWorker), false);
    await assert.rejects(
      queue.saveBuildJobSnapshot(oldClaim, oldWorker),
      (error) => error instanceof queue.BuildJobLeaseLostError,
    );

    const reclaimed = await queue.claimBuildJob(job.id, newWorker);
    assert.ok(reclaimed);
    assert.equal(reclaimed.queue.attemptCount, 2);
    assert.equal(await queue.heartbeatBuildJob(job.id, oldWorker), false);
    await assert.rejects(
      queue.saveBuildJobSnapshot(reclaimed, oldWorker),
      (error) => error instanceof queue.BuildJobLeaseLostError,
    );
    assert.equal(await queue.heartbeatBuildJob(job.id, newWorker), true);
    await assert.doesNotReject(
      queue.saveBuildJobSnapshot(reclaimed, newWorker),
    );
  });

  await t.test("retry stops at maxAttempts and explicit resume preserves attempt history", async () => {
    const suffix = crypto.randomUUID();
    const job = makeJob();
    await queue.enqueueBuildJob(enqueueInput(job, suffix, { maxAttempts: 2 }));

    const first = await queue.claimBuildJob(job.id, `worker-1:${suffix}`);
    assert.ok(first);
    assert.deepEqual(
      await queue.markBuildJobFailed(first, `worker-1:${suffix}`, new Error("first failure")),
      { retry: true },
    );

    const second = await queue.claimBuildJob(job.id, `worker-2:${suffix}`);
    assert.ok(second);
    assert.equal(second.queue.attemptCount, 2);
    assert.deepEqual(
      await queue.markBuildJobFailed(second, `worker-2:${suffix}`, new Error("last failure")),
      { retry: false },
    );
    assert.equal(await queue.claimBuildJob(job.id, `worker-3:${suffix}`), null);

    assert.equal(await queue.resumeBuildJob(job.id), true);
    const resumed = await queue.claimBuildJob(job.id, `worker-3:${suffix}`);
    assert.ok(resumed);
    assert.equal(resumed.queue.attemptCount, 3);
    assert.equal(resumed.queue.maxAttempts, 3);

    const attempts = await pg.query(
      `select attempt_number, outcome
       from build_job_attempts
       where job_id = $1
       order by attempt_number`,
      [job.id],
    );
    assert.deepEqual(
      attempts.rows.map((row) => [row.attempt_number, row.outcome]),
      [[1, "retry"], [2, "failed"], [3, null]],
    );
  });

  await t.test("cancel blocks work, and resume requeues without overwriting attempts", async () => {
    const suffix = crypto.randomUUID();
    const job = makeJob();
    await queue.enqueueBuildJob(enqueueInput(job, suffix, { maxAttempts: 2 }));

    assert.equal(await queue.requestBuildJobCancel(job.id), true);
    assert.equal(await queue.claimBuildJob(job.id, `worker-0:${suffix}`), null);
    assert.equal((await queue.loadBuildJob(job.id)).queue.status, "cancelled");
    assert.equal(await queue.resumeBuildJob(job.id), true);

    const first = await queue.claimBuildJob(job.id, `worker-1:${suffix}`);
    assert.ok(first);
    assert.equal(await queue.requestBuildJobCancel(job.id), true);
    assert.equal(await queue.heartbeatBuildJob(job.id, `worker-1:${suffix}`), false);
    await assert.rejects(
      queue.saveBuildJobSnapshot(first, `worker-1:${suffix}`),
      (error) => error instanceof queue.BuildJobLeaseLostError,
    );
    await queue.markBuildJobCancelled(first, `worker-1:${suffix}`);
    assert.equal((await queue.loadBuildJob(job.id)).queue.status, "cancelled");

    assert.equal(await queue.resumeBuildJob(job.id), true);
    const second = await queue.claimBuildJob(job.id, `worker-2:${suffix}`);
    assert.ok(second);
    assert.equal(second.queue.attemptCount, 2);
    const attempts = await pg.query(
      `select attempt_number, outcome
       from build_job_attempts
       where job_id = $1
       order by attempt_number`,
      [job.id],
    );
    assert.deepEqual(
      attempts.rows.map((row) => [row.attempt_number, row.outcome]),
      [[1, "cancelled"], [2, null]],
    );
  });

  await t.test("the hard five-attempt ceiling cannot be bypassed by resume", async () => {
    const suffix = crypto.randomUUID();
    const job = makeJob();
    await queue.enqueueBuildJob(enqueueInput(job, suffix, { maxAttempts: 5 }));
    await pg.query(
      `update build_jobs
       set queue_status = 'failed', attempt_count = 5, completed_at = now()
       where id = $1`,
      [job.id],
    );
    assert.equal(await queue.resumeBuildJob(job.id), false);
    assert.equal(await queue.claimBuildJob(job.id, `worker-6:${suffix}`), null);
  });
});
