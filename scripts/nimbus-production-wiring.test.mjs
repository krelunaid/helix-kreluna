import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NOW = "2026-08-20T10:00:00.000Z";
const WORKSPACE_SHA256 = "a".repeat(64);
const HMAC_SECRET = "n".repeat(48);

function serviceRequirements() {
  return {
    kind: "helix_production_requirements",
    schemaVersion: "1.0.0",
    contractPath: "docs/requirements.json",
    runtimeProfile: "service_app",
    dataModel: "server_persistent",
    dataSensitivity: "public",
    storage: "none",
    identity: "none",
    roles: [],
    serverOperations: "public",
    privilegedOperations: false,
    monitoringScope: "full_stack",
    integrations: [],
    apiOperations: [
      {
        operationId: "create_record",
        method: "POST",
        path: "/api/records",
        access: { kind: "public" },
        rateLimitRequired: true,
        idempotencyRequired: true,
      },
    ],
    rationale: "The approved public service persists rate-limited records.",
    evidencePaths: ["docs/architecture.json", "docs/prd.json"],
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
  return {
    decision: await vite.ssrLoadModule("/src/lib/server/production/nimbus-decision.ts"),
    stages: await vite.ssrLoadModule("/src/lib/server/production/stages/index.ts"),
    environment: await vite.ssrLoadModule("/src/lib/env.server.ts"),
  };
}

function candidate(id, displayName, baseMonthlyUsd) {
  return {
    id,
    displayName,
    configurationAdapter: "netlify",
    regions: ["eu-west"],
    runtimes: [
      {
        id: "node_22_serverless_functions",
        supportedUntil: "2028-08-20T10:00:00.000Z",
      },
    ],
    databaseServices: [{ id: `${id}-postgres`, kind: "postgresql" }],
    storageServices: [],
    cdnAvailable: true,
    secretStoreAvailable: true,
    quote: {
      reference: `${id}-quote-20260820`,
      observedAt: NOW,
      currency: "USD",
    },
    pricing: {
      baseMonthlyUsd,
      perMillionRequestsUsd: 2,
      perEgressGbUsd: 0.1,
      databaseBaseMonthlyUsd: 5,
      databasePerGbUsd: 1,
      storageBaseMonthlyUsd: 0,
      storagePerGbUsd: 0,
    },
  };
}

function payload(decision, requirements, overrides = {}) {
  return {
    kind: "nimbus_provider_evidence",
    version: "1.0.0",
    sourceId: "verified-provider-catalog",
    keyId: "catalog-key-v1",
    observedAt: NOW,
    candidateWorkspaceSha256: WORKSPACE_SHA256,
    productionRequirementsSha256:
      decision.nimbusProductionRequirementsSha256(requirements),
    planning: {
      decisionHorizonEndsAt: "2027-08-20T10:00:00.000Z",
      requiredRegion: "eu-west",
      usage: {
        monthlyRequests: 1_000_000,
        egressGb: 10,
        databaseStorageGb: 5,
        objectStorageGb: 0,
      },
      policy: {
        maxQuoteAgeMs: 24 * 60 * 60 * 1_000,
        costRiskBufferRatio: 0.2,
        maxMonthlyCostUsd: 200,
      },
    },
    candidates: [candidate("premium-edge", "Premium Edge", 50), candidate("value-edge", "Value Edge", 10)],
    ...overrides,
  };
}

function evidence(decision, requirements, payloadOverrides = {}) {
  return {
    envelope: decision.signNimbusDecisionEvidenceEnvelope(
      payload(decision, requirements, payloadOverrides),
      HMAC_SECRET,
    ),
    verifier: {
      expectedSourceId: "verified-provider-catalog",
      expectedKeyId: "catalog-key-v1",
      hmacSecret: HMAC_SECRET,
      maxEvidenceAgeMs: 24 * 60 * 60 * 1_000,
      now: NOW,
    },
  };
}

function input(requirements, decisionEvidence) {
  return {
    requirements,
    baseWorkspaceSha256: WORKSPACE_SHA256,
    ...(decisionEvidence ? { nimbusDecisionEvidence: decisionEvidence } : {}),
  };
}

test("Nimbus remains provider/cost neutral without verified evidence", async (t) => {
  const { stages } = await modules(t);
  const delivery = stages.generateNimbusDelivery(input(serviceRequirements()));
  assert.equal(delivery.artifact.decision.status, "not_configured");
  assert.equal(delivery.artifact.provider, null);
  assert.equal(delivery.artifact.runtime, null);
  assert.equal(delivery.artifact.configurationAdapter, null);
  assert.deepEqual(delivery.artifact.costEstimate, {
    evidence: "unavailable",
    reasonCode: "NIMBUS_DECISION_EVIDENCE_MISSING",
  });
  assert.equal(delivery.outputFiles.some((file) => file.path === "netlify.toml"), false);
  assert.equal(
    delivery.outputFiles.some((file) => file.path === "infra/netlify/functions/api.js"),
    false,
  );
  const plan = JSON.parse(
    delivery.outputFiles.find((file) => file.path === "infra/nimbus-decision.json").content,
  );
  assert.equal(plan.decision, null);
  assert.doesNotMatch(
    JSON.stringify(delivery.artifact),
    /"provider":"netlify"|"monthlyMin":|"monthlyMax":/u,
  );
});

test("fresh authenticated evidence drives the exact Production provider/runtime/region/cost", async (t) => {
  const { decision, stages } = await modules(t);
  const requirements = serviceRequirements();
  const delivery = stages.generateNimbusDelivery(
    input(requirements, evidence(decision, requirements)),
  );
  assert.equal(delivery.artifact.decision.status, "verified");
  assert.equal(delivery.artifact.decision.authentication, "hmac_sha256");
  assert.equal(delivery.artifact.provider.id, "value-edge");
  assert.equal(delivery.artifact.provider.region, "eu-west");
  assert.equal(delivery.artifact.runtime.id, "node_22_serverless_functions");
  assert.equal(delivery.artifact.configurationAdapter, "netlify");
  assert.equal(delivery.artifact.costEstimate.evidence, "authenticated_provider_quote");
  assert.equal(delivery.artifact.costEstimate.monthlyMin, 23);
  assert.equal(delivery.artifact.costEstimate.monthlyMax, 27.6);
  assert.ok(delivery.outputFiles.some((file) => file.path === "netlify.toml"));
  assert.ok(
    delivery.outputFiles.some((file) => file.path === "infra/netlify/functions/api.js"),
  );
  assert.equal(delivery.artifact.activation, "source_configured");
  assert.deepEqual(delivery.artifact.activationEvidence, {
    status: "not_verified",
    evidence: "not_run",
    automaticDeployment: false,
    reasonCode: "PROVIDER_ACTIVATION_NOT_RUN",
  });
  assert.deepEqual(delivery.artifact.runtimeSourcePaths, [
    "server/runtime/authorization.js",
    "server/runtime/composition.js",
    "server/runtime/environment.js",
    "server/runtime/operations.js",
    "server/runtime/postgres.js",
  ]);
  assert.equal(delivery.artifact.decision.automaticProvisioning, false);
  assert.equal(delivery.artifact.decision.automaticDeployment, false);
  assert.doesNotMatch(JSON.stringify(delivery), new RegExp(HMAC_SECRET));
  assert.doesNotMatch(JSON.stringify(delivery), /"signature"/u);
});

test("tampered, stale, and candidate-mismatched evidence all fail closed", async (t) => {
  const { decision, stages } = await modules(t);
  const requirements = serviceRequirements();
  const valid = evidence(decision, requirements);
  const tampered = structuredClone(valid);
  tampered.envelope.payload.candidates[1].pricing.baseMonthlyUsd = 0;
  const stale = evidence(decision, requirements, {
    observedAt: "2026-08-18T10:00:00.000Z",
    candidates: [
      {
        ...candidate("value-edge", "Value Edge", 10),
        quote: {
          reference: "value-edge-old-quote",
          observedAt: "2026-08-18T10:00:00.000Z",
          currency: "USD",
        },
      },
    ],
  });
  const mismatch = evidence(decision, requirements, {
    candidateWorkspaceSha256: "b".repeat(64),
  });
  for (const [attempt, reasonCode] of [
    [tampered, "NIMBUS_DECISION_AUTHENTICATION_FAILED"],
    [stale, "NIMBUS_DECISION_EVIDENCE_STALE"],
    [mismatch, "NIMBUS_DECISION_CANDIDATE_MISMATCH"],
  ]) {
    const delivery = stages.generateNimbusDelivery(input(requirements, attempt));
    assert.equal(delivery.artifact.decision.status, "not_configured");
    assert.equal(delivery.artifact.decision.reasonCode, reasonCode);
    assert.equal(delivery.artifact.provider, null);
    assert.equal(delivery.artifact.runtime, null);
    assert.equal(delivery.artifact.costEstimate.evidence, "unavailable");
    assert.equal(delivery.outputFiles.some((file) => file.path === "netlify.toml"), false);
  }
});

test("Nimbus authenticated source adapter is a contract boundary, not provider proof", async (t) => {
  const { decision } = await modules(t);
  const requirements = serviceRequirements();
  const requests = [];
  const provider = decision.createAuthenticatedNimbusEvidenceProvider(
    {
      url: "https://catalog.example.test/v1/evidence",
      bearerToken: "t".repeat(48),
      expectedSourceId: "verified-provider-catalog",
      expectedKeyId: "catalog-key-v1",
      hmacSecret: HMAC_SECRET,
      maxEvidenceAgeMs: 24 * 60 * 60 * 1_000,
      requestTimeoutMs: 5_000,
    },
    {
      async requestJson(request) {
        requests.push(request);
        const body = JSON.parse(request.body);
        return decision.signNimbusDecisionEvidenceEnvelope(
          payload(decision, requirements, {
            observedAt: new Date().toISOString(),
            candidateWorkspaceSha256: body.candidateWorkspaceSha256,
            productionRequirementsSha256: body.productionRequirementsSha256,
            planning: {
              ...payload(decision, requirements).planning,
              decisionHorizonEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000).toISOString(),
            },
            candidates: [
              {
                ...candidate("value-edge", "Value Edge", 10),
                quote: {
                  reference: "live-contract-quote",
                  observedAt: new Date().toISOString(),
                  currency: "USD",
                },
                runtimes: [
                  {
                    id: "node_22_serverless_functions",
                    supportedUntil: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1_000).toISOString(),
                  },
                ],
              },
            ],
          }),
          HMAC_SECRET,
        );
      },
    },
  );
  const provided = await provider({
    productionRequirements: requirements,
    baseWorkspaceSha256: WORKSPACE_SHA256,
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers.authorization, `Bearer ${"t".repeat(48)}`);
  assert.equal(requests[0].headers["x-helix-nimbus-source"], "verified-provider-catalog");
  assert.doesNotMatch(requests[0].body, new RegExp(HMAC_SECRET));
  const verified = decision.resolveVerifiedNimbusStageDecision({
    productionRequirements: requirements,
    baseWorkspaceSha256: WORKSPACE_SHA256,
    evidence: provided,
  });
  assert.equal(verified.decision.provider.id, "value-edge");
  assert.equal(verified.automaticProvisioning, false);
  assert.equal(verified.automaticDeployment, false);
  assert.equal(decision.configuredNimbusEvidenceProvider({}), undefined);
  assert.throws(
    () =>
      decision.configuredNimbusEvidenceProvider({
        HELIX_NIMBUS_EVIDENCE_URL: "https://catalog.example.test/v1/evidence",
      }),
    /NIMBUS_EVIDENCE_CONFIGURATION_MISSING/,
  );
});

test("server environment validates Warden and Nimbus configuration as complete groups", async (t) => {
  const { environment } = await modules(t);
  const wardenPolicy = JSON.stringify({
    maxEvidenceAgeMs: 900_000,
    maxErrorsPerMinute: 5,
    minUptimeRatio: 0.999,
    maxP95LatencyMs: 500,
    maxHighOrCriticalVulnerabilities: 0,
    minDeployHealthyRatio: 1,
    maxMonthToDateCostUsd: 100,
    supportWindowWarningDays: 90,
    requireKnownSupportWindows: true,
  });
  const valid = {
    HELIX_WARDEN_ENABLED: "true",
    HELIX_WARDEN_ADAPTER_ID: "primary-monitor",
    HELIX_WARDEN_SOURCE_ID: "monitoring-provider:tenant",
    HELIX_WARDEN_SOURCE_URL: "https://monitor.example.test/v1/",
    HELIX_WARDEN_SOURCE_TOKEN: "w".repeat(48),
    HELIX_WARDEN_POLICY_JSON: wardenPolicy,
    HELIX_WARDEN_ALERT_DEDUP_TTL_MS: "3600000",
    HELIX_WARDEN_DISPATCH_SECRET: "d".repeat(48),
    COMMIT_REF: "commit-a194ffc",
    HELIX_NIMBUS_EVIDENCE_URL: "https://catalog.example.test/v1/evidence",
    HELIX_NIMBUS_EVIDENCE_TOKEN: "t".repeat(48),
    HELIX_NIMBUS_EVIDENCE_SOURCE_ID: "verified-provider-catalog",
    HELIX_NIMBUS_EVIDENCE_KEY_ID: "catalog-key-v1",
    HELIX_NIMBUS_EVIDENCE_HMAC_SECRET: HMAC_SECRET,
    HELIX_NIMBUS_EVIDENCE_MAX_AGE_MS: "86400000",
  };
  assert.doesNotThrow(() => environment.validateServerEnvironment(valid));
  assert.throws(
    () =>
      environment.validateServerEnvironment({
        ...valid,
        HELIX_WARDEN_SOURCE_TOKEN: undefined,
      }),
    /HELIX_WARDEN_SOURCE_TOKEN/,
  );
  assert.throws(
    () =>
      environment.validateServerEnvironment({
        HELIX_NIMBUS_EVIDENCE_URL: valid.HELIX_NIMBUS_EVIDENCE_URL,
      }),
    /HELIX_NIMBUS_EVIDENCE_/,
  );
});
