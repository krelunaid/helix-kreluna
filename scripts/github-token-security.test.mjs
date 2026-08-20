import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MODULE = "/src/lib/server/github.ts";

test("GitHub personal tokens use an authenticated, user-bound envelope", async (t) => {
  const previousKey = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  const previousVersion = process.env.GITHUB_TOKEN_KEY_VERSION;
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
  process.env.GITHUB_TOKEN_KEY_VERSION = "test-v1";

  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  const github = await vite.ssrLoadModule(MODULE);

  t.after(async () => {
    if (previousKey === undefined) delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
    else process.env.GITHUB_TOKEN_ENCRYPTION_KEY = previousKey;
    if (previousVersion === undefined) delete process.env.GITHUB_TOKEN_KEY_VERSION;
    else process.env.GITHUB_TOKEN_KEY_VERSION = previousVersion;
    await vite.close();
  });

  const userId = `github-user-${randomUUID()}`;
  const token = `token-${randomUUID()}-${randomUUID()}`;
  const first = await github.encryptGithubToken(token, userId);
  const second = await github.encryptGithubToken(token, userId);

  assert.equal(await github.decryptGithubToken(first, userId), token);
  assert.equal(first.keyVersion, "test-v1");
  assert.notEqual(first.ciphertext, token);
  assert.equal(first.ciphertext.includes(token), false);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.notEqual(first.nonce, second.nonce);
  assert.match(first.nonce, /^[A-Za-z0-9_-]{16}$/);

  await assert.rejects(
    github.decryptGithubToken(first, `other-${userId}`),
    (error) => error?.code === "GITHUB_TOKEN_DECRYPT_FAILED",
  );

  const tamperedBytes = Buffer.from(first.ciphertext, "base64url");
  tamperedBytes[0] ^= 1;
  const tampered = {
    ...first,
    ciphertext: tamperedBytes.toString("base64url"),
  };
  await assert.rejects(
    github.decryptGithubToken(tampered, userId),
    (error) => error?.code === "GITHUB_TOKEN_DECRYPT_FAILED",
  );

  process.env.GITHUB_TOKEN_KEY_VERSION = "test-v2";
  await assert.rejects(
    github.decryptGithubToken(first, userId),
    (error) => error?.code === "GITHUB_TOKEN_DECRYPT_FAILED",
  );
});

test("GitHub token configuration fails closed", async (t) => {
  const previousKey = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  const previousVersion = process.env.GITHUB_TOKEN_KEY_VERSION;
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  const github = await vite.ssrLoadModule(MODULE);

  t.after(async () => {
    if (previousKey === undefined) delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
    else process.env.GITHUB_TOKEN_ENCRYPTION_KEY = previousKey;
    if (previousVersion === undefined) delete process.env.GITHUB_TOKEN_KEY_VERSION;
    else process.env.GITHUB_TOKEN_KEY_VERSION = previousVersion;
    await vite.close();
  });

  delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  process.env.GITHUB_TOKEN_KEY_VERSION = "v1";
  await assert.rejects(
    github.encryptGithubToken("runtime-generated-token", "user-1"),
    (error) => error?.code === "GITHUB_TOKEN_ENCRYPTION_KEY_MISSING",
  );

  process.env.GITHUB_TOKEN_ENCRYPTION_KEY = "not-a-32-byte-key";
  await assert.rejects(
    github.encryptGithubToken("runtime-generated-token", "user-1"),
    (error) => error?.code === "GITHUB_TOKEN_ENCRYPTION_KEY_INVALID",
  );
});

test("Netlify startup requires a valid GitHub envelope key and version", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const env = await vite.ssrLoadModule("/src/lib/env.server.ts");
  const valid = {
    NETLIFY: "true",
    CONTEXT: "production",
    DATABASE_URL: "postgresql://example.invalid/helix",
    VITE_PUBLIC_HOSTNAME: "helix.example",
    VITE_AUTH_ENABLED: "true",
    BETTER_AUTH_SECRET: "B".repeat(32),
    BETTER_AUTH_URL: "https://helix.example",
    GROK_AUTH_CLIENT_ID: "runtime-client-id",
    GROK_AUTH_CLIENT_SECRET: "C".repeat(32),
    XAI_API_KEY: randomBytes(24).toString("base64url"),
    HELIX_QUEUE_DISPATCH_SECRET: "Q".repeat(32),
    GITHUB_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
    GITHUB_TOKEN_KEY_VERSION: "v1",
  };

  assert.doesNotThrow(() => env.validateServerEnvironment(valid));
  assert.throws(
    () =>
      env.validateServerEnvironment({
        ...valid,
        GITHUB_TOKEN_ENCRYPTION_KEY: undefined,
      }),
    /GITHUB_TOKEN_ENCRYPTION_KEY/,
  );
  assert.throws(
    () =>
      env.validateServerEnvironment({
        ...valid,
        GITHUB_TOKEN_KEY_VERSION: "bad version",
      }),
    /GITHUB_TOKEN_KEY_VERSION/,
  );
});

test("GitHub publishing cannot read or write the legacy plaintext token", async () => {
  const [source, migration] = await Promise.all([
    readFile(new URL("../src/lib/server/github.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../migrations/0013_github_token_encryption.sql", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(source, /name: "AES-GCM"/);
  assert.match(source, /additionalData: githubTokenAad/);
  assert.match(source, /github_token_ciphertext/);
  assert.doesNotMatch(source, /set\s+github_token\s*=\s*\$\{data\.token\}/i);
  assert.doesNotMatch(source, /alter\s+table/i);
  assert.ok(
    source.indexOf("const artifact = await getApprovedOwnedBuild") <
      source.indexOf("const token = await decryptGithubToken"),
    "the approved, owned artifact gate must run before token decryption",
  );

  assert.match(migration, /github_token\s*=\s*null/i);
  assert.match(migration, /GITHUB_TOKEN_PLAINTEXT_FORBIDDEN/);
  assert.match(migration, /before insert or update of github_token/i);
  assert.match(migration, /check \(github_token is null\)/i);
  assert.doesNotMatch(migration, /drop column github_token/i);
  assert.doesNotMatch(migration, /github_token\s*=\s*github_token_ciphertext/i);
});
