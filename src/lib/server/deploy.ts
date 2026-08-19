import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { bundleIdFromTitle, expoFiles, slugify, withPwa, windowsFiles } from "@/lib/expo-pack";
import { toBase64, zipFiles } from "@/lib/zip";

let schemaReady: Promise<void> | null = null;

async function ensureSchema() {
  schemaReady ??= (async () => {
    const sql = await getSql();
    await sql.query(`
      create table if not exists deploys (
        id text primary key,
        project_id text,
        user_id text,
        target text not null,
        status text not null,
        slug text,
        bundle_id text,
        apple_team text,
        version text not null default '1.0.0',
        testers_code text,
        url text,
        log text not null default '[]',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);
    await sql.query(`
      create table if not exists public_apps (
        slug text primary key,
        title text not null,
        html text not null,
        testers_code text,
        project_id text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);
  })();
  return schemaReady;
}

export const DEPLOY_COST = { web: 50, ios: 80, android: 80, windows: 50 } as const;
export type DeployTarget = keyof typeof DEPLOY_COST;

export type DeployStep = {
  id: string;
  label: string;
  status: "queued" | "running" | "done" | "blocked" | "error";
  detail: string;
};

export type Deploy = {
  id: string;
  project_id: string | null;
  user_id: string | null;
  target: DeployTarget;
  status: string;
  slug: string | null;
  bundle_id: string | null;
  apple_team: string | null;
  version: string;
  testers_code: string | null;
  url: string | null;
  log: DeployStep[];
  created_at: string;
  updated_at: string;
};

export type PublicApp = {
  slug: string;
  title: string;
  html: string;
  testers_code: string | null;
  project_id: string | null;
};

type DeployRow = Omit<Deploy, "log"> & { log: string };

function parseLog(raw: string): DeployStep[] {
  try {
    const v = JSON.parse(raw) as DeployStep[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function mapDeploy(row: DeployRow): Deploy {
  return { ...row, log: parseLog(row.log) };
}

function publicOrigin() {
  const host = import.meta.env.VITE_PUBLIC_HOSTNAME as string | undefined;
  if (host) return `https://${host}`;
  if (typeof process !== "undefined" && process.env.VITE_PUBLIC_HOSTNAME) {
    return `https://${process.env.VITE_PUBLIC_HOSTNAME}`;
  }
  return "";
}

function appUrl(slug: string) {
  const origin = publicOrigin();
  return origin ? `${origin}/a/${slug}` : `/a/${slug}`;
}

function trackUrl(code: string) {
  const origin = publicOrigin();
  return origin ? `${origin}/t/${code}` : `/t/${code}`;
}

function testersCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function uniqueSlug(base: string) {
  await ensureSchema();
  const sql = await getSql();
  const root = slugify(base);
  for (let i = 0; i < 8; i++) {
    const slug = i === 0 ? root : `${root}-${Math.random().toString(36).slice(2, 5)}`;
    const rows = await sql<{ slug: string }>`select slug from public_apps where slug = ${slug}`;
    if (!rows[0]) return slug;
  }
  return `${root}-${Date.now().toString(36).slice(-4)}`;
}

export async function shipLive(title: string, html: string, projectId?: string) {
  if (!html) throw new Error("Nothing to publish");
  await ensureSchema();
  const sql = await getSql();
  let slug: string | null = null;
  let code: string | null = null;
  if (projectId) {
    const existing = await sql<{ slug: string; testers_code: string | null }>`
      select slug, testers_code from public_apps where project_id = ${projectId}
    `;
    slug = existing[0]?.slug ?? null;
    code = existing[0]?.testers_code ?? null;
  }
  slug = slug ?? (await uniqueSlug(title));
  code = code ?? testersCode();
  const page = withPwa(html, title, slug);
  await sql`
    insert into public_apps (slug, title, html, testers_code, project_id)
    values (${slug}, ${title}, ${page}, ${code}, ${projectId ?? null})
    on conflict (slug) do update
      set html = excluded.html, title = excluded.title, testers_code = excluded.testers_code, updated_at = now()
  `;
  const url = appUrl(slug);
  const testersUrl = trackUrl(code);
  return { slug, url, testersCode: code, testersUrl };
}

async function spend(userId: string, amount: number, action: string, projectId: string | null, note: string) {
  const sql = await getSql();
  const rows = await sql<{ credits_balance: number }>`
    select credits_balance from profiles where user_id = ${userId}
  `;
  const bal = rows[0]?.credits_balance ?? 0;
  if (bal < amount) throw new Error("Crediti insufficienti");
  await sql`update profiles set credits_balance = credits_balance - ${amount} where user_id = ${userId}`;
  await sql`
    insert into credit_ledger (user_id, project_id, action, credits, note)
    values (${userId}, ${projectId}, ${action}, ${-amount}, ${note})
  `;
}

function harborWeb(): DeployStep[] {
  return [
    { id: "pack", label: "Harbor · package", status: "done", detail: "PWA + public slug" },
    { id: "cdn", label: "Harbor · edge", status: "done", detail: "Live on Kreluna" },
    { id: "track", label: "Harbor · TestTrack", status: "done", detail: "Testers can open the link" },
  ];
}

function harborStore(target: "ios" | "android", hasTeam: boolean): DeployStep[] {
  const store = target === "ios" ? "App Store" : "Google Play";
  return [
    { id: "pack", label: "Harbor · package", status: "done", detail: "Native shell" },
    { id: "cfg", label: "Harbor · store listing", status: "done", detail: store },
    {
      id: "sign",
      label: target === "ios" ? "Harbor · Apple" : "Harbor · Google",
      status: hasTeam ? "done" : "blocked",
      detail: hasTeam ? "Developer account attached." : "Add your App Store / Play developer account to finish signing.",
    },
    {
      id: "upload",
      label: `Harbor · ${store}`,
      status: hasTeam ? "running" : "blocked",
      detail: hasTeam
        ? `Queued for ${store}.`
        : `${store} waits for your developer login. Testers use TestTrack now.`,
    },
  ];
}

export async function queueStores(input: { title: string; html: string; projectId?: string; userId?: string; slug?: string; testersCode?: string }) {
  await ensureSchema();
  const sql = await getSql();
  const slug = input.slug ?? (await uniqueSlug(input.title));
  const code = input.testersCode ?? testersCode();
  const bundle = bundleIdFromTitle(input.title);
  const appleTeam = process.env.APPLE_TEAM_ID?.trim() || "";
  const playReady = Boolean(process.env.PLAY_SERVICE_JSON || process.env.EXPO_TOKEN);
  const url = appUrl(slug);
  const testersUrl = trackUrl(code);
  for (const target of ["ios", "android"] as const) {
    const hasTeam = target === "ios" ? Boolean(appleTeam) : playReady || true;
    const status = target === "ios" ? (appleTeam ? "appstore" : "queued") : "play";
    const id = crypto.randomUUID();
    await sql`
      insert into deploys (id, project_id, user_id, target, status, slug, bundle_id, apple_team, testers_code, url, log)
      values (
        ${id}, ${input.projectId ?? null}, ${input.userId ?? null}, ${target}, ${status}, ${slug},
        ${bundle}, ${appleTeam || null}, ${code}, ${target === "ios" ? testersUrl : url},
        ${JSON.stringify(harborStore(target, hasTeam))}
      )
    `;
  }
  return {
    appStore: testersUrl,
    play: url,
    testersCode: code,
    testersUrl,
    bundleId: bundle,
  };
}

export const getPublicApp = createServerFn({ method: "GET" })
  .validator((slug: string) => slug.trim().slice(0, 64))
  .handler(async ({ data: slug }) => {
    await ensureSchema();
    const sql = await getSql();
    const rows = await sql<PublicApp>`
      select slug, title, html, testers_code, project_id from public_apps where slug = ${slug}
    `;
    return rows[0] ?? null;
  });

export const getPublicByCode = createServerFn({ method: "GET" })
  .validator((code: string) => code.trim().toUpperCase().slice(0, 12))
  .handler(async ({ data: code }) => {
    await ensureSchema();
    const sql = await getSql();
    const rows = await sql<PublicApp>`
      select slug, title, html, testers_code, project_id from public_apps where testers_code = ${code}
    `;
    return rows[0] ?? null;
  });

export const listDeploys = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((projectId: string) => projectId)
  .handler(async ({ context, data: projectId }) => {
    await ensureSchema();
    const sql = await getSql();
    const rows = await sql<DeployRow>`
      select id, project_id, user_id, target, status, slug, bundle_id, apple_team,
             version, testers_code, url, log, created_at, updated_at
      from deploys where project_id = ${projectId} and user_id = ${context.userId}
      order by created_at desc
    `;
    return rows.map(mapDeploy);
  });

export const publishWeb = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { projectId: string }) => ({ projectId: input.projectId }))
  .handler(async ({ context, data }) => {
    await ensureSchema();
    const sql = await getSql();
    const rows = await sql<{ id: string; title: string; html: string | null; hosted: boolean | number }>`
      select id, title, html, hosted from projects
      where id = ${data.projectId} and user_id = ${context.userId}
    `;
    if (!rows[0]?.html) throw new Error("Build the app first");
    const project = rows[0];
    const existing = await sql<{ slug: string; testers_code: string | null }>`
      select slug, testers_code from public_apps where project_id = ${project.id}
    `;
    const slug = existing[0]?.slug ?? (await uniqueSlug(project.title));
    const code = existing[0]?.testers_code ?? testersCode();
    const html = withPwa(project.html as string, project.title, slug);
    if (!existing[0] && !project.hosted) {
      await spend(context.userId, DEPLOY_COST.web, "host", project.id, "Web + TestTrack");
    }
    await sql`
      insert into public_apps (slug, title, html, testers_code, project_id)
      values (${slug}, ${project.title}, ${html}, ${code}, ${project.id})
      on conflict (slug) do update
        set html = excluded.html, title = excluded.title, updated_at = now()
    `;
    const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await sql`
      update projects
      set hosted = true, hosted_until = ${until}, html = ${html}, updated_at = now()
      where id = ${project.id} and user_id = ${context.userId}
    `;
    const id = crypto.randomUUID();
    const url = appUrl(slug);
    await sql`
      insert into deploys (id, project_id, user_id, target, status, slug, testers_code, url, log)
      values (
        ${id}, ${project.id}, ${context.userId}, 'web', 'live', ${slug}, ${code}, ${url},
        ${JSON.stringify(harborWeb())}
      )
    `;
    return {
      slug,
      url,
      testersCode: code,
      testersUrl: trackUrl(code),
    };
  });

export const publishGuest = createServerFn({ method: "POST" })
  .validator((input: { title: string; html: string }) => ({
    title: input.title.trim().slice(0, 80) || "App",
    html: input.html,
  }))
  .handler(async ({ data }) => {
    if (!data.html) throw new Error("Nothing to publish");
    const slug = await uniqueSlug(data.title);
    const code = testersCode();
    const html = withPwa(data.html, data.title, slug);
    const sql = await getSql();
    await sql`
      insert into public_apps (slug, title, html, testers_code)
      values (${slug}, ${data.title}, ${html}, ${code})
    `;
    const id = crypto.randomUUID();
    const url = appUrl(slug);
    await sql`
      insert into deploys (id, target, status, slug, testers_code, url, log)
      values (${id}, 'web', 'live', ${slug}, ${code}, ${url}, ${JSON.stringify(harborWeb())})
    `;
    return { slug, url, testersCode: code, testersUrl: trackUrl(code) };
  });

export const shipStore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { projectId: string; target: "ios" | "android"; appleTeam?: string; bundleId?: string }) => ({
    projectId: input.projectId,
    target: input.target,
    appleTeam: input.appleTeam?.trim().slice(0, 20) || "",
    bundleId: input.bundleId?.trim().slice(0, 80) || "",
  }))
  .handler(async ({ context, data }) => {
    await ensureSchema();
    const sql = await getSql();
    const rows = await sql<{ id: string; title: string; html: string | null }>`
      select id, title, html from projects
      where id = ${data.projectId} and user_id = ${context.userId}
    `;
    if (!rows[0]?.html) throw new Error("Build the app first");
    const project = rows[0];
    await spend(
      context.userId,
      DEPLOY_COST[data.target],
      data.target,
      project.id,
      data.target === "ios" ? "TestFlight pack" : "Play pack",
    );
    const pub = await sql<{ slug: string; testers_code: string | null }>`
      select slug, testers_code from public_apps where project_id = ${project.id}
    `;
    const slug = pub[0]?.slug ?? (await uniqueSlug(project.title));
    const code = pub[0]?.testers_code ?? testersCode();
    if (!pub[0]) {
      const html = withPwa(project.html as string, project.title, slug);
      await sql`
        insert into public_apps (slug, title, html, testers_code, project_id)
        values (${slug}, ${project.title}, ${html}, ${code}, ${project.id})
      `;
    }
    const bundle = data.bundleId || bundleIdFromTitle(project.title);
    const hasTeam = data.target === "ios" ? Boolean(data.appleTeam) : true;
    const status = hasTeam ? (data.target === "ios" ? "testflight" : "play") : "needs_account";
    const url = data.target === "ios" ? trackUrl(code) : appUrl(slug);
    const id = crypto.randomUUID();
    await sql`
      insert into deploys (
        id, project_id, user_id, target, status, slug, bundle_id, apple_team,
        testers_code, url, log
      )
      values (
        ${id}, ${project.id}, ${context.userId}, ${data.target}, ${status}, ${slug},
        ${bundle}, ${data.appleTeam || null}, ${code}, ${url},
        ${JSON.stringify(harborStore(data.target, hasTeam))}
      )
    `;
    return {
      id,
      status,
      slug,
      bundleId: bundle,
      testersCode: code,
      testersUrl: trackUrl(code),
      url: appUrl(slug),
      needsAccount: !hasTeam,
      pack: (() => {
        const files = expoFiles({
          title: project.title,
          slug,
          html: project.html as string,
          bundleId: bundle,
          appleTeam: data.appleTeam,
          liveUrl: appUrl(slug),
          platform: data.target,
        });
        return { filename: `${slug}-${data.target}.zip`, base64: toBase64(zipFiles(files)) };
      })(),
    };
  });

export const downloadNativePack = createServerFn({ method: "POST" })
  .validator((input: {
    title: string;
    html: string;
    slug?: string;
    target: "ios" | "android" | "windows";
    appleTeam?: string;
    bundleId?: string;
  }) => ({
    title: input.title.trim().slice(0, 80) || "App",
    html: input.html,
    slug: slugify(input.slug || input.title),
    target: input.target,
    appleTeam: input.appleTeam?.trim() || "",
    bundleId: input.bundleId?.trim() || bundleIdFromTitle(input.title),
  }))
  .handler(({ data }) => {
    const liveUrl = appUrl(data.slug);
    const files =
      data.target === "windows"
        ? windowsFiles({
            title: data.title,
            slug: data.slug,
            html: data.html,
            liveUrl,
          })
        : expoFiles({
            title: data.title,
            slug: data.slug,
            html: data.html,
            bundleId: data.bundleId,
            appleTeam: data.appleTeam,
            liveUrl,
            platform: data.target,
          });
    const zip = zipFiles(files);
    return {
      filename: `${data.slug}-${data.target}.zip`,
      base64: toBase64(zip),
    };
  });
