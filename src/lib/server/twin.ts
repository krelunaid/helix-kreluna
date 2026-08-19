import type { TwinReport } from "@/lib/score";

/**
 * Digital Twin without Chromium. Playwright cannot ship in the Vercel/Grok
 * build (rolldown pulls playwright-core). We inspect the HTML the same way
 * a first pass of Twin would: controls, forms, dead links, empty states.
 */
export async function runTwin(html: string): Promise<TwinReport> {
  const empty: TwinReport = { errors: [], clicks: [], forms: 0, deadClicks: 0 };
  if (html.length < 80) return empty;

  const errors: string[] = [];
  const clicks: TwinReport["clicks"] = [];

  if (!/<button[\s>]/i.test(html) && !/type=["']submit["']/i.test(html)) {
    errors.push("No primary button.");
  }
  if (/TODO|lorem ipsum|coming soon/i.test(html)) {
    errors.push("Placeholder copy still in the page.");
  }
  if ((html.match(/<img\b/gi) ?? []).length === 0) {
    errors.push("No images.");
  }
  if (/javascript:\s*void/i.test(html) || /href=["']#["']/i.test(html)) {
    errors.push("Dead hash / void links.");
  }

  const forms = (html.match(/<form[\s>]/gi) ?? []).length;
  const buttonLabels = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 40),
  );
  const named = buttonLabels.filter(Boolean).slice(0, 8);
  for (const label of named) {
    const changed = /prenot|book|add|aggiung|salva|save|paga|pay|invia|send|tieni|hold|riserv/i.test(label);
    clicks.push({ label, changed });
  }
  if (forms) clicks.push({ label: "form submit", changed: /<form\b[^>]*onsubmit=/i.test(html) });

  const deadClicks = clicks.filter((c) => !c.changed).length;
  return {
    errors: errors.slice(0, 8),
    clicks,
    forms,
    deadClicks,
  };
}
