import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXPECTED = [
  "orbit-command",
  "neura",
  "synapse",
  "vanta",
  "arc-city",
  "morph",
];

test("the showcase contains six honest and distinct flagship products", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());

  const [catalog, templates, i18n, aegis] = await Promise.all([
    vite.ssrLoadModule("/src/lib/flagships/catalog.ts"),
    vite.ssrLoadModule("/src/lib/templates.ts"),
    vite.ssrLoadModule("/src/lib/i18n-core.ts"),
    vite.ssrLoadModule("/src/lib/server/quality/aegis.ts"),
  ]);

  await t.test("the primary registry is exactly six and the legacy set is archived", () => {
    assert.deepEqual([...catalog.FLAGSHIP_IDS], EXPECTED);
    assert.equal(new Set(catalog.FLAGSHIP_IDS).size, 6);
    assert.deepEqual([...catalog.HOME_FLAGSHIP_IDS], [
      "morph",
      "vanta",
      "orbit-command",
    ]);

    const primary = templates.featuredFor("en");
    const archived = templates.archivedFor("en");
    assert.deepEqual(primary.map((entry) => entry.id), EXPECTED);
    assert.equal(archived.length, 15);
    assert.equal(
      archived.some((entry) => entry.id === "sonar"),
      true,
    );
    assert.equal(
      primary.some((entry) => archived.some((old) => old.id === entry.id)),
      false,
    );
  });

  await t.test("metadata never invents agents, time or Kreluna Score", () => {
    const signatures = new Set();
    for (const entry of catalog.flagshipFor("en")) {
      assert.equal(Object.hasOwn(entry, "cover"), false);
      assert.equal(entry.agents, undefined);
      assert.equal(entry.measuredBuild, undefined);
      assert.equal(entry.measuredScore, undefined);
      assert.ok(entry.prompt.length > 40);
      assert.ok(entry.capability.length > 30);
      assert.ok(entry.proof.length > 20);
      assert.equal(entry.interactionTarget, 8);
      const signature = JSON.stringify(entry.visual);
      assert.equal(signatures.has(signature), false, `${entry.id} repeats a visual system`);
      signatures.add(signature);
    }
    assert.equal(signatures.size, 6);
  });

  await t.test("all 36 localized artifacts are offline, actionable and Aegis-clean", async () => {
    const english = new Map(
      EXPECTED.map((id) => [id, catalog.buildFlagshipHtml(id, "en")]),
    );
    for (const locale of i18n.LOCALES) {
      for (const id of EXPECTED) {
        const html = catalog.buildFlagshipHtml(id, locale);
        assert.match(html, new RegExp(`<html lang="${locale}"`));
        assert.match(html, new RegExp(`data-flagship="${id}"`));
        assert.match(html, new RegExp(`data-locale="${locale}"`));
        assert.ok(Buffer.byteLength(html, "utf8") > 5_000, `${id}/${locale} is a stub`);
        assert.ok(Buffer.byteLength(html, "utf8") < 300_000, `${id}/${locale} is oversized`);
        assert.doesNotMatch(html, /https?:\/\/|\/\/fonts\.|unsplash/i);
        assert.doesNotMatch(html, /\bundefined\b/);
        assert.doesNotMatch(
          html,
          /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie|innerHTML|outerHTML|eval|document\.write)\b/,
        );
        const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
        assert.ok(inlineScript, `${id}/${locale} is missing its interaction script`);
        assert.doesNotThrow(
          () => Function(inlineScript),
          `${id}/${locale} contains invalid JavaScript`,
        );

        const actions = [
          ...html.matchAll(/\bdata-action="([a-z0-9-]+)"/g),
        ].map((match) => match[1]);
        assert.ok(actions.length >= 8, `${id}/${locale} exposes fewer than eight controls`);
        assert.ok(
          new Set(actions).size >= 5,
          `${id}/${locale} exposes fewer than five distinct interaction behaviors`,
        );

        const report = await aegis.runAegisStaticScan(html);
        assert.equal(report.passed, true, `${id}/${locale} is blocked by Aegis`);
        assert.equal(report.blockerCount, 0, `${id}/${locale} has blockers`);
        assert.deepEqual(
          report.findings,
          [],
          `${id}/${locale} still requires an Aegis manual finding review`,
        );

        if (locale !== "en") {
          assert.notEqual(html, english.get(id), `${id}/${locale} ignored its locale`);
        }
      }
    }
  });

  await t.test("every flagship is addressable by both catalog and prompt routing", () => {
    for (const id of EXPECTED) {
      assert.match(templates.featuredHtml(id, "it"), new RegExp(`data-flagship="${id}"`));
    }
    const prompts = {
      "orbit-command": "Build Orbit Command satellite mission control",
      neura: "Build Neura neural systems observatory",
      synapse: "Build Synapse collaborative intelligence canvas",
      vanta: "Build Vanta market risk terminal",
      "arc-city": "Build Arc City urban systems twin",
      morph: "Build Morph automotive material configurator",
    };
    for (const [id, prompt] of Object.entries(prompts)) {
      assert.match(templates.htmlForPrompt(prompt, "fr"), new RegExp(`data-flagship="${id}"`));
    }
  });
});

test("Home, Vetrina and public routing use the real localized app preview", async () => {
  const [home, vetrina, publicRoute, deploy, card, browserQa] = await Promise.all([
    readFile(new URL("../src/routes/index.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/vetrina.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/a.$slug.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/server/deploy.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/project-card.tsx", import.meta.url), "utf8"),
    readFile(new URL("./flagship-browser.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(home, /homeFlagshipsFor\(locale\)/);
  assert.doesNotMatch(home, /featured\.slice\(0,\s*3\)/);
  assert.doesNotMatch(home, /cover=\{item\.cover\}/);
  assert.match(home, /search=\{\{ lang: locale \}\}/);

  assert.match(vetrina, /item\.prompt/);
  assert.match(vetrina, /item\.capability/);
  assert.match(vetrina, /item\.proof/);
  assert.match(vetrina, /archivedFor\(locale\)/);
  assert.doesNotMatch(vetrina, /cover=\{item\.cover\}/);
  assert.match(vetrina, /search=\{\{ lang: locale \}\}/);

  assert.match(publicRoute, /locale: deps\.lang/);
  assert.match(publicRoute, /normalizeLocale\(search\.lang\)/);
  const builtInLookup = deploy.indexOf("const builtIn =");
  const schemaLookup = deploy.indexOf("await ensureSchema();", builtInLookup);
  assert.ok(builtInLookup > 0 && schemaLookup > builtInLookup);
  assert.match(deploy, /featuredHtml\(data\.slug, data\.locale\)/);

  assert.match(card, /title=\{title\}/);
  assert.match(card, /loading="lazy"/);

  assert.match(browserQa, /--require-completed/);
  assert.match(browserQa, /report\.summary\.controlsExercised >= 8/);
  assert.match(browserQa, /report\.summary\.changedActions >= 5/);
  assert.match(browserQa, /summary\.status !== "completed"/);
});
