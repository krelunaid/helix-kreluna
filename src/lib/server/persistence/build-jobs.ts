import type { BuildJob } from "@/lib/agent-types";
import { getSql } from "@/lib/db";
import { BuildJobForbiddenError } from "@/lib/server/build-job-access";
import type { CrewMessage } from "@/lib/server/agents/types";
import { saveBuildJobSnapshot } from "@/lib/server/jobs/queue";

function persistenceFailure(
  job: BuildJob,
  stage: "job_snapshot" | "project_sync",
  error: unknown,
): Error {
  const errorName = error instanceof Error ? error.name : "UnknownError";
  const rawCode =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  const errorCode =
    typeof rawCode === "string" || typeof rawCode === "number"
      ? String(rawCode).slice(0, 64)
      : undefined;
  console.error(
    JSON.stringify({
      level: "error",
      event: "build_persistence_failed",
      stage,
      jobId: job.id,
      errorName,
      ...(errorCode ? { errorCode } : {}),
    }),
  );
  job.status = "error";
  job.error = `Persistence failed (${stage})`;
  const note = `Persistence failed: ${stage}`;
  if (!job.interventions?.includes(note)) {
    job.interventions = [...(job.interventions ?? []), note];
  }
  return error instanceof Error ? error : new Error(note);
}

function parseMessages(raw: unknown): CrewMessage[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(value)) throw new Error("PROJECT_MESSAGES_INVALID");
    return value as CrewMessage[];
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "project_messages_parse_failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    throw error;
  }
}

function appendUniqueMessages(
  previous: CrewMessage[],
  extra: CrewMessage[],
): CrewMessage[] {
  const next = [...previous];
  const keys = new Set(
    previous.map((message) =>
      JSON.stringify([
        message.role,
        message.kind ?? null,
        message.agent ?? null,
        message.content,
      ]),
    ),
  );
  for (const message of extra) {
    const key = JSON.stringify([
      message.role,
      message.kind ?? null,
      message.agent ?? null,
      message.content,
    ]);
    if (keys.has(key)) continue;
    keys.add(key);
    next.push(message);
  }
  return next;
}

export async function persistBuildJob(
  job: BuildJob,
  extra: CrewMessage[] = [],
): Promise<void> {
  job.runtime?.abortSignal.throwIfAborted();
  if (!job.runtime?.workerId) {
    throw new Error("BUILD_JOB_WORKER_CONTEXT_MISSING");
  }
  try {
    await saveBuildJobSnapshot(job, job.runtime.workerId);
  } catch (error) {
    throw persistenceFailure(job, "job_snapshot", error);
  }
  if (!job.projectId || !job.userId) return;

  try {
    const sql = await getSql();
    const previous = parseMessages(
      (
        await sql<{ messages: string | null }>`
          select messages
          from projects
          where id = ${job.projectId} and user_id = ${job.userId}
        `
      )[0]?.messages,
    );
    const next = extra.length ? appendUniqueMessages(previous, extra) : previous;
    const status =
      job.status === "running"
        ? "building"
        : job.status === "ready"
          ? "ready"
          : "error";
    const rows =
      job.html && job.html.length > 40
        ? await sql<{ id: string }>`
            update projects
            set html = ${job.html},
                status = ${status},
                title = ${job.title},
                messages = ${JSON.stringify(next)},
                updated_at = now()
            where id = ${job.projectId} and user_id = ${job.userId}
              and (current_build_job_id is null or current_build_job_id = ${job.id})
            returning id
          `
        : await sql<{ id: string }>`
            update projects
            set status = ${status},
                title = ${job.title},
                messages = ${JSON.stringify(next)},
                updated_at = now()
            where id = ${job.projectId} and user_id = ${job.userId}
              and (current_build_job_id is null or current_build_job_id = ${job.id})
            returning id
          `;
    if (!rows[0]) throw new BuildJobForbiddenError();
  } catch (error) {
    throw persistenceFailure(job, "project_sync", error);
  }
}
