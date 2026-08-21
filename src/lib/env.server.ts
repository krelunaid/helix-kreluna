import { z } from "zod";
import { getRuntimeDatabaseConnection } from "@/lib/database-connection.server";
import { isHostedRuntimeEnvironment } from "@/lib/hosted-runtime";
import { normalizePublicHostname, publicOriginFromHostname } from "@/lib/env.shared";
import { verifyNetlifyPullRequestDeploy } from "@/lib/preview-deploy";
import { resolveOpenAiGatewayConfiguration } from "@/lib/server/ai/providers/openai";
import { PREVIEW_TEST_CREDIT_GRANT } from "@/lib/server/preview-credit-grant";
import { WardenPolicySchema } from "@/lib/server/operations/warden";

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.string().optional(),
);

const rawEnvironmentSchema = z.object({
  HELIX_AI_GATEWAY_ENABLED: z.enum(["true", "false"]).optional(),
  HELIX_PREVIEW_CREDIT_GRANT_ENABLED: z.enum(["true", "false"]).optional(),
  HELIX_PREVIEW_CREDIT_GRANT_AMOUNT: optionalText,
  HELIX_PREVIEW_CREDIT_GRANT_USER_ID: optionalText,
  HELIX_PREVIEW_CREDIT_GRANT_EMAIL: optionalText,
  HELIX_PREVIEW_EXPECTED_REVIEW_ID: optionalText,
  HELIX_PREVIEW_EXPECTED_COMMIT_REF: optionalText,
  NETLIFY_AI_GATEWAY_KEY: optionalText,
  NETLIFY_AI_GATEWAY_BASE_URL: optionalText,
  OPENAI_API_KEY: optionalText,
  OPENAI_BASE_URL: optionalText,
  DATABASE_URL: optionalText,
  NETLIFY_DB_URL: optionalText,
  BETTER_AUTH_SECRET: optionalText,
  BETTER_AUTH_URL: optionalText,
  GUEST_RATE_LIMIT_SALT: optionalText,
  HELIX_QUEUE_DISPATCH_SECRET: optionalText,
  STRIPE_BILLING_ENABLED: z.enum(["true", "false"]).optional(),
  STRIPE_MODE: z.enum(["test", "live"]).optional(),
  STRIPE_SECRET_KEY: optionalText,
  STRIPE_WEBHOOK_SECRET: optionalText,
  STRIPE_PRICE_STANDARD: optionalText,
  STRIPE_PRICE_PRO: optionalText,
  STRIPE_PRICE_TEAM: optionalText,
  STRIPE_PRICE_EXTRA_50: optionalText,
  STRIPE_PORTAL_CONFIGURATION_ID: optionalText,
  HELIX_BILLING_DISPATCH_SECRET: optionalText,
  HELIX_WARDEN_ENABLED: z.enum(["true", "false"]).optional(),
  HELIX_WARDEN_ADAPTER_ID: optionalText,
  HELIX_WARDEN_SOURCE_ID: optionalText,
  HELIX_WARDEN_SOURCE_URL: optionalText,
  HELIX_WARDEN_SOURCE_TOKEN: optionalText,
  HELIX_WARDEN_POLICY_JSON: optionalText,
  HELIX_WARDEN_ALERT_DEDUP_TTL_MS: optionalText,
  HELIX_WARDEN_DISPATCH_SECRET: optionalText,
  HELIX_NIMBUS_EVIDENCE_URL: optionalText,
  HELIX_NIMBUS_EVIDENCE_TOKEN: optionalText,
  HELIX_NIMBUS_EVIDENCE_SOURCE_ID: optionalText,
  HELIX_NIMBUS_EVIDENCE_KEY_ID: optionalText,
  HELIX_NIMBUS_EVIDENCE_HMAC_SECRET: optionalText,
  HELIX_NIMBUS_EVIDENCE_MAX_AGE_MS: optionalText,
  HELIX_AUGUR_EVIDENCE_URL: optionalText,
  HELIX_AUGUR_EVIDENCE_TOKEN: optionalText,
  HELIX_AUGUR_EVIDENCE_SOURCE_ID: optionalText,
  HELIX_AUGUR_EVIDENCE_KEY_ID: optionalText,
  HELIX_AUGUR_EVIDENCE_HMAC_SECRET: optionalText,
  HELIX_AUGUR_EVIDENCE_MAX_AGE_MS: optionalText,
  VITE_AUTH_ENABLED: z.enum(["true", "false"]).optional(),
  VITE_GROK_AUTH_ENABLED: z.enum(["true", "false"]).optional(),
  VITE_GOOGLE_AUTH_ENABLED: z.enum(["true", "false"]).optional(),
  VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED: z.enum(["true", "false"]).optional(),
  VITE_PUBLIC_HOSTNAME: optionalText,
  VITE_PUBLIC_ORIGIN: optionalText,
  GROK_AUTH_ISSUER: optionalText,
  GROK_AUTH_CLIENT_ID: optionalText,
  GROK_AUTH_CLIENT_SECRET: optionalText,
  GOOGLE_CLIENT_ID: optionalText,
  GOOGLE_CLIENT_SECRET: optionalText,
  GITHUB_TOKEN_ENCRYPTION_KEY: optionalText,
  GITHUB_TOKEN_KEY_VERSION: optionalText,
  HELIX_BROWSER_RUNNER_URL: optionalText,
  HELIX_BROWSER_RUNNER_SECRET: optionalText,
  HELIX_WORKSPACE_RUNNER_URL: optionalText,
  HELIX_WORKSPACE_RUNNER_SECRET: optionalText,
  HELIX_STORE_RUNNER_URL: optionalText,
  HELIX_STORE_RUNNER_SECRET: optionalText,
  HELIX_HARBOR_RUNNER_URL: optionalText,
  HELIX_HARBOR_RUNNER_SECRET: optionalText,
  HELIX_HARBOR_SWEEPER_ENABLED: z.enum(["true", "false"]).optional(),
  HELIX_HARBOR_SWEEPER_DISPATCH_SECRET: optionalText,
  VITE_PRODUCTION_BUILDS_ENABLED: z.enum(["true", "false"]).optional(),
  VITE_PRODUCTION_CREDITS: optionalText,
  VITE_STUN_URLS: optionalText,
  VITE_PROJECT_ID: optionalText,
  VITE_OG_SERVICE_URL: optionalText,
  X_CREATOR: optionalText,
  X_CREATOR_ID: optionalText,
  NETLIFY: optionalText,
  NETLIFY_DEPLOY_ID: optionalText,
  DEPLOY_ID: optionalText,
  SITE_ID: optionalText,
  SITE_NAME: optionalText,
  PULL_REQUEST: optionalText,
  REVIEW_ID: optionalText,
  DEPLOY_PRIME_URL: optionalText,
  AWS_LAMBDA_FUNCTION_NAME: optionalText,
  LAMBDA_TASK_ROOT: optionalText,
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
  HELIX_RUNTIME_ENV: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
    z.enum(["local", "production"]).optional(),
  ),
  CONTEXT: optionalText,
  COMMIT_REF: optionalText,
});

export class ConfigurationError extends Error {
  readonly code = "HELIX_CONFIGURATION_ERROR";

  constructor(names: Iterable<string>) {
    const unique = [...new Set(names)].sort();
    super(`Invalid or missing environment variables: ${unique.join(", ")}`);
    this.name = "ConfigurationError";
  }
}

function isOriginOnly(value: string, requireHttps: boolean): boolean {
  try {
    const url = new URL(value);
    return (
      (!requireHttps || url.protocol === "https:") &&
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function isPostgresUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  } catch {
    return false;
  }
}

export function validateServerEnvironment(input: NodeJS.ProcessEnv = process.env) {
  const parsed = rawEnvironmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ConfigurationError(
      parsed.error.issues.map((issue) => String(issue.path[0] ?? "environment")),
    );
  }

  const values = parsed.data;
  const invalid: string[] = [];
  let runtimeDatabaseConnection: ReturnType<typeof getRuntimeDatabaseConnection> | undefined;
  if (input === process.env) {
    try {
      runtimeDatabaseConnection = getRuntimeDatabaseConnection();
    } catch {
      invalid.push("DATABASE_URL", "NETLIFY_DB_URL");
    }
  }
  const required = (name: keyof typeof values, condition = true) => {
    if (condition && !values[name]) invalid.push(name);
  };
  const verifiedNetlifyPullRequestDeploy = verifyNetlifyPullRequestDeploy(values);
  const isHostedRuntime =
    isHostedRuntimeEnvironment(values) || verifiedNetlifyPullRequestDeploy !== null;
  // Preserve the public property used by auth origin policy, but broaden its
  // meaning to every positively identified hosted runtime. NODE_ENV alone is
  // deliberately insufficient because Vite production builds run locally.
  const isNetlify = isHostedRuntime;
  const isProduction =
    isHostedRuntime &&
    verifiedNetlifyPullRequestDeploy === null &&
    (values.CONTEXT === "production" ||
      values.HELIX_RUNTIME_ENV === "production" ||
      (!values.CONTEXT && values.NODE_ENV === "production"));
  const authEnabled = values.VITE_AUTH_ENABLED === "true";
  const grokAuthEnabled = values.VITE_GROK_AUTH_ENABLED === "true";
  const googleAuthEnabled = values.VITE_GOOGLE_AUTH_ENABLED === "true";
  const previewPasswordSignInRequested = values.VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED === "true";
  const previewPasswordSignInEnabled =
    previewPasswordSignInRequested &&
    authEnabled &&
    !grokAuthEnabled &&
    !googleAuthEnabled &&
    verifiedNetlifyPullRequestDeploy !== null;
  const aiGatewayEnabled = values.HELIX_AI_GATEWAY_ENABLED === "true";
  const previewCreditGrantEnabled = values.HELIX_PREVIEW_CREDIT_GRANT_ENABLED === "true";
  const stripeBillingEnabled = values.STRIPE_BILLING_ENABLED === "true";
  const productionBuildsEnabled = values.VITE_PRODUCTION_BUILDS_ENABLED === "true";
  const wardenEnabled = values.HELIX_WARDEN_ENABLED === "true";
  const productionBuildCredits = values.VITE_PRODUCTION_CREDITS
    ? Number(values.VITE_PRODUCTION_CREDITS)
    : null;

  if (values.VITE_PUBLIC_ORIGIN) invalid.push("VITE_PUBLIC_ORIGIN (deprecated)");
  for (const name of ["VITE_GOOGLE_CLIENT_ID", "VITE_GOOGLE_CLIENT_SECRET"] as const) {
    if (input[name]?.trim()) invalid.push(`${name} (server-only)`);
  }

  let hostname = "";
  try {
    hostname = normalizePublicHostname(values.VITE_PUBLIC_HOSTNAME);
  } catch {
    invalid.push("VITE_PUBLIC_HOSTNAME");
  }

  if (values.DATABASE_URL && !isPostgresUrl(values.DATABASE_URL)) {
    invalid.push("DATABASE_URL");
  }
  if (values.NETLIFY_DB_URL && !isPostgresUrl(values.NETLIFY_DB_URL)) {
    invalid.push("NETLIFY_DB_URL");
  }
  // Gateway credentials are injected into server compute, not necessarily the
  // build. Keep disabled startup non-mutating/tolerant and validate only the
  // complete pair that the call boundary would select. A partial native pair
  // may coexist with a complete OpenAI-compatible Netlify pair.
  if (aiGatewayEnabled) {
    const selectedBaseName =
      values.NETLIFY_AI_GATEWAY_KEY && values.NETLIFY_AI_GATEWAY_BASE_URL
        ? "NETLIFY_AI_GATEWAY_BASE_URL"
        : "OPENAI_BASE_URL";
    try {
      resolveOpenAiGatewayConfiguration(values);
    } catch {
      invalid.push(selectedBaseName);
    }
  }
  const isolatedNetlifyBranch =
    verifiedNetlifyPullRequestDeploy !== null ||
    values.CONTEXT === "deploy-preview" ||
    values.CONTEXT === "branch-deploy";
  const previewGrantAmount = values.HELIX_PREVIEW_CREDIT_GRANT_AMOUNT
    ? Number(values.HELIX_PREVIEW_CREDIT_GRANT_AMOUNT)
    : null;
  const previewGrantUserId = values.HELIX_PREVIEW_CREDIT_GRANT_USER_ID ?? "";
  const previewGrantEmail = values.HELIX_PREVIEW_CREDIT_GRANT_EMAIL?.toLowerCase() ?? "";
  const previewGrantHasDormantConfiguration =
    !previewCreditGrantEnabled &&
    Boolean(
      values.HELIX_PREVIEW_CREDIT_GRANT_AMOUNT ||
      values.HELIX_PREVIEW_CREDIT_GRANT_USER_ID ||
      values.HELIX_PREVIEW_CREDIT_GRANT_EMAIL,
    );
  if (previewCreditGrantEnabled) {
    required("HELIX_PREVIEW_CREDIT_GRANT_AMOUNT");
    required("HELIX_PREVIEW_CREDIT_GRANT_USER_ID");
    required("HELIX_PREVIEW_CREDIT_GRANT_EMAIL");
  }
  if (
    previewGrantHasDormantConfiguration ||
    (previewCreditGrantEnabled &&
      (!Number.isSafeInteger(previewGrantAmount) ||
        previewGrantAmount !== PREVIEW_TEST_CREDIT_GRANT.amount ||
        previewGrantUserId.length < 1 ||
        previewGrantUserId.length > 255 ||
        [...previewGrantUserId].some((character) => {
          const code = character.charCodeAt(0);
          return code <= 31 || code === 127;
        }) ||
        previewGrantEmail.length > 254 ||
        !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/u.test(previewGrantEmail)))
  ) {
    invalid.push(
      "HELIX_PREVIEW_CREDIT_GRANT_ENABLED",
      "HELIX_PREVIEW_CREDIT_GRANT_AMOUNT",
      "HELIX_PREVIEW_CREDIT_GRANT_USER_ID",
      "HELIX_PREVIEW_CREDIT_GRANT_EMAIL",
    );
  }
  const hostedPreviewGrantContext =
    isHostedRuntime &&
    verifiedNetlifyPullRequestDeploy !== null &&
    (runtimeDatabaseConnection?.source === "netlify" ||
      (input !== process.env && Boolean(values.NETLIFY_DB_URL))) &&
    authEnabled;
  const localPreviewGrantContext = !isHostedRuntime && values.NODE_ENV === "test";
  if (
    previewCreditGrantEnabled &&
    (stripeBillingEnabled || (!hostedPreviewGrantContext && !localPreviewGrantContext))
  ) {
    invalid.push("HELIX_PREVIEW_CREDIT_GRANT_ENABLED");
  }
  const netlifyDeployContext = isolatedNetlifyBranch || values.CONTEXT === "production";
  if (
    netlifyDeployContext &&
    values.DATABASE_URL &&
    values.NETLIFY_DB_URL &&
    values.DATABASE_URL !== values.NETLIFY_DB_URL
  ) {
    invalid.push("DATABASE_URL", "NETLIFY_DB_URL");
  }
  if (values.BETTER_AUTH_URL && !isOriginOnly(values.BETTER_AUTH_URL, isHostedRuntime)) {
    invalid.push("BETTER_AUTH_URL");
  }
  if (values.GROK_AUTH_ISSUER && !isOriginOnly(values.GROK_AUTH_ISSUER, isHostedRuntime)) {
    invalid.push("GROK_AUTH_ISSUER");
  }
  const previewPasswordExpectationNames = [
    "HELIX_PREVIEW_EXPECTED_REVIEW_ID",
    "HELIX_PREVIEW_EXPECTED_COMMIT_REF",
  ] as const;
  const configuredPreviewPasswordExpectations = previewPasswordExpectationNames.filter((name) =>
    Boolean(values[name]),
  );
  if (previewPasswordSignInRequested) {
    for (const name of previewPasswordExpectationNames) required(name);
    if (!authEnabled) invalid.push("VITE_AUTH_ENABLED");
    if (grokAuthEnabled || googleAuthEnabled) {
      invalid.push(
        ...(grokAuthEnabled ? ["VITE_GROK_AUTH_ENABLED"] : []),
        ...(googleAuthEnabled ? ["VITE_GOOGLE_AUTH_ENABLED"] : []),
        "VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED",
      );
    }
    if (!verifiedNetlifyPullRequestDeploy) {
      invalid.push(
        "VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED",
        "NETLIFY",
        "CONTEXT",
        "PULL_REQUEST",
        "REVIEW_ID",
        "COMMIT_REF",
        "DEPLOY_ID",
        "SITE_ID",
        "SITE_NAME",
        "DEPLOY_PRIME_URL",
        ...previewPasswordExpectationNames,
      );
    } else {
      const previewHostname = new URL(verifiedNetlifyPullRequestDeploy.deployPrimeUrl).hostname;
      if (hostname !== previewHostname) invalid.push("VITE_PUBLIC_HOSTNAME");
      if (values.BETTER_AUTH_URL !== verifiedNetlifyPullRequestDeploy.deployPrimeUrl) {
        invalid.push("BETTER_AUTH_URL");
      }
    }
  } else if (configuredPreviewPasswordExpectations.length > 0) {
    invalid.push("VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED", ...previewPasswordExpectationNames);
  }
  const grokAuthCredentialNames = ["GROK_AUTH_CLIENT_ID", "GROK_AUTH_CLIENT_SECRET"] as const;
  const configuredGrokAuthCredentials = grokAuthCredentialNames.filter((name) =>
    Boolean(values[name]),
  );
  if (
    configuredGrokAuthCredentials.length > 0 &&
    configuredGrokAuthCredentials.length !== grokAuthCredentialNames.length
  ) {
    for (const name of grokAuthCredentialNames) required(name);
  }
  if (grokAuthEnabled) {
    for (const name of grokAuthCredentialNames) required(name);
    if (!authEnabled) invalid.push("VITE_AUTH_ENABLED");
  } else if (configuredGrokAuthCredentials.length > 0) {
    invalid.push("VITE_GROK_AUTH_ENABLED");
  }
  const googleAuthCredentialNames = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;
  const configuredGoogleAuthCredentials = googleAuthCredentialNames.filter((name) =>
    Boolean(values[name]),
  );
  if (
    configuredGoogleAuthCredentials.length > 0 &&
    configuredGoogleAuthCredentials.length !== googleAuthCredentialNames.length
  ) {
    for (const name of googleAuthCredentialNames) required(name);
  }
  if (googleAuthEnabled) {
    for (const name of googleAuthCredentialNames) required(name);
    if (!authEnabled) invalid.push("VITE_AUTH_ENABLED");
    if (!isProduction) invalid.push("VITE_GOOGLE_AUTH_ENABLED");
  } else if (configuredGoogleAuthCredentials.length > 0) {
    invalid.push("VITE_GOOGLE_AUTH_ENABLED");
  }
  if (grokAuthEnabled && googleAuthEnabled) {
    invalid.push("VITE_GROK_AUTH_ENABLED", "VITE_GOOGLE_AUTH_ENABLED");
  }
  if (authEnabled && !previewPasswordSignInEnabled && !grokAuthEnabled && !googleAuthEnabled) {
    invalid.push(
      "VITE_GROK_AUTH_ENABLED",
      "VITE_GOOGLE_AUTH_ENABLED",
      "VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED",
    );
  }
  if (
    values.GITHUB_TOKEN_ENCRYPTION_KEY &&
    !/^(?:[0-9a-fA-F]{64}|[A-Za-z0-9_-]{43}=?)$/.test(values.GITHUB_TOKEN_ENCRYPTION_KEY)
  ) {
    invalid.push("GITHUB_TOKEN_ENCRYPTION_KEY");
  }
  if (
    values.GITHUB_TOKEN_KEY_VERSION &&
    !/^[A-Za-z0-9._-]{1,40}$/.test(values.GITHUB_TOKEN_KEY_VERSION)
  ) {
    invalid.push("GITHUB_TOKEN_KEY_VERSION");
  }
  if (values.HELIX_BROWSER_RUNNER_URL) {
    try {
      const runnerUrl = new URL(values.HELIX_BROWSER_RUNNER_URL);
      const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(runnerUrl.hostname);
      if (
        (runnerUrl.protocol !== "https:" && !(loopback && runnerUrl.protocol === "http:")) ||
        runnerUrl.username ||
        runnerUrl.password ||
        runnerUrl.hash
      ) {
        invalid.push("HELIX_BROWSER_RUNNER_URL");
      }
    } catch {
      invalid.push("HELIX_BROWSER_RUNNER_URL");
    }
  }
  if (values.HELIX_BROWSER_RUNNER_SECRET && values.HELIX_BROWSER_RUNNER_SECRET.length < 32) {
    invalid.push("HELIX_BROWSER_RUNNER_SECRET");
  }
  if (Boolean(values.HELIX_BROWSER_RUNNER_URL) !== Boolean(values.HELIX_BROWSER_RUNNER_SECRET)) {
    invalid.push("HELIX_BROWSER_RUNNER_URL", "HELIX_BROWSER_RUNNER_SECRET");
  }
  if (values.HELIX_WORKSPACE_RUNNER_URL) {
    try {
      const runnerUrl = new URL(values.HELIX_WORKSPACE_RUNNER_URL);
      const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(runnerUrl.hostname);
      if (
        (runnerUrl.protocol !== "https:" && !(loopback && runnerUrl.protocol === "http:")) ||
        runnerUrl.username ||
        runnerUrl.password ||
        runnerUrl.hash
      ) {
        invalid.push("HELIX_WORKSPACE_RUNNER_URL");
      }
    } catch {
      invalid.push("HELIX_WORKSPACE_RUNNER_URL");
    }
  }
  if (values.HELIX_WORKSPACE_RUNNER_SECRET && values.HELIX_WORKSPACE_RUNNER_SECRET.length < 32) {
    invalid.push("HELIX_WORKSPACE_RUNNER_SECRET");
  }
  if (
    Boolean(values.HELIX_WORKSPACE_RUNNER_URL) !== Boolean(values.HELIX_WORKSPACE_RUNNER_SECRET)
  ) {
    invalid.push("HELIX_WORKSPACE_RUNNER_URL", "HELIX_WORKSPACE_RUNNER_SECRET");
  }
  if (values.HELIX_STORE_RUNNER_URL) {
    try {
      const runnerUrl = new URL(values.HELIX_STORE_RUNNER_URL);
      const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(runnerUrl.hostname);
      if (
        (runnerUrl.protocol !== "https:" && !(loopback && runnerUrl.protocol === "http:")) ||
        runnerUrl.username ||
        runnerUrl.password ||
        runnerUrl.search ||
        runnerUrl.hash
      ) {
        invalid.push("HELIX_STORE_RUNNER_URL");
      }
    } catch {
      invalid.push("HELIX_STORE_RUNNER_URL");
    }
  }
  if (values.HELIX_STORE_RUNNER_SECRET && values.HELIX_STORE_RUNNER_SECRET.length < 32) {
    invalid.push("HELIX_STORE_RUNNER_SECRET");
  }
  if (Boolean(values.HELIX_STORE_RUNNER_URL) !== Boolean(values.HELIX_STORE_RUNNER_SECRET)) {
    invalid.push("HELIX_STORE_RUNNER_URL", "HELIX_STORE_RUNNER_SECRET");
  }
  if (values.HELIX_HARBOR_RUNNER_URL) {
    try {
      const runnerUrl = new URL(values.HELIX_HARBOR_RUNNER_URL);
      const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(runnerUrl.hostname);
      if (
        (runnerUrl.protocol !== "https:" && !(loopback && runnerUrl.protocol === "http:")) ||
        runnerUrl.username ||
        runnerUrl.password ||
        runnerUrl.search ||
        runnerUrl.hash
      ) {
        invalid.push("HELIX_HARBOR_RUNNER_URL");
      }
    } catch {
      invalid.push("HELIX_HARBOR_RUNNER_URL");
    }
  }
  if (values.HELIX_HARBOR_RUNNER_SECRET && values.HELIX_HARBOR_RUNNER_SECRET.length < 32) {
    invalid.push("HELIX_HARBOR_RUNNER_SECRET");
  }
  if (Boolean(values.HELIX_HARBOR_RUNNER_URL) !== Boolean(values.HELIX_HARBOR_RUNNER_SECRET)) {
    invalid.push("HELIX_HARBOR_RUNNER_URL", "HELIX_HARBOR_RUNNER_SECRET");
  }
  if (
    values.HELIX_HARBOR_SWEEPER_DISPATCH_SECRET &&
    values.HELIX_HARBOR_SWEEPER_DISPATCH_SECRET.length < 32
  ) {
    invalid.push("HELIX_HARBOR_SWEEPER_DISPATCH_SECRET");
  }
  if (values.HELIX_HARBOR_SWEEPER_ENABLED === "true") {
    required("HELIX_HARBOR_SWEEPER_DISPATCH_SECRET");
  }
  if (isHostedRuntime && values.HELIX_HARBOR_RUNNER_URL && values.HELIX_HARBOR_RUNNER_SECRET) {
    if (values.HELIX_HARBOR_SWEEPER_ENABLED !== "true") {
      invalid.push("HELIX_HARBOR_SWEEPER_ENABLED");
    }
    required("HELIX_HARBOR_SWEEPER_DISPATCH_SECRET");
  }
  if (
    productionBuildCredits !== null &&
    (!Number.isInteger(productionBuildCredits) ||
      productionBuildCredits < 1 ||
      productionBuildCredits > 100_000)
  ) {
    invalid.push("VITE_PRODUCTION_CREDITS");
  }
  if (productionBuildsEnabled) {
    required("VITE_PRODUCTION_CREDITS");
    required("HELIX_WORKSPACE_RUNNER_URL");
    required("HELIX_WORKSPACE_RUNNER_SECRET");
    if (!authEnabled) invalid.push("VITE_AUTH_ENABLED");
  } else if (values.VITE_PRODUCTION_CREDITS) {
    invalid.push("VITE_PRODUCTION_BUILDS_ENABLED");
  }

  const stripeNames = [
    "STRIPE_MODE",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_STANDARD",
    "STRIPE_PRICE_PRO",
    "STRIPE_PRICE_TEAM",
    "STRIPE_PRICE_EXTRA_50",
    "STRIPE_PORTAL_CONFIGURATION_ID",
    "HELIX_BILLING_DISPATCH_SECRET",
  ] as const;
  const stripeValuesPresent = stripeNames.filter((name) => Boolean(values[name]));
  if (stripeBillingEnabled || stripeValuesPresent.length > 0) {
    for (const name of stripeNames) required(name);
  }
  required("VITE_PUBLIC_HOSTNAME", stripeBillingEnabled);
  if (!stripeBillingEnabled && stripeValuesPresent.length > 0) {
    invalid.push("STRIPE_BILLING_ENABLED");
  }
  if (
    values.STRIPE_SECRET_KEY &&
    !/^(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+$/.test(values.STRIPE_SECRET_KEY)
  ) {
    invalid.push("STRIPE_SECRET_KEY");
  }
  if (values.STRIPE_WEBHOOK_SECRET && !/^whsec_[A-Za-z0-9]+$/.test(values.STRIPE_WEBHOOK_SECRET)) {
    invalid.push("STRIPE_WEBHOOK_SECRET");
  }
  for (const name of [
    "STRIPE_PRICE_STANDARD",
    "STRIPE_PRICE_PRO",
    "STRIPE_PRICE_TEAM",
    "STRIPE_PRICE_EXTRA_50",
  ] as const) {
    if (values[name] && !/^price_[A-Za-z0-9]+$/.test(values[name])) invalid.push(name);
  }
  if (
    values.STRIPE_PORTAL_CONFIGURATION_ID &&
    !/^bpc_[A-Za-z0-9]+$/.test(values.STRIPE_PORTAL_CONFIGURATION_ID)
  ) {
    invalid.push("STRIPE_PORTAL_CONFIGURATION_ID");
  }
  if (values.HELIX_BILLING_DISPATCH_SECRET && values.HELIX_BILLING_DISPATCH_SECRET.length < 32) {
    invalid.push("HELIX_BILLING_DISPATCH_SECRET");
  }
  if (values.STRIPE_SECRET_KEY && values.STRIPE_MODE) {
    const keyMode = values.STRIPE_SECRET_KEY.includes("_live_") ? "live" : "test";
    if (keyMode !== values.STRIPE_MODE) invalid.push("STRIPE_MODE", "STRIPE_SECRET_KEY");
  }
  if (stripeBillingEnabled && isProduction && values.STRIPE_MODE !== "live") {
    invalid.push("STRIPE_MODE");
  }

  const wardenNames = [
    "HELIX_WARDEN_ADAPTER_ID",
    "HELIX_WARDEN_SOURCE_ID",
    "HELIX_WARDEN_SOURCE_URL",
    "HELIX_WARDEN_SOURCE_TOKEN",
    "HELIX_WARDEN_POLICY_JSON",
    "HELIX_WARDEN_ALERT_DEDUP_TTL_MS",
    "HELIX_WARDEN_DISPATCH_SECRET",
  ] as const;
  const wardenValuesPresent = wardenNames.filter((name) => Boolean(values[name]));
  if (wardenEnabled || wardenValuesPresent.length > 0) {
    for (const name of wardenNames) required(name);
  }
  required("COMMIT_REF", wardenEnabled);
  if (!wardenEnabled && wardenValuesPresent.length > 0) {
    invalid.push("HELIX_WARDEN_ENABLED");
  }
  if (
    values.HELIX_WARDEN_ADAPTER_ID &&
    !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(values.HELIX_WARDEN_ADAPTER_ID)
  ) {
    invalid.push("HELIX_WARDEN_ADAPTER_ID");
  }
  if (
    values.HELIX_WARDEN_SOURCE_ID &&
    !/^[A-Za-z0-9][A-Za-z0-9._:/ -]{0,159}$/.test(values.HELIX_WARDEN_SOURCE_ID)
  ) {
    invalid.push("HELIX_WARDEN_SOURCE_ID");
  }
  if (values.HELIX_WARDEN_SOURCE_URL) {
    try {
      const url = new URL(values.HELIX_WARDEN_SOURCE_URL);
      const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
      if (
        (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        invalid.push("HELIX_WARDEN_SOURCE_URL");
      }
    } catch {
      invalid.push("HELIX_WARDEN_SOURCE_URL");
    }
  }
  if (values.HELIX_WARDEN_SOURCE_TOKEN && values.HELIX_WARDEN_SOURCE_TOKEN.length < 32) {
    invalid.push("HELIX_WARDEN_SOURCE_TOKEN");
  }
  if (values.HELIX_WARDEN_DISPATCH_SECRET && values.HELIX_WARDEN_DISPATCH_SECRET.length < 32) {
    invalid.push("HELIX_WARDEN_DISPATCH_SECRET");
  }
  if (values.HELIX_WARDEN_POLICY_JSON) {
    try {
      WardenPolicySchema.parse(JSON.parse(values.HELIX_WARDEN_POLICY_JSON) as unknown);
    } catch {
      invalid.push("HELIX_WARDEN_POLICY_JSON");
    }
  }
  if (values.HELIX_WARDEN_ALERT_DEDUP_TTL_MS) {
    const ttl = Number(values.HELIX_WARDEN_ALERT_DEDUP_TTL_MS);
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 30 * 24 * 60 * 60 * 1_000) {
      invalid.push("HELIX_WARDEN_ALERT_DEDUP_TTL_MS");
    }
  }

  const nimbusEvidenceNames = [
    "HELIX_NIMBUS_EVIDENCE_URL",
    "HELIX_NIMBUS_EVIDENCE_TOKEN",
    "HELIX_NIMBUS_EVIDENCE_SOURCE_ID",
    "HELIX_NIMBUS_EVIDENCE_KEY_ID",
    "HELIX_NIMBUS_EVIDENCE_HMAC_SECRET",
    "HELIX_NIMBUS_EVIDENCE_MAX_AGE_MS",
  ] as const;
  const configuredNimbusEvidenceNames = nimbusEvidenceNames.filter((name) => Boolean(values[name]));
  if (
    configuredNimbusEvidenceNames.length > 0 &&
    configuredNimbusEvidenceNames.length !== nimbusEvidenceNames.length
  ) {
    for (const name of nimbusEvidenceNames) required(name);
  }
  if (values.HELIX_NIMBUS_EVIDENCE_URL) {
    try {
      const url = new URL(values.HELIX_NIMBUS_EVIDENCE_URL);
      const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
      if (
        (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        invalid.push("HELIX_NIMBUS_EVIDENCE_URL");
      }
    } catch {
      invalid.push("HELIX_NIMBUS_EVIDENCE_URL");
    }
  }
  for (const name of [
    "HELIX_NIMBUS_EVIDENCE_TOKEN",
    "HELIX_NIMBUS_EVIDENCE_HMAC_SECRET",
  ] as const) {
    if (values[name] && values[name].length < 32) invalid.push(name);
  }
  for (const name of ["HELIX_NIMBUS_EVIDENCE_SOURCE_ID", "HELIX_NIMBUS_EVIDENCE_KEY_ID"] as const) {
    if (values[name] && !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(values[name])) {
      invalid.push(name);
    }
  }
  if (values.HELIX_NIMBUS_EVIDENCE_MAX_AGE_MS) {
    const maxAge = Number(values.HELIX_NIMBUS_EVIDENCE_MAX_AGE_MS);
    if (!Number.isInteger(maxAge) || maxAge < 1 || maxAge > 30 * 24 * 60 * 60 * 1_000) {
      invalid.push("HELIX_NIMBUS_EVIDENCE_MAX_AGE_MS");
    }
  }

  const augurEvidenceNames = [
    "HELIX_AUGUR_EVIDENCE_URL",
    "HELIX_AUGUR_EVIDENCE_TOKEN",
    "HELIX_AUGUR_EVIDENCE_SOURCE_ID",
    "HELIX_AUGUR_EVIDENCE_KEY_ID",
    "HELIX_AUGUR_EVIDENCE_HMAC_SECRET",
    "HELIX_AUGUR_EVIDENCE_MAX_AGE_MS",
  ] as const;
  const configuredAugurEvidenceNames = augurEvidenceNames.filter((name) => Boolean(values[name]));
  if (
    configuredAugurEvidenceNames.length > 0 &&
    configuredAugurEvidenceNames.length !== augurEvidenceNames.length
  ) {
    for (const name of augurEvidenceNames) required(name);
  }
  if (values.HELIX_AUGUR_EVIDENCE_URL) {
    try {
      const url = new URL(values.HELIX_AUGUR_EVIDENCE_URL);
      const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
      if (
        (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        invalid.push("HELIX_AUGUR_EVIDENCE_URL");
      }
    } catch {
      invalid.push("HELIX_AUGUR_EVIDENCE_URL");
    }
  }
  for (const name of ["HELIX_AUGUR_EVIDENCE_TOKEN", "HELIX_AUGUR_EVIDENCE_HMAC_SECRET"] as const) {
    if (values[name] && values[name].length < 32) invalid.push(name);
  }
  for (const name of ["HELIX_AUGUR_EVIDENCE_SOURCE_ID", "HELIX_AUGUR_EVIDENCE_KEY_ID"] as const) {
    if (values[name] && !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(values[name])) {
      invalid.push(name);
    }
  }
  if (values.HELIX_AUGUR_EVIDENCE_MAX_AGE_MS) {
    const maxAge = Number(values.HELIX_AUGUR_EVIDENCE_MAX_AGE_MS);
    if (!Number.isInteger(maxAge) || maxAge < 1 || maxAge > 30 * 24 * 60 * 60 * 1_000) {
      invalid.push("HELIX_AUGUR_EVIDENCE_MAX_AGE_MS");
    }
  }

  if (isHostedRuntime) {
    if (!runtimeDatabaseConnection && !values.DATABASE_URL && !values.NETLIFY_DB_URL) {
      invalid.push("DATABASE_URL", "NETLIFY_DB_URL");
    }
    if (
      isolatedNetlifyBranch &&
      runtimeDatabaseConnection?.source !== "netlify" &&
      !values.NETLIFY_DB_URL
    ) {
      invalid.push("NETLIFY_DB_URL");
    }
    required("VITE_PUBLIC_HOSTNAME");
    required("VITE_AUTH_ENABLED");
    required("BETTER_AUTH_SECRET");
    required("BETTER_AUTH_URL");
    required("HELIX_QUEUE_DISPATCH_SECRET");
    required("GITHUB_TOKEN_ENCRYPTION_KEY");
    required("GITHUB_TOKEN_KEY_VERSION");
    if (!authEnabled) invalid.push("VITE_AUTH_ENABLED");
  }

  if (authEnabled) {
    required("BETTER_AUTH_SECRET");
    required("BETTER_AUTH_URL");
  }

  if (values.BETTER_AUTH_SECRET && values.BETTER_AUTH_SECRET.length < 32) {
    invalid.push("BETTER_AUTH_SECRET");
  }
  if (values.GUEST_RATE_LIMIT_SALT && values.GUEST_RATE_LIMIT_SALT.length < 32) {
    invalid.push("GUEST_RATE_LIMIT_SALT");
  }
  if (values.HELIX_QUEUE_DISPATCH_SECRET && values.HELIX_QUEUE_DISPATCH_SECRET.length < 32) {
    invalid.push("HELIX_QUEUE_DISPATCH_SECRET");
  }

  const publicOrigin = hostname ? publicOriginFromHostname(hostname) : "";
  if (
    isHostedRuntime &&
    values.BETTER_AUTH_URL &&
    publicOrigin &&
    values.BETTER_AUTH_URL !== publicOrigin
  ) {
    invalid.push("BETTER_AUTH_URL", "VITE_PUBLIC_HOSTNAME");
  }

  if (invalid.length) throw new ConfigurationError(invalid);

  return Object.freeze({
    ...values,
    databaseConfigured: Boolean(
      runtimeDatabaseConnection ?? values.DATABASE_URL ?? values.NETLIFY_DB_URL,
    ),
    databaseSource:
      runtimeDatabaseConnection?.source ??
      (values.DATABASE_URL ? "postgres" : values.NETLIFY_DB_URL ? "netlify" : null),
    authEnabled,
    grokAuthEnabled,
    googleAuthEnabled,
    googleAuthCallbackUrl:
      googleAuthEnabled && publicOrigin ? `${publicOrigin}/api/auth/callback/google` : null,
    previewPasswordSignInEnabled,
    verifiedNetlifyPullRequestDeploy,
    aiGatewayEnabled,
    previewCreditGrantEnabled,
    previewCreditGrantAmount: previewGrantAmount,
    stripeBillingEnabled,
    wardenEnabled,
    productionBuildsEnabled,
    productionBuildCredits,
    hostname,
    publicOrigin,
    isNetlify,
    isHostedRuntime,
    isProduction,
  });
}

// Imported by the server entry before DB/auth initialization. Local builds may
// use PGLite; any positively identified hosted runtime fails closed when
// persistence/auth/AI config is incomplete instead of silently degrading to
// process-local mock behavior.
export const serverEnv = validateServerEnvironment();
