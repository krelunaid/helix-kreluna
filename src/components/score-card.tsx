import {
  SCORE_METRIC_IDS,
  getCapacityForecast,
  getReadinessEvidence,
  getScoreMetric,
  type CouncilSignal,
  type KrelunaScore,
  type ScoreMetric,
  type ScoreMetricId,
} from "@/lib/score";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function evidenceLabel(
  metric: ScoreMetric,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (metric.status === "failed") return t("score.failed");
  if (metric.status === "not_applicable") return t("score.notApplicable");
  if (metric.status !== "completed" || metric.value === null) {
    return t("score.notRun");
  }
  return metric.evidence === "measured"
    ? t("score.measured")
    : t("score.estimated");
}

function MetricBar({
  label,
  metric,
}: {
  label: string;
  metric: ScoreMetric;
}) {
  const { t } = useI18n();
  const available = metric.status === "completed" && metric.value !== null;
  return (
    <div className="rounded-xl border border-border/70 p-3">
      <div className="flex items-start justify-between gap-3 text-xs">
        <span className="text-muted">{label}</span>
        <span className="text-right tabular-nums text-fg">
          {available ? metric.value : "—"} · {evidenceLabel(metric, t)}
        </span>
      </div>
      {available ? (
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={metric.value ?? undefined}
        >
          <div
            className={cn(
              "h-full rounded-full",
              (metric.value ?? 0) >= 85
                ? "bg-fg"
                : (metric.value ?? 0) >= 70
                  ? "bg-accent"
                  : "bg-danger",
            )}
            style={{ width: `${metric.value}%` }}
          />
        </div>
      ) : null}
      <p className="mt-2 text-[10px] leading-relaxed text-subtle">
        {metric.source} · {t("score.confidence", { n: Math.round(metric.confidence * 100) })}
      </p>
    </div>
  );
}

function metricLabel(
  id: ScoreMetricId,
  t: ReturnType<typeof useI18n>["t"],
) {
  const labels = {
    security: t("score.sec"),
    performance: t("score.perf"),
    scalability: t("score.scale"),
    accessibility: t("score.access"),
    reliability: t("score.rel"),
    quality: t("score.qual"),
    cost: t("score.costMetric"),
    coverage: t("score.cov"),
  } satisfies Record<ScoreMetricId, string>;
  return labels[id];
}

function legacyCouncilSignals(score: KrelunaScore): CouncilSignal[] {
  const current = score.council?.signals;
  if (current) return current;
  const legacy = (
    score.council as unknown as {
      votes?: Array<{ seat: string; score: number }>;
    }
  )?.votes;
  return (legacy ?? []).map((entry) => ({
    ...entry,
    evidence: "estimated",
    confidence: 0.1,
    source: "Legacy formula without evidence metadata",
  }));
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
  const readiness = getReadinessEvidence(score);
  const capacity = getCapacityForecast(score);
  const metrics = SCORE_METRIC_IDS.map((id) => getScoreMetric(score, id));
  const measured = metrics.filter(
    (entry) => entry.status === "completed" && entry.evidence === "measured",
  );
  const estimated = metrics.filter(
    (entry) => entry.status === "completed" && entry.evidence === "estimated",
  );
  const unavailable = metrics.filter(
    (entry) => entry.status !== "completed" || entry.value === null,
  );
  const signals = legacyCouncilSignals(score);

  const group = (title: string, entries: ScoreMetric[]) =>
    entries.length ? (
      <section className="mt-5">
        <p className="text-[10px] tracking-[0.16em] text-subtle uppercase">
          {title}
        </p>
        <div
          className={cn(
            "mt-2 grid gap-3",
            compact ? "grid-cols-1" : "sm:grid-cols-2",
          )}
        >
          {entries.map((entry) => (
            <MetricBar
              key={entry.id}
              label={metricLabel(entry.id, t)}
              metric={entry}
            />
          ))}
        </div>
      </section>
    ) : null;

  return (
    <div className="rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]">
      <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">
        {t("score.kicker")}
      </p>
      <div className="mt-2 flex items-end justify-between gap-4">
        <p className="font-display text-5xl tracking-tight">{score.readiness}</p>
        <p className="pb-1 text-right text-sm text-muted">
          {t("score.cost", { n: score.costEur })}
        </p>
      </div>
      <p className="mt-1 text-xs text-subtle">
        {t("score.estimatedAggregate")} · {t("score.confidence", {
          n: Math.round(readiness.confidence * 100),
        })}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        {t("score.evidenceSplit", {
          measured: readiness.measuredWeight,
          estimated: readiness.estimatedWeight,
          notRun: readiness.notRunWeight,
        })}
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-subtle">
        {readiness.disclaimer}
      </p>

      {group(t("score.measuredEvidence"), measured)}
      {group(t("score.estimatedEvidence"), estimated)}
      {group(t("score.unavailableEvidence"), unavailable)}

      <section className="mt-5 rounded-xl border border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] tracking-[0.16em] text-subtle uppercase">
            {t("score.capacity")}
          </p>
          <span className="text-xs text-danger">{t("score.notRun")}</span>
        </div>
        <p className="mt-2 text-sm text-muted">{capacity.verdict}</p>
        {capacity.status === "not_run" && capacity.missingEvidence.length ? (
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-subtle">
            {capacity.missingEvidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mt-5">
        <p className="text-[10px] tracking-[0.16em] text-subtle uppercase">
          {t("score.council")}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {t("score.councilFormula")} · {t("score.confidence", {
            n: Math.round((score.council?.confidence ?? 0.1) * 100),
          })}
        </p>
        <p className="mt-2 text-sm text-fg">{score.council?.pick}</p>
        <p className="mt-1 text-xs text-muted">{score.council?.why}</p>
        {signals.length ? (
          <ul className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
            {signals.map((entry) => (
              <li key={entry.seat} className="rounded-full px-2 py-1 hairline">
                {entry.seat} {entry.score ?? "—"} · {entry.evidence}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {score.critical.length ? (
        <section className="mt-5">
          <p className="text-[11px] tracking-wide text-accent uppercase">
            {t("score.blockers")}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {score.critical.map((item) => (
              <li key={item} className="text-sm text-fg">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="mt-5 text-sm text-muted">{t("score.clear")}</p>
      )}

      {score.watch.length ? (
        <section className="mt-4">
          <p className="text-[10px] tracking-wide text-subtle uppercase">
            {t("score.watch")}
          </p>
          <ul className="mt-1 space-y-1 text-xs text-muted">
            {score.watch.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {score.improvements.length ? (
        <section className="mt-4">
          <p className="text-[11px] tracking-wide text-subtle uppercase">
            {t("score.mend")}
          </p>
          <ul className="mt-2 space-y-2">
            {score.improvements.map((improvement) => (
              <li
                key={improvement.id}
                className="flex items-start justify-between gap-2 text-sm"
              >
                <span className="text-muted">
                  {improvement.metric} {improvement.from}→{improvement.to} · {t("score.estimated")}. {improvement.action}
                </span>
                {onImprove ? (
                  <button
                    type="button"
                    className="shrink-0 text-accent underline-offset-2 hover:underline"
                    onClick={() => onImprove(improvement.id)}
                  >
                    {t("score.requestChange")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
