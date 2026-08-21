import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Building2, LayoutDashboard, Monitor, Smartphone, Store } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { HelixOrb } from "@/components/helix-orb";
import { HelixMark } from "@/components/kreluna-mark";
import { ProjectCard } from "@/components/project-card";
import { Button } from "@/components/ui/button";
import { authClient, authEnabled, previewPasswordSignInEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  buildLoginSearch,
  decideBuildEntry,
  preservePendingBuildPrompt,
  takePendingBuildPrompt,
} from "@/lib/build-entry";
import { PLANS } from "@/lib/plans";
import { createProject, listProjects, type Project } from "@/lib/server/vetra";
import { IdeaDesk } from "@/components/idea-desk";
import { HouseRoster } from "@/components/house-roster";
import { startGuestBuild } from "@/lib/server/agents";
import { saveGuestBuildAccess } from "@/lib/guest-build-access";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { featuredHtml } from "@/lib/templates";
import { flagshipShowcaseLabels, homeFlagshipsFor } from "@/lib/flagships";
import type { BuildLevel } from "@/lib/build-level";

type HomeSearch = { prompt?: string };

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    prompt:
      typeof search.prompt === "string"
        ? search.prompt.trim().slice(0, 2_000) || undefined
        : undefined,
  }),
  component: Home,
});

const SUGGEST = [
  {
    id: "site",
    icon: Store,
    prompt: "Voglio un sito per la mia attività locale, con menu, prenotazioni e contatti.",
  },
  {
    id: "app",
    icon: Smartphone,
    prompt:
      "Voglio un’app mobile: tab in basso, elenco, dettaglio e profilo. Non è un sito e non è un e-commerce.",
  },
  {
    id: "soft",
    icon: LayoutDashboard,
    prompt:
      "Voglio un software gestionale: clienti, fatture, articoli, ricerca e nuovi record. È un programma di lavoro, non un sito.",
  },
  {
    id: "desk",
    icon: Monitor,
    prompt:
      "Voglio un programma per computer (Windows e Mac): finestra, menu laterale, tabelle, scorciatoie. Software da installare.",
  },
  {
    id: "shop",
    icon: Building2,
    prompt: "Voglio un e-commerce con catalogo, carrello e checkout di prova.",
  },
] as const;

function Home() {
  const { user, isPending } = useCurrentUserState();
  const { prompt: routePrompt } = Route.useSearch();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState(routePrompt ?? "");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Project[]>([]);
  const [filter, setFilter] = useState<"all" | "apps" | "live">("all");
  const featured = homeFlagshipsFor(locale);
  const showcaseLabels = flagshipShowcaseLabels(locale);

  useEffect(() => {
    track("home_view");
  }, []);

  useEffect(() => {
    if (isPending || typeof window === "undefined") return;
    try {
      const resumedPrompt = takePendingBuildPrompt(window.sessionStorage, routePrompt);
      if (resumedPrompt) setPrompt(resumedPrompt);
    } catch {
      if (routePrompt) setPrompt(routePrompt);
    }
  }, [isPending, routePrompt]);

  useEffect(() => {
    if (!user?.id) {
      setMine([]);
      return;
    }
    void listProjects()
      .then(setMine)
      .catch(() => setMine([]));
  }, [user?.id]);

  async function build(
    text = prompt,
    gear: "auto" | "house" | "fast" = "auto",
    max = false,
    buildLevel: BuildLevel = "prototype",
  ) {
    const value = text.trim();
    if (!value) return;
    let entry = decideBuildEntry({
      authEnabled,
      previewPasswordSignInEnabled,
      isPending,
      userPresent: Boolean(user),
    });
    if (entry === "wait_for_session") {
      setBusy(true);
      setPrompt(value);
      const resolved = await authClient.getSession().catch(() => null);
      entry = decideBuildEntry({
        authEnabled,
        previewPasswordSignInEnabled,
        isPending: false,
        userPresent: Boolean(resolved?.data?.user),
      });
    }
    if (entry === "login") {
      if (typeof window !== "undefined") {
        try {
          preservePendingBuildPrompt(window.sessionStorage, value);
        } catch {
          // The login URL still carries the prompt when storage is unavailable.
        }
      }
      void navigate({
        to: "/login",
        search: buildLoginSearch(value),
      });
      setBusy(false);
      return;
    }
    setBusy(true);
    track("first_prompt");
    toast.message(t("think.started"));
    try {
      if (entry === "authenticated") {
        const { id } = await createProject({
          data: {
            prompt: value,
            locale,
            gear,
            max,
            buildLevel,
            requestId: crypto.randomUUID(),
          },
        });
        track("project_created");
        void navigate({ to: "/studio/$id", params: { id } });
      } else {
        const { jobId, guestAccessToken, expiresAt } = await startGuestBuild({
          data: { prompt: value, locale, mode: "generate", buildLevel, gear, max },
        });
        saveGuestBuildAccess(jobId, guestAccessToken, expiresAt);
        void navigate({ to: "/try", search: { job: jobId } });
      }
    } catch (err) {
      track("generate_error");
      toast.error(err instanceof Error ? err.message : t("err.build"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section id="crea" className="relative">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 pb-16 pt-10 lg:grid-cols-2 lg:gap-12 lg:pt-16">
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-[0.22em] text-info uppercase">
                {t("mkt.kicker")}
              </p>
              <p className="mt-3 text-sm text-accent-soft">{t("mkt.identity")}</p>
              <h1 className="mt-4 text-4xl leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                {user ? t("hero.title1") : t("mkt.title")}
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted">{t("mkt.lead")}</p>

              <div className="mt-8">
                <IdeaDesk
                  value={prompt}
                  onChange={setPrompt}
                  busy={busy}
                  example={t("mkt.example")}
                  authenticated={Boolean(user)}
                  onSubmit={({ prompt: p, gear, max, buildLevel }) =>
                    void build(p, gear, max, buildLevel)
                  }
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  {SUGGEST.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setPrompt(s.prompt);
                        track("kind_select", { kind: s.id });
                      }}
                      className="inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm text-muted hairline hover:text-fg"
                    >
                      <s.icon className="size-4 text-info" />
                      {t(`mkt.chip.${s.id}` as "mkt.chip.site")}
                    </button>
                  ))}
                </div>
                {mine.length ? (
                  <div className="mt-6">
                    <div className="flex gap-2">
                      {(["all", "apps", "live"] as const).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setFilter(id)}
                          className={
                            filter === id
                              ? "h-9 rounded-full bg-accent px-3 text-xs text-accent-fg"
                              : "h-9 rounded-full px-3 text-xs hairline text-muted"
                          }
                        >
                          {t(`filter.${id}` as "filter.all")}
                          {id === "all" ? ` (${mine.length})` : ""}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                      {(filter === "live"
                        ? mine.filter((p) => p.hosted)
                        : filter === "apps"
                          ? mine.filter((p) => p.kind !== "site")
                          : mine
                      )
                        .slice(0, 8)
                        .map((p) => (
                          <Link
                            key={p.id}
                            to="/studio/$id"
                            params={{ id: p.id }}
                            className="h-10 shrink-0 rounded-full px-3 text-sm hairline"
                          >
                            {p.title}
                          </Link>
                        ))}
                    </div>
                  </div>
                ) : null}
                <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-subtle">
                  <li>{t("mkt.fact1")}</li>
                  <li>{t("mkt.fact2")}</li>
                  <li>{t("mkt.fact3")}</li>
                </ul>
              </div>
            </div>
            <div className="flex min-w-0 justify-center overflow-hidden">
              <HelixOrb />
            </div>
          </div>
        </section>

        <section id="crea-tipo" className="band-light">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="text-4xl tracking-tight sm:text-5xl">{t("mkt.poss.title")}</h2>
            <p className="mt-4 max-w-2xl text-lg text-muted">{t("mkt.poss.lead")}</p>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {(["web", "app", "soft", "desk"] as const).map((id) => (
                <article key={id} className="rounded-2xl bg-white p-6">
                  <h3 className="text-xl font-semibold">{t(`mkt.poss.${id}.title`)}</h3>
                  <p className="mt-3 text-base text-muted">{t(`mkt.poss.${id}.body`)}</p>
                  <p className="mt-3 text-sm">{t(`mkt.poss.${id}.ex`)}</p>
                  <button
                    type="button"
                    className="mt-5 text-sm font-medium text-accent"
                    onClick={() => {
                      const s =
                        SUGGEST[id === "web" ? 0 : id === "app" ? 1 : id === "soft" ? 2 : 3];
                      setPrompt(s.prompt);
                      document.getElementById("idea")?.focus();
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    {t("mkt.poss.see")}
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="come" className="border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="text-4xl tracking-tight sm:text-5xl">{t("mkt.how.title")}</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <li key={i}>
                  <p className="text-info">{String(i).padStart(2, "0")}</p>
                  <h3 className="mt-2 text-lg font-medium">
                    {t(`mkt.how.${i}.t` as "mkt.how.1.t")}
                  </h3>
                  <p className="mt-2 text-sm text-muted">{t(`mkt.how.${i}.b` as "mkt.how.1.b")}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <HouseRoster />

        <section id="esempi" className="band-light">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-4xl tracking-tight">{t("mkt.demo.title")}</h2>
                <p className="mt-3 max-w-2xl text-muted">{t("mkt.demo.lead")}</p>
              </div>
              <Link
                to="/vetrina"
                search={{ app: undefined }}
                className="shrink-0 text-sm font-medium text-accent hover:underline"
              >
                {t("nav.examples")} · {showcaseLabels.projectsCount}
              </Link>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {featured.map((item) => (
                <article key={item.id} className="overflow-hidden rounded-2xl bg-white">
                  <Link
                    to="/a/$slug"
                    params={{ slug: item.id }}
                    search={{ lang: locale }}
                    className="block"
                  >
                    <ProjectCard
                      title={item.brand}
                      kind={item.kind}
                      meta={item.title}
                      previewTitle={`${item.brand} · ${item.title}`}
                      html={featuredHtml(item.id, locale)}
                    />
                  </Link>
                  <div className="px-5 pb-5">
                    <p className="text-sm text-muted">{item.capability}</p>
                    <Link
                      to="/a/$slug"
                      params={{ slug: item.id }}
                      search={{ lang: locale }}
                      className="mt-3 inline-block text-sm font-medium text-accent"
                    >
                      {t("vetrina.open")}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="text-4xl tracking-tight">{t("mkt.diff.title")}</h2>
            <p className="mt-4 max-w-2xl text-lg text-muted">{t("mkt.diff.lead")}</p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-5">
              {["design", "ui", "dev", "qa", "ship"].map((id) => (
                <li key={id} className="rounded-xl bg-elevated p-4 hairline">
                  <p className="font-medium">{t(`mkt.diff.${id}` as "mkt.diff.design")}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="band-light">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="text-4xl tracking-tight">{t("mkt.ctrl.title")}</h2>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {["see", "edit", "credits", "stop", "fix", "list"].map((id) => (
                <li key={id} className="rounded-xl bg-white px-5 py-4">
                  {t(`mkt.ctrl.${id}` as "mkt.ctrl.see")}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="prezzi" className="border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="text-4xl tracking-tight">{t("plans.title")}</h2>
            <p className="mt-3 max-w-xl text-muted">{t("mkt.price.lead")}</p>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PLANS.map((p) => (
                <div
                  key={p.id}
                  className={
                    p.highlight
                      ? "rounded-xl bg-elevated p-6 window-shadow"
                      : "rounded-xl bg-surface p-6 hairline"
                  }
                >
                  <p className="text-sm text-muted">{p.name}</p>
                  <p className="mt-3 text-4xl tracking-tight">
                    {p.price === 0 ? "0" : `${p.currency}${p.price}`}
                    <span className="ml-1 text-sm text-subtle">{t("plans.month")}</span>
                  </p>
                  <p className="mt-2 font-mono text-sm text-accent-soft">
                    {t("plans.credits", { n: p.credits })}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-subtle">{t("mkt.price.tax")}</p>
            <Link
              to="/pricing"
              className="mt-4 inline-flex items-center gap-2 text-sm text-accent-soft"
            >
              {t("plans.more")} <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

        <section id="fiducia" className="band-light">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="text-4xl tracking-tight">{t("mkt.trust.title")}</h2>
            <dl className="mt-10 grid gap-6 md:grid-cols-2">
              {["own", "export", "data", "credits", "pub", "fail"].map((id) => (
                <div key={id}>
                  <dt className="font-medium">{t(`mkt.trust.${id}.q` as "mkt.trust.own.q")}</dt>
                  <dd className="mt-2 text-muted">{t(`mkt.trust.${id}.a` as "mkt.trust.own.a")}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="faq" className="border-t border-border">
          <div className="mx-auto max-w-3xl px-5 py-20">
            <h2 className="text-4xl tracking-tight">{t("mkt.faq.title")}</h2>
            <div className="mt-8 space-y-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <details key={i} className="rounded-xl bg-elevated px-5 py-4 hairline">
                  <summary className="cursor-pointer font-medium">
                    {t(`mkt.faq.${i}.q` as "mkt.faq.1.q")}
                  </summary>
                  <p className="mt-3 text-sm text-muted">{t(`mkt.faq.${i}.a` as "mkt.faq.1.a")}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-3xl px-5 py-24 text-center">
            <h2 className="text-4xl tracking-tight sm:text-5xl">{t("mkt.close.title")}</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted">{t("mkt.close.lead")}</p>
            <a href="#crea" className="mt-8 inline-flex">
              <Button size="lg" className="h-12" onClick={() => track("cta_create_free")}>
                {t("mkt.close.cta")}
              </Button>
            </a>
            <p className="mt-6 text-sm text-subtle">Helix by Kreluna · {t("mkt.identity")}</p>
          </div>
        </section>

        {mine.length > 0 ? (
          <section className="border-t border-border">
            <div className="mx-auto max-w-6xl px-5 py-16">
              <h2 className="text-3xl tracking-tight">{t("projects.yours")}</h2>
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {mine.slice(0, 6).map((p) => (
                  <Link key={p.id} to="/studio/$id" params={{ id: p.id }} className="block">
                    <ProjectCard
                      title={p.title}
                      kind={p.hosted ? t("projects.online") : t("projects.yoursBadge")}
                      meta={p.prompt}
                      html={p.html}
                    />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <HelixMark className="size-14 shrink-0" />
            <div>
              <p className="text-lg font-semibold">Helix</p>
              <p className="text-xs text-subtle">by Kreluna</p>
            </div>
          </div>
          <p className="text-sm text-subtle">{t("footer.note")}</p>
        </div>
      </footer>
    </div>
  );
}
