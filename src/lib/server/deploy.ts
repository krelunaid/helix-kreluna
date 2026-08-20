import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { bundleIdFromTitle, expoFiles, slugify, withPwa, windowsFiles } from "@/lib/expo-pack";
import { archivedFor, featuredFor, featuredHtml } from "@/lib/templates";
import { normalizeLocale } from "@/lib/i18n-core";
import { toBase64, zipFiles } from "@/lib/zip";
import { publicOriginFromHostname } from "@/lib/env.shared";
import { protectGeneratedHtml } from "@/lib/generated-content-policy";
import {
  GUEST_PUBLISH_TTL_MS,
  hashOpaqueToken,
  isOpaqueGuestToken,
  utf8ByteLength,
} from "@/lib/guest-security";
import { initialWebHostingIdempotencyKey, rethrowCreditMutationError } from "@/lib/server/credits";
import { hashGuestBuildToken } from "@/lib/server/build-job-access";
import {
  getApprovedGuestBuild,
  getApprovedOwnedBuild,
  HumanGateError,
  normalizeGateRequestId,
} from "@/lib/server/review/human-gate";
import {
  assertPublishedUtf8,
  PublishedArtifactIntegrityError,
  sha256BytesHex,
  sha256Utf8Hex,
} from "@/lib/server/release/integrity";
import { deleteExpiredGuestPublications } from "@/lib/server/persistence/guest-publications";

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

// Windows currently prepares a source-only Electron wrapper and performs no
// provider build, signing or submission. The endpoint does not debit credits,
// so its displayed cost must remain zero until an atomic paid flow exists.
export const DEPLOY_COST = { web: 50, ios: 80, android: 80, windows: 0 } as const;
export type DeployTarget = keyof typeof DEPLOY_COST;

export type StoreReadiness = {
  sourcePackageReady: true;
  credentialsConfigured: boolean;
  nativeBuildReady: false;
  signingReady: false;
  submissionReady: false;
  missingCredentials: string[];
  reason: "STORE_PROVIDER_NOT_INTEGRATED";
};

export function storeReadiness(
  target: "ios" | "android",
  env: Record<string, string | undefined> = process.env,
): StoreReadiness {
  const required =
    target === "ios" ? ["EXPO_TOKEN", "APPLE_TEAM_ID"] : ["EXPO_TOKEN", "PLAY_SERVICE_JSON"];
  const missingCredentials = required.filter((name) => !env[name]?.trim());
  return {
    sourcePackageReady: true,
    credentialsConfigured: missingCredentials.length === 0,
    nativeBuildReady: false,
    signingReady: false,
    submissionReady: false,
    missingCredentials,
    reason: "STORE_PROVIDER_NOT_INTEGRATED",
  };
}

export type DeployStep = {
  id: string;
  label: string;
  status: "queued" | "running" | "done" | "blocked" | "skipped" | "error";
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
  build_job_id: string | null;
  provider: string | null;
  provider_deploy_id: string | null;
  artifact_ref: string | null;
  /** SHA-256 of the source HTML sealed by Human Gate. */
  artifact_sha256: string | null;
  /** SHA-256 of the exact HTML or ZIP bytes persisted/exported by Harbor. */
  published_sha256: string | null;
  output_integrity_version: number | null;
  rollback_ref: string | null;
  release_key: string | null;
  completed_at: string | null;
  error_code: string | null;
  error_message: string | null;
};

export type PublicApp = {
  slug: string;
  title: string;
  html: string;
  isGuest: boolean;
  expiresAt: string | null;
  sourceArtifactSha256: string | null;
  servedSha256: string | null;
};

type PublicAppRow = {
  slug: string;
  title: string;
  html: string;
  visibility: string;
  expires_at: string | null;
  source_job_id: string | null;
  source_artifact_sha256: string | null;
  served_sha256: string | null;
  publication_integrity_version: number | null;
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
  const host =
    (typeof process !== "undefined" ? process.env.VITE_PUBLIC_HOSTNAME : undefined) ??
    (import.meta.env.VITE_PUBLIC_HOSTNAME as string | undefined);
  return host ? publicOriginFromHostname(host) : "";
}

function appUrl(slug: string, accessToken?: string) {
  const origin = publicOrigin();
  const path = `/a/${slug}`;
  const url = origin ? `${origin}${path}` : path;
  return accessToken ? `${url}?access=${encodeURIComponent(accessToken)}` : url;
}

function trackUrl(code: string) {
  const origin = publicOrigin();
  return origin ? `${origin}/t/${code}` : `/t/${code}`;
}

function testersCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const random = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(random, (byte) => alphabet[byte % alphabet.length]).join("");
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

async function cleanupExpiredGuestPublishes() {
  await ensureSchema();
  await deleteExpiredGuestPublications();
}

async function markResponsePrivate() {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "private, no-store, max-age=0");
  setResponseHeader("Referrer-Policy", "no-referrer");
}

async function toPublicApp(row: PublicAppRow): Promise<PublicApp> {
  const isGuest = row.visibility === "guest";
  const protectedHtml = protectGeneratedHtml(row.html, { noIndex: isGuest });
  if (row.publication_integrity_version === 1) {
    if (!row.source_job_id || !row.source_artifact_sha256) {
      throw new PublishedArtifactIntegrityError();
    }
    await assertPublishedUtf8({
      value: protectedHtml,
      expectedSha256: row.served_sha256,
    });
  } else if (row.publication_integrity_version !== null) {
    throw new PublishedArtifactIntegrityError();
  }
  return {
    slug: row.slug,
    title: row.title,
    html: protectedHtml,
    isGuest,
    expiresAt: row.expires_at,
    sourceArtifactSha256: row.source_artifact_sha256,
    servedSha256: row.publication_integrity_version === 1 ? row.served_sha256 : null,
  };
}

function harborWeb(): DeployStep[] {
  return [
    {
      id: "gate",
      label: "Human Gate",
      status: "done",
      detail: "Approved artifact hash verified",
    },
    {
      id: "persist",
      label: "Harbor · Kreluna hosting",
      status: "done",
      detail: "Exact served HTML bytes persisted with a separate SHA-256",
    },
    {
      id: "url",
      label: "Harbor · public route",
      status: "done",
      detail: "Public Kreluna URL created",
    },
    {
      id: "cdn",
      label: "Harbor · CDN verification",
      status: "skipped",
      detail: "No independent CDN probe was executed",
    },
  ];
}

function harborStore(target: "ios" | "android"): DeployStep[] {
  const store = target === "ios" ? "App Store Connect" : "Google Play Console";
  return [
    {
      id: "gate",
      label: "Human Gate",
      status: "done",
      detail: "Approved artifact hash verified",
    },
    {
      id: "pack",
      label: "Harbor · web-to-native source package",
      status: "done",
      detail: `Expo source workspace prepared for ${target} with exact ZIP SHA-256`,
    },
    {
      id: "build",
      label: "Harbor · native binary build",
      status: "skipped",
      detail: "EAS/native build was not executed",
    },
    {
      id: "sign",
      label: "Harbor · signing",
      status: "blocked",
      detail: "Developer signing credentials are required",
    },
    {
      id: "upload",
      label: `Harbor · ${store}`,
      status: "skipped",
      detail: "No store upload or submission was executed",
    },
  ];
}

export const getPublicApp = createServerFn({ method: "GET" })
  .validator((input: { slug: string; accessToken?: string; locale?: string }) => ({
    slug: input.slug.trim().slice(0, 64),
    accessToken: input.accessToken?.trim().slice(0, 128) || "",
    locale: normalizeLocale(input.locale),
  }))
  .handler(async ({ data }) => {
    await markResponsePrivate();
    // Built-in examples use a reserved namespace and never depend on a
    // database row. This keeps the showcase deterministic, localizable and
    // available even when the application database is offline.
    const builtIn = [...featuredFor(data.locale), ...archivedFor(data.locale)].find(
      (entry) => entry.id === data.slug,
    );
    if (builtIn) {
      return {
        slug: data.slug,
        title: builtIn.title,
        html: protectGeneratedHtml(featuredHtml(data.slug, data.locale)),
        isGuest: false,
        expiresAt: null,
        sourceArtifactSha256: null,
        servedSha256: null,
      };
    }
    await ensureSchema();
    await cleanupExpiredGuestPublishes();
    const sql = await getSql();
    const tokenHash = isOpaqueGuestToken(data.accessToken)
      ? await hashOpaqueToken(data.accessToken)
      : null;
    const rows = await sql<PublicAppRow>`
      select slug, title, html, visibility, expires_at, source_job_id,
             source_artifact_sha256, served_sha256,
             publication_integrity_version
      from public_apps
      where slug = ${data.slug}
        and (
          visibility <> 'guest'
          or (
            expires_at > now()
            and guest_token_hash = ${tokenHash}
          )
        )
    `;
    return rows[0] ? await toPublicApp(rows[0]) : null;
  });

export const getPublicByCode = createServerFn({ method: "GET" })
  .validator((code: string) => code.trim().toUpperCase().slice(0, 12))
  .handler(async ({ data: code }) => {
    await markResponsePrivate();
    await ensureSchema();
    await cleanupExpiredGuestPublishes();
    const sql = await getSql();
    const rows = await sql<PublicAppRow>`
      select slug, title, html, visibility, expires_at, source_job_id,
             source_artifact_sha256, served_sha256,
             publication_integrity_version
      from public_apps
      where testers_code = ${code} and visibility = 'public'
    `;
    return rows[0] ? await toPublicApp(rows[0]) : null;
  });

export const listDeploys = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((projectId: string) => projectId)
  .handler(async ({ context, data: projectId }) => {
    await ensureSchema();
    const sql = await getSql();
    const rows = await sql<DeployRow>`
      select id, project_id, user_id, target, status, slug, bundle_id, apple_team,
             version, testers_code, url, log, created_at, updated_at,
             build_job_id, provider, provider_deploy_id, artifact_ref,
             artifact_sha256, published_sha256, output_integrity_version,
             rollback_ref, release_key, completed_at,
             error_code, error_message
      from deploys where project_id = ${projectId} and user_id = ${context.userId}
      order by created_at desc
    `;
    return rows.map(mapDeploy);
  });

export const publishWeb = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { projectId: string; jobId: string; requestId: string }) => ({
    projectId: input.projectId.trim().slice(0, 128),
    jobId: input.jobId.trim().slice(0, 128),
    requestId: normalizeGateRequestId(input.requestId),
  }))
  .handler(async ({ context, data }) => {
    await ensureSchema();
    const sql = await getSql();
    const artifact = await getApprovedOwnedBuild({
      jobId: data.jobId,
      projectId: data.projectId,
      userId: context.userId,
    });
    const releaseKey = `web:${data.jobId}:${data.requestId}`;
    const replay = await sql<{
      id: string;
      slug: string;
      url: string;
      testers_code: string;
      html: string;
      source_artifact_sha256: string | null;
      served_sha256: string | null;
      publication_integrity_version: number | null;
      artifact_sha256: string | null;
      published_sha256: string | null;
      output_integrity_version: number | null;
    }>`
      select deploy.id, deploy.slug, deploy.url, app.testers_code, app.html,
             app.source_artifact_sha256, app.served_sha256,
             app.publication_integrity_version, deploy.artifact_sha256,
             deploy.published_sha256, deploy.output_integrity_version
      from deploys as deploy
      join public_apps as app on app.slug = deploy.slug
      where deploy.release_key = ${releaseKey}
        and deploy.user_id = ${context.userId}
        and deploy.project_id = ${data.projectId}
        and deploy.status = 'deployed'
    `;
    if (replay[0]) {
      if (
        replay[0].output_integrity_version !== 1 ||
        replay[0].publication_integrity_version !== 1 ||
        replay[0].artifact_sha256 !== artifact.artifactSha256 ||
        replay[0].source_artifact_sha256 !== artifact.artifactSha256 ||
        replay[0].published_sha256 !== replay[0].served_sha256
      ) {
        throw new PublishedArtifactIntegrityError();
      }
      await assertPublishedUtf8({
        value: protectGeneratedHtml(replay[0].html),
        expectedSha256: replay[0].served_sha256,
      });
      return {
        slug: replay[0].slug,
        url: replay[0].url,
        testersCode: replay[0].testers_code,
        testersUrl: trackUrl(replay[0].testers_code),
        deployId: replay[0].id,
        sourceArtifactSha256: replay[0].artifact_sha256,
        publishedSha256: replay[0].published_sha256,
      };
    }
    const rows = await sql<{
      id: string;
      title: string;
      hosted: boolean | number;
    }>`
      select id, title, hosted from projects
      where id = ${data.projectId} and user_id = ${context.userId}
    `;
    if (!rows[0]) throw new HumanGateError("HUMAN_GATE_FORBIDDEN", 403);
    const project = rows[0];
    const existing = await sql<{ slug: string; testers_code: string | null }>`
      select slug, testers_code from public_apps where project_id = ${project.id}
    `;
    const slug = existing[0]?.slug ?? (await uniqueSlug(project.title));
    const code = existing[0]?.testers_code ?? testersCode();
    const html = protectGeneratedHtml(
      withPwa(artifact.html, artifact.title || project.title, slug),
    );
    const publishedSha256 = await sha256Utf8Hex(html);
    const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const id = crypto.randomUUID();
    let deployId: string = id;
    const url = appUrl(slug);
    const shouldCharge = !existing[0] && !project.hosted;
    const previous = await sql<{ id: string }>`
      select id
      from deploys
      where project_id = ${project.id}
        and user_id = ${context.userId}
        and target = 'web'
        and status = 'deployed'
      order by completed_at desc nulls last, created_at desc
      limit 1
    `;
    const rollbackRef = previous[0]?.id ?? null;
    try {
      const deployed = await sql<{ id: string }>`
        with gate as materialized (
          select job.id
          from build_jobs as job
          join projects as owned on owned.id = job.project_id
          where job.id = ${data.jobId}
            and job.project_id = ${project.id}
            and job.user_id = ${context.userId}
            and owned.user_id = ${context.userId}
            and owned.current_build_job_id = job.id
            and job.queue_status in ('approved', 'deployed')
            and job.artifact_sha256 = ${artifact.artifactSha256}
            and not exists (
              select 1
              from deploys as prior_release
              where prior_release.release_key = ${releaseKey}
                and (
                  prior_release.artifact_sha256 is distinct from ${artifact.artifactSha256}
                  or prior_release.published_sha256 is distinct from ${publishedSha256}
                )
            )
            and exists (
              select 1 from build_job_gate_events as event
              where event.job_id = job.id
                and event.decision = 'approve'
                and event.artifact_sha256 = job.artifact_sha256
            )
          for update of job
        ), credit as (
          select mutation.was_applied
          from gate
          cross join (select 1 where ${shouldCharge}) as charge_required
          cross join lateral apply_credit_entry(
            ${context.userId},
            ${-DEPLOY_COST.web},
            'host',
            ${project.id},
            'Web + TestTrack',
            ${initialWebHostingIdempotencyKey(project.id)}
          ) as mutation
        ),
        permitted as (
          select false as charge_applied
          from gate
          where not ${shouldCharge}
          union all
          select was_applied as charge_applied from credit
          limit 1
        ),
        published as (
          insert into public_apps (
            slug, title, html, testers_code, project_id, visibility,
            guest_token_hash, expires_at, content_bytes, source_job_id,
            source_artifact_sha256, served_sha256
          )
          select
            ${slug}, ${artifact.title || project.title}, ${html}, ${code}, ${project.id}, 'public',
            null, null, ${utf8ByteLength(html)}, ${data.jobId},
            ${artifact.artifactSha256}, ${publishedSha256}
          from permitted
          on conflict (slug) do update
            set html = excluded.html,
                title = excluded.title,
                visibility = 'public',
                guest_token_hash = null,
                expires_at = null,
                content_bytes = excluded.content_bytes,
                source_job_id = excluded.source_job_id,
                source_artifact_sha256 = excluded.source_artifact_sha256,
                served_sha256 = excluded.served_sha256,
                publication_integrity_version = excluded.publication_integrity_version,
                updated_at = now()
          returning slug, served_sha256
        ),
        hosted as (
          update projects
          set hosted = true,
              hosted_until = ${until},
              html = ${html},
              credits_spent = credits_spent
                + case when permitted.charge_applied then ${DEPLOY_COST.web} else 0 end,
              updated_at = now()
          from published, permitted
          where projects.id = ${project.id}
            and projects.user_id = ${context.userId}
          returning projects.id, published.served_sha256
        ),
        release as (
          insert into deploys (
            id, project_id, user_id, target, status, slug, testers_code, url, log,
            build_job_id, provider, provider_deploy_id, artifact_ref,
            artifact_sha256, published_sha256, rollback_ref, release_key,
            completed_at
          )
          select
            ${id}, hosted.id, ${context.userId}, 'web', 'deployed', ${slug}, ${code}, ${url},
            ${JSON.stringify(harborWeb())}, ${data.jobId}, 'kreluna-public-apps', ${id},
            ${`build-job:${data.jobId}`}, ${artifact.artifactSha256},
            hosted.served_sha256, ${rollbackRef},
            ${releaseKey}, now()
          from hosted
          on conflict (release_key) where release_key is not null
          do update set updated_at = deploys.updated_at
          where deploys.artifact_sha256 = excluded.artifact_sha256
            and deploys.published_sha256 = excluded.published_sha256
          returning id
        ), completed as (
          select completed.release_id as id
          from release
          cross join lateral complete_build_job_release(
            ${data.jobId}, ${artifact.artifactSha256}, release.id
          ) as completed
        )
        select id from completed
      `;
      if (!deployed[0]) throw new Error("Web publish did not commit");
      deployId = deployed[0].id;
    } catch (error) {
      rethrowCreditMutationError(error);
    }
    return {
      slug,
      url,
      testersCode: code,
      testersUrl: trackUrl(code),
      deployId,
      sourceArtifactSha256: artifact.artifactSha256,
      publishedSha256,
    };
  });

export const publishGuest = createServerFn({ method: "POST" })
  .validator((input: { jobId: string; guestAccessToken: string; requestId: string }) => ({
    jobId: input.jobId.trim().slice(0, 128),
    guestAccessToken: input.guestAccessToken.trim().slice(0, 128),
    requestId: normalizeGateRequestId(input.requestId),
  }))
  .handler(async ({ data }) => {
    await markResponsePrivate();
    const artifact = await getApprovedGuestBuild(data);
    const accessToken = await hashOpaqueToken(
      `helix-guest-publish-v1\u0000${data.guestAccessToken}\u0000${data.jobId}`,
    );
    const tokenHash = await hashOpaqueToken(accessToken);
    const slugHash = await hashOpaqueToken(`helix-guest-slug-v1\u0000${accessToken}`);
    const slug = `g-${slugHash.slice(0, 40)}`;
    const expiresAt = new Date(Date.now() + GUEST_PUBLISH_TTL_MS).toISOString();
    const releaseKey = `guest-preview:${data.jobId}`;
    const html = protectGeneratedHtml(withPwa(artifact.html, artifact.title, slug), {
      noIndex: true,
    });
    const publishedSha256 = await sha256Utf8Hex(html);
    const sql = await getSql();
    const existing = await sql<{
      slug: string;
      expires_at: string;
      html: string;
      source_artifact_sha256: string | null;
      served_sha256: string | null;
      publication_integrity_version: number | null;
      artifact_sha256: string | null;
      published_sha256: string | null;
      output_integrity_version: number | null;
    }>`
      select app.slug, app.expires_at, app.html,
             app.source_artifact_sha256, app.served_sha256,
             app.publication_integrity_version, deploy.artifact_sha256,
             deploy.published_sha256, deploy.output_integrity_version
      from public_apps as app
      join deploys as deploy on deploy.release_key = ${releaseKey}
      where app.source_job_id = ${data.jobId}
        and app.visibility = 'guest'
        and app.expires_at > now()
    `;
    if (existing[0]) {
      if (
        existing[0].output_integrity_version !== 1 ||
        existing[0].publication_integrity_version !== 1 ||
        existing[0].artifact_sha256 !== artifact.artifactSha256 ||
        existing[0].source_artifact_sha256 !== artifact.artifactSha256 ||
        existing[0].published_sha256 !== existing[0].served_sha256 ||
        existing[0].published_sha256 !== publishedSha256
      ) {
        throw new PublishedArtifactIntegrityError();
      }
      await assertPublishedUtf8({
        value: protectGeneratedHtml(existing[0].html, { noIndex: true }),
        expectedSha256: existing[0].served_sha256,
      });
      const url = appUrl(existing[0].slug, accessToken);
      return {
        slug: existing[0].slug,
        url,
        accessToken,
        testersCode: accessToken,
        testersUrl: url,
        expiresAt: String(existing[0].expires_at),
        sourceArtifactSha256: existing[0].artifact_sha256,
        publishedSha256: existing[0].published_sha256,
      };
    }
    const { GUEST_PUBLISH_BUDGET, releaseGuestBudget, reserveGuestBudget } =
      await import("@/lib/server/guest-abuse.server");
    const lease = await reserveGuestBudget(GUEST_PUBLISH_BUDGET, {
      inputBytes: utf8ByteLength(artifact.html),
    });
    try {
      await cleanupExpiredGuestPublishes();
      const id = crypto.randomUUID();
      const url = appUrl(slug, accessToken);
      const privateAuditUrl = appUrl(slug);
      const guestLog: DeployStep[] = [
        {
          id: "gate",
          label: "Human Gate",
          status: "done",
          detail: "Guest capability and approved artifact hash verified",
        },
        {
          id: "temporary",
          label: "Harbor · temporary guest preview",
          status: "done",
          detail: `Expires ${expiresAt}`,
        },
      ];
      const buildTokenHash = await hashGuestBuildToken(data.guestAccessToken);
      const deployed = await sql<{ id: string }>`
        with gate as materialized (
          select job.id
          from build_jobs as job
          where job.id = ${data.jobId}
            and job.user_id is null
            and job.project_id is null
            and job.guest_access_token_hash = ${buildTokenHash}
            and job.guest_access_expires_at > now()
            and job.queue_status in ('approved', 'deployed')
            and job.artifact_sha256 = ${artifact.artifactSha256}
            and not exists (
              select 1
              from deploys as prior_release
              where prior_release.release_key = ${releaseKey}
                and (
                  prior_release.artifact_sha256 is distinct from ${artifact.artifactSha256}
                  or prior_release.published_sha256 is distinct from ${publishedSha256}
                )
            )
            and exists (
              select 1 from build_job_gate_events as event
              where event.job_id = job.id
                and event.decision = 'approve'
                and event.artifact_sha256 = job.artifact_sha256
            )
          for update
        ), published as (
          insert into public_apps (
            slug, title, html, testers_code, project_id, visibility,
            guest_token_hash, expires_at, content_bytes, source_job_id,
            source_artifact_sha256, served_sha256
          )
          select
            ${slug}, ${artifact.title}, ${html}, null, null, 'guest',
            ${tokenHash}, ${expiresAt}, ${utf8ByteLength(html)}, ${data.jobId},
            ${artifact.artifactSha256}, ${publishedSha256}
          from gate
          on conflict (source_job_id) where source_job_id is not null
          do update set
            title = excluded.title,
            html = excluded.html,
            guest_token_hash = excluded.guest_token_hash,
            expires_at = excluded.expires_at,
            content_bytes = excluded.content_bytes,
            source_artifact_sha256 = excluded.source_artifact_sha256,
            served_sha256 = excluded.served_sha256,
            publication_integrity_version = excluded.publication_integrity_version,
            updated_at = now()
          returning slug, served_sha256
        ), release as (
          insert into deploys (
            id, target, status, slug, testers_code, url, log,
            build_job_id, provider, provider_deploy_id, artifact_ref,
            artifact_sha256, published_sha256, release_key, completed_at
          )
          select
            ${id}, 'web', 'deployed', published.slug, null, ${privateAuditUrl},
            ${JSON.stringify(guestLog)}, ${data.jobId},
            'kreluna-temporary-preview', ${id}, ${`build-job:${data.jobId}`},
            ${artifact.artifactSha256}, published.served_sha256,
            ${releaseKey}, now()
          from published
          on conflict (release_key) where release_key is not null
          do update set updated_at = deploys.updated_at
          where deploys.artifact_sha256 = excluded.artifact_sha256
            and deploys.published_sha256 = excluded.published_sha256
          returning id
        ), completed as (
          select completed.release_id as id
          from release
          cross join lateral complete_build_job_release(
            ${data.jobId}, ${artifact.artifactSha256}, release.id
          ) as completed
        )
        select id from completed
      `;
      if (!deployed[0]) throw new HumanGateError("HUMAN_GATE_CLOSED");
      return {
        slug,
        url,
        accessToken,
        testersCode: accessToken,
        testersUrl: url,
        expiresAt,
        sourceArtifactSha256: artifact.artifactSha256,
        publishedSha256,
      };
    } finally {
      try {
        await releaseGuestBudget(lease);
      } catch (error) {
        console.error("[guest-publish] failed to release concurrency lease", {
          error: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }
  });

export const shipStore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      projectId: string;
      jobId: string;
      target: "ios" | "android";
      appleTeam?: string;
      bundleId?: string;
      requestId: string;
    }) => ({
      projectId: input.projectId.trim().slice(0, 128),
      jobId: input.jobId.trim().slice(0, 128),
      target: input.target,
      appleTeam: input.appleTeam?.trim().slice(0, 20) || "",
      bundleId: input.bundleId?.trim().slice(0, 80) || "",
      requestId: normalizeGateRequestId(input.requestId),
    }),
  )
  .handler(async ({ context, data }) => {
    await ensureSchema();
    const sql = await getSql();
    const artifact = await getApprovedOwnedBuild({
      jobId: data.jobId,
      projectId: data.projectId,
      userId: context.userId,
    });
    const rows = await sql<{ id: string; title: string }>`
      select id, title from projects
      where id = ${data.projectId} and user_id = ${context.userId}
    `;
    if (!rows[0]) throw new HumanGateError("HUMAN_GATE_FORBIDDEN", 403);
    const project = rows[0];
    const title = artifact.title || project.title;
    const slug = slugify(title);
    const bundle = data.bundleId || bundleIdFromTitle(title);
    const files = expoFiles({
      title,
      slug,
      html: artifact.html,
      bundleId: bundle,
      appleTeam: data.appleTeam,
      liveUrl: appUrl(slug),
      platform: data.target,
    });
    const zip = zipFiles(files);
    const publishedSha256 = await sha256BytesHex(zip);
    const pack = {
      filename: `${slug}-${data.target}-source.zip`,
      base64: toBase64(zip),
    };
    const readiness = storeReadiness(data.target);
    const releaseKey = `store-package:${data.jobId}:${data.target}:${data.requestId}`;
    const id = crypto.randomUUID();
    let deployId: string = id;
    try {
      const prepared = await sql<{ id: string }>`
        with gate as materialized (
          select job.id
          from build_jobs as job
          join projects as owned on owned.id = job.project_id
          where job.id = ${data.jobId}
            and job.project_id = ${project.id}
            and job.user_id = ${context.userId}
            and owned.user_id = ${context.userId}
            and owned.current_build_job_id = job.id
            and job.queue_status in ('approved', 'deployed')
            and job.artifact_sha256 = ${artifact.artifactSha256}
            and not exists (
              select 1
              from deploys as prior_release
              where prior_release.release_key = ${releaseKey}
                and (
                  prior_release.artifact_sha256 is distinct from ${artifact.artifactSha256}
                  or prior_release.published_sha256 is distinct from ${publishedSha256}
                )
            )
            and exists (
              select 1 from build_job_gate_events as event
              where event.job_id = job.id
                and event.decision = 'approve'
                and event.artifact_sha256 = job.artifact_sha256
            )
          for update of job
        ), credit as materialized (
          select gate.id as job_id, mutation.was_applied
          from gate
          cross join lateral apply_credit_entry(
            ${context.userId},
            ${-DEPLOY_COST[data.target]},
            ${data.target},
            ${project.id},
            ${
              data.target === "ios"
                ? "iOS web-to-native source package"
                : "Android web-to-native source package"
            },
            ${releaseKey}
          ) as mutation
        ), project_cost as (
          update projects
          set credits_spent = credits_spent
                + case when credit.was_applied then ${DEPLOY_COST[data.target]} else 0 end,
              updated_at = now()
          from credit
          where projects.id = ${project.id}
            and projects.user_id = ${context.userId}
          returning projects.id
        )
        insert into deploys (
          id, project_id, user_id, target, status, slug, bundle_id, apple_team,
          testers_code, url, log, build_job_id, provider,
          provider_deploy_id, artifact_ref, artifact_sha256, published_sha256,
          release_key, completed_at
        )
        select
          ${id}, project_cost.id, ${context.userId}, ${data.target},
          'package_prepared', ${slug}, ${bundle}, ${data.appleTeam || null},
          null, null, ${JSON.stringify(harborStore(data.target))}, ${data.jobId},
          'local-export', null, ${pack.filename}, ${artifact.artifactSha256},
          ${publishedSha256},
          ${releaseKey}, now()
        from project_cost
        on conflict (release_key) where release_key is not null
        do update set updated_at = deploys.updated_at
        where deploys.artifact_sha256 = excluded.artifact_sha256
          and deploys.published_sha256 = excluded.published_sha256
        returning id
      `;
      if (!prepared[0]) throw new HumanGateError("HUMAN_GATE_CLOSED");
      deployId = prepared[0].id;
    } catch (error) {
      rethrowCreditMutationError(error);
    }
    return {
      id: deployId,
      status: "package_prepared" as const,
      slug,
      bundleId: bundle,
      testersCode: null,
      testersUrl: null,
      url: null,
      needsAccount: true,
      submissionStatus: "not_executed" as const,
      readiness,
      pack,
      sourceArtifactSha256: artifact.artifactSha256,
      publishedSha256,
    };
  });

export const downloadNativePack = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      projectId: string;
      jobId: string;
      target: "ios" | "android" | "windows";
      appleTeam?: string;
      bundleId?: string;
    }) => ({
      projectId: input.projectId.trim().slice(0, 128),
      jobId: input.jobId.trim().slice(0, 128),
      target: input.target,
      appleTeam: input.appleTeam?.trim() || "",
      bundleId: input.bundleId?.trim() || "",
    }),
  )
  .handler(async ({ context, data }) => {
    const artifact = await getApprovedOwnedBuild({
      jobId: data.jobId,
      projectId: data.projectId,
      userId: context.userId,
    });
    const title = artifact.title || "App";
    const slug = slugify(title);
    const bundleId = data.bundleId || bundleIdFromTitle(title);
    const liveUrl = appUrl(slug);
    const files =
      data.target === "windows"
        ? windowsFiles({
            title,
            slug,
            html: artifact.html,
            liveUrl,
          })
        : expoFiles({
            title,
            slug,
            html: artifact.html,
            bundleId,
            appleTeam: data.appleTeam,
            liveUrl,
            platform: data.target,
          });
    const zip = zipFiles(files);
    const publishedSha256 = await sha256BytesHex(zip);
    return {
      filename: `${slug}-${data.target}-source.zip`,
      base64: toBase64(zip),
      status: "source_package_prepared" as const,
      submissionStatus: "not_executed" as const,
      sourceArtifactSha256: artifact.artifactSha256,
      publishedSha256,
    };
  });
