import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createServer } from "vite";

const ROOT = join(import.meta.dirname, "..");
const REVIEW_ID = "314";
const COMMIT_REF = "a".repeat(40);
const SITE_ID = "89a00a91-8730-40e6-ac92-be473f106a78";
const SITE_NAME = "helix-kreluna";
const PREVIEW_ORIGIN = `https://deploy-preview-${REVIEW_ID}--${SITE_NAME}.netlify.app`;
const PREVIEW_HOSTNAME = new URL(PREVIEW_ORIGIN).hostname;

function deployIdentity(overrides = {}) {
  return {
    NETLIFY: "true",
    CONTEXT: "deploy-preview",
    PULL_REQUEST: "true",
    REVIEW_ID,
    COMMIT_REF,
    DEPLOY_ID: "deploy-fixture",
    SITE_ID,
    SITE_NAME,
    DEPLOY_PRIME_URL: PREVIEW_ORIGIN,
    HELIX_PREVIEW_EXPECTED_REVIEW_ID: REVIEW_ID,
    HELIX_PREVIEW_EXPECTED_COMMIT_REF: COMMIT_REF,
    ...overrides,
  };
}

function hostedPreview(overrides = {}) {
  return {
    ...deployIdentity(),
    NODE_ENV: "production",
    NETLIFY_DB_URL: "postgresql://preview:fixture@database.example.test/helix",
    VITE_PUBLIC_HOSTNAME: PREVIEW_HOSTNAME,
    VITE_AUTH_ENABLED: "true",
    VITE_GROK_AUTH_ENABLED: "false",
    VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED: "true",
    BETTER_AUTH_SECRET: "A".repeat(32),
    BETTER_AUTH_URL: PREVIEW_ORIGIN,
    HELIX_AI_GATEWAY_ENABLED: "false",
    HELIX_QUEUE_DISPATCH_SECRET: "Q".repeat(32),
    GITHUB_TOKEN_ENCRYPTION_KEY: "1".repeat(64),
    GITHUB_TOKEN_KEY_VERSION: "preview-v1",
    ...overrides,
  };
}

function embeddedIdentity(overrides = {}) {
  return {
    VITE_HELIX_PREVIEW_BUILD_CONTEXT: "deploy-preview",
    VITE_HELIX_PREVIEW_BUILD_PULL_REQUEST: "true",
    VITE_HELIX_PREVIEW_BUILD_REVIEW_ID: REVIEW_ID,
    VITE_HELIX_PREVIEW_BUILD_COMMIT_REF: COMMIT_REF,
    VITE_HELIX_PREVIEW_BUILD_DEPLOY_ID: "deploy-fixture",
    VITE_HELIX_PREVIEW_BUILD_DEPLOY_PRIME_URL: PREVIEW_ORIGIN,
    ...overrides,
  };
}

function functionsPreview(overrides = {}) {
  const environment = hostedPreview();
  for (const name of [
    "NETLIFY",
    "CONTEXT",
    "PULL_REQUEST",
    "REVIEW_ID",
    "COMMIT_REF",
    "DEPLOY_ID",
    "DEPLOY_PRIME_URL",
  ]) {
    delete environment[name];
  }
  return { ...environment, ...overrides };
}

async function modules(t, embedded = {}) {
  const define = Object.fromEntries(
    Object.entries(embedded).map(([name, value]) => [
      `import.meta.env.${name}`,
      JSON.stringify(value),
    ]),
  );
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    define,
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const [previewDeploy, environment, previewOrigin] = await Promise.all([
    vite.ssrLoadModule("/src/lib/preview-deploy.ts"),
    vite.ssrLoadModule("/src/lib/env.server.ts"),
    vite.ssrLoadModule("/src/lib/auth/preview-origin.server.ts"),
  ]);
  return { vite, previewDeploy, environment, previewOrigin };
}

test("preview password boundary accepts only the pinned Netlify PR deploy", async (t) => {
  const { previewDeploy } = await modules(t);
  const verified = previewDeploy.verifyNetlifyPullRequestDeploy(deployIdentity());
  assert.deepEqual(verified, {
    reviewId: REVIEW_ID,
    commitRef: COMMIT_REF,
    deployId: "deploy-fixture",
    deployPrimeUrl: PREVIEW_ORIGIN,
  });

  const rejected = [
    { NETLIFY: "false" },
    { CONTEXT: "branch-deploy" },
    { CONTEXT: "production" },
    { HELIX_RUNTIME_ENV: "production" },
    { PULL_REQUEST: "false" },
    { REVIEW_ID: "0" },
    { REVIEW_ID: "314x" },
    { COMMIT_REF: "a".repeat(39) },
    { COMMIT_REF: "A".repeat(40) },
    { DEPLOY_ID: "" },
    { SITE_ID: "another-site" },
    { SITE_NAME: "another-site" },
    { DEPLOY_PRIME_URL: `${PREVIEW_ORIGIN}/` },
    { HELIX_PREVIEW_EXPECTED_REVIEW_ID: "315" },
    { HELIX_PREVIEW_EXPECTED_COMMIT_REF: "b".repeat(40) },
    { HELIX_PREVIEW_EXPECTED_REVIEW_ID: undefined },
    { HELIX_PREVIEW_EXPECTED_COMMIT_REF: undefined },
  ];
  for (const override of rejected) {
    assert.equal(previewDeploy.verifyNetlifyPullRequestDeploy(deployIdentity(override)), null);
  }
});

test("Functions cold start accepts only embedded non-secret evidence plus runtime site pins", async (t) => {
  const { previewDeploy, environment } = await modules(t, embeddedIdentity());
  const runtime = functionsPreview();
  assert.deepEqual(previewDeploy.verifyNetlifyPullRequestDeploy(runtime), {
    reviewId: REVIEW_ID,
    commitRef: COMMIT_REF,
    deployId: "deploy-fixture",
    deployPrimeUrl: PREVIEW_ORIGIN,
  });
  const validated = environment.validateServerEnvironment(runtime);
  assert.equal(validated.previewPasswordSignInEnabled, true);
  assert.equal(validated.isHostedRuntime, true);
  assert.equal(validated.isNetlify, true);
  assert.equal(validated.isProduction, false);

  for (const candidate of [
    functionsPreview({ SITE_ID: "wrong-site" }),
    functionsPreview({ SITE_NAME: "wrong-site" }),
    functionsPreview({ HELIX_PREVIEW_EXPECTED_REVIEW_ID: "315" }),
    functionsPreview({ HELIX_PREVIEW_EXPECTED_COMMIT_REF: "b".repeat(40) }),
    functionsPreview({ CONTEXT: "production" }),
  ]) {
    assert.equal(previewDeploy.verifyNetlifyPullRequestDeploy(candidate), null);
    assert.throws(
      () => environment.validateServerEnvironment(candidate),
      /VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED/u,
    );
  }

  const noEmbeddedEvidence = previewDeploy.verifyNetlifyPullRequestDeploy(runtime, {});
  assert.equal(noEmbeddedEvidence, null);
  const tamperedEmbeddedEvidence = previewDeploy.verifyNetlifyPullRequestDeploy(runtime, {
    context: "deploy-preview",
    pullRequest: "true",
    reviewId: REVIEW_ID,
    commitRef: "b".repeat(40),
    deployId: "deploy-fixture",
    deployPrimeUrl: PREVIEW_ORIGIN,
  });
  assert.equal(tamperedEmbeddedEvidence, null);
});

test("preview password auth remains bound to the actual Deploy Preview request origin", async (t) => {
  const { vite, environment, previewOrigin } = await modules(t, embeddedIdentity());
  const validated = environment.validateServerEnvironment(functionsPreview());
  const previewPolicy = {
    enabled: validated.previewPasswordSignInEnabled,
    deployPrimeUrl: validated.verifiedNetlifyPullRequestDeploy?.deployPrimeUrl ?? null,
  };
  assert.equal(previewPolicy.enabled, true);

  const exactRequest = new Request(`${PREVIEW_ORIGIN}/api/auth/get-session`, {
    headers: {
      host: PREVIEW_HOSTNAME,
      origin: PREVIEW_ORIGIN,
      "x-forwarded-host": PREVIEW_HOSTNAME,
      "x-forwarded-proto": "https",
    },
  });
  assert.doesNotThrow(() =>
    previewOrigin.assertPreviewPasswordRequestOrigin(exactRequest, previewPolicy),
  );

  // Server functions and bearer requests need no browser-only Origin or
  // Fetch-Metadata headers; request.url still binds them to the exact preview.
  assert.doesNotThrow(() =>
    previewOrigin.assertPreviewPasswordRequestOrigin(
      new Request(`${PREVIEW_ORIGIN}/api/server-fn`),
      previewPolicy,
    ),
  );

  const promotedRequest = new Request("https://helix.kreluna.it/api/auth/get-session", {
    headers: {
      origin: PREVIEW_ORIGIN,
      "x-forwarded-host": PREVIEW_HOSTNAME,
      "x-forwarded-proto": "https",
    },
  });
  assert.throws(
    () => previewOrigin.assertPreviewPasswordRequestOrigin(promotedRequest, previewPolicy),
    previewOrigin.PreviewPasswordRequestOriginError,
  );

  for (const headers of [
    { origin: "https://helix.kreluna.it" },
    { host: "helix.kreluna.it" },
    { "x-forwarded-host": "helix.kreluna.it" },
    { "x-forwarded-host": `${PREVIEW_HOSTNAME}, helix.kreluna.it` },
    { "x-forwarded-proto": "http" },
  ]) {
    assert.throws(
      () =>
        previewOrigin.assertPreviewPasswordRequestOrigin(
          new Request(`${PREVIEW_ORIGIN}/api/auth/get-session`, { headers }),
          previewPolicy,
        ),
      previewOrigin.PreviewPasswordRequestOriginError,
    );
  }

  let handlerCalls = 0;
  const rejected = await previewOrigin.handlePreviewPasswordAuthRequest(
    promotedRequest,
    async () => {
      handlerCalls += 1;
      return new Response(null, { status: 204 });
    },
    previewPolicy,
  );
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("cache-control"), "no-store");
  assert.equal(handlerCalls, 0, "Better Auth handler must not run on a promoted host");

  const accepted = await previewOrigin.handlePreviewPasswordAuthRequest(
    exactRequest,
    async () => {
      handlerCalls += 1;
      return new Response(null, { status: 204 });
    },
    previewPolicy,
  );
  assert.equal(accepted.status, 204);
  assert.equal(handlerCalls, 1);

  // The gate is inert for normal Grok/non-preview authentication.
  const oauthResponse = await previewOrigin.handlePreviewPasswordAuthRequest(
    new Request("https://helix.kreluna.it/api/auth/get-session"),
    async () => new Response(null, { status: 202 }),
    { enabled: false, deployPrimeUrl: null },
  );
  assert.equal(oauthResponse.status, 202);

  const verify = await vite.ssrLoadModule("/src/lib/auth/verify.server.ts");
  let sessionReads = 0;
  const readSession = async (headers) => {
    sessionReads += 1;
    assert.equal(headers.get("authorization"), "Bearer preview-session-token");
    return { user: { id: "preview-user", email: "tester@example.test" } };
  };

  assert.equal(
    await verify.getSessionUserFromRequest(promotedRequest, {
      bearerToken: "preview-session-token",
      readSession,
      previewPolicy,
    }),
    null,
  );
  assert.equal(sessionReads, 0, "promoted-host bearer token must not reach Better Auth");
  await assert.rejects(
    verify.requireUserIdFromRequest(promotedRequest, {
      bearerToken: "preview-session-token",
      readSession,
      previewPolicy,
    }),
    (error) => error instanceof verify.UnauthorizedError && error.status === 401,
  );
  assert.equal(sessionReads, 0);

  assert.deepEqual(
    await verify.getSessionUserFromRequest(new Request(`${PREVIEW_ORIGIN}/api/server-fn`), {
      bearerToken: "preview-session-token",
      readSession,
      previewPolicy,
    }),
    { id: "preview-user", email: "tester@example.test" },
  );
  assert.equal(sessionReads, 1);
  assert.equal(
    await verify.requireUserIdFromRequest(new Request(`${PREVIEW_ORIGIN}/api/server-fn`), {
      bearerToken: "preview-session-token",
      readSession,
      previewPolicy,
    }),
    "preview-user",
  );
  assert.equal(sessionReads, 2);
});

test("server enables password sign-in only for the exact preview and keeps OAuth explicit", async (t) => {
  const { environment } = await modules(t);
  const validated = environment.validateServerEnvironment(hostedPreview());
  assert.equal(validated.authEnabled, true);
  assert.equal(validated.grokAuthEnabled, false);
  assert.equal(validated.previewPasswordSignInEnabled, true);
  assert.equal(validated.verifiedNetlifyPullRequestDeploy.reviewId, REVIEW_ID);
  assert.equal(validated.verifiedNetlifyPullRequestDeploy.commitRef, COMMIT_REF);

  for (const override of [
    { PULL_REQUEST: "false" },
    { REVIEW_ID: "315" },
    { COMMIT_REF: "b".repeat(40) },
    { DEPLOY_PRIME_URL: `${PREVIEW_ORIGIN}/` },
    { SITE_ID: "another-site" },
    { SITE_NAME: "another-site" },
    { CONTEXT: "production" },
    { HELIX_RUNTIME_ENV: "production" },
  ]) {
    assert.throws(
      () => environment.validateServerEnvironment(hostedPreview(override)),
      /VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED/u,
    );
  }

  assert.throws(
    () =>
      environment.validateServerEnvironment(
        hostedPreview({ VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED: "false" }),
      ),
    /VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED/u,
  );
  assert.throws(
    () =>
      environment.validateServerEnvironment(
        hostedPreview({
          VITE_GROK_AUTH_ENABLED: "true",
          GROK_AUTH_CLIENT_ID: "preview-client",
          GROK_AUTH_CLIENT_SECRET: "S".repeat(32),
        }),
      ),
    /VITE_GROK_AUTH_ENABLED.*VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED/u,
  );
  assert.throws(
    () =>
      environment.validateServerEnvironment(
        hostedPreview({ VITE_PUBLIC_HOSTNAME: "wrong.example.test" }),
      ),
    /VITE_PUBLIC_HOSTNAME/u,
  );

  const productionOAuth = environment.validateServerEnvironment({
    NETLIFY: "true",
    CONTEXT: "production",
    DATABASE_URL: "postgresql://production:fixture@database.example.test/helix",
    VITE_PUBLIC_HOSTNAME: "helix.kreluna.it",
    VITE_AUTH_ENABLED: "true",
    VITE_GROK_AUTH_ENABLED: "true",
    VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED: "false",
    BETTER_AUTH_SECRET: "A".repeat(32),
    BETTER_AUTH_URL: "https://helix.kreluna.it",
    GROK_AUTH_CLIENT_ID: "production-client",
    GROK_AUTH_CLIENT_SECRET: "S".repeat(32),
    HELIX_AI_GATEWAY_ENABLED: "false",
    HELIX_QUEUE_DISPATCH_SECRET: "Q".repeat(32),
    GITHUB_TOKEN_ENCRYPTION_KEY: "1".repeat(64),
    GITHUB_TOKEN_KEY_VERSION: "v1",
  });
  assert.equal(productionOAuth.previewPasswordSignInEnabled, false);
  assert.equal(productionOAuth.grokAuthEnabled, true);

  assert.throws(
    () =>
      environment.validateServerEnvironment({
        ...productionOAuth,
        VITE_GROK_AUTH_ENABLED: "false",
        GROK_AUTH_CLIENT_ID: undefined,
        GROK_AUTH_CLIENT_SECRET: undefined,
      }),
    /VITE_GROK_AUTH_ENABLED.*VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED/u,
  );
});

test("Better Auth and login expose sign-in only with no HTTP sign-up", async () => {
  const [server, client, login, authRoute, verify] = await Promise.all([
    readFile(join(ROOT, "src/lib/auth/server.ts"), "utf8"),
    readFile(join(ROOT, "src/lib/auth/client.ts"), "utf8"),
    readFile(join(ROOT, "src/routes/login.tsx"), "utf8"),
    readFile(join(ROOT, "src/routes/api/auth/$.ts"), "utf8"),
    readFile(join(ROOT, "src/lib/auth/verify.server.ts"), "utf8"),
  ]);

  assert.match(server, /serverEnv\.previewPasswordSignInEnabled/u);
  assert.match(server, /disableSignUp:\s*true/u);
  assert.match(server, /minPasswordLength:\s*16/u);
  assert.doesNotMatch(server, /emailAndPasswordEnabled/u);
  assert.match(client, /VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED/u);
  assert.doesNotMatch(client, /email-password/u);
  assert.match(login, /authClient\.signIn\.email/u);
  assert.match(login, /minLength=\{16\}/u);
  assert.doesNotMatch(login, /authClient\.signUp\.email/u);
  assert.doesNotMatch(login, /login\.name/u);
  assert.doesNotMatch(login, /login\.signup/u);
  assert.match(authRoute, /handlePreviewPasswordAuthRequest\(request, auth\.handler\)/u);
  assert.match(verify, /getSessionUserFromRequest\(request, \{ bearerToken \}\)/u);
  assert.match(verify, /requireUserIdFromRequest\(request, \{ bearerToken \}\)/u);
});
