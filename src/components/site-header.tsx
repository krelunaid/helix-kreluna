import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { formatCredits } from "@/lib/utils";
import { LOCALES, LOCALE_LABEL, useI18n } from "@/lib/i18n";
import { HelpButton } from "@/components/help-drawer";
import { HelixMark } from "@/components/kreluna-mark";
import { AccountDesk } from "@/components/account-desk";
import { getAccount } from "@/lib/server/vetra";
import { track } from "@/lib/analytics";

export function SiteHeader({
  credits,
  dense,
}: {
  credits?: number;
  dense?: boolean;
}) {
  const { user, isPending } = useCurrentUserState();
  const { locale, setLocale, t } = useI18n();
  const [balance, setBalance] = useState<number | undefined>(credits);
  const [open, setOpen] = useState(false);
  const [desk, setDesk] = useState(false);

  useEffect(() => {
    setBalance(credits);
  }, [credits]);

  useEffect(() => {
    if (!user?.id || typeof credits === "number") return;
    void getAccount()
      .then((a) => setBalance(a.profile.credits_balance))
      .catch(() => undefined);
  }, [user?.id, credits]);

  const links = [
    { href: "/scopri#come", label: t("nav.how") },
    { href: "/house", label: t("nav.house"), to: "/house" as const },
    { href: "/vetrina", label: t("nav.examples"), to: "/vetrina" as const },
    { href: "/prezzi", label: t("nav.pricing"), to: "/prezzi" as const },
    { href: "/scopri#fiducia", label: t("nav.trust") },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-bg/80 backdrop-blur-md">
      <div className={dense ? "flex h-14 items-center justify-between gap-3 px-4" : "mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-5"}>
        <Link to="/" className="flex items-center gap-2.5 text-fg">
          <HelixMark className="size-12 shrink-0" />
          <span className="leading-none">
            <span className="block text-lg font-semibold tracking-tight">Helix</span>
            <span className="block text-[10px] tracking-[0.14em] text-subtle uppercase">by Kreluna</span>
          </span>
        </Link>

        {dense ? null : (
          <nav className="hidden items-center gap-6 text-sm text-muted lg:flex" aria-label="Principale">
            {links.map((l) =>
              l.to ? (
                <Link key={l.href} to={l.to} className="hover:text-fg">
                  {l.label}
                </Link>
              ) : (
                <a key={l.href} href={l.href} className="hover:text-fg">
                  {l.label}
                </a>
              ),
            )}
          </nav>
        )}

        <div className="flex items-center gap-2">
          <HelpButton />
          <label className="sr-only" htmlFor="lang">
            {t("nav.language")}
          </label>
          <select
            id="lang"
            value={locale}
            onChange={(e) => setLocale(e.target.value as typeof locale)}
            className="h-11 max-w-24 rounded-full bg-elevated px-3 text-sm text-fg"
          >
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_LABEL[code]}
              </option>
            ))}
          </select>
          {typeof balance === "number" ? (
            <Link
              to="/pricing"
              className="hidden h-11 items-center rounded-full bg-elevated px-3 text-sm tabular-nums text-fg sm:inline-flex"
            >
              {t("nav.buy", { n: formatCredits(balance, locale) })}
            </Link>
          ) : null}
          {isPending ? (
            <div className="size-11 animate-pulse rounded-full bg-elevated" />
          ) : (
            <button
              type="button"
              onClick={() => setDesk(true)}
              className="hidden h-11 max-w-40 items-center truncate rounded-full bg-elevated px-3 text-sm sm:inline-flex"
            >
              {user ? user.displayName?.split(" ")[0] || user.primaryEmail?.split("@")[0] || t("acc.kicker") : t("nav.signin")}
            </button>
          )}
          {dense ? null : (
            <Link
              to="/"
              className="hidden sm:inline-flex"
              onClick={() => track("cta_create_free")}
            >
              <Button size="sm" className="h-11 px-4">
                {user ? t("nav.createFree") : t("nav.signin")}
              </Button>
            </Link>
          )}
          {dense ? null : (
            <button
              type="button"
              className="inline-flex size-11 items-center justify-center rounded-full lg:hidden"
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
              <span className="sr-only">Menu</span>
            </button>
          )}
        </div>
      </div>
      {open && !dense ? (
        <nav id="mobile-nav" className="border-t border-border px-5 py-4 lg:hidden" aria-label="Mobile">
          <ul className="space-y-3 text-sm">
            {links.map((l) => (
              <li key={l.href}>
                {l.to ? (
                  <Link to={l.to} onClick={() => setOpen(false)}>
                    {l.label}
                  </Link>
                ) : (
                  <a href={l.href} onClick={() => setOpen(false)}>
                    {l.label}
                  </a>
                )}
              </li>
            ))}
            <li>
              <button type="button" onClick={() => { setOpen(false); setDesk(true); }}>
                {t("acc.kicker")}
              </button>
            </li>
            <li>
              <Link to="/" onClick={() => { setOpen(false); track("cta_create_free"); }}>
                {user ? t("nav.createFree") : t("nav.signin")}
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
      <AccountDesk open={desk} onClose={() => setDesk(false)} credits={balance} />
    </header>
  );
}
