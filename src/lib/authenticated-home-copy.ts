import type { Locale } from "@/lib/i18n-core";

export type AuthenticatedHomeQuickPresetCopy = {
  label: string;
  description: string;
};

export type AuthenticatedHomeCopy = {
  skipToContent: string;
  greeting: string;
  headlineBefore: string;
  headlineAccent: string;
  headlineAfter: string;
  lead: string;
  signedOutLead: string;
  nav: {
    home: string;
    newProject: string;
    projects: string;
    showcase: string;
    pricing: string;
    help: string;
  };
  createSection: string;
  createPlaceholder: string;
  createAction: string;
  quickCreate: string;
  quickPresets: readonly [
    AuthenticatedHomeQuickPresetCopy,
    AuthenticatedHomeQuickPresetCopy,
    AuthenticatedHomeQuickPresetCopy,
    AuthenticatedHomeQuickPresetCopy,
    AuthenticatedHomeQuickPresetCopy,
    AuthenticatedHomeQuickPresetCopy,
  ];
  overview: {
    title: string;
    total: string;
    ready: string;
    online: string;
    credits: string;
  };
  build: {
    title: string;
    active: string;
    none: string;
  };
  recent: {
    title: string;
    none: string;
  };
  project: {
    title: string;
    search: string;
    noResults: string;
    filter: {
      all: string;
      building: string;
      ready: string;
      online: string;
    };
  };
  loading: string;
  error: string;
  retry: string;
  empty: {
    title: string;
    lead: string;
  };
  demo: {
    title: string;
    lead: string;
    apps: string;
    sites: string;
    open: string;
    all: string;
  };
  plan: string;
  credits: string;
  manage: string;
  account: string;
  signIn: string;
  viewAll: string;
};

const COPY: Record<Locale, AuthenticatedHomeCopy> = {
  it: {
    skipToContent: "Vai al contenuto",
    greeting: "Ciao",
    headlineBefore: "Cosa vuoi",
    headlineAccent: "creare",
    headlineAfter: "oggi?",
    lead: "Descrivi la tua idea. Helix la progetta, sviluppa e prepara per la pubblicazione.",
    signedOutLead: "Accedi per creare, vedere i progetti e usare i crediti.",
    nav: {
      home: "Home",
      newProject: "Nuovo progetto",
      projects: "I miei progetti",
      showcase: "Progetti demo",
      pricing: "Prezzi",
      help: "Assistenza",
    },
    createSection: "Inizia da un’idea",
    createPlaceholder: "Descrivi il software che vuoi creare…",
    createAction: "Crea con Helix",
    quickCreate: "Crea rapidamente",
    quickPresets: [
      { label: "Web app", description: "Applicazioni web moderne e responsive" },
      { label: "App mobile", description: "Esperienze per iOS e Android" },
      { label: "Dashboard", description: "Pannelli di controllo e analisi" },
      { label: "API e backend", description: "Servizi, dati e integrazioni" },
      { label: "Assistente IA", description: "Assistenti intelligenti su misura" },
      { label: "Sito web", description: "Siti, landing page e portfolio" },
    ],
    overview: {
      title: "Panoramica",
      total: "Progetti",
      ready: "Build completate",
      online: "Online",
      credits: "Crediti",
    },
    build: {
      title: "Stato build",
      active: "In esecuzione",
      none: "Nessuna build attiva",
    },
    recent: { title: "Attività recente", none: "Nessuna attività recente" },
    project: {
      title: "I tuoi progetti",
      search: "Cerca progetti…",
      noResults: "Nessun progetto corrisponde alla ricerca o ai filtri selezionati.",
      filter: {
        all: "Tutti",
        building: "In sviluppo",
        ready: "Completati",
        online: "Online",
      },
    },
    loading: "Caricamento in corso…",
    error: "Non siamo riusciti a caricare la dashboard.",
    retry: "Riprova",
    empty: {
      title: "Il tuo spazio è pronto",
      lead: "Descrivi cosa vuoi creare oppure esplora i progetti dimostrativi qui sotto.",
    },
    demo: {
      title: "Progetti dimostrativi",
      lead: "Esplora 18 esempi funzionanti, divisi per categoria. Non sono salvati nel tuo account e non consumano crediti.",
      apps: "App e software",
      sites: "Siti web",
      open: "Apri demo",
      all: "Vedi tutti",
    },
    plan: "Piano",
    credits: "Crediti disponibili",
    manage: "Gestisci piano",
    account: "Account",
    signIn: "Accedi",
    viewAll: "Mostra tutto",
  },
  en: {
    skipToContent: "Skip to content",
    greeting: "Hello",
    headlineBefore: "What do you want to",
    headlineAccent: "create",
    headlineAfter: "today?",
    lead: "Describe your idea. Helix designs, builds, and prepares it for launch.",
    signedOutLead: "Sign in to create, see your projects, and use credits.",
    nav: {
      home: "Home",
      newProject: "New project",
      projects: "My projects",
      showcase: "Demo projects",
      pricing: "Pricing",
      help: "Support",
    },
    createSection: "Start with an idea",
    createPlaceholder: "Describe the software you want to create…",
    createAction: "Create with Helix",
    quickCreate: "Create quickly",
    quickPresets: [
      { label: "Web app", description: "Modern, responsive web applications" },
      { label: "Mobile app", description: "Experiences for iOS and Android" },
      { label: "Dashboard", description: "Control panels and analytics" },
      { label: "API and backend", description: "Services, data, and integrations" },
      { label: "AI assistant", description: "Tailored intelligent assistants" },
      { label: "Website", description: "Sites, landing pages, and portfolios" },
    ],
    overview: {
      title: "Overview",
      total: "Projects",
      ready: "Completed builds",
      online: "Online",
      credits: "Credits",
    },
    build: {
      title: "Build status",
      active: "In progress",
      none: "No active builds",
    },
    recent: { title: "Recent activity", none: "No recent activity" },
    project: {
      title: "Your projects",
      search: "Search projects…",
      noResults: "No projects match your search or selected filters.",
      filter: {
        all: "All",
        building: "In progress",
        ready: "Completed",
        online: "Online",
      },
    },
    loading: "Loading…",
    error: "We couldn’t load your dashboard.",
    retry: "Try again",
    empty: {
      title: "Your workspace is ready",
      lead: "Describe what you want to create or explore the demo projects below.",
    },
    demo: {
      title: "Demo projects",
      lead: "Explore 18 working examples organized by category. They are not saved to your account and use no credits.",
      apps: "Apps and software",
      sites: "Websites",
      open: "Open demo",
      all: "View all",
    },
    plan: "Plan",
    credits: "Available credits",
    manage: "Manage plan",
    account: "Account",
    signIn: "Sign in",
    viewAll: "View all",
  },
  es: {
    skipToContent: "Ir al contenido",
    greeting: "Hola",
    headlineBefore: "¿Qué quieres",
    headlineAccent: "crear",
    headlineAfter: "hoy?",
    lead: "Describe tu idea. Helix la diseña, desarrolla y prepara para publicarla.",
    signedOutLead: "Accede para crear, ver tus proyectos y usar créditos.",
    nav: {
      home: "Inicio",
      newProject: "Nuevo proyecto",
      projects: "Mis proyectos",
      showcase: "Proyectos demo",
      pricing: "Precios",
      help: "Ayuda",
    },
    createSection: "Empieza con una idea",
    createPlaceholder: "Describe el software que quieres crear…",
    createAction: "Crear con Helix",
    quickCreate: "Crea rápidamente",
    quickPresets: [
      { label: "Aplicación web", description: "Aplicaciones web modernas y adaptables" },
      { label: "Aplicación móvil", description: "Experiencias para iOS y Android" },
      { label: "Dashboard", description: "Paneles de control y análisis" },
      { label: "API y backend", description: "Servicios, datos e integraciones" },
      { label: "Asistente IA", description: "Asistentes inteligentes a medida" },
      { label: "Sitio web", description: "Sitios, landing pages y portfolios" },
    ],
    overview: {
      title: "Resumen",
      total: "Proyectos",
      ready: "Builds completadas",
      online: "Online",
      credits: "Créditos",
    },
    build: {
      title: "Estado de builds",
      active: "En curso",
      none: "No hay builds activas",
    },
    recent: { title: "Actividad reciente", none: "No hay actividad reciente" },
    project: {
      title: "Tus proyectos",
      search: "Buscar proyectos…",
      noResults: "Ningún proyecto coincide con la búsqueda o los filtros seleccionados.",
      filter: {
        all: "Todos",
        building: "En desarrollo",
        ready: "Completados",
        online: "Online",
      },
    },
    loading: "Cargando…",
    error: "No hemos podido cargar tu panel.",
    retry: "Reintentar",
    empty: {
      title: "Tu espacio está listo",
      lead: "Describe lo que quieres crear o explora los proyectos demo de abajo.",
    },
    demo: {
      title: "Proyectos demo",
      lead: "Explora 18 ejemplos funcionales organizados por categoría. No se guardan en tu cuenta ni consumen créditos.",
      apps: "Apps y software",
      sites: "Sitios web",
      open: "Abrir demo",
      all: "Ver todos",
    },
    plan: "Plan",
    credits: "Créditos disponibles",
    manage: "Gestionar plan",
    account: "Cuenta",
    signIn: "Acceder",
    viewAll: "Ver todos",
  },
  fr: {
    skipToContent: "Aller au contenu",
    greeting: "Bonjour",
    headlineBefore: "Que voulez-vous",
    headlineAccent: "créer",
    headlineAfter: "aujourd’hui ?",
    lead: "Décrivez votre idée. Helix la conçoit, la développe et la prépare au lancement.",
    signedOutLead: "Connectez-vous pour créer, voir vos projets et utiliser les crédits.",
    nav: {
      home: "Accueil",
      newProject: "Nouveau projet",
      projects: "Mes projets",
      showcase: "Projets démo",
      pricing: "Tarifs",
      help: "Assistance",
    },
    createSection: "Partez d’une idée",
    createPlaceholder: "Décrivez le logiciel que vous souhaitez créer…",
    createAction: "Créer avec Helix",
    quickCreate: "Créer rapidement",
    quickPresets: [
      { label: "Application web", description: "Applications web modernes et responsives" },
      { label: "Application mobile", description: "Expériences pour iOS et Android" },
      { label: "Tableau de bord", description: "Pilotage, données et analyses" },
      { label: "API et backend", description: "Services, données et intégrations" },
      { label: "Assistant IA", description: "Assistants intelligents sur mesure" },
      { label: "Site web", description: "Sites, landing pages et portfolios" },
    ],
    overview: {
      title: "Vue d’ensemble",
      total: "Projets",
      ready: "Builds terminées",
      online: "En ligne",
      credits: "Crédits",
    },
    build: {
      title: "État des builds",
      active: "En cours",
      none: "Aucune build active",
    },
    recent: { title: "Activité récente", none: "Aucune activité récente" },
    project: {
      title: "Vos projets",
      search: "Rechercher un projet…",
      noResults: "Aucun projet ne correspond à la recherche ou aux filtres sélectionnés.",
      filter: {
        all: "Tous",
        building: "En développement",
        ready: "Terminés",
        online: "En ligne",
      },
    },
    loading: "Chargement…",
    error: "Impossible de charger votre tableau de bord.",
    retry: "Réessayer",
    empty: {
      title: "Votre espace est prêt",
      lead: "Décrivez ce que vous souhaitez créer ou explorez les projets démo ci-dessous.",
    },
    demo: {
      title: "Projets démo",
      lead: "Explorez 18 exemples fonctionnels classés par catégorie. Ils ne sont pas enregistrés dans votre compte et ne consomment aucun crédit.",
      apps: "Apps et logiciels",
      sites: "Sites web",
      open: "Ouvrir la démo",
      all: "Tout voir",
    },
    plan: "Offre",
    credits: "Crédits disponibles",
    manage: "Gérer l’offre",
    account: "Compte",
    signIn: "Connexion",
    viewAll: "Tout voir",
  },
  de: {
    skipToContent: "Zum Inhalt springen",
    greeting: "Hallo",
    headlineBefore: "Was möchtest du",
    headlineAccent: "erstellen",
    headlineAfter: "heute?",
    lead: "Beschreibe deine Idee. Helix entwirft und entwickelt sie und bereitet den Launch vor.",
    signedOutLead: "Melde dich an, um zu erstellen, Projekte zu sehen und Credits zu nutzen.",
    nav: {
      home: "Start",
      newProject: "Neues Projekt",
      projects: "Meine Projekte",
      showcase: "Demo-Projekte",
      pricing: "Preise",
      help: "Hilfe",
    },
    createSection: "Mit einer Idee starten",
    createPlaceholder: "Beschreibe die Software, die du erstellen möchtest…",
    createAction: "Mit Helix erstellen",
    quickCreate: "Schnell erstellen",
    quickPresets: [
      { label: "Web-App", description: "Moderne, responsive Webanwendungen" },
      { label: "Mobile App", description: "Erlebnisse für iOS und Android" },
      { label: "Dashboard", description: "Steuerung, Kennzahlen und Analysen" },
      { label: "API und Backend", description: "Dienste, Daten und Integrationen" },
      { label: "KI-Assistent", description: "Intelligente Assistenten nach Maß" },
      { label: "Website", description: "Websites, Landingpages und Portfolios" },
    ],
    overview: {
      title: "Übersicht",
      total: "Projekte",
      ready: "Abgeschlossene Builds",
      online: "Online",
      credits: "Credits",
    },
    build: {
      title: "Build-Status",
      active: "Wird ausgeführt",
      none: "Keine aktiven Builds",
    },
    recent: { title: "Letzte Aktivitäten", none: "Keine aktuellen Aktivitäten" },
    project: {
      title: "Deine Projekte",
      search: "Projekte suchen…",
      noResults: "Keine Projekte entsprechen der Suche oder den ausgewählten Filtern.",
      filter: {
        all: "Alle",
        building: "In Entwicklung",
        ready: "Abgeschlossen",
        online: "Online",
      },
    },
    loading: "Wird geladen…",
    error: "Dein Dashboard konnte nicht geladen werden.",
    retry: "Erneut versuchen",
    empty: {
      title: "Dein Arbeitsbereich ist bereit",
      lead: "Beschreibe dein Vorhaben oder entdecke unten die Demo-Projekte.",
    },
    demo: {
      title: "Demo-Projekte",
      lead: "Entdecke 18 funktionsfähige Beispiele nach Kategorien. Sie werden nicht in deinem Konto gespeichert und verbrauchen keine Credits.",
      apps: "Apps und Software",
      sites: "Websites",
      open: "Demo öffnen",
      all: "Alle ansehen",
    },
    plan: "Tarif",
    credits: "Verfügbare Credits",
    manage: "Tarif verwalten",
    account: "Konto",
    signIn: "Anmelden",
    viewAll: "Alle ansehen",
  },
  pt: {
    skipToContent: "Ir para o conteúdo",
    greeting: "Olá",
    headlineBefore: "O que quer",
    headlineAccent: "criar",
    headlineAfter: "hoje?",
    lead: "Descreva a sua ideia. A Helix desenha, desenvolve e prepara tudo para o lançamento.",
    signedOutLead: "Entre para criar, ver os projetos e usar créditos.",
    nav: {
      home: "Início",
      newProject: "Novo projeto",
      projects: "Os meus projetos",
      showcase: "Projetos demo",
      pricing: "Preços",
      help: "Ajuda",
    },
    createSection: "Comece com uma ideia",
    createPlaceholder: "Descreva o software que pretende criar…",
    createAction: "Criar com a Helix",
    quickCreate: "Criar rapidamente",
    quickPresets: [
      { label: "Aplicação web", description: "Aplicações web modernas e responsivas" },
      { label: "Aplicação móvel", description: "Experiências para iOS e Android" },
      { label: "Dashboard", description: "Painéis de controlo e análises" },
      { label: "API e backend", description: "Serviços, dados e integrações" },
      { label: "Assistente de IA", description: "Assistentes inteligentes à medida" },
      { label: "Site", description: "Sites, landing pages e portfólios" },
    ],
    overview: {
      title: "Visão geral",
      total: "Projetos",
      ready: "Builds concluídas",
      online: "Online",
      credits: "Créditos",
    },
    build: {
      title: "Estado das builds",
      active: "Em execução",
      none: "Nenhuma build ativa",
    },
    recent: { title: "Atividade recente", none: "Sem atividade recente" },
    project: {
      title: "Os seus projetos",
      search: "Pesquisar projetos…",
      noResults: "Nenhum projeto corresponde à pesquisa ou aos filtros selecionados.",
      filter: {
        all: "Todos",
        building: "Em desenvolvimento",
        ready: "Concluídos",
        online: "Online",
      },
    },
    loading: "A carregar…",
    error: "Não foi possível carregar o seu painel.",
    retry: "Tentar novamente",
    empty: {
      title: "O seu espaço está pronto",
      lead: "Descreva o que pretende criar ou explore os projetos demo abaixo.",
    },
    demo: {
      title: "Projetos demo",
      lead: "Explore 18 exemplos funcionais organizados por categoria. Não ficam guardados na sua conta e não consomem créditos.",
      apps: "Apps e software",
      sites: "Sites",
      open: "Abrir demo",
      all: "Ver todos",
    },
    plan: "Plano",
    credits: "Créditos disponíveis",
    manage: "Gerir plano",
    account: "Conta",
    signIn: "Entrar",
    viewAll: "Ver todos",
  },
};

export function authenticatedHomeCopy(locale: Locale): AuthenticatedHomeCopy {
  return COPY[locale];
}
