import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { PreviewFrame } from "@/components/preview-frame";
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
  const { app } = Route.useSearch();
  const featured = featuredFor(locale);
  const [open, setOpen] = useState(app ?? featured[0]?.id ?? "cafe");
  const current = featured.find((x) => x.id === open) ?? featured[0];
  const html = current ? featuredHtml(current.id, locale) : "";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8">
        <p className="text-xs font-medium tracking-[0.2em] text-info uppercase">{t("vetrina.kicker")}</p>
        <h1 className="mt-3 text-4xl tracking-tight sm:text-5xl">{t("vetrina.title")}</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">{t("vetrina.lead")}</p>

        <div className="mt-8 flex gap-2 overflow-x-auto pb-2">
          {featured.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setOpen(item.id);
                track("cta_demo");
              }}
              className={
                item.id === current?.id
                  ? "h-11 shrink-0 rounded-full bg-accent px-4 text-sm text-accent-fg"
                  : "h-11 shrink-0 rounded-full px-4 text-sm text-muted hairline"
              }
            >
              {item.title}
            </button>
          ))}
        </div>

        {current ? (
          <section className="mt-6">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs text-subtle">
                  {t("vetrina.made")} · {current.kind}
                </p>
                <h2 className="text-2xl tracking-tight">{current.title}</h2>
                <p className="mt-1 max-w-xl text-sm text-muted">{current.prompt}</p>
                <p className="mt-2 text-sm text-fg">
                  <span className="text-subtle">{t("vetrina.fn")}: </span>
                  {current.fn}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`#demo-${current.id}`}
                  className="inline-flex h-10 items-center rounded-full px-4 text-sm hairline"
                >
                  {t("vetrina.open")}
                </a>
                <Link to="/" search={{} as never}>
                  <Button>{t("vetrina.rebuild")}</Button>
                </Link>
              </div>
            </div>
            <div id={`demo-${current.id}`} className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div>
                <p className="mb-2 text-[11px] tracking-[0.16em] text-subtle uppercase">{t("vetrina.desk")}</p>
                <PreviewFrame html={html} className="h-[70vh] min-h-[480px]" label={current.title} deviceLock="desk" />
              </div>
              <div>
                <p className="mb-2 text-[11px] tracking-[0.16em] text-subtle uppercase">{t("vetrina.phone")}</p>
                <PreviewFrame html={html} className="h-[70vh] min-h-[480px]" label={current.title} deviceLock="phone" compact />
              </div>
            </div>
          </section>
        ) : (
          <p className="mt-10 text-muted">{t("vetrina.empty")}</p>
        )}

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
