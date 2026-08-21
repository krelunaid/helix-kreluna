import { z } from "zod";
import type { BuildJob } from "@/lib/agent-types";
import type { Locale } from "@/lib/i18n-core";
import type {
  EchoAccessibilityReport,
  SwiftPerformanceReport,
  TwinBrowserReport,
} from "@/lib/server/quality/types";

export type CrewMessage = {
  role: "user" | "assistant";
  content: string;
  kind?: "build" | "iterate" | "debug" | "host";
  agent?: string;
};

export const ProductPlanSchema = z.object({
  title: z.string().min(1),
  type: z.string().min(1),
  pitch: z.string().min(1),
  target: z.string().min(1),
  problem: z.string().min(1),
  useCases: z.array(z.string().min(1)).min(1),
  mvp: z.array(z.string().min(1)).min(1),
  scope: z.object({
    p0: z.array(z.string().min(1)).min(1),
    p1: z.array(z.string().min(1)),
    p2: z.array(z.string().min(1)),
  }),
  nonGoals: z.array(z.string().min(1)),
  userJourneys: z.array(z.string().min(1)).min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  screens: z
    .array(
      z.object({
        name: z.string().min(1),
        purpose: z.string().min(1),
      }),
    )
    .min(1),
  features: z.array(z.string().min(1)).min(1),
  data: z.array(z.string().min(1)),
  success: z.string().min(1),
  backend: z.string().optional(),
  integrations: z.array(z.string()).optional(),
});

export type ProductPlan = z.infer<typeof ProductPlanSchema>;

export const ArchitectureSchema = z.object({
  productType: z.string().min(1),
  frontendArchitecture: z.string().min(1),
  backendArchitecture: z.string().min(1),
  dataFlow: z.array(z.string().min(1)).min(1),
  screenMap: z.array(z.string().min(1)).min(1),
  routeMap: z.array(z.string().min(1)).min(1),
  apiContracts: z.array(z.string().min(1)),
  databaseRequirements: z.string().min(1),
  authModel: z.string().min(1),
  permissions: z.array(z.string().min(1)),
  integrations: z.array(z.string().min(1)),
  deploymentTarget: z.string().min(1),
  failureModes: z.array(z.string().min(1)).min(1),
});

export type Architecture = z.infer<typeof ArchitectureSchema>;

export const DesignDirectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mood: z.string().min(1),
  palette: z.object({
    bg: z.string().min(1),
    fg: z.string().min(1),
    accent: z.string().min(1),
    muted: z.string().min(1),
    elevated: z.string().min(1),
  }),
  fonts: z.object({
    display: z.string().min(1),
    body: z.string().min(1),
  }),
  layout: z.string().min(1),
  density: z.string().min(1),
  grid: z.string().min(1),
  motion: z.string().min(1),
  iconography: z.string().min(1),
  componentGeometry: z.string().min(1),
  imagery: z.string().min(1),
  references: z.array(z.string().min(1)).min(1),
  forbiddenCliches: z.array(z.string().min(1)).min(1),
});

export type DesignDirection = z.infer<typeof DesignDirectionSchema>;

export const DesignPortfolioSchema = z
  .object({
    directions: z.array(DesignDirectionSchema).length(3),
  })
  .superRefine((portfolio, context) => {
    const unique = (values: string[]) => new Set(values.map((value) => value.toLowerCase())).size;
    if (unique(portfolio.directions.map((direction) => direction.id)) !== 3) {
      context.addIssue({ code: "custom", message: "Direction ids must be unique" });
    }
    if (unique(portfolio.directions.map((direction) => direction.palette.accent)) !== 3) {
      context.addIssue({ code: "custom", message: "Accent systems must be distinct" });
    }
    if (unique(portfolio.directions.map((direction) => direction.layout)) !== 3) {
      context.addIssue({ code: "custom", message: "Layouts must be distinct" });
    }
  });

export type DesignPortfolio = z.infer<typeof DesignPortfolioSchema>;

export const DesignSelectionSchema = z
  .object({
    directions: z.array(DesignDirectionSchema).length(3),
    selectedId: z.string().min(1),
    selectionRationale: z.string().min(1),
    scores: z.array(
      z.object({
        id: z.string().min(1),
        score: z.number().min(0).max(100),
        reasons: z.array(z.string().min(1)).min(1),
      }),
    ).length(3),
  })
  .superRefine((selection, context) => {
    const directionIds = new Set(selection.directions.map((direction) => direction.id));
    const scoreIds = new Set(selection.scores.map((score) => score.id));
    if (!directionIds.has(selection.selectedId)) {
      context.addIssue({ code: "custom", message: "Selected direction is missing" });
    }
    if (
      directionIds.size !== 3 ||
      scoreIds.size !== 3 ||
      [...directionIds].some((id) => !scoreIds.has(id))
    ) {
      context.addIssue({ code: "custom", message: "Direction scores do not match" });
    }
  });

export type DesignSelection = z.infer<typeof DesignSelectionSchema>;

export const IrisAssessmentSchema = z
  .object({
    score: z.number().min(1).max(10),
    recommendation: z.enum(["pass", "fail"]),
    issues: z.array(z.string()),
    mustFix: z.array(z.string()),
  })
  .strict();

export type IrisAssessment = z.infer<typeof IrisAssessmentSchema>;

export const ReviewResultSchema = z
  .object({
    artifactSha256: z.string().regex(/^[0-9a-f]{64}$/),
    status: z.enum(["passed", "failed", "inconclusive"]),
    evidence: z.enum(["browser_assisted", "static_only"]),
    confidence: z.number().min(0).max(1),
    score: z.number().min(1).max(10),
    pass: z.boolean(),
    issues: z.array(z.string()),
    mustFix: z.array(z.string()),
  })
  .strict()
  .superRefine((review, context) => {
    if (review.pass !== (review.status === "passed")) {
      context.addIssue({
        code: "custom",
        message: "Iris pass must match the passed status",
      });
    }
    if (review.evidence === "static_only" && review.status === "passed") {
      context.addIssue({
        code: "custom",
        message: "Static-only review cannot certify runtime success",
      });
    }
  });

export type ReviewResult = z.infer<typeof ReviewResultSchema>;

export const GemPatchValidationCheckSchema = z.enum([
  "html_document_valid",
  "replacement_present_once",
  "original_fragment_absent",
]);

export type GemPatchValidationCheck = z.infer<typeof GemPatchValidationCheckSchema>;

const REQUIRED_GEM_PATCH_VALIDATIONS = GemPatchValidationCheckSchema.options;

export const GemPatchSchema = z
  .object({
    target: z.string().min(1).max(240),
    operation: z.literal("replace_fragment"),
    before: z.string().min(1).max(24_000),
    beforeHash: z.string().regex(/^[0-9a-f]{64}$/),
    patch: z.string().min(1).max(32_000),
    validation: z
      .array(GemPatchValidationCheckSchema)
      .length(REQUIRED_GEM_PATCH_VALIDATIONS.length)
      .refine(
        (checks) =>
          REQUIRED_GEM_PATCH_VALIDATIONS.every((required) => checks.includes(required)) &&
          new Set(checks).size === checks.length,
        { message: "Every deterministic Gem patch validation must be declared exactly once" },
      ),
  })
  .refine((change) => change.before !== change.patch, {
    message: "Patch must change the target",
  });

export type GemPatch = z.infer<typeof GemPatchSchema>;

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatGrokOptions = {
  system: string;
  user: string | ChatContentPart[];
  maxTokens: number;
  timeoutMs: number;
  temperature: number;
  effort?: "low" | "high";
  model?: string;
  job?: BuildJob;
  agent?: string;
};

export class AgentOutputError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable = true) {
    super(code);
    this.name = "AgentOutputError";
    this.code = code;
    this.retryable = retryable;
  }
}

export class LegacyBuildEndpointRetiredError extends Error {
  readonly code = "LEGACY_BUILD_ENDPOINT_RETIRED";
  readonly status = 410;

  constructor() {
    super("Use the billed project build flow.");
    this.name = "LegacyBuildEndpointRetiredError";
  }
}

export type RunCrewResult = {
  html: string;
  usedAi: boolean;
  title: string;
};

export type AgentBuildInput = {
  prompt: string;
  locale: Locale;
  lang: string;
  mode: BuildJob["mode"];
  currentHtml: string | null;
  plan: ProductPlan | null;
  architecture: Architecture | null;
  design: DesignDirection | null;
  extra: string[];
  job: BuildJob;
};

export type AgentReviewInput = {
  prompt: string;
  lang: string;
  html: string;
  plan: ProductPlan | null;
  consoleErrors: string[];
  staticFindings: string[];
  acceptanceCriteria: string[];
  artifactSha256: string;
  twin: TwinBrowserReport;
  echo: EchoAccessibilityReport;
  swift: SwiftPerformanceReport;
  shot?: string;
  job: BuildJob;
};

export type AgentGemInput = {
  prompt: string;
  lang: string;
  locale: Locale;
  html: string;
  gem: string;
  brief: string;
  job: BuildJob;
};

export type AgentFixInput = {
  prompt: string;
  lang: string;
  locale: Locale;
  html: string;
  review: ReviewResult;
  job: BuildJob;
};
