import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

async function loadModules(t) {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  return {
    workspace: await vite.ssrLoadModule("/src/lib/workspace.ts"),
    production: await vite.ssrLoadModule("/src/lib/production-artifact-graph.ts"),
  };
}

function sorted(values) {
  return [...values].sort();
}

function requirements(overrides = {}) {
  return {
    kind: "helix_production_requirements",
    schemaVersion: "1.0.0",
    contractPath: "docs/requirements.json",
    runtimeProfile: "service_app",
    dataModel: "server_persistent",
    dataSensitivity: "server_private",
    storage: "none",
    identity: "roles",
    roles: ["admin", "user"],
    serverOperations: "authenticated",
    privilegedOperations: true,
    monitoringScope: "full_stack",
    integrations: [
      {
        id: "stripe",
        kind: "stripe",
        execution: "server",
        purpose: "Process verified subscription events after server-side payment confirmation.",
        envNames: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
        requiresWebhook: true,
        requiresIdempotency: true,
        requiresLedger: true,
      },
    ],
    apiOperations: [
      {
        operationId: "create_order",
        method: "POST",
        path: "/api/orders",
        access: { kind: "roles", roles: ["user"] },
        rateLimitRequired: true,
        idempotencyRequired: true,
      },
      {
        operationId: "stripe_webhook",
        method: "POST",
        path: "/api/webhooks/stripe",
        access: { kind: "signed_webhook", integrationId: "stripe" },
        rateLimitRequired: true,
        idempotencyRequired: true,
      },
    ],
    rationale:
      "The approved product has accounts, private persistent data, privileged operations, and one server integration.",
    evidencePaths: ["docs/architecture.json", "docs/prd.json"],
    ...overrides,
  };
}

function artifactBase(kind, contractPath, outputPaths, testPaths, overrides = {}) {
  return {
    kind,
    schemaVersion: "1.0.0",
    contractPath,
    status: "source_candidate",
    summary: `${kind} source files are present but runtime validation has not run.`,
    outputPaths: sorted(outputPaths),
    testPaths: sorted(testPaths),
    evidencePaths: ["docs/architecture.json", "docs/prd.json"],
    ...overrides,
  };
}

function serviceArtifacts() {
  return {
    prism: {
      ...artifactBase(
        "prism_database_artifact",
        "docs/artifacts/prism.json",
        ["db/migrations/0001_init.sql", "db/schema.sql"],
        ["tests/db-integrity.test.ts"],
      ),
      dialect: "postgresql",
      schemaPaths: ["db/schema.sql"],
      migrationPaths: ["db/migrations/0001_init.sql"],
      tables: [
        {
          name: "orders",
          sensitivity: "owned",
          primaryKey: "user_id,id",
          ownershipField: "user_id",
          createdAtField: "created_at",
          updatedAtField: "updated_at",
          foreignKeys: ["orders.user_id -> users.id"],
          indexes: ["orders_user_id_idx"],
          constraints: ["orders_total_nonnegative"],
        },
      ],
      retentionPolicy:
        "Retain completed orders for the approved accounting period, then delete through an audited job.",
      integrityTestPaths: ["tests/db-integrity.test.ts"],
    },
    quartz: {
      ...artifactBase(
        "quartz_database_review_artifact",
        "docs/artifacts/quartz.json",
        ["db/rollback.sql", "docs/db-backup.md", "docs/db-review.md"],
        ["tests/db-integrity.test.ts"],
      ),
      reviewedMigrationPaths: ["db/migrations/0001_init.sql"],
      queryReviews: [
        {
          id: "list_orders",
          sourcePath: "server/billing.ts",
          verdict: "accepted",
          requiredIndexes: ["orders_user_id_idx"],
          risks: [],
          explainEvidence: "not_run",
          explainTestPath: "tests/db-integrity.test.ts",
        },
      ],
      backupStrategyPath: "docs/db-backup.md",
      rollbackPath: "db/rollback.sql",
      migrationSafety:
        "Apply the additive migration transactionally and exercise rollback in an ephemeral database.",
      integrityTestPaths: ["tests/db-integrity.test.ts"],
    },
    basalt: {
      ...artifactBase(
        "basalt_backend_artifact",
        "docs/artifacts/basalt.json",
        ["server/billing.ts", "server/env.ts", "server/errors.ts", "server/index.ts"],
        ["tests/backend.test.ts"],
      ),
      runtime: "node_22_es_modules",
      sourceRoot: "server/index.ts",
      serverEntrypoints: ["server/index.ts"],
      envSchemaPath: "server/env.ts",
      errorContractPath: "server/errors.ts",
      modules: [
        {
          id: "billing",
          sourcePath: "server/billing.ts",
          responsibilities: ["Apply idempotent server-side billing rules."],
        },
      ],
      businessRules: ["Credits are assigned only after a verified payment event."],
    },
    key: {
      ...artifactBase(
        "key_auth_artifact",
        "docs/artifacts/key.json",
        ["server/auth-recovery.ts", "server/auth.ts"],
        ["tests/auth.test.ts"],
      ),
      provider: "better_auth",
      mock: false,
      sessionStrategy: "database",
      requiredEnv: ["BETTER_AUTH_SECRET", "DATABASE_URL"],
      sourcePaths: ["server/auth-recovery.ts", "server/auth.ts"],
      roles: ["admin", "user"],
      permissions: [
        { role: "admin", actions: ["manage_orders"] },
        { role: "user", actions: ["read_own_orders"] },
      ],
      protectedRoutes: ["/api/orders"],
      logoutImplemented: false,
      recovery: { status: "available_library", sourcePath: "server/auth-recovery.ts" },
    },
    vault: {
      ...artifactBase(
        "vault_api_artifact",
        "docs/artifacts/vault.json",
        [
          "server/api/orders.ts",
          "server/api/stripe-webhook.ts",
          "server/schemas/order-request.ts",
          "server/schemas/order-response.ts",
          "server/schemas/stripe-event.ts",
          "server/schemas/webhook-response.ts",
        ],
        ["tests/api-orders.test.ts", "tests/api-stripe-webhook.test.ts"],
      ),
      routes: [
        {
          operationId: "create_order",
          method: "POST",
          path: "/api/orders",
          sourcePath: "server/api/orders.ts",
          requestSchemaPath: "server/schemas/order-request.ts",
          responseSchemaPath: "server/schemas/order-response.ts",
          access: { kind: "roles", roles: ["user"] },
          businessRules: ["The authenticated user can create only their own order."],
          errorCodes: ["ORDER_INVALID"],
          rateLimitPolicyId: "orders_write",
          idempotencyKey: "client_request_id",
          testPaths: ["tests/api-orders.test.ts"],
        },
        {
          operationId: "stripe_webhook",
          method: "POST",
          path: "/api/webhooks/stripe",
          sourcePath: "server/api/stripe-webhook.ts",
          requestSchemaPath: "server/schemas/stripe-event.ts",
          responseSchemaPath: "server/schemas/webhook-response.ts",
          access: { kind: "signed_webhook", integrationId: "stripe" },
          businessRules: [
            "Verify the Stripe signature before applying an idempotent ledger event.",
          ],
          errorCodes: ["STRIPE_WEBHOOK_INVALID"],
          rateLimitPolicyId: "stripe_webhook",
          idempotencyKey: "stripe_event_id",
          testPaths: ["tests/api-stripe-webhook.test.ts"],
        },
      ],
    },
    nexus: {
      ...artifactBase(
        "nexus_integrations_artifact",
        "docs/artifacts/nexus.json",
        [
          "server/integrations/stripe-env.ts",
          "server/integrations/stripe-error-map.ts",
          "server/integrations/stripe-webhook.ts",
          "server/integrations/stripe.ts",
        ],
        ["tests/stripe-connection.test.ts", "tests/stripe-webhook.test.ts"],
      ),
      integrations: [
        {
          id: "stripe",
          kind: "stripe",
          execution: "server",
          adapterPath: "server/integrations/stripe.ts",
          envSchemaPath: "server/integrations/stripe-env.ts",
          requiredEnv: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
          connectionTestPath: "tests/stripe-connection.test.ts",
          retry: { maxAttempts: 4, baseDelayMs: 250, maxDelayMs: 4_000 },
          errorMapPath: "server/integrations/stripe-error-map.ts",
          webhooks: [
            {
              route: "/api/webhooks/stripe",
              handlerPath: "server/integrations/stripe-webhook.ts",
              signatureVerified: true,
              idempotencyKey: "stripe_event_id",
              testPath: "tests/stripe-webhook.test.ts",
            },
          ],
        },
      ],
    },
    forgeIntegration: {
      ...artifactBase(
        "forge_integration_artifact",
        "docs/artifacts/forge-integration.json",
        ["apps/web/lib/api-client.ts"],
        ["tests/web-integration.test.ts"],
      ),
      bindings: [
        {
          id: "order_form",
          componentPath: "apps/web/components/order-form.ts",
          clientPath: "apps/web/lib/api-client.ts",
          target: { kind: "api", operationId: "create_order" },
          transport: "server_fn",
          auth: "session",
          states: ["idle", "loading", "success", "empty", "error"],
          testPath: "tests/web-integration.test.ts",
        },
      ],
    },
    nimbus: {
      ...artifactBase(
        "nimbus_infrastructure_artifact",
        "docs/artifacts/nimbus.json",
        [
          ".env.example",
          "infra/cdn.toml",
          "infra/monitoring.ts",
          "infra/nimbus-decision.json",
        ],
        ["tests/infra.test.ts"],
      ),
      decision: {
        status: "not_configured",
        reasonCode: "NIMBUS_DECISION_EVIDENCE_MISSING",
        automaticProvisioning: false,
        automaticDeployment: false,
      },
      provider: null,
      runtime: null,
      configurationAdapter: null,
      activation: "not_configured",
      activationEvidence: {
        status: "not_verified",
        evidence: "not_run",
        automaticDeployment: false,
        reasonCode: "PROVIDER_DECISION_NOT_CONFIGURED",
      },
      rationale:
        "No provider, runtime, region, or cost is selected without authenticated evidence.",
      configPaths: ["infra/nimbus-decision.json"],
      functionPaths: [],
      runtimeSourcePaths: [],
      bindingContracts: [
        "authorization",
        "database",
        "idempotency",
        "identity_issuer",
        "monitoring",
        "operation_handlers",
        "rate_limit",
      ],
      monitoringPaths: ["infra/monitoring.ts"],
      database: { required: true, bindingNames: ["DATABASE_URL"] },
      storage: { required: false, bindingNames: [] },
      cdn: { required: true, selectedInPlan: false, policyPath: "infra/cdn.toml" },
      secretNames: ["BETTER_AUTH_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
      costEstimate: {
        evidence: "unavailable",
        reasonCode: "NIMBUS_DECISION_EVIDENCE_MISSING",
      },
    },
  };
}

function baseFiles() {
  return {
    ".env.example":
      "BETTER_AUTH_SECRET=\nDATABASE_URL=\nSTRIPE_SECRET_KEY=\nSTRIPE_WEBHOOK_SECRET=\n",
    "README.md": "# Production source candidate\n",
    "apps/web/components/order-form.ts": "export const orderForm = true;\n",
    "apps/web/index.ts": "export const ready = true;\n",
    "apps/web/lib/api-client.ts": "export const createOrder = async () => undefined;\n",
    "db/migrations/0001_init.sql":
      "create table orders (id text primary key, user_id text not null, created_at timestamptz not null, updated_at timestamptz not null);\n",
    "db/rollback.sql": "drop table orders;\n",
    "db/schema.sql": "create table orders (id text primary key);\n",
    "docs/db-backup.md": "# Backup strategy\n",
    "docs/db-review.md": "# Query and migration review\n",
    "docs/decisions.md": "# Decisions\n",
    "docs/score.md": "# Score\n\nEstimated only until runner evidence exists.\n",
    "infra/cdn.toml": "enabled = true\n",
    "infra/monitoring.ts": "export const monitoring = true;\n",
    "infra/nimbus-decision.json":
      '{"kind":"nimbus_source_configuration_plan","version":"1.0.0","evidence":{"status":"not_configured","reasonCode":"NIMBUS_DECISION_EVIDENCE_MISSING","automaticProvisioning":false,"automaticDeployment":false},"decision":null}\n',
    "package-lock.json": '{"name":"fixture","lockfileVersion":3,"packages":{}}\n',
    "package.json":
      '{"name":"fixture","private":true,"scripts":{"typecheck":"tsc --noEmit","lint":"eslint .","test":"node --test","build":"vite build"}}\n',
    "server/api/orders.ts": "export const createOrder = true;\n",
    "server/api/stripe-webhook.ts": "export const stripeWebhookRoute = true;\n",
    "server/auth-recovery.ts": "export const recover = true;\n",
    "server/auth.ts": "export const auth = true;\n",
    "server/billing.ts": "export const bill = true;\n",
    "server/env.ts": "export const envSchema = true;\n",
    "server/errors.ts": "export const errors = true;\n",
    "server/index.ts": "export const server = true;\n",
    "server/integrations/stripe-env.ts": "export const stripeEnv = true;\n",
    "server/integrations/stripe-error-map.ts": "export const stripeErrors = true;\n",
    "server/integrations/stripe-webhook.ts": "export const stripeWebhook = true;\n",
    "server/integrations/stripe.ts": "export const stripe = true;\n",
    "server/schemas/order-request.ts": "export const orderRequest = true;\n",
    "server/schemas/order-response.ts": "export const orderResponse = true;\n",
    "server/schemas/stripe-event.ts": "export const stripeEvent = true;\n",
    "server/schemas/webhook-response.ts": "export const webhookResponse = true;\n",
    "tests/api-orders.test.ts": "export const apiTest = true;\n",
    "tests/api-stripe-webhook.test.ts": "export const webhookApiTest = true;\n",
    "tests/auth.test.ts": "export const authTest = true;\n",
    "tests/backend.test.ts": "export const backendTest = true;\n",
    "tests/db-integrity.test.ts": "export const dbTest = true;\n",
    "tests/infra.test.ts": "export const infraTest = true;\n",
    "tests/stripe-connection.test.ts": "export const stripeConnectionTest = true;\n",
    "tests/stripe-webhook.test.ts": "export const stripeWebhookTest = true;\n",
    "tests/web-integration.test.ts": "export const webIntegrationTest = true;\n",
  };
}

function requirementSnapshot(source) {
  return {
    runtimeProfile: source.runtimeProfile,
    dataModel: source.dataModel,
    dataSensitivity: source.dataSensitivity,
    storage: source.storage,
    identity: source.identity,
    roles: source.roles,
    serverOperations: source.serverOperations,
    privilegedOperations: source.privilegedOperations,
    monitoringScope: source.monitoringScope,
    integrations: source.integrations,
    apiOperations: source.apiOperations,
  };
}

function prdEvidence(source) {
  return {
    kind: "helix_production_prd",
    schemaVersion: "1.0.0",
    title: "Order operations",
    target: "Teams that need a bounded order workflow.",
    problem: "Orders, payments, and ownership need one verified server-side workflow.",
    useCases: ["Create and review an authenticated order."],
    mvp: ["Authenticated order creation", "Verified payment webhook"],
    nonGoals: ["No clinical or financial advice."],
    userJourneys: ["A signed-in user submits an order and sees its resulting state."],
    acceptanceCriteria: ["An order mutation is authorized, rate-limited, and idempotent."],
    requirements: requirementSnapshot(source),
  };
}

function architectureEvidence(source) {
  return {
    kind: "helix_production_architecture",
    schemaVersion: "1.0.0",
    productType: source.runtimeProfile,
    frontendArchitecture: "A multi-file TypeScript client consumes typed server operations.",
    backendArchitecture: "Node 22 server modules are bundled behind a Netlify Functions adapter.",
    dataFlow: ["Client request -> authorization -> business rule -> PostgreSQL transaction."],
    screenMap: ["Order form", "Order status"],
    routeMap:
      source.apiOperations.length > 0
        ? source.apiOperations.map(
            (operation) => `${operation.method} ${operation.path} (${operation.operationId})`,
          )
        : ["GET / (static application entrypoint)"],
    databaseRequirements:
      source.dataModel === "server_persistent"
        ? "PostgreSQL migrations, ownership, indexes, constraints, and retention are required."
        : "No server database is required by the typed profile.",
    authModel:
      source.identity === "none"
        ? "No identity-bearing journey exists."
        : "Server sessions and route authorization are required.",
    deploymentTarget: "netlify",
    failureModes: ["Missing configuration blocks the dependent graph nodes."],
    requirements: requirementSnapshot(source),
  };
}

function provenanceFor(files, artifacts) {
  const provenancePath = "docs/artifacts/provenance.json";
  const owners = new Map();
  const paths = sorted([...Object.keys(files), provenancePath]);
  for (const path of paths) {
    let owner;
    if (path === provenancePath || path === "package.json" || path === "package-lock.json") {
      owner = "helix";
    } else if (path.startsWith("docs/artifacts/")) {
      owner = "helix";
    } else if (path === "docs/requirements.json" || path === "docs/architecture.json") {
      owner = "atlas";
    } else if (path === "docs/prd.json") {
      owner = "nova";
    } else if (path === ".env.example" || path === "netlify.toml" || path.startsWith("infra/")) {
      owner = "nimbus";
    } else if (path === "README.md") {
      owner = "folio";
    } else if (path === "docs/decisions.md") {
      owner = "archive";
    } else if (path === "docs/score.md") {
      owner = "score";
    } else if (path.startsWith("tests/")) {
      owner = "kiln";
    } else if (path === "db/migrations/not-required.md") {
      owner = "atlas";
    } else if (path.startsWith("apps/web/")) {
      owner =
        path.includes("/components/") || path.endsWith("/index.ts") || path.endsWith("/page.ts")
          ? "forgeUi"
          : "forgeLogic";
    } else if (path.startsWith("db/migrations/") || path === "db/schema.sql") {
      owner = "prism";
    } else if (path === "db/rollback.sql" || path.startsWith("docs/db-")) {
      owner = "quartz";
    } else if (path.startsWith("server/auth")) {
      owner = "key";
    } else if (path.startsWith("server/integrations/")) {
      owner = "nexus";
    } else if (path.startsWith("server/api/") || path.startsWith("server/schemas/")) {
      owner = "vault";
    } else if (path.startsWith("server/")) {
      owner = "basalt";
    } else {
      throw new Error(`Fixture path has no provenance owner: ${path}`);
    }
    owners.set(path, owner);
  }
  for (const [id, artifact] of Object.entries(artifacts)) {
    if (!artifact) continue;
    owners.set(artifact.contractPath, id);
    for (const path of artifact.outputPaths) owners.set(path, id);
    for (const path of artifact.testPaths) owners.set(path, "kiln");
  }
  return {
    kind: "helix_production_file_provenance",
    schemaVersion: "1.0.0",
    contractPath: provenancePath,
    files: paths.map((path) => ({ path, owner: owners.get(path) })),
  };
}

async function candidateFixture(workspace, production, options = {}) {
  const approvedRequirements = options.requirements ?? requirements();
  const artifacts = options.artifacts ?? serviceArtifacts();
  const files = { ...(options.files ?? baseFiles()) };
  const prd = options.prd ?? prdEvidence(approvedRequirements);
  const architecture = options.architecture ?? architectureEvidence(approvedRequirements);
  files["docs/prd.json"] = production.canonicalProductionContractFile(prd);
  files["docs/architecture.json"] = production.canonicalProductionContractFile(architecture);
  files[approvedRequirements.contractPath] =
    production.canonicalProductionContractFile(approvedRequirements);
  for (const artifact of Object.values(artifacts)) {
    if (artifact) {
      files[artifact.contractPath] = production.canonicalProductionContractFile(artifact);
    }
  }
  const generatedProvenance = provenanceFor(files, artifacts);
  const provenance = options.provenanceMutator
    ? options.provenanceMutator(structuredClone(generatedProvenance))
    : generatedProvenance;
  files[provenance.contractPath] = production.canonicalProductionContractFile(provenance);
  const prepared = await workspace.createProductionWorkspaceCandidate({
    jobId: "production-graph-job",
    projectId: "production-graph-project",
    locale: "it",
    pipelineVersion: "production-source-graph-v1",
    createdAt: "2026-08-20T12:00:00.000Z",
    entrypoint: "apps/web/index.ts",
    files,
  });
  const configuredEnvironmentNames =
    options.configuredEnvironmentNames ??
    (approvedRequirements.runtimeProfile === "service_app"
      ? ["BETTER_AUTH_SECRET", "DATABASE_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]
      : []);
  return {
    ...prepared,
    requirements: approvedRequirements,
    provenance,
    artifacts,
    configuredEnvironmentNames,
  };
}

function staticRequirements() {
  return requirements({
    runtimeProfile: "static_site",
    dataModel: "bundled_read_only",
    dataSensitivity: "public",
    storage: "none",
    identity: "none",
    roles: [],
    serverOperations: "none",
    privilegedOperations: false,
    monitoringScope: "static_delivery",
    integrations: [],
    apiOperations: [],
    rationale:
      "The approved product is a public static information site with no identity or runtime data.",
  });
}

function staticArtifacts() {
  return {
    prism: null,
    quartz: null,
    basalt: null,
    key: null,
    vault: null,
    nexus: null,
    forgeIntegration: null,
    nimbus: {
      ...artifactBase(
        "nimbus_infrastructure_artifact",
        "docs/artifacts/nimbus.json",
        [".env.example", "infra/monitoring.ts", "infra/nimbus-decision.json"],
        ["tests/infra.test.ts"],
      ),
      decision: {
        status: "not_configured",
        reasonCode: "NIMBUS_DECISION_EVIDENCE_MISSING",
        automaticProvisioning: false,
        automaticDeployment: false,
      },
      provider: null,
      runtime: null,
      configurationAdapter: null,
      activation: "not_configured",
      activationEvidence: {
        status: "not_verified",
        evidence: "not_run",
        automaticDeployment: false,
        reasonCode: "PROVIDER_DECISION_NOT_CONFIGURED",
      },
      rationale:
        "No provider, runtime, region, or cost is selected without authenticated evidence.",
      configPaths: ["infra/nimbus-decision.json"],
      functionPaths: [],
      runtimeSourcePaths: [],
      bindingContracts: [],
      monitoringPaths: ["infra/monitoring.ts"],
      database: { required: false, bindingNames: [] },
      storage: { required: false, bindingNames: [] },
      cdn: { required: true, selectedInPlan: false },
      secretNames: [],
      costEstimate: {
        evidence: "unavailable",
        reasonCode: "NIMBUS_DECISION_EVIDENCE_MISSING",
      },
    },
  };
}

function staticFiles() {
  return {
    ".env.example": "PUBLIC_ORIGIN=\n",
    "README.md": "# Static production candidate\n",
    "apps/web/index.ts": "export const ready = true;\n",
    "apps/web/page.ts": "export const page = true;\n",
    "db/migrations/not-required.md":
      "# Database migrations\n\nNot required by the approved static profile.\n",
    "docs/decisions.md": "# Decisions\n",
    "docs/score.md": "# Score\n\nEstimated only.\n",
    "infra/monitoring.ts": "export const staticHealth = true;\n",
    "infra/nimbus-decision.json":
      '{"kind":"nimbus_source_configuration_plan","version":"1.0.0","evidence":{"status":"not_configured","reasonCode":"NIMBUS_DECISION_EVIDENCE_MISSING","automaticProvisioning":false,"automaticDeployment":false},"decision":null}\n',
    "tests/infra.test.ts": "export const deployConfigTest = true;\n",
  };
}

test("Production source graph is requirements-derived, hash-bound, and never claims execution", async (t) => {
  const { workspace, production } = await loadModules(t);

  await t.test("contract registry exposes deterministic library generators", () => {
    assert.deepEqual(Object.keys(production.PRODUCTION_ARTIFACT_CONTRACTS), [
      "prism",
      "quartz",
      "basalt",
      "key",
      "vault",
      "nexus",
      "forgeIntegration",
      "nimbus",
    ]);
    for (const [id, contract] of Object.entries(production.PRODUCTION_ARTIFACT_CONTRACTS)) {
      assert.equal(contract.id, id);
      assert.equal(contract.activation, "available_library_generator");
      assert.equal(contract.producerKind, "deterministic_template_generator");
      assert.equal(contract.validationExecutor, "workspace_runner");
    }
  });

  await t.test("requirements reject ambiguous capability downgrades", () => {
    const staticProfile = staticRequirements();
    assert.equal(production.ProductionRequirementsSchema.safeParse(staticProfile).success, true);
    assert.deepEqual(production.deriveProductionCapabilityRequirements(staticProfile), {
      frontend: true,
      backend: false,
      api: false,
      database: false,
      auth: false,
      integrations: false,
      tests: true,
      deployment: true,
      monitoring: true,
    });
    const boundedClientIntegration = {
      ...staticProfile,
      runtimeProfile: "client_only_app",
      dataModel: "device_local",
      dataSensitivity: "device_private",
      monitoringScope: "client_runtime",
      integrations: [
        {
          id: "maps",
          kind: "maps",
          execution: "client",
          credentialExposure: "public",
          purpose: "Render a bounded public map in the client.",
          envNames: ["VITE_MAPS_PUBLIC_KEY"],
        },
      ],
    };
    assert.equal(
      production.ProductionRequirementsSchema.safeParse(boundedClientIntegration).success,
      true,
    );
    for (const invalid of [
      { ...staticProfile, identity: "accounts" },
      {
        ...staticProfile,
        runtimeProfile: "client_only_app",
        monitoringScope: "client_runtime",
        dataModel: "server_persistent",
      },
      {
        ...staticProfile,
        runtimeProfile: "service_app",
        monitoringScope: "full_stack",
        serverOperations: "none",
      },
      {
        ...staticProfile,
        runtimeProfile: "service_app",
        monitoringScope: "full_stack",
        serverOperations: "public",
        dataSensitivity: "server_private",
      },
      {
        ...staticProfile,
        runtimeProfile: "client_only_app",
        monitoringScope: "client_runtime",
        integrations: [
          {
            id: "stripe",
            kind: "stripe",
            execution: "client",
            purpose: "Unsafe client payment fixture.",
            envNames: ["STRIPE_SECRET_KEY"],
          },
        ],
      },
      {
        ...staticProfile,
        runtimeProfile: "client_only_app",
        monitoringScope: "client_runtime",
        integrations: [
          {
            id: "google",
            kind: "google_oauth",
            execution: "server",
            purpose: "Identity without an identity model.",
            envNames: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
            requiresCallback: true,
          },
        ],
      },
      {
        ...boundedClientIntegration,
        integrations: [
          {
            ...boundedClientIntegration.integrations[0],
            envNames: ["VITE_MAPS_SECRET_TOKEN"],
          },
        ],
      },
      {
        ...staticProfile,
        runtimeProfile: "service_app",
        monitoringScope: "full_stack",
        serverOperations: "public",
        apiOperations: [
          {
            operationId: "anonymous_write",
            method: "POST",
            path: "/api/public-write",
            access: { kind: "public" },
            rateLimitRequired: false,
            idempotencyRequired: true,
          },
        ],
      },
      {
        ...staticProfile,
        runtimeProfile: "service_app",
        monitoringScope: "full_stack",
        serverOperations: "public",
        apiOperations: [
          {
            operationId: "anonymous_write",
            method: "POST",
            path: "/api/public-write",
            access: { kind: "public" },
            rateLimitRequired: true,
            idempotencyRequired: false,
          },
        ],
      },
    ]) {
      assert.equal(production.ProductionRequirementsSchema.safeParse(invalid).success, false);
    }
  });

  await t.test("integration and mutation invariants fail with explicit reasons", () => {
    const approved = requirements();
    assert.throws(
      () =>
        production.ProductionRequirementsSchema.parse({
          ...approved,
          apiOperations: approved.apiOperations.filter(
            (operation) => operation.operationId !== "stripe_webhook",
          ),
        }),
      /Stripe requires an authenticated service, persistent ledger, and signed idempotent webhook operation/i,
    );

    const publicService = {
      ...staticRequirements(),
      runtimeProfile: "service_app",
      monitoringScope: "full_stack",
      serverOperations: "public",
      integrations: [
        {
          id: "google",
          kind: "google_oauth",
          execution: "server",
          purpose: "Authenticate with a server-side callback.",
          envNames: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
          requiresCallback: true,
        },
      ],
      apiOperations: [
        {
          operationId: "status",
          method: "GET",
          path: "/api/status",
          access: { kind: "public" },
          rateLimitRequired: false,
          idempotencyRequired: false,
        },
      ],
    };
    assert.throws(
      () => production.ProductionRequirementsSchema.parse(publicService),
      /OAuth integrations require server-side identity and authenticated operations/i,
    );

    assert.throws(
      () =>
        production.ProductionRequirementsSchema.parse({
          ...staticRequirements(),
          runtimeProfile: "client_only_app",
          dataModel: "device_local",
          dataSensitivity: "device_private",
          monitoringScope: "client_runtime",
          integrations: [
            {
              id: "maps",
              kind: "maps",
              execution: "client",
              credentialExposure: "secret",
              purpose: "Unsafe client credential declaration.",
              envNames: ["PUBLIC_MAPS_KEY"],
            },
          ],
        }),
      /Client integrations may reference only explicitly public VITE_ or PUBLIC_ configuration/i,
    );
  });

  await t.test("service graph is deterministic and keeps runtime activation unconfigured", async () => {
    const fixture = await candidateFixture(workspace, production);
    const graph = await production.buildProductionArtifactGraph(fixture);
    const reversedFixture = await candidateFixture(workspace, production, {
      files: Object.fromEntries(Object.entries(baseFiles()).reverse()),
      requirements: fixture.requirements,
      artifacts: fixture.artifacts,
    });
    const reversedGraph = await production.buildProductionArtifactGraph(reversedFixture);

    assert.deepEqual(graph, reversedGraph);
    assert.match(graph.graphSha256, /^[0-9a-f]{64}$/);
    assert.equal(graph.candidateSha256, fixture.candidate.sourceSha256);
    assert.equal(graph.nodes.find((node) => node.id === "nimbus")?.status, "not_configured");
    assert.equal(
      graph.nodes
        .filter((node) => node.id !== "nimbus")
        .every((node) => node.status === "structurally_present"),
      true,
    );
    assert.match(
      graph.nodes.find((node) => node.id === "nimbus")?.reason ?? "",
      /decision is unavailable.*No provider, runtime, region, or cost was selected/i,
    );
    assert.equal(
      graph.nodes.every((node) => node.runtimeExecution === "not_run"),
      true,
    );
    assert.equal(
      graph.nodes.every((node) => node.evidence === "structural"),
      true,
    );
    const verification = await production.verifyProductionArtifactGraph({
      candidate: fixture.candidate,
      files: fixture.files,
      graph,
    });
    assert.equal(verification.valid, true, verification.errors.join("\n"));
  });

  await t.test("PRD and architecture cannot silently downgrade approved requirements", async () => {
    const approved = requirements();
    const downgradedSnapshot = requirementSnapshot(staticRequirements());
    await assert.rejects(
      candidateFixture(workspace, production, {
        requirements: approved,
        prd: {
          ...prdEvidence(approved),
          requirements: downgradedSnapshot,
        },
      }).then((fixture) => production.buildProductionArtifactGraph(fixture)),
      /PRD, architecture, and requirements must use the same typed requirement snapshot/i,
    );

    await assert.rejects(
      candidateFixture(workspace, production, {
        requirements: approved,
        architecture: {
          ...architectureEvidence(approved),
          requirements: downgradedSnapshot,
        },
      }).then((fixture) => production.buildProductionArtifactGraph(fixture)),
      /PRD, architecture, and requirements must use the same typed requirement snapshot/i,
    );
  });

  await t.test("static Production derives seven not-required stages without fake SQL", async () => {
    const fixture = await candidateFixture(workspace, production, {
      files: staticFiles(),
      requirements: staticRequirements(),
      artifacts: staticArtifacts(),
    });
    const graph = await production.buildProductionArtifactGraph(fixture);
    assert.equal(graph.nodes.filter((node) => node.status === "not_required").length, 7);
    assert.equal(graph.nodes.find((node) => node.id === "nimbus")?.status, "not_configured");
    assert.equal(
      Object.keys(fixture.files).some((path) => path.endsWith(".sql")),
      false,
    );
    assert.equal(
      (
        await production.verifyProductionArtifactGraph({
          candidate: fixture.candidate,
          files: fixture.files,
          graph,
        })
      ).valid,
      true,
    );
  });

  await t.test("missing external configuration propagates without a done claim", async () => {
    const fixture = await candidateFixture(workspace, production, {
      configuredEnvironmentNames: [],
    });
    const graph = await production.buildProductionArtifactGraph(fixture);
    assert.equal(graph.nodes.find((node) => node.id === "key")?.status, "not_configured");
    assert.equal(graph.nodes.find((node) => node.id === "nexus")?.status, "not_configured");
    assert.equal(graph.nodes.find((node) => node.id === "forgeIntegration")?.status, "blocked");
    assert.equal(graph.nodes.find((node) => node.id === "nimbus")?.status, "not_configured");
    assert.equal(
      graph.nodes.some((node) => node.status === "done"),
      false,
    );
  });

  await t.test("Quartz review blockers propagate to infrastructure", async () => {
    const artifacts = serviceArtifacts();
    artifacts.quartz = {
      ...artifacts.quartz,
      queryReviews: [
        {
          ...artifacts.quartz.queryReviews[0],
          verdict: "changes_required",
          risks: ["The reviewed query must change before release."],
        },
      ],
    };
    const fixture = await candidateFixture(workspace, production, { artifacts });
    const graph = await production.buildProductionArtifactGraph(fixture);
    assert.equal(graph.nodes.find((node) => node.id === "quartz")?.status, "blocked");
    assert.equal(graph.nodes.find((node) => node.id === "nimbus")?.status, "blocked");
    assert.match(
      graph.nodes.find((node) => node.id === "quartz")?.reason ?? "",
      /requires source changes/i,
    );
  });

  await t.test("required and not-required artifacts cannot be self-declared", async () => {
    const missing = serviceArtifacts();
    missing.prism = null;
    await assert.rejects(
      candidateFixture(workspace, production, { artifacts: missing }).then((fixture) =>
        production.buildProductionArtifactGraph(fixture),
      ),
      /required Production artifact is missing: prism/i,
    );

    const extra = staticArtifacts();
    extra.prism = serviceArtifacts().prism;
    await assert.rejects(
      candidateFixture(workspace, production, {
        files: { ...staticFiles(), ...baseFiles() },
        requirements: staticRequirements(),
        artifacts: extra,
      }).then((fixture) => production.buildProductionArtifactGraph(fixture)),
      /must be absent when not required: prism/i,
    );
  });

  await t.test("environment inventory proves names only and rejects drift", async () => {
    await assert.rejects(
      candidateFixture(workspace, production, {
        files: {
          ...baseFiles(),
          ".env.example": `${baseFiles()[".env.example"]}DATABASE_URL=\n`,
        },
      }).then((fixture) => production.buildProductionArtifactGraph(fixture)),
      /duplicate environment name: DATABASE_URL/i,
    );

    await assert.rejects(
      candidateFixture(workspace, production, {
        files: {
          ...baseFiles(),
          ".env.example": baseFiles()[".env.example"].replace(
            "STRIPE_SECRET_KEY=",
            "STRIPE_SECRET_KEY=REPLACE_VALUE",
          ),
        },
      }).then((fixture) => production.buildProductionArtifactGraph(fixture)),
      /must not contain a configured sensitive value: STRIPE_SECRET_KEY/i,
    );

    await assert.rejects(
      candidateFixture(workspace, production, {
        configuredEnvironmentNames: [
          "BETTER_AUTH_SECRET",
          "DATABASE_URL",
          "STRIPE_SECRET_KEY",
          "STRIPE_WEBHOOK_SECRET",
          "UNDECLARED_CONFIGURATION",
        ],
      }).then((fixture) => production.buildProductionArtifactGraph(fixture)),
      /Configured environment inventory references an environment name missing from \.env\.example: UNDECLARED_CONFIGURATION/i,
    );
  });

  await t.test("provenance covers every file with a role-compatible declared owner", async () => {
    await assert.rejects(
      candidateFixture(workspace, production, {
        files: {
          ...baseFiles(),
          "server/unowned.ts": "export const unowned = true;\n",
        },
      }).then((fixture) => production.buildProductionArtifactGraph(fixture)),
      /assigns an undeclared stage output: server\/unowned\.ts -> basalt/i,
    );

    await assert.rejects(
      candidateFixture(workspace, production, {
        provenanceMutator: (provenance) => ({
          ...provenance,
          files: provenance.files.map((file) =>
            file.path === "README.md" ? { ...file, owner: "kiln" } : file,
          ),
        }),
      }).then((fixture) => production.buildProductionArtifactGraph(fixture)),
      /owner\/role mismatch: README\.md -> kiln/i,
    );

    await assert.rejects(
      candidateFixture(workspace, production, {
        provenanceMutator: (provenance) => ({
          ...provenance,
          files: provenance.files.filter((file) => file.path !== "server/billing.ts"),
        }),
      }).then((fixture) => production.buildProductionArtifactGraph(fixture)),
      /provenance must cover every candidate file exactly once/i,
    );

    await assert.rejects(
      candidateFixture(workspace, production, {
        provenanceMutator: (provenance) => ({
          ...provenance,
          files: provenance.files.map((file) =>
            file.path === "server/billing.ts" ? { ...file, owner: "forgeLogic" } : file,
          ),
        }),
      }).then((fixture) => production.buildProductionArtifactGraph(fixture)),
      /provenance has the wrong owner: server\/billing\.ts -> basalt/i,
    );
  });

  await t.test(
    "stale paths, operation ids, env contracts, and overlapping ownership fail closed",
    async () => {
      const cases = [];

      const stalePath = serviceArtifacts();
      stalePath.basalt = {
        ...stalePath.basalt,
        outputPaths: sorted([...stalePath.basalt.outputPaths, "server/missing.ts"]),
      };
      cases.push({ artifacts: stalePath, pattern: /outside the candidate: server\/missing\.ts/i });

      const unknownOperation = serviceArtifacts();
      unknownOperation.forgeIntegration = {
        ...unknownOperation.forgeIntegration,
        bindings: [
          {
            ...unknownOperation.forgeIntegration.bindings[0],
            target: { kind: "api", operationId: "missing_operation" },
          },
        ],
      };
      cases.push({ artifacts: unknownOperation, pattern: /unknown Vault operation/i });

      const envMismatch = serviceArtifacts();
      envMismatch.nexus = {
        ...envMismatch.nexus,
        integrations: [
          {
            ...envMismatch.nexus.integrations[0],
            requiredEnv: ["STRIPE_SECRET_KEY"],
          },
        ],
      };
      cases.push({ artifacts: envMismatch, pattern: /adapter contract does not match/i });

      const overlap = serviceArtifacts();
      overlap.key = {
        ...overlap.key,
        outputPaths: sorted([...overlap.key.outputPaths, "server/billing.ts"]),
      };
      cases.push({ artifacts: overlap, pattern: /multiple owners: server\/billing\.ts/i });

      const localTransport = serviceArtifacts();
      localTransport.forgeIntegration = {
        ...localTransport.forgeIntegration,
        bindings: [
          {
            ...localTransport.forgeIntegration.bindings[0],
            transport: "local",
          },
        ],
      };
      cases.push({
        artifacts: localTransport,
        pattern: /API Forge binding cannot use local transport/i,
      });

      const publicAuth = serviceArtifacts();
      publicAuth.forgeIntegration = {
        ...publicAuth.forgeIntegration,
        bindings: [
          {
            ...publicAuth.forgeIntegration.bindings[0],
            auth: "public",
          },
        ],
      };
      cases.push({
        artifacts: publicAuth,
        pattern: /Forge auth mode does not match Vault access/i,
      });

      const downgradedVault = serviceArtifacts();
      downgradedVault.vault = {
        ...downgradedVault.vault,
        routes: [
          {
            ...downgradedVault.vault.routes[0],
            access: { kind: "public" },
          },
          downgradedVault.vault.routes[1],
        ],
      };
      cases.push({ artifacts: downgradedVault, pattern: /Vault routes must exactly implement/i });

      const unprotectedVault = serviceArtifacts();
      unprotectedVault.key = {
        ...unprotectedVault.key,
        protectedRoutes: ["/api/other"],
      };
      cases.push({ artifacts: unprotectedVault, pattern: /Key does not protect the Vault route/i });

      const stripeWithoutWebhook = serviceArtifacts();
      stripeWithoutWebhook.nexus = {
        ...stripeWithoutWebhook.nexus,
        integrations: [
          {
            ...stripeWithoutWebhook.nexus.integrations[0],
            webhooks: [],
          },
        ],
      };
      cases.push({
        artifacts: stripeWithoutWebhook,
        pattern: /Stripe requires a verified idempotent webhook contract/i,
      });

      const runtimeDowngrade = serviceArtifacts();
      runtimeDowngrade.nimbus = {
        ...runtimeDowngrade.nimbus,
        provider: {
          id: "unverified-provider",
          displayName: "Unverified Provider",
          region: "eu-west",
          quoteReference: "unverified-quote",
          quoteObservedAt: "2026-08-20T10:00:00.000Z",
        },
      };
      cases.push({
        artifacts: runtimeDowngrade,
        pattern: /Unverified Nimbus evidence cannot select|cannot select infrastructure without a verified decision/i,
      });

      for (const testCase of cases) {
        await assert.rejects(
          candidateFixture(workspace, production, { artifacts: testCase.artifacts }).then(
            (fixture) => production.buildProductionArtifactGraph(fixture),
          ),
          testCase.pattern,
        );
      }
    },
  );

  await t.test("contract state and review evidence cannot invent readiness", () => {
    const prism = serviceArtifacts().prism;
    assert.equal(
      production.PrismArtifactSchema.safeParse({
        ...prism,
        status: "not_configured",
        requiredConfiguration: [],
      }).success,
      false,
    );
    assert.equal(
      production.PrismArtifactSchema.safeParse({
        ...prism,
        status: "blocked",
        blockers: [],
      }).success,
      false,
    );
    const quartz = serviceArtifacts().quartz;
    assert.equal(
      production.QuartzArtifactSchema.safeParse({
        ...quartz,
        queryReviews: [{ ...quartz.queryReviews[0], explainEvidence: "measured" }],
      }).success,
      false,
    );
  });

  await t.test("candidate, contract, dependency, and graph tampering are detected", async () => {
    const fixture = await candidateFixture(workspace, production);
    const graph = await production.buildProductionArtifactGraph(fixture);

    const graphHashTamper = await production.verifyProductionArtifactGraph({
      candidate: fixture.candidate,
      files: fixture.files,
      graph: { ...graph, graphSha256: "0".repeat(64) },
    });
    assert.equal(graphHashTamper.valid, false);

    const dependencyTamper = structuredClone(graph);
    dependencyTamper.nodes.find((node) => node.id === "nimbus").dependencies = [];
    const dependencyResult = await production.verifyProductionArtifactGraph({
      candidate: fixture.candidate,
      files: fixture.files,
      graph: dependencyTamper,
    });
    assert.equal(dependencyResult.valid, false);

    const dependencyHashTamper = structuredClone(graph);
    dependencyHashTamper.nodes.find((node) => node.id === "nimbus").dependencies[0].artifactSha256 =
      "0".repeat(64);
    const dependencyHashResult = await production.verifyProductionArtifactGraph({
      candidate: fixture.candidate,
      files: fixture.files,
      graph: dependencyHashTamper,
    });
    assert.equal(dependencyHashResult.valid, false);

    const fileTamper = {
      ...fixture.files,
      "docs/artifacts/prism.json": `${fixture.files["docs/artifacts/prism.json"]} `,
    };
    const fileResult = await production.verifyProductionArtifactGraph({
      candidate: fixture.candidate,
      files: fileTamper,
      graph,
    });
    assert.equal(fileResult.valid, false);

    const candidateTamper = {
      ...fixture.candidate,
      pipelineVersion: "tampered-pipeline",
    };
    const candidateResult = await production.verifyProductionArtifactGraph({
      candidate: candidateTamper,
      files: fixture.files,
      graph,
    });
    assert.equal(candidateResult.valid, false);
  });
});
