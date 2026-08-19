import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { t, type Locale } from "@/lib/i18n-core";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function titleFromPrompt(prompt: string, locale: Locale = "en") {
  const text = prompt.trim().replace(/\s+/g, " ");
  if (!text) return t(locale, "new.project");
  return text.length > 42 ? `${text.slice(0, 40)}…` : text;
}

export function formatCredits(n: number, locale: Locale = "en") {
  return new Intl.NumberFormat(locale).format(n);
}

export function timeAgo(iso: string, locale: Locale = "en") {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const s = Math.max(0, (Date.now() - d) / 1000);
  if (s < 60) return t(locale, "time.now");
  if (s < 3600) return t(locale, "time.min", { n: Math.floor(s / 60) });
  if (s < 86400) return t(locale, "time.hr", { n: Math.floor(s / 3600) });
  return t(locale, "time.day", { n: Math.floor(s / 86400) });
}
