import { z } from "zod";
import {
  WorkspaceCandidateSchema,
  WorkspacePathSchema,
  verifyProductionWorkspaceCandidate,
  type WorkspaceCandidate,
  type WorkspaceFileDescriptor,
} from "@/lib/workspace";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/u;
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_-]{1,79}$/u;
const SENSITIVE_ENV_NAME_PATTERN =
  /(?:^|_)(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_KEY|CREDENTIALS?|DATABASE_URL|SERVICE_JSON)(?:_|$)/u;

export const PRODUCTION_REQUIREMENTS_PATH = "docs/requirements.json";

export const PRODUCTION_STAGE_ORDER = [
  "prism",
  "basalt",
  "key",
  "nexus",
  "vault",
  "quartz",
  "forgeIntegration",
  "nimbus",
] as const;

export const ProductionStageIdSchema = z.enum(PRODUCTION_STAGE_ORDER);
export type ProductionStageId = z.infer<typeof ProductionStageIdSchema>;

const Sha256Schema = z.string().regex(SHA256_PATTERN);
const EnvNameSchema = z.string().regex(ENV_NAME_PATTERN);
const IdentifierSchema = z.string().regex(IDENTIFIER_PATTERN);

type RefinementContext = {
  addIssue(issue: { code: "custom"; message: string; path?: PropertyKey[] }): void;
};

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function assertSortedUnique(
  values: readonly string[],
  context: RefinementContext,
  path: PropertyKey[],
  label: string,
): void {
  const seen = new Set<string>();
  let prior: string | undefined;
  for (const [index, value] of values.entries()) {
    const folded = value.normalize("NFC").toLocaleLowerCase("en-US");
    if (seen.has(folded)) {
      context.addIssue({
        code: "custom",
        path: [...path, index],
        message: `${label} must be unique under NFC/case folding`,
      });
    }
    if (prior !== undefined && compareText(prior, value) >= 0) {
      context.addIssue({
        code: "custom",
        path: [...path, index],
        message: `${label} must be sorted`,
      });
    }
    seen.add(folded);
    prior = value;
  }
}

const SortedPathArraySchema = z
  .array(WorkspacePathSchema)
  .min(1)
  .max(96)
  .superRefine((paths, context) => {
    assertSortedUnique(paths, context, [], "Artifact paths");
  });

const SortedEnvArraySchema = z
  .array(EnvNameSchema)
  .max(64)
  .superRefine((names, context) => {
    assertSortedUnique(names, context, [], "Environment variable names");
  });

const SortedNonEmptyEnvArraySchema = z
  .array(EnvNameSchema)
  .min(1)
  .max(64)
  .superRefine((names, context) => {
    assertSortedUnique(names, context, [], "Environment variable names");
  });

const SortedIdentifierArraySchema = z
  .array(IdentifierSchema)
  .max(64)
  .superRefine((ids, context) => {
    assertSortedUnique(ids, context, [], "Identifiers");
  });

const IntegrationBaseShape = {
  id: IdentifierSchema,
  purpose: z.string().trim().min(1).max(1_000),
} as const;

export const ProductionIntegrationRequirementSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...IntegrationBaseShape,
      kind: z.literal("stripe"),
      execution: z.literal("server"),
      envNames: SortedNonEmptyEnvArraySchema,
      requiresWebhook: z.literal(true),
      requiresIdempotency: z.literal(true),
      requiresLedger: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...IntegrationBaseShape,
      kind: z.literal("google_oauth"),
      execution: z.literal("server"),
      envNames: SortedNonEmptyEnvArraySchema,
      requiresCallback: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...IntegrationBaseShape,
      kind: z.literal("apple_oauth"),
      execution: z.literal("server"),
      envNames: SortedNonEmptyEnvArraySchema,
      requiresCallback: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...IntegrationBaseShape,
      kind: z.literal("email"),
      execution: z.literal("server"),
      envNames: SortedNonEmptyEnvArraySchema,
    })
    .strict(),
  z
    .object({
      ...IntegrationBaseShape,
      kind: z.literal("maps"),
      execution: z.enum(["client", "server"]),
      credentialExposure: z.enum(["public", "secret"]),
      envNames: SortedNonEmptyEnvArraySchema,
    })
    .strict(),
  z
    .object({
      ...IntegrationBaseShape,
      kind: z.literal("custom"),
      execution: z.enum(["client", "server"]),
      credentialExposure: z.enum(["public", "secret"]),
      envNames: SortedEnvArraySchema,
    })
    .strict(),
]);

export const ProductionOperationAccessSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("public") }).strict(),
  z.object({ kind: z.literal("authenticated") }).strict(),
  z
    .object({
      kind: z.literal("roles"),
      roles: z
        .array(IdentifierSchema)
        .min(1)
        .max(32)
        .superRefine((roles, context) => {
          assertSortedUnique(roles, context, [], "Operation roles");
        }),
    })
    .strict(),
  z
    .object({
      kind: z.literal("signed_webhook"),
      integrationId: IdentifierSchema,
    })
    .strict(),
]);

export const ProductionApiOperationSchema = z
  .object({
    operationId: IdentifierSchema,
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    path: z.string().startsWith("/").max(240),
    access: ProductionOperationAccessSchema,
    rateLimitRequired: z.boolean(),
    idempotencyRequired: z.boolean(),
  })
  .strict()
  .superRefine((operation, context) => {
    if (
      operation.method !== "GET" &&
      ["public", "signed_webhook"].includes(operation.access.kind) &&
      !operation.rateLimitRequired
    ) {
      context.addIssue({
        code: "custom",
        path: ["rateLimitRequired"],
        message: "Public mutations and webhooks require an explicit abuse-control rate limit",
      });
    }
    if (operation.method !== "GET" && !operation.idempotencyRequired) {
      context.addIssue({
        code: "custom",
        path: ["idempotencyRequired"],
        message: "Production mutations require an explicit idempotency policy",
      });
    }
  });

const ProductionRequirementsShape = {
  runtimeProfile: z.enum(["static_site", "client_only_app", "service_app"]),
  dataModel: z.enum(["none", "bundled_read_only", "device_local", "server_persistent"]),
  dataSensitivity: z.enum(["public", "device_private", "server_private"]),
  storage: z.enum(["none", "object_storage"]),
  identity: z.enum(["none", "accounts", "roles"]),
  roles: SortedIdentifierArraySchema,
  serverOperations: z.enum(["none", "public", "authenticated"]),
  privilegedOperations: z.boolean(),
  monitoringScope: z.enum(["static_delivery", "client_runtime", "full_stack"]),
  integrations: z.array(ProductionIntegrationRequirementSchema).max(32),
  apiOperations: z.array(ProductionApiOperationSchema).max(128),
} as const;

export const ProductionRequirementsSchema = z
  .object({
    kind: z.literal("helix_production_requirements"),
    schemaVersion: z.literal("1.0.0"),
    contractPath: z.literal(PRODUCTION_REQUIREMENTS_PATH),
    ...ProductionRequirementsShape,
    rationale: z.string().trim().min(1).max(2_000),
    evidencePaths: z.tuple([z.literal("docs/architecture.json"), z.literal("docs/prd.json")]),
  })
  .strict()
  .superRefine((requirements, context) => {
    assertSortedUnique(
      requirements.integrations.map((integration) => integration.id),
      context,
      ["integrations"],
      "Integration ids",
    );
    assertSortedUnique(
      requirements.apiOperations.map((operation) => operation.operationId),
      context,
      ["apiOperations"],
      "API operation ids",
    );

    const routeKeys = new Set<string>();
    for (const [index, operation] of requirements.apiOperations.entries()) {
      const key = `${operation.method} ${operation.path}`;
      if (routeKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["apiOperations", index],
          message: `API method/path pairs must be unique: ${key}`,
        });
      }
      routeKeys.add(key);
    }

    const requiresAuthentication =
      requirements.identity !== "none" ||
      requirements.dataSensitivity === "server_private" ||
      requirements.privilegedOperations ||
      requirements.apiOperations.some((operation) =>
        ["authenticated", "roles"].includes(operation.access.kind),
      );
    const hasServerIntegration = requirements.integrations.some(
      (integration) => integration.execution === "server",
    );
    const hasAuthenticatedOperation = requirements.apiOperations.some((operation) =>
      ["authenticated", "roles"].includes(operation.access.kind),
    );

    if (requirements.identity === "roles" && requirements.roles.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["roles"],
        message: "Role-based identity requires at least one declared role",
      });
    }
    if (requirements.identity !== "roles" && requirements.roles.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["roles"],
        message: "Named roles are allowed only with role-based identity",
      });
    }

    for (const [index, operation] of requirements.apiOperations.entries()) {
      if (operation.access.kind === "roles") {
        for (const role of operation.access.roles) {
          if (!requirements.roles.includes(role)) {
            context.addIssue({
              code: "custom",
              path: ["apiOperations", index, "access", "roles"],
              message: `API operation references an undeclared role: ${role}`,
            });
          }
        }
      }
      if (operation.access.kind === "signed_webhook") {
        const integrationId = operation.access.integrationId;
        const integration = requirements.integrations.find(
          (candidate) => candidate.id === integrationId,
        );
        if (!integration || integration.execution !== "server") {
          context.addIssue({
            code: "custom",
            path: ["apiOperations", index, "access"],
            message: "A signed webhook must reference a declared server integration",
          });
        }
      }
    }

    for (const [index, integration] of requirements.integrations.entries()) {
      const clientCredentialInvalid =
        integration.execution === "client" &&
        (integration.credentialExposure !== "public" ||
          integration.envNames.some(
            (name) =>
              !/^(?:VITE_|PUBLIC_)/u.test(name) || /(?:SECRET|TOKEN|PASSWORD|PRIVATE)/u.test(name),
          ));
      if (clientCredentialInvalid) {
        context.addIssue({
          code: "custom",
          path: ["integrations", index, "envNames"],
          message:
            "Client integrations may reference only explicitly public VITE_ or PUBLIC_ configuration",
        });
      }
      if (integration.kind === "stripe") {
        const requiredStripeEnv = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];
        if (stableJson(integration.envNames) !== stableJson(requiredStripeEnv)) {
          context.addIssue({
            code: "custom",
            path: ["integrations", index, "envNames"],
            message: "Stripe requires the canonical server secret and webhook secret names",
          });
        }
        const webhook = requirements.apiOperations.some(
          (operation) =>
            operation.access.kind === "signed_webhook" &&
            operation.access.integrationId === integration.id &&
            operation.method === "POST",
        );
        if (
          requirements.runtimeProfile !== "service_app" ||
          requirements.dataModel !== "server_persistent" ||
          requirements.identity === "none" ||
          requirements.serverOperations !== "authenticated" ||
          !webhook
        ) {
          context.addIssue({
            code: "custom",
            path: ["integrations", index],
            message:
              "Stripe requires an authenticated service, persistent ledger, and signed idempotent webhook operation",
          });
        }
      }
      if (["google_oauth", "apple_oauth"].includes(integration.kind)) {
        if (
          requirements.runtimeProfile !== "service_app" ||
          requirements.identity === "none" ||
          requirements.serverOperations !== "authenticated"
        ) {
          context.addIssue({
            code: "custom",
            path: ["integrations", index],
            message: "OAuth integrations require server-side identity and authenticated operations",
          });
        }
      }
    }

    if (requirements.runtimeProfile === "static_site") {
      if (
        !["none", "bundled_read_only"].includes(requirements.dataModel) ||
        requirements.dataSensitivity !== "public" ||
        requirements.storage !== "none" ||
        requirements.identity !== "none" ||
        requirements.serverOperations !== "none" ||
        requirements.privilegedOperations ||
        requirements.integrations.length > 0 ||
        requirements.apiOperations.length > 0 ||
        requirements.monitoringScope !== "static_delivery"
      ) {
        context.addIssue({
          code: "custom",
          message:
            "A static_site cannot require identity, mutable/private data, integrations, or server operations",
        });
      }
    }

    if (requirements.runtimeProfile === "client_only_app") {
      if (
        requirements.dataModel === "server_persistent" ||
        !["public", "device_private"].includes(requirements.dataSensitivity) ||
        requirements.storage !== "none" ||
        requirements.identity !== "none" ||
        requirements.serverOperations !== "none" ||
        requirements.privilegedOperations ||
        hasServerIntegration ||
        requirements.apiOperations.length > 0 ||
        requirements.monitoringScope !== "client_runtime"
      ) {
        context.addIssue({
          code: "custom",
          message:
            "A client_only_app cannot require server persistence, identity, private operations, or server integrations",
        });
      }
    }

    if (requirements.runtimeProfile === "service_app") {
      if (
        requirements.serverOperations === "none" ||
        requirements.apiOperations.length === 0 ||
        requirements.monitoringScope !== "full_stack"
      ) {
        context.addIssue({
          code: "custom",
          message: "A service_app requires server operations and full-stack monitoring",
        });
      }
    } else if (
      requirements.dataModel === "server_persistent" ||
      requirements.storage === "object_storage" ||
      requirements.serverOperations !== "none" ||
      hasServerIntegration ||
      requirements.apiOperations.length > 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Server persistence, operations, and integrations require the service_app profile",
      });
    }

    if (
      requiresAuthentication &&
      (requirements.identity === "none" ||
        requirements.serverOperations !== "authenticated" ||
        !hasAuthenticatedOperation)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Accounts, private data, privileged operations, and authenticated routes require identity plus authenticated server operations",
      });
    }
    if (
      requirements.serverOperations === "public" &&
      requirements.apiOperations.some((operation) =>
        ["authenticated", "roles"].includes(operation.access.kind),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["serverOperations"],
        message: "A public serverOperations profile cannot contain authenticated API operations",
      });
    }
    if (requirements.serverOperations === "authenticated" && !hasAuthenticatedOperation) {
      context.addIssue({
        code: "custom",
        path: ["serverOperations"],
        message: "An authenticated serverOperations profile requires a protected API operation",
      });
    }
    if (
      requirements.dataSensitivity === "device_private" &&
      !(
        requirements.runtimeProfile === "client_only_app" &&
        requirements.dataModel === "device_local"
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["dataSensitivity"],
        message: "device_private data is valid only for device-local client-only applications",
      });
    }
    if (
      requirements.dataSensitivity === "server_private" &&
      requirements.apiOperations.some((operation) => operation.access.kind === "public")
    ) {
      context.addIssue({
        code: "custom",
        path: ["apiOperations"],
        message: "Server-private data cannot be exposed through public API operations",
      });
    }
    if (
      requirements.privilegedOperations &&
      !requirements.apiOperations.some((operation) => operation.access.kind === "roles")
    ) {
      context.addIssue({
        code: "custom",
        path: ["privilegedOperations"],
        message: "Privileged operations require at least one role-authorized API operation",
      });
    }
  });

export type ProductionRequirements = z.infer<typeof ProductionRequirementsSchema>;

export const ProductionRequirementSnapshotSchema = z.object(ProductionRequirementsShape).strict();

export type ProductionRequirementSnapshot = z.infer<typeof ProductionRequirementSnapshotSchema>;

export function productionRequirementSnapshot(
  source: ProductionRequirements,
): ProductionRequirementSnapshot {
  const requirements = ProductionRequirementsSchema.parse(source);
  return ProductionRequirementSnapshotSchema.parse({
    runtimeProfile: requirements.runtimeProfile,
    dataModel: requirements.dataModel,
    dataSensitivity: requirements.dataSensitivity,
    storage: requirements.storage,
    identity: requirements.identity,
    roles: requirements.roles,
    serverOperations: requirements.serverOperations,
    privilegedOperations: requirements.privilegedOperations,
    monitoringScope: requirements.monitoringScope,
    integrations: requirements.integrations,
    apiOperations: requirements.apiOperations,
  });
}

export const ProductionPrdEvidenceSchema = z
  .object({
    kind: z.literal("helix_production_prd"),
    schemaVersion: z.literal("1.0.0"),
    title: z.string().trim().min(1).max(240),
    target: z.string().trim().min(1).max(1_000),
    problem: z.string().trim().min(1).max(2_000),
    useCases: z.array(z.string().trim().min(1).max(1_000)).min(1).max(64),
    mvp: z.array(z.string().trim().min(1).max(1_000)).min(1).max(64),
    nonGoals: z.array(z.string().trim().min(1).max(1_000)).max(64),
    userJourneys: z.array(z.string().trim().min(1).max(2_000)).min(1).max(64),
    acceptanceCriteria: z.array(z.string().trim().min(1).max(2_000)).min(1).max(128),
    requirements: ProductionRequirementSnapshotSchema,
  })
  .strict();

export const ProductionArchitectureEvidenceSchema = z
  .object({
    kind: z.literal("helix_production_architecture"),
    schemaVersion: z.literal("1.0.0"),
    productType: z.string().trim().min(1).max(240),
    frontendArchitecture: z.string().trim().min(1).max(2_000),
    backendArchitecture: z.string().trim().min(1).max(2_000),
    dataFlow: z.array(z.string().trim().min(1).max(2_000)).min(1).max(128),
    screenMap: z.array(z.string().trim().min(1).max(1_000)).min(1).max(128),
    routeMap: z.array(z.string().trim().min(1).max(1_000)).min(1).max(128),
    databaseRequirements: z.string().trim().min(1).max(2_000),
    authModel: z.string().trim().min(1).max(2_000),
    deploymentTarget: z.literal("netlify"),
    failureModes: z.array(z.string().trim().min(1).max(2_000)).min(1).max(128),
    requirements: ProductionRequirementSnapshotSchema,
  })
  .strict();

const ArtifactBaseShape = {
  schemaVersion: z.literal("1.0.0"),
  status: z.literal("source_candidate"),
  summary: z.string().trim().min(1).max(1_000),
  outputPaths: SortedPathArraySchema,
  testPaths: SortedPathArraySchema,
  evidencePaths: SortedPathArraySchema,
} as const;

const ForgeBindingSchema = z
  .object({
    id: IdentifierSchema,
    componentPath: WorkspacePathSchema,
    clientPath: WorkspacePathSchema,
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("api"), operationId: IdentifierSchema }).strict(),
      z
        .object({ kind: z.literal("local"), capability: z.string().trim().min(1).max(160) })
        .strict(),
    ]),
    transport: z.enum(["server_fn", "http", "local"]),
    auth: z.enum(["public", "session"]),
    states: z
      .array(z.enum(["idle", "loading", "success", "empty", "error"]))
      .min(3)
      .max(5),
    testPath: WorkspacePathSchema,
  })
  .strict();

export const ForgeIntegrationArtifactSchema = z
  .object({
    ...ArtifactBaseShape,
    kind: z.literal("forge_integration_artifact"),
    contractPath: z.literal("docs/artifacts/forge-integration.json"),
    bindings: z.array(ForgeBindingSchema).min(1).max(64),
  })
  .strict()
  .superRefine((artifact, context) => {
    assertSortedUnique(
      artifact.bindings.map((binding) => binding.id),
      context,
      ["bindings"],
      "Forge binding ids",
    );
    for (const [index, binding] of artifact.bindings.entries()) {
      if (new Set(binding.states).size !== binding.states.length) {
        context.addIssue({
          code: "custom",
          path: ["bindings", index, "states"],
          message: "Forge binding states must be unique",
        });
      }
      for (const requiredState of ["idle", "loading", "success", "error"] as const) {
        if (!binding.states.includes(requiredState)) {
          context.addIssue({
            code: "custom",
            path: ["bindings", index, "states"],
            message: `Forge binding is missing required state: ${requiredState}`,
          });
        }
      }
    }
  });

const PrismTableSchema = z
  .object({
    name: IdentifierSchema,
    sensitivity: z.enum(["public", "owned", "system"]),
    primaryKey: z.string().trim().min(1).max(120),
    ownershipField: z.string().trim().min(1).max(120).nullable(),
    createdAtField: z.string().trim().min(1).max(120),
    updatedAtField: z.string().trim().min(1).max(120),
    foreignKeys: z.array(z.string().trim().min(1).max(240)).max(64),
    indexes: z.array(z.string().trim().min(1).max(240)).max(64),
    constraints: z.array(z.string().trim().min(1).max(240)).min(1).max(64),
  })
  .strict()
  .superRefine((table, context) => {
    if (table.sensitivity === "owned" && table.ownershipField === null) {
      context.addIssue({
        code: "custom",
        path: ["ownershipField"],
        message: "Owned tables require an ownership field",
      });
    }
    if (table.sensitivity !== "owned" && table.ownershipField !== null) {
      context.addIssue({
        code: "custom",
        path: ["ownershipField"],
        message: "Only owned tables may declare an ownership field",
      });
    }
  });

export const PrismArtifactSchema = z
  .object({
    ...ArtifactBaseShape,
    kind: z.literal("prism_database_artifact"),
    contractPath: z.literal("docs/artifacts/prism.json"),
    dialect: z.literal("postgresql"),
    schemaPaths: SortedPathArraySchema,
    migrationPaths: SortedPathArraySchema,
    tables: z.array(PrismTableSchema).min(1).max(64),
    retentionPolicy: z.string().trim().min(1).max(2_000),
    integrityTestPaths: SortedPathArraySchema,
  })
  .strict();

const QuartzQueryReviewSchema = z
  .object({
    id: IdentifierSchema,
    sourcePath: WorkspacePathSchema,
    verdict: z.enum(["accepted", "changes_required"]),
    requiredIndexes: z.array(z.string().trim().min(1).max(240)).max(64),
    risks: z.array(z.string().trim().min(1).max(1_000)).max(64),
    explainEvidence: z.literal("not_run"),
    explainTestPath: WorkspacePathSchema.optional(),
  })
  .strict();

export const QuartzArtifactSchema = z
  .object({
    ...ArtifactBaseShape,
    kind: z.literal("quartz_database_review_artifact"),
    contractPath: z.literal("docs/artifacts/quartz.json"),
    reviewedMigrationPaths: SortedPathArraySchema,
    queryReviews: z.array(QuartzQueryReviewSchema).min(1).max(128),
    backupStrategyPath: WorkspacePathSchema,
    rollbackPath: WorkspacePathSchema,
    migrationSafety: z.string().trim().min(1).max(2_000),
    integrityTestPaths: SortedPathArraySchema,
  })
  .strict();

const BasaltModuleSchema = z
  .object({
    id: IdentifierSchema,
    sourcePath: WorkspacePathSchema,
    responsibilities: z.array(z.string().trim().min(1).max(1_000)).min(1).max(32),
  })
  .strict();

export const BasaltArtifactSchema = z
  .object({
    ...ArtifactBaseShape,
    kind: z.literal("basalt_backend_artifact"),
    contractPath: z.literal("docs/artifacts/basalt.json"),
    runtime: z.literal("tanstack_start_netlify"),
    sourceRoot: WorkspacePathSchema,
    serverEntrypoints: SortedPathArraySchema,
    envSchemaPath: WorkspacePathSchema,
    errorContractPath: WorkspacePathSchema,
    modules: z.array(BasaltModuleSchema).min(1).max(64),
    businessRules: z.array(z.string().trim().min(1).max(1_000)).min(1).max(128),
  })
  .strict();

const KeyPermissionSchema = z
  .object({
    role: IdentifierSchema,
    actions: z.array(IdentifierSchema).min(1).max(64),
  })
  .strict();

export const KeyArtifactSchema = z
  .object({
    ...ArtifactBaseShape,
    kind: z.literal("key_auth_artifact"),
    contractPath: z.literal("docs/artifacts/key.json"),
    provider: z.enum(["better_auth", "custom_adapter"]),
    mock: z.literal(false),
    sessionStrategy: z.enum(["database", "signed_cookie"]),
    requiredEnv: SortedEnvArraySchema,
    sourcePaths: SortedPathArraySchema,
    roles: z.array(IdentifierSchema).min(1).max(32),
    permissions: z.array(KeyPermissionSchema).min(1).max(128),
    protectedRoutes: z.array(z.string().startsWith("/").max(240)).min(1).max(128),
    logoutImplemented: z.literal(true),
    recovery: z.discriminatedUnion("status", [
      z.object({ status: z.literal("implemented"), sourcePath: WorkspacePathSchema }).strict(),
      z
        .object({
          status: z.literal("not_required"),
          rationale: z.string().trim().min(1).max(1_000),
        })
        .strict(),
    ]),
  })
  .strict();

const VaultRouteSchema = z
  .object({
    operationId: IdentifierSchema,
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    path: z.string().startsWith("/").max(240),
    sourcePath: WorkspacePathSchema,
    requestSchemaPath: WorkspacePathSchema.optional(),
    responseSchemaPath: WorkspacePathSchema,
    access: ProductionOperationAccessSchema,
    businessRules: z.array(z.string().trim().min(1).max(1_000)).min(1).max(64),
    errorCodes: z
      .array(z.string().regex(/^[A-Z][A-Z0-9_]{2,79}$/u))
      .min(1)
      .max(64),
    rateLimitPolicyId: IdentifierSchema.nullable(),
    idempotencyKey: z.string().trim().min(1).max(240).nullable(),
    testPaths: SortedPathArraySchema,
  })
  .strict();

export const VaultArtifactSchema = z
  .object({
    ...ArtifactBaseShape,
    kind: z.literal("vault_api_artifact"),
    contractPath: z.literal("docs/artifacts/vault.json"),
    routes: z.array(VaultRouteSchema).min(1).max(128),
  })
  .strict()
  .superRefine((artifact, context) => {
    assertSortedUnique(
      artifact.routes.map((route) => route.operationId),
      context,
      ["routes"],
      "Vault operation ids",
    );
  });

const NexusRetrySchema = z
  .object({
    maxAttempts: z.number().int().min(1).max(10),
    baseDelayMs: z.number().int().min(10).max(60_000),
    maxDelayMs: z.number().int().min(10).max(300_000),
  })
  .strict()
  .refine((retry) => retry.maxDelayMs >= retry.baseDelayMs, {
    message: "Retry maxDelayMs must be greater than or equal to baseDelayMs",
  });

const NexusWebhookSchema = z
  .object({
    route: z.string().startsWith("/").max(240),
    handlerPath: WorkspacePathSchema,
    signatureVerified: z.literal(true),
    idempotencyKey: z.string().trim().min(1).max(240),
    testPath: WorkspacePathSchema,
  })
  .strict();

const NexusIntegrationSchema = z
  .object({
    id: IdentifierSchema,
    kind: z.enum(["stripe", "google_oauth", "apple_oauth", "email", "maps", "custom"]),
    execution: z.enum(["client", "server"]),
    adapterPath: WorkspacePathSchema,
    envSchemaPath: WorkspacePathSchema,
    requiredEnv: SortedEnvArraySchema,
    connectionTestPath: WorkspacePathSchema,
    retry: NexusRetrySchema,
    errorMapPath: WorkspacePathSchema,
    webhooks: z.array(NexusWebhookSchema).max(32),
  })
  .strict();

export const NexusArtifactSchema = z
  .object({
    ...ArtifactBaseShape,
    kind: z.literal("nexus_integrations_artifact"),
    contractPath: z.literal("docs/artifacts/nexus.json"),
    integrations: z.array(NexusIntegrationSchema).min(1).max(32),
  })
  .strict()
  .superRefine((artifact, context) => {
    assertSortedUnique(
      artifact.integrations.map((integration) => integration.id),
      context,
      ["integrations"],
      "Nexus integration ids",
    );
  });

export const NimbusArtifactSchema = z
  .object({
    ...ArtifactBaseShape,
    kind: z.literal("nimbus_infrastructure_artifact"),
    contractPath: z.literal("docs/artifacts/nimbus.json"),
    provider: z.literal("netlify"),
    runtime: z.literal("tanstack_start"),
    rationale: z.string().trim().min(1).max(2_000),
    configPaths: SortedPathArraySchema,
    monitoringPaths: SortedPathArraySchema,
    database: z.object({ required: z.boolean(), bindingNames: SortedEnvArraySchema }).strict(),
    storage: z.object({ required: z.boolean(), bindingNames: SortedEnvArraySchema }).strict(),
    cdn: z.object({ enabled: z.boolean(), policyPath: WorkspacePathSchema.optional() }).strict(),
    secretNames: SortedEnvArraySchema,
    costEstimate: z
      .object({
        evidence: z.literal("estimated"),
        currency: z.literal("EUR"),
        monthlyMin: z.number().nonnegative().finite(),
        monthlyMax: z.number().nonnegative().finite(),
        confidence: z.number().min(0).max(1),
        assumptions: z.array(z.string().trim().min(1).max(1_000)).min(1).max(32),
      })
      .strict()
      .refine((estimate) => estimate.monthlyMax >= estimate.monthlyMin, {
        message: "Cost estimate maximum must be greater than or equal to its minimum",
      }),
  })
  .strict();

export type ForgeIntegrationArtifact = z.infer<typeof ForgeIntegrationArtifactSchema>;
export type PrismArtifact = z.infer<typeof PrismArtifactSchema>;
export type QuartzArtifact = z.infer<typeof QuartzArtifactSchema>;
export type BasaltArtifact = z.infer<typeof BasaltArtifactSchema>;
export type KeyArtifact = z.infer<typeof KeyArtifactSchema>;
export type VaultArtifact = z.infer<typeof VaultArtifactSchema>;
export type NexusArtifact = z.infer<typeof NexusArtifactSchema>;
export type NimbusArtifact = z.infer<typeof NimbusArtifactSchema>;

export const ProductionArtifactBundleSchema = z
  .object({
    prism: PrismArtifactSchema.nullable(),
    quartz: QuartzArtifactSchema.nullable(),
    basalt: BasaltArtifactSchema.nullable(),
    key: KeyArtifactSchema.nullable(),
    vault: VaultArtifactSchema.nullable(),
    nexus: NexusArtifactSchema.nullable(),
    forgeIntegration: ForgeIntegrationArtifactSchema.nullable(),
    nimbus: NimbusArtifactSchema.nullable(),
  })
  .strict();

export type ProductionArtifactBundle = z.infer<typeof ProductionArtifactBundleSchema>;

const ContractMetadataSchema = z
  .object({
    id: ProductionStageIdSchema,
    version: z.literal("1.0.0"),
    activation: z.literal("disabled_contract_only"),
    producerKind: z.enum(["planned_ai_agent", "planned_review_agent"]),
    role: z.string().trim().min(1).max(1_000),
    artifact: z.string().trim().min(1).max(160),
    possibleDependencies: z.array(ProductionStageIdSchema).max(8),
    validationExecutor: z.literal("workspace_runner"),
  })
  .strict();

export const PRODUCTION_ARTIFACT_CONTRACTS = {
  prism: ContractMetadataSchema.parse({
    id: "prism",
    version: "1.0.0",
    activation: "disabled_contract_only",
    producerKind: "planned_ai_agent",
    role: "Materialize a PostgreSQL schema, ordered migrations, ownership, constraints, indexes, timestamps, retention, and integrity tests.",
    artifact: "prism_database_artifact",
    possibleDependencies: [],
    validationExecutor: "workspace_runner",
  }),
  quartz: ContractMetadataSchema.parse({
    id: "quartz",
    version: "1.0.0",
    activation: "disabled_contract_only",
    producerKind: "planned_review_agent",
    role: "Review migrations, queries, indexes, rollback, backup, and integrity without claiming that EXPLAIN was measured.",
    artifact: "quartz_database_review_artifact",
    possibleDependencies: ["prism", "vault"],
    validationExecutor: "workspace_runner",
  }),
  basalt: ContractMetadataSchema.parse({
    id: "basalt",
    version: "1.0.0",
    activation: "disabled_contract_only",
    producerKind: "planned_ai_agent",
    role: "Materialize the server foundation, runtime boundaries, environment schema, business rules, and error contract.",
    artifact: "basalt_backend_artifact",
    possibleDependencies: ["prism"],
    validationExecutor: "workspace_runner",
  }),
  key: ContractMetadataSchema.parse({
    id: "key",
    version: "1.0.0",
    activation: "disabled_contract_only",
    producerKind: "planned_ai_agent",
    role: "Materialize non-mock sessions, roles, permissions, protected routes, logout, and recovery policy.",
    artifact: "key_auth_artifact",
    possibleDependencies: ["prism", "basalt"],
    validationExecutor: "workspace_runner",
  }),
  vault: ContractMetadataSchema.parse({
    id: "vault",
    version: "1.0.0",
    activation: "disabled_contract_only",
    producerKind: "planned_ai_agent",
    role: "Materialize API routes, schemas, authorization, business rules, errors, rate limits, and tests.",
    artifact: "vault_api_artifact",
    possibleDependencies: ["prism", "basalt", "key", "nexus"],
    validationExecutor: "workspace_runner",
  }),
  nexus: ContractMetadataSchema.parse({
    id: "nexus",
    version: "1.0.0",
    activation: "disabled_contract_only",
    producerKind: "planned_ai_agent",
    role: "Materialize adapters, environment contracts, connection tests, verified webhooks, retries, and error maps.",
    artifact: "nexus_integrations_artifact",
    possibleDependencies: ["prism", "basalt", "key"],
    validationExecutor: "workspace_runner",
  }),
  forgeIntegration: ContractMetadataSchema.parse({
    id: "forgeIntegration",
    version: "1.0.0",
    activation: "disabled_contract_only",
    producerKind: "planned_ai_agent",
    role: "Bind the multi-file frontend to local state, API, persistence, auth, and adapters with explicit UI states and tests.",
    artifact: "forge_integration_artifact",
    possibleDependencies: ["prism", "key", "vault", "nexus"],
    validationExecutor: "workspace_runner",
  }),
  nimbus: ContractMetadataSchema.parse({
    id: "nimbus",
    version: "1.0.0",
    activation: "disabled_contract_only",
    producerKind: "planned_ai_agent",
    role: "Materialize a motivated Netlify runtime, bindings, monitoring, CDN policy, deploy configuration, and estimated cost range.",
    artifact: "nimbus_infrastructure_artifact",
    possibleDependencies: [
      "prism",
      "quartz",
      "basalt",
      "key",
      "vault",
      "nexus",
      "forgeIntegration",
    ],
    validationExecutor: "workspace_runner",
  }),
} as const;

export type ProductionCapabilityRequirements = Readonly<{
  frontend: true;
  backend: boolean;
  api: boolean;
  database: boolean;
  auth: boolean;
  integrations: boolean;
  tests: true;
  deployment: true;
  monitoring: true;
}>;

export function deriveProductionCapabilityRequirements(
  source: unknown,
): ProductionCapabilityRequirements {
  const requirements = ProductionRequirementsSchema.parse(source);
  const auth =
    requirements.identity !== "none" ||
    requirements.dataSensitivity === "server_private" ||
    requirements.privilegedOperations ||
    requirements.apiOperations.some((operation) =>
      ["authenticated", "roles"].includes(operation.access.kind),
    );
  return {
    frontend: true,
    backend: requirements.runtimeProfile === "service_app",
    api: requirements.runtimeProfile === "service_app",
    database: requirements.dataModel === "server_persistent",
    auth,
    integrations: requirements.integrations.length > 0,
    tests: true,
    deployment: true,
    monitoring: true,
  };
}

function requiredStages(requirements: ProductionRequirements): Record<ProductionStageId, boolean> {
  const capabilities = deriveProductionCapabilityRequirements(requirements);
  return {
    prism: capabilities.database,
    quartz: capabilities.database,
    basalt: capabilities.backend,
    key: capabilities.auth,
    vault: capabilities.api,
    nexus: capabilities.integrations,
    forgeIntegration: requirements.runtimeProfile !== "static_site",
    nimbus: true,
  };
}

const HashedPathSchema = z
  .object({
    path: WorkspacePathSchema,
    role: z.string().trim().min(1).max(80),
    sha256: Sha256Schema,
  })
  .strict();

const ProductionDependencyRefSchema = z
  .object({
    id: ProductionStageIdSchema,
    artifactSha256: Sha256Schema,
  })
  .strict();

export const ProductionArtifactNodeSchema = z
  .object({
    id: ProductionStageIdSchema,
    contractVersion: z.literal("1.0.0"),
    producerKind: z.enum(["planned_ai_agent", "planned_review_agent"]),
    required: z.boolean(),
    status: z.enum(["structurally_present", "not_required", "not_configured", "blocked"]),
    evidence: z.literal("structural"),
    runtimeExecution: z.literal("not_run"),
    reason: z.string().trim().min(1).max(2_000),
    dependencies: z.array(ProductionDependencyRefSchema).max(8),
    contractPath: WorkspacePathSchema.nullable(),
    artifactSha256: Sha256Schema.nullable(),
    files: z.array(HashedPathSchema).min(1).max(256),
  })
  .strict()
  .superRefine((node, context) => {
    assertSortedUnique(
      node.dependencies.map((dependency) => dependency.id),
      context,
      ["dependencies"],
      "Node dependencies",
    );
    assertSortedUnique(
      node.files.map((file) => file.path),
      context,
      ["files"],
      "Node file evidence",
    );
    if (node.dependencies.some((dependency) => dependency.id === node.id)) {
      context.addIssue({
        code: "custom",
        path: ["dependencies"],
        message: "A node cannot depend on itself",
      });
    }
    if (node.status === "not_required") {
      if (node.required || node.contractPath !== null || node.artifactSha256 !== null) {
        context.addIssue({
          code: "custom",
          message: "A not_required node cannot claim a required or structurally present artifact",
        });
      }
    } else if (!node.required || node.contractPath === null || node.artifactSha256 === null) {
      context.addIssue({
        code: "custom",
        message: "A required source node must reference its structurally present contract",
      });
    }
  });

export type ProductionArtifactNode = z.infer<typeof ProductionArtifactNodeSchema>;

export const ProductionConfigurationInventorySchema = z
  .object({
    evidence: z.literal("server_name_presence_only"),
    configuredEnvNames: SortedEnvArraySchema,
  })
  .strict();

export type ProductionConfigurationInventory = z.infer<
  typeof ProductionConfigurationInventorySchema
>;

export const ProductionFileOwnerSchema = z.enum([
  "helix",
  "nova",
  "atlas",
  "forgeUi",
  "forgeLogic",
  "kiln",
  "folio",
  "archive",
  "score",
  "prism",
  "basalt",
  "key",
  "nexus",
  "vault",
  "quartz",
  "forgeIntegration",
  "nimbus",
]);
export type ProductionFileOwner = z.infer<typeof ProductionFileOwnerSchema>;

const ProductionFileProvenanceSchema = z
  .object({
    path: WorkspacePathSchema,
    owner: ProductionFileOwnerSchema,
  })
  .strict();

export const ProductionProvenanceArtifactSchema = z
  .object({
    kind: z.literal("helix_production_file_provenance"),
    schemaVersion: z.literal("1.0.0"),
    contractPath: z.literal("docs/artifacts/provenance.json"),
    files: z.array(ProductionFileProvenanceSchema).min(1).max(256),
  })
  .strict()
  .superRefine((provenance, context) => {
    assertSortedUnique(
      provenance.files.map((file) => file.path),
      context,
      ["files"],
      "Provenance paths",
    );
  });

export type ProductionProvenanceArtifact = z.infer<typeof ProductionProvenanceArtifactSchema>;

const GraphShape = z
  .object({
    kind: z.literal("helix_production_source_graph"),
    schemaVersion: z.literal("1.0.0"),
    jobId: z.string().trim().min(1).max(200),
    projectId: z.string().trim().min(1).max(200).optional(),
    pipelineVersion: z.string().trim().min(1).max(120),
    candidateSha256: Sha256Schema,
    requirements: ProductionRequirementsSchema,
    configuration: ProductionConfigurationInventorySchema,
    provenance: ProductionProvenanceArtifactSchema,
    artifacts: ProductionArtifactBundleSchema,
    nodes: z.array(ProductionArtifactNodeSchema).length(PRODUCTION_STAGE_ORDER.length),
    graphSha256: Sha256Schema,
  })
  .strict();

export const ProductionArtifactGraphSchema = GraphShape.superRefine((graph, context) => {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  if (nodes.size !== PRODUCTION_STAGE_ORDER.length) {
    context.addIssue({
      code: "custom",
      path: ["nodes"],
      message: "Production graph node ids must be unique",
    });
  }
  if (graph.nodes.some((node, index) => node.id !== PRODUCTION_STAGE_ORDER[index])) {
    context.addIssue({
      code: "custom",
      path: ["nodes"],
      message: "Production graph nodes must use the canonical topological order",
    });
  }
  for (const [index, node] of graph.nodes.entries()) {
    for (const dependency of node.dependencies) {
      const dependencyIndex = PRODUCTION_STAGE_ORDER.indexOf(dependency.id);
      const upstream = nodes.get(dependency.id);
      if (!upstream || dependencyIndex < 0 || dependencyIndex >= index) {
        context.addIssue({
          code: "custom",
          path: ["nodes", index, "dependencies"],
          message: `Dependency must reference an earlier graph node: ${dependency.id}`,
        });
      } else if (upstream.artifactSha256 !== dependency.artifactSha256) {
        context.addIssue({
          code: "custom",
          path: ["nodes", index, "dependencies"],
          message: `Dependency hash does not match its upstream artifact: ${dependency.id}`,
        });
      }
    }
  }
});

export type ProductionArtifactGraph = z.infer<typeof ProductionArtifactGraphSchema>;

export type ProductionGraphVerification = {
  valid: boolean;
  errors: string[];
  graphSha256?: string;
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => compareText(left, right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalProductionContractFile(value: unknown): string {
  return `${stableJson(value)}\n`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function descriptorMap(candidate: WorkspaceCandidate): Map<string, WorkspaceFileDescriptor> {
  return new Map(candidate.files.map((descriptor) => [descriptor.path, descriptor]));
}

function envExampleNames(contents: string): Set<string> {
  const names = new Set<string>();
  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/u);
    if (match?.[1]) {
      if (names.has(match[1])) {
        throw new Error(`.env.example contains a duplicate environment name: ${match[1]}`);
      }
      const value = match[2] ?? "";
      const isEmpty = value === "" || value === '""' || value === "''";
      if (SENSITIVE_ENV_NAME_PATTERN.test(match[1]) && !isEmpty) {
        throw new Error(`.env.example must not contain a configured sensitive value: ${match[1]}`);
      }
      names.add(match[1]);
    }
  }
  return names;
}

type AnyProductionArtifact = Exclude<ProductionArtifactBundle[ProductionStageId], null>;

function artifactPaths(artifact: AnyProductionArtifact): string[] {
  return [
    artifact.contractPath,
    ...artifact.outputPaths,
    ...artifact.testPaths,
    ...artifact.evidencePaths,
  ];
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function dependenciesFor(
  id: ProductionStageId,
  required: Readonly<Record<ProductionStageId, boolean>>,
): ProductionStageId[] {
  const potential: Readonly<Record<ProductionStageId, readonly ProductionStageId[]>> = {
    prism: [],
    basalt: ["prism"],
    key: ["prism", "basalt"],
    nexus: ["prism", "basalt", "key"],
    vault: ["prism", "basalt", "key", "nexus"],
    quartz: ["prism", "vault"],
    forgeIntegration: ["prism", "key", "vault", "nexus"],
    nimbus: ["prism", "quartz", "basalt", "key", "vault", "nexus", "forgeIntegration"],
  };
  return potential[id].filter((dependency) => required[dependency]).sort(compareText);
}

function collectReferencedPaths(artifact: AnyProductionArtifact): string[] {
  const paths = artifactPaths(artifact);
  switch (artifact.kind) {
    case "forge_integration_artifact":
      for (const binding of artifact.bindings) {
        paths.push(binding.componentPath, binding.clientPath, binding.testPath);
      }
      break;
    case "prism_database_artifact":
      paths.push(
        ...artifact.schemaPaths,
        ...artifact.migrationPaths,
        ...artifact.integrityTestPaths,
      );
      break;
    case "quartz_database_review_artifact":
      paths.push(
        ...artifact.reviewedMigrationPaths,
        artifact.backupStrategyPath,
        artifact.rollbackPath,
        ...artifact.integrityTestPaths,
      );
      for (const review of artifact.queryReviews) {
        paths.push(review.sourcePath);
        if (review.explainTestPath) paths.push(review.explainTestPath);
      }
      break;
    case "basalt_backend_artifact":
      paths.push(
        artifact.sourceRoot,
        ...artifact.serverEntrypoints,
        artifact.envSchemaPath,
        artifact.errorContractPath,
        ...artifact.modules.map((module) => module.sourcePath),
      );
      break;
    case "key_auth_artifact":
      paths.push(...artifact.sourcePaths);
      if (artifact.recovery.status === "implemented") paths.push(artifact.recovery.sourcePath);
      break;
    case "vault_api_artifact":
      for (const route of artifact.routes) {
        paths.push(route.sourcePath, route.responseSchemaPath, ...route.testPaths);
        if (route.requestSchemaPath) paths.push(route.requestSchemaPath);
      }
      break;
    case "nexus_integrations_artifact":
      for (const integration of artifact.integrations) {
        paths.push(
          integration.adapterPath,
          integration.envSchemaPath,
          integration.connectionTestPath,
          integration.errorMapPath,
        );
        for (const webhook of integration.webhooks) {
          paths.push(webhook.handlerPath, webhook.testPath);
        }
      }
      break;
    case "nimbus_infrastructure_artifact":
      paths.push(...artifact.configPaths, ...artifact.monitoringPaths);
      if (artifact.cdn.policyPath) paths.push(artifact.cdn.policyPath);
      break;
  }
  return uniqueSorted(paths);
}

function requiredEnvironmentForArtifact(artifact: AnyProductionArtifact): string[] {
  switch (artifact.kind) {
    case "key_auth_artifact":
      return artifact.requiredEnv;
    case "nexus_integrations_artifact":
      return uniqueSorted(artifact.integrations.flatMap((integration) => integration.requiredEnv));
    case "nimbus_infrastructure_artifact":
      return uniqueSorted([
        ...artifact.database.bindingNames,
        ...artifact.storage.bindingNames,
        ...artifact.secretNames,
      ]);
    default:
      return [];
  }
}

function graphHashPayload(graph: Omit<ProductionArtifactGraph, "graphSha256">): string {
  return `helix-production-source-graph-v1\n${stableJson(graph)}`;
}

function unsignedGraph(
  graph: ProductionArtifactGraph,
): Omit<ProductionArtifactGraph, "graphSha256"> {
  const { graphSha256: _graphSha256, ...unsigned } = graph;
  return unsigned;
}

function productionGraphErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "graph";
    return `${path}: ${issue.message}`;
  });
}

function assertContractMatchesCandidate(
  candidateFiles: Readonly<Record<string, string>>,
  descriptors: ReadonlyMap<string, WorkspaceFileDescriptor>,
  contractPath: string,
  contract: unknown,
): Promise<void> {
  const descriptor = descriptors.get(contractPath);
  const contents = candidateFiles[contractPath];
  if (!descriptor || contents === undefined) {
    throw new Error(`Production contract file is missing: ${contractPath}`);
  }
  const expected = canonicalProductionContractFile(contract);
  if (contents !== expected) {
    throw new Error(`Production contract file is not canonical: ${contractPath}`);
  }
  return sha256Hex(expected).then((hash) => {
    if (hash !== descriptor.sha256) {
      throw new Error(`Production contract hash does not match candidate: ${contractPath}`);
    }
  });
}

function assertPathsExist(
  descriptors: ReadonlyMap<string, WorkspaceFileDescriptor>,
  paths: readonly string[],
  label: string,
): void {
  for (const path of paths) {
    if (!descriptors.has(path)) {
      throw new Error(`${label} references a file outside the candidate: ${path}`);
    }
  }
}

function assertEnvNamesDeclared(
  availableEnvNames: ReadonlySet<string>,
  names: readonly string[],
  label: string,
): void {
  for (const name of names) {
    if (!availableEnvNames.has(name)) {
      throw new Error(`${label} references an environment name missing from .env.example: ${name}`);
    }
  }
}

function assertProductionProvenance(
  candidate: WorkspaceCandidate,
  provenance: ProductionProvenanceArtifact,
  artifacts: ProductionArtifactBundle,
): void {
  const candidatePaths = candidate.files.map((file) => file.path);
  const provenancePaths = provenance.files.map((file) => file.path);
  if (stableJson(candidatePaths) !== stableJson(provenancePaths)) {
    throw new Error("Production provenance must cover every candidate file exactly once");
  }
  const ownerByPath = new Map(provenance.files.map((file) => [file.path, file.owner]));
  const descriptorByPath = descriptorMap(candidate);
  const allowedRoles: Readonly<Record<ProductionFileOwner, readonly string[]>> = {
    helix: ["configuration"],
    nova: ["prd"],
    atlas: ["architecture", "configuration", "migration"],
    forgeUi: ["entrypoint", "source", "asset"],
    forgeLogic: ["source"],
    kiln: ["test"],
    folio: ["readme", "documentation"],
    archive: ["decision", "documentation"],
    score: ["score"],
    prism: ["configuration", "source", "migration", "documentation"],
    basalt: ["configuration", "source"],
    key: ["configuration", "source"],
    nexus: ["configuration", "source"],
    vault: ["configuration", "source"],
    quartz: ["configuration", "documentation", "source"],
    forgeIntegration: ["configuration", "source"],
    nimbus: ["configuration", "deployment", "environment", "source", "documentation"],
  };
  for (const item of provenance.files) {
    const descriptor = descriptorByPath.get(item.path);
    if (!descriptor || !allowedRoles[item.owner].includes(descriptor.role)) {
      throw new Error(`Production provenance owner/role mismatch: ${item.path} -> ${item.owner}`);
    }
  }

  const exactOwners: Record<string, ProductionFileOwner> = {
    [provenance.contractPath]: "helix",
    [PRODUCTION_REQUIREMENTS_PATH]: "atlas",
    "docs/prd.json": "nova",
    "docs/architecture.json": "atlas",
    ".env.example": "nimbus",
    "package.json": "helix",
    "package-lock.json": "helix",
  };
  for (const descriptor of candidate.files) {
    if (descriptor.role === "entrypoint") exactOwners[descriptor.path] = "forgeUi";
    if (descriptor.role === "test") exactOwners[descriptor.path] = "kiln";
    if (descriptor.role === "readme") exactOwners[descriptor.path] = "folio";
    if (descriptor.role === "decision") exactOwners[descriptor.path] = "archive";
    if (descriptor.role === "score") exactOwners[descriptor.path] = "score";
    if (descriptor.role === "environment") exactOwners[descriptor.path] = "nimbus";
    if (descriptor.role === "deployment") exactOwners[descriptor.path] = "nimbus";
  }
  for (const [id, artifact] of Object.entries(artifacts) as Array<
    [ProductionStageId, AnyProductionArtifact | null]
  >) {
    if (!artifact) continue;
    exactOwners[artifact.contractPath] = id;
    for (const path of artifact.outputPaths) exactOwners[path] = id;
    for (const path of artifact.testPaths) exactOwners[path] = "kiln";
  }
  for (const item of provenance.files) {
    if (!PRODUCTION_STAGE_ORDER.includes(item.owner as ProductionStageId)) continue;
    const stageId = item.owner as ProductionStageId;
    const artifact = artifacts[stageId];
    const ownedByContract = artifact
      ? new Set([artifact.contractPath, ...artifact.outputPaths])
      : undefined;
    if (!ownedByContract?.has(item.path)) {
      throw new Error(
        `Production provenance assigns an undeclared stage output: ${item.path} -> ${stageId}`,
      );
    }
  }
  for (const [path, expectedOwner] of Object.entries(exactOwners)) {
    if (!descriptorByPath.has(path)) continue;
    if (ownerByPath.get(path) !== expectedOwner) {
      throw new Error(`Production provenance has the wrong owner: ${path} -> ${expectedOwner}`);
    }
  }
}

function assertPathsAreOwned(
  ownedPaths: readonly string[],
  referencedPaths: readonly string[],
  label: string,
): void {
  const owned = new Set(ownedPaths);
  for (const path of referencedPaths) {
    if (!owned.has(path)) {
      throw new Error(`${label} must own its implementation path: ${path}`);
    }
  }
}

function assertPathsHaveRole(
  descriptors: ReadonlyMap<string, WorkspaceFileDescriptor>,
  paths: readonly string[],
  roles: readonly string[],
  label: string,
): void {
  for (const path of paths) {
    const descriptor = descriptors.get(path);
    if (!descriptor || !roles.includes(descriptor.role)) {
      throw new Error(`${label} has an invalid workspace role: ${path}`);
    }
  }
}

function assertArtifactRelationships(
  requirements: ProductionRequirements,
  artifacts: ProductionArtifactBundle,
  availableEnvNames: ReadonlySet<string>,
  descriptors: ReadonlyMap<string, WorkspaceFileDescriptor>,
): void {
  const capabilities = deriveProductionCapabilityRequirements(requirements);
  const prism = artifacts.prism;
  const quartz = artifacts.quartz;
  const basalt = artifacts.basalt;
  const key = artifacts.key;
  const vault = artifacts.vault;
  const nexus = artifacts.nexus;
  const forge = artifacts.forgeIntegration;
  const nimbus = artifacts.nimbus;

  for (const [id, artifact] of Object.entries(artifacts)) {
    if (!artifact) continue;
    const overlap = artifact.outputPaths.filter((path) => artifact.testPaths.includes(path));
    if (overlap.length > 0) {
      throw new Error(`${id} cannot own the same path as source and test: ${overlap[0]}`);
    }
    assertPathsHaveRole(descriptors, artifact.testPaths, ["test"], `${id} testPaths`);
  }

  if (prism) {
    if (
      requirements.dataSensitivity === "server_private" &&
      !prism.tables.some((table) => table.sensitivity === "owned")
    ) {
      throw new Error("Prism must declare an owned table for server-private data");
    }
    assertPathsAreOwned(
      prism.outputPaths,
      [...prism.schemaPaths, ...prism.migrationPaths],
      "Prism",
    );
    assertPathsHaveRole(descriptors, prism.migrationPaths, ["migration"], "Prism migrations");
    assertPathsAreOwned(prism.testPaths, prism.integrityTestPaths, "Prism tests");
  }
  if (prism && quartz) {
    if (stableJson(quartz.reviewedMigrationPaths) !== stableJson(prism.migrationPaths)) {
      throw new Error("Quartz must review every exact Prism migration path");
    }
    assertPathsAreOwned(
      quartz.outputPaths,
      [quartz.backupStrategyPath, quartz.rollbackPath],
      "Quartz",
    );
    assertPathsAreOwned(quartz.testPaths, quartz.integrityTestPaths, "Quartz tests");
    for (const review of quartz.queryReviews) {
      if (review.explainTestPath && !quartz.testPaths.includes(review.explainTestPath)) {
        throw new Error(`Quartz must declare its EXPLAIN test path: ${review.explainTestPath}`);
      }
    }
  }

  if (basalt) {
    assertPathsAreOwned(
      basalt.outputPaths,
      [
        basalt.sourceRoot,
        ...basalt.serverEntrypoints,
        basalt.envSchemaPath,
        basalt.errorContractPath,
        ...basalt.modules.map((module) => module.sourcePath),
      ],
      "Basalt",
    );
  }

  if (key) {
    assertPathsAreOwned(
      key.outputPaths,
      [
        ...key.sourcePaths,
        ...(key.recovery.status === "implemented" ? [key.recovery.sourcePath] : []),
      ],
      "Key",
    );
    assertEnvNamesDeclared(availableEnvNames, key.requiredEnv, "Key");
    if (key.provider === "better_auth" && !key.requiredEnv.includes("BETTER_AUTH_SECRET")) {
      throw new Error("Better Auth requires BETTER_AUTH_SECRET");
    }
    if (key.sessionStrategy === "database" && !key.requiredEnv.includes("DATABASE_URL")) {
      throw new Error("Database sessions require DATABASE_URL");
    }
    const roles = new Set(key.roles);
    for (const requiredRole of requirements.roles) {
      if (!roles.has(requiredRole)) {
        throw new Error(`Key is missing an approved role: ${requiredRole}`);
      }
    }
    for (const permission of key.permissions) {
      if (!roles.has(permission.role)) {
        throw new Error(`Key permission references an unknown role: ${permission.role}`);
      }
    }
  }

  if (nexus) {
    const expectedIds = requirements.integrations.map((integration) => integration.id);
    const actualIds = nexus.integrations.map((integration) => integration.id);
    if (stableJson(expectedIds) !== stableJson(actualIds)) {
      throw new Error("Nexus integrations must exactly match the approved requirements");
    }
    for (const integration of nexus.integrations) {
      const expected = requirements.integrations.find((item) => item.id === integration.id);
      if (
        !expected ||
        expected.kind !== integration.kind ||
        expected.execution !== integration.execution ||
        stableJson(expected.envNames) !== stableJson(integration.requiredEnv)
      ) {
        throw new Error(`Nexus adapter contract does not match requirements: ${integration.id}`);
      }
      assertPathsAreOwned(
        nexus.outputPaths,
        [
          integration.adapterPath,
          integration.envSchemaPath,
          integration.errorMapPath,
          ...integration.webhooks.map((webhook) => webhook.handlerPath),
        ],
        `Nexus ${integration.id}`,
      );
      assertPathsAreOwned(
        nexus.testPaths,
        [
          integration.connectionTestPath,
          ...integration.webhooks.map((webhook) => webhook.testPath),
        ],
        `Nexus ${integration.id} tests`,
      );
      assertEnvNamesDeclared(availableEnvNames, integration.requiredEnv, `Nexus ${integration.id}`);
      if (integration.kind === "stripe" && integration.webhooks.length === 0) {
        throw new Error("Stripe requires a verified idempotent webhook contract");
      }
    }
  }

  if (vault) {
    const actualOperations = vault.routes.map((route) => ({
      operationId: route.operationId,
      method: route.method,
      path: route.path,
      access: route.access,
      rateLimitRequired: route.rateLimitPolicyId !== null,
      idempotencyRequired: route.idempotencyKey !== null,
    }));
    if (stableJson(actualOperations) !== stableJson(requirements.apiOperations)) {
      throw new Error("Vault routes must exactly implement the approved API operation contract");
    }
    const keyRoles = new Set(key?.roles ?? []);
    const protectedPaths = new Set(key?.protectedRoutes ?? []);
    for (const route of vault.routes) {
      assertPathsAreOwned(
        vault.outputPaths,
        [
          route.sourcePath,
          route.responseSchemaPath,
          ...(route.requestSchemaPath ? [route.requestSchemaPath] : []),
        ],
        `Vault ${route.operationId}`,
      );
      assertPathsAreOwned(vault.testPaths, route.testPaths, `Vault ${route.operationId} tests`);
      if (route.method !== "GET" && !route.requestSchemaPath) {
        throw new Error(`Vault mutation requires a request schema: ${route.operationId}`);
      }
      if (["authenticated", "roles"].includes(route.access.kind)) {
        if (!protectedPaths.has(route.path)) {
          throw new Error(`Key does not protect the Vault route: ${route.path}`);
        }
      }
      if (route.access.kind === "roles") {
        for (const role of route.access.roles) {
          if (!keyRoles.has(role)) {
            throw new Error(`Vault route references a Key role that does not exist: ${role}`);
          }
        }
      }
    }
  }

  if (forge) {
    const routes = new Map(vault?.routes.map((route) => [route.operationId, route]) ?? []);
    for (const binding of forge.bindings) {
      if (binding.target.kind === "local") {
        if (binding.transport !== "local" || binding.auth !== "public") {
          throw new Error(`Local Forge binding must use local/public transport: ${binding.id}`);
        }
        continue;
      }
      if (binding.transport === "local") {
        throw new Error(`API Forge binding cannot use local transport: ${binding.id}`);
      }
      const route = routes.get(binding.target.operationId);
      if (!route) {
        throw new Error(
          `Forge Integration references an unknown Vault operation: ${binding.target.operationId}`,
        );
      }
      const protectedRoute = ["authenticated", "roles"].includes(route.access.kind);
      if (
        (protectedRoute && binding.auth !== "session") ||
        (!protectedRoute && binding.auth !== "public")
      ) {
        throw new Error(`Forge auth mode does not match Vault access: ${binding.id}`);
      }
      assertPathsAreOwned(forge.outputPaths, [binding.clientPath], `Forge ${binding.id}`);
      assertPathsAreOwned(forge.testPaths, [binding.testPath], `Forge ${binding.id} tests`);
    }
    if (capabilities.api && !forge.bindings.some((binding) => binding.target.kind === "api")) {
      throw new Error("Forge Integration must bind at least one API operation for a service app");
    }
    if (!capabilities.api && forge.bindings.some((binding) => binding.target.kind === "api")) {
      throw new Error("Forge Integration cannot bind an API when the approved profile has no API");
    }
  }

  if (nimbus) {
    if (nimbus.database.required !== capabilities.database) {
      throw new Error("Nimbus database decision must match the approved requirements");
    }
    if (nimbus.storage.required !== (requirements.storage === "object_storage")) {
      throw new Error("Nimbus storage decision must match the approved requirements");
    }
    if (nimbus.database.required && nimbus.database.bindingNames.length === 0) {
      throw new Error("Nimbus requires a database binding when database is required");
    }
    if (nimbus.storage.required && nimbus.storage.bindingNames.length === 0) {
      throw new Error("Nimbus requires a storage binding when object storage is required");
    }
    assertPathsAreOwned(
      nimbus.outputPaths,
      [
        ...nimbus.configPaths,
        ...nimbus.monitoringPaths,
        ...(nimbus.cdn.policyPath ? [nimbus.cdn.policyPath] : []),
      ],
      "Nimbus",
    );
    assertPathsHaveRole(descriptors, nimbus.configPaths, ["deployment"], "Nimbus configPaths");
    if (!nimbus.configPaths.includes("netlify.toml")) {
      throw new Error("Nimbus must own the Netlify deployment configuration");
    }
    const requiredEnv = uniqueSorted([
      ...(key?.requiredEnv ?? []),
      ...(nexus?.integrations.flatMap((integration) => integration.requiredEnv) ?? []),
    ]);
    const declaredNimbusEnv = new Set([
      ...nimbus.secretNames,
      ...nimbus.database.bindingNames,
      ...nimbus.storage.bindingNames,
    ]);
    for (const name of requiredEnv) {
      if (!declaredNimbusEnv.has(name)) {
        throw new Error(`Nimbus is missing a required binding or secret name: ${name}`);
      }
    }
    assertEnvNamesDeclared(availableEnvNames, [...declaredNimbusEnv], "Nimbus");
  }
}

export async function buildProductionArtifactGraph(input: {
  candidate: WorkspaceCandidate;
  files: Readonly<Record<string, string>>;
  requirements: ProductionRequirements;
  provenance: ProductionProvenanceArtifact;
  artifacts: ProductionArtifactBundle;
  configuredEnvironmentNames?: readonly string[];
}): Promise<ProductionArtifactGraph> {
  const candidate = WorkspaceCandidateSchema.parse(input.candidate);
  const candidateVerification = await verifyProductionWorkspaceCandidate(input.files, candidate);
  if (!candidateVerification.valid) {
    throw new Error(`Production candidate is invalid: ${candidateVerification.errors.join("; ")}`);
  }
  const requirements = ProductionRequirementsSchema.parse(input.requirements);
  const provenance = ProductionProvenanceArtifactSchema.parse(input.provenance);
  const artifacts = ProductionArtifactBundleSchema.parse(input.artifacts);
  const required = requiredStages(requirements);
  for (const id of PRODUCTION_STAGE_ORDER) {
    if (required[id] && artifacts[id] === null) {
      throw new Error(`Required Production artifact is missing: ${id}`);
    }
    if (!required[id] && artifacts[id] !== null) {
      throw new Error(`Production stage must be absent when not required: ${id}`);
    }
  }
  const descriptors = descriptorMap(candidate);
  const envContents = input.files[".env.example"];
  if (envContents === undefined) {
    throw new Error("Production candidate is missing .env.example");
  }
  const availableEnvNames = envExampleNames(envContents);
  const configuration = ProductionConfigurationInventorySchema.parse({
    evidence: "server_name_presence_only",
    configuredEnvNames: uniqueSorted(input.configuredEnvironmentNames ?? []),
  });
  assertEnvNamesDeclared(
    availableEnvNames,
    configuration.configuredEnvNames,
    "Configured environment inventory",
  );
  const configuredEnvNames = new Set(configuration.configuredEnvNames);

  await assertContractMatchesCandidate(
    input.files,
    descriptors,
    requirements.contractPath,
    requirements,
  );
  await assertContractMatchesCandidate(
    input.files,
    descriptors,
    provenance.contractPath,
    provenance,
  );
  assertProductionProvenance(candidate, provenance, artifacts);
  assertPathsExist(descriptors, requirements.evidencePaths, "Production requirements");
  let prdSource: unknown;
  let architectureSource: unknown;
  try {
    prdSource = JSON.parse(input.files["docs/prd.json"] ?? "");
    architectureSource = JSON.parse(input.files["docs/architecture.json"] ?? "");
  } catch {
    throw new Error("Production PRD and architecture evidence must be valid JSON");
  }
  const prd = ProductionPrdEvidenceSchema.parse(prdSource);
  const architecture = ProductionArchitectureEvidenceSchema.parse(architectureSource);
  const snapshot = productionRequirementSnapshot(requirements);
  if (
    stableJson(prd.requirements) !== stableJson(snapshot) ||
    stableJson(architecture.requirements) !== stableJson(snapshot)
  ) {
    throw new Error(
      "Production PRD, architecture, and requirements must use the same typed requirement snapshot",
    );
  }
  await assertContractMatchesCandidate(input.files, descriptors, "docs/prd.json", prd);
  await assertContractMatchesCandidate(
    input.files,
    descriptors,
    "docs/architecture.json",
    architecture,
  );

  const ownedPaths = new Map<string, ProductionStageId>();
  const nodes: ProductionArtifactNode[] = [];

  for (const id of PRODUCTION_STAGE_ORDER) {
    const artifact = artifacts[id];
    if (!required[id]) {
      if (artifact !== null) {
        throw new Error(`Production stage must be absent when not required: ${id}`);
      }
      const evidencePaths = uniqueSorted([
        requirements.contractPath,
        ...requirements.evidencePaths,
      ]);
      nodes.push(
        ProductionArtifactNodeSchema.parse({
          id,
          contractVersion: PRODUCTION_ARTIFACT_CONTRACTS[id].version,
          producerKind: PRODUCTION_ARTIFACT_CONTRACTS[id].producerKind,
          required: false,
          status: "not_required",
          evidence: "structural",
          runtimeExecution: "not_run",
          reason: `Not required by the approved ${requirements.runtimeProfile} profile: ${requirements.rationale}`,
          dependencies: [],
          contractPath: null,
          artifactSha256: null,
          files: evidencePaths.map((path) => {
            const descriptor = descriptors.get(path);
            if (!descriptor) throw new Error(`Production requirement evidence is missing: ${path}`);
            return { path, role: descriptor.role, sha256: descriptor.sha256 };
          }),
        }),
      );
      continue;
    }
    if (artifact === null) {
      throw new Error(`Required Production artifact is missing: ${id}`);
    }
    await assertContractMatchesCandidate(input.files, descriptors, artifact.contractPath, artifact);
    const referencedPaths = collectReferencedPaths(artifact);
    assertPathsExist(descriptors, referencedPaths, `Production artifact ${id}`);
    for (const outputPath of uniqueSorted([artifact.contractPath, ...artifact.outputPaths])) {
      const owner = ownedPaths.get(outputPath);
      if (owner) {
        throw new Error(
          `Production output path has multiple owners: ${outputPath} (${owner}, ${id})`,
        );
      }
      ownedPaths.set(outputPath, id);
    }
    const artifactFileSet = referencedPaths.map((path) => {
      const descriptor = descriptors.get(path);
      if (!descriptor) throw new Error(`Production artifact path is missing: ${path}`);
      return { path, role: descriptor.role, sha256: descriptor.sha256 };
    });
    const artifactSha256 = await sha256Hex(
      `helix-production-artifact-v1\n${stableJson({ contract: artifact, files: artifactFileSet })}`,
    );
    const dependencyIds = dependenciesFor(id, required);
    const dependencies = dependencyIds.map((dependencyId) => {
      const upstream = nodes.find((candidateNode) => candidateNode.id === dependencyId);
      if (!upstream?.artifactSha256) {
        throw new Error(`Required dependency artifact is missing: ${dependencyId} -> ${id}`);
      }
      return { id: dependencyId, artifactSha256: upstream.artifactSha256 };
    });
    const unavailableDependencies = dependencyIds.filter((dependency) => {
      const node = nodes.find((candidateNode) => candidateNode.id === dependency);
      return node?.status !== "structurally_present";
    });
    const missingConfiguration = requiredEnvironmentForArtifact(artifact).filter(
      (name) => !configuredEnvNames.has(name),
    );
    const reviewBlocks =
      artifact.kind === "quartz_database_review_artifact" &&
      artifact.queryReviews.some((review) => review.verdict === "changes_required");
    const ownStatus =
      missingConfiguration.length > 0
        ? "not_configured"
        : reviewBlocks
          ? "blocked"
          : "structurally_present";
    const status =
      ownStatus === "structurally_present" && unavailableDependencies.length > 0
        ? "blocked"
        : ownStatus;
    const reason =
      missingConfiguration.length > 0
        ? `Missing externally configured environment names: ${missingConfiguration.join(", ")}`
        : reviewBlocks
          ? "Quartz requires source changes before this graph can advance."
          : ownStatus === "structurally_present" && unavailableDependencies.length > 0
            ? `Blocked by unavailable source dependencies: ${unavailableDependencies.join(", ")}`
            : artifact.summary;
    nodes.push(
      ProductionArtifactNodeSchema.parse({
        id,
        contractVersion: PRODUCTION_ARTIFACT_CONTRACTS[id].version,
        producerKind: PRODUCTION_ARTIFACT_CONTRACTS[id].producerKind,
        required: true,
        status,
        evidence: "structural",
        runtimeExecution: "not_run",
        reason,
        dependencies,
        contractPath: artifact.contractPath,
        artifactSha256,
        files: artifactFileSet,
      }),
    );
  }

  assertArtifactRelationships(requirements, artifacts, availableEnvNames, descriptors);

  const unsigned = {
    kind: "helix_production_source_graph" as const,
    schemaVersion: "1.0.0" as const,
    jobId: candidate.jobId,
    ...(candidate.projectId === undefined ? {} : { projectId: candidate.projectId }),
    pipelineVersion: candidate.pipelineVersion,
    candidateSha256: candidate.sourceSha256,
    requirements,
    configuration,
    provenance,
    artifacts,
    nodes,
  };
  const graphSha256 = await sha256Hex(graphHashPayload(unsigned));
  return ProductionArtifactGraphSchema.parse({ ...unsigned, graphSha256 });
}

export async function verifyProductionArtifactGraph(input: {
  candidate: WorkspaceCandidate;
  files: Readonly<Record<string, string>>;
  graph: unknown;
}): Promise<ProductionGraphVerification> {
  const parsed = ProductionArtifactGraphSchema.safeParse(input.graph);
  if (!parsed.success) {
    return { valid: false, errors: productionGraphErrors(parsed.error) };
  }
  try {
    const reconstructed = await buildProductionArtifactGraph({
      candidate: input.candidate,
      files: input.files,
      requirements: parsed.data.requirements,
      provenance: parsed.data.provenance,
      artifacts: parsed.data.artifacts,
      configuredEnvironmentNames: parsed.data.configuration.configuredEnvNames,
    });
    const errors: string[] = [];
    if (stableJson(reconstructed) !== stableJson(parsed.data)) {
      errors.push(
        "Production graph does not match its candidate, contracts, or canonical dependencies",
      );
    }
    const canonicalHash = await sha256Hex(graphHashPayload(unsignedGraph(parsed.data)));
    if (canonicalHash !== parsed.data.graphSha256) {
      errors.push("Production graph hash does not match its canonical payload");
    }
    return {
      valid: errors.length === 0,
      errors,
      graphSha256: reconstructed.graphSha256,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}
