import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  Braces,
  CreditCard,
  FolderKanban,
  Globe2,
  Home,
  LayoutDashboard,
  Menu,
  PanelsTopLeft,
  Plus,
  ShoppingBag,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { AtelierObject } from "@/components/atelier-object";
import { HelpButton } from "@/components/help-drawer";
import { HelixMark } from "@/components/kreluna-mark";
import { SignInPanel } from "@/components/sign-in-panel";
import { StudioDemoGallery } from "@/components/studio-demo-gallery";
import { authenticatedHomeCopy } from "@/lib/authenticated-home-copy";
import { LOCALES, LOCALE_LABEL, useI18n } from "@/lib/i18n";

const QUICK_ICONS = [Globe2, Smartphone, LayoutDashboard, Braces, Sparkles, ShoppingBag] as const;

/**
 * Signed-out `/`: the same Helix OS studio chrome, already visible.
 * Accedi appears when the visitor tries to create, open projects, or use credits.
 * No marketing landing, no composer submit, no guest create.
 */
export function HomeSignIn({ prompt }: { prompt?: string }) {
  const { locale, setLocale } = useI18n();
  const copy = authenticatedHomeCopy(locale);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accediOpen, setAccediOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);

  function focusAccedi() {
    setMobileMenuOpen(false);
    setAccediOpen(true);
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
    window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
  }

  useEffect(() => {
    if (!accediOpen) return;
    const root = document.getElementById("home-sign-in");
    root?.scrollIntoView({ block: "center" });
    root?.querySelector<HTMLElement>("button:not(:disabled), input")?.focus();
  }, [accediOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileMenu();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  return (
    <div id="dashboard-top" className="dashboard-home-shell atelier-home">
      <a href="#dashboard-main" className="dashboard-skip-link">
        {copy.skipToContent}
      </a>

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
        <SignedOutNavigation copy={copy} onAccedi={focusAccedi} />
        <div className="mt-auto space-y-3">
          <button type="button" className="dashboard-user-card" onClick={focusAccedi}>
            <span className="dashboard-avatar">H</span>
            <span className="min-w-0 text-left">
              <span className="block truncate text-sm font-medium">{copy.atelier.guest}</span>
              <span className="block truncate text-[11px] text-muted">{copy.atelier.room}</span>
            </span>
          </button>
        </div>
      </aside>

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
        <button type="button" className="dashboard-avatar" onClick={focusAccedi} aria-label={copy.signIn}>
          H
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
            <SignedOutNavigation copy={copy} onAccedi={focusAccedi} onNavigate={closeMobileMenu} />
          </aside>
        </div>
      ) : null}

      <main id="dashboard-main" className="dashboard-home-main">
        <div className="dashboard-top-actions">
          <HelpButton />
          <label className="sr-only" htmlFor="home-language">
            {copy.nav.home}
          </label>
          <select
            id="home-language"
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
          <button type="button" className="dashboard-account-pill" onClick={focusAccedi}>
            <span className="dashboard-avatar dashboard-avatar-small">H</span>
            <span className="max-w-32 truncate">{copy.atelier.guest}</span>
          </button>
        </div>

        <section id="dashboard-create" className="dashboard-hero" aria-labelledby="dashboard-title">
          <div className="dashboard-hero-copy">
            <p className="text-sm text-muted">
              {copy.greeting} <span aria-hidden>👋</span>
            </p>
            <h1 id="dashboard-title" className="dashboard-hero-title">
              {copy.headlineBefore} <span>{copy.headlineAccent}</span> {copy.headlineAfter}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">{copy.lead}</p>
          </div>
          <AtelierObject className="dashboard-hero-orb" />
          <div className="dashboard-composer-wrap">
            <p className="mb-3 text-xs font-semibold tracking-[0.16em] text-accent-soft uppercase">
              {copy.createSection}
            </p>
            {accediOpen ? (
              <div id="home-sign-in">
                <p className="mb-3 text-sm text-muted">{copy.signedOutLead}</p>
                <SignInPanel next="/" prompt={prompt} titleAs="h2" variant="atelier" />
              </div>
            ) : (
              <button
                type="button"
                id="home-sign-in"
                className="atelier-locked-composer"
                onClick={focusAccedi}
              >
                <span className="atelier-locked-placeholder">{copy.createPlaceholder}</span>
              </button>
            )}
          </div>
        </section>

        <StudioDemoGallery
          locale={locale}
          title={copy.studioDemos.title}
          lead={copy.studioDemos.lead}
          open={copy.studioDemos.open}
          andrea={copy.studioDemos.andrea}
        />

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
                  onClick={focusAccedi}
                >
                  <span className="dashboard-quick-icon">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-fg">{preset.label}</span>
                    <span className="mt-1 block text-xs leading-4 text-muted">{preset.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section
          id="dashboard-projects"
          className="dashboard-project-section"
          aria-labelledby="dashboard-projects-title"
        >
          <button type="button" className="atelier-locked-projects" onClick={focusAccedi}>
            <span className="dashboard-empty-icon">
              <Sparkles className="size-5" />
            </span>
            <span>
              <h2 id="dashboard-projects-title" className="text-2xl tracking-tight">
                {copy.empty.title}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{copy.empty.lead}</p>
            </span>
          </button>
        </section>
      </main>

      <aside className="dashboard-home-rail" aria-label={copy.overview.title}>
        <section className="dashboard-rail-panel" aria-labelledby="dashboard-overview-title-signed-out">
          <h2 id="dashboard-overview-title-signed-out" className="text-sm font-semibold">
            {copy.overview.title}
          </h2>
          <p className="mt-3 text-sm text-muted">{copy.atelier.roomLine}</p>
        </section>
        <section className="dashboard-rail-panel" aria-labelledby="dashboard-build-title-signed-out">
          <div className="flex items-center justify-between gap-3">
            <h2 id="dashboard-build-title-signed-out" className="text-sm font-semibold">
              {copy.build.title}
            </h2>
            <Activity className="size-4 text-accent-soft" />
          </div>
          <button type="button" className="mt-4 w-full rounded-xl border border-border/70 bg-bg/35 p-3 text-left text-xs text-muted" onClick={focusAccedi}>
            {copy.build.none}
          </button>
        </section>
        <section className="dashboard-rail-panel" aria-labelledby="dashboard-activity-title">
          <h2 id="dashboard-activity-title" className="text-sm font-semibold">
            {copy.recent.title}
          </h2>
          <p className="mt-4 text-xs text-muted">{copy.recent.none}</p>
        </section>
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
    </div>
  );
}

function SignedOutNavigation({
  copy,
  onAccedi,
  onNavigate,
}: {
  copy: ReturnType<typeof authenticatedHomeCopy>;
  onAccedi: () => void;
  onNavigate?: () => void;
}) {
  const items = [
    { icon: Home, label: copy.nav.home, href: "#dashboard-top", current: true },
    { icon: Plus, label: copy.nav.newProject, href: "#home-sign-in" },
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
            if (item.href !== "#dashboard-top") {
              event.preventDefault();
              onAccedi();
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

function trapDialogFocus(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
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
