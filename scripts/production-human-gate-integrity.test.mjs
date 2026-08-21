import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HUMAN_GATE_MODULE = "/src/lib/server/review/human-gate.ts";
const SHA256_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const NIMBUS_HMAC_SECRET = "controlled-human-gate-nimbus-secret-never-persisted";

function exposeHumanGateInternals() {
  return {
    name: "production-human-gate-test-internals",
    enforce: "pre",
    transform(source, id) {
      const filename = id.split("?", 1)[0].replaceAll("\\", "/");
      if (!filename.endsWith(HUMAN_GATE_MODULE)) return null;
      return {
        code: `${source}\nexport { decideOwnedJob as __testDecideOwnedJob };\n`,
        map: null,
      };
    },
  };
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

function controlledNimbusEvidenceProvider(decision) {
  return async ({ productionRequirements, baseWorkspaceSha256 }) => {
    const observedAt = new Date().toISOString();
    const envelope = decision.signNimbusDecisionEvidenceEnvelope(
      {
        kind: "nimbus_provider_evidence",
        version: "1.0.0",
        sourceId: "controlled-human-gate-catalog",
        keyId: "controlled-human-gate-key",
        observedAt,
        candidateWorkspaceSha256: baseWorkspaceSha256,
        productionRequirementsSha256:
          decision.nimbusProductionRequirementsSha256(productionRequirements),
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
              reference: "controlled-human-gate-static-quote",
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
    return {
      envelope,
      verifier: {
        expectedSourceId: "controlled-human-gate-catalog",
        expectedKeyId: "controlled-human-gate-key",
        hmacSecret: NIMBUS_HMAC_SECRET,
        maxEvidenceAgeMs: 24 * 60 * 60 * 1_000,
        now: new Date().toISOString(),
      },
    };
  };
}

function runnerValidation(candidate) {
  const completedAt = new Date().toISOString();
  const report = {
    kind: "helix_workspace_validation_report",
    schemaVersion: "1.1.0",
    requestNonce: crypto.randomUUID(),
    candidateSha256: candidate.sourceSha256,
    runner: {
      provider: "schema-valid-local-contract-fixture",
      isolation: "container",
      sandboxIdSha256: "a".repeat(64),
      destroyed: true,
      networkDefault: "disabled",
    },
    startedAt: completedAt,
    completedAt,
    durationMs: 0,
    steps: ["install", "typecheck", "lint", "test", "build", "security"].map((id) => ({
      id,
      status: "passed",
      evidence: "measured",
      tool:
        id === "security"
          ? "npm audit --omit=dev --audit-level=high"
          : `local-contract-${id}`,
      exitCode: 0,
      startedAt: completedAt,
      completedAt,
      durationMs: 0,
      networkPolicy: id === "install" || id === "security" ? "package_registry_only" : "disabled",
      stdoutSha256: SHA256_EMPTY,
      stderrSha256: SHA256_EMPTY,
      outputTruncated: false,
      detail: `${id} passed in the bounded local contract fixture`,
    })),
  };
  return { candidate, report, validations: [] };
}

function validPrototypeHtml(label) {
  const copy = `${label} remains a bounded Prototype release candidate. `.repeat(14);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${label}</title></head><body><main><h1>${label}</h1><p>${copy}</p></main></body></html>`;
}

function flipHash(value) {
  return `${value[0] === "0" ? "1" : "0"}${value.slice(1)}`;
}

function humanGateArtifactError(gate) {
  return (error) =>
    error instanceof gate.HumanGateError &&
    error.code === "HUMAN_GATE_ARTIFACT_NOT_SEALED" &&
    error.status === 409;
}

async function createProject(pg, { projectId, userId }) {
  await pg.query(
    `insert into projects (
       id, user_id, title, prompt, kind, status, html, messages
     ) values ($1, $2, 'Production gate project', 'Build a gated candidate',
               'web', 'building', null, '[]')`,
    [projectId, userId],
  );
}

test("Production evidence stays hash-bound through queue promotion and the Human Gate", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    plugins: [exposeHumanGateInternals()],
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  const [orchestrator, release, quality, twinModule, browserModule, queue, gate, patch, pipeline, db, nimbusDecision] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/orchestrator/production.ts"),
    vite.ssrLoadModule("/src/lib/server/release/production-workspace.ts"),
    vite.ssrLoadModule("/src/lib/server/quality/production-workspace.ts"),
    vite.ssrLoadModule("/src/lib/server/twin.ts"),
    vite.ssrLoadModule("/src/lib/server/quality/browser.ts"),
    vite.ssrLoadModule("/src/lib/server/jobs/queue.ts"),
    vite.ssrLoadModule(HUMAN_GATE_MODULE),
    vite.ssrLoadModule("/src/lib/server/agents/patch.ts"),
    vite.ssrLoadModule("/src/lib/server/jobs/pipeline.ts"),
    vite.ssrLoadModule("/src/lib/db.ts"),
    vite.ssrLoadModule("/src/lib/server/production/nimbus-decision.ts"),
  ]);
  const pg = await db.getPglite();
  t.after(async () => {
    await vite.close();
    await pg.close();
  });

  const userId = `production-gate-user-${crypto.randomUUID()}`;
  const projectId = `production-gate-project-${crypto.randomUUID()}`;
  const jobId = `production-gate-job-${crypto.randomUUID()}`;
  const workerId = `production-gate-worker-${crypto.randomUUID()}`;
  const requestFingerprint = await patch.sha256Hex(`request:${jobId}`);
  const job = {
    id: jobId,
    projectId,
    userId,
    prompt: "A public information site for a museum, without accounts or payments",
    locale: "en",
    mode: "generate",
    buildLevel: "production",
    currentHtml: null,
    status: "running",
    steps: [],
    html: null,
    usedAi: true,
    title: approvedPlan().title,
    createdAt: Date.now(),
    requestFingerprint,
    checkpoint: {
      pipelineVersion: pipeline.HELIX_PIPELINE_VERSION,
      requestFingerprint,
      stage: "production_validated",
      artifacts: { plan: approvedPlan(), architecture: approvedArchitecture() },
    },
  };
  const prepared = await orchestrator.prepareProductionWorkspace({
    job,
    plan: approvedPlan(),
    architecture: approvedArchitecture(),
    prompt: job.prompt,
    environment: {},
    nimbusDecisionEvidenceProvider: controlledNimbusEvidenceProvider(nimbusDecision),
  });
  job.files = prepared.files;
  const validation = runnerValidation(prepared.candidate);
  const preview = release.createProductionInlinePreview(
    job.files,
    prepared.entrypoint,
    prepared.candidate.sourceSha256,
  );
  const [twin, browserQuality] = await Promise.all([
    twinModule.createTwinNotRunReport(preview),
    browserModule.createBrowserQualityNotRun({ html: preview }),
  ]);
  job.quality = { twin, ...browserQuality };
  const qualityReport = await quality.runProductionWorkspaceQualityPass({
    files: job.files,
    candidate: prepared.candidate,
    previewHtml: preview,
    runnerReport: validation.report,
    runtimeProfile: prepared.graph.requirements.runtimeProfile,
    browserQuality: job.quality,
    brief: job.prompt,
    acceptanceCriteria: approvedPlan().acceptanceCriteria,
  });
  await release.sealProductionBuildJobWorkspace({
    job,
    graph: prepared.graph,
    validation,
    quality: {
      report: qualityReport,
      reportSha256: await quality.productionWorkspaceQualityReportSha256(qualityReport),
    },
  });
  job.html = preview;
  job.currentHtml = job.html;
  job.checkpoint.stage = "production_finalized";
  await release.assertSealedProductionBuildJobWorkspace(job);

  await createProject(pg, { projectId, userId });
  await queue.enqueueBuildJob({
    job,
    idempotencyKey: `production-human-gate:${jobId}`,
    requestFingerprint,
    maxAttempts: 2,
  });
  await pg.query(
    "update projects set current_build_job_id = $2, updated_at = now() where id = $1",
    [projectId, jobId],
  );
  const claimed = await queue.claimBuildJob(jobId, workerId);
  assert.ok(claimed);
  await queue.markBuildJobReady(claimed, workerId);

  const ready = await pg.query(
    "select payload, queue_status, stage, artifact_sha256 from build_jobs where id = $1",
    [jobId],
  );
  assert.equal(ready.rows[0].queue_status, "awaiting_human_approval");
  assert.equal(ready.rows[0].stage, "human_gate");
  const baselinePayload = JSON.parse(ready.rows[0].payload);
  assert.doesNotMatch(ready.rows[0].payload, new RegExp(NIMBUS_HMAC_SECRET));
  assert.equal(baselinePayload.workspace.buildLevel, "production");
  assert.equal(
    baselinePayload.production.runnerReport.candidateSha256,
    baselinePayload.production.candidate.sourceSha256,
  );
  assert.equal(baselinePayload.production.qualityReport.passed, true);
  assert.deepEqual(
    baselinePayload.production.qualityReport.runtimeQuality.reports.map((entry) => [
      entry.agent,
      entry.status,
    ]),
    [
      ["twin", "not_run"],
      ["echo", "not_run"],
      ["swift", "not_run"],
    ],
  );
  assert.equal(baselinePayload.production.qualityReport.runtimeQuality.iris.status, "not_run");
  assert.equal(baselinePayload.production.qualityReport.runtimeQuality.validated, false);
  assert.equal(ready.rows[0].artifact_sha256, await patch.sha256Hex(baselinePayload.html));

  const sourcePath = baselinePayload.production.candidate.files.find(
    (descriptor) =>
      descriptor.role === "source" &&
      descriptor.path !== baselinePayload.production.candidate.entrypoint,
  )?.path;
  assert.ok(sourcePath, "the Production fixture must include a non-entrypoint source file");
  const tamperCases = [
    [
      "preview",
      (payload) => {
        payload.html = payload.html.replace("immutable candidate", "tampered candidate");
      },
    ],
    [
      "source",
      (payload) => {
        payload.files[sourcePath] += "\n// tampered after sealing\n";
      },
    ],
    [
      "candidate",
      (payload) => {
        payload.production.candidate.jobId = `tampered-${payload.production.candidate.jobId}`;
      },
    ],
    [
      "graph",
      (payload) => {
        payload.production.graph.graphSha256 = flipHash(payload.production.graph.graphSha256);
      },
    ],
    [
      "runner report",
      (payload) => {
        payload.production.runnerReport.runner.provider += "-tampered";
      },
    ],
    [
      "workspace quality report",
      (payload) => {
        payload.production.qualityReport.checks[0].detail += " Tampered.";
      },
    ],
    [
      "browser evidence",
      (payload) => {
        payload.quality.twin.detail += " Tampered.";
      },
    ],
    [
      "manifest",
      (payload) => {
        payload.workspace.capabilities[0].detail += " Tampered after sealing.";
      },
    ],
  ];

  for (const [label, mutate] of tamperCases) {
    await t.test(`${label} tampering is rejected before a Human Gate decision`, async () => {
      const tampered = structuredClone(baselinePayload);
      mutate(tampered);
      await pg.query("update build_jobs set payload = $2 where id = $1", [
        jobId,
        JSON.stringify(tampered),
      ]);
      await assert.rejects(
        gate.__testDecideOwnedJob({
          jobId,
          userId,
          decision: "approve",
          requestId: crypto.randomUUID(),
          reason: `Reject ${label} tampering`,
        }),
        humanGateArtifactError(gate),
      );
      await pg.query("update build_jobs set payload = $2 where id = $1", [
        jobId,
        JSON.stringify(baselinePayload),
      ]);
      const unchanged = await pg.query("select queue_status from build_jobs where id = $1", [
        jobId,
      ]);
      assert.equal(unchanged.rows[0].queue_status, "awaiting_human_approval");
    });
  }

  const approval = await gate.__testDecideOwnedJob({
    jobId,
    userId,
    decision: "approve",
    requestId: crypto.randomUUID(),
    reason: "The exact sealed Production artifact is approved",
  });
  assert.equal(approval.toStatus, "approved");

  await t.test("Prototype queue sealing remains unchanged", async () => {
    const prototypeUserId = `prototype-gate-user-${crypto.randomUUID()}`;
    const prototypeProjectId = `prototype-gate-project-${crypto.randomUUID()}`;
    const prototypeJobId = `prototype-gate-job-${crypto.randomUUID()}`;
    const prototypeWorkerId = `prototype-gate-worker-${crypto.randomUUID()}`;
    const html = validPrototypeHtml("Prototype regression guard");
    const prototypeFingerprint = await patch.sha256Hex(`request:${prototypeJobId}`);
    const prototypeJob = {
      id: prototypeJobId,
      projectId: prototypeProjectId,
      userId: prototypeUserId,
      prompt: "Build a bounded prototype",
      locale: "en",
      mode: "generate",
      buildLevel: "prototype",
      currentHtml: html,
      status: "running",
      steps: [],
      html,
      usedAi: true,
      title: "Prototype regression guard",
      createdAt: Date.now(),
      requestFingerprint: prototypeFingerprint,
      checkpoint: {
        pipelineVersion: pipeline.HELIX_PIPELINE_VERSION,
        requestFingerprint: prototypeFingerprint,
        stage: "finalized",
      },
      files: {
        "README.md": "# Prototype regression guard\n",
        "docs/artifact-level.md": "# Artifact level\n\nPrototype\n",
        "index.html": html,
      },
    };
    await createProject(pg, {
      projectId: prototypeProjectId,
      userId: prototypeUserId,
    });
    await queue.enqueueBuildJob({
      job: prototypeJob,
      idempotencyKey: `prototype-human-gate:${prototypeJobId}`,
      requestFingerprint: prototypeFingerprint,
    });
    const prototypeClaimed = await queue.claimBuildJob(prototypeJobId, prototypeWorkerId);
    assert.ok(prototypeClaimed);
    await queue.markBuildJobReady(prototypeClaimed, prototypeWorkerId);
    const prototypeReady = await queue.loadBuildJob(prototypeJobId);
    assert.equal(prototypeReady.queue.status, "awaiting_human_approval");
    assert.equal(prototypeReady.workspace.buildLevel, "prototype");
    assert.equal(prototypeReady.workspace.entrypoint, "index.html");
    assert.equal(prototypeReady.files["index.html"], html);
    assert.equal(
      prototypeReady.workspace.capabilities.find((item) => item.id === "backend").status,
      "not_configured",
    );
  });
});
