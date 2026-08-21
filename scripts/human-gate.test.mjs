import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HUMAN_GATE_MODULE = "/src/lib/server/review/human-gate.ts";

function exposeHumanGateInternals() {
  return {
    name: "human-gate-test-internals",
    enforce: "pre",
    transform(source, id) {
      const filename = id.split("?", 1)[0].replaceAll("\\", "/");
      if (!filename.endsWith(HUMAN_GATE_MODULE)) return null;
      return {
        code: `${source}\nexport { decideOwnedJob as __testDecideOwnedJob };\n`,
        map: null,
      };
    },
  };
}

function validHtml(label) {
  const copy = `${label} is an immutable Human Gate release candidate. `.repeat(12);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${label}</title></head><body><main><h1>${label}</h1><p>${copy}</p></main></body></html>`;
}

function makeJob({ jobId, projectId, userId, html }) {
  return {
    id: jobId,
    prompt: `Build ${jobId}`,
    locale: "en",
    mode: "generate",
    buildLevel: "prototype",
    currentHtml: html,
    status: "running",
    steps: [],
    html,
    usedAi: true,
    title: `Candidate ${jobId}`,
    files: {
      "README.md": `# Candidate ${jobId}\n`,
      "docs/artifact-level.md": "# Artifact level\n\nPrototype\n",
      "index.html": html,
    },
    checkpoint: {
      pipelineVersion: "helix-v3",
      requestFingerprint: "",
      stage: "queued",
    },
    projectId,
    userId,
    createdAt: Date.now(),
  };
}

async function createProject(pg, { projectId, userId }) {
  await pg.query(
    `insert into projects (
       id, user_id, title, prompt, kind, status, html, messages
     ) values ($1, $2, 'Gate project', 'Build a gated app', 'web', 'building', null, '[]')`,
    [projectId, userId],
  );
}

async function sealCandidate({ pg, queue, patch, projectId, userId, label }) {
  const jobId = `gate-job-${crypto.randomUUID()}`;
  const workerId = `gate-worker-${crypto.randomUUID()}`;
  const html = validHtml(label);
  const job = makeJob({ jobId, projectId, userId, html });
  const requestFingerprint = await patch.sha256Hex(`request:${jobId}`);

  await queue.enqueueBuildJob({
    job,
    idempotencyKey: `human-gate-test:${jobId}`,
    requestFingerprint,
    maxAttempts: 2,
  });
  await pg.query(
    "update projects set current_build_job_id = $2, updated_at = now() where id = $1",
    [projectId, jobId],
  );

  const claimed = await queue.claimBuildJob(jobId, workerId);
  assert.ok(claimed, "the candidate must be claimed before it can be sealed");
  claimed.status = "ready";
  claimed.html = html;
  claimed.usedAi = true;
  await queue.markBuildJobReady(claimed, workerId);

  return {
    jobId,
    html,
    artifactSha256: await patch.sha256Hex(html),
  };
}

function gateError(gate, code, status) {
  return (error) =>
    error instanceof gate.HumanGateError &&
    error.code === code &&
    error.status === status;
}

test("the Human Gate seals artifacts and enforces atomic audited decisions", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    plugins: [exposeHumanGateInternals()],
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  const gate = await vite.ssrLoadModule(HUMAN_GATE_MODULE);
  const queue = await vite.ssrLoadModule("/src/lib/server/jobs/queue.ts");
  const patch = await vite.ssrLoadModule("/src/lib/server/agents/patch.ts");
  const db = await vite.ssrLoadModule("/src/lib/db.ts");
  const pg = await db.getPglite();

  t.after(async () => {
    await vite.close();
    await pg.close();
  });

  await t.test("worker completion seals the exact artifact hash", async () => {
    const userId = `gate-user-${crypto.randomUUID()}`;
    const projectId = `gate-project-${crypto.randomUUID()}`;
    await createProject(pg, { projectId, userId });
    const candidate = await sealCandidate({
      pg,
      queue,
      patch,
      projectId,
      userId,
      label: "Sealed candidate",
    });

    const row = await pg.query(
      `select queue_status, stage, artifact_sha256
       from build_jobs where id = $1`,
      [candidate.jobId],
    );
    assert.deepEqual(row.rows, [
      {
        queue_status: "awaiting_human_approval",
        stage: "human_gate",
        artifact_sha256: candidate.artifactSha256,
      },
    ]);
    assert.match(candidate.artifactSha256, /^[0-9a-f]{64}$/);
    assert.equal(candidate.artifactSha256, await patch.sha256Hex(candidate.html));
    const browserEvidence = await pg.query(
      `select report_kind, status, evidence_kind
       from build_job_browser_reports
       where job_id = $1
       order by report_kind`,
      [candidate.jobId],
    );
    assert.deepEqual(browserEvidence.rows, [
      {
        report_kind: "echo_accessibility",
        status: "not_run",
        evidence_kind: "not_run",
      },
      {
        report_kind: "swift_performance",
        status: "not_run",
        evidence_kind: "not_run",
      },
      {
        report_kind: "twin_browser",
        status: "not_run",
        evidence_kind: "not_run",
      },
    ]);
  });

  await t.test("workspace file tampering is rejected even when preview HTML is unchanged", async () => {
    const userId = `gate-user-${crypto.randomUUID()}`;
    const projectId = `gate-project-${crypto.randomUUID()}`;
    await createProject(pg, { projectId, userId });
    const candidate = await sealCandidate({
      pg,
      queue,
      patch,
      projectId,
      userId,
      label: "Workspace tamper",
    });
    const persisted = await pg.query(
      "select payload from build_jobs where id = $1",
      [candidate.jobId],
    );
    const payload = JSON.parse(persisted.rows[0].payload);
    payload.files["README.md"] += "tampered after seal\n";
    await pg.query("update build_jobs set payload = $2 where id = $1", [
      candidate.jobId,
      JSON.stringify(payload),
    ]);

    await assert.rejects(
      gate.__testDecideOwnedJob({
        jobId: candidate.jobId,
        userId,
        decision: "approve",
        requestId: crypto.randomUUID(),
        reason: null,
      }),
      gateError(gate, "HUMAN_GATE_ARTIFACT_NOT_SEALED", 409),
    );
  });

  await t.test("a sealed v2 candidate cannot cross the v3 Human Gate", async () => {
    const userId = `gate-user-${crypto.randomUUID()}`;
    const projectId = `gate-project-${crypto.randomUUID()}`;
    await createProject(pg, { projectId, userId });
    const candidate = await sealCandidate({
      pg,
      queue,
      patch,
      projectId,
      userId,
      label: "Fenced pipeline candidate",
    });
    const persisted = await pg.query(
      "select payload from build_jobs where id = $1",
      [candidate.jobId],
    );
    const payload = JSON.parse(persisted.rows[0].payload);
    payload.checkpoint.pipelineVersion = "helix-v2";
    await pg.query(
      `update build_jobs
       set pipeline_version = 'helix-v2', payload = $2
       where id = $1`,
      [candidate.jobId, JSON.stringify(payload)],
    );

    await assert.rejects(
      gate.__testDecideOwnedJob({
        jobId: candidate.jobId,
        userId,
        decision: "approve",
        requestId: crypto.randomUUID(),
        reason: null,
      }),
      gateError(gate, "HUMAN_GATE_ARTIFACT_NOT_SEALED", 409),
    );
    const state = await pg.query(
      `select queue_status,
              (select count(*)::int from build_job_gate_events where job_id = $1) as events
       from build_jobs where id = $1`,
      [candidate.jobId],
    );
    assert.deepEqual(state.rows, [
      { queue_status: "awaiting_human_approval", events: 0 },
    ]);
  });

  await t.test("approval is blocked without measured Aegis evidence for the exact hash", async () => {
    const userId = `gate-user-${crypto.randomUUID()}`;
    const projectId = `gate-project-${crypto.randomUUID()}`;
    await createProject(pg, { projectId, userId });
    const candidate = await sealCandidate({
      pg,
      queue,
      patch,
      projectId,
      userId,
      label: "Security evidence removed",
    });
    await assert.rejects(
      pg.query(
        "update build_job_quality_reports set passed = false where job_id = $1",
        [candidate.jobId],
      ),
      /QUALITY_EVIDENCE_IMMUTABLE/,
    );
    await assert.rejects(
      pg.query(
        "delete from build_job_quality_reports where job_id = $1",
        [candidate.jobId],
      ),
      /QUALITY_EVIDENCE_IMMUTABLE/,
    );
    await pg.exec("begin");
    await pg.exec("set local helix.quality_evidence_retention = 'on'");
    await pg.query("delete from build_job_quality_reports where job_id = $1", [
      candidate.jobId,
    ]);
    await pg.exec("commit");

    await assert.rejects(
      gate.__testDecideOwnedJob({
        jobId: candidate.jobId,
        userId,
        decision: "approve",
        requestId: crypto.randomUUID(),
        reason: "This must remain blocked",
      }),
      gateError(gate, "HUMAN_GATE_SECURITY_NOT_PASSED", 409),
    );
  });

  await t.test("approve transitions awaiting to approved and appends one audit event", async () => {
    const userId = `gate-user-${crypto.randomUUID()}`;
    const projectId = `gate-project-${crypto.randomUUID()}`;
    const requestId = crypto.randomUUID();
    await createProject(pg, { projectId, userId });
    const candidate = await sealCandidate({
      pg,
      queue,
      patch,
      projectId,
      userId,
      label: "Approved candidate",
    });

    const event = await gate.__testDecideOwnedJob({
      jobId: candidate.jobId,
      userId,
      decision: "approve",
      requestId,
      reason: "Release approved by the owner",
    });
    assert.equal(event.decision, "approve");
    assert.equal(event.fromStatus, "awaiting_human_approval");
    assert.equal(event.toStatus, "approved");
    assert.equal(event.artifactSha256, candidate.artifactSha256);

    const state = await pg.query(
      "select queue_status, stage from build_jobs where id = $1",
      [candidate.jobId],
    );
    assert.deepEqual(state.rows, [{ queue_status: "approved", stage: "approved" }]);
    const audit = await pg.query(
      `select actor_type, actor_user_id, decision, from_status, to_status,
              request_id, artifact_sha256
       from build_job_gate_events where job_id = $1`,
      [candidate.jobId],
    );
    assert.deepEqual(audit.rows, [
      {
        actor_type: "user",
        actor_user_id: userId,
        decision: "approve",
        from_status: "awaiting_human_approval",
        to_status: "approved",
        request_id: requestId,
        artifact_sha256: candidate.artifactSha256,
      },
    ]);

    const replay = await gate.__testDecideOwnedJob({
      jobId: candidate.jobId,
      userId,
      decision: "approve",
      requestId,
      reason: "A replay cannot replace the original audit reason",
    });
    assert.deepEqual(replay, event);
    const count = await pg.query(
      "select count(*)::int as count from build_job_gate_events where job_id = $1",
      [candidate.jobId],
    );
    assert.equal(count.rows[0].count, 1);

    await assert.rejects(
      gate.__testDecideOwnedJob({
        jobId: candidate.jobId,
        userId,
        decision: "reject",
        requestId,
        reason: null,
      }),
      gateError(gate, "HUMAN_GATE_REQUEST_REUSED", 409),
    );
  });

  await t.test("concurrent approve and reject allow exactly one winner", async () => {
    const userId = `gate-user-${crypto.randomUUID()}`;
    const projectId = `gate-project-${crypto.randomUUID()}`;
    await createProject(pg, { projectId, userId });
    const candidate = await sealCandidate({
      pg,
      queue,
      patch,
      projectId,
      userId,
      label: "Concurrent candidate",
    });

    const decisions = await Promise.allSettled([
      gate.__testDecideOwnedJob({
        jobId: candidate.jobId,
        userId,
        decision: "approve",
        requestId: crypto.randomUUID(),
        reason: null,
      }),
      gate.__testDecideOwnedJob({
        jobId: candidate.jobId,
        userId,
        decision: "reject",
        requestId: crypto.randomUUID(),
        reason: "Hold release",
      }),
    ]);
    const winners = decisions.filter((result) => result.status === "fulfilled");
    const losers = decisions.filter((result) => result.status === "rejected");
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.ok(gateError(gate, "HUMAN_GATE_CLOSED", 409)(losers[0].reason));

    const winner = winners[0].value;
    const state = await pg.query(
      "select queue_status from build_jobs where id = $1",
      [candidate.jobId],
    );
    assert.equal(state.rows[0].queue_status, winner.toStatus);
    const audit = await pg.query(
      "select decision from build_job_gate_events where job_id = $1",
      [candidate.jobId],
    );
    assert.deepEqual(audit.rows, [{ decision: winner.decision }]);
  });

  await t.test("wrong ownership returns 403 without mutating state or audit", async () => {
    const userId = `gate-user-${crypto.randomUUID()}`;
    const projectId = `gate-project-${crypto.randomUUID()}`;
    await createProject(pg, { projectId, userId });
    const candidate = await sealCandidate({
      pg,
      queue,
      patch,
      projectId,
      userId,
      label: "Owned candidate",
    });

    await assert.rejects(
      gate.__testDecideOwnedJob({
        jobId: candidate.jobId,
        userId: `intruder-${crypto.randomUUID()}`,
        decision: "approve",
        requestId: crypto.randomUUID(),
        reason: null,
      }),
      gateError(gate, "HUMAN_GATE_FORBIDDEN", 403),
    );
    const state = await pg.query(
      `select queue_status,
              (select count(*)::int from build_job_gate_events where job_id = $1) as events
       from build_jobs where id = $1`,
      [candidate.jobId],
    );
    assert.deepEqual(state.rows, [
      { queue_status: "awaiting_human_approval", events: 0 },
    ]);
  });

  await t.test("a stale sealed payload is rejected without an audit event", async () => {
    const userId = `gate-user-${crypto.randomUUID()}`;
    const projectId = `gate-project-${crypto.randomUUID()}`;
    await createProject(pg, { projectId, userId });
    const candidate = await sealCandidate({
      pg,
      queue,
      patch,
      projectId,
      userId,
      label: "Original candidate",
    });
    const persisted = await pg.query("select payload from build_jobs where id = $1", [
      candidate.jobId,
    ]);
    const payload = JSON.parse(persisted.rows[0].payload);
    payload.html = validHtml("Tampered candidate");
    await pg.query("update build_jobs set payload = $2 where id = $1", [
      candidate.jobId,
      JSON.stringify(payload),
    ]);

    await assert.rejects(
      gate.__testDecideOwnedJob({
        jobId: candidate.jobId,
        userId,
        decision: "approve",
        requestId: crypto.randomUUID(),
        reason: null,
      }),
      gateError(gate, "HUMAN_GATE_ARTIFACT_NOT_SEALED", 409),
    );
    const state = await pg.query(
      `select queue_status,
              (select count(*)::int from build_job_gate_events where job_id = $1) as events
       from build_jobs where id = $1`,
      [candidate.jobId],
    );
    assert.deepEqual(state.rows, [
      { queue_status: "awaiting_human_approval", events: 0 },
    ]);
  });

  await t.test("an older candidate cannot be approved after a newer build exists", async () => {
    const userId = `gate-user-${crypto.randomUUID()}`;
    const projectId = `gate-project-${crypto.randomUUID()}`;
    await createProject(pg, { projectId, userId });
    const oldCandidate = await sealCandidate({
      pg,
      queue,
      patch,
      projectId,
      userId,
      label: "Old candidate",
    });
    const currentCandidate = await sealCandidate({
      pg,
      queue,
      patch,
      projectId,
      userId,
      label: "Current candidate",
    });

    await assert.rejects(
      gate.__testDecideOwnedJob({
        jobId: oldCandidate.jobId,
        userId,
        decision: "approve",
        requestId: crypto.randomUUID(),
        reason: null,
      }),
      gateError(gate, "HUMAN_GATE_CLOSED", 409),
    );
    const state = await pg.query(
      `select job.id, job.queue_status, project.current_build_job_id,
              (select count(*)::int from build_job_gate_events where job_id = job.id) as events
       from build_jobs as job
       join projects as project on project.id = job.project_id
       where job.id = $1`,
      [oldCandidate.jobId],
    );
    assert.deepEqual(state.rows, [
      {
        id: oldCandidate.jobId,
        queue_status: "awaiting_human_approval",
        current_build_job_id: currentCandidate.jobId,
        events: 0,
      },
    ]);
  });
});
