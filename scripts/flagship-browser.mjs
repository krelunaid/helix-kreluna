#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const locale = argument("--locale", "en");
const outputRoot = resolve(argument("--output", "artifacts/flagship-browser"));
const requireCompleted = process.argv.includes("--require-completed");
const allowedLocales = new Set(["it", "en", "es", "fr", "de", "pt"]);
if (!allowedLocales.has(locale)) throw new Error("FLAGSHIP_BROWSER_LOCALE_INVALID");

const root = resolve(new URL("..", import.meta.url).pathname);
const temp = await mkdtemp(join(tmpdir(), "helix-flagship-browser-"));
const vite = await createServer({
  root,
  configFile: false,
  appType: "custom",
  logLevel: "silent",
  resolve: { alias: { "@": join(root, "src") } },
  server: { middlewareMode: true, hmr: false },
});

const results = [];
try {
  const catalog = await vite.ssrLoadModule("/src/lib/flagships/catalog.ts");
  await mkdir(outputRoot, { recursive: true });
  for (const id of catalog.FLAGSHIP_IDS) {
    const artifact = join(temp, `${id}.html`);
    const resultDirectory = join(outputRoot, id);
    const reportPath = join(resultDirectory, "twin.json");
    const echoPath = join(resultDirectory, "echo.json");
    const swiftPath = join(resultDirectory, "swift.json");
    const screenshotsPath = join(resultDirectory, "screenshots");
    await mkdir(resultDirectory, { recursive: true });
    await writeFile(artifact, catalog.buildFlagshipHtml(id, locale), "utf8");

    const args = [
      join(root, "scripts/twin-browser.mjs"),
      "--input",
      artifact,
      "--output",
      reportPath,
      "--echo-output",
      echoPath,
      "--swift-output",
      swiftPath,
      "--screenshots",
      screenshotsPath,
      ...(requireCompleted ? ["--require-browser"] : []),
    ];
    const child = spawnSync(process.execPath, args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
    });
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    const completed = report.status === "completed";
    const passed =
      completed &&
      report.consoleErrors.length === 0 &&
      report.runtimeErrors.length === 0 &&
      report.summary.controlsExercised >= 8 &&
      report.summary.changedActions >= 5 &&
      report.summary.blockedExternalRequests === 0;
    results.push({
      id,
      status: report.status,
      evidence: report.evidence,
      artifactSha256: report.artifactSha256,
      passed,
      reasonCode: report.reasonCode ?? null,
      controlsExercised: report.summary?.controlsExercised ?? null,
      changedActions: report.summary?.changedActions ?? null,
      consoleErrors: report.consoleErrors?.length ?? null,
      runtimeErrors: report.runtimeErrors?.length ?? null,
      childExitCode: child.status,
    });
  }
} finally {
  await vite.close();
  await rm(temp, { recursive: true, force: true });
}

const summary = {
  schemaVersion: "1.0.0",
  locale,
  generatedAt: new Date().toISOString(),
  requiredStatus: "completed",
  status: results.every((result) => result.passed)
    ? "completed"
    : results.some((result) => result.status === "failed")
      ? "failed"
      : "not_run",
  results,
};
await writeFile(
  join(outputRoot, "summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(summary)}\n`);
if (summary.status === "failed") process.exitCode = 1;
if (requireCompleted && summary.status !== "completed") process.exitCode = 2;
