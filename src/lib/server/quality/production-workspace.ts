import { z } from "zod";
import type { WorkspaceCandidate } from "@/lib/workspace";
import { verifyProductionWorkspaceCandidate } from "@/lib/workspace";
import { sha256Hex } from "@/lib/server/agents/patch";
import {
  AgentOutputError,
  ReviewResultSchema,
  type ReviewResult,
} from "@/lib/server/agents/types";
import {
  AegisReportSchema,
  EchoAccessibilityReportSchema,
  SwiftPerformanceReportSchema,
  TwinBrowserReportSchema,
  type AegisReport,
  type EchoAccessibilityReport,
  type SwiftPerformanceReport,
  type TwinBrowserReport,
} from "@/lib/server/quality/types";
import {
  runAegisStaticScan,
} from "@/lib/server/quality/aegis";
import {
  WorkspaceRunnerReportSchema,
  type WorkspaceRunnerReport,
} from "@/lib/server/workspace-runner";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const ProductionWorkspaceQualityCheckIdSchema = z.enum([
  "candidate_integrity",
  "aegis_static_security",
  "secret_scan",
  "dependency_audit",
  "static_workspace_review",
  "runtime_quality",
]);
type ProductionWorkspaceQualityCheckId = z.infer<
  typeof ProductionWorkspaceQualityCheckIdSchema
>;

const ProductionWorkspaceQualityFindingSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    checkId: ProductionWorkspaceQualityCheckIdSchema,
    severity: z.literal("blocker"),
    path: z.string().trim().min(1).max(512).optional(),
    line: z.number().int().positive().optional(),
    message: z.string().trim().min(1).max(500),
    evidence: z.string().trim().min(1).max(240),
  })
  .strict();
export type ProductionWorkspaceQualityFinding = z.infer<
  typeof ProductionWorkspaceQualityFindingSchema
>;

const ProductionWorkspaceQualityCheckSchema = z
  .object({
    id: ProductionWorkspaceQualityCheckIdSchema,
    status: z.enum(["passed", "failed", "not_run"]),
    evidence: z.enum(["measured", "not_run"]),
    tool: z.string().trim().min(1).max(160),
    findingCount: z.number().int().nonnegative(),
    evidenceSha256: z.string().regex(SHA256_PATTERN),
    detail: z.string().trim().min(1).max(1_000),
  })
  .strict();

const ProductionRuntimeAgentEvidenceSchema = z
  .object({
    agent: z.enum(["twin", "echo", "swift"]),
    status: z.enum(["completed", "failed", "not_run"]),
    evidence: z.enum(["measured", "not_run"]),
    artifactSha256: z.string().regex(SHA256_PATTERN),
    reportSha256: z.string().regex(SHA256_PATTERN),
  })
  .strict()
  .superRefine((entry, context) => {
    if (
      (entry.status === "not_run" && entry.evidence !== "not_run") ||
      (entry.status !== "not_run" && entry.evidence !== "measured")
    ) {
      context.addIssue({
        code: "custom",
        message: "Runtime report status and evidence kind disagree",
      });
    }
  });

const ProductionIrisRuntimeEvidenceSchema = z.discriminatedUnion("status", [
  z
    .object({
      agent: z.literal("iris"),
      status: z.enum(["passed", "failed", "inconclusive"]),
      evidence: z.enum(["browser_assisted", "static_only"]),
      artifactSha256: z.string().regex(SHA256_PATTERN),
      reportSha256: z.string().regex(SHA256_PATTERN),
      briefSha256: z.string().regex(SHA256_PATTERN),
      acceptanceCriteriaSha256: z.string().regex(SHA256_PATTERN),
      acceptanceCriteriaCount: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      agent: z.literal("iris"),
      status: z.literal("not_run"),
      evidence: z.literal("not_run"),
      artifactSha256: z.string().regex(SHA256_PATTERN),
      reasonCode: z.enum([
        "browser_runner_unconfigured",
        "browser_evidence_incomplete",
      ]),
      detail: z.string().trim().min(1).max(500),
      briefSha256: z.string().regex(SHA256_PATTERN),
      acceptanceCriteriaSha256: z.string().regex(SHA256_PATTERN),
      acceptanceCriteriaCount: z.number().int().nonnegative(),
    })
    .strict(),
]);

const ProductionRuntimeQualitySchema = z
  .object({
    policy: z.enum(["optional_for_static_site", "required_for_interactive_app"]),
    required: z.boolean(),
    validated: z.boolean(),
    reports: z.array(ProductionRuntimeAgentEvidenceSchema).length(3),
    iris: ProductionIrisRuntimeEvidenceSchema,
  })
  .strict();

export const ProductionWorkspaceQualityReportSchema = z
  .object({
    kind: z.literal("production_workspace_quality"),
    schemaVersion: z.literal("1.0.0"),
    scanner: z.literal("helix-production-quality"),
    version: z.literal("1.0.0"),
    evidence: z.literal("measured"),
    measuredAt: z.string().datetime({ offset: true }),
    candidateSha256: z.string().regex(SHA256_PATTERN),
    previewSha256: z.string().regex(SHA256_PATTERN),
    runnerReportSha256: z.string().regex(SHA256_PATTERN),
    passed: z.boolean(),
    blockerCount: z.number().int().nonnegative(),
    checks: z.array(ProductionWorkspaceQualityCheckSchema).length(6),
    findings: z.array(ProductionWorkspaceQualityFindingSchema),
    aegis: AegisReportSchema,
    runtimeQuality: ProductionRuntimeQualitySchema,
    scope: z.array(z.string().trim().min(1)).min(1),
    limitations: z.array(z.string().trim().min(1)).min(1),
  })
  .strict()
  .superRefine((report, context) => {
    const expectedIds = ProductionWorkspaceQualityCheckIdSchema.options;
    const ids = report.checks.map((check) => check.id);
    if (ids.some((id, index) => id !== expectedIds[index])) {
      context.addIssue({
        code: "custom",
        path: ["checks"],
        message: "Production workspace quality checks must use the fixed order",
      });
    }
    const blockerCount = report.findings.filter(
      (finding) => finding.severity === "blocker",
    ).length;
    if (report.blockerCount !== blockerCount || report.passed !== (blockerCount === 0)) {
      context.addIssue({
        code: "custom",
        message: "Production workspace quality pass state is inconsistent",
      });
    }
    for (const check of report.checks) {
      const findingCount = report.findings.filter(
        (finding) => finding.checkId === check.id,
      ).length;
      const expectedStatus =
        check.id === "runtime_quality" &&
        !report.runtimeQuality.required &&
        !report.runtimeQuality.validated &&
        findingCount === 0
          ? "not_run"
          : findingCount === 0
            ? "passed"
            : "failed";
      const expectedEvidence = expectedStatus === "not_run" ? "not_run" : "measured";
      if (
        check.findingCount !== findingCount ||
        check.status !== expectedStatus ||
        check.evidence !== expectedEvidence
      ) {
        context.addIssue({
          code: "custom",
          path: ["checks", check.id],
          message: "Production workspace quality check state is inconsistent",
        });
      }
    }
    if (report.aegis.artifactSha256 !== report.previewSha256) {
      context.addIssue({
        code: "custom",
        path: ["aegis", "artifactSha256"],
        message: "Aegis evidence must cover the exact Production preview",
      });
    }
    const expectedAgents = ["twin", "echo", "swift"];
    if (
      report.runtimeQuality.reports.some(
        (entry, index) => entry.agent !== expectedAgents[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["runtimeQuality"],
        message: "Runtime quality evidence must use the fixed agent order",
      });
    }
    if (
      report.runtimeQuality.required !==
        (report.runtimeQuality.policy === "required_for_interactive_app") ||
      report.runtimeQuality.validated !==
        (report.runtimeQuality.iris.status === "passed" &&
          report.runtimeQuality.reports.every((entry) => entry.status === "completed"))
    ) {
      context.addIssue({
        code: "custom",
        path: ["runtimeQuality"],
        message: "Runtime quality policy or validation state is inconsistent",
      });
    }
    if (
      report.runtimeQuality.required &&
      !report.runtimeQuality.validated &&
      !report.findings.some((finding) => finding.checkId === "runtime_quality")
    ) {
      context.addIssue({
        code: "custom",
        path: ["runtimeQuality"],
        message: "Required runtime quality cannot be unvalidated without blocking evidence",
      });
    }
  });
export type ProductionWorkspaceQualityReport = z.infer<
  typeof ProductionWorkspaceQualityReportSchema
>;

export class ProductionWorkspaceQualityBlockedError extends AgentOutputError {
  constructor() {
    super("PRODUCTION_WORKSPACE_QUALITY_BLOCKED", false);
    this.name = "ProductionWorkspaceQualityBlockedError";
  }
}

type MutableFinding = ProductionWorkspaceQualityFinding;

function lineAt(source: string, index: number): number {
  return source.slice(0, Math.max(0, index)).split("\n").length;
}

function addFinding(
  findings: MutableFinding[],
  finding: MutableFinding,
): void {
  if (
    findings.some(
      (candidate) =>
        candidate.id === finding.id &&
        candidate.checkId === finding.checkId &&
        candidate.path === finding.path &&
        candidate.line === finding.line,
    )
  ) {
    return;
  }
  findings.push(finding);
}

function scanMatches(
  source: string,
  expression: RegExp,
  visit: (match: RegExpExecArray) => void,
): void {
  expression.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(source))) visit(match);
}

const SECRET_PATTERNS = [
  {
    id: "private_key_material",
    expression: /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/gu,
    evidence: "private-key PEM marker (value redacted)",
  },
  {
    id: "github_credential",
    expression: /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/gu,
    evidence: "GitHub credential prefix (value redacted)",
  },
  {
    id: "provider_credential",
    expression:
      /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]{16,}\b|\bxai-[A-Za-z0-9_-]{16,}\b|\bAIza[A-Za-z0-9_-]{24,}\b/gu,
    evidence: "provider credential prefix (value redacted)",
  },
  {
    id: "assigned_secret_literal",
    expression:
      /(?:api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[:=]\s*["'][^"'\r\n]{16,}["']/giu,
    evidence: "secret-named literal assignment (value redacted)",
  },
] as const;

function isSecretEnvironmentName(name: string): boolean {
  return /(?:SECRET|TOKEN|PASSWORD|PRIVATE|API_?KEY|CLIENT_?KEY)/iu.test(name);
}

function isEnvironmentPlaceholder(value: string): boolean {
  return (
    value === "" ||
    /^<[^>]+>$/u.test(value) ||
    /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/u.test(value) ||
    /^(?:YOUR|REPLACE|CHANGEME|EXAMPLE|PLACEHOLDER)[_-]/iu.test(value)
  );
}

export function scanProductionWorkspaceSecrets(
  files: Readonly<Record<string, string>>,
): ProductionWorkspaceQualityFinding[] {
  const findings: MutableFinding[] = [];
  for (const [path, source] of Object.entries(files)) {
    for (const pattern of SECRET_PATTERNS) {
      scanMatches(source, pattern.expression, (match) =>
        addFinding(findings, {
          id: pattern.id,
          checkId: "secret_scan",
          severity: "blocker",
          path,
          line: lineAt(source, match.index),
          message: "Credential-like material is embedded in the Production workspace.",
          evidence: pattern.evidence,
        }),
      );
    }
    if (!path.toLocaleLowerCase("en-US").endsWith(".env.example")) continue;
    source.split(/\r?\n/u).forEach((line, index) => {
      const assignment = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
      if (!assignment) return;
      const name = assignment[1] ?? "";
      const value = (assignment[2] ?? "").replace(/^["']|["']$/gu, "");
      if (!isSecretEnvironmentName(name) || isEnvironmentPlaceholder(value)) return;
      addFinding(findings, {
        id: "populated_secret_environment",
        checkId: "secret_scan",
        severity: "blocker",
        path,
        line: index + 1,
        message: "A secret-like environment variable contains a versioned value.",
        evidence: `${name} contains a non-placeholder value (value redacted)`,
      });
    });
  }
  return findings;
}

function isStaticSourcePath(path: string): boolean {
  return /\.(?:html|js|jsx|mjs|cjs|ts|tsx|sql)$/iu.test(path);
}

export function scanProductionWorkspaceStaticSecurity(
  files: Readonly<Record<string, string>>,
): ProductionWorkspaceQualityFinding[] {
  const findings: MutableFinding[] = [];
  const patterns = [
    {
      id: "dynamic_code_execution",
      expression: /\beval\s*\(|\bnew\s+Function\s*\(|\bdocument\.write(?:ln)?\s*\(/giu,
      message: "Dynamic code or document parser execution is forbidden.",
      evidence: "eval/new Function/document.write call",
    },
    {
      id: "unsafe_html_parser_sink",
      expression:
        /(?:\.\s*(?:innerHTML|outerHTML)\s*=|\.insertAdjacentHTML\s*\(|dangerouslySetInnerHTML\s*=)/giu,
      message: "HTML parser sinks require a semantic XSS review and block this automatic gate.",
      evidence: "innerHTML/outerHTML/insertAdjacentHTML/dangerouslySetInnerHTML",
    },
    {
      id: "interpolated_sql",
      expression:
        /\b(?:query|execute|raw)\s*\(\s*`[^`]*\$\{|\b(?:query|execute|raw)\s*\(\s*["'][^"'\r\n]*["']\s*\+|\bsql\s*\.\s*unsafe\s*\(/giu,
      message: "An executable SQL call appears to interpolate untrusted text instead of parameters.",
      evidence: "interpolated or unsafe SQL execution pattern",
    },
  ] as const;

  for (const [path, source] of Object.entries(files)) {
    if (!isStaticSourcePath(path)) continue;
    for (const pattern of patterns) {
      scanMatches(source, pattern.expression, (match) =>
        addFinding(findings, {
          id: pattern.id,
          checkId: "static_workspace_review",
          severity: "blocker",
          path,
          line: lineAt(source, match.index),
          message: pattern.message,
          evidence: pattern.evidence,
        }),
      );
    }
    if (
      path.startsWith("apps/web/") &&
      /\bprocess\.env\b|\bimport\.meta\.env\s*\.\s*(?:[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE|API_KEY))/iu.test(
        source,
      )
    ) {
      addFinding(findings, {
        id: "browser_secret_environment_access",
        checkId: "static_workspace_review",
        severity: "blocker",
        path,
        message: "Browser source reads a server or secret-like environment namespace.",
        evidence: "browser environment access (variable value unavailable)",
      });
    }
    if (path.startsWith("server/api/") && /\.(?:js|mjs|ts)$/iu.test(path)) {
      const authorizationIndex = source.indexOf("ports.authorization.authorize");
      const denyIndex = source.indexOf("authorization !== true");
      const invocationIndex = source.indexOf("useCase(");
      if (
        authorizationIndex < 0 ||
        denyIndex < authorizationIndex ||
        invocationIndex < denyIndex
      ) {
        addFinding(findings, {
          id: "api_authorization_order_missing",
          checkId: "static_workspace_review",
          severity: "blocker",
          path,
          message: "An API route does not prove fail-closed authorization before its use case.",
          evidence: "authorization → deny → use-case ordering check",
        });
      }
    }
  }
  return findings;
}

function qualityCheck(input: {
  id: ProductionWorkspaceQualityCheckId;
  findings: readonly ProductionWorkspaceQualityFinding[];
  tool: string;
  evidenceSha256: string;
  passedDetail: string;
  notRun?: boolean;
}): z.infer<typeof ProductionWorkspaceQualityCheckSchema> {
  const findingCount = input.findings.filter(
    (finding) => finding.checkId === input.id,
  ).length;
  return {
    id: input.id,
    status: findingCount > 0 ? "failed" : input.notRun ? "not_run" : "passed",
    evidence: findingCount === 0 && input.notRun ? "not_run" : "measured",
    tool: input.tool,
    findingCount,
    evidenceSha256: input.evidenceSha256,
    detail:
      findingCount === 0
        ? input.passedDetail
        : `${findingCount} release-blocking finding(s) recorded with redacted evidence.`,
  };
}

function runnerFinding(
  id: string,
  message: string,
  evidence: string,
): ProductionWorkspaceQualityFinding {
  return {
    id,
    checkId: "dependency_audit",
    severity: "blocker",
    path: "package-lock.json",
    message,
    evidence,
  };
}

function dependencyAuditFindings(
  report: WorkspaceRunnerReport,
): ProductionWorkspaceQualityFinding[] {
  const build = report.steps.find((step) => step.id === "build");
  const security = report.steps.find((step) => step.id === "security");
  if (!build || !security) {
    return [
      runnerFinding(
        "dependency_audit_missing",
        "The signed runner report does not contain the required post-build dependency audit.",
        "fixed runner profile is incomplete",
      ),
    ];
  }
  const findings: ProductionWorkspaceQualityFinding[] = [];
  if (
    security.status !== "passed" ||
    security.evidence !== "measured" ||
    security.exitCode !== 0 ||
    security.networkPolicy !== "package_registry_only" ||
    !/^npm audit --omit=dev --audit-level=high$/u.test(security.tool)
  ) {
    findings.push(
      runnerFinding(
        "dependency_audit_failed",
        "The measured production-dependency audit did not pass the fixed runner policy.",
        "signed npm audit step was absent, failed, or used the wrong policy",
      ),
    );
  }
  const buildCompletedAt = build.completedAt ? Date.parse(build.completedAt) : Number.NaN;
  const securityStartedAt = security.startedAt ? Date.parse(security.startedAt) : Number.NaN;
  if (
    !Number.isFinite(buildCompletedAt) ||
    !Number.isFinite(securityStartedAt) ||
    securityStartedAt < buildCompletedAt
  ) {
    findings.push(
      runnerFinding(
        "dependency_audit_not_post_build",
        "The dependency audit is not proven to have run after the successful build.",
        "signed runner timestamps do not establish build → audit order",
      ),
    );
  }
  return findings;
}

function candidateIntegrityFindings(
  errors: readonly string[],
): ProductionWorkspaceQualityFinding[] {
  return errors.map((error, index) => ({
    id: `candidate_integrity_${index + 1}`,
    checkId: "candidate_integrity",
    severity: "blocker",
    message: "The Production workspace no longer matches its immutable candidate.",
    evidence: error.slice(0, 240),
  }));
}

function aegisFindings(report: AegisReport): ProductionWorkspaceQualityFinding[] {
  return report.findings
    .filter((finding) => finding.severity === "blocker")
    .map((finding) => ({
      id: `aegis_${finding.id}`,
      checkId: "aegis_static_security" as const,
      severity: "blocker" as const,
      ...(finding.line ? { line: finding.line } : {}),
      message: finding.message,
      evidence: finding.evidence,
    }));
}

export type ProductionBrowserQualityEvidence = {
  twin: TwinBrowserReport;
  echo: EchoAccessibilityReport;
  swift: SwiftPerformanceReport;
};

type ProductionRuntimeProfile = "static_site" | "client_only_app" | "service_app";

function runtimeFinding(
  id: string,
  message: string,
  evidence: string,
): ProductionWorkspaceQualityFinding {
  return {
    id,
    checkId: "runtime_quality",
    severity: "blocker",
    message,
    evidence,
  };
}

async function runtimeQualityEvidence(input: {
  runtimeProfile: ProductionRuntimeProfile;
  previewSha256: string;
  browserQuality: ProductionBrowserQualityEvidence;
  irisReview?: ReviewResult;
  brief: string;
  acceptanceCriteria: readonly string[];
}): Promise<{
  runtimeQuality: z.infer<typeof ProductionRuntimeQualitySchema>;
  findings: ProductionWorkspaceQualityFinding[];
  evidenceSha256: string;
}> {
  const twin = TwinBrowserReportSchema.parse(input.browserQuality.twin);
  const echo = EchoAccessibilityReportSchema.parse(input.browserQuality.echo);
  const swift = SwiftPerformanceReportSchema.parse(input.browserQuality.swift);
  const reports = await Promise.all(
    ([
      ["twin", twin],
      ["echo", echo],
      ["swift", swift],
    ] as const).map(async ([agent, report]) => ({
      agent,
      status: report.status,
      evidence: report.evidence,
      artifactSha256: report.artifactSha256,
      reportSha256: await sha256Hex(JSON.stringify(report)),
    })),
  );
  const required = input.runtimeProfile !== "static_site";
  const allNotRun = reports.every((report) => report.status === "not_run");
  const allCompleted = reports.every((report) => report.status === "completed");
  const findings: ProductionWorkspaceQualityFinding[] = [];
  if (reports.some((report) => report.artifactSha256 !== input.previewSha256)) {
    findings.push(
      runtimeFinding(
        "browser_artifact_mismatch",
        "Browser quality evidence covers a different Production preview.",
        "Twin/Echo/Swift artifact hash mismatch",
      ),
    );
  }
  if (reports.some((report) => report.status === "failed")) {
    findings.push(
      runtimeFinding(
        "browser_quality_failed",
        "At least one authenticated browser quality run failed.",
        "Twin/Echo/Swift contains measured failed evidence",
      ),
    );
  }
  if (!allNotRun && !allCompleted) {
    findings.push(
      runtimeFinding(
        "browser_quality_incomplete",
        "Browser quality evidence is incomplete or mixes measured and not-run reports.",
        "Twin/Echo/Swift status set is not uniformly completed or not_run",
      ),
    );
  }
  if (required && !allCompleted) {
    findings.push(
      runtimeFinding(
        "interactive_runtime_not_validated",
        "Interactive Production workspaces require completed Twin, Echo and Swift evidence.",
        "runtime policy requires authenticated browser measurements",
      ),
    );
  }
  if (allCompleted) {
    if (
      twin.status !== "completed" ||
      echo.status !== "completed" ||
      swift.status !== "completed"
    ) {
      throw new AgentOutputError("PRODUCTION_BROWSER_EVIDENCE_INVALID", false);
    }
    if (twin.consoleErrors.length > 0 || twin.runtimeErrors.length > 0) {
      findings.push(
        runtimeFinding(
          "browser_runtime_errors",
          "Twin captured browser console or runtime errors.",
          `${twin.consoleErrors.length + twin.runtimeErrors.length} redacted error(s)`,
        ),
      );
    }
    if (!echo.passed || echo.findings.length > 0) {
      findings.push(
        runtimeFinding(
          "accessibility_failed",
          "Echo reported measured accessibility failures.",
          `${echo.findings.length} accessibility finding group(s)`,
        ),
      );
    }
    const changedPrimaryAction = twin.actions.some(
      (action) =>
        (action.type === "click" || action.type === "submit") && action.changed,
    );
    if (required && !changedPrimaryAction) {
      findings.push(
        runtimeFinding(
          "interactive_action_not_verified",
          "Twin did not verify a changed click or submit interaction for the interactive app.",
          "no measured changed primary action",
        ),
      );
    }
    if (twin.screenshots.length < 2 || swift.metrics.length < 2) {
      findings.push(
        runtimeFinding(
          "browser_coverage_incomplete",
          "Runtime evidence does not cover both desktop and phone rendering.",
          "fewer than two screenshot or performance viewport records",
        ),
      );
    }
  }

  const briefSha256 = await sha256Hex(input.brief);
  const acceptanceCriteriaSha256 = await sha256Hex(
    JSON.stringify(input.acceptanceCriteria),
  );
  const parsedIris = input.irisReview
    ? ReviewResultSchema.safeParse(input.irisReview)
    : null;
  if (input.irisReview && !parsedIris?.success) {
    findings.push(
      runtimeFinding(
        "iris_report_invalid",
        "Iris returned an invalid runtime review contract.",
        "Iris ReviewResult schema validation failed",
      ),
    );
  }
  if (allCompleted && !parsedIris?.success) {
    findings.push(
      runtimeFinding(
        "iris_not_executed",
        "Completed browser evidence requires a hash-bound Iris review before sealing.",
        "Iris review missing for completed Twin/Echo/Swift evidence",
      ),
    );
  }
  if (parsedIris?.success) {
    if (parsedIris.data.artifactSha256 !== input.previewSha256) {
      findings.push(
        runtimeFinding(
          "iris_artifact_mismatch",
          "Iris reviewed a different Production preview.",
          "Iris artifact hash mismatch",
        ),
      );
    }
    if (parsedIris.data.status !== "passed" || !parsedIris.data.pass) {
      findings.push(
        runtimeFinding(
          "iris_runtime_not_passed",
          "Iris did not pass the measured runtime evidence.",
          `Iris status ${parsedIris.data.status}`,
        ),
      );
    }
  }
  if (!allCompleted && parsedIris?.success) {
    findings.push(
      runtimeFinding(
        "iris_without_complete_browser_evidence",
        "Iris cannot certify runtime without completed Twin, Echo and Swift reports.",
        "Iris review supplied without a complete browser suite",
      ),
    );
  }

  const iris = parsedIris?.success
    ? {
        agent: "iris" as const,
        status: parsedIris.data.status,
        evidence: parsedIris.data.evidence,
        artifactSha256: parsedIris.data.artifactSha256,
        reportSha256: await sha256Hex(JSON.stringify(parsedIris.data)),
        briefSha256,
        acceptanceCriteriaSha256,
        acceptanceCriteriaCount: input.acceptanceCriteria.length,
      }
    : {
        agent: "iris" as const,
        status: "not_run" as const,
        evidence: "not_run" as const,
        artifactSha256: input.previewSha256,
        reasonCode: allNotRun
          ? ("browser_runner_unconfigured" as const)
          : ("browser_evidence_incomplete" as const),
        detail: allNotRun
          ? "Iris was not run because no authenticated browser evidence or screenshot was produced."
          : "Iris was not run because the browser evidence set was incomplete.",
        briefSha256,
        acceptanceCriteriaSha256,
        acceptanceCriteriaCount: input.acceptanceCriteria.length,
      };
  const runtimeQuality = ProductionRuntimeQualitySchema.parse({
    policy: required
      ? "required_for_interactive_app"
      : "optional_for_static_site",
    required,
    validated:
      allCompleted && parsedIris?.success === true && parsedIris.data.status === "passed",
    reports,
    iris,
  });
  return {
    runtimeQuality,
    findings,
    evidenceSha256: await sha256Hex(JSON.stringify(runtimeQuality)),
  };
}

export async function runProductionWorkspaceQualityPass(input: {
  files: Readonly<Record<string, string>>;
  candidate: WorkspaceCandidate;
  previewHtml: string;
  runnerReport: WorkspaceRunnerReport;
  runtimeProfile: ProductionRuntimeProfile;
  browserQuality: ProductionBrowserQualityEvidence;
  irisReview?: ReviewResult;
  brief: string;
  acceptanceCriteria: readonly string[];
  measuredAt?: string;
}): Promise<ProductionWorkspaceQualityReport> {
  const parsedRunner = WorkspaceRunnerReportSchema.parse(input.runnerReport);
  const measuredAt = input.measuredAt ?? new Date().toISOString();
  const [candidateVerification, previewSha256, runnerReportSha256, aegis] =
    await Promise.all([
      verifyProductionWorkspaceCandidate(input.files, input.candidate),
      sha256Hex(input.previewHtml),
      sha256Hex(JSON.stringify(parsedRunner)),
      runAegisStaticScan(input.previewHtml, { measuredAt }),
    ]);
  const findings: ProductionWorkspaceQualityFinding[] = [
    ...candidateIntegrityFindings(candidateVerification.errors),
    ...aegisFindings(aegis),
    ...scanProductionWorkspaceSecrets(input.files),
    ...dependencyAuditFindings(parsedRunner),
    ...scanProductionWorkspaceStaticSecurity(input.files),
  ];
  const runtime = await runtimeQualityEvidence({
    runtimeProfile: input.runtimeProfile,
    previewSha256,
    browserQuality: input.browserQuality,
    ...(input.irisReview ? { irisReview: input.irisReview } : {}),
    brief: input.brief,
    acceptanceCriteria: input.acceptanceCriteria,
  });
  findings.push(...runtime.findings);
  if (parsedRunner.candidateSha256 !== input.candidate.sourceSha256) {
    findings.push({
      id: "runner_candidate_mismatch",
      checkId: "candidate_integrity",
      severity: "blocker",
      message: "The signed runner report covers a different Production candidate.",
      evidence: "runner candidate hash does not match workspace candidate hash",
    });
  }
  const workspaceDescriptorSha256 = await sha256Hex(
    JSON.stringify(input.candidate.files),
  );
  const staticEvidenceSha256 = await sha256Hex(
    JSON.stringify({
      candidateSha256: input.candidate.sourceSha256,
      findings: findings.filter(
        (finding) => finding.checkId === "static_workspace_review",
      ),
    }),
  );
  const secretEvidenceSha256 = await sha256Hex(
    JSON.stringify({
      candidateSha256: input.candidate.sourceSha256,
      findings: findings.filter((finding) => finding.checkId === "secret_scan"),
    }),
  );
  const dependencyEvidenceSha256 = await sha256Hex(
    JSON.stringify(parsedRunner.steps.filter((step) => ["build", "security"].includes(step.id))),
  );
  const aegisEvidenceSha256 = await sha256Hex(JSON.stringify(aegis));
  const checks = [
    qualityCheck({
      id: "candidate_integrity",
      findings,
      tool: "helix workspace candidate verifier",
      evidenceSha256: workspaceDescriptorSha256,
      passedDetail: "Every workspace file and descriptor matches the immutable candidate hash.",
    }),
    qualityCheck({
      id: "aegis_static_security",
      findings,
      tool: `${aegis.scanner}@${aegis.version}`,
      evidenceSha256: aegisEvidenceSha256,
      passedDetail: "Aegis found no release-blocking issue in the exact derived preview.",
    }),
    qualityCheck({
      id: "secret_scan",
      findings,
      tool: "helix production secret scanner@1.0.0",
      evidenceSha256: secretEvidenceSha256,
      passedDetail: "Every versioned workspace file was scanned; no credential pattern was found.",
    }),
    qualityCheck({
      id: "dependency_audit",
      findings,
      tool: "signed runner · npm audit --omit=dev --audit-level=high",
      evidenceSha256: dependencyEvidenceSha256,
      passedDetail: "The signed runner recorded a passing production-dependency audit after build.",
    }),
    qualityCheck({
      id: "static_workspace_review",
      findings,
      tool: "helix production static workspace review@1.0.0",
      evidenceSha256: staticEvidenceSha256,
      passedDetail:
        "Static source checks found no unsafe parser sink, dynamic execution, exposed browser secret namespace, interpolated SQL, or unguarded API route.",
    }),
    qualityCheck({
      id: "runtime_quality",
      findings,
      tool: "authenticated browser runner + Iris evidence gate",
      evidenceSha256: runtime.evidenceSha256,
      passedDetail: runtime.runtimeQuality.validated
        ? "Twin, Echo and Swift completed on the exact preview and Iris passed their measured evidence."
        : "Runtime browser validation was not run and is not claimed for this static-site source gate.",
      notRun:
        !runtime.runtimeQuality.required && !runtime.runtimeQuality.validated,
    }),
  ];
  const blockerCount = findings.length;
  return ProductionWorkspaceQualityReportSchema.parse({
    kind: "production_workspace_quality",
    schemaVersion: "1.0.0",
    scanner: "helix-production-quality",
    version: "1.0.0",
    evidence: "measured",
    measuredAt,
    candidateSha256: input.candidate.sourceSha256,
    previewSha256,
    runnerReportSha256,
    passed: blockerCount === 0,
    blockerCount,
    checks,
    findings,
    aegis,
    runtimeQuality: runtime.runtimeQuality,
    scope: [
      "immutable Production workspace candidate integrity",
      "Aegis static preview security and generated CSP",
      "credential patterns and populated secret environment placeholders across every file",
      "signed post-build production-dependency audit",
      "unsafe DOM/XSS sinks, dynamic execution, browser secret exposure, SQL interpolation and API authorization ordering",
      "authenticated Twin/Echo/Swift browser-preview reports and Iris review under a profile-specific UI runtime policy",
    ],
    limitations: [
      "Static workspace checks are deterministic pattern and contract checks, not a full semantic SAST engine or penetration test.",
      "The dependency result is the signed runner's npm audit exit status and bounded output hashes; advisory text is not copied into the job payload.",
      "Static sites may pass the source gate with browser evidence explicitly not run; this does not claim runtime validation.",
      "Client-only and service applications fail closed unless Twin, Echo and Swift complete and Iris passes the same preview hash.",
      "Browser-preview validation does not verify a service endpoint, PostgreSQL connection, provider activation, or deployment; those remain separate runtime evidence.",
      "A passing report covers only the exact candidate, preview and runner report hashes recorded here.",
    ],
  });
}

export async function productionWorkspaceQualityReportSha256(
  report: ProductionWorkspaceQualityReport,
): Promise<string> {
  const parsed = ProductionWorkspaceQualityReportSchema.parse(report);
  return sha256Hex(JSON.stringify(parsed));
}

export async function verifyProductionWorkspaceQualityReport(input: {
  files: Readonly<Record<string, string>>;
  candidate: WorkspaceCandidate;
  previewHtml: string;
  runnerReport: WorkspaceRunnerReport;
  runtimeProfile: ProductionRuntimeProfile;
  browserQuality: ProductionBrowserQualityEvidence;
  irisReview?: ReviewResult;
  brief: string;
  acceptanceCriteria: readonly string[];
  report: unknown;
  reportSha256: string;
}): Promise<boolean> {
  const parsed = ProductionWorkspaceQualityReportSchema.safeParse(input.report);
  if (!parsed.success || !SHA256_PATTERN.test(input.reportSha256)) return false;
  const actualSha256 = await productionWorkspaceQualityReportSha256(parsed.data);
  if (actualSha256 !== input.reportSha256) return false;
  const reconstructed = await runProductionWorkspaceQualityPass({
    files: input.files,
    candidate: input.candidate,
    previewHtml: input.previewHtml,
    runnerReport: input.runnerReport,
    runtimeProfile: input.runtimeProfile,
    browserQuality: input.browserQuality,
    ...(input.irisReview ? { irisReview: input.irisReview } : {}),
    brief: input.brief,
    acceptanceCriteria: input.acceptanceCriteria,
    measuredAt: parsed.data.measuredAt,
  });
  return JSON.stringify(reconstructed) === JSON.stringify(parsed.data);
}

export function assertProductionWorkspaceQualityPassed(
  report: ProductionWorkspaceQualityReport,
  expected: {
    candidateSha256: string;
    previewSha256: string;
    runnerReportSha256: string;
  },
): void {
  const parsed = ProductionWorkspaceQualityReportSchema.safeParse(report);
  if (
    !parsed.success ||
    parsed.data.candidateSha256 !== expected.candidateSha256 ||
    parsed.data.previewSha256 !== expected.previewSha256 ||
    parsed.data.runnerReportSha256 !== expected.runnerReportSha256 ||
    !parsed.data.passed ||
    parsed.data.blockerCount !== 0 ||
    (parsed.data.runtimeQuality.required && !parsed.data.runtimeQuality.validated) ||
    parsed.data.checks.some(
      (check) =>
        check.status === "failed" ||
        (check.status === "not_run" &&
          (check.id !== "runtime_quality" || parsed.data.runtimeQuality.required)),
    )
  ) {
    throw new ProductionWorkspaceQualityBlockedError();
  }
}
