import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createServer } from "vite";

const ROOT = join(import.meta.dirname, "..");

test("home first paint is session-aware and never cached as public HTML", async () => {
  const [homeSource, homeSessionSource, pendingSource, netlifySource] = await Promise.all([
    readFile(join(ROOT, "src/routes/index.tsx"), "utf8"),
    readFile(join(ROOT, "src/lib/auth/home-session.ts"), "utf8"),
    readFile(join(ROOT, "src/components/authenticated-home.tsx"), "utf8"),
    readFile(join(ROOT, "netlify.toml"), "utf8"),
  ]);

  assert.match(homeSource, /loader:\s*\(\)\s*=>\s*getHomeSession\(\)/);
  assert.match(homeSource, /headers:\s*\(\)\s*=>\s*HOME_DOCUMENT_HEADERS/);
  assert.match(homeSource, /pendingMs:\s*0/);
  assert.match(homeSource, /pendingComponent:\s*AuthenticatedHomePending/);
  assert.match(homeSource, /const loaderUser = Route\.useLoaderData\(\)/);
  assert.match(homeSource, /const homeUser = resolveHomeUser\(user, loaderUser\)/);
  assert.match(homeSource, /if \(homeUser\) \{/);
  assert.match(homeSource, /return <HomeSignIn prompt=\{routePrompt\} \/>/);
  assert.doesNotMatch(homeSource, /t\("mkt\.title"\)/);
  assert.doesNotMatch(homeSource, /id="esempi"/);
  assert.doesNotMatch(homeSource, /from "@\/components\/public-landing"/);
  assert.doesNotMatch(homeSource, /from "@\/components\/idea-desk"/);
  assert.doesNotMatch(homeSource, /if \(user\) \{\s*return \(\s*<AuthenticatedHome/);

  assert.match(homeSessionSource, /export const getHomeSession = createServerFn\(\{ method: "GET" \}\)/);
  assert.match(homeSessionSource, /auth\.api\.getSession\(\{ headers: request\.headers \}\)/);
  assert.match(homeSessionSource, /mapHomeSessionUser/);

  assert.match(pendingSource, /export function AuthenticatedHomePending/);
  assert.match(pendingSource, /dashboard-home-shell/);
  assert.match(pendingSource, /copy\.loading/);

  assert.match(
    netlifySource,
    /for = "\/"\s*\n\s*\[headers\.values\]\s*\n\s*Cache-Control = "private, no-store, max-age=0"/,
  );
});

test("home surface prefers the cookie loader over a still-empty client session", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());

  const surface = await vite.ssrLoadModule("/src/lib/home-surface.ts");
  const andrea = {
    id: "andrea",
    displayName: "Andrea",
    primaryEmail: "andrea@example.com",
    profileImageUrl: null,
    isDevFallback: false,
  };

  assert.deepEqual(surface.mapHomeSessionUser(null), null);
  assert.deepEqual(surface.mapHomeSessionUser({}), null);
  assert.deepEqual(
    surface.mapHomeSessionUser({
      id: "andrea",
      name: "Andrea Gadducci",
      email: "andrea@example.com",
      image: null,
    }),
    {
      id: "andrea",
      displayName: "Andrea Gadducci",
      primaryEmail: "andrea@example.com",
      profileImageUrl: null,
      isDevFallback: false,
    },
  );

  assert.equal(surface.resolveHomeSurface(null, null), "guest");
  assert.equal(surface.resolveHomeSurface(null, andrea), "authenticated");
  assert.equal(surface.resolveHomeSurface(andrea, null), "authenticated");
  assert.deepEqual(surface.resolveHomeUser(null, andrea), andrea);
  assert.deepEqual(surface.resolveHomeUser(andrea, null), andrea);
  assert.equal(surface.HOME_DOCUMENT_HEADERS["Cache-Control"], "private, no-store, max-age=0");
  assert.equal(surface.HOME_DOCUMENT_HEADERS.Vary, "Cookie");
});

test("Italian is the default locale for first paint", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const i18n = await vite.ssrLoadModule("/src/lib/i18n-core.ts");
  assert.equal(i18n.DEFAULT_LOCALE, "it");
  assert.equal(i18n.normalizeLocale(null), "it");
  assert.equal(i18n.detectLocale(), "it");
  assert.equal(i18n.t("it", "login.signin"), "Accedi");
});
