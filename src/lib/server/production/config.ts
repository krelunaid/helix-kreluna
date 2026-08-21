import { BuildLevelError } from "@/lib/build-level";
import { serverEnv } from "@/lib/env.server";
import { assertProductionWorkspaceRunnerConfigured } from "@/lib/server/workspace-runner";

export function requireProductionBuildCredits(): number {
  if (!serverEnv.productionBuildsEnabled || serverEnv.productionBuildCredits === null) {
    throw new BuildLevelError("PRODUCTION_MODE_NOT_AVAILABLE");
  }
  assertProductionWorkspaceRunnerConfigured();
  return serverEnv.productionBuildCredits;
}
