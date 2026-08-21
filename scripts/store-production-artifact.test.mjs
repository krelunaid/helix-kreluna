import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NOW = "2026-08-20T10:00:00.000Z";

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
  const [workspace, store] = await Promise.all([
    vite.ssrLoadModule("/src/lib/workspace.ts"),
    vite.ssrLoadModule("/src/lib/server/release/store-production-artifact.ts"),
  ]);
  return { workspace, store };
}

function requirements(runtimeProfile) {
  const common = {
    kind: "helix_production_requirements",
    schemaVersion: "1.0.0",
    contractPath: "docs/requirements.json",
    storage: "none",
    privilegedOperations: false,
    integrations: [],
    rationale: `Measured fixture for ${runtimeProfile}.`,
    evidencePaths: ["docs/architecture.json", "docs/prd.json"],
  };
  if (runtimeProfile === "static_site") {
    return {
      ...common,
      runtimeProfile,
      dataModel: "bundled_read_only",
      dataSensitivity: "public",
      identity: "none",
      roles: [],
      serverOperations: "none",
      monitoringScope: "static_delivery",
      apiOperations: [],
    };
  }
  if (runtimeProfile === "client_only_app") {
    return {
      ...common,
      runtimeProfile,
      dataModel: "device_local",
      dataSensitivity: "device_private",
      identity: "none",
      roles: [],
      serverOperations: "none",
      monitoringScope: "client_runtime",
      apiOperations: [],
    };
  }
  return {
    ...common,
    runtimeProfile: "service_app",
    dataModel: "server_persistent",
    dataSensitivity: "server_private",
    identity: "accounts",
    roles: [],
    serverOperations: "authenticated",
    monitoringScope: "full_stack",
    apiOperations: [
      {
        operationId: "list_items",
        method: "GET",
        path: "/api/items",
        access: { kind: "authenticated" },
        rateLimitRequired: true,
        idempotencyRequired: false,
      },
    ],
  };
}

function workspaceFiles(runtimeProfile) {
  return {
    ".env.example": "PUBLIC_ORIGIN=\n",
    "README.md": "# Production Store fixture\n",
    "apps/web/index.html":
      '<!doctype html><html><head><title>Static product</title><link rel="stylesheet" href="./src/styles.css"></head><body><main>Approved static product</main><script type="module" src="./src/main.js"></script></body></html>',
    "apps/web/src/main.js": "document.body.dataset.ready = 'true';\n",
    "apps/web/src/styles.css": "body { color: #111; }\n",
    "db/migrations/not-required.md": "# No database migration required\n",
    "docs/architecture.json": JSON.stringify({ title: "Architecture" }),
    "docs/decisions.md": "# Decisions\n",
    "docs/prd.json": JSON.stringify({ title: "PRD" }),
    "docs/requirements.json": JSON.stringify(requirements(runtimeProfile)),
    "docs/score.md": "# Score\n\n100/100 fixture.\n",
    "infra/monitoring.js": "export const configured = true;\n",
    "netlify.toml": '[build]\ncommand = "npm run build"\n',
    "tests/static.test.mjs": "export const tested = true;\n",
  };
}

function capabilities() {
  return [
    ["api", "docs/architecture.json"],
    ["auth", "docs/architecture.json"],
    ["backend", "docs/architecture.json"],
    ["database", "db/migrations/not-required.md"],
    ["deployment", "netlify.toml"],
    ["frontend", "apps/web/index.html"],
    ["integrations", "docs/architecture.json"],
    ["monitoring", "infra/monitoring.js"],
    ["tests", "tests/static.test.mjs"],
  ].map(([id, evidencePath]) => ({
    id,
    status: ["frontend", "deployment", "monitoring", "tests"].includes(id)
      ? "implemented"
      : "not_required",
    detail: `${id} capability is explicitly classified by the fixture.`,
    evidencePaths: [evidencePath],
  }));
}

function validations() {
  return ["build", "lint", "security", "test", "typecheck"].map((scope) => ({
    scope,
    status: "passed",
    evidence: "measured",
    detail: `${scope} passed against this exact source fixture.`,
    tool: `fixture-${scope}`,
    completedAt: NOW,
    evidencePaths: [],
  }));
}

async function approvedSource(workspace, runtimeProfile = "static_site") {
  const files = workspaceFiles(runtimeProfile);
  const sealed = await workspace.sealWorkspace({
    jobId: `job-store-${runtimeProfile}`,
    projectId: "project-store-production",
    locale: "en",
    pipelineVersion: "helix-test-v1",
    createdAt: NOW,
    buildLevel: "production",
    entrypoint: "apps/web/index.html",
    files,
    capabilities: capabilities(),
    validations: validations(),
  });
  const html =
    "<!doctype html><html><head><title>Approved Production preview</title></head><body><main>Static product</main></body></html>";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(html));
  const artifactSha256 = Buffer.from(digest).toString("hex");
  return {
    jobId: `job-store-${runtimeProfile}`,
    buildLevel: "production",
    html,
    artifactSha256,
    files: sealed.files,
    workspace: sealed.manifest,
  };
}

function identity(platform = "android") {
  return {
    platform,
    appIdentifier: "com.kreluna.productionfixture",
    easProjectId: "11111111-1111-4111-8111-111111111111",
    version: "1.2.3",
    appleTeamId: platform === "ios" ? "AB12C3D4E5" : null,
    destination: platform === "ios" ? "testflight" : "play_internal",
  };
}

function packageInput(source, platform = "android") {
  return {
    source,
    identity: identity(platform),
    title: "Production fixture",
    slug: "production-fixture",
    liveUrl: "https://example.invalid/a/production-fixture",
  };
}

test("Orbit prepares a deterministic, hash-bound Production static wrapper", async (t) => {
  const { workspace, store } = await modules(t);
  const source = await approvedSource(workspace);
  const first = await store.prepareApprovedProductionStorePackage(packageInput(source));
  const second = await store.prepareApprovedProductionStorePackage(
    packageInput({ ...source, files: Object.fromEntries(Object.entries(source.files).reverse()) }),
  );

  assert.deepEqual(first, second);
  assert.equal(first.manifest.artifactKind, "web_to_native_wrapper");
  assert.equal(first.manifest.sourceBuildLevel, "production");
  assert.equal(first.manifest.nativeImplementation, false);
  assert.equal(first.manifest.runtimeProfile, "static_site");
  assert.equal(first.manifest.networkPolicy, "offline_embedded_document");
  assert.equal(first.manifest.sourceWorkspaceSha256, source.workspace.artifactSha256);
  assert.equal(first.descriptor.sourcePreviewSha256, source.artifactSha256);
  assert.equal(first.descriptor.sourceBuildLevel, "production");
  assert.equal(first.descriptor.packagingProfile, "orbit_expo_static_wrapper_v1");
  assert.equal(first.status, "source_package_prepared");
  assert.equal(first.submissionStatus, "not_executed");
  assert.ok(first.files[store.STORE_PACKAGE_MANIFEST_PATH]);

  const app = JSON.parse(first.files["app.json"]);
  const eas = JSON.parse(first.files["eas.json"]);
  const packageJson = JSON.parse(first.files["package.json"]);
  assert.equal(app.expo.version, "1.2.3");
  assert.equal(eas.cli.appVersionSource, "remote");
  assert.equal(eas.build.production.autoIncrement, true);
  assert.equal(packageJson.dependencies.expo, "52.0.0");
  assert.match(first.files["App.js"], /WebView/);
  assert.doesNotMatch(first.files["App.js"], /nativeImplementation\s*:\s*true/);

  const verified = await store.verifyProductionStorePackageFiles({
    files: first.files,
    descriptor: first.descriptor,
    expectedIdentity: identity(),
  });
  assert.deepEqual(verified, first.manifest);
});

test("Production package provenance rejects content, manifest, and workspace tampering", async (t) => {
  const { workspace, store } = await modules(t);
  const source = await approvedSource(workspace);
  const prepared = await store.prepareApprovedProductionStorePackage(packageInput(source));

  await assert.rejects(
    store.verifyProductionStorePackageFiles({
      files: { ...prepared.files, "App.js": `${prepared.files["App.js"]}\n// tampered` },
      descriptor: prepared.descriptor,
      expectedIdentity: identity(),
    }),
    (error) => error?.code === "STORE_PRODUCTION_PACKAGE_INVALID",
  );
  await assert.rejects(
    store.verifyProductionStorePackageFiles({
      files: { ...prepared.files, "unlisted.js": "export default true;\n" },
      descriptor: prepared.descriptor,
      expectedIdentity: identity(),
    }),
    (error) => error?.code === "STORE_PRODUCTION_PACKAGE_INVALID",
  );
  await assert.rejects(
    store.verifyProductionStorePackageFiles({
      files: prepared.files,
      descriptor: prepared.descriptor,
      expectedIdentity: {
        ...identity(),
        appIdentifier: "com.kreluna.anotherapplication",
      },
    }),
    (error) => error?.code === "STORE_PRODUCTION_PACKAGE_INVALID",
  );
  await assert.rejects(
    store.prepareApprovedProductionStorePackage(
      packageInput({
        ...source,
        files: { ...source.files, "apps/web/src/main.js": "tampered\n" },
      }),
    ),
    (error) => error?.code === "STORE_PRODUCTION_WORKSPACE_INVALID",
  );
});

test("client-only and service Production workspaces remain fail-closed", async (t) => {
  const { workspace, store } = await modules(t);
  for (const runtimeProfile of ["client_only_app", "service_app"]) {
    const source = await approvedSource(workspace, runtimeProfile);
    await assert.rejects(
      store.prepareApprovedProductionStorePackage(packageInput(source)),
      (error) =>
        error?.code === "STORE_PRODUCTION_RUNTIME_UNSUPPORTED" &&
        error.runtimeProfile === runtimeProfile,
      runtimeProfile,
    );
  }
});
