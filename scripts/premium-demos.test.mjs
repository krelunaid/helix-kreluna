import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("all eighteen premium demos are addressable, photographed and Helix-labelled", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());

  const [registry, specs, home, player, shell] = await Promise.all([
    vite.ssrLoadModule("/src/demos/registry.ts"),
    vite.ssrLoadModule("/src/demos/specs.ts"),
    (await import("node:fs/promises")).readFile(new URL("../src/routes/index.tsx", import.meta.url), "utf8"),
    (await import("node:fs/promises")).readFile(new URL("../src/demos/player.tsx", import.meta.url), "utf8"),
    (await import("node:fs/promises")).readFile(new URL("../src/demos/shell.tsx", import.meta.url), "utf8"),
  ]);

  assert.deepEqual(
    [...registry.PREMIUM_DEMO_IDS],
    [
      "velvet-table",
      "cutcraft",
      "nexora-crm",
      "sonora",
      "toonverse",
      "orbital",
      "stormglass",
      "world-pulse",
      "roomverse",
      "aurelion",
      "vela-noir",
      "maison-27",
      "studio-monolith",
      "nestra-estates",
      "lumen-festival",
      "cinematica",
      "atlas-command",
      "worldforge",
    ],
  );
  assert.match(home, /getHomeSession/);
  assert.doesNotMatch(home, /PremiumSpotlight|cutcraft|Aurelion/);
  assert.match(player, /Demo interattiva realizzata con Helix|SHARED/);
  assert.match(shell, /Crea qualcosa di simile|create/);
  assert.match(shell, /onTour/);
  assert.match(shell, /onReset/);

  const cards = registry.premiumDemosFor("it");
  assert.equal(cards.length, 18);
  assert.equal(cards.filter((card) => card.surface === "app").length, 9);
  assert.equal(cards.filter((card) => card.surface === "site").length, 6);
  assert.equal(cards.filter((card) => card.surface === "program").length, 3);

  const photoHashes = new Map();
  for (const card of cards) {
    assert.doesNotMatch(
      `${card.brand}${card.lead}${card.title}`,
      /Bottega del Capello|Accademia della Bugia|crêpe|Rue de Verneuil/i,
    );
    const photoPath = join(ROOT, "public", card.photo.replace(/^\//, ""));
    await access(photoPath);
    const hash = createHash("md5").update(await readFile(photoPath)).digest("hex");
    assert.equal(photoHashes.has(hash), false, `cover reused: ${card.photo}`);
    photoHashes.set(hash, card.photo);
  }

  const aurelion = specs.demoSpec("aurelion");
  assert.match(aurelion.hero, /mercedes-300-sl-wings/);
  assert.ok(aurelion.items.length >= 5);
  assert.equal(aurelion.work, "reserve");

  const itemHashes = new Map();
  for (const id of registry.PREMIUM_DEMO_IDS) {
    if (id === "velvet-table") continue;
    const spec = specs.demoSpec(id);
    assert.doesNotMatch(
      `${spec.lead.it}${spec.lead.en}${spec.title.it}${spec.title.en}`,
      /Bottega del Capello|Accademia della Bugia|crêpe|Rue de Verneuil/i,
    );
    for (const item of spec.items) {
      const photoPath = join(ROOT, "public", item.photo.replace(/^\//, ""));
      await access(photoPath);
      const hash = createHash("md5").update(await readFile(photoPath)).digest("hex");
      assert.equal(itemHashes.has(hash), false, `photo reused: ${item.photo}`);
      itemHashes.set(hash, item.photo);
    }
  }
});
