import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serverSource = await readFile(new URL("../src/lib/server/vetra.ts", import.meta.url), "utf8");
const pricingSource = await readFile(new URL("../src/routes/pricing.tsx", import.meta.url), "utf8");
const deploySource = await readFile(new URL("../src/lib/server/deploy.ts", import.meta.url), "utf8");
const creditsSource = await readFile(new URL("../src/lib/server/credits.ts", import.meta.url), "utf8");

function section(start, end) {
  return serverSource.slice(serverSource.indexOf(start), serverSource.indexOf(end));
}

test("paid plans fail closed when no verified payment provider is configured", () => {
  const choosePlan = section("export const choosePlan", "export const buyExtraCredits");
  assert.match(choosePlan, /plan\.id !== "free"/);
  assert.match(choosePlan, /PAYMENTS_NOT_AVAILABLE/);
  assert.doesNotMatch(choosePlan, /credits_balance\s*=\s*credits_balance\s*\+/);
  assert.doesNotMatch(choosePlan, /plan_grant/);
});

test("top-ups cannot mutate credits without a verified payment", () => {
  const buyExtraCredits = serverSource.slice(serverSource.indexOf("export const buyExtraCredits"));
  assert.match(buyExtraCredits, /throw new BillingError\("PAYMENTS_NOT_AVAILABLE"\)/);
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

test("pricing labels and disables unavailable purchases", () => {
  assert.match(pricingSource, /disabled=\{p\.id !== "free"/);
  assert.match(pricingSource, /t\("pricing\.unavailable"\)/);
  assert.doesNotMatch(pricingSource, /buyExtraCredits/);
});

test("hosting and web publish share one idempotent charge and commit atomically", () => {
  assert.match(creditsSource, /web-host:\$\{projectId\}:initial/);
  assert.match(serverSource, /initialWebHostingIdempotencyKey\(id\)/);
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
