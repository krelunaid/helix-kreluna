import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { ProjectCard } from "@/components/project-card";
import { Button } from "@/components/ui/button";
import { archivedFor, featuredFor, featuredHtml } from "@/lib/templates";
import { flagshipShowcaseLabels } from "@/lib/flagships";
import { useI18n } from "@/lib/i18n";
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

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl px-5 pb-24 pt-8">
        <p className="text-xs font-medium tracking-[0.2em] text-info uppercase">{t("vetrina.kicker")}</p>
        <h1 className="mt-3 text-4xl tracking-tight sm:text-5xl">{t("vetrina.title")}</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">{t("vetrina.lead")}</p>

        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((item) => (
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
                    {labels.prompt}
                  </dt>
                  <dd className="mt-1 text-muted">{item.prompt}</dd>
                </div>
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

        <details className="mt-16 border-y border-border py-6">
          <summary className="cursor-pointer list-none">
            <span className="text-2xl tracking-tight">{labels.archiveTitle}</span>
            <span className="mt-2 block max-w-2xl text-sm text-muted">
              {labels.archiveLead}
            </span>
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
