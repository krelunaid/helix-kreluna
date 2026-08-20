import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("the DB-backed worker fails honestly and resumes a finalized checkpoint", async (t) => {
  const previousKey = process.env.XAI_API_KEY;
  delete process.env.XAI_API_KEY;
  t.after(() => {
    if (previousKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = previousKey;
  });

  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  const create = await vite.ssrLoadModule("/src/lib/server/jobs/create.ts");
  const queue = await vite.ssrLoadModule("/src/lib/server/jobs/queue.ts");
  const worker = await vite.ssrLoadModule("/src/lib/server/jobs/worker.ts");
  const pipeline = await vite.ssrLoadModule("/src/lib/server/jobs/pipeline.ts");
  const db = await vite.ssrLoadModule("/src/lib/db.ts");
  const pg = await db.getPglite();

  t.after(async () => {
    await vite.close();
    await pg.close();
  });

  const { job, requestFingerprint } = await create.createBuildJobDraft({
    prompt: "Build a small truthful worker test app",
    locale: "en",
    mode: "generate",
    currentHtml: null,
  });
  await queue.enqueueBuildJob({
    job,
    idempotencyKey: `worker-test:${crypto.randomUUID()}`,
    requestFingerprint,
    maxAttempts: 2,
  });

  assert.equal(await worker.processBuildJob(job.id), "failed");
  const terminal = await queue.loadBuildJob(job.id);
  assert.equal(terminal.queue.status, "failed");
  assert.equal(terminal.status, "error");
  assert.equal(terminal.usedAi, false);
  assert.match(terminal.error, /XAI_API_KEY_MISSING/);

  const attempts = await pg.query(
    `select attempt_number, outcome, error_code
     from build_job_attempts
     where job_id = $1
     order by attempt_number`,
    [job.id],
  );
  assert.deepEqual(
    attempts.rows.map((row) => [row.attempt_number, row.outcome, row.error_code]),
    [
      [1, "failed", "XAI_API_KEY_MISSING"],
    ],
  );

  const corrupt = await create.createBuildJobDraft({
    prompt: "Reject a corrupt persisted artifact",
    locale: "en",
    mode: "generate",
    currentHtml: null,
  });
  corrupt.job.html = "<html></html>";
  corrupt.job.usedAi = true;
  corrupt.job.checkpoint = {
    pipelineVersion: pipeline.HELIX_PIPELINE_VERSION,
    requestFingerprint: corrupt.requestFingerprint,
    stage: "finalized",
    artifacts: { html: "<html></html>", usedAi: true },
  };
  await queue.enqueueBuildJob({
    job: corrupt.job,
    idempotencyKey: `worker-corrupt-test:${crypto.randomUUID()}`,
    requestFingerprint: corrupt.requestFingerprint,
    maxAttempts: 2,
  });

  assert.equal(await worker.processBuildJob(corrupt.job.id), "failed");
  const rejectedCorrupt = await queue.loadBuildJob(corrupt.job.id);
  assert.equal(rejectedCorrupt.queue.status, "failed");
  assert.equal(rejectedCorrupt.usedAi, false);
  assert.match(rejectedCorrupt.error, /XAI_API_KEY_MISSING/);

  const resumed = await create.createBuildJobDraft({
    prompt: "Resume a fully validated persisted artifact",
    locale: "en",
    mode: "generate",
    currentHtml: null,
  });
  const resumedHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Checkpoint</title></head><body><main><h1>Persisted artifact</h1><p>${"validated ".repeat(60)}</p></main></body></html>`;
  resumed.job.html = resumedHtml;
  resumed.job.usedAi = true;
  resumed.job.checkpoint = {
    pipelineVersion: pipeline.HELIX_PIPELINE_VERSION,
    requestFingerprint: resumed.requestFingerprint,
    stage: "finalized",
    artifacts: { html: resumedHtml, usedAi: true },
  };
  await queue.enqueueBuildJob({
    job: resumed.job,
    idempotencyKey: `worker-resume-test:${crypto.randomUUID()}`,
    requestFingerprint: resumed.requestFingerprint,
    maxAttempts: 2,
  });

  assert.equal(await worker.processBuildJob(resumed.job.id), "completed");
  const ready = await queue.loadBuildJob(resumed.job.id);
  assert.equal(ready.queue.status, "awaiting_human_approval");
  assert.equal(ready.status, "ready");
  assert.equal(ready.html, resumedHtml);
  assert.equal(ready.checkpoint.stage, "finalized");
  assert.equal(ready.checkpoint.pipelineVersion, pipeline.HELIX_PIPELINE_VERSION);
  assert.equal(ready.checkpoint.requestFingerprint, resumed.requestFingerprint);
  assert.equal(ready.score.schemaVersion, "2.0.0");
  assert.equal(ready.score.artifactSha256, ready.queue.artifactSha256);
  assert.equal(ready.score.metrics.coverage.status, "not_run");
  assert.equal(ready.score.metrics.coverage.value, null);
  assert.equal(ready.score.capacityForecast.status, "not_run");
  assert.match(ready.files["docs/score.md"], /Weighted inputs:/);
  assert.match(ready.files["docs/score.md"], /Status: not_run/);
  assert.equal(ready.buildLevel, "prototype");
  assert.equal(ready.workspace.kind, "helix_workspace");
  assert.equal(ready.workspace.buildLevel, "prototype");
  assert.equal(ready.workspace.entrypoint, "index.html");
  assert.equal(ready.workspace.fileCount, Object.keys(ready.files).length);
  assert.match(ready.workspace.artifactSha256, /^[0-9a-f]{64}$/);
  assert.equal(
    ready.workspace.capabilities.find((item) => item.id === "frontend").status,
    "implemented",
  );
  assert.equal(
    ready.workspace.capabilities.find((item) => item.id === "backend").status,
    "not_configured",
  );
  assert.equal(
    ready.workspace.validations.find((item) => item.scope === "test").status,
    "not_run",
  );

  const resumedAttempts = await pg.query(
    `select attempt_number, outcome, error_code
     from build_job_attempts
     where job_id = $1
     order by attempt_number`,
    [resumed.job.id],
  );
  assert.deepEqual(
    resumedAttempts.rows.map((row) => [row.attempt_number, row.outcome, row.error_code]),
    [[1, "succeeded", null]],
  );
});
