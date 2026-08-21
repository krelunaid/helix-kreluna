import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function direction(overrides) {
  return {
    id: "editorial",
    name: "Editorial Signal",
    mood: "Precise and calm",
    palette: {
      bg: "#050505",
      fg: "#ffffff",
      accent: "#ff4d00",
      muted: "#777777",
      elevated: "#141414",
    },
    fonts: { display: "Fraunces", body: "Source Sans 3" },
    layout: "Asymmetric editorial columns",
    density: "Airy",
    grid: "Twelve-column broken grid",
    motion: "Measured vertical reveals",
    iconography: "Hairline custom symbols",
    componentGeometry: "Sharp corners and ruled edges",
    imagery: "Cropped documentary photography",
    references: ["Independent editorial systems"],
    forbiddenCliches: ["Gradient blobs", "Generic glass cards"],
    ...overrides,
  };
}

test("agent contracts describe the real Helix executions", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(async () => {
    await vite.close();
  });

  const [{ AGENT_CONTRACTS }, { selectDesignDirection }, { DesignSelectionSchema }] =
    await Promise.all([
      vite.ssrLoadModule("/src/lib/server/agents/contracts.ts"),
      vite.ssrLoadModule("/src/lib/server/agents/design.ts"),
      vite.ssrLoadModule("/src/lib/server/agents/types.ts"),
    ]);

  await t.test("the registry contains all and only the current executions", () => {
    const expected = [
      "helix",
      "nova",
      "atlas",
      "lumen",
      "forgeUi",
      "forgeLogic",
      "iris",
      "superior",
      "gemPatch",
    ];
    assert.deepEqual(Object.keys(AGENT_CONTRACTS).sort(), expected.sort());
  });

  await t.test("every contract exposes the required typed metadata", () => {
    const kinds = new Set(["orchestrator", "ai_agent", "review_agent", "patch_agent"]);
    const artifacts = new Set();
    for (const [id, contract] of Object.entries(AGENT_CONTRACTS)) {
      for (const field of [
        "id",
        "kind",
        "version",
        "role",
        "inputSchema",
        "outputSchema",
        "allowedTools",
        "timeoutMs",
        "maxRetries",
        "model",
        "maxTokens",
        "maxCostUsd",
        "maxCostUsdTicks",
        "artifact",
        "validation",
        "status",
        "error",
      ]) {
        assert.ok(Object.hasOwn(contract, field), `${id} is missing ${field}`);
      }
      assert.ok(kinds.has(contract.kind), `${id} has an unknown kind`);
      assert.equal(contract.id, id, `${id} has a mismatched explicit id`);
      assert.match(contract.version, /^\d+\.\d+\.\d+$/, `${id} must use semver`);
      assert.ok(contract.role.trim().length > 0, `${id} has no role`);
      assert.equal(typeof contract.inputSchema.safeParse, "function", `${id} has no input schema`);
      assert.equal(
        typeof contract.outputSchema.safeParse,
        "function",
        `${id} has no output schema`,
      );
      assert.ok(Array.isArray(contract.allowedTools), `${id} allowedTools is not an array`);
      assert.ok(contract.allowedTools.length > 0, `${id} must explicitly allow its tools`);
      assert.ok(Number.isSafeInteger(contract.timeoutMs) && contract.timeoutMs > 0);
      assert.ok(Number.isSafeInteger(contract.maxRetries) && contract.maxRetries >= 0);
      assert.ok(contract.model === null || /^grok-\d/.test(contract.model));
      assert.ok(Number.isSafeInteger(contract.maxTokens) && contract.maxTokens >= 0);
      assert.ok(Number.isFinite(contract.maxCostUsd) && contract.maxCostUsd >= 0);
      assert.match(contract.maxCostUsdTicks, /^(?:0|[1-9]\d*)$/);
      assert.equal(
        BigInt(contract.maxCostUsdTicks),
        BigInt(Math.round(contract.maxCostUsd * 1e10)),
        `${id} decimal and integer cost ceilings diverge`,
      );
      assert.ok(contract.artifact.trim().length > 0, `${id} has no artifact`);
      assert.ok(!artifacts.has(contract.artifact), `${id} reuses artifact ${contract.artifact}`);
      artifacts.add(contract.artifact);
      assert.equal(contract.validation.mode, "zod_and_sha256");
      assert.equal(contract.validation.artifactRequiredOnDone, true);
      assert.equal(contract.status.safeParse("done").success, true);
      assert.equal(
        contract.error.safeParse({
          code: "CONTROLLED_FAILURE",
          retryable: false,
          detailRedacted: "No credentials included.",
        }).success,
        true,
      );
      if (contract.kind !== "orchestrator") {
        assert.notEqual(contract.model, null, `${id} invokes AI but has no model`);
        assert.ok(contract.maxTokens > 0, `${id} invokes AI without a token budget`);
        assert.ok(contract.maxCostUsd > 0, `${id} invokes AI without a cost budget`);
      }
    }
  });

  await t.test("Forge UI and Forge Logic are separate, ordered contracts", () => {
    const ui = AGENT_CONTRACTS.forgeUi;
    const logic = AGENT_CONTRACTS.forgeLogic;
    assert.notEqual(ui, logic);
    assert.notEqual(ui.inputSchema, logic.inputSchema);
    assert.notEqual(ui.artifact, logic.artifact);
    assert.match(ui.artifact, /ui/i);
    assert.match(logic.artifact, /logic/i);

    const shared = {
      prompt: "Build a distinctive working application",
      locale: "en",
      language: "English",
      mode: "generate",
      plan: null,
      architecture: null,
      design: null,
      notes: [],
    };
    const completeHtml = `<!doctype html><html lang="en"><head><title>Forge</title></head><body><main>${"Interactive product content. ".repeat(20)}</main></body></html>`;
    assert.equal(ui.inputSchema.safeParse({ ...shared, currentHtml: null }).success, true);
    assert.equal(logic.inputSchema.safeParse({ ...shared, currentHtml: null }).success, false);
    assert.equal(ui.inputSchema.safeParse({ ...shared, currentHtml: completeHtml }).success, false);
    assert.equal(
      logic.inputSchema.safeParse({ ...shared, currentHtml: completeHtml }).success,
      true,
    );
  });

  await t.test("Lumen rejects lookalike directions and selects the highest coherent score", () => {
    const repeated = direction({});
    const invalidPortfolio = {
      directions: [repeated, { ...repeated }, { ...repeated }],
    };
    assert.equal(AGENT_CONTRACTS.lumen.outputSchema.safeParse(invalidPortfolio).success, false);

    const portfolio = {
      directions: [
        repeated,
        direction({
          id: "terminal",
          name: "Terminal Density",
          mood: "Dense and operational",
          palette: {
            bg: "#777777",
            fg: "#888888",
            accent: "#00aa66",
            muted: "#666666",
            elevated: "#707070",
          },
          fonts: { display: "Inter", body: "Roboto" },
          layout: "Dense workstation matrix",
          density: "Compressed",
          grid: "Sixteen-column terminal grid",
          motion: "Immediate state flashes",
          iconography: "Filled technical glyphs",
          componentGeometry: "Squared compact controls",
          imagery: "Data-first, no photography",
        }),
        direction({
          id: "spatial",
          name: "Spatial Field",
          mood: "Cinematic and exploratory",
          palette: {
            bg: "#101628",
            fg: "#d9e4ff",
            accent: "#7b61ff",
            muted: "#7783a6",
            elevated: "#18213b",
          },
          fonts: { display: "Sora", body: "IBM Plex Sans" },
          layout: "Full-canvas spatial layers",
          density: "Layered",
          grid: "Radial anchor grid",
          motion: "Parallax focus transitions",
          iconography: "Orbital line symbols",
          componentGeometry: "Clipped panels and circular controls",
          imagery: "Abstract depth maps",
        }),
      ],
    };
    assert.equal(AGENT_CONTRACTS.lumen.outputSchema.safeParse(portfolio).success, true);

    const selection = selectDesignDirection(portfolio);
    assert.equal(DesignSelectionSchema.safeParse(selection).success, true);
    assert.equal(selection.scores.length, 3);
    assert.deepEqual(
      new Set(selection.scores.map((score) => score.id)),
      new Set(portfolio.directions.map((item) => item.id)),
    );
    const highest = [...selection.scores].sort((left, right) => right.score - left.score)[0];
    assert.equal(selection.selectedId, highest.id);
    assert.equal(selection.selectedId, "editorial");
    assert.equal(selection.selectionRationale, highest.reasons.join(" · "));
  });

  await t.test("Gem produces a controlled patch contract, never a full HTML document", () => {
    const patch = {
      target: "Primary heading",
      operation: "replace_fragment",
      before: "<h1>Before</h1>",
      beforeHash: "a".repeat(64),
      patch: "<h1>After</h1>",
      validation: [
        "html_document_valid",
        "replacement_present_once",
        "original_fragment_absent",
      ],
    };
    assert.equal(AGENT_CONTRACTS.gemPatch.outputSchema.safeParse(patch).success, true);
    assert.match(AGENT_CONTRACTS.gemPatch.artifact, /patch/i);

    const fullHtml = `<!doctype html><html><body>${"Full document rewrite. ".repeat(30)}</body></html>`;
    assert.equal(AGENT_CONTRACTS.gemPatch.outputSchema.safeParse(fullHtml).success, false);
    assert.equal(AGENT_CONTRACTS.forgeLogic.outputSchema.safeParse(fullHtml).success, true);
  });
});
