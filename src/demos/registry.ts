import type { Locale } from "@/lib/i18n-core";
import { VELVET_TABLE_COVER } from "@/demos/velvet-table/photos";

export const PREMIUM_DEMO_IDS = ["velvet-table"] as const;
export type PremiumDemoId = (typeof PREMIUM_DEMO_IDS)[number];

export function isPremiumDemoId(value: string): value is PremiumDemoId {
  return (PREMIUM_DEMO_IDS as readonly string[]).includes(value);
}

export const VELVET_CREATE_PROMPT =
  "Crea un servizio di prenotazione ristoranti e concierge gastronomico come Velvet Table: atmosfera da grand hotel, ricerca per occasione, mappa dei tavoli con vista e privacy, prenotazione in quattro passi e wallet della prenotazione.";

type PremiumCard = {
  id: PremiumDemoId;
  photo: string;
  brand: string;
  kind: string;
  title: string;
  lead: string;
  capability: string;
};

const CARDS: Record<Locale, PremiumCard> = {
  it: {
    id: "velvet-table",
    photo: VELVET_TABLE_COVER,
    brand: "Velvet Table",
    kind: "Demo premium",
    title: "Prenotazione ristoranti e concierge gastronomico",
    lead: "Il servizio digitale di un grand hotel. Non un Booking con foto di cibo.",
    capability: "Hero fotografico, tavoli luminosi, vista che cambia, wallet con QR.",
  },
  en: {
    id: "velvet-table",
    photo: VELVET_TABLE_COVER,
    brand: "Velvet Table",
    kind: "Premium demo",
    title: "Restaurant booking and gastronomic concierge",
    lead: "The digital service of a grand hotel. Not Booking with food photos.",
    capability: "Photographic hero, luminous tables, changing views, QR wallet.",
  },
  es: {
    id: "velvet-table",
    photo: VELVET_TABLE_COVER,
    brand: "Velvet Table",
    kind: "Demo premium",
    title: "Reservas de restaurante y conserjería gastronómica",
    lead: "El servicio digital de un gran hotel. No un Booking con fotos de comida.",
    capability: "Hero fotográfico, mesas luminosas, vistas que cambian, wallet con QR.",
  },
  fr: {
    id: "velvet-table",
    photo: VELVET_TABLE_COVER,
    brand: "Velvet Table",
    kind: "Démo premium",
    title: "Réservation de restaurants et conciergerie gastronomique",
    lead: "Le service numérique d’un grand hôtel. Pas un Booking avec des photos de plats.",
    capability: "Hero photographique, tables lumineuses, vues qui changent, wallet QR.",
  },
  de: {
    id: "velvet-table",
    photo: VELVET_TABLE_COVER,
    brand: "Velvet Table",
    kind: "Premium-Demo",
    title: "Restaurantbuchung und gastronomischer Concierge",
    lead: "Der digitale Service eines Grand Hotels. Kein Booking mit Essensfotos.",
    capability: "Fotografischer Hero, leuchtende Tische, wechselnde Ausblicke, QR-Wallet.",
  },
  pt: {
    id: "velvet-table",
    photo: VELVET_TABLE_COVER,
    brand: "Velvet Table",
    kind: "Demo premium",
    title: "Reservas de restaurante e concierge gastronómico",
    lead: "O serviço digital de um grande hotel. Não um Booking com fotos de comida.",
    capability: "Hero fotográfico, mesas luminosas, vistas que mudam, carteira com QR.",
  },
};

export function premiumDemosFor(locale: Locale): PremiumCard[] {
  return [CARDS[locale]];
}
