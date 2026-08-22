import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createServer as createViteServer } from "vite";
import {
  PENDING_BUILD_PROMPT_KEY,
  buildLoginSearch,
  buildPromptDestination,
  decideBuildEntry,
  preservePendingBuildPrompt,
  takePendingBuildPrompt,
} from "../src/lib/build-entry.ts";

const ROOT = join(import.meta.dirname, "..");
const [
  agentsSource,
  vetraSource,
  gatewaySource,
  homeSource,
  indexSource,
  workerSource,
  loginSource,
  signInPanelSource,
] = await Promise.all([
  readFile(join(ROOT, "src/lib/server/agents.ts"), "utf8"),
  readFile(join(ROOT, "src/lib/server/vetra.ts"), "utf8"),
  readFile(join(ROOT, "src/lib/server/ai/gateway.ts"), "utf8"),
  readFile(join(ROOT, "src/lib/use-helix-create.ts"), "utf8"),
  readFile(join(ROOT, "src/routes/index.tsx"), "utf8"),
  readFile(join(ROOT, "src/lib/server/jobs/worker.ts"), "utf8"),
  readFile(join(ROOT, "src/routes/login.tsx"), "utf8"),
  readFile(join(ROOT, "src/components/sign-in-panel.tsx"), "utf8"),
]);

function sourceSection(source, start, end) {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  assert.ok(startAt >= 0, `missing source marker: ${start}`);
  assert.ok(endAt > startAt, `missing source marker: ${end}`);
  return source.slice(startAt, endAt);
}

function assertGatePrecedes(section, gate, effects) {
  const gateAt = section.indexOf(gate);
  assert.ok(gateAt >= 0, `missing gate: ${gate}`);
  for (const effect of effects) {
    const effectAt = section.indexOf(effect);
    assert.ok(effectAt > gateAt, `${gate} must precede ${effect}`);
  }
}

test("AI-disabled authenticated and guest boundaries precede every debit, project and job effect", () => {
  const authenticatedCreate = sourceSection(
    vetraSource,
    "export const createProject",
    "export const iterateProject",
  );
  assertGatePrecedes(authenticatedCreate, "assertAiGenerationEnabled();", [
    "ensureProfile(context.userId)",
    "const sql = await getSql()",
    "createBuildJobDraft({",
    "create_project_and_enqueue_build_job(",
    "dispatchCommittedBuildJob(jobId)",
  ]);

  const authenticatedIteration = sourceSection(
    vetraSource,
    "export const iterateProject",
    "export const hostProject",
  );
  assertGatePrecedes(authenticatedIteration, "assertAiGenerationEnabled();", [
    "const sql = await getSql()",
    "loadBuildJob(data.sourceJobId)",
    "createBuildJobDraft({",
    "apply_credit_entry(",
    "enqueue_linked_build_job(",
    "dispatchCommittedBuildJob(jobId)",
  ]);

  const guestBuild = sourceSection(
    agentsSource,
    "export const startGuestBuild",
    "export const getBuildJob",
  );
  assertGatePrecedes(guestBuild, "assertAiGenerationEnabled();", [
    "loadBuildJob(data.sourceJobId)",
    "reserveGuestAiBudget({ inputBytes })",
    "createGuestBuildCredential()",
    "createBuildJobDraft({",
    "enqueueGuestGateModification({",
    "enqueueBuild({",
    "dispatchBuildJob(jobId)",
  ]);
});

test("anonymous production generation closes before abuse, queue or provider work", () => {
  const guestBuild = sourceSection(
    agentsSource,
    "export const startGuestBuild",
    "export const getBuildJob",
  );
  assertGatePrecedes(guestBuild, "assertGuestAiGenerationAllowed();", [
    "loadBuildJob(data.sourceJobId)",
    "reserveGuestAiBudget({ inputBytes })",
    "createGuestBuildCredential()",
    "createBuildJobDraft({",
    "enqueueGuestGateModification({",
    "enqueueBuild({",
    "dispatchBuildJob(jobId)",
  ]);
});

test("the worker terminalizes restored Production guest jobs before orchestrator work", () => {
  const worker = sourceSection(
    workerSource,
    "export async function processBuildJob",
    "  } finally {",
  );
  const claimAt = worker.indexOf("await claimBuildJob(");
  const tryAt = worker.indexOf("  try {");
  const guestAt = worker.indexOf("if (!job.userId)", tryAt);
  const gateAt = worker.indexOf("assertGuestAiGenerationAllowed();", guestAt);
  const crewAt = worker.indexOf("await runCrew(job);", gateAt);
  const catchAt = worker.indexOf("  } catch (error) {", crewAt);
  const retryableAt = worker.indexOf("const retryable = isRetryable(error);", catchAt);
  const failureAt = worker.indexOf("await markBuildJobFailed(job, workerId, error", retryableAt);
  const terminalReleaseAt = worker.indexOf("if (!outcome.retry)", failureAt);
  const releaseAt = worker.indexOf("await releaseGuestLease(job);", terminalReleaseAt);

  assert.ok(
    claimAt >= 0 &&
      tryAt > claimAt &&
      guestAt > tryAt &&
      gateAt > guestAt &&
      crewAt > gateAt &&
      catchAt > crewAt &&
      retryableAt > catchAt &&
      failureAt > retryableAt &&
      terminalReleaseAt > failureAt &&
      releaseAt > terminalReleaseAt,
    "the claimed guest guard must stay inside the terminal failure/refund path and before runCrew",
  );
});

test("disabled AI and production guest guards expose stable non-retryable errors", async (t) => {
  const vite = await createViteServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const [availability, guestAvailability] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/ai/availability.ts"),
    vite.ssrLoadModule("/src/lib/server/ai/guest-availability.ts"),
  ]);

  for (const value of [undefined, "", "false", "TRUE", "1"]) {
    assert.throws(
      () => availability.assertAiGenerationEnabled({ HELIX_AI_GATEWAY_ENABLED: value }),
      (error) =>
        error?.code === "HELIX_AI_DISABLED" && error?.retryable === false && error?.status === 503,
    );
  }
  assert.doesNotThrow(() =>
    availability.assertAiGenerationEnabled({ HELIX_AI_GATEWAY_ENABLED: "true" }),
  );

  assert.throws(
    () => guestAvailability.assertGuestAiGenerationAllowed({ isProduction: true }),
    (error) =>
      error?.code === "HELIX_GUEST_AI_DISABLED_IN_PRODUCTION" &&
      error?.retryable === false &&
      error?.status === 403,
  );
  assert.doesNotThrow(() =>
    guestAvailability.assertGuestAiGenerationAllowed({ isProduction: false }),
  );
});

test("disabled gateway reaches neither telemetry/cache nor the provider", async (t) => {
  const previousEnabled = process.env.HELIX_AI_GATEWAY_ENABLED;
  const previousFetch = globalThis.fetch;
  process.env.HELIX_AI_GATEWAY_ENABLED = "false";
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error("provider must not be called while AI is disabled");
  };
  t.after(() => {
    if (previousEnabled === undefined) delete process.env.HELIX_AI_GATEWAY_ENABLED;
    else process.env.HELIX_AI_GATEWAY_ENABLED = previousEnabled;
    globalThis.fetch = previousFetch;
  });

  const vite = await createViteServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const gateway = await vite.ssrLoadModule("/src/lib/server/ai/gateway.ts");

  await assert.rejects(
    gateway.requestAgentCompletion({}),
    (error) => error?.code === "HELIX_AI_DISABLED" && error?.retryable === false,
  );
  assert.equal(providerCalls, 0);

  const requestBoundary = sourceSection(
    gatewaySource,
    "export async function requestAgentCompletion",
    "const startedAt = Date.now();",
  );
  assertGatePrecedes(requestBoundary, "assertAiGenerationEnabled();", [
    "recoverStaleAiCalls({",
    "readAiResponseCache(cacheKey)",
    "configuredProviders()",
    "reserveAiCallTelemetry({",
  ]);
});

test("build entry waits for session resolution before choosing authenticated or login", () => {
  const pending = {
    authEnabled: true,
    previewPasswordSignInEnabled: false,
    isPending: true,
    userPresent: false,
  };
  assert.equal(decideBuildEntry(pending), "wait_for_session");
  assert.equal(
    decideBuildEntry({ ...pending, isPending: false, userPresent: true }),
    "authenticated",
  );
  assert.equal(decideBuildEntry({ ...pending, isPending: false, userPresent: false }), "login");
  assert.equal(decideBuildEntry({ ...pending, previewPasswordSignInEnabled: true }), "guest");
  assert.equal(decideBuildEntry({ ...pending, authEnabled: false }), "guest");
});

test("login handoff preserves the exact normalized prompt in URL state and session storage", () => {
  const prompt = "  Crea un gestionale caffè ☕  ";
  assert.deepEqual(buildLoginSearch(prompt), {
    next: "/",
    prompt: "Crea un gestionale caffè ☕",
  });
  assert.equal(
    buildPromptDestination("/", "Crea un gestionale caffè ☕"),
    "/?prompt=Crea+un+gestionale+caff%C3%A8+%E2%98%95",
  );
  assert.equal(
    buildPromptDestination("/pricing?lang=it", "  prova  "),
    "/pricing?lang=it&prompt=prova",
  );
  assert.equal(buildPromptDestination("https://evil.invalid", "prova"), "/?prompt=prova");

  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  preservePendingBuildPrompt(storage, prompt);
  assert.equal(values.get(PENDING_BUILD_PROMPT_KEY), "Crea un gestionale caffè ☕");
  assert.equal(takePendingBuildPrompt(storage), "Crea un gestionale caffè ☕");
  assert.equal(takePendingBuildPrompt(storage), null);

  preservePendingBuildPrompt(storage, "stale");
  assert.equal(takePendingBuildPrompt(storage, "URL wins"), "URL wins");
  assert.equal(values.has(PENDING_BUILD_PROMPT_KEY), false);
});

test("home wires pending-session resolution and prompt handoff before login or generation", () => {
  const build = sourceSection(homeSource, "async function build(", "return { prompt");
  const decisionAt = build.indexOf("decideBuildEntry({");
  const pendingAt = build.indexOf('entry === "wait_for_session"', decisionAt);
  const sessionAt = build.indexOf("await authClient.getSession()", pendingAt);
  const resolvedDecisionAt = build.indexOf("entry = decideBuildEntry({", sessionAt);
  const loginGateAt = build.indexOf('entry === "login"', resolvedDecisionAt);
  const storageAt = build.indexOf("preservePendingBuildPrompt", loginGateAt);
  const loginAt = build.indexOf('to: "/login"', loginGateAt);
  const loginSearchAt = build.indexOf("search: buildLoginSearch(value)", loginAt);
  const generationAt = build.indexOf('entry === "authenticated"', loginSearchAt);
  assert.ok(
    decisionAt >= 0 &&
      pendingAt > decisionAt &&
      sessionAt > pendingAt &&
      resolvedDecisionAt > sessionAt &&
      loginGateAt > resolvedDecisionAt &&
      storageAt > loginGateAt &&
      loginAt > storageAt &&
      loginSearchAt > loginAt &&
      generationAt > loginSearchAt,
  );
  assert.match(build.slice(loginGateAt, generationAt), /return;/);
  assert.match(homeSource, /const \{ user, isPending \} = useCurrentUserState\(\)/);
  assert.match(indexSource, /const \{ prompt: routePrompt \} = Route\.useSearch\(\)/);
  assert.match(homeSource, /takePendingBuildPrompt\(window\.sessionStorage, routePrompt\)/);
});

test("login uses the prompt-bearing destination for resolved sessions, email and OAuth", () => {
  const destinationAt = loginSource.indexOf(
    "const destPath = buildPromptDestination(next, prompt)",
  );
  const sessionNavigateAt = loginSource.indexOf("navigate({ to: destPath })", destinationAt);
  const panelDestinationAt = signInPanelSource.indexOf(
    "const destPath = buildPromptDestination(next, prompt)",
  );
  const emailNavigateAt = signInPanelSource.indexOf("navigate({ to: destPath })", panelDestinationAt);
  const callbackAt = signInPanelSource.indexOf("const callbackURL", panelDestinationAt);
  const socialAt = signInPanelSource.indexOf("authClient.signIn.social", callbackAt);
  assert.ok(
    destinationAt >= 0 &&
      sessionNavigateAt > destinationAt &&
      panelDestinationAt >= 0 &&
      emailNavigateAt > panelDestinationAt &&
      callbackAt > panelDestinationAt &&
      socialAt > callbackAt,
  );
  assert.doesNotMatch(loginSource, /navigate\(\{ to: next/);
  assert.doesNotMatch(signInPanelSource, /navigate\(\{ to: next/);
});
