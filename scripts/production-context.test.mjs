import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function plan(type = "site") {
  return {
    title: "Approved product",
    type,
    pitch: "A specific product built from the approved brief.",
    target: "People named in the approved brief.",
    problem: "The approved workflow is currently difficult.",
    useCases: ["Complete the primary workflow."],
    mvp: ["Deliver the primary workflow."],
    scope: { p0: ["Primary workflow"], p1: [], p2: [] },
    nonGoals: ["Unapproved adjacent products"],
    userJourneys: ["Open the product and complete the primary workflow."],
    acceptanceCriteria: ["The primary workflow produces a visible result."],
    screens: [{ name: "Home", purpose: "Primary workflow" }],
    features: ["Primary workflow"],
    data: [],
    success: "The accepted workflow completes.",
  };
}

function architecture() {
  return {
    productType: "Approved web product",
    frontendArchitecture: "Browser modules with explicit UI states.",
    backendArchitecture: "Capability-driven server modules when required.",
    dataFlow: ["Approved input -> validation -> product state -> response"],
    screenMap: ["Home: primary workflow"],
    routeMap: ["/: primary workflow"],
    apiContracts: [],
    databaseRequirements: "Use PostgreSQL only when server persistence is approved.",
    authModel: "Use a signed server session only when accounts are approved.",
    permissions: [],
    integrations: [],
    deploymentTarget: "Netlify web runtime",
    failureModes: ["Missing configuration blocks the dependent capability."],
  };
}

test("Production context derives only closed, internally consistent capabilities", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const [contextModule, graph] = await Promise.all([
    vite.ssrLoadModule("/src/lib/server/production/context.ts"),
    vite.ssrLoadModule("/src/lib/production-artifact-graph.ts"),
  ]);

  await t.test("a public information site stays static", () => {
    const context = contextModule.deriveProductionContext({
      prompt: "A public information site for a local museum",
      plan: plan("site"),
      architecture: architecture(),
    });
    assert.equal(context.requirements.runtimeProfile, "static_site");
    assert.equal(context.requirements.dataModel, "bundled_read_only");
    assert.equal(context.requirements.identity, "none");
    assert.deepEqual(context.requirements.integrations, []);
    assert.deepEqual(graph.deriveRequiredProductionStages(context.requirements), {
      prism: false,
      basalt: false,
      key: false,
      nexus: false,
      vault: false,
      quartz: false,
      forgeIntegration: false,
      nimbus: true,
    });
  });

  await t.test("non-goals are exclusion evidence and never capability requirements", () => {
    const approvedPlan = {
      ...plan("site"),
      nonGoals: ["Accounts and payments", "Customer records and an admin back-office"],
    };
    const context = contextModule.deriveProductionContext({
      prompt: "A public information site for a community archive",
      plan: approvedPlan,
      architecture: architecture(),
    });
    assert.equal(context.requirements.runtimeProfile, "static_site");
    assert.equal(context.requirements.identity, "none");
    assert.deepEqual(context.requirements.integrations, []);
    assert.deepEqual(context.requirements.apiOperations, []);
  });

  await t.test("non-goals against simulated services still require real auth and payments", () => {
    const approvedPlan = {
      ...plan("dashboard"),
      nonGoals: ["No mock authentication", "No simulated payments"],
    };
    const context = contextModule.deriveProductionContext({
      prompt: "A customer account service with login and Stripe payments",
      plan: approvedPlan,
      architecture: architecture(),
    });
    assert.equal(context.requirements.runtimeProfile, "service_app");
    assert.equal(context.requirements.identity, "accounts");
    assert.ok(
      context.requirements.integrations.some((integration) => integration.id === "stripe"),
    );
  });

  await t.test("negated OAuth and payment mentions stay static in all six languages", () => {
    const noServiceArchitecture = {
      ...architecture(),
      productType: "Public static site",
      backendArchitecture: "No backend or server runtime.",
      databaseRequirements: "No database or server persistence.",
      authModel: "No authentication or user accounts.",
      apiContracts: [],
      permissions: [],
      integrations: [],
    };
    const prompts = [
      "A public museum site without Google login",
      "A public museum site with no Apple OAuth",
      "A public museum site without accounts or payments",
      "A public museum site with no Stripe checkout",
      "Un sito pubblico del museo senza login con Google e senza pagamenti",
      "Un sitio público del museo sin inicio de sesión con Apple y sin pagos",
      "Un site public de musée sans connexion avec Google et sans paiements",
      "Eine öffentliche Museumswebsite ohne Apple-Anmeldung und ohne Zahlungen",
      "Um site público do museu sem iniciar sessão com Google e sem pagamentos",
    ];
    for (const prompt of prompts) {
      const context = contextModule.deriveProductionContext({
        prompt,
        plan: plan("site"),
        architecture: noServiceArchitecture,
      });
      assert.equal(context.requirements.runtimeProfile, "static_site", prompt);
      assert.equal(context.requirements.identity, "none", prompt);
      assert.deepEqual(context.requirements.integrations, [], prompt);
      assert.deepEqual(context.requirements.apiOperations, [], prompt);
    }
  });

  await t.test("an offline interactive app remains device-local", () => {
    const context = contextModule.deriveProductionContext({
      prompt: "An offline mobile app for a breathing timer",
      plan: plan("app"),
      architecture: architecture(),
    });
    assert.equal(context.requirements.runtimeProfile, "client_only_app");
    assert.equal(context.requirements.dataModel, "device_local");
    assert.equal(context.requirements.dataSensitivity, "device_private");
    assert.equal(context.requirements.serverOperations, "none");
    const required = graph.deriveRequiredProductionStages(context.requirements);
    assert.equal(required.forgeIntegration, true);
    assert.equal(required.nimbus, true);
    assert.equal(required.vault, false);
  });

  await t.test("approved paid admin workflows require the full service graph", () => {
    const context = contextModule.deriveProductionContext({
      prompt:
        "A SaaS admin back-office with accounts, Google login, Stripe subscriptions, email notifications and document upload",
      plan: plan("dashboard"),
      architecture: architecture(),
    });
    const requirements = context.requirements;
    assert.equal(requirements.runtimeProfile, "service_app");
    assert.equal(requirements.dataModel, "server_persistent");
    assert.equal(requirements.dataSensitivity, "server_private");
    assert.equal(requirements.identity, "roles");
    assert.deepEqual(requirements.roles, ["admin", "user"]);
    assert.equal(requirements.storage, "object_storage");
    assert.deepEqual(
      requirements.integrations.map((integration) => integration.id),
      ["email", "google_oauth", "stripe"],
    );
    const stripe = requirements.integrations.find(
      (integration) => integration.kind === "stripe",
    );
    assert.deepEqual(stripe.envNames, ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
    assert.ok(
      requirements.apiOperations.some(
        (operation) =>
          operation.access.kind === "signed_webhook" &&
          operation.access.integrationId === "stripe" &&
          operation.idempotencyRequired,
      ),
    );
    assert.ok(
      requirements.apiOperations.some(
        (operation) =>
          operation.method === "DELETE" &&
          operation.access.kind === "roles" &&
          operation.access.roles.includes("admin"),
      ),
    );
    assert.ok(
      Object.values(graph.deriveRequiredProductionStages(requirements)).every(Boolean),
    );
    assert.deepEqual(context.prd.requirements, context.architecture.requirements);
  });

  await t.test("account and server-data journeys are recognized in all six supported languages", () => {
    const localizedPrompts = [
      "An application to manage customer data with accounts and login",
      "Un'applicazione per gestire i dati dei clienti con account e accesso",
      "Una aplicación para gestionar datos de clientes con cuentas e inicio de sesión",
      "Une application pour gérer les données des clients avec comptes et connexion",
      "Eine Anwendung für Daten von Kunden mit Benutzerkonto und Anmeldung",
      "Uma aplicação para gerir dados de clientes com contas e autenticação",
    ];
    for (const prompt of localizedPrompts) {
      const context = contextModule.deriveProductionContext({
        prompt,
        plan: plan("dashboard"),
        architecture: architecture(),
      });
      assert.equal(context.requirements.runtimeProfile, "service_app", prompt);
      assert.equal(context.requirements.dataModel, "server_persistent", prompt);
      assert.equal(context.requirements.identity, "accounts", prompt);
      assert.equal(context.requirements.serverOperations, "authenticated", prompt);
    }
  });

  await t.test("user-only account journeys do not invent an admin role in any locale", () => {
    const userOnlyArchitecture = {
      ...architecture(),
      productType: "service_app",
      backendArchitecture: "A Node server exposes an authenticated API.",
      apiContracts: ["POST /api/records requires an authenticated user"],
      databaseRequirements: "PostgreSQL stores private user records.",
      authModel: "A signed server session authenticates each user account.",
      permissions: ["user can manage only their own records"],
    };
    const prompts = [
      "A customer portal with user login and no admin back-office",
      "Un portale clienti con accesso utenti e senza back-office amministratore",
      "Un portal de clientes con inicio de sesión y sin panel de administrador",
      "Un portail client avec connexion et sans espace administrateur",
      "Ein Kundenportal mit Anmeldung und ohne Adminbereich",
      "Um portal de clientes com autenticação e sem painel de administrador",
    ];
    for (const prompt of prompts) {
      const context = contextModule.deriveProductionContext({
        prompt,
        plan: plan("dashboard"),
        architecture: userOnlyArchitecture,
      });
      assert.equal(context.requirements.runtimeProfile, "service_app", prompt);
      assert.equal(context.requirements.identity, "accounts", prompt);
      assert.equal(context.requirements.privilegedOperations, false, prompt);
      assert.deepEqual(context.requirements.roles, [], prompt);
      assert.equal(
        context.requirements.apiOperations.some(
          (operation) => operation.operationId === "remove_record",
        ),
        false,
        prompt,
      );
    }
  });

  await t.test("explicit approved architecture cannot be downgraded by a no-login prompt", () => {
    const approvedArchitecture = {
      ...architecture(),
      productType: "Aplicación de servicio",
      backendArchitecture: "Servidor Node con API autenticada",
      apiContracts: ["POST /api/clientes requiere sesión autenticada"],
      databaseRequirements: "PostgreSQL conserva los datos privados de clientes",
      authModel: "Sesión de servidor para cada cuenta",
      permissions: ["administrador puede gestionar clientes"],
    };
    const context = contextModule.deriveProductionContext({
      prompt: "Un panel de clientes sin inicio de sesión",
      plan: plan("dashboard"),
      architecture: approvedArchitecture,
    });
    assert.equal(context.requirements.runtimeProfile, "service_app");
    assert.equal(context.requirements.dataSensitivity, "server_private");
    assert.equal(context.requirements.identity, "roles");
    assert.equal(context.requirements.serverOperations, "authenticated");
    assert.ok(context.requirements.apiOperations.length > 0);
  });

  await t.test("a browser map uses only an explicitly public client key", () => {
    const context = contextModule.deriveProductionContext({
      prompt: "A mobile app with an interactive map and geolocation, no login",
      plan: plan("app"),
      architecture: architecture(),
    });
    assert.equal(context.requirements.runtimeProfile, "client_only_app");
    assert.deepEqual(context.requirements.integrations, [
      {
        id: "maps",
        kind: "maps",
        execution: "client",
        credentialExposure: "public",
        purpose: "Render approved map views with an explicitly public browser key.",
        envNames: ["VITE_MAPS_PUBLIC_KEY"],
      },
    ]);
  });
});
