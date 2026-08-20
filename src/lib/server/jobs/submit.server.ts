import { createBuildJobDraft, type BuildJobDraftInput } from "@/lib/server/jobs/create";
import { dispatchBuildJob } from "@/lib/server/jobs/dispatch.server";
import { enqueueBuildJob } from "@/lib/server/jobs/queue";

export async function enqueueBuild(
  input: BuildJobDraftInput & { idempotencyKey?: string },
): Promise<string> {
  const { job, requestFingerprint } = await createBuildJobDraft(input);
  const queued = await enqueueBuildJob({
    job,
    requestFingerprint,
    idempotencyKey: input.idempotencyKey ?? `build:${job.id}`,
  });
  try {
    await dispatchBuildJob(queued.jobId);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "build_job_dispatch_deferred",
        jobId: queued.jobId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      }),
    );
  }
  return queued.jobId;
}
