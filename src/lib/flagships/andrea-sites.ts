import type { Locale } from "@/lib/i18n-core";
import {
  escapeFlagshipMarkup,
  flagshipDocument,
  flagshipScriptData,
} from "@/lib/flagships/shared";

export const ANDREA_SITE_IDS = ["mercedes-epoque", "italvia", "mini4wd-lab"] as const;
export const EXCLUDED_ANDREA_SITE_IDS = [
  "la-bottega-del-capello",
  "accademia-della-bugia",
] as const;

export type AndreaSiteId = (typeof ANDREA_SITE_IDS)[number];

function localize<T>(locale: Locale, values: Record<Locale, T>): T {
  return values[locale];
}

const markup = escapeFlagshipMarkup;

function buildMercedesEpoque(locale: Locale): string {
  const t = localize(locale, {
    it: {
      title: "Mercedes Époque — Noleggio classiche e moderne",
      kicker: "Collezione classica e moderna",
      headline: "Viaggi senza tempo.",
      lede: "La stella, in ogni epoca.",
      explore: "Esplora la collezione",
      search: "Cerca auto, modelli o anni",
      historic: "Storiche",
      modern: "Moderne",
      all: "Tutte",
      selected: "Selezionata",
      rate: "Tariffa giorno",
      pickup: "Ritiro",
      reserve: "Richiedi disponibilità",
      days: "Giorni",
      insurance: "Assicurazione",
      events: "Eventi ufficiali",
      eventList: ["Salon Privé", "Goodwood Revival", "Auto e Moto d’Epoca"],
      demo: "Richiesta demo pronta: nessuna prenotazione reale è stata inviata.",
      empty: "Nessuna leggenda corrisponde alla ricerca.",
      close: "Chiudi",
      next: "Successiva",
      prev: "Precedente",
      calendar: "Calendario",
      status: "Selezione aggiornata",
      cars: ["300 SL Gullwing", "300 SL Roadster", "280 SL Pagoda", "AMG GT", "G 63"],
      years: ["1955", "1957", "1963", "2024", "2023"],
      eras: ["historic", "historic", "historic", "modern", "modern"],
      prices: ["2200", "2100", "1600", "2800", "2400"],
      places: ["Parigi · Plaza Athénée", "Parigi · Hôtel de Crillon", "Como · Villa d’Este", "Monaco · Hôtel de Paris", "Courchevel · Annapurna"],
      notes: [
        "Porte ad ali di gabbiano: la prima supercar, prima della parola.",
        "La stessa stella, a cielo aperto.",
        "Il tetto pagoda e la luce del Lago di Como.",
        "Eccellenza moderna, stessa stella.",
        "Il G, per le strade e per la neve.",
      ],
    },
    en: {
      title: "Mercedes Époque — Classic and modern hire",
      kicker: "Classic and modern collection",
      headline: "Journeys without time.",
      lede: "The star, in every era.",
      explore: "Explore the collection",
      search: "Search cars, models or years",
      historic: "Historic",
      modern: "Modern",
      all: "All",
      selected: "Selected",
      rate: "Daily rate",
      pickup: "Collection",
      reserve: "Request availability",
      days: "Days",
      insurance: "Insurance",
      events: "Official events",
      eventList: ["Salon Privé", "Goodwood Revival", "Auto e Moto d’Epoca"],
      demo: "Demo request ready: no real booking was sent.",
      empty: "No legend matches this search.",
      close: "Close",
      next: "Next",
      prev: "Previous",
      calendar: "Calendar",
      status: "Selection updated",
      cars: ["300 SL Gullwing", "300 SL Roadster", "280 SL Pagoda", "AMG GT", "G 63"],
      years: ["1955", "1957", "1963", "2024", "2023"],
      eras: ["historic", "historic", "historic", "modern", "modern"],
      prices: ["2200", "2100", "1600", "2800", "2400"],
      places: ["Paris · Plaza Athénée", "Paris · Hôtel de Crillon", "Como · Villa d’Este", "Monaco · Hôtel de Paris", "Courchevel · Annapurna"],
      notes: [
        "Gullwing doors: the first supercar, before the word existed.",
        "The same star, open to the sky.",
        "The pagoda roof and Como light.",
        "Modern excellence, same star.",
        "The G, for roads and for snow.",
      ],
    },
    es: {
      title: "Mercedes Époque — Alquiler clásico y moderno",
      kicker: "Colección clásica y moderna",
      headline: "Viajes sin tiempo.",
      lede: "La estrella, en cada época.",
      explore: "Explorar la colección",
      search: "Buscar coches, modelos o años",
      historic: "Históricos",
      modern: "Modernos",
      all: "Todos",
      selected: "Seleccionado",
      rate: "Tarifa diaria",
      pickup: "Recogida",
      reserve: "Pedir disponibilidad",
      days: "Días",
      insurance: "Seguro",
      events: "Eventos oficiales",
      eventList: ["Salon Privé", "Goodwood Revival", "Auto e Moto d’Epoca"],
      demo: "Solicitud demo lista: no se envió ninguna reserva real.",
      empty: "Ninguna leyenda coincide con la búsqueda.",
      close: "Cerrar",
      next: "Siguiente",
      prev: "Anterior",
      calendar: "Calendario",
      status: "Selección actualizada",
      cars: ["300 SL Gullwing", "300 SL Roadster", "280 SL Pagoda", "AMG GT", "G 63"],
      years: ["1955", "1957", "1963", "2024", "2023"],
      eras: ["historic", "historic", "historic", "modern", "modern"],
      prices: ["2200", "2100", "1600", "2800", "2400"],
      places: ["París · Plaza Athénée", "París · Hôtel de Crillon", "Como · Villa d’Este", "Mónaco · Hôtel de Paris", "Courchevel · Annapurna"],
      notes: [
        "Puertas alas de gaviota: el primer superdeportivo, antes de la palabra.",
        "La misma estrella, a cielo abierto.",
        "El techo pagoda y la luz del Lago de Como.",
        "Excelencia moderna, la misma estrella.",
        "El G, para la carretera y para la nieve.",
      ],
    },
    fr: {
      title: "Mercedes Époque — Location classique et moderne",
      kicker: "Collection classique et moderne",
      headline: "Voyages hors du temps.",
      lede: "L’étoile, à chaque époque.",
      explore: "Explorer la collection",
      search: "Chercher voitures, modèles ou années",
      historic: "Historiques",
      modern: "Modernes",
      all: "Toutes",
      selected: "Sélection",
      rate: "Tarif jour",
      pickup: "Prise en charge",
      reserve: "Demander une disponibilité",
      days: "Jours",
      insurance: "Assurance",
      events: "Événements officiels",
      eventList: ["Salon Privé", "Goodwood Revival", "Auto e Moto d’Epoca"],
      demo: "Demande démo prête : aucune réservation réelle envoyée.",
      empty: "Aucune légende ne correspond à la recherche.",
      close: "Fermer",
      next: "Suivante",
      prev: "Précédente",
      calendar: "Calendrier",
      status: "Sélection actualisée",
      cars: ["300 SL Gullwing", "300 SL Roadster", "280 SL Pagoda", "AMG GT", "G 63"],
      years: ["1955", "1957", "1963", "2024", "2023"],
      eras: ["historic", "historic", "historic", "modern", "modern"],
      prices: ["2200", "2100", "1600", "2800", "2400"],
      places: ["Paris · Plaza Athénée", "Paris · Hôtel de Crillon", "Côme · Villa d’Este", "Monaco · Hôtel de Paris", "Courchevel · Annapurna"],
      notes: [
        "Portes papillon : la première supercar, avant le mot.",
        "La même étoile, à ciel ouvert.",
        "Le toit pagode et la lumière du lac de Côme.",
        "Excellence moderne, même étoile.",
        "Le G, pour la route et pour la neige.",
      ],
    },
    de: {
      title: "Mercedes Époque — Klassik- und Moderne-Miete",
      kicker: "Klassische und moderne Sammlung",
      headline: "Reisen ohne Zeit.",
      lede: "Der Stern, in jeder Epoche.",
      explore: "Sammlung erkunden",
      search: "Autos, Modelle oder Jahre suchen",
      historic: "Historisch",
      modern: "Modern",
      all: "Alle",
      selected: "Ausgewählt",
      rate: "Tagespreis",
      pickup: "Abholung",
      reserve: "Verfügbarkeit anfragen",
      days: "Tage",
      insurance: "Versicherung",
      events: "Offizielle Events",
      eventList: ["Salon Privé", "Goodwood Revival", "Auto e Moto d’Epoca"],
      demo: "Demo-Anfrage bereit: Es wurde keine echte Buchung gesendet.",
      empty: "Keine Legende passt zur Suche.",
      close: "Schließen",
      next: "Nächste",
      prev: "Vorherige",
      calendar: "Kalender",
      status: "Auswahl aktualisiert",
      cars: ["300 SL Gullwing", "300 SL Roadster", "280 SL Pagoda", "AMG GT", "G 63"],
      years: ["1955", "1957", "1963", "2024", "2023"],
      eras: ["historic", "historic", "historic", "modern", "modern"],
      prices: ["2200", "2100", "1600", "2800", "2400"],
      places: ["Paris · Plaza Athénée", "Paris · Hôtel de Crillon", "Como · Villa d’Este", "Monaco · Hôtel de Paris", "Courchevel · Annapurna"],
      notes: [
        "Flügeltüren: der erste Supersportwagen, bevor das Wort existierte.",
        "Derselbe Stern, unter offenem Himmel.",
        "Das Pagodendach und das Licht vom Comer See.",
        "Moderne Exzellenz, derselbe Stern.",
        "Die G, für Straße und Schnee.",
      ],
    },
    pt: {
      title: "Mercedes Époque — Aluguer clássico e moderno",
      kicker: "Coleção clássica e moderna",
      headline: "Viagens sem tempo.",
      lede: "A estrela, em cada época.",
      explore: "Explorar a coleção",
      search: "Procurar carros, modelos ou anos",
      historic: "Históricos",
      modern: "Modernos",
      all: "Todos",
      selected: "Selecionado",
      rate: "Tarifa diária",
      pickup: "Recolha",
      reserve: "Pedir disponibilidade",
      days: "Dias",
      insurance: "Seguro",
      events: "Eventos oficiais",
      eventList: ["Salon Privé", "Goodwood Revival", "Auto e Moto d’Epoca"],
      demo: "Pedido demo pronto: nenhuma reserva real foi enviada.",
      empty: "Nenhuma lenda corresponde à pesquisa.",
      close: "Fechar",
      next: "Seguinte",
      prev: "Anterior",
      calendar: "Calendário",
      status: "Seleção atualizada",
      cars: ["300 SL Gullwing", "300 SL Roadster", "280 SL Pagoda", "AMG GT", "G 63"],
      years: ["1955", "1957", "1963", "2024", "2023"],
      eras: ["historic", "historic", "historic", "modern", "modern"],
      prices: ["2200", "2100", "1600", "2800", "2400"],
      places: ["Paris · Plaza Athénée", "Paris · Hôtel de Crillon", "Como · Villa d’Este", "Mónaco · Hôtel de Paris", "Courchevel · Annapurna"],
      notes: [
        "Portas asa de gaivota: o primeiro supercarro, antes da palavra.",
        "A mesma estrela, a céu aberto.",
        "O teto pagode e a luz do Lago de Como.",
        "Excelência moderna, a mesma estrela.",
        "O G, para a estrada e para a neve.",
      ],
    },
  });
  const cars = t.cars.map((name, index) => ({
    name,
    year: t.years[index],
    era: t.eras[index],
    price: t.prices[index],
    place: t.places[index],
    note: t.notes[index],
  }));
  return flagshipDocument({
    id: "mercedes-epoque",
    locale,
    title: t.title,
    themeColor: "#0b0b0b",
    css: `
:root{color-scheme:dark;--bg:#0b0b0b;--surface:#141414;--elev:#1c1c1c;--cream:#f3ebda;--gold:#c9a84c;--muted:#8e8778;--line:#2c281e}
body{background:var(--bg);color:var(--cream);font-family:system-ui,"Segoe UI",sans-serif}
.wrap{min-height:100vh;display:grid;grid-template-rows:auto auto 1fr}
.mast{height:72px;display:grid;grid-template-columns:1fr auto;align-items:center;padding:0 22px;border-bottom:1px solid var(--line);background:var(--surface)}
.brand{display:flex;align-items:center;gap:10px}
.crest{width:28px;height:28px}
.brand small{display:block;color:var(--gold);letter-spacing:.28em;text-transform:uppercase;font-size:8px}
.brand strong{display:block;font:600 22px/1 Georgia,serif;letter-spacing:.04em}
.explore{border:1px solid rgb(201 168 76/.5);background:transparent;color:var(--cream);padding:10px 14px;font-size:10px;letter-spacing:.18em;text-transform:uppercase}
.hero{display:grid;grid-template-columns:1.05fr 1.15fr;min-height:420px;background:var(--elev)}
.hero-copy{padding:42px 28px}
.hero-copy span{color:var(--gold);font:italic 20px Georgia,serif}
.hero h1{font:400 clamp(46px,7vw,86px)/.92 Georgia,serif;margin:14px 0 18px}
.hero p{max-width:34ch;color:var(--muted)}
.stage{position:relative;overflow:hidden;background:#101010}
.stage svg{width:100%;height:100%;min-height:420px}
.search{display:flex;align-items:center;gap:10px;margin:16px 22px 0;background:var(--elev);padding:0 14px;border-radius:14px}
.search input{flex:1;height:48px;border:0;background:transparent;color:inherit}
.eras{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:14px 22px;background:var(--elev);padding:6px;border-radius:14px}
.eras button{min-height:40px;border:0;border-radius:10px;background:transparent;color:var(--muted)}
.eras button[aria-pressed="true"]{background:rgb(201 168 76/.16);color:var(--gold)}
.board{display:grid;grid-template-columns:1.4fr .8fr;gap:18px;padding:8px 22px 28px}
.cars{display:grid;gap:8px}
.car{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;text-align:left;border:1px solid var(--line);background:var(--surface);color:inherit;padding:12px 14px;border-radius:12px}
.car b{display:block;font:500 16px Georgia,serif}
.car small{color:var(--muted)}
.car[aria-pressed="true"]{border-color:var(--gold);background:#1a1710}
.book{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:18px;display:flex;flex-direction:column}
.book h2{margin:0 0 8px;font:400 22px Georgia,serif}
.book p{margin:0 0 14px;color:var(--muted);font-size:13px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.meta span{display:block;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}
.meta strong{display:block;margin-top:4px}
.days{display:flex;align-items:center;justify-content:space-between;margin:8px 0 14px}
.days button{width:36px;height:36px;border-radius:50%;border:1px solid var(--line);background:transparent;color:inherit}
.reserve{border:0;background:var(--gold);color:#1a1408;min-height:48px;font-weight:700}
.events{margin-top:14px}
.events button{width:100%;text-align:left;border:0;border-top:1px solid var(--line);background:transparent;color:var(--cream);padding:10px 0;font-size:12px}
.empty{color:var(--muted);text-align:center;padding:20px}
.toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:var(--gold);color:#1a1408;padding:12px 16px;font-size:12px}
@media(max-width:820px){.hero,.board{grid-template-columns:1fr}.hero-copy{padding:28px 18px}.stage svg{min-height:260px}.mast{padding:0 14px}.search,.eras,.board{margin-inline:14px}.board{padding-inline:14px}}
`,
    body: `
<main class="wrap">
<header class="mast"><div class="brand"><svg class="crest" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22" fill="none" stroke="#c9a84c" stroke-width="2.4"/><path d="M32 12 L32 32 L18 46 M32 32 L46 46" fill="none" stroke="#c9a84c" stroke-width="2.4" stroke-linecap="round"/></svg><span><small>Mercedes</small><strong>Époque</strong></span></div><button type="button" class="explore" data-action="jump-collection">${markup(t.explore)}</button></header>
<section class="hero"><article class="hero-copy"><span>${markup(t.lede)}</span><h1>${markup(t.headline)}</h1><p>${markup(t.kicker)}</p></article>
<div class="stage" id="epoque-stage" data-car="0" aria-hidden="true"><svg viewBox="0 0 720 420" preserveAspectRatio="xMidYMid slice"><rect width="720" height="420" fill="#101010"/><path d="M80 290 H640" stroke="#2c281e" stroke-width="2"/><path id="epoque-body" d="M92 262 C140 250 168 214 230 208 H430 C500 208 540 230 590 248 C630 258 640 270 640 270 L620 286 H100 Z" fill="#cfc6b4"/><path d="M210 208 C230 176 310 168 360 176 C410 168 490 176 510 208" fill="#8a8374"/><circle cx="210" cy="286" r="28" fill="#1a1a1a" stroke="#c9a84c"/><circle cx="530" cy="286" r="28" fill="#1a1a1a" stroke="#c9a84c"/></svg></div></section>
<div class="search"><input id="epoque-q" data-action="search" placeholder="${markup(t.search)}" aria-label="${markup(t.search)}"></div>
<div class="eras" id="epoque-collection"><button type="button" data-action="era" data-era="historic" aria-pressed="true">${markup(t.historic)}</button><button type="button" data-action="era" data-era="modern" aria-pressed="false">${markup(t.modern)}</button><button type="button" data-action="era" data-era="all" aria-pressed="false">${markup(t.all)}</button></div>
<section class="board"><div class="cars" id="epoque-cars">${cars
      .map(
        (car, index) =>
          `<button type="button" class="car" data-action="select-car" data-car="${index}" data-era="${car.era}" data-query="${markup(`${car.name} ${car.year}`)}" aria-pressed="${index === 0}"><small>${markup(car.year)}</small><span><b>${markup(car.name)}</b><small>${markup(car.place)}</small></span><strong>€${car.price}</strong></button>`,
      )
      .join("")}<p class="empty" id="epoque-empty" hidden>${markup(t.empty)}</p></div>
<aside class="book"><h2 id="epoque-name">${markup(cars[0].name)}</h2><p id="epoque-note">${markup(cars[0].note)}</p><div class="meta"><div><span>${markup(t.rate)}</span><strong id="epoque-price">€${cars[0].price}</strong></div><div><span>${markup(t.pickup)}</span><strong id="epoque-place">${markup(cars[0].place)}</strong></div></div><div class="days"><button type="button" data-action="days-down" aria-label="−">−</button><output id="epoque-days">2 ${markup(t.days)}</output><button type="button" data-action="days-up" aria-label="+">+</button></div><button type="button" class="reserve" data-action="reserve">${markup(t.reserve)}</button><div class="events"><button type="button" data-action="prev-car">${markup(t.prev)}</button><button type="button" data-action="next-car">${markup(t.next)}</button><button type="button" data-action="show-events">${markup(t.events)}</button></div></aside></section>
</main>
<output class="toast" id="epoque-toast" hidden></output>`,
    script: `
const model=${flagshipScriptData({ cars, demo: t.demo, status: t.status, events: t.eventList, daysLabel: t.days })};
const state={car:0,era:"historic",days:2,query:""};
const byId=(id)=>document.getElementById(id);
function toast(value){const node=byId("epoque-toast");node.textContent=value;node.hidden=false;window.setTimeout(()=>{node.hidden=true;},2300);}
function paint(){const car=model.cars[state.car];byId("epoque-name").textContent=car.name;byId("epoque-note").textContent=car.note;byId("epoque-price").textContent="€"+car.price;byId("epoque-place").textContent=car.place;byId("epoque-days").textContent=String(state.days)+" "+model.daysLabel;byId("epoque-stage").setAttribute("data-car",String(state.car));const q=state.query;let visible=0;document.querySelectorAll('[data-action="select-car"]').forEach((button,index)=>{const eraOk=state.era==="all"||button.getAttribute("data-era")===state.era;const queryOk=!q||(button.getAttribute("data-query")||"").toLowerCase().includes(q);const show=eraOk&&queryOk;button.hidden=!show;if(show)visible+=1;button.setAttribute("aria-pressed",String(index===state.car));});byId("epoque-empty").hidden=visible>0;document.querySelectorAll('[data-action="era"]').forEach((button)=>button.setAttribute("aria-pressed",String(button.getAttribute("data-era")===state.era)));}
document.querySelectorAll("[data-action]").forEach((control)=>control.addEventListener(control.matches("input")?"input":"click",()=>{const action=control.getAttribute("data-action");if(action==="era"){state.era=control.getAttribute("data-era");paint();}else if(action==="select-car"){state.car=Number(control.getAttribute("data-car"));paint();toast(model.status);}else if(action==="next-car"||action==="prev-car"){state.car=(state.car+(action==="next-car"?1:model.cars.length-1))%model.cars.length;paint();}else if(action==="days-up"||action==="days-down"){state.days=Math.max(1,Math.min(14,state.days+(action==="days-up"?1:-1)));paint();}else if(action==="reserve")toast(model.demo);else if(action==="show-events")toast(model.events.join(" · "));else if(action==="search"){state.query=control.value.trim().toLowerCase();paint();}else if(action==="jump-collection")byId("epoque-collection").scrollIntoView({behavior:"smooth"});}));
paint();`,
  });
}

function buildItalvia(locale: Locale): string {
  const t = localize(locale, {
    it: {
      title: "ITALVIA — La tua casa sicura in Italia",
      kicker: "Concierge Italia — Polonia",
      headline: "Agosto mente.",
      headline2: "Gennaio dice la verità.",
      lede: "Non un catalogo. Un agente, il costo complessivo e la strada dalle chiavi.",
      start: "Inizia il progetto",
      see: "Vedi Scalea a gennaio",
      same: "La stessa casa. Due stagioni.",
      summer: "Agosto",
      winter: "Gennaio",
      cost: "Costo complessivo",
      dossier: "Dossier di sicurezza",
      path: "Percorso guidato",
      homes: "Selezione, non ipermercato",
      agent: "Chiara Moretti",
      agentNote: "Non scrivi a una chat. Scrivi a chi oggi è sul terrazzo in Calabria.",
      write: "Scrivi all’agente",
      demo: "Messaggio demo preparato: nessun contatto reale è stato inviato.",
      status: "Casa e stagione aggiornate",
      names: ["Scalea", "Tropea", "Catania"],
      kinds: ["Casa sul mare", "Centro storico", "Terrazza Etna"],
      prices: ["248000", "312000", "265000"],
      totals: ["286000", "359000", "304000"],
      notes: [
        "La luce di agosto non è il vento di gennaio.",
        "Vicino al centro, lontano dal rumore estivo.",
        "Lava, terrazza e inverno asciutto.",
      ],
      checks: ["Visura", "Catasto", "Conformità", "Notaio"],
    },
    en: {
      title: "ITALVIA — Your safe home in Italy",
      kicker: "Italy — Poland concierge",
      headline: "August lies.",
      headline2: "January tells the truth.",
      lede: "Not a catalogue. An agent, the full cost and the path to the keys.",
      start: "Start the project",
      see: "See Scalea in January",
      same: "The same house. Two seasons.",
      summer: "August",
      winter: "January",
      cost: "All-in cost",
      dossier: "Safety dossier",
      path: "Guided path",
      homes: "A selection, not a supermarket",
      agent: "Chiara Moretti",
      agentNote: "You do not write to a chat. You write to someone on a terrace in Calabria.",
      write: "Write to the agent",
      demo: "Demo message prepared: no real contact was sent.",
      status: "Home and season updated",
      names: ["Scalea", "Tropea", "Catania"],
      kinds: ["House by the sea", "Historic centre", "Etna terrace"],
      prices: ["248000", "312000", "265000"],
      totals: ["286000", "359000", "304000"],
      notes: [
        "August light is not January wind.",
        "Near the centre, far from summer noise.",
        "Lava, a terrace and a dry winter.",
      ],
      checks: ["Title search", "Cadastre", "Compliance", "Notary"],
    },
    es: {
      title: "ITALVIA — Tu casa segura en Italia",
      kicker: "Concierge Italia — Polonia",
      headline: "Agosto miente.",
      headline2: "Enero dice la verdad.",
      lede: "No es un catálogo. Un agente, el coste total y el camino hasta las llaves.",
      start: "Empezar el proyecto",
      see: "Ver Scalea en enero",
      same: "La misma casa. Dos estaciones.",
      summer: "Agosto",
      winter: "Enero",
      cost: "Coste total",
      dossier: "Dossier de seguridad",
      path: "Recorrido guiado",
      homes: "Selección, no hipermercado",
      agent: "Chiara Moretti",
      agentNote: "No escribes a un chat. Escribes a quien hoy está en una terraza en Calabria.",
      write: "Escribir al agente",
      demo: "Mensaje demo preparado: no se envió ningún contacto real.",
      status: "Casa y estación actualizadas",
      names: ["Scalea", "Tropea", "Catania"],
      kinds: ["Casa junto al mar", "Centro histórico", "Terraza Etna"],
      prices: ["248000", "312000", "265000"],
      totals: ["286000", "359000", "304000"],
      notes: [
        "La luz de agosto no es el viento de enero.",
        "Cerca del centro, lejos del ruido de verano.",
        "Lava, terraza e invierno seco.",
      ],
      checks: ["Nota simple", "Catastro", "Conformidad", "Notario"],
    },
    fr: {
      title: "ITALVIA — Votre maison sûre en Italie",
      kicker: "Conciergerie Italie — Pologne",
      headline: "Août ment.",
      headline2: "Janvier dit la vérité.",
      lede: "Pas un catalogue. Un agent, le coût complet et le chemin jusqu’aux clés.",
      start: "Commencer le projet",
      see: "Voir Scalea en janvier",
      same: "La même maison. Deux saisons.",
      summer: "Août",
      winter: "Janvier",
      cost: "Coût global",
      dossier: "Dossier de sécurité",
      path: "Parcours guidé",
      homes: "Une sélection, pas un hypermarché",
      agent: "Chiara Moretti",
      agentNote: "Vous n’écrivez pas à un chat. Vous écrivez à quelqu’un sur une terrasse en Calabre.",
      write: "Écrire à l’agente",
      demo: "Message démo préparé : aucun contact réel envoyé.",
      status: "Maison et saison actualisées",
      names: ["Scalea", "Tropea", "Catania"],
      kinds: ["Maison au bord de mer", "Centre historique", "Terrasse Etna"],
      prices: ["248000", "312000", "265000"],
      totals: ["286000", "359000", "304000"],
      notes: [
        "La lumière d’août n’est pas le vent de janvier.",
        "Près du centre, loin du bruit d’été.",
        "Lave, terrasse et hiver sec.",
      ],
      checks: ["Titre", "Cadastre", "Conformité", "Notaire"],
    },
    de: {
      title: "ITALVIA — Ihr sicheres Haus in Italien",
      kicker: "Concierge Italien — Polen",
      headline: "August lügt.",
      headline2: "Januar sagt die Wahrheit.",
      lede: "Kein Katalog. Eine Agentin, die Gesamtkosten und der Weg zu den Schlüsseln.",
      start: "Projekt starten",
      see: "Scalea im Januar sehen",
      same: "Dasselbe Haus. Zwei Jahreszeiten.",
      summer: "August",
      winter: "Januar",
      cost: "Gesamtkosten",
      dossier: "Sicherheitsdossier",
      path: "Geführter Weg",
      homes: "Auswahl, kein Supermarkt",
      agent: "Chiara Moretti",
      agentNote: "Sie schreiben nicht an einen Chat. Sie schreiben an jemanden auf einer Terrasse in Kalabrien.",
      write: "Der Agentin schreiben",
      demo: "Demo-Nachricht vorbereitet: Es wurde kein echter Kontakt gesendet.",
      status: "Haus und Saison aktualisiert",
      names: ["Scalea", "Tropea", "Catania"],
      kinds: ["Haus am Meer", "Historisches Zentrum", "Etna-Terrasse"],
      prices: ["248000", "312000", "265000"],
      totals: ["286000", "359000", "304000"],
      notes: [
        "Augustlicht ist nicht Januarwind.",
        "Nah am Zentrum, fern vom Sommerlärm.",
        "Lava, Terrasse und trockener Winter.",
      ],
      checks: ["Grundbuch", "Kataster", "Konformität", "Notar"],
    },
    pt: {
      title: "ITALVIA — A tua casa segura em Itália",
      kicker: "Concierge Itália — Polónia",
      headline: "Agosto mente.",
      headline2: "Janeiro diz a verdade.",
      lede: "Não é um catálogo. Uma agente, o custo total e o caminho até às chaves.",
      start: "Começar o projeto",
      see: "Ver Scalea em janeiro",
      same: "A mesma casa. Duas estações.",
      summer: "Agosto",
      winter: "Janeiro",
      cost: "Custo total",
      dossier: "Dossier de segurança",
      path: "Percurso guiado",
      homes: "Seleção, não hipermercado",
      agent: "Chiara Moretti",
      agentNote: "Não escreves a um chat. Escreves a quem hoje está num terraço na Calábria.",
      write: "Escrever à agente",
      demo: "Mensagem demo preparada: nenhum contacto real foi enviado.",
      status: "Casa e estação atualizadas",
      names: ["Scalea", "Tropea", "Catania"],
      kinds: ["Casa junto ao mar", "Centro histórico", "Terraço Etna"],
      prices: ["248000", "312000", "265000"],
      totals: ["286000", "359000", "304000"],
      notes: [
        "A luz de agosto não é o vento de janeiro.",
        "Perto do centro, longe do ruído de verão.",
        "Lava, terraço e inverno seco.",
      ],
      checks: ["Registo", "Cadastro", "Conformidade", "Notário"],
    },
  });
  const homes = t.names.map((name, index) => ({
    name,
    kind: t.kinds[index],
    price: t.prices[index],
    total: t.totals[index],
    note: t.notes[index],
  }));
  return flagshipDocument({
    id: "italvia",
    locale,
    title: t.title,
    themeColor: "#1c2c4a",
    css: `
:root{color-scheme:light;--ivory:#f4efe6;--paper:#fbf8f1;--navy:#1c2c4a;--terracotta:#c45c3e;--sand:#d9c4a8;--muted:#6b6458;--line:#e2d9cc;--sage:#5f7f66}
body{background:var(--ivory);color:var(--navy);font-family:Georgia,"Times New Roman",serif}
.hero{min-height:78vh;background:linear-gradient(180deg,#2a3d63,#1c2c4a 55%,#152238);color:#fbf8f1;padding:28px 24px 40px;display:flex;flex-direction:column}
.kicker{letter-spacing:.22em;text-transform:uppercase;font:11px system-ui,sans-serif;color:var(--sand)}
.hero h1{font:600 clamp(46px,8vw,84px)/1.02 Georgia,serif;margin:18px 0 10px;max-width:16ch}
.hero p{max-width:46ch;color:#fbf8f1cc;font:16px/1.5 system-ui,sans-serif}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
.actions button{min-height:46px;padding:0 16px;border-radius:10px;font:600 14px system-ui,sans-serif}
.primary{border:0;background:var(--terracotta);color:#fff}
.ghost{border:1px solid #fbf8f166;background:transparent;color:#fbf8f1}
.section{padding:36px 24px}
.section h2{font:600 34px/1.1 Georgia,serif;margin:8px 0 16px}
.twin{position:relative;min-height:320px;border-radius:18px;overflow:hidden;background:var(--navy)}
.twin-scene{position:absolute;inset:0;transition:opacity .35s}
.twin[data-season="winter"] .summer{opacity:.15}
.twin[data-season="summer"] .winter{opacity:.15}
.summer{background:linear-gradient(#f2c48a 0 42%,#5f7f66 42% 70%,#1c2c4a 70%)}
.winter{background:linear-gradient(#c9d6e4 0 46%,#8aa0b0 46% 72%,#1c2c4a 72%)}
.house{position:absolute;left:18%;bottom:18%;width:38%;height:42%;background:#fbf8f1;clip-path:polygon(50% 0,100% 28%,100% 100%,0 100%,0 28%)}
.season-bar{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
.season-bar button{min-height:44px;border:1px solid var(--line);background:var(--paper);color:var(--navy)}
.season-bar button[aria-pressed="true"]{background:var(--navy);color:#fff}
.homes{display:grid;gap:10px}
.home{display:grid;grid-template-columns:1fr auto;gap:8px;text-align:left;border:1px solid var(--line);background:var(--paper);color:inherit;padding:14px;border-radius:14px}
.home[aria-pressed="true"]{border-color:var(--terracotta);box-shadow:0 0 0 1px var(--terracotta)}
.home small{color:var(--muted)}
.cost{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:18px;margin-top:16px}
.cost dl{display:grid;grid-template-columns:1fr auto;gap:8px 16px;margin:12px 0 0;font-family:system-ui,sans-serif}
.checks{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.checks button{border:1px solid var(--line);background:#fff;color:var(--navy);padding:8px 10px;border-radius:999px;font:12px system-ui,sans-serif}
.checks button[aria-pressed="true"]{background:var(--sage);color:#fff;border-color:var(--sage)}
.agent{display:grid;grid-template-columns:1fr 160px;gap:18px;align-items:end}
.portrait{height:200px;border-radius:16px;background:linear-gradient(160deg,#c45c3e,#d9c4a8 55%,#1c2c4a)}
.write{margin-top:16px;border:0;background:var(--navy);color:#fff;min-height:48px;padding:0 16px}
.toast{position:fixed;right:16px;bottom:16px;background:var(--navy);color:#fff;padding:12px 14px;max-width:320px}
@media(max-width:700px){.hero,.section{padding-inline:16px}.agent{grid-template-columns:1fr}.hero h1{font-size:48px}}
`,
    body: `
<main>
<section class="hero"><p class="kicker">${markup(t.kicker)}</p><h1>${markup(t.headline)}<br>${markup(t.headline2)}</h1><p>${markup(t.lede)}</p><div class="actions"><button type="button" class="primary" data-action="start">${markup(t.start)}</button><button type="button" class="ghost" data-action="see-january">${markup(t.see)}</button></div></section>
<section class="section" id="italvia-homes"><p class="kicker">${markup(t.same)}</p><h2 id="italvia-title">${markup(homes[0].name)}</h2>
<div class="twin" id="italvia-twin" data-season="summer"><div class="twin-scene summer"><span class="house"></span></div><div class="twin-scene winter"><span class="house"></span></div></div>
<div class="season-bar"><button type="button" data-action="season" data-season="summer" aria-pressed="true">${markup(t.summer)}</button><button type="button" data-action="season" data-season="winter" aria-pressed="false">${markup(t.winter)}</button></div>
<div class="homes">${homes
      .map(
        (home, index) =>
          `<button type="button" class="home" data-action="select-home" data-home="${index}" aria-pressed="${index === 0}"><span><b>${markup(home.name)}</b><small> ${markup(home.kind)}</small></span><strong>€${home.price}</strong></button>`,
      )
      .join("")}</div>
<aside class="cost" id="italvia-cost"><p class="kicker">${markup(t.cost)}</p><p id="italvia-note">${markup(homes[0].note)}</p><dl><div><dt>${markup(t.homes)}</dt><dd id="italvia-list">€${homes[0].price}</dd></div><div><dt>${markup(t.cost)}</dt><dd id="italvia-total">€${homes[0].total}</dd></div></dl><div class="checks">${t.checks
      .map(
        (check, index) =>
          `<button type="button" data-action="check" data-check="${index}" aria-pressed="${index === 0}">${markup(check)}</button>`,
      )
      .join("")}</div></aside>
</section>
<section class="section"><div class="agent"><div><p class="kicker">${markup(t.dossier)}</p><h2>${markup(t.agent)}</h2><p>${markup(t.agentNote)}</p></div><div class="portrait" aria-hidden="true"></div></div><button type="button" class="write" data-action="write">${markup(t.write)}</button></section>
</main>
<output class="toast" id="italvia-toast" hidden></output>`,
    script: `
const model=${flagshipScriptData({ homes, demo: t.demo, status: t.status })};
const state={home:0,season:"summer",checks:[true,false,false,false]};
const byId=(id)=>document.getElementById(id);
function toast(value){const node=byId("italvia-toast");node.textContent=value;node.hidden=false;window.setTimeout(()=>{node.hidden=true;},2300);}
function paint(){const home=model.homes[state.home];byId("italvia-title").textContent=home.name;byId("italvia-note").textContent=home.note;byId("italvia-list").textContent="€"+home.price;byId("italvia-total").textContent="€"+home.total;byId("italvia-twin").setAttribute("data-season",state.season);document.querySelectorAll('[data-action="select-home"]').forEach((button,index)=>button.setAttribute("aria-pressed",String(index===state.home)));document.querySelectorAll('[data-action="season"]').forEach((button)=>button.setAttribute("aria-pressed",String(button.getAttribute("data-season")===state.season)));document.querySelectorAll('[data-action="check"]').forEach((button,index)=>button.setAttribute("aria-pressed",String(state.checks[index])));}
document.querySelectorAll("[data-action]").forEach((control)=>control.addEventListener("click",()=>{const action=control.getAttribute("data-action");if(action==="select-home"){state.home=Number(control.getAttribute("data-home"));paint();toast(model.status);}else if(action==="season"){state.season=control.getAttribute("data-season");paint();}else if(action==="see-january"){state.season="winter";state.home=0;paint();byId("italvia-homes").scrollIntoView({behavior:"smooth"});}else if(action==="start")byId("italvia-cost").scrollIntoView({behavior:"smooth"});else if(action==="check"){const index=Number(control.getAttribute("data-check"));state.checks[index]=!state.checks[index];paint();}else if(action==="write")toast(model.demo);}));
paint();`,
  });
}

function buildMini4wdLab(locale: Locale): string {
  const t = localize(locale, {
    it: {
      title: "Mini4WD Lab — Costruisci, taglia, prova",
      kicker: "Guida Mini 4WD in italiano",
      lead: "Parti dal kit. Stay, freno e mass damper. Poi la lanci sul salto.",
      start: "Inizia la guida",
      modify: "Modifica",
      carbon: "Carbonio",
      track: "Pista",
      launch: "Lancia",
      reset: "Reset",
      save: "Salva macchina",
      goals: ["Prima macchina", "Salto", "Curve", "Velocità"],
      parts: ["Stay", "Freno", "Mass damper", "Roller"],
      steps: ["Segno", "Disco", "Lima", "Montaggio"],
      demo: "Setup demo salvato in memoria. Nessun ordine inviato.",
      land: "Atterraggio pulito. Tieni il freno e alza di poco i roller.",
      fly: "Esce sul salto. Abbassa i roller anteriori.",
      status: "Assetto aggiornato",
    },
    en: {
      title: "Mini4WD Lab — Build, cut, race",
      kicker: "Mini 4WD guide",
      lead: "Start from the kit. Stay, brake and mass damper. Then launch it on the jump.",
      start: "Start the guide",
      modify: "Modify",
      carbon: "Carbon",
      track: "Track",
      launch: "Launch",
      reset: "Reset",
      save: "Save car",
      goals: ["First car", "Jump", "Corners", "Speed"],
      parts: ["Stay", "Brake", "Mass damper", "Rollers"],
      steps: ["Mark", "Disc", "File", "Fit"],
      demo: "Demo setup saved in memory. No order was sent.",
      land: "Clean landing. Keep the brake and raise the rollers a little.",
      fly: "It flies off the jump. Lower the front rollers.",
      status: "Setup updated",
    },
    es: {
      title: "Mini4WD Lab — Construye, corta, prueba",
      kicker: "Guía Mini 4WD",
      lead: "Empieza por el kit. Stay, freno y mass damper. Luego lánzalo en el salto.",
      start: "Empezar la guía",
      modify: "Modificar",
      carbon: "Carbono",
      track: "Pista",
      launch: "Lanzar",
      reset: "Reiniciar",
      save: "Guardar coche",
      goals: ["Primer coche", "Salto", "Curvas", "Velocidad"],
      parts: ["Stay", "Freno", "Mass damper", "Rollers"],
      steps: ["Marca", "Disco", "Lima", "Montaje"],
      demo: "Setup demo guardado en memoria. No se envió ningún pedido.",
      land: "Aterrizaje limpio. Mantén el freno y sube un poco los rollers.",
      fly: "Sale en el salto. Baja los rollers delanteros.",
      status: "Setup actualizado",
    },
    fr: {
      title: "Mini4WD Lab — Construire, couper, tester",
      kicker: "Guide Mini 4WD",
      lead: "Pars du kit. Stay, frein et mass damper. Puis lance-la sur le saut.",
      start: "Commencer le guide",
      modify: "Modifier",
      carbon: "Carbone",
      track: "Piste",
      launch: "Lancer",
      reset: "Réinitialiser",
      save: "Enregistrer la voiture",
      goals: ["Première voiture", "Saut", "Virages", "Vitesse"],
      parts: ["Stay", "Frein", "Mass damper", "Rollers"],
      steps: ["Tracé", "Disque", "Lime", "Montage"],
      demo: "Setup démo enregistré en mémoire. Aucune commande envoyée.",
      land: "Atterrissage propre. Garde le frein et monte un peu les rollers.",
      fly: "Elle sort au saut. Baisse les rollers avant.",
      status: "Réglage actualisé",
    },
    de: {
      title: "Mini4WD Lab — Bauen, schneiden, fahren",
      kicker: "Mini-4WD-Anleitung",
      lead: "Starte mit dem Kit. Stay, Bremse und Mass Damper. Dann auf den Sprung.",
      start: "Anleitung starten",
      modify: "Umbauen",
      carbon: "Carbon",
      track: "Bahn",
      launch: "Starten",
      reset: "Zurücksetzen",
      save: "Auto speichern",
      goals: ["Erstes Auto", "Sprung", "Kurven", "Tempo"],
      parts: ["Stay", "Bremse", "Mass Damper", "Roller"],
      steps: ["Anzeichnen", "Scheibe", "Feile", "Montage"],
      demo: "Demo-Setup im Speicher. Keine Bestellung gesendet.",
      land: "Saubere Landung. Bremse behalten und Roller leicht anheben.",
      fly: "Fliegt über den Sprung. Vordere Roller senken.",
      status: "Setup aktualisiert",
    },
    pt: {
      title: "Mini4WD Lab — Constrói, corta, testa",
      kicker: "Guia Mini 4WD",
      lead: "Começa pelo kit. Stay, travão e mass damper. Depois lança no salto.",
      start: "Começar o guia",
      modify: "Modificar",
      carbon: "Carbono",
      track: "Pista",
      launch: "Lançar",
      reset: "Repor",
      save: "Guardar carro",
      goals: ["Primeiro carro", "Salto", "Curvas", "Velocidade"],
      parts: ["Stay", "Travão", "Mass damper", "Rollers"],
      steps: ["Marca", "Disco", "Lima", "Montagem"],
      demo: "Setup demo guardado em memória. Nenhuma encomenda enviada.",
      land: "Aterragem limpa. Mantém o travão e sobe um pouco os rollers.",
      fly: "Sai no salto. Desce os rollers da frente.",
      status: "Setup atualizado",
    },
  });
  return flagshipDocument({
    id: "mini4wd-lab",
    locale,
    title: t.title,
    themeColor: "#0a0a0b",
    css: `
:root{color-scheme:dark;--bg:#0a0a0b;--surface:#121214;--fg:#eceae6;--muted:#8c8884;--accent:#c8ccd4;--ok:#6a9a78;--curb:#b55244;--line:#2a2a2e}
body{background:var(--bg);color:var(--fg);font-family:"Segoe UI",system-ui,sans-serif}
.shell{min-height:100vh;padding:20px}
.hero{position:relative;overflow:hidden;border-radius:18px;background:var(--surface);padding:32px 24px;min-height:280px}
.weave{position:absolute;inset:0;background:repeating-linear-gradient(45deg,#121214 0 8px,#1a1a1e 8px 16px);opacity:.7}
.hero-copy{position:relative;max-width:460px}
.kicker{color:var(--accent);letter-spacing:.2em;text-transform:uppercase;font-size:11px}
.hero h1{font:700 52px/1 "Arial Narrow",Arial,sans-serif;letter-spacing:.04em;margin:10px 0}
.hero p{color:var(--muted);max-width:40ch}
.start{margin-top:18px;border:0;background:var(--accent);color:#0a0a0b;min-height:44px;padding:0 16px;font-weight:600}
.tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0}
.tabs button{min-height:44px;border:1px solid var(--line);background:var(--surface);color:var(--muted)}
.tabs button[aria-pressed="true"]{color:#0a0a0b;background:var(--accent);border-color:var(--accent)}
.panel{display:none;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px}
.panel.on{display:block}
.goals,.parts,.steps{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.goals button,.parts button,.steps button{min-height:48px;border:1px solid var(--line);background:#17171b;color:inherit;text-align:left;padding:10px 12px}
.goals button[aria-pressed="true"],.parts button[aria-pressed="true"],.steps button[aria-pressed="true"]{border-color:var(--accent);background:#222228}
.track{position:relative;height:180px;margin:12px 0;border-radius:12px;overflow:hidden;background:#141418}
.lane{position:absolute;inset:28px 12px;border:8px solid var(--curb);border-radius:18px}
.car{position:absolute;width:34px;height:18px;border-radius:5px;background:var(--accent);left:18%;top:46%;transition:left .7s,top .7s}
.track[data-run="land"] .car{left:72%;top:48%}
.track[data-run="fly"] .car{left:78%;top:18%}
.row{display:flex;gap:8px;margin-top:12px}
.row button{flex:1;min-height:44px;border:0;background:var(--accent);color:#0a0a0b;font-weight:700}
.row .ghost{background:transparent;border:1px solid var(--line);color:var(--fg)}
.toast{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);background:var(--ok);color:#08120c;padding:12px 14px}
@media(max-width:620px){.hero h1{font-size:40px}.goals,.parts,.steps{grid-template-columns:1fr}.shell{padding:12px}}
`,
    body: `
<main class="shell">
<section class="hero"><div class="weave" aria-hidden="true"></div><div class="hero-copy"><p class="kicker">${markup(t.kicker)}</p><h1>MINI4WD LAB</h1><p>${markup(t.lead)}</p><button type="button" class="start" data-action="start">${markup(t.start)}</button></div></section>
<nav class="tabs" id="lab-tabs"><button type="button" data-action="tab" data-tab="modify" aria-pressed="true">${markup(t.modify)}</button><button type="button" data-action="tab" data-tab="carbon" aria-pressed="false">${markup(t.carbon)}</button><button type="button" data-action="tab" data-tab="track" aria-pressed="false">${markup(t.track)}</button></nav>
<section class="panel on" id="lab-modify"><div class="goals">${t.goals
      .map(
        (goal, index) =>
          `<button type="button" data-action="goal" data-goal="${index}" aria-pressed="${index === 0}">${markup(goal)}</button>`,
      )
      .join("")}</div><div class="parts" style="margin-top:10px">${t.parts
      .map(
        (part, index) =>
          `<button type="button" data-action="part" data-part="${index}" aria-pressed="${index < 2}">${markup(part)}</button>`,
      )
      .join("")}</div></section>
<section class="panel" id="lab-carbon"><div class="steps">${t.steps
      .map(
        (step, index) =>
          `<button type="button" data-action="step" data-step="${index}" aria-pressed="${index === 0}">${markup(step)}</button>`,
      )
      .join("")}</div><div class="row"><button type="button" data-action="next-step">${markup(t.steps[1])}</button><button type="button" class="ghost" data-action="prev-step">${markup(t.steps[0])}</button></div></section>
<section class="panel" id="lab-track"><div class="track" id="lab-track-view" data-run="idle"><div class="lane"></div><div class="car" aria-hidden="true"></div></div><div class="row"><button type="button" data-action="launch">${markup(t.launch)}</button><button type="button" class="ghost" data-action="reset">${markup(t.reset)}</button><button type="button" class="ghost" data-action="save">${markup(t.save)}</button></div></section>
</main>
<output class="toast" id="lab-toast" hidden></output>`,
    script: `
const model=${flagshipScriptData({ land: t.land, fly: t.fly, demo: t.demo, status: t.status, stepCount: t.steps.length })};
const state={tab:"modify",goal:0,parts:[true,true,false,false],step:0,run:"idle"};
const byId=(id)=>document.getElementById(id);
function toast(value){const node=byId("lab-toast");node.textContent=value;node.hidden=false;window.setTimeout(()=>{node.hidden=true;},2300);}
function showTab(tab){state.tab=tab;["modify","carbon","track"].forEach((name)=>{byId("lab-"+name).classList.toggle("on",name===tab);});document.querySelectorAll('[data-action="tab"]').forEach((button)=>button.setAttribute("aria-pressed",String(button.getAttribute("data-tab")===tab)));}
function paint(){document.querySelectorAll('[data-action="goal"]').forEach((button,index)=>button.setAttribute("aria-pressed",String(index===state.goal)));document.querySelectorAll('[data-action="part"]').forEach((button,index)=>button.setAttribute("aria-pressed",String(state.parts[index])));document.querySelectorAll('[data-action="step"]').forEach((button,index)=>button.setAttribute("aria-pressed",String(index===state.step)));byId("lab-track-view").setAttribute("data-run",state.run);}
document.querySelectorAll("[data-action]").forEach((control)=>control.addEventListener("click",()=>{const action=control.getAttribute("data-action");if(action==="tab")showTab(control.getAttribute("data-tab"));else if(action==="start"){showTab("modify");}else if(action==="goal"){state.goal=Number(control.getAttribute("data-goal"));paint();toast(model.status);}else if(action==="part"){const index=Number(control.getAttribute("data-part"));state.parts[index]=!state.parts[index];paint();toast(model.status);}else if(action==="step"){state.step=Number(control.getAttribute("data-step"));paint();}else if(action==="next-step"){state.step=(state.step+1)%model.stepCount;showTab("carbon");paint();}else if(action==="prev-step"){state.step=(state.step+model.stepCount-1)%model.stepCount;showTab("carbon");paint();}else if(action==="launch"){state.run=state.parts[1]?"land":"fly";showTab("track");paint();toast(state.run==="land"?model.land:model.fly);}else if(action==="reset"){state.run="idle";state.parts=[true,true,false,false];paint();}else if(action==="save")toast(model.demo);}));
paint();`,
  });
}

export function buildAndreaSiteHtml(id: AndreaSiteId, locale: Locale): string {
  switch (id) {
    case "mercedes-epoque":
      return buildMercedesEpoque(locale);
    case "italvia":
      return buildItalvia(locale);
    case "mini4wd-lab":
      return buildMini4wdLab(locale);
  }
}
