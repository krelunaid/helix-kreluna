import { isHostedRuntimeEnvironment } from "@/lib/hosted-runtime";
import {
  type NetlifyPreviewDeployEnvironment,
  verifyNetlifyPullRequestDeploy,
} from "@/lib/preview-deploy";
import {
  HELIX_PREVIEW_ORIGIN_HEADER,
  netlifyPreviewDispatchCredentials,
  type NetlifyPreviewDispatchContext,
} from "@/lib/server/jobs/netlify-preview-dispatch";

const BACKGROUND_FUNCTION_PATH = "/.netlify/functions/helix-job-background";
export const HELIX_QUEUE_HEADER = "x-helix-queue-token";

export class BuildDispatchError extends Error {
  readonly code = "BUILD_JOB_DISPATCH_FAILED";
  readonly status = 503;
  readonly upstreamStatus: number | null;

  constructor(message = "BUILD_JOB_DISPATCH_FAILED", upstreamStatus: number | null = null) {
    super(message);
    this.name = "BuildDispatchError";
    this.upstreamStatus = upstreamStatus;
  }
}

function dispatchSecret(): string {
  const secret = process.env.HELIX_QUEUE_DISPATCH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new BuildDispatchError("HELIX_QUEUE_DISPATCH_SECRET_MISSING");
  }
  return secret;
}

export function netlifyPreviewRequestContext(
  request: Request,
  environment: NetlifyPreviewDeployEnvironment = process.env,
): NetlifyPreviewDispatchContext {
  const verifiedPreview = verifyNetlifyPullRequestDeploy(environment);
  return Object.freeze({
    requestUrl: request.url,
    cookieHeader: request.headers.get("cookie"),
    verifiedDeployPrimeUrl: verifiedPreview?.deployPrimeUrl ?? null,
  });
}

export async function dispatchBuildJobToOrigin(
  jobId: string,
  origin: string,
  secret: string,
  requestContext: NetlifyPreviewDispatchContext,
): Promise<void> {
  const target = new URL(BACKGROUND_FUNCTION_PATH, origin);
  const headers = new Headers({
    "content-type": "application/json",
    [HELIX_QUEUE_HEADER]: secret,
  });
  const previewCredentials = netlifyPreviewDispatchCredentials(target, requestContext);
  if (previewCredentials) {
    headers.set("cookie", previewCredentials.cookieHeader);
    headers.set(HELIX_PREVIEW_ORIGIN_HEADER, previewCredentials.previewOrigin);
  }

  const response = await fetch(target, {
    method: "POST",
    headers,
    body: JSON.stringify({ jobId }),
    // Never carry the queue token or a preview perimeter session through a
    // platform redirect. A protected same-origin function should answer 202.
    redirect: "manual",
  });
  if (response.status !== 202) {
    throw new BuildDispatchError(`BUILD_JOB_DISPATCH_FAILED_${response.status}`, response.status);
  }
}

export async function dispatchBuildJob(jobId: string): Promise<void> {
  if (isHostedRuntimeEnvironment()) {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const requestUrl = new URL(request.url);
    await dispatchBuildJobToOrigin(
      jobId,
      requestUrl.origin,
      dispatchSecret(),
      netlifyPreviewRequestContext(request),
    );
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
