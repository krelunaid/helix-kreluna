import { z } from "zod";
import {
  OperationalMetricSchema,
  OperationalSourceIdSchema,
  metricSchemaFor,
  redactOperationalDetail,
  sha256Json,
  type OperationalMetric,
} from "@/lib/server/operations/types";

const SIGNAL_IDS = [
  "errors",
  "uptime",
  "latency",
  "dependencyVulnerabilities",
  "deployHealth",
  "costs",
] as const;

export type WardenSignalId = (typeof SIGNAL_IDS)[number];

const SignalIdSchema = z.enum(SIGNAL_IDS);

const SIGNAL_SCHEMAS = {
  errors: metricSchemaFor("errors_per_minute"),
  uptime: metricSchemaFor("ratio"),
  latency: metricSchemaFor("milliseconds_p95"),
  dependencyVulnerabilities: metricSchemaFor("count_high_or_critical"),
  deployHealth: metricSchemaFor("healthy_ratio"),
  costs: metricSchemaFor("usd_month_to_date"),
} as const;

export const WardenSignalsSchema = z
  .object({
    errors: SIGNAL_SCHEMAS.errors,
    uptime: SIGNAL_SCHEMAS.uptime,
    latency: SIGNAL_SCHEMAS.latency,
    dependencyVulnerabilities: SIGNAL_SCHEMAS.dependencyVulnerabilities,
    deployHealth: SIGNAL_SCHEMAS.deployHealth,
    costs: SIGNAL_SCHEMAS.costs,
  })
  .strict();

export const DependencyVulnerabilityCountsSchema = z
  .object({
    critical: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    moderate: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
  })
  .strict();

export const WardenDependencySchema = z
  .object({
    name: z.string().trim().min(1).max(214),
    currentVersion: z.string().trim().min(1).max(120),
    latestVersion: z.string().trim().min(1).max(120).nullable(),
    supportEndsAt: z.string().datetime().nullable(),
    vulnerabilities: DependencyVulnerabilityCountsSchema,
  })
  .strict();

export const WardenDependencyEvidenceSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("measured"),
      source: OperationalSourceIdSchema,
      observedAt: z.string().datetime(),
      dependencies: z.array(WardenDependencySchema).max(5_000),
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      attemptedAt: z.string().datetime(),
      source: OperationalSourceIdSchema,
      reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/),
      detailRedacted: z.string().trim().min(1).max(500),
    })
    .strict(),
]);

export const WardenPolicySchema = z
  .object({
    maxEvidenceAgeMs: z.number().int().positive().max(30 * 24 * 60 * 60 * 1_000),
    maxErrorsPerMinute: z.number().finite().nonnegative(),
    minUptimeRatio: z.number().finite().min(0).max(1),
    maxP95LatencyMs: z.number().finite().positive(),
    maxHighOrCriticalVulnerabilities: z.number().int().nonnegative(),
    minDeployHealthyRatio: z.number().finite().min(0).max(1),
    maxMonthToDateCostUsd: z.number().finite().nonnegative(),
    supportWindowWarningDays: z.number().int().positive().max(730),
    requireKnownSupportWindows: z.boolean(),
  })
  .strict();

export const WardenSnapshotSchema = z
  .object({
    kind: z.literal("warden_monitoring_snapshot"),
    version: z.literal("1.0.0"),
    environment: z.enum(["staging", "production"]),
    releaseRef: z.string().trim().min(1).max(240),
    generatedAt: z.string().datetime(),
    signals: WardenSignalsSchema,
    dependencyEvidence: WardenDependencyEvidenceSchema,
    policy: WardenPolicySchema,
  })
  .strict();

export type WardenSnapshot = z.infer<typeof WardenSnapshotSchema>;

export const WardenFindingSchema = z
  .object({
    id: z.string().regex(/^[0-9a-f]{64}$/),
    signal: z.union([SignalIdSchema, z.literal("dependencySupport")]),
    code: z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/),
    severity: z.enum(["critical", "high", "medium", "low", "info"]),
    blocking: z.boolean(),
    message: z.string().trim().min(1).max(500),
    evidence: z.string().trim().min(1).max(500),
  })
  .strict();

export const WardenUpdateProposalSchema = z
  .object({
    id: z.string().regex(/^[0-9a-f]{64}$/),
    kind: z.literal("dependency_update_review"),
    dependency: z.string().trim().min(1).max(214),
    currentVersion: z.string().trim().min(1).max(120),
    proposedVersion: z.string().trim().min(1).max(120),
    reasons: z.array(z.string().trim().min(1).max(240)).min(1).max(8),
    automaticApply: z.literal(false),
    automaticPublish: z.literal(false),
    requiresApproval: z.literal(true),
    requiredValidation: z.tuple([
      z.literal("isolated_install"),
      z.literal("test_suite"),
      z.literal("security_scan"),
      z.literal("human_approval"),
    ]),
  })
  .strict();

export const WardenReportSchema = z
  .object({
    kind: z.literal("warden_monitoring_report"),
    version: z.literal("1.0.0"),
    generatedAt: z.string().datetime(),
    environment: z.enum(["staging", "production"]),
    releaseRef: z.string().trim().min(1).max(240),
    snapshotSha256: z.string().regex(/^[0-9a-f]{64}$/),
    evidence: z.enum(["complete_measured", "incomplete"]),
    status: z.enum(["healthy", "attention_required", "blocked"]),
    findings: z.array(WardenFindingSchema),
    updateProposals: z.array(WardenUpdateProposalSchema),
    policy: z
      .object({
        automaticApply: z.literal(false),
        automaticPublish: z.literal(false),
        approvalRequired: z.literal(true),
      })
      .strict(),
    limitations: z.tuple([
      z.literal("Monitoring quality depends on configured external evidence sources."),
      z.literal("No dependency update, deploy, publish, or rollback was executed."),
    ]),
  })
  .strict();

export type WardenReport = z.infer<typeof WardenReportSchema>;

type FindingInput = Omit<z.infer<typeof WardenFindingSchema>, "id">;

function finding(input: FindingInput): z.infer<typeof WardenFindingSchema> {
  return WardenFindingSchema.parse({
    ...input,
    id: sha256Json(input),
  });
}

function isEvidenceTimeInvalid(observedAt: string, nowMs: number, maxAgeMs: number) {
  const observedMs = Date.parse(observedAt);
  return {
    future: observedMs > nowMs + 5 * 60 * 1_000,
    stale: nowMs - observedMs > maxAgeMs,
  };
}

function metricFinding(
  signal: WardenSignalId,
  metric: OperationalMetric,
  nowMs: number,
  maxAgeMs: number,
  threshold: { breached: (value: number) => boolean; code: string; message: string; severity: "critical" | "high" | "medium" },
): z.infer<typeof WardenFindingSchema>[] {
  if (metric.status === "unavailable") {
    return [
      finding({
        signal,
        code: "WARDEN_SIGNAL_UNAVAILABLE",
        severity: "critical",
        blocking: true,
        message: `${signal} evidence is unavailable.`,
        evidence: `${metric.source} · ${metric.reasonCode} · ${metric.detailRedacted}`,
      }),
    ];
  }

  const time = isEvidenceTimeInvalid(metric.observedAt, nowMs, maxAgeMs);
  if (time.future) {
    return [
      finding({
        signal,
        code: "WARDEN_EVIDENCE_FROM_FUTURE",
        severity: "critical",
        blocking: true,
        message: `${signal} evidence has an invalid future timestamp.`,
        evidence: `${metric.source} · observed ${metric.observedAt}`,
      }),
    ];
  }
  if (time.stale) {
    return [
      finding({
        signal,
        code: "WARDEN_EVIDENCE_STALE",
        severity: "critical",
        blocking: true,
        message: `${signal} evidence is older than the approved freshness window.`,
        evidence: `${metric.source} · observed ${metric.observedAt}`,
      }),
    ];
  }
  if (!threshold.breached(metric.value)) return [];
  return [
    finding({
      signal,
      code: threshold.code,
      severity: threshold.severity,
      blocking: threshold.severity === "critical",
      message: threshold.message,
      evidence: `${metric.source} · ${metric.value} ${metric.unit} · ${metric.sampleCount} sample(s)`,
    }),
  ];
}

function updateProposal(
  dependency: z.infer<typeof WardenDependencySchema>,
): z.infer<typeof WardenUpdateProposalSchema> | null {
  if (!dependency.latestVersion || dependency.latestVersion === dependency.currentVersion) {
    return null;
  }
  const vulnerable =
    dependency.vulnerabilities.critical + dependency.vulnerabilities.high > 0;
  const reasons = ["A different release was reported by the configured dependency source."];
  if (vulnerable) reasons.push("The installed release has high or critical vulnerability evidence.");
  return WardenUpdateProposalSchema.parse({
    id: sha256Json({
      dependency: dependency.name,
      currentVersion: dependency.currentVersion,
      proposedVersion: dependency.latestVersion,
    }),
    kind: "dependency_update_review",
    dependency: dependency.name,
    currentVersion: dependency.currentVersion,
    proposedVersion: dependency.latestVersion,
    reasons,
    automaticApply: false,
    automaticPublish: false,
    requiresApproval: true,
    requiredValidation: [
      "isolated_install",
      "test_suite",
      "security_scan",
      "human_approval",
    ],
  });
}

export function evaluateWardenSnapshot(
  input: unknown,
  options: { now?: string } = {},
): WardenReport {
  const snapshot = WardenSnapshotSchema.parse(input);
  const now = options.now ?? new Date().toISOString();
  const nowMs = Date.parse(z.string().datetime().parse(now));
  const { policy } = snapshot;
  const findings: z.infer<typeof WardenFindingSchema>[] = [];

  findings.push(
    ...metricFinding("errors", snapshot.signals.errors, nowMs, policy.maxEvidenceAgeMs, {
      breached: (value) => value > policy.maxErrorsPerMinute,
      code: "WARDEN_ERROR_RATE_EXCEEDED",
      message: "The measured error rate exceeds the approved threshold.",
      severity: "high",
    }),
    ...metricFinding("uptime", snapshot.signals.uptime, nowMs, policy.maxEvidenceAgeMs, {
      breached: (value) => value < policy.minUptimeRatio,
      code: "WARDEN_UPTIME_BELOW_MINIMUM",
      message: "Measured uptime is below the approved threshold.",
      severity: "high",
    }),
    ...metricFinding("latency", snapshot.signals.latency, nowMs, policy.maxEvidenceAgeMs, {
      breached: (value) => value > policy.maxP95LatencyMs,
      code: "WARDEN_LATENCY_EXCEEDED",
      message: "Measured p95 latency exceeds the approved threshold.",
      severity: "high",
    }),
    ...metricFinding(
      "dependencyVulnerabilities",
      snapshot.signals.dependencyVulnerabilities,
      nowMs,
      policy.maxEvidenceAgeMs,
      {
        breached: (value) => value > policy.maxHighOrCriticalVulnerabilities,
        code: "WARDEN_DEPENDENCY_VULNERABILITY_THRESHOLD_EXCEEDED",
        message: "High or critical dependency vulnerabilities exceed policy.",
        severity: "critical",
      },
    ),
    ...metricFinding(
      "deployHealth",
      snapshot.signals.deployHealth,
      nowMs,
      policy.maxEvidenceAgeMs,
      {
        breached: (value) => value < policy.minDeployHealthyRatio,
        code: "WARDEN_DEPLOY_UNHEALTHY",
        message: "Deploy health is below the approved threshold.",
        severity: "critical",
      },
    ),
    ...metricFinding("costs", snapshot.signals.costs, nowMs, policy.maxEvidenceAgeMs, {
      breached: (value) => value > policy.maxMonthToDateCostUsd,
      code: "WARDEN_COST_THRESHOLD_EXCEEDED",
      message: "Month-to-date cost exceeds the approved threshold.",
      severity: "medium",
    }),
  );

  const proposals: z.infer<typeof WardenUpdateProposalSchema>[] = [];
  if (snapshot.dependencyEvidence.status === "unavailable") {
    findings.push(
      finding({
        signal: "dependencySupport",
        code: "WARDEN_DEPENDENCY_INVENTORY_UNAVAILABLE",
        severity: "critical",
        blocking: true,
        message: "Dependency support and update evidence is unavailable.",
        evidence: `${snapshot.dependencyEvidence.source} · ${snapshot.dependencyEvidence.reasonCode} · ${snapshot.dependencyEvidence.detailRedacted}`,
      }),
    );
  } else {
    const inventoryTime = isEvidenceTimeInvalid(
      snapshot.dependencyEvidence.observedAt,
      nowMs,
      policy.maxEvidenceAgeMs,
    );
    if (inventoryTime.future || inventoryTime.stale) {
      findings.push(
        finding({
          signal: "dependencySupport",
          code: inventoryTime.future
            ? "WARDEN_DEPENDENCY_EVIDENCE_FROM_FUTURE"
            : "WARDEN_DEPENDENCY_EVIDENCE_STALE",
          severity: "critical",
          blocking: true,
          message: inventoryTime.future
            ? "Dependency evidence has an invalid future timestamp."
            : "Dependency evidence is older than the approved freshness window.",
          evidence: `${snapshot.dependencyEvidence.source} · observed ${snapshot.dependencyEvidence.observedAt}`,
        }),
      );
    }

    const measuredHighOrCritical = snapshot.dependencyEvidence.dependencies.reduce(
      (total, dependency) =>
        total + dependency.vulnerabilities.critical + dependency.vulnerabilities.high,
      0,
    );
    const metric = snapshot.signals.dependencyVulnerabilities;
    if (
      metric.status === "measured" &&
      metric.value !== measuredHighOrCritical
    ) {
      findings.push(
        finding({
          signal: "dependencyVulnerabilities",
          code: "WARDEN_DEPENDENCY_EVIDENCE_MISMATCH",
          severity: "critical",
          blocking: true,
          message: "The vulnerability metric does not match the dependency inventory.",
          evidence: `metric ${metric.value} · inventory ${measuredHighOrCritical}`,
        }),
      );
    }

    const warningMs = policy.supportWindowWarningDays * 24 * 60 * 60 * 1_000;
    for (const dependency of snapshot.dependencyEvidence.dependencies) {
      if (!dependency.latestVersion) {
        findings.push(
          finding({
            signal: "dependencySupport",
            code: "WARDEN_LATEST_VERSION_UNKNOWN",
            severity: "critical",
            blocking: true,
            message: `${dependency.name} has no current release evidence for staleness comparison.`,
            evidence: `${snapshot.dependencyEvidence.source} · installed ${dependency.currentVersion}`,
          }),
        );
      }
      if (!dependency.supportEndsAt && policy.requireKnownSupportWindows) {
        findings.push(
          finding({
            signal: "dependencySupport",
            code: "WARDEN_SUPPORT_WINDOW_UNKNOWN",
            severity: "critical",
            blocking: true,
            message: `${dependency.name} has no verified support-window evidence.`,
            evidence: `${snapshot.dependencyEvidence.source} · ${dependency.currentVersion}`,
          }),
        );
      } else if (dependency.supportEndsAt) {
        const supportEndsAtMs = Date.parse(dependency.supportEndsAt);
        if (supportEndsAtMs <= nowMs) {
          findings.push(
            finding({
              signal: "dependencySupport",
              code: "WARDEN_DEPENDENCY_UNSUPPORTED",
              severity: "critical",
              blocking: true,
              message: `${dependency.name} is outside its verified support window.`,
              evidence: `${dependency.currentVersion} · support ended ${dependency.supportEndsAt}`,
            }),
          );
        } else if (supportEndsAtMs - nowMs <= warningMs) {
          findings.push(
            finding({
              signal: "dependencySupport",
              code: "WARDEN_SUPPORT_WINDOW_CLOSING",
              severity: "high",
              blocking: false,
              message: `${dependency.name} is nearing the end of its verified support window.`,
              evidence: `${dependency.currentVersion} · support ends ${dependency.supportEndsAt}`,
            }),
          );
        }
      }

      const proposal = updateProposal(dependency);
      if (proposal) proposals.push(proposal);
    }
  }

  const blocking = findings.some((entry) => entry.blocking);
  const needsAttention = findings.some((entry) => entry.severity !== "info") || proposals.length > 0;
  const incompleteCodes = new Set([
    "WARDEN_SIGNAL_UNAVAILABLE",
    "WARDEN_EVIDENCE_FROM_FUTURE",
    "WARDEN_EVIDENCE_STALE",
    "WARDEN_DEPENDENCY_INVENTORY_UNAVAILABLE",
    "WARDEN_DEPENDENCY_EVIDENCE_FROM_FUTURE",
    "WARDEN_DEPENDENCY_EVIDENCE_STALE",
    "WARDEN_DEPENDENCY_EVIDENCE_MISMATCH",
    "WARDEN_LATEST_VERSION_UNKNOWN",
    "WARDEN_SUPPORT_WINDOW_UNKNOWN",
  ]);

  return WardenReportSchema.parse({
    kind: "warden_monitoring_report",
    version: "1.0.0",
    generatedAt: now,
    environment: snapshot.environment,
    releaseRef: snapshot.releaseRef,
    snapshotSha256: sha256Json(snapshot),
    evidence: findings.some((entry) => incompleteCodes.has(entry.code))
      ? "incomplete"
      : "complete_measured",
    status: blocking ? "blocked" : needsAttention ? "attention_required" : "healthy",
    findings,
    updateProposals: proposals.sort((left, right) =>
      left.dependency.localeCompare(right.dependency),
    ),
    policy: {
      automaticApply: false,
      automaticPublish: false,
      approvalRequired: true,
    },
    limitations: [
      "Monitoring quality depends on configured external evidence sources.",
      "No dependency update, deploy, publish, or rollback was executed.",
    ],
  });
}

export interface WardenEvidenceAdapter {
  readonly id: string;
  readSignal(signal: WardenSignalId): Promise<unknown>;
  readDependencies(): Promise<unknown>;
}

export type WardenCollectionContext = Pick<
  WardenSnapshot,
  "environment" | "releaseRef" | "generatedAt" | "policy"
>;

function unavailableEvidence(source: string, attemptedAt: string, error: unknown) {
  return {
    status: "unavailable" as const,
    attemptedAt,
    source,
    reasonCode: "WARDEN_SOURCE_UNAVAILABLE",
    detailRedacted: redactOperationalDetail(error),
  };
}

export async function collectWardenSnapshot(
  context: WardenCollectionContext,
  adapter: WardenEvidenceAdapter,
): Promise<WardenSnapshot> {
  const source = OperationalSourceIdSchema.parse(adapter.id);
  const entries = await Promise.all(
    SIGNAL_IDS.map(async (signal) => {
      try {
        const parsed = SIGNAL_SCHEMAS[signal].safeParse(await adapter.readSignal(signal));
        return [
          signal,
          parsed.success
            ? { ...parsed.data, source }
            : unavailableEvidence(source, context.generatedAt, "WARDEN_SOURCE_PAYLOAD_INVALID"),
        ] as const;
      } catch (error) {
        return [signal, unavailableEvidence(source, context.generatedAt, error)] as const;
      }
    }),
  );

  let dependencyEvidence: unknown;
  try {
    const parsed = WardenDependencyEvidenceSchema.safeParse(await adapter.readDependencies());
    dependencyEvidence = parsed.success
      ? { ...parsed.data, source }
      : unavailableEvidence(source, context.generatedAt, "WARDEN_DEPENDENCY_PAYLOAD_INVALID");
  } catch (error) {
    dependencyEvidence = unavailableEvidence(source, context.generatedAt, error);
  }

  return WardenSnapshotSchema.parse({
    kind: "warden_monitoring_snapshot",
    version: "1.0.0",
    ...context,
    signals: Object.fromEntries(entries),
    dependencyEvidence,
  });
}

export function parseWardenOperationalMetric(input: unknown): OperationalMetric {
  return OperationalMetricSchema.parse(input);
}
