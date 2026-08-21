import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), "utf8");

test("Helix keeps orchestration, agents, model transport and state in bounded modules", async (t) => {
  const orchestrator = read("src/lib/server/orchestrator/helix.ts");
  const lines = orchestrator.split("\n").length;
  assert.ok(lines < 1_000, `orchestrator is still too broad: ${lines} lines`);
  for (const legacyDefinition of [
    /function\s+agentPlan\s*\(/,
    /function\s+agentArchitecture\s*\(/,
    /function\s+agentDesign\s*\(/,
    /function\s+agentBuild\s*\(/,
    /function\s+agentGem\s*\(/,
    /function\s+chatGrok\s*\(/,
  ]) {
    assert.doesNotMatch(orchestrator, legacyDefinition);
  }

  for (const path of [
    "src/lib/server/orchestrator/state.ts",
    "src/lib/server/agents/nova.ts",
    "src/lib/server/agents/atlas.ts",
    "src/lib/server/agents/lumen.ts",
    "src/lib/server/agents/forge.ts",
    "src/lib/server/agents/gems.ts",
    "src/lib/server/ai/chat.ts",
  ]) {
    assert.ok(read(path).trim().length > 0, `${path} must be a real module`);
  }
  const chat = read("src/lib/server/ai/chat.ts");
  assert.match(chat, /function chatModel/);
  assert.match(chat, /event: "ai_provider_request_failed"/);
  assert.doesNotMatch(chat, /function chatGrok|event: "xai_request_failed"/);

  const serverSources = [
    orchestrator,
    read("src/lib/server/orchestrator/state.ts"),
    read("src/lib/server/ai/chat.ts"),
    read("src/lib/server/agents/nova.ts"),
    read("src/lib/server/agents/atlas.ts"),
    read("src/lib/server/agents/lumen.ts"),
    read("src/lib/server/agents/forge.ts"),
    read("src/lib/server/agents/gems.ts"),
  ].join("\n");
  assert.doesNotMatch(serverSources, /@ts-nocheck/);

  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const [facade, runtime] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/agents.ts"),
    vite.ssrLoadModule("/src/lib/server/orchestrator/helix.ts"),
  ]);
  assert.equal(typeof facade.startBuild, "function");
  assert.equal(typeof facade.startGuestBuild, "function");
  assert.equal(typeof runtime.runCrew, "function");
  assert.equal(typeof runtime.persistBuildJob, "function");
});
