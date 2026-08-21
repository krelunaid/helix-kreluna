#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  openSync,
  readFileSync,
  readlinkSync,
} from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

const INLINE_ALLOWLIST_ENV = "HELIX_SECRET_HISTORY_ALLOWLIST";
const FILE_ALLOWLIST_ENV = "HELIX_SECRET_HISTORY_ALLOWLIST_FILE";
const FINGERPRINT_VERSION = "helix-secret-history-v1";
const MAX_METADATA_OUTPUT = 128 * 1024 * 1024;
const OBJECT_BATCH_BYTES = 16 * 1024 * 1024;

const detectors = [
  {
    rule: "private-key",
    pattern:
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]{0,200000}?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    value(match) {
      return match[0];
    },
  },
  {
    rule: "github-token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g,
    value(match) {
      return match[0];
    },
  },
  {
    rule: "provider-api-key",
    pattern:
      /\b(?:xai-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|sk_(?:live|test)_[A-Za-z0-9_-]{16,}|GOCSPX-[A-Za-z0-9_-]{16,})\b/g,
    value(match) {
      return match[0];
    },
  },
  {
    rule: "cloud-access-key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    value(match) {
      return match[0];
    },
  },
  {
    rule: "npm-token",
    pattern: /\bnpm_[A-Za-z0-9]{30,}\b/g,
    value(match) {
      return match[0];
    },
  },
  {
    rule: "hardcoded-credential",
    pattern:
      /(?:client[_-]?secret|api[_-]?key|ai[_-]?gateway[_-]?key|access[_-]?token|auth[_-]?token|password|private[_-]?key|database[_-]?url)\s*[:=]\s*(?:"([^"\r\n]{16,})"|'([^'\r\n]{16,})')/gi,
    value(match) {
      return match[1] ?? match[2] ?? "";
    },
  },
  {
    rule: "dotenv-credential",
    pattern:
      /^(?:export[ \t]+)?[A-Z][A-Z0-9_]*(?:SECRET|API_KEY|AI_GATEWAY_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|PRIVATE_KEY|DATABASE_URL)[A-Z0-9_]*[ \t]*=[ \t]*([^"'\s#][^\s#]{15,})[ \t]*(?:#.*)?$/gim,
    value(match) {
      return match[1] ?? "";
    },
  },
  {
    rule: "credentialed-url",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:([^\s@/]{12,})@[^\s"']+/gi,
    value(match) {
      return match[0];
    },
  },
];

class ScanFailure extends Error {}

function printHelp() {
  console.log(`Usage: node scripts/secret-history-scan.mjs [--worktree-only]

Scans every commit and blob reachable from Git refs, commit messages, and the
current working tree. Secret values are never emitted. Findings contain only a
commit marker, file, detector rule, and a one-way SHA-256 fingerprint.

CI-safe current-tree mode:
  --worktree-only
  Uses the same detectors but skips reachable history. Historical allowlists
  are never loaded and can never suppress a working-tree finding.

Historical allowlist (never applies to the working tree):
  ${INLINE_ALLOWLIST_ENV}=<fingerprint>[,<fingerprint>...]
  ${FILE_ALLOWLIST_ENV}=<path>

The allowlist file accepts one "sha256:<64 hex>" fingerprint per line. Blank
lines and comments beginning with # are ignored; an entry may end with a
"# reason" comment so the rotation/revocation evidence can be documented.
An unallowlisted historical finding or any working-tree finding exits 1.`);
}

function runGit(repo, args, { input, maxBuffer = MAX_METADATA_OUTPUT } = {}) {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: null,
    input,
    maxBuffer,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new ScanFailure("A Git operation failed; output was suppressed.");
  }
  return result.stdout;
}

function gitText(repo, args, options) {
  return runGit(repo, args, options).toString("utf8");
}

function repositoryRoot() {
  return gitText(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
}

function sha256(...parts) {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}

function secretFingerprint(rule, value) {
  return `sha256:${sha256(FINGERPRINT_VERSION, "\0", rule, "\0", value)}`;
}

function looksLikePlaceholder(value) {
  return (
    /(?:change[-_ ]?me|replace[-_ ]?me|placeholder|example|dummy|your[-_ ]?(?:key|secret|token)|not[-_ ]?configured)/i.test(
      value,
    ) ||
    /^(?:process\.env(?:\.|\[)|import\.meta\.env(?:\.|\[)|Deno\.env\.get\(|Bun\.env(?:\.|\[)|os\.environ(?:\.get)?(?:\[|\())/.test(
      value,
    )
  );
}

function detectSecrets(buffer) {
  const source = buffer.toString("utf8");
  const findings = [];
  const seenValues = new Set();

  for (const detector of detectors) {
    detector.pattern.lastIndex = 0;
    for (const match of source.matchAll(detector.pattern)) {
      const value = detector.value(match);
      if (!value || looksLikePlaceholder(value)) continue;
      const valueDigest = sha256("detected-value\0", value);
      if (seenValues.has(valueDigest)) continue;
      seenValues.add(valueDigest);
      findings.push({
        rule: detector.rule,
        fingerprint: secretFingerprint(detector.rule, value),
      });
    }
  }

  return findings;
}

function normalizeFingerprint(value) {
  const normalized = value.trim().toLowerCase();
  const digest = normalized.startsWith("sha256:") ? normalized.slice("sha256:".length) : normalized;
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new ScanFailure("The historical allowlist contains an invalid fingerprint.");
  }
  return `sha256:${digest}`;
}

function parseInlineAllowlist(value) {
  if (!value?.trim()) return [];
  return value
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(normalizeFingerprint);
}

function parseAllowlistFile(source) {
  const entries = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0].trim();
    if (!line) continue;
    if (/\s/.test(line)) {
      throw new ScanFailure("The historical allowlist contains an invalid entry.");
    }
    entries.push(normalizeFingerprint(line));
  }
  return entries;
}

function loadAllowlist(repo) {
  const allowlist = new Set(parseInlineAllowlist(process.env[INLINE_ALLOWLIST_ENV]));
  const configuredPath = process.env[FILE_ALLOWLIST_ENV]?.trim();
  if (!configuredPath) return allowlist;

  const allowlistPath = isAbsolute(configuredPath) ? configuredPath : resolve(repo, configuredPath);
  let source;
  try {
    source = readFileSync(allowlistPath, "utf8");
  } catch {
    throw new ScanFailure("The configured historical allowlist file could not be read.");
  }
  for (const fingerprint of parseAllowlistFile(source)) {
    allowlist.add(fingerprint);
  }
  return allowlist;
}

function reachableCommits(repo) {
  const source = gitText(repo, ["rev-list", "--all", "--topo-order"]);
  return source
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function collectReachableBlobs(repo, commits) {
  const occurrences = new Map();
  for (const commit of commits) {
    const tree = runGit(repo, ["ls-tree", "-r", "-z", "--full-tree", commit]);
    for (const rawEntry of tree.toString("utf8").split("\0")) {
      if (!rawEntry) continue;
      const tab = rawEntry.indexOf("\t");
      if (tab === -1) continue;
      const header = rawEntry.slice(0, tab);
      const file = rawEntry.slice(tab + 1);
      const match = /^\d+ blob ([a-f0-9]+)$/.exec(header);
      if (!match) continue;
      const objectId = match[1];
      const paths = occurrences.get(objectId) ?? [];
      paths.push({ commit, file });
      occurrences.set(objectId, paths);
    }
  }
  return occurrences;
}

function inspectObjects(repo, objectIds, inspect) {
  if (objectIds.length === 0) return;
  const request = Buffer.from(`${objectIds.join("\n")}\n`, "ascii");
  const checked = gitText(
    repo,
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    { input: request },
  );
  const metadata = checked
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = /^([a-f0-9]+) (\S+) (\d+)$/.exec(line);
      if (!match) throw new ScanFailure("Git returned invalid object metadata.");
      return { objectId: match[1], type: match[2], size: Number(match[3]) };
    });

  let batch = [];
  let batchBytes = 0;
  const flush = () => {
    if (batch.length === 0) return;
    const input = Buffer.from(`${batch.map((item) => item.objectId).join("\n")}\n`, "ascii");
    const expectedBytes = batch.reduce((total, item) => total + item.size + 256, 0);
    const output = runGit(repo, ["cat-file", "--batch"], {
      input,
      maxBuffer: Math.max(1024 * 1024, expectedBytes + 1024 * 1024),
    });
    let offset = 0;
    for (const expected of batch) {
      const newline = output.indexOf(10, offset);
      if (newline === -1) throw new ScanFailure("Git returned a truncated object batch.");
      const header = output.subarray(offset, newline).toString("ascii");
      const match = /^([a-f0-9]+) (\S+) (\d+)$/.exec(header);
      if (!match) throw new ScanFailure("Git returned an invalid object header.");
      const size = Number(match[3]);
      const start = newline + 1;
      const end = start + size;
      if (end > output.length) throw new ScanFailure("Git returned truncated object content.");
      if (match[1] !== expected.objectId || match[2] !== expected.type) {
        throw new ScanFailure("Git returned an unexpected object.");
      }
      inspect(expected, output.subarray(start, end));
      offset = end + 1;
    }
    batch = [];
    batchBytes = 0;
  };

  for (const item of metadata) {
    if (batch.length > 0 && batchBytes + item.size > OBJECT_BATCH_BYTES) flush();
    batch.push(item);
    batchBytes += item.size;
    if (item.size >= OBJECT_BATCH_BYTES) flush();
  }
  flush();
}

function commitMessage(commitObject) {
  const separator = commitObject.indexOf(Buffer.from("\n\n"));
  return separator === -1 ? Buffer.alloc(0) : commitObject.subarray(separator + 2);
}

function historyFindings(repo) {
  const commits = reachableCommits(repo);
  const blobs = collectReachableBlobs(repo, commits);
  const findings = [];

  inspectObjects(repo, [...commits, ...blobs.keys()], (object, content) => {
    if (object.type === "commit") {
      for (const finding of detectSecrets(commitMessage(content))) {
        findings.push({
          commit: object.objectId,
          file: "<commit-message>",
          ...finding,
        });
      }
      return;
    }
    if (object.type !== "blob") return;
    const detected = detectSecrets(content);
    if (detected.length === 0) return;
    for (const occurrence of blobs.get(object.objectId) ?? []) {
      for (const finding of detected) findings.push({ ...occurrence, ...finding });
    }
  });

  return findings;
}

function pathInsideRepository(repo, file) {
  const absolute = resolve(repo, file);
  return absolute === repo || absolute.startsWith(`${repo}${sep}`) ? absolute : null;
}

function readWorkingTreeEntry(absolute) {
  let descriptor;
  try {
    descriptor = openSync(absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error?.code === "ELOOP") {
      try {
        return Buffer.from(readlinkSync(absolute), "utf8");
      } catch {
        throw new ScanFailure("A working-tree symbolic link could not be inspected.");
      }
    }
    throw new ScanFailure("A working-tree file could not be opened safely.");
  }

  try {
    if (!fstatSync(descriptor).isFile()) return null;
    return readFileSync(descriptor);
  } catch {
    throw new ScanFailure("A working-tree file could not be inspected.");
  } finally {
    closeSync(descriptor);
  }
}

function workingTreeFindings(repo) {
  const bare = gitText(repo, ["rev-parse", "--is-bare-repository"]).trim() === "true";
  if (bare) return [];
  const listed = runGit(repo, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const findings = [];

  for (const file of listed) {
    const absolute = pathInsideRepository(repo, file);
    if (!absolute) continue;
    const content = readWorkingTreeEntry(absolute);
    if (content === null) continue;
    for (const finding of detectSecrets(content)) {
      findings.push({ commit: "WORKTREE", file, ...finding });
    }
  }
  return findings;
}

function uniqueSorted(findings) {
  const byKey = new Map();
  for (const finding of findings) {
    const key = [finding.commit, finding.file, finding.rule, finding.fingerprint].join("\0");
    byKey.set(key, finding);
  }
  return [...byKey.values()].sort((left, right) =>
    [left.commit, left.file, left.rule, left.fingerprint]
      .join("\0")
      .localeCompare([right.commit, right.file, right.rule, right.fingerprint].join("\0")),
  );
}

function emit(label, finding) {
  console.log(
    `${label} ${JSON.stringify({
      commit: finding.commit,
      file: finding.file,
      rule: finding.rule,
      fingerprint: finding.fingerprint,
    })}`,
  );
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return 0;
  }
  const worktreeOnly = args.length === 1 && args[0] === "--worktree-only";
  if (args.length > 0 && !worktreeOnly) {
    throw new ScanFailure("Unsupported command-line arguments.");
  }

  const repo = repositoryRoot();
  const allowlist = worktreeOnly ? new Set() : loadAllowlist(repo);
  const historical = worktreeOnly ? [] : uniqueSorted(historyFindings(repo));
  const workingTree = uniqueSorted(workingTreeFindings(repo));
  let blocking = 0;
  let known = 0;

  for (const finding of historical) {
    if (allowlist.has(finding.fingerprint)) {
      known += 1;
      emit("SECRET_HISTORY_KNOWN", finding);
    } else {
      blocking += 1;
      emit("SECRET_HISTORY_FINDING", finding);
    }
  }
  for (const finding of workingTree) {
    blocking += 1;
    emit("SECRET_WORKTREE_FINDING", finding);
  }

  console.log(
    `Secret ${worktreeOnly ? "worktree" : "history"} scan: ${blocking} blocking, ${known} known historical, ${historical.length} historical, ${workingTree.length} working-tree finding(s).`,
  );
  return blocking === 0 ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  if (!(error instanceof ScanFailure)) {
    // Keep unexpected errors equally redacted: exception messages can contain
    // source snippets or command output supplied by Git.
  }
  console.error("Secret history scan failed safely; diagnostic values were suppressed.");
  process.exitCode = 2;
}
