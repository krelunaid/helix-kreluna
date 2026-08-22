import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createServer } from "vite";

const ROOT = join(import.meta.dirname, "..");
const [
  homeSource,
  dashboardSource,
  authenticatedHomeSource,
  gallerySource,
  ideaDeskSource,
  modelSource,
  copySource,
  vetraSource,
] = await Promise.all([
  readFile(join(ROOT, "src/routes/index.tsx"), "utf8"),
  readFile(join(ROOT, "src/routes/dashboard.tsx"), "utf8"),
  readFile(join(ROOT, "src/components/authenticated-home.tsx"), "utf8"),
  readFile(join(ROOT, "src/components/demo-project-gallery.tsx"), "utf8"),
  readFile(join(ROOT, "src/components/idea-desk.tsx"), "utf8"),
  readFile(join(ROOT, "src/lib/authenticated-home-model.ts"), "utf8"),
  readFile(join(ROOT, "src/lib/authenticated-home-copy.ts"), "utf8"),
  readFile(join(ROOT, "src/lib/server/vetra.ts"), "utf8"),
]);

function sourceSection(source, start, end) {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  assert.ok(startAt >= 0, `missing source marker: ${start}`);
  assert.ok(endAt > startAt, `missing source marker: ${end}`);
  return source.slice(startAt, endAt);
}

function project(overrides) {
  return Object.freeze({
    id: "project-default",
    user_id: "user-1",
    title: "Default project",
    prompt: "Build a default project",
    kind: "app",
    buildLevel: "prototype",
    status: "draft",
    html: "",
    messages: [],
    credits_spent: 0,
    hosted: false,
    hosted_until: null,
    created_at: "2026-08-22T08:00:00.000Z",
    updated_at: "2026-08-22T08:00:00.000Z",
    ...overrides,
  });
}

test("the home mounts the OS dashboard for a user and sign-in chrome when signed out", async () => {
  const [createSource, signInSource, landingSource, houseSource, prezziSource] = await Promise.all([
    readFile(join(ROOT, "src/lib/use-helix-create.ts"), "utf8"),
    readFile(join(ROOT, "src/components/home-sign-in.tsx"), "utf8"),
    readFile(join(ROOT, "src/components/public-landing.tsx"), "utf8"),
    readFile(join(ROOT, "src/routes/house.tsx"), "utf8"),
    readFile(join(ROOT, "src/routes/prezzi.tsx"), "utf8"),
  ]);
  const authenticatedBranch = sourceSection(homeSource, "  if (homeUser) {", "  return <HomeSignIn");

  assert.match(authenticatedBranch, /return <SignedInHome/);
  assert.match(authenticatedBranch, /user=\{homeUser\}/);
  assert.match(homeSource, /<AuthenticatedHome[\s\n]/);
  assert.equal((homeSource.match(/<AuthenticatedHome[\s>]/g) ?? []).length, 1);
  assert.match(homeSource, /return <HomeSignIn prompt=\{routePrompt\} \/>/);
  assert.doesNotMatch(homeSource, /from "@\/components\/public-landing"/);
  assert.doesNotMatch(homeSource, /from "@\/components\/idea-desk"/);
  assert.doesNotMatch(homeSource, /t\("mkt\.title"\)/);
  assert.doesNotMatch(homeSource, /id="esempi"/);
  assert.doesNotMatch(homeSource, /<HouseRoster/);
  assert.doesNotMatch(homeSource, /<IdeaDesk/);

  assert.match(signInSource, /dashboard-home-shell/);
  assert.match(signInSource, /dashboard-home-sidebar/);
  assert.match(signInSource, /dashboard-home-rail/);
  assert.match(signInSource, /dashboard-nav/);
  assert.match(signInSource, /function focusAccedi/);
  assert.match(signInSource, /<SignInPanel next="\/" prompt=\{prompt\} titleAs="h2" \/>/);
  assert.match(signInSource, /copy\.signedOutLead/);
  assert.match(signInSource, /copy\.signIn/);
  assert.doesNotMatch(signInSource, /<SiteHeader/);
  assert.doesNotMatch(signInSource, /<IdeaDesk/);
  assert.doesNotMatch(signInSource, /id="idea"/);
  assert.doesNotMatch(signInSource, /mkt\.title/);
  assert.doesNotMatch(signInSource, /useHelixCreate|startGuestBuild|DemoProjectGallery/);
  assert.doesNotMatch(signInSource, /Prototipo|Produzione|Crea gratis/);
  assert.match(createSource, /startGuestBuild\(/);
  assert.match(landingSource, /t\("mkt\.title"\)/);
  assert.match(landingSource, /id="esempi"/);
  assert.match(landingSource, /<HouseRoster/);
  assert.match(houseSource, /createFileRoute\("\/house"\)/);
  assert.match(houseSource, /<HouseRoster/);
  assert.match(prezziSource, /createFileRoute\("\/prezzi"\)/);
  assert.match(prezziSource, /<Navigate to="\/pricing" replace \/>/);
});

test("the legacy dashboard route preserves auth gates and reuses the authenticated home", () => {
  assert.match(dashboardSource, /const \{ user, isPending \} = useCurrentUserState\(\)/);
  assert.match(dashboardSource, /if \(isPending\)/);
  assert.match(dashboardSource, /if \(!user\) return <RedirectToSignIn\s*\/>/);
  assert.match(dashboardSource, /return <Navigate to="\/" replace\s*\/>/);
  assert.doesNotMatch(dashboardSource, /listProjects|getAccount|ProjectCard/);
});

test("dashboard state, metrics, filters and activity are deterministic and data-backed", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());

  const [model, copy, i18n, catalog] = await Promise.all([
    vite.ssrLoadModule("/src/lib/authenticated-home-model.ts"),
    vite.ssrLoadModule("/src/lib/authenticated-home-copy.ts"),
    vite.ssrLoadModule("/src/lib/i18n-core.ts"),
    vite.ssrLoadModule("/src/lib/flagships/catalog.ts"),
  ]);

  await t.test("demo eligibility requires a successful empty project response", () => {
    assert.equal(model.shouldShowDemoProjects({ status: "loading" }), false);
    assert.equal(model.shouldShowDemoProjects({ status: "error" }), false);
    assert.equal(model.shouldShowDemoProjects({ status: "ready", projects: [] }), true);
    assert.equal(
      model.shouldShowDemoProjects({
        status: "ready",
        projects: [project({ id: "one" })],
      }),
      false,
    );
    assert.equal(catalog.flagshipFor("it").length, 18);
  });

  await t.test("metrics and filters derive only from owned projects", () => {
    const projects = Object.freeze([
      project({
        id: "building",
        title: "Studio clienti",
        prompt: "Gestionale clienti",
        status: "building",
        updated_at: "2026-08-22T10:00:00.000Z",
      }),
      project({
        id: "ready-online",
        title: "Invoice control",
        prompt: "Dashboard fatture",
        status: "ready",
        hosted: true,
        updated_at: "2026-08-22T12:00:00.000Z",
      }),
      project({
        id: "error",
        title: "Booking desk",
        prompt: "Appuntamenti studio",
        status: "error",
        updated_at: "2026-08-22T11:00:00.000Z",
      }),
    ]);

    assert.deepEqual(model.dashboardMetrics(projects), {
      totalProjects: 3,
      readyProjects: 1,
      onlineProjects: 1,
    });
    assert.deepEqual(
      model.filterDashboardProjects(projects, "building", "").map((item) => item.id),
      ["building"],
    );
    assert.deepEqual(
      model.filterDashboardProjects(projects, "ready", "invoice").map((item) => item.id),
      ["ready-online"],
    );
    assert.deepEqual(
      model.filterDashboardProjects(projects, "online", "fatture").map((item) => item.id),
      ["ready-online"],
    );
    assert.deepEqual(
      model.filterDashboardProjects(projects, "all", "STUDIO").map((item) => item.id),
      ["building", "error"],
    );
    assert.deepEqual(
      projects.map((item) => item.id),
      ["building", "ready-online", "error"],
      "filtering must not reorder or mutate the project response",
    );
  });

  await t.test("recent activity merges and sorts real project and ledger timestamps", () => {
    const projects = Object.freeze([
      project({ id: "older", title: "Older", updated_at: "2026-08-22T09:00:00.000Z" }),
      project({ id: "newer", title: "Newer", updated_at: "2026-08-22T11:00:00.000Z" }),
    ]);
    const ledger = Object.freeze([
      Object.freeze({
        id: 8,
        action: "credit_grant",
        credits: 10,
        note: "Preview credits",
        project_id: null,
        created_at: "2026-08-22T12:00:00.000Z",
      }),
    ]);

    assert.deepEqual(
      model.dashboardActivity(projects, ledger, 2).map((item) => item.id),
      ["credit:8", "project:newer"],
    );
    assert.equal(ledger[0].credits, 10);
  });

  await t.test("every locale exposes exactly six complete quick-create presets", () => {
    for (const locale of i18n.LOCALES) {
      const localized = copy.authenticatedHomeCopy(locale);
      assert.equal(localized.quickPresets.length, 6, locale);
      assert.equal(new Set(localized.quickPresets.map((item) => item.label)).size, 6, locale);
      for (const preset of localized.quickPresets) {
        assert.ok(preset.label.trim().length > 2, `${locale} has an empty preset label`);
        assert.ok(preset.description.trim().length > 8, `${locale} has an empty preset detail`);
      }
      assert.ok(localized.signedOutLead.trim().length > 12, `${locale} missing signed-out gate copy`);
      assert.ok(localized.signIn.trim().length > 2, `${locale} missing signed-out Accedi label`);
    }
  });
});

test("project and account loading stay authenticated and race-safe", () => {
  const accountEndpoint = sourceSection(
    vetraSource,
    "export const getAccount",
    "export const listProjects",
  );
  const projectsEndpoint = sourceSection(
    vetraSource,
    "export const listProjects",
    "export const getProject",
  );
  for (const endpoint of [accountEndpoint, projectsEndpoint]) {
    assert.match(endpoint, /\.middleware\(\[authMiddleware\]\)/);
    assert.ok(endpoint.indexOf(".middleware([authMiddleware])") < endpoint.indexOf(".handler("));
    assert.match(endpoint, /context\.userId/);
  }
  assert.match(projectsEndpoint, /where user_id = \$\{context\.userId\}/);

  const loadEffect = sourceSection(
    authenticatedHomeSource,
    "  useEffect(() => {\n    let active = true;",
    "  }, [user.id, reload]);",
  );
  assert.match(loadEffect, /setProjectsState\(\{ status: "loading" \}\)/);
  assert.match(loadEffect, /setAccountState\(\{ status: "loading" \}\)/);
  assert.match(loadEffect, /void listProjects\(\)/);
  assert.match(loadEffect, /void getAccount\(\)/);
  assert.ok((loadEffect.match(/if \(active\)/g) ?? []).length >= 4);
  assert.match(loadEffect, /return \(\) => \{\s*active = false;\s*\}/);
});

test("loading and errors never masquerade as demo projects, and errors can retry", () => {
  const projectSection = sourceSection(
    authenticatedHomeSource,
    '          {projectsState.status === "ready" && projects.length > 0 ? (',
    "        </section>",
  );
  const loadingAt = projectSection.indexOf('projectsState.status === "loading"');
  const errorAt = projectSection.indexOf('projectsState.status === "error"');
  const demoAt = projectSection.indexOf("shouldShowDemoProjects(projectsState)");
  assert.ok(loadingAt >= 0 && errorAt > loadingAt && demoAt > errorAt);
  assert.match(projectSection, /role="alert"/);
  assert.match(projectSection, /onClick=\{\(\) => setReload\(\(value\) => value \+ 1\)\}/);
  assert.match(projectSection.slice(demoAt), /<DemoProjectGallery locale=\{locale\}/);
});

test("the mobile navigation is modal, keyboard-contained and restores focus", () => {
  assert.match(authenticatedHomeSource, /role="dialog"/);
  assert.match(authenticatedHomeSource, /aria-modal="true"/);
  assert.match(authenticatedHomeSource, /onKeyDown=\{trapDialogFocus\}/);
  assert.match(authenticatedHomeSource, /event\.key !== "Tab"/);
  assert.match(authenticatedHomeSource, /event\.shiftKey && document\.activeElement === first/);
  assert.match(authenticatedHomeSource, /document\.activeElement === last/);
  assert.match(authenticatedHomeSource, /mobileMenuButtonRef\.current\?\.focus\(\)/);
});

test("owned and demo cards keep distinct destinations and no fabricated KPI", () => {
  assert.match(authenticatedHomeSource, /to="\/studio\/\$id"/);
  assert.match(gallerySource, /to="\/a\/\$slug"/);
  assert.match(gallerySource, /flagshipFor\(locale\)/);
  assert.match(gallerySource, />\s*18 Demo\s*</);

  const dashboardProductSource = [authenticatedHomeSource, modelSource, copySource].join("\n");
  assert.doesNotMatch(
    dashboardProductSource,
    /\b(?:uptime|revenue|operational|operativo|incassi)\b/i,
  );
  assert.doesNotMatch(dashboardProductSource, /99(?:[.,]9)?%/);
});

test("the dashboard IdeaDesk variant keeps the original submit contract", () => {
  const send = sourceSection(ideaDeskSource, "  function send() {", "  function speak() {");
  assert.match(send, /const prompt = value\.trim\(\)/);
  assert.match(send, /if \(!prompt \|\| busy\) return/);
  assert.match(send, /onSubmit\(\{ prompt, gear, max, buildLevel \}\)/);
  assert.match(ideaDeskSource, /variant\?: "default" \| "dashboard"/);
  assert.match(ideaDeskSource, /onSubmit=\{\(e\) => \{\s*e\.preventDefault\(\);\s*send\(\)/);
  assert.match(authenticatedHomeSource, /variant="dashboard"/);
  assert.match(authenticatedHomeSource, /onSubmit=\{onSubmit\}/);
});
