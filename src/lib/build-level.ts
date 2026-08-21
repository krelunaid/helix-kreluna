import { ACTIONS, type ActionId } from "@/lib/plans";

export const BUILD_LEVELS = ["prototype", "production"] as const;
export type BuildLevel = (typeof BUILD_LEVELS)[number];

export const BUILD_LEVEL_POLICY_VERSION = "helix-build-level-v2";

export type BuildLevelReasonCode =
  | "PRODUCTION_MODE_NOT_AVAILABLE"
  | "PRODUCTION_MODE_REQUIRES_ACCOUNT"
  | "PRODUCTION_ACTION_UNSUPPORTED"
  | "INVALID_BUILD_LEVEL";

export type BuildQuote = {
  buildLevel: BuildLevel;
  action: Exclude<ActionId, "host">;
  available: boolean;
  credits: number | null;
  policyVersion: typeof BUILD_LEVEL_POLICY_VERSION;
  reasonCode?: BuildLevelReasonCode;
  deliverables: string[];
  limitations: string[];
};

const PROTOTYPE_CREDITS: Record<BuildQuote["action"], number> = {
  generate: ACTIONS.generate.credits,
  iterate: ACTIONS.iterate.credits,
  debug: ACTIONS.debug.credits,
};

export class BuildLevelError extends Error {
  readonly code: BuildLevelReasonCode;
  readonly status: 400 | 409;

  constructor(code: BuildLevelReasonCode) {
    super(code);
    this.name = "BuildLevelError";
    this.code = code;
    this.status = code === "INVALID_BUILD_LEVEL" ? 400 : 409;
  }
}

/**
 * Missing legacy values intentionally map to prototype. Any explicit unknown
 * value is rejected so a future client typo can never downgrade a requested
 * production build to HTML.
 */
export function parseBuildLevel(value: unknown): BuildLevel {
  if (value === undefined || value === null || value === "") return "prototype";
  if (value === "prototype" || value === "production") return value;
  throw new BuildLevelError("INVALID_BUILD_LEVEL");
}

export function publicProductionBuildCredits(
  environment: Readonly<Record<string, unknown>> = import.meta.env,
): number | null {
  if (environment.VITE_PRODUCTION_BUILDS_ENABLED !== "true") return null;
  const credits = Number(environment.VITE_PRODUCTION_CREDITS);
  return Number.isInteger(credits) && credits > 0 && credits <= 100_000
    ? credits
    : null;
}

export function getBuildQuote(input: {
  buildLevel: BuildLevel;
  action?: BuildQuote["action"];
  authenticated: boolean;
  productionCredits?: number | null;
}): BuildQuote {
  const action = input.action ?? "generate";
  if (input.buildLevel === "production") {
    const configuredCredits = input.productionCredits;
    const configured =
      Number.isInteger(configuredCredits) &&
      Number(configuredCredits) > 0 &&
      Number(configuredCredits) <= 100_000;
    const available = input.authenticated && action === "generate" && configured;
    return {
      buildLevel: "production",
      action,
      available,
      credits: available ? Number(configuredCredits) : null,
      policyVersion: BUILD_LEVEL_POLICY_VERSION,
      ...(!available
        ? {
            reasonCode: !input.authenticated
              ? ("PRODUCTION_MODE_REQUIRES_ACCOUNT" as const)
              : action !== "generate"
                ? ("PRODUCTION_ACTION_UNSUPPORTED" as const)
                : ("PRODUCTION_MODE_NOT_AVAILABLE" as const),
          }
        : {}),
      deliverables: [
        "Versioned multi-file workspace",
        "Source, PRD, architecture, tests and deployment configuration",
        "Capability evidence bound to the approved workspace",
      ],
      limitations: [
        "Generation starts only when an authenticated isolated workspace runner and an explicit credit price are configured.",
        "A failed or missing Production configuration is never downgraded to Prototype.",
      ],
    };
  }
  return {
    buildLevel: "prototype",
    action,
    available: true,
    credits: PROTOTYPE_CREDITS[action],
    policyVersion: BUILD_LEVEL_POLICY_VERSION,
    deliverables: [
      "Single-page interactive web preview",
      "PRD, architecture, score and available QA evidence",
      "Approved source workspace export",
    ],
    limitations: [
      "Mock or in-memory data may be used.",
      "Backend, database, authentication and external integrations are not production services.",
    ],
  };
}

export function assertBuildLevelAvailable(input: {
  buildLevel: BuildLevel;
  action?: BuildQuote["action"];
  authenticated: boolean;
  productionCredits?: number | null;
}): BuildQuote {
  const quote = getBuildQuote(input);
  if (!quote.available) {
    throw new BuildLevelError(
      quote.reasonCode ?? "PRODUCTION_MODE_NOT_AVAILABLE",
    );
  }
  return quote;
}
