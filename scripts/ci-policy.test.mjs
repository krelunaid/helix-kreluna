#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const codeqlWorkflow = await readFile(
  new URL("../.github/workflows/codeql.yml", import.meta.url),
  "utf8",
);
const dependabot = await readFile(
  new URL("../.github/dependabot.yml", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const ACTION_PINS = Object.freeze({
  checkout: "11d5960a326750d5838078e36cf38b85af677262", // actions/checkout v4.4.0
  setupNode: "49933ea5288caeca8642d1e84afbd3f7d6820020", // actions/setup-node v4.4.0
  codeql: "f3712979fa5f215279b101dd0a2e3bdfb4353324", // github/codeql-action v3.37.7
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertPinnedAction(source, action, sha) {
  assert.match(
    source,
    new RegExp(`uses: ${escapeRegExp(action)}@${sha}(?:\\s+# [^\\n]+)?$`, "m"),
    `${action} must use the reviewed immutable commit`,
  );
}

function assertEveryActionIsPinned(source) {
  const uses = [...source.matchAll(/^\s*uses:\s+([^\s#]+)(?:\s+#.*)?$/gm)].map(
    (match) => match[1],
  );
  assert.ok(uses.length > 0, "workflow must use at least one action");
  for (const reference of uses) {
    assert.match(reference, /@[0-9a-f]{40}$/, `${reference} is not pinned to a commit`);
  }
}

test("CI uses a locked, read-only Node 22 verification pipeline", () => {
  assert.match(workflow, /^name:\s+CI$/m);
  assert.match(workflow, /^\s{2}push:\s*$/m);
  assert.match(workflow, /^\s*pull_request:\s*$/m);
  assert.doesNotMatch(workflow, /^\s{4}branches(?:-ignore)?:/m);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.match(workflow, /^permissions:\s*\n\s+contents:\s+read\s*$/m);
  assert.match(workflow, /^\s+node-version:\s+22\s*$/m);
  assert.match(workflow, /^\s+persist-credentials:\s+false\s*$/m);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assertPinnedAction(workflow, "actions/checkout", ACTION_PINS.checkout);
  assertPinnedAction(workflow, "actions/setup-node", ACTION_PINS.setupNode);
  assertEveryActionIsPinned(workflow);
});

test("CI runs every required gate in order", () => {
  const setupNode = workflow.indexOf(`uses: actions/setup-node@${ACTION_PINS.setupNode}`);
  const scanStep = workflow.indexOf("\n      - name: Scan worktree for secrets", setupNode);
  const nextStep = workflow.indexOf("\n      - name:", setupNode);
  assert.ok(setupNode >= 0, "setup-node must be present");
  assert.equal(nextStep, scanStep, "the secret scan must run immediately after setup-node");

  const commands = [
    "npm run security:secrets",
    "npm ci",
    "npm run typecheck",
    "npm run lint",
    "npm test",
    "npm audit --omit=dev",
    "npm run build",
    "npm run test:netlify",
  ];

  let previous = -1;
  for (const command of commands) {
    const index = workflow.indexOf(`run: ${command}`);
    assert.ok(index > previous, `${command} must be present after the previous CI gate`);
    previous = index;
  }
});

test("CI uses the robust detectors in worktree-only mode and remains verification-only", () => {
  assert.equal(
    packageJson.scripts["security:secrets"],
    "node scripts/secret-history-scan.mjs --worktree-only",
  );
  assert.equal(packageJson.scripts["security:history"], "node scripts/secret-history-scan.mjs");
  assert.doesNotMatch(workflow, /security:history/);
  assert.doesNotMatch(workflow, /build:netlify:production|db:migrate/);
  assert.doesNotMatch(workflow, /\b(?:netlify|npm|npx)\s+deploy\b|\bgh\s+release\b/i);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
});

test("CodeQL is isolated, least-privilege and pinned to reviewed commits", () => {
  assert.match(codeqlWorkflow, /^name:\s+CodeQL$/m);
  assert.match(codeqlWorkflow, /^\s{2}push:\s*$/m);
  assert.match(codeqlWorkflow, /^\s{2}pull_request:\s*$/m);
  assert.match(codeqlWorkflow, /^\s{2}schedule:\s*$/m);
  assert.match(codeqlWorkflow, /^\s{2}workflow_dispatch:\s*$/m);
  assert.doesNotMatch(codeqlWorkflow, /^\s{4}branches(?:-ignore)?:/m);
  assert.doesNotMatch(codeqlWorkflow, /pull_request_target/);
  assert.match(codeqlWorkflow, /^\s+contents:\s+read\s*$/m);
  assert.match(codeqlWorkflow, /^\s+actions:\s+read\s*$/m);
  assert.match(codeqlWorkflow, /^\s+packages:\s+read\s*$/m);
  assert.match(codeqlWorkflow, /^\s+security-events:\s+write\s*$/m);
  assert.match(codeqlWorkflow, /^\s+languages:\s+javascript-typescript\s*$/m);
  assert.match(codeqlWorkflow, /^\s+queries:\s+security-extended\s*$/m);
  assert.match(codeqlWorkflow, /^\s+persist-credentials:\s+false\s*$/m);
  assertPinnedAction(codeqlWorkflow, "actions/checkout", ACTION_PINS.checkout);
  assertPinnedAction(codeqlWorkflow, "github/codeql-action/init", ACTION_PINS.codeql);
  assertPinnedAction(codeqlWorkflow, "github/codeql-action/analyze", ACTION_PINS.codeql);
  assertEveryActionIsPinned(codeqlWorkflow);
  assert.doesNotMatch(codeqlWorkflow, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(
    codeqlWorkflow,
    /build:netlify:production|db:migrate|\b(?:netlify|npm|npx)\s+deploy\b|\bgh\s+release\b/i,
  );
});

test("Dependabot covers locked npm and GitHub Actions dependencies", () => {
  assert.match(dependabot, /^version:\s+2\s*$/m);
  assert.equal((dependabot.match(/^\s+- package-ecosystem:/gm) ?? []).length, 2);
  assert.match(dependabot, /^\s+- package-ecosystem:\s+npm\s*$/m);
  assert.match(dependabot, /^\s+- package-ecosystem:\s+github-actions\s*$/m);
  assert.equal((dependabot.match(/^\s+directory:\s+\/\s*$/gm) ?? []).length, 2);
  assert.equal((dependabot.match(/^\s+interval:\s+weekly\s*$/gm) ?? []).length, 2);
});
