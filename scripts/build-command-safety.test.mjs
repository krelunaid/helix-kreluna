import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const netlifyConfig = await readFile(new URL("netlify.toml", root), "utf8");
const migratePath = fileURLToPath(new URL("scripts/migrate.mjs", root));

function databaseFixtureUrl(identity, host = "127.0.0.1", port) {
  const authority = port ? `${host}:${port}` : host;
  return ["postgresql", "://", identity, "@", authority, "/helix"].join("");
}

function migrator(args = [], overrides = {}, options = {}) {
  const env = { ...process.env, ...overrides };
  delete env.DATABASE_URL;
  delete env.NETLIFY_DB_URL;
  delete env.NETLIFY;
  delete env.CONTEXT;
  Object.assign(env, overrides);
  const argv = options.netlifyDatabaseUrl || options.sdkError
    ? [
        "--input-type=module",
        "--eval",
        `
          globalThis.Netlify = { env: { get: () => {
            ${options.sdkError ? `throw new Error(${JSON.stringify(options.sdkError)});` : `return ${JSON.stringify(options.netlifyDatabaseUrl)};`}
          } } };
          process.argv.push(...${JSON.stringify(args)});
          await import(${JSON.stringify(new URL("scripts/migrate.mjs", root).href)});
        `,
      ]
    : [migratePath, ...args];
  return spawnSync(process.execPath, argv, {
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
    packageJson.scripts["build:netlify:branch"],
    "npm run build && npm run db:migrate:netlify:branch",
  );
  assert.equal(
    packageJson.scripts["db:migrate:netlify:branch"],
    "node scripts/migrate.mjs --netlify-branch",
  );
  assert.equal(
    packageJson.scripts["db:migrate:netlify:production"],
    "node scripts/migrate.mjs --netlify-production",
  );
});

test("every Netlify context builds successfully before mutating its database", () => {
  assert.match(netlifyConfig, /\[build\][\s\S]*?command = "npm run build"/);
  assert.match(
    netlifyConfig,
    /\[context\.production\][\s\S]*?command = "npm run build:netlify:production"/,
  );
  assert.equal((netlifyConfig.match(/build:netlify:production/g) ?? []).length, 1);
  assert.match(
    netlifyConfig,
    /\[context\.deploy-preview\][\s\S]*?command = "npm run build:netlify:branch"/,
  );
  assert.match(
    netlifyConfig,
    /\[context\.branch-deploy\][\s\S]*?command = "npm run build:netlify:branch"/,
  );
  assert.equal((netlifyConfig.match(/build:netlify:branch/g) ?? []).length, 2);
  assert.ok(
    packageJson.scripts["build:netlify:branch"].indexOf("npm run build") <
      packageJson.scripts["build:netlify:branch"].indexOf("db:migrate:netlify:branch"),
  );
  assert.ok(
    packageJson.scripts["build:netlify:production"].indexOf("npm run build") <
      packageJson.scripts["build:netlify:production"].indexOf(
        "db:migrate:netlify:production",
      ),
  );
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
  assert.match(missingDatabase.stderr, /Netlify Database SDK failed/);

  const sdkFailure = migrator(
    ["--netlify-production"],
    {
      NETLIFY: "true",
      CONTEXT: "production",
      DATABASE_URL: databaseFixtureUrl("legacy", "127.0.0.1", 2),
    },
    { sdkError: "fixture SDK failure" },
  );
  assert.equal(sdkFailure.status, 1);
  assert.match(sdkFailure.stderr, /Netlify Database SDK failed: fixture SDK failure/);
  assert.doesNotMatch(sdkFailure.stderr, /ECONNREFUSED/);

  const authoritative = databaseFixtureUrl("netlify", "127.0.0.1", 1);
  const malformedDatabase = migrator(
    ["--netlify-production"],
    {
      NETLIFY: "true",
      CONTEXT: "production",
      DATABASE_URL: ["not", "a", "postgres", "url"].join("-"),
    },
    { netlifyDatabaseUrl: authoritative },
  );
  assert.equal(malformedDatabase.status, 1);
  assert.match(malformedDatabase.stderr, /valid PostgreSQL URL/);

  const malformedNetlifyDatabase = migrator(
    ["--netlify-production"],
    { NETLIFY: "true", CONTEXT: "production" },
    { netlifyDatabaseUrl: ["not", "a", "postgres", "url"].join("-") },
  );
  assert.equal(malformedNetlifyDatabase.status, 1);
  assert.match(malformedNetlifyDatabase.stderr, /SDK returned an invalid PostgreSQL URL/);

  const divergent = migrator(
    ["--netlify-production"],
    {
      NETLIFY: "true",
      CONTEXT: "production",
      DATABASE_URL: databaseFixtureUrl("legacy", "127.0.0.1", 2),
    },
    { netlifyDatabaseUrl: authoritative },
  );
  assert.equal(divergent.status, 1);
  assert.match(divergent.stderr, /DATABASE_URL diverges from the authoritative/);

  const sdkSelected = migrator(
    ["--netlify-production"],
    { NETLIFY: "true", CONTEXT: "production" },
    { netlifyDatabaseUrl: authoritative },
  );
  assert.equal(sdkSelected.status, 1);
  assert.match(sdkSelected.stderr, /ECONNREFUSED.*127\.0\.0\.1:1|127\.0\.0\.1:1.*ECONNREFUSED/u);
  assert.doesNotMatch(sdkSelected.stderr, /SDK failed|diverges/u);
});

test("the branch migrator refuses production, missing isolation, and divergent URLs", () => {
  const production = migrator(["--netlify-branch"], {
    NETLIFY: "true",
    CONTEXT: "production",
    NETLIFY_DB_URL: databaseFixtureUrl("branch:fixture", "database.example.test"),
  });
  assert.equal(production.status, 1);
  assert.match(production.stderr, /CONTEXT=deploy-preview or branch-deploy/);

  const missing = migrator(["--netlify-branch"], {
    NETLIFY: "true",
    CONTEXT: "deploy-preview",
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Netlify Database SDK failed/);

  const divergent = migrator(
    ["--netlify-branch"],
    {
      NETLIFY: "true",
      CONTEXT: "branch-deploy",
      NETLIFY_DB_URL: databaseFixtureUrl("process", "127.0.0.1", 2),
    },
    { netlifyDatabaseUrl: databaseFixtureUrl("global", "127.0.0.1", 1) },
  );
  assert.equal(divergent.status, 1);
  assert.match(divergent.stderr, /NETLIFY_DB_URL diverges from the authoritative/);

  const malformed = migrator(
    ["--netlify-branch"],
    { NETLIFY: "true", CONTEXT: "deploy-preview" },
    { netlifyDatabaseUrl: ["not", "a", "postgres", "url"].join("-") },
  );
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /SDK returned an invalid PostgreSQL URL/);
});

test("the ordinary local migrator still skips cleanly without DATABASE_URL", () => {
  const result = migrator();
  assert.equal(result.status, 0);
  assert.match(result.stdout, /DATABASE_URL not set.*skipping/);
});
