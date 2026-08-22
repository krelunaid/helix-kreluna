export const EPOQUE_PHOTOS = {
  wings: "/vetrina/epoque/mercedes-300-sl-wings.jpg",
  sl190: "/vetrina/epoque/mercedes-190-sl.jpg",
  roadster: "/vetrina/epoque/mercedes-300-sl-roadster.jpg",
  pagoda: "/vetrina/epoque/mercedes-280-sl.jpg",
  sl300: "/vetrina/epoque/mercedes-300-sl.jpg",
  amg: "/vetrina/epoque/mercedes-amg-gt.jpg",
  g63: "/vetrina/epoque/mercedes-g-63.jpg",
  salon: "/vetrina/epoque/event-salon.jpg",
  villa: "/vetrina/epoque/event-villa.jpg",
} as const;

export const EPOQUE_CAR_PHOTOS = [
  EPOQUE_PHOTOS.wings,
  EPOQUE_PHOTOS.sl190,
  EPOQUE_PHOTOS.roadster,
  EPOQUE_PHOTOS.pagoda,
  EPOQUE_PHOTOS.amg,
  EPOQUE_PHOTOS.g63,
] as const;

export const ITALVIA_PHOTOS = {
  road: "/vetrina/italvia/val-dorcia.jpg",
  cypress: "/vetrina/italvia/cypress-road.jpg",
  scalea: "/vetrina/italvia/cinque-terre.jpg",
  tropea: "/vetrina/italvia/tropea.jpg",
  etna: "/vetrina/italvia/etna.jpg",
  january: "/vetrina/italvia/january.jpg",
  agent: "/vetrina/italvia/alimentari.jpg",
} as const;

export const ITALVIA_HOME_PHOTOS = [
  ITALVIA_PHOTOS.scalea,
  ITALVIA_PHOTOS.tropea,
  ITALVIA_PHOTOS.etna,
] as const;

export const MINI4WD_PHOTOS = {
  track: "/vetrina/mini4wd/race-night.jpg",
  fleet: "/vetrina/mini4wd/fleet.jpg",
  avante: "/vetrina/mini4wd/aero-avante.jpg",
  bench: "/vetrina/mini4wd/bench.jpg",
  yaris: "/vetrina/mini4wd/yaris-wrc.jpg",
  workshop: "/vetrina/mini4wd/workshop.jpg",
} as const;

export const ANDREA_VETRINA_COVERS = {
  "mercedes-epoque": EPOQUE_PHOTOS.wings,
  italvia: ITALVIA_PHOTOS.road,
  "mini4wd-lab": MINI4WD_PHOTOS.track,
} as const;
