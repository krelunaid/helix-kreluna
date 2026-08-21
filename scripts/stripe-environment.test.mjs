import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { createServer as createViteServer } from "vite";

const ROOT = join(import.meta.dirname, "..");

test("Stripe configuration is complete, mode-bound and fail-closed", async (t) => {
  const vite = await createViteServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const env = await vite.ssrLoadModule("/src/lib/env.server.ts");

  assert.doesNotThrow(() => env.validateServerEnvironment({ STRIPE_BILLING_ENABLED: "false" }));
  assert.throws(
    () =>
      env.validateServerEnvironment({
        STRIPE_BILLING_ENABLED: "true",
        STRIPE_MODE: "test",
        STRIPE_SECRET_KEY: "sk_test_localonly",
      }),
    /STRIPE_WEBHOOK_SECRET/,
  );

  const valid = {
    STRIPE_BILLING_ENABLED: "true",
    STRIPE_MODE: "test",
    STRIPE_SECRET_KEY: "sk_test_localonly",
    STRIPE_WEBHOOK_SECRET: "whsec_localonly",
    STRIPE_PRICE_STANDARD: "price_standard",
    STRIPE_PRICE_PRO: "price_pro",
    STRIPE_PRICE_TEAM: "price_team",
    STRIPE_PRICE_EXTRA_50: "price_extra50",
    STRIPE_PORTAL_CONFIGURATION_ID: "bpc_cancellationonly",
    HELIX_BILLING_DISPATCH_SECRET: "D".repeat(32),
    VITE_PUBLIC_HOSTNAME: "localhost:8080",
  };
  assert.doesNotThrow(() => env.validateServerEnvironment(valid));
  assert.throws(
    () => env.validateServerEnvironment({ ...valid, STRIPE_SECRET_KEY: "sk_live_localonly" }),
    /STRIPE_MODE/,
  );
  assert.throws(
    () => env.validateServerEnvironment({ ...valid, VITE_PUBLIC_HOSTNAME: undefined }),
    /VITE_PUBLIC_HOSTNAME/,
  );
  assert.throws(
    () =>
      env.validateServerEnvironment({
        ...valid,
        STRIPE_PORTAL_CONFIGURATION_ID: undefined,
      }),
    /STRIPE_PORTAL_CONFIGURATION_ID/,
  );
  assert.throws(
    () =>
      env.validateServerEnvironment({
        ...valid,
        STRIPE_PORTAL_CONFIGURATION_ID: "default",
      }),
    /STRIPE_PORTAL_CONFIGURATION_ID/,
  );
  assert.throws(
    () =>
      env.validateServerEnvironment({
        STRIPE_BILLING_ENABLED: "false",
        STRIPE_WEBHOOK_SECRET: "whsec_partial",
      }),
    /STRIPE_BILLING_ENABLED/,
  );
});
