import { escapeFlagshipMarkup, flagshipDocument } from "@/lib/flagships/shared";
import { ANDREA_SITE_IDS } from "@/lib/flagships/andrea-sites";
import type { Locale } from "@/lib/i18n-core";

export const PREMIUM_DEMO_IDS = [
  "velvet-table",
  "cutcraft",
  "nexora-crm",
  "sonora",
  "toonverse",
  "orbital",
  "stormglass",
  "world-pulse",
  "roomverse",
  "aurelion-motors",
  "vela-noir",
  "maison-27",
  "studio-monolith",
  "nestra-estates",
  "lumen-festival",
  "cinematica",
  "atlas-command",
  "worldforge",
] as const;

export type PremiumDemoId = (typeof PREMIUM_DEMO_IDS)[number];
export type PremiumDemoKind = "app" | "sito" | "programma";

export type PremiumDemo = {
  id: PremiumDemoId;
  name: string;
  kind: PremiumDemoKind;
  line: string;
  ink: string;
  paper: string;
  metal: string;
};

const KIND_LABEL: Record<Locale, Record<PremiumDemoKind, string>> = {
  it: { app: "App", sito: "Sito", programma: "Programma" },
  en: { app: "App", sito: "Site", programma: "Program" },
  es: { app: "App", sito: "Sitio", programma: "Programa" },
  fr: { app: "App", sito: "Site", programma: "Programme" },
  de: { app: "App", sito: "Seite", programma: "Programm" },
  pt: { app: "App", sito: "Site", programma: "Programa" },
};

const LINE: Record<PremiumDemoId, Record<Locale, string>> = {
  "velvet-table": {
    it: "Sala riservata, un tavolo, la sera.",
    en: "A reserved room, one table, night.",
    es: "Una sala reservada, una mesa, la noche.",
    fr: "Une salle réservée, une table, la nuit.",
    de: "Ein privater Raum, ein Tisch, die Nacht.",
    pt: "Uma sala reservada, uma mesa, a noite.",
  },
  cutcraft: {
    it: "Taglio, materia, un pezzo solo.",
    en: "Cut, material, a single piece.",
    es: "Corte, materia, una sola pieza.",
    fr: "Coupe, matière, une seule pièce.",
    de: "Schnitt, Material, ein Stück.",
    pt: "Corte, matéria, uma só peça.",
  },
  "nexora-crm": {
    it: "Clienti, silenzio, ordine.",
    en: "Clients, quiet, order.",
    es: "Clientes, silencio, orden.",
    fr: "Clients, silence, ordre.",
    de: "Kunden, Stille, Ordnung.",
    pt: "Clientes, silêncio, ordem.",
  },
  sonora: {
    it: "Ascolto, stanza, un accordo.",
    en: "Listening, a room, one chord.",
    es: "Escucha, una sala, un acorde.",
    fr: "Écoute, une salle, un accord.",
    de: "Hören, ein Raum, ein Akkord.",
    pt: "Escuta, uma sala, um acorde.",
  },
  toonverse: {
    it: "Inchiostro, movimento, un mondo.",
    en: "Ink, motion, one world.",
    es: "Tinta, movimiento, un mundo.",
    fr: "Encre, mouvement, un monde.",
    de: "Tinte, Bewegung, eine Welt.",
    pt: "Tinta, movimento, um mundo.",
  },
  orbital: {
    it: "Orbita, luce, un veicolo.",
    en: "Orbit, light, one vehicle.",
    es: "Órbita, luz, un vehículo.",
    fr: "Orbite, lumière, un véhicule.",
    de: "Orbit, Licht, ein Fahrzeug.",
    pt: "Órbita, luz, um veículo.",
  },
  stormglass: {
    it: "Vetro, temporale, una costa.",
    en: "Glass, a storm, one coast.",
    es: "Cristal, tormenta, una costa.",
    fr: "Verre, tempête, une côte.",
    de: "Glas, Sturm, eine Küste.",
    pt: "Vidro, tempestade, uma costa.",
  },
  "world-pulse": {
    it: "Mappa, battito, una città.",
    en: "A map, a pulse, one city.",
    es: "Mapa, pulso, una ciudad.",
    fr: "Carte, pouls, une ville.",
    de: "Karte, Puls, eine Stadt.",
    pt: "Mapa, pulso, uma cidade.",
  },
  roomverse: {
    it: "Stanze, misura, un ospite.",
    en: "Rooms, measure, one guest.",
    es: "Habitaciones, medida, un huésped.",
    fr: "Pièces, mesure, un hôte.",
    de: "Räume, Maß, ein Gast.",
    pt: "Salas, medida, um hóspede.",
  },
  "aurelion-motors": {
    it: "Metallo, strada, una stella.",
    en: "Metal, road, one star.",
    es: "Metal, carretera, una estrella.",
    fr: "Métal, route, une étoile.",
    de: "Metall, Straße, ein Stern.",
    pt: "Metal, estrada, uma estrela.",
  },
  "vela-noir": {
    it: "Seta, notte, un tessuto.",
    en: "Silk, night, one cloth.",
    es: "Seda, noche, un tejido.",
    fr: "Soie, nuit, un tissu.",
    de: "Seide, Nacht, ein Stoff.",
    pt: "Seda, noite, um tecido.",
  },
  "maison-27": {
    it: "Casa, numero, una luce.",
    en: "A house, a number, one light.",
    es: "Casa, número, una luz.",
    fr: "Maison, numéro, une lumière.",
    de: "Haus, Nummer, ein Licht.",
    pt: "Casa, número, uma luz.",
  },
  "studio-monolith": {
    it: "Pietra, studio, un volume.",
    en: "Stone, studio, one volume.",
    es: "Piedra, estudio, un volumen.",
    fr: "Pierre, atelier, un volume.",
    de: "Stein, Atelier, ein Volumen.",
    pt: "Pedra, estúdio, um volume.",
  },
  "nestra-estates": {
    it: "Terra, cancello, una villa.",
    en: "Land, a gate, one villa.",
    es: "Tierra, cancela, una villa.",
    fr: "Terre, portail, une villa.",
    de: "Land, Tor, eine Villa.",
    pt: "Terra, portão, uma villa.",
  },
  "lumen-festival": {
    it: "Notte, palco, una festa.",
    en: "Night, a stage, one feast.",
    es: "Noche, escenario, una fiesta.",
    fr: "Nuit, scène, une fête.",
    de: "Nacht, Bühne, ein Fest.",
    pt: "Noite, palco, uma festa.",
  },
  cinematica: {
    it: "Pellicola, buio, un fotogramma.",
    en: "Film, dark, one frame.",
    es: "Película, oscuridad, un fotograma.",
    fr: "Pellicule, obscurité, une image.",
    de: "Film, Dunkel, ein Bild.",
    pt: "Película, escuro, um fotograma.",
  },
  "atlas-command": {
    it: "Comando, mappa, un teatro.",
    en: "Command, a map, one theatre.",
    es: "Mando, mapa, un teatro.",
    fr: "Commandement, carte, un théâtre.",
    de: "Kommando, Karte, ein Theater.",
    pt: "Comando, mapa, um teatro.",
  },
  worldforge: {
    it: "Mondo, forgia, una regola.",
    en: "A world, a forge, one rule.",
    es: "Mundo, forja, una regla.",
    fr: "Monde, forge, une règle.",
    de: "Welt, Esse, eine Regel.",
    pt: "Mundo, forja, uma regra.",
  },
};

const META: Record<PremiumDemoId, { name: string; kind: PremiumDemoKind; ink: string; paper: string; metal: string }> =
  {
    "velvet-table": { name: "Velvet Table", kind: "app", ink: "#140c0a", paper: "#f0ddd0", metal: "#8a3a2a" },
    cutcraft: { name: "CutCraft", kind: "app", ink: "#11110f", paper: "#efe6d4", metal: "#b4532a" },
    "nexora-crm": { name: "Nexora CRM", kind: "app", ink: "#10131a", paper: "#e7e2d6", metal: "#6d7c8a" },
    sonora: { name: "Sonora", kind: "app", ink: "#0e1014", paper: "#f2ead8", metal: "#c4a46a" },
    toonverse: { name: "ToonVerse", kind: "app", ink: "#120f16", paper: "#f4e7c8", metal: "#d4552a" },
    orbital: { name: "Orbital", kind: "app", ink: "#07090e", paper: "#dce4ea", metal: "#8aa4b8" },
    stormglass: { name: "StormGlass", kind: "app", ink: "#0b1216", paper: "#d7e4e8", metal: "#6f93a3" },
    "world-pulse": { name: "World Pulse", kind: "app", ink: "#10110f", paper: "#ebe4d4", metal: "#c45a3a" },
    roomverse: { name: "RoomVerse", kind: "app", ink: "#12100c", paper: "#f0e6d4", metal: "#9a8060" },
    "aurelion-motors": { name: "Aurelion Motors", kind: "sito", ink: "#0b0b0b", paper: "#f3ebda", metal: "#c9a84c" },
    "vela-noir": { name: "Vela Noir", kind: "sito", ink: "#0c0a0c", paper: "#efe6dc", metal: "#8c6a7a" },
    "maison-27": { name: "Maison 27", kind: "sito", ink: "#14110e", paper: "#f6edd8", metal: "#c4b08a" },
    "studio-monolith": { name: "Studio Monolith", kind: "sito", ink: "#10100f", paper: "#e8e2d6", metal: "#8a8680" },
    "nestra-estates": { name: "Nestra Estates", kind: "sito", ink: "#12140f", paper: "#ece6d2", metal: "#8a9a6a" },
    "lumen-festival": { name: "Lumen Festival", kind: "sito", ink: "#120d12", paper: "#f3e4d0", metal: "#d4a06a" },
    cinematica: { name: "Cinematica", kind: "programma", ink: "#0c0b0b", paper: "#f0e6d8", metal: "#c4b08a" },
    "atlas-command": { name: "Atlas Command", kind: "programma", ink: "#0b0e10", paper: "#e4e6e2", metal: "#7a8a7a" },
    worldforge: { name: "WorldForge", kind: "programma", ink: "#120e0a", paper: "#f0e2cc", metal: "#c47a3a" },
  };

export const ANDREA_LIVE_SITES = ANDREA_SITE_IDS;

export function isPremiumDemoId(value: string): value is PremiumDemoId {
  return (PREMIUM_DEMO_IDS as readonly string[]).includes(value);
}

export function premiumDemos(locale: Locale): PremiumDemo[] {
  return PREMIUM_DEMO_IDS.map((id) => ({
    id,
    name: META[id].name,
    kind: META[id].kind,
    line: LINE[id][locale],
    ink: META[id].ink,
    paper: META[id].paper,
    metal: META[id].metal,
  }));
}

export function premiumDemoFor(slug: string, locale: Locale): PremiumDemo | null {
  return isPremiumDemoId(slug) ? premiumDemos(locale).find((item) => item.id === slug) ?? null : null;
}

export function premiumKindLabel(locale: Locale, kind: PremiumDemoKind): string {
  return KIND_LABEL[locale][kind];
}

export function buildPremiumDemoHtml(id: PremiumDemoId, locale: Locale): string {
  const demo = premiumDemoFor(id, locale);
  if (!demo) return "";
  const kind = premiumKindLabel(locale, demo.kind);
  return flagshipDocument({
    id,
    locale,
    title: `${demo.name} — Helix`,
    themeColor: demo.ink,
    css: `
:root{color-scheme:dark;--ink:${demo.ink};--paper:${demo.paper};--metal:${demo.metal}}
body{min-height:100vh;margin:0;background:radial-gradient(ellipse 60% 50% at 70% 20%, color-mix(in srgb, var(--paper) 18%, transparent), transparent 58%),var(--ink);color:var(--paper);font-family:Georgia,"Times New Roman",serif}
.room{min-height:100vh;display:grid;place-items:center;padding:32px 22px}
.card{width:min(100%,560px)}
.kicker{letter-spacing:.28em;text-transform:uppercase;font:500 11px/1 ui-sans-serif,system-ui,sans-serif;color:var(--metal)}
h1{margin:18px 0 12px;font:500 clamp(48px,10vw,84px)/.9 Georgia,serif}
p{max-width:28ch;color:color-mix(in srgb,var(--paper) 72%, transparent);font:italic 22px/1.4 Georgia,serif}
.object{width:120px;height:160px;margin:36px 0 0;border:1px solid color-mix(in srgb,var(--metal) 55%, transparent);background:linear-gradient(160deg,var(--paper),var(--metal));box-shadow:0 30px 60px rgb(0 0 0 / .35)}
`,
    body: `<main class="room"><article class="card"><p class="kicker">${escapeFlagshipMarkup(kind)}</p><h1>${escapeFlagshipMarkup(demo.name)}</h1><p>${escapeFlagshipMarkup(demo.line)}</p><div class="object" aria-hidden="true"></div></article></main>`,
    script: "",
  });
}
