import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createServer } from "vite";

const ROOT = join(import.meta.dirname, "..");

test("manual hosted runtimes fail closed without NETLIFY=true", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const environment = await vite.ssrLoadModule("/src/lib/env.server.ts");

  assert.throws(
    () =>
      environment.validateServerEnvironment({
        NODE_ENV: "production",
        AWS_LAMBDA_FUNCTION_NAME: "netlify-manual-deploy-server",
      }),
    /BETTER_AUTH_SECRET.*DATABASE_URL.*GROK_AUTH_CLIENT_SECRET/u,
  );
  assert.throws(
    () => environment.validateServerEnvironment({ CONTEXT: "deploy-preview" }),
    /DATABASE_URL/u,
  );
  // A local Vite production build is not a runtime and must remain buildable.
  assert.doesNotThrow(() => environment.validateServerEnvironment({ NODE_ENV: "production" }));

  const hosted = environment.validateServerEnvironment({
    NODE_ENV: "production",
    AWS_LAMBDA_FUNCTION_NAME: "netlify-manual-deploy-server",
    DATABASE_URL: "postgresql://local:local@database.example.test/helix",
    VITE_PUBLIC_HOSTNAME: "helix.example.test",
    VITE_AUTH_ENABLED: "true",
    BETTER_AUTH_SECRET: "A".repeat(32),
    BETTER_AUTH_URL: "https://helix.example.test",
    GROK_AUTH_CLIENT_ID: "offline-client-id",
    GROK_AUTH_CLIENT_SECRET: "S".repeat(32),
    HELIX_AI_GATEWAY_ENABLED: "false",
    HELIX_QUEUE_DISPATCH_SECRET: "Q".repeat(32),
    GITHUB_TOKEN_ENCRYPTION_KEY: "1".repeat(64),
    GITHUB_TOKEN_KEY_VERSION: "v1",
  });
  assert.equal(hosted.isHostedRuntime, true);
  assert.equal(hosted.isNetlify, true);
  assert.equal(hosted.isProduction, true);
  assert.equal(hosted.aiGatewayEnabled, false);

  assert.doesNotThrow(() =>
    environment.validateServerEnvironment({
      ...hosted,
      HELIX_AI_GATEWAY_ENABLED: "true",
    }),
  );
  assert.throws(
    () =>
      environment.validateServerEnvironment({
        ...hosted,
        HELIX_AI_GATEWAY_ENABLED: "true",
        NETLIFY_AI_GATEWAY_KEY: ["partial", "runtime", "pair"].join("-"),
      }),
    /NETLIFY_AI_GATEWAY_BASE_URL/u,
  );
  const hostedWithAi = environment.validateServerEnvironment({
    ...hosted,
    HELIX_AI_GATEWAY_ENABLED: "true",
    NETLIFY_AI_GATEWAY_KEY: ["offline", "netlify", "gateway", "key"].join("-"),
    NETLIFY_AI_GATEWAY_BASE_URL: "https://gateway.example.test",
  });
  assert.equal(hostedWithAi.aiGatewayEnabled, true);

  const netlifyDatabaseHosted = environment.validateServerEnvironment({
    ...hosted,
    AWS_LAMBDA_FUNCTION_NAME: undefined,
    NETLIFY: "true",
    CONTEXT: "deploy-preview",
    DATABASE_URL: undefined,
    NETLIFY_DB_URL: "postgresql://branch:fixture@database.example.test/helix",
  });
  assert.equal(netlifyDatabaseHosted.databaseConfigured, true);
  assert.equal(netlifyDatabaseHosted.databaseSource, "netlify");
  assert.throws(
    () =>
      environment.validateServerEnvironment({
        ...netlifyDatabaseHosted,
        DATABASE_URL: "postgresql://production:fixture@database.example.test/helix",
      }),
    /DATABASE_URL.*NETLIFY_DB_URL/u,
  );
});

test("Harbor runner environment is optional as a complete HTTPS pair", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const environment = await vite.ssrLoadModule("/src/lib/env.server.ts");
  assert.throws(
    () =>
      environment.validateServerEnvironment({
        HELIX_HARBOR_RUNNER_URL: "https://harbor.example.test/",
      }),
    /HELIX_HARBOR_RUNNER_SECRET/u,
  );
  assert.throws(
    () =>
      environment.validateServerEnvironment({
        HELIX_HARBOR_RUNNER_URL: "http://harbor.example.test/",
        HELIX_HARBOR_RUNNER_SECRET: "H".repeat(32),
      }),
    /HELIX_HARBOR_RUNNER_URL/u,
  );
  assert.doesNotThrow(() =>
    environment.validateServerEnvironment({
      HELIX_HARBOR_RUNNER_URL: "https://harbor.example.test/",
      HELIX_HARBOR_RUNNER_SECRET: "H".repeat(32),
    }),
  );
  assert.throws(
    () =>
      environment.validateServerEnvironment({
        NODE_ENV: "production",
        AWS_LAMBDA_FUNCTION_NAME: "netlify-harbor-production",
        HELIX_HARBOR_RUNNER_URL: "https://harbor.example.test/",
        HELIX_HARBOR_RUNNER_SECRET: "H".repeat(32),
      }),
    (error) =>
      error instanceof Error &&
      error.message.includes("HELIX_HARBOR_SWEEPER_ENABLED") &&
      error.message.includes("HELIX_HARBOR_SWEEPER_DISPATCH_SECRET"),
  );
  assert.throws(
    () =>
      environment.validateServerEnvironment({
        HELIX_HARBOR_SWEEPER_ENABLED: "true",
      }),
    /HELIX_HARBOR_SWEEPER_DISPATCH_SECRET/u,
  );
  assert.throws(
    () =>
      environment.validateServerEnvironment({
        HELIX_HARBOR_SWEEPER_ENABLED: "true",
        HELIX_HARBOR_SWEEPER_DISPATCH_SECRET: "short",
      }),
    /HELIX_HARBOR_SWEEPER_DISPATCH_SECRET/u,
  );
  assert.doesNotThrow(() =>
    environment.validateServerEnvironment({
      HELIX_HARBOR_SWEEPER_ENABLED: "true",
      HELIX_HARBOR_SWEEPER_DISPATCH_SECRET: "D".repeat(32),
    }),
  );
});

test("Harbor reservation sweep is opt-in and dispatches only to an authenticated background", async () => {
  const scheduled = await readFile(
    join(ROOT, "netlify/functions/helix-harbor-production-sweep.mts"),
    "utf8",
  );
  const background = await readFile(
    join(ROOT, "netlify/functions/helix-harbor-production-background.mts"),
    "utf8",
  );
  assert.match(scheduled, /HELIX_HARBOR_SWEEPER_ENABLED/u);
  assert.match(scheduled, /schedule:\s*"\*\/5 \* \* \* \*"/u);
  assert.match(scheduled, /x-helix-harbor-sweeper-token/u);
  assert.match(background, /timingSafeEqual/u);
  assert.match(background, /background:\s*true/u);
  assert.match(background, /method:\s*"POST"/u);
  assert.ok(
    background.indexOf("tokenEqual(presented, expected)") <
      background.indexOf("runConfiguredHarborProductionSweep"),
    "authentication must happen before loading the recovery worker",
  );
});
