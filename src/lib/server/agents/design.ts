import type {
  DesignDirection,
  DesignPortfolio,
  DesignSelection,
} from "@/lib/server/agents/types";

function channel(hex: string, start: number): number {
  const raw = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
  return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(left: string, right: string): number {
  const a = luminance(left);
  const b = luminance(right);
  if (a === null || b === null) return 0;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function scoreDirection(
  direction: DesignDirection,
  others: DesignDirection[],
): { id: string; score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 35;
  const ratio = contrast(direction.palette.bg, direction.palette.fg);
  if (ratio >= 7) {
    score += 25;
    reasons.push(`Strong text contrast ${ratio.toFixed(1)}:1`);
  } else if (ratio >= 4.5) {
    score += 18;
    reasons.push(`Usable text contrast ${ratio.toFixed(1)}:1`);
  } else {
    score -= 20;
    reasons.push(`Weak text contrast ${ratio.toFixed(1)}:1`);
  }
  const distinctFields = [
    direction.palette.accent,
    direction.fonts.display,
    direction.layout,
    direction.density,
    direction.componentGeometry,
  ];
  const distinctCount = distinctFields.filter((value, index) =>
    others.every((other) => {
      const compared = [
        other.palette.accent,
        other.fonts.display,
        other.layout,
        other.density,
        other.componentGeometry,
      ][index];
      return value.toLowerCase() !== compared.toLowerCase();
    }),
  ).length;
  score += distinctCount * 6;
  reasons.push(`${distinctCount}/5 art-direction axes are unique`);
  if (/\b(inter|roboto)\b/i.test(`${direction.fonts.display} ${direction.fonts.body}`)) {
    score -= 20;
    reasons.push("Uses a forbidden generic typeface");
  } else {
    reasons.push("Distinctive type pairing");
  }
  return { id: direction.id, score: Math.max(0, Math.min(100, score)), reasons };
}

export function selectDesignDirection(portfolio: DesignPortfolio): DesignSelection {
  const scores = portfolio.directions.map((direction) =>
    scoreDirection(
      direction,
      portfolio.directions.filter((candidate) => candidate.id !== direction.id),
    ),
  );
  const selected = [...scores].sort((left, right) => right.score - left.score)[0];
  return {
    directions: portfolio.directions,
    selectedId: selected.id,
    selectionRationale: selected.reasons.join(" · "),
    scores,
  };
}
