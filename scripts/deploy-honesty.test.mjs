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
const goStoreSource = sourceSection(launchSource, "async function goStore", "async function zip");

test("the legacy hosting endpoint is retired without debit or publication claims", () => {
  assert.match(vetraSource, /class LegacyHostingRetiredError extends Error/);
  assert.match(vetraSource, /readonly code = ["']LEGACY_HOSTING_ENDPOINT_RETIRED["']/);
  assert.match(vetraSource, /readonly status = 410/);
  assert.match(legacyHostSource, /throw new LegacyHostingRetiredError\(\)/);
  assert.doesNotMatch(legacyHostSource, /apply_credit_entry|hosted\s*=\s*true|hosted_until/);
  assert.doesNotMatch(legacyHostSource, /insert\s+into\s+(?:public_apps|deploys)/i);
});

test("the Prototype publisher rejects Production before its HTML publication path", () => {
  const guardSource = sourceSection(
    deploySource,
    "export class HarborPublishError",
    "function approvedProductionStoreSource",
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
  assert.match(launchSource, /publishProductionWeb/);
  assert.match(launchSource, /harborProductionState\?\.runnerConfigured/);
  assert.match(launchSource, /launch\.harborRunnerUnavailable/);
  assert.doesNotMatch(launchSource, /Nessun fallback Prototype verrà usato/);
});

test("Store submission packages only a verified Production static wrapper and fails closed otherwise", () => {
  const productionSourceBoundary = sourceSection(
    deploySource,
    "function approvedProductionStoreSource",
    "export type StoreReadiness",
  );
  assert.match(productionSourceBoundary, /artifact\.buildLevel !== ["']production["']/);
  assert.match(productionSourceBoundary, /!artifact\.workspace/);
  assert.match(productionSourceBoundary, /STORE_PRODUCTION_WORKSPACE_INVALID/);

  const artifactIndex = shipStoreSource.indexOf("const artifact = await getApprovedOwnedBuild");
  const packageIndex = shipStoreSource.indexOf("await prepareApprovedProductionStorePackage");
  const runnerConfigIndex = shipStoreSource.indexOf("storeReadiness(data.target)");
  const schemaIndex = shipStoreSource.indexOf("await ensureSchema()");
  const zipIndex = shipStoreSource.indexOf("const zip = zipFiles(files)");
  const runnerIndex = shipStoreSource.indexOf("const accepted = await callStoreRunner");
  const debitIndex = shipStoreSource.indexOf("apply_credit_entry(");
  for (const index of [
    artifactIndex,
    packageIndex,
    runnerConfigIndex,
    schemaIndex,
    zipIndex,
    runnerIndex,
    debitIndex,
  ]) {
    assert.notEqual(index, -1);
  }
  assert.ok(artifactIndex < packageIndex);
  assert.ok(packageIndex < runnerConfigIndex);
  assert.ok(packageIndex < schemaIndex);
  assert.ok(packageIndex < zipIndex);
  assert.ok(packageIndex < runnerIndex);
  assert.ok(packageIndex < debitIndex);
  assert.match(shipStoreSource, /artifact\.buildLevel === ["']production["']/);
  assert.match(shipStoreSource, /productionPackage\?\.files \?\?\s*expoFiles/);
  assert.match(shipStoreSource, /LEGACY_PROTOTYPE_STORE_ARTIFACT_DESCRIPTOR/);
  assert.match(downloadNativePackSource, /await prepareApprovedProductionStorePackage/);
  assert.match(
    downloadNativePackSource,
    /nativeImplementation:\s*artifactDescriptor\.nativeImplementation/,
  );
  assert.match(downloadNativePackSource, /artifactKind:\s*artifactDescriptor\.artifactKind/);
  assert.match(launchSource, /productionStoreRuntimeProfile === ["']static_site["']/);
  assert.match(launchSource, /launch\.productionStoreWrapper/);
  assert.match(launchSource, /launch\.productionStoreUnsupported/);
  assert.match(launchSource, /launch\.androidPlayReleaseEvidence/);
  for (const [locale, messages] of Object.entries(MESSAGES)) {
    assert.match(
      messages["launch.productionStoreWrapper"],
      /web-to-native|non è un’implementazione nativa/i,
      `${locale}: Production packaging must be labeled as a wrapper, not a native implementation`,
    );
    assert.match(
      messages["launch.productionStoreUnsupported"],
      /runtime.*static|runtime.*statico/i,
    );
    assert.match(
      messages["launch.androidPlayReleaseEvidence"],
      /Google Play.*release ID|ID release Google Play/i,
    );
  }
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
  assert.match(downloadNativePackSource, /artifactKind:\s*artifactDescriptor\.artifactKind/);
  assert.match(
    downloadNativePackSource,
    /nativeImplementation:\s*artifactDescriptor\.nativeImplementation/,
  );
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
  assert.match(shipStoreSource, /store-release:v2:\$\{releaseIdentitySha256\}/);
  assert.match(shipStoreSource, /schemaVersion:\s*["']2\.0\.0["']/);
  assert.match(shipStoreSource, /packageSha256,/);
  assert.match(shipStoreSource, /identity,/);
  assert.match(shipStoreSource, /artifactDescriptor,/);
  assert.match(shipStoreSource, /const legacyReleaseIdentitySha256/);
  assert.match(shipStoreSource, /store-release:v1:\$\{legacyReleaseIdentitySha256\}/);
  assert.match(shipStoreSource, /legacy as materialized/i);
  assert.match(
    shipStoreSource,
    /\$21::text is not null and release\.idempotency_key = \$21::text/,
  );
  assert.match(shipStoreSource, /release\.package_sha256 = \$10/);
  assert.match(shipStoreSource, /release\.source_build_level = ['"]prototype['"]/);
  assert.match(shipStoreSource, /release\.source_workspace_sha256 is null/);
  assert.match(shipStoreSource, /where not exists \(select 1 from legacy\)/);
  assert.match(shipStoreSource, /idempotencyKey:\s*release\.idempotency_key/);
  assert.match(shipStoreSource, /\n\s*release\.idempotency_key,\n/);
  assert.doesNotMatch(shipStoreSource, /store-submit:\$\{data\.jobId\}.*data\.requestId/);
});

test("Store release rows, replay, results, conflicts and events bind Production provenance", () => {
  const rowSource = sourceSection(
    deploySource,
    "type StoreReleaseRow",
    "function parseStoredStoreReport",
  );
  for (const column of [
    "source_build_level",
    "source_workspace_sha256",
    "package_manifest_sha256",
    "packaging_profile",
  ]) {
    assert.match(rowSource, new RegExp(`${column}:`));
    assert.match(shipStoreSource, new RegExp(column));
  }
  assert.match(
    shipStoreSource,
    /store_release_jobs\.source_build_level = excluded\.source_build_level/,
  );
  assert.match(
    shipStoreSource,
    /store_release_jobs\.source_workspace_sha256\s+is not distinct from excluded\.source_workspace_sha256/,
  );
  assert.match(shipStoreSource, /['"]artifactDescriptor['"],\s*\$20::jsonb/);
  assert.match(
    advanceStoreSource,
    /artifactDescriptor:\s*storeArtifactDescriptorFromRow\(input\.row\)/,
  );

  const resultSource = sourceSection(
    deploySource,
    "function storeReleaseResult",
    "function storeReportEventKey",
  );
  assert.match(resultSource, /sourceBuildLevel:\s*row\.source_build_level/);
  assert.match(resultSource, /sourceWorkspaceSha256:\s*row\.source_workspace_sha256/);
  assert.match(resultSource, /packageManifestSha256:\s*row\.package_manifest_sha256/);
  assert.match(resultSource, /nativeImplementation:\s*artifactDescriptor\.nativeImplementation/);

  const storedEvidenceSource = sourceSection(
    deploySource,
    "function storedStoreReportMatchesRow",
    "function storeReleaseResult",
  );
  for (const binding of [
    "report.state !== row.state",
    "report.releaseId !== row.id",
    "report.idempotencyKey !== row.idempotency_key",
    "report.packageSha256 !== row.package_sha256",
    "report.runnerJobId !== row.runner_job_id",
    "report.workflowRunId !== row.workflow_run_id",
    "report.providerBuildId !== row.provider_build_id",
    "report.providerSubmissionId !== row.provider_submission_id",
    "report.providerReleaseId !== row.provider_release_id",
  ]) {
    assert.ok(storedEvidenceSource.includes(binding), `missing stored evidence binding: ${binding}`);
  }
  assert.match(storedEvidenceSource, /LegacyStoreRunnerReportSchema\.safeParse/);
  assert.match(storedEvidenceSource, /row\.source_build_level === ["']prototype["']/);
  assert.match(
    storedEvidenceSource,
    /JSON\.stringify\(report\.artifactDescriptor\)[\s\S]*storeArtifactDescriptorFromRow\(row\)/,
  );
  assert.match(resultSource, /const evidence = parseStoredStoreReport\(row\)/);
  assert.match(resultSource, /failedClosedStoreReadiness\(row\)/);
});

test("a stale Store runner failure cannot overwrite an advanced or terminal release", () => {
  assert.match(storeFailureSource, /expectedState:\s*StoreReleaseRow\["state"\]/);
  assert.match(storeFailureSource, /and state = \$7/);
  assert.match(
    storeFailureSource,
    /and state not in \('distributed', 'failed', 'action_required'\)/,
  );
  assert.match(storeFailureSource, /input\.expectedState/);
  assert.match(storeFailureSource, /status = updated\.state/);
  assert.match(storeFailureSource, /updated\.state = ['"]action_required['"] then \$8/);
  assert.match(storeFailureSource, /status:\s*["']blocked["']/);
  assert.match(advanceStoreSource, /expectedState:\s*input\.row\.state/);
});

test("Store UI notifications reflect terminal and in-flight release states", () => {
  const notifier = sourceSection(
    launchSource,
    "function notifyStoreReleaseState",
    "function Launch",
  );
  assert.match(notifier, /status === ["']distributed["'][\s\S]*toast\.success/);
  assert.match(notifier, /status === ["']failed["'][\s\S]*toast\.error/);
  assert.match(notifier, /status === ["']action_required["'][\s\S]*toast\.warning/);
  assert.match(notifier, /toast\.info/);
  assert.match(goStoreSource, /notifyStoreReleaseState\(r\.status/);
  assert.match(launchSource, /notifyStoreReleaseState\([\s\S]*result\.status/);
  assert.doesNotMatch(goStoreSource, /toast\.success\(t\(["']launch\.storeAccepted/);
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
  assert.match(files["README.md"], /must already be uploaded to the matching EAS\s+project/i);
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
  assert.match(readinessSource, /STORE_ANDROID_PLAY_RELEASE_EVIDENCE_REQUIRED/);
  assert.match(readinessSource, /Verified Google Play release ID/);

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
