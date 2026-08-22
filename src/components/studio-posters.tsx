import type { ReactNode } from "react";
import type { PremiumDemoId } from "@/lib/premium-demos";

type PosterProps = { ink: string; paper: string; metal: string };

function scene(id: string, ink: string, paper: string, metal: string, body: ReactNode) {
  return (
    <svg viewBox="0 0 640 480" className="atelier-poster-art" role="presentation" aria-hidden>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={paper} stopOpacity="0.22" />
          <stop offset="55%" stopColor={ink} />
        </linearGradient>
        <radialGradient id={`${id}-lamp`} cx="38%" cy="22%" r="48%">
          <stop offset="0%" stopColor={paper} stopOpacity="0.5" />
          <stop offset="70%" stopColor={metal} stopOpacity="0.08" />
          <stop offset="100%" stopColor={ink} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="640" height="480" fill={ink} />
      <rect width="640" height="480" fill={`url(#${id}-sky)`} />
      <circle cx="240" cy="110" r="180" fill={`url(#${id}-lamp)`} />
      {body}
    </svg>
  );
}

export function StudioPosterArt({
  id,
  ink,
  paper,
  metal,
}: { id: PremiumDemoId | "mercedes-epoque" | "italvia" | "mini4wd-lab" } & PosterProps) {
  const p = { ink, paper, metal };
  switch (id) {
    case "velvet-table":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <ellipse cx="320" cy="360" rx="190" ry="18" fill="#000" opacity="0.45" />
          <path d="M140 300 H500 L470 340 H170 Z" fill={p.paper} />
          <path d="M170 340 H470 L458 368 H182 Z" fill={p.metal} />
          <rect x="300" y="214" width="10" height="88" fill={p.metal} />
          <ellipse cx="305" cy="208" rx="36" ry="14" fill={p.paper} opacity="0.85" />
        </>,
      );
    case "cutcraft":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <path d="M90 390 H560 L520 420 H120 Z" fill="#1a1612" />
          <path d="M180 250 L430 210 L450 250 L200 292 Z" fill={p.paper} />
          <path d="M430 210 L510 168 L528 198 L450 250 Z" fill={p.metal} />
        </>,
      );
    case "nexora-crm":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <rect x="150" y="140" width="340" height="220" rx="10" fill="#161820" />
          <rect x="170" y="168" width="140" height="10" rx="5" fill={p.paper} opacity="0.7" />
          <rect x="170" y="198" width="220" height="8" rx="4" fill={p.metal} opacity="0.45" />
          <rect x="170" y="226" width="180" height="8" rx="4" fill={p.metal} opacity="0.28" />
          <rect x="400" y="250" width="64" height="64" rx="8" fill={p.paper} />
        </>,
      );
    case "sonora":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <circle cx="320" cy="250" r="118" fill="#16130f" />
          <circle cx="320" cy="250" r="78" fill={p.paper} />
          <circle cx="320" cy="250" r="18" fill={p.ink} />
          <circle cx="320" cy="250" r="6" fill={p.metal} />
        </>,
      );
    case "toonverse":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <circle cx="300" cy="210" r="70" fill={p.paper} />
          <path d="M250 300 C270 250 330 250 350 300 L340 390 H260 Z" fill={p.metal} />
          <circle cx="278" cy="200" r="7" fill={p.ink} />
          <circle cx="322" cy="200" r="7" fill={p.ink} />
        </>,
      );
    case "orbital":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <ellipse cx="320" cy="250" rx="210" ry="70" fill="none" stroke={p.metal} strokeWidth="3" />
          <circle cx="320" cy="250" r="78" fill={p.paper} />
          <circle cx="510" cy="250" r="10" fill={p.metal} />
        </>,
      );
    case "stormglass":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <path d="M0 340 C120 300 220 380 320 340 C420 300 520 370 640 320 V480 H0 Z" fill="#0e1a20" />
          <path d="M286 150 H354 L372 300 H268 Z" fill={p.paper} opacity="0.55" />
          <ellipse cx="320" cy="148" rx="40" ry="10" fill={p.metal} />
        </>,
      );
    case "world-pulse":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <circle cx="320" cy="250" r="120" fill="none" stroke={p.paper} strokeWidth="2" />
          <path d="M220 230 C260 210 300 260 340 220 C380 190 430 240 450 260" fill="none" stroke={p.metal} strokeWidth="8" />
          <circle cx="340" cy="220" r="8" fill={p.paper} />
        </>,
      );
    case "roomverse":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <path d="M120 360 L320 150 L520 360 Z" fill="none" stroke={p.paper} strokeWidth="3" />
          <rect x="250" y="250" width="140" height="110" fill={p.metal} opacity="0.35" />
          <rect x="300" y="280" width="40" height="80" fill={p.paper} />
        </>,
      );
    case "aurelion-motors":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <path d="M80 300 H560" stroke="#2a261c" strokeWidth="2" />
          <path d="M110 286 C160 250 210 220 280 216 H430 C500 216 540 248 580 270 L560 300 H130 Z" fill={p.paper} />
          <circle cx="220" cy="300" r="26" fill={p.ink} stroke={p.metal} strokeWidth="3" />
          <circle cx="500" cy="300" r="26" fill={p.ink} stroke={p.metal} strokeWidth="3" />
        </>,
      );
    case "vela-noir":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <path d="M260 80 C360 90 390 180 340 250 C420 280 400 390 300 420 C220 390 210 280 260 80 Z" fill={p.paper} />
          <path d="M280 90 C320 160 300 260 290 400" fill="none" stroke={p.metal} strokeWidth="3" />
        </>,
      );
    case "maison-27":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <path d="M160 250 L320 120 L480 250 V400 H160 Z" fill={p.paper} />
          <rect x="290" y="300" width="60" height="100" fill={p.ink} />
          <rect x="200" y="280" width="48" height="40" fill={p.metal} opacity="0.55" />
          <rect x="392" y="280" width="48" height="40" fill={p.metal} opacity="0.55" />
        </>,
      );
    case "studio-monolith":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <rect x="250" y="90" width="140" height="300" fill={p.paper} />
          <rect x="250" y="90" width="28" height="300" fill={p.metal} opacity="0.35" />
        </>,
      );
    case "nestra-estates":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <path d="M0 340 C180 300 300 360 640 310 V480 H0 Z" fill="#1a1c14" />
          <rect x="230" y="180" width="180" height="160" fill={p.paper} />
          <path d="M210 180 L320 110 L430 180 Z" fill={p.metal} />
        </>,
      );
    case "lumen-festival":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <circle cx="200" cy="160" r="8" fill={p.paper} />
          <circle cx="320" cy="110" r="14" fill={p.metal} />
          <circle cx="440" cy="170" r="8" fill={p.paper} />
          <path d="M180 360 L320 180 L460 360 Z" fill="none" stroke={p.paper} strokeWidth="3" />
        </>,
      );
    case "cinematica":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <rect x="90" y="110" width="460" height="260" rx="8" fill="#161210" />
          <rect x="120" y="140" width="400" height="200" fill={p.paper} opacity="0.2" />
          <circle cx="160" cy="160" r="10" fill={p.metal} />
          <circle cx="480" cy="160" r="10" fill={p.metal} />
        </>,
      );
    case "atlas-command":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <polygon points="320,80 540,250 320,420 100,250" fill="none" stroke={p.paper} strokeWidth="3" />
          <circle cx="320" cy="250" r="16" fill={p.metal} />
        </>,
      );
    case "worldforge":
      return scene(
        id,
        p.ink,
        p.paper,
        p.metal,
        <>
          <path d="M220 320 H420 L390 380 H250 Z" fill={p.metal} />
          <rect x="300" y="160" width="40" height="160" fill={p.paper} />
          <circle cx="320" cy="150" r="28" fill={p.paper} />
        </>,
      );
    case "mercedes-epoque":
      return scene(
        id,
        "#0b0b0b",
        "#f3ebda",
        "#c9a84c",
        <>
          <path d="M90 300 H560" stroke="#2c281e" strokeWidth="2" />
          <path d="M120 280 C180 240 240 210 310 208 H430 C510 208 550 240 590 268 L570 296 H140 Z" fill="#f3ebda" />
          <circle cx="230" cy="296" r="24" fill="#0b0b0b" stroke="#c9a84c" strokeWidth="3" />
          <circle cx="500" cy="296" r="24" fill="#0b0b0b" stroke="#c9a84c" strokeWidth="3" />
        </>,
      );
    case "italvia":
      return scene(
        id,
        "#10140f",
        "#ece6d2",
        "#8a9a6a",
        <>
          <path d="M0 220 C160 180 280 240 420 170 C520 130 600 180 640 160 V480 H0 Z" fill="#1c2418" />
          <path d="M0 340 C200 300 360 380 640 310 V480 H0 Z" fill="#2a2618" />
          <path d="M0 390 C180 360 340 410 640 370" fill="none" stroke="#ece6d2" strokeWidth="6" />
        </>,
      );
    case "mini4wd-lab":
      return scene(
        id,
        "#0c0e12",
        "#dce4ea",
        "#8aa4b8",
        <>
          <path d="M80 300 C180 240 300 250 420 230 C500 220 560 250 600 270 L560 320 H120 Z" fill="#dce4ea" />
          <circle cx="210" cy="318" r="22" fill="#0c0e12" stroke="#8aa4b8" strokeWidth="3" />
          <circle cx="500" cy="318" r="22" fill="#0c0e12" stroke="#8aa4b8" strokeWidth="3" />
        </>,
      );
    default:
      return scene(id, p.ink, p.paper, p.metal, <rect x="240" y="160" width="160" height="180" fill={p.paper} />);
  }
}
