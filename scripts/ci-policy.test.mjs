#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("CI uses a locked, read-only Node 22 verification pipeline", () => {
  assert.match(workflow, /^name:\s+CI$/m);
  assert.match(workflow, /^\s*pull_request:\s*$/m);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.match(workflow, /^permissions:\s*\n\s+contents:\s+read\s*$/m);
  assert.match(workflow, /^\s+node-version:\s+22\s*$/m);
  assert.match(workflow, /^\s+persist-credentials:\s+false\s*$/m);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test("CI runs every required gate in order", () => {
  const setupNode = workflow.indexOf("uses: actions/setup-node@v4");
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
