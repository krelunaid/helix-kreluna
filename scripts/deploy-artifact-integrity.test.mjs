import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { protectGeneratedHtml } from "../src/lib/generated-content-policy.ts";
import {
  assertPublishedBytes,
  assertPublishedUtf8,
  PublishedArtifactIntegrityError,
  sha256BytesHex,
  sha256Utf8Hex,
} from "../src/lib/server/release/integrity.ts";
import { zipFiles } from "../src/lib/zip.ts";

const migrationsUrl = new URL("../migrations/", import.meta.url);
const deploySource = await readFile(
  new URL("../src/lib/server/deploy.ts", import.meta.url),
  "utf8",
);

test("approved source and exact served bytes have separate deterministic hashes", async () => {
  const source = "<!doctype html><html><body><h1>Approved</h1></body></html>";
  const served = protectGeneratedHtml(`${source}<script>document.body.dataset.ok='1'</script>`);
  const sourceSha256 = await sha256Utf8Hex(source);
  const servedSha256 = await sha256Utf8Hex(served);

  assert.match(sourceSha256, /^[0-9a-f]{64}$/);
  assert.match(servedSha256, /^[0-9a-f]{64}$/);
  assert.notEqual(sourceSha256, servedSha256);
  assert.equal(
    await assertPublishedUtf8({ value: served, expectedSha256: servedSha256 }),
    servedSha256,
  );
  await assert.rejects(
    assertPublishedUtf8({ value: `${served} `, expectedSha256: servedSha256 }),
    PublishedArtifactIntegrityError,
  );
});

test("source-package audit hashes the exact ZIP bytes returned to the caller", async () => {
  const bytes = zipFiles({
    "README.md": "Exact package bytes",
    "src/app.js": "export default 1;",
  });
  const digest = await sha256BytesHex(bytes);

  assert.equal(
    await assertPublishedBytes({ bytes, expectedSha256: digest }),
    digest,
  );
  const changed = new Uint8Array(bytes);
  changed[changed.length - 1] ^= 1;
  await assert.rejects(
    assertPublishedBytes({ bytes: changed, expectedSha256: digest }),
    PublishedArtifactIntegrityError,
  );
});

test("Harbor persists and checks both hashes without substituting the Human Gate hash", () => {
  assert.match(deploySource, /artifact_sha256, published_sha256/);
  assert.match(deploySource, /source_artifact_sha256, served_sha256/);
  assert.match(deploySource, /const publishedSha256 = await sha256Utf8Hex\(html\)/);
  assert.match(deploySource, /const publishedSha256 = await sha256BytesHex\(zip\)/);
  assert.match(deploySource, /published\.served_sha256|hosted\.served_sha256/);
  assert.match(deploySource, /assertPublishedUtf8\s*\(\s*\{/);
  assert.match(
    deploySource,
    /job\.artifact_sha256 = \$\{artifact\.artifactSha256\}[\s\S]*?event\.artifact_sha256 = job\.artifact_sha256/,
  );
  assert.doesNotMatch(
    deploySource,
    /published_sha256, rollback_ref[\s\S]{0,400}\$\{artifact\.artifactSha256\}, \$\{artifact\.artifactSha256\}/,
  );
});

test("migration 0014 is rerunnable and new rows require a complete hash envelope", async (t) => {
  const pg = new PGlite();
  await pg.waitReady;
  t.after(() => pg.close());

  const names = (await readdir(migrationsUrl))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of names) {
    await pg.exec(await readFile(new URL(name, migrationsUrl), "utf8"));
  }
  const migration = await readFile(
    new URL("0014_published_artifact_integrity.sql", migrationsUrl),
    "utf8",
  );
  await pg.exec(migration);

  await assert.rejects(
    pg.query(
      `insert into deploys (id, target, status)
       values ('deploy-incomplete', 'web', 'deployed')`,
    ),
    /deploys_output_integrity_ck/,
  );
  await pg.query(
    `insert into deploys (
       id, target, status, artifact_sha256, published_sha256
     ) values ('deploy-complete', 'web', 'deployed', $1, $2)`,
    ["a".repeat(64), "b".repeat(64)],
  );

  await assert.rejects(
    pg.query(
      `insert into public_apps (
         slug, title, html, content_bytes, source_job_id
       ) values ('app-incomplete', 'Incomplete', '<p>x</p>', 8, 'job-integrity')`,
    ),
    /public_apps_publication_integrity_ck/,
  );
  await pg.query(
    `insert into public_apps (
       slug, title, html, content_bytes, source_job_id,
       source_artifact_sha256, served_sha256
     ) values ('app-complete', 'Complete', '<p>x</p>', 8,
               'job-integrity', $1, $2)`,
    ["a".repeat(64), "b".repeat(64)],
  );

  const versions = await pg.query(
    `select
       (select output_integrity_version from deploys where id = 'deploy-complete') as deploy_version,
       (select publication_integrity_version from public_apps where slug = 'app-complete') as app_version`,
  );
  assert.deepEqual(versions.rows[0], {
    deploy_version: 1,
    app_version: 1,
  });
});
