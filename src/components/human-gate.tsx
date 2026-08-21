import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import type { BuildQualityEvidence } from "@/lib/server/quality/types";

export function HumanGate({
  onApprove,
  onModify,
  onReject,
  onCouncil,
  quality,
  busy = false,
}: {
  onApprove: () => void;
  onModify: () => void;
  onReject: () => void;
  onCouncil: () => void;
  quality?: BuildQualityEvidence;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const browserReports = [
    ["Twin", quality?.twin],
    ["Echo", quality?.echo],
    ["Swift", quality?.swift],
  ] as const;
  const browserSuiteCompleted = browserReports.every(
    ([, report]) => report?.status === "completed",
  );
  const reportStatus = (
    report: BuildQualityEvidence["twin"] | BuildQualityEvidence["echo"] | BuildQualityEvidence["swift"],
  ) => {
    if (!report) return t("gate.evidenceMissing");
    if (report.status === "completed") return t("gate.evidenceMeasured");
    if (report.status === "failed") return t("gate.evidenceFailed");
    return t("gate.evidenceNotRun");
  };

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-border bg-elevated/40 p-3" aria-label={t("gate.evidenceTitle")}>
        <p className="text-[10px] tracking-[0.16em] text-subtle uppercase">
          {t("gate.evidenceTitle")}
        </p>
        <p className="mt-1 text-xs text-muted">
          {quality?.aegis
            ? t("gate.aegisEvidence", {
                status: quality.aegis.passed
                  ? t("gate.evidencePassed")
                  : t("gate.evidenceBlocked"),
                findings: quality.aegis.findings.length,
                blockers: quality.aegis.blockerCount,
              })
            : t("gate.aegisMissing")}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {browserReports.map(([name, report]) => (
            <span
              key={name}
              className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted"
            >
              {name}: {reportStatus(report)}
            </span>
          ))}
        </div>
        {!browserSuiteCompleted ? (
          <p className="mt-2 text-xs text-danger" role="alert">
            {t("gate.browserEvidenceWarning")}
          </p>
        ) : null}
      </section>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onApprove} disabled={busy}>
          {t("gate.approve")}
        </Button>
        <Button size="sm" variant="secondary" onClick={onModify} disabled={busy}>
          {t("gate.modify")}
        </Button>
        <Button size="sm" variant="secondary" onClick={onReject} disabled={busy}>
          {t("gate.reject")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCouncil} disabled={busy}>
          {t("gate.council")}
        </Button>
      </div>
    </div>
  );
}
