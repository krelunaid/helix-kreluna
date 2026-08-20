import { z } from "zod";
import { normalizePublicHostname, publicOriginFromHostname } from "@/lib/env.shared";

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
  APPLE_TEAM_ID: optionalText,
  PLAY_SERVICE_JSON: optionalText,
  EXPO_TOKEN: optionalText,
  VITE_STUN_URLS: optionalText,
  VITE_PROJECT_ID: optionalText,
  VITE_OG_SERVICE_URL: optionalText,
  X_CREATOR: optionalText,
  X_CREATOR_ID: optionalText,
  NETLIFY: optionalText,
  CONTEXT: optionalText,
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
  const isNetlify = values.NETLIFY === "true";
  const isProduction = isNetlify && values.CONTEXT === "production";
  const authEnabled = values.VITE_AUTH_ENABLED === "true";

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
  if (values.BETTER_AUTH_URL && !isOriginOnly(values.BETTER_AUTH_URL, isNetlify)) {
    invalid.push("BETTER_AUTH_URL");
  }
  if (values.GROK_AUTH_ISSUER && !isOriginOnly(values.GROK_AUTH_ISSUER, isNetlify)) {
    invalid.push("GROK_AUTH_ISSUER");
  }
  if (values.PLAY_SERVICE_JSON) {
    try {
      const parsedJson: unknown = JSON.parse(values.PLAY_SERVICE_JSON);
      if (!parsedJson || typeof parsedJson !== "object" || Array.isArray(parsedJson)) {
        invalid.push("PLAY_SERVICE_JSON");
      }
    } catch {
      invalid.push("PLAY_SERVICE_JSON");
    }
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

  const required = (name: keyof typeof values, condition = true) => {
    if (condition && !values[name]) invalid.push(name);
  };

  if (isNetlify) {
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
    isNetlify &&
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
    hostname,
    publicOrigin,
    isNetlify,
    isProduction,
  });
}

// Imported by the server entry before DB/auth initialization. Local builds may
// use PGLite; any Netlify runtime fails closed when persistence/auth/AI config
// is incomplete instead of silently degrading to process-local mock behavior.
export const serverEnv = validateServerEnvironment();
