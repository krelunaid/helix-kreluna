import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function html(body, script = "") {
  const copy = "A measured Aegis fixture with enough complete product content. ".repeat(10);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Aegis fixture</title></head><body><main><h1>Fixture</h1><p>${copy}</p>${body}</main>${
    script ? `<script>${script}</script>` : ""
  }</body></html>`;
}

test("Aegis produces measured, redacted and release-blocking evidence", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());

  const aegis = await vite.ssrLoadModule("/src/lib/server/quality/aegis.ts");
  const generatedPolicy = await vite.ssrLoadModule(
    "/src/lib/generated-content-policy.ts",
  );
  const house = await vite.ssrLoadModule("/src/lib/house.ts");

  await t.test("generated CSP is offline by default but preserves local prototype assets", () => {
    const csp = generatedPolicy.buildGeneratedContentCsp();
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /style-src 'self' 'unsafe-inline'/);
    assert.match(csp, /img-src 'self' data: blob:/);
    assert.match(csp, /font-src 'self' data:/);
    assert.match(csp, /media-src 'self' data: blob:/);
    assert.match(csp, /connect-src 'none'/);
    assert.doesNotMatch(csp, /https?:\/\//);

    const explicitlyReviewed = generatedPolicy.buildGeneratedContentCsp({
      images: ["https://assets.example.test/path"],
    });
    assert.match(explicitlyReviewed, /img-src [^;]*https:\/\/assets\.example\.test/);
    assert.doesNotMatch(explicitlyReviewed, /\/path/);
  });

  await t.test("a safe artifact passes every scanner check", async () => {
    const source = html(
      '<button id="open" type="button">Open details</button><output id="status">Ready</output>',
      "document.getElementById('open').addEventListener('click',()=>{document.getElementById('status').textContent='Opened'})",
    );
    const report = await aegis.runAegisStaticScan(source);
    assert.equal(report.evidence, "measured");
    assert.equal(report.scanner, "helix-aegis");
    assert.equal(report.version, "1.0.0");
    assert.equal(report.passed, true);
    assert.equal(report.blockerCount, 0);
    assert.equal(report.findings.length, 0);
    assert.equal(report.checks.length, 8);
    assert.ok(report.checks.every((check) => check.status === "passed"));
    assert.match(report.artifactSha256, /^[0-9a-f]{64}$/);
    assert.ok(report.scope.some((entry) => entry.includes("offline-by-default")));
    assert.ok(report.limitations.some((entry) => entry.includes("not a semantic")));
    assert.ok(
      report.limitations.some((entry) => entry.includes("not a claim of complete")),
    );
  });

  await t.test("self, data and blob asset expressions remain valid prototype behavior", async () => {
    const source = html(
      '<img id="hero" alt="Abstract hero" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">' +
        '<video id="clip" src="blob:helix-local"></video><a href="#details">Details</a>',
      [
        "hero['src']='data:image/gif;base64,R0lGODlhAQABAAAAACw='",
        "clip.src=URL.createObjectURL(new Blob(['local']))",
        "hero.style.backgroundImage='url(data:image/gif;base64,R0lGODlhAQABAAAAACw=)'",
      ].join(";\n"),
    );
    const report = await aegis.runAegisStaticScan(source);
    assert.equal(report.passed, true);
    assert.equal(report.blockerCount, 0);
    assert.equal(report.findings.length, 0);
  });

  await t.test("static HTML construction is reviewable but is not called an exploit", async () => {
    const source = html('<div id="items"></div>', "items.innerHTML='<b>Fixed</b>'");
    const report = await aegis.runAegisStaticScan(source);
    assert.equal(report.passed, true);
    assert.equal(report.blockerCount, 0);
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].id, "html_assignment");
    assert.equal(report.findings[0].severity, "medium");
    assert.doesNotThrow(() =>
      aegis.assertAegisReleasePassed(report, report.artifactSha256),
    );
    assert.throws(
      () => aegis.assertAegisReleasePassed(report, "0".repeat(64)),
      /AEGIS_RELEASE_BLOCKED/,
    );
  });

  await t.test("secrets, tainted sinks and unapproved network calls block release", async () => {
    const credential = ["sk", "live", "A".repeat(24)].join("_");
    const source = html(
      '<div id="result"></div><script src="https://untrusted.invalid/app.js"></script>',
      `const apiKey='${credential}';result.innerHTML=new URLSearchParams(location.search).get('q');fetch('/api/private')`,
    );
    const report = await aegis.runAegisStaticScan(source);
    assert.equal(report.passed, false);
    assert.ok(report.blockerCount >= 4);
    assert.ok(report.findings.some((finding) => finding.id === "provider_credential"));
    assert.ok(report.findings.some((finding) => finding.id === "tainted_html_assignment"));
    assert.ok(report.findings.some((finding) => finding.id === "remote_executable_content"));
    assert.ok(report.findings.some((finding) => finding.id === "unapproved_connection"));
    assert.equal(JSON.stringify(report).includes(credential), false);
    assert.ok(report.findings.every((finding) => !finding.evidence.includes(credential)));
    assert.throws(
      () => aegis.assertAegisReleasePassed(report, report.artifactSha256),
      /AEGIS_RELEASE_BLOCKED/,
    );
  });

  await t.test("direct connection, beacon, transport, peer and dynamic asset APIs block", async () => {
    const source = html("<div>Offline fixture</div>", [
      "new XMLHttpRequest()",
      "navigator['sendBeacon']('/collect','payload')",
      "new WebTransport('https://transport.invalid')",
      "new RTCPeerConnection()",
      "new Image()",
      "document.createElement('video')",
      "document.createElementNS('urn:fixture','img')",
    ].join(";\n"));
    const report = await aegis.runAegisStaticScan(source);
    assert.equal(report.passed, false);
    assert.ok(report.blockerCount >= 7);
    assert.ok(report.findings.some((finding) => finding.id === "unapproved_connection"));
    assert.ok(report.findings.some((finding) => finding.id === "dynamic_network_asset"));
    assert.ok(report.findings.some((finding) => finding.id === "dynamic_network_element"));
    assert.equal(JSON.stringify(report).includes("transport.invalid"), false);
  });

  await t.test("bracket sinks, remote assets and external navigation cannot bypass Aegis", async () => {
    const source = html(
      [
        '<img src="https://images.untrusted.invalid/hero.jpg" alt="Remote">',
        '<link rel="stylesheet" href="//styles.untrusted.invalid/app.css">',
        '<video poster="https://media.untrusted.invalid/poster.jpg"></video>',
        '<style>@import "https://css.untrusted.invalid/base.css";</style>',
        '<a href="https://outside.untrusted.invalid">Leave</a>',
      ].join("\n"),
      [
        "result['innerHTML']=new URLSearchParams(location.search).get('q')",
        "panel['outerHTML']=message.data",
        "image['src']=assetUrl",
        "stylesheet.setAttribute('href',stylesheetUrl)",
        "window.location=redirectTarget",
        "location['href']=redirectTarget",
        "window['location']['assign'](redirectTarget)",
        "window['open'](redirectTarget)",
        'hero.style.backgroundImage=`url(${assetUrl})`',
      ].join(";\n"),
    );
    const report = await aegis.runAegisStaticScan(source);
    const ids = new Set(report.findings.map((finding) => finding.id));
    assert.equal(report.passed, false);
    assert.ok(
      report.findings.filter((finding) => finding.id === "tainted_html_assignment")
        .length >= 2,
    );
    for (const id of [
      "tainted_html_assignment",
      "remote_static_asset",
      "remote_css_asset",
      "external_navigation",
      "dynamic_network_asset",
      "dynamic_or_external_href",
      "dynamic_or_external_navigation",
      "popup_navigation",
      "dynamic_css_asset",
    ]) {
      assert.equal(ids.has(id), true, `missing blocker ${id}`);
    }
    assert.equal(JSON.stringify(report).includes("untrusted.invalid"), false);
  });

  await t.test("Aegis is mandatory for every orchestration mode", () => {
    for (const [mode, gear, max] of [
      ["generate", "auto", false],
      ["iterate", "fast", false],
      ["generate", "house", true],
    ]) {
      const flow = house.orchestrate("Build a compact app", mode, gear, max);
      assert.ok(flow.active.includes("aegis"));
      assert.equal(flow.standby.includes("aegis"), false);
    }
  });

  await t.test("a fake script closing tag cannot inflate visible product copy", () => {
    const opening = '<html lang="en"><head><title>Fixture</title></head><body><button>Go</button><script>';
    const fakeClosing = `${opening}const pending=true;</script=bogus>${"A".repeat(600)}</script></body></html>`;
    const validClosing = `${opening}const pending=true;</script>${"A".repeat(600)}</body></html>`;
    const hasPatchBlocker = (source) =>
      house.localExperts(source, "Build a compact app").some(
        (finding) => finding.agent === "patch" && finding.must,
      );

    assert.equal(hasPatchBlocker(fakeClosing), true);
    assert.equal(hasPatchBlocker(validClosing), false);
  });
});

test("generation and repair prompts preserve the offline security boundary", async () => {
  const [prompts, reviewAgents] = await Promise.all([
    readFile(new URL("../src/lib/server/prompts/helix.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/server/review/agents.ts", import.meta.url), "utf8"),
  ]);
  for (const source of [prompts, reviewAgents]) {
    assert.doesNotMatch(source, /Unsplash|fonts\.googleapis|fonts\.gstatic/i);
  }
  assert.match(prompts, /Offline preview: no external URLs/);
  assert.match(reviewAgents, /Preserve the offline boundary/);
});

test("the orchestrator persists Aegis evidence and stops a blocked candidate", async () => {
  const [orchestrator, release] = await Promise.all([
    readFile(
      new URL("../src/lib/server/orchestrator/helix.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/lib/server/release/candidate.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.ok(
    (orchestrator.match(/runAegisStaticScan\(page\)/g) ?? []).length >= 2,
    "Aegis must scan before review and after any patch",
  );
  assert.match(orchestrator, /throw new AgentOutputError\("AEGIS_RELEASE_BLOCKED", false\)/);
  assert.match(orchestrator, /status: aegisReport\.passed \? "done" : "error"/);
  assert.match(release, /"docs\/security\.json"/);
  assert.match(release, /"docs\/security\.md"/);
});
