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
  delete environment.NETLIFY_DB_URL;
  for (const name of HOSTED_NAMES) delete environment[name];
  return { ...environment, ...overrides };
}

function importDatabase(environment, options = {}) {
  const cacheDir = mkdtempSync(join(tmpdir(), "helix-hosted-runtime-vite-"));
  const netlifyBootstrap = options.netlifyDatabaseUrl
    ? `globalThis.Netlify = { env: { get: (name) => name === "NETLIFY_DB_URL" ? ${JSON.stringify(options.netlifyDatabaseUrl)} : undefined } };`
    : "";
  const source = `
    ${netlifyBootstrap}
    import { createServer } from "vite";
    const vite = await createServer({
      root: process.cwd(), configFile: false, appType: "custom", logLevel: "silent",
      cacheDir: process.env.HELIX_TEST_VITE_CACHE_DIR,
      server: { middlewareMode: true, hmr: false }
    });
    const db = await vite.ssrLoadModule("/src/lib/db.ts");
    process.stdout.write("dbSource=" + db.dbSource + "\\n");
    if (process.env.HELIX_TEST_EXPECTED_DB_URL) {
      process.stdout.write(
        "databaseMatchesExpected=" +
          String(db.getDatabaseConnectionString() === process.env.HELIX_TEST_EXPECTED_DB_URL) +
          "\\n"
      );
    }
    if (process.env.HELIX_TEST_OPEN_DB === "true") {
      await db.getSql();
      process.stdout.write("sqlReady=true\\n");
    }
    await vite.close();
  `;
  try {
    return spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
      cwd: ROOT,
      env: { ...environment, HELIX_TEST_VITE_CACHE_DIR: cacheDir },
      encoding: "utf8",
      // The local PGLite bootstrap can contend with the full parallel test
      // suite on CI; this remains a bounded child-process guard, not a runtime SLA.
      timeout: 60_000,
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
  assert.match(output, /DATABASE_URL, NETLIFY_DB_URL.*PGLite is local-only/u);
  assert.doesNotMatch(output, /dbSource=pglite/u);
});

test("a direct hosted database import resolves Netlify Database without PGLite", () => {
  const authoritative = "postgresql://netlify:fixture@database.example.test/helix";
  const hosted = importDatabase(
    childEnvironment({
      NETLIFY: "true",
      CONTEXT: "production",
      NETLIFY_DB_URL: authoritative,
      HELIX_TEST_OPEN_DB: "true",
      HELIX_TEST_EXPECTED_DB_URL: authoritative,
    }),
    { netlifyDatabaseUrl: authoritative },
  );
  const output = `${hosted.stdout}\n${hosted.stderr}`;
  assert.equal(hosted.status, 0, output);
  assert.match(hosted.stdout, /dbSource=netlify/u);
  assert.match(hosted.stdout, /sqlReady=true/u);
  assert.match(hosted.stdout, /databaseMatchesExpected=true/u);
  assert.doesNotMatch(output, /dbSource=pglite/u);
});

test("non-Netlify DATABASE_URL works and SDK/process divergence fails closed", () => {
  const direct = "postgresql://explicit:fixture@database.example.test/helix";
  const hosted = importDatabase(
    childEnvironment({
      AWS_LAMBDA_FUNCTION_NAME: "manual-hosted-runtime",
      DATABASE_URL: direct,
    }),
  );
  assert.equal(hosted.status, 0, `${hosted.stdout}\n${hosted.stderr}`);
  assert.match(hosted.stdout, /dbSource=neon/u);

  const branch = importDatabase(
    childEnvironment({
      NETLIFY: "true",
      CONTEXT: "deploy-preview",
      DATABASE_URL: direct,
      NETLIFY_DB_URL: direct,
    }),
    { netlifyDatabaseUrl: "postgresql://authoritative:fixture@database.example.test/helix" },
  );
  const branchOutput = `${branch.stdout}\n${branch.stderr}`;
  assert.notEqual(branch.status, 0, branchOutput);
  assert.match(branchOutput, /diverges from the authoritative Netlify Database SDK/u);
  assert.doesNotMatch(branchOutput, /dbSource=pglite/u);
});

test("app SQL and Better Auth consume the same authoritative resolver", async () => {
  const [databaseSource, dbSource, authSource] = await Promise.all(
    [
      "src/lib/database-connection.server.ts",
      "src/lib/db.ts",
      "src/lib/auth/server.ts",
    ].map((path) => readFile(join(ROOT, path), "utf8")),
  );
  assert.match(databaseSource, /getConnectionString as getNetlifyDatabaseConnectionString/u);
  assert.match(databaseSource, /getRuntimeDatabaseConnection/u);
  assert.match(dbSource, /getRuntimeDatabaseConnection\(\)/u);
  assert.match(dbSource, /connectionString: databaseUrl/u);
  assert.doesNotMatch(dbSource, /process\.env\.(?:DATABASE_URL|NETLIFY_DB_URL)/u);
  assert.match(authSource, /getDatabaseConnectionString\(\)/u);
  assert.doesNotMatch(authSource, /serverEnv\.(?:DATABASE_URL|NETLIFY_DB_URL)/u);
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
