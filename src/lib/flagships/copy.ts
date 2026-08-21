import type { Locale } from "@/lib/i18n-core";

export const FLAGSHIP_IDS = [
  "orbit-command",
  "neura",
  "synapse",
  "vanta",
  "arc-city",
  "morph",
] as const;

export type FlagshipId = (typeof FLAGSHIP_IDS)[number];

type FlagshipCopy = {
  brand: string;
  title: string;
  kind: string;
  prompt: string;
  capability: string;
  proof: string;
  ui: Record<string, string>;
};

type FlagshipCopyTable = Record<FlagshipId, FlagshipCopy>;

export type ShowcaseLabels = {
  prompt: string;
  capability: string;
  proof: string;
  archiveTitle: string;
  archiveLead: string;
  archiveOpen: string;
};

const en: FlagshipCopyTable = {
  "orbit-command": {
    brand: "ORBIT COMMAND",
    title: "Orbital mission control",
    kind: "Space systems twin",
    prompt: "Build a mission-control digital twin for a small satellite fleet, with orbit planning and live telemetry.",
    capability: "Spatial telemetry, fleet selection, layer controls, time scrub and maneuver planning.",
    proof: "Live app thumbnail · 12 local controls · offline canvas telemetry",
    ui: {
      eyebrow: "MISSION CONTROL / LOW EARTH ORBIT",
      live: "LIVE LINK",
      missionTime: "MISSION TIME",
      fleet: "FLEET",
      telemetry: "TELEMETRY",
      timeline: "ORBIT TIMELINE",
      pause: "Pause",
      resume: "Resume",
      ground: "Ground track",
      debris: "Debris field",
      paths: "Orbit paths",
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      plan: "Plan burn",
      commit: "Commit maneuver",
      cancel: "Cancel plan",
      nominal: "Nominal",
      contact: "Next contact",
      fuel: "Fuel",
      inclination: "Inclination",
      altitude: "Altitude",
      selected: "Selected vehicle",
      noticePlan: "Maneuver corridor plotted.",
      noticeCommitted: "Simulation updated; no command was sent.",
      noticeCancelled: "Maneuver plan cleared.",
      sat1: "Astra-7",
      sat2: "Vega-2",
      sat3: "Kite-4",
      station: "Kiruna ground station",
    },
  },
  neura: {
    brand: "NEURA",
    title: "Neural systems observatory",
    kind: "Biotech visualization demo",
    prompt: "Create a non-clinical neural digital-twin demonstrator for exploring regions, signals and simulated cohorts.",
    capability: "Scientific visualization, region comparison, signal timeline, annotations and snapshots.",
    proof: "Live app thumbnail · 10 local controls · explicitly non-clinical simulation",
    ui: {
      eyebrow: "NEURAL SYSTEMS OBSERVATORY",
      demoNotice: "RESEARCH DEMO · NOT FOR CLINICAL USE",
      study: "Study N-204",
      overview: "Overview",
      signals: "Signals",
      cohort: "Cohort",
      compare: "Compare",
      region: "REGION",
      cortex: "Cortex",
      stem: "Brainstem",
      network: "Network",
      baseline: "Baseline",
      stimulus: "Stimulus",
      recovery: "Recovery",
      play: "Run simulation",
      pause: "Pause",
      snapshot: "Capture snapshot",
      annotate: "Add annotation",
      reset: "Reset study",
      biomarkers: "SIMULATED MARKERS",
      coherence: "Coherence",
      response: "Response",
      symmetry: "Symmetry",
      activity: "REGIONAL ACTIVITY",
      stable: "Stable simulated pattern",
      noteSnapshot: "Snapshot added to the study log.",
      noteAnnotation: "Annotation anchored at the current sample.",
      noteReset: "Study view restored to baseline.",
      timeline: "SAMPLE TIMELINE",
      sample: "Sample",
    },
  },
  synapse: {
    brand: "SYNAPSE",
    title: "Collaborative intelligence workspace",
    kind: "AI collaboration workspace",
    prompt: "Design a premium collaborative canvas where a team can connect research, decisions, tasks and agent activity.",
    capability: "Knowledge canvas, typed nodes, search, filters, activity stream and relationship editing.",
    proof: "Live app thumbnail · 11 local controls · editable in-memory workspace",
    ui: {
      eyebrow: "COLLABORATIVE INTELLIGENCE",
      workspace: "Helios launch workspace",
      canvas: "Canvas",
      documents: "Documents",
      activity: "Activity",
      search: "Search the workspace",
      addNode: "New node",
      focus: "Focus",
      align: "Align",
      connect: "Connect",
      filterAll: "All",
      filterDecision: "Decisions",
      filterTask: "Tasks",
      brief: "Launch brief",
      research: "Audience research",
      direction: "Product direction",
      prototype: "Prototype review",
      decision: "Decision",
      task: "Task",
      note: "Note",
      owner: "Owner",
      due: "Due",
      newNode: "A new task was added to the canvas.",
      connected: "Selected ideas are now connected.",
      aligned: "Visible nodes aligned to the working grid.",
      focused: "Focus mode isolates the selected thread.",
      searchResult: "matching workspace items",
      activityOn: "Activity panel opened.",
      activityOff: "Activity panel closed.",
    },
  },
  vanta: {
    brand: "VANTA",
    title: "Market risk terminal",
    kind: "Simulated trading workstation",
    prompt: "Build a dense professional market terminal with charting, watchlists, risk controls and simulated orders.",
    capability: "Streaming-style chart, watchlist, depth, positions, risk limits and paper-order workflow.",
    proof: "Live app thumbnail · 13 local controls · all trading explicitly simulated",
    ui: {
      eyebrow: "MARKET RISK TERMINAL",
      simulated: "SIMULATED DATA · NO EXECUTION",
      markets: "MARKETS",
      blotter: "BLOTTER",
      risk: "RISK",
      watchlist: "WATCHLIST",
      symbol: "SYMBOL",
      last: "LAST",
      change: "CHANGE",
      range1d: "1D",
      range1w: "1W",
      range1m: "1M",
      candles: "Candles",
      depth: "Depth",
      positions: "POSITIONS",
      orders: "ORDERS",
      buy: "BUY",
      sell: "SELL",
      quantity: "Quantity",
      limit: "Limit price",
      simulate: "Simulate order",
      cancel: "Cancel pending",
      exposure: "NET EXPOSURE",
      var: "SIMULATED VaR",
      pnl: "PAPER P&L",
      orderReady: "Order ticket ready for paper simulation.",
      orderSent: "Paper order added to the blotter; nothing was transmitted.",
      orderCancelled: "Pending paper order cancelled.",
      chart: "PRICE / VOLUME",
      book: "ORDER BOOK",
      desk: "EUROPE / GROWTH DESK",
    },
  },
  "arc-city": {
    brand: "ARC CITY",
    title: "Urban systems twin",
    kind: "Smart-city digital twin",
    prompt: "Create a map-first city twin for exploring traffic, energy and environmental layers across districts and time.",
    capability: "Layered city map, district inspection, time simulation, alerts and infrastructure metrics.",
    proof: "Live app thumbnail · 12 local controls · offline SVG city model",
    ui: {
      eyebrow: "URBAN SYSTEMS TWIN",
      twin: "ARC / CITY 04",
      layers: "LAYERS",
      traffic: "Traffic",
      energy: "Energy",
      air: "Air quality",
      water: "Water",
      transit: "Transit",
      districts: "DISTRICTS",
      harbor: "Harbor",
      central: "Central",
      north: "North grid",
      timeline: "CITY TIMELINE",
      live: "Live",
      simulate: "Simulate evening",
      pause: "Pause",
      resume: "Resume",
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      alerts: "ALERTS",
      clear: "Clear resolved",
      camera: "Recenter map",
      inspect: "Inspect district",
      demand: "Energy demand",
      flow: "Traffic flow",
      quality: "Air index",
      occupancy: "Transit load",
      selected: "Selected district",
      eventTraffic: "Traffic layer highlighted.",
      eventEnergy: "Evening demand scenario loaded.",
      eventAir: "Air-quality sensors selected.",
      eventCleared: "Resolved alerts removed.",
      morning: "Morning",
      evening: "Evening",
      now: "Now",
    },
  },
  morph: {
    brand: "MORPH",
    title: "Material configurator",
    kind: "Cinematic 3D-style configurator",
    prompt: "Design a cinematic automotive configurator with material, cabin, wheel, lighting and camera controls.",
    capability: "Product-stage visualization, materials, specifications, camera rotation, lighting and saved configuration.",
    proof: "Live app thumbnail · 14 local controls · CSS/SVG product stage without stock imagery",
    ui: {
      eyebrow: "PHYSICAL PRODUCT CONFIGURATOR",
      configurator: "M-01 / SERIES",
      model: "MODEL",
      material: "MATERIAL",
      cabin: "CABIN",
      stance: "STANCE",
      studio: "Studio",
      road: "Road",
      detail: "Detail",
      lights: "Lights",
      rotate: "Rotate view",
      save: "Save specification",
      saved: "Specification saved locally for this demo.",
      reset: "Reset",
      graphite: "Graphite",
      pearl: "Pearl",
      copper: "Copper",
      cobalt: "Cobalt",
      wheelAero: "Aero 21",
      wheelTrack: "Track 22",
      interiorStone: "Stone",
      interiorInk: "Ink",
      interiorSaddle: "Saddle",
      power: "Power",
      range: "Range",
      sprint: "0–100 km/h",
      viewFront: "Front",
      viewSide: "Profile",
      viewRear: "Rear",
      hotspot: "Open material detail",
      selection: "CURRENT SPECIFICATION",
      spec: "M-01 Dual Motor",
      body: "Body",
      wheel: "Wheel",
      interior: "Interior",
      noticeReset: "Factory configuration restored.",
    },
  },
};

function translated(
  base: FlagshipCopyTable,
  values: Partial<Record<FlagshipId, Partial<FlagshipCopy> & { ui?: Record<string, string> }>>,
): FlagshipCopyTable {
  return Object.fromEntries(
    FLAGSHIP_IDS.map((id) => {
      const next = values[id];
      return [
        id,
        {
          ...base[id],
          ...next,
          ui: { ...base[id].ui, ...(next?.ui ?? {}) },
        },
      ];
    }),
  ) as FlagshipCopyTable;
}

const it = translated(en, {
  "orbit-command": {
    title: "Controllo missione orbitale",
    kind: "Gemello digitale spaziale",
    prompt: "Crea un gemello digitale per il controllo missione di una piccola flotta satellitare, con pianificazione orbitale e telemetria live.",
    capability: "Telemetria spaziale, selezione flotta, livelli, timeline e pianificazione manovre.",
    proof: "Anteprima app live · 12 controlli locali · telemetria canvas offline",
    ui: { eyebrow: "CONTROLLO MISSIONE / ORBITA BASSA", live: "COLLEGAMENTO LIVE", missionTime: "TEMPO MISSIONE", fleet: "FLOTTA", telemetry: "TELEMETRIA", timeline: "TIMELINE ORBITALE", pause: "Pausa", resume: "Riprendi", ground: "Traccia a terra", debris: "Campo detriti", paths: "Orbite", zoomIn: "Ingrandisci", zoomOut: "Riduci", plan: "Pianifica accensione", commit: "Conferma manovra", cancel: "Annulla piano", nominal: "Nominale", contact: "Prossimo contatto", fuel: "Carburante", inclination: "Inclinazione", altitude: "Altitudine", selected: "Veicolo selezionato", noticePlan: "Corridoio di manovra tracciato.", noticeCommitted: "Simulazione aggiornata; nessun comando inviato.", noticeCancelled: "Piano di manovra rimosso.", station: "Stazione di terra Kiruna" },
  },
  neura: {
    title: "Osservatorio dei sistemi neurali",
    kind: "Demo di visualizzazione biotech",
    prompt: "Crea un dimostratore non clinico di gemello neurale per esplorare regioni, segnali e coorti simulate.",
    capability: "Visualizzazione scientifica, confronto regioni, timeline dei segnali, annotazioni e snapshot.",
    proof: "Anteprima app live · 10 controlli locali · simulazione esplicitamente non clinica",
    ui: { eyebrow: "OSSERVATORIO DEI SISTEMI NEURALI", demoNotice: "DEMO DI RICERCA · NON PER USO CLINICO", study: "Studio N-204", overview: "Panoramica", signals: "Segnali", cohort: "Coorte", compare: "Confronta", region: "REGIONE", cortex: "Corteccia", stem: "Tronco encefalico", network: "Rete", baseline: "Baseline", stimulus: "Stimolo", recovery: "Recupero", play: "Avvia simulazione", pause: "Pausa", snapshot: "Cattura snapshot", annotate: "Aggiungi nota", reset: "Reimposta studio", biomarkers: "INDICATORI SIMULATI", coherence: "Coerenza", response: "Risposta", symmetry: "Simmetria", activity: "ATTIVITÀ REGIONALE", stable: "Pattern simulato stabile", noteSnapshot: "Snapshot aggiunto al registro dello studio.", noteAnnotation: "Nota ancorata al campione corrente.", noteReset: "Vista dello studio ripristinata alla baseline.", timeline: "TIMELINE CAMPIONI", sample: "Campione" },
  },
  synapse: {
    title: "Spazio di intelligenza collaborativa",
    kind: "Workspace di collaborazione AI",
    prompt: "Progetta un canvas collaborativo premium dove collegare ricerca, decisioni, attività e lavoro degli agenti.",
    capability: "Canvas di conoscenza, nodi tipizzati, ricerca, filtri, attività e modifica delle relazioni.",
    proof: "Anteprima app live · 11 controlli locali · workspace modificabile in memoria",
    ui: { eyebrow: "INTELLIGENZA COLLABORATIVA", workspace: "Workspace lancio Helios", canvas: "Canvas", documents: "Documenti", activity: "Attività", search: "Cerca nel workspace", addNode: "Nuovo nodo", focus: "Focus", align: "Allinea", connect: "Collega", filterAll: "Tutto", filterDecision: "Decisioni", filterTask: "Attività", brief: "Brief di lancio", research: "Ricerca pubblico", direction: "Direzione prodotto", prototype: "Revisione prototipo", decision: "Decisione", task: "Attività", note: "Nota", owner: "Responsabile", due: "Scadenza", newNode: "Una nuova attività è stata aggiunta al canvas.", connected: "Le idee selezionate ora sono collegate.", aligned: "Nodi visibili allineati alla griglia.", focused: "La modalità focus isola il filo selezionato.", searchResult: "elementi corrispondenti", activityOn: "Pannello attività aperto.", activityOff: "Pannello attività chiuso." },
  },
  vanta: {
    title: "Terminale rischio mercati",
    kind: "Postazione trading simulata",
    prompt: "Crea un terminale professionale denso con grafici, watchlist, controlli rischio e ordini simulati.",
    capability: "Grafico dinamico, watchlist, profondità, posizioni, limiti rischio e ordini paper.",
    proof: "Anteprima app live · 13 controlli locali · trading interamente simulato",
    ui: { eyebrow: "TERMINALE RISCHIO MERCATI", simulated: "DATI SIMULATI · NESSUNA ESECUZIONE", markets: "MERCATI", blotter: "REGISTRO", risk: "RISCHIO", watchlist: "WATCHLIST", symbol: "SIMBOLO", last: "ULTIMO", change: "VARIAZIONE", candles: "Candele", depth: "Profondità", positions: "POSIZIONI", orders: "ORDINI", buy: "COMPRA", sell: "VENDI", quantity: "Quantità", limit: "Prezzo limite", simulate: "Simula ordine", cancel: "Annulla pendente", exposure: "ESPOSIZIONE NETTA", var: "VaR SIMULATO", pnl: "P&L PAPER", orderReady: "Ticket pronto per la simulazione paper.", orderSent: "Ordine paper aggiunto al registro; nulla è stato trasmesso.", orderCancelled: "Ordine paper pendente annullato.", chart: "PREZZO / VOLUME", book: "BOOK ORDINI", desk: "EUROPA / GROWTH DESK" },
  },
  "arc-city": {
    title: "Gemello dei sistemi urbani",
    kind: "Gemello digitale smart city",
    prompt: "Crea un gemello urbano map-first per esplorare traffico, energia e ambiente nei quartieri e nel tempo.",
    capability: "Mappa urbana a livelli, ispezione quartieri, simulazione temporale, alert e metriche infrastrutturali.",
    proof: "Anteprima app live · 12 controlli locali · modello urbano SVG offline",
    ui: { eyebrow: "GEMELLO DEI SISTEMI URBANI", layers: "LIVELLI", traffic: "Traffico", energy: "Energia", air: "Qualità aria", water: "Acqua", transit: "Trasporto", districts: "QUARTIERI", harbor: "Porto", central: "Centro", north: "Rete nord", timeline: "TIMELINE CITTÀ", live: "Live", simulate: "Simula sera", pause: "Pausa", resume: "Riprendi", zoomIn: "Ingrandisci", zoomOut: "Riduci", alerts: "AVVISI", clear: "Rimuovi risolti", camera: "Ricentra mappa", inspect: "Ispeziona quartiere", demand: "Domanda energia", flow: "Flusso traffico", quality: "Indice aria", occupancy: "Carico trasporto", selected: "Quartiere selezionato", eventTraffic: "Livello traffico evidenziato.", eventEnergy: "Scenario domanda serale caricato.", eventAir: "Sensori qualità aria selezionati.", eventCleared: "Avvisi risolti rimossi.", morning: "Mattina", evening: "Sera", now: "Ora" },
  },
  morph: {
    title: "Configuratore di materiali",
    kind: "Configuratore cinematico in stile 3D",
    prompt: "Progetta un configuratore automotive cinematico con controlli per materiali, abitacolo, ruote, luci e camera.",
    capability: "Visualizzazione prodotto, materiali, specifiche, rotazione camera, illuminazione e configurazione salvata.",
    proof: "Anteprima app live · 14 controlli locali · prodotto CSS/SVG senza foto stock",
    ui: { eyebrow: "CONFIGURATORE DI PRODOTTO FISICO", configurator: "M-01 / SERIE", model: "MODELLO", material: "MATERIALE", cabin: "ABITACOLO", stance: "ASSETTO", studio: "Studio", road: "Strada", detail: "Dettaglio", lights: "Luci", rotate: "Ruota vista", save: "Salva specifica", saved: "Specifica salvata localmente per questa demo.", reset: "Reimposta", graphite: "Grafite", pearl: "Perla", copper: "Rame", cobalt: "Cobalto", wheelAero: "Aero 21", wheelTrack: "Track 22", interiorStone: "Pietra", interiorInk: "Inchiostro", interiorSaddle: "Cuoio", power: "Potenza", range: "Autonomia", sprint: "0–100 km/h", viewFront: "Fronte", viewSide: "Profilo", viewRear: "Retro", hotspot: "Apri dettaglio materiale", selection: "SPECIFICA CORRENTE", spec: "M-01 Dual Motor", body: "Carrozzeria", wheel: "Ruota", interior: "Interni", noticeReset: "Configurazione di fabbrica ripristinata." },
  },
});

const es = translated(en, {
  "orbit-command": { title: "Control de misión orbital", kind: "Gemelo de sistemas espaciales", prompt: "Crea un gemelo digital de control de misión para una pequeña flota de satélites, con planificación orbital y telemetría en vivo.", capability: "Telemetría espacial, selección de flota, capas, línea temporal y planificación de maniobras.", proof: "Vista previa en vivo · 12 controles locales · telemetría canvas sin red", ui: { eyebrow: "CONTROL DE MISIÓN / ÓRBITA BAJA", live: "ENLACE ACTIVO", missionTime: "TIEMPO DE MISIÓN", fleet: "FLOTA", telemetry: "TELEMETRÍA", timeline: "LÍNEA ORBITAL", pause: "Pausar", resume: "Reanudar", ground: "Trayectoria terrestre", debris: "Campo de residuos", paths: "Órbitas", zoomIn: "Acercar", zoomOut: "Alejar", plan: "Planificar impulso", commit: "Confirmar maniobra", cancel: "Cancelar plan", nominal: "Nominal", contact: "Próximo contacto", fuel: "Combustible", inclination: "Inclinación", altitude: "Altitud", selected: "Vehículo seleccionado", noticePlan: "Corredor de maniobra trazado.", noticeCommitted: "Simulación actualizada; no se envió ningún comando.", noticeCancelled: "Plan de maniobra eliminado.", station: "Estación terrestre de Kiruna" } },
  neura: { title: "Observatorio de sistemas neuronales", kind: "Demo de visualización biotech", prompt: "Crea un demostrador no clínico de gemelo neuronal para explorar regiones, señales y cohortes simuladas.", capability: "Visualización científica, comparación regional, línea de señales, anotaciones y capturas.", proof: "Vista previa en vivo · 10 controles locales · simulación no clínica explícita", ui: { eyebrow: "OBSERVATORIO DE SISTEMAS NEURONALES", demoNotice: "DEMO DE INVESTIGACIÓN · NO PARA USO CLÍNICO", study: "Estudio N-204", overview: "Resumen", signals: "Señales", cohort: "Cohorte", compare: "Comparar", region: "REGIÓN", cortex: "Corteza", stem: "Tronco cerebral", network: "Red", baseline: "Base", stimulus: "Estímulo", recovery: "Recuperación", play: "Ejecutar simulación", pause: "Pausar", snapshot: "Capturar imagen", annotate: "Añadir anotación", reset: "Restablecer estudio", biomarkers: "MARCADORES SIMULADOS", coherence: "Coherencia", response: "Respuesta", symmetry: "Simetría", activity: "ACTIVIDAD REGIONAL", stable: "Patrón simulado estable", noteSnapshot: "Captura añadida al registro del estudio.", noteAnnotation: "Anotación fijada en la muestra actual.", noteReset: "Vista restaurada a la línea base.", timeline: "LÍNEA DE MUESTRAS", sample: "Muestra" } },
  synapse: { title: "Espacio de inteligencia colaborativa", kind: "Workspace de colaboración IA", prompt: "Diseña un canvas colaborativo premium para conectar investigación, decisiones, tareas y actividad de agentes.", capability: "Canvas de conocimiento, nodos tipados, búsqueda, filtros, actividad y relaciones editables.", proof: "Vista previa en vivo · 11 controles locales · workspace editable en memoria", ui: { eyebrow: "INTELIGENCIA COLABORATIVA", workspace: "Workspace de lanzamiento Helios", canvas: "Canvas", documents: "Documentos", activity: "Actividad", search: "Buscar en el workspace", addNode: "Nuevo nodo", focus: "Enfocar", align: "Alinear", connect: "Conectar", filterAll: "Todo", filterDecision: "Decisiones", filterTask: "Tareas", brief: "Brief de lanzamiento", research: "Investigación de audiencia", direction: "Dirección de producto", prototype: "Revisión de prototipo", decision: "Decisión", task: "Tarea", note: "Nota", owner: "Responsable", due: "Fecha", newNode: "Se añadió una nueva tarea al canvas.", connected: "Las ideas seleccionadas están conectadas.", aligned: "Nodos visibles alineados a la cuadrícula.", focused: "El modo foco aísla el hilo seleccionado.", searchResult: "elementos coincidentes", activityOn: "Panel de actividad abierto.", activityOff: "Panel de actividad cerrado." } },
  vanta: { title: "Terminal de riesgo de mercado", kind: "Estación de trading simulada", prompt: "Crea un terminal profesional denso con gráficos, watchlist, controles de riesgo y órdenes simuladas.", capability: "Gráfico dinámico, watchlist, profundidad, posiciones, límites de riesgo y órdenes paper.", proof: "Vista previa en vivo · 13 controles locales · trading completamente simulado", ui: { eyebrow: "TERMINAL DE RIESGO DE MERCADO", simulated: "DATOS SIMULADOS · SIN EJECUCIÓN", markets: "MERCADOS", blotter: "REGISTRO", risk: "RIESGO", watchlist: "WATCHLIST", symbol: "SÍMBOLO", last: "ÚLTIMO", change: "CAMBIO", candles: "Velas", depth: "Profundidad", positions: "POSICIONES", orders: "ÓRDENES", buy: "COMPRAR", sell: "VENDER", quantity: "Cantidad", limit: "Precio límite", simulate: "Simular orden", cancel: "Cancelar pendiente", exposure: "EXPOSICIÓN NETA", var: "VaR SIMULADO", pnl: "P&L PAPER", orderReady: "Ticket listo para simulación paper.", orderSent: "Orden paper añadida; no se transmitió nada.", orderCancelled: "Orden paper pendiente cancelada.", chart: "PRECIO / VOLUMEN", book: "LIBRO DE ÓRDENES", desk: "EUROPA / GROWTH DESK" } },
  "arc-city": { title: "Gemelo de sistemas urbanos", kind: "Gemelo digital de ciudad", prompt: "Crea un gemelo urbano centrado en el mapa para explorar tráfico, energía y ambiente por distrito y tiempo.", capability: "Mapa urbano por capas, inspección de distritos, simulación temporal, alertas y métricas.", proof: "Vista previa en vivo · 12 controles locales · modelo urbano SVG sin red", ui: { eyebrow: "GEMELO DE SISTEMAS URBANOS", layers: "CAPAS", traffic: "Tráfico", energy: "Energía", air: "Calidad del aire", water: "Agua", transit: "Transporte", districts: "DISTRITOS", harbor: "Puerto", central: "Centro", north: "Red norte", timeline: "LÍNEA DE CIUDAD", live: "En vivo", simulate: "Simular tarde", pause: "Pausar", resume: "Reanudar", zoomIn: "Acercar", zoomOut: "Alejar", alerts: "ALERTAS", clear: "Quitar resueltas", camera: "Centrar mapa", inspect: "Inspeccionar distrito", demand: "Demanda energética", flow: "Flujo de tráfico", quality: "Índice del aire", occupancy: "Carga de transporte", selected: "Distrito seleccionado", eventTraffic: "Capa de tráfico resaltada.", eventEnergy: "Escenario de demanda vespertina cargado.", eventAir: "Sensores de aire seleccionados.", eventCleared: "Alertas resueltas eliminadas.", morning: "Mañana", evening: "Tarde", now: "Ahora" } },
  morph: { title: "Configurador de materiales", kind: "Configurador cinematográfico 3D", prompt: "Diseña un configurador automotriz cinematográfico con controles de materiales, cabina, ruedas, luces y cámara.", capability: "Escenario de producto, materiales, especificaciones, cámara, iluminación y configuración guardada.", proof: "Vista previa en vivo · 14 controles locales · producto CSS/SVG sin fotos stock", ui: { eyebrow: "CONFIGURADOR DE PRODUCTO FÍSICO", configurator: "M-01 / SERIE", model: "MODELO", material: "MATERIAL", cabin: "CABINA", stance: "POSTURA", studio: "Estudio", road: "Carretera", detail: "Detalle", lights: "Luces", rotate: "Girar vista", save: "Guardar especificación", saved: "Especificación guardada localmente para esta demo.", reset: "Restablecer", graphite: "Grafito", pearl: "Perla", copper: "Cobre", cobalt: "Cobalto", wheelAero: "Aero 21", wheelTrack: "Track 22", interiorStone: "Piedra", interiorInk: "Tinta", interiorSaddle: "Cuero", power: "Potencia", range: "Autonomía", sprint: "0–100 km/h", viewFront: "Frontal", viewSide: "Perfil", viewRear: "Trasera", hotspot: "Abrir detalle de material", selection: "ESPECIFICACIÓN ACTUAL", spec: "M-01 Dual Motor", body: "Carrocería", wheel: "Rueda", interior: "Interior", noticeReset: "Configuración de fábrica restaurada." } },
});

const fr = translated(en, {
  "orbit-command": { title: "Contrôle de mission orbitale", kind: "Jumeau de systèmes spatiaux", prompt: "Créez un jumeau numérique de contrôle de mission pour une petite flotte de satellites, avec planification orbitale et télémétrie en direct.", capability: "Télémétrie spatiale, sélection de flotte, couches, chronologie et planification de manœuvre.", proof: "Aperçu en direct · 12 contrôles locaux · télémétrie canvas hors ligne", ui: { eyebrow: "CONTRÔLE DE MISSION / ORBITE BASSE", live: "LIAISON ACTIVE", missionTime: "TEMPS MISSION", fleet: "FLOTTE", telemetry: "TÉLÉMÉTRIE", timeline: "CHRONOLOGIE ORBITALE", pause: "Pause", resume: "Reprendre", ground: "Trace au sol", debris: "Champ de débris", paths: "Orbites", zoomIn: "Agrandir", zoomOut: "Réduire", plan: "Planifier la poussée", commit: "Confirmer la manœuvre", cancel: "Annuler le plan", nominal: "Nominal", contact: "Prochain contact", fuel: "Carburant", inclination: "Inclinaison", altitude: "Altitude", selected: "Véhicule sélectionné", noticePlan: "Corridor de manœuvre tracé.", noticeCommitted: "Simulation mise à jour; aucune commande envoyée.", noticeCancelled: "Plan de manœuvre effacé.", station: "Station sol de Kiruna" } },
  neura: { title: "Observatoire des systèmes neuronaux", kind: "Démo de visualisation biotech", prompt: "Créez un démonstrateur non clinique de jumeau neuronal pour explorer régions, signaux et cohortes simulées.", capability: "Visualisation scientifique, comparaison régionale, chronologie des signaux, annotations et captures.", proof: "Aperçu en direct · 10 contrôles locaux · simulation explicitement non clinique", ui: { eyebrow: "OBSERVATOIRE DES SYSTÈMES NEURONAUX", demoNotice: "DÉMO DE RECHERCHE · PAS D’USAGE CLINIQUE", study: "Étude N-204", overview: "Vue d’ensemble", signals: "Signaux", cohort: "Cohorte", compare: "Comparer", region: "RÉGION", cortex: "Cortex", stem: "Tronc cérébral", network: "Réseau", baseline: "Référence", stimulus: "Stimulus", recovery: "Récupération", play: "Lancer la simulation", pause: "Pause", snapshot: "Capturer", annotate: "Ajouter une annotation", reset: "Réinitialiser l’étude", biomarkers: "MARQUEURS SIMULÉS", coherence: "Cohérence", response: "Réponse", symmetry: "Symétrie", activity: "ACTIVITÉ RÉGIONALE", stable: "Motif simulé stable", noteSnapshot: "Capture ajoutée au journal de l’étude.", noteAnnotation: "Annotation ancrée sur l’échantillon actuel.", noteReset: "Vue restaurée à la référence.", timeline: "CHRONOLOGIE DES ÉCHANTILLONS", sample: "Échantillon" } },
  synapse: { title: "Espace d’intelligence collaborative", kind: "Workspace de collaboration IA", prompt: "Concevez un canvas collaboratif premium reliant recherche, décisions, tâches et activité des agents.", capability: "Canvas de connaissances, nœuds typés, recherche, filtres, activité et relations modifiables.", proof: "Aperçu en direct · 11 contrôles locaux · workspace modifiable en mémoire", ui: { eyebrow: "INTELLIGENCE COLLABORATIVE", workspace: "Workspace de lancement Helios", canvas: "Canvas", documents: "Documents", activity: "Activité", search: "Rechercher dans le workspace", addNode: "Nouveau nœud", focus: "Focus", align: "Aligner", connect: "Relier", filterAll: "Tout", filterDecision: "Décisions", filterTask: "Tâches", brief: "Brief de lancement", research: "Recherche audience", direction: "Direction produit", prototype: "Revue prototype", decision: "Décision", task: "Tâche", note: "Note", owner: "Responsable", due: "Échéance", newNode: "Une nouvelle tâche a été ajoutée au canvas.", connected: "Les idées sélectionnées sont maintenant reliées.", aligned: "Les nœuds visibles sont alignés sur la grille.", focused: "Le mode focus isole le fil sélectionné.", searchResult: "éléments correspondants", activityOn: "Panneau d’activité ouvert.", activityOff: "Panneau d’activité fermé." } },
  vanta: { title: "Terminal de risque de marché", kind: "Poste de trading simulé", prompt: "Créez un terminal professionnel dense avec graphiques, watchlist, contrôles de risque et ordres simulés.", capability: "Graphique dynamique, watchlist, profondeur, positions, limites de risque et ordres papier.", proof: "Aperçu en direct · 13 contrôles locaux · trading entièrement simulé", ui: { eyebrow: "TERMINAL DE RISQUE DE MARCHÉ", simulated: "DONNÉES SIMULÉES · AUCUNE EXÉCUTION", markets: "MARCHÉS", blotter: "REGISTRE", risk: "RISQUE", watchlist: "WATCHLIST", symbol: "SYMBOLE", last: "DERNIER", change: "VARIATION", candles: "Bougies", depth: "Profondeur", positions: "POSITIONS", orders: "ORDRES", buy: "ACHETER", sell: "VENDRE", quantity: "Quantité", limit: "Prix limite", simulate: "Simuler l’ordre", cancel: "Annuler en attente", exposure: "EXPOSITION NETTE", var: "VaR SIMULÉE", pnl: "P&L PAPIER", orderReady: "Ticket prêt pour la simulation papier.", orderSent: "Ordre papier ajouté; rien n’a été transmis.", orderCancelled: "Ordre papier en attente annulé.", chart: "PRIX / VOLUME", book: "CARNET D’ORDRES", desk: "EUROPE / GROWTH DESK" } },
  "arc-city": { title: "Jumeau des systèmes urbains", kind: "Jumeau numérique urbain", prompt: "Créez un jumeau urbain centré sur la carte pour explorer trafic, énergie et environnement par quartier et dans le temps.", capability: "Carte urbaine multicouche, inspection des quartiers, simulation temporelle, alertes et métriques.", proof: "Aperçu en direct · 12 contrôles locaux · modèle urbain SVG hors ligne", ui: { eyebrow: "JUMEAU DES SYSTÈMES URBAINS", layers: "COUCHES", traffic: "Trafic", energy: "Énergie", air: "Qualité de l’air", water: "Eau", transit: "Transport", districts: "QUARTIERS", harbor: "Port", central: "Centre", north: "Réseau nord", timeline: "CHRONOLOGIE DE LA VILLE", live: "Direct", simulate: "Simuler le soir", pause: "Pause", resume: "Reprendre", zoomIn: "Agrandir", zoomOut: "Réduire", alerts: "ALERTES", clear: "Effacer résolues", camera: "Recentrer la carte", inspect: "Inspecter le quartier", demand: "Demande énergétique", flow: "Flux du trafic", quality: "Indice de l’air", occupancy: "Charge du transport", selected: "Quartier sélectionné", eventTraffic: "Couche trafic mise en évidence.", eventEnergy: "Scénario de demande du soir chargé.", eventAir: "Capteurs de qualité de l’air sélectionnés.", eventCleared: "Alertes résolues supprimées.", morning: "Matin", evening: "Soir", now: "Maintenant" } },
  morph: { title: "Configurateur de matériaux", kind: "Configurateur cinématique 3D", prompt: "Concevez un configurateur automobile cinématique avec contrôles de matériaux, habitacle, roues, lumière et caméra.", capability: "Scène produit, matériaux, spécifications, rotation caméra, éclairage et configuration enregistrée.", proof: "Aperçu en direct · 14 contrôles locaux · produit CSS/SVG sans photo stock", ui: { eyebrow: "CONFIGURATEUR DE PRODUIT PHYSIQUE", configurator: "M-01 / SÉRIE", model: "MODÈLE", material: "MATÉRIAU", cabin: "HABITACLE", stance: "ASSIETTE", studio: "Studio", road: "Route", detail: "Détail", lights: "Lumières", rotate: "Faire pivoter", save: "Enregistrer la spécification", saved: "Spécification enregistrée localement pour cette démo.", reset: "Réinitialiser", graphite: "Graphite", pearl: "Perle", copper: "Cuivre", cobalt: "Cobalt", wheelAero: "Aero 21", wheelTrack: "Track 22", interiorStone: "Pierre", interiorInk: "Encre", interiorSaddle: "Cuir", power: "Puissance", range: "Autonomie", sprint: "0–100 km/h", viewFront: "Avant", viewSide: "Profil", viewRear: "Arrière", hotspot: "Ouvrir le détail du matériau", selection: "SPÉCIFICATION ACTUELLE", spec: "M-01 Dual Motor", body: "Carrosserie", wheel: "Roue", interior: "Intérieur", noticeReset: "Configuration d’usine restaurée." } },
});

const de = translated(en, {
  "orbit-command": { title: "Orbitale Missionskontrolle", kind: "Digitaler Zwilling für Raumfahrtsysteme", prompt: "Erstelle einen Missionskontroll-Zwilling für eine kleine Satellitenflotte mit Bahnplanung und Live-Telemetrie.", capability: "Räumliche Telemetrie, Flottenauswahl, Ebenen, Zeitleiste und Manöverplanung.", proof: "Live-App-Vorschau · 12 lokale Steuerungen · Offline-Canvas-Telemetrie", ui: { eyebrow: "MISSIONSKONTROLLE / NIEDRIGE UMLAUFBAHN", live: "LIVE-VERBINDUNG", missionTime: "MISSIONSZEIT", fleet: "FLOTTE", telemetry: "TELEMETRIE", timeline: "ORBIT-ZEITLEISTE", pause: "Pause", resume: "Fortsetzen", ground: "Bodenspur", debris: "Trümmerfeld", paths: "Umlaufbahnen", zoomIn: "Vergrößern", zoomOut: "Verkleinern", plan: "Zündung planen", commit: "Manöver bestätigen", cancel: "Plan verwerfen", nominal: "Nominal", contact: "Nächster Kontakt", fuel: "Treibstoff", inclination: "Neigung", altitude: "Höhe", selected: "Ausgewähltes Fahrzeug", noticePlan: "Manöverkorridor geplant.", noticeCommitted: "Simulation aktualisiert; kein Befehl gesendet.", noticeCancelled: "Manöverplan gelöscht.", station: "Bodenstation Kiruna" } },
  neura: { title: "Observatorium neuronaler Systeme", kind: "Biotech-Visualisierungsdemo", prompt: "Erstelle einen nichtklinischen neuronalen Zwilling zur Erkundung simulierter Regionen, Signale und Kohorten.", capability: "Wissenschaftliche Visualisierung, Regionsvergleich, Signalzeitleiste, Anmerkungen und Momentaufnahmen.", proof: "Live-App-Vorschau · 10 lokale Steuerungen · ausdrücklich nichtklinische Simulation", ui: { eyebrow: "OBSERVATORIUM NEURONALER SYSTEME", demoNotice: "FORSCHUNGSDEMO · NICHT FÜR KLINISCHE NUTZUNG", study: "Studie N-204", overview: "Übersicht", signals: "Signale", cohort: "Kohorte", compare: "Vergleichen", region: "REGION", cortex: "Kortex", stem: "Hirnstamm", network: "Netzwerk", baseline: "Basis", stimulus: "Stimulus", recovery: "Erholung", play: "Simulation starten", pause: "Pause", snapshot: "Momentaufnahme", annotate: "Anmerkung hinzufügen", reset: "Studie zurücksetzen", biomarkers: "SIMULIERTE MARKER", coherence: "Kohärenz", response: "Reaktion", symmetry: "Symmetrie", activity: "REGIONALE AKTIVITÄT", stable: "Stabiles simuliertes Muster", noteSnapshot: "Momentaufnahme zum Studienprotokoll hinzugefügt.", noteAnnotation: "Anmerkung an aktueller Probe verankert.", noteReset: "Studienansicht auf Basis zurückgesetzt.", timeline: "PROBEN-ZEITLEISTE", sample: "Probe" } },
  synapse: { title: "Arbeitsraum für kollaborative Intelligenz", kind: "KI-Kollaborationsworkspace", prompt: "Entwirf eine hochwertige kollaborative Fläche für Forschung, Entscheidungen, Aufgaben und Agentenaktivität.", capability: "Wissensfläche, typisierte Knoten, Suche, Filter, Aktivität und bearbeitbare Beziehungen.", proof: "Live-App-Vorschau · 11 lokale Steuerungen · editierbarer In-Memory-Workspace", ui: { eyebrow: "KOLLABORATIVE INTELLIGENZ", workspace: "Helios Launch-Workspace", canvas: "Canvas", documents: "Dokumente", activity: "Aktivität", search: "Workspace durchsuchen", addNode: "Neuer Knoten", focus: "Fokus", align: "Ausrichten", connect: "Verbinden", filterAll: "Alle", filterDecision: "Entscheidungen", filterTask: "Aufgaben", brief: "Launch-Briefing", research: "Zielgruppenforschung", direction: "Produktrichtung", prototype: "Prototyp-Review", decision: "Entscheidung", task: "Aufgabe", note: "Notiz", owner: "Verantwortlich", due: "Fällig", newNode: "Eine neue Aufgabe wurde zur Fläche hinzugefügt.", connected: "Ausgewählte Ideen sind jetzt verbunden.", aligned: "Sichtbare Knoten am Raster ausgerichtet.", focused: "Fokusmodus isoliert den ausgewählten Strang.", searchResult: "passende Workspace-Elemente", activityOn: "Aktivitätsbereich geöffnet.", activityOff: "Aktivitätsbereich geschlossen." } },
  vanta: { title: "Marktrisiko-Terminal", kind: "Simulierter Trading-Arbeitsplatz", prompt: "Erstelle ein dichtes professionelles Marktterminal mit Charts, Watchlist, Risikokontrollen und simulierten Orders.", capability: "Dynamischer Chart, Watchlist, Markttiefe, Positionen, Risikolimits und Paper-Order-Workflow.", proof: "Live-App-Vorschau · 13 lokale Steuerungen · vollständig simulierter Handel", ui: { eyebrow: "MARKTRISIKO-TERMINAL", simulated: "SIMULIERTE DATEN · KEINE AUSFÜHRUNG", markets: "MÄRKTE", blotter: "ORDERBUCH", risk: "RISIKO", watchlist: "WATCHLIST", symbol: "SYMBOL", last: "LETZTER", change: "ÄNDERUNG", candles: "Kerzen", depth: "Tiefe", positions: "POSITIONEN", orders: "ORDERS", buy: "KAUFEN", sell: "VERKAUFEN", quantity: "Menge", limit: "Limitpreis", simulate: "Order simulieren", cancel: "Offene stornieren", exposure: "NETTOEXPOSURE", var: "SIMULIERTER VaR", pnl: "PAPER P&L", orderReady: "Orderticket bereit für die Paper-Simulation.", orderSent: "Paper-Order hinzugefügt; nichts wurde übertragen.", orderCancelled: "Offene Paper-Order storniert.", chart: "PREIS / VOLUMEN", book: "ORDERBUCH", desk: "EUROPA / GROWTH DESK" } },
  "arc-city": { title: "Zwilling urbaner Systeme", kind: "Smart-City-Zwilling", prompt: "Erstelle einen kartenorientierten Stadtzwilling für Verkehr, Energie und Umwelt über Bezirke und Zeit.", capability: "Mehrschichtige Stadtkarte, Bezirksinspektion, Zeitsimulation, Warnungen und Infrastrukturmetriken.", proof: "Live-App-Vorschau · 12 lokale Steuerungen · Offline-SVG-Stadtmodell", ui: { eyebrow: "ZWILLING URBANER SYSTEME", layers: "EBENEN", traffic: "Verkehr", energy: "Energie", air: "Luftqualität", water: "Wasser", transit: "ÖPNV", districts: "BEZIRKE", harbor: "Hafen", central: "Zentrum", north: "Nordnetz", timeline: "STADT-ZEITLEISTE", live: "Live", simulate: "Abend simulieren", pause: "Pause", resume: "Fortsetzen", zoomIn: "Vergrößern", zoomOut: "Verkleinern", alerts: "WARNUNGEN", clear: "Gelöste entfernen", camera: "Karte zentrieren", inspect: "Bezirk untersuchen", demand: "Energiebedarf", flow: "Verkehrsfluss", quality: "Luftindex", occupancy: "ÖPNV-Auslastung", selected: "Ausgewählter Bezirk", eventTraffic: "Verkehrsebene hervorgehoben.", eventEnergy: "Abendliches Bedarfsszenario geladen.", eventAir: "Luftsensoren ausgewählt.", eventCleared: "Gelöste Warnungen entfernt.", morning: "Morgen", evening: "Abend", now: "Jetzt" } },
  morph: { title: "Materialkonfigurator", kind: "Filmischer 3D-Konfigurator", prompt: "Entwirf einen filmischen Fahrzeugkonfigurator mit Material-, Innenraum-, Rad-, Licht- und Kamerasteuerung.", capability: "Produktbühne, Materialien, Spezifikationen, Kameradrehung, Beleuchtung und gespeicherte Konfiguration.", proof: "Live-App-Vorschau · 14 lokale Steuerungen · CSS/SVG-Produkt ohne Stockfoto", ui: { eyebrow: "KONFIGURATOR FÜR PHYSISCHE PRODUKTE", configurator: "M-01 / SERIE", model: "MODELL", material: "MATERIAL", cabin: "INNENRAUM", stance: "HALTUNG", studio: "Studio", road: "Straße", detail: "Detail", lights: "Lichter", rotate: "Ansicht drehen", save: "Spezifikation speichern", saved: "Spezifikation lokal für diese Demo gespeichert.", reset: "Zurücksetzen", graphite: "Graphit", pearl: "Perle", copper: "Kupfer", cobalt: "Kobalt", wheelAero: "Aero 21", wheelTrack: "Track 22", interiorStone: "Stein", interiorInk: "Tinte", interiorSaddle: "Sattel", power: "Leistung", range: "Reichweite", sprint: "0–100 km/h", viewFront: "Front", viewSide: "Profil", viewRear: "Heck", hotspot: "Materialdetail öffnen", selection: "AKTUELLE SPEZIFIKATION", spec: "M-01 Dual Motor", body: "Karosserie", wheel: "Rad", interior: "Innenraum", noticeReset: "Werkskonfiguration wiederhergestellt." } },
});

const pt = translated(en, {
  "orbit-command": { title: "Controle de missão orbital", kind: "Gêmeo de sistemas espaciais", prompt: "Crie um gêmeo digital de controle de missão para uma pequena frota de satélites, com planejamento orbital e telemetria ao vivo.", capability: "Telemetria espacial, seleção de frota, camadas, linha do tempo e planejamento de manobras.", proof: "Prévia ao vivo · 12 controles locais · telemetria canvas offline", ui: { eyebrow: "CONTROLE DE MISSÃO / ÓRBITA BAIXA", live: "LINK ATIVO", missionTime: "TEMPO DE MISSÃO", fleet: "FROTA", telemetry: "TELEMETRIA", timeline: "LINHA ORBITAL", pause: "Pausar", resume: "Retomar", ground: "Trajeto terrestre", debris: "Campo de detritos", paths: "Órbitas", zoomIn: "Ampliar", zoomOut: "Reduzir", plan: "Planejar impulso", commit: "Confirmar manobra", cancel: "Cancelar plano", nominal: "Nominal", contact: "Próximo contato", fuel: "Combustível", inclination: "Inclinação", altitude: "Altitude", selected: "Veículo selecionado", noticePlan: "Corredor de manobra traçado.", noticeCommitted: "Simulação atualizada; nenhum comando foi enviado.", noticeCancelled: "Plano de manobra removido.", station: "Estação terrestre de Kiruna" } },
  neura: { title: "Observatório de sistemas neurais", kind: "Demo de visualização biotech", prompt: "Crie um demonstrador não clínico de gêmeo neural para explorar regiões, sinais e coortes simuladas.", capability: "Visualização científica, comparação regional, linha de sinais, anotações e capturas.", proof: "Prévia ao vivo · 10 controles locais · simulação explicitamente não clínica", ui: { eyebrow: "OBSERVATÓRIO DE SISTEMAS NEURAIS", demoNotice: "DEMO DE PESQUISA · NÃO PARA USO CLÍNICO", study: "Estudo N-204", overview: "Visão geral", signals: "Sinais", cohort: "Coorte", compare: "Comparar", region: "REGIÃO", cortex: "Córtex", stem: "Tronco cerebral", network: "Rede", baseline: "Base", stimulus: "Estímulo", recovery: "Recuperação", play: "Executar simulação", pause: "Pausar", snapshot: "Capturar imagem", annotate: "Adicionar anotação", reset: "Redefinir estudo", biomarkers: "MARCADORES SIMULADOS", coherence: "Coerência", response: "Resposta", symmetry: "Simetria", activity: "ATIVIDADE REGIONAL", stable: "Padrão simulado estável", noteSnapshot: "Captura adicionada ao registro do estudo.", noteAnnotation: "Anotação fixada na amostra atual.", noteReset: "Vista restaurada à linha de base.", timeline: "LINHA DE AMOSTRAS", sample: "Amostra" } },
  synapse: { title: "Espaço de inteligência colaborativa", kind: "Workspace de colaboração IA", prompt: "Projete um canvas colaborativo premium para conectar pesquisa, decisões, tarefas e atividade dos agentes.", capability: "Canvas de conhecimento, nós tipados, busca, filtros, atividade e relações editáveis.", proof: "Prévia ao vivo · 11 controles locais · workspace editável em memória", ui: { eyebrow: "INTELIGÊNCIA COLABORATIVA", workspace: "Workspace de lançamento Helios", canvas: "Canvas", documents: "Documentos", activity: "Atividade", search: "Buscar no workspace", addNode: "Novo nó", focus: "Foco", align: "Alinhar", connect: "Conectar", filterAll: "Tudo", filterDecision: "Decisões", filterTask: "Tarefas", brief: "Brief de lançamento", research: "Pesquisa de público", direction: "Direção do produto", prototype: "Revisão do protótipo", decision: "Decisão", task: "Tarefa", note: "Nota", owner: "Responsável", due: "Prazo", newNode: "Uma nova tarefa foi adicionada ao canvas.", connected: "As ideias selecionadas agora estão conectadas.", aligned: "Nós visíveis alinhados à grade.", focused: "O modo foco isola o fio selecionado.", searchResult: "itens correspondentes", activityOn: "Painel de atividade aberto.", activityOff: "Painel de atividade fechado." } },
  vanta: { title: "Terminal de risco de mercado", kind: "Estação de trading simulada", prompt: "Crie um terminal profissional denso com gráficos, watchlist, controles de risco e ordens simuladas.", capability: "Gráfico dinâmico, watchlist, profundidade, posições, limites de risco e ordens paper.", proof: "Prévia ao vivo · 13 controles locais · trading totalmente simulado", ui: { eyebrow: "TERMINAL DE RISCO DE MERCADO", simulated: "DADOS SIMULADOS · SEM EXECUÇÃO", markets: "MERCADOS", blotter: "REGISTRO", risk: "RISCO", watchlist: "WATCHLIST", symbol: "SÍMBOLO", last: "ÚLTIMO", change: "VARIAÇÃO", candles: "Velas", depth: "Profundidade", positions: "POSIÇÕES", orders: "ORDENS", buy: "COMPRAR", sell: "VENDER", quantity: "Quantidade", limit: "Preço limite", simulate: "Simular ordem", cancel: "Cancelar pendente", exposure: "EXPOSIÇÃO LÍQUIDA", var: "VaR SIMULADO", pnl: "P&L PAPER", orderReady: "Ticket pronto para simulação paper.", orderSent: "Ordem paper adicionada; nada foi transmitido.", orderCancelled: "Ordem paper pendente cancelada.", chart: "PREÇO / VOLUME", book: "LIVRO DE ORDENS", desk: "EUROPA / GROWTH DESK" } },
  "arc-city": { title: "Gêmeo de sistemas urbanos", kind: "Gêmeo digital de cidade", prompt: "Crie um gêmeo urbano centrado no mapa para explorar tráfego, energia e ambiente por distrito e tempo.", capability: "Mapa urbano em camadas, inspeção de distritos, simulação temporal, alertas e métricas.", proof: "Prévia ao vivo · 12 controles locais · modelo urbano SVG offline", ui: { eyebrow: "GÊMEO DE SISTEMAS URBANOS", layers: "CAMADAS", traffic: "Tráfego", energy: "Energia", air: "Qualidade do ar", water: "Água", transit: "Transporte", districts: "DISTRITOS", harbor: "Porto", central: "Centro", north: "Rede norte", timeline: "LINHA DA CIDADE", live: "Ao vivo", simulate: "Simular noite", pause: "Pausar", resume: "Retomar", zoomIn: "Ampliar", zoomOut: "Reduzir", alerts: "ALERTAS", clear: "Limpar resolvidos", camera: "Centralizar mapa", inspect: "Inspecionar distrito", demand: "Demanda de energia", flow: "Fluxo de tráfego", quality: "Índice do ar", occupancy: "Carga do transporte", selected: "Distrito selecionado", eventTraffic: "Camada de tráfego destacada.", eventEnergy: "Cenário de demanda noturna carregado.", eventAir: "Sensores de ar selecionados.", eventCleared: "Alertas resolvidos removidos.", morning: "Manhã", evening: "Noite", now: "Agora" } },
  morph: { title: "Configurador de materiais", kind: "Configurador cinematográfico 3D", prompt: "Projete um configurador automotivo cinematográfico com controles de materiais, cabine, rodas, luzes e câmera.", capability: "Palco de produto, materiais, especificações, câmera, iluminação e configuração salva.", proof: "Prévia ao vivo · 14 controles locais · produto CSS/SVG sem fotos stock", ui: { eyebrow: "CONFIGURADOR DE PRODUTO FÍSICO", configurator: "M-01 / SÉRIE", model: "MODELO", material: "MATERIAL", cabin: "CABINE", stance: "POSTURA", studio: "Estúdio", road: "Estrada", detail: "Detalhe", lights: "Luzes", rotate: "Girar vista", save: "Salvar especificação", saved: "Especificação salva localmente para esta demo.", reset: "Redefinir", graphite: "Grafite", pearl: "Pérola", copper: "Cobre", cobalt: "Cobalto", wheelAero: "Aero 21", wheelTrack: "Track 22", interiorStone: "Pedra", interiorInk: "Tinta", interiorSaddle: "Couro", power: "Potência", range: "Autonomia", sprint: "0–100 km/h", viewFront: "Frente", viewSide: "Perfil", viewRear: "Traseira", hotspot: "Abrir detalhe do material", selection: "ESPECIFICAÇÃO ATUAL", spec: "M-01 Dual Motor", body: "Carroceria", wheel: "Roda", interior: "Interior", noticeReset: "Configuração de fábrica restaurada." } },
});

const TABLES: Record<Locale, FlagshipCopyTable> = { en, it, es, fr, de, pt };

const LABELS: Record<Locale, ShowcaseLabels> = {
  en: { prompt: "Original prompt", capability: "Capability proof", proof: "Evidence", archiveTitle: "More examples", archiveLead: "Earlier experiments remain available as an archive; they are not part of the six flagship set.", archiveOpen: "Open archived example" },
  it: { prompt: "Prompt originale", capability: "Capacità dimostrata", proof: "Prova", archiveTitle: "Altri esempi", archiveLead: "Gli esperimenti precedenti restano disponibili in archivio; non fanno parte delle sei flagship.", archiveOpen: "Apri esempio archiviato" },
  es: { prompt: "Prompt original", capability: "Capacidad demostrada", proof: "Evidencia", archiveTitle: "Más ejemplos", archiveLead: "Los experimentos anteriores siguen disponibles como archivo; no forman parte de las seis flagship.", archiveOpen: "Abrir ejemplo archivado" },
  fr: { prompt: "Prompt original", capability: "Capacité démontrée", proof: "Preuve", archiveTitle: "Plus d’exemples", archiveLead: "Les expériences précédentes restent disponibles en archive; elles ne font pas partie des six flagship.", archiveOpen: "Ouvrir l’exemple archivé" },
  de: { prompt: "Original-Prompt", capability: "Gezeigte Fähigkeit", proof: "Nachweis", archiveTitle: "Weitere Beispiele", archiveLead: "Frühere Experimente bleiben im Archiv verfügbar; sie gehören nicht zu den sechs Flagships.", archiveOpen: "Archiviertes Beispiel öffnen" },
  pt: { prompt: "Prompt original", capability: "Capacidade demonstrada", proof: "Evidência", archiveTitle: "Mais exemplos", archiveLead: "Experimentos anteriores continuam disponíveis no arquivo; não fazem parte das seis flagship.", archiveOpen: "Abrir exemplo arquivado" },
};

export function flagshipCopy(locale: Locale, id: FlagshipId): FlagshipCopy {
  return TABLES[locale][id];
}

export function flagshipShowcaseLabels(locale: Locale): ShowcaseLabels {
  return LABELS[locale];
}
