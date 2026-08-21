import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  ProductionRequirementsSchema,
  deriveProductionCapabilityRequirements,
  type ProductionRequirements,
} from "@/lib/production-artifact-graph";
import {
  NimbusInfrastructureDecisionSchema,
  NimbusInfrastructureRequirementsSchema,
  NimbusProviderCandidateSchema,
  decideNimbusInfrastructure,
} from "@/lib/server/operations/nimbus";
import { sha256Json } from "@/lib/server/operations/types";

const SHA256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const IdentifierSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/);
const SecretNameSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/);
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
      message: "Nimbus evidence URL must be HTTPS (or loopback HTTP) without credentials/query/fragment",
    });
  }
});

export const NimbusStageProviderCandidateSchema = NimbusProviderCandidateSchema.extend({
  configurationAdapter: z.literal("netlify"),
}).strict();

const NimbusPlanningEvidenceSchema = z
  .object({
    decisionHorizonEndsAt: z.string().datetime(),
    requiredRegion: IdentifierSchema,
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
  .strict();

export const NimbusDecisionEvidencePayloadSchema = z
  .object({
    kind: z.literal("nimbus_provider_evidence"),
    version: z.literal("1.0.0"),
    sourceId: IdentifierSchema,
    keyId: IdentifierSchema,
    observedAt: z.string().datetime(),
    candidateWorkspaceSha256: SHA256Schema,
    productionRequirementsSha256: SHA256Schema,
    planning: NimbusPlanningEvidenceSchema,
    candidates: z.array(NimbusStageProviderCandidateSchema).min(1).max(50),
  })
  .strict();

export const NimbusDecisionEvidenceEnvelopeSchema = z
  .object({
    payload: NimbusDecisionEvidencePayloadSchema,
    authentication: z
      .object({
        scheme: z.literal("hmac_sha256"),
        signature: SHA256Schema,
      })
      .strict(),
  })
  .strict();

export const NimbusDecisionVerifierConfigurationSchema = z
  .object({
    expectedSourceId: IdentifierSchema,
    expectedKeyId: IdentifierSchema,
    hmacSecret: z.string().min(32).max(4_096),
    maxEvidenceAgeMs: z.number().int().positive().max(30 * 24 * 60 * 60 * 1_000),
    now: z.string().datetime(),
  })
  .strict();

export type NimbusDecisionEvidenceEnvelope = z.infer<
  typeof NimbusDecisionEvidenceEnvelopeSchema
>;
export type NimbusDecisionVerifierConfiguration = z.infer<
  typeof NimbusDecisionVerifierConfigurationSchema
>;
export type NimbusStageDecisionEvidenceInput = Readonly<{
  envelope: NimbusDecisionEvidenceEnvelope;
  verifier: NimbusDecisionVerifierConfiguration;
}>;
export type NimbusDecisionEvidenceProvider = (input: {
  productionRequirements: ProductionRequirements;
  baseWorkspaceSha256: string;
}) => NimbusStageDecisionEvidenceInput | Promise<NimbusStageDecisionEvidenceInput>;

export const NimbusEvidenceSourceConfigurationSchema = z
  .object({
    url: HTTPS_OR_LOOPBACK_URL,
    bearerToken: z.string().min(32).max(4_096),
    expectedSourceId: IdentifierSchema,
    expectedKeyId: IdentifierSchema,
    hmacSecret: z.string().min(32).max(4_096),
    maxEvidenceAgeMs: z.number().int().positive().max(30 * 24 * 60 * 60 * 1_000),
    requestTimeoutMs: z.number().int().positive().max(30_000),
  })
  .strict();

export type NimbusEvidenceRequest = Readonly<{
  url: string;
  headers: Readonly<Record<string, string>>;
  body: string;
  timeoutMs: number;
}>;

/** Injected tests prove this HTTP contract only; they are not provider/quote proof. */
export interface NimbusEvidenceTransport {
  requestJson(input: NimbusEvidenceRequest): Promise<unknown>;
}

export const fetchNimbusEvidenceTransport: NimbusEvidenceTransport = {
  async requestJson(input) {
    const response = await fetch(input.url, {
      method: "POST",
      headers: input.headers,
      body: input.body,
      redirect: "error",
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    if (!response.ok) throw new Error(`NIMBUS_EVIDENCE_HTTP_${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!/^application\/json(?:;|$)/iu.test(contentType)) {
      throw new Error("NIMBUS_EVIDENCE_CONTENT_TYPE_INVALID");
    }
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > 2 * 1024 * 1024) {
      throw new Error("NIMBUS_EVIDENCE_RESPONSE_TOO_LARGE");
    }
    return JSON.parse(body) as unknown;
  },
};

export const VerifiedNimbusStageDecisionSchema = z
  .object({
    kind: z.literal("verified_nimbus_stage_decision"),
    version: z.literal("1.0.0"),
    candidateWorkspaceSha256: SHA256Schema,
    productionRequirementsSha256: SHA256Schema,
    infrastructureRequirementsSha256: SHA256Schema,
    evidenceEnvelopeSha256: SHA256Schema,
    decisionInputSha256: SHA256Schema,
    decisionSha256: SHA256Schema,
    verifiedAt: z.string().datetime(),
    source: z
      .object({
        id: IdentifierSchema,
        keyId: IdentifierSchema,
        authentication: z.literal("hmac_sha256"),
      })
      .strict(),
    configurationAdapter: z.literal("netlify"),
    decision: NimbusInfrastructureDecisionSchema,
    automaticProvisioning: z.literal(false),
    automaticDeployment: z.literal(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.infrastructureRequirementsSha256 !== value.decision.requirementsSha256) {
      context.addIssue({
        code: "custom",
        path: ["decision", "requirementsSha256"],
        message: "Decision does not match the derived infrastructure requirements",
      });
    }
    if (value.decisionSha256 !== sha256Json(value.decision)) {
      context.addIssue({
        code: "custom",
        path: ["decisionSha256"],
        message: "Nimbus decision hash mismatch",
      });
    }
  });

export type VerifiedNimbusStageDecision = z.infer<
  typeof VerifiedNimbusStageDecisionSchema
>;

export class NimbusDecisionEvidenceError extends Error {
  readonly code:
    | "NIMBUS_DECISION_AUTHENTICATION_FAILED"
    | "NIMBUS_DECISION_CANDIDATE_MISMATCH"
    | "NIMBUS_DECISION_EVIDENCE_FROM_FUTURE"
    | "NIMBUS_DECISION_EVIDENCE_STALE"
    | "NIMBUS_DECISION_SOURCE_MISMATCH";

  constructor(code: NimbusDecisionEvidenceError["code"]) {
    super(code);
    this.name = "NimbusDecisionEvidenceError";
    this.code = code;
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function signature(payload: unknown, secret: string): string {
  return createHmac("sha256", secret)
    .update(`helix-nimbus-provider-evidence-v1\n${stableJson(payload)}`, "utf8")
    .digest("hex");
}

export function signNimbusDecisionEvidenceEnvelope(
  rawPayload: unknown,
  hmacSecret: string,
): NimbusDecisionEvidenceEnvelope {
  const payload = NimbusDecisionEvidencePayloadSchema.parse(rawPayload);
  const secret = z.string().min(32).max(4_096).parse(hmacSecret);
  return NimbusDecisionEvidenceEnvelopeSchema.parse({
    payload,
    authentication: { scheme: "hmac_sha256", signature: signature(payload, secret) },
  });
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function deriveNimbusSecretNames(requirements: ProductionRequirements): string[] {
  const capabilities = deriveProductionCapabilityRequirements(requirements);
  const databaseNames = capabilities.database ? ["DATABASE_URL"] : [];
  const storageNames = requirements.storage === "object_storage" ? ["OBJECT_STORAGE_URL"] : [];
  return uniqueSorted([
    ...(capabilities.auth ? ["SESSION_SIGNING_SECRET"] : []),
    ...requirements.integrations.flatMap((integration) => integration.envNames),
  ]).filter((name) => !databaseNames.includes(name) && !storageNames.includes(name));
}

export function nimbusProductionRequirementsSha256(input: unknown): string {
  return sha256Json(ProductionRequirementsSchema.parse(input));
}

export function createAuthenticatedNimbusEvidenceProvider(
  rawConfiguration: unknown,
  transport: NimbusEvidenceTransport = fetchNimbusEvidenceTransport,
): NimbusDecisionEvidenceProvider {
  const configuration = NimbusEvidenceSourceConfigurationSchema.parse(rawConfiguration);
  return async ({ productionRequirements: rawRequirements, baseWorkspaceSha256: rawHash }) => {
    const productionRequirements = ProductionRequirementsSchema.parse(rawRequirements);
    const baseWorkspaceSha256 = SHA256Schema.parse(rawHash);
    const productionRequirementsSha256 =
      nimbusProductionRequirementsSha256(productionRequirements);
    const requestBody = {
      kind: "nimbus_provider_evidence_request",
      version: "1.0.0",
      candidateWorkspaceSha256: baseWorkspaceSha256,
      productionRequirementsSha256,
      requiredCapabilities: {
        runtimeProfile: productionRequirements.runtimeProfile,
        database: deriveProductionCapabilityRequirements(productionRequirements).database,
        storage: productionRequirements.storage,
        cdn: true,
        secretNames: deriveNimbusSecretNames(productionRequirements),
      },
    };
    const envelope = NimbusDecisionEvidenceEnvelopeSchema.parse(
      await transport.requestJson({
        url: configuration.url,
        headers: Object.freeze({
          accept: "application/json",
          authorization: `Bearer ${configuration.bearerToken}`,
          "content-type": "application/json",
          "x-helix-nimbus-source": configuration.expectedSourceId,
          "x-helix-nimbus-key": configuration.expectedKeyId,
        }),
        body: stableJson(requestBody),
        timeoutMs: configuration.requestTimeoutMs,
      }),
    );
    return Object.freeze({
      envelope,
      verifier: {
        expectedSourceId: configuration.expectedSourceId,
        expectedKeyId: configuration.expectedKeyId,
        hmacSecret: configuration.hmacSecret,
        maxEvidenceAgeMs: configuration.maxEvidenceAgeMs,
        now: new Date().toISOString(),
      },
    });
  };
}

export function configuredNimbusEvidenceProvider(
  environment: Readonly<Record<string, string | undefined>>,
  transport: NimbusEvidenceTransport = fetchNimbusEvidenceTransport,
): NimbusDecisionEvidenceProvider | undefined {
  const names = [
    "HELIX_NIMBUS_EVIDENCE_URL",
    "HELIX_NIMBUS_EVIDENCE_TOKEN",
    "HELIX_NIMBUS_EVIDENCE_SOURCE_ID",
    "HELIX_NIMBUS_EVIDENCE_KEY_ID",
    "HELIX_NIMBUS_EVIDENCE_HMAC_SECRET",
    "HELIX_NIMBUS_EVIDENCE_MAX_AGE_MS",
  ] as const;
  const values = Object.fromEntries(names.map((name) => [name, environment[name]?.trim()]));
  const present = names.filter((name) => values[name]);
  if (present.length === 0) return undefined;
  const missing = names.filter((name) => !values[name]);
  if (missing.length > 0) {
    throw new Error(`NIMBUS_EVIDENCE_CONFIGURATION_MISSING:${missing.join(",")}`);
  }
  return createAuthenticatedNimbusEvidenceProvider(
    {
      url: values.HELIX_NIMBUS_EVIDENCE_URL,
      bearerToken: values.HELIX_NIMBUS_EVIDENCE_TOKEN,
      expectedSourceId: values.HELIX_NIMBUS_EVIDENCE_SOURCE_ID,
      expectedKeyId: values.HELIX_NIMBUS_EVIDENCE_KEY_ID,
      hmacSecret: values.HELIX_NIMBUS_EVIDENCE_HMAC_SECRET,
      maxEvidenceAgeMs: Number(values.HELIX_NIMBUS_EVIDENCE_MAX_AGE_MS),
      requestTimeoutMs: 10_000,
    },
    transport,
  );
}

export function deriveNimbusInfrastructureRequirements(input: {
  productionRequirements: unknown;
  baseWorkspaceSha256: string;
  evidencePayload: unknown;
}) {
  const productionRequirements = ProductionRequirementsSchema.parse(input.productionRequirements);
  const workspaceSha256 = SHA256Schema.parse(input.baseWorkspaceSha256);
  const payload = NimbusDecisionEvidencePayloadSchema.parse(input.evidencePayload);
  const capabilities = deriveProductionCapabilityRequirements(productionRequirements);
  return NimbusInfrastructureRequirementsSchema.parse({
    kind: "nimbus_infrastructure_requirements",
    version: "1.0.0",
    projectId: `candidate-${workspaceSha256.slice(0, 24)}`,
    generatedAt: payload.observedAt,
    decisionHorizonEndsAt: payload.planning.decisionHorizonEndsAt,
    requiredRegion: payload.planning.requiredRegion,
    requiredRuntimeId:
      productionRequirements.runtimeProfile === "service_app"
        ? "node_22_serverless_functions"
        : "static_web_delivery",
    database: {
      required: capabilities.database,
      kind: capabilities.database ? "postgresql" : null,
    },
    storage: {
      required: productionRequirements.storage === "object_storage",
      kind: productionRequirements.storage === "object_storage" ? "object_storage" : null,
    },
    cdnRequired: true,
    secretNames: deriveNimbusSecretNames(productionRequirements),
    usage: payload.planning.usage,
    policy: payload.planning.policy,
  });
}

function authenticateEnvelope(
  envelope: NimbusDecisionEvidenceEnvelope,
  verifier: NimbusDecisionVerifierConfiguration,
): void {
  if (
    envelope.payload.sourceId !== verifier.expectedSourceId ||
    envelope.payload.keyId !== verifier.expectedKeyId
  ) {
    throw new NimbusDecisionEvidenceError("NIMBUS_DECISION_SOURCE_MISMATCH");
  }
  const expected = Buffer.from(signature(envelope.payload, verifier.hmacSecret), "hex");
  const presented = Buffer.from(envelope.authentication.signature, "hex");
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    throw new NimbusDecisionEvidenceError("NIMBUS_DECISION_AUTHENTICATION_FAILED");
  }
  const nowMs = Date.parse(verifier.now);
  const observedAtMs = Date.parse(envelope.payload.observedAt);
  if (observedAtMs > nowMs + 5 * 60 * 1_000) {
    throw new NimbusDecisionEvidenceError("NIMBUS_DECISION_EVIDENCE_FROM_FUTURE");
  }
  if (nowMs - observedAtMs > verifier.maxEvidenceAgeMs) {
    throw new NimbusDecisionEvidenceError("NIMBUS_DECISION_EVIDENCE_STALE");
  }
}

export function resolveVerifiedNimbusStageDecision(input: {
  productionRequirements: unknown;
  baseWorkspaceSha256: string;
  evidence: NimbusStageDecisionEvidenceInput;
}): VerifiedNimbusStageDecision {
  const productionRequirements = ProductionRequirementsSchema.parse(input.productionRequirements);
  const baseWorkspaceSha256 = SHA256Schema.parse(input.baseWorkspaceSha256);
  const envelope = NimbusDecisionEvidenceEnvelopeSchema.parse(input.evidence.envelope);
  const verifier = NimbusDecisionVerifierConfigurationSchema.parse(input.evidence.verifier);
  authenticateEnvelope(envelope, verifier);
  const productionRequirementsSha256 = sha256Json(productionRequirements);
  if (
    envelope.payload.candidateWorkspaceSha256 !== baseWorkspaceSha256 ||
    envelope.payload.productionRequirementsSha256 !== productionRequirementsSha256
  ) {
    throw new NimbusDecisionEvidenceError("NIMBUS_DECISION_CANDIDATE_MISMATCH");
  }
  const requirements = deriveNimbusInfrastructureRequirements({
    productionRequirements,
    baseWorkspaceSha256,
    evidencePayload: envelope.payload,
  });
  const candidates = envelope.payload.candidates.map(({ configurationAdapter: _adapter, ...candidate }) =>
    NimbusProviderCandidateSchema.parse(candidate),
  );
  const decisionInput = { requirements, candidates };
  const decision = decideNimbusInfrastructure(decisionInput, { now: verifier.now });
  const selected = envelope.payload.candidates.find(
    (candidate) => candidate.id === decision.provider.id,
  );
  if (!selected) throw new NimbusDecisionEvidenceError("NIMBUS_DECISION_CANDIDATE_MISMATCH");
  return VerifiedNimbusStageDecisionSchema.parse({
    kind: "verified_nimbus_stage_decision",
    version: "1.0.0",
    candidateWorkspaceSha256: baseWorkspaceSha256,
    productionRequirementsSha256,
    infrastructureRequirementsSha256: decision.requirementsSha256,
    evidenceEnvelopeSha256: sha256Json(envelope),
    decisionInputSha256: sha256Json(decisionInput),
    decisionSha256: sha256Json(decision),
    verifiedAt: verifier.now,
    source: {
      id: envelope.payload.sourceId,
      keyId: envelope.payload.keyId,
      authentication: "hmac_sha256",
    },
    configurationAdapter: selected.configurationAdapter,
    decision,
    automaticProvisioning: false,
    automaticDeployment: false,
  });
}

export function nimbusDecisionFailureCode(error: unknown): string {
  if (error instanceof NimbusDecisionEvidenceError) return error.code;
  if (error instanceof Error && error.message === "NIMBUS_NO_ELIGIBLE_PROVIDER") {
    return "NIMBUS_NO_ELIGIBLE_PROVIDER";
  }
  if (error instanceof z.ZodError) return "NIMBUS_DECISION_EVIDENCE_INVALID";
  return "NIMBUS_DECISION_VERIFICATION_FAILED";
}

export const NimbusSecretNameSchema = SecretNameSchema;
