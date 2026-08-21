import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("the authenticated empty state exposes the complete flagship gallery without project data", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());

  const [catalog, gallerySource, vetrinaSource, projectCardSource] = await Promise.all([
    vite.ssrLoadModule("/src/lib/flagships/catalog.ts"),
    readFile(join(ROOT, "src/components/demo-project-gallery.tsx"), "utf8"),
    readFile(join(ROOT, "src/routes/vetrina.tsx"), "utf8"),
    readFile(join(ROOT, "src/components/project-card.tsx"), "utf8"),
  ]);

  const items = catalog.flagshipFor("it");
  assert.equal(items.length, 15);
  assert.deepEqual(
    items.reduce((counts, item) => ({ ...counts, [item.surface]: counts[item.surface] + 1 }), {
      app: 0,
      site: 0,
    }),
    { app: 9, site: 6 },
  );
  assert.deepEqual(
    [...catalog.FLAGSHIP_CATEGORY_ORDER],
    [
      "professional-management",
      "appointments",
      "control-data",
      "collaboration",
      "product-design",
      "professional-sites",
      "hospitality-commerce",
      "culture-events",
    ],
  );

  assert.match(gallerySource, /flagshipFor\(locale\)/);
  assert.match(gallerySource, /surface: "app" as const[\s\S]*surface: "site" as const/);
  assert.match(gallerySource, /FLAGSHIP_CATEGORY_ORDER\.indexOf\(left\)/);
  assert.match(gallerySource, /<ProjectCard/);
  assert.match(gallerySource, />\s*Demo\s*</);
  assert.match(gallerySource, /to="\/a\/\$slug"/);
  assert.match(gallerySource, /search=\{\{ lang: locale \}\}/);
  assert.match(gallerySource, /sm:grid-cols-2 xl:grid-cols-3/);
  assert.match(projectCardSource, /loading="lazy"/);
  assert.doesNotMatch(gallerySource, /createProject|listProjects|getAccount|credits_spent/);
  assert.doesNotMatch(gallerySource, /\bProject\[\]|as Project|from "@\/lib\/server\/vetra"/);

  assert.match(vetrinaSource, /FLAGSHIP_CATEGORY_ORDER/);
  assert.doesNotMatch(vetrinaSource, /const CATEGORY_ORDER/);
});
