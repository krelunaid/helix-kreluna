import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { ProjectCard } from "@/components/project-card";
import { Button } from "@/components/ui/button";
import { featuredFor, featuredHtml } from "@/lib/templates";
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

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl px-5 pb-24 pt-8">
        <p className="text-xs font-medium tracking-[0.2em] text-info uppercase">{t("vetrina.kicker")}</p>
        <h1 className="mt-3 text-4xl tracking-tight sm:text-5xl">{t("vetrina.title")}</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">{t("vetrina.lead")}</p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((item) => (
            <Link
              key={item.id}
              to="/a/$slug"
              params={{ slug: item.id }}
              onClick={() => track("cta_demo")}
              className="group block"
            >
              <ProjectCard title={item.title} kind={item.kind} meta={item.fn} cover={item.cover} html={featuredHtml(item.id, locale)} />
              <p className="mt-3 text-sm font-medium text-accent group-hover:underline">{t("vetrina.open")}</p>
            </Link>
          ))}
        </div>

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
