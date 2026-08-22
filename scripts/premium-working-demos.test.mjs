import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const EXPECTED = [
  "velvet-table",
  "cutcraft",
  "nexora-crm",
  "sonora",
  "toonverse",
  "orbital",
  "stormglass",
  "world-pulse",
  "roomverse",
  "aurelion-motors",
  "vela-noir",
  "maison-27",
  "studio-monolith",
  "nestra-estates",
  "lumen-festival",
  "cinematica",
  "atlas-command",
  "worldforge",
];

test("the 18 studio slugs open unique working demos, not empty posters", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());

  const [premium, registry, gallery, publicRoute, vetrina, shell] = await Promise.all([
    vite.ssrLoadModule("/src/lib/premium-demos.ts"),
    vite.ssrLoadModule("/src/demos/registry.ts"),
    readFile(join(ROOT, "src/components/studio-demo-gallery.tsx"), "utf8"),
    readFile(join(ROOT, "src/routes/a.$slug.tsx"), "utf8"),
    readFile(join(ROOT, "src/routes/vetrina.tsx"), "utf8"),
    readFile(join(ROOT, "src/demos/shell.tsx"), "utf8"),
  ]);

  assert.deepEqual([...premium.PREMIUM_DEMO_IDS], EXPECTED);
  assert.deepEqual([...registry.PREMIUM_DEMO_IDS], EXPECTED);
  assert.equal(new Set(EXPECTED).size, 18);
  assert.doesNotMatch(EXPECTED.join(" "), /bottega|bugia|capello|aurelion(?!-motors)/i);

  assert.match(gallery, /to="\/a\/\$slug"/);
  assert.match(gallery, /premiumDemos/);
  assert.match(publicRoute, /isPremiumDemoId/);
  assert.match(publicRoute, /PREMIUM_LAZY/);
  assert.match(publicRoute, /lazy\(\(\) => import\("@\/demos\/velvet-table\/app"\)\)/);
  assert.match(vetrina, /PremiumSpotlight/);
  assert.match(vetrina, /cover=\{item\.photo\}/);
  assert.match(shell, /onReset/);
  assert.match(shell, /onTour/);
  assert.match(shell, /Crea qualcosa di simile|create/);

  const cards = registry.premiumDemosFor("it");
  assert.equal(cards.length, 18);
  assert.equal(cards.filter((card) => card.surface === "app").length, 9);
  assert.equal(cards.filter((card) => card.surface === "site").length, 6);
  assert.equal(cards.filter((card) => card.surface === "program").length, 3);

  const photoHashes = new Map();
  for (const id of EXPECTED) {
    const app = await readFile(join(ROOT, "src/demos", id, "app.tsx"), "utf8");
    assert.match(app, /export default function/);
    assert.match(app, /onReset|reset\(/);
    assert.match(app, /startTour/);
    assert.doesNotMatch(app, /Bottega del Capello|Accademia della Bugia|crêpe|Rue de Verneuil/i);
    assert.doesNotMatch(app, /PremiumPlayer|demoSpec\(/);

    const card = cards.find((item) => item.id === id);
    assert.ok(card, id);
    const photoPath = join(ROOT, "public", card.photo.replace(/^\//, ""));
    await access(photoPath);
    const hash = createHash("md5").update(await readFile(photoPath)).digest("hex");
    assert.equal(photoHashes.has(hash), false, `cover reused: ${card.photo}`);
    photoHashes.set(hash, card.photo);
  }

  assert.match(registry.PREMIUM_PHOTOS["aurelion-motors"], /mercedes-300-sl-wings/);
  assert.match(premium.buildPremiumDemoHtml("velvet-table", "it"), /Velvet Table/);
});
