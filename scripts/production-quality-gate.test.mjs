import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const MEASURED_AT = "2026-08-20T12:00:20.000Z";

function productionFiles() {
  return {
    ".env.example": "PUBLIC_ORIGIN=\nSESSION_SIGNING_SECRET=\n",
    "README.md": "# Production quality fixture\n",
    "apps/web/index.html":
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Quality fixture</title></head><body><div id="app"></div><script type="module" src="./src/main.js"></script></body></html>\n',
    "apps/web/src/main.js":
      'const root=document.querySelector("#app");const heading=document.createElement("h1");heading.textContent="Measured Production quality";root?.replaceChildren(heading);\n',
    "docs/architecture.md": "# Architecture\n\nBounded browser source.\n",
    "docs/decisions.md": "# Decisions\n\nUse the fixed quality profile.\n",
    "docs/prd.md": "# PRD\n\nVerify immutable Production evidence.\n",
    "docs/score.md": "# Score\n\nNo browser score is claimed.\n",
    "migrations/0001_init.sql":
      "BEGIN;\nCREATE TABLE records (id text PRIMARY KEY);\nCOMMIT;\n",
    "netlify.toml": "[build]\ncommand = 'npm run build'\npublish = 'dist'\n",
    "package-lock.json": JSON.stringify({
      name: "production-quality-fixture",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": { name: "production-quality-fixture", version: "1.0.0" },
      },
    }),
    "package.json": JSON.stringify({
      name: "production-quality-fixture",
      version: "1.0.0",
      private: true,
      scripts: {
        build: "node scripts/build.mjs",
        lint: "node scripts/lint.mjs",
        test: "node --test tests",
        typecheck: "tsc --noEmit",
      },
    }),
    "scripts/build.mjs": "export const built = true;\n",
    "scripts/lint.mjs": "export const linted = true;\n",
    "tests/quality.test.mjs":
      'import test from "node:test";test("fixture",()=>{});\n',
  };
}

function runnerReport(candidateSha256, options = {}) {
  const ids = ["install", "typecheck", "lint", "test", "build", "security"];
  const base = Date.parse("2026-08-20T12:00:00.000Z");
  const steps = ids.map((id, index) => {
    const startedAt = new Date(base + index * 2_000).toISOString();
    const completedAt = new Date(base + index * 2_000 + 1_000).toISOString();
    const failed = options.failSecurity && id === "security";
    return {
      id,
      status: failed ? "failed" : "passed",
      evidence: "measured",
      tool:
        id === "security"
          ? "npm audit --omit=dev --audit-level=high"
          : `fixture-${id}`,
      exitCode: failed ? 1 : 0,
      startedAt,
      completedAt,
      durationMs: 1_000,
      networkPolicy:
        id === "install" || id === "security"
          ? "package_registry_only"
          : "disabled",
      stdoutSha256: EMPTY_SHA256,
      stderrSha256: EMPTY_SHA256,
      outputTruncated: false,
      detail: `${id} produced measured fixture evidence`,
    };
  });
  return {
    kind: "helix_workspace_validation_report",
    schemaVersion: "1.1.0",
    requestNonce: crypto.randomUUID(),
    candidateSha256,
    runner: {
      provider: "bounded-quality-contract-fixture",
      isolation: "container",
      sandboxIdSha256: "a".repeat(64),
      destroyed: true,
      networkDefault: "disabled",
    },
    startedAt: steps[0].startedAt,
    completedAt: steps.at(-1).completedAt,
    durationMs: 11_000,
    steps,
  };
}

function previewHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Production quality</title></head><body><main><h1>Production quality</h1><p>${"Measured immutable workspace evidence. ".repeat(12)}</p></main></body></html>`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function completedBrowserEvidence(artifactSha256) {
  const generatedAt = "2026-08-20T12:00:15.000Z";
  const viewports = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "phone", width: 390, height: 844 },
  ];
  return {
    twin: {
      kind: "twin_browser",
      version: "1.0.0",
      status: "completed",
      evidence: "measured",
      artifactSha256,
      generatedAt,
      runner: "authenticated-browser-fixture",
      browser: "Chromium fixture",
      durationMs: 120,
      viewports,
      actions: [
        {
          id: "primary-action",
          viewport: "desktop",
          type: "click",
          label: "Open measured panel",
          status: "changed",
          changed: true,
          beforeSha256: "1".repeat(64),
          afterSha256: "2".repeat(64),
        },
      ],
      consoleErrors: [],
      runtimeErrors: [],
      screenshots: [
        {
          viewport: "desktop",
          path: `evidence://desktop/${"3".repeat(64)}.png`,
          sha256: "3".repeat(64),
          bytes: 128,
        },
        {
          viewport: "phone",
          path: `evidence://phone/${"4".repeat(64)}.png`,
          sha256: "4".repeat(64),
          bytes: 128,
        },
      ],
      summary: {
        controlsDiscovered: 1,
        controlsExercised: 1,
        changedActions: 1,
        formsDiscovered: 0,
        formsExercised: 0,
        navigations: 0,
        dialogs: 0,
        blockedExternalRequests: 0,
      },
    },
    echo: {
      kind: "echo_accessibility",
      version: "1.0.0",
      status: "completed",
      evidence: "measured",
      artifactSha256,
      generatedAt,
      runner: "authenticated-browser-fixture",
      browser: "Chromium fixture",
      durationMs: 60,
      viewports,
      passed: true,
      findings: [],
      summary: {
        checksRun: 12,
        high: 0,
        medium: 0,
        low: 0,
        focusableElements: 1,
        keyboardTargetsReached: 1,
      },
      limitations: ["Injected schema-valid test evidence; no browser was launched by this unit test."],
    },
    swift: {
      kind: "swift_performance",
      version: "1.0.0",
      status: "completed",
      evidence: "measured",
      artifactSha256,
      generatedAt,
      runner: "authenticated-browser-fixture",
      browser: "Chromium fixture",
      durationMs: 80,
      metrics: viewports.map((viewport) => ({
        viewport: viewport.name,
        loadMs: 120,
        domContentLoadedMs: 90,
        fcpMs: 70,
        lcpMs: 100,
        cls: 0,
        tbtMs: 5,
        requestCount: 1,
        transferBytes: 2_048,
        decodedBytes: 4_096,
        sourceBytes: 2_048,
      })),
      limitations: ["Injected schema-valid test evidence; no browser was launched by this unit test."],
    },
  };
}

test("Production post-build quality evidence is measured, hash-bound, and fail-closed", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const [workspace, quality, twinModule, browserModule] = await Promise.all([
    vite.ssrLoadModule("/src/lib/workspace.ts"),
    vite.ssrLoadModule("/src/lib/server/quality/production-workspace.ts"),
    vite.ssrLoadModule("/src/lib/server/twin.ts"),
    vite.ssrLoadModule("/src/lib/server/quality/browser.ts"),
  ]);
  const prepared = await workspace.createProductionWorkspaceCandidate({
    jobId: "production-quality-job",
    projectId: "production-quality-project",
    locale: "en",
    pipelineVersion: "production-quality-v1",
    createdAt: "2026-08-20T12:00:00.000Z",
    entrypoint: "apps/web/index.html",
    files: productionFiles(),
  });
  const runner = runnerReport(prepared.candidate.sourceSha256);
  const [twin, browser] = await Promise.all([
    twinModule.createTwinNotRunReport(previewHtml()),
    browserModule.createBrowserQualityNotRun({ html: previewHtml() }),
  ]);
  const runtimeInput = {
    runtimeProfile: "static_site",
    browserQuality: { twin, ...browser },
    brief: "Create a static Production quality fixture",
    acceptanceCriteria: ["The static source gate passes without claiming runtime validation."],
  };
  const report = await quality.runProductionWorkspaceQualityPass({
    files: prepared.files,
    candidate: prepared.candidate,
    previewHtml: previewHtml(),
    runnerReport: runner,
    ...runtimeInput,
    measuredAt: MEASURED_AT,
  });
  const reportSha256 = await quality.productionWorkspaceQualityReportSha256(report);
  assert.equal(report.passed, true);
  assert.equal(report.blockerCount, 0);
  assert.deepEqual(
    report.checks.map((check) => [check.id, check.status, check.evidence]),
    [
      ["candidate_integrity", "passed", "measured"],
      ["aegis_static_security", "passed", "measured"],
      ["secret_scan", "passed", "measured"],
      ["dependency_audit", "passed", "measured"],
      ["static_workspace_review", "passed", "measured"],
      ["runtime_quality", "not_run", "not_run"],
    ],
  );
  assert.deepEqual(
    report.runtimeQuality.reports.map((entry) => [entry.agent, entry.status, entry.evidence]),
    [
      ["twin", "not_run", "not_run"],
      ["echo", "not_run", "not_run"],
      ["swift", "not_run", "not_run"],
    ],
  );
  assert.equal(report.runtimeQuality.iris.status, "not_run");
  assert.equal(report.runtimeQuality.validated, false);
  assert.equal(
    await quality.verifyProductionWorkspaceQualityReport({
      files: prepared.files,
      candidate: prepared.candidate,
      previewHtml: previewHtml(),
      runnerReport: runner,
      ...runtimeInput,
      report,
      reportSha256,
    }),
    true,
  );
  assert.doesNotThrow(() =>
    quality.assertProductionWorkspaceQualityPassed(report, {
      candidateSha256: report.candidateSha256,
      previewSha256: report.previewSha256,
      runnerReportSha256: report.runnerReportSha256,
    }),
  );

  const tamperedReport = structuredClone(report);
  tamperedReport.checks[0].detail = "tampered evidence";
  assert.equal(
    await quality.verifyProductionWorkspaceQualityReport({
      files: prepared.files,
      candidate: prepared.candidate,
      previewHtml: previewHtml(),
      runnerReport: runner,
      ...runtimeInput,
      report: tamperedReport,
      reportSha256,
    }),
    false,
  );

  const secretFiles = {
    ...prepared.files,
    "apps/web/src/leaked.js": `export const key = "sk_live_${"A".repeat(32)}";\n`,
  };
  const secretReport = await quality.runProductionWorkspaceQualityPass({
    files: secretFiles,
    candidate: prepared.candidate,
    previewHtml: previewHtml(),
    runnerReport: runner,
    ...runtimeInput,
    measuredAt: MEASURED_AT,
  });
  assert.equal(secretReport.passed, false);
  assert.ok(secretReport.findings.some((finding) => finding.checkId === "secret_scan"));
  assert.equal(JSON.stringify(secretReport).includes("sk_live_"), false);
  assert.throws(
    () =>
      quality.assertProductionWorkspaceQualityPassed(secretReport, {
        candidateSha256: secretReport.candidateSha256,
        previewSha256: secretReport.previewSha256,
        runnerReportSha256: secretReport.runnerReportSha256,
      }),
    /PRODUCTION_WORKSPACE_QUALITY_BLOCKED/u,
  );

  const unsafeFiles = {
    ...prepared.files,
    "apps/web/src/main.js": 'app.innerHTML = new URLSearchParams(location.search).get("q");\n',
  };
  const unsafeReport = await quality.runProductionWorkspaceQualityPass({
    files: unsafeFiles,
    candidate: prepared.candidate,
    previewHtml: previewHtml(),
    runnerReport: runner,
    ...runtimeInput,
    measuredAt: MEASURED_AT,
  });
  assert.ok(
    unsafeReport.findings.some(
      (finding) => finding.id === "unsafe_html_parser_sink",
    ),
  );

  const failedDependencyReport = await quality.runProductionWorkspaceQualityPass({
    files: prepared.files,
    candidate: prepared.candidate,
    previewHtml: previewHtml(),
    runnerReport: runnerReport(prepared.candidate.sourceSha256, {
      failSecurity: true,
    }),
    ...runtimeInput,
    measuredAt: MEASURED_AT,
  });
  assert.ok(
    failedDependencyReport.findings.some(
      (finding) => finding.id === "dependency_audit_failed",
    ),
  );
  assert.equal(failedDependencyReport.passed, false);

  const artifactSha256 = sha256(previewHtml());
  const measuredBrowser = completedBrowserEvidence(artifactSha256);
  const irisReview = {
    artifactSha256,
    status: "passed",
    evidence: "browser_assisted",
    confidence: 0.92,
    score: 9,
    pass: true,
    issues: [],
    mustFix: [],
  };
  const interactiveReport = await quality.runProductionWorkspaceQualityPass({
    files: prepared.files,
    candidate: prepared.candidate,
    previewHtml: previewHtml(),
    runnerReport: runner,
    runtimeProfile: "client_only_app",
    browserQuality: measuredBrowser,
    irisReview,
    brief: "Create an interactive Production app",
    acceptanceCriteria: ["The primary control changes visible UI state."],
    measuredAt: MEASURED_AT,
  });
  assert.equal(interactiveReport.passed, true);
  assert.equal(interactiveReport.runtimeQuality.required, true);
  assert.equal(interactiveReport.runtimeQuality.validated, true);
  assert.equal(
    interactiveReport.checks.find((check) => check.id === "runtime_quality")?.status,
    "passed",
  );
  assert.equal(
    await quality.verifyProductionWorkspaceQualityReport({
      files: prepared.files,
      candidate: prepared.candidate,
      previewHtml: previewHtml(),
      runnerReport: runner,
      runtimeProfile: "client_only_app",
      browserQuality: measuredBrowser,
      irisReview,
      brief: "Create an interactive Production app",
      acceptanceCriteria: ["The primary control changes visible UI state."],
      report: interactiveReport,
      reportSha256:
        await quality.productionWorkspaceQualityReportSha256(interactiveReport),
    }),
    true,
  );

  const unvalidatedInteractive = await quality.runProductionWorkspaceQualityPass({
    files: prepared.files,
    candidate: prepared.candidate,
    previewHtml: previewHtml(),
    runnerReport: runner,
    runtimeProfile: "service_app",
    browserQuality: runtimeInput.browserQuality,
    brief: "Create a rich service application",
    acceptanceCriteria: ["The primary workflow works at runtime."],
    measuredAt: MEASURED_AT,
  });
  assert.equal(unvalidatedInteractive.passed, false);
  assert.ok(
    unvalidatedInteractive.findings.some(
      (finding) => finding.id === "interactive_runtime_not_validated",
    ),
  );
  assert.throws(
    () =>
      quality.assertProductionWorkspaceQualityPassed(unvalidatedInteractive, {
        candidateSha256: unvalidatedInteractive.candidateSha256,
        previewSha256: unvalidatedInteractive.previewSha256,
        runnerReportSha256: unvalidatedInteractive.runnerReportSha256,
      }),
    /PRODUCTION_WORKSPACE_QUALITY_BLOCKED/u,
  );
});
