import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { expoFiles } from "../src/lib/expo-pack.ts";
import { MESSAGES } from "../src/lib/messages.ts";

const deploySource = readFileSync(new URL("../src/lib/server/deploy.ts", import.meta.url), "utf8");
const githubSource = readFileSync(new URL("../src/lib/server/github.ts", import.meta.url), "utf8");
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
const vetraSource = readFileSync(new URL("../src/lib/server/vetra.ts", import.meta.url), "utf8");

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
  const templateEnd = source.indexOf("`", templateStart + 1);
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
  "export const refreshStoreSubmission",
);
const downloadNativePackSource = sourceSection(deploySource, "export const downloadNativePack");
const pushGithubSource = sourceSection(githubSource, "export const pushProjectGithub");
const storeFailureSource = sourceSection(
  deploySource,
  "async function recordStoreRunnerFailure",
  "export const getPublicApp",
);
const advanceStoreSource = sourceSection(
  deploySource,
  "async function advanceStoreRelease",
  "export const shipStore",
);
const legacyHostSource = sourceSection(
  vetraSource,
  "export const hostProject",
  "export const choosePlan",
);
const goStoreSource = sourceSection(
  launchSource,
  "async function goStore",
  "async function zip",
);

test("the legacy hosting endpoint is retired without debit or publication claims", () => {
  assert.match(vetraSource, /class LegacyHostingRetiredError extends Error/);
  assert.match(vetraSource, /readonly code = ["']LEGACY_HOSTING_ENDPOINT_RETIRED["']/);
  assert.match(vetraSource, /readonly status = 410/);
  assert.match(legacyHostSource, /throw new LegacyHostingRetiredError\(\)/);
  assert.doesNotMatch(legacyHostSource, /apply_credit_entry|hosted\s*=\s*true|hosted_until/);
  assert.doesNotMatch(legacyHostSource, /insert\s+into\s+(?:public_apps|deploys)/i);
});

test("Harbor rejects Production web artifacts before schema, costs, or publication", () => {
  const guardSource = sourceSection(
    deploySource,
    "export class HarborPublishError",
    "export class StoreProductionArtifactError",
  );
  assert.match(guardSource, /readonly code = ["']HARBOR_PRODUCTION_WEB_PUBLISH_UNAVAILABLE["']/);
  assert.match(guardSource, /readonly status = 409/);
  assert.match(guardSource, /readonly retryable = false/);
  assert.match(
    guardSource,
    /if \(buildLevel === ["']production["']\) \{\s*throw new HarborPublishError\(\)/,
  );

  const artifactIndex = publishWebSource.indexOf("const artifact = await getApprovedOwnedBuild");
  const guardIndex = publishWebSource.indexOf("assertHarborWebPublishable(artifact.buildLevel)");
  const schemaIndex = publishWebSource.indexOf("await ensureSchema()");
  const sqlIndex = publishWebSource.indexOf("const sql = await getSql()");
  const costIndex = publishWebSource.indexOf("initialWebHostingIdempotencyKey(project.id)");
  const publishIndex = publishWebSource.indexOf("insert into public_apps");

  for (const [name, index] of [
    ["approved artifact lookup", artifactIndex],
    ["Production guard", guardIndex],
    ["schema initialization", schemaIndex],
    ["SQL handle", sqlIndex],
    ["credit mutation", costIndex],
    ["publication write", publishIndex],
  ]) {
    assert.notEqual(index, -1, `Missing ${name}`);
  }
  assert.ok(artifactIndex < guardIndex, "the sealed artifact must be classified first");
  assert.ok(guardIndex < schemaIndex, "the guard must precede schema mutation");
  assert.ok(guardIndex < sqlIndex, "the guard must precede publish SQL");
  assert.ok(guardIndex < costIndex, "the guard must precede credit mutation");
  assert.ok(guardIndex < publishIndex, "the guard must precede publication writes");
  assert.match(launchSource, /productionWebUnavailable/);
  assert.match(launchSource, /launch\.productionWebUnavailable/);
});

test("Store submission rejects a Production preview before runner, ZIP, DB, or debit", () => {
  const guardSource = sourceSection(
    deploySource,
    "export class StoreProductionArtifactError",
    "export type StoreReadiness",
  );
  assert.match(guardSource, /STORE_PRODUCTION_NATIVE_ARTIFACT_UNAVAILABLE/);
  assert.match(guardSource, /readonly status = 409/);
  assert.match(guardSource, /readonly retryable = false/);

  const artifactIndex = shipStoreSource.indexOf("const artifact = await getApprovedOwnedBuild");
  const guardIndex = shipStoreSource.indexOf("assertStoreArtifactShippable(artifact.buildLevel)");
  const runnerConfigIndex = shipStoreSource.indexOf("storeReadiness(data.target)");
  const schemaIndex = shipStoreSource.indexOf("await ensureSchema()");
  const zipIndex = shipStoreSource.indexOf("const zip = zipFiles(files)");
  const runnerIndex = shipStoreSource.indexOf("const accepted = await callStoreRunner");
  const debitIndex = shipStoreSource.indexOf("apply_credit_entry(");
  for (const index of [
    artifactIndex,
    guardIndex,
    runnerConfigIndex,
    schemaIndex,
    zipIndex,
    runnerIndex,
    debitIndex,
  ]) {
    assert.notEqual(index, -1);
  }
  assert.ok(artifactIndex < guardIndex);
  assert.ok(guardIndex < runnerConfigIndex);
  assert.ok(guardIndex < schemaIndex);
  assert.ok(guardIndex < zipIndex);
  assert.ok(guardIndex < runnerIndex);
  assert.ok(guardIndex < debitIndex);
  assert.match(launchSource, /productionNativeUnavailable/);
  assert.match(launchSource, /launch\.productionNativeUnavailable/);
});

test("source export and explicit Store submission are separate operations", () => {
  assert.match(shipStoreSource, /confirmSubmission:\s*boolean/);
  assert.match(shipStoreSource, /STORE_SUBMISSION_CONFIRMATION_REQUIRED/);
  assert.match(shipStoreSource, /action:\s*["']accept["']/);
  assert.match(shipStoreSource, /return storeReleaseResult\(/);
  assert.doesNotMatch(shipStoreSource, /status:\s*["']source_package_prepared["']/);

  assert.match(downloadNativePackSource, /status:\s*["']source_package_prepared["']/);
  assert.match(downloadNativePackSource, /submissionStatus:\s*["']not_executed["']/);
  assert.match(downloadNativePackSource, /base64:\s*toBase64\(zip\)/);
  assert.doesNotMatch(downloadNativePackSource, /callStoreRunner\s*\(/);
  assert.doesNotMatch(downloadNativePackSource, /apply_credit_entry\s*\(/);
  assert.doesNotMatch(downloadNativePackSource, /insert\s+into\s+store_release_jobs/i);
});

test("Store retries reuse one UI request and one backend release identity", () => {
  assert.match(launchSource, /const storeRequestIds = useRef\(/);
  assert.match(goStoreSource, /requestId:\s*storeRequestIds\.current\[target\]/);
  assert.doesNotMatch(goStoreSource, /requestId:\s*crypto\.randomUUID\(\)/);
  assert.match(goStoreSource, /storeRequestIds\.current\[target\]\s*=\s*crypto\.randomUUID\(\)/);
  assert.match(shipStoreSource, /const releaseIdentitySha256 = await sha256Utf8Hex/);
  assert.match(shipStoreSource, /store-release:v1:\$\{releaseIdentitySha256\}/);
  assert.doesNotMatch(shipStoreSource, /store-submit:\$\{data\.jobId\}.*data\.requestId/);
});

test("a stale Store runner failure cannot overwrite an advanced or terminal release", () => {
  assert.match(storeFailureSource, /expectedState:\s*StoreReleaseRow\["state"\]/);
  assert.match(storeFailureSource, /and state = \$7/);
  assert.match(
    storeFailureSource,
    /and state not in \('distributed', 'failed', 'action_required'\)/,
  );
  assert.match(storeFailureSource, /input\.expectedState/);
  assert.match(advanceStoreSource, /expectedState:\s*input\.row\.state/);
});

test("Store credit debit occurs atomically only after durable runner acceptance", () => {
  const preparedSql = taggedSqlAfter(
    shipStoreSource,
    "const preparedRows = await sql.query<StoreReleaseRow>",
  );
  const acceptedIndex = shipStoreSource.indexOf("const accepted = await callStoreRunner");
  const committedIndex = shipStoreSource.indexOf(
    "const committed = await sql.query<StoreReleaseRow>",
  );
  assert.ok(acceptedIndex >= 0 && acceptedIndex < committedIndex);
  assert.match(preparedSql, /insert\s+into\s+store_release_jobs/i);
  assert.match(preparedSql, /'prepared'/);
  assert.doesNotMatch(preparedSql, /apply_credit_entry\s*\(/i);
  assert.doesNotMatch(preparedSql, /insert\s+into\s+deploys/i);

  const acceptedTransaction = taggedSqlAfter(
    shipStoreSource,
    "const committed = await sql.query<StoreReleaseRow>",
  );
  assert.match(acceptedTransaction, /with\s+gate\s+as\s+materialized/i);
  assert.match(acceptedTransaction, /release\.state\s*=\s*'prepared'/i);
  assert.match(acceptedTransaction, /credit\s+as\s+materialized[\s\S]*?apply_credit_entry\s*\(/i);
  assert.match(acceptedTransaction, /insert\s+into\s+deploys/i);
  assert.match(acceptedTransaction, /update\s+store_release_jobs/i);
  assert.match(acceptedTransaction, /'dispatch_accepted'/i);
  assert.equal((acceptedTransaction.match(/apply_credit_entry\s*\(/gi) ?? []).length, 1);
  assert.doesNotMatch(shipStoreSource, /await\s+debitCredits\s*\(/);
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

test("Expo export contains workflows and no binary or credential file", () => {
  const files = expoFiles({
    title: "Contract package",
    slug: "contract-package",
    html: "<!doctype html><html><body>Approved artifact</body></html>",
    bundleId: "com.kreluna.contract",
    easProjectId: "00000000-0000-4000-8000-000000000001",
    liveUrl: "https://example.invalid/a/contract-package",
    platform: "android",
  });

  assert.ok(files["package.json"]);
  assert.ok(files["app.json"]);
  assert.ok(files["App.js"]);
  assert.match(files["README.md"], /does not execute a native build/i);
  assert.match(
    files["README.md"],
    /must already be uploaded to the matching EAS\s+project/i,
  );
  assert.match(files[".eas/workflows/helix-store.yml"], /type: build/);
  assert.match(files[".eas/workflows/helix-store.yml"], /type: submit/);
  const eas = JSON.parse(files["eas.json"]);
  assert.equal(eas.build.production.android.buildType, "app-bundle");
  assert.equal(eas.submit.production.android.track, "internal");
  assert.equal(Object.hasOwn(eas.submit.production.android, "serviceAccountKeyPath"), false);
  assert.match(files[".gitignore"], /^\.helix$/m);
  assert.equal(Object.hasOwn(files, ".easignore"), false);
  assert.equal(
    Object.keys(files).some((path) => /(?:\.aab|\.apk|\.ipa|service-account\.json)$/i.test(path)),
    false,
  );
  assert.doesNotMatch(JSON.stringify(files), /"private_key"|serviceAccountKeyPath/);
});

test("accepted mappings are not presented as provider credential proof", () => {
  const readinessSource = sourceSection(
    deploySource,
    "export function storeReadinessFromReport",
    "export type DeployStep",
  );
  assert.match(readinessSource, /mappingAccepted:\s*true/);
  assert.match(readinessSource, /credentialsConfigured:\s*submissionReady/);
  assert.match(readinessSource, /signingReady:\s*buildReady/);
  assert.doesNotMatch(readinessSource, /credentialsConfigured:\s*true/);
  assert.match(readinessSource, /report\.state === ["']distributed["']/);

  for (const [locale, messages] of Object.entries(MESSAGES)) {
    assert.match(
      messages["launch.storeRunnerReady"],
      /does not prove|non prova/i,
      `${locale} must not call a configured runner provider proof`,
    );
  }
});

test("launch UI keeps free source packages distinct from Store release records", () => {
  const deployRecordUi = sourceSection(
    launchSource,
    "{deploys.map((d) => (",
    "{d.log.map((s) => (",
  );
  assert.match(deployRecordUi, /t\(["']launch\.iosRelease["']\)/);
  assert.match(deployRecordUi, /t\(["']launch\.androidRelease["']\)/);
  assert.doesNotMatch(deployRecordUi, /launch\.(?:ios|android)Package/);
  assert.match(launchSource, /t\(["']launch\.iosCta["']\)/);
  assert.match(launchSource, /t\(["']launch\.andCta["']\)/);
  assert.match(launchSource, /t\(["']launch\.iosSubmitCta["']\)/);
  assert.match(launchSource, /t\(["']launch\.andSubmitCta["']\)/);

  for (const [locale, messages] of Object.entries(MESSAGES)) {
    assert.match(messages["launch.iosCta"], /source package|pacchetto sorgente/i);
    assert.match(messages["launch.andCta"], /source package|pacchetto sorgente/i);
    assert.match(messages["launch.iosOk"], /not executed|non eseguito/i);
    assert.match(messages["launch.andOk"], /not executed|non eseguito/i);
    assert.match(messages["launch.iosRelease"], /Store release|Release Store/i);
    assert.match(messages["launch.androidRelease"], /Store release|Release Store/i);
    assert.doesNotMatch(
      messages["launch.iosRelease"],
      /source package|pacchetto sorgente/i,
      `${locale}: a dispatch record is not a source export`,
    );
  }
});
