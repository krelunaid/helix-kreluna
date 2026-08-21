import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REVIEW_ID = "314";
const COMMIT_REF = "a".repeat(40);
const SITE_ID = "89a00a91-8730-40e6-ac92-be473f106a78";
const SITE_NAME = "helix-kreluna";
const PREVIEW_ORIGIN = `https://deploy-preview-${REVIEW_ID}--${SITE_NAME}.netlify.app`;

function functionsPreviewEnvironment(overrides = {}) {
  return {
    SITE_ID,
    SITE_NAME,
    HELIX_PREVIEW_EXPECTED_REVIEW_ID: REVIEW_ID,
    HELIX_PREVIEW_EXPECTED_COMMIT_REF: COMMIT_REF,
    ...overrides,
  };
}

test("build dispatch forwards preview protection only to the exact non-production origin", async (t) => {
  const embeddedEvidence = {
    "import.meta.env.VITE_HELIX_PREVIEW_BUILD_CONTEXT": "deploy-preview",
    "import.meta.env.VITE_HELIX_PREVIEW_BUILD_PULL_REQUEST": "true",
    "import.meta.env.VITE_HELIX_PREVIEW_BUILD_REVIEW_ID": REVIEW_ID,
    "import.meta.env.VITE_HELIX_PREVIEW_BUILD_COMMIT_REF": COMMIT_REF,
    "import.meta.env.VITE_HELIX_PREVIEW_BUILD_DEPLOY_ID": "deploy-fixture",
    "import.meta.env.VITE_HELIX_PREVIEW_BUILD_DEPLOY_PRIME_URL": PREVIEW_ORIGIN,
  };
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    define: Object.fromEntries(
      Object.entries(embeddedEvidence).map(([name, value]) => [name, JSON.stringify(value)]),
    ),
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  const [dispatcher, recovery] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/jobs/dispatch.server.ts"),
    vite.ssrLoadModule("/src/lib/server/jobs/recovery.ts"),
  ]);
  const previousFetch = globalThis.fetch;
  const calls = [];
  let responseStatus = 202;
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(null, { status: responseStatus });
  };
  t.after(async () => {
    globalThis.fetch = previousFetch;
    await vite.close();
  });

  const cookieHeader = ["site_protection_session=opaque", "app_session=opaque"].join("; ");
  const secret = "q".repeat(32);
  const previewRequest = new Request(`${PREVIEW_ORIGIN}/_server/generate`, {
    headers: { cookie: cookieHeader },
  });
  // Netlify Functions omit build-time markers on cold starts. Immutable build
  // evidence plus runtime site/operator pins must still verify the exact PR.
  const previewContext = dispatcher.netlifyPreviewRequestContext(
    previewRequest,
    functionsPreviewEnvironment(),
  );
  assert.equal(previewContext.verifiedDeployPrimeUrl, PREVIEW_ORIGIN);

  await dispatcher.dispatchBuildJobToOrigin(
    "job-preview-123",
    PREVIEW_ORIGIN,
    secret,
    previewContext,
  );
  assert.equal(calls.length, 1);
  assert.equal(String(calls[0].input), `${PREVIEW_ORIGIN}/.netlify/functions/helix-job-background`);
  assert.equal(calls[0].init.redirect, "manual");
  assert.equal(new Headers(calls[0].init.headers).get("cookie"), cookieHeader);
  assert.equal(new Headers(calls[0].init.headers).get("x-helix-queue-token"), secret);
  assert.equal(new Headers(calls[0].init.headers).get("x-helix-preview-origin"), PREVIEW_ORIGIN);

  const firstDispatchHeaders = new Headers(calls[0].init.headers);
  await recovery.dispatchBuildJobFromNetlify("job-retry-123", PREVIEW_ORIGIN, secret, {
    requestUrl: String(calls[0].input),
    cookieHeader: firstDispatchHeaders.get("cookie"),
    verifiedDeployPrimeUrl: firstDispatchHeaders.get("x-helix-preview-origin"),
  });
  assert.equal(calls.length, 2);
  assert.equal(new Headers(calls[1].init.headers).get("cookie"), cookieHeader);
  assert.equal(new Headers(calls[1].init.headers).get("x-helix-preview-origin"), PREVIEW_ORIGIN);

  const productionOrigin = "https://helix.kreluna.it";
  const productionContext = dispatcher.netlifyPreviewRequestContext(
    new Request(`${productionOrigin}/_server/generate`, { headers: { cookie: cookieHeader } }),
    functionsPreviewEnvironment({ CONTEXT: "production", NETLIFY: "true" }),
  );
  await dispatcher.dispatchBuildJobToOrigin(
    "job-production-123",
    productionOrigin,
    secret,
    productionContext,
  );
  assert.equal(calls.length, 3);
  assert.equal(new Headers(calls[2].init.headers).has("cookie"), false);
  assert.equal(new Headers(calls[2].init.headers).has("x-helix-preview-origin"), false);

  const unpinnedContext = dispatcher.netlifyPreviewRequestContext(
    previewRequest,
    functionsPreviewEnvironment({ HELIX_PREVIEW_EXPECTED_COMMIT_REF: "b".repeat(40) }),
  );
  await dispatcher.dispatchBuildJobToOrigin(
    "job-unpinned-preview-123",
    PREVIEW_ORIGIN,
    secret,
    unpinnedContext,
  );
  assert.equal(calls.length, 4);
  assert.equal(new Headers(calls[3].init.headers).has("cookie"), false);

  const branchOrigin = "https://feature--helix-kreluna.netlify.app";
  const branchContext = dispatcher.netlifyPreviewRequestContext(
    new Request(`${branchOrigin}/_server/generate`, { headers: { cookie: cookieHeader } }),
    functionsPreviewEnvironment({ CONTEXT: "branch-deploy", NETLIFY: "true" }),
  );
  await dispatcher.dispatchBuildJobToOrigin(
    "job-generic-branch-123",
    branchOrigin,
    secret,
    branchContext,
  );
  assert.equal(calls.length, 5);
  assert.equal(new Headers(calls[4].init.headers).has("cookie"), false);

  const countBeforeMismatch = calls.length;
  await assert.rejects(
    dispatcher.dispatchBuildJobToOrigin(
      "job-cross-origin-123",
      "https://untrusted.example",
      secret,
      previewContext,
    ),
    (error) =>
      error?.name === "NetlifyDispatchBoundaryError" &&
      error?.code === "NETLIFY_DISPATCH_ORIGIN_MISMATCH",
  );
  assert.equal(calls.length, countBeforeMismatch, "cross-origin dispatch must stop before fetch");

  for (const status of [200, 204, 302]) {
    responseStatus = status;
    await assert.rejects(
      dispatcher.dispatchBuildJobToOrigin(
        `job-unaccepted-${status}`,
        productionOrigin,
        secret,
        productionContext,
      ),
      (error) =>
        error instanceof dispatcher.BuildDispatchError &&
        error.upstreamStatus === status &&
        error.message === `BUILD_JOB_DISPATCH_FAILED_${status}`,
    );
    await assert.rejects(
      recovery.dispatchBuildJobFromNetlify(
        `job-recovery-unaccepted-${status}`,
        productionOrigin,
        secret,
      ),
      (error) =>
        error instanceof recovery.BuildRecoveryDispatchError &&
        error.upstreamStatus === status &&
        error.message === `BUILD_JOB_DISPATCH_FAILED_${status}`,
    );
  }
});
