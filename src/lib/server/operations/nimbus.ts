import { z } from "zod";
import {
  metricSchemaFor,
  redactOperationalDetail,
  sha256Json,
  type OperationalMetric,
} from "@/lib/server/operations/types";

const IdentifierSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/);
const LabelSchema = z.string().trim().min(1).max(120);
const SecretNameSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/);

export const NimbusInfrastructureRequirementsSchema = z
  .object({
    kind: z.literal("nimbus_infrastructure_requirements"),
    version: z.literal("1.0.0"),
    projectId: IdentifierSchema,
    generatedAt: z.string().datetime(),
    decisionHorizonEndsAt: z.string().datetime(),
    requiredRegion: IdentifierSchema,
    requiredRuntimeId: IdentifierSchema,
    database: z
      .object({ required: z.boolean(), kind: IdentifierSchema.nullable() })
      .strict(),
    storage: z
      .object({ required: z.boolean(), kind: IdentifierSchema.nullable() })
      .strict(),
    cdnRequired: z.boolean(),
    secretNames: z.array(SecretNameSchema).max(100),
    usage: z
      .object({
        monthlyRequests: z.number().int().nonnegative(),
        egressGb: z.number().finite().nonnegative(),
        databaseStorageGb: z.number().finite().nonnegative(),
        objectStorageGb: z.number().finite().nonnegative(),
      })
      .strict(),
    policy: z
      .object({
        maxQuoteAgeMs: z.number().int().positive().max(365 * 24 * 60 * 60 * 1_000),
        costRiskBufferRatio: z.number().finite().min(0).max(0.5),
        maxMonthlyCostUsd: z.number().finite().nonnegative(),
      })
      .strict(),
  })
  .strict()
  .superRefine((requirements, context) => {
    if (requirements.database.required !== Boolean(requirements.database.kind)) {
      context.addIssue({
        code: "custom",
        path: ["database", "kind"],
        message: "Database kind must be set exactly when a database is required",
      });
    }
    if (requirements.storage.required !== Boolean(requirements.storage.kind)) {
      context.addIssue({
        code: "custom",
        path: ["storage", "kind"],
        message: "Storage kind must be set exactly when storage is required",
      });
    }
    if (
      Date.parse(requirements.decisionHorizonEndsAt) <= Date.parse(requirements.generatedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["decisionHorizonEndsAt"],
        message: "Decision horizon must be after generation time",
      });
    }
  });

export const NimbusProviderCandidateSchema = z
  .object({
    id: IdentifierSchema,
    displayName: LabelSchema,
    regions: z.array(IdentifierSchema).min(1).max(100),
    runtimes: z
      .array(
        z
          .object({
            id: IdentifierSchema,
            supportedUntil: z.string().datetime(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    databaseServices: z
      .array(z.object({ id: IdentifierSchema, kind: IdentifierSchema }).strict())
      .max(100),
    storageServices: z
      .array(z.object({ id: IdentifierSchema, kind: IdentifierSchema }).strict())
      .max(100),
    cdnAvailable: z.boolean(),
    secretStoreAvailable: z.boolean(),
    quote: z
      .object({
        reference: z.string().trim().min(1).max(240),
        observedAt: z.string().datetime(),
        currency: z.literal("USD"),
      })
      .strict(),
    pricing: z
      .object({
        baseMonthlyUsd: z.number().finite().nonnegative(),
        perMillionRequestsUsd: z.number().finite().nonnegative(),
        perEgressGbUsd: z.number().finite().nonnegative(),
        databaseBaseMonthlyUsd: z.number().finite().nonnegative(),
        databasePerGbUsd: z.number().finite().nonnegative(),
        storageBaseMonthlyUsd: z.number().finite().nonnegative(),
        storagePerGbUsd: z.number().finite().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const NimbusInfrastructureDecisionInputSchema = z
  .object({
    requirements: NimbusInfrastructureRequirementsSchema,
    candidates: z.array(NimbusProviderCandidateSchema).min(1).max(50),
  })
  .strict();

const CostComponentSchema = z
  .object({
    id: z.enum(["base", "requests", "egress", "database", "storage"]),
    monthlyUsd: z.number().finite().nonnegative(),
    assumption: z.string().trim().min(1).max(240),
  })
  .strict();

export const NimbusInfrastructureDecisionSchema = z
  .object({
    kind: z.literal("nimbus_infrastructure_decision"),
    version: z.literal("1.0.0"),
    generatedAt: z.string().datetime(),
    projectId: IdentifierSchema,
    requirementsSha256: z.string().regex(/^[0-9a-f]{64}$/),
    evidence: z.literal("provided_source_pricing_comparison"),
    provider: z
      .object({
        id: IdentifierSchema,
        displayName: LabelSchema,
        region: IdentifierSchema,
        quoteReference: z.string().trim().min(1).max(240),
        quoteObservedAt: z.string().datetime(),
      })
      .strict(),
    runtime: z
      .object({ id: IdentifierSchema, supportedUntil: z.string().datetime() })
      .strict(),
    database: z
      .object({ required: z.boolean(), kind: IdentifierSchema.nullable(), serviceId: IdentifierSchema.nullable() })
      .strict(),
    storage: z
      .object({ required: z.boolean(), kind: IdentifierSchema.nullable(), serviceId: IdentifierSchema.nullable() })
      .strict(),
    cdn: z.object({ required: z.boolean(), selectedInPlan: z.boolean() }).strict(),
    secrets: z
      .object({
        names: z.array(SecretNameSchema).max(100),
        providerSecretStore: z.boolean(),
        valuesIncluded: z.literal(false),
      })
      .strict(),
    monthlyCostEstimate: z
      .object({
        currency: z.literal("USD"),
        minimumUsd: z.number().finite().nonnegative(),
        maximumUsd: z.number().finite().nonnegative(),
        components: z.array(CostComponentSchema).length(5),
        withinPolicy: z.literal(true),
      })
      .strict(),
    rationale: z.array(z.string().trim().min(1).max(500)).min(5).max(20),
    rejectedCandidates: z.array(
      z
        .object({
          providerId: IdentifierSchema,
          reasons: z.array(z.string().trim().min(1).max(240)).min(1),
        })
        .strict(),
    ),
    limitations: z.tuple([
      z.literal("Input quote references and capabilities must be independently verified before approval."),
      z.literal("No infrastructure resource, secret value, deploy, or rollback was created."),
    ]),
    automaticDeployment: z.literal(false),
    requiresApproval: z.literal(true),
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.monthlyCostEstimate.maximumUsd < decision.monthlyCostEstimate.minimumUsd) {
      context.addIssue({
        code: "custom",
        path: ["monthlyCostEstimate", "maximumUsd"],
        message: "Maximum cost must be greater than or equal to minimum cost",
      });
    }
    if (
      decision.database.required !== Boolean(decision.database.serviceId) ||
      decision.storage.required !== Boolean(decision.storage.serviceId)
    ) {
      context.addIssue({
        code: "custom",
        message: "Required infrastructure services must have concrete service identifiers",
      });
    }
  });

export type NimbusInfrastructureDecision = z.infer<typeof NimbusInfrastructureDecisionSchema>;

export class NimbusDecisionError extends Error {
  readonly code = "NIMBUS_NO_ELIGIBLE_PROVIDER";

  constructor() {
    super("NIMBUS_NO_ELIGIBLE_PROVIDER");
    this.name = "NimbusDecisionError";
  }
}

function usd(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function evaluateCandidate(
  requirements: z.infer<typeof NimbusInfrastructureRequirementsSchema>,
  candidate: z.infer<typeof NimbusProviderCandidateSchema>,
  nowMs: number,
) {
  const reasons: string[] = [];
  const generatedAtMs = Date.parse(requirements.generatedAt);
  const quoteAtMs = Date.parse(candidate.quote.observedAt);
  if (generatedAtMs > nowMs + 5 * 60 * 1_000) {
    reasons.push("infrastructure requirements timestamp is in the future");
  }
  if (nowMs - generatedAtMs > requirements.policy.maxQuoteAgeMs) {
    reasons.push("infrastructure requirements are stale");
  }
  if (Date.parse(requirements.decisionHorizonEndsAt) <= nowMs) {
    reasons.push("decision horizon has expired");
  }
  if (quoteAtMs > nowMs + 5 * 60 * 1_000) reasons.push("pricing quote timestamp is in the future");
  if (nowMs - quoteAtMs > requirements.policy.maxQuoteAgeMs) reasons.push("pricing quote is stale");
  if (!candidate.regions.includes(requirements.requiredRegion)) reasons.push("required region is unavailable");

  const runtime = candidate.runtimes.find((entry) => entry.id === requirements.requiredRuntimeId);
  if (!runtime) reasons.push("required runtime is unavailable");
  else if (Date.parse(runtime.supportedUntil) < Date.parse(requirements.decisionHorizonEndsAt)) {
    reasons.push("runtime support window ends before the decision horizon");
  }

  const database = requirements.database.required
    ? candidate.databaseServices.find((entry) => entry.kind === requirements.database.kind) ?? null
    : null;
  if (requirements.database.required && !database) reasons.push("required database service is unavailable");
  const storage = requirements.storage.required
    ? candidate.storageServices.find((entry) => entry.kind === requirements.storage.kind) ?? null
    : null;
  if (requirements.storage.required && !storage) reasons.push("required storage service is unavailable");
  if (requirements.cdnRequired && !candidate.cdnAvailable) reasons.push("required CDN is unavailable");
  if (requirements.secretNames.length && !candidate.secretStoreAvailable) {
    reasons.push("required secret store is unavailable");
  }

  const components = [
    {
      id: "base" as const,
      monthlyUsd: usd(candidate.pricing.baseMonthlyUsd),
      assumption: "Provider base monthly price from the cited quote.",
    },
    {
      id: "requests" as const,
      monthlyUsd: usd(
        (requirements.usage.monthlyRequests / 1_000_000) * candidate.pricing.perMillionRequestsUsd,
      ),
      assumption: `${requirements.usage.monthlyRequests} forecast monthly requests.`,
    },
    {
      id: "egress" as const,
      monthlyUsd: usd(requirements.usage.egressGb * candidate.pricing.perEgressGbUsd),
      assumption: `${requirements.usage.egressGb} GB forecast monthly egress.`,
    },
    {
      id: "database" as const,
      monthlyUsd: requirements.database.required
        ? usd(
            candidate.pricing.databaseBaseMonthlyUsd +
              requirements.usage.databaseStorageGb * candidate.pricing.databasePerGbUsd,
          )
        : 0,
      assumption: requirements.database.required
        ? `${requirements.usage.databaseStorageGb} GB forecast database storage.`
        : "No database requested.",
    },
    {
      id: "storage" as const,
      monthlyUsd: requirements.storage.required
        ? usd(
            candidate.pricing.storageBaseMonthlyUsd +
              requirements.usage.objectStorageGb * candidate.pricing.storagePerGbUsd,
          )
        : 0,
      assumption: requirements.storage.required
        ? `${requirements.usage.objectStorageGb} GB forecast object storage.`
        : "No object storage requested.",
    },
  ];
  const minimumUsd = usd(components.reduce((total, component) => total + component.monthlyUsd, 0));
  const maximumUsd = usd(minimumUsd * (1 + requirements.policy.costRiskBufferRatio));
  if (maximumUsd > requirements.policy.maxMonthlyCostUsd) reasons.push("estimated maximum cost exceeds policy");

  return { candidate, reasons, runtime, database, storage, components, minimumUsd, maximumUsd };
}

export function decideNimbusInfrastructure(
  input: unknown,
  options: { now?: string } = {},
): NimbusInfrastructureDecision {
  const parsed = NimbusInfrastructureDecisionInputSchema.parse(input);
  const now = z.string().datetime().parse(options.now ?? new Date().toISOString());
  const nowMs = Date.parse(now);
  const evaluations = parsed.candidates.map((candidate) =>
    evaluateCandidate(parsed.requirements, candidate, nowMs),
  );
  const eligible = evaluations
    .filter((evaluation) => evaluation.reasons.length === 0)
    .sort(
      (left, right) =>
        left.maximumUsd - right.maximumUsd || left.candidate.id.localeCompare(right.candidate.id),
    );
  const selected = eligible[0];
  if (!selected || !selected.runtime) throw new NimbusDecisionError();

  const requirements = parsed.requirements;
  const candidate = selected.candidate;
  return NimbusInfrastructureDecisionSchema.parse({
    kind: "nimbus_infrastructure_decision",
    version: "1.0.0",
    generatedAt: now,
    projectId: requirements.projectId,
    requirementsSha256: sha256Json(requirements),
    evidence: "provided_source_pricing_comparison",
    provider: {
      id: candidate.id,
      displayName: candidate.displayName,
      region: requirements.requiredRegion,
      quoteReference: candidate.quote.reference,
      quoteObservedAt: candidate.quote.observedAt,
    },
    runtime: selected.runtime,
    database: {
      required: requirements.database.required,
      kind: requirements.database.kind,
      serviceId: selected.database?.id ?? null,
    },
    storage: {
      required: requirements.storage.required,
      kind: requirements.storage.kind,
      serviceId: selected.storage?.id ?? null,
    },
    cdn: { required: requirements.cdnRequired, selectedInPlan: candidate.cdnAvailable },
    secrets: {
      names: [...new Set(requirements.secretNames)].sort(),
      providerSecretStore: candidate.secretStoreAvailable,
      valuesIncluded: false,
    },
    monthlyCostEstimate: {
      currency: "USD",
      minimumUsd: selected.minimumUsd,
      maximumUsd: selected.maximumUsd,
      components: selected.components,
      withinPolicy: true,
    },
    rationale: [
      `${candidate.displayName} supports region ${requirements.requiredRegion}.`,
      `Runtime ${selected.runtime.id} is supported through ${selected.runtime.supportedUntil}.`,
      requirements.database.required
        ? `Database requirement ${requirements.database.kind} maps to ${selected.database?.id}.`
        : "No database was requested, so no database service is selected.",
      requirements.storage.required
        ? `Storage requirement ${requirements.storage.kind} maps to ${selected.storage?.id}.`
        : "No object storage was requested, so no storage service is selected.",
      `The source-priced maximum estimate is USD ${selected.maximumUsd} including the approved risk buffer.`,
      `The decision compared ${parsed.candidates.length} configured candidate(s); no provider was selected from a static slogan.`,
    ],
    rejectedCandidates: evaluations
      .filter((evaluation) => evaluation.candidate.id !== candidate.id)
      .map((evaluation) => ({
        providerId: evaluation.candidate.id,
        reasons:
          evaluation.reasons.length > 0
            ? evaluation.reasons
            : [`eligible but estimated maximum cost was USD ${evaluation.maximumUsd}`],
      }))
      .sort((left, right) => left.providerId.localeCompare(right.providerId)),
    limitations: [
      "Input quote references and capabilities must be independently verified before approval.",
      "No infrastructure resource, secret value, deploy, or rollback was created.",
    ],
    automaticDeployment: false,
    requiresApproval: true,
  });
}

const NIMBUS_METRICS = ["errorRate", "uptime", "latencyP95", "deployHealth", "costForecast"] as const;
type NimbusMetricId = (typeof NIMBUS_METRICS)[number];
const NimbusMetricIdSchema = z.enum(NIMBUS_METRICS);

export const NimbusOperationalSnapshotSchema = z
  .object({
    kind: z.literal("nimbus_operational_snapshot"),
    version: z.literal("1.0.0"),
    environment: z.enum(["staging", "production"]),
    releaseRef: z.string().trim().min(1).max(240),
    previousReleaseRef: z.string().trim().min(1).max(240).nullable(),
    generatedAt: z.string().datetime(),
    metrics: z
      .object({
        errorRate: metricSchemaFor("ratio"),
        uptime: metricSchemaFor("ratio"),
        latencyP95: metricSchemaFor("milliseconds_p95"),
        deployHealth: metricSchemaFor("healthy_ratio"),
        costForecast: metricSchemaFor("usd_monthly_forecast"),
      })
      .strict(),
    thresholds: z
      .object({
        maxErrorRate: z.number().finite().min(0).max(1),
        minUptimeRatio: z.number().finite().min(0).max(1),
        maxP95LatencyMs: z.number().finite().positive(),
        minDeployHealthyRatio: z.number().finite().min(0).max(1),
        maxMonthlyCostUsd: z.number().finite().nonnegative(),
        maxSnapshotAgeMs: z.number().int().positive(),
        alertDeduplicationTtlMs: z.number().int().positive().max(30 * 24 * 60 * 60 * 1_000),
      })
      .strict(),
  })
  .strict();

export const NimbusThresholdBreachSchema = z
  .object({
    signal: NimbusMetricIdSchema,
    code: z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/),
    severity: z.enum(["critical", "high", "medium"]),
    evidenceComplete: z.boolean(),
    rollbackEligible: z.boolean(),
    message: z.string().trim().min(1).max(500),
    evidence: z.string().trim().min(1).max(500),
  })
  .strict();

export const NimbusAlertSchema = z
  .object({
    kind: z.literal("nimbus_alert_candidate"),
    version: z.literal("1.0.0"),
    deduplicationKey: z.string().regex(/^[0-9a-f]{64}$/),
    generatedAt: z.string().datetime(),
    environment: z.enum(["staging", "production"]),
    releaseRef: z.string().trim().min(1).max(240),
    signal: NimbusMetricIdSchema,
    code: z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/),
    severity: z.enum(["critical", "high", "medium"]),
    message: z.string().trim().min(1).max(500),
    deliveryAttempted: z.literal(false),
  })
  .strict();

const RollbackRecommendationSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("recommended"),
      targetReleaseRef: z.string().trim().min(1).max(240),
      reasonCodes: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/)).min(1),
      automaticRollback: z.literal(false),
      requiresApproval: z.literal(true),
    })
    .strict(),
  z
    .object({
      status: z.literal("not_recommended"),
      reason: z.string().trim().min(1).max(500),
      automaticRollback: z.literal(false),
      requiresApproval: z.literal(true),
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      reason: z.string().trim().min(1).max(500),
      automaticRollback: z.literal(false),
      requiresApproval: z.literal(true),
    })
    .strict(),
]);

export const NimbusOperationalReportSchema = z
  .object({
    kind: z.literal("nimbus_operational_report"),
    version: z.literal("1.0.0"),
    generatedAt: z.string().datetime(),
    environment: z.enum(["staging", "production"]),
    releaseRef: z.string().trim().min(1).max(240),
    snapshotSha256: z.string().regex(/^[0-9a-f]{64}$/),
    status: z.enum(["healthy", "degraded", "blocked"]),
    breaches: z.array(NimbusThresholdBreachSchema),
    alertCandidates: z.array(NimbusAlertSchema),
    rollbackRecommendation: RollbackRecommendationSchema,
    automaticAlertDelivery: z.literal(false),
    automaticRollback: z.literal(false),
    requiresApproval: z.literal(true),
  })
  .strict();

export type NimbusOperationalSnapshot = z.infer<typeof NimbusOperationalSnapshotSchema>;
export type NimbusOperationalReport = z.infer<typeof NimbusOperationalReportSchema>;
export type NimbusAlert = z.infer<typeof NimbusAlertSchema>;

function thresholdValueForSignal(
  signal: NimbusMetricId,
  thresholds: NimbusOperationalSnapshot["thresholds"],
): number {
  switch (signal) {
    case "errorRate":
      return thresholds.maxErrorRate;
    case "uptime":
      return thresholds.minUptimeRatio;
    case "latencyP95":
      return thresholds.maxP95LatencyMs;
    case "deployHealth":
      return thresholds.minDeployHealthyRatio;
    case "costForecast":
      return thresholds.maxMonthlyCostUsd;
  }
}

function operationalBreach(
  signal: NimbusMetricId,
  metric: OperationalMetric,
  nowMs: number,
  maxAgeMs: number,
  threshold: {
    breached: (value: number) => boolean;
    code: string;
    message: string;
    severity: "critical" | "high" | "medium";
    rollbackEligible: boolean;
  },
): z.infer<typeof NimbusThresholdBreachSchema>[] {
  if (metric.status === "unavailable") {
    return [{
      signal,
      code: "NIMBUS_METRIC_UNAVAILABLE",
      severity: "critical",
      evidenceComplete: false,
      rollbackEligible: false,
      message: `${signal} evidence is unavailable.`,
      evidence: `${metric.source} · ${metric.reasonCode} · ${metric.detailRedacted}`,
    }];
  }
  const observedAtMs = Date.parse(metric.observedAt);
  if (observedAtMs > nowMs + 5 * 60 * 1_000 || nowMs - observedAtMs > maxAgeMs) {
    return [{
      signal,
      code: observedAtMs > nowMs + 5 * 60 * 1_000
        ? "NIMBUS_METRIC_FROM_FUTURE"
        : "NIMBUS_METRIC_STALE",
      severity: "critical",
      evidenceComplete: false,
      rollbackEligible: false,
      message: `${signal} evidence is outside the approved time window.`,
      evidence: `${metric.source} · observed ${metric.observedAt}`,
    }];
  }
  if (!threshold.breached(metric.value)) return [];
  return [{
    signal,
    code: threshold.code,
    severity: threshold.severity,
    evidenceComplete: true,
    rollbackEligible: threshold.rollbackEligible,
    message: threshold.message,
    evidence: `${metric.source} · ${metric.value} ${metric.unit} · ${metric.sampleCount} sample(s)`,
  }];
}

export function evaluateNimbusOperationalSnapshot(
  input: unknown,
  options: { now?: string } = {},
): NimbusOperationalReport {
  const snapshot = NimbusOperationalSnapshotSchema.parse(input);
  const now = z.string().datetime().parse(options.now ?? new Date().toISOString());
  const nowMs = Date.parse(now);
  const thresholds = snapshot.thresholds;
  const breaches = [
    ...operationalBreach("errorRate", snapshot.metrics.errorRate, nowMs, thresholds.maxSnapshotAgeMs, {
      breached: (value) => value > thresholds.maxErrorRate,
      code: "NIMBUS_ERROR_RATE_EXCEEDED",
      message: "Measured error rate exceeds the approved threshold.",
      severity: "high",
      rollbackEligible: false,
    }),
    ...operationalBreach("uptime", snapshot.metrics.uptime, nowMs, thresholds.maxSnapshotAgeMs, {
      breached: (value) => value < thresholds.minUptimeRatio,
      code: "NIMBUS_UPTIME_BELOW_MINIMUM",
      message: "Measured uptime is below the approved threshold.",
      severity: "high",
      rollbackEligible: false,
    }),
    ...operationalBreach("latencyP95", snapshot.metrics.latencyP95, nowMs, thresholds.maxSnapshotAgeMs, {
      breached: (value) => value > thresholds.maxP95LatencyMs,
      code: "NIMBUS_LATENCY_EXCEEDED",
      message: "Measured p95 latency exceeds the approved threshold.",
      severity: "high",
      rollbackEligible: false,
    }),
    ...operationalBreach("deployHealth", snapshot.metrics.deployHealth, nowMs, thresholds.maxSnapshotAgeMs, {
      breached: (value) => value < thresholds.minDeployHealthyRatio,
      code: "NIMBUS_DEPLOY_UNHEALTHY",
      message: "Deploy health is below the approved threshold.",
      severity: "critical",
      rollbackEligible: true,
    }),
    ...operationalBreach("costForecast", snapshot.metrics.costForecast, nowMs, thresholds.maxSnapshotAgeMs, {
      breached: (value) => value > thresholds.maxMonthlyCostUsd,
      code: "NIMBUS_COST_FORECAST_EXCEEDED",
      message: "Monthly cost forecast exceeds the approved threshold.",
      severity: "medium",
      rollbackEligible: false,
    }),
  ].map((entry) => NimbusThresholdBreachSchema.parse(entry));

  const alertCandidates = breaches.map((breach) =>
    NimbusAlertSchema.parse({
      kind: "nimbus_alert_candidate",
      version: "1.0.0",
      deduplicationKey: sha256Json({
        environment: snapshot.environment,
        releaseRef: snapshot.releaseRef,
        signal: breach.signal,
        code: breach.code,
        threshold: thresholdValueForSignal(breach.signal, snapshot.thresholds),
      }),
      generatedAt: now,
      environment: snapshot.environment,
      releaseRef: snapshot.releaseRef,
      signal: breach.signal,
      code: breach.code,
      severity: breach.severity,
      message: breach.message,
      deliveryAttempted: false,
    }),
  );

  const incomplete = breaches.some((breach) => !breach.evidenceComplete);
  const rollbackBreaches = breaches.filter((breach) => breach.rollbackEligible);
  const rollbackRecommendation = rollbackBreaches.length
    ? snapshot.previousReleaseRef
      ? {
          status: "recommended" as const,
          targetReleaseRef: snapshot.previousReleaseRef,
          reasonCodes: rollbackBreaches.map((breach) => breach.code),
          automaticRollback: false as const,
          requiresApproval: true as const,
        }
      : {
          status: "unavailable" as const,
          reason: "A verified rollback trigger exists, but no previous release reference was supplied.",
          automaticRollback: false as const,
          requiresApproval: true as const,
        }
    : incomplete
      ? {
          status: "unavailable" as const,
          reason: "Operational evidence is incomplete, so a rollback recommendation cannot be made.",
          automaticRollback: false as const,
          requiresApproval: true as const,
        }
      : {
          status: "not_recommended" as const,
          reason: "No measured rollback-eligible threshold was breached.",
          automaticRollback: false as const,
          requiresApproval: true as const,
        };

  return NimbusOperationalReportSchema.parse({
    kind: "nimbus_operational_report",
    version: "1.0.0",
    generatedAt: now,
    environment: snapshot.environment,
    releaseRef: snapshot.releaseRef,
    snapshotSha256: sha256Json(snapshot),
    status: incomplete ? "blocked" : breaches.length ? "degraded" : "healthy",
    breaches,
    alertCandidates,
    rollbackRecommendation,
    automaticAlertDelivery: false,
    automaticRollback: false,
    requiresApproval: true,
  });
}

export interface NimbusAlertDeduplicator {
  /** Must atomically claim a key for the supplied TTL. True means this caller owns it. */
  claim(input: {
    deduplicationKey: string;
    expiresAt: string;
    alert: NimbusAlert;
  }): Promise<boolean>;
}

export const NimbusDeduplicationResultSchema = z
  .object({
    kind: z.literal("nimbus_alert_deduplication"),
    version: z.literal("1.0.0"),
    evaluatedAt: z.string().datetime(),
    newAlerts: z.array(NimbusAlertSchema),
    suppressedAlerts: z.array(NimbusAlertSchema),
    deliveryAttempted: z.literal(false),
  })
  .strict();

export async function deduplicateNimbusAlerts(
  report: NimbusOperationalReport,
  store: NimbusAlertDeduplicator,
  ttlMs: number,
  options: { now?: string } = {},
): Promise<z.infer<typeof NimbusDeduplicationResultSchema>> {
  const parsedReport = NimbusOperationalReportSchema.parse(report);
  const parsedTtl = z.number().int().positive().max(30 * 24 * 60 * 60 * 1_000).parse(ttlMs);
  const now = z.string().datetime().parse(options.now ?? parsedReport.generatedAt);
  const expiresAt = new Date(Date.parse(now) + parsedTtl).toISOString();
  const newAlerts: NimbusAlert[] = [];
  const suppressedAlerts: NimbusAlert[] = [];

  for (const alert of parsedReport.alertCandidates) {
    let claimed: boolean;
    try {
      claimed = z.boolean().parse(
        await store.claim({
          deduplicationKey: alert.deduplicationKey,
          expiresAt,
          alert,
        }),
      );
    } catch (error) {
      const safeDetail = redactOperationalDetail(error);
      throw new Error(`NIMBUS_ALERT_DEDUPLICATION_FAILED: ${safeDetail}`);
    }
    (claimed ? newAlerts : suppressedAlerts).push(alert);
  }

  return NimbusDeduplicationResultSchema.parse({
    kind: "nimbus_alert_deduplication",
    version: "1.0.0",
    evaluatedAt: now,
    newAlerts,
    suppressedAlerts,
    deliveryAttempted: false,
  });
}

export interface NimbusSnapshotSource {
  readSnapshot(): Promise<unknown>;
}

export async function runNimbusObservation(
  source: NimbusSnapshotSource,
  deduplicator: NimbusAlertDeduplicator,
  options: { now?: string } = {},
) {
  const snapshot = NimbusOperationalSnapshotSchema.parse(await source.readSnapshot());
  const report = evaluateNimbusOperationalSnapshot(snapshot, options);
  const deduplication = await deduplicateNimbusAlerts(
    report,
    deduplicator,
    snapshot.thresholds.alertDeduplicationTtlMs,
    options,
  );
  return { snapshot, report, deduplication } as const;
}
