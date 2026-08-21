import { getConnectionString as getNetlifyDatabaseConnectionString } from "@netlify/database";
import {
  isHostedRuntimeEnvironment,
  isNetlifyRuntimeEnvironment,
} from "./hosted-runtime";

export type RuntimeDatabaseConnection = Readonly<{
  connectionString: string;
  source: "postgres" | "netlify";
}>;

function postgresConnectionString(value: string | undefined, name: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    const protocol = new URL(trimmed).protocol;
    if (protocol === "postgres:" || protocol === "postgresql:") return trimmed;
  } catch {
    // Diagnostics name the variable only; URLs can contain credentials.
  }
  throw new Error(`Invalid or missing environment variables: ${name}`);
}

/**
 * Resolve the one durable connection identity used by the app and Better Auth.
 * In a Netlify runtime the SDK is authoritative because `globalThis.Netlify.env`
 * can differ from `process.env`; a second raw URL is accepted only when it is
 * byte-identical to the SDK result.
 */
export function resolveRuntimeDatabaseConnection(
  environment: NodeJS.ProcessEnv,
  readNetlifyConnectionString: () => string = getNetlifyDatabaseConnectionString,
): RuntimeDatabaseConnection | undefined {
  const direct = postgresConnectionString(environment.DATABASE_URL, "DATABASE_URL");
  const rawNetlify = postgresConnectionString(environment.NETLIFY_DB_URL, "NETLIFY_DB_URL");
  const netlifyRuntime = isNetlifyRuntimeEnvironment(environment);

  if (netlifyRuntime || rawNetlify) {
    let sdkConnectionString: string;
    try {
      sdkConnectionString = postgresConnectionString(
        readNetlifyConnectionString(),
        "NETLIFY_DB_URL (Netlify Database SDK)",
      ) as string;
    } catch (error) {
      throw new Error(
        "Invalid or missing environment variables: NETLIFY_DB_URL " +
          "(Netlify Database SDK is authoritative in Netlify runtimes)",
        { cause: error },
      );
    }

    for (const [name, value] of [
      ["DATABASE_URL", direct],
      ["NETLIFY_DB_URL", rawNetlify],
    ] as const) {
      if (value && value !== sdkConnectionString) {
        throw new Error(
          `Invalid environment variables: ${name} diverges from the authoritative ` +
            "Netlify Database SDK connection",
        );
      }
    }
    return Object.freeze({ connectionString: sdkConnectionString, source: "netlify" });
  }

  if (direct) return Object.freeze({ connectionString: direct, source: "postgres" });
  if (isHostedRuntimeEnvironment(environment)) {
    throw new Error(
      "Invalid or missing environment variables: DATABASE_URL, NETLIFY_DB_URL " +
        "(PGLite is local-only in hosted runtimes)",
    );
  }
  return undefined;
}

let resolved = false;
let connection: RuntimeDatabaseConnection | undefined;
let resolutionError: unknown;

/** Process-stable singleton so every Postgres consumer receives the exact same URL. */
export function getRuntimeDatabaseConnection(): RuntimeDatabaseConnection | undefined {
  if (!resolved) {
    resolved = true;
    try {
      connection = resolveRuntimeDatabaseConnection(process.env);
    } catch (error) {
      resolutionError = error;
    }
  }
  if (resolutionError) throw resolutionError;
  return connection;
}
