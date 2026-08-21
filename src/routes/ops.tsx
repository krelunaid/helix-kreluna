import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import type { ComponentType } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Cloud,
  Coins,
  Database,
  ExternalLink,
  FolderKanban,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { getAdminOverview } from "@/lib/server/admin";
import type { AdminJobStatus } from "@/lib/server/admin/overview";

export const Route = createFileRoute("/ops")({
  loader: async () => {
    try {
      return await getAdminOverview();
    } catch {
      throw notFound();
    }
  },
  headers: () => ({
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
  }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow, noarchive, nosnippet" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  notFoundComponent: () => <p>Not Found</p>,
  component: AdminConsole,
});

const JOB_LABELS: Record<AdminJobStatus, string> = {
  queued: "In coda",
  running: "In esecuzione",
  retry: "Nuovo tentativo",
  awaiting_human_approval: "Da approvare",
  approved: "Approvati",
  rejected: "Rifiutati",
  deploying: "In pubblicazione",
  deployed: "Pubblicati",
  failed: "Errore",
  cancelled: "Annullati",
};

const ACTIVE_JOB_STATUSES: AdminJobStatus[] = [
  "queued",
  "running",
  "retry",
  "awaiting_human_approval",
  "approved",
  "deploying",
];

function number(value: number): string {
  return new Intl.NumberFormat("it-IT").format(value);
}

function money(amountMinor: string, currency: string): string {
  try {
    const amount = BigInt(amountMinor);
    const major = amount / 100n;
    const minor = (amount % 100n).toString().padStart(2, "0");
    return `${major.toLocaleString("it-IT")},${minor} ${currency.toUpperCase()}`;
  } catch {
    return `0,00 ${currency.toUpperCase()}`;
  }
}

function usdTicks(value: string): string {
  try {
    const ticks = BigInt(value);
    const dollars = ticks / 10_000_000_000n;
    const decimals = ((ticks % 10_000_000_000n) / 1_000_000n).toString().padStart(4, "0");
    return `$${dollars.toLocaleString("it-IT")},${decimals}`;
  } catch {
    return "$0,0000";
  }
}

function AdminConsole() {
  const overview = Route.useLoaderData();
  const router = useRouter();
  const activeJobs = ACTIVE_JOB_STATUSES.reduce((sum, status) => sum + overview.jobs[status], 0);
  const completedJobs = overview.jobs.deployed + overview.jobs.awaiting_human_approval;

  return (
    <div className="min-h-screen bg-[#07080d] text-[#f4f5fb]">
      <header className="border-b border-white/8 bg-[#090b12]/95 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-violet-400/25 bg-violet-500/12 text-violet-300">
              <ShieldCheck className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold tracking-[0.25em] text-violet-300 uppercase">
                Kreluna · accesso riservato
              </p>
              <h1 className="truncate text-xl font-semibold tracking-tight">Helix Control</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void router.invalidate()}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 text-xs font-medium text-white/75 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              <RefreshCw className="size-3.5" />
              <span className="hidden sm:inline">Aggiorna</span>
            </button>
            <Link
              to="/"
              className="inline-flex h-10 items-center rounded-full border border-white/10 px-4 text-xs text-white/65 transition hover:text-white"
            >
              Torna a Helix
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-5 py-8 lg:px-8 lg:py-12">
        <section className="flex flex-col gap-3 border-b border-white/8 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs tracking-[0.18em] text-white/45 uppercase">Quadro operativo</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              Numeri essenziali, senza esporre dati sensibili.
            </h2>
          </div>
          <p className="text-xs text-white/40">
            Aggiornato {new Date(overview.generatedAt).toLocaleString("it-IT")}
          </p>
        </section>

        <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={Users}
            label="Utenti"
            value={number(overview.users.total)}
            detail={`${number(overview.users.verified)} verificati`}
            tone="violet"
          />
          <Metric
            icon={FolderKanban}
            label="Progetti"
            value={number(overview.projects.total)}
            detail={`${number(overview.projects.online)} online`}
            tone="cyan"
          />
          <Metric
            icon={Activity}
            label="Job attivi"
            value={number(activeJobs)}
            detail={`${number(completedJobs)} pronti o pubblicati`}
            tone="amber"
          />
          <Metric
            icon={Coins}
            label="Crediti disponibili"
            value={number(overview.credits.balance)}
            detail={`${number(overview.credits.spent)} utilizzati`}
            tone="emerald"
          />
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-white/45 uppercase">
                  Produzione
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">Stato dei job</h3>
              </div>
              <Activity className="size-5 text-amber-300" />
            </div>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {Object.entries(overview.jobs).map(([status, count]) => (
                <div
                  key={status}
                  className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-white/7 bg-black/15 px-4 py-3"
                >
                  <span className="text-sm text-white/60">
                    {JOB_LABELS[status as AdminJobStatus]}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-white">{number(count)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-white/45 uppercase">
                  Intelligenza artificiale
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">Uso Terra</h3>
              </div>
              <Bot className="size-5 text-violet-300" />
            </div>
            <dl className="mt-6 divide-y divide-white/8">
              <DataRow label="Chiamate totali" value={number(overview.ai.calls)} />
              <DataRow label="Riuscite" value={number(overview.ai.succeeded)} />
              <DataRow label="Fallite o incerte" value={number(overview.ai.failed)} />
              <DataRow label="Token totali" value={number(overview.ai.totalTokens)} />
              <DataRow
                label="Costo provider misurato"
                value={usdTicks(overview.ai.providerCostUsdTicks)}
              />
            </dl>
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-white/45 uppercase">
                  Incassi registrati
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">Stripe</h3>
              </div>
              <CircleDollarSign className="size-5 text-emerald-300" />
            </div>
            {overview.revenue.length ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {overview.revenue.map((row) => (
                  <div
                    key={`${row.mode}-${row.currency}`}
                    className="rounded-2xl border border-white/8 bg-black/15 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs tracking-[0.16em] text-white/40 uppercase">
                        {row.mode === "live" ? "Live" : "Test"}
                      </span>
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-white/45 uppercase">
                        solo pagati
                      </span>
                    </div>
                    <p className="mt-4 text-2xl font-semibold tracking-tight">
                      {money(row.amountMinor, row.currency)}
                    </p>
                    <p className="mt-1 text-xs text-white/45">{number(row.payments)} pagamenti</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-white/12 p-6 text-sm text-white/45">
                Nessun pagamento Stripe completato registrato.
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-white/45 uppercase">
                  Integrazioni
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">Configurazione</h3>
              </div>
              <Cloud className="size-5 text-cyan-300" />
            </div>
            <div className="mt-6 grid gap-2">
              <IntegrationRow icon={Database} name="Database" {...overview.integrations.database} />
              <IntegrationRow
                icon={KeyRound}
                name="Google OAuth"
                {...overview.integrations.google}
              />
              <IntegrationRow icon={Bot} name="Terra / AI Gateway" {...overview.integrations.ai} />
              <IntegrationRow
                icon={CircleDollarSign}
                name="Pagamenti"
                {...overview.integrations.stripe}
              />
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-violet-400/16 bg-violet-500/[0.055] p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-violet-300">
                <KeyRound className="size-4" />
                <p className="text-xs font-semibold tracking-[0.18em] uppercase">
                  Segreti protetti
                </p>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/65">
                Le chiavi Stripe, Google e AI non si inseriscono e non si leggono da questa pagina.
                Restano nei pannelli protetti dei provider e nelle variabili server di Netlify; qui
                compare soltanto lo stato della configurazione.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="https://app.netlify.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-semibold text-black transition hover:bg-white/90"
              >
                Apri Netlify <ExternalLink className="size-3.5" />
              </a>
              <a
                href="https://dashboard.stripe.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/12 px-4 text-xs font-medium text-white/75 transition hover:border-white/25 hover:text-white"
              >
                Apri Stripe <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

type Icon = ComponentType<{ className?: string }>;

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: Icon;
  label: string;
  value: string;
  detail: string;
  tone: "violet" | "cyan" | "amber" | "emerald";
}) {
  const tones = {
    violet: "border-violet-400/15 bg-violet-500/[0.055] text-violet-300",
    cyan: "border-cyan-400/15 bg-cyan-500/[0.055] text-cyan-300",
    amber: "border-amber-400/15 bg-amber-500/[0.055] text-amber-300",
    emerald: "border-emerald-400/15 bg-emerald-500/[0.055] text-emerald-300",
  };
  return (
    <article className={`rounded-3xl border p-5 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-[0.12em] text-white/45 uppercase">{label}</p>
        <Icon className="size-4" />
      </div>
      <p className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-white tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-xs text-white/45">{detail}</p>
    </article>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <dt className="text-white/50">{label}</dt>
      <dd className="font-mono tabular-nums text-white/85">{value}</dd>
    </div>
  );
}

function IntegrationRow({
  icon: Icon,
  name,
  enabled,
  label,
}: {
  icon: Icon;
  name: string;
  enabled: boolean;
  label: string;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/7 bg-black/15 px-4 py-3">
      <Icon className="size-4 shrink-0 text-white/40" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white/75">{name}</p>
        <p className="truncate text-xs text-white/40">{label}</p>
      </div>
      {enabled ? (
        <CheckCircle2 className="size-4 shrink-0 text-emerald-300" />
      ) : (
        <XCircle className="size-4 shrink-0 text-white/25" />
      )}
    </div>
  );
}
