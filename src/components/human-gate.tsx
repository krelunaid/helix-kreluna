import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function HumanGate({
  onApprove,
  onModify,
  onReject,
  onCouncil,
}: {
  onApprove: () => void;
  onModify: () => void;
  onReject: () => void;
  onCouncil: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={onApprove}>
        {t("gate.approve")}
      </Button>
      <Button size="sm" variant="secondary" onClick={onModify}>
        {t("gate.modify")}
      </Button>
      <Button size="sm" variant="secondary" onClick={onReject}>
        {t("gate.reject")}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCouncil}>
        {t("gate.council")}
      </Button>
    </div>
  );
}
