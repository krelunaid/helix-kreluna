import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function plan(title, resource) {
  return {
    title,
    type: "dashboard",
    pitch: `Operate the approved ${resource} workflow.`,
    target: `Teams responsible for ${resource}.`,
    problem: `${resource} coordination lacks a dependable system of record.`,
    useCases: [`Create and review ${resource} through the approved API.`],
    mvp: [`Deliver the ${resource} workspace.`],
    scope: { p0: [`Manage ${resource}`], p1: [], p2: [] },
    nonGoals: ["No simulated providers"],
    userJourneys: [`An authenticated operator manages ${resource}.`],
    acceptanceCriteria: [`The ${resource} API and interface use the approved domain language.`],
    screens: [{ name: `${resource} workspace`, purpose: `Manage ${resource}` }],
    features: [`${resource} workflow`],
    data: [`${resource}: id, status, notes`],
    success: `${resource} are visible after a validated request.`,
    backend: "Node service with PostgreSQL persistence.",
  };
}

function architecture(resource) {
  return {
    productType: "Authenticated service application",
    frontendArchitecture: `A browser workspace presents ${resource} operations and explicit states.`,
    backendArchitecture: `A Node API keeps ${resource} persistence behind injected ports.`,
    dataFlow: [`Validated ${resource} request -> authorization -> persistence -> response`],
    screenMap: [`${resource} workspace: list and create`],
    routeMap: [`GET /api/${resource}`, `POST /api/${resource}`],
    apiContracts: [
      `GET /api/${resource}: return approved ${resource}`,
      `POST /api/${resource}: create one authenticated ${resource} item`,
    ],
    databaseRequirements: `PostgreSQL stores private ${resource} with ownership and timestamps.`,
    authModel: "A signed server session authenticates every account.",
    permissions: [`user can manage only owned ${resource}`],
    integrations: [],
    deploymentTarget: "Netlify web runtime",
    failureModes: ["Missing concrete runtime bindings must fail closed."],
  };
}

async function materialize(files, root) {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

async function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const environment = { ...process.env, NO_COLOR: "1" };
    delete environment.NODE_TEST_CONTEXT;
    const child = spawn(command, args, {
      cwd,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} ${args.join(" ")} failed (${code})\n${output}`));
    });
  });
}

test("Production derives distinct domain workspaces instead of flattening every product to records", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const [contextModule, production, graphModule, workspaceModule, releaseModule] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/production/context.ts"),
    vite.ssrLoadModule("/src/lib/server/production/index.ts"),
    vite.ssrLoadModule("/src/lib/production-artifact-graph.ts"),
    vite.ssrLoadModule("/src/lib/workspace.ts"),
    vite.ssrLoadModule("/src/lib/server/release/production-workspace.ts"),
  ]);

  const cases = [
    { resource: "incidents", title: "Incident Command" },
    { resource: "appointments", title: "Clinic Schedule" },
  ];
  for (const domainCase of cases) {
    await t.test(`${domainCase.resource} keeps its approved API, schema, repository, and UI`, async () => {
      const context = contextModule.deriveProductionContext({
        prompt: `Build ${domainCase.title} with accounts and persistent ${domainCase.resource} data.`,
        plan: plan(domainCase.title, domainCase.resource),
        architecture: architecture(domainCase.resource),
      });
      assert.deepEqual(
        context.requirements.apiOperations
          .map((operation) => `${operation.method} ${operation.path}`)
          .sort(),
        [`POST /api/${domainCase.resource}`, `GET /api/${domainCase.resource}`].sort(),
      );
      assert.equal(
        context.requirements.apiOperations.some((operation) => operation.path === "/api/records"),
        false,
      );

      const assembled = await production.assembleProductionSource(context);
      assert.deepEqual(
        JSON.parse(assembled.files["docs/architecture.json"]).apiContracts,
        architecture(domainCase.resource).apiContracts,
      );
      assert.ok(
        assembled.artifacts.prism.tables.some((table) => table.name === domainCase.resource),
      );
      assert.equal(
        assembled.artifacts.prism.tables.some((table) => table.name === "app_records"),
        false,
      );
      assert.ok(
        assembled.artifacts.basalt.modules.some((module) => module.id === domainCase.resource),
      );
      assert.ok(assembled.files[`server/core/${domainCase.resource}-repository.js`]);
      assert.match(assembled.files["apps/web/src/main.js"], new RegExp(domainCase.title, "u"));
      assert.match(
        assembled.files["apps/web/src/main.js"],
        new RegExp(`integrations/(?:create|list)_${domainCase.resource.slice(0, -1)}`, "u"),
      );
      assert.equal(assembled.artifacts.nimbus.activation, "not_configured");
      assert.equal(assembled.artifacts.nimbus.decision.status, "not_configured");
      assert.equal(assembled.artifacts.nimbus.provider, null);
      assert.equal(assembled.files["infra/netlify/functions/api.js"], undefined);
      const nimbusPlan = JSON.parse(assembled.files["infra/nimbus-decision.json"]);
      assert.equal(nimbusPlan.evidence.status, "not_configured");
      assert.equal(nimbusPlan.decision, null);

      const workspace = await mkdtemp(join(tmpdir(), `helix-${domainCase.resource}-`));
      t.after(() => rm(workspace, { recursive: true, force: true }));
      await materialize(assembled.files, workspace);
      const typeScriptCli = join(ROOT, "node_modules", "typescript", "bin", "tsc");
      await run(
        process.execPath,
        [
          typeScriptCli,
          "--noEmit",
          "--project",
          "tsconfig.json",
          "--typeRoots",
          join(ROOT, "node_modules", "@types"),
        ],
        workspace,
      );
      await run(process.execPath, ["scripts/lint.mjs"], workspace);
      const generatedTests = Object.keys(assembled.files).filter(
        (path) => path.startsWith("tests/") && path.endsWith(".test.mjs"),
      );
      await run(process.execPath, ["--test", ...generatedTests], workspace);
      await run(process.execPath, ["scripts/build.mjs"], workspace);
    });
  }

  await t.test("the scaffold consumes typed Lumen/Forge direction evidence without inventing it", async () => {
    const context = contextModule.deriveProductionContext({
      prompt: "Build Incident Command with accounts and persistent incidents data.",
      plan: plan("Incident Command", "incidents"),
      architecture: architecture("incidents"),
    });
    const creativeEvidence = {
      kind: "helix_production_creative_direction",
      schemaVersion: "1.0.0",
      source: "lumen_forge",
      selectedDirection: {
        id: "signal-room",
        name: "Signal Room",
        mood: "Calm operational focus",
        palette: {
          bg: "#101820",
          fg: "#f4f7fa",
          accent: "#22c55e",
          muted: "#708090",
          elevated: "#18242f",
        },
        fonts: { display: "System Sans", body: "System Sans" },
        layout: "Priority queue with a compact incident rail",
        density: "Operational",
        grid: "Twelve columns",
        motion: "Reduced-motion-safe state transitions",
        iconography: "Functional line icons",
        componentGeometry: "Compact cards with clear status edges",
        imagery: "No decorative imagery",
        references: ["Emergency operations consoles"],
        forbiddenCliches: ["Generic gradient dashboard"],
      },
      selectionRationale: "The selected direction keeps urgent state legible.",
      forgeUiIntent: ["Keep incident priority and ownership visible."],
      forgeLogicIntent: {
        kind: "forge_logic_intent",
        schemaVersion: "1.0.0",
        controls: [
          { id: "acknowledge-incident", label: "Acknowledge incident", event: "click" },
        ],
        forms: [],
        stateTargets: ["incident-status"],
        validationSignals: [],
        stateSignals: ["text"],
      },
    };
    const assembled = await production.assembleProductionSource(context, { creativeEvidence });
    assert.deepEqual(JSON.parse(assembled.files["docs/design.json"]), creativeEvidence);
    assert.match(assembled.files["apps/web/src/main.js"], /Signal Room/u);
    assert.match(assembled.files["apps/web/src/main.js"], /Acknowledge incident/u);
    assert.match(assembled.files["apps/web/src/main.js"], /addEventListener/u);
    assert.match(assembled.files["apps/web/src/styles.css"], /--accent:#22c55e/u);
    assert.match(assembled.files["apps/web/src/styles.css"], /--space-unit:/u);
    assert.match(assembled.files["apps/web/src/styles.css"], /--surface-radius:/u);
    assert.match(assembled.files["apps/web/src/styles.css"], /--motion-duration:/u);

    const alternateEvidence = {
      ...creativeEvidence,
      selectedDirection: {
        ...creativeEvidence.selectedDirection,
        layout: "Radial incident command canvas",
        density: "Spacious gallery",
        grid: "Radial anchor grid",
        motion: "Immediate state flashes",
        iconography: "Filled technical glyphs",
        componentGeometry: "Arched circular panels",
        imagery: "Technical incident maps",
      },
      forgeLogicIntent: {
        ...creativeEvidence.forgeLogicIntent,
        controls: [
          { id: "resolve-incident", label: "Resolve incident", event: "click" },
        ],
      },
    };
    const alternate = await production.assembleProductionSource(context, {
      creativeEvidence: alternateEvidence,
    });
    assert.notEqual(
      alternate.files["apps/web/src/styles.css"],
      assembled.files["apps/web/src/styles.css"],
      "grid, density, geometry and motion must change controlled CSS beyond palette/fonts",
    );
    assert.match(alternate.files["apps/web/src/main.js"], /Resolve incident/u);
    assert.doesNotMatch(alternate.files["apps/web/src/main.js"], /Acknowledge incident/u);
    await assert.rejects(
      () =>
        production.assembleProductionSource(context, {
          creativeEvidence: { ...creativeEvidence, source: "unverified" },
        }),
      /source/iu,
    );
  });

  await t.test("environment names and passing source checks cannot invent service runtime readiness", async () => {
    const context = contextModule.deriveProductionContext({
      prompt: "Build Incident Command with accounts and persistent incidents data.",
      plan: plan("Incident Command", "incidents"),
      architecture: architecture("incidents"),
    });
    const assembled = await production.assembleProductionSource(context);
    const prepared = await workspaceModule.createProductionWorkspaceCandidate({
      jobId: "domain-runtime-readiness",
      projectId: "domain-runtime-project",
      locale: "en",
      pipelineVersion: "helix-v3",
      createdAt: "2026-08-20T10:00:00.000Z",
      entrypoint: assembled.entrypoint,
      files: assembled.files,
    });
    const configuredEnvironmentNames = assembled.files[".env.example"]
      .split(/\r?\n/u)
      .filter((line) => /^[A-Z][A-Z0-9_]*=$/u.test(line))
      .map((line) => line.slice(0, -1));
    const graph = await graphModule.buildProductionArtifactGraph({
      candidate: prepared.candidate,
      files: prepared.files,
      requirements: assembled.requirements,
      provenance: assembled.provenance,
      artifacts: assembled.artifacts,
      configuredEnvironmentNames,
    });
    assert.equal(graph.nodes.find((node) => node.id === "nimbus")?.status, "not_configured");
    const testEvidencePath = prepared.candidate.files.find(
      (descriptor) => descriptor.role === "test",
    ).path;
    const capabilities = releaseModule.productionWorkspaceCapabilities({
      graph,
      entrypoint: assembled.entrypoint,
      testEvidencePath,
    });
    assert.equal(
      capabilities.find((capability) => capability.id === "frontend")?.status,
      "implemented",
    );
    assert.equal(
      capabilities.find((capability) => capability.id === "tests")?.status,
      "implemented",
    );
    for (const id of ["backend", "api", "database", "deployment", "monitoring"]) {
      assert.equal(
        capabilities.find((capability) => capability.id === id)?.status,
        "not_configured",
        id,
      );
    }
    assert.match(
      capabilities.find((capability) => capability.id === "api")?.detail ?? "",
      /source\/build evidence exists.*runtime activation is not_configured/iu,
    );
  });

  await t.test("static and device-local profiles remain honest without provider evidence", async () => {
    const noServerArchitecture = {
      productType: "Public browser product",
      frontendArchitecture: "Browser modules render approved content and device-local state.",
      backendArchitecture: "No backend or server runtime.",
      dataFlow: ["Approved content -> browser view"],
      screenMap: ["Home: approved primary journey"],
      routeMap: ["/: approved primary journey"],
      apiContracts: [],
      databaseRequirements: "No database or server persistence.",
      authModel: "No authentication or user accounts.",
      permissions: [],
      integrations: [],
      deploymentTarget: "Netlify static delivery",
      failureModes: ["Missing static asset fails the build."],
    };
    const profiles = [
      {
        expected: "static_site",
        prompt: "A public information site for a local observatory",
        plan: {
          ...plan("Observatory Guide", "exhibits"),
          type: "site",
          useCases: ["Read the approved observatory guide."],
          mvp: ["Publish the approved guide."],
          scope: { p0: ["Guide content"], p1: [], p2: [] },
          nonGoals: ["Accounts, server API, and payments"],
          userJourneys: ["A visitor opens the guide and reads an exhibit description."],
          acceptanceCriteria: ["Approved content is readable without an account."],
          screens: [{ name: "Guide", purpose: "Read approved content" }],
          features: ["Read-only guide"],
          data: [],
          backend: undefined,
          success: "Visitors can read the guide.",
        },
      },
      {
        expected: "client_only_app",
        prompt: "An offline app for a device-local breathing timer",
        plan: {
          ...plan("Breathing Timer", "sessions"),
          type: "app",
          useCases: ["Run a breathing timer entirely on this device."],
          mvp: ["Start, pause, and reset the local timer."],
          scope: { p0: ["Local timer"], p1: [], p2: [] },
          nonGoals: ["Accounts, server API, and payments"],
          userJourneys: ["A person opens the app and completes a timed breathing cycle."],
          acceptanceCriteria: ["The timer works offline without an account."],
          screens: [{ name: "Timer", purpose: "Run the breathing cycle" }],
          features: ["Offline timer"],
          data: [],
          backend: undefined,
          success: "The local timer completes.",
        },
      },
    ];
    for (const profile of profiles) {
      const context = contextModule.deriveProductionContext({
        prompt: profile.prompt,
        plan: profile.plan,
        architecture: noServerArchitecture,
      });
      assert.equal(context.requirements.runtimeProfile, profile.expected);
      const assembled = await production.assembleProductionSource(context);
      const prepared = await workspaceModule.createProductionWorkspaceCandidate({
        jobId: `local-ready-${profile.expected}`,
        locale: "en",
        pipelineVersion: "helix-v3",
        createdAt: "2026-08-20T10:00:00.000Z",
        entrypoint: assembled.entrypoint,
        files: assembled.files,
      });
      const graph = await graphModule.buildProductionArtifactGraph({
        candidate: prepared.candidate,
        files: prepared.files,
        requirements: assembled.requirements,
        provenance: assembled.provenance,
        artifacts: assembled.artifacts,
        configuredEnvironmentNames: [],
      });
      assert.equal(graph.nodes.find((node) => node.id === "nimbus")?.status, "not_configured");
      const capabilities = releaseModule.productionWorkspaceCapabilities({
        graph,
        entrypoint: assembled.entrypoint,
        testEvidencePath: prepared.candidate.files.find(
          (descriptor) => descriptor.role === "test",
        ).path,
      });
      assert.equal(
        capabilities.some((capability) => capability.status === "not_configured"),
        true,
      );
    }
  });
});
