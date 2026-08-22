import type { Locale } from "@/lib/i18n-core";
import type { Atmosphere, OccasionId, TableStatus } from "./fixtures";

export type VelvetCopy = {
  brand: string;
  made: string;
  create: string;
  back: string;
  reset: string;
  tour: string;
  touring: string;
  word: string;
  discoverKicker: string;
  discoverTitle: string;
  discoverLead: string;
  search: string;
  occasions: Record<OccasionId, { title: string; line: string }>;
  resultsKicker: string;
  resultsTitle: string;
  list: string;
  map: string;
  filters: string;
  closeFilters: string;
  filterAvailable: string;
  filterPrice: string;
  filterNear: string;
  noMatch: string;
  venue: Record<
    "terrazza-aurora" | "sala-velluto" | "orangerie",
    { name: string; city: string; line: string; dress: string }
  >;
  chefName: string;
  chefRole: string;
  chefNote: string;
  menuTitle: string;
  courses: Record<string, string>;
  chooseTable: string;
  gallery: string;
  menu: string;
  chef: string;
  atmosphere: Record<Atmosphere, string>;
  pickKicker: string;
  pickTitle: string;
  table: string;
  window: string;
  alcove: string;
  garden: string;
  view: string;
  privacy: string;
  privacyLevels: [string, string, string];
  surcharge: string;
  status: Record<TableStatus, string>;
  continueBook: string;
  waitlistJoin: string;
  fullHint: string;
  bookKicker: string;
  bookTitle: string;
  step: string;
  steps: [string, string, string, string];
  people: string;
  date: string;
  tonight: string;
  allergies: string;
  allergiesHint: string;
  extras: string;
  flowers: string;
  wine: string;
  deposit: string;
  depositNote: string;
  next: string;
  backStep: string;
  confirm: string;
  confirming: string;
  walletKicker: string;
  walletTitle: string;
  guests: string;
  invite: string;
  invited: string;
  path: string;
  pathLine: string;
  concierge: string;
  conciergeHint: string;
  send: string;
  calendar: string;
  calendarSaved: string;
  edit: string;
  qr: string;
  reservation: string;
  noticeRomantic: string;
  noticeTable: string;
  noticeBooked: string;
  noticeReset: string;
  noticeTour: string;
  conciergeReply: string;
};

const it: VelvetCopy = {
  brand: "Velvet Table",
  made: "Demo interattiva realizzata con Helix",
  create: "Crea qualcosa di simile",
  back: "Vetrina",
  reset: "Ricomincia",
  tour: "Percorso guidato",
  touring: "In corso",
  word: "Intimo",
  discoverKicker: "Concierge gastronomico",
  discoverTitle: "La sera, scelta come un grand hotel.",
  discoverLead: "Un tavolo, una vista, un rito. Non un elenco.",
  search: "Cerca un locale, una cucina, una riva",
  occasions: {
    romantic: { title: "Cena romantica", line: "Luce bassa. Due coperti. Tempo lento." },
    business: { title: "Tavolo di lavoro", line: "Sala raccolta, servizio discreto." },
    family: { title: "Tavola di famiglia", line: "Cortile, lanterne, più posti." },
  },
  resultsKicker: "Selezione",
  resultsTitle: "Locali per l’atmosfera, non per il voto.",
  list: "Lista",
  map: "Mappa",
  filters: "Filtri",
  closeFilters: "Chiudi",
  filterAvailable: "Stasera",
  filterPrice: "Fascia alta",
  filterNear: "Vicino",
  noMatch: "Nessun locale in questa selezione.",
  venue: {
    "terrazza-aurora": {
      name: "Terrazza Aurora",
      city: "Bellagio · lago",
      line: "Il tramonto sul lago, i tendaggi di seta, il silenzio tra una portata e l’altra.",
      dress: "Abito scuro. Giacche sulla sedia.",
    },
    "sala-velluto": {
      name: "Sala Velluto",
      city: "Milano · Brera",
      line: "Ottone, banquette bordeaux, ombre calde. La sala di un albergo che non si nomina.",
      dress: "Smart. Niente sneakers chiare.",
    },
    orangerie: {
      name: "Orangerie delle Luci",
      city: "Firenze · giardino",
      line: "Candele basse, agrumi in vaso, una tavola che dura la sera intera.",
      dress: "Elegante, senza cerimonia.",
    },
  },
  chefName: "Chiara Bellandi",
  chefRole: "Chef de maison",
  chefNote: "Cucina di stagione, fuoco lento, poche firme. Il menu si legge a voce bassa.",
  menuTitle: "Menu della casa",
  courses: {
    opening: "Carciofo, acciuga, limone di Sorrento",
    garden: "Risotto all’acqua di pomodoro, basilico",
    catch: "Branzino, finocchio, olio nuovo",
    velvet: "Piccione, ciliegia, cacao",
    close: "Cioccolato, sale, olio",
  },
  chooseTable: "Scegli tavolo",
  gallery: "Galleria",
  menu: "Menu",
  chef: "Chef",
  atmosphere: { day: "Giorno", sunset: "Tramonto", night: "Notte" },
  pickKicker: "Sala",
  pickTitle: "Il tavolo è la vista.",
  table: "Tavolo",
  window: "Finestra",
  alcove: "Alcova",
  garden: "Giardino",
  view: "Vista",
  privacy: "Privacy",
  privacyLevels: ["Aperta", "Raccolta", "Riservata"],
  surcharge: "Supplemento vista",
  status: { available: "Libero", waitlist: "Lista", full: "Completo" },
  continueBook: "Prenota questo tavolo",
  waitlistJoin: "Chiedi la lista",
  fullHint: "Questo posto è chiuso per stasera.",
  bookKicker: "Prenotazione",
  bookTitle: "Quattro passi, poi il silenzio.",
  step: "Passo",
  steps: ["Persone e data", "Occasione", "Allergie", "Deposito e extra"],
  people: "Coperti",
  date: "Sera",
  tonight: "Stasera",
  allergies: "Allergie",
  allergiesHint: "Opzionale. La cucina adatta il menu.",
  extras: "Attenzioni",
  flowers: "Fiori sul tavolo",
  wine: "Bicchiere di benvenuto",
  deposit: "Deposito",
  depositNote: "Trattenuto, mai incassato in questa demo.",
  next: "Continua",
  backStep: "Indietro",
  confirm: "Conferma e versa il deposito",
  confirming: "Sigillo in corso",
  walletKicker: "Wallet",
  walletTitle: "La sera è riservata.",
  guests: "Ospiti",
  invite: "Invita",
  invited: "Invito preparato, non inviato.",
  path: "Percorso",
  pathLine: "Ingresso cortile · scala di pietra · sala ovest · tavolo indicato.",
  concierge: "Concierge",
  conciergeHint: "Una nota per la casa.",
  send: "Invia",
  calendar: "Aggiungi al calendario",
  calendarSaved: "Voce di demo salvata in locale.",
  edit: "Modifica",
  qr: "Ingresso",
  reservation: "Prenotazione",
  noticeRomantic: "Cena romantica. Restano i locali con vista e luce bassa.",
  noticeTable: "Vista, privacy e atmosfera cambiano con il tavolo.",
  noticeBooked: "Deposito registrato. Nessun pagamento reale.",
  noticeReset: "La casa è di nuovo a disposizione.",
  noticeTour: "Percorso: romantica, terrazza, finestra, fiori, deposito.",
  conciergeReply: "Ricevuto. La sala prepara il tavolo come richiesto.",
};

const en: VelvetCopy = {
  brand: "Velvet Table",
  made: "Interactive demo made with Helix",
  create: "Create something like this",
  back: "Showcase",
  reset: "Start over",
  tour: "Guided path",
  touring: "In progress",
  word: "Intimate",
  discoverKicker: "Gastronomic concierge",
  discoverTitle: "An evening, chosen like a grand hotel.",
  discoverLead: "A table, a view, a rite. Not a list.",
  search: "Search a room, a kitchen, a shore",
  occasions: {
    romantic: { title: "Romantic dinner", line: "Low light. Two covers. Slow time." },
    business: { title: "Working table", line: "A quiet room, discreet service." },
    family: { title: "Family table", line: "Courtyard, lanterns, more seats." },
  },
  resultsKicker: "Selection",
  resultsTitle: "Rooms for atmosphere, not for a score.",
  list: "List",
  map: "Map",
  filters: "Filters",
  closeFilters: "Close",
  filterAvailable: "Tonight",
  filterPrice: "Upper band",
  filterNear: "Nearby",
  noMatch: "No room in this selection.",
  venue: {
    "terrazza-aurora": {
      name: "Terrazza Aurora",
      city: "Bellagio · lake",
      line: "Sunset on the lake, silk drapes, the hush between courses.",
      dress: "Dark dress. Jackets on the chair.",
    },
    "sala-velluto": {
      name: "Sala Velluto",
      city: "Milan · Brera",
      line: "Brass, burgundy banquettes, warm shadow. A hotel salon that never names itself.",
      dress: "Smart. No bright sneakers.",
    },
    orangerie: {
      name: "Orangerie delle Luci",
      city: "Florence · garden",
      line: "Low candles, citrus in pots, a table that lasts the night.",
      dress: "Elegant, without ceremony.",
    },
  },
  chefName: "Chiara Bellandi",
  chefRole: "Chef de maison",
  chefNote: "Seasonal cooking, slow fire, few signatures. The menu is read quietly.",
  menuTitle: "House menu",
  courses: {
    opening: "Artichoke, anchovy, Sorrento lemon",
    garden: "Tomato-water risotto, basil",
    catch: "Sea bass, fennel, new oil",
    velvet: "Pigeon, cherry, cacao",
    close: "Chocolate, salt, oil",
  },
  chooseTable: "Choose a table",
  gallery: "Gallery",
  menu: "Menu",
  chef: "Chef",
  atmosphere: { day: "Day", sunset: "Sunset", night: "Night" },
  pickKicker: "Room",
  pickTitle: "The table is the view.",
  table: "Table",
  window: "Window",
  alcove: "Alcove",
  garden: "Garden",
  view: "View",
  privacy: "Privacy",
  privacyLevels: ["Open", "Gathered", "Private"],
  surcharge: "View supplement",
  status: { available: "Open", waitlist: "Waitlist", full: "Full" },
  continueBook: "Book this table",
  waitlistJoin: "Join the list",
  fullHint: "This place is closed for tonight.",
  bookKicker: "Booking",
  bookTitle: "Four steps, then quiet.",
  step: "Step",
  steps: ["People and date", "Occasion", "Allergies", "Deposit and extras"],
  people: "Covers",
  date: "Evening",
  tonight: "Tonight",
  allergies: "Allergies",
  allergiesHint: "Optional. The kitchen will adapt the menu.",
  extras: "Attentions",
  flowers: "Flowers on the table",
  wine: "Welcome glass",
  deposit: "Deposit",
  depositNote: "Held, never charged in this demo.",
  next: "Continue",
  backStep: "Back",
  confirm: "Confirm and place the deposit",
  confirming: "Sealing",
  walletKicker: "Wallet",
  walletTitle: "The evening is reserved.",
  guests: "Guests",
  invite: "Invite",
  invited: "Invitation prepared, not sent.",
  path: "Path",
  pathLine: "Courtyard door · stone stair · west room · marked table.",
  concierge: "Concierge",
  conciergeHint: "A note for the house.",
  send: "Send",
  calendar: "Add to calendar",
  calendarSaved: "Demo entry saved locally.",
  edit: "Edit",
  qr: "Entry",
  reservation: "Reservation",
  noticeRomantic: "Romantic dinner. Rooms with a view and low light remain.",
  noticeTable: "View, privacy and atmosphere change with the table.",
  noticeBooked: "Deposit recorded. No real payment.",
  noticeReset: "The house is ready again.",
  noticeTour: "Path: romantic, terrace, window, flowers, deposit.",
  conciergeReply: "Received. The room will prepare the table as asked.",
};

const es: VelvetCopy = {
  ...en,
  made: "Demo interactiva hecha con Helix",
  create: "Crea algo parecido",
  back: "Vitrina",
  reset: "Empezar de nuevo",
  tour: "Recorrido guiado",
  word: "Íntimo",
  discoverTitle: "La noche, elegida como un gran hotel.",
  occasions: {
    romantic: { title: "Cena romántica", line: "Luz baja. Dos cubiertos." },
    business: { title: "Mesa de trabajo", line: "Sala recogida, servicio discreto." },
    family: { title: "Mesa familiar", line: "Patio, faroles, más asientos." },
  },
  chooseTable: "Elegir mesa",
  confirm: "Confirmar y dejar el depósito",
  walletTitle: "La noche está reservada.",
};

const fr: VelvetCopy = {
  ...en,
  made: "Démo interactive réalisée avec Helix",
  create: "Créer quelque chose de similaire",
  back: "Vitrine",
  reset: "Recommencer",
  tour: "Parcours guidé",
  word: "Intime",
  discoverTitle: "La soirée, choisie comme un grand hôtel.",
  occasions: {
    romantic: { title: "Dîner romantique", line: "Lumière basse. Deux couverts." },
    business: { title: "Table de travail", line: "Salle recueillie, service discret." },
    family: { title: "Table de famille", line: "Cour, lanternes, plus de places." },
  },
  chooseTable: "Choisir une table",
  confirm: "Confirmer et verser l’acompte",
  walletTitle: "La soirée est réservée.",
};

const de: VelvetCopy = {
  ...en,
  made: "Interaktive Demo, gemacht mit Helix",
  create: "Etwas Ähnliches erstellen",
  back: "Vitrine",
  reset: "Von vorn",
  tour: "Geführter Weg",
  word: "Innig",
  discoverTitle: "Der Abend, gewählt wie ein Grand Hotel.",
  occasions: {
    romantic: { title: "Romantisches Abendessen", line: "Gedämpftes Licht. Zwei Gedecke." },
    business: { title: "Arbeitstisch", line: "Stiller Raum, diskreter Service." },
    family: { title: "Familientisch", line: "Hof, Laternen, mehr Plätze." },
  },
  chooseTable: "Tisch wählen",
  confirm: "Bestätigen und Anzahlung hinterlegen",
  walletTitle: "Der Abend ist reserviert.",
};

const pt: VelvetCopy = {
  ...en,
  made: "Demo interativa feita com Helix",
  create: "Cria algo semelhante",
  back: "Vitrine",
  reset: "Recomeçar",
  tour: "Percurso guiado",
  word: "Íntimo",
  discoverTitle: "A noite, escolhida como um grande hotel.",
  occasions: {
    romantic: { title: "Jantar romântico", line: "Luz baixa. Dois lugares." },
    business: { title: "Mesa de trabalho", line: "Sala recolhida, serviço discreto." },
    family: { title: "Mesa de família", line: "Pátio, lanternas, mais lugares." },
  },
  chooseTable: "Escolher mesa",
  confirm: "Confirmar e deixar o depósito",
  walletTitle: "A noite está reservada.",
};

const TABLE: Record<Locale, VelvetCopy> = { it, en, es, fr, de, pt };

export function velvetCopy(locale: Locale): VelvetCopy {
  return TABLE[locale];
}
