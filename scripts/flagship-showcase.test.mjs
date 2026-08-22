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
  "studio-ledger",
  "pulse-booking",
  "foundry-erp",
  "mercedes-epoque",
  "italvia",
  "mini4wd-lab",
  "atelier-nova",
  "casa-verde",
  "lumen-clinic",
  "northstar-legal",
  "velora-commerce",
  "festival-onda",
];

function extractSingleInlineScript(html) {
  const normalized = html.toLowerCase();
  const openingStart = normalized.indexOf("<script");
  assert.notEqual(openingStart, -1, "missing interaction script");
  const openingBoundary = normalized[openingStart + "<script".length];
  assert.ok(
    openingBoundary === ">" || /\s/u.test(openingBoundary),
    "invalid interaction script opening tag",
  );
  const openingEnd = normalized.indexOf(">", openingStart + "<script".length);
  assert.notEqual(openingEnd, -1, "unterminated interaction script opening tag");

  const closingStart = normalized.indexOf("</script", openingEnd + 1);
  assert.notEqual(closingStart, -1, "missing interaction script closing tag");
  const closingEnd = normalized.indexOf(">", closingStart + "</script".length);
  assert.notEqual(closingEnd, -1, "unterminated interaction script closing tag");
  assert.equal(
    normalized.slice(closingStart + "</script".length, closingEnd).trim(),
    "",
    "invalid interaction script closing tag",
  );
  assert.equal(
    normalized.indexOf("<script", closingEnd + 1),
    -1,
    "multiple interaction scripts are not allowed",
  );
  return html.slice(openingEnd + 1, closingStart);
}

test("inline script extraction handles case-insensitive HTML end tags", () => {
  assert.equal(
    extractSingleInlineScript("<SCRIPT>globalThis.ready = true;</SCRIPT >"),
    "globalThis.ready = true;",
  );
});

test("the showcase contains eighteen honest and distinct flagship products", async (t) => {
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

  await t.test("the primary registry is exactly eighteen and the legacy set is archived", () => {
    assert.deepEqual([...catalog.FLAGSHIP_IDS], EXPECTED);
    assert.equal(new Set(catalog.FLAGSHIP_IDS).size, 18);
    assert.deepEqual(
      [...catalog.HOME_FLAGSHIP_IDS],
      [
        "studio-ledger",
        "pulse-booking",
        "morph",
        "atelier-nova",
        "lumen-clinic",
        "velora-commerce",
      ],
    );

    const primary = templates.featuredFor("en");
    const archived = templates.archivedFor("en");
    assert.deepEqual(
      primary.map((entry) => entry.id),
      EXPECTED,
    );
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
    const surfaces = { app: 0, site: 0 };
    for (const entry of catalog.flagshipFor("en")) {
      assert.equal(Object.hasOwn(entry, "cover"), false);
      assert.equal(entry.agents, undefined);
      assert.equal(entry.measuredBuild, undefined);
      assert.equal(entry.measuredScore, undefined);
      assert.ok(entry.prompt.length > 40);
      assert.ok(entry.capability.length > 30);
      assert.ok(entry.proof.length > 20);
      assert.equal(entry.interactionTarget, 8);
      assert.ok(entry.categoryLabel.length > 3);
      assert.ok(entry.surface === "app" || entry.surface === "site");
      surfaces[entry.surface] += 1;
      const signature = JSON.stringify(entry.visual);
      assert.equal(signatures.has(signature), false, `${entry.id} repeats a visual system`);
      signatures.add(signature);
    }
    assert.equal(signatures.size, 18);
    assert.deepEqual(surfaces, { app: 9, site: 9 });
  });

  await t.test("Andrea's allowed sites lead the websites section and excluded sites stay out", () => {
    const sites = catalog.flagshipFor("it").filter((entry) => entry.surface === "site");
    assert.deepEqual(
      sites.slice(0, 3).map((entry) => entry.id),
      ["mercedes-epoque", "italvia", "mini4wd-lab"],
    );
    assert.equal(sites[0]?.category, "featured-sites");
    assert.equal(sites[0]?.categoryLabel, "In evidenza");
    assert.match(sites[0]?.kind ?? "", /auto|noleggio|collezione/i);
    assert.match(catalog.flagshipFor("it").find((entry) => entry.id === "italvia")?.kind ?? "", /immobiliare/i);
    assert.match(catalog.flagshipFor("it").find((entry) => entry.id === "mini4wd-lab")?.kind ?? "", /hobby|laboratorio|Mini/i);
    for (const excluded of ["la-bottega-del-capello", "accademia-della-bugia", "peselli-hub"]) {
      assert.equal(catalog.isFlagshipId(excluded), false);
      assert.equal(
        catalog.FLAGSHIP_IDS.includes(excluded),
        false,
      );
    }
  });

  await t.test("the nine new projects have genuine metadata translations", () => {
    const translatedFields = ["title", "kind", "prompt", "capability", "proof"];
    const english = new Map(catalog.flagshipFor("en").map((entry) => [entry.id, entry]));
    for (const locale of ["es", "fr", "de", "pt"]) {
      const localized = new Map(catalog.flagshipFor(locale).map((entry) => [entry.id, entry]));
      for (const id of EXPECTED.slice(6)) {
        for (const field of translatedFields) {
          assert.notEqual(
            localized.get(id)?.[field],
            english.get(id)?.[field],
            `${id}/${locale} kept the English ${field}`,
          );
        }
      }
    }
  });

  await t.test("all localized artifacts are offline, actionable and Aegis-clean", async () => {
    const english = new Map(EXPECTED.map((id) => [id, catalog.buildFlagshipHtml(id, "en")]));
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
        const inlineScript = extractSingleInlineScript(html);
        assert.doesNotThrow(
          () => Function(inlineScript),
          `${id}/${locale} contains invalid JavaScript`,
        );

        const actions = [...html.matchAll(/\bdata-action="([a-z0-9-]+)"/g)].map(
          (match) => match[1],
        );
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

  await t.test("the mobile business-suite navigation stays named, tappable and width-safe", () => {
    for (const locale of i18n.LOCALES) {
      const ledger = catalog.buildFlagshipHtml("studio-ledger", locale);
      const booking = catalog.buildFlagshipHtml("pulse-booking", locale);
      const foundry = catalog.buildFlagshipHtml("foundry-erp", locale);

      assert.equal(
        [...ledger.matchAll(/class="nav-button"[^>]*aria-label="[^"]+"/g)].length,
        5,
        `studio-ledger/${locale} has an unnamed navigation target`,
      );
      assert.match(ledger, /\.nav-button\{width:44px;min-height:44px\}/);

      assert.equal(
        [...booking.matchAll(/class="rail-button"[^>]*aria-label="[^"]+"/g)].length,
        4,
        `pulse-booking/${locale} has an unnamed navigation target`,
      );
      assert.match(booking, /\.rail-button\{width:44px;min-height:44px;aspect-ratio:1\}/);

      assert.match(foundry, /\.mast\{grid-template-columns:58px minmax\(0,1fr\)\}/);
      assert.match(foundry, /\.global-search\{min-width:0;width:auto;margin-left:0\}/);
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
      "studio-ledger": "Build Studio Ledger for a commercialista practice",
      "pulse-booking": "Build Pulse Booking appointment planner",
      "foundry-erp": "Build Foundry ERP for inventory and orders",
      "mercedes-epoque": "Build Mercedes Époque classic and modern Mercedes hire",
      italvia: "Build Italvia Italy–Poland property concierge",
      "mini4wd-lab": "Build Mini4WD Lab to cut carbon parts and race",
      "atelier-nova": "Build Atelier Nova architecture portfolio",
      "casa-verde": "Build Casa Verde hospitality retreat website",
      "lumen-clinic": "Build Lumen Clinic private clinic website",
      "northstar-legal": "Build Northstar Legal advisory website",
      "velora-commerce": "Build Velora Objects premium commerce website",
      "festival-onda": "Build Onda Festival cultural programme website",
    };
    for (const [id, prompt] of Object.entries(prompts)) {
      assert.match(templates.htmlForPrompt(prompt, "fr"), new RegExp(`data-flagship="${id}"`));
    }

    const naturalPrompts = [
      ["studio-ledger", "Build an accounting practice management app", "en"],
      ["studio-ledger", "Crea un gestionale per uno studio commercialista", "it"],
      ["pulse-booking", "Build a booking app for client appointments", "en"],
      ["pulse-booking", "Crea un'app per la gestione degli appuntamenti", "it"],
      ["foundry-erp", "Build an ERP for inventory and orders", "en"],
      ["foundry-erp", "Crea un ERP per magazzino e ordini", "it"],
      ["mercedes-epoque", "Build Mercedes Époque for classic and modern Mercedes", "en"],
      ["mercedes-epoque", "Crea Mercedes Époque per noleggio Mercedes classiche", "it"],
      ["italvia", "Build Italvia Italy–Poland property concierge", "en"],
      ["italvia", "Crea Italvia, un concierge immobiliare Italia–Polonia", "it"],
      ["mini4wd-lab", "Build Mini4WD Lab to cut carbon parts", "en"],
      ["mini4wd-lab", "Crea Mini4WD Lab per tagliare il carbonio", "it"],
      ["atelier-nova", "Build an architecture studio website", "en"],
      ["atelier-nova", "Crea un sito web per uno studio di architettura", "it"],
      ["casa-verde", "Build a hospitality website for a countryside retreat", "en"],
      ["casa-verde", "Crea un sito per un agriturismo con ospitalità diffusa", "it"],
      ["lumen-clinic", "Build a private clinic website", "en"],
      ["lumen-clinic", "Crea un sito per una clinica privata", "it"],
      ["northstar-legal", "Build a law firm website", "en"],
      ["northstar-legal", "Crea un sito per uno studio legale", "it"],
      ["velora-commerce", "Build a premium e-commerce website", "en"],
      ["velora-commerce", "Crea un sito e-commerce per prodotti premium", "it"],
      ["festival-onda", "Build a cultural festival website", "en"],
      ["festival-onda", "Crea un sito per un festival culturale", "it"],
    ];
    for (const [id, prompt, locale] of naturalPrompts) {
      assert.match(
        templates.htmlForPrompt(prompt, locale),
        new RegExp(`data-flagship="${id}"`),
        `${locale} prompt did not route to ${id}`,
      );
    }

    const legacyPrompts = [
      ["Build a photography portfolio", "Studio Forma"],
      ["Build Aurelia luxury resort", "Aurelia"],
      ["Build a task list app", "Lists"],
      ["Build a restaurant menu", "Caffè Luna"],
      ["Build Maison fashion lookbook", "Maison Vale"],
      ["Build a wine cellar website", "Cantina Oro"],
      ["Build invoice management software", "Ledger"],
    ];
    for (const [prompt, title] of legacyPrompts) {
      assert.ok(
        templates.htmlForPrompt(prompt, "en").includes(`<title>${title}</title>`),
        `legacy prompt no longer routes to ${title}`,
      );
    }
  });
});

test("Home, Vetrina and public routing use the real localized app preview", async () => {
  const [home, vetrina, publicRoute, deploy, card, styles, browserQa] = await Promise.all([
    readFile(new URL("../src/routes/index.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/vetrina.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/a.$slug.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/server/deploy.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/project-card.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(new URL("./flagship-browser.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(home, /homeFlagshipsFor\(locale\)/);
  assert.doesNotMatch(home, /featured\.slice\(0,\s*3\)/);
  assert.doesNotMatch(home, /cover=\{item\.cover\}/);
  assert.match(home, /search=\{\{ lang: locale \}\}/);

  assert.match(vetrina, /item\.prompt/);
  assert.match(vetrina, /item\.capability/);
  assert.match(vetrina, /item\.proof/);
  assert.match(vetrina, /item\.surface/);
  assert.match(vetrina, /categoryItems\[0\]\?\.categoryLabel/);
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
  assert.match(card, /project-card/);
  assert.match(card, /project-card-meta/);
  assert.match(styles, /\.project-card\s*\{\s*color: var\(--color-fg\)/);
  assert.match(
    styles,
    /\.band-light \.project-card \.project-card-meta\s*\{\s*color: var\(--color-muted\)/,
  );

  assert.match(browserQa, /--require-completed/);
  assert.match(browserQa, /report\.summary\.controlsExercised >= 8/);
  assert.match(browserQa, /report\.summary\.changedActions >= 5/);
  assert.match(browserQa, /summary\.status !== "completed"/);
});
