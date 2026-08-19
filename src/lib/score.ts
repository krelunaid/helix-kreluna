export type TwinReport = {
  errors: string[];
  shot?: string;
  clicks: { label: string; changed: boolean }[];
  forms: number;
  deadClicks: number;
};

export type Improvement = {
  id: string;
  metric: string;
  from: number;
  to: number;
  action: string;
  detail: string;
};

export type KrelunaScore = {
  readiness: number;
  security: number;
  performance: number;
  scalability: number;
  accessibility: number;
  reliability: number;
  quality: number;
  cost: number;
  coverage: number;
  costEur: number;
  configs: { id: string; label: string; eur: number; note: string }[];
  critical: string[];
  watch: string[];
  improvements: Improvement[];
  council: { pick: string; rejected: string; why: string; votes: { seat: string; score: number }[] };
  horizon: { months: number; verdict: string; risks: string[] };
};

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function computeScore(html: string, prompt: string, twin?: TwinReport | null, locale: string = "en"): KrelunaScore {
  const it = locale.toLowerCase().startsWith("it");
  const p = prompt.toLowerCase();
  const critical: string[] = [];
  const watch: string[] = [];
  const improvements: Improvement[] = [];

  let security = 96;
  if (/localStorage|sessionStorage|document\.cookie/.test(html)) {
    security -= 24;
    critical.push(it ? "Storage nel sandbox non regge. Tieni lo stato in memoria." : "Storage APIs will fail in the sandbox. Keep state in memory.");
    improvements.push({
      id: "mem",
      metric: it ? "Sicurezza" : "Security",
      from: security,
      to: Math.min(96, security + 20),
      action: it ? "Sostituisci lo storage con stato in memoria" : "Replace storage with in-memory state",
      detail: it ? "Il Twin non persiste. La memoria tiene viva l’anteprima." : "Twin cannot persist. Memory keeps the preview alive.",
    });
  }
  if (/\beval\(|innerHTML\s*=/.test(html)) {
    security -= 18;
    critical.push(it ? "Iniezione HTML / eval non sicuri." : "Unsafe HTML injection / eval.");
  }
  if (/http:\/\//i.test(html) && !/localhost/.test(html)) {
    security -= 8;
    watch.push(it ? "URL http:// a contenuto misto." : "Mixed-content http:// URLs.");
  }
  if (/<input[^>]+type=["']?email/i.test(html) && !/privacy|gdpr/i.test(html)) {
    security -= 8;
    watch.push(it ? "Raccoglie email senza nota privacy." : "Collects email without a privacy note.");
    improvements.push({
      id: "privacy",
      metric: it ? "Sicurezza" : "Security",
      from: security,
      to: Math.min(96, security + 8),
      action: it ? "Aggiungi una riga di privacy vicino al form" : "Add a one-line privacy note near the form",
      detail: it ? "GDPR: di’ cosa salvi, anche in un prototipo." : "GDPR: say what you store, even in a prototype.",
    });
  }

  let performance = 92;
  const kb = html.length / 1024;
  if (kb > 90) {
    performance -= 18;
    watch.push(it ? `Il sorgente pesa ${Math.round(kb)} KB.` : `Source is ${Math.round(kb)} KB.`);
    improvements.push({
      id: "slim",
      metric: it ? "Prestazioni" : "Performance",
      from: performance,
      to: Math.min(94, performance + 12),
      action: it ? "Taglia CSS e foto inutili" : "Trim unused CSS and extra photos",
      detail: it ? "Primo paint più veloce. Il Twin ha già pesato la pagina." : "Smaller first paint. Twin already measured weight.",
    });
  } else if (kb > 55) performance -= 8;
  const photos = (html.match(/images\.unsplash\.com/g) ?? []).length;
  if (photos > 8) {
    performance -= 10;
    watch.push(it ? "Troppe foto a piena risoluzione." : "Too many full-size photos.");
  }

  let scalability = /prenot|book|login|account|pay|stripe|lista|crud|dashboard/.test(p) ? 72 : 86;
  if (/pagament|stripe|abbon|subscription|auth|login/.test(p)) {
    scalability = 64;
    watch.push(it ? "Serve un backend vero prima di migliaia di utenti." : "Needs a real backend before thousands of users.");
    improvements.push({
      id: "api",
      metric: it ? "Scalabilità" : "Scalability",
      from: scalability,
      to: 84,
      action: it ? "Porta l’API in memoria su Postgres" : "Promote the in-memory API to Postgres",
      detail: it ? "Augur: questa forma cede vicino a 80k utenti." : "Augur: current shape hits a wall near 80k users.",
    });
  }

  let accessibility = 90;
  if (/<input/i.test(html) && !/<label/i.test(html)) {
    accessibility -= 18;
    critical.push(it ? "Campi senza etichetta." : "Inputs without labels.");
    improvements.push({
      id: "labels",
      metric: it ? "Accessibilità" : "Accessibility",
      from: accessibility,
      to: Math.min(94, accessibility + 16),
      action: it ? "Metti una label su ogni input" : "Wrap every input in a label",
      detail: it ? "Echo: i lettori di schermo servono i nomi." : "Echo: screen readers need names.",
    });
  }
  if (!/<html[^>]*lang=/i.test(html)) {
    accessibility -= 8;
    watch.push(it ? "Manca html lang." : "Missing html lang.");
  }
  if (!/<button|<a /i.test(html)) {
    accessibility -= 20;
    critical.push(it ? "Nessuna azione cliccabile." : "No clickable actions.");
  }

  let reliability = 90;
  const errors = twin?.errors ?? [];
  if (errors.length) {
    reliability -= Math.min(36, errors.length * 12);
    critical.push(`Twin: ${errors[0].slice(0, 120)}`);
  }
  if ((twin?.deadClicks ?? 0) > 0) {
    reliability -= Math.min(24, twin!.deadClicks * 8);
    critical.push(`${twin!.deadClicks} ${it ? "controlli non hanno fatto nulla quando il Twin ha cliccato." : "control(s) did nothing when the twin clicked."}`);
    improvements.push({
      id: "clicks",
      metric: it ? "Affidabilità" : "Reliability",
      from: reliability,
      to: Math.min(94, reliability + 16),
      action: it ? "I tasti principali devono cambiare la schermata" : "Make primary buttons change the UI",
      detail: it ? "Conferma, apri, aggiungi — il Twin deve vedere un cambiamento." : "Confirm, open, add — Twin must see a change.",
    });
  }

  let quality = 88;
  if (/lorem ipsum|welcome to our app|your company/i.test(html)) {
    quality -= 20;
    critical.push(it ? "Copia segnaposto ancora nel prodotto." : "Placeholder copy still in the product.");
  }
  if (!/<\/style>/.test(html) || !/<\/script>/.test(html)) quality -= 10;

  let coverage = twin ? (twin.clicks.length ? 70 : 40) : 30;
  if (twin && twin.forms) coverage += 12;
  if (twin && !twin.errors.length) coverage += 10;
  coverage = clamp(coverage);

  const heavy = /pagament|stripe|login|auth|account/.test(p);
  const data = /prenot|book|lista|dashboard|crud/.test(p);
  const configs = heavy
    ? [
        { id: "A", label: "A · full", eur: 160, note: "Auth + pay + API + Postgres" },
        { id: "B", label: "B · lean", eur: 90, note: "Small API, managed auth" },
        { id: "C", label: "C · preview", eur: 55, note: "Static + TestTrack" },
      ]
    : data
      ? [
          { id: "A", label: "A · api", eur: 38, note: "Tiny backend + DB" },
          { id: "B", label: "B · plus", eur: 18, note: "PWA + analytics" },
          { id: "C", label: "C · static", eur: 8, note: "Kreluna hosting" },
        ]
      : [
          { id: "A", label: "A · brand", eur: 22, note: "CDN + forms service" },
          { id: "B", label: "B · site", eur: 12, note: "Static + domain" },
          { id: "C", label: "C · preview", eur: 8, note: "Kreluna only" },
        ];
  const costEur = configs[1].eur;
  const cost = clamp(100 - costEur / 3);

  const readiness = clamp(
    security * 0.18 +
      performance * 0.12 +
      scalability * 0.12 +
      accessibility * 0.1 +
      reliability * 0.18 +
      quality * 0.12 +
      cost * 0.08 +
      coverage * 0.1,
  );

  const votes = [
    { seat: "Atlas", score: clamp(scalability / 10) },
    { seat: "Aegis", score: +(security / 10).toFixed(1) },
    { seat: "Swift", score: +(performance / 10).toFixed(1) },
    { seat: "Ledger", score: +(cost / 10).toFixed(1) },
    { seat: "Augur", score: +(scalability / 10).toFixed(1) },
  ];

  const ship = readiness >= 80 && critical.length === 0;
  const council = ship
    ? {
        pick: it ? "Pubblica il web ora" : "Ship web now",
        rejected: it ? "Tieni fermo per un altro passaggio" : "Hold for another pass",
        why: it ? `Pronti ${readiness}. Nessun blocco.` : `Readiness ${readiness}. No blockers.`,
        votes,
      }
    : {
        pick: critical.length
          ? it
            ? "Sistema i blocchi, poi pubblica"
            : "Fix blockers, then ship"
          : it
            ? "Pubblica il web, Warden resta in ascolto"
            : "Ship web, watch Warden",
        rejected: it ? "Mandala subito sugli store" : "Push to stores now",
        why: critical.length
          ? it
            ? `${critical.length} blocco/i. Aegis può fermare il deploy.`
            : `${critical.length} blocker(s). Aegis can stop the deploy.`
          : it
            ? `Pronti ${readiness}. Il web va. Gli store dopo un backend.`
            : `Readiness ${readiness}. Web is fine. Stores after a backend.`,
        votes,
      };

  const horizon = {
    months: 6,
    verdict: it
      ? readiness >= 85
        ? "Fra 6 mesi regge se aggiungi un backend vero e controlli i costi."
        : readiness >= 70
          ? "Fra 6 mesi resta un prototipo. Utenti e pagamenti si rompono per primi."
          : "Fra 6 mesi non regge. Chiudi i blocchi prima di promettere un lancio."
      : readiness >= 85
        ? "In 6 months this can still stand if you add a real backend and watch cost."
        : readiness >= 70
          ? "In 6 months it holds as a prototype. Users and payments will break first."
          : "In 6 months it will not hold. Fix blockers before you promise a launch.",
    risks: (it
      ? [
          ...(scalability < 80 ? ["Traffico e dati supereranno questo HTML."] : []),
          ...(security < 85 ? ["Il debito di sicurezza cresce appena salvi persone vere."] : []),
          ...(costEur > 40 ? ["Il costo sale se la tieni sempre accesa."] : []),
          "I dati muoiono al refresh finché non c'è un database.",
        ]
      : [
          ...(scalability < 80 ? ["Traffic and data will outgrow this HTML shell."] : []),
          ...(security < 85 ? ["Security debt grows as soon as you store real people."] : []),
          ...(costEur > 40 ? ["Infra cost climbs if you keep it always-on."] : []),
          "State dies on refresh until there is a database.",
        ]
    ).slice(0, 3),
  };

  return {
    readiness,
    security: clamp(security),
    performance: clamp(performance),
    scalability: clamp(scalability),
    accessibility: clamp(accessibility),
    reliability: clamp(reliability),
    quality: clamp(quality),
    cost: clamp(cost),
    coverage: clamp(coverage),
    costEur,
    configs,
    critical: critical.slice(0, 3),
    watch: watch.slice(0, 4),
    improvements: improvements.slice(0, 4),
    council,
    horizon,
  };
}

export function applyImprovement(html: string, id: string) {
  if (id === "labels") {
    return html.replace(/<input([^>]*?)>/gi, (full, attrs) => {
      if (/aria-label=/i.test(attrs)) return full;
      return `<label class="k-field">Field <input${attrs}></label>`;
    });
  }
  if (id === "privacy" && !/privacy|gdpr/i.test(html)) {
    return html.replace(
      /<\/body>/i,
      `<p style="font-size:12px;opacity:.7">We keep this in memory for the session. No sale of data. GDPR.</p></body>`,
    );
  }
  if (id === "mem") {
    return html.replace(/localStorage|sessionStorage/g, "_mem");
  }
  return html;
}
