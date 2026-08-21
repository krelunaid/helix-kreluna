#!/usr/bin/env node

import { join } from "node:path";
import { createServer } from "vite";
import { attestPreviewDatabaseMutation } from "./preview-database-mutation-gate.mjs";

const ROOT = join(import.meta.dirname, "..");
const CONFIRMATION = "--confirm-preview-user-provision";
const TEST_PASSWORD_ENV = "HELIX_PREVIEW_TEST_PASSWORD";
const PROVISION_ENABLED_ENV = "HELIX_PREVIEW_TESTER_PROVISION_ENABLED";
const MAX_INPUT_BYTES = 512;

if (process.argv.length !== 3 || process.argv[2] !== CONFIRMATION) {
  console.error(`[preview-user-provision] explicit ${CONFIRMATION} is required`);
  process.exit(1);
}

const provisioningFlag = process.env[PROVISION_ENABLED_ENV]?.trim();
if (provisioningFlag !== "true") {
  console.error(`[preview-user-provision] explicit ${PROVISION_ENABLED_ENV}=true is required`);
  process.exit(1);
}

function readHiddenTtyLine() {
  return new Promise((resolve, reject) => {
    let value = "";
    const input = process.stdin;
    const output = process.stderr;
    const previousRaw = input.isRaw;

    const cleanup = () => {
      input.off("data", onData);
      input.pause();
      input.setRawMode(Boolean(previousRaw));
      output.write("\n");
    };
    const finish = () => {
      cleanup();
      resolve(value);
    };
    const fail = (error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === "\u0003") {
          fail(new Error("PASSWORD_INPUT_ABORTED"));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = [...value].slice(0, -1).join("");
          continue;
        }
        value += character;
        if (Buffer.byteLength(value, "utf8") > MAX_INPUT_BYTES) {
          fail(new Error("PASSWORD_INPUT_TOO_LONG"));
          return;
        }
      }
    };

    output.write("Preview tester password (input hidden): ");
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

async function readPipedLine() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_INPUT_BYTES) throw new Error("PASSWORD_INPUT_TOO_LONG");
    chunks.push(buffer);
  }
  const input = Buffer.concat(chunks).toString("utf8");
  const password = input.replace(/(?:\r\n|\n|\r)$/u, "");
  if (/\r|\n/u.test(password)) throw new Error("PASSWORD_INPUT_MULTILINE");
  return password;
}

async function operatorPassword() {
  if (process.env.NODE_ENV === "test" && process.env[TEST_PASSWORD_ENV] !== undefined) {
    const testPassword = process.env[TEST_PASSWORD_ENV];
    delete process.env[TEST_PASSWORD_ENV];
    return testPassword;
  }
  if (process.env[TEST_PASSWORD_ENV] !== undefined) {
    throw new Error("PASSWORD_ENV_TEST_ONLY");
  }
  return process.stdin.isTTY ? readHiddenTtyLine() : readPipedLine();
}

let password;
let vite;
try {
  attestPreviewDatabaseMutation();
  password = await operatorPassword();
  vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  const provisioner = await vite.ssrLoadModule("/src/lib/server/preview-test-provisioning.ts");
  const result = await provisioner.provisionConfiguredPreviewTester(password);
  console.log(
    `[preview-user-provision] ${result.created ? "created" : "verified"}; ` +
      `grant=${result.grantWasApplied ? "applied" : "already-applied"}; ` +
      `balance=${result.balanceAfter}; entry=${result.ledgerEntryId}`,
  );
} catch (error) {
  const safeCode =
    typeof error?.code === "string" && /^[A-Z0-9_]{3,80}$/u.test(error.code)
      ? error.code
      : typeof error?.message === "string" && /^[A-Z0-9_]{3,80}$/u.test(error.message)
        ? error.message
        : "UNEXPECTED_FAILURE";
  console.error(`[preview-user-provision] failed: ${safeCode}`);
  process.exitCode = 1;
} finally {
  password = undefined;
  await vite?.close();
}
