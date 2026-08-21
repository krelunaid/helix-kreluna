import { getSql } from "@/lib/db";
import { sha256Hex } from "@/lib/server/agents/patch";
import { UNKNOWN_AI_COST, type AiCompletionResult } from "@/lib/server/ai/types";

const MAX_CACHE_CONTENT_BYTES = 256 * 1024;
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60_000;

export type AiResponseCacheKey = Readonly<{
  userId: string;
  provider: string;
  requestedModel: string;
  contractId: string;
  contractVersion: string;
  requestSha256: string;
}>;

type CachedRow = {
  cache_id: string;
  reported_model: string | null;
  result_sha256: string;
  content: string;
  created_at: Date | string;
};

export type AiApplicationCacheHit = Readonly<{
  cacheId: string;
  result: AiCompletionResult;
  createdAt: string;
}>;

function validKeyPart(value: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new Error("AI_CACHE_KEY_INVALID");
  return normalized;
}

function normalizedKey(input: AiResponseCacheKey): AiResponseCacheKey {
  if (!/^[0-9a-f]{64}$/.test(input.requestSha256)) {
    throw new Error("AI_CACHE_REQUEST_HASH_INVALID");
  }
  if (!/^\d+\.\d+\.\d+$/.test(input.contractVersion)) {
    throw new Error("AI_CACHE_CONTRACT_VERSION_INVALID");
  }
  return {
    userId: validKeyPart(input.userId, 160),
    provider: validKeyPart(input.provider, 80),
    requestedModel: validKeyPart(input.requestedModel, 160),
    contractId: validKeyPart(input.contractId, 120),
    contractVersion: input.contractVersion,
    requestSha256: input.requestSha256,
  };
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export async function readAiResponseCache(
  input: AiResponseCacheKey,
): Promise<AiApplicationCacheHit | null> {
  const key = normalizedKey(input);
  const startedAt = Date.now();
  const sql = await getSql();
  const rows = await sql.query<CachedRow>(
    `select cache_id, reported_model, result_sha256, content, created_at
     from ai_response_cache
     where user_id = $1
       and provider = $2
       and requested_model = $3
       and contract_id = $4
       and contract_version = $5
       and request_sha256 = $6
       and expires_at > now()
     limit 1`,
    [
      key.userId,
      key.provider,
      key.requestedModel,
      key.contractId,
      key.contractVersion,
      key.requestSha256,
    ],
  );
  const row = rows[0];
  if (!row) return null;
  if ((await sha256Hex(row.content)) !== row.result_sha256) {
    // A corrupt active row would otherwise block the conflict-safe refresh
    // until TTL expiry. Delete only the exact row selected by this cache key.
    await sql.query(
      `delete from ai_response_cache
       where cache_id = $1
         and user_id = $2
         and request_sha256 = $3`,
      [row.cache_id, key.userId, key.requestSha256],
    );
    return null;
  }
  return {
    cacheId: row.cache_id,
    createdAt: new Date(row.created_at).toISOString(),
    result: {
      provider: key.provider,
      requestedModel: key.requestedModel,
      reportedModel: row.reported_model,
      responseId: null,
      content: row.content,
      latencyMs: Math.max(0, Date.now() - startedAt),
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        totalTokens: 0,
      },
      cost: UNKNOWN_AI_COST,
      delivery: "application_cache",
    },
  };
}

/** Remove only the exact tenant- and contract-bound row rejected by a caller validator. */
export async function evictAiResponseCache(input: {
  key: AiResponseCacheKey;
  cacheId: string;
}): Promise<boolean> {
  const key = normalizedKey(input.key);
  const sql = await getSql();
  const rows = await sql.query<{ cache_id: string }>(
    `delete from ai_response_cache
     where cache_id = $1
       and user_id = $2
       and provider = $3
       and requested_model = $4
       and contract_id = $5
       and contract_version = $6
       and request_sha256 = $7
     returning cache_id`,
    [
      validKeyPart(input.cacheId, 160),
      key.userId,
      key.provider,
      key.requestedModel,
      key.contractId,
      key.contractVersion,
      key.requestSha256,
    ],
  );
  return rows.length === 1;
}

export async function writeAiResponseCache(input: {
  key: AiResponseCacheKey;
  result: AiCompletionResult;
  ttlMs?: number;
}): Promise<void> {
  const key = normalizedKey(input.key);
  const ttlMs = input.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const bytes = utf8Length(input.result.content);
  if (
    input.result.provider !== key.provider ||
    input.result.requestedModel !== key.requestedModel ||
    !Number.isSafeInteger(ttlMs) ||
    ttlMs < 60_000 ||
    ttlMs > 24 * 60 * 60_000 ||
    bytes < 1 ||
    bytes > MAX_CACHE_CONTENT_BYTES
  ) {
    throw new Error("AI_CACHE_RESULT_INVALID");
  }
  const sql = await getSql();
  const cacheId = crypto.randomUUID();
  const resultSha256 = await sha256Hex(input.result.content);
  await sql.query(
    `insert into ai_response_cache (
       cache_id, user_id, provider, requested_model, reported_model,
       contract_id, contract_version, request_sha256, result_sha256,
       content, expires_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       now() + ($11 * interval '1 millisecond'))
     on conflict (
       user_id, provider, requested_model, contract_id, contract_version, request_sha256
     ) do update
       set cache_id = excluded.cache_id,
           reported_model = excluded.reported_model,
           result_sha256 = excluded.result_sha256,
           content = excluded.content,
           created_at = now(),
           expires_at = excluded.expires_at
       where ai_response_cache.expires_at <= now()`,
    [
      cacheId,
      key.userId,
      key.provider,
      key.requestedModel,
      input.result.reportedModel,
      key.contractId,
      key.contractVersion,
      key.requestSha256,
      resultSha256,
      input.result.content,
      ttlMs,
    ],
  );
}

export async function recordAiResponseCacheHit(input: {
  jobId: string;
  cacheId: string;
  logicalCallKey: string;
  contractId: string;
  requestSha256: string;
  lookupLatencyMs: number;
}): Promise<void> {
  const sql = await getSql();
  await sql.query(
    `insert into build_job_ai_cache_hits (
       hit_id, job_id, cache_id, logical_call_key, contract_id,
       request_sha256, lookup_latency_ms
     ) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (job_id, logical_call_key, request_sha256) do nothing`,
    [
      crypto.randomUUID(),
      input.jobId,
      validKeyPart(input.cacheId, 160),
      validKeyPart(input.logicalCallKey, 240),
      validKeyPart(input.contractId, 120),
      input.requestSha256,
      Math.max(0, Math.round(input.lookupLatencyMs)),
    ],
  );
}
