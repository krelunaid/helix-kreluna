#!/usr/bin/env node
/**
 * Explicit database migrator (node-postgres, `pg`).
 *
 * Applies pending files in ../migrations to DATABASE_URL. Each file is applied
 * in one transaction and recorded in a `_migrations` table, so it runs once and
 * is safe to re-run. A production Netlify build must opt into strict mode with
 * `--netlify-production`; CI and preview builds never mutate a database.
 *
 * The ordinary manual command keeps the local no-DATABASE_URL skip because the
 * PGLite fallback applies the same files at startup (see src/lib/db.ts).
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
const strictNetlifyProduction = process.argv.includes("--netlify-production");

if (strictNetlifyProduction) {
  if (process.env.NETLIFY !== "true" || process.env.CONTEXT !== "production") {
    console.error("[migrate] --netlify-production requires NETLIFY=true and CONTEXT=production");
    process.exit(1);
  }
  if (!databaseUrl) {
    console.error("[migrate] missing required environment variable: DATABASE_URL");
    process.exit(1);
  }
}

if (!databaseUrl) {
  console.log("[migrate] DATABASE_URL not set — skipping (the PGLite fallback migrates itself).");
  process.exit(0);
}

try {
  const parsedDatabaseUrl = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) throw new Error();
} catch {
  console.error("[migrate] DATABASE_URL must be a valid PostgreSQL URL");
  process.exit(1);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const MIGRATION_LOCK_KEY = 48435420260820;

async function main() {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  let lockHeld = false;
  try {
    // Netlify can start two builds against the same database. Serialize the
    // complete read/apply/record sequence at PostgreSQL session scope.
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    lockHeld = true;
    await client.query(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const applied = new Set(
      (await client.query("SELECT name FROM _migrations")).rows.map((r) => r.name),
    );

    let files;
    try {
      files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    } catch {
      console.log("[migrate] no migrations/ directory — nothing to do.");
      return;
    }

    let count = 0;
    for (const name of files) {
      if (applied.has(name)) continue;
      const text = await readFile(join(migrationsDir, name), "utf8");
      try {
        await client.query("BEGIN");
        // pg's simple-query protocol runs a whole multi-statement file at once.
        await client.query(text);
        await client.query(
          "INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
          [name],
        );
        await client.query("COMMIT");
      } catch (err) {
        console.error(`[migrate] error applying ${name}`);
        try {
          await client.query("ROLLBACK");
        } catch {
          // ROLLBACK fails when the connection died — keep the original error.
        }
        throw err;
      }
      console.log(`[migrate] applied ${name}`);
      count += 1;
    }
    console.log(
      count ? `[migrate] done — ${count} migration(s) applied.` : "[migrate] up to date.",
    );
  } finally {
    if (lockHeld) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
      } catch {
        // Releasing the PostgreSQL connection also releases session locks.
      }
    }
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err?.message || err);
  // pg errors carry the context needed to debug a bad SQL file.
  for (const key of ["code", "detail", "hint", "position", "where"]) {
    if (err?.[key] != null) console.error(`[migrate]   ${key}: ${err[key]}`);
  }
  process.exit(1);
});
