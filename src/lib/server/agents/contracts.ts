import { z } from "zod";
import {
  ArchitectureSchema,
  DesignDirectionSchema,
  DesignPortfolioSchema,
  GemPatchSchema,
  ProductPlanSchema,
  ReviewResultSchema,
} from "@/lib/server/agents/types";
import {
  EchoAccessibilityReportSchema,
  SwiftPerformanceReportSchema,
  TwinBrowserReportSchema,
} from "@/lib/server/quality/types";

const LocaleSchema = z.enum(["it", "en", "es", "fr", "de", "pt"]);
const BuildModeSchema = z.enum(["generate", "iterate", "debug", "host"]);
const BuildLevelSchema = z.enum(["prototype", "production"]);
const GearSchema = z.enum(["auto", "house", "fast"]);
const PromptSchema = z.string().trim().min(1).max(2_000);
const LanguageSchema = z.string().trim().min(2).max(32);
const HtmlDocumentSchema = z
  .string()
  .min(400)
  .max(256_000)
  .refine(
    (html) => /<(?:!doctype\s+html|html)[\s>]/i.test(html) && /<\/html>/i.test(html),
    "HTML_DOCUMENT_INVALID",
  );

const HelixInputSchema = z
  .object({
    jobId: z.string().min(8).max(160),
    prompt: PromptSchema,
    locale: LocaleSchema,
    mode: BuildModeSchema,
    buildLevel: BuildLevelSchema,
    currentHtml: z.string().max(256_000).nullable(),
    gear: GearSchema,
    max: z.boolean(),
  })
  .strict();

const HelixOutputSchema = z
  .object({
    html: HtmlDocumentSchema,
    usedAi: z.literal(true),
    title: z.string().trim().min(1).max(240),
  })
  .strict();

const NovaInputSchema = z
  .object({
    prompt: PromptSchema,
    language: LanguageSchema,
    briefLock: z.string().trim().min(1).max(4_000),
  })
  .strict();

const AtlasInputSchema = z
  .object({
    prompt: PromptSchema,
    language: LanguageSchema,
    briefLock: z.string().trim().min(1).max(4_000),
    plan: ProductPlanSchema.nullable(),
  })
  .strict();

const LumenInputSchema = z
  .object({
    prompt: PromptSchema,
    language: LanguageSchema,
    plan: ProductPlanSchema.nullable(),
    architecture: ArchitectureSchema.nullable(),
  })
  .strict();

const ForgeSharedInputShape = {
  prompt: PromptSchema,
  locale: LocaleSchema,
  language: LanguageSchema,
  mode: BuildModeSchema,
  plan: ProductPlanSchema.nullable(),
  architecture: ArchitectureSchema.nullable(),
  design: DesignDirectionSchema.nullable(),
  notes: z.array(z.string().trim().min(1).max(2_000)).max(64),
} as const;

const ForgeUiInputSchema = z
  .object({
    ...ForgeSharedInputShape,
    currentHtml: z.null(),
  })
  .strict();

const ForgeLogicInputSchema = z
  .object({
    ...ForgeSharedInputShape,
    currentHtml: HtmlDocumentSchema,
  })
  .strict();

const IrisInputSchema = z
  .object({
    prompt: PromptSchema,
    language: LanguageSchema,
    html: HtmlDocumentSchema,
    plan: ProductPlanSchema.nullable(),
    consoleErrors: z.array(z.string().max(4_000)).max(200),
    staticFindings: z.array(z.string().max(4_000)).max(200),
    acceptanceCriteria: z.array(z.string().min(1).max(2_000)).max(100),
    artifactSha256: z.string().regex(/^[0-9a-f]{64}$/),
    twin: TwinBrowserReportSchema,
    echo: EchoAccessibilityReportSchema,
    swift: SwiftPerformanceReportSchema,
    screenshotBase64: z.string().max(8_000_000).optional(),
  })
  .strict();

const SuperiorInputSchema = z
  .object({
    prompt: PromptSchema,
    locale: LocaleSchema,
    language: LanguageSchema,
    html: HtmlDocumentSchema,
    review: ReviewResultSchema,
  })
  .strict();

const GemPatchInputSchema = z
  .object({
    prompt: PromptSchema,
    locale: LocaleSchema,
    language: LanguageSchema,
    html: HtmlDocumentSchema,
    gemName: z.string().trim().min(1).max(80),
    brief: z.string().trim().min(1).max(4_000),
  })
  .strict();

export type AgentContractKind = "orchestrator" | "ai_agent" | "review_agent" | "patch_agent";

export type AgentAllowedTool =
  | "persistBuildJob"
  | "requestAiCompletion"
  | "runTwin"
  | "computeScore"
  | "finalizeReleaseCandidate";

export type AgentModel = "gpt-5.6-terra" | null;

export const AgentExecutionStatusSchema = z.enum([
  "queued",
  "running",
  "done",
  "error",
  "skipped",
]);

export const AgentExecutionErrorSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/),
    retryable: z.boolean(),
    detailRedacted: z.string().trim().min(1).max(2_000),
  })
  .strict();

const AGENT_VALIDATION_POLICY = {
  mode: "zod_and_sha256",
  artifactRequiredOnDone: true,
} as const;

export type AgentContract<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
> = Readonly<{
  id: string;
  kind: AgentContractKind;
  version: `${number}.${number}.${number}`;
  role: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  allowedTools: readonly AgentAllowedTool[];
  timeoutMs: number;
  maxRetries: number;
  model: AgentModel;
  maxTokens: number;
  /** Per-invocation policy ceiling, not a measured or provider-invoiced cost. */
  maxCostUsd: number;
  /** Exact integer policy ceiling; one USD is 10^10 ticks. */
  maxCostUsdTicks: `${bigint}`;
  artifact: string;
  validation: typeof AGENT_VALIDATION_POLICY;
  /** Runtime status vocabulary accepted by this contract. */
  status: typeof AgentExecutionStatusSchema;
  /** Structured, redacted runtime error accepted by this contract. */
  error: z.ZodNullable<typeof AgentExecutionErrorSchema>;
}>;

function defineContract<const TInput extends z.ZodType, const TOutput extends z.ZodType>(
  contract: AgentContract<TInput, TOutput>,
): AgentContract<TInput, TOutput> {
  return contract;
}

/**
 * Truthful contracts for the orchestration service and each model-backed call
 * Helix currently makes. Forge UI and Logic are separate executions and Gem
 * output is a hash-fenced fragment patch rather than a full-document rewrite.
 */
export const AGENT_CONTRACTS = {
  helix: defineContract({
    id: "helix",
    kind: "orchestrator",
    version: "2.0.0",
    role: "Supervise the build, persist checkpoints, and enforce release gates.",
    inputSchema: HelixInputSchema,
    outputSchema: HelixOutputSchema,
    allowedTools: ["persistBuildJob", "runTwin", "computeScore", "finalizeReleaseCandidate"],
    timeoutMs: 720_000,
    maxRetries: 1,
    model: null,
    maxTokens: 0,
    maxCostUsd: 0,
    maxCostUsdTicks: "0",
    artifact: "validated_release_candidate",
    validation: AGENT_VALIDATION_POLICY,
    status: AgentExecutionStatusSchema,
    error: AgentExecutionErrorSchema.nullable(),
  }),
  nova: defineContract({
    id: "nova",
    kind: "ai_agent",
    version: "3.1.0",
    role: "Turn the brief into a structured PRD, MVP, scope, and acceptance criteria.",
    inputSchema: NovaInputSchema,
    outputSchema: ProductPlanSchema,
    allowedTools: ["requestAiCompletion"],
    timeoutMs: 40_000,
    maxRetries: 0,
    model: "gpt-5.6-terra",
    maxTokens: 2_400,
    maxCostUsd: 0.25,
    maxCostUsdTicks: "2500000000",
    artifact: "product_plan",
    validation: AGENT_VALIDATION_POLICY,
    status: AgentExecutionStatusSchema,
    error: AgentExecutionErrorSchema.nullable(),
  }),
  atlas: defineContract({
    id: "atlas",
    kind: "ai_agent",
    version: "3.0.0",
    role: "Turn the brief and PRD into routes, data flow, contracts, and failure modes.",
    inputSchema: AtlasInputSchema,
    outputSchema: ArchitectureSchema,
    allowedTools: ["requestAiCompletion"],
    timeoutMs: 40_000,
    maxRetries: 0,
    model: "gpt-5.6-terra",
    maxTokens: 1_400,
    maxCostUsd: 0.3,
    maxCostUsdTicks: "3000000000",
    artifact: "architecture_plan",
    validation: AGENT_VALIDATION_POLICY,
    status: AgentExecutionStatusSchema,
    error: AgentExecutionErrorSchema.nullable(),
  }),
  lumen: defineContract({
    id: "lumen",
    kind: "ai_agent",
    version: "3.0.0",
    role: "Produce three distinct visual directions for deterministic scoring.",
    inputSchema: LumenInputSchema,
    outputSchema: DesignPortfolioSchema,
    allowedTools: ["requestAiCompletion"],
    timeoutMs: 40_000,
    maxRetries: 0,
    model: "gpt-5.6-terra",
    maxTokens: 1_800,
    maxCostUsd: 0.35,
    maxCostUsdTicks: "3500000000",
    artifact: "three_direction_design_portfolio",
    validation: AGENT_VALIDATION_POLICY,
    status: AgentExecutionStatusSchema,
    error: AgentExecutionErrorSchema.nullable(),
  }),
  forgeUi: defineContract({
    id: "forgeUi",
    kind: "ai_agent",
    version: "3.0.0",
    role: "Build views, content, components, hooks, and the selected design system.",
    inputSchema: ForgeUiInputSchema,
    outputSchema: HtmlDocumentSchema,
    allowedTools: ["requestAiCompletion"],
    timeoutMs: 120_000,
    maxRetries: 0,
    model: "gpt-5.6-terra",
    maxTokens: 8_192,
    maxCostUsd: 1.5,
    maxCostUsdTicks: "15000000000",
    artifact: "forge_structure_ui_html",
    validation: AGENT_VALIDATION_POLICY,
    status: AgentExecutionStatusSchema,
    error: AgentExecutionErrorSchema.nullable(),
  }),
  forgeLogic: defineContract({
    id: "forgeLogic",
    kind: "ai_agent",
    version: "3.0.0",
    role: "Add state, interactions, forms, validation, and events to the UI artifact.",
    inputSchema: ForgeLogicInputSchema,
    outputSchema: HtmlDocumentSchema,
    allowedTools: ["requestAiCompletion"],
    timeoutMs: 120_000,
    maxRetries: 1,
    model: "gpt-5.6-terra",
    maxTokens: 8_192,
    maxCostUsd: 1.5,
    maxCostUsdTicks: "15000000000",
    artifact: "forge_logic_html",
    validation: AGENT_VALIDATION_POLICY,
    status: AgentExecutionStatusSchema,
    error: AgentExecutionErrorSchema.nullable(),
  }),
  iris: defineContract({
    id: "iris",
    kind: "review_agent",
    version: "3.0.0",
    role: "Review the runtime evidence and return a structured QA decision.",
    inputSchema: IrisInputSchema,
    outputSchema: ReviewResultSchema,
    allowedTools: ["requestAiCompletion"],
    timeoutMs: 45_000,
    maxRetries: 0,
    model: "gpt-5.6-terra",
    maxTokens: 800,
    maxCostUsd: 0.2,
    maxCostUsdTicks: "2000000000",
    artifact: "qa_review",
    validation: AGENT_VALIDATION_POLICY,
    status: AgentExecutionStatusSchema,
    error: AgentExecutionErrorSchema.nullable(),
  }),
  superior: defineContract({
    id: "superior",
    kind: "patch_agent",
    version: "2.0.0",
    role: "Apply Iris and local must-fix findings to the validated HTML artifact.",
    inputSchema: SuperiorInputSchema,
    outputSchema: HtmlDocumentSchema,
    allowedTools: ["requestAiCompletion"],
    timeoutMs: 120_000,
    maxRetries: 0,
    model: "gpt-5.6-terra",
    maxTokens: 8_192,
    maxCostUsd: 1.5,
    maxCostUsdTicks: "15000000000",
    artifact: "superior_patched_html",
    validation: AGENT_VALIDATION_POLICY,
    status: AgentExecutionStatusSchema,
    error: AgentExecutionErrorSchema.nullable(),
  }),
  gemPatch: defineContract({
    id: "gemPatch",
    kind: "patch_agent",
    version: "3.0.0",
    role: "Return one hash-fenced, exact-fragment change without rewriting unrelated HTML.",
    inputSchema: GemPatchInputSchema,
    outputSchema: GemPatchSchema,
    allowedTools: ["requestAiCompletion"],
    timeoutMs: 25_000,
    maxRetries: 0,
    model: "gpt-5.6-terra",
    maxTokens: 3_000,
    maxCostUsd: 0.5,
    maxCostUsdTicks: "5000000000",
    artifact: "controlled_gem_patch",
    validation: AGENT_VALIDATION_POLICY,
    status: AgentExecutionStatusSchema,
    error: AgentExecutionErrorSchema.nullable(),
  }),
} as const;

export type AgentContractId = keyof typeof AGENT_CONTRACTS;
export type AgentContractInput<TId extends AgentContractId> = z.input<
  (typeof AGENT_CONTRACTS)[TId]["inputSchema"]
>;
export type AgentContractOutput<TId extends AgentContractId> = z.output<
  (typeof AGENT_CONTRACTS)[TId]["outputSchema"]
>;
