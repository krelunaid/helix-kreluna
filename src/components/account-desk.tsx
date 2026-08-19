import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Github, Languages, LogOut, Sparkles, Wallet, X } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LOCALES, LOCALE_LABEL, useI18n } from "@/lib/i18n";
import { formatCredits } from "@/lib/utils";
import { githubStatus, linkGithub, unlinkGithub } from "@/lib/server/github";
import { toast } from "sonner";

export function AccountDesk({
  open,
  onClose,
  credits,
}: {
  open: boolean;
  onClose: () => void;
  credits?: number;
}) {
  const { user } = useCurrentUserState();
  const { locale, setLocale, t } = useI18n();
  const [login, setLogin] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !user) {
      setLogin(null);
      return;
    }
    void githubStatus()
      .then((r) => setLogin(r.login))
      .catch(() => setLogin(null));
  }, [open, user]);

  if (!open) return null;

  async function connect() {
    if (!user) return;
    setBusy(true);
    try {
      const r = await linkGithub({ data: { token } });
      setLogin(r.login);
      setToken("");
      toast.success(`${t("acc.ghOk")} @${r.login}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("acc.ghErr"));
    } finally {
      setBusy(false);
    }
  }

  function copyInvite() {
    const url = "https://helix.kreluna.it";
    void navigator.clipboard.writeText(url).then(() => toast.success(t("acc.inviteOk")));
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-bg/60" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-sm flex-col overflow-auto bg-surface px-5 py-6 window-shadow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] tracking-[0.18em] text-subtle uppercase">{t("acc.kicker")}</p>
            <p className="mt-2 text-lg font-medium">{user?.displayName || user?.primaryEmail || t("nav.signin")}</p>
            {user?.primaryEmail ? <p className="text-xs text-muted">{user.primaryEmail}</p> : null}
          </div>
          <button type="button" className="grid size-9 place-items-center rounded-full hairline" onClick={onClose} aria-label={t("acc.close")}>
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-6 rounded-xl bg-elevated p-4">
          <p className="text-xs text-muted">{t("dash.credits")}</p>
          <p className="mt-1 font-display text-3xl tabular-nums">{typeof credits === "number" ? formatCredits(credits, locale) : "—"}</p>
          <Link to="/pricing" onClick={onClose} className="mt-3 inline-flex">
            <Button size="sm">
              <Wallet className="size-3.5" />
              {t("acc.buy")}
            </Button>
          </Link>
        </div>

        <nav className="mt-6 space-y-1 text-sm">
          <Link to="/dashboard" onClick={onClose} className="flex h-11 items-center rounded-lg px-3 hover:bg-elevated">
            {t("nav.yours")}
          </Link>
          <Link to="/pricing" onClick={onClose} className="flex h-11 items-center rounded-lg px-3 hover:bg-elevated">
            {t("acc.plan")}
          </Link>
          <button type="button" onClick={copyInvite} className="flex h-11 w-full items-center rounded-lg px-3 text-left hover:bg-elevated">
            {t("acc.invite")}
          </button>
          <a href="https://www.kreluna.it" target="_blank" rel="noreferrer" className="flex h-11 items-center rounded-lg px-3 hover:bg-elevated">
            {t("acc.community")}
          </a>
          <a href="https://helix.kreluna.it/scheda.html" className="flex h-11 items-center rounded-lg px-3 hover:bg-elevated">
            {t("acc.help")}
          </a>
        </nav>

        <div className="mt-6">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Languages className="size-4 text-info" />
            {t("nav.language")}
          </p>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as typeof locale)}
            className="mt-2 h-11 w-full rounded-lg bg-elevated px-3 text-sm"
          >
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_LABEL[code]}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6 rounded-xl bg-elevated p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Github className="size-4" />
            GitHub
          </p>
          <p className="mt-2 text-xs text-muted">{t("acc.ghWho")}</p>
          {!user ? (
            <Link to="/login" search={{ next: "/" }} onClick={onClose} className="mt-3 inline-flex">
              <Button size="sm">{t("acc.ghNeedLogin")}</Button>
            </Link>
          ) : login ? (
            <div className="mt-3">
              <p className="text-sm">@{login}</p>
              <p className="mt-1 text-xs text-muted">{t("acc.ghLinked")}</p>
              <button
                type="button"
                className="mt-3 text-xs text-muted underline"
                onClick={() => {
                  void unlinkGithub().then(() => setLogin(null));
                }}
              >
                {t("acc.ghOff")}
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted">{t("acc.ghHint")}</p>
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={t("acc.ghPh")}
                autoComplete="off"
              />
              <Button size="sm" disabled={busy || token.trim().length < 8} onClick={() => void connect()}>
                {busy ? t("acc.ghWait") : t("acc.ghOn")}
              </Button>
              <a
                className="block text-xs text-accent underline-offset-2 hover:underline"
                href="https://github.com/settings/tokens/new?scopes=repo&description=Helix%20Kreluna"
                target="_blank"
                rel="noreferrer"
              >
                {t("acc.ghCreate")}
              </a>
            </div>
          )}
        </div>

        {user ? (
          <button
            type="button"
            className="mt-8 inline-flex h-11 items-center gap-2 text-sm text-muted hover:text-fg"
            onClick={() => void signOut("/")}
          >
            <LogOut className="size-4" />
            {t("nav.out")}
          </button>
        ) : (
          <Link to="/login" search={{ next: "/" }} onClick={onClose} className="mt-8 inline-flex">
            <Button>
              <Sparkles className="size-4" />
              {t("nav.signin")}
            </Button>
          </Link>
        )}
      </aside>
    </div>
  );
}
