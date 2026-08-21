import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("release planning artifacts preserve every approved planning dimension", async (t) => {
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
    { renderPrdMarkdown, renderArchitectureMarkdown },
    { HOUSE_BY_ID, stackFor, knowledgeHints },
    { classifyBrief },
  ] =
    await Promise.all([
      vite.ssrLoadModule("/src/lib/server/release/candidate.ts"),
      vite.ssrLoadModule("/src/lib/house.ts"),
      vite.ssrLoadModule("/src/lib/brief.ts"),
    ]);

  const prd = renderPrdMarkdown(
    {
      title: "Signal Desk",
      type: "app",
      pitch: "Coordinate verified signals.",
      target: "Operations teams",
      problem: "Signals are fragmented.",
      useCases: ["Triage a live incident", "Hand off a verified action"],
      mvp: ["Incident board"],
      scope: { p0: ["Ownership"], p1: ["Escalation"], p2: ["Forecasting"] },
      nonGoals: ["Autonomous deployment"],
      userJourneys: ["Operator opens and assigns an incident"],
      acceptanceCriteria: ["Assignment persists"],
      screens: [{ name: "Board", purpose: "Triage incidents" }],
      features: ["Assignment"],
      data: ["Incident"],
      success: "Faster triage",
      backend: "Required",
      integrations: ["Pager adapter"],
    },
    "fallback",
  );
  assert.match(prd, /## Use cases\n- Triage a live incident\n- Hand off a verified action/);
  assert.match(prd, /## Acceptance criteria\n- Assignment persists/);

  const architecture = renderArchitectureMarkdown(
    {
      productType: "operations app",
      frontendArchitecture: "route-based web client",
      backendArchitecture: "authenticated API",
      dataFlow: ["event -> queue -> board"],
      screenMap: ["Board: triage", "Incident: decision"],
      routeMap: ["/incidents: list"],
      apiContracts: ["POST /api/incidents: input -> incident"],
      databaseRequirements: "incidents with owner_id",
      authModel: "server session",
      permissions: ["operator: assign", "viewer: read"],
      integrations: ["Pager adapter: configuration required"],
      deploymentTarget: "Netlify web runtime",
      failureModes: ["queue unavailable: fail closed"],
    },
    { front: "unused", back: "unused", db: "unused", auth: "unused" },
  );
  for (const evidence of [
    "## Screen map\n- Board: triage",
    "## Permissions\n- operator: assign",
    "## Integrations\n- Pager adapter: configuration required",
  ]) {
    assert.match(architecture, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(HOUSE_BY_ID.lumen.brief, /Three distinct directions/);
  assert.match(HOUSE_BY_ID.lumen.briefIt, /Tre direzioni distinte/);
  assert.doesNotMatch(HOUSE_BY_ID.lumen.brief, /Four/i);
  assert.doesNotMatch(HOUSE_BY_ID.lumen.briefIt, /Quattro/i);

  const desktop = stackFor(["desktop"]);
  assert.match(desktop.front, /source-only Electron wrapper/);
  assert.match(desktop.front, /no desktop binary or Tauri project is generated/);
  assert.doesNotMatch(desktop.front, /packs Electron\/Tauri/i);
  assert.match(knowledgeHints("Build a desktop program").join("\n"), /no desktop binary is built here/);

  const shopHints = knowledgeHints("Build an ecommerce checkout").join("\n");
  assert.match(shopHints, /Checkout must stay disabled/);
  assert.match(shopHints, /never simulate payment success/);
  assert.doesNotMatch(shopHints, /fake checkout success/);

  const shopBrief = classifyBrief("Build an ecommerce storefront");
  assert.equal(shopBrief.domain, "shop");
  assert.match(shopBrief.lock, /Checkout stays disabled/);
  assert.match(shopBrief.lock, /never simulate payment success/);
  assert.doesNotMatch(shopBrief.lock, /fake checkout/);
});
