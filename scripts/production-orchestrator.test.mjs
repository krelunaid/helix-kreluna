import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer as createViteServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SHA256_EMPTY =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const NIMBUS_ENVIRONMENT_NAMES = [
  "HELIX_NIMBUS_EVIDENCE_URL",
  "HELIX_NIMBUS_EVIDENCE_TOKEN",
  "HELIX_NIMBUS_EVIDENCE_SOURCE_ID",
  "HELIX_NIMBUS_EVIDENCE_KEY_ID",
  "HELIX_NIMBUS_EVIDENCE_HMAC_SECRET",
  "HELIX_NIMBUS_EVIDENCE_MAX_AGE_MS",
];
const NIMBUS_TOKEN = "controlled-nimbus-bearer-token-never-persisted";
const NIMBUS_HMAC_SECRET = "controlled-nimbus-hmac-secret-never-persisted";
const NIMBUS_ENVIRONMENT = {
  HELIX_NIMBUS_EVIDENCE_URL: "https://catalog.example.test/v1/evidence",
  HELIX_NIMBUS_EVIDENCE_TOKEN: NIMBUS_TOKEN,
  HELIX_NIMBUS_EVIDENCE_SOURCE_ID: "controlled-provider-catalog",
  HELIX_NIMBUS_EVIDENCE_KEY_ID: "controlled-catalog-key",
  HELIX_NIMBUS_EVIDENCE_HMAC_SECRET: NIMBUS_HMAC_SECRET,
  HELIX_NIMBUS_EVIDENCE_MAX_AGE_MS: String(24 * 60 * 60 * 1_000),
};

function hmac(secret, source) {
  return createHmac("sha256", secret).update(source).digest("hex");
}

function approvedPlan() {
  return {
    title: "Museum guide",
    type: "site",
    pitch: "A public guide to the approved museum collection.",
    target: "Museum visitors",
    problem: "Collection information is difficult to navigate.",
    useCases: ["Read collection information."],
    mvp: ["Publish the approved collection guide."],
    scope: { p0: ["Collection guide"], p1: [], p2: [] },
    nonGoals: ["Accounts and payments"],
    userJourneys: ["Open the guide and read an exhibit description."],
    acceptanceCriteria: ["Every approved exhibit has a readable description."],
    screens: [{ name: "Guide", purpose: "Browse collection information" }],
    features: ["Collection guide"],
    data: [],
    success: "Visitors can read the guide.",
  };
}

function approvedArchitecture() {
  return {
    productType: "Public information site",
    frontendArchitecture: "Static browser modules with bundled read-only content.",
    backendArchitecture: "No backend is required by the approved journeys.",
    dataFlow: ["Bundled content -> browser rendering"],
    screenMap: ["Guide: approved collection information"],
    routeMap: ["/: collection guide"],
    apiContracts: [],
    databaseRequirements: "No server-persistent database is required.",
    authModel: "No identity capability is required.",
    permissions: [],
    integrations: [],
    deploymentTarget: "Netlify web runtime",
    failureModes: ["Missing bundled content blocks the build."],
  };
}

function controlledDirection(id, accent, layout, overrides = {}) {
  return {
    id,
    name: `${id} direction`,
    mood: "Calm product focus",
    palette: {
      bg: "#08120d",
      fg: "#f8f4df",
      accent,
      muted: "#99a38f",
      elevated: "#132219",
    },
    fonts: { display: "Fraunces", body: "Source Sans 3" },
    layout,
    density: "Airy",
    grid: "Twelve-column grid",
    motion: "Measured reveals",
    iconography: "Hairline symbols",
    componentGeometry: "Sharp ruled cards",
    imagery: "Cropped collection plates",
    references: ["Archival collection guides"],
    forbiddenCliches: ["Generic glass dashboard"],
    ...overrides,
  };
}

function controlledProductionCompletion(system) {
  if (system.includes("You are Lumen")) {
    return JSON.stringify({
      directions: [
        controlledDirection("ledger", "#f2b134", "Asymmetric editorial ledger"),
        controlledDirection("matrix", "#22c55e", "Dense operational matrix", {
          fonts: { display: "IBM Plex Mono", body: "Atkinson Hyperlegible" },
          density: "Compressed",
          grid: "Sixteen-column grid",
          componentGeometry: "Squared compact controls",
        }),
        controlledDirection("gallery", "#b42318", "Full-canvas collection gallery", {
          fonts: { display: "Bodoni Moda", body: "Work Sans" },
          density: "Spacious",
          grid: "Radial anchor grid",
          componentGeometry: "Arched panels",
        }),
      ],
    });
  }
  if (system.includes("Forge Structure/UI")) {
    return `<!doctype html><html lang="en"><head><title>Museum collection guide</title><style>body{font-family:serif}button{min-height:44px}</style></head><body><main><h1>Museum collection guide</h1><h2>Approved exhibits</h2><p>${"Collection-specific interface evidence. ".repeat(20)}</p><button id="exhibit-filter" data-action="exhibit-filter">Filter exhibits</button></main></body></html>`;
  }
  if (system.includes("Forge Logic")) {
    return `<!doctype html><html lang="en"><head><title>Museum collection guide</title><style>body{font-family:serif}button{min-height:44px}</style></head><body><main><h1>Museum collection guide</h1><h2 id="exhibit-state">Approved exhibits</h2><p>${"Collection-specific interaction evidence. ".repeat(20)}</p><button id="exhibit-filter" data-action="exhibit-filter">Filter exhibits</button></main><script>document.querySelector("#exhibit-filter").addEventListener("click",()=>{document.querySelector("#exhibit-state").textContent="Filtered exhibits";});</script></body></html>`;
  }
  throw new Error("UNEXPECTED_PRODUCTION_MODEL_PHASE");
}

function controlledNimbusEnvelope(decision, request) {
  const observedAt = new Date().toISOString();
  return decision.signNimbusDecisionEvidenceEnvelope(
    {
      kind: "nimbus_provider_evidence",
      version: "1.0.0",
      sourceId: NIMBUS_ENVIRONMENT.HELIX_NIMBUS_EVIDENCE_SOURCE_ID,
      keyId: NIMBUS_ENVIRONMENT.HELIX_NIMBUS_EVIDENCE_KEY_ID,
      observedAt,
      candidateWorkspaceSha256: request.candidateWorkspaceSha256,
      productionRequirementsSha256: request.productionRequirementsSha256,
      planning: {
        decisionHorizonEndsAt: new Date(
          Date.now() + 365 * 24 * 60 * 60 * 1_000,
        ).toISOString(),
        requiredRegion: "eu-west",
        usage: {
          monthlyRequests: 100_000,
          egressGb: 5,
          databaseStorageGb: 0,
          objectStorageGb: 0,
        },
        policy: {
          maxQuoteAgeMs: 24 * 60 * 60 * 1_000,
          costRiskBufferRatio: 0.2,
          maxMonthlyCostUsd: 200,
        },
      },
      candidates: [
        {
          id: "controlled-static-edge",
          displayName: "Controlled Static Edge",
          configurationAdapter: "netlify",
          regions: ["eu-west"],
          runtimes: [
            {
              id: "static_web_delivery",
              supportedUntil: new Date(
                Date.now() + 2 * 365 * 24 * 60 * 60 * 1_000,
              ).toISOString(),
            },
          ],
          databaseServices: [],
          storageServices: [],
          cdnAvailable: true,
          secretStoreAvailable: true,
          quote: {
            reference: "controlled-static-quote",
            observedAt,
            currency: "USD",
          },
          pricing: {
            baseMonthlyUsd: 5,
            perMillionRequestsUsd: 1,
            perEgressGbUsd: 0.1,
            databaseBaseMonthlyUsd: 0,
            databasePerGbUsd: 0,
            storageBaseMonthlyUsd: 0,
            storagePerGbUsd: 0,
          },
        },
      ],
    },
    NIMBUS_HMAC_SECRET,
  );
}

async function startSignedRunner(secret) {
  const server = createHttpServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const requestBody = Buffer.concat(chunks).toString("utf8");
    const timestamp = request.headers["x-helix-runner-timestamp"];
    const nonce = request.headers["x-helix-runner-nonce"];
    const signature = request.headers["x-helix-runner-signature"];
    assert.equal(signature, hmac(secret, `${timestamp}\n${nonce}\n${requestBody}`));
    const input = JSON.parse(requestBody);
    assert.equal(input.candidate.sourceSha256, input.candidate.sourceSha256);
    const startedAt = new Date().toISOString();
    const report = {
      kind: "helix_workspace_validation_report",
      schemaVersion: "1.1.0",
      requestNonce: input.requestNonce,
      candidateSha256: input.candidate.sourceSha256,
      runner: {
        provider: "local-signed-contract-fixture",
        isolation: "container",
        sandboxIdSha256: "a".repeat(64),
        destroyed: true,
        networkDefault: "disabled",
      },
      startedAt,
      completedAt: startedAt,
      durationMs: 0,
      steps: input.steps.map((id) => ({
        id,
        status: "passed",
        evidence: "measured",
        tool:
          id === "security"
            ? "npm audit --omit=dev --audit-level=high"
            : `contract-fixture-${id}`,
        exitCode: 0,
        startedAt,
        completedAt: startedAt,
        durationMs: 0,
        networkPolicy:
          id === "install" || id === "security" ? "package_registry_only" : "disabled",
        stdoutSha256: SHA256_EMPTY,
        stderrSha256: SHA256_EMPTY,
        outputTruncated: false,
        detail: `${id} completed in the isolated contract fixture`,
      })),
    };
    const body = JSON.stringify(report);
    response.writeHead(200, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
      "x-helix-runner-signature": hmac(secret, `${input.requestNonce}\n${body}`),
    });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/validate`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

test("Production orchestration persists an immutable candidate before fail-closed validation", async (t) => {
  const priorUrl = process.env.HELIX_WORKSPACE_RUNNER_URL;
  const priorSecret = process.env.HELIX_WORKSPACE_RUNNER_SECRET;
  const priorKey = process.env.XAI_API_KEY;
  const priorFetch = globalThis.fetch;
  const priorNimbusEnvironment = Object.fromEntries(
    NIMBUS_ENVIRONMENT_NAMES.map((name) => [name, process.env[name]]),
  );
  let nimbusDecision;
  const nimbusRequests = [];
  process.env.XAI_API_KEY = [
    "controlled",
    "production",
    "orchestrator",
    "test",
    "key",
  ].join("-");
  Object.assign(process.env, NIMBUS_ENVIRONMENT);
  globalThis.fetch = async (url, init) => {
    if (String(url) === NIMBUS_ENVIRONMENT.HELIX_NIMBUS_EVIDENCE_URL) {
      assert.ok(nimbusDecision, "Nimbus decision module must be loaded before assembly");
      assert.equal(init?.headers?.authorization, `Bearer ${NIMBUS_TOKEN}`);
      const body = String(init?.body ?? "{}");
      assert.doesNotMatch(body, new RegExp(NIMBUS_TOKEN));
      assert.doesNotMatch(body, new RegExp(NIMBUS_HMAC_SECRET));
      const request = JSON.parse(body);
      nimbusRequests.push(request);
      return new Response(
        JSON.stringify(controlledNimbusEnvelope(nimbusDecision, request)),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (String(url) !== "https://api.x.ai/v1/chat/completions") {
      return priorFetch(url, init);
    }
    const request = JSON.parse(String(init?.body ?? "{}"));
    const system = String(request.messages?.[0]?.content ?? "");
    return new Response(
      JSON.stringify({
        id: `controlled-${crypto.randomUUID()}`,
        model: request.model,
        choices: [{ message: { content: controlledProductionCompletion(system) } }],
        usage: {
          prompt_tokens: 30,
          completion_tokens: 20,
          total_tokens: 50,
          prompt_tokens_details: { cached_tokens: 0 },
          cost_in_usd_ticks: "1000",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const vite = await createViteServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(async () => {
    if (priorUrl === undefined) delete process.env.HELIX_WORKSPACE_RUNNER_URL;
    else process.env.HELIX_WORKSPACE_RUNNER_URL = priorUrl;
    if (priorSecret === undefined) delete process.env.HELIX_WORKSPACE_RUNNER_SECRET;
    else process.env.HELIX_WORKSPACE_RUNNER_SECRET = priorSecret;
    if (priorKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = priorKey;
    for (const name of NIMBUS_ENVIRONMENT_NAMES) {
      const value = priorNimbusEnvironment[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    globalThis.fetch = priorFetch;
    await vite.close();
  });
  const [orchestrator, adapter, release, quality, twinModule, browserModule, workspace, create, queue, worker, db, loadedNimbusDecision] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/orchestrator/production.ts"),
    vite.ssrLoadModule("/src/lib/server/workspace-runner.ts"),
    vite.ssrLoadModule("/src/lib/server/release/production-workspace.ts"),
    vite.ssrLoadModule("/src/lib/server/quality/production-workspace.ts"),
    vite.ssrLoadModule("/src/lib/server/twin.ts"),
    vite.ssrLoadModule("/src/lib/server/quality/browser.ts"),
    vite.ssrLoadModule("/src/lib/workspace.ts"),
    vite.ssrLoadModule("/src/lib/server/jobs/create.ts"),
    vite.ssrLoadModule("/src/lib/server/jobs/queue.ts"),
    vite.ssrLoadModule("/src/lib/server/jobs/worker.ts"),
    vite.ssrLoadModule("/src/lib/db.ts"),
    vite.ssrLoadModule("/src/lib/server/production/nimbus-decision.ts"),
  ]);
  nimbusDecision = loadedNimbusDecision;
  const pg = await db.getPglite();
  t.after(() => pg.close());

  assert.deepEqual(
    orchestrator.configuredProductionEnvironmentNames(
      { ".env.example": "DATABASE_URL=\nSTRIPE_SECRET_KEY=\n" },
      {
        DATABASE_URL: "postgres://placeholder",
        STRIPE_SECRET_KEY: "",
        UNAPPROVED_SECRET: "must-not-appear",
      },
    ),
    ["DATABASE_URL"],
  );

  const job = {
    id: "production-orchestrator-job",
    projectId: "production-orchestrator-project",
    locale: "en",
    createdAt: Date.now(),
    checkpoint: {
      pipelineVersion: "helix-v2",
      requestFingerprint: "b".repeat(64),
      stage: "architected",
      artifacts: { plan: approvedPlan(), architecture: approvedArchitecture() },
    },
  };
  const prepared = await orchestrator.prepareProductionWorkspace({
    job,
    plan: approvedPlan(),
    architecture: approvedArchitecture(),
    prompt: "A public information site for a local museum, without accounts or payments",
    environment: {
      UNAPPROVED_SECRET: "must-not-appear",
      ...NIMBUS_ENVIRONMENT,
    },
  });
  assert.equal(
    (await workspace.verifyProductionWorkspaceCandidate(prepared.files, prepared.candidate)).valid,
    true,
  );
  assert.ok(prepared.files["docs/artifacts/provenance.json"]);
  assert.ok(prepared.files["netlify.toml"]);
  assert.equal(prepared.graph.artifacts.nimbus.decision.status, "verified");
  assert.deepEqual(prepared.graph.configuration.configuredEnvNames, []);
  assert.equal(JSON.stringify(prepared.graph).includes("must-not-appear"), false);
  assert.doesNotMatch(JSON.stringify(prepared), new RegExp(NIMBUS_TOKEN));
  assert.doesNotMatch(JSON.stringify(prepared), new RegExp(NIMBUS_HMAC_SECRET));
  assert.equal(nimbusRequests.length, 1);

  delete process.env.HELIX_WORKSPACE_RUNNER_URL;
  delete process.env.HELIX_WORKSPACE_RUNNER_SECRET;
  await assert.rejects(
    adapter.runProductionWorkspaceValidation(prepared),
    (error) => error?.code === "WORKSPACE_RUNNER_UNCONFIGURED",
  );

  const secret = "S".repeat(64);
  const runner = await startSignedRunner(secret);
  t.after(() => runner.close());
  process.env.HELIX_WORKSPACE_RUNNER_URL = runner.url;
  process.env.HELIX_WORKSPACE_RUNNER_SECRET = secret;
  const validation = await adapter.runProductionWorkspaceValidation(prepared);
  const buildJob = {
    ...job,
    prompt: "A public information site for a local museum, without accounts or payments",
    mode: "generate",
    buildLevel: "production",
    currentHtml: null,
    status: "running",
    steps: [],
    html: null,
    usedAi: true,
    title: approvedPlan().title,
    files: prepared.files,
    production: { candidate: prepared.candidate, graph: prepared.graph },
  };
  const preview = release.createProductionInlinePreview(
    buildJob.files,
    prepared.entrypoint,
    prepared.candidate.sourceSha256,
  );
  const [twin, browserQuality] = await Promise.all([
    twinModule.createTwinNotRunReport(preview),
    browserModule.createBrowserQualityNotRun({ html: preview }),
  ]);
  buildJob.quality = { twin, ...browserQuality };
  const qualityReport = await quality.runProductionWorkspaceQualityPass({
    files: buildJob.files,
    candidate: prepared.candidate,
    previewHtml: preview,
    runnerReport: validation.report,
    runtimeProfile: prepared.graph.requirements.runtimeProfile,
    browserQuality: buildJob.quality,
    brief: buildJob.prompt,
    acceptanceCriteria: approvedPlan().acceptanceCriteria,
  });
  await release.sealProductionBuildJobWorkspace({
    job: buildJob,
    graph: prepared.graph,
    validation,
    quality: {
      report: qualityReport,
      reportSha256: await quality.productionWorkspaceQualityReportSha256(qualityReport),
    },
  });
  const serializedBuildJob = queue.serializeBuildJob(buildJob);
  assert.doesNotMatch(serializedBuildJob, new RegExp(NIMBUS_TOKEN));
  assert.doesNotMatch(serializedBuildJob, new RegExp(NIMBUS_HMAC_SECRET));
  assert.equal(buildJob.workspace.buildLevel, "production");
  assert.equal(
    buildJob.workspace.validations.every(
      (item) => item.status === "passed" && item.evidence === "measured",
    ),
    true,
  );
  assert.deepEqual(
    Object.fromEntries(buildJob.workspace.capabilities.map((item) => [item.id, item.status])),
    {
      api: "not_required",
      auth: "not_required",
      backend: "not_required",
      database: "not_required",
      deployment: "implemented",
      frontend: "implemented",
      integrations: "not_required",
      monitoring: "implemented",
      tests: "implemented",
    },
  );
  assert.match(buildJob.production.runnerReportSha256, /^[0-9a-f]{64}$/u);
  assert.equal(buildJob.production.qualityReport.passed, true);
  assert.match(buildJob.production.qualityReportSha256, /^[0-9a-f]{64}$/u);
  assert.equal(buildJob.liveUrl, undefined);
  assert.equal(buildJob.stores, undefined);
  assert.equal(
    (await workspace.verifyWorkspace(buildJob.files, buildJob.workspace)).valid,
    true,
  );

  const legacy = await create.createBuildJobDraft({
    prompt: "A public information site for a local museum, without accounts or payments",
    locale: "en",
    mode: "generate",
    buildLevel: "production",
    currentHtml: null,
  });
  const legacyHtml = `<!doctype html><html lang="en"><head><title>Legacy output</title></head><body><main>${"unvalidated ".repeat(60)}</main></body></html>`;
  legacy.job.html = legacyHtml;
  legacy.job.usedAi = true;
  legacy.job.files = { "legacy-v2.txt": "must be rebuilt, not trusted" };
  legacy.job.workspace = { kind: "untrusted-v2-workspace" };
  legacy.job.production = { legacy: true };
  legacy.job.liveUrl = "https://untrusted.invalid";
  legacy.job.stores = {
    appStore: "untrusted",
    play: "untrusted",
    testersUrl: "https://untrusted.invalid/test",
    testersCode: "UNTRUSTED",
  };
  legacy.job.gems = [
    { id: "bramble", name: "Bramble", did: "Preserved Production v2 gem" },
  ];
  legacy.job.checkpoint = {
    pipelineVersion: "helix-v2",
    requestFingerprint: legacy.requestFingerprint,
    stage: "production_validated",
    artifacts: {
      plan: approvedPlan(),
      architecture: approvedArchitecture(),
      html: legacyHtml,
      usedAi: true,
    },
    gemIndex: 1,
  };
  await queue.enqueueBuildJob({
    job: legacy.job,
    idempotencyKey: `production-v2-resume:${crypto.randomUUID()}`,
    requestFingerprint: legacy.requestFingerprint,
    maxAttempts: 1,
  });

  assert.equal(await worker.processBuildJob(legacy.job.id), "completed");
  const resumedProduction = await queue.loadBuildJob(legacy.job.id);
  assert.equal(resumedProduction.status, "ready");
  assert.equal(resumedProduction.queue.status, "awaiting_human_approval");
  assert.equal(resumedProduction.checkpoint.pipelineVersion, "helix-v3");
  assert.equal(resumedProduction.checkpoint.requestFingerprint, legacy.requestFingerprint);
  assert.equal(resumedProduction.checkpoint.stage, "production_finalized");
  assert.equal(resumedProduction.checkpoint.gemIndex, 1);
  assert.deepEqual(resumedProduction.checkpoint.artifacts.plan, approvedPlan());
  assert.deepEqual(
    resumedProduction.checkpoint.artifacts.architecture,
    approvedArchitecture(),
  );
  assert.deepEqual(resumedProduction.gems, legacy.job.gems);
  assert.equal(resumedProduction.files["legacy-v2.txt"], undefined);
  assert.equal(resumedProduction.workspace.buildLevel, "production");
  assert.equal(resumedProduction.production.candidate.kind, "helix_workspace_candidate");
  assert.notEqual(resumedProduction.html, legacyHtml);
  assert.equal(resumedProduction.liveUrl, undefined);
  assert.equal(resumedProduction.stores, undefined);
  const serializedResumedProduction = queue.serializeBuildJob(resumedProduction);
  assert.doesNotMatch(serializedResumedProduction, new RegExp(NIMBUS_TOKEN));
  assert.doesNotMatch(serializedResumedProduction, new RegExp(NIMBUS_HMAC_SECRET));
  assert.equal(
    (await workspace.verifyWorkspace(resumedProduction.files, resumedProduction.workspace)).valid,
    true,
  );
});
