import type { BuildJob } from "@/lib/agent-types";
import {
  deriveProductionCapabilityRequirements,
  ProductionArtifactGraphSchema,
  verifyProductionArtifactGraph,
  type ProductionArtifactGraph,
  type ProductionStageId,
} from "@/lib/production-artifact-graph";
import {
  AgentOutputError,
  ProductPlanSchema,
  type ReviewResult,
} from "@/lib/server/agents/types";
import { sha256Hex } from "@/lib/server/agents/patch";
import type { WorkspaceRunnerValidationResult } from "@/lib/server/workspace-runner";
import { WorkspaceRunnerReportSchema } from "@/lib/server/workspace-runner";
import {
  ProductionWorkspaceQualityReportSchema,
  assertProductionWorkspaceQualityPassed,
  verifyProductionWorkspaceQualityReport,
  type ProductionWorkspaceQualityReport,
} from "@/lib/server/quality/production-workspace";
import {
  sealWorkspace,
  verifyWorkspace,
  verifyProductionWorkspaceCandidate,
  WorkspaceCandidateSchema,
  WorkspaceManifestSchema,
  type WorkspaceCapability,
  type WorkspaceCandidate,
  type WorkspaceManifest,
  type WorkspaceValidation,
} from "@/lib/workspace";

function productionJobCreatedAt(job: Pick<BuildJob, "createdAt">): string {
  const createdAt = new Date(job.createdAt);
  if (!Number.isFinite(createdAt.getTime())) {
    throw new AgentOutputError("PRODUCTION_CANDIDATE_IDENTITY_MISMATCH", false);
  }
  return createdAt.toISOString();
}

function productionAcceptanceCriteria(job: Pick<BuildJob, "checkpoint">): string[] {
  const plan = ProductPlanSchema.safeParse(job.checkpoint?.artifacts?.plan);
  if (!plan.success) {
    throw new AgentOutputError("PRODUCTION_QUALITY_PLAN_MISSING", false);
  }
  return plan.data.acceptanceCriteria;
}

function assertProductionCandidateIdentity(
  job: Pick<BuildJob, "id" | "projectId" | "locale" | "createdAt" | "checkpoint">,
  candidate: WorkspaceCandidate,
): void {
  if (
    candidate.jobId !== job.id ||
    candidate.projectId !== job.projectId ||
    candidate.locale !== job.locale ||
    candidate.createdAt !== productionJobCreatedAt(job) ||
    !job.checkpoint ||
    candidate.pipelineVersion !== job.checkpoint.pipelineVersion
  ) {
    throw new AgentOutputError("PRODUCTION_CANDIDATE_IDENTITY_MISMATCH", false);
  }
}

export function createProductionInlinePreview(
  files: Readonly<Record<string, string>>,
  entrypoint: string,
  candidateSha256: string,
): string {
  const source = files[entrypoint];
  if (!source) throw new AgentOutputError("PRODUCTION_ENTRYPOINT_MISSING", false);
  const directory = entrypoint.split("/").slice(0, -1).join("/");
  const style = files[`${directory}/src/styles.css`];
  const script = files[`${directory}/src/main.js`];
  let html = source;
  if (style) {
    html = html.replace(
      /<link\b[^>]*href=["']\.\/src\/styles\.css["'][^>]*>/iu,
      `<style>\n${style}\n</style>`,
    );
  }
  if (script) {
    html = html.replace(
      /<script\b[^>]*src=["']\.\/src\/main\.js["'][^>]*><\/script>/iu,
      `<script type="module">\n${script.replace(/<\/script/giu, "<\\/script")}\n</script>`,
    );
  }
  const evidenceComment = `<!-- Helix Production preview derived from immutable candidate ${candidateSha256}. This browser view is not deployment evidence, does not provision external services, and remains subject to the sealed workspace manifest plus explicit Human Gate approval. -->`;
  return html.replace(/<\/body>/iu, `${evidenceComment}\n</body>`);
}

/**
 * Recheck every persisted Production boundary before queue promotion or Human
 * Gate approval. The runner response was authenticated at ingestion; this
 * verification binds its persisted report, source candidate, graph, manifest,
 * and derived browser preview to the same immutable source hash.
 */
export async function assertSealedProductionBuildJobWorkspace(job: BuildJob): Promise<void> {
  if (
    job.buildLevel !== "production" ||
    !job.files ||
    !job.workspace ||
    !job.production?.candidate ||
    !job.production.graph ||
    !job.production?.runnerReport ||
    !job.production.runnerReportSha256 ||
    !job.production.qualityReport ||
    !job.production.qualityReportSha256 ||
    !job.quality?.twin ||
    !job.quality.echo ||
    !job.quality.swift ||
    !job.html
  ) {
    throw new AgentOutputError("PRODUCTION_WORKSPACE_NOT_SEALED", false);
  }
  const parsedCandidate = WorkspaceCandidateSchema.safeParse(job.production.candidate);
  const parsedManifest = WorkspaceManifestSchema.safeParse(job.workspace);
  if (!parsedCandidate.success || !parsedManifest.success) {
    throw new AgentOutputError("PRODUCTION_WORKSPACE_NOT_SEALED", false);
  }
  const candidate = parsedCandidate.data;
  const manifest = parsedManifest.data;
  assertProductionCandidateIdentity(job, candidate);
  const parsedGraph = ProductionArtifactGraphSchema.safeParse(job.production.graph);
  if (!parsedGraph.success) {
    throw new AgentOutputError("PRODUCTION_WORKSPACE_NOT_SEALED", false);
  }
  const graph = parsedGraph.data;
  const report = WorkspaceRunnerReportSchema.safeParse(job.production.runnerReport);
  if (
    !report.success ||
    report.data.candidateSha256 !== candidate.sourceSha256 ||
    report.data.steps.some(
      (step) => step.status !== "passed" || step.evidence !== "measured" || step.exitCode !== 0,
    )
  ) {
    throw new AgentOutputError("PRODUCTION_RUNNER_EVIDENCE_INVALID", false);
  }
  const reportSha256 = await sha256Hex(JSON.stringify(report.data));
  if (reportSha256 !== job.production.runnerReportSha256) {
    throw new AgentOutputError("PRODUCTION_RUNNER_EVIDENCE_INVALID", false);
  }
  const candidateVerification = await verifyProductionWorkspaceCandidate(job.files, candidate);
  const graphVerification = await verifyProductionArtifactGraph({
    candidate,
    files: job.files,
    graph,
  });
  const workspaceVerification = await verifyWorkspace(job.files, job.workspace);
  if (
    !candidateVerification.valid ||
    !graphVerification.valid ||
    !workspaceVerification.valid ||
    graph.candidateSha256 !== candidate.sourceSha256 ||
    manifest.buildLevel !== "production" ||
    manifest.jobId !== job.id ||
    manifest.projectId !== job.projectId ||
    manifest.locale !== candidate.locale ||
    manifest.createdAt !== candidate.createdAt ||
    manifest.entrypoint !== candidate.entrypoint ||
    manifest.pipelineVersion !== candidate.pipelineVersion
  ) {
    throw new AgentOutputError("PRODUCTION_WORKSPACE_NOT_SEALED", false);
  }
  const testEvidencePath = candidate.files.find((descriptor) => descriptor.role === "test")?.path;
  if (!testEvidencePath) {
    throw new AgentOutputError("PRODUCTION_TEST_EVIDENCE_MISSING", false);
  }
  const expectedCapabilities = productionWorkspaceCapabilities({
    graph,
    entrypoint: candidate.entrypoint,
    testEvidencePath,
  }).sort((left, right) => left.id.localeCompare(right.id));
  const expectedValidations = runnerValidations(report.data, reportSha256).sort((left, right) =>
    left.scope.localeCompare(right.scope),
  );
  if (
    JSON.stringify(manifest.capabilities) !== JSON.stringify(expectedCapabilities) ||
    JSON.stringify(manifest.validations) !== JSON.stringify(expectedValidations)
  ) {
    throw new AgentOutputError("PRODUCTION_WORKSPACE_NOT_SEALED", false);
  }
  const expectedPreview = createProductionInlinePreview(
    job.files,
    candidate.entrypoint,
    candidate.sourceSha256,
  );
  if (job.html !== expectedPreview) {
    throw new AgentOutputError("PRODUCTION_PREVIEW_DIVERGED", false);
  }
  const parsedQuality = ProductionWorkspaceQualityReportSchema.safeParse(
    job.production.qualityReport,
  );
  if (
    !parsedQuality.success ||
    !(await verifyProductionWorkspaceQualityReport({
      files: job.files,
      candidate,
      previewHtml: expectedPreview,
      runnerReport: report.data,
      runtimeProfile: graph.requirements.runtimeProfile,
      browserQuality: {
        twin: job.quality.twin,
        echo: job.quality.echo,
        swift: job.quality.swift,
      },
      ...(job.production.irisReview
        ? { irisReview: job.production.irisReview }
        : {}),
      brief: job.prompt,
      acceptanceCriteria: productionAcceptanceCriteria(job),
      report: parsedQuality.data,
      reportSha256: job.production.qualityReportSha256,
    }))
  ) {
    throw new AgentOutputError("PRODUCTION_WORKSPACE_QUALITY_INVALID", false);
  }
  assertProductionWorkspaceQualityPassed(parsedQuality.data, {
    candidateSha256: candidate.sourceSha256,
    previewSha256: await sha256Hex(expectedPreview),
    runnerReportSha256: reportSha256,
  });
}

const CAPABILITY_STAGE_IDS = {
  backend: ["basalt"],
  api: ["vault"],
  database: ["prism", "quartz"],
  auth: ["key"],
  integrations: ["nexus"],
  deployment: ["nimbus"],
  monitoring: ["nimbus"],
} as const satisfies Readonly<
  Record<
    "backend" | "api" | "database" | "auth" | "integrations" | "deployment" | "monitoring",
    readonly ProductionStageId[]
  >
>;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
}

function nodeEvidencePaths(
  graph: ProductionArtifactGraph,
  stageIds: readonly ProductionStageId[],
): string[] {
  const paths = stageIds.flatMap((stageId) => {
    const node = graph.nodes.find((candidate) => candidate.id === stageId);
    return node?.contractPath ? [node.contractPath] : [];
  });
  return uniqueSorted(paths.length > 0 ? paths : [graph.requirements.contractPath]);
}

function capability(
  graph: ProductionArtifactGraph,
  id: WorkspaceCapability["id"],
  required: boolean,
  stageIds: readonly ProductionStageId[],
  implementedDetail: string,
): WorkspaceCapability {
  if (!required) {
    return {
      id,
      status: "not_required",
      detail: `The approved requirements do not require the ${id} capability.`,
      evidencePaths: [graph.requirements.contractPath],
    };
  }
  const unavailable = stageIds
    .map((stageId) => graph.nodes.find((candidate) => candidate.id === stageId))
    .filter((node) => node?.status !== "structurally_present");
  if (unavailable.length > 0) {
    const status = unavailable.some((node) => node?.status === "blocked")
      ? "blocked"
      : "not_configured";
    return {
      id,
      status,
      detail: `Generated source/build evidence exists, but ${id} runtime activation is ${status}: ${unavailable
        .map((node) => `${node?.id ?? "unknown"}: ${node?.reason ?? "missing evidence"}`)
        .join("; ")}`.slice(0, 1_000),
      evidencePaths: nodeEvidencePaths(graph, stageIds),
    };
  }
  return {
    id,
    status: "implemented",
    detail: implementedDetail,
    evidencePaths: nodeEvidencePaths(graph, stageIds),
  };
}

export function productionWorkspaceCapabilities(input: {
  graph: ProductionArtifactGraph;
  entrypoint: string;
  testEvidencePath: string;
}): WorkspaceCapability[] {
  const { graph } = input;
  const required = deriveProductionCapabilityRequirements(graph.requirements);
  const runtimeNode = graph.nodes.find((node) => node.id === "nimbus");
  const serviceRuntimeNotConfigured =
    graph.requirements.runtimeProfile === "service_app" &&
    runtimeNode?.status !== "structurally_present";
  const withRuntimeBoundary = (stageIds: readonly ProductionStageId[]) =>
    serviceRuntimeNotConfigured
      ? (uniqueSorted([...stageIds, "nimbus"]) as ProductionStageId[])
      : stageIds;
  return [
    {
      id: "frontend",
      status: "implemented",
      detail:
        "The multi-file frontend source is present and passed the isolated workspace validation profile.",
      evidencePaths: [input.entrypoint],
    },
    capability(
      graph,
      "backend",
      required.backend,
      withRuntimeBoundary(CAPABILITY_STAGE_IDS.backend),
      "The backend source capability is implemented and passed isolated source validation; provider runtime activation is not verified by this manifest.",
    ),
    capability(
      graph,
      "api",
      required.api,
      withRuntimeBoundary(CAPABILITY_STAGE_IDS.api),
      "The approved API operation source contracts are implemented and passed isolated validation; deployed endpoint activation is not verified.",
    ),
    capability(
      graph,
      "database",
      required.database,
      withRuntimeBoundary(CAPABILITY_STAGE_IDS.database),
      "Schema, migrations, integrity checks, rollback and backup source evidence are implemented and source-validated; no provider database was contacted.",
    ),
    capability(
      graph,
      "auth",
      required.auth,
      withRuntimeBoundary(CAPABILITY_STAGE_IDS.auth),
      "The approved identity, session and authorization source contract is implemented and source-validated; no deployed identity runtime is claimed.",
    ),
    capability(
      graph,
      "integrations",
      required.integrations,
      withRuntimeBoundary(CAPABILITY_STAGE_IDS.integrations),
      "Approved adapter, webhook, retry and error-mapping source contracts are implemented and source-validated; provider connectivity is not claimed.",
    ),
    {
      id: "tests",
      status: "implemented",
      detail:
        "The candidate contains tests and the signed isolated runner reported every test phase passed.",
      evidencePaths: [input.testEvidencePath],
    },
    capability(
      graph,
      "deployment",
      required.deployment,
      CAPABILITY_STAGE_IDS.deployment,
      "Deployment configuration and runtime composition source are implemented and build-validated; provider activation remains not verified and no deployment was executed.",
    ),
    capability(
      graph,
      "monitoring",
      required.monitoring,
      CAPABILITY_STAGE_IDS.monitoring,
      "Monitoring source and scope are implemented and build-validated; runtime monitoring activation remains not verified.",
    ),
  ];
}

function runnerValidations(
  report: WorkspaceRunnerValidationResult["report"],
  reportSha256: string,
): WorkspaceValidation[] {
  if (
    report.steps.some(
      (step) => step.status !== "passed" || step.evidence !== "measured" || step.exitCode !== 0,
    )
  ) {
    throw new AgentOutputError("WORKSPACE_RUNNER_VALIDATION_FAILED", false);
  }
  return (["typecheck", "lint", "test", "build", "security"] as const).map((scope) => {
    const step = report.steps.find((candidate) => candidate.id === scope);
    if (
      !step ||
      step.status !== "passed" ||
      step.evidence !== "measured" ||
      step.exitCode !== 0 ||
      !step.completedAt
    ) {
      throw new AgentOutputError("WORKSPACE_RUNNER_VALIDATION_FAILED", false);
    }
    const reportEvidence = `Signed runner report SHA-256: ${reportSha256}.`;
    const detail = `${step.detail.slice(0, 999 - reportEvidence.length)} ${reportEvidence}`;
    return {
      scope,
      status: "passed",
      evidence: "measured",
      detail,
      tool: step.tool,
      completedAt: step.completedAt,
      evidencePaths: [],
    };
  });
}

/**
 * Promote a hash-bound Production candidate only after the authenticated
 * workspace-runner adapter has returned a fully passing report. This seals
 * source; it does not deploy it or provision any external service.
 */
export async function sealProductionBuildJobWorkspace(input: {
  job: BuildJob;
  graph: ProductionArtifactGraph;
  validation: WorkspaceRunnerValidationResult;
  quality: {
    report: ProductionWorkspaceQualityReport;
    reportSha256: string;
    irisReview?: ReviewResult;
  };
}): Promise<WorkspaceManifest> {
  const { job, graph, validation, quality } = input;
  if (job.buildLevel !== "production" || !job.files) {
    throw new AgentOutputError("PRODUCTION_WORKSPACE_CANDIDATE_MISSING", false);
  }
  const parsedCandidate = WorkspaceCandidateSchema.safeParse(validation.candidate);
  const parsedReport = WorkspaceRunnerReportSchema.safeParse(validation.report);
  const parsedGraph = ProductionArtifactGraphSchema.safeParse(graph);
  if (!parsedCandidate.success || !parsedReport.success || !parsedGraph.success) {
    throw new AgentOutputError("PRODUCTION_RUNNER_EVIDENCE_INVALID", false);
  }
  const candidate = parsedCandidate.data;
  const report = parsedReport.data;
  const canonicalGraph = parsedGraph.data;
  assertProductionCandidateIdentity(job, candidate);
  if (
    candidate.sourceSha256 !== canonicalGraph.candidateSha256 ||
    report.candidateSha256 !== candidate.sourceSha256
  ) {
    throw new AgentOutputError("PRODUCTION_RUNNER_CANDIDATE_MISMATCH", false);
  }
  const candidateVerification = await verifyProductionWorkspaceCandidate(job.files, candidate);
  if (!candidateVerification.valid) {
    throw new AgentOutputError("PRODUCTION_WORKSPACE_CANDIDATE_INVALID", false);
  }
  const graphVerification = await verifyProductionArtifactGraph({
    candidate,
    files: job.files,
    graph: canonicalGraph,
  });
  if (!graphVerification.valid) {
    throw new AgentOutputError("PRODUCTION_ARTIFACT_GRAPH_INVALID", false);
  }

  const testEvidencePath = candidate.files.find((descriptor) => descriptor.role === "test")?.path;
  if (!testEvidencePath) {
    throw new AgentOutputError("PRODUCTION_TEST_EVIDENCE_MISSING", false);
  }
  const runnerReportSha256 = await sha256Hex(JSON.stringify(report));
  const previewHtml = createProductionInlinePreview(
    job.files,
    candidate.entrypoint,
    candidate.sourceSha256,
  );
  const parsedQuality = ProductionWorkspaceQualityReportSchema.safeParse(quality.report);
  if (
    !parsedQuality.success ||
    !job.quality?.twin ||
    !job.quality.echo ||
    !job.quality.swift ||
    !(await verifyProductionWorkspaceQualityReport({
      files: job.files,
      candidate,
      previewHtml,
      runnerReport: report,
      runtimeProfile: canonicalGraph.requirements.runtimeProfile,
      browserQuality: {
        twin: job.quality.twin,
        echo: job.quality.echo,
        swift: job.quality.swift,
      },
      ...(quality.irisReview ? { irisReview: quality.irisReview } : {}),
      brief: job.prompt,
      acceptanceCriteria: productionAcceptanceCriteria(job),
      report: parsedQuality.data,
      reportSha256: quality.reportSha256,
    }))
  ) {
    throw new AgentOutputError("PRODUCTION_WORKSPACE_QUALITY_INVALID", false);
  }
  assertProductionWorkspaceQualityPassed(parsedQuality.data, {
    candidateSha256: candidate.sourceSha256,
    previewSha256: await sha256Hex(previewHtml),
    runnerReportSha256,
  });
  const validations = runnerValidations(report, runnerReportSha256);
  const capabilities = productionWorkspaceCapabilities({
    graph: canonicalGraph,
    entrypoint: candidate.entrypoint,
    testEvidencePath,
  });
  if (
    capabilities.some(
      (candidate) =>
        candidate.status === "not_configured" || candidate.status === "blocked",
    )
  ) {
    throw new AgentOutputError("PRODUCTION_CONFIGURATION_INCOMPLETE", false);
  }
  const sealed = await sealWorkspace({
    jobId: job.id,
    ...(job.projectId ? { projectId: job.projectId } : {}),
    locale: job.locale,
    pipelineVersion: candidate.pipelineVersion,
    createdAt: job.createdAt,
    buildLevel: "production",
    entrypoint: candidate.entrypoint,
    files: job.files,
    capabilities,
    validations,
  });
  job.files = sealed.files;
  job.workspace = sealed.manifest;
  job.production = {
    candidate,
    graph: canonicalGraph,
    runnerReport: report,
    runnerReportSha256,
    qualityReport: parsedQuality.data,
    qualityReportSha256: quality.reportSha256,
    ...(quality.irisReview ? { irisReview: quality.irisReview } : {}),
  };
  return sealed.manifest;
}
