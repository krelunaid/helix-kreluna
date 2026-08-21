import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serverSource = await readFile(new URL("../src/lib/server/vetra.ts", import.meta.url), "utf8");
const pricingSource = await readFile(new URL("../src/routes/pricing.tsx", import.meta.url), "utf8");
const deploySource = await readFile(
  new URL("../src/lib/server/deploy.ts", import.meta.url),
  "utf8",
);
const creditsSource = await readFile(
  new URL("../src/lib/server/credits.ts", import.meta.url),
  "utf8",
);

function section(start, end) {
  return serverSource.slice(serverSource.indexOf(start), serverSource.indexOf(end));
}

test("paid plans start hosted Checkout and never grant credits locally", () => {
  const choosePlan = section("export const choosePlan", "export const buyExtraCredits");
  assert.match(choosePlan, /isPaidPlanId\(plan\.id\)/);
  assert.match(choosePlan, /startSubscriptionCheckout/);
  assert.match(choosePlan, /requestId/);
  assert.doesNotMatch(choosePlan, /credits_balance\s*=\s*credits_balance\s*\+/);
  assert.doesNotMatch(choosePlan, /plan_grant/);
});

test("top-ups create Checkout and cannot mutate credits directly", () => {
  const buyExtraCredits = section(
    "export const buyExtraCredits",
    "export const createBillingPortalSession",
  );
  assert.match(buyExtraCredits, /startTopUpCheckout/);
  assert.match(buyExtraCredits, /requestId/);
  assert.doesNotMatch(buyExtraCredits, /update profiles/i);
  assert.doesNotMatch(buyExtraCredits, /insert into credit_ledger/i);
});

test("the free allowance is inserted once and never granted by plan switching", () => {
  const ensureProfile = section("async function ensureProfile", "function requestId");
  const choosePlan = section("export const choosePlan", "export const buyExtraCredits");
  assert.match(ensureProfile, /on conflict \(user_id\) do nothing/i);
  assert.match(choosePlan, /set plan = 'free'/);
  assert.doesNotMatch(choosePlan, /credits_balance/);
});

test("pricing redirects paid actions to Stripe and fails closed when unavailable", () => {
  assert.match(pricingSource, /choosePlan\([\s\S]*crypto\.randomUUID\(\)/);
  assert.match(pricingSource, /window\.location\.assign\(next\.url\)/);
  assert.match(pricingSource, /buyExtraCredits/);
  assert.match(pricingSource, /window\.location\.assign\(checkout\.url\)/);
  assert.match(pricingSource, /!billing\?\.available/);
  assert.match(pricingSource, /t\("pricing\.unavailable"\)/);
});

test("legacy hosting is retired and web publish owns the only idempotent hosting charge", () => {
  assert.match(creditsSource, /web-host:\$\{projectId\}:initial/);
  const legacyHost = section("export const hostProject", "export const choosePlan");
  assert.match(legacyHost, /throw new LegacyHostingRetiredError\(\)/);
  assert.doesNotMatch(legacyHost, /initialWebHostingIdempotencyKey|apply_credit_entry/);
  const publishWeb = deploySource.slice(
    deploySource.indexOf("export const publishWeb"),
    deploySource.indexOf("export const publishGuest"),
  );
  assert.match(publishWeb, /initialWebHostingIdempotencyKey\(project\.id\)/);
  assert.match(publishWeb, /with gate as materialized[\s\S]*credit as/i);
  assert.match(publishWeb, /insert into public_apps/i);
  assert.match(publishWeb, /insert into deploys/i);
  assert.doesNotMatch(publishWeb, /await debitCredits/);
});
