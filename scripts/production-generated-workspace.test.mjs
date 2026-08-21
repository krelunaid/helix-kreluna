import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

async function loadProductionModules(t) {
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
    assembler: await vite.ssrLoadModule("/src/lib/server/production/index.ts"),
    aegis: await vite.ssrLoadModule("/src/lib/server/quality/aegis.ts"),
    graph: await vite.ssrLoadModule("/src/lib/production-artifact-graph.ts"),
    nimbus: await vite.ssrLoadModule("/src/lib/server/production/nimbus-decision.ts"),
    workspace: await vite.ssrLoadModule("/src/lib/workspace.ts"),
  };
}

function nimbusEvidenceProvider(nimbus) {
  const hmacSecret = "n".repeat(48);
  const now = "2026-08-20T10:00:00.000Z";
  return ({ productionRequirements: requirements, baseWorkspaceSha256 }) => ({
    envelope: nimbus.signNimbusDecisionEvidenceEnvelope(
      {
        kind: "nimbus_provider_evidence",
        version: "1.0.0",
        sourceId: "verified-provider-catalog",
        keyId: "catalog-key-v1",
        observedAt: now,
        candidateWorkspaceSha256: baseWorkspaceSha256,
        productionRequirementsSha256:
          nimbus.nimbusProductionRequirementsSha256(requirements),
        planning: {
          decisionHorizonEndsAt: "2027-08-20T10:00:00.000Z",
          requiredRegion: "eu-west",
          usage: {
            monthlyRequests: 1_000_000,
            egressGb: 25,
            databaseStorageGb: 10,
            objectStorageGb: 20,
          },
          policy: {
            maxQuoteAgeMs: 24 * 60 * 60 * 1_000,
            costRiskBufferRatio: 0.2,
            maxMonthlyCostUsd: 250,
          },
        },
        candidates: [
          {
            id: "verified-edge",
            displayName: "Verified Edge",
            configurationAdapter: "netlify",
            regions: ["eu-west"],
            runtimes: [
              {
                id: "node_22_serverless_functions",
                supportedUntil: "2028-08-20T10:00:00.000Z",
              },
            ],
            databaseServices: [{ id: "verified-postgres", kind: "postgresql" }],
            storageServices: [{ id: "verified-objects", kind: "object_storage" }],
            cdnAvailable: true,
            secretStoreAvailable: true,
            quote: {
              reference: "quote-verified-20260820",
              observedAt: now,
              currency: "USD",
            },
            pricing: {
              baseMonthlyUsd: 19,
              perMillionRequestsUsd: 2,
              perEgressGbUsd: 0.1,
              databaseBaseMonthlyUsd: 15,
              databasePerGbUsd: 0.5,
              storageBaseMonthlyUsd: 5,
              storagePerGbUsd: 0.02,
            },
          },
        ],
      },
      hmacSecret,
    ),
    verifier: {
      expectedSourceId: "verified-provider-catalog",
      expectedKeyId: "catalog-key-v1",
      hmacSecret,
      maxEvidenceAgeMs: 24 * 60 * 60 * 1_000,
      now,
    },
  });
}

function serviceRequirements() {
  return {
    kind: "helix_production_requirements",
    schemaVersion: "1.0.0",
    contractPath: "docs/requirements.json",
    runtimeProfile: "service_app",
    dataModel: "server_persistent",
    dataSensitivity: "server_private",
    storage: "object_storage",
    identity: "roles",
    roles: ["admin", "user"],
    serverOperations: "authenticated",
    privilegedOperations: true,
    monitoringScope: "full_stack",
    integrations: [
      {
        id: "email",
        kind: "email",
        execution: "server",
        purpose: "Send transactional account messages through an injected adapter.",
        envNames: ["EMAIL_API_KEY"],
      },
      {
        id: "google",
        kind: "google_oauth",
        execution: "server",
        purpose: "Authenticate through a server-owned OAuth callback.",
        envNames: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
        requiresCallback: true,
      },
      {
        id: "maps",
        kind: "maps",
        execution: "client",
        purpose: "Render the approved public map layer in the browser.",
        credentialExposure: "public",
        envNames: ["VITE_PUBLIC_MAPS_KEY"],
      },
      {
        id: "stripe",
        kind: "stripe",
        execution: "server",
        purpose: "Accept signed payment events through a server-owned adapter.",
        envNames: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
        requiresWebhook: true,
        requiresIdempotency: true,
        requiresLedger: true,
      },
    ],
    apiOperations: [
      {
        operationId: "create_record",
        method: "POST",
        path: "/api/records",
        access: { kind: "roles", roles: ["user"] },
        rateLimitRequired: true,
        idempotencyRequired: true,
      },
      {
        operationId: "stripe_webhook",
        method: "POST",
        path: "/api/webhooks/stripe",
        access: { kind: "signed_webhook", integrationId: "stripe" },
        rateLimitRequired: true,
        idempotencyRequired: true,
      },
    ],
    rationale:
      "The approved service requires persistent private records, role authorization, object storage, and explicit integrations.",
    evidencePaths: ["docs/architecture.json", "docs/prd.json"],
  };
}

function approvedContext(graph, requirements, title = "Production verification workspace") {
  const snapshot = graph.productionRequirementSnapshot(requirements);
  return {
    requirements,
    prd: {
      kind: "helix_production_prd",
      schemaVersion: "1.0.0",
      title,
      target: "Authenticated teams operating a bounded record workflow.",
      problem: "The workflow needs independently verifiable multi-file source.",
      useCases: ["Create a role-protected record through the approved API."],
      mvp: ["Produce and validate every required Production capability."],
      nonGoals: ["Do not provision or call external services during source validation."],
      userJourneys: ["An authenticated user submits a record and receives a validated response."],
      acceptanceCriteria: ["Typecheck, lint, tests, and build pass on the materialized source."],
      requirements: snapshot,
    },
    architecture: {
      kind: "helix_production_architecture",
      schemaVersion: "1.0.0",
      productType: "service_app",
      frontendArchitecture: "A browser client consumes only approved HTTP operations.",
      backendArchitecture: "Injected ports isolate routes, auth, persistence, and integrations.",
      dataFlow: ["Validated request -> authorization -> use case -> persistence port."],
      screenMap: ["Record workspace"],
      routeMap: ["POST /api/records", "POST /api/webhooks/stripe"],
      databaseRequirements: "PostgreSQL migration, ownership, constraints, indexes, and rollback review.",
      authModel: "Signed sessions and role authorization guard private operations.",
      deploymentTarget: "netlify",
      failureModes: ["Missing ports, environment names, signatures, or idempotency evidence fail closed."],
      requirements: snapshot,
    },
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
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(" ")} failed (${code})\n${stdout}\n${stderr}`));
    });
  });
}

test("a rich Production workspace materializes and passes local validation gates", async (t) => {
  const modules = await loadProductionModules(t);
  const requirements = modules.graph.ProductionRequirementsSchema.parse(serviceRequirements());
  const assembled = await modules.assembler.assembleProductionSource(
    approvedContext(modules.graph, requirements),
    { nimbusDecisionEvidenceProvider: nimbusEvidenceProvider(modules.nimbus) },
  );
  const mainSource = assembled.files["apps/web/src/main.js"];
  assert.doesNotMatch(mainSource, /innerHTML|outerHTML|insertAdjacentHTML/u);
  assert.match(mainSource, /heading\.textContent/u);
  assert.equal(assembled.artifacts.basalt.runtime, "node_22_es_modules");
  assert.equal(assembled.artifacts.nimbus.decision.status, "verified");
  assert.equal(assembled.artifacts.nimbus.provider.id, "verified-edge");
  assert.equal(assembled.artifacts.nimbus.runtime.id, "node_22_serverless_functions");
  assert.equal(
    assembled.artifacts.nimbus.costEstimate.evidence,
    "authenticated_provider_quote",
  );
  assert.equal(
    assembled.artifacts.nimbus.activation,
    "not_configured",
  );
  assert.deepEqual(assembled.artifacts.nimbus.functionPaths, [
    "infra/netlify/functions/api.js",
  ]);
  assert.doesNotMatch(Object.values(assembled.files).join("\n"), /TanStack Start/iu);

  const tamperedDecision = JSON.parse(assembled.files["infra/nimbus-decision.json"]);
  tamperedDecision.decision.provider.id = "tampered-provider";
  const tamperedFiles = {
    ...assembled.files,
    "infra/nimbus-decision.json":
      modules.graph.canonicalProductionContractFile(tamperedDecision),
  };
  const resealedTamper = await modules.workspace.createProductionWorkspaceCandidate({
    jobId: "nimbus-decision-tamper",
    projectId: "nimbus-decision-tamper",
    locale: "it",
    pipelineVersion: "nimbus-decision-tamper-v1",
    createdAt: "2026-08-20T10:00:00.000Z",
    entrypoint: assembled.entrypoint,
    files: tamperedFiles,
  });
  await assert.rejects(
    modules.graph.buildProductionArtifactGraph({
      candidate: resealedTamper.candidate,
      files: resealedTamper.files,
      requirements: assembled.requirements,
      provenance: assembled.provenance,
      artifacts: assembled.artifacts,
    }),
    /persisted decision does not match its decision hash/i,
  );

  const hostileTitle = '<img src=x onerror="globalThis.pwned=true"><script>alert(1)</script>';
  const hostile = await modules.assembler.assembleProductionSource(
    approvedContext(modules.graph, requirements, hostileTitle),
  );
  const hostileMain = hostile.files["apps/web/src/main.js"];
  assert.doesNotMatch(hostileMain, /innerHTML|outerHTML|insertAdjacentHTML/u);
  assert.match(hostileMain, /heading\.textContent/u);
  const security = await modules.aegis.runAegisStaticScan(hostileMain);
  assert.equal(
    security.findings.some((finding) =>
      ["html_assignment", "tainted_html_assignment"].includes(finding.id),
    ),
    false,
  );
  const workspace = await mkdtemp(join(tmpdir(), "helix-production-workspace-"));
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
  assert.ok(generatedTests.length > 0);
  await run(process.execPath, ["--test", ...generatedTests], workspace);
  await run(process.execPath, ["scripts/build.mjs"], workspace);

  assert.match(await readFile(join(workspace, "dist", "index.html"), "utf8"), /id="app"/u);
  assert.match(
    await readFile(join(workspace, "dist", "src", "main.js"), "utf8"),
    /Production candidate/u,
  );
  assert.ok(assembled.files["server/index.js"]);
  assert.ok(assembled.files["db/migrations/0001_core.sql"]);
  assert.ok(assembled.files["netlify.toml"]);
  assert.match(
    assembled.files["netlify.toml"],
    /directory = "dist\/infra\/netlify\/functions"/u,
  );
  assert.match(assembled.files["netlify.toml"], /from = "\/api\/\*"/u);
  assert.ok(assembled.files["infra/netlify/functions/api.js"]);
  assert.equal(
    assembled.provenance.files.find(
      (file) => file.path === "infra/netlify/functions/api.js",
    )?.owner,
    "nimbus",
  );
  await readFile(join(workspace, "dist", "server", "index.js"), "utf8");
  const builtAdapterPath = join(
    workspace,
    "dist",
    "infra",
    "netlify",
    "functions",
    "api.js",
  );
  const builtAdapterSource = await readFile(builtAdapterPath, "utf8");
  assert.doesNotMatch(builtAdapterSource, /new Map|mock|simulat(?:e|ed)/iu);
  const builtAdapter = await import(`${pathToFileURL(builtAdapterPath).href}?verify=1`);
  const response = await builtAdapter.default(
    new Request("https://example.test/.netlify/functions/api/records", {
      method: "POST",
    }),
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    code: "PRODUCTION_RUNTIME_CONFIGURATION_MISSING",
    message: "Concrete runtime bindings are required before this API can serve requests.",
    missingBindings: assembled.artifacts.nimbus.bindingContracts,
  });

  const createRequest = () =>
    new Request("https://example.test/api/records", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "request-1",
      },
      body: JSON.stringify({ value: 1 }),
    });
  const order = [];
  const counters = {
    authorization: 0,
    database: 0,
    handler: 0,
    idempotency: 0,
    rateLimit: 0,
  };
  const operationHandlers = Object.fromEntries(
    builtAdapter.apiOperations.map((operation) => [
      operation.operationId,
      async (input, context) => {
        counters.handler += 1;
        order.push("handler");
        await context.bindings.database.put("record-1", input);
        return { accepted: true, input };
      },
    ]),
  );
  const concreteBindings = {
    authorization: {
      async authorize() {
        counters.authorization += 1;
        order.push("authorization");
        return true;
      },
    },
    database: {
      async get() {
        return null;
      },
      async put() {
        counters.database += 1;
        order.push("database");
      },
    },
    idempotency: {
      async execute(_input, invoke) {
        counters.idempotency += 1;
        order.push("idempotency");
        return { status: "executed", value: await invoke() };
      },
    },
    objectStorage: {
      async get() {
        return null;
      },
      async put() {},
    },
    operationHandlers,
    rateLimit: {
      async consume() {
        counters.rateLimit += 1;
        order.push("rate_limit");
        return true;
      },
    },
  };
  const activeHandler = builtAdapter.createNetlifyApiHandler(concreteBindings);
  const activeResponse = await activeHandler(createRequest());
  assert.equal(activeResponse.status, 503);
  assert.deepEqual(await activeResponse.json(), {
    code: "PRODUCTION_RUNTIME_CONFIGURATION_MISSING",
    message: "Concrete runtime bindings are required before this API can serve requests.",
    missingBindings: ["identity_issuer", "monitoring"],
  });
  assert.deepEqual(order, []);
  assert.deepEqual(counters, {
    authorization: 0,
    database: 0,
    handler: 0,
    idempotency: 0,
    rateLimit: 0,
  });
});
