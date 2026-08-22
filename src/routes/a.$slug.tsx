import { lazy, Suspense } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getPublicApp } from "@/lib/server/deploy";
import { GENERATED_APP_SANDBOX } from "@/lib/generated-content-policy";
import { isPremiumDemoId, PREMIUM_LAZY, premiumDemoTitle } from "@/demos/registry";
import { normalizeLocale, type Locale } from "@/lib/i18n-core";

const VelvetTableApp = lazy(() => import("@/demos/velvet-table/app"));

type PublicAppSearch = { access?: string; lang?: Locale };

export const Route = createFileRoute("/a/$slug")({
  validateSearch: (search: Record<string, unknown>): PublicAppSearch => ({
    access:
      typeof search.access === "string" && search.access.length <= 128
        ? search.access
        : undefined,
    lang: typeof search.lang === "string" ? normalizeLocale(search.lang) : undefined,
  }),
  loaderDeps: ({ search }) => ({ access: search.access, lang: search.lang }),
  loader: async ({ params, deps }) => {
    if (isPremiumDemoId(params.slug)) {
      return {
        kind: "premium" as const,
        slug: params.slug,
        title: premiumDemoTitle(params.slug, deps.lang ?? "it"),
        isGuest: false,
      };
    }
    const app = await getPublicApp({
      data: { slug: params.slug, accessToken: deps.access, locale: deps.lang },
    });
    return { kind: "public" as const, app, isGuest: Boolean(app?.isGuest), title: app?.title ?? "Helix" };
  },
  component: PublicApp,
  headers: ({ loaderData }) => ({
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    ...(loaderData?.isGuest
      ? { "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet" }
      : {}),
  }),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.title ?? "Helix" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "theme-color", content: loaderData?.kind === "premium" ? "#0D090A" : "#0a0a0b" },
      {
        name: "robots",
        content: loaderData?.isGuest
          ? "noindex, nofollow, noarchive, nosnippet"
          : "index, follow",
      },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
});

function PublicApp() {
  const data = Route.useLoaderData();

  if (data.kind === "premium") {
    const Demo = data.slug === "velvet-table" ? VelvetTableApp : PREMIUM_LAZY[data.slug];
    return (
      <Suspense
        fallback={
          <div className="grid min-h-[100dvh] place-items-center bg-[#0D090A] text-[#F4E7DA]">
            {data.title}
          </div>
        }
      >
        <Demo />
      </Suspense>
    );
  }

  const app = data.app;

  if (!app) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#07080c] text-sm text-[#9bb0b8]">
        This app is offline.
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] bg-[#07080c]">
      <iframe
        title={app.title}
        srcDoc={app.html}
        sandbox={GENERATED_APP_SANDBOX}
        referrerPolicy="no-referrer"
        allow=""
        className="h-full w-full border-0"
      />
      <Link
        to="/vetrina"
        search={{ app: undefined }}
        className="absolute bottom-3 right-3 z-10 rounded-full bg-black/70 px-3 py-1.5 text-[11px] tracking-[0.14em] text-white/80 uppercase backdrop-blur-sm hover:text-white"
      >
        Helix
      </Link>
    </div>
  );
}
