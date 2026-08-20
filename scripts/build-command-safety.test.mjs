import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const netlifyConfig = await readFile(new URL("netlify.toml", root), "utf8");
const migratePath = fileURLToPath(new URL("scripts/migrate.mjs", root));

function migrator(args = [], overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.DATABASE_URL;
  delete env.NETLIFY;
  delete env.CONTEXT;
  Object.assign(env, overrides);
  return spawnSync(process.execPath, [migratePath, ...args], {
    cwd: fileURLToPath(root),
    env,
    encoding: "utf8",
  });
}

test("the canonical build is deterministic and never migrates a database", () => {
  assert.equal(packageJson.scripts.build, "vite build");
  assert.equal(
    packageJson.scripts["build:netlify:production"],
    "npm run build && npm run db:migrate:netlify:production",
  );
  assert.equal(
    packageJson.scripts["db:migrate:netlify:production"],
    "node scripts/migrate.mjs --netlify-production",
  );
});

test("only the Netlify production context selects the strict migration wrapper", () => {
  assert.match(netlifyConfig, /\[build\][\s\S]*?command = "npm run build"/);
  assert.match(
    netlifyConfig,
    /\[context\.production\][\s\S]*?command = "npm run build:netlify:production"/,
  );
  assert.equal((netlifyConfig.match(/build:netlify:production/g) ?? []).length, 1);
});

test("the strict migrator refuses non-production and incomplete Netlify contexts", () => {
  const wrongContext = migrator(["--netlify-production"], {
    NETLIFY: "true",
    CONTEXT: "deploy-preview",
  });
  assert.equal(wrongContext.status, 1);
  assert.match(wrongContext.stderr, /NETLIFY=true and CONTEXT=production/);

  const missingDatabase = migrator(["--netlify-production"], {
    NETLIFY: "true",
    CONTEXT: "production",
  });
  assert.equal(missingDatabase.status, 1);
  assert.match(missingDatabase.stderr, /missing required environment variable: DATABASE_URL/);

  const malformedDatabase = migrator(["--netlify-production"], {
    NETLIFY: "true",
    CONTEXT: "production",
    DATABASE_URL: ["not", "a", "postgres", "url"].join("-"),
  });
  assert.equal(malformedDatabase.status, 1);
  assert.match(malformedDatabase.stderr, /valid PostgreSQL URL/);
});

test("the ordinary local migrator still skips cleanly without DATABASE_URL", () => {
  const result = migrator();
  assert.equal(result.status, 0);
  assert.match(result.stdout, /DATABASE_URL not set.*skipping/);
});
