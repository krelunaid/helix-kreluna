import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function patchChange(before, beforeHash, patch) {
  return {
    target: "hero section",
    operation: "replace_fragment",
    before,
    beforeHash,
    patch,
    validation: [
      "html_document_valid",
      "replacement_present_once",
      "original_fragment_absent",
    ],
  };
}

function validDocument(body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Gem patch</title></head><body>${body}<footer>${"validated content ".repeat(30)}</footer></body></html>`;
}

test("controlled Gem patches require an exact unique and valid HTML base", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());

  const [
    { applyControlledGemPatch, sha256Hex },
    { applyAndValidateGemPatch },
    { GemPatchSchema },
  ] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/agents/patch.ts"),
    vite.ssrLoadModule("/src/lib/server/agents/gem.ts"),
    vite.ssrLoadModule("/src/lib/server/agents/types.ts"),
  ]);

  await t.test("sha256Hex is deterministic SHA-256", async () => {
    assert.equal(
      await sha256Hex("abc"),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    assert.match(await sha256Hex("Helix"), /^[0-9a-f]{64}$/);
  });

  await t.test("a valid patch replaces one unique fragment", async () => {
    const before = '<section id="hero"><h1>Original</h1></section>';
    const replacement = '<section id="hero"><h1>Improved by Gem</h1></section>';
    const html = validDocument(before);
    const result = await applyControlledGemPatch(
      html,
      patchChange(before, await sha256Hex(html), replacement),
    );

    assert.equal(result, html.replace(before, replacement));
    assert.match(result, /Improved by Gem/);
    assert.doesNotMatch(result, />Original</);
  });

  await t.test("a stale base hash is rejected", async () => {
    const before = '<section id="hero">Original</section>';
    const html = validDocument(before);
    await assert.rejects(
      applyControlledGemPatch(
        html,
        patchChange(before, "0".repeat(64), '<section id="hero">Changed</section>'),
      ),
      (error) => error?.code === "GEM_PATCH_STALE_BASE",
    );
  });

  await t.test("a duplicated target is rejected", async () => {
    const before = '<section class="repeated">Same</section>';
    const html = validDocument(`${before}${before}`);
    await assert.rejects(
      applyControlledGemPatch(
        html,
        patchChange(
          before,
          await sha256Hex(html),
          '<section class="repeated">Changed</section>',
        ),
      ),
      (error) => error?.code === "GEM_PATCH_TARGET_NOT_UNIQUE",
    );
  });

  await t.test("a patch producing invalid HTML is rejected", async () => {
    const html = validDocument('<main id="app">Complete app</main>');
    const before = "</html>";
    await assert.rejects(
      applyControlledGemPatch(
        html,
        patchChange(before, await sha256Hex(html), "<div>trailing replacement</div>"),
      ),
      (error) => error?.code === "GEM_PATCH_HTML_INVALID",
    );
  });

  await t.test("free-form or incomplete validation claims are rejected", async () => {
    const before = '<section id="hero">Original</section>';
    const html = validDocument(before);
    const incomplete = {
      ...patchChange(before, await sha256Hex(html), '<section id="hero">Changed</section>'),
      validation: ["html_document_valid"],
    };
    assert.equal(GemPatchSchema.safeParse(incomplete).success, false);
    assert.equal(
      GemPatchSchema.safeParse({ ...incomplete, validation: ["looks good"] }).success,
      false,
    );
  });

  await t.test("a replacement that is not unique fails its declared runtime check", async () => {
    const replacement = '<section id="improved">Improved</section>';
    const before = '<section id="hero">Original</section>';
    const html = validDocument(`${before}${replacement}`);
    await assert.rejects(
      applyControlledGemPatch(
        html,
        patchChange(before, await sha256Hex(html), replacement),
      ),
      (error) => error?.code === "GEM_PATCH_REPLACEMENT_NOT_UNIQUE",
    );
  });

  await t.test("each accepted patch is security-scanned before it can be persisted", async () => {
    const before = '<section id="hero">Original</section>';
    const html = validDocument(before);
    const safe = await applyAndValidateGemPatch(
      html,
      patchChange(before, await sha256Hex(html), '<section id="hero">Safe change</section>'),
    );
    assert.equal(safe.aegis.passed, true);
    assert.equal(safe.aegis.blockerCount, 0);
    assert.equal(safe.artifactSha256, await sha256Hex(safe.html));

    await assert.rejects(
      applyAndValidateGemPatch(
        html,
        patchChange(
          before,
          await sha256Hex(html),
          '<section id="hero"><script>fetch("https://evil.example")</script></section>',
        ),
      ),
      (error) => error?.code === "GEM_PATCH_SECURITY_VALIDATION_FAILED",
    );
  });
});
