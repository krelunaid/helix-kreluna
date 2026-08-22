import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { ProjectCard } from "@/components/project-card";
import {
  FLAGSHIP_CATEGORY_ORDER,
  buildFlagshipHtml,
  flagshipFor,
  type FlagshipEntry,
  type FlagshipSurface,
} from "@/lib/flagships/catalog";
import type { Locale } from "@/lib/i18n-core";

export type DemoProjectGalleryProps = {
  locale: Locale;
  copy: {
    title: string;
    lead: string;
    apps: string;
    sites: string;
    open: string;
    all: string;
  };
};

export function DemoProjectGallery({ locale, copy }: DemoProjectGalleryProps) {
  const projects = flagshipFor(locale);
  const sections = [
    {
      surface: "app" as const,
      title: copy.apps,
      items: projects.filter((project) => project.surface === "app"),
    },
    {
      surface: "site" as const,
      title: copy.sites,
      items: projects.filter((project) => project.surface === "site"),
    },
  ];

  return (
    <section aria-labelledby="demo-project-gallery-title">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 id="demo-project-gallery-title" className="text-2xl tracking-tight sm:text-3xl">
              {copy.title}
            </h2>
            <span className="rounded-full border border-accent/50 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.15em] text-accent-soft uppercase">
              18 Demo
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{copy.lead}</p>
        </div>
        <Link
          to="/vetrina"
          search={{ app: undefined }}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-accent-soft hover:text-fg"
        >
          {copy.all}
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-8 space-y-12">
        {sections.map((section) => (
          <DemoSurfaceSection
            key={section.surface}
            locale={locale}
            surface={section.surface}
            title={section.title}
            items={section.items}
            open={copy.open}
          />
        ))}
      </div>
    </section>
  );
}

function DemoSurfaceSection({
  locale,
  surface,
  title,
  items,
  open,
}: {
  locale: Locale;
  surface: FlagshipSurface;
  title: string;
  items: FlagshipEntry[];
  open: string;
}) {
  const groups = groupByCategory(items);

  return (
    <section aria-labelledby={`demo-${surface}-title`}>
      <div className="flex items-center gap-3">
        <h3 id={`demo-${surface}-title`} className="text-xl tracking-tight sm:text-2xl">
          {title}
        </h3>
        <span className="rounded-full bg-elevated px-2.5 py-1 font-mono text-[11px] text-subtle hairline">
          {items.length}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="mt-6 space-y-8">
        {groups.map(([category, categoryItems]) => (
          <div key={category}>
            <div className="mb-4 flex items-center gap-2">
              <h4 className="text-[11px] font-semibold tracking-[0.16em] text-info uppercase">
                {categoryItems[0]?.categoryLabel}
              </h4>
              <span className="text-[10px] text-subtle">· {categoryItems.length}</span>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {categoryItems.map((item) => (
                <li key={item.id} className="min-w-0">
                  <Link
                    to="/a/$slug"
                    params={{ slug: item.id }}
                    search={{ lang: locale }}
                    aria-label={`${open}: ${item.brand} — ${item.title}`}
                    className="group relative block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                  >
                    <ProjectCard
                      title={item.brand}
                      kind={item.kind}
                      meta={item.title}
                      previewTitle={`${item.brand} · ${item.title}`}
                      html={buildFlagshipHtml(item.id, locale)}
                      className="h-full group-hover:border-accent/60"
                    />
                    <span className="absolute right-3 top-3 rounded-full border border-accent/50 bg-bg/90 px-2.5 py-1 text-[10px] font-semibold tracking-[0.13em] text-accent-soft uppercase backdrop-blur-sm">
                      Demo
                    </span>
                    <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-bg/85 px-2.5 py-1 text-[11px] font-medium text-fg opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      {open}
                      <ArrowUpRight className="size-3" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function groupByCategory(items: FlagshipEntry[]) {
  return Array.from(
    items.reduce((groups, item) => {
      const group = groups.get(item.category) ?? [];
      group.push(item);
      groups.set(item.category, group);
      return groups;
    }, new Map<FlagshipEntry["category"], FlagshipEntry[]>()),
  ).sort(
    ([left], [right]) =>
      FLAGSHIP_CATEGORY_ORDER.indexOf(left) - FLAGSHIP_CATEGORY_ORDER.indexOf(right),
  );
}
