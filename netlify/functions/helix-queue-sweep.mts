import type { Config } from "@netlify/functions";
import {
  dispatchBuildJobFromNetlify,
  listDispatchableBuildJobIds,
} from "../../src/lib/server/jobs/recovery";

function queueSecret(): string {
  const secret = Netlify.env.get("HELIX_QUEUE_DISPATCH_SECRET")?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("HELIX_QUEUE_DISPATCH_SECRET_MISSING");
  }
  return secret;
}

function siteOrigin(request: Request): string {
  const configuredUrl = Netlify.env.get("URL")?.trim();
  return new URL(configuredUrl || request.url).origin;
}

export default async function helixQueueSweep(request: Request): Promise<void> {
  const secret = queueSecret();
  const origin = siteOrigin(request);
  const jobIds = await listDispatchableBuildJobIds();
  const dispatches = await Promise.allSettled(
    jobIds.map((jobId) => dispatchBuildJobFromNetlify(jobId, origin, secret)),
  );
  const failed = dispatches.filter(
    (dispatch): dispatch is PromiseRejectedResult => dispatch.status === "rejected",
  );

  console.info(
    JSON.stringify({
      level: failed.length ? "warn" : "info",
      event: "helix_queue_sweep",
      listed: jobIds.length,
      dispatched: jobIds.length - failed.length,
      failed: failed.length,
    }),
  );

  if (failed.length) {
    throw new Error("HELIX_QUEUE_SWEEP_DISPATCH_FAILED");
  }
}

export const config: Config = {
  schedule: "* * * * *",
};
