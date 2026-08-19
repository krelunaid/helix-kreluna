import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  detectLocale,
  persistLocale,
  t as translate,
  type Locale,
} from "@/lib/i18n-core";
import type { MessageKey } from "@/lib/messages";

export {
  LOCALES,
  LOCALE_LABEL,
  LOCALE_NAME,
  detectLocale,
  normalizeLocale,
  persistLocale,
  t,
  type Locale,
} from "@/lib/i18n-core";

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const next = detectLocale();
    setLocaleState(next);
    persistLocale(next);
    setReady(true);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale: (next) => {
        setLocaleState(next);
        persistLocale(next);
      },
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale],
  );

  return (
    <I18nContext.Provider value={value}>
      <div className={ready ? "min-h-screen" : "min-h-screen opacity-0"}>{children}</div>
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      locale: "en" as Locale,
      setLocale: () => undefined,
      t: (key: MessageKey, vars?: Record<string, string | number>) => translate("en", key, vars),
    };
  }
  return ctx;
}
