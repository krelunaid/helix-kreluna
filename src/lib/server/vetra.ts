import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { ACTIONS, PLANS, type ActionId, type PlanId } from "@/lib/plans";
import { htmlForPrompt } from "@/lib/templates";
import { titleFromPrompt } from "@/lib/utils";
import { normalizeLocale, t, type Locale } from "@/lib/i18n-core";
import {
  CreditMutationError,
  rethrowCreditMutationError,
} from "@/lib/server/credits";
import { createBuildJobDraft } from "@/lib/server/jobs/create";
import { dispatchBuildJob } from "@/lib/server/jobs/dispatch.server";
import { serializeBuildJob } from "@/lib/server/jobs/queue";
import { loadBuildJob } from "@/lib/server/jobs/queue";
import { sha256Hex } from "@/lib/server/agents/patch";
import { HumanGateError } from "@/lib/server/review/human-gate";
import {
  assertBuildLevelAvailable,
  BuildLevelError,
  parseBuildLevel,
  type BuildLevel,
} from "@/lib/build-level";
import {
  createBillingPortal,
  getBillingAccountSnapshot,
  hasCurrentPaidSubscription,
  isPaidPlanId,
  startSubscriptionCheckout,
  startTopUpCheckout,
} from "@/lib/server/billing/checkout.server";
import {
  StripeBillingError,
  type BillingAccountSnapshot,
  type CheckoutResult,
} from "@/lib/server/billing/types";

export type Profile = {
  user_id: string;
  plan: PlanId;
  credits_balance: number;
  created_at: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  kind?: "build" | "iterate" | "debug" | "host";
  agent?: string;
};

export type Project = {
  id: string;
  user_id: string;
  title: string;
  prompt: string;
  kind: string;
  buildLevel: BuildLevel;
  status: "draft" | "building" | "ready" | "error";
  html: string | null;
  messages: ChatMessage[];
  credits_spent: number;
  hosted: boolean;
  hosted_until: string | null;
  created_at: string;
  updated_at: string;
};

export type LedgerRow = {
  id: number;
  action: string;
  credits: number;
  note: string | null;
  project_id: string | null;
  created_at: string;
};

export type { BillingAccountSnapshot, CheckoutResult };

export const BILLING_ERROR_CODES = ["PAYMENTS_NOT_AVAILABLE", "INVALID_PLAN"] as const;
export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[number];

export class BillingError extends Error {
  readonly code: BillingErrorCode;
  readonly status: 400 | 503;

  constructor(code: BillingErrorCode) {
    super(code);
    this.name = "BillingError";
    this.code = code;
    this.status = code === "INVALID_PLAN" ? 400 : 503;
  }
}

export class LegacyGeneratorRetiredError extends Error {
  readonly code = "LEGACY_GENERATOR_RETIRED";
  readonly status = 410;

  constructor() {
    super("LEGACY_GENERATOR_RETIRED");
    this.name = "LegacyGeneratorRetiredError";
  }
}

export class LegacyHostingRetiredError extends Error {
  readonly code = "LEGACY_HOSTING_ENDPOINT_RETIRED";
  readonly status = 410;
  readonly retryable = false;

  constructor() {
    super("LEGACY_HOSTING_ENDPOINT_RETIRED");
    this.name = "LegacyHostingRetiredError";
  }
}

type ProjectRow = Omit<
  Project,
  "messages" | "hosted" | "status" | "buildLevel"
> & {
  build_level: string | null;
  messages: string;
  hosted: boolean | number;
  status: string;
};

function parseMessages(raw: string): ChatMessage[] {
  try {
    const v = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function mapProject(row: ProjectRow): Project {
  return {
    ...row,
    status: (row.status as Project["status"]) || "draft",
    buildLevel: parseBuildLevel(row.build_level),
    hosted: Boolean(row.hosted),
    html: row.html,
    messages: parseMessages(row.messages),
  };
}

async function ensureProfile(userId: string): Promise<Profile> {
  const sql = await getSql();
  await sql`
    insert into profiles (user_id, plan, credits_balance)
    values (${userId}, 'free', 10)
    on conflict (user_id) do nothing
  `;
  const rows = await sql<Profile>`
    select user_id, plan, credits_balance, created_at
    from profiles where user_id = ${userId}
  `;
  return rows[0];
}

function requestId(raw: unknown): string {
  if (
    typeof raw === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)
  ) {
    return raw;
  }
  throw new CreditMutationError("INVALID_IDEMPOTENCY_KEY");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function projectBuildFingerprint(input: {
  requestId: string;
  userId: string;
  projectId: string;
  prompt: string;
  locale: Locale;
  mode: ActionId;
  buildLevel: BuildLevel;
  gear?: "auto" | "house" | "fast";
  max?: boolean;
}): Promise<string> {
  // Only API inputs belong in this fingerprint. In particular, currentHtml is
  // a mutable server snapshot: including it would make a legitimate retry
  // conflict after the worker has updated the project.
  const canonical = JSON.stringify({
    version: "helix-project-build-v2",
    requestId: input.requestId,
    userId: input.userId,
    projectId: input.projectId,
    prompt: input.prompt,
    locale: input.locale,
    mode: input.mode,
    buildLevel: input.buildLevel,
    gear: input.gear ?? "auto",
    max: Boolean(input.max),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return bytesToHex(new Uint8Array(digest));
}

async function dispatchCommittedBuildJob(jobId: string): Promise<void> {
  try {
    await dispatchBuildJob(jobId);
  } catch (error) {
    // The durable row is already committed. Returning an error here would
    // encourage a new client action/requestId and risk charging twice; the
    // queue recovery sweep can safely dispatch this queued job later.
    console.error(
      JSON.stringify({
        level: "error",
        event: "build_job_dispatch_deferred",
        jobId,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorCode:
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : undefined,
      }),
    );
  }
}

export const previewGenerate = createServerFn({ method: "POST" })
  .validator((_input: {
    prompt: string;
    locale?: string;
    currentHtml?: string | null;
    mode?: ActionId;
  }) => undefined)
  .handler(async () => {
    throw new LegacyGeneratorRetiredError();
  });

export const getAccount = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const profile = await ensureProfile(context.userId);
    const sql = await getSql();
    const ledger = await sql<LedgerRow>`
      select id, action, credits, note, project_id, created_at
      from credit_ledger
      where user_id = ${context.userId}
      order by id desc
      limit 20
    `;
    const billing = await getBillingAccountSnapshot(context.userId);
    return { profile, ledger, billing };
  });

export const listProjects = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureProfile(context.userId);
    const sql = await getSql();
    const rows = await sql<ProjectRow>`
      select id, user_id, title, prompt, kind, build_level, status, html, messages,
             credits_spent, hosted, hosted_until, created_at, updated_at
      from projects
      where user_id = ${context.userId}
      order by updated_at desc
    `;
    return rows.map(mapProject);
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    const rows = await sql<ProjectRow>`
      select id, user_id, title, prompt, kind, build_level, status, html, messages,
             credits_spent, hosted, hosted_until, created_at, updated_at
      from projects
      where id = ${id} and user_id = ${context.userId}
    `;
    if (!rows[0]) throw new Error("Progetto non trovato");
    const profile = await ensureProfile(context.userId);
    return { project: mapProject(rows[0]), profile };
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      prompt: string;
      locale?: string;
      gear?: "auto" | "house" | "fast";
      max?: boolean;
      buildLevel?: BuildLevel;
      requestId: string;
    }) => ({
      prompt: input.prompt.trim().slice(0, 2000),
      locale: normalizeLocale(input.locale),
      gear: (input.gear === "house" || input.gear === "fast" ? input.gear : "auto") as
        | "auto"
        | "house"
        | "fast",
      max: Boolean(input.max),
      buildLevel: parseBuildLevel(input.buildLevel),
      requestId: requestId(input.requestId),
    }),
  )
  .handler(async ({ context, data }) => {
    const locale = data.locale;
    if (!data.prompt) throw new Error(t(locale, "err.describe"));
    const productionCredits =
      data.buildLevel === "production"
        ? await import("@/lib/server/production/config").then((module) =>
            module.requireProductionBuildCredits(),
          )
        : null;
    const quote = assertBuildLevelAvailable({
      buildLevel: data.buildLevel,
      action: "generate",
      authenticated: true,
      productionCredits,
    });
    await ensureProfile(context.userId);
    if (quote.credits === null) throw new BuildLevelError("PRODUCTION_MODE_NOT_AVAILABLE");
    const cost = quote.credits;
    const id = data.requestId;
    const title = titleFromPrompt(data.prompt, locale);
    const sql = await getSql();
    const messages: ChatMessage[] = [{ role: "user", content: data.prompt, kind: "build" }];
    const seed = htmlForPrompt(data.prompt, locale);
    const { job } = await createBuildJobDraft({
      prompt: data.prompt,
      locale,
      mode: "generate",
      buildLevel: data.buildLevel,
      currentHtml: seed,
      projectId: id,
      userId: context.userId,
      gear: data.gear,
      max: data.max,
    });
    const buildIdempotencyKey = `build:generate:${data.requestId}`;
    const requestFingerprint = await projectBuildFingerprint({
      requestId: data.requestId,
      userId: context.userId,
      projectId: id,
      prompt: data.prompt,
      locale,
      mode: "generate",
      buildLevel: data.buildLevel,
      gear: data.gear,
      max: data.max,
    });
    let jobId: string;
    try {
      const queued = await sql<{ job_id: string }>`
        select job_id
        from create_project_and_enqueue_build_job(
          ${id},
          ${context.userId},
          ${title},
          ${data.prompt},
          ${data.buildLevel},
          ${seed},
          ${JSON.stringify(messages)},
          ${cost},
          ${t(locale, "action.generate")},
          ${`generate:${data.requestId}`},
          ${job.id},
          ${serializeBuildJob(job, requestFingerprint)},
          ${buildIdempotencyKey},
          ${requestFingerprint},
          2
        )
      `;
      if (!queued[0]) throw new Error("BUILD_JOB_ENQUEUE_FAILED");
      jobId = queued[0].job_id;
    } catch (error) {
      rethrowCreditMutationError(error);
    }
    await dispatchCommittedBuildJob(jobId);
    return { id, jobId };
  });

export const iterateProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      id: string;
      prompt: string;
      mode?: "iterate" | "debug";
      locale?: string;
      requestId: string;
      sourceJobId?: string;
    }) => ({
      id: input.id,
      prompt: input.prompt.trim().slice(0, 2000),
      mode: input.mode === "debug" ? ("debug" as const) : ("iterate" as const),
      locale: normalizeLocale(input.locale),
      requestId: requestId(input.requestId),
      sourceJobId:
        typeof input.sourceJobId === "string"
          ? input.sourceJobId.trim().slice(0, 128)
          : undefined,
    }),
  )
  .handler(async ({ context, data }) => {
    const locale = data.locale;
    if (!data.prompt) throw new Error(t(locale, "err.change"));
    const sql = await getSql();
    const rows = await sql<ProjectRow>`
      select id, user_id, title, prompt, kind, build_level, status, html, messages,
             credits_spent, hosted, hosted_until, created_at, updated_at
      from projects where id = ${data.id} and user_id = ${context.userId}
    `;
    if (!rows[0]) throw new Error(t(locale, "err.notFound"));
    const project = mapProject(rows[0]);
    assertBuildLevelAvailable({
      buildLevel: project.buildLevel,
      action: data.mode,
      authenticated: true,
    });
    const requestFingerprint = await projectBuildFingerprint({
      requestId: data.requestId,
      userId: context.userId,
      projectId: data.id,
      prompt: data.prompt,
      locale,
      mode: data.mode,
      buildLevel: project.buildLevel,
    });
    let sourceArtifactSha256: string | null = null;
    if (data.sourceJobId) {
      const prior = await sql<{
        decision: string;
        result_job_id: string | null;
        request_fingerprint: string | null;
      }>`
        select event.decision, event.result_job_id,
               child.request_fingerprint
        from build_job_gate_events as event
        left join build_jobs as child on child.id = event.result_job_id
        where event.job_id = ${data.sourceJobId}
          and event.actor_type = 'user'
          and event.actor_user_id = ${context.userId}
          and event.request_id = ${data.requestId}
      `;
      if (prior[0]) {
        if (
          prior[0].decision !== "modify" ||
          !prior[0].result_job_id ||
          prior[0].request_fingerprint !== requestFingerprint
        ) {
          throw new HumanGateError("HUMAN_GATE_REQUEST_REUSED");
        }
        return {
          project,
          profile: await ensureProfile(context.userId),
          jobId: prior[0].result_job_id,
        };
      }
      const source = await loadBuildJob(data.sourceJobId);
      if (
        !source ||
        source.userId !== context.userId ||
        source.projectId !== data.id ||
        source.buildLevel !== project.buildLevel
      ) {
        throw new HumanGateError("HUMAN_GATE_FORBIDDEN", 403);
      }
      if (source.queue?.status !== "awaiting_human_approval") {
        throw new HumanGateError("HUMAN_GATE_CLOSED");
      }
      if (!source.html || !source.queue.artifactSha256) {
        throw new HumanGateError("HUMAN_GATE_ARTIFACT_NOT_SEALED");
      }
      sourceArtifactSha256 = await sha256Hex(source.html);
      if (sourceArtifactSha256 !== source.queue.artifactSha256) {
        throw new HumanGateError("HUMAN_GATE_ARTIFACT_NOT_SEALED");
      }
      project.html = source.html;
    }
    const cost = ACTIONS[data.mode].credits;
    const message: ChatMessage = { role: "user", content: data.prompt, kind: data.mode };
    const { job } = await createBuildJobDraft({
      prompt: data.prompt,
      locale,
      mode: data.mode,
      buildLevel: project.buildLevel,
      currentHtml: project.html,
      projectId: data.id,
      userId: context.userId,
    });
    const buildIdempotencyKey = `build:${data.mode}:${data.id}:${data.requestId}`;
    let jobId: string;
    try {
      const queued = await sql<{ job_id: string }>`
        with gate as materialized (
          select job.id, job.artifact_sha256
          from build_jobs as job
          join projects as project on project.id = job.project_id
          where ${data.sourceJobId ?? null} is not null
            and job.id = ${data.sourceJobId ?? null}
            and job.project_id = ${data.id}
            and job.user_id = ${context.userId}
            and project.user_id = ${context.userId}
            and project.current_build_job_id = job.id
            and job.queue_status = 'awaiting_human_approval'
            and job.artifact_sha256 = ${sourceArtifactSha256}
          for update of job
        ), owned as materialized (
          select project.id
          from projects as project
          where project.id = ${data.id}
            and project.user_id = ${context.userId}
            and (
              ${data.sourceJobId ?? null} is null
              or exists (select 1 from gate)
            )
          for update
        ),
        credit as materialized (
          select owned.id as project_id, mutation.was_applied
          from owned
          cross join lateral apply_credit_entry(
            ${context.userId},
            ${-cost},
            ${data.mode},
            owned.id,
            ${data.prompt.slice(0, 80)},
            ${`${data.mode}:${data.id}:${data.requestId}`}
          ) as mutation
        ),
        changed as (
          update projects
          set status = 'building',
              messages = (
                coalesce(nullif(projects.messages, ''), '[]')::jsonb
                || jsonb_build_array(${JSON.stringify(message)}::jsonb)
              )::text,
              credits_spent = credits_spent + ${cost},
              current_build_job_id = ${job.id},
              updated_at = now()
          from credit
          where projects.id = credit.project_id
            and projects.user_id = ${context.userId}
            and credit.was_applied
          returning projects.id
        ),
        project_ready as materialized (
          select id from changed
          union all
          select project_id as id
          from credit
          where not was_applied
        )
        , queued as materialized (
          select queued.job_id
          from project_ready
          cross join lateral enqueue_linked_build_job(
            ${job.id},
            ${data.sourceJobId ?? null},
            project_ready.id,
            ${context.userId},
            null,
            null,
            ${serializeBuildJob(job, requestFingerprint)},
            ${buildIdempotencyKey},
            ${requestFingerprint},
            2
          ) as queued
        ), decision as (
          insert into build_job_gate_events (
            job_id, project_id, actor_type, actor_user_id, decision,
            from_status, to_status, request_id, reason, artifact_sha256,
            result_job_id
          )
          select
            gate.id, ${data.id}, 'user', ${context.userId}, 'modify',
            'awaiting_human_approval', 'rejected', ${data.requestId},
            ${data.prompt}, gate.artifact_sha256, queued.job_id
          from gate
          cross join queued
          where ${data.sourceJobId ?? null} is not null
          returning job_id, result_job_id
        ), closed as (
          update build_jobs as source
          set queue_status = 'rejected',
              stage = 'modified',
              updated_at = now()
          from decision
          where source.id = decision.job_id
            and source.queue_status = 'awaiting_human_approval'
          returning source.id
        )
        select queued.job_id
        from queued
        where ${data.sourceJobId ?? null} is null
           or exists (select 1 from closed)
      `;
      if (queued[0]) {
        jobId = queued[0].job_id;
      } else if (data.sourceJobId) {
        const replay = await sql<{
          decision: string;
          result_job_id: string | null;
          request_fingerprint: string | null;
        }>`
          select event.decision, event.result_job_id,
                 child.request_fingerprint
          from build_job_gate_events as event
          left join build_jobs as child on child.id = event.result_job_id
          where event.job_id = ${data.sourceJobId}
            and event.actor_type = 'user'
            and event.actor_user_id = ${context.userId}
            and event.request_id = ${data.requestId}
        `;
        if (
          replay[0]?.decision === "modify" &&
          replay[0].result_job_id &&
          replay[0].request_fingerprint === requestFingerprint
        ) {
          jobId = replay[0].result_job_id;
        } else if (replay[0]) {
          throw new HumanGateError("HUMAN_GATE_REQUEST_REUSED");
        } else {
          throw new HumanGateError("HUMAN_GATE_CLOSED");
        }
      } else {
        throw new Error(t(locale, "err.notFound"));
      }
    } catch (error) {
      rethrowCreditMutationError(error);
    }
    await dispatchCommittedBuildJob(jobId);
    const next = await sql<ProjectRow>`
      select id, user_id, title, prompt, kind, build_level, status, html, messages,
             credits_spent, hosted, hosted_until, created_at, updated_at
      from projects where id = ${data.id} and user_id = ${context.userId}
    `;
    const profile = await ensureProfile(context.userId);
    return { project: mapProject(next[0]), profile, jobId };
  });

export const hostProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id.trim().slice(0, 128))
  .handler(() => {
    // The legacy endpoint used to debit credits and flip `hosted` without
    // publishing any bytes. Real hosting must go through deploy.publishWeb,
    // which binds Human Gate, artifact hashes, public_apps and deploy evidence.
    throw new LegacyHostingRetiredError();
  });

export const choosePlan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: PlanId | { planId: PlanId; requestId?: string }) => ({
    planId: typeof input === "string" ? input : input.planId,
    requestId: typeof input === "string" ? undefined : input.requestId,
  }))
  .handler(async ({ context, data }) => {
    const planId = data.planId;
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) throw new BillingError("INVALID_PLAN");
    if (isPaidPlanId(plan.id)) {
      if (!data.requestId) {
        throw new StripeBillingError("INVALID_BILLING_REQUEST", { retryable: false });
      }
      return startSubscriptionCheckout({
        userId: context.userId,
        planId: plan.id,
        requestId: data.requestId,
      });
    }

    const profile = await ensureProfile(context.userId);
    if (profile.plan === "free") return { kind: "profile" as const, profile };
    if (await hasCurrentPaidSubscription(context.userId)) {
      // A local plan flip would not cancel the recurring Stripe charge. The
      // customer portal owns cancellation; the webhook performs the downgrade.
      throw new StripeBillingError("SUBSCRIPTION_ALREADY_EXISTS", { retryable: false });
    }

    // Free is the one plan that can be selected without a payment. It never
    // grants credits here: the initial 10-credit allowance is created once by
    // ensureProfile's INSERT ... ON CONFLICT DO NOTHING.
    const sql = await getSql();
    await sql`
      update profiles
      set plan = 'free'
      where user_id = ${context.userId}
    `;
    return { kind: "profile" as const, profile: await ensureProfile(context.userId) };
  });

export const buyExtraCredits = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { requestId: string }) => input)
  .handler(async ({ context, data }) => {
    return startTopUpCheckout({ userId: context.userId, requestId: data.requestId });
  });

export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return createBillingPortal({ userId: context.userId });
  });
