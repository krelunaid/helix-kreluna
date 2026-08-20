import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("Prototype and Production are separate, fail-closed product levels", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(async () => vite.close());

  const [levels, create, orchestrator] = await Promise.all([
    vite.ssrLoadModule("/src/lib/build-level.ts"),
    vite.ssrLoadModule("/src/lib/server/jobs/create.ts"),
    vite.ssrLoadModule("/src/lib/server/orchestrator/helix.ts"),
  ]);

  assert.equal(levels.parseBuildLevel(undefined), "prototype");
  assert.equal(levels.parseBuildLevel("prototype"), "prototype");
  assert.equal(levels.parseBuildLevel("production"), "production");
  assert.throws(
    () => levels.parseBuildLevel("prod"),
    (error) => error.code === "INVALID_BUILD_LEVEL" && error.status === 400,
  );

  const prototype = levels.getBuildQuote({
    buildLevel: "prototype",
    authenticated: true,
  });
  assert.equal(prototype.available, true);
  assert.equal(prototype.credits, 8);

  for (const authenticated of [false, true]) {
    const production = levels.getBuildQuote({
      buildLevel: "production",
      authenticated,
    });
    assert.equal(production.available, false);
    assert.equal(production.credits, null);
    assert.match(production.reasonCode, /^PRODUCTION_MODE_/);
    assert.throws(
      () => levels.assertBuildLevelAvailable({
        buildLevel: "production",
        authenticated,
      }),
      (error) => error.status === 409 && /^PRODUCTION_MODE_/.test(error.code),
    );
  }

  const shared = {
    prompt: "Build a fidelity-level test",
    locale: "en",
    mode: "generate",
    currentHtml: null,
  };
  const prototypeDraft = await create.createBuildJobDraft({
    ...shared,
    buildLevel: "prototype",
  });
  const productionDraft = await create.createBuildJobDraft({
    ...shared,
    buildLevel: "production",
  });
  assert.equal(prototypeDraft.job.buildLevel, "prototype");
  assert.equal(productionDraft.job.buildLevel, "production");
  assert.notEqual(
    prototypeDraft.requestFingerprint,
    productionDraft.requestFingerprint,
  );

  await assert.rejects(
    orchestrator.runCrew(productionDraft.job),
    (error) =>
      error.code === "PRODUCTION_PIPELINE_NOT_CONFIGURED" &&
      error.retryable === false,
  );
});

test("unsupported Production requests stop before quota, job and credit work", async () => {
  const [guestSource, projectSource, deskSource, migration] = await Promise.all([
    readFile(new URL("../src/lib/server/agents.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/server/vetra.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/idea-desk.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../migrations/0016_build_level_workspace.sql", import.meta.url),
      "utf8",
    ),
  ]);

  const guestHandler = guestSource.slice(
    guestSource.indexOf("export const startGuestBuild"),
    guestSource.indexOf("export const getBuildJob"),
  );
  assert.ok(
    guestHandler.indexOf("assertBuildLevelAvailable") <
      guestHandler.indexOf("reserveGuestAiBudget"),
  );
  assert.ok(
    guestHandler.indexOf("assertBuildLevelAvailable") <
      guestHandler.indexOf("createBuildJobDraft"),
  );

  const createHandler = projectSource.slice(
    projectSource.indexOf("export const createProject"),
    projectSource.indexOf("export const iterateProject"),
  );
  assert.ok(
    createHandler.indexOf("assertBuildLevelAvailable") <
      createHandler.indexOf("ensureProfile"),
  );
  assert.ok(
    createHandler.indexOf("assertBuildLevelAvailable") <
      createHandler.indexOf("apply_credit_entry"),
  );

  assert.match(deskSource, /disabled[\s\S]*desk\.production/);
  assert.match(deskSource, /buildLevel:\s*BuildLevel/);
  assert.match(migration, /build_level in \('prototype', 'production'\)/);
  assert.match(migration, /jsonb_build_object\('buildLevel', 'prototype'\)/);
});
