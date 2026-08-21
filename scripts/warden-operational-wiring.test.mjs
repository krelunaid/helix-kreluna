import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NOW = "2026-08-20T10:00:00.000Z";

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

function metric(signal, observedAt = NOW) {
  const values = {
    errors: ["errors_per_minute", 7],
    uptime: ["ratio", 0.9999],
    latency: ["milliseconds_p95", 140],
    dependencyVulnerabilities: ["count_high_or_critical", 0],
    deployHealth: ["healthy_ratio", 1],
    costs: ["usd_month_to_date", 22.5],
  };
  const [unit, value] = values[signal];
  return {
    status: "measured",
    source: "untrusted-payload-source",
    observedAt,
    value,
    unit,
    sampleCount: 60,
  };
}

function dependencies(observedAt = NOW) {
  return {
    status: "measured",
    source: "untrusted-payload-source",
    observedAt,
    dependencies: [
      {
        name: "runtime-library",
        currentVersion: "1.2.3",
        latestVersion: "1.2.3",
        supportEndsAt: "2027-12-31T00:00:00.000Z",
        vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0 },
      },
    ],
  };
}

async function modules(t) {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  return vite.ssrLoadModule("/src/lib/server/operations/warden-service.ts");
}

function sourceEnvelope(configuration, evidenceKind, payload) {
  return {
    kind: "warden_source_evidence",
    version: "1.0.0",
    adapterId: configuration.adapterId,
    sourceId: configuration.sourceId,
    evidenceKind,
    payload,
  };
}

test("Warden binds authenticated source identity and persists hash-bound contract evidence", async (t) => {
  const warden = await modules(t);
  const source = {
    adapterId: "primary-monitor",
    sourceId: "monitoring-provider:tenant-7",
    baseUrl: "https://monitor.example.test/account/tenant-7/",
    bearerToken: "w".repeat(48),
    requestTimeoutMs: 5_000,
  };
  const requests = [];
  const transport = {
    async readJson(input) {
      requests.push(input);
      const path = new URL(input.url).pathname;
      if (path.endsWith("/dependencies")) {
        return sourceEnvelope(source, { type: "dependencies" }, dependencies());
      }
      const signal = decodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
      return sourceEnvelope(source, { type: "signal", signal }, metric(signal));
    },
  };
  const adapter = warden.createAuthenticatedWardenHttpAdapter(source, transport);
  let persisted;
  const result = await warden.runWardenCycle({
    configuration: {
      runKey: "scheduled-2026-08-20T10:00:00.000Z",
      environment: "production",
      releaseRef: "commit-a194ffc",
      generatedAt: NOW,
      policy: policy(),
      alertDeduplicationTtlMs: 3_600_000,
    },
    adapter,
    store: {
      async persist(input) {
        persisted = warden.WardenObservationPersistenceInputSchema.parse(input);
        return {
          kind: "warden_persisted_observation",
          version: "1.0.0",
          observationId: "a".repeat(64),
          snapshotSha256: input.snapshotSha256,
          reportSha256: input.reportSha256,
          newAlertKeys: input.alerts.map((alert) => alert.deduplicationKey),
          suppressedAlertKeys: [],
          alertDeliveryAttempted: false,
          automaticApply: false,
          automaticPublish: false,
          automaticDeploy: false,
          automaticRollback: false,
        };
      },
    },
  });
  assert.equal(requests.length, 7);
  for (const request of requests) {
    assert.equal(request.headers.authorization, `Bearer ${source.bearerToken}`);
    assert.equal(request.headers["x-helix-warden-adapter"], source.adapterId);
    assert.equal(request.headers["x-helix-warden-source"], source.sourceId);
  }
  for (const signal of Object.values(result.snapshot.signals)) {
    assert.equal(signal.source, source.sourceId);
  }
  assert.equal(result.snapshot.dependencyEvidence.source, source.sourceId);
  assert.equal(result.report.snapshotSha256, persisted.snapshotSha256);
  assert.equal(result.persistence.reportSha256, persisted.reportSha256);
  assert.equal(result.report.status, "attention_required");
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].deliveryAttempted, false);
  assert.equal(result.persistence.automaticApply, false);
  assert.equal(result.persistence.automaticPublish, false);
  assert.equal(result.persistence.automaticDeploy, false);
  assert.equal(result.persistence.automaticRollback, false);
  assert.doesNotMatch(JSON.stringify(persisted), new RegExp(source.bearerToken));
});

test("Warden fails closed on a source identity mismatch", async (t) => {
  const warden = await modules(t);
  const source = {
    adapterId: "primary-monitor",
    sourceId: "monitoring-provider:tenant-7",
    baseUrl: "https://monitor.example.test/",
    bearerToken: "w".repeat(48),
    requestTimeoutMs: 5_000,
  };
  const adapter = warden.createAuthenticatedWardenHttpAdapter(source, {
    async readJson(input) {
      const path = new URL(input.url).pathname;
      const dependenciesRequest = path.endsWith("/dependencies");
      const signal = path.slice(path.lastIndexOf("/") + 1);
      return sourceEnvelope(
        { ...source, sourceId: "monitoring-provider:other-tenant" },
        dependenciesRequest ? { type: "dependencies" } : { type: "signal", signal },
        dependenciesRequest ? dependencies() : metric(signal),
      );
    },
  });
  let persisted;
  const result = await warden.runWardenCycle({
    configuration: {
      runKey: "identity-mismatch",
      environment: "production",
      releaseRef: "commit-a194ffc",
      generatedAt: NOW,
      policy: policy(),
      alertDeduplicationTtlMs: 3_600_000,
    },
    adapter,
    store: {
      async persist(input) {
        persisted = input;
        return {
          kind: "warden_persisted_observation",
          version: "1.0.0",
          observationId: "b".repeat(64),
          snapshotSha256: input.snapshotSha256,
          reportSha256: input.reportSha256,
          newAlertKeys: [],
          suppressedAlertKeys: input.alerts.map((alert) => alert.deduplicationKey),
          alertDeliveryAttempted: false,
          automaticApply: false,
          automaticPublish: false,
          automaticDeploy: false,
          automaticRollback: false,
        };
      },
    },
  });
  assert.equal(result.report.status, "blocked");
  assert.equal(result.report.evidence, "incomplete");
  assert.ok(
    Object.values(result.snapshot.signals).every((entry) => entry.status === "unavailable"),
  );
  assert.doesNotMatch(JSON.stringify(persisted), /other-tenant/);
});

test("the SQL Warden store durably deduplicates alerts and rejects run-key reuse", async (t) => {
  const warden = await modules(t);
  const pg = new PGlite();
  await pg.waitReady;
  t.after(() => pg.close());
  await pg.exec(
    await readFile(new URL("../migrations/0021_warden_operations.sql", import.meta.url), "utf8"),
  );
  const sql = {
    async query(text, params = []) {
      return (await pg.query(text, params)).rows;
    },
  };
  const store = warden.createSqlWardenObservationStore(async () => sql);
  let observedAt = NOW;
  const source = {
    adapterId: "sql-monitor",
    sourceId: "sql-monitor:tenant",
    baseUrl: "https://monitor.example.test/",
    bearerToken: "s".repeat(48),
    requestTimeoutMs: 5_000,
  };
  const adapter = warden.createAuthenticatedWardenHttpAdapter(source, {
    async readJson(input) {
      const path = new URL(input.url).pathname;
      if (path.endsWith("/dependencies")) {
        return sourceEnvelope(source, { type: "dependencies" }, dependencies(observedAt));
      }
      const signal = path.slice(path.lastIndexOf("/") + 1);
      return sourceEnvelope(source, { type: "signal", signal }, metric(signal, observedAt));
    },
  });
  const first = await warden.runWardenCycle({
    configuration: {
      runKey: "sql-cycle-1",
      environment: "production",
      releaseRef: "commit-a194ffc",
      generatedAt: NOW,
      policy: policy(),
      alertDeduplicationTtlMs: 3_600_000,
    },
    adapter,
    store,
  });
  assert.equal(first.persistence.newAlertKeys.length, 1);
  assert.equal(first.persistence.suppressedAlertKeys.length, 0);

  observedAt = "2026-08-20T10:05:00.000Z";
  const second = await warden.runWardenCycle({
    configuration: {
      runKey: "sql-cycle-2",
      environment: "production",
      releaseRef: "commit-a194ffc",
      generatedAt: observedAt,
      policy: policy(),
      alertDeduplicationTtlMs: 3_600_000,
    },
    adapter,
    store,
  });
  assert.deepEqual(second.persistence.suppressedAlertKeys, first.persistence.newAlertKeys);
  const counts = await pg.query(
    "select (select count(*) from warden_observations) as observations, (select count(*) from warden_alert_evidence) as alerts, (select occurrence_count from warden_alert_claims limit 1) as occurrences",
  );
  assert.deepEqual(counts.rows[0], { observations: 2, alerts: 2, occurrences: 2 });
  await assert.rejects(
    warden.runWardenCycle({
      configuration: {
        runKey: "sql-cycle-1",
        environment: "production",
        releaseRef: "commit-a194ffc",
        generatedAt: observedAt,
        policy: policy(),
        alertDeduplicationTtlMs: 3_600_000,
      },
      adapter,
      store,
    }),
    /WARDEN_RUN_KEY_REUSED/,
  );
  await assert.rejects(
    pg.query("update warden_observations set release_ref = 'tampered'"),
    /WARDEN_EVIDENCE_IMMUTABLE/,
  );
});

test("Netlify Warden entrypoints are scheduled/background and fail closed", async () => {
  const sweep = await readFile(
    new URL("../netlify/functions/helix-warden-sweep.mts", import.meta.url),
    "utf8",
  );
  const background = await readFile(
    new URL("../netlify/functions/helix-warden-background.mts", import.meta.url),
    "utf8",
  );
  assert.match(sweep, /schedule:\s*"\*\/5 \* \* \* \*"/u);
  assert.match(background, /background:\s*true/u);
  assert.match(background, /request\.headers\.get\(WARDEN_HEADER\)/u);
  assert.match(background, /HELIX_WARDEN_DISPATCH_SECRET/u);
  assert.match(background, /runConfiguredWardenCycle/u);
  assert.doesNotMatch(`${sweep}\n${background}`, /automatic(?:Deploy|Publish|Rollback|Apply)\s*:\s*true/iu);
});

test("Warden environment configuration is all-or-none and disabled by default", async (t) => {
  const warden = await modules(t);
  assert.equal(warden.resolveWardenRuntimeConfiguration({}, NOW), null);
  assert.throws(
    () =>
      warden.resolveWardenRuntimeConfiguration(
        { HELIX_WARDEN_ENABLED: "true" },
        NOW,
      ),
    /WARDEN_CONFIGURATION_MISSING/,
  );
});
