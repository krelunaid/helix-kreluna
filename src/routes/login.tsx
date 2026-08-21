import { type FormEvent, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  GROK_PROVIDERS,
  authClient,
  grokAuthEnabled,
  keepSession,
  previewPasswordSignInEnabled,
  signIn,
} from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteHeader } from "@/components/site-header";
import { useI18n } from "@/lib/i18n";

type Search = { next?: string; prompt?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    next: typeof s.next === "string" ? s.next : "/",
    prompt: typeof s.prompt === "string" ? s.prompt : undefined,
  }),
  component: Login,
});

function Login() {
  const { next, prompt } = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPending && user) {
      void navigate({ to: next || "/" });
    }
  }, [isPending, user, next, navigate]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const destPath = prompt
    ? `${next && next !== "/" ? next : "/studio"}?prompt=${encodeURIComponent(prompt)}`
    : next || "/";
  const callbackURL = origin
    ? `${origin}${destPath.startsWith("/") ? destPath : `/${destPath}`}`
    : destPath;

  async function onEmail() {
    setError(null);
    setBusy(true);
    try {
      const res = await authClient.signIn.email({ email: email.trim(), password });
      if (res.error) throw new Error(res.error.message || t("login.errSignin"));
      keepSession((res.data as { token?: string } | null)?.token);
      if (prompt) sessionStorage.setItem("kreluna.prompt", prompt);
      await authClient.getSession();
      void navigate({ to: next && next !== "/" ? next : "/studio" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("login.err");
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void onEmail();
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto grid min-h-[70vh] w-full max-w-md place-items-center px-5 pb-16">
        <div className="w-full rounded-xl bg-surface p-8 window-shadow">
          <p className="text-[11px] tracking-[0.22em] text-subtle uppercase">Kreluna</p>
          <h1 className="font-display mt-3 text-4xl italic tracking-tight">{t("login.title")}</h1>
          <p className="mt-2 text-sm text-muted">{t("login.lead")}</p>

          {grokAuthEnabled ? (
            <div className="mt-6 grid gap-2">
              <Button
                variant="secondary"
                className="h-12 w-full bg-fg text-bg hover:opacity-95"
                onClick={() => {
                  void signIn("grok-google", {
                    callbackURL,
                    errorCallbackURL: `${origin}/login`,
                  }).catch((err) => {
                    setError(err instanceof Error ? err.message : t("login.err"));
                  });
                }}
              >
                <GoogleMark />
                {t("login.continueWith", { name: "Google" })}
              </Button>
              {GROK_PROVIDERS.filter((p) => p.providerId !== "grok-google").map((p) => (
                <Button
                  key={p.providerId}
                  variant="secondary"
                  className="h-12 w-full"
                  onClick={() => {
                    void signIn(p.providerId, {
                      callbackURL,
                      errorCallbackURL: `${origin}/login`,
                    }).catch((err) => {
                      setError(err instanceof Error ? err.message : t("login.err"));
                    });
                  }}
                >
                  {t("login.continueWith", { name: p.label })}
                </Button>
              ))}
              <p className="text-xs text-subtle">{t("login.noApple")}</p>
            </div>
          ) : !previewPasswordSignInEnabled ? (
            <p className="mt-6 text-sm text-muted">{t("login.disabled")}</p>
          ) : null}

          {previewPasswordSignInEnabled ? (
            <form className="mt-6 grid gap-3" onSubmit={onSubmit}>
              <Input
                type="email"
                required
                placeholder={t("login.email")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <Input
                type="password"
                required
                minLength={16}
                placeholder={t("login.password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? t("login.wait") : t("login.signin")}
              </Button>
            </form>
          ) : null}

          <p className="mt-6 text-xs text-subtle">
            {t("login.legal")}{" "}
            <Link to="/pricing" className="underline underline-offset-2">
              {t("nav.pricing")}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09A6.97 6.97 0 0 1 5.48 12c0-.72.12-1.43.36-2.09V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
