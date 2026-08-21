import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const background = readFileSync(
  new URL("../netlify/functions/helix-job-background.mts", import.meta.url),
  "utf8",
);
const sweep = readFileSync(
  new URL("../netlify/functions/helix-queue-sweep.mts", import.meta.url),
  "utf8",
);
const guestCleanup = readFileSync(
  new URL("../netlify/functions/helix-guest-publication-cleanup.mts", import.meta.url),
  "utf8",
);
const dispatcher = readFileSync(
  new URL("../src/lib/server/jobs/dispatch.server.ts", import.meta.url),
  "utf8",
);
const recovery = readFileSync(
  new URL("../src/lib/server/jobs/recovery.ts", import.meta.url),
  "utf8",
);

function assertLogsDoNotContainSecrets(source, label) {
  const logCalls = source.match(/console\.(?:log|info|warn|error)\([\s\S]*?\n\s*\);/g) ?? [];
  for (const call of logCalls) {
    assert.doesNotMatch(
      call,
      /HELIX_QUEUE_DISPATCH_SECRET|expectedSecret|presentedSecret|cookieHeader|\bcookie\b|\bsecret\b/i,
      `${label} must not write queue secrets or cookies to logs`,
    );
  }
}

test("Helix background function is POST-only and authenticates before loading the worker", () => {
  assert.match(background, /export default async function helixJobBackground/);
  assert.match(
    background,
    /export const config: Config = \{\s*background: true,\s*method: "POST",\s*\};/,
  );
  assert.match(background, /Netlify\.env\.get\("HELIX_QUEUE_DISPATCH_SECRET"\)/);
  assert.match(background, /request\.headers\.get\(HELIX_QUEUE_HEADER\)/);
  assert.match(background, /createHash\("sha256"\)/);
  assert.match(background, /timingSafeEqual\(presentedDigest, expectedDigest\)/);

  const handlerStart = background.indexOf("export default async function helixJobBackground");
  const gateCall = background.indexOf("!constantTimeTokenEqual(", handlerStart);
  const workerImport = background.indexOf('"../../src/lib/server/jobs/worker"', handlerStart);
  const previewOriginRead = background.indexOf(
    "request.headers.get(HELIX_PREVIEW_ORIGIN_HEADER)",
    handlerStart,
  );
  assert.ok(gateCall > handlerStart, "constant-time token gate is missing");
  assert.ok(workerImport > gateCall, "worker must be imported only after the token gate");
  assert.ok(
    previewOriginRead > gateCall,
    "the preview-origin marker must be consumed only after queue authentication",
  );
  assert.match(
    background.slice(gateCall, workerImport),
    /constantTimeTokenEqual[\s\S]*?\) \{[\s\S]*?return;/,
    "a rejected token must return before the worker import",
  );
  assert.doesNotMatch(
    background.slice(0, workerImport),
    /from\s+["'][^"']*\/worker["']/,
    "the worker must not be statically imported before authentication",
  );
});

test("Helix background function redispatches only the explicit retry outcome", () => {
  assert.match(background, /const result = await processBuildJob\(body\.jobId\)/);
  assert.match(background, /if \(result === "retry"\) \{\s*await dispatchBuildJobFromNetlify\(/);
  assert.match(background, /cookieHeader: request\.headers\.get\("cookie"\)/u);
  assert.match(
    background,
    /verifiedDeployPrimeUrl: request\.headers\.get\(HELIX_PREVIEW_ORIGIN_HEADER\)/u,
  );
});

test("same-origin preview credentials never follow redirects and production stays cookieless", () => {
  for (const [label, source] of [
    ["server dispatcher", dispatcher],
    ["recovery dispatcher", recovery],
  ]) {
    assert.match(source, /netlifyPreviewDispatchCredentials\(target, requestContext\)/u);
    assert.match(source, /headers\.set\("cookie", previewCredentials\.cookieHeader\)/u);
    assert.match(
      source,
      /headers\.set\(HELIX_PREVIEW_ORIGIN_HEADER, previewCredentials\.previewOrigin\)/u,
    );
    assert.match(source, /redirect: "manual"/u);
    assert.match(source, /response\.status !== 202/u);
    assert.doesNotMatch(source, /response\.ok/u);
    assertLogsDoNotContainSecrets(source, label);
  }
});

test("Helix queue sweep is scheduled and only lists then dispatches eligible jobs", () => {
  assert.match(sweep, /export default async function helixQueueSweep/);
  assert.match(sweep, /export const config: Config = \{\s*schedule: "\* \* \* \* \*",\s*\};/);
  assert.match(sweep, /const jobIds = await listDispatchableBuildJobIds\(\)/);
  assert.match(
    sweep,
    /Promise\.allSettled\([\s\S]*?jobIds\.map\(\(jobId\) => dispatchBuildJobFromNetlify\(/,
  );
  assert.doesNotMatch(
    sweep,
    /processBuildJob|claimBuildJob|markBuildJob|update\s+build_jobs|insert\s+into|delete\s+from/i,
    "the sweep must not execute, claim, or mutate jobs",
  );
});

test("Netlify job functions never include queue secrets in structured logs", () => {
  assertLogsDoNotContainSecrets(background, "background function");
  assertLogsDoNotContainSecrets(sweep, "queue sweep");
});

test("expired guest publications are cleaned by a bounded scheduled function", () => {
  assert.match(guestCleanup, /export default async function helixGuestPublicationCleanup/);
  assert.match(
    guestCleanup,
    /export const config: Config = \{\s*schedule: "\*\/15 \* \* \* \*",\s*\};/,
  );
  assert.match(guestCleanup, /const BATCH_SIZE = 250/);
  assert.match(guestCleanup, /const MAX_BATCHES_PER_RUN = 8/);
  assert.match(guestCleanup, /deleteExpiredGuestPublications\(BATCH_SIZE\)/);
  assert.match(guestCleanup, /batches < MAX_BATCHES_PER_RUN/);
  assert.doesNotMatch(guestCleanup, /guest_token_hash|accessToken|DATABASE_URL/);
});
