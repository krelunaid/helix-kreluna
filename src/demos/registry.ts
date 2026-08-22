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
  "aurelion",
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
export type PremiumSurface = "app" | "site" | "program";

export function isPremiumDemoId(value: string): value is PremiumDemoId {
  return (PREMIUM_DEMO_IDS as readonly string[]).includes(value);
}

export const VELVET_CREATE_PROMPT =
  "Crea un servizio di prenotazione ristoranti e concierge gastronomico come Velvet Table: atmosfera da grand hotel, ricerca per occasione, mappa dei tavoli con vista e privacy, prenotazione in quattro passi e wallet della prenotazione.";

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
  aurelion: "site",
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
  aurelion: "/vetrina/aurelion/mercedes-300-sl-wings.jpg",
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
  "velvet-table": VELVET_CREATE_PROMPT,
  cutcraft: "Crea CutCraft, una cutting room per montare reel con marca in/out, grade e export di demo.",
  "nexora-crm": "Crea Nexora CRM, una scrivania per clientela privata con dossier, note e chiusura pratica.",
  sonora: "Crea Sonora, uno studio di ascolto e mix con vinile, fader e master di demo.",
  toonverse: "Crea ToonVerse, un tavolo di animazione con storyboard, pose e playback.",
  orbital: "Crea Orbital, una console di missione con veicolo, burn e conferma simulata.",
  stormglass: "Crea StormGlass, un osservatorio meteo con celle, strati e brief.",
  "world-pulse": "Crea World Pulse, una desk di attualità con storie, copia e pubblicazione in locale.",
  roomverse: "Crea RoomVerse, un atelier di interni con stanze, materiali e posa.",
  aurelion: "Crea Aurelion Motors, una maison di auto di lusso con flotta fotografica e prenotazione.",
  "vela-noir": "Crea Vela Noir, un lookbook di moda scura con look, taglia e guardaroba.",
  "maison-27": "Crea Maison 27, un hotel maison con suite, notti e richiesta di soggiorno.",
  "studio-monolith": "Crea Studio Monolith, un atelier di architettura con progetti, piante e richiesta.",
  "nestra-estates": "Crea Nestra Estates, un concierge immobiliare con ville, stagione e visita.",
  "lumen-festival": "Crea Lumen Festival, un programma culturale con giorni, palco e pass.",
  cinematica: "Crea Cinematica, un programma di montaggio cinema con reel, taglio e grade.",
  "atlas-command": "Crea Atlas Command, un comando geospatiale con teatri, layer e ordini.",
  worldforge: "Crea WorldForge, un forgiatore di mondi con biomi, seed e generazione.",
};

type CardCopy = {
  brand: string;
  kind: string;
  title: string;
  lead: string;
  capability: string;
};

const IT: Record<PremiumDemoId, CardCopy> = {
  "velvet-table": {
    brand: "Velvet Table",
    kind: "App",
    title: "Concierge gastronomico",
    lead: "Il servizio digitale di un grand hotel. Non un Booking con foto di cibo.",
    capability: "Hero fotografico, tavoli luminosi, vista che cambia, wallet.",
  },
  cutcraft: {
    brand: "CutCraft",
    kind: "App",
    title: "Cutting room",
    lead: "Montaggio come in sala, non un editor giocattolo.",
    capability: "Reel, marca in/out, grade, export di prova.",
  },
  "nexora-crm": {
    brand: "Nexora CRM",
    kind: "App",
    title: "Clientela privata",
    lead: "Una scrivania di maison, non una pipeline colorata.",
    capability: "Dossier, note, chiusura pratica.",
  },
  sonora: {
    brand: "Sonora",
    kind: "App",
    title: "Studio di ascolto",
    lead: "Vinile, rame, fader. Il mix è un rito.",
    capability: "Traccia, mix, master di demo.",
  },
  toonverse: {
    brand: "ToonVerse",
    kind: "App",
    title: "Tavolo di animazione",
    lead: "Inchiostro e carta, non clipart.",
    capability: "Storyboard, pose, playback.",
  },
  orbital: {
    brand: "Orbital",
    kind: "App",
    title: "Console di missione",
    lead: "Vuoto, segnale, un burn che non parte davvero.",
    capability: "Veicolo, telemetria, manovra simulata.",
  },
  stormglass: {
    brand: "StormGlass",
    kind: "App",
    title: "Osservatorio",
    lead: "Vetro, mare, un brief che cambia con lo strato.",
    capability: "Cella, layer, brief.",
  },
  "world-pulse": {
    brand: "World Pulse",
    kind: "App",
    title: "Desk di attualità",
    lead: "Carta e filo, non un feed infinito.",
    capability: "Storia, copia, pubblicazione locale.",
  },
  roomverse: {
    brand: "RoomVerse",
    kind: "App",
    title: "Atelier di interni",
    lead: "Intonaco, noce, ottone. La stanza è il prodotto.",
    capability: "Stanza, materiale, posa.",
  },
  aurelion: {
    brand: "Aurelion Motors",
    kind: "Sito",
    title: "Maison automobilistica",
    lead: "Gullwing, museo, cromo. La stella in ogni epoca.",
    capability: "Flotta fotografica, giorni, prenotazione.",
  },
  "vela-noir": {
    brand: "Vela Noir",
    kind: "Sito",
    title: "Lookbook",
    lead: "Nero, avorio, un rosso di atelier. Non una vetrina di crêpe.",
    capability: "Look, taglia, guardaroba.",
  },
  "maison-27": {
    brand: "Maison 27",
    kind: "Sito",
    title: "Hotel maison",
    lead: "Pietra e lino. Una notte, non un catalogo di camere.",
    capability: "Suite, notti, richiesta.",
  },
  "studio-monolith": {
    brand: "Studio Monolith",
    kind: "Sito",
    title: "Atelier di architettura",
    lead: "Cemento, inchiostro, ruggine. Masse, non moodboard.",
    capability: "Progetto, pianta, richiesta.",
  },
  "nestra-estates": {
    brand: "Nestra Estates",
    kind: "Sito",
    title: "Concierge immobiliare",
    lead: "Ville e stagione. Un dossier, non un portale.",
    capability: "Casa, stagione, visita.",
  },
  "lumen-festival": {
    brand: "Lumen Festival",
    kind: "Sito",
    title: "Programma culturale",
    lead: "Notte, oro, un pass. Non una griglia di eventi.",
    capability: "Giorno, palco, pass.",
  },
  cinematica: {
    brand: "Cinematica",
    kind: "Programma",
    title: "Montaggio cinema",
    lead: "Sala buia, oro da proiettore. Il tempo è il materiale.",
    capability: "Reel, taglio, grade.",
  },
  "atlas-command": {
    brand: "Atlas Command",
    kind: "Programma",
    title: "Comando geospatiale",
    lead: "Teatri e layer. Un ordine che resta a terra.",
    capability: "Teatro, layer, ordine.",
  },
  worldforge: {
    brand: "WorldForge",
    kind: "Programma",
    title: "Forgia di mondi",
    lead: "Cresta, duna, bosco. Un seed, poi il suolo.",
    capability: "Bioma, seed, generazione.",
  },
};

const EN: Record<PremiumDemoId, CardCopy> = {
  "velvet-table": {
    brand: "Velvet Table",
    kind: "App",
    title: "Gastronomic concierge",
    lead: "The digital service of a grand hotel. Not Booking with food photos.",
    capability: "Photographic hero, luminous tables, changing views, wallet.",
  },
  cutcraft: {
    brand: "CutCraft",
    kind: "App",
    title: "Cutting room",
    lead: "Editing as a room, not a toy timeline.",
    capability: "Reel, in/out marks, grade, trial export.",
  },
  "nexora-crm": {
    brand: "Nexora CRM",
    kind: "App",
    title: "Private clientele",
    lead: "A maison desk, not a coloured pipeline.",
    capability: "Dossier, notes, close the file.",
  },
  sonora: {
    brand: "Sonora",
    kind: "App",
    title: "Listening studio",
    lead: "Vinyl, copper, faders. The mix is a rite.",
    capability: "Track, mix, demo master.",
  },
  toonverse: {
    brand: "ToonVerse",
    kind: "App",
    title: "Animation desk",
    lead: "Ink and paper, not clipart.",
    capability: "Storyboard, poses, playback.",
  },
  orbital: {
    brand: "Orbital",
    kind: "App",
    title: "Mission console",
    lead: "Void, signal, a burn that never leaves.",
    capability: "Craft, telemetry, simulated maneuver.",
  },
  stormglass: {
    brand: "StormGlass",
    kind: "App",
    title: "Observatory",
    lead: "Glass, sea, a brief that changes with the layer.",
    capability: "Cell, layer, brief.",
  },
  "world-pulse": {
    brand: "World Pulse",
    kind: "App",
    title: "News desk",
    lead: "Paper and wire, not an endless feed.",
    capability: "Story, copy, local publish.",
  },
  roomverse: {
    brand: "RoomVerse",
    kind: "App",
    title: "Interior atelier",
    lead: "Plaster, walnut, brass. The room is the product.",
    capability: "Room, material, placement.",
  },
  aurelion: {
    brand: "Aurelion Motors",
    kind: "Site",
    title: "Automotive maison",
    lead: "Gullwing, museum light, chrome. The star in every era.",
    capability: "Photographic fleet, days, reservation.",
  },
  "vela-noir": {
    brand: "Vela Noir",
    kind: "Site",
    title: "Lookbook",
    lead: "Black, ivory, atelier red. Not a crêpe shopfront.",
    capability: "Look, size, wardrobe.",
  },
  "maison-27": {
    brand: "Maison 27",
    kind: "Site",
    title: "Hotel maison",
    lead: "Stone and linen. One night, not a room catalog.",
    capability: "Suite, nights, enquiry.",
  },
  "studio-monolith": {
    brand: "Studio Monolith",
    kind: "Site",
    title: "Architecture atelier",
    lead: "Concrete, ink, rust. Masses, not a moodboard.",
    capability: "Project, plan, request.",
  },
  "nestra-estates": {
    brand: "Nestra Estates",
    kind: "Site",
    title: "Property concierge",
    lead: "Villas and season. A dossier, not a portal.",
    capability: "House, season, visit.",
  },
  "lumen-festival": {
    brand: "Lumen Festival",
    kind: "Site",
    title: "Cultural programme",
    lead: "Night, gold, a pass. Not an event grid.",
    capability: "Day, stage, pass.",
  },
  cinematica: {
    brand: "Cinematica",
    kind: "Program",
    title: "Cinema edit",
    lead: "Dark hall, projector gold. Time is the material.",
    capability: "Reel, cut, grade.",
  },
  "atlas-command": {
    brand: "Atlas Command",
    kind: "Program",
    title: "Geospatial command",
    lead: "Theatres and layers. An order that stays on the ground.",
    capability: "Theatre, layer, order.",
  },
  worldforge: {
    brand: "WorldForge",
    kind: "Program",
    title: "World forge",
    lead: "Ridge, dune, forest. A seed, then the ground.",
    capability: "Biome, seed, generate.",
  },
};

export type PremiumCard = CardCopy & {
  id: PremiumDemoId;
  photo: string;
  surface: PremiumSurface;
  prompt: string;
};

export function premiumDemoTitle(id: PremiumDemoId, locale: Locale): string {
  return (locale === "it" ? IT : EN)[id].brand;
}

export function premiumDemosFor(locale: Locale, surface?: PremiumSurface): PremiumCard[] {
  const table = locale === "it" ? IT : EN;
  return PREMIUM_DEMO_IDS.filter((id) => !surface || PREMIUM_SURFACES[id] === surface).map((id) => ({
    id,
    photo: PREMIUM_PHOTOS[id],
    surface: PREMIUM_SURFACES[id],
    prompt: PREMIUM_PROMPTS[id],
    ...table[id],
  }));
}

export const SURFACE_LABELS: Record<Locale, Record<PremiumSurface | "all", string>> = {
  it: { all: "Tutte · 18", app: "App · 9", site: "Siti · 6", program: "Programmi · 3" },
  en: { all: "All · 18", app: "Apps · 9", site: "Sites · 6", program: "Programs · 3" },
  es: { all: "Todas · 18", app: "Apps · 9", site: "Sitios · 6", program: "Programas · 3" },
  fr: { all: "Toutes · 18", app: "Apps · 9", site: "Sites · 6", program: "Programmes · 3" },
  de: { all: "Alle · 18", app: "Apps · 9", site: "Sites · 6", program: "Programme · 3" },
  pt: { all: "Todas · 18", app: "Apps · 9", site: "Sites · 6", program: "Programas · 3" },
};

export const SURFACE_TITLES: Record<Locale, Record<PremiumSurface, { title: string; lead: string }>> = {
  it: {
    app: { title: "App", lead: "Nove prodotti interattivi, ciascuno con una stanza e un rito." },
    site: { title: "Siti", lead: "Sei maisons. Fotografia, non rettangoli." },
    program: { title: "Programmi", lead: "Tre strumenti densi: cinema, comando, forgia." },
  },
  en: {
    app: { title: "Apps", lead: "Nine interactive products, each a room and a rite." },
    site: { title: "Sites", lead: "Six maisons. Photography, not rectangles." },
    program: { title: "Programs", lead: "Three dense tools: cinema, command, forge." },
  },
  es: {
    app: { title: "Apps", lead: "Nueve productos interactivos." },
    site: { title: "Sitios", lead: "Seis maisons. Fotografía." },
    program: { title: "Programas", lead: "Cine, mando, forja." },
  },
  fr: {
    app: { title: "Apps", lead: "Neuf produits interactifs." },
    site: { title: "Sites", lead: "Six maisons. Photographie." },
    program: { title: "Programmes", lead: "Cinéma, commandement, forge." },
  },
  de: {
    app: { title: "Apps", lead: "Neun interaktive Produkte." },
    site: { title: "Sites", lead: "Sechs Maisons. Fotografie." },
    program: { title: "Programme", lead: "Kino, Kommando, Esse." },
  },
  pt: {
    app: { title: "Apps", lead: "Nove produtos interativos." },
    site: { title: "Sites", lead: "Seis maisons. Fotografia." },
    program: { title: "Programas", lead: "Cinema, comando, forja." },
  },
};
