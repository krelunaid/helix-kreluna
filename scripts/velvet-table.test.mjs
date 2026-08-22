import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("Velvet Table is a lazy premium demo, not a nineteenth flagship", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());

  const [catalog, registry, fixtures, copy, home, vetrina, publicRoute] = await Promise.all([
    vite.ssrLoadModule("/src/lib/flagships/catalog.ts"),
    vite.ssrLoadModule("/src/demos/registry.ts"),
    vite.ssrLoadModule("/src/demos/velvet-table/fixtures.ts"),
    vite.ssrLoadModule("/src/demos/velvet-table/copy.ts"),
    readFile(new URL("../src/routes/index.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/vetrina.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/a.$slug.tsx", import.meta.url), "utf8"),
  ]);

  await t.test("the eighteen flagships and the marketing home stay untouched", () => {
    assert.equal(catalog.FLAGSHIP_IDS.length, 18);
    assert.equal(catalog.FLAGSHIP_IDS.includes("velvet-table"), false);
    assert.match(home, /getHomeSession/);
    assert.doesNotMatch(home, /velvet-table|Velvet Table|PremiumSpotlight/);
  });

  await t.test("vetrina and /a/velvet-table host the lazy demo", () => {
    assert.equal(registry.isPremiumDemoId("velvet-table"), true);
    assert.equal(registry.PREMIUM_DEMO_IDS.length, 18);
    assert.equal(registry.PREMIUM_DEMO_IDS.includes("la-bottega-del-capello"), false);
    assert.equal(registry.PREMIUM_DEMO_IDS.includes("accademia-della-bugia"), false);
    assert.match(vetrina, /premiumDemosFor/);
    assert.match(vetrina, /PremiumSpotlight/);
    assert.match(vetrina, /cover=\{item\.photo\}/);
    assert.match(publicRoute, /isPremiumDemoId/);
    assert.match(publicRoute, /lazy\(\(\) => import\("@\/demos\/velvet-table\/app"\)\)/);
    assert.match(publicRoute, /locale: deps\.lang/);
    assert.match(publicRoute, /normalizeLocale\(search\.lang\)/);
  });

  await t.test("fixtures carry three tables, three statuses and a guided romantic path", () => {
    const aurora = fixtures.VENUES.find((venue) => venue.id === fixtures.GUIDED_VENUE_ID);
    assert.ok(aurora);
    assert.ok(aurora.tables.length >= 3);
    const statuses = new Set(aurora.tables.map((table) => table.status));
    assert.equal(statuses.has("available"), true);
    assert.equal(statuses.has("waitlist"), true);
    assert.equal(statuses.has("full"), true);
    const views = new Set(aurora.tables.map((table) => table.view));
    assert.ok(views.size >= 3);
    const window = aurora.tables.find((table) => table.id === fixtures.GUIDED_TABLE_ID);
    assert.equal(window?.zone, "window");
    assert.equal(window?.status, "available");
  });

  await t.test("copy stays grand-hotel and never Booking-shaped", () => {
    const it = copy.velvetCopy("it");
    assert.match(it.made, /Demo interattiva realizzata con Helix/);
    assert.match(it.create, /Crea qualcosa di simile/);
    assert.match(it.occasions.romantic.title, /Cena romantica/i);
    assert.match(it.confirm, /deposito/i);
    assert.match(it.flowers, /Fiori/i);
    assert.doesNotMatch(it.discoverTitle + it.discoverLead + it.resultsTitle, /Booking|filtri aperti|emoji/i);
    const joined = JSON.stringify(it);
    assert.doesNotMatch(joined, /[\u{1F300}-\u{1FAFF}]/u);
    assert.doesNotMatch(joined, /crêpe|Rue de Verneuil|Bottega del Capello|Accademia della Bugia/i);
  });

  await t.test("photography is vendored next to the demo", async () => {
    const files = await readdir(join(ROOT, "public/vetrina/velvet-table"));
    for (const name of [
      "salon.jpg",
      "terrace.jpg",
      "hero.jpg",
      "view-alcove.jpg",
      "view-garden.jpg",
      "view-window.jpg",
      "chef.jpg",
    ]) {
      assert.equal(files.includes(name), true, `missing ${name}`);
    }
  });
});
