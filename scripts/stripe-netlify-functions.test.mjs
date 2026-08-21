import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createServer as createViteServer } from "vite";

const ROOT = join(import.meta.dirname, "..");

const backgroundSource = await readFile(
  new URL("../netlify/functions/helix-stripe-background.mts", import.meta.url),
  "utf8",
);
const sweepSource = await readFile(
  new URL("../netlify/functions/helix-stripe-sweep.mts", import.meta.url),
  "utf8",
);

test("background processing authenticates before loading the event processor", () => {
  const authAt = backgroundSource.indexOf("constantTimeTokenEqual(presented, expected)");
  const processorAt = backgroundSource.indexOf('import("../../src/lib/server/billing/processor")');
  assert.ok(authAt >= 0 && processorAt > authAt);
  assert.match(backgroundSource, /HELIX_BILLING_HEADER/);
  assert.match(backgroundSource, /timingSafeEqual/);
  assert.match(backgroundSource, /logRejected\("authorization"\)/);
  assert.match(backgroundSource, /processStripeEvent/);
});

test("scheduled sweep is bounded and uses durable queue state", () => {
  assert.match(sweepSource, /schedule:\s*"\* \* \* \* \*"/);
  assert.match(sweepSource, /listDispatchableStripeEvents\(100\)/);
  assert.match(backgroundSource, /typeof body\.livemode !== "boolean"/);
  assert.match(backgroundSource, /processStripeEvent\(reference\.eventId, reference\.livemode\)/);
  assert.match(sweepSource, /Promise\.allSettled/);
  assert.doesNotMatch(backgroundSource + sweepSource, /STRIPE_SECRET_KEY/);
  assert.doesNotMatch(backgroundSource + sweepSource, /STRIPE_WEBHOOK_SECRET/);
});

test("disabled Stripe sweep is a no-op without a dispatch secret or billing imports", async (t) => {
  const priorNetlify = globalThis.Netlify;
  const priorInfo = console.info;
  const environmentReads = [];
  const logs = [];
  globalThis.Netlify = {
    env: {
      get(name) {
        environmentReads.push(name);
        return undefined;
      },
    },
  };
  console.info = (...values) => logs.push(values.join(" "));
  t.after(() => {
    if (priorNetlify === undefined) delete globalThis.Netlify;
    else globalThis.Netlify = priorNetlify;
    console.info = priorInfo;
  });

  const vite = await createViteServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());

  const sweep = await vite.ssrLoadModule("/netlify/functions/helix-stripe-sweep.mts");
  await assert.doesNotReject(
    sweep.default(new Request("https://helix.kreluna.it/.netlify/functions/helix-stripe-sweep")),
  );
  assert.deepEqual(environmentReads, ["STRIPE_BILLING_ENABLED"]);
  assert.match(logs.join("\n"), /stripe_event_sweep_skipped/);
  assert.match(logs.join("\n"), /billing_disabled/);

  const gateAt = sweepSource.indexOf("if (!stripeBillingEnabled())");
  const secretAt = sweepSource.indexOf("const secret = billingSecret()", gateAt);
  const queueImportAt = sweepSource.indexOf(
    'await import("../../src/lib/server/billing/queue")',
    gateAt,
  );
  assert.ok(gateAt >= 0 && secretAt > gateAt && queueImportAt > secretAt);
  assert.doesNotMatch(sweepSource.slice(0, gateAt), /billing\/queue/);
});
