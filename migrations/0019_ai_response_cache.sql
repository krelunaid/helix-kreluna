create table if not exists ai_response_cache (
  cache_id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  provider text not null,
  requested_model text not null,
  reported_model text,
  contract_id text not null,
  contract_version text not null,
  request_sha256 text not null,
  result_sha256 text not null,
  content text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (
    user_id,
    provider,
    requested_model,
    contract_id,
    contract_version,
    request_sha256
  ),
  check (length(cache_id) between 8 and 160),
  check (length(user_id) between 1 and 160),
  check (length(provider) between 1 and 80),
  check (length(requested_model) between 1 and 160),
  check (reported_model is null or length(reported_model) between 1 and 160),
  check (length(contract_id) between 1 and 120),
  check (contract_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  check (request_sha256 ~ '^[0-9a-f]{64}$'),
  check (result_sha256 ~ '^[0-9a-f]{64}$'),
  check (octet_length(content) between 1 and 262144),
  check (expires_at > created_at)
);

create index if not exists ai_response_cache_expiry_idx
  on ai_response_cache (expires_at, cache_id);

create table if not exists build_job_ai_cache_hits (
  hit_id text primary key,
  job_id text not null references build_jobs (id) on delete cascade,
  -- Deliberately not a foreign key: hit evidence must outlive the cached
  -- content when the TTL purge removes that content.
  cache_id text not null,
  logical_call_key text not null,
  contract_id text not null,
  request_sha256 text not null,
  lookup_latency_ms integer not null,
  created_at timestamptz not null default now(),
  unique (job_id, logical_call_key, request_sha256),
  check (length(hit_id) between 8 and 160),
  check (length(cache_id) between 8 and 160),
  check (length(logical_call_key) between 1 and 240),
  check (length(contract_id) between 1 and 120),
  check (request_sha256 ~ '^[0-9a-f]{64}$'),
  check (lookup_latency_ms >= 0)
);

create index if not exists build_job_ai_cache_hits_job_idx
  on build_job_ai_cache_hits (job_id, created_at, hit_id);

comment on table ai_response_cache is
  'Tenant-isolated model response cache. Guest jobs never read or write this table.';
comment on table build_job_ai_cache_hits is
  'Application cache evidence, deliberately separate from provider cached-token telemetry.';

create or replace function purge_expired_ai_response_cache(p_limit integer default 250)
returns integer
language plpgsql
as $function$
declare
  v_deleted integer;
begin
  if p_limit < 1 or p_limit > 1000 then
    raise exception using errcode = '22023', message = 'AI_CACHE_PURGE_LIMIT_INVALID';
  end if;
  with expired as (
    select cache_id
    from ai_response_cache
    where expires_at <= now()
    order by expires_at, cache_id
    limit p_limit
    for update skip locked
  )
  delete from ai_response_cache cache
  using expired
  where cache.cache_id = expired.cache_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$function$;
