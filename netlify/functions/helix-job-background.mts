import { createHash, timingSafeEqual } from "node:crypto";
import type { Config } from "@netlify/functions";
import {
  dispatchBuildJobFromNetlify,
  HELIX_QUEUE_HEADER,
} from "../../src/lib/server/jobs/recovery";
import { HELIX_PREVIEW_ORIGIN_HEADER } from "../../src/lib/server/jobs/netlify-preview-dispatch";

type BuildJobRequest = { jobId?: unknown };

function queueSecret(): string | null {
  const secret = Netlify.env.get("HELIX_QUEUE_DISPATCH_SECRET")?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

function constantTimeTokenEqual(presented: string, expected: string): boolean {
  const presentedDigest = createHash("sha256").update(presented, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(presentedDigest, expectedDigest);
}

function validJobId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 128 &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value)
  );
}

function logRejected(reason: "configuration" | "authorization" | "payload"): void {
  console.warn(
    JSON.stringify({
      level: "warn",
      event: "helix_background_request_rejected",
      reason,
    }),
  );
}

export default async function helixJobBackground(request: Request): Promise<void> {
  const expectedSecret = queueSecret();
  if (!expectedSecret) {
    logRejected("configuration");
    return;
  }

  const presentedSecret = request.headers.get(HELIX_QUEUE_HEADER);
  if (!presentedSecret || !constantTimeTokenEqual(presentedSecret, expectedSecret)) {
    logRejected("authorization");
    return;
  }

  let body: BuildJobRequest;
  try {
    body = (await request.json()) as BuildJobRequest;
  } catch {
    logRejected("payload");
    return;
  }
  if (!validJobId(body.jobId)) {
    logRejected("payload");
    return;
  }

  // Keep the expensive worker and its model/DB dependencies behind auth.
  const { processBuildJob } = await import("../../src/lib/server/jobs/worker");
  const result = await processBuildJob(body.jobId);
  if (result === "retry") {
    await dispatchBuildJobFromNetlify(body.jobId, new URL(request.url).origin, expectedSecret, {
      requestUrl: request.url,
      cookieHeader: request.headers.get("cookie"),
      // Read only after the queue token gate. The initial server dispatch sets
      // this from verifyNetlifyPullRequestDeploy(), never from a browser header.
      verifiedDeployPrimeUrl: request.headers.get(HELIX_PREVIEW_ORIGIN_HEADER),
    });
  }
}

export const config: Config = {
  background: true,
  method: "POST",
};
