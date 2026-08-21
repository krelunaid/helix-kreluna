import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("HTML artifacts are complete and at least 400 characters", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());

  const { extractHtml, isValidHtmlArtifact, MIN_HTML_ARTIFACT_LENGTH } =
    await vite.ssrLoadModule("/src/lib/server/agents/html.ts");

  const shortDocument = "<!doctype html><html><body>short</body></html>";
  const incompleteDocument = `<html><body>${"substantial content ".repeat(30)}</body>`;
  assert.ok(shortDocument.length < MIN_HTML_ARTIFACT_LENGTH);
  assert.ok(incompleteDocument.length >= MIN_HTML_ARTIFACT_LENGTH);
  assert.equal(isValidHtmlArtifact(shortDocument), false);
  assert.equal(isValidHtmlArtifact(incompleteDocument), false);
  assert.equal(isValidHtmlArtifact(null), false);

  assert.equal(extractHtml("The model returned no document."), null);
  const extractedShort = extractHtml(`\`\`\`html\n${shortDocument}\n\`\`\``);
  assert.equal(isValidHtmlArtifact(extractedShort), false);

  const completeDocument = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Validated</title></head><body><main><h1>Complete artifact</h1><p>${"real interactive content ".repeat(30)}</p></main></body></html>`;
  assert.ok(completeDocument.length >= MIN_HTML_ARTIFACT_LENGTH);
  assert.equal(isValidHtmlArtifact(completeDocument), true);
  assert.equal(
    extractHtml(`Model result:\n\`\`\`html\n${completeDocument}\n\`\`\``),
    completeDocument,
  );
});

test("worker and orchestrator both enforce the shared HTML artifact validator", () => {
  const worker = readFileSync(
    new URL("../src/lib/server/jobs/worker.ts", import.meta.url),
    "utf8",
  );
  const orchestrator = readFileSync(
    new URL("../src/lib/server/orchestrator/helix.ts", import.meta.url),
    "utf8",
  );

  for (const [label, source] of [
    ["worker", worker],
    ["orchestrator", orchestrator],
  ]) {
    assert.match(
      source,
      /import\s*\{[\s\S]*?isValidHtmlArtifact[\s\S]*?\}\s*from\s*["']@\/lib\/server\/agents\/html["']/,
      `${label} must import the shared artifact validator`,
    );
    assert.match(
      source,
      /isValidHtmlArtifact\s*\(/,
      `${label} must validate an artifact before accepting it`,
    );
  }
});
