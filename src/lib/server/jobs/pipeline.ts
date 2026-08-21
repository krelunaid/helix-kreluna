import type { BuildJob } from "@/lib/agent-types";

export const HELIX_PIPELINE_VERSION = "helix-v3";

const RESUMABLE_PIPELINE_VERSIONS = new Set(["helix-v2"]);

export type PipelineCheckpointReconciliation =
  | "compatible"
  | "migrated"
  | "reset";

function clearVersionBoundOutputs(job: BuildJob): void {
  job.files = undefined;
  job.workspace = undefined;
  job.production = undefined;
  job.html = null;
  job.usedAi = false;
  job.quality = undefined;
  job.score = undefined;
  job.wire = undefined;
  job.liveUrl = undefined;
  job.stores = undefined;
}

/**
 * Reconcile a durable checkpoint before either orchestrator reads it.
 *
 * A v2 checkpoint with the same immutable request fingerprint can retain its
 * stage, typed source artifacts, gem cursor and gem results. Version-bound
 * release outputs are discarded so the active pipeline must parse, validate,
 * rebuild and seal those artifacts again. Every other mismatch resets closed.
 */
export function reconcileBuildJobPipeline(
  job: BuildJob,
  requestFingerprint: string,
): PipelineCheckpointReconciliation {
  const checkpoint = job.checkpoint;
  if (
    checkpoint?.pipelineVersion === HELIX_PIPELINE_VERSION &&
    checkpoint.requestFingerprint === requestFingerprint
  ) {
    return "compatible";
  }

  if (
    checkpoint &&
    RESUMABLE_PIPELINE_VERSIONS.has(checkpoint.pipelineVersion) &&
    checkpoint.requestFingerprint === requestFingerprint
  ) {
    checkpoint.pipelineVersion = HELIX_PIPELINE_VERSION;
    clearVersionBoundOutputs(job);
    return "migrated";
  }

  job.checkpoint = {
    pipelineVersion: HELIX_PIPELINE_VERSION,
    requestFingerprint,
    stage: "queued",
  };
  job.gems = [];
  clearVersionBoundOutputs(job);
  return "reset";
}
