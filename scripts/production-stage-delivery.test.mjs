import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const execFileAsync = promisify(execFile);

async function loadModules(t) {
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
    production: await vite.ssrLoadModule("/src/lib/production-artifact-graph.ts"),
    workspace: await vite.ssrLoadModule("/src/lib/workspace.ts"),
    assembler: await vite.ssrLoadModule("/src/lib/server/production/index.ts"),
    scaffold: await vite.ssrLoadModule("/src/lib/server/production/scaffold.ts"),
    delivery: await vite.ssrLoadModule("/src/lib/server/production/delivery.ts"),
    stages: await vite.ssrLoadModule("/src/lib/server/production/stages/index.ts"),
    types: await vite.ssrLoadModule("/src/lib/server/production/types.ts"),
  };
}

function requirementSnapshot(source) {
  return {
    runtimeProfile: source.runtimeProfile,
    dataModel: source.dataModel,
    dataSensitivity: source.dataSensitivity,
    storage: source.storage,
    identity: source.identity,
    roles: source.roles,
    serverOperations: source.serverOperations,
    privilegedOperations: source.privilegedOperations,
    monitoringScope: source.monitoringScope,
    integrations: source.integrations,
    apiOperations: source.apiOperations,
  };
}

function requirements(overrides) {
  return {
    kind: "helix_production_requirements",
    schemaVersion: "1.0.0",
    contractPath: "docs/requirements.json",
    runtimeProfile: "static_site",
    dataModel: "bundled_read_only",
    dataSensitivity: "public",
    storage: "none",
    identity: "none",
    roles: [],
    serverOperations: "none",
    privilegedOperations: false,
    monitoringScope: "static_delivery",
    integrations: [],
    apiOperations: [],
    rationale: "The approved profile is deliberately bounded and requirements-derived.",
    evidencePaths: ["docs/architecture.json", "docs/prd.json"],
    ...overrides,
  };
}

function approvedContext(source, title) {
  const snapshot = requirementSnapshot(source);
  return {
    requirements: source,
    prd: {
      kind: "helix_production_prd",
      schemaVersion: "1.0.0",
      title,
      target: "People using the approved bounded workflow.",
      problem: "The approved workflow needs a deterministic multi-file Production candidate.",
      useCases: ["Use the approved workflow through its declared runtime profile."],
      mvp: ["Deliver only capabilities present in the requirements contract."],
      nonGoals: ["No deployment or external service activation is implied."],
      userJourneys: ["A user opens the application and completes the approved workflow."],
      acceptanceCriteria: ["Every generated stage is requirements-derived and hash-fenced."],
      requirements: snapshot,
    },
    architecture: {
      kind: "helix_production_architecture",
      schemaVersion: "1.0.0",
      productType: source.runtimeProfile,
      frontendArchitecture: "A multi-file browser application receives explicit stage bindings.",
      backendArchitecture:
        source.runtimeProfile === "service_app"
          ? "Server ports isolate persistence, authentication, routes, and integrations."
          : "The approved profile has no server process.",
      dataFlow: ["Approved input -> owned stage source -> independent validation."],
      screenMap: ["Primary workflow"],
      routeMap:
        source.apiOperations.length > 0
          ? source.apiOperations.map(
              (operation) => `${operation.method} ${operation.path} (${operation.operationId})`,
            )
          : ["GET / (application entrypoint)"],
      databaseRequirements:
        source.dataModel === "server_persistent"
          ? "PostgreSQL schema, migration, ownership, rollback, and backup review are required."
          : "No server-persistent database is approved.",
      authModel:
        source.identity === "none"
          ? "No identity-bearing workflow is approved."
          : "Signed sessions and approved route authorization are required.",
      deploymentTarget: "netlify",
      failureModes: ["A stale hash, path collision, or missing prior stage blocks delivery."],
      requirements: snapshot,
    },
  };
}

function staticProfile() {
  return requirements({});
}

function clientProfile() {
  return requirements({
    runtimeProfile: "client_only_app",
    dataModel: "device_local",
    dataSensitivity: "device_private",
    monitoringScope: "client_runtime",
    rationale: "The approved application stores private state only on the user's device.",
  });
}

function serviceProfile() {
  return requirements({
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
        id: "google_oauth",
        kind: "google_oauth",
        execution: "server",
        purpose: "Verify an approved Google OAuth callback through server-owned ports.",
        envNames: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
        requiresCallback: true,
      },
      {
        id: "stripe",
        kind: "stripe",
        execution: "server",
        purpose: "Process verified payment events through a server-owned adapter.",
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
      "The approved service uses private persistent records, role authorization, object storage, and verified payment events.",
  });
}

async function initialState(modules, source, title) {
  const scaffold = await modules.scaffold.createTrustedProductionScaffold(
    approvedContext(source, title),
  );
  return {
    scaffold,
    state: await modules.delivery.createProductionDeliveryState(scaffold),
  };
}

async function applyRequiredStages(modules, initial) {
  let state = initial;
  const deliveries = [];
  for (const stageId of modules.stages.requiredProductionStageIds(state.requirements)) {
    const input = {
      requirements: state.requirements,
      baseWorkspaceSha256: state.workspaceSha256,
    };
    const first = modules.stages.generateProductionStageDelivery(stageId, input);
    const second = modules.stages.generateProductionStageDelivery(stageId, input);
    assert.deepEqual(first, second, `${stageId} generator must be deterministic`);
    assert.equal(first.artifact.status, "source_candidate");
    assert.ok(
      !/deployed|provisioned|connection succeeded|runtime passed/iu.test(first.artifact.summary),
    );
    deliveries.push(first);
    state = await modules.delivery.applyProductionStageDelivery(state, first);
  }
  return { state, deliveries };
}

async function materializeWorkspace(root, files) {
  for (const [path, content] of Object.entries(files)) {
    const destination = join(root, path);
    await mkdir(join(destination, ".."), { recursive: true });
    await writeFile(destination, content, "utf8");
  }
}

test("Production stage delivery is deterministic, hash-fenced, and path-owned", async (t) => {
  const modules = await loadModules(t);

  await t.test("the registry truthfully describes available deterministic generators", () => {
    for (const contract of Object.values(modules.production.PRODUCTION_ARTIFACT_CONTRACTS)) {
      assert.equal(contract.activation, "available_library_generator");
      assert.equal(contract.producerKind, "deterministic_template_generator");
    }
  });

  await t.test("the trusted scaffold pins its package and approved evidence", async () => {
    const context = approvedContext(staticProfile(), "Static profile");
    const first = await modules.scaffold.createTrustedProductionScaffold(context);
    const second = await modules.scaffold.createTrustedProductionScaffold(context);
    assert.deepEqual(first, second);
    const packageJson = JSON.parse(
      first.files.find((file) => file.path === "package.json").content,
    );
    const lock = JSON.parse(first.files.find((file) => file.path === "package-lock.json").content);
    assert.equal(first.source, "helix_built_in_template");
    assert.equal(packageJson.devDependencies.typescript, "5.9.3");
    assert.equal(lock.lockfileVersion, 3);
    assert.equal(lock.packages["node_modules/typescript"].version, "5.9.3");
    assert.match(lock.packages["node_modules/typescript"].integrity, /^sha512-/u);
    assert.equal(
      first.files.some((file) => file.path === ".env.example"),
      false,
    );
    const hostile = await modules.scaffold.createTrustedProductionScaffold(
      approvedContext(
        staticProfile(),
        '<img src=x onerror="globalThis.pwned=true"><script>alert(1)</script>',
      ),
    );
    const mainSource = hostile.files.find(
      (file) => file.path === "apps/web/src/main.js",
    ).content;
    assert.match(mainSource, /heading\.textContent/u);
    assert.doesNotMatch(mainSource, /innerHTML|outerHTML|insertAdjacentHTML/u);
  });

  await t.test(
    "static, client-only, and service profiles select exact canonical stages",
    async () => {
      const profiles = [
        [staticProfile(), "Static", ["nimbus"]],
        [clientProfile(), "Client", ["forgeIntegration", "nimbus"]],
        [
          serviceProfile(),
          "Service",
          ["prism", "basalt", "key", "nexus", "vault", "quartz", "forgeIntegration", "nimbus"],
        ],
      ];
      for (const [profile, title, expected] of profiles) {
        const { state: initial } = await initialState(modules, profile, title);
        assert.deepEqual(modules.stages.requiredProductionStageIds(profile), expected);
        const { state, deliveries } = await applyRequiredStages(modules, initial);
        assert.deepEqual(state.completedStages, expected);
        assert.equal(deliveries.length, expected.length);
        for (const delivery of deliveries) {
          assert.ok(state.files[delivery.artifact.contractPath]);
          for (const file of [...delivery.outputFiles, ...delivery.testFiles]) {
            assert.equal(state.files[file.path], file.content);
          }
        }
        if (profile.runtimeProfile === "service_app") {
          const forge = deliveries.find((delivery) => delivery.stageId === "forgeIntegration");
          assert.ok(forge);
          assert.equal(
            forge.artifact.bindings.some(
              (binding) =>
                binding.target.kind === "api" && binding.target.operationId === "stripe_webhook",
            ),
            false,
          );
          assert.equal(
            forge.outputFiles.some((file) => file.path.includes("stripe_webhook")),
            false,
          );
          const nimbus = deliveries.find((delivery) => delivery.stageId === "nimbus");
          assert.equal(nimbus.artifact.decision.status, "not_configured");
          assert.equal(nimbus.artifact.provider, null);
          assert.equal(nimbus.artifact.runtime, null);
          assert.equal(nimbus.artifact.configurationAdapter, null);
          assert.equal(
            nimbus.artifact.activation,
            "not_configured",
          );
          assert.deepEqual(nimbus.artifact.functionPaths, []);
          assert.deepEqual(nimbus.artifact.bindingContracts, [
            "authorization",
            "database",
            "idempotency",
            "identity_issuer",
            "monitoring",
            "object_storage",
            "operation_handlers",
            "rate_limit",
          ]);
          assert.ok(
            nimbus.outputFiles.some(
              (file) => file.path === "infra/nimbus-decision.json",
            ),
          );
          assert.equal(
            nimbus.outputFiles.some((file) => file.path === "netlify.toml"),
            false,
          );
        } else {
          const nimbus = deliveries.find((delivery) => delivery.stageId === "nimbus");
          assert.equal(nimbus.artifact.decision.status, "not_configured");
          assert.equal(nimbus.artifact.provider, null);
          assert.equal(nimbus.artifact.runtime, null);
          assert.equal(nimbus.artifact.activation, "not_configured");
          assert.deepEqual(nimbus.artifact.functionPaths, []);
          assert.deepEqual(nimbus.artifact.bindingContracts, []);
        }
        assert.notEqual(state.workspaceSha256, initial.workspaceSha256);
      }
    },
  );

  await t.test(
    "the public assembler produces graph-verifiable source for every profile",
    async () => {
      const profiles = [staticProfile(), clientProfile(), serviceProfile()];
      for (const profile of profiles) {
        const assembled = await modules.assembler.assembleProductionSource(
          approvedContext(profile, `${profile.runtimeProfile} assembly`),
        );
        const prepared = await modules.workspace.createProductionWorkspaceCandidate({
          jobId: `assembly-${profile.runtimeProfile}`,
          projectId: "production-stage-delivery",
          locale: "it",
          pipelineVersion: "production-stage-library-v1",
          createdAt: "2026-08-20T12:00:00.000Z",
          entrypoint: assembled.entrypoint,
          files: assembled.files,
        });
        const graph = await modules.production.buildProductionArtifactGraph({
          candidate: prepared.candidate,
          files: prepared.files,
          requirements: assembled.requirements,
          provenance: assembled.provenance,
          artifacts: assembled.artifacts,
          configuredEnvironmentNames: [],
        });
        assert.equal(graph.requirements.runtimeProfile, profile.runtimeProfile);
        assert.deepEqual(
          graph.nodes.filter((node) => node.required).map((node) => node.id),
          modules.stages.requiredProductionStageIds(profile),
        );
        assert.ok(assembled.files[assembled.provenance.contractPath]);
        assert.equal(assembled.provenance.files.length, Object.keys(assembled.files).length);
      }
    },
  );

  await t.test("the generated service contracts execute in an isolated workspace", async (t) => {
    const assembled = await modules.assembler.assembleProductionSource(
      approvedContext(serviceProfile(), "Executable service contracts"),
    );
    const temporaryRoot = await mkdtemp(join(tmpdir(), "helix-production-contracts-"));
    t.after(() => rm(temporaryRoot, { force: true, recursive: true }));
    await materializeWorkspace(temporaryRoot, assembled.files);
    const generatedTests = Object.keys(assembled.files).filter(
      (path) => path.startsWith("tests/") && path.endsWith(".test.mjs"),
    );
    assert.ok(generatedTests.length > 0);
    for (const testPath of generatedTests) {
      const result = await execFileAsync(process.execPath, [testPath], {
        cwd: temporaryRoot,
        timeout: 30_000,
      });
      assert.match(`${result.stdout}${result.stderr}`, /fail 0/u, testPath);
    }
    try {
      await execFileAsync(
        process.execPath,
        [
          join(ROOT, "node_modules/typescript/bin/tsc"),
          "--project",
          join(temporaryRoot, "tsconfig.json"),
          "--typeRoots",
          join(ROOT, "node_modules/@types"),
        ],
        { cwd: temporaryRoot, timeout: 30_000 },
      );
    } catch (error) {
      assert.fail(`${error.stdout ?? ""}${error.stderr ?? ""}`);
    }
  });

  await t.test("stale hashes and skipped required stages are blocked", async () => {
    const { state } = await initialState(modules, clientProfile(), "Client ordering");
    const forge = modules.stages.generateForgeIntegrationDelivery({
      requirements: state.requirements,
      baseWorkspaceSha256: state.workspaceSha256,
    });
    const afterForge = await modules.delivery.applyProductionStageDelivery(state, forge);
    await assert.rejects(
      () => modules.delivery.applyProductionStageDelivery(afterForge, forge),
      /Stale Production delivery/u,
    );
    const nimbus = modules.stages.generateNimbusDelivery({
      requirements: state.requirements,
      baseWorkspaceSha256: state.workspaceSha256,
    });
    await assert.rejects(
      () => modules.delivery.applyProductionStageDelivery(state, nimbus),
      /out of canonical order/u,
    );
  });

  await t.test(
    "ownership escapes, collisions, and artifact/file divergence are blocked",
    async () => {
      const { state } = await initialState(modules, clientProfile(), "Client boundaries");
      const valid = modules.stages.generateForgeIntegrationDelivery({
        requirements: state.requirements,
        baseWorkspaceSha256: state.workspaceSha256,
      });
      const escaped = structuredClone(valid);
      escaped.artifact.outputPaths = ["server/stolen.js"];
      escaped.artifact.bindings[0].clientPath = "server/stolen.js";
      escaped.outputFiles[0].path = "server/stolen.js";
      await assert.rejects(
        () => modules.delivery.applyProductionStageDelivery(state, escaped),
        /cannot own output path/u,
      );

      const divergent = structuredClone(valid);
      divergent.artifact.outputPaths = ["apps/web/src/integrations/different.js"];
      assert.equal(modules.types.ProductionStageDeliverySchema.safeParse(divergent).success, false);

      const occupiedFiles = Object.freeze({
        ...state.files,
        "apps/web/src/integrations/LOCAL-STATE.js": "export const occupied = true;\n",
      });
      const occupiedState = {
        ...state,
        files: occupiedFiles,
        workspaceSha256: await modules.delivery.hashProductionWorkspace(occupiedFiles),
      };
      const colliding = modules.stages.generateForgeIntegrationDelivery({
        requirements: occupiedState.requirements,
        baseWorkspaceSha256: occupiedState.workspaceSha256,
      });
      await assert.rejects(
        () => modules.delivery.applyProductionStageDelivery(occupiedState, colliding),
        /path collision/u,
      );
    },
  );
});
