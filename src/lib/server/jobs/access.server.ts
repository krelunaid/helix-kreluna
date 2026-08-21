import type { BuildJob, PublicBuildJob } from "@/lib/agent-types";
import { getSql } from "@/lib/db";
import {
  assertGuestBuildAccess,
  assertOwnedBuildJob,
  BuildJobForbiddenError,
  toPublicBuildJob,
} from "@/lib/server/build-job-access";
import { findLatestBuildJob, loadBuildJob } from "@/lib/server/jobs/queue";

type ProjectOwnerRow = { user_id: string };

async function getProjectOwner(projectId: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<ProjectOwnerRow>`
    select user_id from projects where id = ${projectId}
  `;
  return rows[0]?.user_id ?? null;
}

async function assertProjectOwnership(
  projectId: string,
  userId: string,
): Promise<void> {
  const projectUserId = await getProjectOwner(projectId);
  if (projectUserId !== userId) throw new BuildJobForbiddenError();
}

async function assertJobOwnership(job: BuildJob, userId: string): Promise<void> {
  const projectUserId = job.projectId
    ? await getProjectOwner(job.projectId)
    : undefined;
  assertOwnedBuildJob(userId, job.userId, projectUserId);
}

export async function getOwnedBuildJob(input: {
  userId: string;
  jobId?: string;
  projectId?: string;
}): Promise<PublicBuildJob | null> {
  if (input.jobId) {
    const job = await loadBuildJob(input.jobId);
    if (!job) return null;
    await assertJobOwnership(job, input.userId);
    return toPublicBuildJob(job);
  }
  if (input.projectId) {
    await assertProjectOwnership(input.projectId, input.userId);
    const job = await findLatestBuildJob(input.projectId);
    if (!job) return null;
    assertOwnedBuildJob(input.userId, job.userId, input.userId);
    return toPublicBuildJob(job);
  }
  return null;
}

export async function getGuestAccessibleBuildJob(input: {
  jobId: string;
  guestAccessToken: string;
}): Promise<PublicBuildJob | null> {
  if (!input.jobId) throw new BuildJobForbiddenError();
  const job = await loadBuildJob(input.jobId);
  if (!job) return null;
  if (job.userId || job.projectId) throw new BuildJobForbiddenError();
  await assertGuestBuildAccess({
    presentedToken: input.guestAccessToken,
    storedTokenHash: job.guestAccessTokenHash,
    expiresAt: job.guestAccessExpiresAt,
  });
  return toPublicBuildJob(job);
}
