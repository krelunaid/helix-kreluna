import type { PremiumDemoId } from "@/demos/registry";

export type WorkKind =
  | "cut"
  | "mix"
  | "desk"
  | "pose"
  | "launch"
  | "brief"
  | "publish"
  | "room"
  | "reserve"
  | "look"
  | "stay"
  | "request"
  | "visit"
  | "pass"
  | "order"
  | "forge";

export type Layout =
  | "strip"
  | "dossier"
  | "stage"
  | "ink"
  | "void"
  | "glass"
  | "wire"
  | "salon"
  | "lookbook"
  | "mass"
  | "land"
  | "command"
  | "forge";

export type Line = { it: string; en: string };

export type DemoItem = {
  id: string;
  photo: string;
  title: Line;
  meta: Line;
  note: Line;
};

export type DemoSpec = {
  id: PremiumDemoId;
  layout: Layout;
  work: WorkKind;
  word: Line;
  ink: string;
  cream: string;
  accent: string;
  mute: string;
  serif: string;
  hero: string;
  items: DemoItem[];
  title: Line;
  lead: Line;
  kicker: Line;
  board: Line;
  act: Line;
  done: Line;
  notice: Line;
};

const L = (it: string, en: string): Line => ({ it, en });

export const DEMO_SPECS: Record<Exclude<PremiumDemoId, "velvet-table">, DemoSpec> = {
  cutcraft: {
    id: "cutcraft",
    layout: "strip",
    work: "cut",
    word: L("Taglio", "Cut"),
    ink: "#0a0b0d",
    cream: "#e8e2d6",
    accent: "#7dfff0",
    mute: "#9aa3a1",
    serif: '"IBM Plex Mono", ui-monospace, monospace',
    hero: "/vetrina/cutcraft/reel.jpg",
    items: [
      { id: "night", photo: "/vetrina/cutcraft/reel.jpg", title: L("Notte 04", "Night 04"), meta: L("35mm · 02:18", "35mm · 02:18"), note: L("Il nero prima del volto.", "Black before the face.") },
      { id: "bench", photo: "/vetrina/cutcraft/bench.jpg", title: L("Banco", "Bench"), meta: L("4K · 01:02", "4K · 01:02"), note: L("Mani, polvere, un taglio.", "Hands, dust, one cut.") },
      { id: "grain", photo: "/vetrina/cutcraft/grain.jpg", title: L("Grana", "Grain"), meta: L("16mm · 00:47", "16mm · 00:47"), note: L("La luce mangia il bordo.", "Light eats the edge.") },
    ],
    title: L("Il tempo si taglia in sala.", "Time is cut in the room."),
    lead: L("In, out, grade. Poi un export che non lascia la macchina.", "In, out, grade. Then an export that never leaves the machine."),
    kicker: L("Cutting room", "Cutting room"),
    board: L("Reel sul banco", "Reels on the bench"),
    act: L("Marca e grade", "Mark and grade"),
    done: L("Export di prova pronto.", "Trial export ready."),
    notice: L("Nessun file è stato inviato.", "Nothing was transmitted."),
  },
  "nexora-crm": {
    id: "nexora-crm",
    layout: "dossier",
    work: "desk",
    word: L("Pratica", "File"),
    ink: "#10141c",
    cream: "#e7dcc8",
    accent: "#c4a574",
    mute: "#b3a894",
    serif: '"Cormorant Garamond", serif',
    hero: "/vetrina/nexora/office.jpg",
    items: [
      { id: "vale", photo: "/vetrina/nexora/office.jpg", title: L("Casa Vale", "Casa Vale"), meta: L("Milano · privata", "Milan · private"), note: L("Trust, tre sedi, un silenzio.", "Trust, three seats, one silence.") },
      { id: "nord", photo: "/vetrina/nexora/desk.jpg", title: L("Nord Atelier", "Nord Atelier"), meta: L("Zurigo · family", "Zurich · family"), note: L("Il dossier è più corto della voce.", "The file is shorter than the voice.") },
      { id: "lido", photo: "/vetrina/nexora/folio.jpg", title: L("Lido Holding", "Lido Holding"), meta: L("Venezia · office", "Venice · office"), note: L("Una nota, poi si chiude.", "One note, then it closes.") },
    ],
    title: L("La clientela non è una pipeline.", "Clientele is not a pipeline."),
    lead: L("Dossier, inchiostro, una chiusura.", "Dossier, ink, a close."),
    kicker: L("Scrivania privata", "Private desk"),
    board: L("Pratiche aperte", "Open files"),
    act: L("Nota di casa", "House note"),
    done: L("Pratica chiusa in locale.", "File closed locally."),
    notice: L("Nessun CRM esterno è stato toccato.", "No external CRM was touched."),
  },
  sonora: {
    id: "sonora",
    layout: "stage",
    work: "mix",
    word: L("Ascolto", "Listen"),
    ink: "#0c0a12",
    cream: "#f0e6d8",
    accent: "#c4843a",
    mute: "#b8a894",
    serif: '"Fraunces", serif',
    hero: "/vetrina/sonora/vinyl.jpg",
    items: [
      { id: "amber", photo: "/vetrina/sonora/vinyl.jpg", title: L("Amber Take", "Amber Take"), meta: L("Vinile · 96k", "Vinyl · 96k"), note: L("Il scratch è parte del brano.", "The scratch is part of the piece.") },
      { id: "room", photo: "/vetrina/sonora/desk.jpg", title: L("Room Two", "Room Two"), meta: L("Nastro · 1/4", "Tape · 1/4"), note: L("Rame e fader, niente lucine.", "Copper and faders, no toys.") },
      { id: "hall", photo: "/vetrina/sonora/stage.jpg", title: L("Hall Live", "Hall Live"), meta: L("Sala · notte", "Hall · night"), note: L("Il pubblico è un riverbero.", "The room is the reverb.") },
    ],
    title: L("Il mix è un rito, non un preset.", "A mix is a rite, not a preset."),
    lead: L("Tre fader. Un master che resta qui.", "Three faders. A master that stays here."),
    kicker: L("Studio", "Studio"),
    board: L("Prese della notte", "Night takes"),
    act: L("Mix e master", "Mix and master"),
    done: L("Master di demo scritto in locale.", "Demo master written locally."),
    notice: L("Nessun brano è stato pubblicato.", "Nothing was released."),
  },
  toonverse: {
    id: "toonverse",
    layout: "ink",
    work: "pose",
    word: L("Inchiostro", "Ink"),
    ink: "#11100c",
    cream: "#f7efe0",
    accent: "#f4e27a",
    mute: "#c9b98a",
    serif: '"Bebas Neue", sans-serif',
    hero: "/vetrina/toonverse/desk.jpg",
    items: [
      { id: "walk", photo: "/vetrina/toonverse/desk.jpg", title: L("Passo 01", "Walk 01"), meta: L("12 fogli", "12 sheets"), note: L("Il peso cade sul due.", "Weight falls on two.") },
      { id: "turn", photo: "/vetrina/toonverse/ink.jpg", title: L("Giro", "Turn"), meta: L("8 fogli", "8 sheets"), note: L("La testa arriva dopo il busto.", "The head follows the torso.") },
      { id: "hold", photo: "/vetrina/toonverse/wall.jpg", title: L("Hold", "Hold"), meta: L("4 fogli", "4 sheets"), note: L("Il silenzio è un disegno.", "Silence is a drawing.") },
    ],
    title: L("La carta si muove, non la clipart.", "Paper moves, not clipart."),
    lead: L("Uno shot, una posa, il playback sul banco.", "One shot, one pose, playback on the desk."),
    kicker: L("Tavolo", "Desk"),
    board: L("Storyboard", "Storyboard"),
    act: L("Posa e play", "Pose and play"),
    done: L("Ciclo tenuto in memoria.", "Cycle held in memory."),
    notice: L("Nessun foglio è stato esportato.", "No sheet was exported."),
  },
  orbital: {
    id: "orbital",
    layout: "void",
    work: "launch",
    word: L("Vuoto", "Void"),
    ink: "#05070a",
    cream: "#d8f5e6",
    accent: "#9ef2c5",
    mute: "#7f9a88",
    serif: '"IBM Plex Mono", ui-monospace, monospace',
    hero: "/vetrina/orbital/earth.jpg",
    items: [
      { id: "kite", photo: "/vetrina/orbital/earth.jpg", title: L("Kite-4", "Kite-4"), meta: L("LEO · 410 km", "LEO · 410 km"), note: L("Prossimo contatto: Kiruna.", "Next contact: Kiruna.") },
      { id: "vega", photo: "/vetrina/orbital/craft.jpg", title: L("Vega-2", "Vega-2"), meta: L("SSO · 98.1°", "SSO · 98.1°"), note: L("Fuel nominale.", "Fuel nominal.") },
      { id: "pad", photo: "/vetrina/orbital/pad.jpg", title: L("Pad Nord", "North Pad"), meta: L("Terra", "Ground"), note: L("Nessun comando in volo.", "No command in flight.") },
    ],
    title: L("Una manovra che non parte.", "A maneuver that never leaves."),
    lead: L("Veicolo, burn, conferma. Tutto resta a terra.", "Craft, burn, confirm. All of it stays grounded."),
    kicker: L("Missione", "Mission"),
    board: L("Flotta", "Fleet"),
    act: L("Piano di burn", "Burn plan"),
    done: L("Simulazione aggiornata.", "Simulation updated."),
    notice: L("Nessun comando è stato trasmesso.", "No command was sent."),
  },
  stormglass: {
    id: "stormglass",
    layout: "glass",
    work: "brief",
    word: L("Vetro", "Glass"),
    ink: "#0b1218",
    cream: "#d7e6f2",
    accent: "#7eb6ff",
    mute: "#8aa3b5",
    serif: '"Fraunces", serif',
    hero: "/vetrina/stormglass/sea.jpg",
    items: [
      { id: "sea", photo: "/vetrina/stormglass/sea.jpg", title: L("Cella Tirreno", "Tyrrhenian cell"), meta: L("Vento 7", "Wind 7"), note: L("Il vetro si appanna a ovest.", "Glass fogs to the west.") },
      { id: "sky", photo: "/vetrina/stormglass/sky.jpg", title: L("Cella Alta", "High cell"), meta: L("Cirrus", "Cirrus"), note: L("Luce secca, bordo tagliente.", "Dry light, a sharp edge.") },
      { id: "peak", photo: "/vetrina/stormglass/peak.jpg", title: L("Cella Cresta", "Ridge cell"), meta: L("Neve", "Snow"), note: L("Lo strato scende dopo le 18.", "The layer drops after 18.") },
    ],
    title: L("Il mare si legge a strati.", "The sea is read in layers."),
    lead: L("Una cella, un layer, un brief.", "A cell, a layer, a brief."),
    kicker: L("Osservatorio", "Observatory"),
    board: L("Celle", "Cells"),
    act: L("Strato e brief", "Layer and brief"),
    done: L("Brief scritto per la sala.", "Brief written for the room."),
    notice: L("Nessun allarme è stato inviato.", "No alert was sent."),
  },
  "world-pulse": {
    id: "world-pulse",
    layout: "wire",
    work: "publish",
    word: L("Filo", "Wire"),
    ink: "#12110f",
    cream: "#f3ece3",
    accent: "#c43b2c",
    mute: "#b7aaa0",
    serif: '"Source Serif 4", serif',
    hero: "/vetrina/world-pulse/desk.jpg",
    items: [
      { id: "rome", photo: "/vetrina/world-pulse/desk.jpg", title: L("Roma, prima dell’alba", "Rome before dawn"), meta: L("Desk · Italia", "Desk · Italy"), note: L("Il titolo è più corto della piazza.", "The title is shorter than the square.") },
      { id: "wire", photo: "/vetrina/world-pulse/paper.jpg", title: L("Filo del mattino", "Morning wire"), meta: L("Carta", "Paper"), note: L("Tre fatti, nessuna coda.", "Three facts, no tail.") },
      { id: "city", photo: "/vetrina/world-pulse/city.jpg", title: L("Torri, vento", "Towers, wind"), meta: L("Città", "City"), note: L("La foto porta il peso.", "The photograph carries the weight.") },
    ],
    title: L("Una desk, non un feed.", "A desk, not a feed."),
    lead: L("Scegli la storia, chiudi la copia, pubblica in locale.", "Pick the story, lock the copy, publish locally."),
    kicker: L("Attualità", "News"),
    board: L("Storie della notte", "Overnight stories"),
    act: L("Copia e sigillo", "Copy and seal"),
    done: L("Edizione locale chiusa.", "Local edition closed."),
    notice: L("Nessun filo è stato trasmesso.", "No wire was transmitted."),
  },
  roomverse: {
    id: "roomverse",
    layout: "salon",
    work: "room",
    word: L("Stanza", "Room"),
    ink: "#1a1612",
    cream: "#efe6d8",
    accent: "#b08958",
    mute: "#b8aa96",
    serif: '"Fraunces", serif',
    hero: "/vetrina/roomverse/salon.jpg",
    items: [
      { id: "salon", photo: "/vetrina/roomverse/salon.jpg", title: L("Salone ovest", "West salon"), meta: L("Noce · ottone", "Walnut · brass"), note: L("La luce entra bassa.", "Light enters low.") },
      { id: "suite", photo: "/vetrina/roomverse/suite.jpg", title: L("Camera 27", "Room 27"), meta: L("Lino · pietra", "Linen · stone"), note: L("Il letto è una massa.", "The bed is a mass.") },
      { id: "stone", photo: "/vetrina/roomverse/stone.jpg", title: L("Bagno di pietra", "Stone bath"), meta: L("Travertino", "Travertine"), note: L("Acqua e ombra.", "Water and shade.") },
    ],
    title: L("La stanza è il prodotto.", "The room is the product."),
    lead: L("Scegli una stanza, un materiale, posa.", "Choose a room, a material, place it."),
    kicker: L("Atelier", "Atelier"),
    board: L("Stanze", "Rooms"),
    act: L("Materiale e posa", "Material and place"),
    done: L("Posa tenuta in sala.", "Placement held in the room."),
    notice: L("Nessun ordine è stato inviato.", "No order was sent."),
  },
  aurelion: {
    id: "aurelion",
    layout: "salon",
    work: "reserve",
    word: L("Stella", "Star"),
    ink: "#070707",
    cream: "#f3ebda",
    accent: "#8f1d2c",
    mute: "#c4b9a6",
    serif: '"Cormorant Garamond", serif',
    hero: "/vetrina/aurelion/mercedes-300-sl-wings.jpg",
    items: [
      { id: "wings", photo: "/vetrina/aurelion/mercedes-300-sl-wings.jpg", title: L("300 SL Gullwing", "300 SL Gullwing"), meta: L("1955 · storiche", "1955 · historic"), note: L("Porte ad ali. La prima, prima della parola.", "Gullwing doors. The first, before the word.") },
      { id: "sl190", photo: "/vetrina/aurelion/mercedes-190-sl.jpg", title: L("190 SL", "190 SL"), meta: L("1960 · avorio", "1960 · ivory"), note: L("Pelle rossa, un weekend fino a mezzanotte.", "Red leather, a weekend until midnight.") },
      { id: "pagoda", photo: "/vetrina/aurelion/mercedes-280-sl.jpg", title: L("280 SL Pagoda", "280 SL Pagoda"), meta: L("1963 · Como", "1963 · Como"), note: L("Il tetto e la luce del lago.", "The roof and the light of the lake.") },
      { id: "amg", photo: "/vetrina/aurelion/mercedes-amg-gt.jpg", title: L("AMG GT", "AMG GT"), meta: L("2024 · moderna", "2024 · modern"), note: L("Eccellenza, stessa stella.", "Excellence, the same star.") },
      { id: "closed", photo: "/vetrina/aurelion/mercedes-300-sl.jpg", title: L("300 SL Coupé", "300 SL Coupé"), meta: L("1955 · chiusa", "1955 · closed"), note: L("Le ali riposano. Il cromo resta.", "The wings rest. Chrome remains.") },
      { id: "g63", photo: "/vetrina/aurelion/mercedes-g-63.jpg", title: L("G 63", "G 63"), meta: L("2023 · neve", "2023 · snow"), note: L("Il G, per le strade e per la neve.", "The G, for roads and snow.") },
      { id: "salon", photo: "/vetrina/aurelion/event-salon.jpg", title: L("Salon Privé", "Salon Privé"), meta: L("Evento", "Event"), note: L("La sala, non la strada.", "The room, not the road.") },
      { id: "villa", photo: "/vetrina/aurelion/event-villa.jpg", title: L("Villa serale", "Evening villa"), meta: L("Evento", "Event"), note: L("Il cortile, le luci, la stella.", "The court, the lights, the star.") },
    ],
    title: L("Viaggi senza tempo.", "Journeys without time."),
    lead: L("La stella, in ogni epoca. Una flotta, non un listino.", "The star, in every era. A fleet, not a price list."),
    kicker: L("Collezione", "Collection"),
    board: L("Flotta", "Fleet"),
    act: L("Giorni e ritiro", "Days and collection"),
    done: L("Richiesta demo pronta.", "Demo request ready."),
    notice: L("Nessuna prenotazione reale è stata inviata.", "No real booking was sent."),
  },
  "vela-noir": {
    id: "vela-noir",
    layout: "lookbook",
    work: "look",
    word: L("Vela", "Vela"),
    ink: "#0a0a0a",
    cream: "#f4efe6",
    accent: "#9a1f2a",
    mute: "#b8aea4",
    serif: '"Playfair Display", serif',
    hero: "/vetrina/vela-noir/look.jpg",
    items: [
      { id: "noir", photo: "/vetrina/vela-noir/look.jpg", title: L("Noir 12", "Noir 12"), meta: L("Atelier · nero", "Atelier · black"), note: L("Il taglio è la luce.", "The cut is the light.") },
      { id: "run", photo: "/vetrina/vela-noir/runway.jpg", title: L("Passo", "Stride"), meta: L("Notte", "Night"), note: L("Un rosso, non un catalogo.", "One red, not a catalog.") },
      { id: "room", photo: "/vetrina/vela-noir/atelier.jpg", title: L("Sala prova", "Fitting room"), meta: L("Avorio", "Ivory"), note: L("La taglia si prova, non si filtra.", "Size is tried, not filtered.") },
    ],
    title: L("Il nero tiene il resto.", "Black holds the rest."),
    lead: L("Look, taglia, guardaroba. Solo abito.", "Look, size, wardrobe. Cloth only."),
    kicker: L("Maison", "Maison"),
    board: L("Collezione", "Collection"),
    act: L("Taglia e guardaroba", "Size and wardrobe"),
    done: L("Pezzo tenuto nel guardaroba.", "Piece held in the wardrobe."),
    notice: L("Nessun ordine è stato inviato.", "No order was sent."),
  },
  "maison-27": {
    id: "maison-27",
    layout: "land",
    work: "stay",
    word: L("Notte", "Night"),
    ink: "#16110c",
    cream: "#e8dcc8",
    accent: "#8b6a3a",
    mute: "#b6a78e",
    serif: '"Cormorant Garamond", serif',
    hero: "/vetrina/maison-27/lobby.jpg",
    items: [
      { id: "lobby", photo: "/vetrina/maison-27/lobby.jpg", title: L("Hall 27", "Hall 27"), meta: L("Pietra", "Stone"), note: L("Si entra in silenzio.", "You enter in silence.") },
      { id: "suite", photo: "/vetrina/maison-27/suite.jpg", title: L("Suite Lino", "Linen suite"), meta: L("27 mq", "27 sqm"), note: L("Il letto guarda il cortile.", "The bed faces the court.") },
      { id: "pool", photo: "/vetrina/maison-27/pool.jpg", title: L("Acqua", "Water"), meta: L("Cortile", "Court"), note: L("Una notte, non un soggiorno.", "One night, not a stay.") },
    ],
    title: L("Una notte in maison.", "A night in the maison."),
    lead: L("Suite, notti, una richiesta che resta qui.", "Suite, nights, an enquiry that stays here."),
    kicker: L("Maison", "Maison"),
    board: L("Stanze", "Rooms"),
    act: L("Notti", "Nights"),
    done: L("Richiesta tenuta in reception.", "Enquiry held at reception."),
    notice: L("Nessuna prenotazione reale.", "No real booking."),
  },
  "studio-monolith": {
    id: "studio-monolith",
    layout: "mass",
    work: "request",
    word: L("Massa", "Mass"),
    ink: "#121212",
    cream: "#e6e2db",
    accent: "#9a4a2a",
    mute: "#a8a29a",
    serif: '"Fraunces", serif',
    hero: "/vetrina/studio-monolith/tower.jpg",
    items: [
      { id: "tower", photo: "/vetrina/studio-monolith/tower.jpg", title: L("Torre Corta", "Short Tower"), meta: L("Milano", "Milan"), note: L("Il peso sta in basso.", "The weight sits low.") },
      { id: "model", photo: "/vetrina/studio-monolith/model.jpg", title: L("Modello 08", "Model 08"), meta: L("Gesso", "Plaster"), note: L("La luce taglia lo spigolo.", "Light cuts the edge.") },
      { id: "plan", photo: "/vetrina/studio-monolith/plan.jpg", title: L("Pianta Nord", "North plan"), meta: L("1:200", "1:200"), note: L("Pochi muri, un vuoto.", "Few walls, one void.") },
    ],
    title: L("Masse, non moodboard.", "Masses, not a moodboard."),
    lead: L("Un progetto, una pianta, una richiesta.", "A project, a plan, a request."),
    kicker: L("Atelier", "Atelier"),
    board: L("Opere", "Works"),
    act: L("Richiesta di studio", "Studio request"),
    done: L("Richiesta sul tavolo.", "Request on the table."),
    notice: L("Nessun incarico è stato aperto.", "No commission was opened."),
  },
  "nestra-estates": {
    id: "nestra-estates",
    layout: "land",
    work: "visit",
    word: L("Suolo", "Ground"),
    ink: "#142018",
    cream: "#eadfcb",
    accent: "#c46a3a",
    mute: "#b8ad96",
    serif: '"Cormorant Garamond", serif',
    hero: "/vetrina/nestra/villa.jpg",
    items: [
      { id: "villa", photo: "/vetrina/nestra/villa.jpg", title: L("Villa Alta", "Villa Alta"), meta: L("Toscana", "Tuscany"), note: L("La casa guarda il campo.", "The house faces the field.") },
      { id: "court", photo: "/vetrina/nestra/court.jpg", title: L("Corte", "Court"), meta: L("Estate", "Summer"), note: L("L’ombra è un servizio.", "Shade is a service.") },
      { id: "lawn", photo: "/vetrina/nestra/lawn.jpg", title: L("Prato", "Lawn"), meta: L("Inverno", "Winter"), note: L("Si visita a gennaio.", "Visited in January.") },
    ],
    title: L("Un dossier, non un portale.", "A dossier, not a portal."),
    lead: L("Villa, stagione, una visita.", "Villa, season, a visit."),
    kicker: L("Concierge", "Concierge"),
    board: L("Case", "Houses"),
    act: L("Stagione e visita", "Season and visit"),
    done: L("Visita segnata sul dossier.", "Visit marked on the dossier."),
    notice: L("Nessuna proposta è stata inviata.", "No offer was sent."),
  },
  "lumen-festival": {
    id: "lumen-festival",
    layout: "stage",
    work: "pass",
    word: L("Lume", "Lumen"),
    ink: "#0b0614",
    cream: "#f2e38a",
    accent: "#7a3dff",
    mute: "#c4b56a",
    serif: '"Bebas Neue", sans-serif',
    hero: "/vetrina/lumen-festival/stage.jpg",
    items: [
      { id: "ven", photo: "/vetrina/lumen-festival/stage.jpg", title: L("Venerdì · Palco Oro", "Friday · Gold stage"), meta: L("22:10", "22:10"), note: L("Il suono arriva dal fondo.", "Sound arrives from the back.") },
      { id: "sat", photo: "/vetrina/lumen-festival/crowd.jpg", title: L("Sabato · Folla", "Saturday · Crowd"), meta: L("23:40", "23:40"), note: L("Un pass, non una griglia.", "One pass, not a grid.") },
      { id: "sun", photo: "/vetrina/lumen-festival/night.jpg", title: L("Domenica · Chiusura", "Sunday · Close"), meta: L("21:00", "21:00"), note: L("Le luci restano basse.", "The lights stay low.") },
    ],
    title: L("La notte ha un programma.", "The night has a programme."),
    lead: L("Un giorno, un palco, un pass.", "A day, a stage, a pass."),
    kicker: L("Festival", "Festival"),
    board: L("Giorni", "Days"),
    act: L("Pass", "Pass"),
    done: L("Pass tenuto nel wallet.", "Pass held in the wallet."),
    notice: L("Nessun biglietto è stato venduto.", "No ticket was sold."),
  },
  cinematica: {
    id: "cinematica",
    layout: "strip",
    work: "cut",
    word: L("Sala", "Hall"),
    ink: "#0b0a08",
    cream: "#e6d5a3",
    accent: "#d4a017",
    mute: "#b8a56a",
    serif: '"Playfair Display", serif',
    hero: "/vetrina/cinematica/hall.jpg",
    items: [
      { id: "hall", photo: "/vetrina/cinematica/hall.jpg", title: L("Sala 1", "Hall 1"), meta: L("Scope", "Scope"), note: L("Il tempo è il materiale.", "Time is the material.") },
      { id: "reel", photo: "/vetrina/cinematica/reel.jpg", title: L("Reel B", "Reel B"), meta: L("24 fps", "24 fps"), note: L("Il taglio è una respirazione.", "The cut is a breath.") },
      { id: "light", photo: "/vetrina/cinematica/light.jpg", title: L("Luce", "Light"), meta: L("Grade", "Grade"), note: L("Oro da proiettore, non un filtro.", "Projector gold, not a filter.") },
    ],
    title: L("Il tempo è il materiale.", "Time is the material."),
    lead: L("Reel, taglio, grade. Un programma, non un sito.", "Reel, cut, grade. A program, not a site."),
    kicker: L("Cinema", "Cinema"),
    board: L("Bobine", "Reels"),
    act: L("Taglio e grade", "Cut and grade"),
    done: L("Bobina chiusa in locale.", "Reel closed locally."),
    notice: L("Nessun DCP è stato scritto.", "No DCP was written."),
  },
  "atlas-command": {
    id: "atlas-command",
    layout: "command",
    work: "order",
    word: L("Atlante", "Atlas"),
    ink: "#0e1410",
    cream: "#d6c89a",
    accent: "#d07a2a",
    mute: "#a89a6e",
    serif: '"IBM Plex Mono", ui-monospace, monospace',
    hero: "/vetrina/atlas-command/globe.jpg",
    items: [
      { id: "globe", photo: "/vetrina/atlas-command/globe.jpg", title: L("Teatro Nord", "North theatre"), meta: L("Layer suolo", "Ground layer"), note: L("L’ordine resta a terra.", "The order stays on the ground.") },
      { id: "map", photo: "/vetrina/atlas-command/map.jpg", title: L("Città", "City"), meta: L("Layer rete", "Grid layer"), note: L("Tre nodi, un corridoio.", "Three nodes, one corridor.") },
      { id: "ridge", photo: "/vetrina/atlas-command/ridge.jpg", title: L("Cresta", "Ridge"), meta: L("Layer rilievo", "Relief layer"), note: L("Niente volo.", "No flight.") },
    ],
    title: L("Un ordine che non vola.", "An order that does not fly."),
    lead: L("Teatro, layer, firma. Tutto simulato.", "Theatre, layer, sign. All of it simulated."),
    kicker: L("Comando", "Command"),
    board: L("Teatri", "Theatres"),
    act: L("Layer e ordine", "Layer and order"),
    done: L("Ordine firmato in locale.", "Order signed locally."),
    notice: L("Nessun sistema d’arma è collegato.", "No weapon system is linked."),
  },
  worldforge: {
    id: "worldforge",
    layout: "forge",
    work: "forge",
    word: L("Forgia", "Forge"),
    ink: "#0c0d10",
    cream: "#e8dcc4",
    accent: "#e05a2a",
    mute: "#b8a888",
    serif: '"Fraunces", serif',
    hero: "/vetrina/worldforge/ridge.jpg",
    items: [
      { id: "ridge", photo: "/vetrina/worldforge/ridge.jpg", title: L("Cresta", "Ridge"), meta: L("Roccia", "Rock"), note: L("Il seed tiene la neve.", "The seed holds the snow.") },
      { id: "forest", photo: "/vetrina/worldforge/forest.jpg", title: L("Bosco", "Forest"), meta: L("Ombra", "Shade"), note: L("Il suolo è umido.", "The ground is wet.") },
      { id: "dune", photo: "/vetrina/worldforge/dune.jpg", title: L("Duna", "Dune"), meta: L("Vento", "Wind"), note: L("Una linea, poi il vuoto.", "One line, then void.") },
    ],
    title: L("Un seed, poi il suolo.", "A seed, then the ground."),
    lead: L("Bioma, seme, generazione. Resta in macchina.", "Biome, seed, generate. It stays on the machine."),
    kicker: L("Forgia", "Forge"),
    board: L("Biomi", "Biomes"),
    act: L("Seed e fuoco", "Seed and fire"),
    done: L("Mondo tenuto in memoria.", "World held in memory."),
    notice: L("Nessun mondo è stato pubblicato.", "No world was published."),
  },
};

export function demoSpec(id: Exclude<PremiumDemoId, "velvet-table">): DemoSpec {
  return DEMO_SPECS[id];
}
