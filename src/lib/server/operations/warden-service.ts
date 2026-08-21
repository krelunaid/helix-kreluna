import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import {
  WardenPolicySchema,
  WardenReportSchema,
  WardenSnapshotSchema,
  collectWardenSnapshot,
  evaluateWardenSnapshot,
  type WardenEvidenceAdapter,
  type WardenReport,
  type WardenSignalId,
} from "@/lib/server/operations/warden";
import {
  OperationalSourceIdSchema,
  redactOperationalDetail,
  sha256Json,
} from "@/lib/server/operations/types";

const IdentifierSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/);
const SHA256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const ReasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/);
const HTTPS_OR_LOOPBACK_URL = z.string().url().superRefine((value, context) => {
  const url = new URL(value);
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    context.addIssue({
      code: "custom",
      message: "Warden source URL must be HTTPS (or loopback HTTP) without credentials/query/fragment",
    });
  }
});

const WardenSourceEnvelopeSchema = z
  .object({
    kind: z.literal("warden_source_evidence"),
    version: z.literal("1.0.0"),
    adapterId: IdentifierSchema,
    sourceId: OperationalSourceIdSchema,
    evidenceKind: z.union([
      z.object({ type: z.literal("signal"), signal: z.string() }).strict(),
      z.object({ type: z.literal("dependencies") }).strict(),
    ]),
    payload: z.unknown(),
  })
  .strict();

export const AuthenticatedWardenSourceConfigurationSchema = z
  .object({
    adapterId: IdentifierSchema,
    sourceId: OperationalSourceIdSchema,
    baseUrl: HTTPS_OR_LOOPBACK_URL,
    bearerToken: z.string().min(32).max(4_096),
    requestTimeoutMs: z.number().int().positive().max(30_000),
  })
  .strict();

export type AuthenticatedWardenSourceConfiguration = z.infer<
  typeof AuthenticatedWardenSourceConfigurationSchema
>;

export type WardenSourceRequest = Readonly<{
  url: string;
  headers: Readonly<Record<string, string>>;
  timeoutMs: number;
}>;

/**
 * Contract boundary for source transport. Tests inject a transport to verify the
 * request/authentication contract; those tests are not evidence that a provider
 * endpoint exists or returned real monitoring data.
 */
export interface WardenSourceTransport {
  readJson(input: WardenSourceRequest): Promise<unknown>;
}

export const fetchWardenSourceTransport: WardenSourceTransport = {
  async readJson(input) {
    const response = await fetch(input.url, {
      method: "GET",
      headers: input.headers,
      redirect: "error",
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    if (!response.ok) throw new Error(`WARDEN_SOURCE_HTTP_${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!/^application\/json(?:;|$)/iu.test(contentType)) {
      throw new Error("WARDEN_SOURCE_CONTENT_TYPE_INVALID");
    }
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > 2 * 1024 * 1024) {
      throw new Error("WARDEN_SOURCE_RESPONSE_TOO_LARGE");
    }
    return JSON.parse(body) as unknown;
  },
};

function sourceUrl(baseUrl: string, path: string): string {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), normalized).toString();
}

function sourcePayload(
  input: unknown,
  configuration: AuthenticatedWardenSourceConfiguration,
  expectedKind:
    | { readonly type: "signal"; readonly signal: WardenSignalId }
    | { readonly type: "dependencies" },
): unknown {
  const envelope = WardenSourceEnvelopeSchema.parse(input);
  if (
    envelope.adapterId !== configuration.adapterId ||
    envelope.sourceId !== configuration.sourceId ||
    envelope.evidenceKind.type !== expectedKind.type ||
    (expectedKind.type === "signal" &&
      (envelope.evidenceKind.type !== "signal" ||
        envelope.evidenceKind.signal !== expectedKind.signal))
  ) {
    throw new Error("WARDEN_SOURCE_IDENTITY_MISMATCH");
  }
  return envelope.payload;
}

export function createAuthenticatedWardenHttpAdapter(
  input: unknown,
  transport: WardenSourceTransport = fetchWardenSourceTransport,
): WardenEvidenceAdapter & { readonly adapterId: string; readonly sourceId: string } {
  const configuration = AuthenticatedWardenSourceConfigurationSchema.parse(input);
  const headers = Object.freeze({
    accept: "application/json",
    authorization: `Bearer ${configuration.bearerToken}`,
    "x-helix-warden-adapter": configuration.adapterId,
    "x-helix-warden-source": configuration.sourceId,
  });
  const request = (path: string) =>
    transport.readJson({
      url: sourceUrl(configuration.baseUrl, path),
      headers,
      timeoutMs: configuration.requestTimeoutMs,
    });
  return Object.freeze({
    id: configuration.sourceId,
    adapterId: configuration.adapterId,
    sourceId: configuration.sourceId,
    async readSignal(signal: WardenSignalId) {
      return sourcePayload(
        await request(`v1/signals/${encodeURIComponent(signal)}`),
        configuration,
        { type: "signal", signal },
      );
    },
    async readDependencies() {
      return sourcePayload(await request("v1/dependencies"), configuration, {
        type: "dependencies",
      });
    },
  });
}

export const WardenAlertCandidateSchema = z
  .object({
    kind: z.literal("warden_alert_candidate"),
    version: z.literal("1.0.0"),
    deduplicationKey: SHA256Schema,
    generatedAt: z.string().datetime(),
    adapterId: IdentifierSchema,
    sourceId: OperationalSourceIdSchema,
    environment: z.enum(["staging", "production"]),
    releaseRef: z.string().trim().min(1).max(240),
    findingId: SHA256Schema,
    code: ReasonCodeSchema,
    severity: z.enum(["critical", "high", "medium", "low", "info"]),
    message: z.string().trim().min(1).max(500),
    deliveryAttempted: z.literal(false),
  })
  .strict();

export type WardenAlertCandidate = z.infer<typeof WardenAlertCandidateSchema>;

export const WardenObservationPersistenceInputSchema = z
  .object({
    runKey: z.string().trim().min(1).max(240),
    adapterId: IdentifierSchema,
    sourceId: OperationalSourceIdSchema,
    snapshot: WardenSnapshotSchema,
    snapshotSha256: SHA256Schema,
    report: WardenReportSchema,
    reportSha256: SHA256Schema,
    alerts: z.array(WardenAlertCandidateSchema).max(1_000),
    alertDeduplicationTtlMs: z
      .number()
      .int()
      .positive()
      .max(30 * 24 * 60 * 60 * 1_000),
    persistedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.snapshotSha256 !== sha256Json(value.snapshot)) {
      context.addIssue({ code: "custom", path: ["snapshotSha256"], message: "Snapshot hash mismatch" });
    }
    if (value.report.snapshotSha256 !== value.snapshotSha256) {
      context.addIssue({
        code: "custom",
        path: ["report", "snapshotSha256"],
        message: "Report is not bound to the persisted snapshot",
      });
    }
    if (value.reportSha256 !== sha256Json(value.report)) {
      context.addIssue({ code: "custom", path: ["reportSha256"], message: "Report hash mismatch" });
    }
    if (
      value.snapshot.environment !== value.report.environment ||
      value.snapshot.releaseRef !== value.report.releaseRef
    ) {
      context.addIssue({
        code: "custom",
        path: ["report"],
        message: "Report identity must match the persisted snapshot",
      });
    }
    for (const [index, alert] of value.alerts.entries()) {
      if (
        alert.adapterId !== value.adapterId ||
        alert.sourceId !== value.sourceId ||
        alert.environment !== value.snapshot.environment ||
        alert.releaseRef !== value.snapshot.releaseRef
      ) {
        context.addIssue({
          code: "custom",
          path: ["alerts", index],
          message: "Alert identity must match the authenticated observation",
        });
      }
    }
  });

export const WardenObservationPersistenceResultSchema = z
  .object({
    kind: z.literal("warden_persisted_observation"),
    version: z.literal("1.0.0"),
    observationId: SHA256Schema,
    snapshotSha256: SHA256Schema,
    reportSha256: SHA256Schema,
    newAlertKeys: z.array(SHA256Schema),
    suppressedAlertKeys: z.array(SHA256Schema),
    alertDeliveryAttempted: z.literal(false),
    automaticApply: z.literal(false),
    automaticPublish: z.literal(false),
    automaticDeploy: z.literal(false),
    automaticRollback: z.literal(false),
  })
  .strict();

export type WardenObservationPersistenceInput = z.infer<
  typeof WardenObservationPersistenceInputSchema
>;
export type WardenObservationPersistenceResult = z.infer<
  typeof WardenObservationPersistenceResultSchema
>;

export interface WardenObservationStore {
  persist(
    input: WardenObservationPersistenceInput,
  ): Promise<WardenObservationPersistenceResult>;
}

type PersistedAlertRow = {
  observation_id: string;
  alert_key: string | null;
  is_new: boolean | null;
};

export function createSqlWardenObservationStore(
  sqlProvider: () => Promise<Sql> = getSql,
): WardenObservationStore {
  return {
    async persist(rawInput) {
      const input = WardenObservationPersistenceInputSchema.parse(rawInput);
      const observationId = sha256Json({
        runKey: input.runKey,
        adapterId: input.adapterId,
        sourceId: input.sourceId,
        snapshotSha256: input.snapshotSha256,
        reportSha256: input.reportSha256,
      });
      const sql = await sqlProvider();
      const rows = await sql.query<PersistedAlertRow>(
        "select * from persist_warden_observation($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9::jsonb, $10, $11)",
        [
          observationId,
          input.runKey,
          input.adapterId,
          input.sourceId,
          JSON.stringify(input.snapshot),
          input.snapshotSha256,
          JSON.stringify(input.report),
          input.reportSha256,
          JSON.stringify(
            input.alerts.map((alert) => ({ alert, alertSha256: sha256Json(alert) })),
          ),
          input.alertDeduplicationTtlMs,
          input.persistedAt,
        ],
      );
      const returnedObservationId = rows[0]?.observation_id ?? observationId;
      if (returnedObservationId !== observationId) {
        throw new Error("WARDEN_PERSISTENCE_IDENTITY_MISMATCH");
      }
      const newAlertKeys: string[] = [];
      const suppressedAlertKeys: string[] = [];
      for (const row of rows) {
        if (!row.alert_key) continue;
        SHA256Schema.parse(row.alert_key);
        (row.is_new ? newAlertKeys : suppressedAlertKeys).push(row.alert_key);
      }
      return WardenObservationPersistenceResultSchema.parse({
        kind: "warden_persisted_observation",
        version: "1.0.0",
        observationId,
        snapshotSha256: input.snapshotSha256,
        reportSha256: input.reportSha256,
        newAlertKeys: [...new Set(newAlertKeys)].sort(),
        suppressedAlertKeys: [...new Set(suppressedAlertKeys)].sort(),
        alertDeliveryAttempted: false,
        automaticApply: false,
        automaticPublish: false,
        automaticDeploy: false,
        automaticRollback: false,
      });
    },
  };
}

export const WardenCycleConfigurationSchema = z
  .object({
    runKey: z.string().trim().min(1).max(240),
    environment: z.enum(["staging", "production"]),
    releaseRef: z.string().trim().min(1).max(240),
    generatedAt: z.string().datetime(),
    policy: WardenPolicySchema,
    alertDeduplicationTtlMs: z
      .number()
      .int()
      .positive()
      .max(30 * 24 * 60 * 60 * 1_000),
  })
  .strict();

function alertCandidates(
  report: WardenReport,
  adapterId: string,
  sourceId: string,
): WardenAlertCandidate[] {
  return report.findings.map((finding) =>
    WardenAlertCandidateSchema.parse({
      kind: "warden_alert_candidate",
      version: "1.0.0",
      deduplicationKey: sha256Json({
        adapterId,
        sourceId,
        environment: report.environment,
        releaseRef: report.releaseRef,
        code: finding.code,
        signal: finding.signal,
      }),
      generatedAt: report.generatedAt,
      adapterId,
      sourceId,
      environment: report.environment,
      releaseRef: report.releaseRef,
      findingId: finding.id,
      code: finding.code,
      severity: finding.severity,
      message: finding.message,
      deliveryAttempted: false,
    }),
  );
}

export async function runWardenCycle(input: {
  configuration: unknown;
  adapter: WardenEvidenceAdapter & { readonly adapterId: string; readonly sourceId: string };
  store: WardenObservationStore;
}) {
  const configuration = WardenCycleConfigurationSchema.parse(input.configuration);
  if (input.adapter.id !== input.adapter.sourceId) {
    throw new Error("WARDEN_ADAPTER_SOURCE_BINDING_INVALID");
  }
  const snapshot = await collectWardenSnapshot(
    {
      environment: configuration.environment,
      releaseRef: configuration.releaseRef,
      generatedAt: configuration.generatedAt,
      policy: configuration.policy,
    },
    input.adapter,
  );
  const report = evaluateWardenSnapshot(snapshot, { now: configuration.generatedAt });
  const snapshotSha256 = sha256Json(snapshot);
  const reportSha256 = sha256Json(report);
  const alerts = alertCandidates(report, input.adapter.adapterId, input.adapter.sourceId);
  const persistence = await input.store.persist({
    runKey: configuration.runKey,
    adapterId: input.adapter.adapterId,
    sourceId: input.adapter.sourceId,
    snapshot,
    snapshotSha256,
    report,
    reportSha256,
    alerts,
    alertDeduplicationTtlMs: configuration.alertDeduplicationTtlMs,
    persistedAt: configuration.generatedAt,
  });
  return Object.freeze({ snapshot, report, alerts, persistence });
}

const WardenRuntimeEnvironmentSchema = z
  .object({
    HELIX_WARDEN_ENABLED: z.enum(["true", "false"]).optional(),
    HELIX_WARDEN_ADAPTER_ID: z.string().optional(),
    HELIX_WARDEN_SOURCE_ID: z.string().optional(),
    HELIX_WARDEN_SOURCE_URL: z.string().optional(),
    HELIX_WARDEN_SOURCE_TOKEN: z.string().optional(),
    HELIX_WARDEN_POLICY_JSON: z.string().optional(),
    HELIX_WARDEN_ALERT_DEDUP_TTL_MS: z.string().optional(),
    CONTEXT: z.string().optional(),
    COMMIT_REF: z.string().optional(),
  })
  .passthrough();

export function resolveWardenRuntimeConfiguration(
  rawEnvironment: Record<string, string | undefined>,
  scheduledFor: string,
) {
  const environment = WardenRuntimeEnvironmentSchema.parse(rawEnvironment);
  if (environment.HELIX_WARDEN_ENABLED !== "true") return null;
  const requiredNames = [
    "HELIX_WARDEN_ADAPTER_ID",
    "HELIX_WARDEN_SOURCE_ID",
    "HELIX_WARDEN_SOURCE_URL",
    "HELIX_WARDEN_SOURCE_TOKEN",
    "HELIX_WARDEN_POLICY_JSON",
    "HELIX_WARDEN_ALERT_DEDUP_TTL_MS",
    "COMMIT_REF",
  ] as const;
  const missing = requiredNames.filter((name) => !environment[name]?.trim());
  if (missing.length) throw new Error(`WARDEN_CONFIGURATION_MISSING:${missing.join(",")}`);
  const generatedAt = z.string().datetime().parse(scheduledFor);
  let policy: unknown;
  try {
    policy = JSON.parse(environment.HELIX_WARDEN_POLICY_JSON as string) as unknown;
  } catch {
    throw new Error("WARDEN_POLICY_JSON_INVALID");
  }
  const source = AuthenticatedWardenSourceConfigurationSchema.parse({
    adapterId: environment.HELIX_WARDEN_ADAPTER_ID,
    sourceId: environment.HELIX_WARDEN_SOURCE_ID,
    baseUrl: environment.HELIX_WARDEN_SOURCE_URL,
    bearerToken: environment.HELIX_WARDEN_SOURCE_TOKEN,
    requestTimeoutMs: 10_000,
  });
  const cycle = WardenCycleConfigurationSchema.parse({
    runKey: sha256Json({
      adapterId: source.adapterId,
      sourceId: source.sourceId,
      releaseRef: environment.COMMIT_REF,
      scheduledFor: generatedAt,
    }),
    environment: environment.CONTEXT === "production" ? "production" : "staging",
    releaseRef: environment.COMMIT_REF,
    generatedAt,
    policy,
    alertDeduplicationTtlMs: Number(environment.HELIX_WARDEN_ALERT_DEDUP_TTL_MS),
  });
  return Object.freeze({ source, cycle });
}

export async function runConfiguredWardenCycle(input: {
  environment: Record<string, string | undefined>;
  scheduledFor: string;
  transport?: WardenSourceTransport;
  store?: WardenObservationStore;
}) {
  const configuration = resolveWardenRuntimeConfiguration(
    input.environment,
    input.scheduledFor,
  );
  if (!configuration) return null;
  const adapter = createAuthenticatedWardenHttpAdapter(
    configuration.source,
    input.transport ?? fetchWardenSourceTransport,
  );
  try {
    return await runWardenCycle({
      configuration: configuration.cycle,
      adapter,
      store: input.store ?? createSqlWardenObservationStore(),
    });
  } catch (error) {
    throw new Error(`WARDEN_CYCLE_FAILED:${redactOperationalDetail(error)}`);
  }
}

export function constantTimeWardenTokenEqual(presented: string, expected: string): boolean {
  const left = Buffer.from(sha256Json({ token: presented }), "hex");
  const right = Buffer.from(sha256Json({ token: expected }), "hex");
  return timingSafeEqual(left, right);
}
