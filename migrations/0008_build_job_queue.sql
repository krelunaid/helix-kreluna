alter table build_jobs add column if not exists queue_status text;
alter table build_jobs add column if not exists idempotency_key text;
alter table build_jobs add column if not exists request_fingerprint text;
alter table build_jobs add column if not exists pipeline_version text not null default 'helix-v2';
alter table build_jobs alter column pipeline_version set default 'helix-v2';
alter table build_jobs add column if not exists stage text not null default 'queued';
alter table build_jobs add column if not exists attempt_count integer not null default 0;
alter table build_jobs add column if not exists max_attempts integer not null default 2;
alter table build_jobs add column if not exists available_at timestamptz not null default now();
alter table build_jobs add column if not exists locked_by text;
alter table build_jobs add column if not exists lock_expires_at timestamptz;
alter table build_jobs add column if not exists heartbeat_at timestamptz;
alter table build_jobs add column if not exists started_at timestamptz;
alter table build_jobs add column if not exists completed_at timestamptz;
alter table build_jobs add column if not exists cancel_requested_at timestamptz;
alter table build_jobs add column if not exists last_error_code text;
alter table build_jobs add column if not exists last_error_message text;
alter table build_jobs add column if not exists last_error_trace text;
alter table build_jobs add column if not exists created_at timestamptz not null default now();

-- Existing snapshots were written by an in-memory runner. Requeue interrupted
-- jobs, preserve terminal results and give every legacy row a stable key.
update build_jobs
set queue_status = case payload::jsonb ->> 'status'
  when 'ready' then 'awaiting_human_approval'
  when 'error' then 'failed'
  when 'cancelled' then 'cancelled'
  else 'queued'
end
where queue_status is null;

update build_jobs
set idempotency_key = 'legacy:' || id
where idempotency_key is null;

update build_jobs
set request_fingerprint = md5(payload)
where request_fingerprint is null;

alter table build_jobs alter column queue_status set default 'queued';
alter table build_jobs alter column queue_status set not null;
alter table build_jobs alter column idempotency_key set not null;
alter table build_jobs alter column request_fingerprint set not null;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'build_jobs'::regclass
      and conname = 'build_jobs_queue_status_ck'
  ) then
    alter table build_jobs
      add constraint build_jobs_queue_status_ck
      check (queue_status in (
        'queued', 'running', 'retry', 'awaiting_human_approval',
        'approved', 'rejected', 'deploying', 'deployed', 'failed', 'cancelled'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'build_jobs'::regclass
      and conname = 'build_jobs_attempts_ck'
  ) then
    alter table build_jobs
      add constraint build_jobs_attempts_ck
      check (attempt_count >= 0 and max_attempts between 1 and 5);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'build_jobs'::regclass
      and conname = 'build_jobs_payload_json_ck'
  ) then
    alter table build_jobs
      add constraint build_jobs_payload_json_ck
      check (jsonb_typeof(payload::jsonb) = 'object');
  end if;
end
$migration$;

create unique index if not exists build_jobs_idempotency_key_idx
  on build_jobs (idempotency_key);
create index if not exists build_jobs_claim_idx
  on build_jobs (queue_status, available_at, created_at);
create index if not exists build_jobs_lock_expiry_idx
  on build_jobs (lock_expires_at)
  where lock_expires_at is not null;

create table if not exists build_job_attempts (
  id bigserial primary key,
  job_id text not null references build_jobs (id) on delete cascade,
  attempt_number integer not null,
  worker_id text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text,
  error_code text,
  error_message text,
  unique (job_id, attempt_number),
  check (attempt_number > 0),
  check (outcome is null or outcome in ('succeeded', 'retry', 'failed', 'cancelled'))
);
create index if not exists build_job_attempts_job_idx
  on build_job_attempts (job_id, attempt_number desc);

create or replace function enqueue_build_job(
  p_id text,
  p_project_id text,
  p_user_id text,
  p_guest_access_token_hash text,
  p_guest_access_expires_at timestamptz,
  p_payload text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_max_attempts integer default 2
)
returns table (job_id text, was_created boolean)
language plpgsql
as $$
declare
  inserted_id text;
  existing_job build_jobs%rowtype;
begin
  if p_id is null or length(trim(p_id)) < 8 then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_ID';
  end if;
  if p_idempotency_key is null
    or length(trim(p_idempotency_key)) < 8
    or length(p_idempotency_key) > 240
  then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_IDEMPOTENCY_KEY';
  end if;
  if p_max_attempts < 1 or p_max_attempts > 5 then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_MAX_ATTEMPTS';
  end if;
  if jsonb_typeof(p_payload::jsonb) <> 'object' then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_PAYLOAD';
  end if;
  if p_request_fingerprint is null
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_FINGERPRINT';
  end if;

  insert into build_jobs (
    id, project_id, user_id, guest_access_token_hash,
    guest_access_expires_at, payload, idempotency_key, request_fingerprint,
    max_attempts, pipeline_version,
    queue_status, available_at
  ) values (
    p_id, p_project_id, p_user_id, p_guest_access_token_hash,
    p_guest_access_expires_at, p_payload, p_idempotency_key,
    p_request_fingerprint, p_max_attempts, 'helix-v2',
    'queued', now()
  )
  on conflict (idempotency_key) do nothing
  returning id into inserted_id;

  if inserted_id is not null then
    return query select inserted_id, true;
    return;
  end if;

  select * into existing_job
  from build_jobs
  where idempotency_key = p_idempotency_key;

  if not found
    or existing_job.project_id is distinct from p_project_id
    or existing_job.user_id is distinct from p_user_id
    or existing_job.guest_access_token_hash is distinct from p_guest_access_token_hash
    or existing_job.request_fingerprint is distinct from p_request_fingerprint
  then
    raise exception using errcode = 'P0001', message = 'JOB_IDEMPOTENCY_KEY_REUSED';
  end if;

  return query select existing_job.id, false;
end;
$$;
