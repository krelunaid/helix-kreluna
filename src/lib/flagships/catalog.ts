import type { Locale } from "@/lib/i18n-core";
import { buildArcCityHtml } from "@/lib/flagships/arc-city";
import { buildMorphHtml } from "@/lib/flagships/morph";
import { buildNeuraHtml } from "@/lib/flagships/neura";
import { buildOrbitCommandHtml } from "@/lib/flagships/orbit-command";
import { buildSynapseHtml } from "@/lib/flagships/synapse";
import { buildVantaHtml } from "@/lib/flagships/vanta";
import {
  FLAGSHIP_IDS,
  flagshipCopy,
  type FlagshipId,
} from "@/lib/flagships/copy";

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

export type FlagshipEntry = {
  id: FlagshipId;
  title: string;
  brand: string;
  kind: string;
  prompt: string;
  capability: string;
  proof: string;
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
};

export const HOME_FLAGSHIP_IDS = ["morph", "vanta", "orbit-command"] as const;

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
      interactionTarget: 8,
      visual: VISUAL_SIGNATURES[id],
    };
  });
}

export function homeFlagshipsFor(locale: Locale): FlagshipEntry[] {
  const byId = new Map(flagshipFor(locale).map((entry) => [entry.id, entry]));
  return HOME_FLAGSHIP_IDS.map((id) => byId.get(id)).filter(
    (entry): entry is FlagshipEntry => Boolean(entry),
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
  }
}
