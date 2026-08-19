import type { GemRun } from "@/lib/gems";
import { GEMS } from "@/lib/gems";
import { useI18n } from "@/lib/i18n";

export function GemRail({ runs }: { runs?: GemRun[] }) {
  const { t, locale } = useI18n();
  const done = new Map((runs ?? []).map((g) => [g.id, g]));
  return (
    <div>
      <p className="text-[11px] tracking-[0.2em] text-subtle uppercase">{t("gem.kicker")}</p>
      <p className="mt-1 text-sm text-muted">{t("gem.lead")}</p>
      <ul className="mt-3 space-y-2">
        {GEMS.map((g) => {
          const run = done.get(g.id);
          return (
            <li key={g.id} className="rounded-lg bg-elevated px-3 py-2 hairline">
              <p className="font-display italic text-accent-soft">
                {g.name}
                <span className="ml-2 font-sans text-[11px] not-italic tracking-wide text-subtle uppercase">
                  {locale === "it" ? g.craftIt : g.craft}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted">{run?.did === "held" ? t("gem.held") : run ? t("gem.did") : locale === "it" ? g.briefIt : g.brief}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
