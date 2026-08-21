import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function approvedPlan() {
  return {
    title: "Field Notes",
    type: "site",
    pitch: "A product-specific field guide for the approved collection.",
    target: "Field researchers",
    problem: "Approved observations are hard to scan in the field.",
    useCases: ["Scan approved observations by habitat."],
    mvp: ["Publish the approved observation guide."],
    scope: { p0: ["Habitat observation guide"], p1: [], p2: [] },
    nonGoals: ["Accounts and payments"],
    userJourneys: ["Open the guide and inspect one approved habitat."],
    acceptanceCriteria: ["Every habitat exposes its approved observations."],
    screens: [{ name: "Habitat atlas", purpose: "Scan field observations" }],
    features: ["Habitat filters"],
    data: [],
    success: "Researchers can find an observation without a server call.",
  };
}

function approvedArchitecture() {
  return {
    productType: "Public field guide",
    frontendArchitecture: "Static browser modules with bundled approved observations.",
    backendArchitecture: "No backend is required by the approved journey.",
    dataFlow: ["Bundled observations -> habitat filter -> visible field note"],
    screenMap: ["Habitat atlas: scan approved field observations"],
    routeMap: ["/: habitat atlas"],
    apiContracts: [],
    databaseRequirements: "No server-persistent database is required.",
    authModel: "No identity capability is required.",
    permissions: [],
    integrations: [],
    deploymentTarget: "Netlify web runtime",
    failureModes: ["Missing bundled observations block the build."],
  };
}

function direction(overrides) {
  return {
    id: "field-ledger",
    name: "Field Ledger",
    mood: "Tactile precise natural",
    palette: {
      bg: "#08120d",
      fg: "#f8f4df",
      accent: "#f2b134",
      muted: "#99a38f",
      elevated: "#132219",
    },
    fonts: { display: "Fraunces", body: "Source Sans 3" },
    layout: "Asymmetric observation ledger",
    density: "Airy field notes",
    grid: "Twelve-column broken specimen grid",
    motion: "Measured page reveals",
    iconography: "Hairline botanical marks",
    componentGeometry: "Sharp ruled cards",
    imagery: "Cropped specimen plates",
    references: ["Archival expedition journals"],
    forbiddenCliches: ["Generic glass dashboard"],
    ...overrides,
  };
}

function designPortfolio() {
  return {
    directions: [
      direction({}),
      direction({
        id: "signal-grid",
        name: "Signal Grid",
        mood: "Dense technical immediate",
        palette: {
          bg: "#111827",
          fg: "#f9fafb",
          accent: "#22c55e",
          muted: "#94a3b8",
          elevated: "#1f2937",
        },
        fonts: { display: "IBM Plex Mono", body: "Atkinson Hyperlegible" },
        layout: "Dense habitat signal matrix",
        density: "Compressed workstation",
        grid: "Sixteen-column signal grid",
        motion: "Immediate state flashes",
        iconography: "Squared technical glyphs",
        componentGeometry: "Compact square controls",
        imagery: "Data-first habitat maps",
        references: ["Ecology monitoring consoles"],
      }),
      direction({
        id: "specimen-stage",
        name: "Specimen Stage",
        mood: "Cinematic spacious curious",
        palette: {
          bg: "#f6f0e4",
          fg: "#24180d",
          accent: "#b42318",
          muted: "#75665a",
          elevated: "#fffaf0",
        },
        fonts: { display: "Bodoni Moda", body: "Work Sans" },
        layout: "Full-canvas specimen stage",
        density: "Spacious gallery",
        grid: "Radial specimen anchors",
        motion: "Slow focal transitions",
        iconography: "Engraved circular symbols",
        componentGeometry: "Arched panels",
        imagery: "Large specimen silhouettes",
        references: ["Natural history cabinets"],
      }),
    ],
  };
}

const forgeUiHtml = `<!doctype html><html lang="en"><head><title>Field Notes Habitat Atlas</title><style>body{font-family:serif;background:#08120d;color:#f8f4df}main{max-width:70rem;margin:auto;padding:3rem}button{min-height:44px}</style></head><body><main><p>Approved field collection</p><h1>Habitat atlas</h1><h2>Wetland observations</h2><p>${"Product-specific observation evidence. ".repeat(18)}</p><button id="filter-wetland" data-action="filter-wetland">Show wetland notes</button></main></body></html>`;

const forgeLogicHtml = `<!doctype html><html lang="en"><head><title>Field Notes Habitat Atlas</title><style>body{font-family:serif;background:#08120d;color:#f8f4df}main{max-width:70rem;margin:auto;padding:3rem}button{min-height:44px}</style></head><body><main><p>Approved field collection</p><h1>Habitat atlas</h1><h2 id="active-habitat">All observations</h2><p>${"Product-specific interactive observation evidence. ".repeat(18)}</p><button id="filter-wetland" data-action="filter-wetland">Show wetland notes</button></main><script>const button=document.querySelector("#filter-wetland");const output=document.querySelector("#active-habitat");button.addEventListener("click",()=>{output.textContent="Wetland observations";});</script></body></html>`;

test("Production runs and resumes Lumen, Forge UI and Forge Logic as hash-bound phases", async (t) => {
  const priorEnabled = process.env.HELIX_AI_GATEWAY_ENABLED;
  const priorKey = process.env.NETLIFY_AI_GATEWAY_KEY;
  const priorBaseUrl = process.env.NETLIFY_AI_GATEWAY_BASE_URL;
  const priorRunnerUrl = process.env.HELIX_WORKSPACE_RUNNER_URL;
  const priorRunnerSecret = process.env.HELIX_WORKSPACE_RUNNER_SECRET;
  const priorFetch = globalThis.fetch;
  process.env.HELIX_AI_GATEWAY_ENABLED = "true";
  process.env.NETLIFY_AI_GATEWAY_KEY = [
    "controlled",
    "production",
    "phases",
    "gateway",
    "key",
  ].join("-");
  process.env.NETLIFY_AI_GATEWAY_BASE_URL = "https://gateway.test";
  delete process.env.HELIX_WORKSPACE_RUNNER_URL;
  delete process.env.HELIX_WORKSPACE_RUNNER_SECRET;

  const calls = [];
  globalThis.fetch = async (url, init) => {
    if (String(url) !== "https://gateway.test/v1/chat/completions") {
      return priorFetch(url, init);
    }
    const request = JSON.parse(String(init?.body ?? "{}"));
    assert.equal(request.model, "gpt-5.6-terra");
    assert.equal(request.store, false);
    const system = String(request.messages?.[0]?.content ?? "");
    const user = String(request.messages?.[1]?.content ?? "");
    let phase;
    let content;
    if (system.includes("You are Lumen")) {
      phase = "lumen";
      content = JSON.stringify(designPortfolio());
    } else if (system.includes("Forge Structure/UI")) {
      phase = "forgeUi";
      content = forgeUiHtml;
    } else if (system.includes("Forge Logic")) {
      phase = "forgeLogic";
      assert.match(user, /STRUCTURE HTML:/u);
      assert.match(user, /Habitat atlas/u);
      content = forgeLogicHtml;
    } else {
      throw new Error("UNEXPECTED_MODEL_PHASE");
    }
    calls.push({ phase, system, user });
    return new Response(
      JSON.stringify({
        id: `controlled-${phase}-${calls.length}`,
        model: request.model,
        choices: [{ finish_reason: "stop", message: { content, refusal: null } }],
        usage: {
          prompt_tokens: 30,
          completion_tokens: 20,
          total_tokens: 50,
          prompt_tokens_details: { cached_tokens: 0 },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  const [create, queue, orchestrator, execution, db] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/jobs/create.ts"),
    vite.ssrLoadModule("/src/lib/server/jobs/queue.ts"),
    vite.ssrLoadModule("/src/lib/server/orchestrator/production.ts"),
    vite.ssrLoadModule("/src/lib/server/agents/execution.ts"),
    vite.ssrLoadModule("/src/lib/db.ts"),
  ]);
  const pg = await db.getPglite();
  t.after(async () => {
    globalThis.fetch = priorFetch;
    if (priorEnabled === undefined) delete process.env.HELIX_AI_GATEWAY_ENABLED;
    else process.env.HELIX_AI_GATEWAY_ENABLED = priorEnabled;
    if (priorKey === undefined) delete process.env.NETLIFY_AI_GATEWAY_KEY;
    else process.env.NETLIFY_AI_GATEWAY_KEY = priorKey;
    if (priorBaseUrl === undefined) delete process.env.NETLIFY_AI_GATEWAY_BASE_URL;
    else process.env.NETLIFY_AI_GATEWAY_BASE_URL = priorBaseUrl;
    if (priorRunnerUrl === undefined) delete process.env.HELIX_WORKSPACE_RUNNER_URL;
    else process.env.HELIX_WORKSPACE_RUNNER_URL = priorRunnerUrl;
    if (priorRunnerSecret === undefined) delete process.env.HELIX_WORKSPACE_RUNNER_SECRET;
    else process.env.HELIX_WORKSPACE_RUNNER_SECRET = priorRunnerSecret;
    await vite.close();
    await pg.close();
  });

  const draft = await create.createBuildJobDraft({
    prompt: "Build Field Notes, a public habitat atlas without accounts or payments",
    locale: "en",
    mode: "generate",
    buildLevel: "production",
    currentHtml: null,
  });
  draft.job.checkpoint = {
    pipelineVersion: "helix-v3",
    requestFingerprint: draft.requestFingerprint,
    stage: "architected",
    artifacts: { plan: approvedPlan(), architecture: approvedArchitecture() },
  };
  await queue.enqueueBuildJob({
    job: draft.job,
    idempotencyKey: `production-creative-phases:${randomUUID()}`,
    requestFingerprint: draft.requestFingerprint,
    maxAttempts: 3,
  });
  let workerId = randomUUID();
  let job = await queue.claimBuildJob(draft.job.id, workerId);
  assert.ok(job);
  job.runtime = { workerId, abortSignal: new AbortController().signal };

  async function retryClaim() {
    const runnerError = Object.assign(new Error("WORKSPACE_RUNNER_UNCONFIGURED"), {
      code: "WORKSPACE_RUNNER_UNCONFIGURED",
    });
    assert.equal(
      (await queue.markBuildJobFailed(job, workerId, runnerError, { retryable: true })).retry,
      true,
    );
    workerId = randomUUID();
    const claimed = await queue.claimBuildJob(job.id, workerId);
    assert.ok(claimed);
    claimed.runtime = { workerId, abortSignal: new AbortController().signal };
    job = claimed;
  }

  await assert.rejects(
    orchestrator.runProductionCrew(job),
    (error) => error?.code === "WORKSPACE_RUNNER_UNCONFIGURED",
  );
  assert.deepEqual(calls.map((call) => call.phase), ["lumen", "forgeUi", "forgeLogic"]);
  assert.equal(job.aiUsage.callCount, 3);
  assert.equal(job.aiUsage.succeededCallCount, 3);
  assert.equal(job.aiUsage.unknownCostCallCount, 3);
  assert.equal(job.aiUsage.providerActualCostUsdTicks, "0");
  assert.equal(job.aiUsage.accountedCostUsdTicks, "33500000000");
  assert.equal(job.aiUsage.actualCostComplete, false);

  const artifacts = job.checkpoint.artifacts;
  assert.equal(artifacts.designSelection.directions.length, 3);
  assert.equal(artifacts.designSelection.scores.length, 3);
  assert.equal(new Set(artifacts.designSelection.directions.map((item) => item.id)).size, 3);
  assert.equal(
    new Set(artifacts.designSelection.directions.map((item) => item.palette.accent)).size,
    3,
  );
  assert.equal(
    artifacts.designSelectionSha256,
    sha256(JSON.stringify(artifacts.designSelection)),
  );
  assert.equal(artifacts.structureHtmlSha256, sha256(artifacts.structureHtml));
  assert.equal(artifacts.forgeLogicHtmlSha256, sha256(artifacts.forgeLogicHtml));
  assert.equal(artifacts.forgeLogicInputSha256, artifacts.structureHtmlSha256);
  assert.equal(
    artifacts.creativeEvidenceSha256,
    sha256(JSON.stringify(artifacts.creativeEvidence)),
  );

  const expectedLumenExecution = await execution.completeAgentExecution("lumen", {
    directions: artifacts.designSelection.directions,
  });
  assert.deepEqual(job.production.agentArtifacts, {
    lumen: {
      contractId: "lumen",
      artifact: "three_direction_design_portfolio",
      artifactSha256: expectedLumenExecution.artifact.sha256,
      validation: "passed",
    },
    forgeUi: {
      contractId: "forgeUi",
      artifact: "forge_structure_ui_html",
      artifactSha256: artifacts.structureHtmlSha256,
      validation: "passed",
    },
    forgeLogic: {
      contractId: "forgeLogic",
      artifact: "forge_logic_html",
      artifactSha256: artifacts.forgeLogicHtmlSha256,
      inputArtifactSha256: artifacts.structureHtmlSha256,
      validation: "passed",
    },
  });
  assert.deepEqual(
    JSON.parse(job.files["docs/design.json"]),
    artifacts.creativeEvidence,
  );
  assert.match(job.files["apps/web/src/main.js"], /Habitat Atlas/u);
  assert.match(job.files["apps/web/src/main.js"], /Field Ledger/u);
  assert.doesNotMatch(
    job.files["apps/web/src/main.js"],
    /const button=document\.querySelector\("#filter-wetland"\)/u,
    "raw Forge script must never enter deterministic Production source",
  );
  assert.match(job.files["apps/web/src/styles.css"], /--accent:#f2b134/u);
  assert.match(job.files["apps/web/src/styles.css"], /--font-display:"Fraunces"/u);

  const alternateLogicHtml = forgeLogicHtml
    .replaceAll("filter-wetland", "toggle-marsh")
    .replaceAll("Show wetland notes", "Toggle marsh notes");
  const alternateLogicIntent = orchestrator.deriveProductionForgeLogicIntent(
    alternateLogicHtml,
  );
  assert.notDeepEqual(
    alternateLogicIntent,
    artifacts.creativeEvidence.forgeLogicIntent,
  );
  const alternatePrepared = await orchestrator.prepareProductionWorkspace({
    job: {
      id: `${job.id}-alternate-logic`,
      locale: job.locale,
      createdAt: job.createdAt,
      checkpoint: job.checkpoint,
    },
    plan: approvedPlan(),
    architecture: approvedArchitecture(),
    prompt: job.prompt,
    creativeEvidence: {
      ...artifacts.creativeEvidence,
      forgeLogicIntent: alternateLogicIntent,
    },
    environment: {},
  });
  assert.notEqual(
    alternatePrepared.files["apps/web/src/main.js"],
    job.files["apps/web/src/main.js"],
    "a different validated Forge Logic output must change bounded application source",
  );
  assert.match(alternatePrepared.files["apps/web/src/main.js"], /Toggle marsh notes/u);
  assert.doesNotMatch(alternatePrepared.files["apps/web/src/main.js"], /Show wetland notes/u);

  const lumenStep = job.steps.find((step) => step.id === "lumen");
  const forgeStep = job.steps.find((step) => step.id === "forge");
  const integrationStep = job.steps.find((step) => step.id === "apex");
  assert.equal(lumenStep.kind, "ai_agent");
  assert.equal(lumenStep.status, "done");
  assert.match(lumenStep.detail, /3 distinct directions scored/u);
  assert.equal(forgeStep.kind, "ai_agent");
  assert.equal(forgeStep.status, "done");
  assert.match(forgeStep.detail, /Forge UI .+ Forge Logic/u);
  assert.notEqual(integrationStep.id, forgeStep.id);
  assert.equal(integrationStep.kind, "service");

  const firstCandidateSha256 = job.production.candidate.sourceSha256;
  await retryClaim();
  await assert.rejects(
    orchestrator.runProductionCrew(job),
    (error) => error?.code === "WORKSPACE_RUNNER_UNCONFIGURED",
  );
  assert.equal(calls.length, 3, "resume must not repeat hash-valid model artifacts");
  assert.equal(job.production.candidate.sourceSha256, firstCandidateSha256);
  assert.equal(job.aiUsage.callCount, 3);

  job.checkpoint.artifacts.forgeLogicHtml = job.checkpoint.artifacts.forgeLogicHtml.replace(
    "Wetland observations",
    "Tampered observations",
  );
  await retryClaim();
  await assert.rejects(
    orchestrator.runProductionCrew(job),
    (error) => error?.code === "WORKSPACE_RUNNER_UNCONFIGURED",
  );
  assert.deepEqual(
    calls.map((call) => call.phase),
    ["lumen", "forgeUi", "forgeLogic", "forgeLogic"],
    "a hash-mismatched Forge Logic artifact must be regenerated",
  );
  assert.equal(
    job.checkpoint.artifacts.forgeLogicHtmlSha256,
    sha256(job.checkpoint.artifacts.forgeLogicHtml),
  );
  assert.equal(job.aiUsage.callCount, 4);

  const persisted = await queue.loadBuildJob(job.id);
  assert.equal(persisted.checkpoint.requestFingerprint, draft.requestFingerprint);
  assert.equal(
    persisted.checkpoint.artifacts.forgeLogicInputSha256,
    persisted.checkpoint.artifacts.structureHtmlSha256,
  );
});
