import { z } from "zod";
import { isHostedRuntimeEnvironment } from "@/lib/hosted-runtime";
import { normalizePublicHostname, publicOriginFromHostname } from "@/lib/env.shared";
import { WardenPolicySchema } from "@/lib/server/operations/warden";

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.string().optional(),
);

const rawEnvironmentSchema = z.object({
  XAI_API_KEY: optionalText,
  DATABASE_URL: optionalText,
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
  VITE_PUBLIC_HOSTNAME: optionalText,
  VITE_PUBLIC_ORIGIN: optionalText,
  GROK_AUTH_ISSUER: optionalText,
  GROK_AUTH_CLIENT_ID: optionalText,
  GROK_AUTH_CLIENT_SECRET: optionalText,
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
  const required = (name: keyof typeof values, condition = true) => {
    if (condition && !values[name]) invalid.push(name);
  };
  const isHostedRuntime = isHostedRuntimeEnvironment(values);
  // Preserve the public property used by auth origin policy, but broaden its
  // meaning to every positively identified hosted runtime. NODE_ENV alone is
  // deliberately insufficient because Vite production builds run locally.
  const isNetlify = isHostedRuntime;
  const isProduction =
    isHostedRuntime &&
    (values.CONTEXT === "production" ||
      values.HELIX_RUNTIME_ENV === "production" ||
      (!values.CONTEXT && values.NODE_ENV === "production"));
  const authEnabled = values.VITE_AUTH_ENABLED === "true";
  const stripeBillingEnabled = values.STRIPE_BILLING_ENABLED === "true";
  const productionBuildsEnabled = values.VITE_PRODUCTION_BUILDS_ENABLED === "true";
  const wardenEnabled = values.HELIX_WARDEN_ENABLED === "true";
  const productionBuildCredits = values.VITE_PRODUCTION_CREDITS
    ? Number(values.VITE_PRODUCTION_CREDITS)
    : null;

  if (values.VITE_PUBLIC_ORIGIN) invalid.push("VITE_PUBLIC_ORIGIN (deprecated)");

  let hostname = "";
  try {
    hostname = normalizePublicHostname(values.VITE_PUBLIC_HOSTNAME);
  } catch {
    invalid.push("VITE_PUBLIC_HOSTNAME");
  }

  if (values.DATABASE_URL && !isPostgresUrl(values.DATABASE_URL)) {
    invalid.push("DATABASE_URL");
  }
  if (values.BETTER_AUTH_URL && !isOriginOnly(values.BETTER_AUTH_URL, isHostedRuntime)) {
    invalid.push("BETTER_AUTH_URL");
  }
  if (values.GROK_AUTH_ISSUER && !isOriginOnly(values.GROK_AUTH_ISSUER, isHostedRuntime)) {
    invalid.push("GROK_AUTH_ISSUER");
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
    required("DATABASE_URL");
    required("VITE_PUBLIC_HOSTNAME");
    required("VITE_AUTH_ENABLED");
    required("BETTER_AUTH_SECRET");
    required("BETTER_AUTH_URL");
    required("GROK_AUTH_CLIENT_ID");
    required("GROK_AUTH_CLIENT_SECRET");
    required("XAI_API_KEY");
    required("HELIX_QUEUE_DISPATCH_SECRET");
    required("GITHUB_TOKEN_ENCRYPTION_KEY");
    required("GITHUB_TOKEN_KEY_VERSION");
    if (!authEnabled) invalid.push("VITE_AUTH_ENABLED");
  }

  if (authEnabled) {
    required("GROK_AUTH_CLIENT_ID");
    required("GROK_AUTH_CLIENT_SECRET");
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
    authEnabled,
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
