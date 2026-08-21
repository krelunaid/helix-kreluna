import { z } from "zod";

/**
 * This module is a contract and consumer, not a benchmark runner. The SHA-256
 * seal makes a persisted bundle tamper-evident and binds every profile to one
 * artifact/deploy; it does not authenticate the provider. The server-only
 * Augur ingestion boundary authenticates the source before calling this seal.
 */

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const TimestampSchema = z.string().datetime();
const PositiveRateSchema = z.number().positive().max(1_000_000_000);

const EvidenceBindingShape = {
  artifactSha256: Sha256Schema,
  deploySha256: Sha256Schema,
  observedAt: TimestampSchema,
  source: z.string().min(1).max(240),
} as const;

export const StormCapacityReportSchema = z
  .object({
    ...EvidenceBindingShape,
    kind: z.literal("storm_capacity_load_test"),
    version: z.literal("1.0.0"),
    status: z.literal("completed"),
    evidence: z.literal("measured"),
    runner: z.string().min(1).max(120),
    targetSha256: Sha256Schema,
    durationMs: z.number().int().positive().max(86_400_000),
    metrics: z
      .object({
        attemptedRequests: z.number().int().positive().max(1_000_000_000),
        successfulRequests: z.number().int().nonnegative().max(1_000_000_000),
        failedRequests: z.number().int().nonnegative().max(1_000_000_000),
        stableRequestsPerSecond: PositiveRateSchema,
        saturationRequestsPerSecond: PositiveRateSchema,
        errorRate: z.number().min(0).max(1),
        latencyMs: z
          .object({
            p50: z.number().nonnegative().max(86_400_000),
            p95: z.number().positive().max(86_400_000),
            p99: z.number().positive().max(86_400_000),
          })
          .strict(),
        concurrency: z
          .object({
            configured: z.number().int().positive().max(1_000_000),
            peak: z.number().int().positive().max(1_000_000),
            saturation: z.number().int().positive().max(1_000_000),
          })
          .strict(),
        saturationObserved: z.literal(true),
      })
      .strict(),
  })
  .strict()
  .superRefine((report, context) => {
    const { metrics } = report;
    if (metrics.successfulRequests + metrics.failedRequests !== metrics.attemptedRequests) {
      context.addIssue({
        code: "custom",
        message: "Storm request totals are inconsistent",
        path: ["metrics", "attemptedRequests"],
      });
    }
    if (
      metrics.stableRequestsPerSecond > metrics.saturationRequestsPerSecond ||
      metrics.latencyMs.p50 > metrics.latencyMs.p95 ||
      metrics.latencyMs.p95 > metrics.latencyMs.p99 ||
      metrics.concurrency.peak > metrics.concurrency.configured ||
      metrics.concurrency.peak > metrics.concurrency.saturation
    ) {
      context.addIssue({
        code: "custom",
        message: "Storm rate, latency or concurrency bounds are inconsistent",
        path: ["metrics"],
      });
    }
    const derivedErrorRate = metrics.failedRequests / metrics.attemptedRequests;
    if (Math.abs(derivedErrorRate - metrics.errorRate) > 0.000001) {
      context.addIssue({
        code: "custom",
        message: "Storm error rate does not match request totals",
        path: ["metrics", "errorRate"],
      });
    }
  });

export const DatabaseCapacityProfileSchema = z
  .object({
    ...EvidenceBindingShape,
    kind: z.literal("database_capacity_profile"),
    version: z.literal("1.0.0"),
    evidence: z.literal("measured"),
    engine: z.string().min(1).max(80),
    instanceClass: z.string().min(1).max(120),
    sampleWindowSeconds: z.number().int().positive().max(2_592_000),
    metrics: z
      .object({
        sustainedTransactionsPerSecond: PositiveRateSchema,
        p95QueryLatencyMs: z.number().positive().max(86_400_000),
        activeConnections: z.number().int().nonnegative().max(10_000_000),
        maxConnections: z.number().int().positive().max(10_000_000),
        saturationConnections: z.number().int().positive().max(10_000_000),
        queriesPerRequest: z.number().positive().max(100_000),
      })
      .strict(),
  })
  .strict()
  .superRefine((profile, context) => {
    if (
      profile.metrics.activeConnections > profile.metrics.maxConnections ||
      profile.metrics.saturationConnections > profile.metrics.maxConnections
    ) {
      context.addIssue({
        code: "custom",
        message: "Database connection bounds are inconsistent",
        path: ["metrics"],
      });
    }
  });

export const DeploymentTopologyProfileSchema = z
  .object({
    ...EvidenceBindingShape,
    kind: z.literal("deployment_topology_profile"),
    version: z.literal("1.0.0"),
    evidence: z.literal("observed"),
    provider: z.string().min(1).max(120),
    environment: z.string().min(1).max(80),
    regions: z.array(z.string().min(1).max(80)).min(1).max(100),
    services: z
      .array(
        z
          .object({
            id: z.string().min(1).max(120),
            role: z.enum(["edge", "web", "api", "worker", "database", "cache"]),
            replicas: z.number().int().positive().max(100_000),
          })
          .strict(),
      )
      .min(1)
      .max(1_000),
  })
  .strict();

export const CostTelemetryProfileSchema = z
  .object({
    ...EvidenceBindingShape,
    kind: z.literal("cost_telemetry_profile"),
    version: z.literal("1.0.0"),
    evidence: z.literal("measured"),
    currency: z.string().regex(/^[A-Z]{3}$/),
    amount: z.number().nonnegative().max(1_000_000_000),
    periodStart: TimestampSchema,
    periodEnd: TimestampSchema,
    billedRequests: z.number().int().positive().max(1_000_000_000_000),
    providerReferenceSha256: Sha256Schema,
  })
  .strict()
  .superRefine((profile, context) => {
    if (Date.parse(profile.periodStart) >= Date.parse(profile.periodEnd)) {
      context.addIssue({
        code: "custom",
        message: "Cost telemetry period is invalid",
        path: ["periodEnd"],
      });
    }
  });

export const ConcurrencyCapacityProfileSchema = z
  .object({
    ...EvidenceBindingShape,
    kind: z.literal("concurrency_capacity_profile"),
    version: z.literal("1.0.0"),
    evidence: z.literal("measured"),
    metrics: z
      .object({
        stableConcurrentRequests: z.number().int().positive().max(1_000_000),
        hardConcurrentRequestLimit: z.number().int().positive().max(1_000_000),
        observedPeakConcurrentRequests: z.number().int().positive().max(1_000_000),
        queueDepthAtSaturation: z.number().int().nonnegative().max(1_000_000_000),
      })
      .strict(),
  })
  .strict()
  .superRefine((profile, context) => {
    if (
      profile.metrics.stableConcurrentRequests > profile.metrics.hardConcurrentRequestLimit ||
      profile.metrics.observedPeakConcurrentRequests > profile.metrics.hardConcurrentRequestLimit
    ) {
      context.addIssue({
        code: "custom",
        message: "Concurrency bounds are inconsistent",
        path: ["metrics"],
      });
    }
  });

const CapacityProfilesSchema = z
  .object({
    storm: StormCapacityReportSchema,
    database: DatabaseCapacityProfileSchema,
    topology: DeploymentTopologyProfileSchema,
    cost: CostTelemetryProfileSchema,
    concurrency: ConcurrencyCapacityProfileSchema,
  })
  .strict();

const CapacityEvidenceBodyShape = {
  kind: z.literal("augur_capacity_evidence"),
  version: z.literal("1.0.0"),
  artifactSha256: Sha256Schema,
  deploySha256: Sha256Schema,
  generatedAt: TimestampSchema,
  profiles: CapacityProfilesSchema,
} as const;

function enforceSharedBinding(
  evidence: {
    artifactSha256: string;
    deploySha256: string;
    profiles: z.infer<typeof CapacityProfilesSchema>;
  },
  context: z.RefinementCtx,
) {
  for (const [name, profile] of Object.entries(evidence.profiles)) {
    if (
      profile.artifactSha256 !== evidence.artifactSha256 ||
      profile.deploySha256 !== evidence.deploySha256
    ) {
      context.addIssue({
        code: "custom",
        message: `${name} evidence is not bound to the declared artifact and deploy`,
        path: ["profiles", name],
      });
    }
  }
}

export const AugurCapacityEvidenceBodySchema = z
  .object(CapacityEvidenceBodyShape)
  .strict()
  .superRefine(enforceSharedBinding);

export const AugurCapacityEvidenceSchema = z
  .object({
    ...CapacityEvidenceBodyShape,
    evidenceSha256: Sha256Schema,
  })
  .strict()
  .superRefine(enforceSharedBinding);

export type AugurCapacityEvidenceBody = z.infer<typeof AugurCapacityEvidenceBodySchema>;
export type AugurCapacityEvidence = z.infer<typeof AugurCapacityEvidenceSchema>;

export type CapacityForecast =
  | {
      status: "not_run";
      evidence: "not_run";
      confidence: 0;
      range: null;
      missingEvidence: string[];
      verdict: string;
    }
  | {
      status: "completed";
      evidence: "estimated";
      confidence: number;
      range: { min: number; max: number; unit: "requests/second" };
      missingEvidence: [];
      artifactSha256: string;
      deploySha256: string;
      evidenceSha256: string;
      basis: string[];
      limitations: string[];
      verdict: string;
    };

export const CAPACITY_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const CAPACITY_EVIDENCE_FUTURE_TOLERANCE_MS = 5 * 60 * 1_000;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function capacityEvidenceSha256(evidence: AugurCapacityEvidenceBody): Promise<string> {
  const parsed = AugurCapacityEvidenceBodySchema.parse(evidence);
  return sha256Hex(stableJson(parsed));
}

export async function sealCapacityEvidence(
  evidence: AugurCapacityEvidenceBody,
): Promise<AugurCapacityEvidence> {
  const parsed = AugurCapacityEvidenceBodySchema.parse(evidence);
  return AugurCapacityEvidenceSchema.parse({
    ...parsed,
    evidenceSha256: await capacityEvidenceSha256(parsed),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function labels(it: boolean) {
  return {
    storm: it
      ? "load test Storm completo con saturazione"
      : "complete Storm load test with saturation",
    database: it ? "profilo misurato del database" : "measured database profile",
    topology: it ? "topologia osservata del deploy" : "observed deployment topology",
    cost: it ? "telemetria misurata dei costi" : "measured cost telemetry",
    concurrency: it ? "limiti misurati di concorrenza" : "measured concurrency limits",
    contract: it ? "contratto evidence completo e valido" : "complete, valid evidence contract",
    integrity: it ? "hash integro dell’evidence bundle" : "intact evidence-bundle hash",
    artifact: it ? "evidence per l’artefatto corrente" : "evidence for the current artifact",
    deploy: it ? "binding coerente al deploy" : "consistent deploy binding",
    fresh: it ? "evidence fresca entro 24 ore" : "evidence fresh within 24 hours",
    bounds: it ? "limiti di capacità coerenti" : "consistent capacity bounds",
  };
}

function notRun(it: boolean, missingEvidence: string[]): CapacityForecast {
  return {
    status: "not_run",
    evidence: "not_run",
    confidence: 0,
    range: null,
    missingEvidence: [...new Set(missingEvidence)],
    verdict: it
      ? "Capacity forecast NON ESEGUITA: l’evidence misurata non è completa, fresca e hash-bound."
      : "Capacity forecast NOT RUN: measured evidence is not complete, fresh and hash-bound.",
  };
}

function missingProfiles(value: unknown, it: boolean): string[] {
  const names = labels(it);
  if (!isRecord(value)) {
    return [names.storm, names.database, names.topology, names.cost, names.concurrency];
  }
  const profiles = isRecord(value.profiles) ? value.profiles : undefined;
  if (!profiles) {
    return [names.storm, names.database, names.topology, names.cost, names.concurrency];
  }
  return (["storm", "database", "topology", "cost", "concurrency"] as const)
    .filter((name) => !isRecord(profiles[name]))
    .map((name) => names[name]);
}

function observationTimes(evidence: AugurCapacityEvidence): number[] {
  return [
    Date.parse(evidence.generatedAt),
    ...Object.values(evidence.profiles).map((profile) => Date.parse(profile.observedAt)),
    Date.parse(evidence.profiles.cost.periodEnd),
  ];
}

export async function computeCapacityForecast(
  value: unknown,
  artifactSha256: string,
  locale: string = "en",
  options: { now?: number; maxAgeMs?: number; expectedDeploySha256?: string } = {},
): Promise<CapacityForecast> {
  const it = locale.toLowerCase().startsWith("it");
  const names = labels(it);
  const absent = missingProfiles(value, it);
  if (absent.length) return notRun(it, absent);

  const parsed = AugurCapacityEvidenceSchema.safeParse(value);
  if (!parsed.success) return notRun(it, [names.contract]);
  const evidence = parsed.data;
  const { evidenceSha256, ...body } = evidence;
  if ((await capacityEvidenceSha256(body)) !== evidenceSha256) {
    return notRun(it, [names.integrity]);
  }
  if (evidence.artifactSha256 !== artifactSha256) {
    return notRun(it, [names.artifact]);
  }
  if (!options.expectedDeploySha256 || evidence.deploySha256 !== options.expectedDeploySha256) {
    return notRun(it, [names.deploy]);
  }

  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? CAPACITY_EVIDENCE_MAX_AGE_MS;
  const timestamps = observationTimes(evidence);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(maxAgeMs) ||
    maxAgeMs <= 0 ||
    timestamps.some(
      (timestamp) =>
        !Number.isFinite(timestamp) ||
        timestamp > now + CAPACITY_EVIDENCE_FUTURE_TOLERANCE_MS ||
        now - timestamp >= maxAgeMs,
    )
  ) {
    return notRun(it, [names.fresh]);
  }

  const { storm, database, cost, concurrency, topology } = evidence.profiles;
  const p95Seconds = storm.metrics.latencyMs.p95 / 1_000;
  const databaseRequestsPerSecond =
    database.metrics.sustainedTransactionsPerSecond / database.metrics.queriesPerRequest;
  const stableConcurrencyRate = concurrency.metrics.stableConcurrentRequests / p95Seconds;
  const hardConcurrencyRate = concurrency.metrics.hardConcurrentRequestLimit / p95Seconds;
  const minimum = Math.floor(
    Math.min(
      storm.metrics.stableRequestsPerSecond,
      databaseRequestsPerSecond,
      stableConcurrencyRate,
    ),
  );
  const maximum = Math.floor(
    Math.min(
      storm.metrics.saturationRequestsPerSecond,
      databaseRequestsPerSecond,
      hardConcurrencyRate,
    ),
  );
  if (minimum <= 0 || maximum < minimum) return notRun(it, [names.bounds]);

  const oldestObservationAgeMs = Math.max(...timestamps.map((timestamp) => now - timestamp));
  const freshnessConfidence = Math.max(0, 1 - oldestObservationAgeMs / maxAgeMs);
  const sampleConfidence = Math.min(1, storm.metrics.attemptedRequests / 500);
  const successConfidence = 1 - storm.metrics.errorRate;
  const forecastConfidence =
    Math.round(Math.min(0.9, freshnessConfidence, sampleConfidence, successConfidence) * 100) / 100;

  const costPerMillionRequests = (cost.amount / cost.billedRequests) * 1_000_000;
  const services = topology.services.reduce((total, service) => total + service.replicas, 0);
  return {
    status: "completed",
    evidence: "estimated",
    confidence: forecastConfidence,
    range: { min: minimum, max: maximum, unit: "requests/second" },
    missingEvidence: [],
    artifactSha256: evidence.artifactSha256,
    deploySha256: evidence.deploySha256,
    evidenceSha256,
    basis: [
      `Storm stable/saturation: ${storm.metrics.stableRequestsPerSecond}/${storm.metrics.saturationRequestsPerSecond} requests/second`,
      `Database ceiling: ${Math.floor(databaseRequestsPerSecond)} requests/second at ${database.metrics.queriesPerRequest} queries/request`,
      `Concurrency ceiling: ${Math.floor(stableConcurrencyRate)}–${Math.floor(hardConcurrencyRate)} requests/second at p95 ${storm.metrics.latencyMs.p95} ms`,
      `Observed topology: ${services} replicas across ${topology.regions.length} region(s)`,
      `Measured cost: ${cost.currency} ${costPerMillionRequests.toFixed(2)} per million billed requests in the evidence window`,
    ],
    limitations: [
      it
        ? "Intervallo di throughput, non numero di utenti; vale solo per artefatto, deploy e finestra misurati."
        : "Throughput range, not user count; valid only for the measured artifact, deploy and window.",
      it
        ? "La stima non autorizza il rilascio e non sostituisce un test continuo di produzione."
        : "The estimate does not authorize release and does not replace continuous production testing.",
    ],
    verdict: it
      ? `Capacity forecast stimata: ${minimum}–${maximum} richieste/secondo, confidence ${Math.round(forecastConfidence * 100)}%.`
      : `Estimated capacity forecast: ${minimum}–${maximum} requests/second, ${Math.round(forecastConfidence * 100)}% confidence.`,
  };
}
