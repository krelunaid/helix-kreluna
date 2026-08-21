import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), "utf8");

test("the Human Gate exposes measured and not-run evidence before approval", () => {
  const gate = read("src/components/human-gate.tsx");
  const studio = read("src/routes/studio.$id.tsx");
  const guest = read("src/routes/try.tsx");
  const controlCenter = read("src/components/control-center.tsx");
  const rootRoute = read("src/routes/__root.tsx");
  const messages = read("src/lib/messages.ts");

  assert.match(gate, /quality\?: BuildQualityEvidence/);
  assert.match(gate, /gate\.browserEvidenceWarning/);
  assert.match(gate, /report\?\.status === "completed"/);
  assert.match(studio, /quality=\{job\.quality\}/);
  assert.match(guest, /quality=\{job\.quality\}/);
  assert.match(messages, /Browser QA was not completed/);
  assert.doesNotMatch(messages, /validated release candidate/);
  assert.match(controlCenter, /status === "error"/);
  assert.match(controlCenter, /status === "cancelled"/);
  assert.doesNotMatch(rootRoute, /sviluppa, testa e prepara/);
  assert.doesNotMatch(messages, /Then Warden watches|Poi Warden vigila/);
  assert.doesNotMatch(messages, /Same job as TestFlight|Stesso ruolo di TestFlight/);
});
