import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NOW = "2026-08-20T10:00:00.000Z";

function requirements(overrides = {}) {
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
    rationale: "The approved public service persists records behind abuse-control ports.",
    evidencePaths: ["docs/architecture.json", "docs/prd.json"],
    ...overrides,
  };
}

function context(graph, approvedRequirements) {
  const snapshot = graph.productionRequirementSnapshot(approvedRequirements);
  return {
    requirements: approvedRequirements,
    prd: {
      kind: "helix_production_prd",
      schemaVersion: "1.0.0",
      title: "Account records",
      target: "Service users",
      problem: "Records require a durable system of record.",
      useCases: ["Create one record."],
      mvp: ["Persist a mutation exactly once."],
      nonGoals: ["No external provider activation is asserted."],
      userJourneys: ["A user submits a record with one stable request id."],
      acceptanceCriteria: ["Source checks pass and missing runtime configuration fails closed."],
      requirements: snapshot,
    },
    architecture: {
      kind: "helix_production_architecture",
      schemaVersion: "1.0.0",
      productType: "service_app",
      frontendArchitecture: "A browser client calls one approved mutation.",
      backendArchitecture: "A Node service composes request policy and PostgreSQL adapters.",
      dataFlow: ["authorization -> rate limit -> idempotency -> transaction"],
      screenMap: ["Records"],
      routeMap: ["POST /api/records"],
      databaseRequirements:
        "PostgreSQL stores records, subject-scoped idempotency, and durable rate windows.",
      authModel: "The approved operation is public and rate limited.",
      deploymentTarget: "netlify",
      failureModes: ["Missing environment, subject, or database contracts fail closed."],
      requirements: snapshot,
    },
  };
}

function evidenceProvider(nimbus) {
  const secret = "n".repeat(48);
  return ({ productionRequirements, baseWorkspaceSha256 }) => ({
    envelope: nimbus.signNimbusDecisionEvidenceEnvelope(
      {
        kind: "nimbus_provider_evidence",
        version: "1.0.0",
        sourceId: "controlled-source-catalog",
        keyId: "controlled-source-key",
        observedAt: NOW,
        candidateWorkspaceSha256: baseWorkspaceSha256,
        productionRequirementsSha256:
          nimbus.nimbusProductionRequirementsSha256(productionRequirements),
        planning: {
          decisionHorizonEndsAt: "2027-08-20T10:00:00.000Z",
          requiredRegion: "eu-west",
          usage: {
            monthlyRequests: 10_000,
            egressGb: 1,
            databaseStorageGb: 1,
            objectStorageGb: 0,
          },
          policy: {
            maxQuoteAgeMs: 24 * 60 * 60 * 1_000,
            costRiskBufferRatio: 0.2,
            maxMonthlyCostUsd: 100,
          },
        },
        candidates: [
          {
            id: "controlled-netlify-postgres",
            displayName: "Controlled Netlify PostgreSQL",
            configurationAdapter: "netlify",
            regions: ["eu-west"],
            runtimes: [
              {
                id: "node_22_serverless_functions",
                supportedUntil: "2028-08-20T10:00:00.000Z",
              },
            ],
            databaseServices: [{ id: "controlled-postgres", kind: "postgresql" }],
            storageServices: [],
            cdnAvailable: true,
            secretStoreAvailable: true,
            quote: {
              reference: "controlled-source-quote",
              observedAt: NOW,
              currency: "USD",
            },
            pricing: {
              baseMonthlyUsd: 5,
              perMillionRequestsUsd: 1,
              perEgressGbUsd: 0.1,
              databaseBaseMonthlyUsd: 5,
              databasePerGbUsd: 1,
              storageBaseMonthlyUsd: 0,
              storagePerGbUsd: 0,
            },
          },
        ],
      },
      secret,
    ),
    verifier: {
      expectedSourceId: "controlled-source-catalog",
      expectedKeyId: "controlled-source-key",
      hmacSecret: secret,
      maxEvidenceAgeMs: 24 * 60 * 60 * 1_000,
      now: NOW,
    },
  });
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

test("a configured service_app composes real source ports without claiming provider activation", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const [production, graph, workspace, release, nimbus] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/production/index.ts"),
    vite.ssrLoadModule("/src/lib/production-artifact-graph.ts"),
    vite.ssrLoadModule("/src/lib/workspace.ts"),
    vite.ssrLoadModule("/src/lib/server/release/production-workspace.ts"),
    vite.ssrLoadModule("/src/lib/server/production/nimbus-decision.ts"),
  ]);
  const approvedRequirements = graph.ProductionRequirementsSchema.parse(requirements());
  const assembled = await production.assembleProductionSource(
    context(graph, approvedRequirements),
    { nimbusDecisionEvidenceProvider: evidenceProvider(nimbus) },
  );
  assert.equal(assembled.artifacts.nimbus.activation, "source_configured");
  assert.equal(assembled.artifacts.nimbus.activationEvidence.status, "not_verified");
  assert.deepEqual(assembled.artifacts.nimbus.runtimeSourcePaths, [
    "server/runtime/authorization.js",
    "server/runtime/composition.js",
    "server/runtime/environment.js",
    "server/runtime/operations.js",
    "server/runtime/postgres.js",
  ]);
  assert.match(assembled.files["db/schema.sql"], /subject_sha256/u);
  assert.match(
    assembled.files["server/runtime/postgres.js"],
    /AsyncLocalStorage|subject_sha256/u,
  );
  assert.match(assembled.files["server/runtime/postgres.js"], /SELECT id, payload/u);
  assert.match(assembled.files["apps/web/src/main.js"], /createOperationClient/u);
  assert.match(assembled.files["apps/web/src/main.js"], /binding\.client\.execute/u);
  assert.match(assembled.files["apps/web/src/main.js"], /dataset\.state = "loading"/u);
  assert.doesNotMatch(assembled.files["apps/web/src/main.js"], /validated locally/u);
  assert.match(assembled.files["netlify.toml"], /max-age=31536000, immutable/u);
  assert.match(assembled.files["infra/monitoring.js"], /production_request_failed/u);
  assert.equal(JSON.parse(assembled.files["package.json"]).dependencies.pg, "8.23.0");

  const accountRequirements = graph.ProductionRequirementsSchema.parse(
    requirements({
      dataSensitivity: "server_private",
      identity: "accounts",
      serverOperations: "authenticated",
      rationale:
        "Account records require an identity issuer and lifecycle before authenticated routes can activate.",
      apiOperations: [
        {
          operationId: "create_record",
          method: "POST",
          path: "/api/records",
          access: { kind: "authenticated" },
          rateLimitRequired: true,
          idempotencyRequired: true,
        },
      ],
    }),
  );
  const accountAssembly = await production.assembleProductionSource(
    context(graph, accountRequirements),
    { nimbusDecisionEvidenceProvider: evidenceProvider(nimbus) },
  );
  assert.equal(accountAssembly.artifacts.nimbus.activation, "not_configured");
  assert.equal(
    accountAssembly.artifacts.nimbus.bindingContracts.includes("identity_issuer"),
    true,
  );
  assert.deepEqual(accountAssembly.artifacts.nimbus.runtimeSourcePaths, []);
  assert.match(accountAssembly.files["db/schema.sql"], /PRIMARY KEY \(owner_id, id\)/u);
  assert.equal(accountAssembly.artifacts.key.logoutImplemented, false);
  assert.equal(accountAssembly.artifacts.key.recovery.status, "available_library");

  const prepared = await workspace.createProductionWorkspaceCandidate({
    jobId: "service-runtime-job",
    projectId: "service-runtime-project",
    locale: "en",
    pipelineVersion: "service-runtime-v1",
    createdAt: NOW,
    entrypoint: assembled.entrypoint,
    files: assembled.files,
  });
  const configuredEnvironmentNames = assembled.files[".env.example"]
    .split(/\r?\n/u)
    .filter((line) => /^[A-Z][A-Z0-9_]*=$/u.test(line))
    .map((line) => line.slice(0, -1));
  const configuredGraph = await graph.buildProductionArtifactGraph({
    candidate: prepared.candidate,
    files: prepared.files,
    requirements: assembled.requirements,
    provenance: assembled.provenance,
    artifacts: assembled.artifacts,
    configuredEnvironmentNames,
  });
  const nimbusNode = configuredGraph.nodes.find((node) => node.id === "nimbus");
  assert.equal(nimbusNode.status, "structurally_present");
  assert.equal(nimbusNode.runtimeExecution, "not_run");
  const testEvidencePath = prepared.candidate.files.find(
    (descriptor) => descriptor.role === "test",
  ).path;
  const capabilities = release.productionWorkspaceCapabilities({
    graph: configuredGraph,
    entrypoint: assembled.entrypoint,
    testEvidencePath,
  });
  assert.equal(
    capabilities.some(({ status }) => ["blocked", "not_configured"].includes(status)),
    false,
  );
  assert.match(
    capabilities.find(({ id }) => id === "deployment").detail,
    /activation remains not verified/iu,
  );

  const missingEnvironmentGraph = await graph.buildProductionArtifactGraph({
    candidate: prepared.candidate,
    files: prepared.files,
    requirements: assembled.requirements,
    provenance: assembled.provenance,
    artifacts: assembled.artifacts,
    configuredEnvironmentNames: [],
  });
  assert.equal(
    missingEnvironmentGraph.nodes.find((node) => node.id === "nimbus").status,
    "not_configured",
  );

  const tamperedFiles = {
    ...prepared.files,
    "server/runtime/postgres.js":
      prepared.files["server/runtime/postgres.js"] + "\n// post-graph tamper\n",
  };
  const tamperedCandidate = await workspace.createProductionWorkspaceCandidate({
    jobId: "service-runtime-job",
    projectId: "service-runtime-project",
    locale: "en",
    pipelineVersion: "service-runtime-v1",
    createdAt: NOW,
    entrypoint: assembled.entrypoint,
    files: tamperedFiles,
  });
  const tamperVerification = await graph.verifyProductionArtifactGraph({
    candidate: tamperedCandidate.candidate,
    files: tamperedCandidate.files,
    graph: configuredGraph,
  });
  assert.equal(tamperVerification.valid, false);

  const root = await mkdtemp(join(tmpdir(), "helix-production-service-runtime-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  await materialize(assembled.files, root);
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
    root,
  );
  await run(process.execPath, ["scripts/lint.mjs"], root);
  const generatedTests = Object.keys(assembled.files).filter(
    (path) => path.startsWith("tests/") && path.endsWith(".test.mjs"),
  );
  await run(process.execPath, ["--test", ...generatedTests], root);
  await run(process.execPath, ["scripts/build.mjs"], root);
  assert.match(
    await readFile(join(root, "dist", "infra", "netlify", "functions", "api.js"), "utf8"),
    /composeProductionRuntimeBindings/u,
  );
});
