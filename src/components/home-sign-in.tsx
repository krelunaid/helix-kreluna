import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
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
 * No marketing landing, no composer, no guest create.
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
        <Link to="/" className="atelier-brand">
          <HelixMark className="size-14 shrink-0" />
          <span>
            <span className="atelier-brand-name">Kreluna</span>
            <span className="atelier-brand-os">Helix OS</span>
          </span>
        </Link>
        <SignedOutNavigation copy={copy} onAccedi={focusAccedi} />
        <div className="mt-auto space-y-3">
          <div className="atelier-guest-card">
            <p className="atelier-guest-label">{copy.atelier.guest}</p>
            <p className="atelier-guest-note">{copy.atelier.guestNote}</p>
            <p className="atelier-guest-gate">{copy.signedOutLead}</p>
            <button type="button" className="atelier-accedi" onClick={focusAccedi}>
              {copy.signIn}
            </button>
          </div>
        </div>
      </aside>

      <header className="dashboard-mobile-header atelier-mobile-header">
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
        <Link to="/" className="atelier-mobile-mark">
          <HelixMark className="size-10" />
          <span>Helix</span>
        </Link>
        <button type="button" className="atelier-accedi atelier-accedi-compact" onClick={focusAccedi}>
          {copy.signIn}
        </button>
      </header>

      {mobileMenuOpen ? (
        <div className="dashboard-mobile-drawer" role="presentation" onClick={closeMobileMenu}>
          <aside
            className="dashboard-mobile-drawer-panel atelier-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={copy.nav.home}
            onKeyDown={trapDialogFocus}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <div className="atelier-brand">
                <HelixMark className="size-12" />
                <div>
                  <p className="atelier-brand-name">Kreluna</p>
                  <p className="atelier-brand-os">Helix OS</p>
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

      <main id="dashboard-main" className="dashboard-home-main atelier-main">
        <div className="atelier-toolbar">
          <HelpButton />
          <label className="sr-only" htmlFor="home-language">
            {copy.nav.home}
          </label>
          <select
            id="home-language"
            value={locale}
            onChange={(event) => setLocale(event.target.value as typeof locale)}
            className="atelier-select"
          >
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_LABEL[code]}
              </option>
            ))}
          </select>
          <button type="button" className="atelier-account-pill" onClick={focusAccedi}>
            {copy.atelier.guest}
          </button>
        </div>

        <section id="dashboard-create" className="atelier-studio-hero" aria-labelledby="dashboard-title">
          <div className="atelier-copy">
            <p className="atelier-evening">
              {copy.greeting} <span aria-hidden>👋</span>
            </p>
            <h1 id="dashboard-title" className="atelier-title">
              {copy.headlineBefore} <em>{copy.headlineAccent}</em> {copy.headlineAfter}
            </h1>
            <p className="atelier-invite">{copy.lead}</p>
            <p className="atelier-gate">{copy.signedOutLead}</p>
          </div>
          <AtelierObject />
          <div className="atelier-desk">
            <p className="atelier-desk-label">{copy.createSection}</p>
            {accediOpen ? (
              <div id="home-sign-in">
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
                <span className="atelier-accedi atelier-accedi-inline">{copy.signIn}</span>
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

        <section className="mt-8" aria-labelledby="quick-create-title">
          <h2 id="quick-create-title" className="atelier-section-label">
            {copy.quickCreate}
          </h2>
          <div className="atelier-quick-grid">
            {copy.quickPresets.map((preset, index) => {
              const Icon = QUICK_ICONS[index];
              return (
                <button
                  key={preset.label}
                  type="button"
                  className="atelier-quick-card"
                  onClick={focusAccedi}
                >
                  <span className="atelier-quick-icon">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{preset.label}</span>
                    <span className="mt-1 block text-xs leading-4 text-[color:var(--atelier-muted)]">
                      {preset.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section
          id="dashboard-projects"
          className="atelier-project-section"
          aria-labelledby="dashboard-projects-title"
        >
          <button type="button" className="atelier-locked-projects" onClick={focusAccedi}>
            <span className="atelier-quick-icon">
              <FolderKanban className="size-5" />
            </span>
            <span>
              <h2 id="dashboard-projects-title" className="text-2xl tracking-tight">
                {copy.empty.title}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--atelier-muted)]">
                {copy.signedOutLead}
              </p>
            </span>
          </button>
        </section>
      </main>

      <aside className="dashboard-home-rail atelier-rail" aria-label={copy.overview.title}>
        <section className="atelier-rail-card">
          <p className="atelier-rail-kicker">{copy.overview.title}</p>
          <p className="atelier-rail-line">{copy.atelier.roomLine}</p>
          <p className="atelier-guest-gate">{copy.signedOutLead}</p>
        </section>
        <section className="atelier-rail-card">
          <p className="atelier-rail-kicker">{copy.build.title}</p>
          <p className="atelier-rail-line">{copy.atelier.guestNote}</p>
          <button type="button" className="atelier-accedi" onClick={focusAccedi}>
            {copy.signIn}
          </button>
        </section>
        <Link to="/vetrina" search={{ app: undefined }} className="atelier-rail-link">
          <PanelsTopLeft className="size-4" />
          {copy.nav.showcase}
        </Link>
        <div className="atelier-rail-help">
          <p>Helix by Kreluna</p>
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
    <nav className="dashboard-nav atelier-nav" aria-label={copy.nav.home}>
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
