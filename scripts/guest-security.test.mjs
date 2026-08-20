import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  buildGeneratedContentCsp,
  GENERATED_APP_SANDBOX,
  protectGeneratedHtml,
} from "../src/lib/generated-content-policy.ts";
import {
  createOpaqueToken,
  hashOpaqueToken,
  isOpaqueGuestToken,
  MAX_GUEST_PUBLISH_HTML_BYTES,
  normalizeGuestPublishInput,
  utf8ByteLength,
} from "../src/lib/guest-security.ts";
import {
  assertDeployProjectOwnership,
  DeployOwnershipError,
} from "../src/lib/server/deploy-ownership.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("guest publish validation enforces the UTF-8 byte limit", () => {
  assert.equal(utf8ByteLength("€"), 3);
  assert.deepEqual(normalizeGuestPublishInput({ title: "  Demo  ", html: "<p>ok</p>" }), {
    title: "Demo",
    html: "<p>ok</p>",
    htmlBytes: 9,
  });
  assert.throws(
    () =>
      normalizeGuestPublishInput({
        title: "x",
        html: "a".repeat(MAX_GUEST_PUBLISH_HTML_BYTES + 1),
      }),
    /exceeds/,
  );
});

test("guest capabilities are long, random, and stored as one-way hashes", async () => {
  const first = createOpaqueToken();
  const second = createOpaqueToken();
  assert.equal(first.length, 64);
  assert.equal(isOpaqueGuestToken(first), true);
  assert.notEqual(first, second);
  const digest = await hashOpaqueToken(first);
  assert.equal(digest.length, 64);
  assert.notEqual(digest, first);
  assert.equal(await hashOpaqueToken(first), digest);
});

test("generated CSP is offline by default and accepts only explicit reviewed origins", () => {
  const csp = buildGeneratedContentCsp();
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.doesNotMatch(csp, /https:\/\//);
  assert.match(csp, /img-src 'self' data: blob:/);
  assert.match(csp, /font-src 'self' data:/);
  assert.doesNotMatch(csp, /https:\/\/example\.invalid/);

  const explicit = buildGeneratedContentCsp({
    images: ["https://images.example.test/path"],
    styles: ["https://styles.example.test/theme.css"],
    fonts: ["https://fonts.example.test/font.woff2"],
    connections: ["https://api.example.test/v1", "http://insecure.example.test", "not a url"],
  });
  assert.match(explicit, /connect-src https:\/\/api\.example\.test/);
  assert.match(explicit, /img-src [^;]*https:\/\/images\.example\.test/);
  assert.match(explicit, /style-src [^;]*https:\/\/styles\.example\.test/);
  assert.match(explicit, /font-src [^;]*https:\/\/fonts\.example\.test/);
  assert.doesNotMatch(explicit, /insecure\.example/);
  assert.doesNotMatch(explicit, /\/v1/);
});

test("legacy showcase hosts are not globally trusted by generated previews", () => {
  const showcase = readFileSync(join(ROOT, "src/lib/showcase.ts"), "utf8");
  assert.match(showcase, /https:\/\/images\.unsplash\.com/);
  assert.match(showcase, /https:\/\/fonts\.googleapis\.com/);
  const csp = buildGeneratedContentCsp();
  for (const origin of [
    "https://images.unsplash.com",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
  ]) {
    assert.equal(csp.includes(origin), false);
  }
});

test("CSP is parsed before generated executable markup and protection is idempotent", () => {
  const unsafe =
    "<script data-attack>window.attack=1</script><html><head>" +
    '<meta http-equiv="refresh" content="0;url=https://example.invalid">' +
    '<meta name="robots" content="index, follow"><title>Demo</title></head>' +
    "<body><button>OK</button></body></html>";
  const protectedHtml = protectGeneratedHtml(unsafe, { noIndex: true });
  assert.ok(
    protectedHtml.indexOf("Content-Security-Policy") < protectedHtml.indexOf("data-attack"),
  );
  assert.doesNotMatch(protectedHtml, /http-equiv="refresh"/i);
  assert.doesNotMatch(protectedHtml, /rel="preconnect"/i);
  assert.doesNotMatch(protectedHtml, /content="index, follow"/i);
  assert.match(protectedHtml, /noindex, nofollow, noarchive, nosnippet/);
  assert.equal(protectGeneratedHtml(protectedHtml, { noIndex: true }), protectedHtml);
});

test("iframe sandbox does not grant origin, popup, modal, or navigation privileges", () => {
  assert.equal(GENERATED_APP_SANDBOX, "allow-scripts allow-forms");
  for (const forbidden of [
    "allow-same-origin",
    "allow-popups",
    "allow-modals",
    "allow-top-navigation",
    "allow-downloads",
  ]) {
    assert.equal(GENERATED_APP_SANDBOX.includes(forbidden), false);
  }
});

test("deploy ownership rejects a cross-owner project before publishing", async () => {
  const calls = [];
  const deniedDb = {
    async query(text, params) {
      calls.push({ text, params });
      return [];
    },
  };
  await assert.rejects(
    assertDeployProjectOwnership(deniedDb, "project-a", "user-b"),
    (error) => error instanceof DeployOwnershipError && error.status === 403,
  );
  assert.deepEqual(calls[0].params, ["project-a", "user-b"]);
  assert.match(calls[0].text, /id = \$1 and user_id = \$2/);

  await assert.doesNotReject(
    assertDeployProjectOwnership({ query: async () => [{ owned: 1 }] }, "project-a", "user-a"),
  );
});

test("guest limits and expiry are persisted and atomically conditional", () => {
  const abuse = readFileSync(join(ROOT, "src/lib/server/guest-abuse.server.ts"), "utf8");
  const deploy = readFileSync(join(ROOT, "src/lib/server/deploy.ts"), "utf8");
  const publicationCleanup = readFileSync(
    join(ROOT, "src/lib/server/persistence/guest-publications.ts"),
    "utf8",
  );
  const migration = readFileSync(join(ROOT, "migrations/0004_guest_security.sql"), "utf8");
  assert.match(migration, /create table if not exists guest_rate_limits/);
  assert.match(migration, /create table if not exists guest_active_leases/);
  assert.match(migration, /guest_token_hash/);
  assert.match(migration, /expires_at/);
  assert.match(abuse, /on conflict \(identity_hash, action, window_start\) do update/);
  assert.match(abuse, /guest_rate_limits\.request_count < \$6/);
  assert.match(abuse, /guest_active_leases\.expires_at <= now\(\)/);
  assert.match(abuse, /x-nf-client-connection-ip/);
  assert.doesNotMatch(abuse, /x-forwarded-for/);
  assert.match(deploy, /deleteExpiredGuestPublications\(\)/);
  assert.match(publicationCleanup, /visibility = 'guest'[\s\S]*?expires_at <= now\(\)/);
  assert.match(deploy, /guest_token_hash = \$\{tokenHash\}/);
  assert.match(deploy, /'kreluna-temporary-preview'/);
  assert.match(deploy, /guest-preview:\$\{data\.jobId\}/);
});

test("guest quota and concurrency are enforced by the database", async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.waitReady;
  await pg.exec(readFileSync(join(ROOT, "migrations/0003_deploys.sql"), "utf8"));
  await pg.exec(readFileSync(join(ROOT, "migrations/0004_guest_security.sql"), "utf8"));

  const identity = "identity-a";
  const action = "ai_generation";
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const firstLease = await pg.query(
    `insert into guest_active_leases (
       identity_hash, action, lease_id, expires_at, created_at
     ) values ($1, $2, $3, $4, now())
     on conflict (identity_hash, action) do update
       set lease_id = excluded.lease_id, expires_at = excluded.expires_at
       where guest_active_leases.expires_at <= now()
     returning lease_id`,
    [identity, action, "lease-a", expiresAt],
  );
  const concurrentLease = await pg.query(
    `insert into guest_active_leases (
       identity_hash, action, lease_id, expires_at, created_at
     ) values ($1, $2, $3, $4, now())
     on conflict (identity_hash, action) do update
       set lease_id = excluded.lease_id, expires_at = excluded.expires_at
       where guest_active_leases.expires_at <= now()
     returning lease_id`,
    [identity, action, "lease-b", expiresAt],
  );
  assert.equal(firstLease.rows.length, 1);
  assert.equal(concurrentLease.rows.length, 0);

  const windowStart = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString();
  const consume = () =>
    pg.query(
      `insert into guest_rate_limits (
         identity_hash, action, window_start, request_count, total_bytes,
         estimated_cost_micro_usd, updated_at
       ) values ($1, $2, $3, 1, 1024, 125000, now())
       on conflict (identity_hash, action, window_start) do update
         set request_count = guest_rate_limits.request_count + 1,
             total_bytes = guest_rate_limits.total_bytes + excluded.total_bytes,
             estimated_cost_micro_usd =
               guest_rate_limits.estimated_cost_micro_usd + excluded.estimated_cost_micro_usd,
             updated_at = now()
         where guest_rate_limits.request_count < 4
           and guest_rate_limits.total_bytes + excluded.total_bytes <= 524288
           and guest_rate_limits.estimated_cost_micro_usd
                 + excluded.estimated_cost_micro_usd <= 500000
       returning request_count`,
      [identity, action, windowStart],
    );
  for (let request = 1; request <= 4; request += 1) {
    const result = await consume();
    assert.equal(result.rows[0].request_count, request);
  }
  assert.equal((await consume()).rows.length, 0);
});

test("guest route and iframe keep token-bearing responses private", () => {
  const route = readFileSync(join(ROOT, "src/routes/a.$slug.tsx"), "utf8");
  const preview = readFileSync(join(ROOT, "src/components/preview-frame.tsx"), "utf8");
  const projectCard = readFileSync(join(ROOT, "src/components/project-card.tsx"), "utf8");
  assert.match(route, /Cache-Control[^\n]*private, no-store/);
  assert.match(route, /loaderData\?\.isGuest/);
  assert.match(route, /noindex, nofollow, noarchive, nosnippet/);
  assert.match(route, /referrerPolicy="no-referrer"/);
  assert.match(preview, /sandbox=\{GENERATED_APP_SANDBOX\}/);
  assert.match(preview, /referrerPolicy="no-referrer"/);
  assert.match(projectCard, /protectGeneratedHtml\(html, \{ noIndex: true \}\)/);
  assert.match(projectCard, /sandbox=\{GENERATED_APP_SANDBOX\}/);
  assert.match(projectCard, /referrerPolicy="no-referrer"/);
  assert.doesNotMatch(projectCard, /ref\.current\.srcdoc\s*=\s*html\b/);
});
