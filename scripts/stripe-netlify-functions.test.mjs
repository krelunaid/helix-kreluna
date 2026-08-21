import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
