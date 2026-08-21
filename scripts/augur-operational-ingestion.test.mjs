import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIGRATIONS = new URL("../migrations/", import.meta.url);
const NOW = Date.parse("2026-08-20T12:00:00.000Z");
const USER_ID = "augur-user";
const PROJECT_ID = "augur-project";
const JOB_ID = "augur-job-0001";
const DEPLOY_ID = "augur-deploy-0001";
const DEPLOY_SHA256 = "d".repeat(64);
const HMAC_SECRET = "augur-hmac-secret-".padEnd(48, "s");
const TOKEN = "augur-source-token-".padEnd(48, "t");

const ENVIRONMENT = Object.freeze({
  HELIX_AUGUR_EVIDENCE_URL: "https://capacity.example.test/v1/evidence",
  HELIX_AUGUR_EVIDENCE_TOKEN: TOKEN,
  HELIX_AUGUR_EVIDENCE_SOURCE_ID: "controlled-capacity-source",
  HELIX_AUGUR_EVIDENCE_KEY_ID: "capacity-key-v1",
  HELIX_AUGUR_EVIDENCE_HMAC_SECRET: HMAC_SECRET,
  HELIX_AUGUR_EVIDENCE_MAX_AGE_MS: String(24 * 60 * 60 * 1_000),
});

function fixtureHtml() {
  return "<!doctype html><html lang=\"en\"><head><title>Augur</title><style>body{font-family:system-ui}</style></head><body><main><h1>Augur</h1><button>Save</button></main><script>document.querySelector('button').onclick=()=>{document.body.dataset.saved='true'}</script></body></html>";
}

function evidenceBody(artifactSha256, observedAt = new Date(NOW).toISOString()) {
  const binding = { artifactSha256, deploySha256: DEPLOY_SHA256, observedAt };
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
        source: "controlled-storm-report",
        runner: "controlled-storm-runner",
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
        source: "controlled-database-telemetry",
        engine: "PostgreSQL",
        instanceClass: "controlled-class",
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
        source: "controlled-provider-topology",
        provider: "controlled-provider",
        environment: "controlled-capacity-test",
        regions: ["controlled-region-1"],
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
        source: "controlled-provider-cost",
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
        source: "controlled-gateway-concurrency",
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

async function database() {
  const pg = new PGlite();
  await pg.waitReady;
  const files = (await readdir(MIGRATIONS)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of files) await pg.exec(await readFile(new URL(name, MIGRATIONS), "utf8"));
  const html = fixtureHtml();
  const artifactSha256 = createHash("sha256").update(html, "utf8").digest("hex");
  const requestFingerprint = "f".repeat(64);
  const payload = {
    id: JOB_ID,
    prompt: "Capacity test",
    locale: "en",
    mode: "generate",
    buildLevel: "prototype",
    currentHtml: null,
    status: "ready",
    steps: [
      {
        id: "storm",
        agent: "Storm",
        role: "Load test",
        kind: "service",
        status: "standby",
        validation: "not_run",
        detail: "Capacity load evidence not run",
      },
      {
        id: "augur",
        agent: "Augur",
        role: "Capacity",
        kind: "service",
        status: "standby",
        validation: "not_run",
        detail: "Capacity forecast not run",
      },
    ],
    html,
    usedAi: false,
    title: "Augur test",
    projectId: PROJECT_ID,
    userId: USER_ID,
    requestFingerprint,
    createdAt: NOW,
    checkpoint: {
      pipelineVersion: "helix-v3",
      requestFingerprint,
      stage: "finalized",
    },
    queue: { status: "deployed", attemptCount: 1, maxAttempts: 2 },
  };
  await pg.query(
    `insert into projects (id, user_id, title, prompt)
     values ($1, $2, 'Augur test', 'Capacity test')`,
    [PROJECT_ID, USER_ID],
  );
  await pg.query(
    `insert into build_jobs (
       id, project_id, user_id, payload, queue_status, idempotency_key,
       request_fingerprint, pipeline_version, artifact_sha256
     ) values ($1, $2, $3, $4, 'deployed', $5, $6, 'helix-v3', $7)`,
    [JOB_ID, PROJECT_ID, USER_ID, JSON.stringify(payload), `request:${JOB_ID}`, requestFingerprint, artifactSha256],
  );
  await pg.query("update projects set current_build_job_id = $1 where id = $2", [
    JOB_ID,
    PROJECT_ID,
  ]);
  await pg.query(
    `insert into deploys (
       id, project_id, user_id, target, status, version, log,
       build_job_id, artifact_sha256, published_sha256, output_integrity_version,
       completed_at
     ) values ($1, $2, $3, 'web', 'deployed', '1.0.0', '[]', $4, $5, $6, 1, now())`,
    [DEPLOY_ID, PROJECT_ID, USER_ID, JOB_ID, artifactSha256, DEPLOY_SHA256],
  );
  const sql = {
    query: async (text, params = []) => (await pg.query(text, params)).rows,
  };
  return { pg, sql, artifactSha256 };
}

function delivery(module, request, artifactSha256, overrides = {}) {
  const observedAt = overrides.observedAt ?? new Date(NOW).toISOString();
  const payload = {
    kind: "augur_capacity_evidence_delivery",
    version: "1.0.0",
    sourceId: ENVIRONMENT.HELIX_AUGUR_EVIDENCE_SOURCE_ID,
    keyId: ENVIRONMENT.HELIX_AUGUR_EVIDENCE_KEY_ID,
    observedAt,
    requestId: request.requestId,
    requestNonce: request.requestNonce,
    jobId: request.jobId,
    projectId: request.projectId,
    artifactSha256,
    deployId: request.deployId,
    deploySha256: request.deploySha256,
    evidence: evidenceBody(artifactSha256, observedAt),
    ...overrides.payload,
  };
  return module.signAugurEvidenceDeliveryEnvelope(payload, HMAC_SECRET);
}

let vite;
let augur;
let environmentModule;

test.before(async () => {
  vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  [augur, environmentModule] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/quality/augur.ts"),
    vite.ssrLoadModule("/src/lib/env.server.ts"),
  ]);
});

test.after(async () => {
  await vite.close();
});

test("Augur authenticates, binds, atomically persists and idempotently reuses evidence", async (t) => {
  const { pg, sql, artifactSha256 } = await database();
  t.after(() => pg.close());
  let calls = 0;
  const transport = {
    async requestJson(input) {
      calls += 1;
      assert.equal(input.url, ENVIRONMENT.HELIX_AUGUR_EVIDENCE_URL);
      assert.equal(input.headers.authorization, `Bearer ${TOKEN}`);
      assert.equal(input.headers["x-helix-augur-source"], "controlled-capacity-source");
      assert.equal(input.headers["x-helix-augur-key"], "capacity-key-v1");
      const request = JSON.parse(input.body);
      assert.equal(request.artifactSha256, artifactSha256);
      assert.equal(request.deployId, DEPLOY_ID);
      assert.equal(request.deploySha256, DEPLOY_SHA256);
      return delivery(augur, request, artifactSha256);
    },
  };
  const requestId = randomUUID();
  const run = () =>
    augur.runConfiguredAugurCapacityIngestion({
      environment: ENVIRONMENT,
      userId: USER_ID,
      projectId: PROJECT_ID,
      jobId: JOB_ID,
      requestId,
      transport,
      sqlProvider: async () => sql,
      now: NOW,
    });

  const first = await run();
  assert.equal(first.status, "completed");
  assert.equal(first.wasInserted, true);
  assert.equal(first.forecast.status, "completed");
  assert.deepEqual(first.forecast.range, {
    min: 180,
    max: 240,
    unit: "requests/second",
  });
  const rows = await pg.query("select * from augur_capacity_evidence");
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0].user_id, USER_ID);
  assert.equal(rows.rows[0].deploy_id, DEPLOY_ID);
  assert.equal(rows.rows[0].source_payload.authentication, undefined);
  assert.equal(JSON.stringify(rows.rows[0].source_payload).includes(TOKEN), false);
  const requestRows = await pg.query("select * from augur_capacity_ingestion_requests");
  assert.equal(requestRows.rows.length, 1);
  assert.equal(requestRows.rows[0].evidence_id, first.evidenceId);
  const claimRows = await pg.query("select * from augur_capacity_ingestion_claims");
  assert.equal(claimRows.rows.length, 1);
  assert.equal(claimRows.rows[0].state, "completed");
  assert.equal(claimRows.rows[0].evidence_id, first.evidenceId);
  assert.equal(claimRows.rows[0].lease_expires_at, null);

  const persisted = await pg.query("select payload::jsonb as payload from build_jobs where id = $1", [JOB_ID]);
  assert.equal(persisted.rows[0].payload.quality.capacity.evidenceSha256, first.evidenceSha256);
  assert.equal(persisted.rows[0].payload.quality.capacityDeploySha256, DEPLOY_SHA256);
  assert.equal(persisted.rows[0].payload.score.capacityForecast.status, "completed");
  assert.equal(persisted.rows[0].payload.steps.find((step) => step.id === "storm").validation, "validated");
  assert.equal(persisted.rows[0].payload.steps.find((step) => step.id === "augur").validation, "estimated");

  const second = await run();
  assert.equal(second.wasInserted, false);
  assert.equal(second.evidenceId, first.evidenceId);
  assert.equal(calls, 1);
  const staleRetry = await augur.runConfiguredAugurCapacityIngestion({
    environment: ENVIRONMENT,
    userId: USER_ID,
    projectId: PROJECT_ID,
    jobId: JOB_ID,
    requestId,
    transport,
    sqlProvider: async () => sql,
    now: NOW + 24 * 60 * 60 * 1_000,
  });
  assert.equal(staleRetry.status, "not_run");
  assert.equal(staleRetry.evidence, "not_run");
  assert.equal(staleRetry.forecast.status, "not_run");
  assert.equal(calls, 1);
  assert.equal((await pg.query("select count(*)::int as count from augur_capacity_evidence")).rows[0].count, 1);
  await assert.rejects(
    pg.query("update augur_capacity_evidence set source_id = source_id where id = $1", [first.evidenceId]),
    /AUGUR_EVIDENCE_IMMUTABLE/,
  );
  await assert.rejects(
    pg.query("delete from augur_capacity_evidence where id = $1", [first.evidenceId]),
    /AUGUR_EVIDENCE_IMMUTABLE/,
  );
  await assert.rejects(
    pg.query("update augur_capacity_ingestion_requests set source_id = source_id"),
    /AUGUR_EVIDENCE_IMMUTABLE/,
  );
  await assert.rejects(
    pg.query("delete from augur_capacity_ingestion_requests"),
    /AUGUR_EVIDENCE_IMMUTABLE/,
  );
});

test("concurrent identical request IDs are claimed before provider I/O", async (t) => {
  const { pg, sql, artifactSha256 } = await database();
  t.after(() => pg.close());
  const requestId = randomUUID();
  let calls = 0;
  let announceEntry;
  let releaseFirst;
  const entered = new Promise((resolve) => {
    announceEntry = resolve;
  });
  const sourceGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const transport = {
    async requestJson(input) {
      calls += 1;
      announceEntry();
      await sourceGate;
      const request = JSON.parse(input.body);
      return delivery(augur, request, artifactSha256);
    },
  };
  const run = () =>
    augur.runConfiguredAugurCapacityIngestion({
      environment: ENVIRONMENT,
      userId: USER_ID,
      projectId: PROJECT_ID,
      jobId: JOB_ID,
      requestId,
      transport,
      sqlProvider: async () => sql,
      now: NOW,
    });
  const firstPromise = run();
  await entered;
  await assert.rejects(
    run(),
    (error) =>
      error?.code === "AUGUR_INGESTION_BUSY" &&
      Number.isInteger(error.retryAfterMs) &&
      error.retryAfterMs > 0,
  );
  assert.equal(calls, 1, "the competing request must be rejected before provider I/O");
  releaseFirst();
  const first = await firstPromise;
  assert.equal(first.wasInserted, true);
  const idempotent = await run();
  assert.equal(idempotent.wasInserted, false);
  assert.equal(idempotent.evidenceId, first.evidenceId);
  assert.equal(calls, 1);
  assert.equal((await pg.query("select count(*)::int as count from augur_capacity_evidence")).rows[0].count, 1);
  assert.equal((await pg.query("select count(*)::int as count from augur_capacity_ingestion_requests")).rows[0].count, 1);
});

test("fresh request IDs are throttled and identical evidence is not duplicated", async (t) => {
  const { pg, sql, artifactSha256 } = await database();
  t.after(() => pg.close());
  let calls = 0;
  const transport = {
    async requestJson(input) {
      calls += 1;
      const request = JSON.parse(input.body);
      return delivery(augur, request, artifactSha256);
    },
  };
  const run = (requestId) =>
    augur.runConfiguredAugurCapacityIngestion({
      environment: ENVIRONMENT,
      userId: USER_ID,
      projectId: PROJECT_ID,
      jobId: JOB_ID,
      requestId,
      transport,
      sqlProvider: async () => sql,
      now: NOW,
    });

  const first = await run(randomUUID());
  for (const requestId of Array.from({ length: 8 }, () => randomUUID())) {
    await assert.rejects(
      run(requestId),
      (error) =>
        error?.code === "AUGUR_INGESTION_COOLDOWN" &&
        Number.isInteger(error.retryAfterMs) &&
        error.retryAfterMs > 0,
    );
  }
  assert.equal(calls, 1, "UUID churn must not increase provider calls inside the cooldown");

  await pg.query(
    "update augur_capacity_ingestion_claims set next_allowed_at = now() - interval '1 second'",
  );
  const duplicateEvidence = await run(randomUUID());
  assert.equal(duplicateEvidence.wasInserted, false);
  assert.equal(duplicateEvidence.evidenceId, first.evidenceId);
  assert.equal(calls, 2);
  assert.equal((await pg.query("select count(*)::int as count from augur_capacity_evidence")).rows[0].count, 1);
  assert.equal((await pg.query("select count(*)::int as count from augur_capacity_ingestion_requests")).rows[0].count, 2);
});

test("Augur is NOT_RUN without configuration and rejects partial configuration before I/O", async () => {
  let sqlCalls = 0;
  let transportCalls = 0;
  const dependencies = {
    userId: USER_ID,
    projectId: PROJECT_ID,
    jobId: JOB_ID,
    requestId: randomUUID(),
    sqlProvider: async () => {
      sqlCalls += 1;
      throw new Error("SQL_MUST_NOT_RUN");
    },
    transport: {
      async requestJson() {
        transportCalls += 1;
        throw new Error("TRANSPORT_MUST_NOT_RUN");
      },
    },
    now: NOW,
  };
  const absent = await augur.runConfiguredAugurCapacityIngestion({
    ...dependencies,
    environment: {},
  });
  assert.equal(absent.status, "not_run");
  assert.equal(absent.evidence, "not_run");
  assert.equal(sqlCalls, 0);
  assert.equal(transportCalls, 0);
  await assert.rejects(
    augur.runConfiguredAugurCapacityIngestion({
      ...dependencies,
      environment: { HELIX_AUGUR_EVIDENCE_URL: ENVIRONMENT.HELIX_AUGUR_EVIDENCE_URL },
    }),
    /AUGUR_EVIDENCE_CONFIGURATION_MISSING/,
  );
  assert.equal(sqlCalls, 0);
  assert.equal(transportCalls, 0);
  assert.doesNotThrow(() => environmentModule.validateServerEnvironment(ENVIRONMENT));
  assert.throws(
    () =>
      environmentModule.validateServerEnvironment({
        HELIX_AUGUR_EVIDENCE_URL: ENVIRONMENT.HELIX_AUGUR_EVIDENCE_URL,
      }),
    /HELIX_AUGUR_EVIDENCE_/,
  );
  assert.throws(
    () =>
      environmentModule.validateServerEnvironment({
        ...ENVIRONMENT,
        HELIX_AUGUR_EVIDENCE_URL: "http://capacity.example.test/evidence",
      }),
    /HELIX_AUGUR_EVIDENCE_URL/,
  );
});

test("Augur rejects bad authentication, stale bundles and binding mismatches without mutation", async (t) => {
  for (const scenario of ["bad-hmac", "stale", "deploy-mismatch"]) {
    await t.test(scenario, async (st) => {
      const { pg, sql, artifactSha256 } = await database();
      st.after(() => pg.close());
      const transport = {
        async requestJson(input) {
          const request = JSON.parse(input.body);
          if (scenario === "stale") {
            return delivery(augur, request, artifactSha256, {
              observedAt: new Date(NOW - 24 * 60 * 60 * 1_000).toISOString(),
            });
          }
          if (scenario === "deploy-mismatch") {
            return delivery(augur, request, artifactSha256, {
              payload: {
                deployId: "wrong-deploy-id",
              },
            });
          }
          const signed = delivery(augur, request, artifactSha256);
          signed.payload.evidence.profiles.storm.metrics.stableRequestsPerSecond = 179;
          return signed;
        },
      };
      await assert.rejects(
        augur.runConfiguredAugurCapacityIngestion({
          environment: ENVIRONMENT,
          userId: USER_ID,
          projectId: PROJECT_ID,
          jobId: JOB_ID,
          requestId: randomUUID(),
          transport,
          sqlProvider: async () => sql,
          now: NOW,
        }),
        /AUGUR_EVIDENCE_(?:AUTHENTICATION_FAILED|STALE|BINDING_MISMATCH)/,
      );
      assert.equal((await pg.query("select count(*)::int as count from augur_capacity_evidence")).rows[0].count, 0);
      const payload = (await pg.query("select payload::jsonb as payload from build_jobs where id = $1", [JOB_ID])).rows[0].payload;
      assert.equal(payload.quality, undefined);
      assert.equal(payload.score, undefined);
    });
  }
});

test("Augur rejects replayed source nonces and cross-tenant binding before persistence", async (t) => {
  const { pg, sql, artifactSha256 } = await database();
  t.after(() => pg.close());
  const replayNonce = randomUUID();
  let calls = 0;
  const transport = {
    async requestJson(input) {
      calls += 1;
      const request = JSON.parse(input.body);
      return delivery(augur, request, artifactSha256);
    },
  };
  const common = {
    environment: ENVIRONMENT,
    userId: USER_ID,
    projectId: PROJECT_ID,
    jobId: JOB_ID,
    transport,
    sqlProvider: async () => sql,
    now: NOW,
    nonceFactory: () => replayNonce,
  };
  await augur.runConfiguredAugurCapacityIngestion({ ...common, requestId: randomUUID() });
  await pg.query(
    "update augur_capacity_ingestion_claims set next_allowed_at = now() - interval '1 second'",
  );
  await assert.rejects(
    augur.runConfiguredAugurCapacityIngestion({ ...common, requestId: randomUUID() }),
    /AUGUR_SOURCE_NONCE_REPLAY/,
  );
  assert.equal(calls, 2);
  assert.equal((await pg.query("select count(*)::int as count from augur_capacity_evidence")).rows[0].count, 1);

  let forbiddenTransportCalls = 0;
  await assert.rejects(
    augur.runConfiguredAugurCapacityIngestion({
      ...common,
      userId: "other-tenant",
      requestId: randomUUID(),
      transport: {
        async requestJson() {
          forbiddenTransportCalls += 1;
          throw new Error("MUST_NOT_RUN");
        },
      },
      nonceFactory: randomUUID,
    }),
    /AUGUR_DEPLOY_BINDING_NOT_FOUND/,
  );
  assert.equal(forbiddenTransportCalls, 0);
});

test("Augur bounds provider bodies before buffering them", async () => {
  await assert.rejects(
    augur.readBoundedAugurJsonResponse(
      new Response("{}", {
        headers: {
          "content-length": String(augur.MAX_AUGUR_EVIDENCE_RESPONSE_BYTES + 1),
        },
      }),
    ),
    /AUGUR_EVIDENCE_RESPONSE_TOO_LARGE/,
  );

  let reads = 0;
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      pull(controller) {
        reads += 1;
        if (reads === 1) {
          controller.enqueue(new Uint8Array(augur.MAX_AUGUR_EVIDENCE_RESPONSE_BYTES));
          return;
        }
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  await assert.rejects(
    augur.readBoundedAugurJsonResponse(response),
    /AUGUR_EVIDENCE_RESPONSE_TOO_LARGE/,
  );
  assert.equal(reads, 2);
  assert.equal(cancelled, true);
});
