import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NOW = "2026-08-20T10:00:00.000Z";

function measured(unit, value, source = "verified-monitor") {
  return {
    status: "measured",
    source,
    observedAt: NOW,
    value,
    unit,
    sampleCount: 60,
  };
}

function policy() {
  return {
    maxEvidenceAgeMs: 15 * 60 * 1_000,
    maxErrorsPerMinute: 5,
    minUptimeRatio: 0.999,
    maxP95LatencyMs: 500,
    maxHighOrCriticalVulnerabilities: 0,
    minDeployHealthyRatio: 1,
    maxMonthToDateCostUsd: 100,
    supportWindowWarningDays: 90,
    requireKnownSupportWindows: true,
  };
}

function snapshot(overrides = {}) {
  return {
    kind: "warden_monitoring_snapshot",
    version: "1.0.0",
    environment: "production",
    releaseRef: "deploy-20260820-1",
    generatedAt: NOW,
    signals: {
      errors: measured("errors_per_minute", 0.2),
      uptime: measured("ratio", 0.9999),
      latency: measured("milliseconds_p95", 140),
      dependencyVulnerabilities: measured("count_high_or_critical", 0),
      deployHealth: measured("healthy_ratio", 1),
      costs: measured("usd_month_to_date", 22.5),
    },
    dependencyEvidence: {
      status: "measured",
      source: "dependency-monitor",
      observedAt: NOW,
      dependencies: [
        {
          name: "runtime-library",
          currentVersion: "1.2.3",
          latestVersion: "1.2.3",
          supportEndsAt: "2027-12-31T00:00:00.000Z",
          vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0 },
        },
      ],
    },
    policy: policy(),
    ...overrides,
  };
}

test("Warden evaluates measured evidence and only proposes approved dependency work", async (t) => {
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
    WardenSnapshotSchema,
    WardenUpdateProposalSchema,
    collectWardenSnapshot,
    evaluateWardenSnapshot,
  } = await vite.ssrLoadModule("/src/lib/server/operations/warden.ts");

  const healthy = evaluateWardenSnapshot(snapshot(), { now: NOW });
  assert.equal(healthy.status, "healthy");
  assert.equal(healthy.evidence, "complete_measured");
  assert.deepEqual(healthy.findings, []);
  assert.deepEqual(healthy.updateProposals, []);
  assert.equal(healthy.policy.automaticApply, false);
  assert.equal(healthy.policy.automaticPublish, false);
  assert.equal(healthy.policy.approvalRequired, true);
  assert.match(healthy.snapshotSha256, /^[0-9a-f]{64}$/);

  const historical = snapshot();
  historical.generatedAt = "2020-01-01T00:00:00.000Z";
  for (const signal of Object.values(historical.signals)) {
    signal.observedAt = historical.generatedAt;
  }
  historical.dependencyEvidence.observedAt = historical.generatedAt;
  const wallClockBefore = Date.now();
  const historicalReport = evaluateWardenSnapshot(historical);
  const wallClockAfter = Date.now();
  assert.ok(Date.parse(historicalReport.generatedAt) >= wallClockBefore);
  assert.ok(Date.parse(historicalReport.generatedAt) <= wallClockAfter);
  assert.notEqual(historicalReport.generatedAt, historical.generatedAt);
  assert.equal(historicalReport.status, "blocked");
  assert.equal(historicalReport.evidence, "incomplete");
  assert.ok(
    historicalReport.findings.some((finding) => finding.code === "WARDEN_EVIDENCE_STALE"),
  );
  assert.ok(
    historicalReport.findings.some(
      (finding) => finding.code === "WARDEN_DEPENDENCY_EVIDENCE_STALE",
    ),
  );

  const vulnerableDependency = {
    ...snapshot().dependencyEvidence.dependencies[0],
    latestVersion: "2.0.0",
    supportEndsAt: "2026-09-01T00:00:00.000Z",
    vulnerabilities: { critical: 1, high: 0, moderate: 0, low: 0 },
  };
  const attention = evaluateWardenSnapshot(
    snapshot({
      signals: {
        ...snapshot().signals,
        dependencyVulnerabilities: measured("count_high_or_critical", 1),
      },
      dependencyEvidence: {
        ...snapshot().dependencyEvidence,
        dependencies: [vulnerableDependency],
      },
    }),
    { now: NOW },
  );
  assert.equal(attention.status, "blocked");
  assert.ok(
    attention.findings.some(
      (finding) => finding.code === "WARDEN_DEPENDENCY_VULNERABILITY_THRESHOLD_EXCEEDED",
    ),
  );
  assert.ok(
    attention.findings.some((finding) => finding.code === "WARDEN_SUPPORT_WINDOW_CLOSING"),
  );
  assert.equal(attention.updateProposals.length, 1);
  assert.deepEqual(attention.updateProposals[0].requiredValidation, [
    "isolated_install",
    "test_suite",
    "security_scan",
    "human_approval",
  ]);
  assert.equal(attention.updateProposals[0].automaticApply, false);
  assert.equal(attention.updateProposals[0].automaticPublish, false);
  assert.equal(attention.updateProposals[0].requiresApproval, true);
  assert.equal(
    WardenUpdateProposalSchema.safeParse({ ...attention.updateProposals[0], apply: true }).success,
    false,
  );

  const unknownLatest = evaluateWardenSnapshot(
    snapshot({
      dependencyEvidence: {
        ...snapshot().dependencyEvidence,
        dependencies: [
          { ...snapshot().dependencyEvidence.dependencies[0], latestVersion: null },
        ],
      },
    }),
    { now: NOW },
  );
  assert.equal(unknownLatest.status, "blocked");
  assert.equal(unknownLatest.evidence, "incomplete");
  assert.ok(
    unknownLatest.findings.some((finding) => finding.code === "WARDEN_LATEST_VERSION_UNKNOWN"),
  );

  let dependencyReads = 0;
  const signalReads = [];
  const collected = await collectWardenSnapshot(
    {
      environment: "production",
      releaseRef: "deploy-20260820-2",
      generatedAt: NOW,
      policy: policy(),
    },
    {
      id: "injected-monitor-adapter",
      async readSignal(signal) {
        signalReads.push(signal);
        if (signal === "costs") {
          throw new Error("token=super-secret upstream unavailable");
        }
        return snapshot().signals[signal];
      },
      async readDependencies() {
        dependencyReads += 1;
        return snapshot().dependencyEvidence;
      },
    },
  );
  assert.deepEqual(signalReads.sort(), [
    "costs",
    "dependencyVulnerabilities",
    "deployHealth",
    "errors",
    "latency",
    "uptime",
  ]);
  assert.equal(dependencyReads, 1);
  assert.equal(collected.signals.costs.status, "unavailable");
  for (const signal of Object.values(collected.signals)) {
    assert.equal(signal.source, "injected-monitor-adapter");
  }
  assert.equal(collected.dependencyEvidence.source, "injected-monitor-adapter");
  assert.doesNotMatch(JSON.stringify(collected), /super-secret/);
  const unavailable = evaluateWardenSnapshot(collected, { now: NOW });
  assert.equal(unavailable.status, "blocked");
  assert.equal(unavailable.evidence, "incomplete");
  assert.equal(
    WardenSnapshotSchema.safeParse({ ...snapshot(), executeUpdates: true }).success,
    false,
  );
  assert.equal(
    WardenSnapshotSchema.safeParse({
      ...snapshot(),
      signals: { ...snapshot().signals, uptime: measured("ratio", 1.1) },
    }).success,
    false,
  );
});
