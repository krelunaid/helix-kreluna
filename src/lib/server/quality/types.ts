import { z } from "zod";
import type { AugurCapacityEvidence } from "@/lib/capacity-evidence";

export const QualityFindingSchema = z
  .object({
    id: z.string().min(1).max(120),
    checkId: z.string().min(1).max(80),
    severity: z.enum(["blocker", "high", "medium", "low", "info"]),
    category: z.string().min(1).max(80),
    message: z.string().min(1).max(500),
    evidence: z.string().min(1).max(240),
    line: z.number().int().positive().optional(),
  })
  .strict();

export type QualityFinding = z.infer<typeof QualityFindingSchema>;

export const QualityCheckSchema = z
  .object({
    id: z.string().min(1).max(80),
    status: z.enum(["passed", "failed"]),
    findingCount: z.number().int().nonnegative(),
  })
  .strict();

export const AegisReportSchema = z
  .object({
    kind: z.literal("aegis_static_security"),
    scanner: z.literal("helix-aegis"),
    version: z.literal("1.0.0"),
    evidence: z.literal("measured"),
    measuredAt: z.string().datetime(),
    artifactSha256: z.string().regex(/^[0-9a-f]{64}$/),
    passed: z.boolean(),
    blockerCount: z.number().int().nonnegative(),
    checks: z.array(QualityCheckSchema).min(1),
    findings: z.array(QualityFindingSchema),
    scope: z.array(z.string().min(1)).min(1),
    limitations: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type AegisReport = z.infer<typeof AegisReportSchema>;

const ArtifactSha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const TwinActionSchema = z
  .object({
    id: z.string().min(1).max(120),
    viewport: z.string().min(1).max(80),
    type: z.enum(["click", "fill", "submit"]),
    label: z.string().min(1).max(240),
    status: z.enum(["changed", "no_change", "validated", "passed", "failed"]),
    changed: z.boolean(),
    beforeSha256: ArtifactSha256Schema.optional(),
    afterSha256: ArtifactSha256Schema.optional(),
    detail: z.string().min(1).max(500).optional(),
  })
  .strict();

export const TwinViewportSchema = z
  .object({
    name: z.string().min(1).max(80),
    width: z.number().int().positive().max(8_192),
    height: z.number().int().positive().max(8_192),
  })
  .strict();

export const TwinScreenshotSchema = z
  .object({
    viewport: z.string().min(1).max(80),
    path: z.string().min(1).max(1_000),
    sha256: ArtifactSha256Schema,
    bytes: z.number().int().positive(),
  })
  .strict();

const TwinReportBaseShape = {
  kind: z.literal("twin_browser"),
  version: z.literal("1.0.0"),
  artifactSha256: ArtifactSha256Schema,
  generatedAt: z.string().datetime(),
} as const;

export const TwinBrowserReportSchema = z.discriminatedUnion("status", [
  z
    .object({
      ...TwinReportBaseShape,
      status: z.literal("completed"),
      evidence: z.literal("measured"),
      runner: z.string().min(1).max(120),
      browser: z.string().min(1).max(160),
      durationMs: z.number().int().nonnegative(),
      viewports: z.array(TwinViewportSchema).min(2),
      actions: z.array(TwinActionSchema),
      consoleErrors: z.array(z.string().min(1).max(2_000)),
      runtimeErrors: z.array(z.string().min(1).max(2_000)),
      screenshots: z.array(TwinScreenshotSchema).min(2),
      summary: z
        .object({
          controlsDiscovered: z.number().int().nonnegative(),
          controlsExercised: z.number().int().nonnegative(),
          changedActions: z.number().int().nonnegative(),
          formsDiscovered: z.number().int().nonnegative(),
          formsExercised: z.number().int().nonnegative(),
          navigations: z.number().int().nonnegative(),
          dialogs: z.number().int().nonnegative(),
          blockedExternalRequests: z.number().int().nonnegative(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...TwinReportBaseShape,
      status: z.literal("failed"),
      evidence: z.literal("measured"),
      runner: z.string().min(1).max(120),
      durationMs: z.number().int().nonnegative(),
      errorCode: z.string().min(1).max(120),
      detail: z.string().min(1).max(1_000),
    })
    .strict(),
  z
    .object({
      ...TwinReportBaseShape,
      status: z.literal("not_run"),
      evidence: z.literal("not_run"),
      reasonCode: z.enum([
        "browser_runner_unconfigured",
        "browser_dependency_missing",
        "browser_binary_missing",
        "explicitly_disabled",
      ]),
      detail: z.string().min(1).max(1_000),
    })
    .strict(),
]).superRefine((report, context) => {
  if (report.status !== "completed") return;
  const viewportNames = new Set(report.viewports.map((viewport) => viewport.name));
  const screenshotViewports = new Set(
    report.screenshots.map((screenshot) => screenshot.viewport),
  );
  const changedActions = report.actions.filter((action) => action.changed).length;
  if (
    report.summary.controlsExercised > report.summary.controlsDiscovered ||
    report.summary.formsExercised > report.summary.formsDiscovered ||
    report.summary.changedActions !== changedActions
  ) {
    context.addIssue({
      code: "custom",
      message: "Twin summary is inconsistent with measured actions",
    });
  }
  if (
    [...viewportNames].some((name) => !screenshotViewports.has(name)) ||
    report.actions.some((action) => !viewportNames.has(action.viewport))
  ) {
    context.addIssue({
      code: "custom",
      message: "Twin evidence does not cover every declared viewport",
    });
  }
  for (const action of report.actions) {
    const requiresChange = action.status === "changed";
    const forbidsChange =
      action.status === "no_change" ||
      action.status === "validated" ||
      action.status === "failed";
    if ((requiresChange && !action.changed) || (forbidsChange && action.changed)) {
      context.addIssue({
        code: "custom",
        message: "Twin action status and changed flag disagree",
      });
      break;
    }
  }
  if (
    report.summary.controlsDiscovered > 0 &&
    (report.summary.controlsExercised === 0 || report.actions.length === 0)
  ) {
    context.addIssue({
      code: "custom",
      message: "Twin discovered controls but exercised none",
    });
  }
});

export type TwinBrowserReport = z.infer<typeof TwinBrowserReportSchema>;

export const AccessibilityFindingSchema = z
  .object({
    ruleId: z.string().min(1).max(120),
    category: z.enum([
      "labels",
      "contrast",
      "keyboard",
      "landmarks",
      "aria",
      "focus",
      "language",
      "images",
    ]),
    severity: z.enum(["high", "medium", "low"]),
    message: z.string().min(1).max(500),
    count: z.number().int().positive(),
    samples: z.array(z.string().min(1).max(240)).max(12),
  })
  .strict();

export const EchoAccessibilityReportSchema = z.discriminatedUnion("status", [
  z
    .object({
      ...TwinReportBaseShape,
      kind: z.literal("echo_accessibility"),
      status: z.literal("completed"),
      evidence: z.literal("measured"),
      runner: z.string().min(1).max(120),
      browser: z.string().min(1).max(160),
      durationMs: z.number().int().nonnegative(),
      viewports: z.array(TwinViewportSchema).min(2),
      passed: z.boolean(),
      findings: z.array(AccessibilityFindingSchema),
      summary: z
        .object({
          checksRun: z.number().int().positive(),
          high: z.number().int().nonnegative(),
          medium: z.number().int().nonnegative(),
          low: z.number().int().nonnegative(),
          focusableElements: z.number().int().nonnegative(),
          keyboardTargetsReached: z.number().int().nonnegative(),
        })
        .strict(),
      limitations: z.array(z.string().min(1)).min(1),
    })
    .strict(),
  z
    .object({
      ...TwinReportBaseShape,
      kind: z.literal("echo_accessibility"),
      status: z.literal("failed"),
      evidence: z.literal("measured"),
      runner: z.string().min(1).max(120),
      durationMs: z.number().int().nonnegative(),
      errorCode: z.string().min(1).max(120),
      detail: z.string().min(1).max(1_000),
    })
    .strict(),
  z
    .object({
      ...TwinReportBaseShape,
      kind: z.literal("echo_accessibility"),
      status: z.literal("not_run"),
      evidence: z.literal("not_run"),
      reasonCode: z.enum([
        "browser_runner_unconfigured",
        "browser_dependency_missing",
        "browser_binary_missing",
        "explicitly_disabled",
      ]),
      detail: z.string().min(1).max(1_000),
    })
    .strict(),
]).superRefine((report, context) => {
  if (report.status !== "completed") return;
  const count = (severity: "high" | "medium" | "low") =>
    report.findings
      .filter((finding) => finding.severity === severity)
      .reduce((total, finding) => total + finding.count, 0);
  const consistent =
    report.summary.high === count("high") &&
    report.summary.medium === count("medium") &&
    report.summary.low === count("low");
  if (!consistent || report.passed !== (report.findings.length === 0)) {
    context.addIssue({
      code: "custom",
      message: "Echo pass state or severity summary is inconsistent",
    });
  }
});

export type EchoAccessibilityReport = z.infer<
  typeof EchoAccessibilityReportSchema
>;

export const PerformanceViewportMetricsSchema = z
  .object({
    viewport: z.string().min(1).max(80),
    loadMs: z.number().nonnegative().nullable(),
    domContentLoadedMs: z.number().nonnegative().nullable(),
    fcpMs: z.number().nonnegative().nullable(),
    lcpMs: z.number().nonnegative().nullable(),
    cls: z.number().nonnegative().nullable(),
    tbtMs: z.number().nonnegative().nullable(),
    requestCount: z.number().int().nonnegative(),
    transferBytes: z.number().int().nonnegative(),
    decodedBytes: z.number().int().nonnegative(),
    sourceBytes: z.number().int().positive(),
  })
  .strict();

export const SwiftPerformanceReportSchema = z.discriminatedUnion("status", [
  z
    .object({
      ...TwinReportBaseShape,
      kind: z.literal("swift_performance"),
      status: z.literal("completed"),
      evidence: z.literal("measured"),
      runner: z.string().min(1).max(120),
      browser: z.string().min(1).max(160),
      durationMs: z.number().int().nonnegative(),
      metrics: z.array(PerformanceViewportMetricsSchema).min(2),
      limitations: z.array(z.string().min(1)).min(1),
    })
    .strict(),
  z
    .object({
      ...TwinReportBaseShape,
      kind: z.literal("swift_performance"),
      status: z.literal("failed"),
      evidence: z.literal("measured"),
      runner: z.string().min(1).max(120),
      durationMs: z.number().int().nonnegative(),
      errorCode: z.string().min(1).max(120),
      detail: z.string().min(1).max(1_000),
    })
    .strict(),
  z
    .object({
      ...TwinReportBaseShape,
      kind: z.literal("swift_performance"),
      status: z.literal("not_run"),
      evidence: z.literal("not_run"),
      reasonCode: z.enum([
        "browser_runner_unconfigured",
        "browser_dependency_missing",
        "browser_binary_missing",
        "explicitly_disabled",
      ]),
      detail: z.string().min(1).max(1_000),
    })
    .strict(),
]);

export type SwiftPerformanceReport = z.infer<
  typeof SwiftPerformanceReportSchema
>;

export type BuildQualityEvidence = {
  aegis?: AegisReport;
  twin?: TwinBrowserReport;
  echo?: EchoAccessibilityReport;
  swift?: SwiftPerformanceReport;
  /**
   * Privileged, persisted evidence supplied by a load/infrastructure pipeline.
   * The server-only Augur boundary accepts this contract only from an
   * authenticated, fresh, replay-protected source; it never invents a profile
   * when the source is absent.
   */
  capacity?: AugurCapacityEvidence;
  /**
   * Immutable deploy identity from the deployment registry. Augur requires it
   * independently of the evidence bundle so a self-declared deploy hash cannot
   * authorize a forecast.
   */
  capacityDeploySha256?: string;
};
