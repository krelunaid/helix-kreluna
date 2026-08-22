import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { ProjectCard } from "@/components/project-card";
import { Button } from "@/components/ui/button";
import { archivedFor, featuredFor, featuredHtml } from "@/lib/templates";
import { flagshipShowcaseLabels } from "@/lib/flagships";
import type { FlagshipEntry, FlagshipSurface } from "@/lib/flagships";
import { FLAGSHIP_CATEGORY_ORDER } from "@/lib/flagships/catalog";
import { premiumDemosFor } from "@/demos/registry";
import { useI18n } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n-core";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/vetrina")({
  validateSearch: (s: Record<string, unknown>) => ({
    app: typeof s.app === "string" ? s.app : undefined,
  }),
  component: Vetrina,
});

function Vetrina() {
  const { locale, t } = useI18n();
  const featured = featuredFor(locale);
  const archived = archivedFor(locale);
  const labels = flagshipShowcaseLabels(locale);
  const [filter, setFilter] = useState<"all" | FlagshipSurface>("all");
  const sections = [
    {
      surface: "app" as const,
      title: labels.appsTitle,
      lead: labels.appsLead,
      items: featured.filter((item) => item.surface === "app"),
    },
    {
      surface: "site" as const,
      title: labels.sitesTitle,
      lead: labels.sitesLead,
      items: featured.filter((item) => item.surface === "site"),
    },
  ].filter((section) => filter === "all" || section.surface === filter);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl px-5 pb-24 pt-8">
        <p className="text-xs font-medium tracking-[0.2em] text-info uppercase">
          {t("vetrina.kicker")}
        </p>
        <h1 className="mt-3 text-4xl tracking-tight sm:text-5xl">{t("vetrina.title")}</h1>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-2xl text-lg text-muted">{t("vetrina.lead")}</p>
          <p className="shrink-0 font-mono text-xs tracking-[0.16em] text-info uppercase">
            {labels.projectsCount}
          </p>
        </div>

        <PremiumSpotlight locale={locale} />

        <div
          className="mt-8 flex flex-wrap gap-2 border-y border-border py-4"
          role="group"
          aria-label={labels.projectsCount}
        >
          {(
            [
              ["all", labels.all],
              ["app", labels.apps],
              ["site", labels.sites],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className="rounded-full border border-border px-4 py-2 text-sm transition-colors aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-white"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-12 space-y-20">
          {sections.map((section) => (
            <section key={section.surface} aria-labelledby={`${section.surface}-showcase-title`}>
              <div className="grid gap-3 border-b border-border pb-5 md:grid-cols-[minmax(0,1fr)_minmax(260px,420px)] md:items-end">
                <h2
                  id={`${section.surface}-showcase-title`}
                  className="text-3xl tracking-tight sm:text-4xl"
                >
                  {section.title}
                </h2>
                <p className="text-sm leading-relaxed text-muted md:text-right">{section.lead}</p>
              </div>
              <CategoryGroups items={section.items} locale={locale} />
            </section>
          ))}
        </div>

        <details className="mt-16 border-y border-border py-6">
          <summary className="cursor-pointer list-none">
            <span className="text-2xl tracking-tight">{labels.archiveTitle}</span>
            <span className="mt-2 block max-w-2xl text-sm text-muted">{labels.archiveLead}</span>
          </summary>
          <ul className="mt-6 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((item) => (
              <li key={item.id} className="border-t border-border/60 py-3">
                <Link
                  to="/a/$slug"
                  params={{ slug: item.id }}
                  search={{ lang: locale }}
                  className="group flex items-start justify-between gap-3"
                >
                  <span>
                    <span className="block font-medium">{item.title}</span>
                    <span className="mt-1 block text-xs text-muted">{item.kind}</span>
                  </span>
                  <span className="text-xs text-accent group-hover:underline">
                    {labels.archiveOpen}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>

        <div className="mt-16 rounded-2xl bg-elevated px-6 py-10 text-center window-shadow">
          <h2 className="text-3xl tracking-tight">{t("vetrina.ctaTitle")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">{t("vetrina.ctaLead")}</p>
          <Link to="/" className="mt-6 inline-flex">
            <Button size="lg">{t("vetrina.cta")}</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}

function CategoryGroups({
  items,
  locale,
}: {
  items: FlagshipEntry[];
  locale: ReturnType<typeof useI18n>["locale"];
}) {
  const { t } = useI18n();
  const labels = flagshipShowcaseLabels(locale);
  const groups = Array.from(
    items.reduce((byCategory, item) => {
      const current = byCategory.get(item.category) ?? [];
      current.push(item);
      byCategory.set(item.category, current);
      return byCategory;
    }, new Map<FlagshipEntry["category"], FlagshipEntry[]>()),
  ).sort(
    ([left], [right]) =>
      FLAGSHIP_CATEGORY_ORDER.indexOf(left) - FLAGSHIP_CATEGORY_ORDER.indexOf(right),
  );

  return (
    <div className="mt-8 space-y-12">
      {groups.map(([category, categoryItems]) => (
        <div key={category}>
          <div className="mb-5 flex items-center gap-3">
            <h3 className="text-xs font-semibold tracking-[0.18em] text-info uppercase">
              {categoryItems[0]?.categoryLabel}
            </h3>
            <span className="h-px flex-1 bg-border" />
            <span className="font-mono text-[11px] text-subtle">{categoryItems.length}</span>
          </div>
          <div className="grid gap-x-7 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {categoryItems.map((item) => (
              <article key={item.id} className="min-w-0">
                <Link
                  to="/a/$slug"
                  params={{ slug: item.id }}
                  search={{ lang: locale }}
                  onClick={() => track("cta_demo")}
                  className="group block"
                >
                  <ProjectCard
                    title={item.brand}
                    kind={item.kind}
                    meta={item.title}
                    previewTitle={`${item.brand} · ${item.title}`}
                    html={featuredHtml(item.id, locale)}
                  />
                </Link>
                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="text-[11px] tracking-[0.16em] text-info uppercase">
                      {labels.capability}
                    </dt>
                    <dd className="mt-1 text-muted">{item.capability}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] tracking-[0.16em] text-info uppercase">
                      {labels.proof}
                    </dt>
                    <dd className="mt-1 text-muted">{item.proof}</dd>
                  </div>
                </dl>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-subtle hover:text-fg">
                    {labels.prompt}
                  </summary>
                  <p className="mt-2 text-muted">{item.prompt}</p>
                </details>
                <Link
                  to="/a/$slug"
                  params={{ slug: item.id }}
                  search={{ lang: locale }}
                  onClick={() => track("cta_demo")}
                  className="mt-4 inline-flex text-sm font-medium text-accent hover:underline"
                >
                  {t("vetrina.open")}
                </Link>
              </article>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PremiumSpotlight({ locale }: { locale: Locale }) {
  const { t } = useI18n();
  const demos = premiumDemosFor(locale);
  return (
    <section className="mt-12" aria-labelledby="premium-demo-title">
      <div className="mb-5 flex items-center gap-3">
        <h2 id="premium-demo-title" className="text-xs font-semibold tracking-[0.18em] text-info uppercase">
          {demos[0]?.kind}
        </h2>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid gap-x-7 gap-y-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end">
        {demos.map((item) => (
          <article key={item.id} className="min-w-0">
            <Link
              to="/a/$slug"
              params={{ slug: item.id }}
              search={{ lang: locale }}
              onClick={() => track("cta_demo")}
              className="group block"
            >
              <ProjectCard
                title={item.brand}
                kind={item.kind}
                meta={item.title}
                previewTitle={`${item.brand} · ${item.title}`}
                cover={item.photo}
              />
            </Link>
            <p className="mt-4 text-sm text-muted">{item.lead}</p>
            <p className="mt-2 text-sm text-subtle">{item.capability}</p>
            <Link
              to="/a/$slug"
              params={{ slug: item.id }}
              search={{ lang: locale }}
              onClick={() => track("cta_demo")}
              className="mt-4 inline-flex text-sm font-medium text-accent hover:underline"
            >
              {t("vetrina.open")}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
