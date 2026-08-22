import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, CreditCard, Home, KeyRound, Menu, PanelsTopLeft, X } from "lucide-react";
import { AtelierObject } from "@/components/atelier-object";
import { HelpButton } from "@/components/help-drawer";
import { HelixMark } from "@/components/kreluna-mark";
import { SignInPanel } from "@/components/sign-in-panel";
import { authenticatedHomeCopy } from "@/lib/authenticated-home-copy";
import { LOCALES, LOCALE_LABEL, useI18n } from "@/lib/i18n";

/**
 * Signed-out `/`: already inside Helix OS, but the room is closed until Accedi.
 * No marketing landing, no composer, no guest create.
 */
export function HomeSignIn({ prompt }: { prompt?: string }) {
  const { locale, setLocale } = useI18n();
  const copy = authenticatedHomeCopy(locale);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);

  function focusAccedi() {
    setMobileMenuOpen(false);
    window.requestAnimationFrame(() => {
      const root = document.getElementById("home-sign-in");
      root?.scrollIntoView({ block: "center" });
      root?.querySelector<HTMLElement>("button:not(:disabled), input")?.focus();
    });
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
    window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
  }

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
          <HelixMark className="size-12 shrink-0" />
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
          <HelixMark className="size-9" />
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
            <div className="mb-8 flex items-center justify-between">
              <div className="atelier-brand">
                <HelixMark className="size-11" />
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
            <button type="button" className="atelier-accedi mt-8" onClick={focusAccedi}>
              {copy.signIn}
            </button>
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
        </div>

        <section className="atelier-stage" aria-labelledby="dashboard-title">
          <div className="atelier-copy">
            <p className="atelier-kicker">{copy.atelier.kicker}</p>
            <p className="atelier-evening">{copy.atelier.evening}</p>
            <h1 id="dashboard-title" className="atelier-title">
              {copy.atelier.title}
            </h1>
            <p className="atelier-invite">{copy.atelier.invite}</p>
            <p className="atelier-gate">{copy.signedOutLead}</p>
          </div>

          <AtelierObject />

          <div id="home-sign-in" className="atelier-desk">
            <p className="atelier-desk-label">{copy.atelier.desk}</p>
            <SignInPanel next="/" prompt={prompt} titleAs="h2" variant="atelier" />
          </div>
        </section>
      </main>

      <aside className="dashboard-home-rail atelier-rail" aria-label={copy.atelier.room}>
        <section className="atelier-rail-card">
          <p className="atelier-rail-kicker">{copy.atelier.room}</p>
          <p className="atelier-rail-line">{copy.atelier.roomLine}</p>
        </section>
        <section className="atelier-rail-card">
          <p className="atelier-rail-kicker">{copy.atelier.guest}</p>
          <p className="atelier-rail-line">{copy.atelier.guestNote}</p>
          <button type="button" className="atelier-accedi mt-5" onClick={focusAccedi}>
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
  return (
    <nav className="dashboard-nav atelier-nav" aria-label={copy.nav.home}>
      <a href="#dashboard-top" aria-current="page" onClick={onNavigate} className="dashboard-nav-link">
        <Home className="size-4" />
        <span>{copy.nav.home}</span>
      </a>
      <button
        type="button"
        className="dashboard-nav-link"
        onClick={() => {
          onNavigate?.();
          onAccedi();
        }}
      >
        <KeyRound className="size-4" />
        <span>{copy.signIn}</span>
      </button>
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
