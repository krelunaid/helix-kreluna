import type { Locale } from "@/lib/i18n-core";
import { escapeFlagshipMarkup, flagshipDocument, flagshipScriptData } from "@/lib/flagships/shared";

export const BUSINESS_SUITE_IDS = ["studio-ledger", "pulse-booking", "foundry-erp"] as const;

export type BusinessSuiteId = (typeof BUSINESS_SUITE_IDS)[number];

type Copy = Record<string, string>;

function localizedCopy(
  en: Copy,
  translations: Record<Exclude<Locale, "en">, Copy>,
): Record<Locale, Copy> {
  return {
    en,
    it: { ...en, ...translations.it },
    es: { ...en, ...translations.es },
    fr: { ...en, ...translations.fr },
    de: { ...en, ...translations.de },
    pt: { ...en, ...translations.pt },
  };
}

const COPY: Record<BusinessSuiteId, Record<Locale, Copy>> = {
  "studio-ledger": {
    it: {
      title: "Studio Ledger · Controllo dello studio",
      brand: "STUDIO LEDGER",
      eyebrow: "CONTROL ROOM · STUDIO PROFESSIONALE",
      greeting: "Buonasera, Dott.ssa Conti",
      today: "Il lavoro importante, in ordine.",
      dashboard: "Scrivania",
      clients: "Clienti",
      deadlines: "Scadenze",
      documents: "Documenti",
      billing: "Parcelle",
      search: "Cerca cliente o pratica",
      thisWeek: "Questa settimana",
      thisMonth: "Questo mese",
      newClient: "Nuovo cliente",
      dueNow: "In scadenza",
      completed: "Completate",
      collected: "Incassato",
      workload: "Carico studio",
      agenda: "Agenda prioritaria",
      viewAll: "Vedi tutto",
      vat: "Liquidazione IVA",
      payroll: "Invio presenze",
      filing: "Deposito bilancio",
      review: "Revisione fascicolo",
      dueToday: "Oggi · 16:00",
      dueTomorrow: "Domani · 10:30",
      dueFriday: "Venerdì · 12:00",
      dueMonday: "Lunedì · 09:00",
      clientHealth: "Portafoglio clienti",
      active: "Attivi",
      attention: "Da seguire",
      waiting: "In attesa documenti",
      recentDocs: "Documenti recenti",
      doc1: "Dichiarazione IVA 2026.pdf",
      doc2: "Bilancio provvisorio Q2.xlsx",
      doc3: "Verbale assemblea.docx",
      reviewed: "Verificato",
      toReview: "Da verificare",
      cash: "Flusso parcelle",
      issued: "Emesse",
      paid: "Incassate",
      late: "Scadute",
      markDone: "Completa",
      reopen: "Riapri",
      addDeadline: "Aggiungi scadenza",
      reminder: "Invia promemoria",
      noteAdded: "Nuova scadenza inserita nella coda dello studio.",
      clientAdded: "Scheda cliente preparata in memoria.",
      reminderSent: "Promemoria simulato: nessun messaggio è stato inviato.",
      doneNotice: "Attività completata e indicatori aggiornati.",
      sectionNotice: "Vista aggiornata",
      searchNotice: "Risultati filtrati nello studio",
      privacy: "DEMO LOCALE · NESSUN DATO REALE",
    },
    en: {
      title: "Studio Ledger · Practice control",
      brand: "STUDIO LEDGER",
      eyebrow: "CONTROL ROOM · PROFESSIONAL PRACTICE",
      greeting: "Good evening, Dr Conti",
      today: "Important work, in order.",
      dashboard: "Desk",
      clients: "Clients",
      deadlines: "Deadlines",
      documents: "Documents",
      billing: "Billing",
      search: "Search client or case",
      thisWeek: "This week",
      thisMonth: "This month",
      newClient: "New client",
      dueNow: "Due soon",
      completed: "Completed",
      collected: "Collected",
      workload: "Practice load",
      agenda: "Priority agenda",
      viewAll: "View all",
      vat: "VAT settlement",
      payroll: "Submit attendance",
      filing: "File annual accounts",
      review: "Review client file",
      dueToday: "Today · 16:00",
      dueTomorrow: "Tomorrow · 10:30",
      dueFriday: "Friday · 12:00",
      dueMonday: "Monday · 09:00",
      clientHealth: "Client portfolio",
      active: "Active",
      attention: "Needs attention",
      waiting: "Awaiting documents",
      recentDocs: "Recent documents",
      doc1: "VAT return 2026.pdf",
      doc2: "Q2 draft accounts.xlsx",
      doc3: "Board minutes.docx",
      reviewed: "Reviewed",
      toReview: "To review",
      cash: "Billing flow",
      issued: "Issued",
      paid: "Paid",
      late: "Overdue",
      markDone: "Complete",
      reopen: "Reopen",
      addDeadline: "Add deadline",
      reminder: "Send reminder",
      noteAdded: "A new deadline was added to the practice queue.",
      clientAdded: "Client record prepared in memory.",
      reminderSent: "Reminder simulated: no message was sent.",
      doneNotice: "Task completed and indicators updated.",
      sectionNotice: "View updated",
      searchNotice: "Practice results filtered",
      privacy: "LOCAL DEMO · NO REAL DATA",
    },
    es: {
      title: "Studio Ledger · Control del despacho",
      brand: "STUDIO LEDGER",
      eyebrow: "CONTROL · DESPACHO PROFESIONAL",
      greeting: "Buenas tardes, Dra. Conti",
      today: "El trabajo importante, en orden.",
      dashboard: "Escritorio",
      clients: "Clientes",
      deadlines: "Vencimientos",
      documents: "Documentos",
      billing: "Honorarios",
      search: "Buscar cliente o expediente",
      thisWeek: "Esta semana",
      thisMonth: "Este mes",
      newClient: "Nuevo cliente",
      dueNow: "Por vencer",
      completed: "Completadas",
      collected: "Cobrado",
      workload: "Carga del despacho",
      agenda: "Agenda prioritaria",
      viewAll: "Ver todo",
      vat: "Liquidación de IVA",
      payroll: "Enviar asistencias",
      filing: "Depositar cuentas",
      review: "Revisar expediente",
      dueToday: "Hoy · 16:00",
      dueTomorrow: "Mañana · 10:30",
      dueFriday: "Viernes · 12:00",
      dueMonday: "Lunes · 09:00",
      clientHealth: "Cartera de clientes",
      active: "Activos",
      attention: "A revisar",
      waiting: "Esperando documentos",
      recentDocs: "Documentos recientes",
      doc1: "Declaración IVA 2026.pdf",
      doc2: "Cuentas provisionales Q2.xlsx",
      doc3: "Acta de asamblea.docx",
      reviewed: "Revisado",
      toReview: "Por revisar",
      cash: "Flujo de honorarios",
      issued: "Emitidos",
      paid: "Cobrados",
      late: "Vencidos",
      markDone: "Completar",
      reopen: "Reabrir",
      addDeadline: "Añadir vencimiento",
      reminder: "Enviar recordatorio",
      noteAdded: "Nuevo vencimiento añadido a la cola.",
      clientAdded: "Ficha de cliente preparada en memoria.",
      reminderSent: "Recordatorio simulado: no se envió ningún mensaje.",
      doneNotice: "Tarea completada e indicadores actualizados.",
      sectionNotice: "Vista actualizada",
      searchNotice: "Resultados del despacho filtrados",
      privacy: "DEMO LOCAL · SIN DATOS REALES",
    },
    fr: {
      title: "Studio Ledger · Pilotage du cabinet",
      brand: "STUDIO LEDGER",
      eyebrow: "PILOTAGE · CABINET PROFESSIONNEL",
      greeting: "Bonsoir, Dre Conti",
      today: "Le travail important, bien ordonné.",
      dashboard: "Bureau",
      clients: "Clients",
      deadlines: "Échéances",
      documents: "Documents",
      billing: "Honoraires",
      search: "Rechercher client ou dossier",
      thisWeek: "Cette semaine",
      thisMonth: "Ce mois",
      newClient: "Nouveau client",
      dueNow: "À échéance",
      completed: "Terminées",
      collected: "Encaissé",
      workload: "Charge du cabinet",
      agenda: "Agenda prioritaire",
      viewAll: "Tout voir",
      vat: "Déclaration de TVA",
      payroll: "Envoyer les présences",
      filing: "Déposer les comptes",
      review: "Réviser le dossier",
      dueToday: "Aujourd’hui · 16:00",
      dueTomorrow: "Demain · 10:30",
      dueFriday: "Vendredi · 12:00",
      dueMonday: "Lundi · 09:00",
      clientHealth: "Portefeuille clients",
      active: "Actifs",
      attention: "À suivre",
      waiting: "Documents attendus",
      recentDocs: "Documents récents",
      doc1: "Déclaration TVA 2026.pdf",
      doc2: "Comptes provisoires Q2.xlsx",
      doc3: "Procès-verbal.docx",
      reviewed: "Vérifié",
      toReview: "À vérifier",
      cash: "Flux d’honoraires",
      issued: "Émis",
      paid: "Encaissés",
      late: "En retard",
      markDone: "Terminer",
      reopen: "Rouvrir",
      addDeadline: "Ajouter une échéance",
      reminder: "Envoyer un rappel",
      noteAdded: "Nouvelle échéance ajoutée à la file du cabinet.",
      clientAdded: "Fiche client préparée en mémoire.",
      reminderSent: "Rappel simulé : aucun message envoyé.",
      doneNotice: "Tâche terminée et indicateurs actualisés.",
      sectionNotice: "Vue actualisée",
      searchNotice: "Résultats du cabinet filtrés",
      privacy: "DÉMO LOCALE · AUCUNE DONNÉE RÉELLE",
    },
    de: {
      title: "Studio Ledger · Kanzleisteuerung",
      brand: "STUDIO LEDGER",
      eyebrow: "LEITSTAND · PROFESSIONELLE KANZLEI",
      greeting: "Guten Abend, Frau Dr. Conti",
      today: "Wichtige Arbeit, klar geordnet.",
      dashboard: "Schreibtisch",
      clients: "Mandanten",
      deadlines: "Fristen",
      documents: "Dokumente",
      billing: "Honorare",
      search: "Mandant oder Akte suchen",
      thisWeek: "Diese Woche",
      thisMonth: "Dieser Monat",
      newClient: "Neuer Mandant",
      dueNow: "Bald fällig",
      completed: "Erledigt",
      collected: "Eingegangen",
      workload: "Kanzleiauslastung",
      agenda: "Prioritäten",
      viewAll: "Alle anzeigen",
      vat: "USt-Abrechnung",
      payroll: "Zeiten übermitteln",
      filing: "Jahresabschluss einreichen",
      review: "Akte prüfen",
      dueToday: "Heute · 16:00",
      dueTomorrow: "Morgen · 10:30",
      dueFriday: "Freitag · 12:00",
      dueMonday: "Montag · 09:00",
      clientHealth: "Mandantenportfolio",
      active: "Aktiv",
      attention: "Zu prüfen",
      waiting: "Dokumente ausstehend",
      recentDocs: "Neue Dokumente",
      doc1: "USt-Erklärung 2026.pdf",
      doc2: "Vorläufiger Abschluss Q2.xlsx",
      doc3: "Versammlungsprotokoll.docx",
      reviewed: "Geprüft",
      toReview: "Zu prüfen",
      cash: "Honorarfluss",
      issued: "Gestellt",
      paid: "Bezahlt",
      late: "Überfällig",
      markDone: "Erledigen",
      reopen: "Öffnen",
      addDeadline: "Frist hinzufügen",
      reminder: "Erinnerung senden",
      noteAdded: "Neue Frist zur Kanzleiliste hinzugefügt.",
      clientAdded: "Mandantenakte im Speicher vorbereitet.",
      reminderSent: "Erinnerung simuliert: keine Nachricht versendet.",
      doneNotice: "Aufgabe erledigt und Kennzahlen aktualisiert.",
      sectionNotice: "Ansicht aktualisiert",
      searchNotice: "Kanzleiergebnisse gefiltert",
      privacy: "LOKALE DEMO · KEINE ECHTEN DATEN",
    },
    pt: {
      title: "Studio Ledger · Controlo do escritório",
      brand: "STUDIO LEDGER",
      eyebrow: "CONTROLO · ESCRITÓRIO PROFISSIONAL",
      greeting: "Boa noite, Dra. Conti",
      today: "O trabalho importante, em ordem.",
      dashboard: "Secretária",
      clients: "Clientes",
      deadlines: "Prazos",
      documents: "Documentos",
      billing: "Honorários",
      search: "Pesquisar cliente ou processo",
      thisWeek: "Esta semana",
      thisMonth: "Este mês",
      newClient: "Novo cliente",
      dueNow: "A vencer",
      completed: "Concluídas",
      collected: "Recebido",
      workload: "Carga do escritório",
      agenda: "Agenda prioritária",
      viewAll: "Ver tudo",
      vat: "Liquidação de IVA",
      payroll: "Enviar presenças",
      filing: "Entregar contas",
      review: "Rever processo",
      dueToday: "Hoje · 16:00",
      dueTomorrow: "Amanhã · 10:30",
      dueFriday: "Sexta · 12:00",
      dueMonday: "Segunda · 09:00",
      clientHealth: "Carteira de clientes",
      active: "Ativos",
      attention: "A acompanhar",
      waiting: "Aguardar documentos",
      recentDocs: "Documentos recentes",
      doc1: "Declaração IVA 2026.pdf",
      doc2: "Contas provisórias Q2.xlsx",
      doc3: "Ata da assembleia.docx",
      reviewed: "Verificado",
      toReview: "A verificar",
      cash: "Fluxo de honorários",
      issued: "Emitidos",
      paid: "Recebidos",
      late: "Vencidos",
      markDone: "Concluir",
      reopen: "Reabrir",
      addDeadline: "Adicionar prazo",
      reminder: "Enviar lembrete",
      noteAdded: "Novo prazo adicionado à fila do escritório.",
      clientAdded: "Ficha de cliente preparada em memória.",
      reminderSent: "Lembrete simulado: nenhuma mensagem foi enviada.",
      doneNotice: "Tarefa concluída e indicadores atualizados.",
      sectionNotice: "Vista atualizada",
      searchNotice: "Resultados do escritório filtrados",
      privacy: "DEMO LOCAL · SEM DADOS REAIS",
    },
  },
  "pulse-booking": localizedCopy(
    {
      title: "Pulse Booking · Care calendar",
      brand: "PULSE",
      eyebrow: "CARE SCHEDULING STUDIO",
      greeting: "Your day, in rhythm.",
      week: "12–18 October",
      today: "Today",
      previous: "Previous week",
      next: "Next week",
      newBooking: "New booking",
      allTeam: "All team",
      aria: "Dr Aria Riva",
      teo: "Teo Bianchi",
      mina: "Mina Costa",
      agenda: "Agenda",
      patients: "Clients",
      rooms: "Rooms",
      insights: "Insights",
      search: "Search booking",
      mon: "MON 12",
      tue: "TUE 13",
      wed: "WED 14",
      thu: "THU 15",
      fri: "FRI 16",
      sat: "SAT 17",
      available: "Available",
      checkup: "Consultation",
      therapy: "Therapy session",
      followup: "Follow-up",
      firstVisit: "First visit",
      review: "Clinical review",
      confirmed: "Confirmed",
      waiting: "To confirm",
      arrived: "Arrived",
      bookingDetails: "Booking details",
      client: "Client",
      service: "Service",
      practitioner: "Practitioner",
      room: "Room",
      notes: "Notes",
      noteText: "Bring the previous report. Prefers a quiet room.",
      confirm: "Confirm",
      reschedule: "Reschedule",
      cancel: "Cancel",
      reminder: "Send reminder",
      utilization: "Week utilization",
      occupancy: "Occupancy",
      freeSlots: "Free slots",
      waitingList: "Waiting list",
      confirmNotice: "Booking confirmed in the local calendar.",
      rescheduleNotice: "A new time was proposed in memory.",
      cancelNotice: "Booking released; no real client was notified.",
      reminderNotice: "Reminder simulated: no message was sent.",
      newNotice: "A provisional booking was added to the day.",
      teamNotice: "Calendar filtered by practitioner.",
      dateNotice: "Calendar moved to another week.",
      privacy: "SCHEDULING DEMO · NO HEALTH DATA",
    },
    {
      it: {
        title: "Pulse Booking · Agenda di cura",
        eyebrow: "AGENDA PER STUDI E SERVIZI",
        greeting: "La tua giornata, con il ritmo giusto.",
        week: "12–18 ottobre",
        today: "Oggi",
        previous: "Settimana precedente",
        next: "Settimana successiva",
        newBooking: "Nuovo appuntamento",
        allTeam: "Tutto il team",
        aria: "Dott.ssa Aria Riva",
        agenda: "Agenda",
        patients: "Clienti",
        rooms: "Stanze",
        insights: "Analisi",
        search: "Cerca appuntamento",
        mon: "LUN 12",
        tue: "MAR 13",
        wed: "MER 14",
        thu: "GIO 15",
        fri: "VEN 16",
        sat: "SAB 17",
        available: "Disponibile",
        checkup: "Consulenza",
        therapy: "Seduta terapeutica",
        followup: "Controllo",
        firstVisit: "Prima visita",
        review: "Revisione clinica",
        confirmed: "Confermato",
        waiting: "Da confermare",
        arrived: "Arrivato",
        bookingDetails: "Dettagli appuntamento",
        client: "Cliente",
        service: "Servizio",
        practitioner: "Professionista",
        room: "Stanza",
        notes: "Note",
        noteText: "Porta il referto precedente. Preferisce una stanza tranquilla.",
        confirm: "Conferma",
        reschedule: "Sposta",
        cancel: "Annulla",
        reminder: "Invia promemoria",
        utilization: "Utilizzo settimanale",
        occupancy: "Occupazione",
        freeSlots: "Spazi liberi",
        waitingList: "Lista d’attesa",
        confirmNotice: "Appuntamento confermato nel calendario locale.",
        rescheduleNotice: "Un nuovo orario è stato proposto in memoria.",
        cancelNotice: "Appuntamento liberato; nessun cliente reale è stato avvisato.",
        reminderNotice: "Promemoria simulato: nessun messaggio è stato inviato.",
        newNotice: "Appuntamento provvisorio aggiunto alla giornata.",
        teamNotice: "Calendario filtrato per professionista.",
        dateNotice: "Calendario spostato su un’altra settimana.",
        privacy: "DEMO AGENDA · NESSUN DATO SANITARIO",
      },
      es: {
        title: "Pulse Booking · Agenda de atención",
        eyebrow: "AGENDA PARA CENTROS Y SERVICIOS",
        greeting: "Tu día, con el ritmo adecuado.",
        week: "12–18 de octubre",
        today: "Hoy",
        previous: "Semana anterior",
        next: "Semana siguiente",
        newBooking: "Nueva cita",
        allTeam: "Todo el equipo",
        aria: "Dra. Aria Riva",
        agenda: "Agenda",
        patients: "Clientes",
        rooms: "Salas",
        insights: "Análisis",
        search: "Buscar cita",
        available: "Disponible",
        checkup: "Consulta",
        therapy: "Sesión terapéutica",
        followup: "Seguimiento",
        firstVisit: "Primera visita",
        review: "Revisión clínica",
        confirmed: "Confirmada",
        waiting: "Por confirmar",
        arrived: "Ha llegado",
        bookingDetails: "Detalles de la cita",
        client: "Cliente",
        service: "Servicio",
        practitioner: "Profesional",
        room: "Sala",
        notes: "Notas",
        noteText: "Traer el informe anterior. Prefiere una sala tranquila.",
        confirm: "Confirmar",
        reschedule: "Cambiar hora",
        cancel: "Cancelar",
        reminder: "Enviar recordatorio",
        utilization: "Uso semanal",
        occupancy: "Ocupación",
        freeSlots: "Huecos libres",
        waitingList: "Lista de espera",
        confirmNotice: "Cita confirmada en el calendario local.",
        rescheduleNotice: "Nueva hora propuesta en memoria.",
        cancelNotice: "Cita liberada; no se avisó a ningún cliente real.",
        reminderNotice: "Recordatorio simulado: no se envió ningún mensaje.",
        newNotice: "Cita provisional añadida al día.",
        teamNotice: "Calendario filtrado por profesional.",
        dateNotice: "Calendario desplazado a otra semana.",
        privacy: "DEMO DE AGENDA · SIN DATOS DE SALUD",
      },
      fr: {
        title: "Pulse Booking · Agenda de soins",
        eyebrow: "AGENDA POUR CABINETS ET SERVICES",
        greeting: "Votre journée, au bon rythme.",
        week: "12–18 octobre",
        today: "Aujourd’hui",
        previous: "Semaine précédente",
        next: "Semaine suivante",
        newBooking: "Nouveau rendez-vous",
        allTeam: "Toute l’équipe",
        aria: "Dre Aria Riva",
        agenda: "Agenda",
        patients: "Clients",
        rooms: "Salles",
        insights: "Analyses",
        search: "Rechercher un rendez-vous",
        available: "Disponible",
        checkup: "Consultation",
        therapy: "Séance thérapeutique",
        followup: "Suivi",
        firstVisit: "Première visite",
        review: "Revue clinique",
        confirmed: "Confirmé",
        waiting: "À confirmer",
        arrived: "Arrivé",
        bookingDetails: "Détails du rendez-vous",
        client: "Client",
        service: "Service",
        practitioner: "Professionnel",
        room: "Salle",
        notes: "Notes",
        noteText: "Apporter le rapport précédent. Préfère une salle calme.",
        confirm: "Confirmer",
        reschedule: "Déplacer",
        cancel: "Annuler",
        reminder: "Envoyer un rappel",
        utilization: "Utilisation hebdomadaire",
        occupancy: "Occupation",
        freeSlots: "Créneaux libres",
        waitingList: "Liste d’attente",
        confirmNotice: "Rendez-vous confirmé dans l’agenda local.",
        rescheduleNotice: "Un nouvel horaire a été proposé en mémoire.",
        cancelNotice: "Créneau libéré ; aucun vrai client n’a été averti.",
        reminderNotice: "Rappel simulé : aucun message envoyé.",
        newNotice: "Rendez-vous provisoire ajouté à la journée.",
        teamNotice: "Agenda filtré par professionnel.",
        dateNotice: "Agenda déplacé vers une autre semaine.",
        privacy: "DÉMO AGENDA · AUCUNE DONNÉE DE SANTÉ",
      },
      de: {
        title: "Pulse Booking · Terminplan",
        eyebrow: "TERMINE FÜR PRAXEN UND SERVICES",
        greeting: "Ihr Tag, im richtigen Rhythmus.",
        week: "12.–18. Oktober",
        today: "Heute",
        previous: "Vorherige Woche",
        next: "Nächste Woche",
        newBooking: "Neuer Termin",
        allTeam: "Gesamtes Team",
        aria: "Dr. Aria Riva",
        agenda: "Kalender",
        patients: "Kunden",
        rooms: "Räume",
        insights: "Analyse",
        search: "Termin suchen",
        available: "Frei",
        checkup: "Beratung",
        therapy: "Therapiesitzung",
        followup: "Nachsorge",
        firstVisit: "Ersttermin",
        review: "Klinische Prüfung",
        confirmed: "Bestätigt",
        waiting: "Zu bestätigen",
        arrived: "Eingetroffen",
        bookingDetails: "Termindetails",
        client: "Kunde",
        service: "Leistung",
        practitioner: "Fachkraft",
        room: "Raum",
        notes: "Notizen",
        noteText: "Vorherigen Bericht mitbringen. Bevorzugt einen ruhigen Raum.",
        confirm: "Bestätigen",
        reschedule: "Verschieben",
        cancel: "Absagen",
        reminder: "Erinnerung senden",
        utilization: "Wochenauslastung",
        occupancy: "Belegung",
        freeSlots: "Freie Termine",
        waitingList: "Warteliste",
        confirmNotice: "Termin im lokalen Kalender bestätigt.",
        rescheduleNotice: "Neue Zeit im Speicher vorgeschlagen.",
        cancelNotice: "Termin freigegeben; kein echter Kunde benachrichtigt.",
        reminderNotice: "Erinnerung simuliert: keine Nachricht versendet.",
        newNotice: "Vorläufiger Termin zum Tag hinzugefügt.",
        teamNotice: "Kalender nach Fachkraft gefiltert.",
        dateNotice: "Kalender in eine andere Woche verschoben.",
        privacy: "TERMIN-DEMO · KEINE GESUNDHEITSDATEN",
      },
      pt: {
        title: "Pulse Booking · Agenda de cuidados",
        eyebrow: "AGENDA PARA CLÍNICAS E SERVIÇOS",
        greeting: "O seu dia, no ritmo certo.",
        week: "12–18 de outubro",
        today: "Hoje",
        previous: "Semana anterior",
        next: "Semana seguinte",
        newBooking: "Nova marcação",
        allTeam: "Toda a equipa",
        aria: "Dra. Aria Riva",
        agenda: "Agenda",
        patients: "Clientes",
        rooms: "Salas",
        insights: "Análises",
        search: "Pesquisar marcação",
        available: "Disponível",
        checkup: "Consulta",
        therapy: "Sessão terapêutica",
        followup: "Acompanhamento",
        firstVisit: "Primeira visita",
        review: "Revisão clínica",
        confirmed: "Confirmada",
        waiting: "Por confirmar",
        arrived: "Chegou",
        bookingDetails: "Detalhes da marcação",
        client: "Cliente",
        service: "Serviço",
        practitioner: "Profissional",
        room: "Sala",
        notes: "Notas",
        noteText: "Trazer o relatório anterior. Prefere uma sala tranquila.",
        confirm: "Confirmar",
        reschedule: "Reagendar",
        cancel: "Cancelar",
        reminder: "Enviar lembrete",
        utilization: "Utilização semanal",
        occupancy: "Ocupação",
        freeSlots: "Vagas livres",
        waitingList: "Lista de espera",
        confirmNotice: "Marcação confirmada na agenda local.",
        rescheduleNotice: "Novo horário proposto em memória.",
        cancelNotice: "Horário libertado; nenhum cliente real foi avisado.",
        reminderNotice: "Lembrete simulado: nenhuma mensagem foi enviada.",
        newNotice: "Marcação provisória adicionada ao dia.",
        teamNotice: "Agenda filtrada por profissional.",
        dateNotice: "Agenda movida para outra semana.",
        privacy: "DEMO DE AGENDA · SEM DADOS DE SAÚDE",
      },
    },
  ),
  "foundry-erp": localizedCopy(
    {
      title: "Foundry ERP · Operations core",
      brand: "FOUNDRY / OS",
      eyebrow: "OPERATIONS CORE · PLANT 04",
      live: "LIVE SHIFT",
      orders: "Orders",
      inventory: "Inventory",
      crm: "CRM",
      invoices: "Invoices",
      production: "Production",
      search: "Search order, SKU or company",
      newOrder: "New order",
      revenue: "Net revenue",
      openOrders: "Open orders",
      stockValue: "Stock value",
      onTime: "On-time delivery",
      pipeline: "Order pipeline",
      all: "All",
      attention: "Attention",
      ready: "Ready",
      order: "Order",
      customer: "Customer",
      value: "Value",
      delivery: "Delivery",
      stage: "Stage",
      assembly: "Assembly",
      quality: "Quality",
      packing: "Packing",
      released: "Released",
      hold: "On hold",
      details: "Order details",
      progress: "Advance stage",
      flag: "Flag issue",
      invoice: "Create invoice",
      allocate: "Allocate stock",
      materials: "Material watch",
      lowStock: "Low stock",
      healthy: "Healthy",
      reserved: "Reserved",
      activity: "Shift activity",
      machine: "Cell M-14 back online",
      shipment: "Shipment 2084 prepared",
      payment: "Invoice 8841 reconciled",
      qualityEvent: "Quality gate completed",
      forecast: "Cash forecast",
      thirtyDays: "30 days",
      ninetyDays: "90 days",
      advanceNotice: "Order advanced to the next simulated stage.",
      flagNotice: "Issue flagged in the local operations queue.",
      invoiceNotice: "Draft invoice prepared in memory.",
      allocateNotice: "Available stock allocated to the order.",
      newNotice: "New draft order opened in the workspace.",
      filterNotice: "Pipeline filter updated.",
      sectionNotice: "Operations module changed.",
      privacy: "SIMULATED ERP · NO LIVE SYSTEMS",
    },
    {
      it: {
        title: "Foundry ERP · Nucleo operativo",
        eyebrow: "NUCLEO OPERATIVO · STABILIMENTO 04",
        live: "TURNO ATTIVO",
        orders: "Ordini",
        inventory: "Magazzino",
        crm: "Clienti",
        invoices: "Fatture",
        production: "Produzione",
        search: "Cerca ordine, SKU o azienda",
        newOrder: "Nuovo ordine",
        revenue: "Ricavi netti",
        openOrders: "Ordini aperti",
        stockValue: "Valore magazzino",
        onTime: "Consegne puntuali",
        pipeline: "Flusso ordini",
        all: "Tutti",
        attention: "Attenzione",
        ready: "Pronti",
        order: "Ordine",
        customer: "Cliente",
        value: "Valore",
        delivery: "Consegna",
        stage: "Fase",
        assembly: "Assemblaggio",
        quality: "Qualità",
        packing: "Imballaggio",
        released: "Rilasciato",
        hold: "In attesa",
        details: "Dettagli ordine",
        progress: "Avanza fase",
        flag: "Segnala problema",
        invoice: "Crea fattura",
        allocate: "Assegna scorte",
        materials: "Controllo materiali",
        lowStock: "Scorta bassa",
        healthy: "Regolare",
        reserved: "Riservato",
        activity: "Attività del turno",
        machine: "Cella M-14 di nuovo operativa",
        shipment: "Spedizione 2084 preparata",
        payment: "Fattura 8841 riconciliata",
        qualityEvent: "Controllo qualità completato",
        forecast: "Previsione di cassa",
        thirtyDays: "30 giorni",
        ninetyDays: "90 giorni",
        advanceNotice: "Ordine avanzato alla fase simulata successiva.",
        flagNotice: "Problema segnalato nella coda operativa locale.",
        invoiceNotice: "Bozza fattura preparata in memoria.",
        allocateNotice: "Scorte disponibili assegnate all’ordine.",
        newNotice: "Nuovo ordine in bozza aperto nello spazio di lavoro.",
        filterNotice: "Filtro del flusso aggiornato.",
        sectionNotice: "Modulo operativo cambiato.",
        privacy: "ERP SIMULATO · NESSUN SISTEMA REALE",
      },
      es: {
        title: "Foundry ERP · Núcleo operativo",
        eyebrow: "NÚCLEO OPERATIVO · PLANTA 04",
        live: "TURNO ACTIVO",
        orders: "Pedidos",
        inventory: "Almacén",
        crm: "Clientes",
        invoices: "Facturas",
        production: "Producción",
        search: "Buscar pedido, SKU o empresa",
        newOrder: "Nuevo pedido",
        revenue: "Ingresos netos",
        openOrders: "Pedidos abiertos",
        stockValue: "Valor de existencias",
        onTime: "Entregas puntuales",
        pipeline: "Flujo de pedidos",
        all: "Todos",
        attention: "Atención",
        ready: "Listos",
        order: "Pedido",
        customer: "Cliente",
        value: "Valor",
        delivery: "Entrega",
        stage: "Fase",
        assembly: "Montaje",
        quality: "Calidad",
        packing: "Embalaje",
        released: "Liberado",
        hold: "En espera",
        details: "Detalles del pedido",
        progress: "Avanzar fase",
        flag: "Marcar incidencia",
        invoice: "Crear factura",
        allocate: "Asignar existencias",
        materials: "Control de materiales",
        lowStock: "Existencias bajas",
        healthy: "Correcto",
        reserved: "Reservado",
        activity: "Actividad del turno",
        machine: "Celda M-14 de nuevo operativa",
        shipment: "Envío 2084 preparado",
        payment: "Factura 8841 conciliada",
        qualityEvent: "Control de calidad completado",
        forecast: "Previsión de caja",
        thirtyDays: "30 días",
        ninetyDays: "90 días",
        advanceNotice: "Pedido avanzado a la siguiente fase simulada.",
        flagNotice: "Incidencia marcada en la cola operativa local.",
        invoiceNotice: "Borrador de factura preparado en memoria.",
        allocateNotice: "Existencias disponibles asignadas al pedido.",
        newNotice: "Nuevo borrador de pedido abierto.",
        filterNotice: "Filtro del flujo actualizado.",
        sectionNotice: "Módulo operativo cambiado.",
        privacy: "ERP SIMULADO · SIN SISTEMAS REALES",
      },
      fr: {
        title: "Foundry ERP · Cœur opérationnel",
        eyebrow: "CŒUR OPÉRATIONNEL · USINE 04",
        live: "ÉQUIPE ACTIVE",
        orders: "Commandes",
        inventory: "Stock",
        crm: "Clients",
        invoices: "Factures",
        production: "Production",
        search: "Rechercher commande, SKU ou société",
        newOrder: "Nouvelle commande",
        revenue: "Chiffre net",
        openOrders: "Commandes ouvertes",
        stockValue: "Valeur du stock",
        onTime: "Livraisons à l’heure",
        pipeline: "Flux des commandes",
        all: "Toutes",
        attention: "Attention",
        ready: "Prêtes",
        order: "Commande",
        customer: "Client",
        value: "Valeur",
        delivery: "Livraison",
        stage: "Étape",
        assembly: "Assemblage",
        quality: "Qualité",
        packing: "Emballage",
        released: "Libérée",
        hold: "En attente",
        details: "Détails commande",
        progress: "Avancer l’étape",
        flag: "Signaler un problème",
        invoice: "Créer une facture",
        allocate: "Affecter le stock",
        materials: "Suivi matières",
        lowStock: "Stock faible",
        healthy: "Sain",
        reserved: "Réservé",
        activity: "Activité de l’équipe",
        machine: "Cellule M-14 de nouveau active",
        shipment: "Expédition 2084 préparée",
        payment: "Facture 8841 rapprochée",
        qualityEvent: "Contrôle qualité terminé",
        forecast: "Prévision de trésorerie",
        thirtyDays: "30 jours",
        ninetyDays: "90 jours",
        advanceNotice: "Commande avancée à l’étape simulée suivante.",
        flagNotice: "Problème signalé dans la file locale.",
        invoiceNotice: "Projet de facture préparé en mémoire.",
        allocateNotice: "Stock disponible affecté à la commande.",
        newNotice: "Nouvelle commande provisoire ouverte.",
        filterNotice: "Filtre du flux actualisé.",
        sectionNotice: "Module opérationnel modifié.",
        privacy: "ERP SIMULÉ · AUCUN SYSTÈME RÉEL",
      },
      de: {
        title: "Foundry ERP · Betriebskern",
        eyebrow: "BETRIEBSKERN · WERK 04",
        live: "SCHICHT AKTIV",
        orders: "Aufträge",
        inventory: "Lager",
        crm: "Kunden",
        invoices: "Rechnungen",
        production: "Produktion",
        search: "Auftrag, SKU oder Firma suchen",
        newOrder: "Neuer Auftrag",
        revenue: "Nettoerlös",
        openOrders: "Offene Aufträge",
        stockValue: "Lagerwert",
        onTime: "Pünktliche Lieferung",
        pipeline: "Auftragsfluss",
        all: "Alle",
        attention: "Achtung",
        ready: "Bereit",
        order: "Auftrag",
        customer: "Kunde",
        value: "Wert",
        delivery: "Lieferung",
        stage: "Stufe",
        assembly: "Montage",
        quality: "Qualität",
        packing: "Verpackung",
        released: "Freigegeben",
        hold: "Gesperrt",
        details: "Auftragsdetails",
        progress: "Stufe fortsetzen",
        flag: "Problem markieren",
        invoice: "Rechnung erstellen",
        allocate: "Bestand zuweisen",
        materials: "Materialüberblick",
        lowStock: "Niedriger Bestand",
        healthy: "Gesund",
        reserved: "Reserviert",
        activity: "Schichtaktivität",
        machine: "Zelle M-14 wieder in Betrieb",
        shipment: "Sendung 2084 vorbereitet",
        payment: "Rechnung 8841 abgeglichen",
        qualityEvent: "Qualitätsprüfung abgeschlossen",
        forecast: "Liquiditätsprognose",
        thirtyDays: "30 Tage",
        ninetyDays: "90 Tage",
        advanceNotice: "Auftrag zur nächsten simulierten Stufe bewegt.",
        flagNotice: "Problem in der lokalen Warteschlange markiert.",
        invoiceNotice: "Rechnungsentwurf im Speicher vorbereitet.",
        allocateNotice: "Verfügbarer Bestand dem Auftrag zugewiesen.",
        newNotice: "Neuer Auftragsentwurf geöffnet.",
        filterNotice: "Auftragsfilter aktualisiert.",
        sectionNotice: "Betriebsmodul gewechselt.",
        privacy: "SIMULIERTES ERP · KEINE LIVE-SYSTEME",
      },
      pt: {
        title: "Foundry ERP · Núcleo operacional",
        eyebrow: "NÚCLEO OPERACIONAL · FÁBRICA 04",
        live: "TURNO ATIVO",
        orders: "Encomendas",
        inventory: "Armazém",
        crm: "Clientes",
        invoices: "Faturas",
        production: "Produção",
        search: "Pesquisar encomenda, SKU ou empresa",
        newOrder: "Nova encomenda",
        revenue: "Receita líquida",
        openOrders: "Encomendas abertas",
        stockValue: "Valor do stock",
        onTime: "Entregas pontuais",
        pipeline: "Fluxo de encomendas",
        all: "Todas",
        attention: "Atenção",
        ready: "Prontas",
        order: "Encomenda",
        customer: "Cliente",
        value: "Valor",
        delivery: "Entrega",
        stage: "Fase",
        assembly: "Montagem",
        quality: "Qualidade",
        packing: "Embalagem",
        released: "Libertada",
        hold: "Em espera",
        details: "Detalhes da encomenda",
        progress: "Avançar fase",
        flag: "Sinalizar problema",
        invoice: "Criar fatura",
        allocate: "Alocar stock",
        materials: "Controlo de materiais",
        lowStock: "Stock baixo",
        healthy: "Regular",
        reserved: "Reservado",
        activity: "Atividade do turno",
        machine: "Célula M-14 novamente ativa",
        shipment: "Envio 2084 preparado",
        payment: "Fatura 8841 reconciliada",
        qualityEvent: "Controlo de qualidade concluído",
        forecast: "Previsão de caixa",
        thirtyDays: "30 dias",
        ninetyDays: "90 dias",
        advanceNotice: "Encomenda avançada para a fase simulada seguinte.",
        flagNotice: "Problema sinalizado na fila operacional local.",
        invoiceNotice: "Rascunho da fatura preparado em memória.",
        allocateNotice: "Stock disponível alocado à encomenda.",
        newNotice: "Nova encomenda provisória aberta.",
        filterNotice: "Filtro do fluxo atualizado.",
        sectionNotice: "Módulo operacional alterado.",
        privacy: "ERP SIMULADO · SEM SISTEMAS REAIS",
      },
    },
  ),
};

function e(value: string): string {
  return escapeFlagshipMarkup(value);
}

export function buildStudioLedgerHtml(locale: Locale = "en"): string {
  const ui = COPY["studio-ledger"][locale] ?? COPY["studio-ledger"].en;
  const t = (key: string) => e(ui[key] ?? "");

  return flagshipDocument({
    id: "studio-ledger",
    locale,
    title: ui.title,
    themeColor: "#251e1a",
    css: `
:root{color-scheme:light;--ink:#251e1a;--paper:#f4efe6;--cream:#fbf8f1;--rust:#a94f36;--olive:#5e674d;--line:#d8cdbc;--muted:#81766d;--gold:#d6a44c;--white:#fffdfa}
body{min-height:100vh;background:var(--paper);color:var(--ink);font-family:Inter,Avenir,"Helvetica Neue",Arial,sans-serif}
button,input{color:inherit}.ledger-shell{min-height:100vh;display:grid;grid-template-columns:230px minmax(0,1fr);background:linear-gradient(90deg,var(--ink) 0 230px,var(--paper) 230px)}
.side{position:relative;min-height:100vh;padding:28px 18px 20px;color:var(--paper);border-right:1px solid #3d332d;overflow:hidden}.side::after{content:"";position:absolute;left:22px;right:22px;bottom:78px;height:160px;border:1px solid rgb(244 239 230/.11);border-radius:50%;transform:rotate(-18deg);box-shadow:0 0 0 24px rgb(244 239 230/.025),0 0 0 48px rgb(244 239 230/.018);pointer-events:none}
.monogram{width:46px;height:46px;display:grid;place-items:center;border:1px solid rgb(255 255 255/.35);border-radius:50%;font:700 19px/1 Georgia,serif;color:#f0c778}.brand{margin:15px 0 2px;font:600 16px/1.1 Georgia,serif;letter-spacing:.08em}.side-kicker{margin:0;color:#b9aca1;font:600 8px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em}
.nav{display:grid;gap:6px;margin-top:50px}.nav-button{display:flex;align-items:center;gap:11px;width:100%;min-height:44px;padding:0 12px;border:1px solid transparent;border-radius:8px;background:transparent;color:#cbbfb5;text-align:left;font-size:12px}.nav-button::before{content:"";width:7px;height:7px;border:1px solid currentColor;border-radius:50%}.nav-button[aria-pressed="true"]{background:#372d27;border-color:#59473c;color:#fff8ec}.nav-button[aria-pressed="true"]::before{background:var(--gold);border-color:var(--gold)}
.privacy{position:absolute;z-index:1;left:18px;right:18px;bottom:22px;margin:0;padding-top:13px;border-top:1px solid #4a3e37;color:#9f9188;font:600 7px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.11em}
.workspace{min-width:0;padding:26px clamp(18px,3vw,42px) 34px}.topbar{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}.hello{margin:0;color:var(--rust);font:700 9px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase}.headline{margin:5px 0 0;font:500 clamp(27px,3vw,42px)/1.04 Georgia,"Times New Roman",serif;letter-spacing:-.035em}.tools{display:flex;align-items:center;gap:8px}.search{width:min(290px,34vw);height:42px;border:1px solid var(--line);border-radius:22px;background:var(--cream);padding:0 17px;font-size:11px;outline:none}.search:focus{border-color:var(--rust);box-shadow:0 0 0 3px rgb(169 79 54/.1)}.round-action{min-height:42px;padding:0 16px;border:0;border-radius:22px;background:var(--rust);color:white;font-size:10px;font-weight:750;letter-spacing:.03em}
.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:28px;border:1px solid var(--line);background:var(--cream)}.metric{position:relative;min-height:112px;padding:18px;border-right:1px solid var(--line)}.metric:last-child{border-right:0}.metric-label{display:block;color:var(--muted);font:700 8px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase}.metric strong{display:block;margin-top:16px;font:500 28px/1 Georgia,serif}.metric small{display:block;margin-top:8px;color:var(--olive);font-size:9px}.metric-marker{position:absolute;right:14px;top:15px;width:8px;height:8px;border-radius:50%;background:var(--gold);box-shadow:0 0 0 5px rgb(214 164 76/.16)}
.content-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(250px,.75fr);gap:18px;margin-top:18px}.card{border:1px solid var(--line);background:var(--cream)}.card-head{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:62px;padding:0 18px;border-bottom:1px solid var(--line)}.card-title{margin:0;font:500 18px/1.2 Georgia,serif}.card-action{border:0;background:transparent;color:var(--rust);padding:8px;font-size:9px;font-weight:700}.agenda-list{display:grid}.agenda-row{display:grid;grid-template-columns:74px 11px minmax(130px,1fr) auto;align-items:center;gap:13px;min-height:72px;padding:10px 17px;border-bottom:1px solid #e2d9cb}.agenda-row:last-child{border-bottom:0}.agenda-time{color:var(--muted);font:650 8px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase}.status-dot{width:8px;height:8px;border-radius:50%;background:var(--rust)}.agenda-row.done{opacity:.55}.agenda-row.done .task{text-decoration:line-through}.task{margin:0;font-size:12px;font-weight:650}.client{margin:4px 0 0;color:var(--muted);font-size:9px}.task-button{min-width:74px;min-height:32px;border:1px solid var(--line);border-radius:17px;background:transparent;color:var(--rust);font-size:8px;font-weight:750}.task-button:hover{background:white}
.portfolio{padding:18px}.portfolio-ring{width:154px;aspect-ratio:1;margin:4px auto 18px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--olive) 0 72%,var(--gold) 72% 91%,#d8cdbc 91%);position:relative}.portfolio-ring::after{content:"";position:absolute;inset:17px;border-radius:50%;background:var(--cream)}.portfolio-ring span{position:relative;z-index:1;text-align:center}.portfolio-ring strong{display:block;font:500 31px Georgia,serif}.portfolio-ring small{color:var(--muted);font-size:8px}.legend{display:grid;gap:11px}.legend-row{display:grid;grid-template-columns:9px 1fr auto;align-items:center;gap:9px;font-size:9px}.legend-row i{width:8px;height:8px;border-radius:50%;background:var(--olive)}.legend-row:nth-child(2) i{background:var(--gold)}.legend-row:nth-child(3) i{background:#d8cdbc}.legend-row b{font-size:11px}
.lower-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.8fr);gap:18px;margin-top:18px}.docs{display:grid}.doc-row{display:grid;grid-template-columns:35px minmax(0,1fr) auto;gap:12px;align-items:center;min-height:59px;padding:9px 16px;border-bottom:1px solid #e2d9cb}.doc-row:last-child{border-bottom:0}.file{width:32px;height:38px;display:grid;place-items:center;background:#ede5d8;border:1px solid var(--line);color:var(--rust);font:700 7px ui-monospace,SFMono-Regular,Menlo,monospace}.doc-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px;font-weight:650}.doc-owner{margin-top:4px;color:var(--muted);font-size:8px}.tag{padding:5px 8px;border-radius:12px;background:#e5eadf;color:var(--olive);font-size:7px;font-weight:700}.tag.wait{background:#f1e4dc;color:var(--rust)}
.cash-body{padding:16px 18px}.cash-line{display:flex;justify-content:space-between;align-items:end;margin:5px 0 12px}.cash-line strong{font:500 25px Georgia,serif}.cash-line span{font-size:8px;color:var(--muted)}.bars{height:92px;display:flex;align-items:end;gap:8px;border-bottom:1px solid var(--line)}.bar{flex:1;min-width:8px;background:var(--rust);opacity:.72;border-radius:3px 3px 0 0}.bar:nth-child(2n){background:var(--gold)}.bar:nth-child(3n){background:var(--olive)}.cash-legend{display:flex;gap:14px;margin-top:12px;color:var(--muted);font-size:7px}.notice{position:fixed;z-index:10;right:24px;bottom:22px;max-width:330px;margin:0;padding:13px 16px;border-left:3px solid var(--gold);background:var(--ink);color:var(--paper);font-size:10px;line-height:1.45;box-shadow:0 12px 30px rgb(37 30 26/.25);transition:opacity .2s,transform .2s}.notice.is-hidden{opacity:0;transform:translateY(10px);pointer-events:none}
@media(max-width:1040px){.ledger-shell{grid-template-columns:78px minmax(0,1fr);background:linear-gradient(90deg,var(--ink) 0 78px,var(--paper) 78px)}.side{padding:22px 13px}.brand,.side-kicker,.nav-button span,.privacy{display:none}.nav{margin-top:38px}.nav-button{justify-content:center;padding:0}.nav-button::before{width:10px;height:10px}.monogram{width:44px;height:44px}.summary{grid-template-columns:repeat(2,1fr)}.metric:nth-child(2){border-right:0}.metric:nth-child(-n+2){border-bottom:1px solid var(--line)}}
@media(max-width:760px){.ledger-shell{display:block;background:var(--paper)}.side{min-height:74px;padding:12px 14px;display:flex;align-items:center;border:0;background:var(--ink)}.monogram{width:40px;height:40px}.nav{margin:0 0 0 auto;display:flex}.nav-button{width:44px;min-height:44px}.workspace{padding:18px 14px 28px}.topbar{display:block}.tools{margin-top:16px}.search{width:100%;flex:1}.content-grid,.lower-grid{grid-template-columns:1fr}.portfolio{display:grid;grid-template-columns:150px 1fr;align-items:center}.portfolio-ring{margin:0}.notice{left:14px;right:14px;bottom:14px;max-width:none}}
@media(max-width:490px){.headline{font-size:29px}.tools{display:grid;grid-template-columns:1fr}.search{width:100%}.summary{grid-template-columns:1fr 1fr}.metric{min-height:101px;padding:14px}.metric strong{font-size:24px}.agenda-row{grid-template-columns:58px 8px 1fr}.task-button{grid-column:3;justify-self:start}.portfolio{grid-template-columns:1fr}.portfolio-ring{margin:0 auto 16px}.doc-row{grid-template-columns:32px minmax(0,1fr)}.tag{grid-column:2;justify-self:start}.nav-button:nth-child(n+4){display:none}}
`,
    body: `
<div class="ledger-shell">
  <aside class="side">
    <div class="monogram" aria-hidden="true">SL</div>
    <p class="brand">${t("brand")}</p><p class="side-kicker">${t("eyebrow")}</p>
    <nav class="nav" aria-label="${t("dashboard")}">
      <button class="nav-button" type="button" data-action="nav-dashboard" data-view="dashboard" aria-label="${t("dashboard")}" aria-pressed="true"><span>${t("dashboard")}</span></button>
      <button class="nav-button" type="button" data-action="nav-clients" data-view="clients" aria-label="${t("clients")}" aria-pressed="false"><span>${t("clients")}</span></button>
      <button class="nav-button" type="button" data-action="nav-deadlines" data-view="deadlines" aria-label="${t("deadlines")}" aria-pressed="false"><span>${t("deadlines")}</span></button>
      <button class="nav-button" type="button" data-action="nav-documents" data-view="documents" aria-label="${t("documents")}" aria-pressed="false"><span>${t("documents")}</span></button>
      <button class="nav-button" type="button" data-action="nav-billing" data-view="billing" aria-label="${t("billing")}" aria-pressed="false"><span>${t("billing")}</span></button>
    </nav>
    <p class="privacy">${t("privacy")}</p>
  </aside>
  <main class="workspace">
    <header class="topbar">
      <div><p class="hello">${t("greeting")}</p><h1 class="headline">${t("today")}</h1></div>
      <div class="tools"><input class="search" id="ledger-search" data-action="search-client" type="search" placeholder="${t("search")}" aria-label="${t("search")}"><button class="round-action" type="button" data-action="new-client">+ ${t("newClient")}</button></div>
    </header>
    <section class="summary" aria-label="${t("workload")}">
      <article class="metric"><span class="metric-marker"></span><span class="metric-label">${t("dueNow")}</span><strong id="due-count">07</strong><small>− 2 ${t("thisWeek").toLowerCase()}</small></article>
      <article class="metric"><span class="metric-label">${t("completed")}</span><strong id="done-count">18</strong><small>+ 12% ${t("thisMonth").toLowerCase()}</small></article>
      <article class="metric"><span class="metric-label">${t("collected")}</span><strong>€ 42.8k</strong><small>84% ${t("billing").toLowerCase()}</small></article>
      <article class="metric"><span class="metric-label">${t("workload")}</span><strong>76%</strong><small>5 ${t("clients").toLowerCase()} ${t("attention").toLowerCase()}</small></article>
    </section>
    <section class="content-grid">
      <article class="card">
        <header class="card-head"><h2 class="card-title">${t("agenda")}</h2><button class="card-action" type="button" data-action="add-deadline">+ ${t("addDeadline")}</button></header>
        <div class="agenda-list" id="agenda-list">
          <div class="agenda-row" data-task="vat"><span class="agenda-time">${t("dueToday")}</span><i class="status-dot"></i><div><p class="task">${t("vat")}</p><p class="client">Aurora Design S.r.l. · Giulia</p></div><button class="task-button" type="button" data-action="toggle-vat">${t("markDone")}</button></div>
          <div class="agenda-row" data-task="payroll"><span class="agenda-time">${t("dueTomorrow")}</span><i class="status-dot"></i><div><p class="task">${t("payroll")}</p><p class="client">Officine Verdi S.p.A. · Luca</p></div><button class="task-button" type="button" data-action="toggle-payroll">${t("markDone")}</button></div>
          <div class="agenda-row" data-task="filing"><span class="agenda-time">${t("dueFriday")}</span><i class="status-dot"></i><div><p class="task">${t("filing")}</p><p class="client">Studio Habita · Marta</p></div><button class="task-button" type="button" data-action="toggle-filing">${t("markDone")}</button></div>
          <div class="agenda-row" data-task="review"><span class="agenda-time">${t("dueMonday")}</span><i class="status-dot"></i><div><p class="task">${t("review")}</p><p class="client">Nordica Labs · Elena</p></div><button class="task-button" type="button" data-action="toggle-review">${t("markDone")}</button></div>
        </div>
      </article>
      <article class="card">
        <header class="card-head"><h2 class="card-title">${t("clientHealth")}</h2><button class="card-action" type="button" data-action="send-reminder">${t("reminder")}</button></header>
        <div class="portfolio"><div class="portfolio-ring"><span><strong>128</strong><small>${t("clients")}</small></span></div><div class="legend"><div class="legend-row"><i></i><span>${t("active")}</span><b>92</b></div><div class="legend-row"><i></i><span>${t("attention")}</span><b>24</b></div><div class="legend-row"><i></i><span>${t("waiting")}</span><b>12</b></div></div></div>
      </article>
    </section>
    <section class="lower-grid">
      <article class="card"><header class="card-head"><h2 class="card-title">${t("recentDocs")}</h2><button class="card-action" type="button" data-action="review-docs">${t("viewAll")}</button></header><div class="docs">
        <div class="doc-row"><span class="file">PDF</span><div><div class="doc-name">${t("doc1")}</div><div class="doc-owner">Aurora Design · 14:32</div></div><span class="tag">${t("reviewed")}</span></div>
        <div class="doc-row"><span class="file">XLS</span><div><div class="doc-name">${t("doc2")}</div><div class="doc-owner">Nordica Labs · 12:08</div></div><span class="tag wait">${t("toReview")}</span></div>
        <div class="doc-row"><span class="file">DOC</span><div><div class="doc-name">${t("doc3")}</div><div class="doc-owner">Studio Habita · 09:41</div></div><span class="tag">${t("reviewed")}</span></div>
      </div></article>
      <article class="card"><header class="card-head"><h2 class="card-title">${t("cash")}</h2><button class="card-action" type="button" data-action="toggle-period">${t("thisMonth")}</button></header><div class="cash-body"><div class="cash-line"><strong>€ 51.2k</strong><span>+ 8.4%</span></div><div class="bars" aria-hidden="true"><i class="bar" style="height:36%"></i><i class="bar" style="height:58%"></i><i class="bar" style="height:47%"></i><i class="bar" style="height:78%"></i><i class="bar" style="height:62%"></i><i class="bar" style="height:91%"></i><i class="bar" style="height:74%"></i></div><div class="cash-legend"><span>${t("issued")} 51</span><span>${t("paid")} 43</span><span>${t("late")} 8</span></div></div></article>
    </section>
  </main>
</div><p class="notice is-hidden" id="ledger-notice" role="status" aria-live="polite"></p>
`,
    script: `
const DATA=${flagshipScriptData({ ui })};
const state={view:"dashboard",period:"month",done:new Set()};
const notice=document.getElementById("ledger-notice");let noticeTimer=0;
function announce(message){window.clearTimeout(noticeTimer);notice.textContent=message;notice.classList.remove("is-hidden");noticeTimer=window.setTimeout(function(){notice.classList.add("is-hidden");},2400);}
function setView(view){state.view=view;document.querySelectorAll(".nav-button").forEach(function(button){button.setAttribute("aria-pressed",String(button.getAttribute("data-view")===view));});announce(DATA.ui.sectionNotice+" · "+view);}
function toggleTask(name,button){const row=document.querySelector('[data-task="'+name+'"]');if(state.done.has(name)){state.done.delete(name);row.classList.remove("done");button.textContent=DATA.ui.markDone;}else{state.done.add(name);row.classList.add("done");button.textContent=DATA.ui.reopen;}document.getElementById("done-count").textContent=String(18+state.done.size).padStart(2,"0");document.getElementById("due-count").textContent=String(7-state.done.size).padStart(2,"0");announce(DATA.ui.doneNotice);}
function handle(button){const action=button.getAttribute("data-action")||"";if(action.indexOf("nav-")===0){setView(button.getAttribute("data-view")||"dashboard");return;}if(action.indexOf("toggle-")===0&&action!=="toggle-period"){toggleTask(action.slice(7),button);return;}if(action==="new-client"){announce(DATA.ui.clientAdded);return;}if(action==="add-deadline"){announce(DATA.ui.noteAdded);return;}if(action==="send-reminder"){announce(DATA.ui.reminderSent);return;}if(action==="review-docs"){setView("documents");return;}if(action==="toggle-period"){state.period=state.period==="month"?"week":"month";button.textContent=state.period==="month"?DATA.ui.thisMonth:DATA.ui.thisWeek;announce(DATA.ui.sectionNotice+" · "+button.textContent);}}
document.querySelectorAll("[data-action]").forEach(function(control){if(control.tagName!=="INPUT"){control.addEventListener("click",function(){handle(control);});}});
document.getElementById("ledger-search").addEventListener("input",function(event){const value=event.target.value.trim();document.querySelectorAll(".agenda-row,.doc-row").forEach(function(row,index){row.hidden=value.length>1&&index>1;});if(value.length>1){announce(DATA.ui.searchNotice+" · "+value);}});
`,
  });
}

export function buildPulseBookingHtml(locale: Locale = "en"): string {
  const ui = COPY["pulse-booking"][locale] ?? COPY["pulse-booking"].en;
  const t = (key: string) => e(ui[key] ?? "");

  const event = (
    id: string,
    team: string,
    className: string,
    time: string,
    client: string,
    service: string,
    style: string,
  ) => `
    <button class="booking ${className}" type="button" data-action="open-${id}" data-booking="${e(id)}" data-team="${e(team)}" style="${e(style)}" aria-pressed="false">
      <span class="booking-time">${e(time)}</span><strong>${e(client)}</strong><small>${e(service)}</small><i aria-hidden="true"></i>
    </button>`;

  return flagshipDocument({
    id: "pulse-booking",
    locale,
    title: ui.title,
    themeColor: "#5d48e8",
    css: `
:root{color-scheme:light;--ink:#20213a;--muted:#797a93;--paper:#f7f8fc;--white:#fff;--violet:#6555e8;--violet-soft:#eeebff;--aqua:#c9f6eb;--aqua-ink:#176b59;--coral:#ff826e;--coral-soft:#fff0ec;--yellow:#ffe999;--line:#e5e6f0}
body{min-height:100vh;background:var(--paper);color:var(--ink);font-family:Inter,Avenir,"Helvetica Neue",Arial,sans-serif}.pulse-shell{min-height:100vh;display:grid;grid-template-columns:82px minmax(0,1fr);background:linear-gradient(150deg,#fafbff 0,#f3f5fb 65%,#eeeaff 100%)}button,input{color:inherit}
.rail{position:relative;display:flex;flex-direction:column;align-items:center;gap:18px;padding:18px 11px;background:#292846;color:white}.pulse-mark{width:48px;height:48px;display:grid;place-items:center;border-radius:16px;background:linear-gradient(145deg,#7a68ff,#4d3ed1);box-shadow:0 13px 32px rgb(39 27 145/.38)}.pulse-mark svg{width:29px;height:29px}.rail-nav{width:100%;display:grid;gap:9px;margin-top:12px}.rail-button{width:100%;aspect-ratio:1;border:0;border-radius:14px;background:transparent;color:#b9b7d0;display:grid;place-items:center;font-size:8px;font-weight:700;line-height:1.1;padding:7px 2px}.rail-button::before{content:"";width:14px;height:14px;margin-bottom:4px;border:1.5px solid currentColor;border-radius:5px}.rail-button[aria-pressed="true"]{background:#3d3a5b;color:white}.rail-button[aria-pressed="true"]::before{background:var(--yellow);border-color:var(--yellow);box-shadow:inset 0 0 0 4px #3d3a5b}.avatar{margin-top:auto;width:39px;height:39px;border-radius:50%;display:grid;place-items:center;background:var(--aqua);color:var(--aqua-ink);font-size:10px;font-weight:800;border:3px solid #454268}
.main{min-width:0;padding:18px clamp(15px,2.6vw,34px) 28px}.mast{display:grid;grid-template-columns:minmax(220px,1fr) auto;align-items:center;gap:24px}.eyebrow{margin:0;color:var(--violet);font:800 8px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em}.brand{margin:4px 0 0;font-size:25px;letter-spacing:-.04em}.mast-actions{display:flex;align-items:center;gap:9px}.search{width:min(280px,29vw);height:42px;border:1px solid var(--line);border-radius:14px;background:white;padding:0 15px;outline:none;font-size:10px}.search:focus{border-color:var(--violet);box-shadow:0 0 0 3px rgb(101 85 232/.1)}.new{height:42px;padding:0 17px;border:0;border-radius:14px;background:var(--violet);color:white;font-size:10px;font-weight:750;box-shadow:0 10px 24px rgb(101 85 232/.2)}
.datebar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:23px}.date-control{display:flex;align-items:center;gap:8px}.circle{width:38px;height:38px;border:1px solid var(--line);border-radius:50%;background:white;font-size:17px}.today{height:38px;border:1px solid var(--line);border-radius:19px;background:white;padding:0 14px;font-size:9px;font-weight:700}.week{min-width:164px;text-align:center;font-size:13px;font-weight:750}.team-filter{display:flex;align-items:center;gap:6px;padding:4px;background:white;border:1px solid var(--line);border-radius:16px}.team{min-height:32px;border:0;border-radius:11px;background:transparent;padding:0 11px;font-size:8px;font-weight:700;color:var(--muted)}.team[aria-pressed="true"]{background:var(--violet-soft);color:var(--violet)}
.schedule-layout{display:grid;grid-template-columns:minmax(0,1fr) 278px;gap:15px;margin-top:15px}.calendar-card{min-width:0;overflow:hidden;border:1px solid var(--line);border-radius:20px;background:white;box-shadow:0 18px 50px rgb(65 65 95/.07)}.days{display:grid;grid-template-columns:48px repeat(6,minmax(100px,1fr));min-width:700px;border-bottom:1px solid var(--line)}.day{min-height:57px;display:grid;place-items:center;border-left:1px solid var(--line);color:var(--muted);font:750 8px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.05em}.day.is-today{position:relative;color:var(--violet)}.day.is-today::after{content:"";position:absolute;bottom:8px;width:21px;height:3px;border-radius:2px;background:var(--violet)}.calendar-scroll{overflow:auto}.calendar{position:relative;min-width:700px;height:570px;background:repeating-linear-gradient(to bottom,transparent 0 56px,var(--line) 56px 57px),linear-gradient(to right,transparent 47px,var(--line) 47px 48px,transparent 48px)}.calendar::after{content:"";position:absolute;z-index:0;left:48px;top:0;bottom:0;width:calc(100% - 48px);background:repeating-linear-gradient(to right,transparent 0 calc((100% / 6) - 1px),var(--line) calc((100% / 6) - 1px) calc(100% / 6));pointer-events:none}.hour{position:absolute;z-index:1;left:8px;width:34px;color:#a0a1b3;font:650 7px ui-monospace,SFMono-Regular,Menlo,monospace}.now-line{position:absolute;z-index:3;left:48px;right:0;top:239px;height:1px;background:var(--coral)}.now-line::before{content:"";position:absolute;left:-3px;top:-3px;width:7px;height:7px;border-radius:50%;background:var(--coral)}
.booking{position:absolute;z-index:2;width:calc((100% - 48px)/6 - 10px);min-width:90px;min-height:63px;padding:9px 9px 8px;border:0;border-left:3px solid var(--violet);border-radius:10px;background:var(--violet-soft);text-align:left;overflow:hidden;transition:transform .18s,box-shadow .18s}.booking:hover,.booking[aria-pressed="true"]{transform:translateY(-2px);box-shadow:0 8px 18px rgb(64 50 172/.15)}.booking[aria-pressed="true"]{outline:2px solid var(--violet);outline-offset:1px}.booking strong{display:block;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:9px}.booking small{display:block;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#77739b;font-size:7px}.booking-time{display:block;color:var(--violet);font:700 7px ui-monospace,SFMono-Regular,Menlo,monospace}.booking i{position:absolute;right:7px;top:8px;width:6px;height:6px;border-radius:50%;background:var(--violet)}.booking.aqua{border-color:#2fb99b;background:#e3faf5}.booking.aqua .booking-time,.booking.aqua small{color:var(--aqua-ink)}.booking.aqua i{background:#2fb99b}.booking.coral{border-color:var(--coral);background:var(--coral-soft)}.booking.coral .booking-time,.booking.coral small{color:#a84535}.booking.coral i{background:var(--coral)}.booking.yellow{border-color:#e3b91c;background:#fff8d9}.booking.yellow .booking-time,.booking.yellow small{color:#856b0a}.booking.yellow i{background:#e3b91c}.booking.is-cancelled{opacity:.25;text-decoration:line-through}.booking.is-new{animation:arrival .45s ease both}@keyframes arrival{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:none}}
.detail{align-self:start;overflow:hidden;border:1px solid var(--line);border-radius:20px;background:white;box-shadow:0 18px 50px rgb(65 65 95/.07)}.detail-top{padding:18px;border-bottom:1px solid var(--line);background:linear-gradient(145deg,#f3f0ff,#fff)}.detail-kicker{margin:0;color:var(--violet);font:800 7px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em}.detail-title{margin:8px 0 4px;font-size:18px;letter-spacing:-.03em}.status{display:inline-flex;margin-top:9px;padding:6px 9px;border-radius:11px;background:var(--aqua);color:var(--aqua-ink);font-size:7px;font-weight:800;text-transform:uppercase}.detail-body{padding:5px 18px 15px}.detail-row{display:grid;grid-template-columns:76px 1fr;gap:10px;padding:11px 0;border-bottom:1px solid var(--line)}.detail-row span{color:var(--muted);font-size:8px}.detail-row strong{font-size:9px;text-align:right}.note{margin:14px 0 0;padding:12px;border-radius:12px;background:var(--paper);color:var(--muted);font-size:8px;line-height:1.5}.actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:0 18px 18px}.detail-action{min-height:38px;border:1px solid var(--line);border-radius:11px;background:white;font-size:8px;font-weight:750}.detail-action.primary{background:var(--violet);border-color:var(--violet);color:white}.detail-action.danger{color:#b34838}.insights{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:0 18px 18px}.insight{min-height:70px;padding:10px;border-radius:12px;background:var(--paper)}.insight span{display:block;color:var(--muted);font-size:7px}.insight strong{display:block;margin-top:9px;font-size:17px}.privacy{margin:0;padding:12px 18px;border-top:1px solid var(--line);color:#999aac;font:700 7px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em}.toast{position:fixed;z-index:10;left:50%;bottom:20px;transform:translate(-50%,0);max-width:min(420px,calc(100vw - 28px));padding:12px 17px;border-radius:14px;background:#292846;color:white;font-size:9px;box-shadow:0 16px 40px rgb(41 40 70/.28);transition:opacity .2s,transform .2s}.toast.is-hidden{opacity:0;transform:translate(-50%,10px);pointer-events:none}
@media(max-width:1050px){.schedule-layout{grid-template-columns:minmax(0,1fr)}.detail{display:grid;grid-template-columns:220px 1fr}.detail-top{border-right:1px solid var(--line);border-bottom:0}.detail-body{padding-top:4px}.actions{align-content:center}.insights{grid-column:2}.privacy{grid-column:1/-1}.calendar{height:510px}}
@media(max-width:760px){.pulse-shell{display:block}.rail{height:70px;padding:10px 13px;flex-direction:row}.pulse-mark{width:43px;height:43px;border-radius:13px}.rail-nav{display:flex;margin:0 0 0 auto;width:auto}.rail-button{width:44px;min-height:44px;aspect-ratio:1}.rail-button span{display:none}.avatar{margin:0}.main{padding:16px 12px 25px}.mast{grid-template-columns:1fr}.mast-actions{display:grid;grid-template-columns:1fr auto}.search{width:100%}.datebar{align-items:flex-start;flex-direction:column}.date-control{width:100%}.week{flex:1}.team-filter{width:100%;overflow:auto}.team{white-space:nowrap;flex:1}.detail{display:block}.insights{grid-column:auto}.calendar{height:480px}}
@media(max-width:470px){.brand{font-size:22px}.rail-button:nth-child(n+4){display:none}.date-control .today{display:none}.booking{min-height:58px;padding:7px}.detail-row{grid-template-columns:64px 1fr}.insights{grid-template-columns:1fr 1fr}.calendar{height:440px}}
`,
    body: `
<div class="pulse-shell">
  <aside class="rail">
    <div class="pulse-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M4 17h6l3-8 5 15 3-7h7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <nav class="rail-nav" aria-label="${t("agenda")}"><button class="rail-button" type="button" data-action="view-agenda" data-view="agenda" aria-label="${t("agenda")}" aria-pressed="true"><span>${t("agenda")}</span></button><button class="rail-button" type="button" data-action="view-patients" data-view="patients" aria-label="${t("patients")}" aria-pressed="false"><span>${t("patients")}</span></button><button class="rail-button" type="button" data-action="view-rooms" data-view="rooms" aria-label="${t("rooms")}" aria-pressed="false"><span>${t("rooms")}</span></button><button class="rail-button" type="button" data-action="view-insights" data-view="insights" aria-label="${t("insights")}" aria-pressed="false"><span>${t("insights")}</span></button></nav>
    <div class="avatar" aria-label="${t("aria")}">AR</div>
  </aside>
  <main class="main">
    <header class="mast"><div><p class="eyebrow">${t("eyebrow")}</p><h1 class="brand">${t("greeting")}</h1></div><div class="mast-actions"><input class="search" id="booking-search" data-action="search-booking" type="search" placeholder="${t("search")}" aria-label="${t("search")}"><button class="new" type="button" data-action="new-booking">+ ${t("newBooking")}</button></div></header>
    <section class="datebar"><div class="date-control"><button class="circle" type="button" data-action="previous-week" aria-label="${t("previous")}">‹</button><button class="today" type="button" data-action="today">${t("today")}</button><strong class="week" id="week-label">${t("week")}</strong><button class="circle" type="button" data-action="next-week" aria-label="${t("next")}">›</button></div><div class="team-filter"><button class="team" type="button" data-action="team-all" data-team="all" aria-pressed="true">${t("allTeam")}</button><button class="team" type="button" data-action="team-aria" data-team="aria" aria-pressed="false">${t("aria")}</button><button class="team" type="button" data-action="team-teo" data-team="teo" aria-pressed="false">${t("teo")}</button><button class="team" type="button" data-action="team-mina" data-team="mina" aria-pressed="false">${t("mina")}</button></div></section>
    <section class="schedule-layout">
      <article class="calendar-card"><div class="days"><span></span><span class="day">${t("mon")}</span><span class="day is-today">${t("tue")}</span><span class="day">${t("wed")}</span><span class="day">${t("thu")}</span><span class="day">${t("fri")}</span><span class="day">${t("sat")}</span></div><div class="calendar-scroll"><div class="calendar" id="calendar">
        <span class="hour" style="top:8px">08:00</span><span class="hour" style="top:121px">10:00</span><span class="hour" style="top:235px">12:00</span><span class="hour" style="top:349px">14:00</span><span class="hour" style="top:463px">16:00</span><span class="now-line"></span>
        ${event("sofia", "aria", "aqua", "08:30 · 45 min", "Sofia Leone", ui.checkup, "left:calc(48px + ((100% - 48px)/6)*0 + 5px);top:29px")}
        ${event("marco", "teo", "yellow", "09:15 · 60 min", "Marco Rosi", ui.therapy, "left:calc(48px + ((100% - 48px)/6)*1 + 5px);top:72px")}
        ${event("emma", "mina", "coral", "10:30 · 30 min", "Emma Neri", ui.followup, "left:calc(48px + ((100% - 48px)/6)*2 + 5px);top:144px")}
        ${event("luca", "aria", "", "11:15 · 50 min", "Luca Sala", ui.firstVisit, "left:calc(48px + ((100% - 48px)/6)*1 + 5px);top:194px")}
        ${event("anna", "teo", "aqua", "13:30 · 45 min", "Anna Mori", ui.review, "left:calc(48px + ((100% - 48px)/6)*3 + 5px);top:313px")}
        ${event("noa", "mina", "yellow", "15:00 · 60 min", "Noa Greco", ui.therapy, "left:calc(48px + ((100% - 48px)/6)*4 + 5px);top:398px")}
        ${event("milo", "aria", "coral", "16:10 · 30 min", "Milo Fonti", ui.followup, "left:calc(48px + ((100% - 48px)/6)*0 + 5px);top:472px")}
        <button class="booking aqua is-new" id="new-slot" type="button" data-action="open-new" data-booking="new" data-team="teo" style="left:calc(48px + ((100% - 48px)/6)*5 + 5px);top:254px" aria-pressed="false" hidden><span class="booking-time">12:20 · 30 min</span><strong>Elia Serra</strong><small>${t("checkup")}</small><i></i></button>
      </div></div></article>
      <aside class="detail"><div class="detail-top"><p class="detail-kicker">${t("bookingDetails")}</p><h2 class="detail-title" id="detail-client">Sofia Leone</h2><span class="status" id="detail-status">${t("confirmed")}</span></div><div class="detail-body"><div class="detail-row"><span>${t("service")}</span><strong id="detail-service">${t("checkup")}</strong></div><div class="detail-row"><span>${t("practitioner")}</span><strong id="detail-practitioner">${t("aria")}</strong></div><div class="detail-row"><span>${t("room")}</span><strong>Studio 02</strong></div><div class="detail-row"><span>${t("week")}</span><strong id="detail-time">08:30 · 45 min</strong></div><p class="note"><b>${t("notes")}.</b> ${t("noteText")}</p></div><div class="actions"><button class="detail-action primary" type="button" data-action="confirm-booking">${t("confirm")}</button><button class="detail-action" type="button" data-action="reschedule-booking">${t("reschedule")}</button><button class="detail-action danger" type="button" data-action="cancel-booking">${t("cancel")}</button><button class="detail-action" type="button" data-action="send-booking-reminder">${t("reminder")}</button></div><div class="insights"><div class="insight"><span>${t("occupancy")}</span><strong>84%</strong></div><div class="insight"><span>${t("freeSlots")}</span><strong>12</strong></div><div class="insight"><span>${t("waitingList")}</span><strong>05</strong></div><div class="insight"><span>${t("utilization")}</span><strong>+9%</strong></div></div><p class="privacy">${t("privacy")}</p></aside>
    </section>
  </main>
</div><p class="toast is-hidden" id="booking-toast" role="status" aria-live="polite"></p>
`,
    script: `
const DATA=${flagshipScriptData({ ui })};
const bookings={sofia:{client:"Sofia Leone",service:DATA.ui.checkup,practitioner:DATA.ui.aria,time:"08:30 · 45 min"},marco:{client:"Marco Rosi",service:DATA.ui.therapy,practitioner:DATA.ui.teo,time:"09:15 · 60 min"},emma:{client:"Emma Neri",service:DATA.ui.followup,practitioner:DATA.ui.mina,time:"10:30 · 30 min"},luca:{client:"Luca Sala",service:DATA.ui.firstVisit,practitioner:DATA.ui.aria,time:"11:15 · 50 min"},anna:{client:"Anna Mori",service:DATA.ui.review,practitioner:DATA.ui.teo,time:"13:30 · 45 min"},noa:{client:"Noa Greco",service:DATA.ui.therapy,practitioner:DATA.ui.mina,time:"15:00 · 60 min"},milo:{client:"Milo Fonti",service:DATA.ui.followup,practitioner:DATA.ui.aria,time:"16:10 · 30 min"},new:{client:"Elia Serra",service:DATA.ui.checkup,practitioner:DATA.ui.teo,time:"12:20 · 30 min"}};
const state={selected:"sofia",team:"all",week:0};const toast=document.getElementById("booking-toast");let timer=0;
function announce(message){window.clearTimeout(timer);toast.textContent=message;toast.classList.remove("is-hidden");timer=window.setTimeout(function(){toast.classList.add("is-hidden");},2200);}
function selectBooking(id){const item=bookings[id]||bookings.sofia;state.selected=id;document.getElementById("detail-client").textContent=item.client;document.getElementById("detail-service").textContent=item.service;document.getElementById("detail-practitioner").textContent=item.practitioner;document.getElementById("detail-time").textContent=item.time;document.querySelectorAll(".booking").forEach(function(button){button.setAttribute("aria-pressed",String(button.getAttribute("data-booking")===id));});}
function filterTeam(team){state.team=team;document.querySelectorAll(".team").forEach(function(button){button.setAttribute("aria-pressed",String(button.getAttribute("data-team")===team));});document.querySelectorAll(".booking").forEach(function(button){button.hidden=team!=="all"&&button.getAttribute("data-team")!==team;});announce(DATA.ui.teamNotice);}
function moveWeek(amount){state.week+=amount;document.getElementById("week-label").textContent=state.week===0?DATA.ui.week:(state.week>0?"+ ":"− ")+Math.abs(state.week)+" · "+DATA.ui.week;announce(DATA.ui.dateNotice);}
function setStatus(label){document.getElementById("detail-status").textContent=label;}
function handle(control){const action=control.getAttribute("data-action")||"";if(action.indexOf("view-")===0){document.querySelectorAll(".rail-button").forEach(function(button){button.setAttribute("aria-pressed",String(button===control));});announce(DATA.ui.agenda+" · "+control.textContent);return;}if(action.indexOf("team-")===0){filterTeam(control.getAttribute("data-team")||"all");return;}if(action.indexOf("open-")===0){selectBooking(control.getAttribute("data-booking")||"sofia");return;}if(action==="previous-week"){moveWeek(-1);return;}if(action==="next-week"){moveWeek(1);return;}if(action==="today"){state.week=0;moveWeek(0);return;}if(action==="new-booking"){const slot=document.getElementById("new-slot");slot.hidden=false;filterTeam("all");selectBooking("new");announce(DATA.ui.newNotice);return;}if(action==="confirm-booking"){setStatus(DATA.ui.confirmed);announce(DATA.ui.confirmNotice);return;}if(action==="reschedule-booking"){setStatus(DATA.ui.waiting);announce(DATA.ui.rescheduleNotice);return;}if(action==="cancel-booking"){const selected=document.querySelector('[data-booking="'+state.selected+'"]');if(selected){selected.classList.add("is-cancelled");}setStatus(DATA.ui.cancel);announce(DATA.ui.cancelNotice);return;}if(action==="send-booking-reminder"){announce(DATA.ui.reminderNotice);}}
document.querySelectorAll("[data-action]").forEach(function(control){if(control.tagName!=="INPUT"){control.addEventListener("click",function(){handle(control);});}});
document.getElementById("booking-search").addEventListener("input",function(event){const query=event.target.value.trim().toLowerCase();document.querySelectorAll(".booking").forEach(function(button){const match=!query||button.textContent.toLowerCase().indexOf(query)>=0;button.hidden=!match||(state.team!=="all"&&button.getAttribute("data-team")!==state.team);});});
selectBooking("sofia");
`,
  });
}

export function buildFoundryErpHtml(locale: Locale = "en"): string {
  const ui = COPY["foundry-erp"][locale] ?? COPY["foundry-erp"].en;
  const t = (key: string) => e(ui[key] ?? "");

  const orderRow = (
    number: string,
    customer: string,
    value: string,
    delivery: string,
    stage: string,
    status: string,
  ) => `
    <tr class="order-row" data-order-row="${e(number)}" data-status="${e(status)}">
      <td><button class="order-link" type="button" data-action="select-${e(number)}" data-order="${e(number)}" aria-pressed="false">#${e(number)}</button></td>
      <td><strong>${e(customer)}</strong><small>IT · B2B</small></td><td>${e(value)}</td><td>${e(delivery)}</td><td><span class="stage-tag ${e(status)}">${e(stage)}</span></td>
    </tr>`;

  return flagshipDocument({
    id: "foundry-erp",
    locale,
    title: ui.title,
    themeColor: "#111511",
    css: `
:root{color-scheme:dark;--black:#111511;--panel:#181d18;--panel-2:#202620;--line:#343c34;--text:#eef2e8;--muted:#909a8d;--acid:#c8ff4f;--amber:#ffb247;--red:#ff695d;--steel:#cbd5c6}
body{min-height:100vh;background:var(--black);color:var(--text);font-family:Inter,"Helvetica Neue",Arial,sans-serif}button,input{color:inherit}.erp{min-height:100vh;display:grid;grid-template-rows:64px minmax(0,1fr);background:radial-gradient(circle at 76% 0,rgb(200 255 79/.05),transparent 33%),var(--black)}
.mast{display:grid;grid-template-columns:218px minmax(0,1fr) auto;align-items:center;border-bottom:1px solid var(--line);background:#0d100d}.brand-lock{height:100%;display:flex;align-items:center;gap:12px;padding:0 17px;border-right:1px solid var(--line)}.forge-mark{width:34px;height:34px;position:relative;border:1px solid var(--acid);clip-path:polygon(18% 0,82% 0,100% 22%,100% 78%,82% 100%,18% 100%,0 78%,0 22%)}.forge-mark::before,.forge-mark::after{content:"";position:absolute;background:var(--acid)}.forge-mark::before{left:8px;right:8px;top:15px;height:2px}.forge-mark::after{top:8px;bottom:8px;left:15px;width:2px}.brand{font:800 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em}.eyebrow{margin:5px 0 0;color:var(--muted);font:650 7px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em}.global-search{height:38px;margin:0 18px;border:1px solid var(--line);background:#161a16;padding:0 14px;font:600 9px ui-monospace,SFMono-Regular,Menlo,monospace;outline:none}.global-search:focus{border-color:var(--acid);box-shadow:0 0 0 2px rgb(200 255 79/.09)}.shift{height:100%;display:flex;align-items:center;gap:9px;padding:0 18px;border-left:1px solid var(--line);color:var(--acid);font:750 8px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em}.shift::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--acid);box-shadow:0 0 13px var(--acid)}
.body{min-height:0;display:grid;grid-template-columns:218px minmax(0,1fr)}.side{position:relative;padding:16px 12px;border-right:1px solid var(--line);background:#121612}.module{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:45px;margin-bottom:5px;padding:0 12px;border:1px solid transparent;background:transparent;color:var(--muted);text-align:left;font:700 9px ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.06em}.module::after{content:"↗";opacity:0}.module[aria-pressed="true"]{border-color:#3d473a;background:var(--panel);color:var(--text)}.module[aria-pressed="true"]::after{opacity:1;color:var(--acid)}.side-rule{height:1px;margin:16px 4px;background:var(--line)}.side-label{margin:0 9px 9px;color:#687265;font:700 7px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em}.plant-card{margin:0 4px;padding:13px;border:1px solid var(--line);background:#171b17}.plant-card span{display:block;color:var(--muted);font-size:8px}.plant-card strong{display:block;margin-top:7px;font:700 12px ui-monospace,SFMono-Regular,Menlo,monospace}.capacity{height:5px;margin-top:13px;background:#303630}.capacity i{display:block;width:78%;height:100%;background:var(--acid)}.privacy{position:absolute;left:16px;right:16px;bottom:18px;margin:0;color:#697267;font:650 7px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.07em}
.workspace{min-width:0;padding:19px clamp(15px,2.2vw,29px) 27px}.workspace-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px}.section-label{margin:0;color:var(--acid);font:700 8px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.11em}.title{margin:5px 0 0;font-size:25px;line-height:1;letter-spacing:-.035em}.new-order{min-height:39px;padding:0 15px;border:1px solid var(--acid);background:var(--acid);color:#111511;font:800 8px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:18px;border:1px solid var(--line);background:var(--panel)}.metric{min-height:104px;padding:14px 15px;border-right:1px solid var(--line)}.metric:last-child{border-right:0}.metric span{color:var(--muted);font:700 7px ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.09em}.metric strong{display:block;margin-top:15px;font:600 23px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:-.06em}.delta{margin-top:8px;color:var(--acid)!important;letter-spacing:0!important}.delta.warn{color:var(--amber)!important}
.grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(255px,.65fr);gap:14px;margin-top:14px}.panel{min-width:0;border:1px solid var(--line);background:var(--panel)}.panel-head{min-height:54px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 14px;border-bottom:1px solid var(--line)}.panel-title{margin:0;font:750 10px ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.08em}.filters{display:flex;gap:5px}.filter{height:29px;padding:0 9px;border:1px solid var(--line);background:transparent;color:var(--muted);font-size:7px;font-weight:750;text-transform:uppercase}.filter[aria-pressed="true"]{border-color:var(--acid);color:var(--acid)}
.table-scroll{overflow:auto}.orders-table{width:100%;min-width:650px;border-collapse:collapse}.orders-table th{height:35px;padding:0 11px;border-bottom:1px solid var(--line);color:#717b6e;text-align:left;font:700 7px ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase}.orders-table td{height:58px;padding:8px 11px;border-bottom:1px solid #2b312b;font:600 9px ui-monospace,SFMono-Regular,Menlo,monospace}.orders-table tr:last-child td{border-bottom:0}.orders-table tr.is-selected td{background:#222a20}.order-link{border:0;background:transparent;padding:5px 0;color:var(--acid);font:800 9px ui-monospace,SFMono-Regular,Menlo,monospace}.order-link[aria-pressed="true"]{text-decoration:underline;text-underline-offset:4px}.orders-table td strong{display:block;color:var(--text);font-size:9px}.orders-table td small{display:block;margin-top:4px;color:var(--muted);font-size:7px}.stage-tag{display:inline-flex;padding:5px 7px;border:1px solid #566050;color:var(--steel);font-size:7px;text-transform:uppercase}.stage-tag.attention{border-color:#70443d;color:var(--red)}.stage-tag.ready{border-color:#526d2f;color:var(--acid)}
.detail-head{padding:15px;border-bottom:1px solid var(--line);background:linear-gradient(135deg,#202720,#171b17)}.detail-number{color:var(--acid);font:800 18px ui-monospace,SFMono-Regular,Menlo,monospace}.detail-customer{margin:6px 0 0;font-size:11px}.detail-body{padding:13px 15px}.keyline{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #2d332d;font-size:8px}.keyline span{color:var(--muted)}.keyline strong{text-align:right}.progress-label{display:flex;justify-content:space-between;margin:15px 0 8px;color:var(--muted);font:650 7px ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase}.progress-track{height:7px;background:#2a302a}.progress-fill{width:46%;height:100%;background:linear-gradient(90deg,var(--amber),var(--acid));transition:width .25s}.detail-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 15px 15px}.detail-button{min-height:36px;border:1px solid var(--line);background:transparent;font:700 7px ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase}.detail-button.primary{border-color:var(--acid);color:var(--acid)}.detail-button.warn{border-color:#68473d;color:var(--red)}
.bottom{display:grid;grid-template-columns:1.15fr .85fr 1fr;gap:14px;margin-top:14px}.materials{padding:13px}.material-row{display:grid;grid-template-columns:1fr 42px;gap:9px;margin:12px 0}.material-row:first-child{margin-top:2px}.material-name{display:flex;justify-content:space-between;gap:8px;font-size:8px}.material-name span{color:var(--muted)}.material-track{height:5px;margin-top:6px;background:#2f352f}.material-track i{display:block;height:100%;background:var(--acid)}.material-track.low i{background:var(--red)}.material-state{align-self:center;color:var(--acid);font:700 7px ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase}.material-state.low{color:var(--red)}
.activity{padding:0 13px}.activity-row{display:grid;grid-template-columns:28px 1fr;gap:10px;min-height:52px;align-items:center;border-bottom:1px solid #2c322c}.activity-row:last-child{border-bottom:0}.activity-index{width:25px;height:25px;display:grid;place-items:center;border:1px solid var(--line);color:var(--acid);font:700 7px ui-monospace,SFMono-Regular,Menlo,monospace}.activity-row strong{display:block;font-size:8px}.activity-row small{display:block;margin-top:4px;color:var(--muted);font-size:7px}
.forecast{padding:13px}.forecast-total{display:flex;align-items:end;justify-content:space-between}.forecast-total strong{font:700 20px ui-monospace,SFMono-Regular,Menlo,monospace}.forecast-total span{color:var(--acid);font-size:8px}.spark{height:70px;margin-top:12px}.spark svg{width:100%;height:100%;overflow:visible}.spark-grid{stroke:#353c35;stroke-width:1}.spark-area{fill:rgb(200 255 79/.08)}.spark-line{fill:none;stroke:var(--acid);stroke-width:2;vector-effect:non-scaling-stroke}.forecast-tabs{display:flex;gap:5px;margin-top:11px}.forecast-tab{flex:1;min-height:29px;border:1px solid var(--line);background:transparent;color:var(--muted);font:700 7px ui-monospace,SFMono-Regular,Menlo,monospace}.forecast-tab[aria-pressed="true"]{border-color:var(--acid);color:var(--acid)}.toast{position:fixed;z-index:12;right:18px;bottom:18px;max-width:350px;padding:12px 15px;border:1px solid var(--acid);background:#171c17;color:var(--text);font:650 8px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 16px 44px rgb(0 0 0/.4);transition:opacity .2s,transform .2s}.toast.is-hidden{opacity:0;transform:translateY(9px);pointer-events:none}
@media(max-width:1060px){.body{grid-template-columns:72px minmax(0,1fr)}.mast{grid-template-columns:72px minmax(0,1fr) auto}.brand-lock{padding:0 18px}.brand-lock>div:last-child{display:none}.side{padding:14px 8px}.module{height:46px;justify-content:center;padding:0;font-size:0}.module::before{content:attr(data-index);font:800 9px ui-monospace,SFMono-Regular,Menlo,monospace}.module[aria-pressed="true"]::after{display:none}.side-rule,.side-label,.plant-card,.privacy{display:none}.grid{grid-template-columns:minmax(0,1fr) 250px}.bottom{grid-template-columns:1fr 1fr}.bottom .panel:last-child{grid-column:1/-1}.forecast{display:grid;grid-template-columns:180px 1fr;gap:15px}.forecast-tabs{grid-column:1}.spark{grid-column:2;grid-row:1/3}}
@media(max-width:790px){.erp{grid-template-rows:auto 1fr}.mast{min-width:0;width:100%;grid-template-columns:auto minmax(0,1fr);min-height:64px}.brand-lock{border-right:0}.global-search{min-width:0;width:auto;margin-left:0}.shift{grid-column:1/-1;height:34px;border-left:0;border-top:1px solid var(--line);padding-left:18px}.body{min-width:0;width:100%;display:block}.side{display:flex;gap:5px;overflow:auto;border-right:0;border-bottom:1px solid var(--line)}.module{min-width:75px;margin:0}.workspace{padding:15px 11px 24px}.grid{grid-template-columns:1fr}.detail{display:grid;grid-template-columns:190px 1fr}.detail-head{border-right:1px solid var(--line)}.detail-actions{align-content:center}.metrics{grid-template-columns:1fr 1fr}.metric:nth-child(2){border-right:0}.metric:nth-child(-n+2){border-bottom:1px solid var(--line)}.bottom{grid-template-columns:1fr}.bottom .panel:last-child{grid-column:auto}.forecast{display:block}.forecast-tabs{display:flex}.spark{height:80px}}
@media(max-width:500px){.mast{grid-template-columns:58px minmax(0,1fr)}.brand-lock{padding:0 12px}.forge-mark{width:32px;height:32px}.global-search{margin-right:10px}.workspace-head{align-items:flex-start}.title{font-size:21px}.new-order{max-width:112px}.metric{min-height:91px;padding:11px}.metric strong{font-size:18px}.grid{margin-top:10px}.detail{display:block}.bottom{gap:10px}.toast{left:12px;right:12px;bottom:12px;max-width:none}}
`,
    body: `
<div class="erp">
  <header class="mast"><div class="brand-lock"><div class="forge-mark" aria-hidden="true"></div><div><div class="brand">${t("brand")}</div><p class="eyebrow">${t("eyebrow")}</p></div></div><input class="global-search" id="erp-search" data-action="search-erp" type="search" placeholder="${t("search")}" aria-label="${t("search")}"><div class="shift">${t("live")} · 14:42</div></header>
  <div class="body">
    <aside class="side"><button class="module" type="button" data-action="nav-orders" data-module="orders" data-index="01" aria-pressed="true">${t("orders")}</button><button class="module" type="button" data-action="nav-inventory" data-module="inventory" data-index="02" aria-pressed="false">${t("inventory")}</button><button class="module" type="button" data-action="nav-production" data-module="production" data-index="03" aria-pressed="false">${t("production")}</button><button class="module" type="button" data-action="nav-crm" data-module="crm" data-index="04" aria-pressed="false">${t("crm")}</button><button class="module" type="button" data-action="nav-invoices" data-module="invoices" data-index="05" aria-pressed="false">${t("invoices")}</button><div class="side-rule"></div><p class="side-label">PLANT STATUS</p><div class="plant-card"><span>Capacity / Shift B</span><strong>78.4%</strong><div class="capacity"><i></i></div></div><p class="privacy">${t("privacy")}</p></aside>
    <main class="workspace"><header class="workspace-head"><div><p class="section-label" id="module-label">01 / ${t("orders")}</p><h1 class="title">${t("pipeline")}</h1></div><button class="new-order" type="button" data-action="new-order">+ ${t("newOrder")}</button></header>
      <section class="metrics"><article class="metric"><span>${t("revenue")}</span><strong>€ 1.84M</strong><span class="delta">▲ 8.2%</span></article><article class="metric"><span>${t("openOrders")}</span><strong id="open-orders">124</strong><span class="delta warn">17 ${t("attention").toLowerCase()}</span></article><article class="metric"><span>${t("stockValue")}</span><strong>€ 684k</strong><span class="delta">96.4% ${t("healthy").toLowerCase()}</span></article><article class="metric"><span>${t("onTime")}</span><strong>94.7%</strong><span class="delta">▲ 1.6 pt</span></article></section>
      <section class="grid"><article class="panel"><header class="panel-head"><h2 class="panel-title">${t("pipeline")}</h2><div class="filters"><button class="filter" type="button" data-action="filter-all" data-filter="all" aria-pressed="true">${t("all")}</button><button class="filter" type="button" data-action="filter-attention" data-filter="attention" aria-pressed="false">${t("attention")}</button><button class="filter" type="button" data-action="filter-ready" data-filter="ready" aria-pressed="false">${t("ready")}</button></div></header><div class="table-scroll"><table class="orders-table"><thead><tr><th>${t("order")}</th><th>${t("customer")}</th><th>${t("value")}</th><th>${t("delivery")}</th><th>${t("stage")}</th></tr></thead><tbody>
        ${orderRow("2084", "Atria Mobility", "€ 42,800", "18 OCT", ui.assembly, "all")}${orderRow("2081", "Kern Atelier", "€ 18,420", "19 OCT", ui.quality, "attention")}${orderRow("2079", "Nexa Systems", "€ 76,100", "20 OCT", ui.packing, "ready")}${orderRow("2074", "Linea Nord", "€ 31,660", "22 OCT", ui.hold, "attention")}${orderRow("2068", "Volta Studio", "€ 54,280", "24 OCT", ui.released, "ready")}
      </tbody></table></div></article>
      <aside class="panel detail"><div class="detail-head"><span class="detail-number" id="detail-order">#2084</span><p class="detail-customer" id="detail-company">Atria Mobility</p></div><div class="detail-body"><div class="keyline"><span>${t("value")}</span><strong id="detail-value">€ 42,800</strong></div><div class="keyline"><span>${t("delivery")}</span><strong id="detail-delivery">18 OCT</strong></div><div class="keyline"><span>${t("stage")}</span><strong id="detail-stage">${t("assembly")}</strong></div><div class="keyline"><span>OWNER</span><strong>Elena Valli</strong></div><div class="progress-label"><span>${t("progress")}</span><b id="progress-number">46%</b></div><div class="progress-track"><i class="progress-fill" id="progress-fill"></i></div></div><div class="detail-actions"><button class="detail-button primary" type="button" data-action="advance-order">${t("progress")}</button><button class="detail-button warn" type="button" data-action="flag-order">${t("flag")}</button><button class="detail-button" type="button" data-action="create-invoice">${t("invoice")}</button><button class="detail-button" type="button" data-action="allocate-stock">${t("allocate")}</button></div></aside></section>
      <section class="bottom"><article class="panel"><header class="panel-head"><h2 class="panel-title">${t("materials")}</h2><span class="section-label">04 SKU</span></header><div class="materials"><div class="material-row"><div><div class="material-name"><b>AL-6061</b><span>8.4 t / 12 t</span></div><div class="material-track"><i style="width:70%"></i></div></div><span class="material-state">${t("healthy")}</span></div><div class="material-row"><div><div class="material-name"><b>MX-14</b><span>182 / 640</span></div><div class="material-track low"><i style="width:28%"></i></div></div><span class="material-state low">${t("lowStock")}</span></div><div class="material-row"><div><div class="material-name"><b>PCB-K2</b><span>920 / 1.2k</span></div><div class="material-track"><i style="width:76%"></i></div></div><span class="material-state">${t("reserved")}</span></div></div></article>
      <article class="panel"><header class="panel-head"><h2 class="panel-title">${t("activity")}</h2><span class="section-label">LIVE</span></header><div class="activity"><div class="activity-row"><span class="activity-index">01</span><div><strong>${t("machine")}</strong><small>14:38 · PROD</small></div></div><div class="activity-row"><span class="activity-index">02</span><div><strong>${t("shipment")}</strong><small>14:21 · LOG</small></div></div><div class="activity-row"><span class="activity-index">03</span><div><strong>${t("payment")}</strong><small>13:56 · FIN</small></div></div><div class="activity-row"><span class="activity-index">04</span><div><strong>${t("qualityEvent")}</strong><small>13:42 · QA</small></div></div></div></article>
      <article class="panel"><header class="panel-head"><h2 class="panel-title">${t("forecast")}</h2><span class="section-label">EUR</span></header><div class="forecast"><div class="forecast-total"><strong id="forecast-total">€ 418k</strong><span>+12.6%</span></div><div class="spark" aria-hidden="true"><svg viewBox="0 0 300 80" preserveAspectRatio="none"><path class="spark-grid" d="M0 20H300M0 40H300M0 60H300"/><path class="spark-area" d="M0 68L30 61L60 64L90 46L120 51L150 37L180 42L210 26L240 31L270 14L300 19V80H0Z"/><path class="spark-line" d="M0 68L30 61L60 64L90 46L120 51L150 37L180 42L210 26L240 31L270 14L300 19"/></svg></div><div class="forecast-tabs"><button class="forecast-tab" type="button" data-action="forecast-30" data-range="30" aria-pressed="true">${t("thirtyDays")}</button><button class="forecast-tab" type="button" data-action="forecast-90" data-range="90" aria-pressed="false">${t("ninetyDays")}</button></div></div></article></section>
    </main>
  </div>
</div><p class="toast is-hidden" id="erp-toast" role="status" aria-live="polite"></p>
`,
    script: `
const DATA=${flagshipScriptData({ ui })};
const orders={"2084":{customer:"Atria Mobility",value:"€ 42,800",delivery:"18 OCT",stage:DATA.ui.assembly,progress:46},"2081":{customer:"Kern Atelier",value:"€ 18,420",delivery:"19 OCT",stage:DATA.ui.quality,progress:61},"2079":{customer:"Nexa Systems",value:"€ 76,100",delivery:"20 OCT",stage:DATA.ui.packing,progress:82},"2074":{customer:"Linea Nord",value:"€ 31,660",delivery:"22 OCT",stage:DATA.ui.hold,progress:34},"2068":{customer:"Volta Studio",value:"€ 54,280",delivery:"24 OCT",stage:DATA.ui.released,progress:100}};
const stages=[DATA.ui.assembly,DATA.ui.quality,DATA.ui.packing,DATA.ui.released];const state={order:"2084",filter:"all",module:"orders"};const toast=document.getElementById("erp-toast");let timer=0;
function announce(message){window.clearTimeout(timer);toast.textContent=message;toast.classList.remove("is-hidden");timer=window.setTimeout(function(){toast.classList.add("is-hidden");},2300);}
function selectOrder(number){const item=orders[number]||orders["2084"];state.order=number;document.getElementById("detail-order").textContent="#"+number;document.getElementById("detail-company").textContent=item.customer;document.getElementById("detail-value").textContent=item.value;document.getElementById("detail-delivery").textContent=item.delivery;document.getElementById("detail-stage").textContent=item.stage;document.getElementById("progress-number").textContent=item.progress+"%";document.getElementById("progress-fill").style.width=item.progress+"%";document.querySelectorAll(".order-link").forEach(function(button){const active=button.getAttribute("data-order")===number;button.setAttribute("aria-pressed",String(active));button.closest("tr").classList.toggle("is-selected",active);});}
function setFilter(filter){state.filter=filter;document.querySelectorAll(".filter").forEach(function(button){button.setAttribute("aria-pressed",String(button.getAttribute("data-filter")===filter));});document.querySelectorAll("[data-order-row]").forEach(function(row){row.hidden=filter!=="all"&&row.getAttribute("data-status")!==filter;});announce(DATA.ui.filterNotice);}
function setModule(module,control){state.module=module;document.querySelectorAll(".module").forEach(function(button){button.setAttribute("aria-pressed",String(button===control));});document.getElementById("module-label").textContent=control.getAttribute("data-index")+" / "+control.textContent;announce(DATA.ui.sectionNotice+" · "+control.textContent);}
function advance(){const item=orders[state.order];const index=Math.max(0,stages.indexOf(item.stage));item.stage=stages[Math.min(stages.length-1,index+1)];item.progress=Math.min(100,item.progress+18);selectOrder(state.order);announce(DATA.ui.advanceNotice);}
function handle(control){const action=control.getAttribute("data-action")||"";if(action.indexOf("nav-")===0){setModule(control.getAttribute("data-module")||"orders",control);return;}if(action.indexOf("filter-")===0){setFilter(control.getAttribute("data-filter")||"all");return;}if(action.indexOf("select-")===0){selectOrder(control.getAttribute("data-order")||"2084");return;}if(action==="advance-order"){advance();return;}if(action==="flag-order"){document.getElementById("detail-stage").textContent=DATA.ui.hold;announce(DATA.ui.flagNotice);return;}if(action==="create-invoice"){announce(DATA.ui.invoiceNotice);return;}if(action==="allocate-stock"){announce(DATA.ui.allocateNotice);return;}if(action==="new-order"){document.getElementById("open-orders").textContent="125";announce(DATA.ui.newNotice);return;}if(action.indexOf("forecast-")===0){document.querySelectorAll(".forecast-tab").forEach(function(button){button.setAttribute("aria-pressed",String(button===control));});document.getElementById("forecast-total").textContent=control.getAttribute("data-range")==="90"?"€ 1.12M":"€ 418k";}}
document.querySelectorAll("[data-action]").forEach(function(control){if(control.tagName!=="INPUT"){control.addEventListener("click",function(){handle(control);});}});
document.getElementById("erp-search").addEventListener("input",function(event){const query=event.target.value.trim().toLowerCase();document.querySelectorAll("[data-order-row]").forEach(function(row){const match=!query||row.textContent.toLowerCase().indexOf(query)>=0;row.hidden=!match||(state.filter!=="all"&&row.getAttribute("data-status")!==state.filter);});});
selectOrder("2084");
`,
  });
}

export function buildBusinessSuiteHtml(
  id: "studio-ledger" | "pulse-booking" | "foundry-erp",
  locale: Locale,
): string {
  if (id === "studio-ledger") return buildStudioLedgerHtml(locale);
  if (id === "pulse-booking") return buildPulseBookingHtml(locale);
  return buildFoundryErpHtml(locale);
}
