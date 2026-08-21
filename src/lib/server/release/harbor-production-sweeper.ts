import { getSql, type Sql } from "@/lib/db";
import {
  createAuthenticatedHarborProductionProvider,
  HarborProductionRunnerError,
  type HarborProductionProviderAdapter,
} from "@/lib/server/release/harbor-production-runner";
import {
  sweepExpiredHarborProductionReservations,
  type HarborProductionSweepResult,
} from "@/lib/server/release/harbor-production-release";

export function isHarborProductionSweeperEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return environment.HELIX_HARBOR_SWEEPER_ENABLED?.trim() === "true";
}

export async function runConfiguredHarborProductionSweep(
  input: {
    environment?: Record<string, string | undefined>;
    sql?: Sql;
    provider?: HarborProductionProviderAdapter;
    limit?: number;
  } = {},
): Promise<HarborProductionSweepResult | null> {
  const environment = input.environment ?? process.env;
  if (!isHarborProductionSweeperEnabled(environment)) return null;
  const sql = input.sql ?? (await getSql());
  let provider = input.provider;
  if (!provider) {
    try {
      provider = createAuthenticatedHarborProductionProvider({ env: environment });
    } catch (error) {
      const configurationError =
        error instanceof HarborProductionRunnerError
          ? error
          : new HarborProductionRunnerError("HARBOR_PRODUCTION_RUNNER_UNCONFIGURED");
      provider = {
        execute: async () => {
          throw configurationError;
        },
      };
    }
  }
  return sweepExpiredHarborProductionReservations({
    sql,
    provider,
    limit: input.limit,
  });
}
