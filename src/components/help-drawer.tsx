import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function HelpButton({ line }: { line?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-9 place-items-center rounded-full text-sm text-muted shadow-[0_0_0_1px_rgb(255_255_255/0.1)] hover:text-fg"
        aria-label={t("help.open")}
      >
        ?
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[86vh] w-full max-w-lg overflow-auto rounded-xl bg-surface p-6 window-shadow"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] tracking-[0.2em] text-subtle uppercase">{t("help.kicker")}</p>
            <h2 className="font-display mt-2 text-3xl italic">{t("help.title")}</h2>
            {line ? <p className="mt-3 font-display text-lg italic text-accent-soft">{line}</p> : null}
            <ol className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
              <li>
                <span className="text-fg">{t("help.q1")}</span>
                <p className="mt-1">{t("help.a1")}</p>
              </li>
              <li>
                <span className="text-fg">{t("help.q2")}</span>
                <p className="mt-1">{t("help.a2")}</p>
              </li>
              <li>
                <span className="text-fg">{t("help.q3")}</span>
                <p className="mt-1">{t("help.a3")}</p>
              </li>
              <li>
                <span className="text-fg">{t("help.q4")}</span>
                <p className="mt-1">{t("help.a4")}</p>
              </li>
              <li>
                <span className="text-fg">{t("help.q5")}</span>
                <p className="mt-1">{t("help.a5")}</p>
              </li>
            </ol>
            <Button className="mt-6" onClick={() => setOpen(false)}>
              {t("help.close")}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
