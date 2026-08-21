import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function connectionFailure(error, forbiddenValue) {
  const serialized = [String(error), error?.message, error?.code, error?.cause].join("\n");
  assert.equal(serialized.includes(forbiddenValue), false);
  assert.match(serialized, /ECONNREFUSED|connection|connect/i);
  return true;
}

test("an unavailable configured database fails closed without a PGLite fallback", async (t) => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    NETLIFY: process.env.NETLIFY,
    AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
  };
  const forbiddenValue = `fixture-${randomUUID()}`;
  const unavailableUrl = new URL("postgresql://helix@127.0.0.1:1/helix_unavailable");
  unavailableUrl.password = forbiddenValue;
  process.env.DATABASE_URL = unavailableUrl.toString();
  delete process.env.NETLIFY;
  process.env.AWS_LAMBDA_FUNCTION_NAME = "helix-database-unavailable-test";
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());

  const db = await vite.ssrLoadModule("/src/lib/db.ts");
  assert.equal(db.dbSource, "neon");
  const sql = await db.getSql();
  await assert.rejects(sql.query("select 1"), (error) => connectionFailure(error, forbiddenValue));
  await assert.rejects(db.getPglite(), /only available on the PGLite fallback/);

  const worker = await vite.ssrLoadModule("/src/lib/server/jobs/worker.ts");
  await assert.rejects(worker.processBuildJob("job-database-unavailable"), (error) =>
    connectionFailure(error, forbiddenValue),
  );
});
