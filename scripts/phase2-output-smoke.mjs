#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defaultSerovalPlugins, encode } from "@tanstack/router-core";
import { fromCrossJSON, toJSONAsync } from "seroval";

const auth401Mode = process.argv.includes("--auth-401");
delete process.env.NETLIFY;
delete process.env.DATABASE_URL;
delete process.env.NETLIFY_DB_URL;
process.env.HELIX_AI_GATEWAY_ENABLED = "false";
delete process.env.NETLIFY_AI_GATEWAY_KEY;
delete process.env.NETLIFY_AI_GATEWAY_BASE_URL;
process.env.BETTER_AUTH_URL = "http://localhost:8080";
if (auth401Mode) {
  process.env.VITE_AUTH_ENABLED = "true";
  process.env.VITE_GROK_AUTH_ENABLED = "true";
  process.env.VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED = "false";
  process.env.BETTER_AUTH_SECRET = "s".repeat(48);
  process.env.GROK_AUTH_CLIENT_ID = "phase2-smoke-client";
  process.env.GROK_AUTH_CLIENT_SECRET = "c".repeat(48);
} else {
  process.env.VITE_AUTH_ENABLED = "false";
  process.env.VITE_GROK_AUTH_ENABLED = "false";
  process.env.VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED = "false";
  delete process.env.GROK_AUTH_CLIENT_ID;
  delete process.env.GROK_AUTH_CLIENT_SECRET;
}

const entry = resolve(".netlify/v1/functions/server.mjs");
const manifestSource = await readFile(resolve("dist/server/server.js"), "utf8");
const { default: handleRequest } = await import(pathToFileURL(entry));

function serverFunctionId(functionName) {
  const match = manifestSource.match(
    new RegExp(
      `"([a-f0-9]{64})":\\s*{\\s*functionName:\\s*"${functionName}_createServerFn_handler"`,
    ),
  );
  assert.ok(match?.[1], `${functionName} is missing from the server-function manifest`);
  return match[1];
}

async function request(path, init = {}) {
  return handleRequest(
    new Request(`http://localhost:8080${path}`, {
      ...init,
      headers: {
        origin: "http://localhost:8080",
        "user-agent": "helix-phase2-output-smoke",
        "x-tsr-serverfn": "true",
        ...(init.headers ?? {}),
      },
    }),
  );
}

async function decode(response) {
  const body = await response.json();
  return fromCrossJSON(body, { plugins: defaultSerovalPlugins });
}

async function callPost(functionName, data, includeData = true) {
  const serialized = includeData ? await toJSONAsync({ data }) : undefined;
  const response = await request(`/_serverFn/${serverFunctionId(functionName)}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      ...(serialized ? { "content-type": "application/json" } : {}),
    },
    body: serialized ? JSON.stringify(serialized) : undefined,
  });
  return { response, value: await decode(response) };
}

async function callGet(functionName, data) {
  const serialized = JSON.stringify(await toJSONAsync({ data }));
  const query = encode({ payload: serialized });
  const response = await request(
    `/_serverFn/${serverFunctionId(functionName)}?${query}`,
    { method: "GET", headers: { accept: "application/json" } },
  );
  return { response, value: await decode(response) };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function releaseCandidateHtml(label) {
  const proof = `${label} is the exact sealed release candidate. `.repeat(14);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${label}</title></head><body><main><h1>${label}</h1><p>${proof}</p></main></body></html>`;
}

function passingAegisReport(artifactSha256) {
  return {
    kind: "aegis_static_security",
    scanner: "helix-aegis",
    version: "1.0.0",
    evidence: "measured",
    measuredAt: new Date().toISOString(),
    artifactSha256,
    passed: true,
    blockerCount: 0,
    checks: [
      "secret_scan",
      "unsafe_dom",
      "remote_code",
      "network_policy",
      "storage_boundary",
      "transport_security",
      "form_action",
      "generated_csp",
    ].map((id) => ({ id, status: "passed", findingCount: 0 })),
    findings: [],
    scope: ["phase 4 output smoke fixture"],
    limitations: ["Fixture evidence for the already unit-tested safe HTML artifact."],
  };
}

if (auth401Mode) {
  const unauthorized = await callGet("getBuildJob", { jobId: crypto.randomUUID() });
  assert.equal(unauthorized.value?.error?.message, "Unauthorized");
  assert.equal(unauthorized.response.status, 401);
  assert.equal(unauthorized.response.headers.get("cache-control"), "no-store");
  console.log(JSON.stringify({ unauthorizedStatus: unauthorized.response.status }));
} else {
  const paidPlan = await callPost("choosePlan", {
    planId: "standard",
    requestId: crypto.randomUUID(),
  });
  assert.equal(paidPlan.value?.error?.message, "PAYMENTS_NOT_AVAILABLE");
  assert.equal(paidPlan.response.status, 503);

  const topUp = await callPost("buyExtraCredits", {
    requestId: crypto.randomUUID(),
  });
  assert.equal(topUp.value?.error?.message, "PAYMENTS_NOT_AVAILABLE");
  assert.equal(topUp.response.status, 503);

  const guestAttempts = await Promise.all([
    callPost("startGuestBuild", {
      prompt: "A compact interactive checklist",
      locale: "en",
      mode: "generate",
      gear: "fast",
      max: false,
    }),
    callPost("startGuestBuild", {
      prompt: "A second concurrent guest build",
      locale: "en",
      mode: "generate",
      gear: "fast",
      max: false,
    }),
  ]);
  const started = guestAttempts.find((attempt) => attempt.value?.result?.jobId);
  const limited = guestAttempts.find(
    (attempt) => attempt.value?.error?.message === "Guest limit reached. Sign in or retry later.",
  );
  assert.ok(started, "one guest build should acquire the persistent lease");
  assert.ok(limited, "a concurrent guest build should be rate limited");
  assert.equal(limited.response.status, 429);
  assert.equal(limited.response.headers.get("cache-control"), "no-store");

  const { jobId, guestAccessToken } = started.value.result;
  const wrongToken = `${guestAccessToken.slice(0, -1)}${guestAccessToken.endsWith("0") ? "1" : "0"}`;
  const forbidden = await callPost("getGuestBuildJob", {
    jobId,
    guestAccessToken: wrongToken,
  });
  assert.equal(forbidden.value?.error?.message, "Forbidden");
  assert.equal(forbidden.response.status, 403);

  const allowed = await callPost("getGuestBuildJob", {
    jobId,
    guestAccessToken,
  });
  assert.equal(allowed.value?.error, undefined);
  assert.equal(allowed.value?.result?.id, jobId);
  for (const privateField of [
    "currentHtml",
    "projectId",
    "userId",
    "guestAccessTokenHash",
    "guestAccessExpiresAt",
    "guestBudgetLease",
  ]) {
    assert.equal(Object.hasOwn(allowed.value.result, privateField), false);
  }

  const pg = await globalThis.__pgliteInstance__;
  assert.ok(pg, "the bundled server should initialize its local PostgreSQL-compatible database");
  const publishProjectId = crypto.randomUUID();
  const publishJobId = `phase4-gate-${crypto.randomUUID()}`;
  const approvalRequestId = crypto.randomUUID();
  const publishRequestId = crypto.randomUUID();
  const publishTitle = `Phase 4 gated publish ${publishProjectId.slice(0, 8)}`;
  const publishHtml = releaseCandidateHtml(publishTitle);
  const artifactSha256 = await sha256Hex(publishHtml);
  const aegisReport = passingAegisReport(artifactSha256);
  const requestFingerprint = await sha256Hex(`phase4:${publishJobId}`);
  const publishPayload = JSON.stringify({
    id: publishJobId,
    prompt: "Phase 4 Human Gate output smoke",
    locale: "en",
    mode: "generate",
    currentHtml: publishHtml,
    status: "ready",
    steps: [],
    html: publishHtml,
    usedAi: false,
    title: publishTitle,
    quality: { aegis: aegisReport },
    projectId: publishProjectId,
    userId: "dev-user",
    createdAt: Date.now(),
    requestFingerprint,
    checkpoint: {
      pipelineVersion: "helix-v3",
      requestFingerprint,
      stage: "human_gate",
    },
  });
  await pg.query(
    `insert into profiles (user_id, plan, credits_balance)
     values ('dev-user', 'free', 100)
     on conflict (user_id) do update set credits_balance = excluded.credits_balance`,
  );
  await pg.query(
    `insert into projects (
       id, user_id, title, prompt, status, html, current_build_job_id
     ) values ($1, 'dev-user', $2, 'Phase 4 gated publish smoke',
               'ready', $3, $4)`,
    [publishProjectId, publishTitle, publishHtml, publishJobId],
  );
  const queued = await pg.query(
    `select job_id
     from enqueue_build_job(
       $1, $2, 'dev-user', null, null, $3, $4, $5, 2
     )`,
    [
      publishJobId,
      publishProjectId,
      publishPayload,
      `phase4-output-smoke:${publishJobId}`,
      requestFingerprint,
    ],
  );
  assert.equal(queued.rows[0].job_id, publishJobId);
  await pg.query(
    `update build_jobs
     set queue_status = 'awaiting_human_approval',
         stage = 'human_gate',
         artifact_sha256 = $2,
         completed_at = now(),
         updated_at = now()
     where id = $1`,
    [publishJobId, artifactSha256],
  );
  await pg.query(
    `insert into build_job_quality_reports (
       job_id, report_kind, artifact_sha256, evidence_kind,
       scanner, scanner_version, passed, blocker_count, report
     ) values ($1, $2, $3, $4, $5, $6, true, 0, $7::jsonb)`,
    [
      publishJobId,
      aegisReport.kind,
      artifactSha256,
      aegisReport.evidence,
      aegisReport.scanner,
      aegisReport.version,
      JSON.stringify(aegisReport),
    ],
  );

  const blockedPublish = await callPost("publishWeb", {
    projectId: publishProjectId,
    jobId: publishJobId,
    requestId: crypto.randomUUID(),
  });
  assert.equal(blockedPublish.response.status, 409);
  assert.equal(blockedPublish.value?.error?.message, "HUMAN_GATE_CLOSED");
  const blockedState = await pg.query(
    `select
       profile.credits_balance,
       (select count(*)::int from credit_ledger
        where user_id = 'dev-user' and project_id = $1) as ledger_entries,
       (select count(*)::int from public_apps where project_id = $1) as public_apps,
       (select count(*)::int from deploys where project_id = $1) as deploys
     from profiles as profile
     where profile.user_id = 'dev-user'`,
    [publishProjectId],
  );
  assert.deepEqual(blockedState.rows[0], {
    credits_balance: 100,
    ledger_entries: 0,
    public_apps: 0,
    deploys: 0,
  });

  const approved = await callPost("approveBuildJob", {
    jobId: publishJobId,
    requestId: approvalRequestId,
    reason: "Bundled output smoke approval",
  });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.value?.error, undefined);
  assert.equal(approved.value?.result?.decision, "approve");

  const publishInput = {
    projectId: publishProjectId,
    jobId: publishJobId,
    requestId: publishRequestId,
  };
  const publishAttempts = await Promise.all([
    callPost("publishWeb", publishInput),
    callPost("publishWeb", publishInput),
  ]);
  for (const attempt of publishAttempts) {
    assert.equal(attempt.response.status, 200);
    assert.equal(attempt.value?.error, undefined);
    assert.equal(typeof attempt.value?.result?.url, "string");
    assert.equal(attempt.value?.result?.sourceArtifactSha256, artifactSha256);
    assert.match(attempt.value?.result?.publishedSha256 ?? "", /^[0-9a-f]{64}$/);
  }
  const publishedSha256 = publishAttempts[0].value.result.publishedSha256;
  assert.notEqual(publishedSha256, artifactSha256);
  const publishState = await pg.query(
    `select
       profile.credits_balance,
       project.credits_spent,
       (select count(*)::int from credit_ledger
        where user_id = 'dev-user' and idempotency_key = $2) as ledger_entries,
       (select count(*)::int from public_apps where project_id = $1) as public_apps,
       (select count(*)::int from deploys
        where project_id = $1 and release_key = $3) as deploys,
       (select count(*)::int from build_job_gate_events
        where job_id = $4 and decision = 'approve') as approvals,
       (select queue_status from build_jobs where id = $4) as queue_status,
       (select artifact_sha256 from deploys where release_key = $3) as source_sha256,
       (select published_sha256 from deploys where release_key = $3) as published_sha256,
       (select source_artifact_sha256 from public_apps where project_id = $1) as app_source_sha256,
       (select served_sha256 from public_apps where project_id = $1) as served_sha256,
       (select encode(sha256(convert_to(html, 'UTF8')), 'hex')
        from public_apps where project_id = $1) as actual_served_sha256
     from profiles as profile
     cross join projects as project
     where profile.user_id = 'dev-user' and project.id = $1`,
    [
      publishProjectId,
      `web-host:${publishProjectId}:initial`,
      `web:${publishJobId}:${publishRequestId}`,
      publishJobId,
    ],
  );
  assert.deepEqual(publishState.rows[0], {
    credits_balance: 50,
    credits_spent: 50,
    ledger_entries: 1,
    public_apps: 1,
    deploys: 1,
    approvals: 1,
    queue_status: "deployed",
    source_sha256: artifactSha256,
    published_sha256: publishedSha256,
    app_source_sha256: artifactSha256,
    served_sha256: publishedSha256,
    actual_served_sha256: publishedSha256,
  });

  const served = await callGet("getPublicApp", {
    slug: publishAttempts[0].value.result.slug,
  });
  assert.equal(served.response.status, 200);
  assert.equal(served.value?.error, undefined);
  assert.equal(served.value?.result?.sourceArtifactSha256, artifactSha256);
  assert.equal(served.value?.result?.servedSha256, publishedSha256);
  assert.equal(await sha256Hex(served.value.result.html), publishedSha256);

  await pg.query(
    `update public_apps
     set html = replace(html, '</body>', '<p>tampered</p></body>'),
         content_bytes = octet_length(
           replace(html, '</body>', '<p>tampered</p></body>')
         )
     where project_id = $1`,
    [publishProjectId],
  );
  const corrupted = await callGet("getPublicApp", {
    slug: publishAttempts[0].value.result.slug,
  });
  assert.equal(corrupted.response.status, 500);
  assert.equal(
    corrupted.value?.error?.message,
    "PUBLISHED_ARTIFACT_INTEGRITY_FAILED",
  );

  const authChild = spawnSync(process.execPath, [process.argv[1], "--auth-401"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(authChild.status, 0, authChild.stderr);
  const authResult = JSON.parse(authChild.stdout.trim().split("\n").at(-1));

  console.log(
    JSON.stringify({
      paidPlanStatus: paidPlan.response.status,
      topUpStatus: topUp.response.status,
      rateLimitStatus: limited.response.status,
      forbiddenStatus: forbidden.response.status,
      blockedPublishStatus: blockedPublish.response.status,
      unauthorizedStatus: authResult.unauthorizedStatus,
    }),
  );
}
