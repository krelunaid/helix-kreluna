create table if not exists warden_observations (
  observation_id text primary key,
  run_key text not null unique,
  adapter_id text not null,
  source_id text not null,
  environment text not null,
  release_ref text not null,
  snapshot jsonb not null,
  snapshot_sha256 text not null,
  report jsonb not null,
  report_sha256 text not null,
  generated_at timestamptz not null,
  persisted_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (observation_id ~ '^[0-9a-f]{64}$'),
  check (length(run_key) between 1 and 240),
  check (adapter_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  check (length(source_id) between 1 and 160),
  check (environment in ('staging', 'production')),
  check (length(release_ref) between 1 and 240),
  check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  check (report_sha256 ~ '^[0-9a-f]{64}$'),
  check (snapshot ->> 'kind' = 'warden_monitoring_snapshot'),
  check (snapshot ->> 'environment' = environment),
  check (snapshot ->> 'releaseRef' = release_ref),
  check (report ->> 'kind' = 'warden_monitoring_report'),
  check (report ->> 'environment' = environment),
  check (report ->> 'releaseRef' = release_ref),
  check (report ->> 'snapshotSha256' = snapshot_sha256)
);

create index if not exists warden_observations_release_idx
  on warden_observations (environment, release_ref, generated_at desc);

create table if not exists warden_alert_claims (
  deduplication_key text primary key,
  adapter_id text not null,
  source_id text not null,
  environment text not null,
  release_ref text not null,
  finding_code text not null,
  first_observation_id text not null references warden_observations (observation_id),
  last_observation_id text not null references warden_observations (observation_id),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  expires_at timestamptz not null,
  occurrence_count integer not null default 1,
  check (deduplication_key ~ '^[0-9a-f]{64}$'),
  check (adapter_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  check (length(source_id) between 1 and 160),
  check (environment in ('staging', 'production')),
  check (length(release_ref) between 1 and 240),
  check (finding_code ~ '^[A-Z][A-Z0-9_]{2,127}$'),
  check (expires_at > last_seen_at),
  check (occurrence_count > 0)
);

create index if not exists warden_alert_claims_expiry_idx
  on warden_alert_claims (expires_at);

create table if not exists warden_alert_evidence (
  observation_id text not null references warden_observations (observation_id),
  deduplication_key text not null,
  disposition text not null,
  alert jsonb not null,
  alert_sha256 text not null,
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (observation_id, deduplication_key),
  check (deduplication_key ~ '^[0-9a-f]{64}$'),
  check (disposition in ('new', 'suppressed')),
  check (alert ->> 'kind' = 'warden_alert_candidate'),
  check (alert ->> 'deduplicationKey' = deduplication_key),
  check (alert_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists warden_alert_evidence_key_idx
  on warden_alert_evidence (deduplication_key, evaluated_at desc);

create or replace function enforce_warden_append_only()
returns trigger
language plpgsql
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'WARDEN_EVIDENCE_IMMUTABLE',
    detail = 'Persisted Warden snapshot, report, and alert evidence cannot be changed or deleted.';
end
$function$;

drop trigger if exists warden_observations_append_only on warden_observations;
create trigger warden_observations_append_only
before update or delete on warden_observations
for each row execute function enforce_warden_append_only();

drop trigger if exists warden_alert_evidence_append_only on warden_alert_evidence;
create trigger warden_alert_evidence_append_only
before update or delete on warden_alert_evidence
for each row execute function enforce_warden_append_only();

create or replace function persist_warden_observation(
  p_observation_id text,
  p_run_key text,
  p_adapter_id text,
  p_source_id text,
  p_snapshot jsonb,
  p_snapshot_sha256 text,
  p_report jsonb,
  p_report_sha256 text,
  p_alerts jsonb,
  p_alert_deduplication_ttl_ms bigint,
  p_persisted_at timestamptz
)
returns table (observation_id text, alert_key text, is_new boolean)
language plpgsql
as $function$
declare
  v_existing warden_observations%rowtype;
  v_alert_entry jsonb;
  v_alert jsonb;
  v_alert_key text;
  v_alert_sha256 text;
  v_disposition text;
  v_claimed boolean;
begin
  if p_observation_id !~ '^[0-9a-f]{64}$'
    or p_snapshot_sha256 !~ '^[0-9a-f]{64}$'
    or p_report_sha256 !~ '^[0-9a-f]{64}$'
    or p_alert_deduplication_ttl_ms < 1
    or p_alert_deduplication_ttl_ms > 2592000000
    or jsonb_typeof(p_alerts) <> 'array'
  then
    raise exception using errcode = '22023', message = 'WARDEN_PERSISTENCE_INPUT_INVALID';
  end if;

  insert into warden_observations (
    observation_id, run_key, adapter_id, source_id, environment, release_ref,
    snapshot, snapshot_sha256, report, report_sha256, generated_at, persisted_at
  ) values (
    p_observation_id, p_run_key, p_adapter_id, p_source_id,
    p_snapshot ->> 'environment', p_snapshot ->> 'releaseRef',
    p_snapshot, p_snapshot_sha256, p_report, p_report_sha256,
    (p_snapshot ->> 'generatedAt')::timestamptz, p_persisted_at
  )
  on conflict (run_key) do nothing;

  select * into v_existing
  from warden_observations
  where run_key = p_run_key;

  if v_existing.observation_id is null
    or v_existing.observation_id <> p_observation_id
    or v_existing.adapter_id <> p_adapter_id
    or v_existing.source_id <> p_source_id
    or v_existing.snapshot_sha256 <> p_snapshot_sha256
    or v_existing.report_sha256 <> p_report_sha256
    or v_existing.snapshot <> p_snapshot
    or v_existing.report <> p_report
  then
    raise exception using errcode = '23505', message = 'WARDEN_RUN_KEY_REUSED';
  end if;

  if jsonb_array_length(p_alerts) = 0 then
    observation_id := p_observation_id;
    alert_key := null;
    is_new := null;
    return next;
    return;
  end if;

  for v_alert_entry in select value from jsonb_array_elements(p_alerts)
  loop
    v_alert := v_alert_entry -> 'alert';
    v_alert_key := v_alert ->> 'deduplicationKey';
    v_alert_sha256 := v_alert_entry ->> 'alertSha256';
    if v_alert_key !~ '^[0-9a-f]{64}$'
      or v_alert_sha256 !~ '^[0-9a-f]{64}$'
      or v_alert ->> 'kind' <> 'warden_alert_candidate'
      or v_alert ->> 'adapterId' <> p_adapter_id
      or v_alert ->> 'sourceId' <> p_source_id
      or v_alert ->> 'environment' <> p_snapshot ->> 'environment'
      or v_alert ->> 'releaseRef' <> p_snapshot ->> 'releaseRef'
    then
      raise exception using errcode = '22023', message = 'WARDEN_ALERT_IDENTITY_INVALID';
    end if;

    select evidence.disposition into v_disposition
    from warden_alert_evidence evidence
    where evidence.observation_id = p_observation_id
      and evidence.deduplication_key = v_alert_key;

    if v_disposition is null then
      insert into warden_alert_claims (
        deduplication_key, adapter_id, source_id, environment, release_ref,
        finding_code, first_observation_id, last_observation_id,
        first_seen_at, last_seen_at, expires_at, occurrence_count
      ) values (
        v_alert_key, p_adapter_id, p_source_id, p_snapshot ->> 'environment',
        p_snapshot ->> 'releaseRef', v_alert ->> 'code', p_observation_id,
        p_observation_id, p_persisted_at, p_persisted_at,
        p_persisted_at + (p_alert_deduplication_ttl_ms * interval '1 millisecond'), 1
      )
      on conflict (deduplication_key) do update
      set last_observation_id = excluded.last_observation_id,
          last_seen_at = excluded.last_seen_at,
          expires_at = excluded.expires_at,
          occurrence_count = warden_alert_claims.occurrence_count + 1
      where warden_alert_claims.expires_at <= p_persisted_at
      returning true into v_claimed;

      if not found then
        v_claimed := false;
        update warden_alert_claims
        set last_observation_id = p_observation_id,
            last_seen_at = p_persisted_at,
            occurrence_count = occurrence_count + 1
        where deduplication_key = v_alert_key;
      end if;
      v_disposition := case when v_claimed then 'new' else 'suppressed' end;
      insert into warden_alert_evidence (
        observation_id, deduplication_key, disposition, alert, alert_sha256, evaluated_at
      ) values (
        p_observation_id, v_alert_key, v_disposition, v_alert, v_alert_sha256, p_persisted_at
      );
    end if;

    observation_id := p_observation_id;
    alert_key := v_alert_key;
    is_new := v_disposition = 'new';
    return next;
  end loop;
end
$function$;

comment on table warden_observations is
  'Append-only Warden snapshots and reports bound by application-verified SHA-256 hashes.';
comment on table warden_alert_evidence is
  'Append-only alert candidate/deduplication evidence. Delivery is intentionally outside this function.';
comment on function persist_warden_observation is
  'Atomically persists one hash-bound Warden observation and durable alert deduplication evidence; performs no update, deploy, publish, alert delivery, or rollback.';
