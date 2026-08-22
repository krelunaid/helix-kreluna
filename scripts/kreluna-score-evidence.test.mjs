import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function fixtureHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Evidence</title><style>body{font-family:system-ui}button{min-height:44px}</style></head><body><main><h1>Evidence-bound app</h1><label>Name <input name="name"></label><button id="save">Save</button><output id="state">Idle</output><script>save.addEventListener('click',()=>{state.textContent='Saved'})</script></main></body></html>`;
}

test("Kreluna Score v2 separates measured, estimated and not-run evidence", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());

  const [scoreModule, aegisModule, twinModule, qualityModule, cardModule] = await Promise.all([
    vite.ssrLoadModule("/src/lib/score.ts"),
    vite.ssrLoadModule("/src/lib/server/quality/aegis.ts"),
    vite.ssrLoadModule("/src/lib/server/twin.ts"),
    vite.ssrLoadModule("/src/lib/server/quality/types.ts"),
    vite.ssrLoadModule("/src/components/score-card.tsx"),
  ]);
  const html = fixtureHtml();
  const aegis = await aegisModule.runAegisStaticScan(html);
  const notRunTwin = await twinModule.runTwin(html);

  await t.test("missing browser evidence stays null and lowers confidence, not score", async () => {
    const score = await scoreModule.computeScore(
      html,
      "Interactive account dashboard",
      { aegis, twin: notRunTwin },
      "en",
    );

    assert.equal(score.schemaVersion, "2.0.0");
    assert.equal(score.formulaVersion, "kreluna-score-v2");
    assert.equal(score.artifactSha256, aegis.artifactSha256);
    assert.equal(score.readinessEvidence.evidence, "estimated");
    assert.equal(score.metrics.security.evidence, "measured");
    assert.equal(score.metrics.performance.evidence, "estimated");
    assert.equal(score.metrics.reliability.status, "not_run");
    assert.equal(score.metrics.reliability.value, null);
    assert.equal(score.metrics.coverage.status, "not_run");
    assert.equal(score.coverage, null);
    assert.equal(score.readinessEvidence.notRunWeight, 28);

    const available = Object.values(score.metrics).filter(
      (metric) => metric.status === "completed" && metric.value !== null,
    );
    assert.ok(available.length > 0);
    assert.notEqual(score.readiness, 0);
    assert.equal(score.capacityForecast.status, "not_run");
    assert.equal(score.capacityForecast.range, null);
    assert.equal(score.capacityForecast.confidence, 0);
    assert.equal(score.council.kind, "automated_formula");
    assert.equal(score.council.evidence, "estimated");
    assert.ok(score.council.signals.some((signal) => signal.score === null));
    assert.doesNotMatch(
      JSON.stringify(score),
      /Ship web now|Web is fine|watch Warden|Push to stores|In 6 months|Fra 6 mesi/i,
    );
    const markup = renderToStaticMarkup(
      createElement(cardModule.ScoreCard, { score, compact: true }),
    );
    assert.match(markup, /Measured evidence|Prove misurate/);
    assert.match(markup, /Estimated signals|Segnali stimati/);
    assert.match(markup, /NOT RUN|NON ESEGUITO/);
    assert.match(
      markup,
      /Deterministic formula, not independent specialist votes|Formula deterministica, non voti indipendenti di specialisti/,
    );
    assert.doesNotMatch(markup, /Browser action coverage<\/span><span[^>]*>0/);
  });

  await t.test("exact browser evidence produces measured dimensions for the same hash", async () => {
    const hash = aegis.artifactSha256;
    const generatedAt = new Date().toISOString();
    const viewports = [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "phone", width: 390, height: 844 },
    ];
    const twin = qualityModule.TwinBrowserReportSchema.parse({
      kind: "twin_browser",
      version: "1.0.0",
      status: "completed",
      evidence: "measured",
      artifactSha256: hash,
      generatedAt,
      runner: "test-playwright",
      browser: "Chromium test",
      durationMs: 120,
      viewports,
      actions: [
        {
          id: "desktop-click-save",
          viewport: "desktop",
          type: "click",
          label: "Save",
          status: "changed",
          changed: true,
          beforeSha256: "b".repeat(64),
          afterSha256: "c".repeat(64),
        },
      ],
      consoleErrors: [],
      runtimeErrors: [],
      screenshots: [
        { viewport: "desktop", path: "evidence://desktop.png", sha256: "d".repeat(64), bytes: 100 },
        { viewport: "phone", path: "evidence://phone.png", sha256: "e".repeat(64), bytes: 100 },
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
    const echo = qualityModule.EchoAccessibilityReportSchema.parse({
      kind: "echo_accessibility",
      version: "1.0.0",
      status: "completed",
      evidence: "measured",
      artifactSha256: hash,
      generatedAt,
      runner: "test-playwright",
      browser: "Chromium test",
      durationMs: 80,
      viewports,
      passed: true,
      findings: [],
      summary: {
        checksRun: 8,
        high: 0,
        medium: 0,
        low: 0,
        focusableElements: 2,
        keyboardTargetsReached: 2,
      },
      limitations: ["Test fixture rules only"],
    });
    const swift = qualityModule.SwiftPerformanceReportSchema.parse({
      kind: "swift_performance",
      version: "1.0.0",
      status: "completed",
      evidence: "measured",
      artifactSha256: hash,
      generatedAt,
      runner: "test-playwright",
      browser: "Chromium test",
      durationMs: 100,
      metrics: viewports.map((viewport) => ({
        viewport: viewport.name,
        loadMs: 700,
        domContentLoadedMs: 450,
        fcpMs: 300,
        lcpMs: 650,
        cls: 0.01,
        tbtMs: 20,
        requestCount: 1,
        transferBytes: 8_000,
        decodedBytes: 12_000,
        sourceBytes: Buffer.byteLength(html),
      })),
      limitations: ["Isolated runner, not CDN production"],
    });
    const quality = { aegis, twin, echo, swift };
    const first = await scoreModule.computeScore(
      html,
      "Interactive account dashboard",
      quality,
      "en",
    );
    const second = await scoreModule.computeScore(
      html,
      "Interactive account dashboard",
      quality,
      "en",
    );

    for (const id of [
      "security",
      "performance",
      "accessibility",
      "reliability",
      "coverage",
    ]) {
      assert.equal(first.metrics[id].evidence, "measured");
      assert.equal(first.metrics[id].artifactSha256, hash);
    }
    assert.equal(first.coverage, 50);
    assert.equal(first.readinessEvidence.measuredWeight, 68);
    assert.equal(first.readinessEvidence.estimatedWeight, 32);
    assert.equal(first.readinessEvidence.notRunWeight, 0);
    assert.deepEqual(first.council, second.council);
    assert.equal(first.capacityForecast.status, "not_run");
  });

  await t.test("stale or structurally invalid score evidence is rejected", async () => {
    const stale = await scoreModule.computeScore(
      html,
      "Interactive app",
      {
        aegis,
        twin: { ...notRunTwin, artifactSha256: "a".repeat(64) },
      },
      "en",
    );
    assert.equal(stale.metrics.coverage.status, "failed");
    assert.match(stale.critical.join(" "), /does not match/i);

    const valid = scoreModule.normalizePersistedScore(stale, stale.artifactSha256);
    assert.ok(valid);
    assert.equal(
      scoreModule.normalizePersistedScore(stale, "f".repeat(64)),
      undefined,
    );
    const badConfidence = structuredClone(stale);
    badConfidence.metrics.security.confidence = 2;
    assert.equal(
      scoreModule.normalizePersistedScore(badConfidence, stale.artifactSha256),
      undefined,
    );
    const fakeNotRunValue = structuredClone(stale);
    fakeNotRunValue.metrics.coverage.value = 0;
    assert.equal(
      scoreModule.normalizePersistedScore(fakeNotRunValue, stale.artifactSha256),
      undefined,
    );
  });
});

test("score consumers use the sealed v2 evidence contract", async () => {
  const [orchestrator, launch, candidate, card, source, queue, scoreFn] = await Promise.all([
    readFile(new URL("../src/lib/server/orchestrator/helix.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/studio.$id.launch.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/server/release/candidate.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/score-card.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/score.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/server/jobs/queue.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/server/score-fn.ts", import.meta.url), "utf8"),
  ]);

  assert.match(orchestrator, /score = await computeScore\(page, job\.prompt, job\.quality/);
  assert.match(orchestrator, /const resumedScore = await computeScore/);
  assert.doesNotMatch(launch, /scoreProduct/);
  assert.match(launch, /setScore\(next\?\.score \?\? null\)/);
  assert.match(candidate, /Weighted inputs:/);
  assert.match(candidate, /Capacity forecast/);
  assert.match(card, /score\.measuredEvidence/);
  assert.match(card, /score\.unavailableEvidence/);
  assert.doesNotMatch(card, /score\.horizon/);
  assert.match(queue, /normalizePersistedScore/);
  assert.doesNotMatch(scoreFn, /runBrowserQuality/);
  assert.match(scoreFn, /liftScore[\s\S]*middleware\(\[authMiddleware\]\)/);
  assert.doesNotMatch(
    source,
    /Ship web now|Web is fine|watch Warden|Push to stores|In 6 months|Fra 6 mesi/i,
  );
});
