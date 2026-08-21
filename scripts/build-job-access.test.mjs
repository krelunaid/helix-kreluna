import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  BuildJobForbiddenError,
  GUEST_BUILD_ACCESS_TTL_MS,
  assertGuestBuildAccess,
  assertOwnedBuildJob,
  createGuestBuildCredential,
  guestTokenAuthorizesJob,
  toPublicBuildJob,
} from "../src/lib/server/build-job-access.ts";

test("guest build credential is 256-bit, hashed at rest and expires", async () => {
  const now = 1_800_000_000_000;
  const credential = await createGuestBuildCredential(now);

  assert.match(credential.token, /^[a-f0-9]{64}$/);
  assert.match(credential.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(credential.token, credential.tokenHash);
  assert.equal(credential.expiresAt, now + GUEST_BUILD_ACCESS_TTL_MS);
});

test("guest token is limited to its job hash and rejected when wrong or expired", async () => {
  const now = 1_800_000_000_000;
  const first = await createGuestBuildCredential(now);
  const second = await createGuestBuildCredential(now);

  assert.equal(
    await guestTokenAuthorizesJob({
      presentedToken: first.token,
      storedTokenHash: first.tokenHash,
      expiresAt: first.expiresAt,
      now,
    }),
    true,
  );
  assert.equal(
    await guestTokenAuthorizesJob({
      presentedToken: second.token,
      storedTokenHash: first.tokenHash,
      expiresAt: first.expiresAt,
      now,
    }),
    false,
  );
  assert.equal(
    await guestTokenAuthorizesJob({
      presentedToken: first.token,
      storedTokenHash: first.tokenHash,
      expiresAt: first.expiresAt,
      now: first.expiresAt,
    }),
    false,
  );
	await assert.rejects(
		assertGuestBuildAccess({
			presentedToken: second.token,
			storedTokenHash: first.tokenHash,
			expiresAt: first.expiresAt,
			now,
		}),
		(error) => error instanceof BuildJobForbiddenError && error.status === 403,
	);
	await assert.rejects(
		assertGuestBuildAccess({
			presentedToken: first.token,
			storedTokenHash: first.tokenHash,
			expiresAt: first.expiresAt,
			now: first.expiresAt,
		}),
		(error) => error instanceof BuildJobForbiddenError && error.status === 403,
	);
});

test("private job and project ownership mismatch returns the 403 contract", () => {
  assert.doesNotThrow(() => assertOwnedBuildJob("user-a", "user-a", "user-a"));

  for (const ownership of [
    ["user-a", "user-b", "user-a"],
    ["user-a", "user-a", "user-b"],
    ["user-a", null, "user-a"],
  ]) {
    assert.throws(
      () => assertOwnedBuildJob(...ownership),
      (error) =>
        error instanceof BuildJobForbiddenError &&
        error.status === 403 &&
        error.message === "Forbidden",
    );
  }
});

test("public build job DTO strips ownership, guest access and tester credentials", () => {
  const dto = toPublicBuildJob({
    id: "job-a",
    prompt: "Build a safe app",
    locale: "en",
    mode: "generate",
    buildLevel: "prototype",
    currentHtml: "private input",
    status: "ready",
    steps: [],
    html: "<html></html>",
    usedAi: true,
    title: "Safe app",
    projectId: "project-a",
    userId: "user-a",
    guestAccessTokenHash: "a".repeat(64),
    guestAccessExpiresAt: Date.now() + 60_000,
    guestBudgetLease: {
      identityHash: "identity",
      action: "ai_generation",
      leaseId: "lease",
      windowStart: new Date().toISOString(),
    },
    requestFingerprint: "b".repeat(64),
    checkpoint: {
      pipelineVersion: "helix-v2",
      requestFingerprint: "b".repeat(64),
      stage: "finalized",
      artifacts: { html: "private artifact", usedAi: true },
    },
    files: {
      "index.html": "private source",
      ".env.example": "PRIVATE_TOKEN=\n",
    },
    createdAt: Date.now(),
    stores: {
      appStore: "not-submitted",
      play: "not-submitted",
      testersUrl: "/testers/safe",
      testersCode: "SECRET-CODE",
    },
  });

  for (const field of [
    "currentHtml",
    "projectId",
    "userId",
    "guestAccessTokenHash",
    "guestAccessExpiresAt",
    "guestBudgetLease",
    "requestFingerprint",
    "checkpoint",
    "files",
  ]) {
    assert.equal(Object.hasOwn(dto, field), false);
  }
  assert.deepEqual(dto.stores, {
    appStore: "not-submitted",
    play: "not-submitted",
    testersUrl: "/testers/safe",
  });
  assert.equal(Object.hasOwn(dto.stores, "testersCode"), false);
});

test("authenticated build endpoints retain the auth middleware 401 boundary", () => {
  const orchestrator = readFileSync(
    new URL("../src/lib/server/agents.ts", import.meta.url),
    "utf8",
  );
  const auth = readFileSync(
    new URL("../src/lib/auth/verify.server.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    orchestrator,
    /export const startBuild[\s\S]*?\.middleware\(\[authMiddleware\]\)[\s\S]*?export const startGuestBuild/,
  );
  assert.match(
    orchestrator,
    /export const getBuildJob[\s\S]*?\.middleware\(\[authMiddleware\]\)[\s\S]*?export const getGuestBuildJob/,
  );
	assert.match(
		orchestrator,
		/export const getGuestBuildJob = createServerFn\(\{ method: "POST" \}\)/,
	);
  assert.match(auth, /class UnauthorizedError[\s\S]*?readonly status = 401/);
  assert.match(auth, /if \(!user\) throw new UnauthorizedError\(\)/);
});

test("build job persistence stores only a guest token hash with an expiry", () => {
  const migration = readFileSync(
    new URL("../migrations/0006_build_jobs_access.sql", import.meta.url),
    "utf8",
  );
  const queue = readFileSync(
    new URL("../src/lib/server/jobs/queue.ts", import.meta.url),
    "utf8",
  );
  const create = readFileSync(
    new URL("../src/lib/server/jobs/create.ts", import.meta.url),
    "utf8",
  );

  assert.match(migration, /guest_access_token_hash text/i);
  assert.match(migration, /guest_access_expires_at timestamptz/i);
  assert.doesNotMatch(migration, /guest_access_token(?!_hash)/i);
  assert.match(queue, /guest_access_token_hash/);
  assert.match(create, /guestAccessTokenHash/);
  assert.doesNotMatch(`${queue}\n${create}`, /guest_access_token\s+text/i);
});

test("guest AI lease covers the queued job and releases only on completion", () => {
  const orchestrator = readFileSync(
    new URL("../src/lib/server/agents.ts", import.meta.url),
    "utf8",
  );
  const worker = readFileSync(
    new URL("../src/lib/server/jobs/worker.ts", import.meta.url),
    "utf8",
  );
  const budget = readFileSync(
    new URL("../src/lib/server/guest-abuse.server.ts", import.meta.url),
    "utf8",
  );

  assert.match(orchestrator, /const lease = await reserveGuestAiBudget\(\{ inputBytes \}\)/);
  assert.match(orchestrator, /guestBudgetLease: lease/);
  assert.match(
    worker,
    /if \(!outcome\.retry\)[\s\S]*?releaseGuestLease\(job\)/,
  );
  assert.match(worker, /await markBuildJobReady\(job, workerId\)[\s\S]*?releaseGuestLease\(job\)/);
  assert.match(budget, /maxBytesPerRequest: 128 \* 1024/);
  assert.match(budget, /maxBytesPerWindow: 512 \* 1024/);
});
