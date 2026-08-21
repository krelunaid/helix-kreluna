import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { ACTIONS, EXTRA_PACK, PLANS, type PlanId } from "@/lib/plans";
import {
  buyExtraCredits,
  choosePlan,
  createBillingPortalSession,
  getAccount,
  type BillingAccountSnapshot,
  type Profile,
} from "@/lib/server/vetra";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { formatCredits } from "@/lib/utils";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/pricing")({ component: Pricing });

function Pricing() {
  const { user, isPending } = useCurrentUserState();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [billing, setBilling] = useState<BillingAccountSnapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function billingErrorMessage(error: unknown): string {
    return error instanceof Error && error.message === "PAYMENTS_NOT_AVAILABLE"
      ? t("pricing.unavailable")
      : t("pricing.error");
  }

  const userId = user?.id;
  useEffect(() => {
    track("pricing_view");
    if (!userId) return;
    void getAccount()
      .then((a) => {
        setProfile(a.profile);
        setBilling(a.billing);
        const checkoutState = new URLSearchParams(window.location.search).get("checkout");
        if (checkoutState === "success") toast.success(t("pricing.activating"));
      })
      .catch(() => undefined);
  }, [userId, t]);

  async function pick(id: PlanId) {
    if (!user) {
      void navigate({ to: "/login", search: { next: "/pricing" } });
      return;
    }
    setBusy(id);
    try {
      const next = await choosePlan({
        data: { planId: id, requestId: crypto.randomUUID() },
      });
      if (next.kind === "checkout") {
        window.location.assign(next.url);
        return;
      }
      setProfile(next.profile);
      toast.success(t("pricing.planOn", { id }));
    } catch (err) {
      toast.error(billingErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function topUp() {
    if (!user) {
      void navigate({ to: "/login", search: { next: "/pricing" } });
      return;
    }
    setBusy("topup");
    try {
      const checkout = await buyExtraCredits({ data: { requestId: crypto.randomUUID() } });
      window.location.assign(checkout.url);
    } catch (err) {
      toast.error(billingErrorMessage(err));
      setBusy(null);
    }
  }

  async function manageBilling() {
    setBusy("portal");
    try {
      const portal = await createBillingPortalSession();
      window.location.assign(portal.url);
    } catch (err) {
      toast.error(billingErrorMessage(err));
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader credits={profile?.credits_balance} />
      <main className="mx-auto w-full max-w-6xl px-5 pb-20 pt-6">
        <p className="text-xs tracking-[0.16em] text-muted uppercase">{t("pricing.kicker")}</p>
        <h1 className="font-display mt-3 max-w-xl text-5xl leading-[1.05] tracking-tight">
          {t("pricing.title")}
        </h1>
        <p className="mt-4 max-w-xl text-muted">{t("pricing.lead")}</p>

        {!isPending && user && profile ? (
          <p className="mt-6 text-sm text-muted">
            {t("pricing.current", {
              plan: profile.plan,
              n: formatCredits(profile.credits_balance, locale),
            })}
          </p>
        ) : null}
        {billing?.subscription ? (
          <p className="mt-2 text-xs text-subtle">
            {t("pricing.subscription", { status: billing.subscription.status })}
            {billing.subscription.cancelAtPeriodEnd
              ? ` · ${t("pricing.cancelPending")}`
              : ""}
          </p>
        ) : null}

        <div className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => (
            <article
              key={p.id}
              className={
                p.highlight
                  ? "flex flex-col rounded-xl bg-surface p-6 window-shadow"
                  : "flex flex-col rounded-xl bg-surface p-6 hairline"
              }
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm text-muted">{p.name}</h2>
                {p.highlight ? (
                  <span className="text-xs text-fg">{t("pricing.recommended")}</span>
                ) : null}
              </div>
              <p className="font-display mt-4 text-4xl tracking-tight">
                {p.price === 0 ? t("pricing.free") : `${p.currency}${p.price}`}
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums">
                {t("pricing.perMonth", { n: p.credits })}
              </p>
              <p className="mt-3 flex-1 text-sm text-muted">
                {p.id === "free"
                  ? t("plan.free.note")
                  : p.id === "standard"
                    ? t("plan.standard.note")
                    : p.id === "pro"
                      ? t("plan.pro.note")
                      : t("plan.team.note")}
              </p>
              <Button
                className="mt-6 w-full"
                variant={p.highlight ? "primary" : "secondary"}
                disabled={
                  busy === p.id ||
                  profile?.plan === p.id ||
                  (p.id !== "free" && (!billing?.available || Boolean(billing.subscription))) ||
                  (p.id === "free" && Boolean(billing?.subscription))
                }
                onClick={() => void pick(p.id)}
              >
                {profile?.plan === p.id
                  ? t("pricing.active")
                  : p.id !== "free" && !billing?.available
                    ? t("pricing.unavailable")
                    : busy === p.id
                      ? t("pricing.activating")
                      : t("pricing.choose")}
              </Button>
            </article>
          ))}
        </div>

        <section className="mt-16 grid gap-8 lg:grid-cols-2">
          <div className="rounded-xl bg-surface p-6 shadow-[0_0_0_1px_rgb(255_255_255/0.08)]">
            <h2 className="font-display text-3xl tracking-tight">{t("pricing.consume")}</h2>
            <ul className="mt-6 divide-y divide-border text-sm">
              {Object.entries(ACTIONS).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between py-3">
                  <span>{t(`action.${k}` as "action.generate")}</span>
                  <span className="font-mono tabular-nums text-muted">{v.credits}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted">
              {t("pricing.freeNote", { n: ACTIONS.host.credits })}
            </p>
          </div>
          <div className="rounded-xl bg-surface p-6 shadow-[0_0_0_1px_rgb(255_255_255/0.08)]">
            <h2 className="font-display text-3xl tracking-tight">{t("pricing.why")}</h2>
            <ol className="mt-6 space-y-4 text-sm text-muted">
              <li>
                <span className="text-fg">{t("pricing.m1t")}</span>
                {t("pricing.m1b")}
              </li>
              <li>
                <span className="text-fg">{t("pricing.m2t")}</span>
                {t("pricing.m2b", {
                  n: EXTRA_PACK.credits,
                  price: `${EXTRA_PACK.currency}${EXTRA_PACK.price}`,
                })}
              </li>
              <li>
                <span className="text-fg">{t("pricing.m3t")}</span>
                {t("pricing.m3b")}
              </li>
              <li>
                <span className="text-fg">{t("pricing.m4t")}</span>
                {t("pricing.m4b")}
              </li>
            </ol>
            <Button
              className="mt-8 w-full sm:w-auto"
              variant="secondary"
              disabled={!billing?.available || busy === "topup"}
              onClick={() => void topUp()}
            >
              {billing?.available ? t("acc.buy") : t("pricing.unavailable")}
            </Button>
            {billing?.hasCustomer ? (
              <Button
                className="mt-3 w-full sm:ml-3 sm:w-auto"
                variant="secondary"
                disabled={busy === "portal"}
                onClick={() => void manageBilling()}
              >
                {t("acc.plan")}
              </Button>
            ) : null}
          </div>
        </section>

        <p className="mt-12 text-sm text-subtle">
          {t(billing?.available ? "pricing.configured" : "pricing.demo")}{" "}
          <Link to="/studio" className="text-fg underline underline-offset-2">
            {t("pricing.goto")}
          </Link>
        </p>
      </main>
    </div>
  );
}
