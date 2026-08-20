import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";
import { createTwinHarnessDocument } from "./twin-harness.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function fixtureHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Twin</title></head><body><main><h1>Real browser fixture</h1><p>${"Interactive evidence. ".repeat(30)}</p><button id="open">Open</button><output id="state">Closed</output><script>open.addEventListener('click',()=>{state.textContent='Open'})</script></main></body></html>`;
}

test("the Twin harness applies the production sandbox and CSP before artifact code", () => {
  const document = createTwinHarnessDocument(
    '<script data-twin-attack>window.attack=true</script><button>Open</button>',
  );
  assert.match(document, /sandbox="allow-scripts allow-forms"/);
  assert.match(document, /referrerpolicy="no-referrer"/);
  assert.ok(
    document.indexOf("Content-Security-Policy") <
      document.indexOf("data-twin-attack"),
  );
  assert.match(document, /connect-src 'none'/);
});

test("the server compatibility entrypoint reports not_run instead of simulating clicks", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const twin = await vite.ssrLoadModule("/src/lib/server/twin.ts");
  const browserQuality = await vite.ssrLoadModule(
    "/src/lib/server/quality/browser.ts",
  );
  const quality = await vite.ssrLoadModule("/src/lib/server/quality/types.ts");
  const score = await vite.ssrLoadModule("/src/lib/score.ts");
  const report = await twin.runTwin(fixtureHtml());

  assert.equal(report.status, "not_run");
  assert.equal(report.evidence, "not_run");
  assert.equal(report.reasonCode, "browser_runner_unconfigured");
  assert.match(report.artifactSha256, /^[0-9a-f]{64}$/);
  assert.equal(Object.hasOwn(report, "actions"), false);
  assert.equal(Object.hasOwn(report, "consoleErrors"), false);
  const notRunScore = await score.computeScore(
    fixtureHtml(),
    "Interactive app",
    { twin: report },
  );
  assert.equal(notRunScore.coverage, null);
  assert.equal(notRunScore.metrics.coverage.status, "not_run");
  const supporting = await browserQuality.createBrowserQualityNotRun({
    html: fixtureHtml(),
  });
  assert.equal(supporting.echo.status, "not_run");
  assert.equal(supporting.swift.status, "not_run");
  assert.equal(supporting.echo.artifactSha256, report.artifactSha256);
  assert.equal(supporting.swift.artifactSha256, report.artifactSha256);

  const hash = "a".repeat(64);
  const completed = quality.TwinBrowserReportSchema.parse({
    kind: "twin_browser",
    version: "1.0.0",
    status: "completed",
    evidence: "measured",
    artifactSha256: report.artifactSha256,
    generatedAt: new Date().toISOString(),
    runner: "test-playwright",
    browser: "Chromium test",
    durationMs: 100,
    viewports: [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "phone", width: 390, height: 844 },
    ],
    actions: [
      {
        id: "desktop-click-1",
        viewport: "desktop",
        type: "click",
        label: "Open",
        status: "changed",
        changed: true,
        beforeSha256: "b".repeat(64),
        afterSha256: "c".repeat(64),
      },
    ],
    consoleErrors: [],
    runtimeErrors: [],
    screenshots: [
      { viewport: "desktop", path: "/tmp/desktop.png", sha256: hash, bytes: 20 },
      { viewport: "phone", path: "/tmp/phone.png", sha256: hash, bytes: 20 },
    ],
    summary: {
      controlsDiscovered: 2,
      controlsExercised: 1,
      changedActions: 1,
      formsDiscovered: 0,
      formsExercised: 0,
      navigations: 0,
      dialogs: 0,
      blockedExternalRequests: 0,
    },
  });
  assert.equal(
    (
      await score.computeScore(fixtureHtml(), "Interactive app", {
        twin: completed,
      })
    ).coverage,
    50,
  );
  const stale = await score.computeScore(fixtureHtml(), "Interactive app", {
    twin: { ...completed, artifactSha256: hash },
  });
  assert.equal(stale.coverage, null);
  assert.equal(stale.metrics.coverage.status, "failed");
  assert.match(stale.critical.join(" "), /does not match/i);
});

test("the CLI emits a validated not_run report when the browser dependency is absent", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "helix-twin-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, "artifact.html");
  const output = join(directory, "report.json");
  await writeFile(input, fixtureHtml(), "utf8");
  const result = spawnSync(
    process.execPath,
    [join(ROOT, "scripts/twin-browser.mjs"), "--input", input, "--output", output],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        HELIX_PLAYWRIGHT_PACKAGE: "helix-playwright-missing-test-fixture",
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(await readFile(output, "utf8"));
  const echo = JSON.parse(await readFile(join(directory, "echo.json"), "utf8"));
  const swift = JSON.parse(await readFile(join(directory, "swift.json"), "utf8"));
  assert.equal(report.status, "not_run");
  assert.equal(report.reasonCode, "browser_dependency_missing");
  assert.equal(Object.hasOwn(report, "actions"), false);
  assert.match(report.artifactSha256, /^[0-9a-f]{64}$/);
  assert.equal(echo.status, "not_run");
  assert.equal(echo.reasonCode, "browser_dependency_missing");
  assert.equal(swift.status, "not_run");
  assert.equal(swift.reasonCode, "browser_dependency_missing");
  assert.equal(echo.artifactSha256, report.artifactSha256);
  assert.equal(swift.artifactSha256, report.artifactSha256);
});

test("the browser runner contains real actions, screenshots and network denial", async () => {
  const [runner, twinSource, orchestrator] = await Promise.all([
    readFile(new URL("./twin-browser.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/server/twin.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../src/lib/server/orchestrator/helix.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(runner, /chromium\.launch/);
  assert.match(runner, /control\.click/);
  assert.match(runner, /field\.fill/);
  assert.match(runner, /page\.screenshot/);
  assert.match(runner, /auditAccessibility/);
  assert.match(runner, /readPerformanceMetrics/);
  assert.match(runner, /route\.abort\("blockedbyclient"\)/);
  assert.match(runner, /VIEWPORTS/);
  assert.doesNotMatch(twinSource, /matchAll|buttonLabels|deadClicks/);
  assert.match(orchestrator, /job\.quality = \{[\s\S]*?\btwin\b/);
  assert.match(orchestrator, /runBrowserQuality\(/);
  assert.match(orchestrator, /setBrowserEvidenceStep/);
});
