#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { fromCrossJSON, toJSONAsync } from "seroval";
import { defaultSerovalPlugins } from "@tanstack/router-core";

const entry = resolve(".netlify/v1/functions/server.mjs");
const entryUrl = pathToFileURL(entry).href;
const serverManifest = await readFile(resolve("dist/server/server.js"), "utf8");
const previewGenerateId = serverManifest.match(
  /"([a-f0-9]{64})":\s*{\s*functionName:\s*"previewGenerate_createServerFn_handler"/,
)?.[1];
assert.ok(
  previewGenerateId,
  "previewGenerate is missing from the server-function manifest",
);

// Manual deploy runtimes can omit NETLIFY=true. The bundled SSR handler must
// still recognize the Lambda runtime and reject missing core configuration.
const missingEnv = {
  ...process.env,
  NODE_ENV: "production",
  AWS_LAMBDA_FUNCTION_NAME: "netlify-manual-deploy-server",
};
delete missingEnv.NETLIFY;
delete missingEnv.CONTEXT;
for (const name of [
  "DATABASE_URL",
  "NETLIFY_DB_URL",
  "HELIX_AI_GATEWAY_ENABLED",
  "NETLIFY_AI_GATEWAY_KEY",
  "NETLIFY_AI_GATEWAY_BASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "VITE_AUTH_ENABLED",
  "VITE_PUBLIC_HOSTNAME",
  "GROK_AUTH_CLIENT_ID",
  "GROK_AUTH_CLIENT_SECRET",
]) {
  delete missingEnv[name];
}
const missingDatabaseStartup = spawnSync(
  process.execPath,
  [
    "--input-type=module",
    "--eval",
    `const module = await import(${JSON.stringify(entryUrl)}); await module.default(new Request("https://misconfigured.example/"))`,
  ],
  { encoding: "utf8", env: missingEnv },
);
assert.notEqual(missingDatabaseStartup.status, 0, "A hosted runtime without a database must fail");
assert.match(missingDatabaseStartup.stderr, /DATABASE_URL/);

// Module evaluation order is not a configuration-reporting contract: a route
// may import the database before env.server can aggregate every missing name.
// Isolate the auth invariant with a syntactically valid, never-contacted fixture
// URL so the bundle must progress past database resolution and fail on auth.
const missingAuthEnv = {
  ...missingEnv,
  DATABASE_URL: ["postgresql:", "//smoke:fixture@database.invalid/helix"].join(""),
};
const missingAuthStartup = spawnSync(
  process.execPath,
  [
    "--input-type=module",
    "--eval",
    `await import(${JSON.stringify(entryUrl)})`,
  ],
  { encoding: "utf8", env: missingAuthEnv },
);
assert.notEqual(missingAuthStartup.status, 0, "A hosted runtime without auth must fail");
assert.match(missingAuthStartup.stderr, /BETTER_AUTH_SECRET/);
assert.doesNotMatch(missingAuthStartup.stderr, /DATABASE_URL/);
assert.doesNotMatch(
  missingAuthStartup.stderr,
  /GROK_AUTH_CLIENT_(?:ID|SECRET)/,
  "The optional Grok OAuth broker must stay disabled unless explicitly enabled",
);

const { default: handleRequest } = await import(pathToFileURL(entry));
assert.equal(typeof handleRequest, "function", "Netlify SSR handler is missing");

async function request(path, init = {}) {
  return handleRequest(
    new Request(`https://helix-smoke.example${path}`, {
      ...init,
      headers: {
        "x-forwarded-host": "helix-smoke.example",
        ...(init.headers ?? {}),
      },
    }),
  );
}

const manifestResponse = await request("/__grok/manifest.webmanifest");
assert.equal(manifestResponse.status, 200);
assert.match(manifestResponse.headers.get("content-type") ?? "", /application\/manifest\+json/);
const manifest = await manifestResponse.json();
assert.equal(manifest.start_url, "/");

const installResponse = await request("/?install=1&platform=ios", {
  headers: { accept: "text/html" },
});
assert.equal(installResponse.status, 200);
assert.match(await installResponse.text(), /Add .* to your/);

const pageResponse = await request("/", {
  headers: { accept: "text/html" },
});
assert.equal(pageResponse.status, 200);
assert.equal(pageResponse.headers.get("x-content-type-options"), "nosniff");
const page = await pageResponse.text();
assert.match(page, /\/__grok\/manifest\.webmanifest/);
assert.match(page, /grok-app-builder\/extensions\.js/);

const authResponse = await request("/api/auth/get-session", {
  headers: { accept: "application/json" },
});
assert.notEqual(authResponse.status, 404);
assert.match(authResponse.headers.get("content-type") ?? "", /application\/json/);

const flagshipResponse = await request("/a/morph?lang=it", {
  headers: { accept: "text/html" },
});
assert.equal(flagshipResponse.status, 200);
assert.equal(flagshipResponse.headers.get("cache-control"), "private, no-store, max-age=0");
const flagshipPage = await flagshipResponse.text();
assert.match(flagshipPage, /<html lang="it"/);
assert.match(flagshipPage, /Configuratore di materiali/);
assert.match(flagshipPage, /data-flagship/);

const retiredGeneratorPayload = await toJSONAsync({
  data: {
    prompt: "Exercise the deployed server-function transport",
    locale: "en",
  },
});
const serverFnResponse = await request(
  `/_serverFn/${previewGenerateId}`,
  {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin: "https://helix-smoke.example",
      "x-tsr-serverfn": "true",
    },
    body: JSON.stringify(retiredGeneratorPayload),
  },
);
// This is an intentional 410 from the actual server handler, not a static or
// missing-route response. The legacy one-shot generator is retired so every
// build must use the durable Helix orchestrator.
assert.equal(serverFnResponse.status, 410);
assert.equal(serverFnResponse.headers.get("x-tss-serialized"), "true");
const serializedServerFnResult = await serverFnResponse.json();
const serverFnResult = fromCrossJSON(serializedServerFnResult, {
  plugins: defaultSerovalPlugins,
});
assert.equal(serverFnResult?.error?.message, "LEGACY_GENERATOR_RETIRED");

const crossOriginServerFnResponse = await request(
  `/_serverFn/${previewGenerateId}`,
  {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin: "https://attacker.example",
      "x-tsr-serverfn": "true",
    },
    body: JSON.stringify(retiredGeneratorPayload),
  },
);
assert.equal(crossOriginServerFnResponse.status, 403);

console.log(
  "Netlify output smoke passed: SSR, PWA routes, headers, /api/auth/*, localized flagship and retired createServerFn paths.",
);
