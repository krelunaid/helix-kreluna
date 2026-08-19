import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { ACTIONS, EXTRA_PACK, PLANS, type ActionId, type PlanId } from "@/lib/plans";
import { htmlForPrompt } from "@/lib/templates";
import { titleFromPrompt } from "@/lib/utils";
import { LOCALE_NAME, normalizeLocale, t, type Locale } from "@/lib/i18n-core";
import { enqueueBuild } from "@/lib/server/agents";

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

type ProjectRow = Omit<Project, "messages" | "hosted" | "status"> & {
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

async function spend(
  userId: string,
  amount: number,
  action: string,
  projectId: string | null,
  note: string,
) {
  const sql = await getSql();
  const rows = await sql<{ credits_balance: number }>`
    select credits_balance from profiles where user_id = ${userId}
  `;
  const bal = rows[0]?.credits_balance ?? 0;
  if (bal < amount) {
    throw new Error("Crediti insufficienti");
  }
  await sql`
    update profiles set credits_balance = credits_balance - ${amount}
    where user_id = ${userId}
  `;
  await sql`
    insert into credit_ledger (user_id, project_id, action, credits, note)
    values (${userId}, ${projectId}, ${action}, ${-amount}, ${note})
  `;
}

async function refund(
  userId: string,
  amount: number,
  action: string,
  projectId: string | null,
  note: string,
) {
  const sql = await getSql();
  await sql`
    update profiles set credits_balance = credits_balance + ${amount}
    where user_id = ${userId}
  `;
  await sql`
    insert into credit_ledger (user_id, project_id, action, credits, note)
    values (${userId}, ${projectId}, ${action}, ${amount}, ${note})
  `;
}

function extractHtml(text: string): string | null {
  const fence = text.match(/```html\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const doc = text.match(/<!DOCTYPE html[\s\S]*<\/html>/i);
  if (doc) return doc[0].trim();
  if (/<html[\s>]/i.test(text) && /<\/html>/i.test(text)) return text.trim();
  return null;
}

async function generateHtml(
  prompt: string,
  currentHtml: string | null,
  mode: ActionId,
  locale: Locale = "en",
) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return { html: currentHtml && mode !== "generate" ? currentHtml : htmlForPrompt(prompt, locale), usedAi: false };
  }

  const lang = LOCALE_NAME[locale];
  const system =
    mode === "debug"
      ? `You are Kreluna. Fix the given HTML app so it works. All visible UI text must be in ${lang}. Return ONLY a complete HTML document. No markdown.`
      : mode === "iterate"
        ? `You are Kreluna. Apply the user's change to the HTML app. Keep all visible UI text in ${lang} unless the user asks otherwise. Return ONLY the full updated HTML document. No markdown.`
        : `You are Kreluna, an expert product engineer. The user describes an app, site, game or template. Return ONLY one complete, self-contained HTML document. No markdown, no commentary. Single file: CSS in <style>, JS in <script>. You may load fonts from fonts.googleapis.com only. No other CDNs or network calls. Beautiful, distinctive, fully interactive and usable at 390px and desktop. ALL visible UI text MUST be in ${lang}. Set <html lang="${locale}">. Games must be playable with keyboard and touch. Keep it under ~80KB.`;

  const userParts = [prompt];
  if (currentHtml && mode !== "generate") {
    userParts.push("\n\nCURRENT HTML:\n", currentHtml.slice(0, 60000));
  }

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(14000),
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.6,
        max_tokens: 3500,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userParts.join("") },
        ],
      }),
    });
    if (!res.ok) {
      return { html: currentHtml ?? htmlForPrompt(prompt, locale), usedAi: false };
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    const html = extractHtml(text);
    return { html: html ?? currentHtml ?? htmlForPrompt(prompt, locale), usedAi: Boolean(html) };
  } catch {
    return { html: currentHtml ?? htmlForPrompt(prompt, locale), usedAi: false };
  }
}

export const previewGenerate = createServerFn({ method: "POST" })
  .validator((input: {
    prompt: string;
    locale?: string;
    currentHtml?: string | null;
    mode?: ActionId;
  }) => ({
    prompt: input.prompt.trim().slice(0, 2000),
    locale: normalizeLocale(input.locale),
    currentHtml: input.currentHtml ?? null,
    mode:
      input.mode === "debug" || input.mode === "iterate" || input.mode === "generate"
        ? input.mode
        : ("generate" as const),
  }))
  .handler(async ({ data }) => {
    if (!data.prompt) throw new Error(t(data.locale, "err.describe"));
    return generateHtml(data.prompt, data.currentHtml, data.mode, data.locale);
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
    return { profile, ledger };
  });

export const listProjects = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureProfile(context.userId);
    const sql = await getSql();
    const rows = await sql<ProjectRow>`
      select id, user_id, title, prompt, kind, status, html, messages,
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
      select id, user_id, title, prompt, kind, status, html, messages,
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
  .validator((input: { prompt: string; locale?: string; gear?: "auto" | "house" | "fast"; max?: boolean }) => ({
    prompt: input.prompt.trim().slice(0, 2000),
    locale: normalizeLocale(input.locale),
    gear: (input.gear === "house" || input.gear === "fast" ? input.gear : "auto") as "auto" | "house" | "fast",
    max: Boolean(input.max),
  }))
  .handler(async ({ context, data }) => {
    const locale = data.locale;
    if (!data.prompt) throw new Error(t(locale, "err.describe"));
    await ensureProfile(context.userId);
    const cost = ACTIONS.generate.credits;
    await spend(context.userId, cost, "generate", null, t(locale, "action.generate"));
    const id = crypto.randomUUID();
    const title = titleFromPrompt(data.prompt, locale);
    const sql = await getSql();
    const messages: ChatMessage[] = [{ role: "user", content: data.prompt, kind: "build" }];
    const seed = htmlForPrompt(data.prompt, locale);
    await sql`
      insert into projects (id, user_id, title, prompt, kind, status, html, messages, credits_spent)
      values (${id}, ${context.userId}, ${title}, ${data.prompt}, 'web', 'building', ${seed}, ${JSON.stringify(messages)}, ${cost})
    `;
    const jobId = enqueueBuild({
      prompt: data.prompt,
      locale,
      mode: "generate",
      currentHtml: seed,
      projectId: id,
      userId: context.userId,
      gear: data.gear,
      max: data.max,
    });
    return { id, jobId };
  });

export const iterateProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; prompt: string; mode?: "iterate" | "debug"; locale?: string }) => ({
    id: input.id,
    prompt: input.prompt.trim().slice(0, 2000),
    mode: input.mode === "debug" ? ("debug" as const) : ("iterate" as const),
    locale: normalizeLocale(input.locale),
  }))
  .handler(async ({ context, data }) => {
    const locale = data.locale;
    if (!data.prompt) throw new Error(t(locale, "err.change"));
    const sql = await getSql();
    const rows = await sql<ProjectRow>`
      select id, user_id, title, prompt, kind, status, html, messages,
             credits_spent, hosted, hosted_until, created_at, updated_at
      from projects where id = ${data.id} and user_id = ${context.userId}
    `;
    if (!rows[0]) throw new Error(t(locale, "err.notFound"));
    const project = mapProject(rows[0]);
    const cost = ACTIONS[data.mode].credits;
    await spend(context.userId, cost, data.mode, data.id, data.prompt.slice(0, 80));
    const messages = [
      ...project.messages,
      { role: "user" as const, content: data.prompt, kind: data.mode },
    ];
    await sql`
      update projects set status = 'building', messages = ${JSON.stringify(messages)},
        credits_spent = credits_spent + ${cost}, updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}
    `;
    enqueueBuild({
      prompt: data.prompt,
      locale,
      mode: data.mode,
      currentHtml: project.html,
      projectId: data.id,
      userId: context.userId,
    });
    const next = await sql<ProjectRow>`
      select id, user_id, title, prompt, kind, status, html, messages,
             credits_spent, hosted, hosted_until, created_at, updated_at
      from projects where id = ${data.id} and user_id = ${context.userId}
    `;
    const profile = await ensureProfile(context.userId);
    return { project: mapProject(next[0]), profile };
  });

export const hostProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    const rows = await sql<ProjectRow>`
      select id, user_id, title, prompt, kind, status, html, messages,
             credits_spent, hosted, hosted_until, created_at, updated_at
      from projects where id = ${id} and user_id = ${context.userId}
    `;
    if (!rows[0]) throw new Error("Progetto non trovato");
    const project = mapProject(rows[0]);
    if (project.hosted) return { project, profile: await ensureProfile(context.userId) };
    const cost = ACTIONS.host.credits;
    await spend(context.userId, cost, "host", id, "Hosting 30 giorni");
    const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const messages = [
      ...project.messages,
      {
        role: "assistant" as const,
        content: "App tenuta online per 30 giorni. I crediti di hosting sono stati scalati.",
        kind: "host" as const,
      },
    ];
    await sql`
      update projects
      set hosted = true, hosted_until = ${until},
          credits_spent = credits_spent + ${cost},
          messages = ${JSON.stringify(messages)},
          updated_at = now()
      where id = ${id} and user_id = ${context.userId}
    `;
    const next = await sql<ProjectRow>`
      select id, user_id, title, prompt, kind, status, html, messages,
             credits_spent, hosted, hosted_until, created_at, updated_at
      from projects where id = ${id} and user_id = ${context.userId}
    `;
    return { project: mapProject(next[0]), profile: await ensureProfile(context.userId) };
  });

export const choosePlan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((planId: PlanId) => planId)
  .handler(async ({ context, data: planId }) => {
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) throw new Error("Piano non valido");
    const profile = await ensureProfile(context.userId);
    if (profile.plan === planId) return profile;
    const sql = await getSql();
    await sql`
      update profiles
      set plan = ${planId}, credits_balance = credits_balance + ${plan.credits}
      where user_id = ${context.userId}
    `;
    await sql`
      insert into credit_ledger (user_id, project_id, action, credits, note)
      values (${context.userId}, null, 'plan_grant', ${plan.credits}, ${"Piano " + plan.name})
    `;
    return ensureProfile(context.userId);
  });

export const buyExtraCredits = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureProfile(context.userId);
    const sql = await getSql();
    await sql`
      update profiles
      set credits_balance = credits_balance + ${EXTRA_PACK.credits}
      where user_id = ${context.userId}
    `;
    await sql`
      insert into credit_ledger (user_id, project_id, action, credits, note)
      values (${context.userId}, null, 'topup', ${EXTRA_PACK.credits}, 'Pacchetto extra')
    `;
    return ensureProfile(context.userId);
  });
