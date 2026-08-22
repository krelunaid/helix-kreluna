import { HelpButton } from "@/components/help-drawer";
import { HelixMark } from "@/components/kreluna-mark";
import { SignInPanel } from "@/components/sign-in-panel";
import { authenticatedHomeCopy } from "@/lib/authenticated-home-copy";
import { LOCALES, LOCALE_LABEL, useI18n } from "@/lib/i18n";

/**
 * Signed-out `/`: the Helix OS shell, then Accedi.
 * No marketing landing, no composer, no guest create.
 */
export function HomeSignIn({ prompt }: { prompt?: string }) {
  const { locale, setLocale } = useI18n();
  const copy = authenticatedHomeCopy(locale);

  return (
    <div id="dashboard-top" className="dashboard-home-shell">
      <a href="#dashboard-main" className="dashboard-skip-link">
        {copy.skipToContent}
      </a>
      <aside className="dashboard-home-sidebar">
        <div className="flex items-center gap-3 px-2 py-1">
          <HelixMark className="size-14 shrink-0" />
          <span>
            <span className="block font-semibold tracking-[0.08em]">KRELUNA</span>
            <span className="block text-[10px] tracking-[0.16em] text-subtle uppercase">
              Helix OS
            </span>
          </span>
        </div>
      </aside>
      <header className="dashboard-mobile-header">
        <HelixMark className="size-10" />
        <span className="text-sm font-semibold">Helix</span>
        <span className="dashboard-avatar" aria-hidden>
          H
        </span>
      </header>
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
        </div>

        <section className="dashboard-hero" aria-labelledby="dashboard-title">
          <div className="dashboard-hero-copy">
            <p className="text-sm text-muted">
              {copy.greeting} <span aria-hidden>👋</span>
            </p>
            <h1 id="dashboard-title" className="dashboard-hero-title">
              {copy.headlineBefore} <span>{copy.headlineAccent}</span> {copy.headlineAfter}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
              {copy.signedOutLead}
            </p>
          </div>
          <div className="mt-8 max-w-md">
            <SignInPanel next="/" prompt={prompt} />
          </div>
        </section>
      </main>
    </div>
  );
}
