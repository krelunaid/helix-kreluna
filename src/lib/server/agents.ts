import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { PublicBuildJob } from "@/lib/agent-types";
import type { Gear } from "@/lib/house";
import { normalizeLocale, t } from "@/lib/i18n-core";
import type { ActionId } from "@/lib/plans";
import { LegacyBuildEndpointRetiredError } from "@/lib/server/agents/types";
import { assertBuildLevelAvailable, parseBuildLevel, type BuildLevel } from "@/lib/build-level";
import { assertAiGenerationEnabled } from "@/lib/server/ai/availability";
import { assertGuestAiGenerationAllowed } from "@/lib/server/ai/guest-availability";

export type { AgentId, AgentStep, BuildJob, PublicBuildJob } from "@/lib/agent-types";

const GUEST_AI_INPUT_CHAR_CAP = 128 * 1024 + 1;

export const startBuild = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      prompt: string;
      locale?: string;
      mode?: ActionId;
      buildLevel?: BuildLevel;
      currentHtml?: string | null;
      projectId: string;
      gear?: Gear;
      max?: boolean;
    }) => ({
      prompt: typeof input.prompt === "string" ? input.prompt.trim().slice(0, 2_000) : "",
      locale: normalizeLocale(input.locale),
      mode:
        input.mode === "debug" || input.mode === "iterate" || input.mode === "generate"
          ? input.mode
          : ("generate" as const),
      buildLevel: parseBuildLevel(input.buildLevel),
      currentHtml: input.currentHtml ?? null,
      projectId: typeof input.projectId === "string" ? input.projectId.trim().slice(0, 128) : "",
      gear: (input.gear === "house" || input.gear === "fast" ? input.gear : "auto") as Gear,
      max: Boolean(input.max),
    }),
  )
  .handler(async ({ data }) => {
    if (!data.prompt) throw new Error(t(data.locale, "err.describe"));
    assertBuildLevelAvailable({
      buildLevel: data.buildLevel,
      action: data.mode,
      authenticated: true,
    });
    throw new LegacyBuildEndpointRetiredError();
  });

export const startGuestBuild = createServerFn({ method: "POST" })
  .validator(
    (input: {
      prompt: string;
      locale?: string;
      mode?: ActionId;
      buildLevel?: BuildLevel;
      currentHtml?: string | null;
      gear?: Gear;
      max?: boolean;
      sourceJobId?: string;
      sourceGuestAccessToken?: string;
      requestId?: string;
    }) => ({
      prompt: typeof input.prompt === "string" ? input.prompt.trim().slice(0, 2_000) : "",
      locale: normalizeLocale(input.locale),
      mode:
        input.mode === "debug" || input.mode === "iterate" || input.mode === "generate"
          ? input.mode
          : ("generate" as const),
      buildLevel: parseBuildLevel(input.buildLevel),
      currentHtml:
        typeof input.currentHtml === "string"
          ? input.currentHtml.slice(0, GUEST_AI_INPUT_CHAR_CAP)
          : null,
      gear: (input.gear === "house" || input.gear === "fast" ? input.gear : "auto") as Gear,
      max: Boolean(input.max),
      sourceJobId:
        typeof input.sourceJobId === "string" ? input.sourceJobId.trim().slice(0, 128) : undefined,
      sourceGuestAccessToken:
        typeof input.sourceGuestAccessToken === "string"
          ? input.sourceGuestAccessToken.trim().slice(0, 128)
          : undefined,
      requestId:
        typeof input.requestId === "string" ? input.requestId.trim().toLowerCase() : undefined,
    }),
  )
  .handler(async ({ data }) => {
    if (!data.prompt) throw new Error(t(data.locale, "err.describe"));
    assertAiGenerationEnabled();
    assertGuestAiGenerationAllowed();
    // Fail before source lookup, abuse-budget reservation or provider work.
    assertBuildLevelAvailable({
      buildLevel: data.buildLevel,
      action: data.mode,
      authenticated: false,
    });
    let sourceHtml = data.currentHtml;
    if (data.sourceJobId) {
      if (
        !data.sourceGuestAccessToken ||
        !data.requestId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          data.requestId,
        )
      ) {
        const { BuildJobForbiddenError } = await import("@/lib/server/build-job-access");
        throw new BuildJobForbiddenError();
      }
      const { loadBuildJob } = await import("@/lib/server/jobs/queue");
      const { assertGuestBuildAccess, BuildJobForbiddenError } =
        await import("@/lib/server/build-job-access");
      const source = await loadBuildJob(data.sourceJobId);
      if (
        !source ||
        source.userId ||
        source.projectId ||
        !source.html ||
        source.buildLevel !== data.buildLevel
      ) {
        throw new BuildJobForbiddenError();
      }
      await assertGuestBuildAccess({
        presentedToken: data.sourceGuestAccessToken,
        storedTokenHash: source.guestAccessTokenHash,
        expiresAt: source.guestAccessExpiresAt,
      });
      sourceHtml = source.html;
    }
    const inputBytes = new TextEncoder().encode(`${data.prompt}\n${sourceHtml ?? ""}`).byteLength;
    const { releaseGuestBudget, reserveGuestAiBudget } =
      await import("@/lib/server/guest-abuse.server");
    const lease = await reserveGuestAiBudget({ inputBytes });
    let leaseHandled = false;
    try {
      const { createGuestBuildCredential, deriveGuestBuildCredential } =
        await import("@/lib/server/build-job-access");
      const credential = data.sourceJobId
        ? await deriveGuestBuildCredential(
            data.sourceGuestAccessToken as string,
            data.requestId as string,
          )
        : await createGuestBuildCredential();
      let jobId: string;
      let expiresAt = credential.expiresAt;
      if (data.sourceJobId) {
        const { createBuildJobDraft } = await import("@/lib/server/jobs/create");
        const { enqueueGuestGateModification } = await import("@/lib/server/review/human-gate");
        const { dispatchBuildJob } = await import("@/lib/server/jobs/dispatch.server");
        const { job, requestFingerprint } = await createBuildJobDraft({
          prompt: data.prompt,
          locale: data.locale,
          mode: data.mode,
          buildLevel: data.buildLevel,
          currentHtml: sourceHtml,
          gear: data.gear,
          max: data.max,
          guestAccessTokenHash: credential.tokenHash,
          guestAccessExpiresAt: credential.expiresAt,
          guestBudgetLease: lease,
        });
        const queued = await enqueueGuestGateModification({
          sourceJobId: data.sourceJobId,
          sourceGuestAccessToken: data.sourceGuestAccessToken as string,
          requestId: data.requestId as string,
          reason: data.prompt,
          childJob: job,
          childRequestFingerprint: requestFingerprint,
        });
        jobId = queued.jobId;
        expiresAt = queued.expiresAt;
        if (queued.wasCreated) {
          leaseHandled = true;
        } else {
          await releaseGuestBudget(lease);
          leaseHandled = true;
        }
        try {
          await dispatchBuildJob(jobId);
        } catch (error) {
          console.error(
            JSON.stringify({
              level: "error",
              event: "build_job_dispatch_deferred",
              jobId,
              errorName: error instanceof Error ? error.name : "UnknownError",
            }),
          );
        }
      } else {
        const { enqueueBuild } = await import("@/lib/server/jobs/submit.server");
        jobId = await enqueueBuild({
          prompt: data.prompt,
          locale: data.locale,
          mode: data.mode,
          buildLevel: data.buildLevel,
          currentHtml: sourceHtml,
          gear: data.gear,
          max: data.max,
          guestAccessTokenHash: credential.tokenHash,
          guestAccessExpiresAt: credential.expiresAt,
          guestBudgetLease: lease,
        });
        leaseHandled = true;
      }
      return {
        jobId,
        guestAccessToken: credential.token,
        expiresAt,
      };
    } catch (error) {
      if (!leaseHandled) await releaseGuestBudget(lease);
      throw error;
    }
  });

export const getBuildJob = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { jobId?: string; projectId?: string }) => ({
    jobId: typeof input.jobId === "string" ? input.jobId.trim().slice(0, 128) : undefined,
    projectId:
      typeof input.projectId === "string" ? input.projectId.trim().slice(0, 128) : undefined,
  }))
  .handler(async ({ context, data }): Promise<PublicBuildJob | null> => {
    const { getOwnedBuildJob } = await import("@/lib/server/jobs/access.server");
    const job = await getOwnedBuildJob({ userId: context.userId, ...data });
    const { recoverPolledBuildJob } = await import("@/lib/server/jobs/recovery");
    await recoverPolledBuildJob(job);
    return job;
  });

// POST keeps the bearer-style guest token out of URLs, access logs and referrers.
export const getGuestBuildJob = createServerFn({ method: "POST" })
  .validator((input: { jobId: string; guestAccessToken: string }) => ({
    jobId: typeof input.jobId === "string" ? input.jobId.trim().slice(0, 128) : "",
    guestAccessToken:
      typeof input.guestAccessToken === "string" ? input.guestAccessToken.trim().slice(0, 128) : "",
  }))
  .handler(async ({ data }): Promise<PublicBuildJob | null> => {
    const { getGuestAccessibleBuildJob } = await import("@/lib/server/jobs/access.server");
    const job = await getGuestAccessibleBuildJob(data);
    const { recoverPolledBuildJob } = await import("@/lib/server/jobs/recovery");
    await recoverPolledBuildJob(job);
    return job;
  });
