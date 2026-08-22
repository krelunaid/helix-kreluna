import { lazy, type LazyExoticComponent, type ComponentType } from "react";
import {
  PREMIUM_DEMO_IDS,
  isPremiumDemoId,
  premiumKindLabel,
  type PremiumDemoId,
  type PremiumDemoKind,
} from "@/lib/premium-demos";
import { EPOQUE_PHOTOS } from "@/lib/flagships/andrea-photos";
import type { Locale } from "@/lib/i18n-core";

export { PREMIUM_DEMO_IDS, isPremiumDemoId };
export type { PremiumDemoId };

export type PremiumSurface = "app" | "site" | "program";

export const EXCLUDED_ANDREA_SITES = ["la-bottega-del-capello", "accademia-della-bugia"] as const;

export const PREMIUM_SURFACES: Record<PremiumDemoId, PremiumSurface> = {
  "velvet-table": "app",
  cutcraft: "app",
  "nexora-crm": "app",
  sonora: "app",
  toonverse: "app",
  orbital: "app",
  stormglass: "app",
  "world-pulse": "app",
  roomverse: "app",
  "aurelion-motors": "site",
  "vela-noir": "site",
  "maison-27": "site",
  "studio-monolith": "site",
  "nestra-estates": "site",
  "lumen-festival": "site",
  cinematica: "program",
  "atlas-command": "program",
  worldforge: "program",
};

export const PREMIUM_PHOTOS: Record<PremiumDemoId, string> = {
  "velvet-table": "/vetrina/velvet-table/salon.jpg",
  cutcraft: "/vetrina/cutcraft/reel.jpg",
  "nexora-crm": "/vetrina/nexora/office.jpg",
  sonora: "/vetrina/sonora/vinyl.jpg",
  toonverse: "/vetrina/toonverse/desk.jpg",
  orbital: "/vetrina/orbital/earth.jpg",
  stormglass: "/vetrina/stormglass/sea.jpg",
  "world-pulse": "/vetrina/world-pulse/desk.jpg",
  roomverse: "/vetrina/roomverse/salon.jpg",
  "aurelion-motors": EPOQUE_PHOTOS.wings,
  "vela-noir": "/vetrina/vela-noir/look.jpg",
  "maison-27": "/vetrina/maison-27/lobby.jpg",
  "studio-monolith": "/vetrina/studio-monolith/tower.jpg",
  "nestra-estates": "/vetrina/nestra/villa.jpg",
  "lumen-festival": "/vetrina/lumen-festival/stage.jpg",
  cinematica: "/vetrina/cinematica/hall.jpg",
  "atlas-command": "/vetrina/atlas-command/globe.jpg",
  worldforge: "/vetrina/worldforge/ridge.jpg",
};

export const PREMIUM_PROMPTS: Record<PremiumDemoId, string> = {
  "velvet-table":
    "Crea un servizio di prenotazione ristoranti e concierge gastronomico come Velvet Table: atmosfera da grand hotel, ricerca per occasione, mappa dei tavoli con vista e privacy, prenotazione in quattro passi e wallet della prenotazione.",
  cutcraft: "Crea CutCraft, una cutting room per montare reel con marca in/out, grade e export di demo.",
  "nexora-crm": "Crea Nexora CRM, una scrivania per clientela privata con dossier, note e chiusura pratica.",
  sonora: "Crea Sonora, uno studio di ascolto e mix con vinile, fader e master di demo.",
  toonverse: "Crea ToonVerse, un tavolo di animazione con storyboard, pose e playback.",
  orbital: "Crea Orbital, una console di missione con veicolo, burn e conferma simulata.",
  stormglass: "Crea StormGlass, un osservatorio meteo con celle, strati e brief.",
  "world-pulse": "Crea World Pulse, una desk di attualità con città, storie e pubblicazione in locale.",
  roomverse: "Crea RoomVerse, un atelier di interni con stanze, materiali e posa.",
  "aurelion-motors":
    "Crea Aurelion Motors, una maison di auto di lusso con flotta fotografica e richiesta di disponibilità.",
  "vela-noir": "Crea Vela Noir, un lookbook di moda scura con look, taglia e guardaroba.",
  "maison-27": "Crea Maison 27, un hotel maison con suite, notti e richiesta di soggiorno.",
  "studio-monolith": "Crea Studio Monolith, un atelier di architettura con progetti, piante e richiesta.",
  "nestra-estates": "Crea Nestra Estates, un concierge immobiliare con ville, stagione e visita.",
  "lumen-festival": "Crea Lumen Festival, un programma culturale con giorni, palco e pass.",
  cinematica: "Crea Cinematica, un programma di sala con pellicola, posti e prenotazione.",
  "atlas-command": "Crea Atlas Command, un comando geospatiale con teatri, layer e ordini.",
  worldforge: "Crea WorldForge, un forgiatore di mondi con biomi, seed e generazione.",
};

export const VELVET_CREATE_PROMPT = PREMIUM_PROMPTS["velvet-table"];

type CardCopy = {
  brand: string;
  title: string;
  lead: string;
  capability: string;
};

const IT: Record<PremiumDemoId, CardCopy> = {
  "velvet-table": {
    brand: "Velvet Table",
    title: "Concierge gastronomico",
    lead: "Il servizio digitale di un grand hotel. Non un Booking con foto di cibo.",
    capability: "Hero fotografico, tavoli luminosi, vista che cambia, wallet.",
  },
  cutcraft: {
    brand: "CutCraft",
    title: "Cutting room",
    lead: "Montaggio come in sala, non un editor giocattolo.",
    capability: "Reel, marca in/out, grade, export di prova.",
  },
  "nexora-crm": {
    brand: "Nexora CRM",
    title: "Clientela privata",
    lead: "Una scrivania di maison, non una pipeline colorata.",
    capability: "Dossier, note, chiusura pratica.",
  },
  sonora: {
    brand: "Sonora",
    title: "Studio di ascolto",
    lead: "Vinile, rame, fader. Il mix è un rito.",
    capability: "Traccia, mix, master di demo.",
  },
  toonverse: {
    brand: "ToonVerse",
    title: "Tavolo di animazione",
    lead: "Inchiostro e carta, non clipart.",
    capability: "Storyboard, pose, playback.",
  },
  orbital: {
    brand: "Orbital",
    title: "Console di missione",
    lead: "Vuoto, segnale, un burn che non parte davvero.",
    capability: "Veicolo, telemetria, manovra simulata.",
  },
  stormglass: {
    brand: "StormGlass",
    title: "Osservatorio",
    lead: "Vetro, costa, un brief che resta in locale.",
    capability: "Celle, strati, allerta.",
  },
  "world-pulse": {
    brand: "World Pulse",
    title: "Desk di attualità",
    lead: "Una città, un battito, una storia.",
    capability: "Mappa, copia, pubblicazione locale.",
  },
  roomverse: {
    brand: "RoomVerse",
    title: "Atelier di interni",
    lead: "Stanze, misura, un ospite.",
    capability: "Pianta, materiali, posa.",
  },
  "aurelion-motors": {
    brand: "Aurelion Motors",
    title: "Maison automobilistica",
    lead: "Metallo, strada, una stella. Stesso respiro fotografico dell’Époque.",
    capability: "Flotta, epoche, richiesta di disponibilità.",
  },
  "vela-noir": {
    brand: "Vela Noir",
    title: "Lookbook notturno",
    lead: "Seta, buio, un tessuto.",
    capability: "Look, taglia, guardaroba.",
  },
  "maison-27": {
    brand: "Maison 27",
    title: "Hotel maison",
    lead: "Numero, luce, una suite.",
    capability: "Camere, notti, hold.",
  },
  "studio-monolith": {
    brand: "Studio Monolith",
    title: "Atelier di volume",
    lead: "Pietra, pianta, un volume.",
    capability: "Progetti, folio, richiesta.",
  },
  "nestra-estates": {
    brand: "Nestra Estates",
    title: "Concierge di terra",
    lead: "Cancello, prato, una villa.",
    capability: "Ville, stagione, visita.",
  },
  "lumen-festival": {
    brand: "Lumen Festival",
    title: "Notte di palco",
    lead: "Folla, luce, una festa.",
    capability: "Giorni, palco, pass.",
  },
  cinematica: {
    brand: "Cinematica",
    title: "Programma di sala",
    lead: "Pellicola, buio, un fotogramma.",
    capability: "Sale, orari, posti.",
  },
  "atlas-command": {
    brand: "Atlas Command",
    title: "Teatro di comando",
    lead: "Mappa, ordine, un teatro.",
    capability: "Teatri, layer, ordini.",
  },
  worldforge: {
    brand: "WorldForge",
    title: "Forgia di mondi",
    lead: "Bioma, seed, una regola.",
    capability: "Terreni, seed, generazione.",
  },
};

const EN: Record<PremiumDemoId, CardCopy> = {
  "velvet-table": {
    brand: "Velvet Table",
    title: "Gastronomic concierge",
    lead: "The digital service of a grand hotel. Not a booking list with food photos.",
    capability: "Photographic hero, luminous tables, changing view, wallet.",
  },
  cutcraft: {
    brand: "CutCraft",
    title: "Cutting room",
    lead: "Editing as in the suite, not a toy timeline.",
    capability: "Reels, in/out marks, grade, trial export.",
  },
  "nexora-crm": {
    brand: "Nexora CRM",
    title: "Private clientele",
    lead: "A maison desk, not a coloured pipeline.",
    capability: "Dossiers, notes, file close.",
  },
  sonora: {
    brand: "Sonora",
    title: "Listening studio",
    lead: "Vinyl, copper, faders. Mixing is a rite.",
    capability: "Track, mix, demo master.",
  },
  toonverse: {
    brand: "ToonVerse",
    title: "Animation desk",
    lead: "Ink and paper, not clipart.",
    capability: "Storyboard, poses, playback.",
  },
  orbital: {
    brand: "Orbital",
    title: "Mission console",
    lead: "Void, signal, a burn that never leaves the room.",
    capability: "Vehicle, telemetry, simulated maneuver.",
  },
  stormglass: {
    brand: "StormGlass",
    title: "Observatory",
    lead: "Glass, a coast, a brief that stays local.",
    capability: "Cells, layers, alert.",
  },
  "world-pulse": {
    brand: "World Pulse",
    title: "News desk",
    lead: "A city, a pulse, one story.",
    capability: "Map, copy, local publish.",
  },
  roomverse: {
    brand: "RoomVerse",
    title: "Interior atelier",
    lead: "Rooms, measure, one guest.",
    capability: "Plan, materials, placement.",
  },
  "aurelion-motors": {
    brand: "Aurelion Motors",
    title: "Automotive maison",
    lead: "Metal, road, one star. The same photographic breath as Époque.",
    capability: "Fleet, eras, availability request.",
  },
  "vela-noir": {
    brand: "Vela Noir",
    title: "Night lookbook",
    lead: "Silk, dark, one cloth.",
    capability: "Look, size, wardrobe.",
  },
  "maison-27": {
    brand: "Maison 27",
    title: "Maison hotel",
    lead: "A number, a light, one suite.",
    capability: "Rooms, nights, hold.",
  },
  "studio-monolith": {
    brand: "Studio Monolith",
    title: "Volume atelier",
    lead: "Stone, a plan, one volume.",
    capability: "Projects, folio, request.",
  },
  "nestra-estates": {
    brand: "Nestra Estates",
    title: "Land concierge",
    lead: "A gate, a lawn, one villa.",
    capability: "Villas, season, visit.",
  },
  "lumen-festival": {
    brand: "Lumen Festival",
    title: "Stage night",
    lead: "Crowd, light, one feast.",
    capability: "Days, stage, pass.",
  },
  cinematica: {
    brand: "Cinematica",
    title: "Hall programme",
    lead: "Film, dark, one frame.",
    capability: "Halls, times, seats.",
  },
  "atlas-command": {
    brand: "Atlas Command",
    title: "Command theatre",
    lead: "A map, an order, one theatre.",
    capability: "Theatres, layers, orders.",
  },
  worldforge: {
    brand: "WorldForge",
    title: "World forge",
    lead: "Biome, seed, one rule.",
    capability: "Terrain, seed, generation.",
  },
};

export type PremiumDemoCard = CardCopy & {
  id: PremiumDemoId;
  kind: string;
  photo: string;
  surface: PremiumSurface;
  prompt: string;
};

export const SURFACE_LABELS: Record<Locale, { all: string }> = {
  it: { all: "Demos Helix" },
  en: { all: "Helix demos" },
  es: { all: "Demos Helix" },
  fr: { all: "Démos Helix" },
  de: { all: "Helix-Demos" },
  pt: { all: "Demos Helix" },
};

export const SURFACE_TITLES: Record<Locale, Record<PremiumSurface, { title: string; lead: string }>> = {
  it: {
    app: { title: "App", lead: "Nove prodotti da usare, non da guardare." },
    site: { title: "Siti", lead: "Sei maisons fotografiche, con un percorso corto." },
    program: { title: "Programmi", lead: "Tre strumenti densi, con reset e prove." },
  },
  en: {
    app: { title: "Apps", lead: "Nine products to use, not to watch." },
    site: { title: "Sites", lead: "Six photographic maisons, each with a short path." },
    program: { title: "Programs", lead: "Three dense tools, with reset and trials." },
  },
  es: {
    app: { title: "Apps", lead: "Nueve productos para usar, no para mirar." },
    site: { title: "Sitios", lead: "Seis maisons fotográficas, con un camino corto." },
    program: { title: "Programas", lead: "Tres herramientas densas, con reset y pruebas." },
  },
  fr: {
    app: { title: "Apps", lead: "Neuf produits à utiliser, pas à regarder." },
    site: { title: "Sites", lead: "Six maisons photographiques, avec un chemin court." },
    program: { title: "Programmes", lead: "Trois outils denses, avec reset et essais." },
  },
  de: {
    app: { title: "Apps", lead: "Neun Produkte zum Nutzen, nicht zum Anschauen." },
    site: { title: "Seiten", lead: "Sechs fotografische Maisons, mit kurzem Weg." },
    program: { title: "Programme", lead: "Drei dichte Werkzeuge, mit Reset und Proben." },
  },
  pt: {
    app: { title: "Apps", lead: "Nove produtos para usar, não para olhar." },
    site: { title: "Sites", lead: "Seis maisons fotográficas, com um caminho curto." },
    program: { title: "Programas", lead: "Três ferramentas densas, com reset e provas." },
  },
};

export function premiumDemoTitle(id: PremiumDemoId, locale: Locale) {
  return (locale === "it" ? IT : EN)[id].brand;
}

export function premiumDemosFor(locale: Locale, surface?: PremiumSurface): PremiumDemoCard[] {
  const table = locale === "it" ? IT : EN;
  const kindLocale = locale;
  return PREMIUM_DEMO_IDS.filter((id) => !surface || PREMIUM_SURFACES[id] === surface).map((id) => ({
    id,
    ...table[id],
    kind: premiumKindLabel(kindLocale, kindFromSurface(PREMIUM_SURFACES[id])),
    photo: PREMIUM_PHOTOS[id],
    surface: PREMIUM_SURFACES[id],
    prompt: PREMIUM_PROMPTS[id],
  }));
}

function kindFromSurface(surface: PremiumSurface): PremiumDemoKind {
  if (surface === "app") return "app";
  if (surface === "site") return "sito";
  return "programma";
}

export const PREMIUM_LAZY: Record<PremiumDemoId, LazyExoticComponent<ComponentType>> = {
  "velvet-table": lazy(() => import("@/demos/velvet-table/app")),
  cutcraft: lazy(() => import("@/demos/cutcraft/app")),
  "nexora-crm": lazy(() => import("@/demos/nexora-crm/app")),
  sonora: lazy(() => import("@/demos/sonora/app")),
  toonverse: lazy(() => import("@/demos/toonverse/app")),
  orbital: lazy(() => import("@/demos/orbital/app")),
  stormglass: lazy(() => import("@/demos/stormglass/app")),
  "world-pulse": lazy(() => import("@/demos/world-pulse/app")),
  roomverse: lazy(() => import("@/demos/roomverse/app")),
  "aurelion-motors": lazy(() => import("@/demos/aurelion-motors/app")),
  "vela-noir": lazy(() => import("@/demos/vela-noir/app")),
  "maison-27": lazy(() => import("@/demos/maison-27/app")),
  "studio-monolith": lazy(() => import("@/demos/studio-monolith/app")),
  "nestra-estates": lazy(() => import("@/demos/nestra-estates/app")),
  "lumen-festival": lazy(() => import("@/demos/lumen-festival/app")),
  cinematica: lazy(() => import("@/demos/cinematica/app")),
  "atlas-command": lazy(() => import("@/demos/atlas-command/app")),
  worldforge: lazy(() => import("@/demos/worldforge/app")),
};
