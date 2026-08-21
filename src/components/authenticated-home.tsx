import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  Braces,
  CheckCircle2,
  CircleDot,
  Coins,
  CreditCard,
  FolderKanban,
  Globe2,
  Home,
  LayoutDashboard,
  Menu,
  PanelsTopLeft,
  Plus,
  Search,
  ShoppingBag,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { AccountDesk } from "@/components/account-desk";
import { DemoProjectGallery } from "@/components/demo-project-gallery";
import { HelpButton } from "@/components/help-drawer";
import { HelixOrb } from "@/components/helix-orb";
import { IdeaDesk } from "@/components/idea-desk";
import { HelixMark } from "@/components/kreluna-mark";
import { ProjectCard } from "@/components/project-card";
import { LOCALES, LOCALE_LABEL, useI18n } from "@/lib/i18n";
import { authenticatedHomeCopy } from "@/lib/authenticated-home-copy";
import {
  dashboardActivity,
  dashboardMetrics,
  filterDashboardProjects,
  shouldShowDemoProjects,
  type DashboardProjectFilter,
  type ProjectLoadState,
} from "@/lib/authenticated-home-model";
import type { AppUser } from "@/lib/auth/use-current-user";
import type { BuildLevel } from "@/lib/build-level";
import type { Gear } from "@/lib/house";
import { planById } from "@/lib/plans";
import {
  getAccount,
  listProjects,
  type LedgerRow,
  type Profile,
  type Project,
} from "@/lib/server/vetra";
import { formatCredits, timeAgo } from "@/lib/utils";

type AccountLoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; profile: Profile; ledger: LedgerRow[] };

type AuthenticatedHomeProps = {
  user: AppUser;
  prompt: string;
  onPromptChange: (value: string) => void;
  busy: boolean;
  onSubmit: (payload: { prompt: string; gear: Gear; max: boolean; buildLevel: BuildLevel }) => void;
};

const QUICK_ICONS = [Globe2, Smartphone, LayoutDashboard, Braces, Sparkles, ShoppingBag] as const;

export function AuthenticatedHome({
  user,
  prompt,
  onPromptChange,
  busy,
  onSubmit,
}: AuthenticatedHomeProps) {
  const { locale, setLocale } = useI18n();
  const copy = authenticatedHomeCopy(locale);
  const [projectsState, setProjectsState] = useState<ProjectLoadState>({ status: "loading" });
  const [accountState, setAccountState] = useState<AccountLoadState>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState<DashboardProjectFilter>("all");
  const [query, setQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    setProjectsState({ status: "loading" });
    setAccountState({ status: "loading" });

    void listProjects()
      .then((projects) => {
        if (active) setProjectsState({ status: "ready", projects });
      })
      .catch(() => {
        if (active) setProjectsState({ status: "error" });
      });
    void getAccount()
      .then(({ profile, ledger }) => {
        if (active) setAccountState({ status: "ready", profile, ledger });
      })
      .catch(() => {
        if (active) setAccountState({ status: "error" });
      });

    return () => {
      active = false;
    };
  }, [user.id, reload]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileMenu();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  const projects = useMemo(
    () => (projectsState.status === "ready" ? projectsState.projects : []),
    [projectsState],
  );
  const profile = accountState.status === "ready" ? accountState.profile : null;
  const ledger = useMemo(
    () => (accountState.status === "ready" ? accountState.ledger : []),
    [accountState],
  );
  const metrics = useMemo(() => dashboardMetrics(projects), [projects]);
  const activity = useMemo(() => dashboardActivity(projects, ledger), [projects, ledger]);
  const visibleProjects = useMemo(
    () => filterDashboardProjects(projects, filter, query),
    [filter, projects, query],
  );
  const activeBuild = projects.find((project) => project.status === "building") ?? null;
  const firstName =
    user.displayName?.trim().split(/\s+/)[0] || user.primaryEmail?.split("@")[0] || copy.account;

  function focusComposer() {
    setMobileMenuOpen(false);
    window.requestAnimationFrame(() => document.getElementById("idea")?.focus());
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
    window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
  }

  return (
    <div id="dashboard-top" className="dashboard-home-shell">
      <a href="#dashboard-main" className="dashboard-skip-link">
        {copy.skipToContent}
      </a>

      <DashboardSidebar
        copy={copy}
        profile={profile}
        user={user}
        locale={locale}
        onNewProject={focusComposer}
        onOpenAccount={() => setAccountOpen(true)}
      />

      <header className="dashboard-mobile-header">
        <button
          ref={mobileMenuButtonRef}
          type="button"
          className="dashboard-icon-button"
          aria-label="Menu"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(true)}
        >
          <Menu className="size-5" />
        </button>
        <Link to="/" className="flex items-center gap-2">
          <HelixMark className="size-10" />
          <span className="text-sm font-semibold">Helix</span>
        </Link>
        <button
          type="button"
          className="dashboard-avatar"
          onClick={() => setAccountOpen(true)}
          aria-label={copy.account}
        >
          {initials(user)}
        </button>
      </header>

      {mobileMenuOpen ? (
        <div className="dashboard-mobile-drawer" role="presentation" onClick={closeMobileMenu}>
          <aside
            className="dashboard-mobile-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label={copy.nav.home}
            onKeyDown={trapDialogFocus}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HelixMark className="size-12" />
                <div>
                  <p className="font-semibold">Kreluna</p>
                  <p className="text-[10px] tracking-[0.16em] text-subtle uppercase">Helix OS</p>
                </div>
              </div>
              <button
                type="button"
                autoFocus
                className="dashboard-icon-button"
                onClick={closeMobileMenu}
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            <DashboardNavigation
              copy={copy}
              onNewProject={focusComposer}
              onNavigate={closeMobileMenu}
            />
          </aside>
        </div>
      ) : null}

      <main id="dashboard-main" className="dashboard-home-main">
        <div className="dashboard-top-actions">
          <HelpButton />
          <label className="sr-only" htmlFor="dashboard-language">
            Language
          </label>
          <select
            id="dashboard-language"
            value={locale}
            onChange={(event) => setLocale(event.target.value as typeof locale)}
            className="dashboard-select"
          >
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_LABEL[code]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="dashboard-account-pill"
            onClick={() => setAccountOpen(true)}
          >
            <span className="dashboard-avatar dashboard-avatar-small">{initials(user)}</span>
            <span className="max-w-32 truncate">{firstName}</span>
          </button>
        </div>

        <section id="dashboard-create" className="dashboard-hero" aria-labelledby="dashboard-title">
          <div className="dashboard-hero-copy">
            <p className="text-sm text-muted">
              {copy.greeting} {firstName}! <span aria-hidden>👋</span>
            </p>
            <h1 id="dashboard-title" className="dashboard-hero-title">
              {copy.headlineBefore} <span>{copy.headlineAccent}</span> {copy.headlineAfter}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">{copy.lead}</p>
          </div>
          <HelixOrb className="dashboard-hero-orb" />
          <div className="dashboard-composer-wrap">
            <p className="mb-3 text-xs font-semibold tracking-[0.16em] text-accent-soft uppercase">
              {copy.createSection}
            </p>
            <IdeaDesk
              value={prompt}
              onChange={onPromptChange}
              onSubmit={onSubmit}
              busy={busy}
              authenticated
              variant="dashboard"
              submitLabel={copy.createAction}
              placeholder={copy.createPlaceholder}
            />
          </div>
        </section>

        <section className="mt-6" aria-labelledby="quick-create-title">
          <h2 id="quick-create-title" className="dashboard-section-label">
            {copy.quickCreate}
          </h2>
          <div className="dashboard-quick-grid">
            {copy.quickPresets.map((preset, index) => {
              const Icon = QUICK_ICONS[index];
              return (
                <button
                  key={preset.label}
                  type="button"
                  className="dashboard-quick-card"
                  onClick={() => {
                    onPromptChange(`${preset.label}. ${preset.description}.`);
                    focusComposer();
                  }}
                >
                  <span className="dashboard-quick-icon">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-fg">{preset.label}</span>
                    <span className="mt-1 block text-xs leading-4 text-muted">
                      {preset.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="dashboard-mobile-insights">
          <OverviewPanel
            idSuffix="mobile"
            copy={copy}
            metrics={metrics}
            credits={profile?.credits_balance}
            projectsReady={projectsState.status === "ready"}
            accountReady={accountState.status === "ready"}
            locale={locale}
          />
          <BuildPanel
            idSuffix="mobile"
            copy={copy}
            activeBuild={activeBuild}
            locale={locale}
            projectsStatus={projectsState.status}
          />
        </div>

        <section
          id="dashboard-projects"
          className="dashboard-project-section"
          aria-labelledby="dashboard-projects-title"
        >
          {projectsState.status === "ready" && projects.length > 0 ? (
            <>
              <div className="dashboard-project-toolbar">
                <div>
                  <p className="text-[11px] font-medium tracking-[0.18em] text-info uppercase">
                    {copy.nav.projects}
                  </p>
                  <h2
                    id="dashboard-projects-title"
                    className="mt-1 text-2xl tracking-tight sm:text-3xl"
                  >
                    {copy.project.title}
                  </h2>
                </div>
                <label className="dashboard-search">
                  <Search className="size-4 text-subtle" />
                  <span className="sr-only">{copy.project.search}</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={copy.project.search}
                  />
                </label>
              </div>
              <div
                className="mt-4 flex flex-wrap gap-2"
                role="group"
                aria-label={copy.project.title}
              >
                {(["all", "building", "ready", "online"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                    className="dashboard-filter"
                  >
                    {copy.project.filter[value]}
                    {value === "all" ? ` · ${projects.length}` : ""}
                  </button>
                ))}
              </div>
              {visibleProjects.length > 0 ? (
                <div className="dashboard-project-grid">
                  {visibleProjects.map((project) => (
                    <OwnedProjectCard
                      key={project.id}
                      project={project}
                      locale={locale}
                      copy={copy}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-8 rounded-2xl border border-border/70 bg-surface/60 p-6 text-sm text-muted">
                  {copy.project.noResults}
                </p>
              )}
            </>
          ) : projectsState.status === "loading" ? (
            <div aria-busy="true" aria-live="polite">
              <h2 id="dashboard-projects-title" className="text-2xl tracking-tight">
                {copy.project.title}
              </h2>
              <div className="dashboard-loading-grid">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="dashboard-loading-card" />
                ))}
              </div>
              <p className="sr-only">{copy.loading}</p>
            </div>
          ) : projectsState.status === "error" ? (
            <div role="alert" className="dashboard-error-panel">
              <h2 id="dashboard-projects-title" className="text-xl font-semibold">
                {copy.error}
              </h2>
              <button
                type="button"
                className="dashboard-retry-button"
                onClick={() => setReload((value) => value + 1)}
              >
                {copy.retry}
              </button>
            </div>
          ) : shouldShowDemoProjects(projectsState) ? (
            <div>
              <div className="dashboard-empty-intro">
                <span className="dashboard-empty-icon">
                  <Sparkles className="size-5" />
                </span>
                <div>
                  <h2 id="dashboard-projects-title" className="text-2xl tracking-tight">
                    {copy.empty.title}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{copy.empty.lead}</p>
                </div>
              </div>
              <DemoProjectGallery locale={locale} copy={copy.demo} />
            </div>
          ) : null}
        </section>
      </main>

      <aside className="dashboard-home-rail" aria-label={copy.overview.title}>
        <OverviewPanel
          idSuffix="desktop"
          copy={copy}
          metrics={metrics}
          credits={profile?.credits_balance}
          projectsReady={projectsState.status === "ready"}
          accountReady={accountState.status === "ready"}
          locale={locale}
        />
        <BuildPanel
          idSuffix="desktop"
          copy={copy}
          activeBuild={activeBuild}
          locale={locale}
          projectsStatus={projectsState.status}
        />
        <RecentActivityPanel copy={copy} activity={activity} locale={locale} />
        <div className="dashboard-help-card">
          <span className="dashboard-quick-icon">
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">{copy.nav.help}</p>
            <p className="mt-1 text-xs text-muted">Helix by Kreluna</p>
          </div>
          <HelpButton />
        </div>
      </aside>

      <AccountDesk
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        credits={profile?.credits_balance}
      />
    </div>
  );
}

function DashboardSidebar({
  copy,
  profile,
  user,
  locale,
  onNewProject,
  onOpenAccount,
}: {
  copy: ReturnType<typeof authenticatedHomeCopy>;
  profile: Profile | null;
  user: AppUser;
  locale: ReturnType<typeof useI18n>["locale"];
  onNewProject: () => void;
  onOpenAccount: () => void;
}) {
  const plan = profile ? planById(profile.plan) : null;
  return (
    <aside className="dashboard-home-sidebar" aria-label={copy.nav.home}>
      <Link to="/" className="flex items-center gap-3 px-2 py-1">
        <HelixMark className="size-14 shrink-0" />
        <span>
          <span className="block font-semibold tracking-[0.08em]">KRELUNA</span>
          <span className="block text-[10px] tracking-[0.16em] text-subtle uppercase">
            Helix OS
          </span>
        </span>
      </Link>
      <DashboardNavigation copy={copy} onNewProject={onNewProject} />
      <div className="mt-auto space-y-3">
        <div className="dashboard-plan-card">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">{plan?.name ?? copy.plan}</span>
            <span className="rounded-full bg-ok/15 px-2 py-1 text-[9px] font-semibold tracking-[0.12em] text-ok uppercase">
              {copy.plan}
            </span>
          </div>
          <p className="mt-5 text-xs text-muted">{copy.credits}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-accent-soft">
            {profile ? formatCredits(profile.credits_balance, locale) : "—"}
          </p>
          <Link
            to="/pricing"
            className="mt-4 flex h-11 items-center justify-center rounded-xl border border-accent/40 text-xs text-accent-soft hover:bg-accent/10"
          >
            {copy.manage}
          </Link>
        </div>
        <button type="button" className="dashboard-user-card" onClick={onOpenAccount}>
          <span className="dashboard-avatar">{initials(user)}</span>
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm font-medium">
              {user.displayName || user.primaryEmail}
            </span>
            <span className="block truncate text-[11px] text-muted">{user.primaryEmail}</span>
          </span>
        </button>
      </div>
    </aside>
  );
}

function DashboardNavigation({
  copy,
  onNewProject,
  onNavigate,
}: {
  copy: ReturnType<typeof authenticatedHomeCopy>;
  onNewProject: () => void;
  onNavigate?: () => void;
}) {
  const items = [
    { icon: Home, label: copy.nav.home, href: "#dashboard-top", current: true },
    { icon: Plus, label: copy.nav.newProject, href: "#dashboard-create" },
    { icon: FolderKanban, label: copy.nav.projects, href: "#dashboard-projects" },
  ];
  return (
    <nav className="dashboard-nav" aria-label={copy.nav.home}>
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          aria-current={item.current ? "page" : undefined}
          onClick={(event) => {
            onNavigate?.();
            if (item.href === "#dashboard-create") {
              event.preventDefault();
              onNewProject();
            }
          }}
          className="dashboard-nav-link"
        >
          <item.icon className="size-4" />
          <span>{item.label}</span>
        </a>
      ))}
      <Link
        to="/vetrina"
        search={{ app: undefined }}
        onClick={onNavigate}
        className="dashboard-nav-link"
      >
        <PanelsTopLeft className="size-4" />
        <span>{copy.nav.showcase}</span>
      </Link>
      <Link to="/pricing" onClick={onNavigate} className="dashboard-nav-link">
        <CreditCard className="size-4" />
        <span>{copy.nav.pricing}</span>
      </Link>
      <a href="/scheda.html" onClick={onNavigate} className="dashboard-nav-link">
        <BookOpen className="size-4" />
        <span>{copy.nav.help}</span>
      </a>
    </nav>
  );
}

function OwnedProjectCard({
  project,
  locale,
  copy,
}: {
  project: Project;
  locale: ReturnType<typeof useI18n>["locale"];
  copy: ReturnType<typeof authenticatedHomeCopy>;
}) {
  const status = project.hosted
    ? copy.project.filter.online
    : project.status === "building"
      ? copy.project.filter.building
      : project.status === "ready"
        ? copy.project.filter.ready
        : project.status;
  return (
    <Link to="/studio/$id" params={{ id: project.id }} className="group block min-w-0">
      <ProjectCard
        className="dashboard-owned-project-card"
        title={project.title}
        kind={status}
        meta={`${project.credits_spent} cr · ${timeAgo(project.updated_at, locale)}`}
        html={project.html}
      />
    </Link>
  );
}

function OverviewPanel({
  idSuffix,
  copy,
  metrics,
  credits,
  projectsReady,
  accountReady,
  locale,
}: {
  idSuffix: string;
  copy: ReturnType<typeof authenticatedHomeCopy>;
  metrics: ReturnType<typeof dashboardMetrics>;
  credits?: number;
  projectsReady: boolean;
  accountReady: boolean;
  locale: ReturnType<typeof useI18n>["locale"];
}) {
  const items = [
    {
      icon: FolderKanban,
      label: copy.overview.total,
      value: metrics.totalProjects,
      available: projectsReady,
    },
    {
      icon: CheckCircle2,
      label: copy.overview.ready,
      value: metrics.readyProjects,
      available: projectsReady,
    },
    {
      icon: Globe2,
      label: copy.overview.online,
      value: metrics.onlineProjects,
      available: projectsReady,
    },
    { icon: Coins, label: copy.overview.credits, value: credits, available: accountReady },
  ];
  return (
    <section
      className="dashboard-rail-panel"
      aria-labelledby={`dashboard-overview-title-${idSuffix}`}
    >
      <h2 id={`dashboard-overview-title-${idSuffix}`} className="text-sm font-semibold">
        {copy.overview.title}
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.label} className="dashboard-metric-card">
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <item.icon className="size-3.5 text-info" />
              <span>{item.label}</span>
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums">
              {!item.available || typeof item.value !== "number"
                ? "—"
                : formatCredits(item.value, locale)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function BuildPanel({
  idSuffix,
  copy,
  activeBuild,
  locale,
  projectsStatus,
}: {
  idSuffix: string;
  copy: ReturnType<typeof authenticatedHomeCopy>;
  activeBuild: Project | null;
  locale: ReturnType<typeof useI18n>["locale"];
  projectsStatus: ProjectLoadState["status"];
}) {
  return (
    <section className="dashboard-rail-panel" aria-labelledby={`dashboard-build-title-${idSuffix}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={`dashboard-build-title-${idSuffix}`} className="text-sm font-semibold">
          {copy.build.title}
        </h2>
        <Activity className="size-4 text-accent-soft" />
      </div>
      {projectsStatus !== "ready" ? (
        <p className="mt-4 rounded-xl border border-border/70 bg-bg/35 p-3 text-xs text-muted">
          {projectsStatus === "error" ? copy.error : copy.loading}
        </p>
      ) : activeBuild ? (
        <Link
          to="/studio/$id"
          params={{ id: activeBuild.id }}
          className="mt-4 block rounded-xl border border-accent/25 bg-accent/10 p-3"
        >
          <p className="flex items-center gap-2 text-xs text-accent-soft">
            <CircleDot className="size-3.5 animate-pulse motion-reduce:animate-none" />
            {copy.build.active}
          </p>
          <p className="mt-2 truncate text-sm font-medium">{activeBuild.title}</p>
          <p className="mt-1 text-[11px] text-muted">{timeAgo(activeBuild.updated_at, locale)}</p>
        </Link>
      ) : (
        <p className="mt-4 rounded-xl border border-border/70 bg-bg/35 p-3 text-xs text-muted">
          {copy.build.none}
        </p>
      )}
    </section>
  );
}

function RecentActivityPanel({
  copy,
  activity,
  locale,
}: {
  copy: ReturnType<typeof authenticatedHomeCopy>;
  activity: ReturnType<typeof dashboardActivity>;
  locale: ReturnType<typeof useI18n>["locale"];
}) {
  return (
    <section className="dashboard-rail-panel" aria-labelledby="dashboard-activity-title">
      <h2 id="dashboard-activity-title" className="text-sm font-semibold">
        {copy.recent.title}
      </h2>
      {activity.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {activity.map((item) => (
            <li key={item.id} className="flex gap-3 border-b border-border/50 py-2.5 last:border-0">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-elevated text-info">
                {item.type === "project" ? (
                  <FolderKanban className="size-3.5" />
                ) : (
                  <Coins className="size-3.5" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">{item.title}</span>
                <span className="mt-0.5 block text-[10px] text-muted">
                  {item.type === "credit"
                    ? `${item.credits > 0 ? "+" : ""}${item.credits} cr · `
                    : ""}
                  {timeAgo(item.createdAt, locale)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-muted">{copy.recent.none}</p>
      )}
    </section>
  );
}

function initials(user: AppUser): string {
  const value = user.displayName || user.primaryEmail || "H";
  const words = value
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("") || "H"
  );
}

function trapDialogFocus(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
