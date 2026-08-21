import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NOW = Date.parse("2026-08-20T12:00:00.000Z");
const DEPLOY_SHA256 = "d".repeat(64);

function fixtureHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Capacity evidence</title><style>body{font-family:system-ui}</style></head><body><main><h1>Capacity evidence</h1><button>Save</button></main><script>document.querySelector('button').addEventListener('click',()=>document.body.dataset.saved='true')</script></body></html>`;
}

function evidenceBody(artifactSha256, observedAt = new Date(NOW).toISOString()) {
  const binding = {
    artifactSha256,
    deploySha256: DEPLOY_SHA256,
    observedAt,
  };
  return {
    kind: "augur_capacity_evidence",
    version: "1.0.0",
    artifactSha256,
    deploySha256: DEPLOY_SHA256,
    generatedAt: observedAt,
    profiles: {
      storm: {
        ...binding,
        kind: "storm_capacity_load_test",
        version: "1.0.0",
        status: "completed",
        evidence: "measured",
        source: "fixture://authorized-storm-report",
        runner: "fixture-storm-runner",
        targetSha256: "a".repeat(64),
        durationMs: 60_000,
        metrics: {
          attemptedRequests: 1_000,
          successfulRequests: 995,
          failedRequests: 5,
          stableRequestsPerSecond: 180,
          saturationRequestsPerSecond: 240,
          errorRate: 0.005,
          latencyMs: { p50: 40, p95: 100, p99: 180 },
          concurrency: { configured: 100, peak: 80, saturation: 100 },
          saturationObserved: true,
        },
      },
      database: {
        ...binding,
        kind: "database_capacity_profile",
        version: "1.0.0",
        evidence: "measured",
        source: "fixture://database-telemetry",
        engine: "PostgreSQL",
        instanceClass: "fixture-class",
        sampleWindowSeconds: 3_600,
        metrics: {
          sustainedTransactionsPerSecond: 600,
          p95QueryLatencyMs: 12,
          activeConnections: 40,
          maxConnections: 200,
          saturationConnections: 160,
          queriesPerRequest: 2,
        },
      },
      topology: {
        ...binding,
        kind: "deployment_topology_profile",
        version: "1.0.0",
        evidence: "observed",
        source: "fixture://provider-topology-export",
        provider: "fixture-provider",
        environment: "capacity-test-fixture",
        regions: ["fixture-region-1"],
        services: [
          { id: "web", role: "web", replicas: 2 },
          { id: "api", role: "api", replicas: 2 },
          { id: "db", role: "database", replicas: 1 },
        ],
      },
      cost: {
        ...binding,
        kind: "cost_telemetry_profile",
        version: "1.0.0",
        evidence: "measured",
        source: "fixture://provider-cost-export",
        currency: "EUR",
        amount: 25,
        periodStart: new Date(Date.parse(observedAt) - 3_600_000).toISOString(),
        periodEnd: observedAt,
        billedRequests: 2_000_000,
        providerReferenceSha256: "b".repeat(64),
      },
      concurrency: {
        ...binding,
        kind: "concurrency_capacity_profile",
        version: "1.0.0",
        evidence: "measured",
        source: "fixture://gateway-concurrency-export",
        metrics: {
          stableConcurrentRequests: 40,
          hardConcurrentRequestLimit: 80,
          observedPeakConcurrentRequests: 80,
          queueDepthAtSaturation: 12,
        },
      },
    },
  };
}

test("Augur consumes only complete, fresh and hash-bound measured evidence", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());

  const [capacityModule, scoreModule, aegisModule] = await Promise.all([
    vite.ssrLoadModule("/src/lib/capacity-evidence.ts"),
    vite.ssrLoadModule("/src/lib/score.ts"),
    vite.ssrLoadModule("/src/lib/server/quality/aegis.ts"),
  ]);
  const html = fixtureHtml();
  const artifactSha256 = (await aegisModule.runAegisStaticScan(html)).artifactSha256;
  const complete = await capacityModule.sealCapacityEvidence(evidenceBody(artifactSha256));

  await t.test("complete evidence produces a bounded throughput forecast", async () => {
    const score = await scoreModule.computeScore(
      html,
      "Measured capacity fixture",
      { capacity: complete, capacityDeploySha256: DEPLOY_SHA256 },
      "en",
      { now: NOW },
    );

    assert.equal(score.capacityForecast.status, "completed");
    assert.equal(score.capacityForecast.evidence, "estimated");
    assert.deepEqual(score.capacityForecast.range, {
      min: 180,
      max: 240,
      unit: "requests/second",
    });
    assert.equal(score.capacityForecast.confidence, 0.9);
    assert.equal(score.capacityForecast.artifactSha256, artifactSha256);
    assert.equal(score.capacityForecast.deploySha256, DEPLOY_SHA256);
    assert.equal(score.capacityForecast.evidenceSha256, complete.evidenceSha256);
    assert.ok(score.capacityForecast.basis.length >= 5);
    assert.equal(
      score.council.signals.find((signal) => signal.seat === "Capacity forecast")?.evidence,
      "estimated",
    );
    assert.ok(scoreModule.normalizePersistedScore(score, artifactSha256));
  });

  await t.test("stale evidence remains NOT_RUN", async () => {
    const staleAt = new Date(NOW - capacityModule.CAPACITY_EVIDENCE_MAX_AGE_MS).toISOString();
    const stale = await capacityModule.sealCapacityEvidence(evidenceBody(artifactSha256, staleAt));
    const score = await scoreModule.computeScore(
      html,
      "Stale capacity fixture",
      { capacity: stale, capacityDeploySha256: DEPLOY_SHA256 },
      "en",
      { now: NOW },
    );
    assert.equal(score.capacityForecast.status, "not_run");
    assert.equal(score.capacityForecast.confidence, 0);
    assert.match(score.capacityForecast.missingEvidence.join(" "), /fresh/i);
  });

  await t.test("artifact or deploy mismatch remains NOT_RUN", async () => {
    const otherArtifact = await capacityModule.sealCapacityEvidence(evidenceBody("e".repeat(64)));
    const artifactMismatch = await scoreModule.computeScore(
      html,
      "Mismatched capacity fixture",
      { capacity: otherArtifact, capacityDeploySha256: DEPLOY_SHA256 },
      "en",
      { now: NOW },
    );
    assert.equal(artifactMismatch.capacityForecast.status, "not_run");
    assert.match(artifactMismatch.capacityForecast.missingEvidence.join(" "), /current artifact/i);

    const deployMismatch = await scoreModule.computeScore(
      html,
      "Mismatched deploy fixture",
      { capacity: complete, capacityDeploySha256: "f".repeat(64) },
      "en",
      { now: NOW },
    );
    assert.equal(deployMismatch.capacityForecast.status, "not_run");
    assert.match(deployMismatch.capacityForecast.missingEvidence.join(" "), /deploy binding/i);

    const noRegistryBinding = await scoreModule.computeScore(
      html,
      "Missing deployment-registry binding fixture",
      { capacity: complete },
      "en",
      { now: NOW },
    );
    assert.equal(noRegistryBinding.capacityForecast.status, "not_run");
    assert.match(noRegistryBinding.capacityForecast.missingEvidence.join(" "), /deploy binding/i);
  });

  await t.test("incomplete or tampered evidence remains NOT_RUN", async () => {
    const incomplete = structuredClone(complete);
    delete incomplete.profiles.cost;
    const missingCost = await scoreModule.computeScore(
      html,
      "Incomplete capacity fixture",
      { capacity: incomplete, capacityDeploySha256: DEPLOY_SHA256 },
      "en",
      { now: NOW },
    );
    assert.equal(missingCost.capacityForecast.status, "not_run");
    assert.match(missingCost.capacityForecast.missingEvidence.join(" "), /cost/i);

    const tampered = structuredClone(complete);
    tampered.profiles.storm.metrics.stableRequestsPerSecond = 220;
    const badHash = await scoreModule.computeScore(
      html,
      "Tampered capacity fixture",
      { capacity: tampered, capacityDeploySha256: DEPLOY_SHA256 },
      "en",
      { now: NOW },
    );
    assert.equal(badHash.capacityForecast.status, "not_run");
    assert.match(badHash.capacityForecast.missingEvidence.join(" "), /hash/i);
  });
});

test("the Prototype job consumes supplied evidence without dispatching Storm", async () => {
  const [source, queue] = await Promise.all([
    readFile(new URL("../src/lib/server/orchestrator/helix.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/server/jobs/queue.ts", import.meta.url), "utf8"),
  ]);
  assert.match(source, /applyPrototypeCapacitySteps\(job, score\)/);
  assert.match(source, /job\.quality\?\.capacity/);
  assert.match(source, /computeScore\(page, job\.prompt, job\.quality/);
  assert.match(source, /no traffic was launched by the Prototype job/);
  assert.doesNotMatch(source, /storm-load|runStormLoad|qa:storm/);
  assert.match(queue, /const \{ runtime: _runtime, \.\.\.persisted \} = job/);
  assert.match(queue, /JSON\.stringify\(persisted\)/);
  assert.doesNotMatch(queue, /quality\s*=\s*undefined/);
});
