import { VELVET_PHOTOS } from "./photos";

export type OccasionId = "romantic" | "business" | "family";
export type TableStatus = "available" | "waitlist" | "full";
export type Atmosphere = "day" | "sunset" | "night";

export type VenueId = "terrazza-aurora" | "sala-velluto" | "orangerie";

export type TableFixture = {
  id: string;
  number: number;
  zone: "window" | "alcove" | "garden";
  status: TableStatus;
  view: string;
  privacy: 1 | 2 | 3;
  surcharge: number;
  x: number;
  y: number;
};

export type VenueFixture = {
  id: VenueId;
  occasions: readonly OccasionId[];
  cover: string;
  gallery: readonly string[];
  atmospheres: Record<Atmosphere, string>;
  chefPhoto: string;
  priceBand: 1 | 2 | 3;
  tables: readonly TableFixture[];
};

export const VENUES: readonly VenueFixture[] = [
  {
    id: "terrazza-aurora",
    occasions: ["romantic", "business"],
    cover: VELVET_PHOTOS.terrace,
    gallery: [VELVET_PHOTOS.terrace, VELVET_PHOTOS.hero, VELVET_PHOTOS.wine, VELVET_PHOTOS.plated],
    atmospheres: {
      day: VELVET_PHOTOS.terrace,
      sunset: VELVET_PHOTOS.terrace,
      night: VELVET_PHOTOS.night,
    },
    chefPhoto: VELVET_PHOTOS.chef,
    priceBand: 3,
    tables: [
      {
        id: "aurora-12",
        number: 12,
        zone: "window",
        status: "available",
        view: VELVET_PHOTOS.terrace,
        privacy: 2,
        surcharge: 40,
        x: 78,
        y: 28,
      },
      {
        id: "aurora-4",
        number: 4,
        zone: "alcove",
        status: "available",
        view: VELVET_PHOTOS.alcove,
        privacy: 3,
        surcharge: 0,
        x: 22,
        y: 62,
      },
      {
        id: "aurora-8",
        number: 8,
        zone: "garden",
        status: "waitlist",
        view: VELVET_PHOTOS.garden,
        privacy: 1,
        surcharge: 0,
        x: 54,
        y: 74,
      },
      {
        id: "aurora-16",
        number: 16,
        zone: "window",
        status: "full",
        view: VELVET_PHOTOS.window,
        privacy: 2,
        surcharge: 40,
        x: 82,
        y: 58,
      },
    ],
  },
  {
    id: "sala-velluto",
    occasions: ["romantic", "business"],
    cover: VELVET_PHOTOS.salon,
    gallery: [VELVET_PHOTOS.salon, VELVET_PHOTOS.alcove, VELVET_PHOTOS.wine, VELVET_PHOTOS.hero],
    atmospheres: {
      day: VELVET_PHOTOS.salon,
      sunset: VELVET_PHOTOS.window,
      night: VELVET_PHOTOS.alcove,
    },
    chefPhoto: VELVET_PHOTOS.chef,
    priceBand: 3,
    tables: [
      {
        id: "velluto-3",
        number: 3,
        zone: "alcove",
        status: "available",
        view: VELVET_PHOTOS.alcove,
        privacy: 3,
        surcharge: 0,
        x: 30,
        y: 48,
      },
      {
        id: "velluto-7",
        number: 7,
        zone: "window",
        status: "waitlist",
        view: VELVET_PHOTOS.window,
        privacy: 2,
        surcharge: 25,
        x: 72,
        y: 32,
      },
      {
        id: "velluto-11",
        number: 11,
        zone: "garden",
        status: "full",
        view: VELVET_PHOTOS.garden,
        privacy: 2,
        surcharge: 0,
        x: 58,
        y: 70,
      },
    ],
  },
  {
    id: "orangerie",
    occasions: ["family", "business"],
    cover: VELVET_PHOTOS.garden,
    gallery: [VELVET_PHOTOS.garden, VELVET_PHOTOS.plated, VELVET_PHOTOS.salon, VELVET_PHOTOS.hero],
    atmospheres: {
      day: VELVET_PHOTOS.garden,
      sunset: VELVET_PHOTOS.terrace,
      night: VELVET_PHOTOS.night,
    },
    chefPhoto: VELVET_PHOTOS.chef,
    priceBand: 2,
    tables: [
      {
        id: "orangerie-2",
        number: 2,
        zone: "garden",
        status: "available",
        view: VELVET_PHOTOS.garden,
        privacy: 1,
        surcharge: 0,
        x: 46,
        y: 40,
      },
      {
        id: "orangerie-9",
        number: 9,
        zone: "window",
        status: "available",
        view: VELVET_PHOTOS.terrace,
        privacy: 2,
        surcharge: 15,
        x: 74,
        y: 26,
      },
      {
        id: "orangerie-15",
        number: 15,
        zone: "alcove",
        status: "waitlist",
        view: VELVET_PHOTOS.alcove,
        privacy: 3,
        surcharge: 0,
        x: 24,
        y: 68,
      },
    ],
  },
];

export const MENU = [
  { course: "opening", price: "28" },
  { course: "garden", price: "34" },
  { course: "catch", price: "48" },
  { course: "velvet", price: "54" },
  { course: "close", price: "18" },
] as const;

export const DEPOSIT_EUR = 80;
export const FLOWER_EUR = 45;
export const WINE_EUR = 70;

export const GUIDED_VENUE_ID: VenueId = "terrazza-aurora";
export const GUIDED_TABLE_ID = "aurora-12";
