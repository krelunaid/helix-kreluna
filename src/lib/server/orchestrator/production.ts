import type { BuildJob } from "@/lib/agent-types";
import { classifyBrief } from "@/lib/brief";
import { HOUSE, type HouseId } from "@/lib/house";
import { LOCALE_NAME } from "@/lib/i18n-core";
import {
  PRODUCTION_ARTIFACT_CONTRACTS,
  PRODUCTION_STAGE_ORDER,
  buildProductionArtifactGraph,
  type ProductionArtifactGraph,
  type ProductionStageId,
} from "@/lib/production-artifact-graph";
import { AGENT_CONTRACTS } from "@/lib/server/agents/contracts";
import { agentArchitecture } from "@/lib/server/agents/atlas";
import { completeAgentExecution } from "@/lib/server/agents/execution";
import { agentBuild } from "@/lib/server/agents/forge";
import { isValidHtmlArtifact } from "@/lib/server/agents/html";
import { agentDesign } from "@/lib/server/agents/lumen";
import { agentPlan } from "@/lib/server/agents/nova";
import { sha256Hex } from "@/lib/server/agents/patch";
import {
  AgentOutputError,
  ArchitectureSchema,
  DesignSelectionSchema,
  ProductPlanSchema,
  type Architecture,
  type DesignSelection,
  type ProductPlan,
  type RunCrewResult,
} from "@/lib/server/agents/types";
import {
  HELIX_PIPELINE_VERSION,
  reconcileBuildJobPipeline,
} from "@/lib/server/jobs/pipeline";
import {
  checkpoint,
  loadPipeline,
  remember,
  setBrowserEvidenceStep,
  setStep,
  think,
} from "@/lib/server/orchestrator/state";
import { persistBuildJob } from "@/lib/server/persistence/build-jobs";
import { deriveProductionContext } from "@/lib/server/production/context";
import { assembleProductionSource } from "@/lib/server/production";
import {
  configuredNimbusEvidenceProvider,
  type NimbusDecisionEvidenceProvider,
} from "@/lib/server/production/nimbus-decision";
import {
  ProductionCreativeDirectionEvidenceSchema,
  type ProductionCreativeDirectionEvidence,
  ProductionForgeLogicIntentSchema,
  type ProductionForgeLogicIntent,
} from "@/lib/server/production/types";
import {
  createProductionInlinePreview,
  sealProductionBuildJobWorkspace,
} from "@/lib/server/release/production-workspace";
import {
  runProductionWorkspaceValidation,
  type WorkspaceRunnerValidationResult,
} from "@/lib/server/workspace-runner";
import { createProductionWorkspaceCandidate } from "@/lib/workspace";
import {
  assertProductionWorkspaceQualityPassed,
  productionWorkspaceQualityReportSha256,
  runProductionWorkspaceQualityPass,
} from "@/lib/server/quality/production-workspace";
import { runBrowserQuality } from "@/lib/server/quality/runner";
import { runIrisReview } from "@/lib/server/review/agents";

const PRODUCTION_HOUSE_IDS = [
  "gemini",
  "nova",
  "atlas",
  "lumen",
  "forge",
  "prism",
  "basalt",
  "key",
  "nexus",
  "vault",
  "quartz",
  "apex",
  "nimbus",
  "kiln",
  "aegis",
  "twin",
  "echo",
  "swift",
  "iris",
  "folio",
  "harbor",
  "seal",
] as const satisfies readonly HouseId[];

const HOUSE_ID_BY_STAGE = {
  prism: "prism",
  basalt: "basalt",
  key: "key",
  nexus: "nexus",
  vault: "vault",
  quartz: "quartz",
  // Forge UI/Logic are real model phases. Apex reports the separate,
  // deterministic client-to-domain binding stage traditionally named Forge
  // Integration in the artifact graph.
  forgeIntegration: "apex",
  nimbus: "nimbus",
} as const satisfies Readonly<Record<ProductionStageId, HouseId>>;

export type PreparedProductionWorkspace = {
  files: Record<string, string>;
  entrypoint: string;
  graph: ProductionArtifactGraph;
  candidate: Awaited<ReturnType<typeof createProductionWorkspaceCandidate>>["candidate"];
};

type ProductionCreativeRun = {
  evidence: ProductionCreativeDirectionEvidence;
  evidenceSha256: string;
  lumenArtifactSha256: string;
  forgeUiSha256: string;
  forgeLogicSha256: string;
};

function productionAgentArtifacts(creative: ProductionCreativeRun) {
  return {
    lumen: {
      contractId: "lumen" as const,
      artifact: "three_direction_design_portfolio" as const,
      artifactSha256: creative.lumenArtifactSha256,
      validation: "passed" as const,
    },
    forgeUi: {
      contractId: "forgeUi" as const,
      artifact: "forge_structure_ui_html" as const,
      artifactSha256: creative.forgeUiSha256,
      validation: "passed" as const,
    },
    forgeLogic: {
      contractId: "forgeLogic" as const,
      artifact: "forge_logic_html" as const,
      artifactSha256: creative.forgeLogicSha256,
      inputArtifactSha256: creative.forgeUiSha256,
      validation: "passed" as const,
    },
  };
}

function initializeProductionCheckpoint(job: BuildJob): void {
  if (!job.requestFingerprint) {
    throw new AgentOutputError("BUILD_JOB_FINGERPRINT_MISSING", false);
  }
  reconcileBuildJobPipeline(job, job.requestFingerprint);
}

function loadProductionPipeline(job: BuildJob): void {
  const active = [...PRODUCTION_HOUSE_IDS];
  const activeSet = new Set<HouseId>(active);
  const standby = HOUSE.map((agent) => agent.id).filter((id) => !activeSet.has(id));
  loadPipeline(
    job,
    active,
    standby,
    "Helix · Production source · AI planning, deterministic delivery, isolated validation",
  );
  setStep(job, "lumen", {
    kind: "ai_agent",
    version: AGENT_CONTRACTS.lumen.version,
    artifact: AGENT_CONTRACTS.lumen.artifact,
    detail: "Awaiting the approved PRD and architecture",
    validation: "not_run",
  });
  setStep(job, "forge", {
    kind: "ai_agent",
    version: `${AGENT_CONTRACTS.forgeUi.version}+${AGENT_CONTRACTS.forgeLogic.version}`,
    artifact: `${AGENT_CONTRACTS.forgeUi.artifact}+${AGENT_CONTRACTS.forgeLogic.artifact}`,
    detail: "Awaiting the scored Lumen direction",
    validation: "not_run",
  });
  for (const stageId of PRODUCTION_STAGE_ORDER) {
    const houseId = HOUSE_ID_BY_STAGE[stageId];
    const contract = PRODUCTION_ARTIFACT_CONTRACTS[stageId];
    setStep(job, houseId, {
      kind: stageId === "quartz" ? "validator" : "service",
      version: contract.version,
      artifact: contract.artifact,
      detail: "Awaiting approved Production requirements",
      validation: "not_run",
    });
  }
  setStep(job, "kiln", {
    kind: "validator",
    detail: "Isolated runner not dispatched",
    validation: "not_run",
  });
  setStep(job, "aegis", {
    kind: "scanner",
    detail: "Awaiting the hash-bound post-build Production workspace pass",
    validation: "not_run",
  });
  for (const [id, detail] of [
    ["twin", "Browser actions have not been executed"],
    ["echo", "Browser accessibility audit has not been executed"],
    ["swift", "Browser performance measurement has not been executed"],
  ] as const) {
    setStep(job, id, {
      detail,
      validation: "not_run",
    });
  }
  setStep(job, "iris", {
    detail: "Iris cannot run without measured browser reports and screenshots",
    validation: "not_run",
  });
  setStep(job, "folio", {
    kind: "service",
    detail: "Awaiting typed Production evidence",
    validation: "not_run",
  });
  setStep(job, "harbor", {
    kind: "service",
    detail: "No deployment requested or executed",
    validation: "not_run",
  });
}

function declaredEnvironmentNames(files: Readonly<Record<string, string>>): string[] {
  const source = files[".env.example"] ?? "";
  const names = source
    .split(/\r?\n/u)
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/u)?.[1])
    .filter((name): name is string => Boolean(name));
  return [...new Set(names)].sort();
}

/**
 * Return names only, and only when both the approved candidate and the actual
 * server environment contain a non-empty value. Values never leave this boundary.
 */
export function configuredProductionEnvironmentNames(
  files: Readonly<Record<string, string>>,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string[] {
  return declaredEnvironmentNames(files).filter(
    (name) => typeof environment[name] === "string" && environment[name]?.trim() !== "",
  );
}

async function validatedArtifactSha256(value: unknown): Promise<string> {
  return sha256Hex(typeof value === "string" ? value : JSON.stringify(value));
}

async function hashMatches(value: unknown, expected: unknown): Promise<boolean> {
  return (
    typeof expected === "string" &&
    /^[0-9a-f]{64}$/u.test(expected) &&
    (await validatedArtifactSha256(value)) === expected
  );
}

function decodeVisibleHtmlText(value: string): string {
  return value
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#(?:39|x27);/giu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Convert only visible, semantic Forge UI copy into a bounded intent list.
 * Script/style bodies and raw HTML never cross into the deterministic scaffold.
 */
export function deriveProductionForgeUiIntent(
  structureHtml: string,
  plan: ProductPlan,
): string[] {
  const withoutExecutableContent = structureHtml
    .replace(/<(?:script|style|svg)\b[^>]*>[\s\S]*?<\/(?:script|style|svg)>/giu, " ");
  const candidates: string[] = [];
  const semanticElement = /<(title|h[1-3]|button|label|legend|summary|th)\b[^>]*>([\s\S]*?)<\/\1>/giu;
  for (const match of withoutExecutableContent.matchAll(semanticElement)) {
    const text = decodeVisibleHtmlText(match[2] ?? "");
    if (text.length >= 2 && text.length <= 240) candidates.push(text);
  }
  candidates.push(
    ...plan.screens.map((screen) => `${screen.name}: ${screen.purpose}`),
    ...plan.scope.p0,
  );
  const seen = new Set<string>();
  const intent: string[] = [];
  for (const candidate of candidates) {
    const bounded = candidate.replace(/\s+/gu, " ").trim().slice(0, 240);
    const key = bounded.toLocaleLowerCase("en-US");
    if (!bounded || seen.has(key)) continue;
    seen.add(key);
    intent.push(bounded);
    if (intent.length === 32) break;
  }
  if (intent.length === 0) {
    throw new AgentOutputError("FORGE_UI_INTENT_MISSING", false);
  }
  return intent;
}

const FORGE_LOGIC_EVENTS = ["click", "change", "input", "submit", "keydown"] as const;

function normalizedLogicIdentifier(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 72);
  const withPrefix = /^[a-z]/u.test(normalized) ? normalized : `item-${normalized}`;
  return (withPrefix || fallback).slice(0, 80);
}

function htmlAttribute(attributes: string, name: string): string | null {
  const escapedName = name.replace(/[^a-z-]/giu, "");
  const match = new RegExp(
    `(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "iu",
  ).exec(attributes);
  return match ? (match[1] ?? match[2] ?? match[3] ?? "").trim() : null;
}

function hasHtmlAttribute(attributes: string, name: string): boolean {
  const escapedName = name.replace(/[^a-z-]/giu, "");
  return new RegExp(`(?:^|\\s)${escapedName}(?:\\s|=|$)`, "iu").test(attributes);
}

function controlVisibleLabel(input: {
  html: string;
  tag: string;
  attributes: string;
  openingEnd: number;
  fallback: string;
}): string {
  for (const name of ["aria-label", "title", "value", "name"]) {
    const value = htmlAttribute(input.attributes, name);
    if (value) return decodeVisibleHtmlText(value).slice(0, 240);
  }
  if (["button", "a", "summary"].includes(input.tag)) {
    const closing = input.html
      .slice(input.openingEnd)
      .match(new RegExp(`([\\s\\S]*?)<\\/${input.tag}>`, "iu"))?.[1];
    const visible = decodeVisibleHtmlText(closing ?? "");
    if (visible) return visible.slice(0, 240);
  }
  return input.fallback.replaceAll("-", " ").slice(0, 240);
}

/**
 * Reduce Forge Logic to a strict semantic contract. No script, expression or
 * raw attribute is persisted into the generated workspace.
 */
export function deriveProductionForgeLogicIntent(
  forgeLogicHtml: string,
): ProductionForgeLogicIntent {
  const scripts = [...forgeLogicHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/giu)]
    .map((match) => match[1] ?? "")
    .join("\n");
  const detectedEvents = FORGE_LOGIC_EVENTS.filter((event) =>
    new RegExp(
      `(?:addEventListener\\s*\\(\\s*["']${event}["']|\\.on${event}\\s*=)`,
      "iu",
    ).test(scripts),
  );
  if (detectedEvents.length === 0) {
    throw new AgentOutputError("FORGE_LOGIC_EVENT_MISSING", false);
  }

  const controls: ProductionForgeLogicIntent["controls"] = [];
  const seenControls = new Set<string>();
  const openingControl = /<(button|input|select|textarea|a|summary)\b([^>]*)>/giu;
  for (const [index, match] of [...forgeLogicHtml.matchAll(openingControl)].entries()) {
    const tag = (match[1] ?? "button").toLocaleLowerCase("en-US");
    const attributes = match[2] ?? "";
    const rawId =
      htmlAttribute(attributes, "id") ??
      htmlAttribute(attributes, "data-action") ??
      htmlAttribute(attributes, "name");
    if (!rawId) continue;
    const id = normalizedLogicIdentifier(rawId, `control-${index + 1}`);
    if (seenControls.has(id)) continue;
    seenControls.add(id);
    const preferredEvents =
      tag === "input" || tag === "select" || tag === "textarea"
        ? (["change", "input", "keydown", "click", "submit"] as const)
        : (["click", "submit", "change", "input", "keydown"] as const);
    const event = preferredEvents.find((candidate) => detectedEvents.includes(candidate));
    if (!event) continue;
    controls.push({
      id,
      label: controlVisibleLabel({
        html: forgeLogicHtml,
        tag,
        attributes,
        openingEnd: (match.index ?? 0) + match[0].length,
        fallback: id,
      }),
      event,
    });
    if (controls.length === 32) break;
  }
  if (controls.length === 0) {
    throw new AgentOutputError("FORGE_LOGIC_CONTROL_MISSING", false);
  }

  const forms: ProductionForgeLogicIntent["forms"] = [];
  for (const [formIndex, match] of [
    ...forgeLogicHtml.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/giu),
  ].entries()) {
    const attributes = match[1] ?? "";
    const body = match[2] ?? "";
    const id = normalizedLogicIdentifier(
      htmlAttribute(attributes, "id") ?? htmlAttribute(attributes, "name") ?? "",
      `form-${formIndex + 1}`,
    );
    const fieldNames: string[] = [];
    const requiredFieldNames: string[] = [];
    for (const [fieldIndex, field] of [
      ...body.matchAll(/<(?:input|select|textarea)\b([^>]*)>/giu),
    ].entries()) {
      const fieldAttributes = field[1] ?? "";
      const rawName =
        htmlAttribute(fieldAttributes, "name") ?? htmlAttribute(fieldAttributes, "id");
      if (!rawName) continue;
      const name = normalizedLogicIdentifier(rawName, `field-${fieldIndex + 1}`);
      if (!fieldNames.includes(name)) fieldNames.push(name);
      if (hasHtmlAttribute(fieldAttributes, "required") && !requiredFieldNames.includes(name)) {
        requiredFieldNames.push(name);
      }
    }
    forms.push({ id, fieldNames, requiredFieldNames });
    if (forms.length === 12) break;
  }

  const stateTargets = new Set<string>();
  for (const match of scripts.matchAll(
    /(?:querySelector\s*\(\s*["']#([^"']+)["']|getElementById\s*\(\s*["']([^"']+)["'])/giu,
  )) {
    const raw = match[1] ?? match[2];
    if (raw) stateTargets.add(normalizedLogicIdentifier(raw, "state-target"));
    if (stateTargets.size === 32) break;
  }
  const validationSignals = [
    ...(hasHtmlAttribute(forgeLogicHtml, "required") ? ["required" as const] : []),
    ...(/\bpattern\s*=/iu.test(forgeLogicHtml) ? ["pattern" as const] : []),
    ...(/\b(?:checkValidity|reportValidity)\s*\(/u.test(scripts)
      ? ["check_validity" as const]
      : []),
    ...(/\bsetCustomValidity\s*\(/u.test(scripts)
      ? ["custom_validity" as const]
      : []),
  ];
  const stateSignals = [
    ...(/\.textContent\b/u.test(scripts) ? ["text" as const] : []),
    ...(/\.(?:classList|className)\b/u.test(scripts) ? ["class" as const] : []),
    ...(/\.dataset\b/u.test(scripts) ? ["data" as const] : []),
    ...(/\.(?:hidden|style\.display)\b/u.test(scripts) ? ["visibility" as const] : []),
    ...(/\.disabled\b/u.test(scripts) ? ["disabled" as const] : []),
    ...(/\.value\b/u.test(scripts) ? ["value" as const] : []),
  ];
  return ProductionForgeLogicIntentSchema.parse({
    kind: "forge_logic_intent",
    schemaVersion: "1.0.0",
    controls,
    forms,
    stateTargets: [...stateTargets],
    validationSignals: [...new Set(validationSignals)],
    stateSignals: [...new Set(stateSignals)],
  });
}

function selectedProductionDesign(selection: DesignSelection) {
  const selected = selection.directions.find(
    (direction) => direction.id === selection.selectedId,
  );
  if (!selected) throw new AgentOutputError("LUMEN_SELECTION_INVALID", false);
  return selected;
}

function productionCreativeEvidence(input: {
  selection: DesignSelection;
  structureHtml: string;
  forgeLogicHtml: string;
  plan: ProductPlan;
}): ProductionCreativeDirectionEvidence {
  return ProductionCreativeDirectionEvidenceSchema.parse({
    kind: "helix_production_creative_direction",
    schemaVersion: "1.0.0",
    source: "lumen_forge",
    selectedDirection: selectedProductionDesign(input.selection),
    selectionRationale: input.selection.selectionRationale,
    forgeUiIntent: deriveProductionForgeUiIntent(input.structureHtml, input.plan),
    forgeLogicIntent: deriveProductionForgeLogicIntent(input.forgeLogicHtml),
  });
}

export async function prepareProductionWorkspace(input: {
  job: Pick<BuildJob, "id" | "projectId" | "locale" | "createdAt" | "checkpoint">;
  plan: ProductPlan;
  architecture: Architecture;
  prompt: string;
  creativeEvidence?: ProductionCreativeDirectionEvidence;
  /** Server-only test/worker hook. The provider and verifier secret are never returned. */
  nimbusDecisionEvidenceProvider?: NimbusDecisionEvidenceProvider;
  environment?: Readonly<Record<string, string | undefined>>;
}): Promise<PreparedProductionWorkspace> {
  const context = deriveProductionContext({
    prompt: input.prompt,
    plan: input.plan,
    architecture: input.architecture,
  });
  const nimbusDecisionEvidenceProvider =
    input.nimbusDecisionEvidenceProvider ??
    configuredNimbusEvidenceProvider(input.environment ?? process.env);
  const assembled = await assembleProductionSource(context, {
    ...(input.creativeEvidence ? { creativeEvidence: input.creativeEvidence } : {}),
    ...(nimbusDecisionEvidenceProvider ? { nimbusDecisionEvidenceProvider } : {}),
  });
  const prepared = await createProductionWorkspaceCandidate({
    jobId: input.job.id,
    ...(input.job.projectId ? { projectId: input.job.projectId } : {}),
    locale: input.job.locale,
    pipelineVersion: input.job.checkpoint?.pipelineVersion ?? HELIX_PIPELINE_VERSION,
    createdAt: input.job.createdAt,
    entrypoint: assembled.entrypoint,
    files: assembled.files,
  });
  const graph = await buildProductionArtifactGraph({
    candidate: prepared.candidate,
    files: prepared.files,
    requirements: assembled.requirements,
    provenance: assembled.provenance,
    artifacts: assembled.artifacts,
    configuredEnvironmentNames: configuredProductionEnvironmentNames(
      prepared.files,
      input.environment,
    ),
  });
  return {
    files: prepared.files,
    entrypoint: assembled.entrypoint,
    candidate: prepared.candidate,
    graph,
  };
}

function applyProductionGraphSteps(job: BuildJob, graph: ProductionArtifactGraph): void {
  for (const node of graph.nodes) {
    const houseId = HOUSE_ID_BY_STAGE[node.id];
    const status =
      node.status === "structurally_present"
        ? "done"
        : node.status === "not_required"
          ? "skipped"
          : node.status === "not_configured"
            ? "standby"
            : "error";
    setStep(job, houseId, {
      kind: node.id === "quartz" ? "validator" : "service",
      status,
      detail: `${node.status} · structural source only · runtime validation not run`,
      validation:
        node.id !== "nimbus" && node.status === "structurally_present"
          ? "validated"
          : "not_run",
      ...(node.status === "blocked"
        ? { errorCode: "PRODUCTION_SOURCE_GRAPH_BLOCKED" }
        : {}),
    });
  }
}

function runnerErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code?: unknown }).code ?? "WORKSPACE_RUNNER_FAILED").slice(0, 120);
  }
  return error instanceof Error ? error.message.slice(0, 120) : "WORKSPACE_RUNNER_FAILED";
}

async function persistRunnerFailure(job: BuildJob, error: unknown): Promise<never> {
  const code = runnerErrorCode(error);
  setStep(job, "kiln", {
    status: "error",
    detail: code,
    validation: "not_run",
    errorCode: code,
  });
  setStep(job, "seal", {
    status: "error",
    detail: "Production manifest not created because isolated validation did not pass",
    validation: "not_run",
    errorCode: code,
  });
  job.workspace = undefined;
  job.html = null;
  await persistBuildJob(job);
  throw error;
}

async function persistValidatedRunnerEvidence(
  job: BuildJob,
  prepared: PreparedProductionWorkspace,
  validation: WorkspaceRunnerValidationResult,
  creative: ProductionCreativeRun,
): Promise<void> {
  const runnerReportSha256 = await sha256Hex(JSON.stringify(validation.report));
  job.production = {
    candidate: prepared.candidate,
    graph: prepared.graph,
    creativeEvidence: creative.evidence,
    creativeEvidenceSha256: creative.evidenceSha256,
    agentArtifacts: productionAgentArtifacts(creative),
    runnerReport: validation.report,
    runnerReportSha256,
  };
  checkpoint(job, "production_validated", {
    plan: job.checkpoint?.artifacts?.plan,
    architecture: job.checkpoint?.artifacts?.architecture,
    usedAi: true,
  });
  setStep(job, "kiln", {
    status: "done",
    detail: `Signed isolated runner report · 6/6 phases passed · ${runnerReportSha256.slice(0, 12)}`,
    validation: "validated",
    errorCode: undefined,
  });
  await persistBuildJob(job);
}

export async function runProductionCrew(job: BuildJob): Promise<RunCrewResult> {
  if (job.buildLevel !== "production") {
    throw new AgentOutputError("PRODUCTION_BUILD_LEVEL_REQUIRED", false);
  }
  if (job.mode !== "generate") {
    throw new AgentOutputError("PRODUCTION_ACTION_UNSUPPORTED", false);
  }
  initializeProductionCheckpoint(job);
  loadProductionPipeline(job);
  const language = LOCALE_NAME[job.locale];
  const brief = classifyBrief(job.prompt);
  think(
    job,
    "Helix",
    "Production: pianificazione AI, consegne sorgente deterministiche e validazione isolata prima del manifest.",
    "Production: AI planning, deterministic source delivery, and isolated validation before any manifest.",
  );
  await persistBuildJob(job);

  const savedPlan = ProductPlanSchema.safeParse(job.checkpoint?.artifacts?.plan);
  let plan = savedPlan.success ? savedPlan.data : null;
  if (plan) {
    setStep(job, "nova", {
      status: "done",
      detail: "Typed Production PRD restored from a compatible checkpoint",
      validation: "validated",
    });
  } else {
    setStep(job, "nova", {
      status: "running",
      detail: "Production PRD through the configured AI gateway",
      validation: "not_run",
    });
    await persistBuildJob(job);
    plan = await agentPlan(job.prompt, language, brief.lock, job);
    job.title = plan.title;
    setStep(job, "nova", {
      status: "done",
      detail: "Typed Production PRD validated",
      validation: "validated",
    });
    checkpoint(job, "planned", { plan });
    await persistBuildJob(job);
  }

  const savedArchitecture = ArchitectureSchema.safeParse(
    job.checkpoint?.artifacts?.architecture,
  );
  let architecture = savedArchitecture.success ? savedArchitecture.data : null;
  if (architecture) {
    setStep(job, "atlas", {
      status: "done",
      detail: "Typed Production architecture restored from a compatible checkpoint",
      validation: "validated",
    });
  } else {
    setStep(job, "atlas", {
      status: "running",
      detail: "Production architecture through the configured AI gateway",
      validation: "not_run",
    });
    await persistBuildJob(job);
    architecture = await agentArchitecture(job.prompt, plan, language, brief.lock, job);
    setStep(job, "atlas", {
      status: "done",
      detail: "Typed Production architecture validated",
      validation: "validated",
    });
    checkpoint(job, "architected", { plan, architecture });
    await persistBuildJob(job);
  }

  const savedSelection = DesignSelectionSchema.safeParse(
    job.checkpoint?.artifacts?.designSelection,
  );
  const canRestoreSelection =
    savedSelection.success &&
    (await hashMatches(
      savedSelection.data,
      job.checkpoint?.artifacts?.designSelectionSha256,
    ));
  let designSelection: DesignSelection;
  if (canRestoreSelection && savedSelection.success) {
    designSelection = savedSelection.data;
    setStep(job, "lumen", {
      kind: "ai_agent",
      version: AGENT_CONTRACTS.lumen.version,
      artifact: AGENT_CONTRACTS.lumen.artifact,
      status: "done",
      detail: "Three scored Production directions restored from a hash-bound checkpoint",
      validation: "validated",
    });
  } else {
    setStep(job, "lumen", {
      kind: "ai_agent",
      version: AGENT_CONTRACTS.lumen.version,
      artifact: AGENT_CONTRACTS.lumen.artifact,
      status: "running",
      detail: "Generating three distinct Production directions through the configured AI gateway",
      validation: "not_run",
    });
    await persistBuildJob(job);
    designSelection = await agentDesign(
      job.prompt,
      plan,
      architecture,
      language,
      job,
    );
  }
  const design = selectedProductionDesign(designSelection);
  const lumenSha256 = await validatedArtifactSha256(designSelection);
  const lumenExecution = await completeAgentExecution("lumen", {
    directions: designSelection.directions,
  });
  if (lumenExecution.status !== "done") {
    throw new AgentOutputError("LUMEN_EXECUTION_EVIDENCE_INVALID", false);
  }
  setStep(job, "lumen", {
    kind: "ai_agent",
    version: AGENT_CONTRACTS.lumen.version,
    artifact: AGENT_CONTRACTS.lumen.artifact,
    status: "done",
    detail: `3 distinct directions scored · ${design.name} · ${lumenSha256.slice(0, 12)}`,
    validation: "validated",
    errorCode: undefined,
  });
  job.designMood = design.mood;
  checkpoint(job, "designed", {
    plan,
    architecture,
    design,
    designSelection,
    designSelectionSha256: lumenSha256,
  });
  await persistBuildJob(job);

  const savedStructure = job.checkpoint?.artifacts?.structureHtml;
  const canRestoreForgeUi =
    AGENT_CONTRACTS.forgeUi.outputSchema.safeParse(savedStructure).success &&
    isValidHtmlArtifact(savedStructure) &&
    (await hashMatches(
      savedStructure,
      job.checkpoint?.artifacts?.structureHtmlSha256,
    ));
  let structureHtml: string;
  if (canRestoreForgeUi) {
    structureHtml = savedStructure;
    setStep(job, "forge", {
      kind: "ai_agent",
      version: AGENT_CONTRACTS.forgeUi.version,
      artifact: AGENT_CONTRACTS.forgeUi.artifact,
      status: "done",
      detail: "Forge UI restored from a hash-bound checkpoint",
      validation: "validated",
    });
  } else {
    setStep(job, "forge", {
      kind: "ai_agent",
      version: AGENT_CONTRACTS.forgeUi.version,
      artifact: AGENT_CONTRACTS.forgeUi.artifact,
      status: "running",
      detail: "Forge Structure/UI · separate configured AI gateway call",
      validation: "not_run",
    });
    await persistBuildJob(job);
    const builtUi = await agentBuild(
      {
        prompt: job.prompt,
        locale: job.locale,
        lang: language,
        mode: "generate",
        currentHtml: null,
        plan,
        architecture,
        design,
        extra: [brief.lock, "Production UI evidence; do not invent configured services."],
        job,
      },
      "ui",
      0,
      "production:forge:ui",
    );
    if (!builtUi) {
      setStep(job, "forge", {
        status: "error",
        detail: "Forge UI did not produce a contract-valid HTML artifact",
        validation: "not_run",
        errorCode: "FORGE_UI_HTML_INVALID",
      });
      await persistBuildJob(job);
      throw new AgentOutputError("FORGE_UI_HTML_INVALID");
    }
    structureHtml = builtUi;
  }
  const forgeUiExecution = await completeAgentExecution("forgeUi", structureHtml);
  if (forgeUiExecution.status !== "done") {
    throw new AgentOutputError("FORGE_UI_EXECUTION_EVIDENCE_INVALID", false);
  }
  const forgeUiSha256 = forgeUiExecution.artifact.sha256;
  checkpoint(job, "forge_ui", {
    plan,
    architecture,
    design,
    designSelection,
    designSelectionSha256: lumenSha256,
    structureHtml,
    structureHtmlSha256: forgeUiSha256,
    usedAi: false,
  });
  const savedForgeLogic = job.checkpoint?.artifacts?.forgeLogicHtml;
  const canRestoreForgeLogic =
    job.checkpoint?.artifacts?.forgeLogicInputSha256 === forgeUiSha256 &&
    AGENT_CONTRACTS.forgeLogic.outputSchema.safeParse(savedForgeLogic).success &&
    isValidHtmlArtifact(savedForgeLogic) &&
    (await hashMatches(
      savedForgeLogic,
      job.checkpoint?.artifacts?.forgeLogicHtmlSha256,
    ));
  setStep(job, "forge", canRestoreForgeLogic
    ? {
        kind: "ai_agent",
        version: AGENT_CONTRACTS.forgeLogic.version,
        artifact: AGENT_CONTRACTS.forgeLogic.artifact,
        status: "done",
        detail: `Forge Logic restored and bound to UI ${forgeUiSha256.slice(0, 12)}`,
        validation: "validated",
      }
    : {
        kind: "ai_agent",
        version: AGENT_CONTRACTS.forgeLogic.version,
        artifact: AGENT_CONTRACTS.forgeLogic.artifact,
        status: "running",
        detail: `Forge Logic · separate call bound to UI ${forgeUiSha256.slice(0, 12)}`,
        validation: "not_run",
      });
  await persistBuildJob(job);

  let forgeLogicHtml: string;
  if (canRestoreForgeLogic) {
    forgeLogicHtml = savedForgeLogic;
  } else {
    const forgeInput = {
      prompt: job.prompt,
      locale: job.locale,
      lang: language,
      mode: "generate" as const,
      currentHtml: structureHtml,
      plan,
      architecture,
      design,
      extra: [brief.lock, "Production logic evidence; do not invent configured services."],
      job,
    };
    let builtLogic = await agentBuild(
      forgeInput,
      "logic",
      0,
      "production:forge:logic",
    );
    if (!builtLogic) {
      job.interventions = [
        ...(job.interventions ?? []),
        "Forge Logic contract-invalid output — one budgeted retry",
      ];
      builtLogic = await agentBuild(
        forgeInput,
        "logic",
        1,
        "production:forge:logic",
      );
    }
    if (!builtLogic) {
      setStep(job, "forge", {
        status: "error",
        detail: "Forge Logic did not produce a contract-valid HTML artifact",
        validation: "not_run",
        errorCode: "FORGE_LOGIC_HTML_INVALID",
      });
      await persistBuildJob(job);
      throw new AgentOutputError("FORGE_LOGIC_HTML_INVALID");
    }
    forgeLogicHtml = builtLogic;
  }
  const forgeLogicExecution = await completeAgentExecution("forgeLogic", forgeLogicHtml);
  if (forgeLogicExecution.status !== "done") {
    throw new AgentOutputError("FORGE_LOGIC_EXECUTION_EVIDENCE_INVALID", false);
  }
  const forgeLogicSha256 = forgeLogicExecution.artifact.sha256;
  if (forgeLogicSha256 === forgeUiSha256) {
    throw new AgentOutputError("FORGE_LOGIC_NO_CHANGE", false);
  }
  const creativeEvidence = productionCreativeEvidence({
    selection: designSelection,
    structureHtml,
    forgeLogicHtml,
    plan,
  });
  const creativeEvidenceSha256 = await validatedArtifactSha256(creativeEvidence);
  checkpoint(job, "forged", {
    plan,
    architecture,
    design,
    designSelection,
    designSelectionSha256: lumenSha256,
    structureHtml,
    structureHtmlSha256: forgeUiSha256,
    forgeLogicHtml,
    forgeLogicHtmlSha256: forgeLogicSha256,
    forgeLogicInputSha256: forgeUiSha256,
    creativeEvidence,
    creativeEvidenceSha256,
    usedAi: true,
  });
  setStep(job, "forge", {
    kind: "ai_agent",
    version: `${AGENT_CONTRACTS.forgeUi.version}+${AGENT_CONTRACTS.forgeLogic.version}`,
    artifact: `${AGENT_CONTRACTS.forgeUi.artifact}+${AGENT_CONTRACTS.forgeLogic.artifact}`,
    status: "done",
    detail: `Forge UI ${forgeUiSha256.slice(0, 12)} · Forge Logic ${forgeLogicSha256.slice(0, 12)}`,
    validation: "validated",
    errorCode: undefined,
  });
  remember(job, "Lumen", `${design.name} · ${design.mood} · ${design.palette.accent}`);
  remember(job, "Forge", `UI ${forgeUiSha256} · Logic ${forgeLogicSha256}`);
  await persistBuildJob(job);

  const creative: ProductionCreativeRun = {
    evidence: creativeEvidence,
    evidenceSha256: creativeEvidenceSha256,
    lumenArtifactSha256: lumenExecution.artifact.sha256,
    forgeUiSha256,
    forgeLogicSha256,
  };
  job.title = plan.title;
  const prepared = await prepareProductionWorkspace({
    job,
    plan,
    architecture,
    prompt: job.prompt,
    creativeEvidence,
  });
  job.files = prepared.files;
  job.workspace = undefined;
  job.html = null;
  job.usedAi = true;
  job.production = {
    candidate: prepared.candidate,
    graph: prepared.graph,
    creativeEvidence,
    creativeEvidenceSha256,
    agentArtifacts: productionAgentArtifacts(creative),
  };
  applyProductionGraphSteps(job, prepared.graph);
  setStep(job, "folio", {
    status: "done",
    detail: "Candidate, typed requirements, contracts and file provenance persisted",
    validation: "validated",
  });
  setStep(job, "kiln", {
    status: "running",
    detail: "Dispatching the immutable candidate to the authenticated isolated runner",
    validation: "not_run",
  });
  checkpoint(job, "production_candidate", { plan, architecture, usedAi: true });
  remember(job, "Helix", `Production candidate ${prepared.candidate.sourceSha256}`);
  await persistBuildJob(job);

  let validation: WorkspaceRunnerValidationResult;
  try {
    validation = await runProductionWorkspaceValidation({
      files: prepared.files,
      candidate: prepared.candidate,
      signal: job.runtime?.abortSignal,
    });
  } catch (error) {
    return persistRunnerFailure(job, error);
  }
  await persistValidatedRunnerEvidence(job, prepared, validation, creative);

  const html = createProductionInlinePreview(
    job.files ?? prepared.files,
    prepared.entrypoint,
    prepared.candidate.sourceSha256,
  );
  let browserRun: Awaited<ReturnType<typeof runBrowserQuality>>;
  try {
    browserRun = await runBrowserQuality({
      html,
      jobId: job.id,
      signal: job.runtime?.abortSignal,
    });
  } catch (error) {
    const code = runnerErrorCode(error);
    for (const id of ["twin", "echo", "swift"] as const) {
      setStep(job, id, {
        status: "error",
        detail: `Authenticated browser quality runner failed · ${code}`,
        validation: "not_run",
        errorCode: code,
      });
    }
    setStep(job, "iris", {
      status: "skipped",
      detail: "Iris not run because the browser quality runner failed",
      validation: "not_run",
    });
    job.workspace = undefined;
    job.html = null;
    await persistBuildJob(job);
    throw error;
  }
  const browserQuality = { echo: browserRun.echo, swift: browserRun.swift };
  const twin = browserRun.twin;
  job.quality = { ...(job.quality ?? {}), twin, ...browserQuality };
  setBrowserEvidenceStep(job, "twin", "Twin browser QA", twin);
  setBrowserEvidenceStep(job, "echo", "Echo accessibility", browserQuality.echo);
  setBrowserEvidenceStep(job, "swift", "Swift performance", browserQuality.swift);
  await persistBuildJob(job);
  let irisReview;
  if (
    twin.status === "completed" &&
    browserQuality.echo.status === "completed" &&
    browserQuality.swift.status === "completed"
  ) {
    setStep(job, "iris", {
      status: "running",
      detail: "Reviewing measured Twin/Echo/Swift reports and authenticated screenshot evidence",
      validation: "not_run",
    });
    await persistBuildJob(job);
    try {
      irisReview = await runIrisReview({
        prompt: job.prompt,
        lang: language,
        html,
        plan,
        consoleErrors: [...twin.consoleErrors, ...twin.runtimeErrors],
        staticFindings: [],
        acceptanceCriteria: plan.acceptanceCriteria,
        artifactSha256: await sha256Hex(html),
        twin,
        echo: browserQuality.echo,
        swift: browserQuality.swift,
        ...(browserRun.screenshotBase64
          ? { shot: browserRun.screenshotBase64 }
          : {}),
        job,
      });
    } catch (error) {
      const code = runnerErrorCode(error);
      setStep(job, "iris", {
        status: "error",
        detail: `Iris did not produce a valid browser-evidence review · ${code}`,
        validation: "not_run",
        errorCode: code,
      });
      job.workspace = undefined;
      job.html = null;
      await persistBuildJob(job);
      throw error;
    }
  }
  const qualityReport = await runProductionWorkspaceQualityPass({
    files: job.files ?? prepared.files,
    candidate: prepared.candidate,
    previewHtml: html,
    runnerReport: validation.report,
    runtimeProfile: prepared.graph.requirements.runtimeProfile,
    browserQuality: { twin, ...browserQuality },
    ...(irisReview ? { irisReview } : {}),
    brief: job.prompt,
    acceptanceCriteria: plan.acceptanceCriteria,
  });
  const qualityReportSha256 = await productionWorkspaceQualityReportSha256(qualityReport);
  job.production = {
    candidate: prepared.candidate,
    graph: prepared.graph,
    creativeEvidence: creative.evidence,
    creativeEvidenceSha256: creative.evidenceSha256,
    agentArtifacts: productionAgentArtifacts(creative),
    runnerReport: validation.report,
    runnerReportSha256: await sha256Hex(JSON.stringify(validation.report)),
    qualityReport,
    qualityReportSha256,
    ...(irisReview ? { irisReview } : {}),
  };
  job.quality = {
    ...(job.quality ?? {}),
    aegis: qualityReport.aegis,
  };
  setStep(job, "aegis", {
    status: qualityReport.passed ? "done" : "error",
    detail: `Hash-bound Production workspace pass · ${qualityReport.checks.filter((check) => check.status === "passed").length}/6 checks passed · ${qualityReport.blockerCount} blocker(s)`,
    validation: "validated",
    ...(qualityReport.passed
      ? { errorCode: undefined }
      : { errorCode: "PRODUCTION_WORKSPACE_QUALITY_BLOCKED" }),
  });
  setStep(job, "iris", irisReview
    ? {
        status: irisReview.status === "passed" ? "done" : "error",
        detail: `Iris ${irisReview.status} · browser-assisted evidence · ${irisReview.mustFix.length} must-fix item(s)`,
        validation: "validated",
        ...(irisReview.status === "passed"
          ? { errorCode: undefined }
          : { errorCode: "IRIS_RUNTIME_NOT_PASSED" }),
      }
    : {
        status: "skipped",
        detail:
          "Iris not run · no complete measured Twin/Echo/Swift reports and screenshots exist for this artifact",
        validation: "not_run",
      });
  if (!qualityReport.passed) {
    setStep(job, "seal", {
      status: "error",
      detail: "Production manifest not created because the post-build quality gate did not pass",
      validation: "validated",
      errorCode: "PRODUCTION_WORKSPACE_QUALITY_BLOCKED",
    });
    job.workspace = undefined;
    job.html = null;
    await persistBuildJob(job);
  }
  assertProductionWorkspaceQualityPassed(qualityReport, {
    candidateSha256: prepared.candidate.sourceSha256,
    previewSha256: await sha256Hex(html),
    runnerReportSha256: await sha256Hex(JSON.stringify(validation.report)),
  });
  await persistBuildJob(job);

  let sealedManifest;
  try {
    sealedManifest = await sealProductionBuildJobWorkspace({
      job,
      graph: prepared.graph,
      validation,
      quality: {
        report: qualityReport,
        reportSha256: qualityReportSha256,
        ...(irisReview ? { irisReview } : {}),
      },
    });
  } catch (error) {
    const code = runnerErrorCode(error);
    setStep(job, "seal", {
      status: "error",
      detail: code,
      validation: "validated",
      errorCode: code,
    });
    job.workspace = undefined;
    job.html = null;
    await persistBuildJob(job);
    throw error;
  }

  job.html = html;
  job.usedAi = true;
  job.briefing =
    qualityReport.runtimeQuality.validated
      ? "Production source candidate passed the signed isolated runner, hash-bound local security gate, browser-preview suite and Iris review; service/provider activation remains not verified, and no deploy or external provisioning was executed."
      : "Static-site Production source passed the signed isolated runner and hash-bound local security gate; browser QA remains explicitly not run and no runtime validation is claimed. No deploy or external provisioning was executed.";
  job.wire = `Production workspace · ${prepared.candidate.fileCount} files · ${prepared.candidate.sourceSha256.slice(0, 12)}`;
  setStep(job, "seal", {
    status: "done",
    detail: `Production source manifest sealed · ${sealedManifest.artifactSha256.slice(0, 12)}`,
    validation: "validated",
    errorCode: undefined,
  });
  setStep(job, "harbor", {
    status: "standby",
    detail: "No deployment executed · awaiting explicit Human Gate approval",
    validation: "not_run",
  });
  remember(job, "Helix", "Production source sealed; deployment remains outside this build.");
  checkpoint(job, "production_finalized", { plan, architecture, html, usedAi: true });
  await persistBuildJob(job);

  const output = AGENT_CONTRACTS.helix.outputSchema.safeParse({
    html,
    usedAi: true,
    title: job.title,
  });
  if (!output.success) {
    throw new AgentOutputError("HELIX_PRODUCTION_OUTPUT_INVALID", false);
  }
  return output.data;
}
