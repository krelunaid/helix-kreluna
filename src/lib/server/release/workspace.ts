import type { BuildJob } from "@/lib/agent-types";
import { HELIX_PIPELINE_VERSION } from "@/lib/server/jobs/pipeline";
import { sealWorkspace, type WorkspaceCapability, type WorkspaceValidation } from "@/lib/workspace";

function unconfiguredCapability(
  id: WorkspaceCapability["id"],
  detail: string,
): WorkspaceCapability {
  return {
    id,
    status: "not_configured",
    detail,
    evidencePaths: ["docs/artifact-level.md"],
  };
}

function notRunValidation(
  scope: WorkspaceValidation["scope"],
  detail: string,
  evidencePaths: string[] = [],
): WorkspaceValidation {
  return {
    scope,
    status: "not_run",
    evidence: "not_run",
    detail,
    evidencePaths,
  };
}

type BrowserEvidence = {
  status: "completed" | "failed" | "not_run";
  evidence: "measured" | "not_run";
  generatedAt: string;
  runner?: string;
};

function browserValidation(
  scope: "browser" | "accessibility" | "performance",
  report: BrowserEvidence | undefined,
): WorkspaceValidation {
  if (!report || report.status === "not_run") {
    return notRunValidation(
      scope,
      `${scope} evidence was not executed for this preview artifact.`,
      ["docs/qa.json"],
    );
  }
  return {
    scope,
    status: report.status === "completed" ? "passed" : "failed",
    evidence: "measured",
    detail:
      report.status === "completed"
        ? `${scope} evidence completed against the exact preview artifact.`
        : `${scope} evidence failed against the exact preview artifact.`,
    tool: report.runner ?? `helix-${scope}`,
    completedAt: report.generatedAt,
    evidencePaths: ["docs/qa.json"],
  };
}

/**
 * Seal the release documents and HTML as a bounded, deterministic Prototype
 * workspace. This does not upgrade the artifact to Production: capabilities
 * without real services remain explicitly not_configured, and validations
 * that did not execute remain not_run.
 */
export async function sealBuildJobWorkspace(job: BuildJob): Promise<void> {
  if (job.buildLevel !== "prototype") {
    throw new Error("PRODUCTION_WORKSPACE_NOT_CONFIGURED");
  }
  if (!job.files || !job.html || job.files["index.html"] !== job.html) {
    throw new Error("BUILD_JOB_WORKSPACE_FILES_MISSING");
  }
  if (!job.quality?.aegis?.passed) {
    throw new Error("BUILD_JOB_WORKSPACE_SECURITY_MISSING");
  }
  if (!job.quality.twin || !job.quality.echo || !job.quality.swift) {
    throw new Error("BUILD_JOB_WORKSPACE_QA_MISSING");
  }
  // Refresh evidence documents from the exact reports used at the final gate.
  job.files["docs/security.json"] = JSON.stringify(job.quality.aegis, null, 2);
  job.files["docs/qa.json"] = JSON.stringify(
    {
      twin: job.quality.twin,
      echo: job.quality.echo,
      swift: job.quality.swift,
    },
    null,
    2,
  );

  const capabilities: WorkspaceCapability[] = [
    {
      id: "frontend",
      status: "implemented",
      detail: "The interactive HTML preview is present as the workspace entrypoint.",
      evidencePaths: ["index.html"],
    },
    unconfiguredCapability(
      "backend",
      "No production server runtime is implemented in this Prototype workspace.",
    ),
    unconfiguredCapability(
      "api",
      "No production API routes are implemented in this Prototype workspace.",
    ),
    unconfiguredCapability(
      "database",
      "No production database or migration is implemented in this Prototype workspace.",
    ),
    unconfiguredCapability(
      "auth",
      "No production identity, session or authorization service is implemented in this Prototype workspace.",
    ),
    unconfiguredCapability(
      "integrations",
      "No production external adapter, connection test, webhook, retry or error mapping is implemented in this Prototype workspace.",
    ),
    {
      id: "tests",
      status: "not_configured",
      detail: "Browser reports may exist, but no workspace test suite was compiled and executed.",
      evidencePaths: ["docs/qa.json"],
    },
    unconfiguredCapability(
      "deployment",
      "The approved HTML can use Helix publication, but this exported workspace has no verified provider deployment configuration.",
    ),
    unconfiguredCapability(
      "monitoring",
      "Per-job AI usage telemetry is exported when available, but no uptime, runtime error, deploy-health or dependency monitoring is configured for this Prototype workspace.",
    ),
  ];

  const validations: WorkspaceValidation[] = [
    notRunValidation(
      "typecheck",
      "The generated Prototype is HTML and no workspace TypeScript typecheck was executed.",
    ),
    notRunValidation(
      "lint",
      "No workspace lint command was executed for this generated Prototype.",
    ),
    notRunValidation(
      "test",
      "No workspace unit or integration test command was executed for this generated Prototype.",
    ),
    notRunValidation(
      "build",
      "No standalone workspace build command was executed for this generated Prototype.",
    ),
    {
      scope: "security",
      status: "passed",
      evidence: "measured",
      detail: `Aegis completed with ${job.quality.aegis.blockerCount} blocking finding(s).`,
      tool: `${job.quality.aegis.scanner}@${job.quality.aegis.version}`,
      completedAt: job.quality.aegis.measuredAt,
      evidencePaths: ["docs/security.json"],
    },
    browserValidation("browser", job.quality.twin),
    browserValidation("accessibility", job.quality.echo),
    browserValidation("performance", job.quality.swift),
    notRunValidation(
      "deployment",
      "No provider deployment was executed while sealing the release candidate.",
    ),
  ];

  const sealed = await sealWorkspace({
    jobId: job.id,
    projectId: job.projectId,
    locale: job.locale,
    pipelineVersion: job.checkpoint?.pipelineVersion ?? HELIX_PIPELINE_VERSION,
    createdAt: job.createdAt,
    buildLevel: job.buildLevel,
    entrypoint: "index.html",
    files: job.files,
    capabilities,
    validations,
  });
  job.files = sealed.files;
  job.workspace = sealed.manifest;
}
