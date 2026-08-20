import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { expoFiles } from "../src/lib/expo-pack.ts";
import { MESSAGES } from "../src/lib/messages.ts";

const deploySource = readFileSync(
  new URL("../src/lib/server/deploy.ts", import.meta.url),
  "utf8",
);
const githubSource = readFileSync(
  new URL("../src/lib/server/github.ts", import.meta.url),
  "utf8",
);
const gateSource = readFileSync(
  new URL("../src/lib/server/review/human-gate.ts", import.meta.url),
  "utf8",
);
const launchSource = readFileSync(
  new URL("../src/routes/studio.$id.launch.tsx", import.meta.url),
  "utf8",
);
const workspaceExportSource = readFileSync(
  new URL("../src/lib/server/workspace-export.ts", import.meta.url),
  "utf8",
);

function sourceSection(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  if (!end) return source.slice(startIndex);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

function taggedSqlAfter(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing SQL marker: ${marker}`);
  const templateStart = source.indexOf("`", markerIndex + marker.length);
  assert.notEqual(templateStart, -1, `Missing SQL template after: ${marker}`);
  const templateEnd = source.indexOf("`;", templateStart + 1);
  assert.notEqual(templateEnd, -1, `Unterminated SQL template after: ${marker}`);
  return source.slice(templateStart + 1, templateEnd);
}

const publishWebSource = sourceSection(
  deploySource,
  "export const publishWeb",
  "export const publishGuest",
);
const shipStoreSource = sourceSection(
  deploySource,
  "export const shipStore",
  "export const downloadNativePack",
);
const downloadNativePackSource = sourceSection(
  deploySource,
  "export const downloadNativePack",
);
const pushGithubSource = sourceSection(githubSource, "export const pushProjectGithub");

test("store deployment code cannot claim an unverified store submission", () => {
  assert.doesNotMatch(deploySource, /\bplayReady\s*\|\|\s*true\b/);
  assert.doesNotMatch(deploySource, /\bhasTeam\s*=\s*true\b/);
  assert.doesNotMatch(deploySource, /["'](?:testflight|play|appstore)["']/i);
  assert.doesNotMatch(
    deploySource,
    /queued\s+for\s+(?:the\s+)?(?:app\s+store|google\s+play|store)/i,
  );
  assert.doesNotMatch(deploySource, /\bqueueStores\b/);
});

test("shipStore persists only an honest local source-package record", () => {
  assert.match(shipStoreSource, /["']package_prepared["']/);
  assert.match(shipStoreSource, /["']local-export["']\s*,\s*null\s*,\s*\$\{pack\.filename\}/);
  assert.match(shipStoreSource, /submissionStatus:\s*["']not_executed["']/);
  assert.match(shipStoreSource, /testersCode:\s*null/);
  assert.match(shipStoreSource, /testersUrl:\s*null/);
  assert.match(shipStoreSource, /url:\s*null/);
  assert.doesNotMatch(shipStoreSource, /\bpublic_apps\b/i);
  assert.doesNotMatch(shipStoreSource, /\b(?:fetch|upload|submit)\s*\(/i);
  assert.doesNotMatch(shipStoreSource, /["'](?:testflight|play|appstore)["']/i);
});

test("every release/export endpoint binds a jobId to the approved Human Gate artifact", () => {
  for (const [name, source] of [
    ["publishWeb", publishWebSource],
    ["shipStore", shipStoreSource],
    ["downloadNativePack", downloadNativePackSource],
    ["pushProjectGithub", pushGithubSource],
    ["downloadApprovedWorkspace", workspaceExportSource],
  ]) {
    assert.match(source, /jobId:\s*string/, `${name} must validate jobId`);
    assert.match(source, /jobId:\s*input\.jobId\.trim\(\)/, `${name} must normalize jobId`);
    assert.match(source, /getApprovedOwnedBuild\s*\(\s*\{/, `${name} must check the gate`);
    assert.match(source, /jobId:\s*data\.jobId/, `${name} must gate the requested job`);
    assert.match(source, /projectId:\s*data\.projectId/, `${name} must bind the project`);
    assert.match(source, /userId:\s*context\.userId/, `${name} must bind the owner`);
  }

  const approvedGate = sourceSection(
    gateSource,
    "export async function getApprovedOwnedBuild",
    "export async function getApprovedGuestBuild",
  );
  assert.match(
    approvedGate,
    /project\.current_build_job_id\s*=\s*job\.id|current_build_job_id\s*!==\s*rows\[0\]\.id/,
  );
  assert.match(
    approvedGate,
    /queue_status\s+in\s*\(\s*'approved'\s*,\s*'deployed'\s*\)|["']approved["']\s*,\s*["']deployed["'][\s\S]*?includes\(rows\[0\]\.queue_status\)/i,
  );
  assert.match(approvedGate, /event\.decision\s*=\s*'approve'/i);
  assert.match(approvedGate, /event\.artifact_sha256\s*=\s*job\.artifact_sha256/i);
});

test("store credit debit and package record commit in one SQL statement", () => {
  const storeTransaction = taggedSqlAfter(
    shipStoreSource,
    "const prepared = await sql<{ id: string }>",
  );
  assert.match(storeTransaction, /with\s+gate\s+as\s+materialized/i);
  assert.match(storeTransaction, /credit\s+as\s+materialized[\s\S]*?apply_credit_entry\s*\(/i);
  assert.match(storeTransaction, /insert\s+into\s+deploys/i);
  assert.match(storeTransaction, /select[\s\S]*?'package_prepared'[\s\S]*?'local-export'/i);
  assert.match(storeTransaction, /from\s+project_cost/i);
  assert.match(storeTransaction, /on\s+conflict\s*\(release_key\)/i);
  assert.equal((storeTransaction.match(/apply_credit_entry\s*\(/gi) ?? []).length, 1);
  assert.doesNotMatch(shipStoreSource, /await\s+debitCredits\s*\(/);
});

test("the native artifact is dynamically generated as source, never as a binary", () => {
  const files = expoFiles({
    title: "Honest package",
    slug: "honest-package",
    html: "<!doctype html><html><body>Approved artifact</body></html>",
    bundleId: "it.kreluna.honest",
    liveUrl: "https://example.invalid/a/honest-package",
    platform: "android",
  });

  assert.ok(files["package.json"]);
  assert.ok(files["app.json"]);
  assert.ok(files["App.js"]);
  assert.match(files["README.md"], /eas build --platform android/);
  assert.match(files["README.md"], /eas submit --platform android/);
  assert.equal(
    Object.keys(files).some((path) => /\.(?:aab|apk|ipa)$/i.test(path)),
    false,
  );
});

test("launch UI labels deploy records as source packages in every locale", () => {
  const deployRecordUi = sourceSection(
    launchSource,
    "{deploys.map((d) => (",
    "{d.log.map((s) => (",
  );
  assert.match(deployRecordUi, /t\(["']launch\.iosPackage["']\)/);
  assert.match(deployRecordUi, /t\(["']launch\.androidPackage["']\)/);
  assert.doesNotMatch(deployRecordUi, /TestFlight|Google Play/i);

  for (const [locale, messages] of Object.entries(MESSAGES)) {
    for (const key of ["launch.iosPackage", "launch.androidPackage"]) {
      assert.match(
        messages[key],
        /source package|pacchetto sorgente/i,
        `${locale}:${key} must describe a source package`,
      );
      assert.doesNotMatch(
        messages[key],
        /TestFlight|Google Play/i,
        `${locale}:${key} must not masquerade as a store record`,
      );
    }
    assert.match(messages["launch.iosCta"], /source package|pacchetto sorgente/i);
    assert.match(messages["launch.andCta"], /source package|pacchetto sorgente/i);
    assert.match(messages["launch.iosOk"], /not executed|non eseguito/i);
    assert.match(messages["launch.andOk"], /not executed|non eseguito/i);
  }
});
