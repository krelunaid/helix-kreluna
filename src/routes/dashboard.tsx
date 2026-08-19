import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { SiteHeader } from "@/components/site-header";
import { ProjectCard } from "@/components/project-card";
import { Button } from "@/components/ui/button";
import { getAccount, listProjects, type LedgerRow, type Profile, type Project } from "@/lib/server/vetra";
import { planById } from "@/lib/plans";
import { formatCredits, timeAgo } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

function Dashboard() {
  const { user, isPending } = useCurrentUserState();
  const { locale, t } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    void Promise.all([getAccount(), listProjects()])
      .then(([a, p]) => {
        setProfile(a.profile);
        setLedger(a.ledger);
        setProjects(p);
      })
      .catch(() => {
        setProjects([]);
      });
  }, [userId]);

  if (isPending) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-6xl px-5 py-16 text-sm text-muted">{t("dash.accountLoading")}</div>
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;

  const plan = profile ? planById(profile.plan) : null;

  return (
    <div className="min-h-screen">
      <SiteHeader credits={profile?.credits_balance} />
      <main className="mx-auto w-full max-w-6xl px-5 pb-20 pt-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-[0.16em] text-accent-soft uppercase">
              {t("dash.kicker")}
            </p>
            <h1 className="mt-2 text-4xl tracking-tight">
              {t("dash.hello", { name: user.displayName?.split(" ")[0] || user.primaryEmail?.split("@")[0] || "" })}
            </h1>
          </div>
          <Link to="/">
            <Button>{t("dash.new")}</Button>
          </Link>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-surface p-6 hairline">
            <p className="text-xs text-muted">{t("dash.credits")}</p>
            <p className="mt-2 font-display text-4xl tabular-nums tracking-tight text-accent-soft">
              {profile ? formatCredits(profile.credits_balance, locale) : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-surface p-6 hairline">
            <p className="text-xs text-muted">{t("dash.plan")}</p>
            <p className="mt-2 font-display text-4xl tracking-tight">{plan?.name ?? "—"}</p>
            <Link to="/pricing" className="mt-2 inline-block text-xs text-accent-soft hover:text-fg">
              {t("dash.change")}
            </Link>
          </div>
          <div className="rounded-xl bg-surface p-6 hairline">
            <p className="text-xs text-muted">{t("dash.apps")}</p>
            <p className="mt-2 font-display text-4xl tabular-nums tracking-tight">
              {projects ? projects.length : "—"}
            </p>
          </div>
        </div>

        <section className="mt-12">
          {projects === null ? (
            <p className="text-sm text-muted">{t("dash.loading")}</p>
          ) : projects.length === 0 ? (
            <div className="rounded-xl bg-surface p-8 hairline">
              <p className="font-display text-3xl italic">{t("dash.emptyTitle")}</p>
              <p className="mt-2 text-sm text-muted">{t("dash.emptyLead")}</p>
              <Link to="/" className="mt-5 inline-block">
                <Button>{t("dash.start")}</Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <Link key={p.id} to="/studio/$id" params={{ id: p.id }} className="block">
                  <ProjectCard
                    title={p.title}
                    kind={p.hosted ? t("projects.online") : p.status}
                    meta={`${p.credits_spent} cr · ${timeAgo(p.updated_at, locale)}`}
                    html={p.html}
                  />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mt-14">
          <h2 className="text-sm text-muted">{t("dash.ledger")}</h2>
          {ledger.length === 0 ? (
            <p className="mt-3 text-sm text-subtle">{t("dash.noLedger")}</p>
          ) : (
            <ul className="mt-3 text-sm">
              {ledger.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between border-b border-border py-2.5"
                >
                  <span className="text-muted">
                    {r.note || r.action}
                    <span className="ml-2 text-xs text-subtle">{timeAgo(r.created_at, locale)}</span>
                  </span>
                  <span
                    className={
                      r.credits >= 0
                        ? "font-mono tabular-nums text-ok"
                        : "font-mono tabular-nums text-accent-soft"
                    }
                  >
                    {r.credits > 0 ? `+${r.credits}` : r.credits}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
