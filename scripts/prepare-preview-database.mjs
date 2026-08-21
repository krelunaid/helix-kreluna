#!/usr/bin/env node

import { spawn } from "node:child_process";
import { join } from "node:path";

import {
  attestPreviewDatabaseMutation,
  previewDatabaseMutationsEnabled,
  reportPreviewDatabaseAttestation,
} from "./preview-database-mutation-gate.mjs";

const ROOT = join(import.meta.dirname, "..");
const CONFIRMATION = "--confirm-preview-database-mutations";

if (process.argv.length !== 3 || process.argv[2] !== CONFIRMATION) {
  console.error(`[preview-database] explicit ${CONFIRMATION} is required`);
  process.exit(1);
}

let mutationsEnabled;
try {
  mutationsEnabled = previewDatabaseMutationsEnabled();
} catch (error) {
  const safeCode =
    typeof error?.code === "string" && /^[A-Z0-9_]{3,80}$/u.test(error.code)
      ? error.code
      : "PREVIEW_DATABASE_MUTATION_FORBIDDEN";
  console.error(`[preview-database] failed: ${safeCode}`);
  process.exit(1);
}

if (!mutationsEnabled) {
  try {
    const report = reportPreviewDatabaseAttestation();
    console.log(
      `[preview-database] database_attestation_sha256=${report.databaseAttestationSha256}`,
    );
  } catch {
    console.log("[preview-database] mutations disabled; attestation unavailable; skipped");
  }
  process.exit(0);
}

function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(ROOT, script), ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", () => reject(new Error("PREVIEW_DATABASE_CHILD_START_FAILED")));
    child.once("exit", (code, signal) => {
      if (code === 0 && signal === null) resolve();
      else reject(new Error("PREVIEW_DATABASE_CHILD_FAILED"));
    });
  });
}

try {
  attestPreviewDatabaseMutation();
  await run("scripts/migrate.mjs", ["--netlify-branch"]);
  console.log("[preview-database] gated migration complete");
} catch (error) {
  const safeCode =
    typeof error?.code === "string" && /^[A-Z0-9_]{3,80}$/u.test(error.code)
      ? error.code
      : typeof error?.message === "string" && /^[A-Z0-9_]{3,80}$/u.test(error.message)
        ? error.message
        : "UNEXPECTED_FAILURE";
  console.error(`[preview-database] failed: ${safeCode}`);
  process.exit(1);
}
