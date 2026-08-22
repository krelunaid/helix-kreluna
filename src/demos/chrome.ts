import type { Locale } from "@/lib/i18n-core";

const IT = {
  back: "Vetrina",
  reset: "Ricomincia",
  tour: "Percorso guidato",
  touring: "In corso",
  made: "Demo interattiva realizzata con Helix",
  create: "Crea qualcosa di simile",
} as const;

const EN = {
  back: "Showcase",
  reset: "Start over",
  tour: "Guided path",
  touring: "In progress",
  made: "Interactive demo made with Helix",
  create: "Create something like this",
} as const;

export type DemoChrome = typeof IT;

export function demoChrome(locale: Locale): DemoChrome {
  return locale === "it" ? IT : EN;
}

export function pickLine(locale: Locale, it: string, en: string) {
  return locale === "it" ? it : en;
}
