import { GEMS } from "@/lib/gems";

export const DESKS = ["ops", "product", "eng", "quality", "growth"] as const;
export type Desk = (typeof DESKS)[number];

export type HouseId =
  | "gemini"
  | "nova"
  | "atlas"
  | "sol"
  | "reed"
  | "lumen"
  | "glyph"
  | "flint"
  | "forge"
  | "basalt"
  | "vault"
  | "prism"
  | "quartz"
  | "apex"
  | "nexus"
  | "key"
  | "orbit"
  | "cedar"
  | "aegis"
  | "veil"
  | "iris"
  | "kiln"
  | "moth"
  | "quill"
  | "swift"
  | "echo"
  | "beacon"
  | "ledger"
  | "harbor"
  | "nimbus"
  | "seal"
  | "folio"
  | "sage"
  | "pulsar"
  | "senate"
  | "twin"
  | "storm"
  | "augur"
  | "archive"
  | "mend"
  | "warden"
  | "patch";

export type HouseAgent = {
  id: HouseId;
  name: string;
  role: string;
  roleIt: string;
  craft: string;
  craftIt: string;
  desk: Desk;
  brief: string;
  briefIt: string;
};

export const HOUSE: HouseAgent[] = [
  { id: "gemini", name: "Helix", role: "Supervisor", roleIt: "Supervisore", craft: "Direction", craftIt: "Direzione", desk: "ops", brief: "Directs the house. Stops bad work. Approves the next phase.", briefIt: "Dirige la house. Ferma il lavoro sbagliato. Approva la fase dopo." },
  { id: "nova", name: "Nova", role: "Product Manager", roleIt: "Product manager", craft: "Product", craftIt: "Prodotto", desk: "product", brief: "Turns a sentence into a PRD, MVP and roadmap.", briefIt: "Trasforma una frase in PRD, MVP e roadmap." },
  { id: "atlas", name: "Atlas", role: "Chief Architect", roleIt: "Capo architetto", craft: "Architecture", craftIt: "Architettura", desk: "product", brief: "Screens and data before any code.", briefIt: "Schermate e dati prima di qualsiasi codice." },
  { id: "sol", name: "Sol", role: "Solution Architect", roleIt: "Solution architect", craft: "Stack", craftIt: "Stack", desk: "product", brief: "Stack vs cost, speed and scale.", briefIt: "Stack rispetto a costo, velocità e scala." },
  { id: "reed", name: "Reed", role: "UX Researcher", roleIt: "Ricercatore UX", craft: "UX research", craftIt: "Ricerca UX", desk: "product", brief: "Journeys, personas, friction.", briefIt: "Percorsi, persone, attriti." },
  { id: "lumen", name: "Lumen", role: "Chief of graphics", roleIt: "Capo della grafica", craft: "Graphics", craftIt: "Grafica", desk: "product", brief: "Looks you can feel. Four directions. You pick.", briefIt: "Aspetto che si sente. Quattro direzioni. Scegli tu." },
  { id: "glyph", name: "Glyph", role: "Design System", roleIt: "Design system", craft: "Visual system", craftIt: "Sistema visivo", desk: "product", brief: "One language of components.", briefIt: "Un solo linguaggio di componenti." },
  { id: "flint", name: "Flint", role: "—", roleIt: "—", craft: "—", craftIt: "—", desk: "eng", brief: "Let go. Did not ship the interior.", briefIt: "Licenziato. Non consegnava l’interno." },
  { id: "forge", name: "Forge", role: "Frontend", roleIt: "Frontend", craft: "Building the app", craftIt: "Scrittura dell’app", desk: "eng", brief: "Writes the product you see and tap.", briefIt: "Scrive il prodotto che vedi e tocchi." },
  { id: "basalt", name: "Basalt", role: "Backend Lead", roleIt: "Lead backend", craft: "Backend", craftIt: "Backend", desk: "eng", brief: "Server work and contracts.", briefIt: "Lavoro server e contratti." },
  { id: "vault", name: "Vault", role: "Backend", roleIt: "Backend", craft: "APIs", craftIt: "API", desk: "eng", brief: "APIs, jobs, business rules.", briefIt: "API, job, regole di business." },
  { id: "prism", name: "Prism", role: "Database Architect", roleIt: "Architetto dati", craft: "Database", craftIt: "Database", desk: "eng", brief: "Tables, relations, scale.", briefIt: "Tabelle, relazioni, scala." },
  { id: "quartz", name: "Quartz", role: "Database Engineer", roleIt: "Ingegnere dati", craft: "Data", craftIt: "Dati", desk: "eng", brief: "Indexes, queries, backups.", briefIt: "Indici, query, backup." },
  { id: "apex", name: "Apex", role: "API Architect", roleIt: "Architetto API", craft: "API design", craftIt: "Disegno API", desk: "eng", brief: "How surfaces talk.", briefIt: "Come parlano le superfici." },
  { id: "nexus", name: "Nexus", role: "Integrations", roleIt: "Integrazioni", craft: "Integrations", craftIt: "Integrazioni", desk: "eng", brief: "Stripe, Google, mail, maps.", briefIt: "Stripe, Google, mail, mappe." },
  { id: "key", name: "Key", role: "Identity", roleIt: "Identità", craft: "Login", craftIt: "Accessi", desk: "eng", brief: "Login, OAuth, roles, sessions.", briefIt: "Login, OAuth, ruoli, sessioni." },
  { id: "orbit", name: "Orbit", role: "Mobile", roleIt: "Mobile", craft: "Mobile", craftIt: "Mobile", desk: "eng", brief: "iOS, Android, PWA.", briefIt: "iOS, Android, PWA." },
  { id: "cedar", name: "Cedar", role: "Desktop", roleIt: "Desktop", craft: "Desktop", craftIt: "Desktop", desk: "eng", brief: "Windows, macOS, Linux.", briefIt: "Windows, macOS, Linux." },
  { id: "aegis", name: "Aegis", role: "Security", roleIt: "Sicurezza", craft: "Security", craftIt: "Sicurezza", desk: "quality", brief: "Can block a deploy.", briefIt: "Può bloccare un deploy." },
  { id: "veil", name: "Veil", role: "Privacy / GDPR", roleIt: "Privacy / GDPR", craft: "Privacy", craftIt: "Privacy", desk: "quality", brief: "Consent, retention, rights.", briefIt: "Consenso, conservazione, diritti." },
  { id: "iris", name: "Iris", role: "QA Director", roleIt: "Direttore QA", craft: "Quality", craftIt: "Qualità", desk: "quality", brief: "What must pass to ship.", briefIt: "Cosa deve passare per pubblicare." },
  { id: "kiln", name: "Kiln", role: "Test Engineer", roleIt: "Ingegnere test", craft: "Tests", craftIt: "Test", desk: "quality", brief: "Unit, API, e2e, browsers.", briefIt: "Unit, API, e2e, browser." },
  { id: "moth", name: "Moth", role: "Bug Hunter", roleIt: "Cacciatore di bug", craft: "Bugs", craftIt: "Bug", desk: "quality", brief: "What tests miss.", briefIt: "Quello che i test non vedono." },
  { id: "quill", name: "Quill", role: "Code Review", roleIt: "Revisione codice", craft: "Review", craftIt: "Revisione", desk: "quality", brief: "Nobody approves their own work.", briefIt: "Nessuno approva il proprio lavoro." },
  { id: "swift", name: "Swift", role: "Performance", roleIt: "Prestazioni", craft: "Speed", craftIt: "Velocità", desk: "quality", brief: "Load, memory, bundle, cache.", briefIt: "Carico, memoria, bundle, cache." },
  { id: "echo", name: "Echo", role: "Accessibility", roleIt: "Accessibilità", craft: "Accessibility", craftIt: "Accessibilità", desk: "quality", brief: "Anyone can use it.", briefIt: "Chiunque deve poterlo usare." },
  { id: "beacon", name: "Beacon", role: "SEO / ASO", roleIt: "SEO / ASO", craft: "Visibility", craftIt: "Visibilità", desk: "growth", brief: "Web and store visibility.", briefIt: "Visibilità web e store." },
  { id: "ledger", name: "Ledger", role: "Cost", roleIt: "Costi", craft: "Cost", craftIt: "Costi", desk: "ops", brief: "Three configs, real tradeoffs.", briefIt: "Tre configurazioni, tradeoff veri." },
  { id: "harbor", name: "Harbor", role: "DevOps", roleIt: "DevOps", craft: "Publish", craftIt: "Pubblicazione", desk: "ops", brief: "CI, staging, rollback.", briefIt: "CI, staging, rollback." },
  { id: "nimbus", name: "Nimbus", role: "Cloud", roleIt: "Cloud", craft: "Cloud", craftIt: "Cloud", desk: "ops", brief: "Vercel, Cloudflare, AWS…", briefIt: "Vercel, Cloudflare, AWS…" },
  { id: "seal", name: "Seal", role: "Release", roleIt: "Rilascio", craft: "Release", craftIt: "Rilascio", desk: "ops", brief: "Score, env, backup, go.", briefIt: "Score, ambiente, backup, via." },
  { id: "folio", name: "Folio", role: "Docs", roleIt: "Documenti", craft: "Docs", craftIt: "Documenti", desk: "growth", brief: "README, API, changelog.", briefIt: "README, API, changelog." },
  { id: "sage", name: "Sage", role: "Business", roleIt: "Business", craft: "Business", craftIt: "Business", desk: "growth", brief: "Pricing, premium, markets.", briefIt: "Prezzi, premium, mercati." },
  { id: "pulsar", name: "Pulsar", role: "Growth", roleIt: "Crescita", craft: "Growth", craftIt: "Crescita", desk: "growth", brief: "Landing, onboarding, conversion.", briefIt: "Landing, onboarding, conversione." },
  { id: "senate", name: "Senate", role: "AI Council", roleIt: "Council AI", craft: "Council vote", craftIt: "Voto del council", desk: "ops", brief: "Specialists vote. Helix decides.", briefIt: "Gli specialisti votano. Helix decide." },
  { id: "twin", name: "Twin", role: "Digital Twin", roleIt: "Digital twin", craft: "Simulation", craftIt: "Simulazione", desk: "quality", brief: "Clicks, forms, failed payments.", briefIt: "Click, form, pagamenti falliti." },
  { id: "storm", name: "Storm", role: "Stress", roleIt: "Stress", craft: "Stress test", craftIt: "Stress test", desk: "quality", brief: "100 to 1,000,000 requests.", briefIt: "Da 100 a 1.000.000 di richieste." },
  { id: "augur", name: "Augur", role: "Future", roleIt: "Futuro", craft: "6-month forecast", craftIt: "Previsione 6 mesi", desk: "ops", brief: "Where it breaks at 80k users.", briefIt: "Dove si rompe a 80mila utenti." },
  { id: "archive", name: "Archive", role: "Memory", roleIt: "Memoria", craft: "Memory", craftIt: "Memoria", desk: "ops", brief: "Why we chose this, months later.", briefIt: "Perché abbiamo scelto così, mesi dopo." },
  { id: "mend", name: "Mend", role: "Improvement", roleIt: "Miglioramento", craft: "Improvements", craftIt: "Migliorie", desk: "ops", brief: "Score up. You approve.", briefIt: "Alza lo score. Approvi tu." },
  { id: "warden", name: "Warden", role: "Maintenance", roleIt: "Manutenzione", craft: "Maintenance", craftIt: "Manutenzione", desk: "ops", brief: "Find, fix in Twin, ship.", briefIt: "Trova, sistema nel Twin, pubblica." },
  { id: "patch", name: "Superior", role: "Principal closer", roleIt: "Principal closer", craft: "Closing", craftIt: "Chiusura", desk: "eng", brief: "Every brief. If the first screen is empty, the job is not done.", briefIt: "Ogni brief. Se la prima schermata è vuota, il lavoro non è finito." },
];

export const HOUSE_BY_ID = Object.fromEntries(HOUSE.map((a) => [a.id, a])) as Record<HouseId, HouseAgent>;

export const PUBLIC_HOUSE = HOUSE.filter((a) => a.role !== "—");

export function agentByName(name: string): HouseAgent | undefined {
  const n = name.trim().toLowerCase();
  return HOUSE.find((a) => a.name.toLowerCase() === n || a.id === n);
}

export function craftOf(name: string, locale = "en"): string {
  const a = agentByName(name);
  if (a) return locale.startsWith("it") ? a.craftIt : a.craft;
  const g = GEMS.find((x) => x.name === name);
  if (g) return locale.startsWith("it") ? g.craftIt : g.craft;
  return locale.startsWith("it") ? "Lavoro" : "Work";
}

export function roleOf(name: string, locale = "en"): string {
  const a = agentByName(name);
  if (a) return locale.startsWith("it") ? a.roleIt : a.role;
  return "";
}

export type Need = "payments" | "auth" | "data" | "mobile" | "desktop" | "seo" | "game" | "privacy";

export function detectNeeds(prompt: string): Need[] {
  const p = prompt.toLowerCase();
  const needs: Need[] = [];
  if (/pagament|stripe|paypal|checkout|abbon|subscription|paywall|prenot|booking|cart|shop/.test(p)) needs.push("payments");
  if (/login|account|auth|signup|registr|oauth|google|firebase/.test(p)) needs.push("auth");
  if (/dati|data|crud|lista|list|database|prenot|booking|note|inventory|magazzino|immobil|appartament|property|catalog|gestional|fattur|clienti|erp|software|programma/.test(p)) needs.push("data");
  if ((/ios|android|testflight|mobile|app store|play store|iphone|\bapp\b|applicaz/.test(p)) && !/programma|software desktop|windows|macos/.test(p)) needs.push("mobile");
  if (/desktop|windows|macos|linux|electron|tauri|programma|software per|gestionale|erp/.test(p)) needs.push("desktop");
  if (/sito|site|landing|seo|blog|ristor|caff|studio|agenzia|portfolio/.test(p)) needs.push("seo");
  if (/gioco|game|play|puzzle|memory/.test(p)) needs.push("game");
  if (/gdpr|privacy|consent|cookie|health|medical|bambin|minor/.test(p)) needs.push("privacy");
  return needs;
}

export type Gear = "auto" | "house" | "fast";

export function orchestrate(
  prompt: string,
  mode: "generate" | "iterate" | "debug",
  gear: Gear = "auto",
  max = false,
): {
  needs: Need[];
  active: HouseId[];
  standby: HouseId[];
  why: string;
  phases: string[];
} {
  const needs = detectNeeds(prompt);
  const active: HouseId[] = ["gemini"];

  if (mode !== "generate" || gear === "fast") {
    active.push("forge", "iris", "patch");
    if (max || mode !== "generate") active.push("twin", "moth", "mend");
  } else if (gear === "house") {
    for (const a of HOUSE) {
      if (a.role !== "—") active.push(a.id);
    }
  } else {
    active.push("nova", "atlas", "sol", "reed", "archive", "lumen", "glyph");
    if (needs.includes("data") || needs.includes("payments") || needs.includes("auth")) {
      active.push("basalt", "vault", "prism", "quartz", "apex");
    }
    if (needs.includes("payments") || needs.includes("auth")) active.push("nexus", "key");
    active.push("forge");
    if (needs.includes("mobile")) active.push("orbit");
    if (needs.includes("desktop")) active.push("cedar", "basalt", "vault", "prism");
    if (needs.includes("data") && !active.includes("vault")) active.push("vault", "prism");
    active.push("twin", "iris", "quill", "patch", "harbor", "seal");
    if (max) {
      active.push("storm", "senate", "aegis", "echo", "mend", "warden");
    }
    if (needs.includes("seo")) active.push("beacon");
  }

  if (max) {
    for (const id of ["senate", "twin", "storm", "iris", "patch", "lumen"] as HouseId[]) {
      if (!active.includes(id)) active.push(id);
    }
  }

  const uniq = [...new Set(active)];
  const standby = HOUSE.map((a) => a.id).filter((id) => !uniq.includes(id));
  const why =
    gear === "fast"
      ? `Helix · Veloce · ${uniq.length} desk`
      : gear === "house"
        ? `Helix · House intera · ${uniq.length}`
        : `Helix · Auto · ${uniq.length} · ${needs.join(", ") || "core"}`;
  return {
    needs,
    active: uniq,
    standby,
    why,
    phases: ["idea", "prd", "architecture", "design", "build", "review", "twin", "score", "release"],
  };
}

export type LocalFinding = { agent: HouseId; must: boolean; note: string };

export function localExperts(html: string, prompt: string): LocalFinding[] {
  const out: LocalFinding[] = [];
  const h = html.toLowerCase();
  if (/localStorage|sessionStorage|document\.cookie/.test(html)) {
    out.push({ agent: "aegis", must: true, note: "Storage APIs break in the sandbox. Use memory." });
  }
  if (/eval\(|innerhtml\s*=/.test(h)) {
    out.push({ agent: "aegis", must: true, note: "Dangerous HTML injection / eval." });
  }
  if (!/https:\/\/images\.unsplash\.com/.test(html) && /sito|site|caff|cafe|studio|landing/.test(prompt.toLowerCase())) {
    out.push({ agent: "lumen", must: false, note: "No photography. Brand sites need real photos." });
  }
  if (!/<label/i.test(html) && /<input/i.test(html)) {
    out.push({ agent: "echo", must: true, note: "Inputs without labels." });
  }
  if (!/<html[^>]*lang=/i.test(html)) {
    out.push({ agent: "echo", must: false, note: "Missing html lang." });
  }
  if (html.length > 120000) {
    out.push({ agent: "swift", must: false, note: "Source is heavy. Trim assets." });
  }
  if (!/<title>/i.test(html) || /<title>\s*<\/title>/i.test(html)) {
    out.push({ agent: "beacon", must: true, note: "Empty or missing title." });
  }
  if (!/privacy|gdpr|dati/i.test(html) && /account|login|email|prenot/.test(prompt.toLowerCase())) {
    out.push({ agent: "veil", must: false, note: "Collects data without a privacy note." });
  }
  if (!/<button|<a /i.test(html)) {
    out.push({ agent: "moth", must: true, note: "No clickable actions." });
  }
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const photos = (html.match(/<img\b/gi) ?? []).length;
  if (visible.length < 520 || ((/nav|tabbar|bottom-nav|tab-bar/i.test(html) || (html.match(/<button/gi) ?? []).length >= 4) && photos < 2 && visible.length < 900)) {
    out.push({
      agent: "patch",
      must: true,
      note: "First screen is chrome without the product. Fill the primary view for THIS brief: real items, working controls, tabs that swap interiors. Header + empty + bar = fail on every kind of app.",
    });
  }
  if (/lorem ipsum|welcome to our app|your company/i.test(html)) {
    out.push({ agent: "quill", must: true, note: "Placeholder copy left in." });
  }
  if (!/addEventListener|onclick/i.test(html)) {
    out.push({ agent: "storm", must: false, note: "Little interactivity under load of real use." });
  }
  if (!/localStorage/.test(html) && /prenot|booking|lista|note/.test(prompt.toLowerCase())) {
    out.push({ agent: "augur", must: false, note: "Data dies on refresh. Plan persistence after launch." });
  }
  return out;
}

export function knowledgeHints(prompt: string): string[] {
  const p = prompt.toLowerCase();
  const hints: string[] = [
    "Law for every brief: the first viewport IS the product. Not a shell. Tabs and nav swap filled views. Every primary tap changes the UI.",
  ];
  if (/prenot|book|tavolo|table|ristor|bar /.test(p)) {
    hints.push("Booking/venue: menu or slots on first screen, name + covers, confirm, taken slots disabled.");
  }
  if (/ebay|marketplace|annunci|compravend/.test(p)) {
    hints.push("Marketplace: 8 listings on first screen with photo, price, place. Search filters the list. Tap = detail. Not a CRM. Not appointments.");
  }
  if (/pagament|stripe|pay|checkout|shop|negozio|e-?commerc/.test(p) && !/ebay|marketplace|annunci/.test(p)) {
    hints.push("Shop/pay: 4+ products visible, add to bag, bag total, fake checkout success. No live keys.");
  }
  if (/todo|lista|habit|task/.test(p)) {
    hints.push("Lists: seed 5 items. Add, toggle, remove in memory.");
  }
  if (/gioco|game|memory|play/.test(p)) {
    hints.push("Games: start, play, score, restart. Keyboard + tap.");
  }
  if (/immobil|agenzia|casa|appartament|listing|realtor|hinterland/.test(p)) {
    hints.push("Estate: 6 homes on first screen — photo, price, mq, zone. Heart. Tap = detail + visit.");
  }
  if (/dashboard|kpi|analytics|crm|admin|gestional|fattur|erp/.test(p)) {
    hints.push("Software/dashboard: sidebar, 4 KPIs, a table of 8 specific rows, open a record, create/edit/delete. Filters change the table. This is a PROGRAM, not a landing page.");
  }
  if (/software|programma|gestional|erp|fattur|ufficio/.test(p)) {
    hints.push("Program/software: window layout (sidebar + main). Seed clients, invoices, items. Search works. New record form. Totals recompute. Keyboard: / focuses search.");
  }
  if (/desktop|windows|macos|electron|pc\b/.test(p)) {
    hints.push("Desktop program: title bar, menu, sidebar, status bar. Dense tables. Feels installed. Cedar packs Windows/macOS later.");
  }
  if (/social|feed|chat|messagg/.test(p)) {
    hints.push("Feed/chat: 6 seeded posts or threads. Composer adds one. Heart/reply works.");
  }
  if (/corso|course|lezione|school|learn/.test(p)) {
    hints.push("Learn: course list on first screen, open a lesson, mark done.");
  }
  if (/calend|agenda|appunt/.test(p)) {
    hints.push("Calendar: week view with 4 events, tap to add, confirm.");
  }
  hints.push("Reuse: one accent, two fonts, real Unsplash when it is visual, no emoji icons.");
  return hints;
}

export function aftercare(title: string, prompt: string, needs: Need[]) {
  return {
    sage: needs.includes("payments")
      ? `${title}: charge per booking or a monthly table-hold. Free teaser, paid seats.`
      : `${title}: start free, charge when they want it online or branded.`,
    pulsar: `${title} — ${prompt.slice(0, 80)}`,
    folio: "README: open live preview. Primary action on first screen. Iterate from Helix.",
    ledger: needs.includes("payments") || needs.includes("auth")
      ? "A €160  B €90  C €55 — C is static; B adds a small API; A is full auth+pay."
      : "A €38  B €18  C €8 — C is the PWA on Kreluna. B adds analytics. A adds a backend.",
    harbor: "Web + TestTrack from Launch. Rollback = previous version.",
    seal: "Ship web when Score ≥ 80 and Aegis has no blockers.",
    warden: "After launch: errors, cost, deps. Fix in Twin, then ask you.",
    nimbus: "Preview on Kreluna. Production: Cloudflare or Vercel. Stores via Expo.",
  };
}

export function stackFor(needs: Need[]) {
  const front = needs.includes("desktop")
    ? "Working program UI now (HTML). Cedar packs Electron/Tauri for Windows, macOS, Linux."
    : "Single HTML app (CSS + JS). Later: React if the product outgrows it.";
  const back = needs.includes("data") || needs.includes("auth") || needs.includes("payments")
    ? "In-memory now. Next: Postgres + a thin API."
    : "No server yet. Static hosting is enough.";
  const db = needs.includes("data") || needs.includes("payments")
    ? "Prisma-style: users, records, events. Postgres when you leave preview."
    : "None. Content is in the page.";
  const auth = needs.includes("auth") ? "Preview session in memory. Next: Better Auth + Google." : "Not required.";
  return { front, back, db, auth };
}
