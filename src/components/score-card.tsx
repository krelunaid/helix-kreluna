import type { KrelunaScore } from "@/lib/score";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-fg">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-elevated">
        <div
          className={cn("h-full rounded-full", value >= 85 ? "bg-fg" : value >= 70 ? "bg-accent" : "bg-danger")}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function ScoreCard({
  score,
  compact,
  onImprove,
}: {
  score: KrelunaScore;
  compact?: boolean;
  onImprove?: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]">
      <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">{t("score.kicker")}</p>
      <div className="mt-2 flex items-end justify-between gap-4">
        <p className="font-display text-5xl tracking-tight">{score.readiness}</p>
        <p className="pb-1 text-right text-sm text-muted">{t("score.cost", { n: score.costEur })}</p>
      </div>
      <p className="mt-1 text-xs text-subtle">
        {score.readiness >= 90 ? t("score.prod") : t("score.ready")}
      </p>
      <div className={cn("mt-5 grid gap-3", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        <Bar label={t("score.sec")} value={score.security} />
        <Bar label={t("score.perf")} value={score.performance} />
        <Bar label={t("score.scale")} value={score.scalability} />
        <Bar label={t("score.rel")} value={score.reliability} />
        <Bar label={t("score.qual")} value={score.quality} />
        <Bar label={t("score.cov")} value={score.coverage} />
      </div>
      <p className="mt-5 text-sm leading-relaxed">
        <span className="font-display italic text-accent-soft">Augur · 6 mesi. </span>
        {score.horizon.verdict}
      </p>
      {score.horizon.risks.length ? (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {score.horizon.risks.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      {score.council.votes.length ? (
        <ul className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
          {score.council.votes.map((v) => (
            <li key={v.seat} className="rounded-full px-2 py-1 hairline">
              {v.seat} {v.score}
            </li>
          ))}
        </ul>
      ) : null}
      {score.critical.length ? (
        <ul className="mt-5 space-y-1.5">
          <p className="text-[11px] tracking-wide text-accent uppercase">{t("score.blockers")}</p>
          {score.critical.map((c) => (
            <li key={c} className="text-sm text-fg">
              {c}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-sm text-muted">{t("score.clear")}</p>
      )}
      {score.improvements.length ? (
        <ul className="mt-4 space-y-2">
          <p className="text-[11px] tracking-wide text-subtle uppercase">{t("score.mend")}</p>
          {score.improvements.map((im) => (
            <li key={im.id} className="flex items-start justify-between gap-2 text-sm">
              <span className="text-muted">
                {im.metric} {im.from}→{im.to}. {im.action}
              </span>
              {onImprove ? (
                <button type="button" className="shrink-0 text-accent underline-offset-2 hover:underline" onClick={() => onImprove(im.id)}>
                  {t("score.approve")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
