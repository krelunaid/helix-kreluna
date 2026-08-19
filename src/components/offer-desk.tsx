import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Globe, Rocket, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

const KEY = "kreluna.offer.v1";

export function OfferDesk() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(KEY)) setOpen(true);
  }, []);

  function close() {
    localStorage.setItem(KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-bg/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-surface hairline window-shadow">
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 grid size-9 place-items-center rounded-full text-muted hover:bg-elevated hover:text-fg"
          aria-label={t("offer.close")}
        >
          <X className="size-4" />
        </button>
        <div className="bg-elevated px-6 pb-6 pt-8">
          <p className="text-[11px] tracking-[0.2em] text-accent-soft uppercase">{t("offer.kicker")}</p>
          <h2 className="font-display mt-2 text-4xl italic leading-none">{t("offer.title")}</h2>
          <p className="mt-3 text-sm text-muted">{t("offer.lead")}</p>
        </div>
        <ul className="space-y-4 px-6 py-6 text-sm">
          <li className="flex gap-3">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-soft" />
            <span>{t("offer.a")}</span>
          </li>
          <li className="flex gap-3">
            <Rocket className="mt-0.5 size-4 shrink-0 text-accent-soft" />
            <span>{t("offer.b")}</span>
          </li>
          <li className="flex gap-3">
            <Globe className="mt-0.5 size-4 shrink-0 text-accent-soft" />
            <span>{t("offer.c")}</span>
          </li>
        </ul>
        <div className="flex flex-col gap-2 px-6 pb-6 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close}>
            {t("offer.later")}
          </Button>
          <Link
            to="/pricing"
            onClick={close}
            className="inline-flex h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-medium text-accent-fg"
          >
            {t("offer.go")}
          </Link>
        </div>
      </div>
    </div>
  );
}
