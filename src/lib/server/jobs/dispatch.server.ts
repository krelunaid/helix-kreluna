const BACKGROUND_FUNCTION_PATH = "/.netlify/functions/helix-job-background";
export const HELIX_QUEUE_HEADER = "x-helix-queue-token";

export class BuildDispatchError extends Error {
  readonly code = "BUILD_JOB_DISPATCH_FAILED";
  readonly status = 503;

  constructor(message = "BUILD_JOB_DISPATCH_FAILED") {
    super(message);
    this.name = "BuildDispatchError";
  }
}

function dispatchSecret(): string {
  const secret = process.env.HELIX_QUEUE_DISPATCH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new BuildDispatchError("HELIX_QUEUE_DISPATCH_SECRET_MISSING");
  }
  return secret;
}

export async function dispatchBuildJobToOrigin(
  jobId: string,
  origin: string,
  secret = dispatchSecret(),
): Promise<void> {
  const response = await fetch(new URL(BACKGROUND_FUNCTION_PATH, origin), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [HELIX_QUEUE_HEADER]: secret,
    },
    body: JSON.stringify({ jobId }),
  });
  if (!response.ok) {
    throw new BuildDispatchError(`BUILD_JOB_DISPATCH_FAILED_${response.status}`);
  }
}

export async function dispatchBuildJob(jobId: string): Promise<void> {
  if (process.env.NETLIFY === "true") {
    const { getRequestUrl } = await import("@tanstack/react-start/server");
    await dispatchBuildJobToOrigin(jobId, getRequestUrl().origin);
    return;
  }

  queueMicrotask(() => {
    void import("@/lib/server/jobs/worker")
      .then(({ processBuildJob }) => processBuildJob(jobId))
      .then(async (result) => {
        if (result === "retry") await dispatchBuildJob(jobId);
      })
      .catch((error: unknown) => {
        console.error(
          JSON.stringify({
            level: "error",
            event: "local_build_job_dispatch_failed",
            jobId,
            errorName: error instanceof Error ? error.name : "UnknownError",
          }),
        );
      });
  });
}
