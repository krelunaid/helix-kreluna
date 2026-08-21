import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCANNER = fileURLToPath(new URL("./secret-history-scan.mjs", import.meta.url));

function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Helix security test",
      GIT_AUTHOR_EMAIL: "security-test@invalid.example",
      GIT_COMMITTER_NAME: "Helix security test",
      GIT_COMMITTER_EMAIL: "security-test@invalid.example",
    },
  });
  assert.equal(result.status, 0, "temporary Git fixture command must succeed");
  return result.stdout.trim();
}

function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(), "helix-secret-history-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  git(repo, ["init", "--quiet"]);
  writeFileSync(join(repo, "README.md"), "# isolated scanner fixture\n", "utf8");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "--quiet", "-m", "Initial safe fixture"]);
  return repo;
}

function scannerEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.HELIX_SECRET_HISTORY_ALLOWLIST;
  delete env.HELIX_SECRET_HISTORY_ALLOWLIST_FILE;
  Object.assign(env, extra);
  return env;
}

function runScanner(repo, extraEnv = {}, args = []) {
  return spawnSync(process.execPath, [SCANNER, ...args], {
    cwd: repo,
    encoding: "utf8",
    env: scannerEnvironment(extraEnv),
  });
}

function output(result) {
  return `${result.stdout}\n${result.stderr}`;
}

function findingRecords(result, label) {
  return output(result)
    .split(/\r?\n/)
    .filter((line) => line.startsWith(`${label} `))
    .map((line) => JSON.parse(line.slice(label.length + 1)));
}

function makeProviderSecret(label) {
  return ["xai", label, randomBytes(24).toString("hex")].join("-");
}

test("secret history scanner passes a clean reachable history", (t) => {
  const repo = fixture(t);
  const result = runScanner(repo);
  assert.equal(result.status, 0, output(result));
  assert.match(result.stdout, /0 blocking/);
  assert.equal(findingRecords(result, "SECRET_HISTORY_FINDING").length, 0);
  assert.equal(findingRecords(result, "SECRET_WORKTREE_FINDING").length, 0);
});

test("scanner finds deleted reachable blobs without printing the secret", (t) => {
  const repo = fixture(t);
  const historicalSecret = randomBytes(32).toString("base64url");
  writeFileSync(
    join(repo, "oauth-config.js"),
    `export const PREVIEW_CLIENT_SECRET =\n  ${JSON.stringify(historicalSecret)};\n`,
    "utf8",
  );
  git(repo, ["add", "oauth-config.js"]);
  git(repo, ["commit", "--quiet", "-m", "Add integration configuration"]);
  const secretCommit = git(repo, ["rev-parse", "HEAD"]);
  writeFileSync(
    join(repo, "oauth-config.js"),
    "export const PREVIEW_CLIENT_SECRET = process.env.PREVIEW_CLIENT_SECRET;\n",
    "utf8",
  );
  git(repo, ["add", "oauth-config.js"]);
  git(repo, ["commit", "--quiet", "-m", "Move integration configuration to environment"]);

  const result = runScanner(repo);
  const combined = output(result);
  assert.equal(result.status, 1, combined);
  assert.equal(combined.includes(historicalSecret), false, "raw secret must never be emitted");
  const historical = findingRecords(result, "SECRET_HISTORY_FINDING");
  assert.ok(historical.length >= 1);
  assert.ok(
    historical.some(
      (finding) =>
        finding.commit === secretCommit &&
        finding.file === "oauth-config.js" &&
        finding.rule === "hardcoded-credential" &&
        /^sha256:[a-f0-9]{64}$/.test(finding.fingerprint),
    ),
  );
  assert.equal(findingRecords(result, "SECRET_WORKTREE_FINDING").length, 0);
});

test("scanner detects AI Gateway credential names without printing their values", (t) => {
  const repo = fixture(t);
  const netlifyGatewaySecret = randomBytes(32).toString("base64url");
  const openAiCompatibilitySecret = randomBytes(32).toString("base64url");
  const genericGatewaySecret = randomBytes(32).toString("base64url");
  writeFileSync(
    join(repo, "gateway.env"),
    `NETLIFY_AI_GATEWAY_KEY=${netlifyGatewaySecret}\nOPENAI_API_KEY=${openAiCompatibilitySecret}\n`,
    "utf8",
  );
  writeFileSync(
    join(repo, "gateway-config.js"),
    `const AI_GATEWAY_KEY = ${JSON.stringify(genericGatewaySecret)};\n`,
    "utf8",
  );

  const result = runScanner(repo, {}, ["--worktree-only"]);
  const combined = output(result);
  assert.equal(result.status, 1, combined);
  assert.equal(combined.includes(netlifyGatewaySecret), false);
  assert.equal(combined.includes(openAiCompatibilitySecret), false);
  assert.equal(combined.includes(genericGatewaySecret), false);
  const findings = findingRecords(result, "SECRET_WORKTREE_FINDING");
  const dotenvGatewayFindings = findings.filter(
    (finding) =>
      finding.file === "gateway.env" &&
      finding.rule === "dotenv-credential" &&
      /^sha256:[a-f0-9]{64}$/.test(finding.fingerprint),
  );
  assert.equal(dotenvGatewayFindings.length, 2);
  assert.ok(
    findings.some(
      (finding) =>
        finding.file === "gateway-config.js" &&
        finding.rule === "hardcoded-credential" &&
        /^sha256:[a-f0-9]{64}$/.test(finding.fingerprint),
    ),
  );
});

test("documented allowlists apply only to historical fingerprints", (t) => {
  const repo = fixture(t);
  const historicalSecret = makeProviderSecret("allowlist");
  writeFileSync(join(repo, "removed.env"), `XAI_API_KEY=${historicalSecret}\n`, "utf8");
  git(repo, ["add", "removed.env"]);
  git(repo, ["commit", "--quiet", "-m", "Add provider configuration"]);
  git(repo, ["rm", "--quiet", "removed.env"]);
  git(repo, ["commit", "--quiet", "-m", "Remove provider configuration"]);

  const initial = runScanner(repo);
  assert.equal(initial.status, 1, output(initial));
  assert.equal(output(initial).includes(historicalSecret), false);
  const fingerprint = findingRecords(initial, "SECRET_HISTORY_FINDING").find(
    (finding) => finding.rule === "provider-api-key",
  )?.fingerprint;
  assert.match(fingerprint ?? "", /^sha256:[a-f0-9]{64}$/);

  const inlineAllowed = runScanner(repo, {
    HELIX_SECRET_HISTORY_ALLOWLIST: fingerprint,
  });
  assert.equal(inlineAllowed.status, 0, output(inlineAllowed));
  assert.equal(findingRecords(inlineAllowed, "SECRET_HISTORY_KNOWN").length, 1);
  assert.equal(output(inlineAllowed).includes(historicalSecret), false);

  const allowlistPath = join(repo, ".known-secret-history");
  writeFileSync(allowlistPath, `${fingerprint} # credential revoked in fixture\n`, "utf8");
  const fileAllowed = runScanner(repo, {
    HELIX_SECRET_HISTORY_ALLOWLIST_FILE: allowlistPath,
  });
  assert.equal(fileAllowed.status, 0, output(fileAllowed));
  assert.equal(findingRecords(fileAllowed, "SECRET_HISTORY_KNOWN").length, 1);

  writeFileSync(
    join(repo, "active.js"),
    `const runtimeKey = ${JSON.stringify(historicalSecret)};\n`,
    "utf8",
  );
  const active = runScanner(repo, {
    HELIX_SECRET_HISTORY_ALLOWLIST: fingerprint,
  });
  assert.equal(active.status, 1, output(active));
  assert.equal(output(active).includes(historicalSecret), false);
  const workingTree = findingRecords(active, "SECRET_WORKTREE_FINDING");
  assert.ok(
    workingTree.some((finding) => finding.commit === "WORKTREE" && finding.file === "active.js"),
    "an allowlist must never suppress a working-tree finding",
  );
});

test("scanner inspects reachable commit messages and redacts their values", (t) => {
  const repo = fixture(t);
  const messageSecret = makeProviderSecret("message");
  writeFileSync(join(repo, "safe.txt"), "safe follow-up\n", "utf8");
  git(repo, ["add", "safe.txt"]);
  git(repo, ["commit", "--quiet", "-m", `Accidental note ${messageSecret}`]);
  const commit = git(repo, ["rev-parse", "HEAD"]);

  const result = runScanner(repo);
  assert.equal(result.status, 1, output(result));
  assert.equal(output(result).includes(messageSecret), false);
  assert.ok(
    findingRecords(result, "SECRET_HISTORY_FINDING").some(
      (finding) => finding.commit === commit && finding.file === "<commit-message>",
    ),
  );
});

test("worktree-only mode skips history but scans tracked and untracked files with no allowlist", (t) => {
  const repo = fixture(t);
  const historicalSecret = makeProviderSecret("worktree-only");
  writeFileSync(join(repo, "removed.env"), `XAI_API_KEY=${historicalSecret}\n`, "utf8");
  git(repo, ["add", "removed.env"]);
  git(repo, ["commit", "--quiet", "-m", "Add provider configuration"]);
  git(repo, ["rm", "--quiet", "removed.env"]);
  git(repo, ["commit", "--quiet", "-m", "Remove provider configuration"]);

  const history = runScanner(repo);
  assert.equal(history.status, 1, output(history));
  const fingerprint = findingRecords(history, "SECRET_HISTORY_FINDING")[0]?.fingerprint;
  assert.match(fingerprint ?? "", /^sha256:[a-f0-9]{64}$/);

  const cleanWorktree = runScanner(repo, {}, ["--worktree-only"]);
  assert.equal(cleanWorktree.status, 0, output(cleanWorktree));
  assert.equal(findingRecords(cleanWorktree, "SECRET_HISTORY_FINDING").length, 0);

  writeFileSync(join(repo, "untracked.env"), `XAI_API_KEY=${historicalSecret}\n`, "utf8");
  const active = runScanner(repo, { HELIX_SECRET_HISTORY_ALLOWLIST: fingerprint }, [
    "--worktree-only",
  ]);
  assert.equal(active.status, 1, output(active));
  assert.equal(output(active).includes(historicalSecret), false);
  assert.ok(
    findingRecords(active, "SECRET_WORKTREE_FINDING").some(
      (finding) => finding.file === "untracked.env" && finding.rule === "provider-api-key",
    ),
  );
});

test("worktree scanning reads a symbolic-link entry without following its target", (t) => {
  const repo = fixture(t);
  const linkSecret = makeProviderSecret("symbolic-link");
  symlinkSync(linkSecret, join(repo, "untracked-secret-link"));

  const result = runScanner(repo, {}, ["--worktree-only"]);
  const combined = output(result);
  assert.equal(result.status, 1, combined);
  assert.equal(combined.includes(linkSecret), false);
  assert.ok(
    findingRecords(result, "SECRET_WORKTREE_FINDING").some(
      (finding) => finding.file === "untracked-secret-link" && finding.rule === "provider-api-key",
    ),
  );
});
