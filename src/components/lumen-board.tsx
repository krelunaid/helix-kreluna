import { LOOKS, type LookId } from "@/lib/atelier";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function LumenBoard({
  look,
  mood,
  onPick,
}: {
  look?: LookId | string | null;
  mood?: string;
  onPick: (id: LookId) => void;
}) {
  const { t } = useI18n();
  const current = look ?? "ember";

  return (
    <div>
      <p className="text-[11px] tracking-[0.2em] text-subtle uppercase">{t("lumen.kicker")}</p>
      <p className="mt-1 font-display text-xl italic">{t("lumen.title")}</p>
      <p className="mt-1 text-sm text-muted">{mood || t("lumen.lead")}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {LOOKS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onPick(l.id)}
            className={cn(
              "rounded-lg p-3 text-left transition-shadow",
              current === l.id ? "window-shadow" : "hairline hover:bg-elevated",
            )}
          >
            <div className="flex gap-1">
              {[l.bg, l.fg, l.accent, l.elevated].map((c) => (
                <span key={c} className="h-5 flex-1 rounded-sm" style={{ background: c }} />
              ))}
            </div>
            <p className="mt-2 font-display italic">{l.name}</p>
            <p className="text-[11px] leading-snug text-subtle">{l.mood}</p>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-subtle">{t("lumen.hint")}</p>
    </div>
  );
}
