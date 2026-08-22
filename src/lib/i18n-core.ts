import { MESSAGES, type MessageKey } from "@/lib/messages";

export const LOCALES = ["it", "en", "es", "fr", "de", "pt"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABEL: Record<Locale, string> = {
  it: "Italiano",
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
};

export const LOCALE_NAME: Record<Locale, string> = {
  it: "Italian",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
};

const COOKIE = "kreluna.locale";
const STORE = "kreluna.locale";

export const DEFAULT_LOCALE: Locale = "it";

export function isLocale(v: string): v is Locale {
  return (LOCALES as readonly string[]).includes(v);
}

export function normalizeLocale(raw?: string | null): Locale {
  if (!raw) return DEFAULT_LOCALE;
  const base = raw.trim().slice(0, 2).toLowerCase();
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

export function pickFromLanguages(langs: readonly string[]): Locale {
  for (const lang of langs) {
    const loc = normalizeLocale(lang);
    if (lang && loc !== "en") return loc;
    if (lang?.toLowerCase().startsWith("en")) return "en";
  }
  for (const lang of langs) {
    if (lang) return normalizeLocale(lang);
  }
  return DEFAULT_LOCALE;
}

export function detectLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const saved = localStorage.getItem(STORE);
    if (saved && isLocale(saved)) return saved;
  } catch {
    /* ignore */
  }
  const cookie =
    typeof document !== "undefined"
      ? document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([a-z]{2})`))
      : null;
  if (cookie?.[1] && isLocale(cookie[1])) return cookie[1];
  const langs = navigator.languages?.length
    ? navigator.languages
    : [navigator.language || DEFAULT_LOCALE];
  return pickFromLanguages(langs);
}

export function persistLocale(locale: Locale) {
  try {
    localStorage.setItem(STORE, locale);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    document.cookie = `${COOKIE}=${locale};path=/;max-age=31536000;samesite=lax`;
    document.documentElement.lang = locale;
  }
}

export function t(locale: Locale, key: MessageKey, vars?: Record<string, string | number>) {
  const table = MESSAGES[locale] ?? MESSAGES.en;
  let s = table[key] ?? MESSAGES.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
