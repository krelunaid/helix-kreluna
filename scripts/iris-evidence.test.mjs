import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HASH = "a".repeat(64);

function completedTwin(runtimeErrors = [], { withInteraction = true } = {}) {
  return {
    kind: "twin_browser",
    version: "1.0.0",
    status: "completed",
    evidence: "measured",
    artifactSha256: HASH,
    generatedAt: new Date().toISOString(),
    runner: "test-playwright",
    browser: "Chromium test",
    durationMs: 100,
    viewports: [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "phone", width: 390, height: 844 },
    ],
    actions: withInteraction
      ? [
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
        ]
      : [],
    consoleErrors: [],
    runtimeErrors,
    screenshots: [
      { viewport: "desktop", path: "/tmp/desktop.png", sha256: HASH, bytes: 20 },
      { viewport: "phone", path: "/tmp/phone.png", sha256: HASH, bytes: 20 },
    ],
    summary: {
      controlsDiscovered: withInteraction ? 1 : 0,
      controlsExercised: withInteraction ? 1 : 0,
      changedActions: withInteraction ? 1 : 0,
      formsDiscovered: 0,
      formsExercised: 0,
      navigations: 0,
      dialogs: 0,
      blockedExternalRequests: 0,
    },
  };
}

function completedEcho({ passed = true } = {}) {
  const findings = passed
    ? []
    : [
        {
          ruleId: "form-control-name",
          category: "labels",
          severity: "high",
          message: "Control has no accessible name.",
          count: 1,
          samples: ["input#email"],
        },
      ];
  return {
    kind: "echo_accessibility",
    version: "1.0.0",
    status: "completed",
    evidence: "measured",
    artifactSha256: HASH,
    generatedAt: new Date().toISOString(),
    runner: "test-a11y",
    browser: "Chromium test",
    durationMs: 100,
    viewports: [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "phone", width: 390, height: 844 },
    ],
    passed,
    findings,
    summary: {
      checksRun: 16,
      high: passed ? 0 : 1,
      medium: 0,
      low: 0,
      focusableElements: 2,
      keyboardTargetsReached: 2,
    },
    limitations: ["Test fixture."],
  };
}

function completedSwift() {
  const metric = (viewport) => ({
    viewport,
    loadMs: 100,
    domContentLoadedMs: 80,
    fcpMs: 60,
    lcpMs: 90,
    cls: 0,
    tbtMs: 0,
    requestCount: 1,
    transferBytes: 1_000,
    decodedBytes: 2_000,
    sourceBytes: 2_000,
  });
  return {
    kind: "swift_performance",
    version: "1.0.0",
    status: "completed",
    evidence: "measured",
    artifactSha256: HASH,
    generatedAt: new Date().toISOString(),
    runner: "test-performance",
    browser: "Chromium test",
    durationMs: 100,
    metrics: [metric("desktop"), metric("phone")],
    limitations: ["Test fixture."],
  };
}

const assessment = {
  score: 9,
  recommendation: "pass",
  issues: [],
  mustFix: [],
};

test("Iris cannot certify runtime success without current browser evidence", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const reviewAgents = await vite.ssrLoadModule(
    "/src/lib/server/review/agents.ts",
  );
  const types = await vite.ssrLoadModule("/src/lib/server/agents/types.ts");

  const notRun = {
    kind: "twin_browser",
    version: "1.0.0",
    status: "not_run",
    evidence: "not_run",
    artifactSha256: HASH,
    generatedAt: new Date().toISOString(),
    reasonCode: "browser_runner_unconfigured",
    detail: "Browser not configured.",
  };
  const echoNotRun = {
    ...notRun,
    kind: "echo_accessibility",
  };
  const swiftNotRun = {
    ...notRun,
    kind: "swift_performance",
  };
  const inconclusive = reviewAgents.finalizeIrisReview({
    assessment,
    twin: notRun,
    echo: echoNotRun,
    swift: swiftNotRun,
    artifactSha256: HASH,
  });
  assert.equal(inconclusive.status, "inconclusive");
  assert.equal(inconclusive.pass, false);
  assert.equal(inconclusive.evidence, "static_only");
  assert.equal(inconclusive.confidence, 0.4);

  const passed = reviewAgents.finalizeIrisReview({
    assessment,
    twin: completedTwin(),
    echo: completedEcho(),
    swift: completedSwift(),
    artifactSha256: HASH,
  });
  assert.equal(passed.status, "passed");
  assert.equal(passed.pass, true);
  assert.equal(passed.evidence, "browser_assisted");

  const noInteraction = reviewAgents.finalizeIrisReview({
    assessment,
    twin: completedTwin([], { withInteraction: false }),
    echo: completedEcho(),
    swift: completedSwift(),
    artifactSha256: HASH,
  });
  assert.equal(noInteraction.status, "inconclusive");
  assert.equal(noInteraction.pass, false);

  const runtimeFailure = reviewAgents.finalizeIrisReview({
    assessment,
    twin: completedTwin(["ReferenceError: broken is not defined"]),
    echo: completedEcho(),
    swift: completedSwift(),
    artifactSha256: HASH,
  });
  assert.equal(runtimeFailure.status, "failed");
  assert.equal(runtimeFailure.pass, false);

  const accessibilityFailure = reviewAgents.finalizeIrisReview({
    assessment,
    twin: completedTwin(),
    echo: completedEcho({ passed: false }),
    swift: completedSwift(),
    artifactSha256: HASH,
  });
  assert.equal(accessibilityFailure.status, "failed");
  assert.equal(accessibilityFailure.pass, false);

  assert.throws(
    () =>
      reviewAgents.finalizeIrisReview({
        assessment,
        twin: notRun,
        echo: echoNotRun,
        swift: swiftNotRun,
        artifactSha256: "b".repeat(64),
      }),
    /IRIS_EVIDENCE_STALE/,
  );
  assert.equal(
    types.ReviewResultSchema.safeParse({
      ...inconclusive,
      status: "passed",
      pass: true,
    }).success,
    false,
  );
});

test("Iris prompts and checkpoints are evidence-bound and re-run after a patch", async () => {
  const [reviewSource, orchestrator] = await Promise.all([
    readFile(
      new URL("../src/lib/server/review/agents.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/lib/server/orchestrator/helix.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.doesNotMatch(reviewSource, /Play the app as a stranger/);
  assert.match(reviewSource, /Never claim you clicked, navigated, measured/);
  assert.match(reviewSource, /ECHO ACCESSIBILITY REPORT/);
  assert.match(reviewSource, /SWIFT PERFORMANCE REPORT/);
  assert.match(reviewSource, /COMPLETE HTML ARTIFACT/);
  assert.match(orchestrator, /savedReview\.data\.artifactSha256 === reviewArtifactSha256/);
  assert.match(orchestrator, /review\.artifactSha256 !== finalReviewArtifactSha256/);
  assert.match(orchestrator, /Re-reviewing the final artifact/);
});
