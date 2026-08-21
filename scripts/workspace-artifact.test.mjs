import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

async function loadWorkspaceModule(t) {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  return vite.ssrLoadModule("/src/lib/workspace.ts");
}

function prototypeInput(files) {
  return {
    jobId: "job-workspace-1",
    projectId: "project-workspace-1",
    locale: "it",
    pipelineVersion: "helix-test-v1",
    createdAt: "2026-08-20T12:00:00.000Z",
    buildLevel: "prototype",
    entrypoint: "index.html",
    files,
  };
}

function productionFiles() {
  return {
    "README.md": "# Production workspace\n",
    "docs/prd.md": "# PRD\n",
    "docs/architecture.md": "# Architecture\n",
    "apps/web/index.html": "<!doctype html><html><title>App</title></html>",
    "apps/web/src/main.ts": "export const ready = true;\n",
    ".env.example": "PUBLIC_ORIGIN=\n",
    "db/migrations/0001_initial.sql": "create table example(id text primary key);\n",
    "tests/app.test.ts": "export const testExists = true;\n",
    "netlify.toml": '[build]\ncommand = "npm run build"\n',
    "infra/monitoring.ts": "export const monitoringConfigured = true;\n",
    "docs/decisions.md": "# Decisions\n",
    "docs/score.md": "# Score\n",
  };
}

function productionCapabilities() {
  return [
    {
      id: "frontend",
      status: "implemented",
      detail: "Frontend source and entrypoint are present.",
      evidencePaths: ["apps/web/index.html", "apps/web/src/main.ts"],
    },
    {
      id: "backend",
      status: "not_required",
      detail: "The architecture explicitly requires no server runtime.",
      evidencePaths: ["docs/architecture.md"],
    },
    {
      id: "api",
      status: "not_required",
      detail: "The architecture explicitly requires no API.",
      evidencePaths: ["docs/architecture.md"],
    },
    {
      id: "database",
      status: "not_required",
      detail: "The migration records the no-runtime-data baseline.",
      evidencePaths: ["db/migrations/0001_initial.sql"],
    },
    {
      id: "auth",
      status: "not_required",
      detail: "The product has no identity-bearing user journey.",
      evidencePaths: ["docs/prd.md"],
    },
    {
      id: "integrations",
      status: "not_required",
      detail: "The approved architecture has no external integrations.",
      evidencePaths: ["docs/architecture.md"],
    },
    {
      id: "tests",
      status: "implemented",
      detail: "Automated tests are present and measured.",
      evidencePaths: ["tests/app.test.ts"],
    },
    {
      id: "deployment",
      status: "implemented",
      detail: "A provider-specific deployment file is present.",
      evidencePaths: ["netlify.toml"],
    },
    {
      id: "monitoring",
      status: "implemented",
      detail: "A production monitoring configuration is present and validated.",
      evidencePaths: ["infra/monitoring.ts"],
    },
  ];
}

function productionValidations(status = "passed") {
  return ["typecheck", "lint", "test", "build", "security"].map((scope) => ({
    scope,
    status,
    evidence: "measured",
    detail: `${scope} executed against this exact workspace.`,
    tool: `test-${scope}`,
    completedAt: "2026-08-20T12:05:00.000Z",
    evidencePaths: [],
  }));
}

function productionInput(overrides = {}) {
  return {
    jobId: "job-production-1",
    locale: "en",
    pipelineVersion: "helix-test-v1",
    createdAt: "2026-08-20T12:00:00.000Z",
    buildLevel: "production",
    entrypoint: "apps/web/index.html",
    files: productionFiles(),
    capabilities: productionCapabilities(),
    validations: productionValidations(),
    ...overrides,
  };
}

test("workspace artifacts are deterministic, bounded, and fail closed", async (t) => {
  const workspace = await loadWorkspaceModule(t);

  await t.test("sealing is independent of source record order", async () => {
    const firstFiles = {
      "styles/app.css": "body { color: #111; }\n",
      "index.html": "<!doctype html><html><title>Prototype</title></html>",
      "scripts/app.js": "document.body.dataset.ready = 'true';\n",
    };
    const secondFiles = Object.fromEntries(Object.entries(firstFiles).reverse());
    const first = await workspace.sealWorkspace(prototypeInput(firstFiles));
    const second = await workspace.sealWorkspace(prototypeInput(secondFiles));

    assert.deepEqual(first.files, second.files);
    assert.deepEqual(first.manifest, second.manifest);
    assert.match(first.manifest.artifactSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(
      first.manifest.files.map((file) => file.path),
      [...first.manifest.files.map((file) => file.path)].sort(),
    );

    const verification = await workspace.verifyWorkspace(first.files, first.manifest);
    assert.equal(verification.valid, true, verification.errors.join("\n"));
    const exported = await workspace.workspaceExportFiles(first.files, first.manifest);
    assert.ok(exported[workspace.WORKSPACE_MANIFEST_PATH]);
    assert.equal(
      first.manifest.files.some((file) => file.path === workspace.WORKSPACE_MANIFEST_PATH),
      false,
    );
    assert.equal(first.manifest.fileCount, 3);
    assert.equal(Object.keys(exported).length, 4);
  });

  await t.test("content and manifest tampering are detected", async () => {
    const sealed = await workspace.sealWorkspace(
      prototypeInput({ "index.html": "<!doctype html><title>Original</title>" }),
    );
    const contentTamper = await workspace.verifyWorkspace(
      { ...sealed.files, "index.html": "<!doctype html><title>Tampered</title>" },
      sealed.manifest,
    );
    assert.equal(contentTamper.valid, false);
    assert.match(contentTamper.errors.join("\n"), /descriptors/i);

    const manifestTamper = await workspace.verifyWorkspace(sealed.files, {
      ...sealed.manifest,
      jobId: "different-job",
    });
    assert.equal(manifestTamper.valid, false);
    assert.match(manifestTamper.errors.join("\n"), /artifact hash/i);

    await assert.rejects(
      workspace.workspaceExportFiles(
        { ...sealed.files, "index.html": "tampered" },
        sealed.manifest,
      ),
      /invalid workspace/i,
    );
  });

  await t.test("unsafe paths and normalized collisions are rejected", async () => {
    const unsafePaths = [
      "../escape.txt",
      "/absolute.txt",
      "windows\\path.txt",
      "C:drive.txt",
      "encoded%2fpath.txt",
      ".env",
      ".git/config",
      "node_modules/package/index.js",
      "CON.txt",
      "bad\u0000path.txt",
      workspace.WORKSPACE_MANIFEST_PATH,
    ];
    for (const path of unsafePaths) {
      await assert.rejects(
        workspace.sealWorkspace({
          ...prototypeInput({ [path]: "unsafe" }),
          entrypoint: path,
        }),
        workspace.WorkspaceValidationError,
        path,
      );
    }

    await assert.rejects(
      workspace.sealWorkspace(
        prototypeInput({
          "index.html": "ok",
          "Readme.md": "one",
          "README.md": "two",
        }),
      ),
      /collision/i,
    );
    await assert.rejects(
      workspace.sealWorkspace(
        prototypeInput({
          "index.html": "ok",
          "docs/caf\u00e9.md": "one",
          "docs/cafe\u0301.md": "two",
        }),
      ),
      /collision/i,
    );

    await assert.rejects(
      workspace.sealWorkspace(
        prototypeInput({
          "index.html": "ok",
          "notes.txt": `${["api", "key"].join("_")}='${["sk", "workspace-fixture-value-123456789"].join("-")}'`,
        }),
      ),
      /potential secret content/i,
    );
    await assert.rejects(
      workspace.sealWorkspace(
        prototypeInput({
          "index.html": "ok",
          ".env.example": "BETTER_AUTH_SECRET=hardcoded-production-value\n",
        }),
      ),
      /empty placeholders/i,
    );
  });

  await t.test("file count, per-file size, and total size limits are enforced", async () => {
    const tooMany = Object.fromEntries(
      Array.from({ length: workspace.MAX_WORKSPACE_FILES + 1 }, (_, index) => [
        `files/${index}.txt`,
        "",
      ]),
    );
    tooMany["index.html"] = "ok";
    await assert.rejects(workspace.sealWorkspace(prototypeInput(tooMany)), /more than 192 files/i);

    await assert.rejects(
      workspace.sealWorkspace(
        prototypeInput({
          "index.html": "x".repeat(workspace.MAX_WORKSPACE_FILE_BYTES + 1),
        }),
      ),
      /file exceeds/i,
    );

    const overTotal = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [
        index === 0 ? "index.html" : `files/${index}.txt`,
        "x".repeat(workspace.MAX_WORKSPACE_FILE_BYTES),
      ]),
    );
    await assert.rejects(workspace.sealWorkspace(prototypeInput(overTotal)), /total UTF-8 bytes/i);
  });

  await t.test(
    "production requires every deliverable and measured passing validation",
    async () => {
      await assert.rejects(
        workspace.sealWorkspace(productionInput({ files: { "apps/web/index.html": "ok" } })),
        /missing required deliverable role/i,
      );
      await assert.rejects(
        workspace.sealWorkspace(productionInput({ validations: [] })),
        /validation must be measured and passed/i,
      );
      await assert.rejects(
        workspace.sealWorkspace(productionInput({ validations: productionValidations("failed") })),
        /validation must be measured and passed/i,
      );
      const blocked = productionCapabilities().map((capability) =>
        capability.id === "auth" ? { ...capability, status: "not_configured" } : capability,
      );
      await assert.rejects(
        workspace.sealWorkspace(productionInput({ capabilities: blocked })),
        /not release-ready/i,
      );

      const sealed = await workspace.sealWorkspace(productionInput());
      assert.equal(sealed.manifest.buildLevel, "production");
      assert.deepEqual(
        new Set(sealed.manifest.files.map((file) => file.role)),
        new Set([
          "entrypoint",
          "source",
          "readme",
          "prd",
          "architecture",
          "environment",
          "migration",
          "test",
          "deployment",
          "decision",
          "score",
        ]),
      );
      const verification = await workspace.verifyWorkspace(sealed.files, sealed.manifest);
      assert.equal(verification.valid, true, verification.errors.join("\n"));
    },
  );
});
