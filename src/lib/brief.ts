export type Form = "app" | "site" | "shop" | "dashboard" | "game" | "software" | "desktop";
export type Domain =
  | "marketplace"
  | "shop"
  | "crm"
  | "booking"
  | "inventory"
  | "feed"
  | "learn"
  | "estate"
  | "cafe"
  | "fashion"
  | "tool"
  | "game"
  | "erp"
  | "saas"
  | "generic";

export type Brief = {
  form: Form;
  domain: Domain;
  lock: string;
};

export function wantsDesktop(prompt: string): boolean {
  const p = prompt.toLowerCase();
  if (/\bapp\b|iphone|android|telefono|cellulare|smartphone|mobile/.test(p) && !/windows|desktop|pc\b|programma|software/.test(p)) {
    return false;
  }
  return /windows|microsoft store|desktop|\bpc\b|programma per computer|software per windows|win32|macos|linux|electron|tauri/.test(p);
}

export function classifyBrief(prompt: string): Brief {
  const p = prompt.toLowerCase().normalize("NFKD");

  const analog = /simile(?: a)|come un[oa]? |tipo |like |ispirat|sullo stile|in stile/.test(p);
  const marketBrand = /ebay|e-bay|subito\.?it|vinted|leboncoin|wallapop|craigslist|mercari|kleinanzeigen|facebook marketplace/;
  const wantsMarket =
    marketBrand.test(p) ||
    /marketplace|annunci|compravend|asta|vendite tra|tra privati|usato|second.?hand|compra e vendi|vendo e compro/.test(p) ||
    (analog && marketBrand.test(p));

  const wantsShop =
    !wantsMarket &&
    /e-?commerc|negozio online|carrello|checkout|shopify|il mio shop|catalogo prodotti|storefront/.test(p);
  const wantsBooking = /appuntament|prenot|booking|agenda|calendario|tavolo/.test(p);
  const wantsCrm = /crm|gestionale|fascicol|clienti e documenti|anagrafic/.test(p);
  const wantsSoft =
    /software|programma(?!zione)|applicativo|gestionale|erp|fattur|contabilit|magazzino|pos\b|cassa|ufficio|saas|portale aziend|intranet/.test(p);
  const wantsDesk = wantsDesktop(prompt);
  const wantsCafe = /caff|ristor|trattoria|bistrot|bar |menu /.test(p);
  const wantsFashion = /moda|fashion|lookbook|boutique|abiti/.test(p);
  const wantsGame = /gioco|game|puzzle|memory/.test(p);
  const wantsDash = /dashboard|kpi|analytics/.test(p);
  const wantsEstate = /immobil|appartament|agenzia casa|realtor/.test(p);
  const wantsFeed = /social|feed|chat|messagg|whatsapp|telegram/.test(p);
  const wantsLearn = /corso|lezione|scuola|learn/.test(p);
  const wantsInv = /magazzino|inventory|scorte|inventario/.test(p);

  const saidApp =
    /\bapp\b|applicaz|iphone|android|mobile|telefono|cellulare|smartphone|tab in basso|da telefon/.test(p);
  const saidSite = /sito|website|landing|vetrina web/.test(p);
  const saidNotShop = /non (è |e )?(un )?e-?commerc|non un negozio|niente carrello|non shop|non selezionare/.test(p);
  const saidProgram = /programma|software|desktop|windows|macos|linux|electron/.test(p);

  let domain: Domain = "generic";
  if (wantsGame) domain = "game";
  else if (wantsMarket) domain = "marketplace";
  else if (wantsShop && !saidNotShop) domain = "shop";
  else if (wantsCrm || (wantsSoft && wantsBooking)) domain = "crm";
  else if (wantsInv || /erp|magazzino|scorte/.test(p)) domain = "erp";
  else if (wantsSoft && /saas|abbon|subscription|multi.?tenant/.test(p)) domain = "saas";
  else if (wantsSoft) domain = "crm";
  else if (wantsBooking && !wantsMarket && !saidApp) domain = "booking";
  else if (wantsCafe) domain = "cafe";
  else if (wantsFashion) domain = "fashion";
  else if (wantsEstate) domain = "estate";
  else if (wantsDash) domain = "generic";
  else if (wantsFeed) domain = "feed";
  else if (wantsLearn) domain = "learn";
  else if (saidApp) domain = "tool";

  let form: Form = "app";
  if (wantsGame) form = "game";
  else if (wantsDesk || (saidProgram && !saidApp && !saidSite)) form = wantsDesk ? "desktop" : "software";
  else if (wantsSoft && !saidApp && !saidSite) form = "software";
  else if (domain === "shop" && !saidApp) form = "shop";
  else if (wantsDash && !saidApp) form = "dashboard";
  else if (saidSite && !saidApp) form = "site";
  else form = "app";

  if (saidNotShop && (domain === "shop" || form === "shop")) {
    domain = wantsMarket ? "marketplace" : "tool";
    form = "app";
  }
  if (wantsMarket) {
    domain = "marketplace";
    form = "app";
  }

  return { form, domain, lock: lockText(form, domain, prompt) };
}

function lockText(form: Form, domain: Domain, prompt: string): string {
  const analogNote = /ebay|subito|vinted|wallapop/i.test(prompt)
    ? "The user named a C2C marketplace analog. Copy THAT product pattern (listings between people), not a single-brand web shop."
    : "";

  const formLine =
    form === "app"
      ? "FORM: native-feeling mobile APP (phone). Bottom tabs, full screens. You infer this from the prompt — the user does NOT pick a chip."
      : form === "shop"
        ? "FORM: storefront with catalog, bag, checkout (one seller)."
        : form === "dashboard"
          ? "FORM: dashboard with KPIs and tables."
          : form === "game"
            ? "FORM: playable game."
            : form === "desktop"
              ? "FORM: desktop PROGRAM for Windows/macOS/Linux. Window chrome, sidebar, menus, keyboard shortcuts. Feels like software you install, not a marketing site."
              : form === "software"
                ? "FORM: business SOFTWARE / gestionale. Dense working UI: sidebar, tables, records, create/edit/delete, filters. Not a landing page."
                : "FORM: website / brand site.";

  const forbid: string[] = [];
  if (domain !== "booking" && domain !== "crm" && domain !== "erp") {
    forbid.push("NO appointments, NO booking, NO 'Vetra Clienti', NO CRM unless they asked.");
  }
  if (domain === "marketplace") {
    forbid.push("NOT e-commerce/Shopify: no single cart-checkout store. People list items; others browse and contact/offer.");
  } else if (domain !== "shop") {
    forbid.push("NO cart/checkout e-commerce unless they asked for a shop.");
  }
  if (form === "app") forbid.push("NO marketing landing as the whole product.");
  if (form === "software" || form === "desktop") {
    forbid.push("NO landing page, NO hero slogan, NO 'learn more'. First screen is the working program.");
  }

  const must =
    domain === "marketplace"
      ? "MUST: first screen = feed of listings (photo, title, price, place). Search. Tap = detail + seller. Tab: Home / Cerca / Vendi / Salvati / Profilo."
      : domain === "shop"
        ? "MUST: products, add to bag, total, fake checkout (one shop)."
        : domain === "crm" || domain === "erp"
          ? "MUST: sidebar (Dashboard, Clienti, Documenti/Fatture, Articoli). Seed 6 clients + 5 invoices. Search, open a record, create, edit, delete in memory. Status chips. Totals that update."
          : domain === "saas"
            ? "MUST: signed-in workspace: nav, list, detail, settings, invite stub. Seed real rows."
            : domain === "booking"
              ? "MUST: calendar/slots, pick, confirm."
              : domain === "tool"
                ? "MUST: the job in their words. Never invent appointments or a shop."
                : "MUST: first screen IS what they asked for.";

  return `${formLine} DOMAIN: ${domain}. ${analogNote} ${must} ${forbid.join(" ")} Do not ask them to select e-commerce. Infer it. Title from THEIR brief.`;
}

export function briefLine(brief: Brief, locale: string): string {
  if (locale === "it") {
    const form =
      brief.form === "app"
        ? "un’app per telefono"
        : brief.form === "shop"
          ? "un negozio online"
          : brief.form === "dashboard"
            ? "una dashboard"
            : brief.form === "game"
              ? "un gioco"
              : brief.form === "desktop"
                ? "un programma per computer"
                : brief.form === "software"
                  ? "un software / gestionale"
                  : "un sito";
    const domain: Record<Domain, string> = {
      marketplace: "tipo eBay / annunci tra privati (non e-commerce)",
      shop: "e-commerce con carrello",
      crm: "gestione clienti e documenti",
      booking: "prenotazioni",
      inventory: "magazzino",
      feed: "feed / chat",
      learn: "corsi",
      estate: "immobili",
      cafe: "locale / menu",
      fashion: "moda",
      tool: "strumento",
      game: "gioco",
      erp: "ERP / magazzino e fatture",
      saas: "SaaS multi-utente",
      generic: "prodotto",
    };
    return `Ho capito da solo: ${form} · ${domain[brief.domain]}. Non devi selezionare niente.`;
  }
  return `I inferred ${brief.form} · ${brief.domain}. No chip required.`;
}
