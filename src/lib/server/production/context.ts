import { classifyBrief, type Brief } from "@/lib/brief";
import { detectNeeds } from "@/lib/house";
import {
  ProductionArchitectureEvidenceSchema,
  ProductionPrdEvidenceSchema,
  ProductionRequirementsSchema,
  productionRequirementSnapshot,
  type ProductionRequirements,
} from "@/lib/production-artifact-graph";
import type { Architecture, ProductPlan } from "@/lib/server/agents/types";
import {
  parseApprovedApiContracts,
  productionIdentifier,
  resourceIdFromApiPath,
  singularProductionIdentifier,
  type ParsedApprovedApiContract,
} from "@/lib/server/production/domain";
import {
  ApprovedProductionContextSchema,
  type ApprovedProductionContext,
} from "@/lib/server/production/types";

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function hasAny(source: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(source));
}

function normalizedText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

function evidenceStrings(value: unknown): string[] {
  if (typeof value === "string") return [normalizedText(value)];
  if (Array.isArray(value)) return value.flatMap((entry) => evidenceStrings(entry));
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((entry) => evidenceStrings(entry));
  }
  return [];
}

function hasAffirmativeEvidence(
  fragments: readonly string[],
  positive: readonly RegExp[],
  negative: readonly RegExp[] = [],
): boolean {
  return fragments.some(
    (fragment) => hasAny(fragment, positive) && !hasAny(fragment, negative),
  );
}

const CONDITIONAL_CAPABILITY = [
  /\b(?:if|only when|when)\b[^.\n]{0,100}\b(?:approved|required|needed)\b/u,
  /\b(?:solo|soltanto) (?:se|quando)\b[^.\n]{0,100}\b(?:approvat[oa]|necessari[oa]|richiest[oa])\b/u,
  /\b(?:solo )?(?:si|cuando)\b[^.\n]{0,100}\b(?:aprueba|necesita|requiere|necesario)\b/u,
  /\b(?:seulement )?(?:si|lorsque)\b[^.\n]{0,100}\b(?:approuv[ée]e?|nécessaire|requis)\b/u,
  /\b(?:nur )?(?:wenn|falls)\b[^.\n]{0,100}\b(?:genehmigt|nötig|erforderlich)\b/u,
  /\b(?:somente )?(?:se|quando)\b[^.\n]{0,100}\b(?:aprovad[oa]|necessári[oa]|exigid[oa])\b/u,
];

const AUTH_SIGNAL = [
  /\b(?:accounts?|auth(?:entication|orization)?|login|log[ -]?in|oauth|register|registration|sessions?|sign[ -]?(?:in|up))\b/u,
  /\b(?:account|accesso|autenticazione|registrazione|sessione)\b/u,
  /\b(?:autenticaci[oó]n|cuentas?|inicio de sesi[oó]n|iniciar sesi[oó]n|registro|sesi[oó]n)\b/u,
  /\b(?:authentification|comptes?|connexion|inscription|session)\b/u,
  /\b(?:anmelden|anmeldung|authentifizierung|benutzerkont(?:o|en)|registrierung|sitzung)\b/u,
  /\b(?:autentica[cç][aã]o|cadastro|contas?|entrar|iniciar sess[aã]o|registo|sess[aã]o)\b/u,
];

const NO_AUTH_SIGNAL = [
  /\b(?:no|without) (?:accounts?|auth(?:entication)?|login|sessions?|sign[ -]?in)\b/u,
  /\b(?:nessun[ao]?|senza) (?:account|accesso|autenticazione|login|sessione)\b/u,
  /\b(?:ning[uú]n|sin) (?:autenticaci[oó]n|cuentas?|inicio de sesi[oó]n|login|sesi[oó]n)\b/u,
  /\b(?:aucun|sans) (?:authentification|compte|connexion|session)\b/u,
  /\b(?:kein(?:e|en)?|ohne) (?:anmeldung|authentifizierung|benutzerkonto|login|sitzung)\b/u,
  /\b(?:nenhum[ao]?|sem) (?:autentica[cç][aã]o|conta|login|sess[aã]o)\b/u,
  /\b(?:auth(?:entication)?|autenticazione|autenticaci[oó]n|authentification|authentifizierung|autentica[cç][aã]o) (?:is )?(?:none|not required|disabled|nessuna|no requerida|aucune|nicht erforderlich|nenhuma)\b/u,
];

const SERVER_SIGNAL = [
  /\b(?:api|backend|saas|server|server-side|service app)\b/u,
  /\b(?:servizio applicativo|server|backend)\b/u,
  /\b(?:api|backend|servidor|servicio web)\b/u,
  /\b(?:api|backend|serveur|service web)\b/u,
  /\b(?:api|backend|server|webdienst)\b/u,
  /\b(?:api|backend|servidor|servi[cç]o web)\b/u,
];

const DATABASE_SIGNAL = [
  /\b(?:database|persistent storage|postgres(?:ql)?|server persistence)\b/u,
  /\b(?:base dati|database|persistenza server|postgres(?:ql)?)\b/u,
  /\b(?:base de datos|persistencia en servidor|postgres(?:ql)?)\b/u,
  /\b(?:base de donn[ée]es|persistance serveur|postgres(?:ql)?)\b/u,
  /\b(?:datenbank|serverpersistenz|postgres(?:ql)?)\b/u,
  /\b(?:banco de dados|persist[eê]ncia no servidor|postgres(?:ql)?)\b/u,
];

const NO_SERVER_SIGNAL = [
  /\b(?:no|without) (?:api|backend|database|server|server persistence)\b/u,
  /\b(?:nessun[ao]?|senza) (?:api|backend|base dati|database|server)\b/u,
  /\b(?:ning[uú]n|sin) (?:api|backend|base de datos|servidor)\b/u,
  /\b(?:aucun|sans) (?:api|backend|base de donn[ée]es|serveur)\b/u,
  /\b(?:kein(?:e|en)?|ohne) (?:api|backend|datenbank|server)\b/u,
  /\b(?:nenhum[ao]?|sem) (?:api|backend|banco de dados|servidor)\b/u,
  ...CONDITIONAL_CAPABILITY,
];

const DATA_SIGNAL = [
  /\b(?:clients?|customers?|crud|data|inventory|records?)\b/u,
  /\b(?:clienti|dati|gestionale|inventario|record)\b/u,
  /\b(?:clientes?|datos|inventario|registros?)\b/u,
  /\b(?:clients?|donn[ée]es|inventaire|enregistrements?)\b/u,
  /\b(?:daten|inventar|kund(?:e|en)|eintr[äa]ge)\b/u,
  /\b(?:clientes?|dados|invent[aá]rio|registros?)\b/u,
];

const LOCAL_ONLY_SIGNAL = [
  /\b(?:device[- ]local|local only|offline[- ]only|on-device)\b/u,
  /\b(?:solo locale|sul dispositivo)\b/u,
  /\b(?:solo local|en el dispositivo)\b/u,
  /\b(?:local uniquement|sur l['’]appareil)\b/u,
  /\b(?:nur lokal|auf dem ger[äa]t)\b/u,
  /\b(?:somente local|no dispositivo)\b/u,
];

const IMPLEMENTATION_ONLY_NON_GOAL = [
  /\b(?:demo|fake|mock(?:ed)?|prototype|simulat(?:ed|ion)|stub(?:bed)?)\b/u,
  /\b(?:demo|fint[oa]|mock|prototipo|simulat[oa]|stub)\b/u,
  /\b(?:demo|fals[oa]|mock|prototipo|simulad[oa]|stub)\b/u,
  /\b(?:démo|fausse?|mock|prototype|simul[ée]e?|stub)\b/u,
  /\b(?:demo|gefälscht|mock|prototyp|simuliert|stub)\b/u,
];

const PAYMENT_SIGNAL = [
  /\b(?:billing|checkout|payments?|stripe|subscriptions?)\b/u,
  /\b(?:abbonament[oi]|pagament[oi])\b/u,
  /\b(?:pagos?|suscripciones?)\b/u,
  /\b(?:abonnements?|paiements?)\b/u,
  /\b(?:abonnements?|zahlungen?)\b/u,
  /\b(?:assinaturas?|pagamentos?)\b/u,
];

const PAYMENT_NEGATION = [
  /\b(?:no|without)\b[^.\n]{0,80}\b(?:billing|checkout|payments?|stripe|subscriptions?)\b/u,
  /\b(?:nessun[oa]?|niente|non|senza)\b[^.\n]{0,80}\b(?:abbonament[oi]|checkout|pagament[oi]|stripe)\b/u,
  /\b(?:ning[uú]n|no|sin)\b[^.\n]{0,80}\b(?:checkout|pagos?|stripe|suscripciones?)\b/u,
  /\b(?:aucun|pas de|sans)\b[^.\n]{0,80}\b(?:abonnements?|checkout|paiements?|stripe)\b/u,
  /\b(?:kein(?:e|en)?|ohne)\b[^.\n]{0,80}\b(?:abonnements?|checkout|stripe|zahlungen?)\b/u,
  /\b(?:n[aã]o|nenhum[ao]?|sem)\b[^.\n]{0,80}\b(?:assinaturas?|checkout|pagamentos?|stripe)\b/u,
  /\b(?:billing|checkout|payments?|stripe|subscriptions?|abbonament[oi]|pagament[oi]|pagos?|suscripciones?|abonnements?|paiements?|zahlungen?|assinaturas?|pagamentos?)\b[^.\n]{0,80}\b(?:disabled|excluded|not (?:allowed|required)|disabilitat[oa]|esclus[oa]|non richiest[oa]|deshabilitad[oa]|excluid[oa]|no requerid[oa]|désactivé|exclu|non requis|deaktiviert|ausgeschlossen|nicht erforderlich|desativad[oa]|excluíd[oa]|não exigid[oa])\b/u,
];

const PRIVILEGED_SIGNAL = [
  /\b(?:admin|administrator|back[ -]?office)\b/u,
  /\b(?:amministrator[ei]|back[ -]?office)\b/u,
  /\b(?:administrador(?:es)?|panel de administraci[oó]n|back[ -]?office)\b/u,
  /\b(?:administrateurs?|espace admin|back[ -]?office)\b/u,
  /\b(?:administrator|adminbereich|back[ -]?office)\b/u,
  /\b(?:administrador(?:es)?|painel administrativo|back[ -]?office)\b/u,
];

const PRIVILEGED_NEGATION = [
  /\b(?:no|without)\b[^.\n]{0,80}\b(?:admin|administrator|back[ -]?office)\b/u,
  /\b(?:nessun[oa]?|niente|non|senza)\b[^.\n]{0,80}\b(?:admin|amministrator[ei]|back[ -]?office)\b/u,
  /\b(?:ning[uú]n|no|sin)\b[^.\n]{0,80}\b(?:admin|administrador(?:es)?|panel de administraci[oó]n|back[ -]?office)\b/u,
  /\b(?:aucun|pas de|sans)\b[^.\n]{0,80}\b(?:admin|administrateurs?|espace admin|back[ -]?office)\b/u,
  /\b(?:kein(?:e|en)?|ohne)\b[^.\n]{0,80}\b(?:admin|administrator|adminbereich|back[ -]?office)\b/u,
  /\b(?:n[aã]o|nenhum[ao]?|sem)\b[^.\n]{0,80}\b(?:admin|administrador(?:es)?|painel administrativo|back[ -]?office)\b/u,
  /\b(?:admin|administrator|back[ -]?office|amministrator[ei]|administrador(?:es)?|panel de administraci[oó]n|administrateurs?|espace admin|adminbereich|painel administrativo)\b[^.\n]{0,80}\b(?:disabled|excluded|not (?:allowed|required)|disabilitat[oa]|esclus[oa]|non richiest[oa]|deshabilitad[oa]|excluid[oa]|no requerid[oa]|désactivé|exclu|non requis|deaktiviert|ausgeschlossen|nicht erforderlich|desativad[oa]|excluíd[oa]|não exigid[oa])\b/u,
];

const GOOGLE_OAUTH_SIGNAL = [
  /(?:sign|log)[ -]?in with google/u,
  /google[_ -]?(?:auth(?:entication)?|login|oauth|sign[ -]?in)/u,
  /(?:accesso|autenticazione|login)(?: con| tramite)? google/u,
  /(?:autenticaci[oó]n|inicio de sesi[oó]n|iniciar sesi[oó]n|login)(?: con)? google/u,
  /(?:authentification|connexion)(?: avec| via)? google/u,
  /(?:google[_ -]?(?:anmeldung|authentifizierung|oauth)|mit google anmelden)/u,
  /(?:autentica[cç][aã]o|iniciar sess[aã]o|login)(?: com)? google/u,
];

const APPLE_OAUTH_SIGNAL = [
  /(?:sign|log)[ -]?in with apple/u,
  /apple[_ -]?(?:auth(?:entication)?|login|oauth|sign[ -]?in)/u,
  /(?:accesso|autenticazione|login)(?: con| tramite)? apple/u,
  /(?:autenticaci[oó]n|inicio de sesi[oó]n|iniciar sesi[oó]n|login)(?: con)? apple/u,
  /(?:authentification|connexion)(?: avec| via)? apple/u,
  /(?:apple[_ -]?(?:anmeldung|authentifizierung|oauth)|mit apple anmelden)/u,
  /(?:autentica[cç][aã]o|iniciar sess[aã]o|login)(?: com)? apple/u,
];

const GOOGLE_OAUTH_NEGATION = [
  /\b(?:no|without)\b[^.\n]{0,80}\bgoogle\b/u,
  /\b(?:nessun[oa]?|niente|non|senza)\b[^.\n]{0,80}\bgoogle\b/u,
  /\b(?:ning[uú]n|no|sin)\b[^.\n]{0,80}\bgoogle\b/u,
  /\b(?:aucun|pas de|sans)\b[^.\n]{0,80}\bgoogle\b/u,
  /\b(?:kein(?:e|en)?|ohne)\b[^.\n]{0,80}\bgoogle\b/u,
  /\b(?:n[aã]o|nenhum[ao]?|sem)\b[^.\n]{0,80}\bgoogle\b/u,
  /\bgoogle\b[^.\n]{0,80}\b(?:disabled|excluded|not (?:allowed|required)|disabilitat[oa]|esclus[oa]|non richiest[oa]|deshabilitad[oa]|excluid[oa]|no requerid[oa]|désactivé|exclu|non requis|deaktiviert|ausgeschlossen|nicht erforderlich|desativad[oa]|excluíd[oa]|não exigid[oa])\b/u,
];

const APPLE_OAUTH_NEGATION = [
  /\b(?:no|without)\b[^.\n]{0,80}\bapple\b/u,
  /\b(?:nessun[oa]?|niente|non|senza)\b[^.\n]{0,80}\bapple\b/u,
  /\b(?:ning[uú]n|no|sin)\b[^.\n]{0,80}\bapple\b/u,
  /\b(?:aucun|pas de|sans)\b[^.\n]{0,80}\bapple\b/u,
  /\b(?:kein(?:e|en)?|ohne)\b[^.\n]{0,80}\bapple\b/u,
  /\b(?:n[aã]o|nenhum[ao]?|sem)\b[^.\n]{0,80}\bapple\b/u,
  /\bapple\b[^.\n]{0,80}\b(?:disabled|excluded|not (?:allowed|required)|disabilitat[oa]|esclus[oa]|non richiest[oa]|deshabilitad[oa]|excluid[oa]|no requerid[oa]|désactivé|exclu|non requis|deaktiviert|ausgeschlossen|nicht erforderlich|desativad[oa]|excluíd[oa]|não exigid[oa])\b/u,
];

function hasConcreteCapabilityNegation(
  fragments: readonly string[],
  patterns: readonly RegExp[],
): boolean {
  return fragments.some(
    (fragment) =>
      hasAny(fragment, patterns) && !hasAny(fragment, IMPLEMENTATION_ONLY_NON_GOAL),
  );
}

function hasUnnegatedCapability(
  fragments: readonly string[],
  signals: readonly RegExp[],
  negations: readonly RegExp[],
): boolean {
  return fragments.some(
    (fragment) =>
      hasAny(fragment, signals) &&
      !hasConcreteCapabilityNegation([fragment], negations),
  );
}

function requiresInteractiveClient(brief: Brief, plan: ProductPlan): boolean {
  return brief.form !== "site" && plan.type.toLowerCase() !== "site";
}

function apiOperationId(contract: ParsedApprovedApiContract): string {
  if (contract.path === "/api/billing/checkout" && contract.method === "POST") {
    return "create_checkout";
  }
  const webhook = /^\/api\/webhooks\/([a-z0-9_-]+)$/u.exec(contract.path);
  if (webhook && contract.method === "POST") {
    return productionIdentifier(`${webhook[1]}_webhook`);
  }
  const resource = resourceIdFromApiPath(contract.path) ?? "domain_item";
  const singular = singularProductionIdentifier(resource);
  const itemRoute = contract.path.split("/").some((segment) => segment.startsWith(":"));
  const verb =
    contract.method === "GET"
      ? itemRoute
        ? "get"
        : "list"
      : contract.method === "POST"
        ? "create"
        : contract.method === "DELETE"
          ? "remove"
          : "update";
  return productionIdentifier(`${verb}_${contract.method === "GET" && !itemRoute ? resource : singular}`);
}

function fallbackDomainId(plan: ProductPlan): string {
  const structured = plan.data.find((entry) => entry.trim().length > 0);
  const source = (structured ?? plan.title).split(/[:;,()]/u)[0] ?? plan.title;
  const identifier = productionIdentifier(source, "domain_items");
  return ["app", "application", "approved_product", "product"].includes(identifier)
    ? "domain_items"
    : identifier;
}

function apiPathForDomain(id: string): string {
  return `/api/${id.replaceAll("_", "-")}`;
}

/**
 * Convert approved Nova/Atlas evidence into the closed Production capability
 * vocabulary. This function chooses only adapters Helix can actually generate;
 * it declares environment names, never values or a configured connection.
 */
export function deriveProductionContext(input: {
  prompt: string;
  plan: ProductPlan;
  architecture: Architecture;
}): ApprovedProductionContext {
  const brief = classifyBrief(input.prompt);
  const promptFragments = evidenceStrings(input.prompt);
  const { nonGoals, ...inclusivePlan } = input.plan;
  const planFragments = evidenceStrings(inclusivePlan);
  const excludedPlanFragments = evidenceStrings(nonGoals);
  const architectureFragments = evidenceStrings(input.architecture);
  const approvedFragments = [...promptFragments, ...planFragments, ...architectureFragments];
  const source = approvedFragments.join("\n");
  const promptNeeds = new Set(detectNeeds(input.prompt));
  const architecturePayments = hasUnnegatedCapability(
    evidenceStrings([input.architecture.integrations, input.plan.integrations ?? []]),
    PAYMENT_SIGNAL,
    PAYMENT_NEGATION,
  );
  const paymentsExcluded = hasAffirmativeEvidence(
    excludedPlanFragments,
    PAYMENT_SIGNAL,
    IMPLEMENTATION_ONLY_NON_GOAL,
  );
  const paymentsNegatedInPrompt = hasConcreteCapabilityNegation(
    promptFragments,
    PAYMENT_NEGATION,
  );
  const payments =
    architecturePayments ||
    (!paymentsExcluded &&
      !paymentsNegatedInPrompt &&
      (promptNeeds.has("payments") ||
        hasUnnegatedCapability(approvedFragments, PAYMENT_SIGNAL, PAYMENT_NEGATION)));
  const structuredIntegrationFragments = evidenceStrings([
    input.architecture.integrations,
    input.plan.integrations ?? [],
  ]);
  const googleOauthExplicit = hasUnnegatedCapability(
    structuredIntegrationFragments,
    GOOGLE_OAUTH_SIGNAL,
    GOOGLE_OAUTH_NEGATION,
  );
  const appleOauthExplicit = hasUnnegatedCapability(
    structuredIntegrationFragments,
    APPLE_OAUTH_SIGNAL,
    APPLE_OAUTH_NEGATION,
  );
  const googleOauthExcluded =
    hasConcreteCapabilityNegation(promptFragments, GOOGLE_OAUTH_NEGATION) ||
    hasAffirmativeEvidence(
      excludedPlanFragments,
      GOOGLE_OAUTH_SIGNAL,
      IMPLEMENTATION_ONLY_NON_GOAL,
    );
  const appleOauthExcluded =
    hasConcreteCapabilityNegation(promptFragments, APPLE_OAUTH_NEGATION) ||
    hasAffirmativeEvidence(
      excludedPlanFragments,
      APPLE_OAUTH_SIGNAL,
      IMPLEMENTATION_ONLY_NON_GOAL,
    );
  const oauthGoogle =
    googleOauthExplicit ||
    (!googleOauthExcluded &&
      hasUnnegatedCapability(approvedFragments, GOOGLE_OAUTH_SIGNAL, GOOGLE_OAUTH_NEGATION));
  const oauthApple =
    appleOauthExplicit ||
    (!appleOauthExcluded &&
      hasUnnegatedCapability(approvedFragments, APPLE_OAUTH_SIGNAL, APPLE_OAUTH_NEGATION));
  const authExcluded = hasAffirmativeEvidence(
    excludedPlanFragments,
    AUTH_SIGNAL,
    IMPLEMENTATION_ONLY_NON_GOAL,
  );
  const explicitlyNoAuth =
    hasAny(normalizedText(input.prompt), NO_AUTH_SIGNAL) || authExcluded;
  const architectureAuth = hasAffirmativeEvidence(
    [normalizedText(input.architecture.authModel), ...evidenceStrings(input.architecture.permissions)],
    AUTH_SIGNAL,
    [...NO_AUTH_SIGNAL, ...CONDITIONAL_CAPABILITY],
  );
  const authEvidenceFragments = [
    ...promptFragments,
    ...planFragments,
    ...evidenceStrings(input.architecture.apiContracts),
    ...evidenceStrings(input.architecture.integrations),
  ].filter(
    (fragment) =>
      !hasConcreteCapabilityNegation(
        [fragment],
        [...GOOGLE_OAUTH_NEGATION, ...APPLE_OAUTH_NEGATION],
      ),
  );
  const evidenceAuth = hasAffirmativeEvidence(
    authEvidenceFragments,
    AUTH_SIGNAL,
    NO_AUTH_SIGNAL,
  );
  const promptAuthFromNeeds =
    promptNeeds.has("auth") &&
    !hasConcreteCapabilityNegation(promptFragments, [
      ...GOOGLE_OAUTH_NEGATION,
      ...APPLE_OAUTH_NEGATION,
    ]);
  const auth =
    architectureAuth ||
    (!explicitlyNoAuth &&
      (promptAuthFromNeeds || evidenceAuth || payments || oauthGoogle || oauthApple));
  const email = hasAffirmativeEvidence(approvedFragments, [
    /(?:transactional )?email/u,
    /mail notification/u,
    /notifiche? email/u,
    /notificaciones? (?:por )?correo/u,
    /notifications? (?:par )?e-?mail/u,
    /e-?mail-benachrichtig/u,
    /notifica[cç][oõ]es? (?:por )?e-?mail/u,
  ]);
  const maps = hasAny(source, [/(?:^|\s)maps?(?:\s|$)/u, /mapp[ae]/u, /geolocat/u]);
  const explicitApi = hasAffirmativeEvidence(
    evidenceStrings(input.architecture.apiContracts),
    [/.+/u],
    NO_SERVER_SIGNAL,
  );
  const explicitDatabase = hasAffirmativeEvidence(
    evidenceStrings(input.architecture.databaseRequirements),
    DATABASE_SIGNAL,
    NO_SERVER_SIGNAL,
  );
  const explicitBackend = hasAffirmativeEvidence(
    evidenceStrings([
      input.architecture.productType,
      input.architecture.backendArchitecture,
      input.plan.backend ?? "",
    ]),
    SERVER_SIGNAL,
    NO_SERVER_SIGNAL,
  );
  const explicitServer = explicitApi || explicitDatabase || explicitBackend;
  const localOnly = hasAffirmativeEvidence(approvedFragments, LOCAL_ONLY_SIGNAL);
  const evidenceData = hasAffirmativeEvidence(
    [...promptFragments, ...planFragments, ...evidenceStrings(input.architecture.dataFlow)],
    DATA_SIGNAL,
  );
  const serverData =
    explicitServer || auth || payments || email || (evidenceData && !localOnly);
  const service = serverData;
  const interactiveClient = requiresInteractiveClient(brief, input.plan);
  const privilegedExplicit = hasUnnegatedCapability(
    evidenceStrings(input.architecture.permissions),
    PRIVILEGED_SIGNAL,
    PRIVILEGED_NEGATION,
  );
  const privileged =
    auth &&
    (privilegedExplicit ||
      hasUnnegatedCapability(approvedFragments, PRIVILEGED_SIGNAL, PRIVILEGED_NEGATION));
  const uploads =
    service &&
    hasAny(source, [
      /\bupload/u,
      /carica(?:re)? file/u,
      /cargar archivos?/u,
      /t[ée]l[ée]vers/u,
      /datei(?:en)? hochladen/u,
      /enviar arquivos?/u,
    ]);

  const roles = privileged ? ["admin", "user"] : [];
  const identity = privileged ? "roles" : auth ? "accounts" : "none";
  const authenticatedAccess: ProductionRequirements["apiOperations"][number]["access"] =
    privileged
      ? { kind: "roles", roles: ["admin", "user"] }
      : { kind: "authenticated" };
  const mutationAccess: ProductionRequirements["apiOperations"][number]["access"] = auth
    ? authenticatedAccess
    : { kind: "public" };
  const integrations: ProductionRequirements["integrations"] = [];
  const apiOperations: ProductionRequirements["apiOperations"] = [];
  const operationIds = new Set<string>();
  const routeKeys = new Set<string>();

  const addOperation = (
    sourceOperation: Omit<ProductionRequirements["apiOperations"][number], "operationId"> & {
      operationId: string;
    },
  ): void => {
    const routeKey = `${sourceOperation.method} ${sourceOperation.path}`;
    if (routeKeys.has(routeKey)) return;
    let operationId = productionIdentifier(sourceOperation.operationId);
    let suffix = 2;
    while (operationIds.has(operationId)) {
      const suffixText = `_${suffix}`;
      operationId = `${productionIdentifier(sourceOperation.operationId).slice(
        0,
        80 - suffixText.length,
      )}${suffixText}`;
      suffix += 1;
    }
    operationIds.add(operationId);
    routeKeys.add(routeKey);
    apiOperations.push({ ...sourceOperation, operationId });
  };

  if (payments) {
    integrations.push({
      id: "stripe",
      kind: "stripe",
      execution: "server",
      purpose: "Collect approved checkout or subscription payments through a verified ledger.",
      envNames: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
      requiresWebhook: true,
      requiresIdempotency: true,
      requiresLedger: true,
    });
  }
  if (oauthApple) {
    integrations.push({
      id: "apple_oauth",
      kind: "apple_oauth",
      execution: "server",
      purpose: "Authenticate approved account journeys with Apple OAuth.",
      envNames: ["APPLE_CLIENT_ID", "APPLE_CLIENT_SECRET"],
      requiresCallback: true,
    });
  }
  if (email) {
    integrations.push({
      id: "email",
      kind: "email",
      execution: "server",
      purpose: "Deliver product email through an injected provider adapter.",
      envNames: ["EMAIL_API_KEY"],
    });
  }
  if (oauthGoogle) {
    integrations.push({
      id: "google_oauth",
      kind: "google_oauth",
      execution: "server",
      purpose: "Authenticate approved account journeys with Google OAuth.",
      envNames: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      requiresCallback: true,
    });
  }
  if (maps) {
    integrations.push({
      id: "maps",
      kind: "maps",
      execution: "client",
      credentialExposure: "public",
      purpose: "Render approved map views with an explicitly public browser key.",
      envNames: ["VITE_MAPS_PUBLIC_KEY"],
    });
  }

  const declaredContracts = parseApprovedApiContracts([
    ...input.architecture.apiContracts,
    ...input.architecture.routeMap,
    ...input.plan.useCases,
    ...input.plan.mvp,
    ...input.plan.acceptanceCriteria,
    ...input.plan.features,
  ]);
  if (service) {
    for (const contract of declaredContracts) {
      const stripeWebhook =
        payments && contract.method === "POST" && contract.path === "/api/webhooks/stripe";
      const adminOnly =
        privileged && hasAny(normalizedText(contract.evidence), PRIVILEGED_SIGNAL);
      const access: ProductionRequirements["apiOperations"][number]["access"] = stripeWebhook
        ? { kind: "signed_webhook", integrationId: "stripe" }
        : adminOnly
          ? { kind: "roles", roles: ["admin"] }
          : contract.method === "GET"
            ? auth
              ? authenticatedAccess
              : { kind: "public" }
            : mutationAccess;
      addOperation({
        operationId: apiOperationId(contract),
        method: contract.method,
        path: contract.path,
        access,
        rateLimitRequired: contract.method !== "GET",
        idempotencyRequired: contract.method !== "GET",
      });
    }
  }

  if (payments) {
    addOperation({
      operationId: "create_checkout",
      method: "POST",
      path: "/api/billing/checkout",
      access: authenticatedAccess,
      rateLimitRequired: true,
      idempotencyRequired: true,
    });
    addOperation({
      operationId: "stripe_webhook",
      method: "POST",
      path: "/api/webhooks/stripe",
      access: { kind: "signed_webhook", integrationId: "stripe" },
      rateLimitRequired: true,
      idempotencyRequired: true,
    });
  }

  const hasDomainOperation = apiOperations.some(
    (operation) =>
      operation.access.kind !== "signed_webhook" &&
      resourceIdFromApiPath(operation.path) !== null,
  );
  if (service && !hasDomainOperation) {
    const domainId = fallbackDomainId(input.plan);
    const singularId = singularProductionIdentifier(domainId);
    const path = apiPathForDomain(domainId);
    addOperation({
      operationId: `create_${singularId}`,
      method: "POST",
      path,
      access: mutationAccess,
      rateLimitRequired: true,
      idempotencyRequired: true,
    });
    addOperation({
      operationId: `list_${domainId}`,
      method: "GET",
      path,
      access: auth ? authenticatedAccess : { kind: "public" },
      rateLimitRequired: false,
      idempotencyRequired: false,
    });
    if (privileged) {
      addOperation({
        operationId: `remove_${singularId}`,
        method: "DELETE",
        path: `${path}/:id`,
        access: { kind: "roles", roles: ["admin"] },
        rateLimitRequired: true,
        idempotencyRequired: true,
      });
    }
  }

  integrations.sort((left, right) => compareText(left.id, right.id));
  apiOperations.sort((left, right) => compareText(left.operationId, right.operationId));

  const runtimeProfile = service
    ? "service_app"
    : interactiveClient || integrations.length > 0
      ? "client_only_app"
      : "static_site";
  const requirements = ProductionRequirementsSchema.parse({
    kind: "helix_production_requirements",
    schemaVersion: "1.0.0",
    contractPath: "docs/requirements.json",
    runtimeProfile,
    dataModel: service
      ? "server_persistent"
      : runtimeProfile === "client_only_app"
        ? "device_local"
        : "bundled_read_only",
    dataSensitivity: service
      ? auth || promptNeeds.has("privacy")
        ? "server_private"
        : "public"
      : runtimeProfile === "client_only_app"
        ? "device_private"
        : "public",
    storage: uploads ? "object_storage" : "none",
    identity,
    roles,
    serverOperations: service ? (auth ? "authenticated" : "public") : "none",
    privilegedOperations: privileged,
    monitoringScope: service
      ? "full_stack"
      : runtimeProfile === "client_only_app"
        ? "client_runtime"
        : "static_delivery",
    integrations,
    apiOperations,
    rationale: service
      ? "The approved prompt, plan, and architecture require server persistence or concrete API boundaries; generated source remains blocked until named bindings and isolated validation are available."
      : runtimeProfile === "client_only_app"
        ? "The approved product is interactive but does not require a server capability; state remains device-local."
        : "The approved product is a public static delivery with bundled read-only content.",
    evidencePaths: ["docs/architecture.json", "docs/prd.json"],
  });
  const snapshot = productionRequirementSnapshot(requirements);
  const prd = ProductionPrdEvidenceSchema.parse({
    kind: "helix_production_prd",
    schemaVersion: "1.0.0",
    title: input.plan.title,
    target: input.plan.target,
    problem: input.plan.problem,
    useCases: input.plan.useCases,
    mvp: input.plan.mvp,
    nonGoals: input.plan.nonGoals,
    userJourneys: input.plan.userJourneys,
    acceptanceCriteria: input.plan.acceptanceCriteria,
    requirements: snapshot,
  });
  const architecture = ProductionArchitectureEvidenceSchema.parse({
    kind: "helix_production_architecture",
    schemaVersion: "1.0.0",
    productType: input.architecture.productType,
    frontendArchitecture: input.architecture.frontendArchitecture,
    backendArchitecture: input.architecture.backendArchitecture,
    dataFlow: input.architecture.dataFlow,
    screenMap: input.architecture.screenMap,
    routeMap: input.architecture.routeMap,
    apiContracts: input.architecture.apiContracts,
    databaseRequirements: input.architecture.databaseRequirements,
    authModel: input.architecture.authModel,
    deploymentTarget: "netlify",
    failureModes: input.architecture.failureModes,
    requirements: snapshot,
  });
  return ApprovedProductionContextSchema.parse({ requirements, prd, architecture });
}
