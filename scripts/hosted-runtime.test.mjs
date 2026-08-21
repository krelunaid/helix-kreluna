import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(import.meta.dirname, "..");
const HOSTED_NAMES = [
  "HELIX_RUNTIME_ENV",
  "NETLIFY",
  "NETLIFY_DEPLOY_ID",
  "DEPLOY_ID",
  "SITE_ID",
  "AWS_LAMBDA_FUNCTION_NAME",
  "LAMBDA_TASK_ROOT",
  "CONTEXT",
];

function childEnvironment(overrides = {}) {
  const environment = { ...process.env, ...overrides };
  delete environment.DATABASE_URL;
  for (const name of HOSTED_NAMES) delete environment[name];
  return { ...environment, ...overrides };
}

function importDatabase(environment) {
  const cacheDir = mkdtempSync(join(tmpdir(), "helix-hosted-runtime-vite-"));
  const source = `
    import { createServer } from "vite";
    const vite = await createServer({
      root: process.cwd(), configFile: false, appType: "custom", logLevel: "silent",
      cacheDir: process.env.HELIX_TEST_VITE_CACHE_DIR,
      server: { middlewareMode: true, hmr: false }
    });
    const db = await vite.ssrLoadModule("/src/lib/db.ts");
    process.stdout.write("dbSource=" + db.dbSource + "\\n");
    await vite.close();
  `;
  try {
    return spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
      cwd: ROOT,
      env: { ...environment, HELIX_TEST_VITE_CACHE_DIR: cacheDir },
      encoding: "utf8",
      timeout: 30_000,
    });
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

test("hosted runtime detection is shared and excludes a local production build", async () => {
  const runtime = await import("../src/lib/hosted-runtime.ts");

  assert.equal(runtime.isHostedRuntimeEnvironment({ NODE_ENV: "production" }), false);
  assert.equal(runtime.isHostedRuntimeEnvironment({ HELIX_RUNTIME_ENV: "production" }), true);
  assert.equal(runtime.isHostedRuntimeEnvironment({ AWS_LAMBDA_FUNCTION_NAME: "manual" }), true);
  assert.equal(runtime.isHostedRuntimeEnvironment({ LAMBDA_TASK_ROOT: "/var/task" }), true);
  assert.equal(runtime.isHostedRuntimeEnvironment({ NETLIFY_DEPLOY_ID: "deploy" }), true);
  assert.equal(runtime.isHostedRuntimeEnvironment({ DEPLOY_ID: "deploy", SITE_ID: "site" }), true);
  assert.equal(runtime.isHostedRuntimeEnvironment({ CONTEXT: "deploy-preview" }), true);
  assert.equal(runtime.isNetlifyRuntimeEnvironment({ AWS_LAMBDA_FUNCTION_NAME: "manual" }), false);
  assert.equal(runtime.isNetlifyRuntimeEnvironment({ NETLIFY_DEPLOY_ID: "deploy" }), true);
});

test("a direct database import fails closed in a manual hosted runtime", () => {
  const hosted = importDatabase(
    childEnvironment({ AWS_LAMBDA_FUNCTION_NAME: "manual-hosted-runtime" }),
  );
  const output = `${hosted.stdout}\n${hosted.stderr}`;
  assert.notEqual(hosted.status, 0, output);
  assert.match(output, /DATABASE_URL \(PGLite is local-only\)/u);
  assert.doesNotMatch(output, /dbSource=pglite/u);
});

test("a direct local database import retains the PGLite development fallback", () => {
  const local = importDatabase(childEnvironment({ NODE_ENV: "production" }));
  const output = `${local.stdout}\n${local.stderr}`;
  assert.equal(local.status, 0, output);
  assert.match(local.stdout, /dbSource=pglite/u);
});

test("hosted dispatch and guest safeguards use the shared detector", async () => {
  const sources = await Promise.all(
    [
      "src/lib/server/billing/queue.ts",
      "src/lib/server/jobs/dispatch.server.ts",
      "src/lib/server/guest-abuse.server.ts",
    ].map((path) => readFile(join(ROOT, path), "utf8")),
  );
  for (const source of sources) {
    assert.match(source, /isHostedRuntimeEnvironment/u);
    assert.doesNotMatch(source, /process\.env\.NETLIFY\s*===\s*["']true["']/u);
  }
  assert.match(sources[2], /isNetlifyRuntimeEnvironment/u);
});
