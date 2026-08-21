import type { Locale } from "@/lib/i18n-core";
import { buildArcCityHtml } from "@/lib/flagships/arc-city";
import { buildBusinessSuiteHtml } from "@/lib/flagships/business-suite";
import { buildMorphHtml } from "@/lib/flagships/morph";
import { buildNeuraHtml } from "@/lib/flagships/neura";
import { buildOrbitCommandHtml } from "@/lib/flagships/orbit-command";
import { buildPremiumSiteHtml } from "@/lib/flagships/premium-sites";
import { buildSynapseHtml } from "@/lib/flagships/synapse";
import { buildVantaHtml } from "@/lib/flagships/vanta";
import { FLAGSHIP_IDS, flagshipCopy, type FlagshipId } from "@/lib/flagships/copy";

export { FLAGSHIP_IDS, flagshipShowcaseLabels } from "@/lib/flagships/copy";
export type { FlagshipId } from "@/lib/flagships/copy";

export type FlagshipEvidence = {
  artifactSha256: string;
  reportId: string;
};

export type FlagshipMeasuredBuild = FlagshipEvidence & {
  durationMs: number;
};

export type FlagshipMeasuredScore = FlagshipEvidence & {
  schemaVersion: "2.0.0";
  readiness: number;
  confidence: number;
};

export type FlagshipVisualSignature = {
  shell: string;
  typography: string;
  navigation: string;
  geometry: string;
  density: "airy" | "balanced" | "dense" | "very-dense";
  palette: readonly [string, string, string];
  motion: string;
};

export type FlagshipSurface = "app" | "site";

export type FlagshipCategory =
  | "control-data"
  | "collaboration"
  | "product-design"
  | "professional-management"
  | "appointments"
  | "professional-sites"
  | "hospitality-commerce"
  | "culture-events";

export const FLAGSHIP_CATEGORY_ORDER = [
  "professional-management",
  "appointments",
  "control-data",
  "collaboration",
  "product-design",
  "professional-sites",
  "hospitality-commerce",
  "culture-events",
] as const satisfies readonly FlagshipCategory[];

export type FlagshipEntry = {
  id: FlagshipId;
  title: string;
  brand: string;
  kind: string;
  prompt: string;
  capability: string;
  proof: string;
  surface: FlagshipSurface;
  category: FlagshipCategory;
  categoryLabel: string;
  interactionTarget: number;
  visual: FlagshipVisualSignature;
  agents?: readonly string[];
  measuredBuild?: FlagshipMeasuredBuild;
  measuredScore?: FlagshipMeasuredScore;
};

const VISUAL_SIGNATURES: Record<FlagshipId, FlagshipVisualSignature> = {
  "orbit-command": {
    shell: "perimeter-mission-control",
    typography: "condensed-system-and-mono",
    navigation: "fleet-rail-and-telemetry-edge",
    geometry: "cut-corners-and-orbit-rings",
    density: "dense",
    palette: ["#030708", "#7ef9ff", "#ff8a3d"],
    motion: "orbital-sweep",
  },
  neura: {
    shell: "asymmetric-scientific-atlas",
    typography: "humanist-serif-and-clean-sans",
    navigation: "study-tabs-and-region-index",
    geometry: "specimen-plates-and-hairlines",
    density: "airy",
    palette: ["#f3efe4", "#2946b8", "#e66f51"],
    motion: "signal-trace",
  },
  synapse: {
    shell: "editorial-knowledge-canvas",
    typography: "neutral-grotesk-and-serif-notes",
    navigation: "room-strip-and-canvas-tools",
    geometry: "paper-nodes-and-ink-connectors",
    density: "balanced",
    palette: ["#f4f0e8", "#172043", "#3157d5"],
    motion: "node-focus",
  },
  vanta: {
    shell: "multi-pane-market-terminal",
    typography: "system-monospace",
    navigation: "terminal-tabs-and-ticker-tape",
    geometry: "square-cells-and-rule-grid",
    density: "very-dense",
    palette: ["#050706", "#b7ff2a", "#ff5252"],
    motion: "price-tick",
  },
  "arc-city": {
    shell: "map-first-civic-console",
    typography: "civic-sans-and-numeric-mono",
    navigation: "municipal-bar-and-layer-dock",
    geometry: "isometric-blocks-and-map-lines",
    density: "balanced",
    palette: ["#e9f0ed", "#185d62", "#f06449"],
    motion: "infrastructure-flow",
  },
  morph: {
    shell: "cinematic-product-stage",
    typography: "futura-display-and-technical-mono",
    navigation: "diagonal-spec-rail-and-control-dock",
    geometry: "sculpted-body-and-physical-dials",
    density: "airy",
    palette: ["#0c0b09", "#e7dfcf", "#ad6f42"],
    motion: "camera-orbit",
  },
  "studio-ledger": {
    shell: "editorial-practice-ledger",
    typography: "warm-serif-and-tabular-sans",
    navigation: "client-index-and-daily-docket",
    geometry: "ledger-columns-and-rounded-folios",
    density: "balanced",
    palette: ["#f3ecdd", "#2b463d", "#c45d3c"],
    motion: "folio-shift",
  },
  "pulse-booking": {
    shell: "luminous-calendar-workbench",
    typography: "friendly-geometric-sans",
    navigation: "week-strip-and-staff-dock",
    geometry: "time-slots-and-soft-capsules",
    density: "balanced",
    palette: ["#f7f8ff", "#5949d6", "#ff7b9c"],
    motion: "appointment-pulse",
  },
  "foundry-erp": {
    shell: "industrial-operations-grid",
    typography: "compressed-sans-and-data-mono",
    navigation: "module-rail-and-command-bar",
    geometry: "steel-panels-and-status-lines",
    density: "very-dense",
    palette: ["#111719", "#f1b84b", "#83d7c7"],
    motion: "production-flow",
  },
  "atelier-nova": {
    shell: "architectural-editorial-gallery",
    typography: "high-contrast-serif-and-grotesk",
    navigation: "folio-index-and-project-rail",
    geometry: "offset-planes-and-crop-windows",
    density: "airy",
    palette: ["#eee9df", "#1b2623", "#b85f3d"],
    motion: "plan-reveal",
  },
  "casa-verde": {
    shell: "botanical-hospitality-story",
    typography: "soft-serif-and-humanist-sans",
    navigation: "stay-chapters-and-booking-ribbon",
    geometry: "organic-arches-and-landscape-bands",
    density: "airy",
    palette: ["#163d32", "#f1dfbb", "#d66f4c"],
    motion: "canopy-drift",
  },
  "lumen-clinic": {
    shell: "calm-care-pathway",
    typography: "clinical-grotesk-and-readable-serif",
    navigation: "specialty-tabs-and-care-drawer",
    geometry: "light-panels-and-radius-cards",
    density: "balanced",
    palette: ["#eef6f4", "#135f69", "#ee8d72"],
    motion: "care-path-focus",
  },
  "northstar-legal": {
    shell: "authoritative-advisory-journal",
    typography: "legal-serif-and-precise-sans",
    navigation: "practice-index-and-insight-column",
    geometry: "formal-rules-and-monogram-blocks",
    density: "balanced",
    palette: ["#101826", "#d7c5a1", "#587a8f"],
    motion: "brief-unfold",
  },
  "velora-commerce": {
    shell: "sculptural-commerce-lookbook",
    typography: "fashion-display-and-neutral-sans",
    navigation: "collection-strip-and-cart-drawer",
    geometry: "product-plinths-and-oversized-type",
    density: "airy",
    palette: ["#f2efe9", "#20201f", "#c66f52"],
    motion: "object-turntable",
  },
  "festival-onda": {
    shell: "kinetic-cultural-poster",
    typography: "oversized-grotesk-and-ticket-mono",
    navigation: "day-filter-and-stage-map",
    geometry: "poster-stacks-and-rhythm-bars",
    density: "dense",
    palette: ["#f8ee28", "#2e24b6", "#ff574d"],
    motion: "programme-marquee",
  },
};

const FLAGSHIP_TAXONOMY: Record<
  FlagshipId,
  Readonly<{ surface: FlagshipSurface; category: FlagshipCategory }>
> = {
  "orbit-command": { surface: "app", category: "control-data" },
  neura: { surface: "app", category: "control-data" },
  synapse: { surface: "app", category: "collaboration" },
  vanta: { surface: "app", category: "control-data" },
  "arc-city": { surface: "app", category: "control-data" },
  morph: { surface: "app", category: "product-design" },
  "studio-ledger": { surface: "app", category: "professional-management" },
  "pulse-booking": { surface: "app", category: "appointments" },
  "foundry-erp": { surface: "app", category: "professional-management" },
  "atelier-nova": { surface: "site", category: "professional-sites" },
  "casa-verde": { surface: "site", category: "hospitality-commerce" },
  "lumen-clinic": { surface: "site", category: "professional-sites" },
  "northstar-legal": { surface: "site", category: "professional-sites" },
  "velora-commerce": { surface: "site", category: "hospitality-commerce" },
  "festival-onda": { surface: "site", category: "culture-events" },
};

const CATEGORY_LABELS: Record<Locale, Record<FlagshipCategory, string>> = {
  en: {
    "control-data": "Control & data",
    collaboration: "Collaboration",
    "product-design": "Product design",
    "professional-management": "Professional management",
    appointments: "Appointments",
    "professional-sites": "Professional services",
    "hospitality-commerce": "Hospitality & commerce",
    "culture-events": "Culture & events",
  },
  it: {
    "control-data": "Controllo e dati",
    collaboration: "Collaborazione",
    "product-design": "Prodotto e configurazione",
    "professional-management": "Studi e gestionali",
    appointments: "Appuntamenti e servizi",
    "professional-sites": "Studi e professionisti",
    "hospitality-commerce": "Ospitalità e commercio",
    "culture-events": "Cultura ed eventi",
  },
  es: {
    "control-data": "Control y datos",
    collaboration: "Colaboración",
    "product-design": "Diseño de producto",
    "professional-management": "Gestión profesional",
    appointments: "Citas y servicios",
    "professional-sites": "Servicios profesionales",
    "hospitality-commerce": "Hospitalidad y comercio",
    "culture-events": "Cultura y eventos",
  },
  fr: {
    "control-data": "Contrôle et données",
    collaboration: "Collaboration",
    "product-design": "Design produit",
    "professional-management": "Gestion professionnelle",
    appointments: "Rendez-vous",
    "professional-sites": "Services professionnels",
    "hospitality-commerce": "Hôtellerie et commerce",
    "culture-events": "Culture et événements",
  },
  de: {
    "control-data": "Kontrolle und Daten",
    collaboration: "Zusammenarbeit",
    "product-design": "Produktdesign",
    "professional-management": "Professionelle Verwaltung",
    appointments: "Termine",
    "professional-sites": "Professionelle Dienste",
    "hospitality-commerce": "Gastgewerbe und Handel",
    "culture-events": "Kultur und Events",
  },
  pt: {
    "control-data": "Controle e dados",
    collaboration: "Colaboração",
    "product-design": "Design de produto",
    "professional-management": "Gestão profissional",
    appointments: "Agendamentos",
    "professional-sites": "Serviços profissionais",
    "hospitality-commerce": "Hospitalidade e comércio",
    "culture-events": "Cultura e eventos",
  },
};

export const HOME_FLAGSHIP_IDS = [
  "studio-ledger",
  "pulse-booking",
  "morph",
  "atelier-nova",
  "lumen-clinic",
  "velora-commerce",
] as const;

export function isFlagshipId(value: string): value is FlagshipId {
  return (FLAGSHIP_IDS as readonly string[]).includes(value);
}

export function flagshipFor(locale: Locale): FlagshipEntry[] {
  return FLAGSHIP_IDS.map((id) => {
    const copy = flagshipCopy(locale, id);
    return {
      id,
      brand: copy.brand,
      title: copy.title,
      kind: copy.kind,
      prompt: copy.prompt,
      capability: copy.capability,
      proof: copy.proof,
      surface: FLAGSHIP_TAXONOMY[id].surface,
      category: FLAGSHIP_TAXONOMY[id].category,
      categoryLabel: CATEGORY_LABELS[locale][FLAGSHIP_TAXONOMY[id].category],
      interactionTarget: 8,
      visual: VISUAL_SIGNATURES[id],
    };
  });
}

export function homeFlagshipsFor(locale: Locale): FlagshipEntry[] {
  const byId = new Map(flagshipFor(locale).map((entry) => [entry.id, entry]));
  return HOME_FLAGSHIP_IDS.map((id) => byId.get(id)).filter((entry): entry is FlagshipEntry =>
    Boolean(entry),
  );
}

export function buildFlagshipHtml(id: FlagshipId, locale: Locale): string {
  switch (id) {
    case "orbit-command":
      return buildOrbitCommandHtml(locale);
    case "neura":
      return buildNeuraHtml(locale);
    case "synapse":
      return buildSynapseHtml(locale);
    case "vanta":
      return buildVantaHtml(locale);
    case "arc-city":
      return buildArcCityHtml(locale);
    case "morph":
      return buildMorphHtml(locale);
    case "studio-ledger":
    case "pulse-booking":
    case "foundry-erp":
      return buildBusinessSuiteHtml(id, locale);
    case "atelier-nova":
    case "casa-verde":
    case "lumen-clinic":
    case "northstar-legal":
    case "velora-commerce":
    case "festival-onda":
      return buildPremiumSiteHtml(id, locale);
  }
}
