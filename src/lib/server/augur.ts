import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  AugurIngestionError,
  runConfiguredAugurCapacityIngestion,
} from "@/lib/server/quality/augur";

/**
 * Explicit authenticated pull. It never starts a benchmark itself: the
 * configured source must return a fresh, signed bundle for the exact current
 * deployed artifact, otherwise the request fails closed without mutation.
 */
export const refreshAugurCapacity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { projectId: string; jobId: string; requestId: string }) => ({
    projectId:
      typeof input.projectId === "string" ? input.projectId.trim().slice(0, 128) : "",
    jobId: typeof input.jobId === "string" ? input.jobId.trim().slice(0, 128) : "",
    requestId:
      typeof input.requestId === "string"
        ? input.requestId.trim().toLowerCase().slice(0, 64)
        : "",
  }))
  .handler(async ({ context, data }) => {
    try {
      return await runConfiguredAugurCapacityIngestion({
        environment: process.env,
        userId: context.userId,
        projectId: data.projectId,
        jobId: data.jobId,
        requestId: data.requestId,
      });
    } catch (error) {
      if (
        error instanceof AugurIngestionError &&
        (error.code === "AUGUR_INGESTION_BUSY" || error.code === "AUGUR_INGESTION_COOLDOWN")
      ) {
        return Object.freeze({
          status: "not_run" as const,
          evidence: "not_run" as const,
          reasonCode:
            error.code === "AUGUR_INGESTION_BUSY"
              ? ("augur_ingestion_busy" as const)
              : ("augur_ingestion_cooldown" as const),
          detail: "A capacity evidence pull is already active or inside its tenant/job/deploy cooldown.",
          retryAfterMs: Math.max(1, error.retryAfterMs ?? 1_000),
        });
      }
      throw error;
    }
  });
