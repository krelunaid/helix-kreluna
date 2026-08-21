import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NOW = "2026-08-20T10:00:00.000Z";

function requirements(overrides = {}) {
  return {
    kind: "nimbus_infrastructure_requirements",
    version: "1.0.0",
    projectId: "helix-release",
    generatedAt: NOW,
    decisionHorizonEndsAt: "2027-08-20T10:00:00.000Z",
    requiredRegion: "eu-west",
    requiredRuntimeId: "node-22",
    database: { required: true, kind: "postgresql" },
    storage: { required: true, kind: "object" },
    cdnRequired: true,
    secretNames: ["DATABASE_URL", "SESSION_SECRET"],
    usage: {
      monthlyRequests: 2_000_000,
      egressGb: 10,
      databaseStorageGb: 10,
      objectStorageGb: 20,
    },
    policy: {
      maxQuoteAgeMs: 7 * 24 * 60 * 60 * 1_000,
      costRiskBufferRatio: 0.1,
      maxMonthlyCostUsd: 40,
    },
    ...overrides,
  };
}

function candidate(id, overrides = {}) {
  return {
    id,
    displayName: `Provider ${id}`,
    regions: ["eu-west"],
    runtimes: [{ id: "node-22", supportedUntil: "2028-04-30T00:00:00.000Z" }],
    databaseServices: [{ id: `${id}-postgres`, kind: "postgresql" }],
    storageServices: [{ id: `${id}-objects`, kind: "object" }],
    cdnAvailable: true,
    secretStoreAvailable: true,
    quote: {
      reference: `${id}-price-sheet-2026-08-19`,
      observedAt: "2026-08-19T10:00:00.000Z",
      currency: "USD",
    },
    pricing: {
      baseMonthlyUsd: 10,
      perMillionRequestsUsd: 1,
      perEgressGbUsd: 0.1,
      databaseBaseMonthlyUsd: 5,
      databasePerGbUsd: 0.2,
      storageBaseMonthlyUsd: 1,
      storagePerGbUsd: 0.05,
    },
    ...overrides,
  };
}

function measured(unit, value) {
  return {
    status: "measured",
    source: "verified-observability",
    observedAt: NOW,
    value,
    unit,
    sampleCount: 120,
  };
}

function operationalSnapshot(overrides = {}) {
  return {
    kind: "nimbus_operational_snapshot",
    version: "1.0.0",
    environment: "production",
    releaseRef: "release-current",
    previousReleaseRef: "release-previous",
    generatedAt: NOW,
    metrics: {
      errorRate: measured("ratio", 0.001),
      uptime: measured("ratio", 0.9999),
      latencyP95: measured("milliseconds_p95", 180),
      deployHealth: measured("healthy_ratio", 1),
      costForecast: measured("usd_monthly_forecast", 25),
    },
    thresholds: {
      maxErrorRate: 0.02,
      minUptimeRatio: 0.999,
      maxP95LatencyMs: 500,
      minDeployHealthyRatio: 1,
      maxMonthlyCostUsd: 40,
      maxSnapshotAgeMs: 15 * 60 * 1_000,
      alertDeduplicationTtlMs: 60 * 60 * 1_000,
    },
    ...overrides,
  };
}

test("Nimbus makes requirement-driven infrastructure decisions and never deploys them", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const {
    NimbusInfrastructureDecisionInputSchema,
    decideNimbusInfrastructure,
  } = await vite.ssrLoadModule("/src/lib/server/operations/nimbus.ts");

  const decision = decideNimbusInfrastructure(
    {
      requirements: requirements(),
      candidates: [
        candidate("wrong-region", { regions: ["us-east"], pricing: { ...candidate("x").pricing, baseMonthlyUsd: 1 } }),
        candidate("eligible-low"),
        candidate("eligible-high", { pricing: { ...candidate("x").pricing, baseMonthlyUsd: 15 } }),
      ],
    },
    { now: NOW },
  );
  assert.equal(decision.provider.id, "eligible-low");
  assert.equal(decision.provider.region, "eu-west");
  assert.equal(decision.runtime.id, "node-22");
  assert.equal(decision.database.serviceId, "eligible-low-postgres");
  assert.equal(decision.storage.serviceId, "eligible-low-objects");
  assert.equal(decision.cdn.selectedInPlan, true);
  assert.deepEqual(decision.secrets.names, ["DATABASE_URL", "SESSION_SECRET"]);
  assert.equal(decision.secrets.valuesIncluded, false);
  assert.equal(decision.monthlyCostEstimate.minimumUsd, 22);
  assert.equal(decision.monthlyCostEstimate.maximumUsd, 24.2);
  assert.equal(decision.automaticDeployment, false);
  assert.equal(decision.requiresApproval, true);
  assert.match(decision.limitations.join("\n"), /No infrastructure resource/);
  assert.ok(decision.rejectedCandidates.some((entry) => entry.providerId === "wrong-region"));
  assert.match(decision.requirementsSha256, /^[0-9a-f]{64}$/);

  const changedEconomics = decideNimbusInfrastructure(
    {
      requirements: requirements(),
      candidates: [
        candidate("first", { pricing: { ...candidate("x").pricing, baseMonthlyUsd: 20 } }),
        candidate("second", { pricing: { ...candidate("x").pricing, baseMonthlyUsd: 8 } }),
      ],
    },
    { now: NOW },
  );
  assert.equal(changedEconomics.provider.id, "second");
  assert.match(changedEconomics.rationale.at(-1), /no provider was selected from a static slogan/i);

  const staleCandidate = candidate("stale", {
    quote: {
      reference: "stale-price-sheet",
      observedAt: "2026-07-01T00:00:00.000Z",
      currency: "USD",
    },
  });
  assert.throws(
    () => decideNimbusInfrastructure(
      { requirements: requirements(), candidates: [staleCandidate] },
      { now: NOW },
    ),
    (error) => error.code === "NIMBUS_NO_ELIGIBLE_PROVIDER",
  );
  assert.throws(
    () => decideNimbusInfrastructure(
      {
        requirements: requirements({
          generatedAt: "2020-01-02T00:00:00.000Z",
          decisionHorizonEndsAt: "2027-01-01T00:00:00.000Z",
        }),
        candidates: [candidate("stale-provider", {
          quote: {
            reference: "stale-provider-price-sheet",
            observedAt: "2020-01-01T00:00:00.000Z",
            currency: "USD",
          },
        })],
      },
      { now: NOW },
    ),
    (error) => error.code === "NIMBUS_NO_ELIGIBLE_PROVIDER",
  );
  assert.equal(decision.generatedAt, NOW);
  assert.equal(
    NimbusInfrastructureDecisionInputSchema.safeParse({
      requirements: { ...requirements(), secretValues: { SESSION_SECRET: "do-not-accept" } },
      candidates: [candidate("only")],
    }).success,
    false,
  );
});

test("Nimbus evaluates measured thresholds, deduplicates alerts, and only recommends rollback", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const {
    deduplicateNimbusAlerts,
    evaluateNimbusOperationalSnapshot,
    runNimbusObservation,
  } = await vite.ssrLoadModule("/src/lib/server/operations/nimbus.ts");

  const breached = operationalSnapshot({
    metrics: {
      ...operationalSnapshot().metrics,
      errorRate: measured("ratio", 0.04),
      deployHealth: measured("healthy_ratio", 0),
      costForecast: measured("usd_monthly_forecast", 50),
    },
  });
  const report = evaluateNimbusOperationalSnapshot(breached, { now: NOW });
  assert.equal(report.status, "degraded");
  assert.equal(report.breaches.length, 3);
  assert.equal(report.alertCandidates.length, 3);
  assert.equal(report.rollbackRecommendation.status, "recommended");
  assert.equal(report.rollbackRecommendation.targetReleaseRef, "release-previous");
  assert.equal(report.rollbackRecommendation.automaticRollback, false);
  assert.equal(report.rollbackRecommendation.requiresApproval, true);
  assert.equal(report.automaticAlertDelivery, false);
  assert.equal(report.automaticRollback, false);

  const historical = operationalSnapshot();
  historical.generatedAt = "2020-01-01T00:00:00.000Z";
  for (const metric of Object.values(historical.metrics)) {
    metric.observedAt = historical.generatedAt;
  }
  const wallClockBefore = Date.now();
  const historicalReport = evaluateNimbusOperationalSnapshot(historical);
  const wallClockAfter = Date.now();
  assert.ok(Date.parse(historicalReport.generatedAt) >= wallClockBefore);
  assert.ok(Date.parse(historicalReport.generatedAt) <= wallClockAfter);
  assert.notEqual(historicalReport.generatedAt, historical.generatedAt);
  assert.equal(historicalReport.status, "blocked");
  assert.ok(
    historicalReport.breaches.some((breach) => breach.code === "NIMBUS_METRIC_STALE"),
  );

  const claimed = new Set();
  const store = {
    async claim({ deduplicationKey }) {
      if (claimed.has(deduplicationKey)) return false;
      claimed.add(deduplicationKey);
      return true;
    },
  };
  const first = await deduplicateNimbusAlerts(
    report,
    store,
    breached.thresholds.alertDeduplicationTtlMs,
    { now: NOW },
  );
  assert.equal(first.newAlerts.length, 3);
  assert.equal(first.suppressedAlerts.length, 0);
  assert.equal(first.deliveryAttempted, false);
  const second = await deduplicateNimbusAlerts(
    report,
    store,
    breached.thresholds.alertDeduplicationTtlMs,
    { now: NOW },
  );
  assert.equal(second.newAlerts.length, 0);
  assert.equal(second.suppressedAlerts.length, 3);

  const incomplete = evaluateNimbusOperationalSnapshot(
    operationalSnapshot({
      metrics: {
        ...operationalSnapshot().metrics,
        deployHealth: {
          status: "unavailable",
          attemptedAt: NOW,
          source: "verified-observability",
          reasonCode: "DEPLOY_MONITOR_UNAVAILABLE",
          detailRedacted: "The deploy monitor did not return evidence.",
        },
      },
    }),
    { now: NOW },
  );
  assert.equal(incomplete.status, "blocked");
  assert.equal(incomplete.rollbackRecommendation.status, "unavailable");
  assert.equal(incomplete.rollbackRecommendation.automaticRollback, false);

  let reads = 0;
  const observation = await runNimbusObservation(
    {
      async readSnapshot() {
        reads += 1;
        return breached;
      },
    },
    store,
    { now: NOW },
  );
  assert.equal(reads, 1);
  assert.equal(observation.report.rollbackRecommendation.status, "recommended");
  assert.equal(observation.deduplication.newAlerts.length, 0);

  await assert.rejects(
    deduplicateNimbusAlerts(
      report,
      {
        async claim() {
          throw new Error("api_key=do-not-leak persistence failed");
        },
      },
      breached.thresholds.alertDeduplicationTtlMs,
      { now: NOW },
    ),
    (error) => {
      assert.match(error.message, /NIMBUS_ALERT_DEDUPLICATION_FAILED/);
      assert.doesNotMatch(error.message, /do-not-leak/);
      return true;
    },
  );
});
