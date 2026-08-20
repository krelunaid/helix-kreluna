import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HUMAN_GATE_MODULE = "/src/lib/server/review/human-gate.ts";

const [deploySource, gateSource, gateMigration] = await Promise.all([
  readFile(new URL("../src/lib/server/deploy.ts", import.meta.url), "utf8"),
  readFile(
    new URL("../src/lib/server/review/human-gate.ts", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../migrations/0009_human_gate_release.sql", import.meta.url),
    "utf8",
  ),
]);

function exposeGuestDecision() {
  return {
    name: "guest-human-gate-test-internals",
    enforce: "pre",
    transform(source, id) {
      const filename = id.split("?", 1)[0].replaceAll("\\", "/");
      if (!filename.endsWith(HUMAN_GATE_MODULE)) return null;
      return {
        code: `${source}\nexport { decideGuestJob as __testDecideGuestJob };\n`,
        map: null,
      };
    },
  };
}

function validHtml(label) {
  const copy = `${label} is a sealed guest release candidate. `.repeat(14);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${label}</title></head><body><main><h1>${label}</h1><p>${copy}</p></main></body></html>`;
}

function makeGuestJob({ jobId, credential, html }) {
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
    guestAccessTokenHash: credential.tokenHash,
    guestAccessExpiresAt: credential.expiresAt,
    createdAt: Date.now(),
  };
}

async function sealGuestCandidate({
  pg,
  queue,
  patch,
  access,
  label,
  credential,
}) {
  const jobId = `guest-gate-${crypto.randomUUID()}`;
  const workerId = `guest-worker-${crypto.randomUUID()}`;
  const html = validHtml(label);
  const guestCredential = credential ?? (await access.createGuestBuildCredential());
  const requestFingerprint = await patch.sha256Hex(`request:${jobId}`);
  const job = makeGuestJob({ jobId, credential: guestCredential, html });

  await queue.enqueueBuildJob({
    job,
    idempotencyKey: `guest-gate-test:${jobId}`,
    requestFingerprint,
    maxAttempts: 2,
  });
  const claimed = await queue.claimBuildJob(jobId, workerId);
  assert.ok(claimed, "the guest candidate must be claimed before it is sealed");
  claimed.status = "ready";
  claimed.html = html;
  await queue.markBuildJobReady(claimed, workerId);

  const persisted = await pg.query(
    `select queue_status, artifact_sha256
     from build_jobs where id = $1`,
    [jobId],
  );
  assert.equal(persisted.rows[0].queue_status, "awaiting_human_approval");

  return {
    job,
    jobId,
    html,
    credential: guestCredential,
    requestFingerprint,
    artifactSha256: persisted.rows[0].artifact_sha256,
  };
}

function gateError(gate, code, status) {
  return (error) =>
    error instanceof gate.HumanGateError &&
    error.code === code &&
    error.status === status;
}

test("publishGuest accepts only a gated job capability, never client HTML", () => {
  const start = deploySource.indexOf("export const publishGuest");
  const end = deploySource.indexOf("export const shipStore", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const publishGuest = deploySource.slice(start, end);
  const validator = publishGuest.slice(
    publishGuest.indexOf(".validator"),
    publishGuest.indexOf(".handler"),
  );

  assert.match(validator, /jobId:\s*string/);
  assert.match(validator, /guestAccessToken:\s*string/);
  assert.match(validator, /requestId:\s*string/);
  assert.doesNotMatch(validator, /\bhtml\??:\s*string/);
  assert.doesNotMatch(validator, /\btitle\??:\s*string/);
  assert.match(publishGuest, /const artifact = await getApprovedGuestBuild\(data\)/);
  assert.match(publishGuest, /\$\{artifact\.title\}/);
  assert.match(publishGuest, /withPwa\(artifact\.html, artifact\.title, slug\)/);
  assert.doesNotMatch(publishGuest, /data\.(?:html|title)\b/);

  const gateCheck = publishGuest.indexOf("getApprovedGuestBuild(data)");
  const publishWrite = publishGuest.indexOf("insert into public_apps");
  assert.ok(gateCheck >= 0 && gateCheck < publishWrite);
  assert.match(
    publishGuest,
    /job\.queue_status in \('approved', 'deployed'\)[\s\S]*?event\.decision = 'approve'[\s\S]*?event\.artifact_sha256 = job\.artifact_sha256/,
  );
});

test("guest decisions persist a hash-only audit contract", () => {
  const start = gateSource.indexOf("async function decideGuestJob");
  const end = gateSource.indexOf("export async function getApprovedOwnedBuild", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const decision = gateSource.slice(start, end);

  assert.match(
    decision,
    /const tokenHash = await hashGuestBuildToken\(input\.guestAccessToken\)/,
  );
  assert.match(decision, /guest_access_token_hash = \$2/);
  assert.match(decision, /guest_access_expires_at > now\(\)/);
  assert.match(decision, /actor_guest_hash, decision/);
  assert.match(decision, /select id, null, 'guest', \$2, \$6/);
  assert.doesNotMatch(gateMigration, /actor_guest_(?:access_)?token\b/i);
  assert.match(
    gateMigration,
    /actor_guest_hash ~ '\^\[0-9a-f\]\{64\}\$'/,
  );
});

test("guest Human Gate capabilities and transitions are enforced in Postgres", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    plugins: [exposeGuestDecision()],
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  const gate = await vite.ssrLoadModule(HUMAN_GATE_MODULE);
  const queue = await vite.ssrLoadModule("/src/lib/server/jobs/queue.ts");
  const patch = await vite.ssrLoadModule("/src/lib/server/agents/patch.ts");
  const access = await vite.ssrLoadModule(
    "/src/lib/server/build-job-access.ts",
  );
  const db = await vite.ssrLoadModule("/src/lib/db.ts");
  const pg = await db.getPglite();

  t.after(async () => {
    await vite.close();
    await pg.close();
  });

  await t.test(
    "a derived modification capability is distinct and idempotent",
    async () => {
      const now = 1_900_000_000_000;
      const source = await access.createGuestBuildCredential(now);
      const requestId = crypto.randomUUID();
      const first = await access.deriveGuestBuildCredential(
        source.token,
        requestId,
        now,
      );
      const replay = await access.deriveGuestBuildCredential(
        source.token.toUpperCase(),
        requestId.toUpperCase(),
        now,
      );
      const other = await access.deriveGuestBuildCredential(
        source.token,
        crypto.randomUUID(),
        now,
      );

      assert.deepEqual(replay, first);
      assert.notEqual(first.token, source.token);
      assert.notEqual(first.tokenHash, source.tokenHash);
      assert.notEqual(other.token, first.token);
      assert.equal(
        first.tokenHash,
        await access.hashGuestBuildToken(first.token),
      );
      assert.equal(first.expiresAt, now + access.GUEST_BUILD_ACCESS_TTL_MS);
    },
  );

  await t.test(
    "guest approve verifies token hash and expiry and is idempotent",
    async () => {
      const candidate = await sealGuestCandidate({
        pg,
        queue,
        patch,
        access,
        label: "Guest approval",
      });
      const wrongCredential = await access.createGuestBuildCredential();
      const requestId = crypto.randomUUID();

      await assert.rejects(
        gate.__testDecideGuestJob({
          jobId: candidate.jobId,
          guestAccessToken: wrongCredential.token,
          decision: "approve",
          requestId,
          reason: null,
        }),
        gateError(gate, "HUMAN_GATE_FORBIDDEN", 403),
      );

      const expiredCredential = await access.createGuestBuildCredential(
        Date.now() - access.GUEST_BUILD_ACCESS_TTL_MS - 5_000,
      );
      const expired = await sealGuestCandidate({
        pg,
        queue,
        patch,
        access,
        label: "Expired guest approval",
        credential: expiredCredential,
      });
      await assert.rejects(
        gate.__testDecideGuestJob({
          jobId: expired.jobId,
          guestAccessToken: expiredCredential.token,
          decision: "approve",
          requestId: crypto.randomUUID(),
          reason: null,
        }),
        gateError(gate, "HUMAN_GATE_FORBIDDEN", 403),
      );

      const input = {
        jobId: candidate.jobId,
        guestAccessToken: candidate.credential.token,
        decision: "approve",
        requestId,
        reason: "Guest approved the sealed preview",
      };
      const event = await gate.__testDecideGuestJob(input);
      const replay = await gate.__testDecideGuestJob({
        ...input,
        reason: "A replay cannot replace the original audit reason",
      });
      assert.deepEqual(replay, event);
      assert.equal(event.decision, "approve");
      assert.equal(event.toStatus, "approved");
      assert.equal(event.artifactSha256, candidate.artifactSha256);

      await assert.rejects(
        gate.__testDecideGuestJob({ ...input, decision: "reject" }),
        gateError(gate, "HUMAN_GATE_REQUEST_REUSED", 409),
      );

      const audit = await pg.query(
        `select actor_type, actor_user_id, actor_guest_hash, decision,
                request_id, reason, artifact_sha256
         from build_job_gate_events where job_id = $1`,
        [candidate.jobId],
      );
      assert.equal(audit.rows.length, 1);
      assert.equal(audit.rows[0].actor_type, "guest");
      assert.equal(audit.rows[0].actor_user_id, null);
      assert.equal(
        audit.rows[0].actor_guest_hash,
        candidate.credential.tokenHash,
      );
      assert.notEqual(
        audit.rows[0].actor_guest_hash,
        candidate.credential.token,
      );
      assert.equal(
        JSON.stringify(audit.rows[0]).includes(candidate.credential.token),
        false,
      );
    },
  );

  await t.test(
    "publish authorization requires an approved, sealed guest artifact",
    async () => {
      const pending = await sealGuestCandidate({
        pg,
        queue,
        patch,
        access,
        label: "Pending guest publish",
      });
      await assert.rejects(
        gate.getApprovedGuestBuild({
          jobId: pending.jobId,
          guestAccessToken: pending.credential.token,
        }),
        gateError(gate, "HUMAN_GATE_CLOSED", 409),
      );

      await pg.query(
        "update build_jobs set queue_status = 'approved' where id = $1",
        [pending.jobId],
      );
      await assert.rejects(
        gate.getApprovedGuestBuild({
          jobId: pending.jobId,
          guestAccessToken: pending.credential.token,
        }),
        gateError(gate, "HUMAN_GATE_CLOSED", 409),
      );

      await pg.query(
        "update build_jobs set queue_status = 'awaiting_human_approval' where id = $1",
        [pending.jobId],
      );
      await gate.__testDecideGuestJob({
        jobId: pending.jobId,
        guestAccessToken: pending.credential.token,
        decision: "approve",
        requestId: crypto.randomUUID(),
        reason: null,
      });
      const artifact = await gate.getApprovedGuestBuild({
        jobId: pending.jobId,
        guestAccessToken: pending.credential.token,
      });
      assert.equal(artifact.jobId, pending.jobId);
      assert.equal(artifact.projectId, null);
      assert.equal(artifact.title, pending.job.title);
      assert.equal(artifact.html, pending.html);
      assert.equal(artifact.artifactSha256, pending.artifactSha256);
      assert.equal(artifact.buildLevel, "prototype");
      assert.equal(artifact.files["index.html"], pending.html);
      assert.equal(artifact.workspace.buildLevel, "prototype");
      assert.match(artifact.workspace.artifactSha256, /^[0-9a-f]{64}$/);

      const wrongCredential = await access.createGuestBuildCredential();
      await assert.rejects(
        gate.getApprovedGuestBuild({
          jobId: pending.jobId,
          guestAccessToken: wrongCredential.token,
        }),
        gateError(gate, "HUMAN_GATE_FORBIDDEN", 403),
      );
    },
  );

  await t.test(
    "modify links one child and rejects the superseded guest job",
    async () => {
      const source = await sealGuestCandidate({
        pg,
        queue,
        patch,
        access,
        label: "Guest modification source",
      });
      const requestId = crypto.randomUUID();
      const now = Date.now();
      const childCredential = await access.deriveGuestBuildCredential(
        source.credential.token,
        requestId,
        now,
      );
      const childJobId = `guest-child-${crypto.randomUUID()}`;
      const childJob = makeGuestJob({
        jobId: childJobId,
        credential: childCredential,
        html: source.html,
      });
      const childRequestFingerprint = await patch.sha256Hex(
        `modify:${source.jobId}:${requestId}`,
      );
      const input = {
        sourceJobId: source.jobId,
        sourceGuestAccessToken: source.credential.token,
        requestId,
        reason: "Apply the requested guest changes",
        childJob,
        childRequestFingerprint,
      };

      const created = await gate.enqueueGuestGateModification(input);
      assert.deepEqual(created, {
        jobId: childJobId,
        wasCreated: true,
        expiresAt: childCredential.expiresAt,
      });
      const replay = await gate.enqueueGuestGateModification(input);
      assert.deepEqual(replay, {
        jobId: childJobId,
        wasCreated: false,
        expiresAt: childCredential.expiresAt,
      });
      await assert.rejects(
        gate.enqueueGuestGateModification({
          ...input,
          childRequestFingerprint: "f".repeat(64),
        }),
        gateError(gate, "HUMAN_GATE_REQUEST_REUSED", 409),
      );

      const sourceState = await pg.query(
        "select queue_status, stage from build_jobs where id = $1",
        [source.jobId],
      );
      assert.deepEqual(sourceState.rows, [
        { queue_status: "rejected", stage: "modified" },
      ]);
      const childState = await pg.query(
        `select parent_job_id, queue_status, guest_access_token_hash
         from build_jobs where id = $1`,
        [childJobId],
      );
      assert.deepEqual(childState.rows, [
        {
          parent_job_id: source.jobId,
          queue_status: "queued",
          guest_access_token_hash: childCredential.tokenHash,
        },
      ]);
      const audit = await pg.query(
        `select actor_guest_hash, decision, to_status, result_job_id
         from build_job_gate_events where job_id = $1`,
        [source.jobId],
      );
      assert.deepEqual(audit.rows, [
        {
          actor_guest_hash: source.credential.tokenHash,
          decision: "modify",
          to_status: "rejected",
          result_job_id: childJobId,
        },
      ]);
      assert.equal(
        JSON.stringify(audit.rows[0]).includes(source.credential.token),
        false,
      );
    },
  );
});
