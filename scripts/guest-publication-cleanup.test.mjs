import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

async function loadCleanupModule(t) {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  return vite.ssrLoadModule("/src/lib/server/persistence/guest-publications.ts");
}

async function applyMigration(pg, name) {
  await pg.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
}

async function createDatabase(t) {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.waitReady;
  for (const name of [
    "0003_deploys.sql",
    "0004_guest_security.sql",
    "0007_public_app_integrity.sql",
  ]) {
    await applyMigration(pg, name);
  }
  return pg;
}

function sqlFor(pg) {
  return {
    async query(text, params = []) {
      return (await pg.query(text, params)).rows;
    },
  };
}

async function insertGuest(pg, slug, expired) {
  const tokenHash = createHash("sha256").update(slug).digest("hex");
  await pg.query(
    `insert into public_apps (
       slug, title, html, visibility, guest_token_hash, expires_at,
       content_bytes, created_at, updated_at
     ) values ($1, 'Guest', '<p>guest</p>', 'guest', $2,
       ${expired ? "now() - interval '1 hour'" : "now() + interval '1 hour'"},
       octet_length('<p>guest</p>'), now() - interval '2 hours', now())`,
    [slug, tokenHash],
  );
  await pg.query(
    `insert into deploys (id, user_id, target, status, slug)
     values ($1, null, 'web', 'deployed', $2)`,
    [`deploy-${slug}`, slug],
  );
}

test("expired guest publication cleanup is bounded, atomic and scope-safe", async (t) => {
  const cleanup = await loadCleanupModule(t);
  const pg = await createDatabase(t);
  await insertGuest(pg, "expired-a", true);
  await insertGuest(pg, "expired-b", true);
  await insertGuest(pg, "active-a", false);
  await pg.query(
    `insert into public_apps (
       slug, title, html, visibility, content_bytes
     ) values ('public-a', 'Public', '<p>public</p>', 'public',
       octet_length('<p>public</p>'))`,
  );
  await pg.query(
    `insert into deploys (id, user_id, target, status, slug)
     values ('deploy-public-a', 'owner-a', 'web', 'deployed', 'public-a')`,
  );

  const first = await cleanup.deleteExpiredGuestPublicationBatch(sqlFor(pg), 1);
  assert.deepEqual(first, {
    deletedApps: 1,
    deletedDeploys: 1,
    hasMore: true,
  });

  const second = await cleanup.deleteExpiredGuestPublicationBatch(sqlFor(pg), 1);
  assert.deepEqual(second, {
    deletedApps: 1,
    deletedDeploys: 1,
    hasMore: true,
  });

  const complete = await cleanup.deleteExpiredGuestPublicationBatch(sqlFor(pg), 1);
  assert.deepEqual(complete, {
    deletedApps: 0,
    deletedDeploys: 0,
    hasMore: false,
  });

  const apps = await pg.query("select slug from public_apps order by slug");
  assert.deepEqual(
    apps.rows.map((row) => row.slug),
    ["active-a", "public-a"],
  );
  const deploys = await pg.query("select id from deploys order by id");
  assert.deepEqual(
    deploys.rows.map((row) => row.id),
    ["deploy-active-a", "deploy-public-a"],
  );
});

test("guest publication cleanup rejects unbounded batch sizes", async (t) => {
  const cleanup = await loadCleanupModule(t);
  await assert.rejects(
    cleanup.deleteExpiredGuestPublicationBatch({ query: async () => [] }, 501),
    /batch must be 1-500/,
  );
});
