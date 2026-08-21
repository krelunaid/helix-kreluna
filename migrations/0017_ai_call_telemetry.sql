alter table build_jobs
  add column if not exists ai_call_count integer not null default 0,
  add column if not exists ai_retry_count integer not null default 0,
  add column if not exists ai_started_at timestamptz,
  add column if not exists ai_reserved_cost_usd_ticks numeric(30, 0) not null default 0,
  add column if not exists ai_accounted_cost_usd_ticks numeric(30, 0) not null default 0;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'build_jobs'::regclass
      and conname = 'build_jobs_ai_budget_ck'
  ) then
    alter table build_jobs
      add constraint build_jobs_ai_budget_ck check (
        ai_call_count >= 0
        and ai_retry_count >= 0
        and ai_retry_count <= ai_call_count
        and ai_reserved_cost_usd_ticks >= 0
        and ai_accounted_cost_usd_ticks >= 0
      );
  end if;
end
$migration$;

create table if not exists build_job_ai_calls (
  call_id text primary key,
  job_id text not null references build_jobs (id) on delete cascade,
  attempt_number integer not null,
  logical_call_key text not null,
  retry_index integer not null default 0,
  agent_id text not null,
  contract_id text not null,
  provider text not null,
  requested_model text not null,
  reported_model text,
  response_id text,
  result_sha256 text,
  request_sha256 text not null,
  maximum_cost_usd_ticks numeric(30, 0) not null,
  status text not null default 'started',
  input_tokens integer,
  output_tokens integer,
  cached_input_tokens integer,
  total_tokens integer,
  latency_ms integer,
  cost_usd_ticks numeric(30, 0),
  cost_kind text not null default 'unknown',
  pricing_version text,
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (job_id, attempt_number, logical_call_key, retry_index),
  check (length(call_id) between 8 and 160),
  check (attempt_number > 0),
  check (length(logical_call_key) between 1 and 240),
  check (retry_index >= 0),
  check (length(agent_id) between 1 and 120),
  check (length(contract_id) between 1 and 120),
  check (length(provider) between 1 and 80),
  check (length(requested_model) between 1 and 160),
  check (reported_model is null or length(reported_model) between 1 and 160),
  check (result_sha256 is null or result_sha256 ~ '^[0-9a-f]{64}$'),
  check (request_sha256 ~ '^[0-9a-f]{64}$'),
  check (maximum_cost_usd_ticks >= 0),
  check (status in ('started', 'succeeded', 'failed', 'unknown')),
  check (input_tokens is null or input_tokens >= 0),
  check (output_tokens is null or output_tokens >= 0),
  check (cached_input_tokens is null or cached_input_tokens >= 0),
  check (total_tokens is null or total_tokens >= 0),
  check (
    total_tokens is null
    or input_tokens is null
    or output_tokens is null
    or total_tokens >= input_tokens + output_tokens
  ),
  check (
    cached_input_tokens is null
    or input_tokens is null
    or cached_input_tokens <= input_tokens
  ),
  check (latency_ms is null or latency_ms >= 0),
  check (cost_usd_ticks is null or cost_usd_ticks >= 0),
  check (cost_kind in ('provider_actual', 'configured_estimate', 'unknown')),
  check (
    (cost_kind = 'unknown' and cost_usd_ticks is null and pricing_version is null)
    or
    (cost_kind = 'provider_actual' and cost_usd_ticks is not null and pricing_version is null)
    or
    (cost_kind = 'configured_estimate' and cost_usd_ticks is not null
      and pricing_version is not null and length(pricing_version) between 1 and 120)
  ),
  check (
    (status = 'started'
      and finished_at is null
      and latency_ms is null
      and input_tokens is null
      and output_tokens is null
      and cached_input_tokens is null
      and total_tokens is null
      and result_sha256 is null
      and cost_kind = 'unknown'
      and error_code is null)
    or
    (status = 'succeeded'
      and finished_at is not null
      and latency_ms is not null
      and result_sha256 is not null
      and error_code is null)
    or
    (status in ('failed', 'unknown')
      and finished_at is not null
      and latency_ms is not null
      and result_sha256 is null
      and error_code is not null)
  )
);

create index if not exists build_job_ai_calls_job_idx
  on build_job_ai_calls (job_id, started_at, call_id);

create index if not exists build_job_ai_calls_cost_idx
  on build_job_ai_calls (job_id, cost_kind)
  where status = 'succeeded';

create or replace function enforce_ai_call_telemetry_transition()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'DELETE' then
    if current_setting('helix.ai_telemetry_retention', true) = 'on' then
      return old;
    end if;
    raise exception using
      errcode = '55000',
      message = 'AI_CALL_TELEMETRY_IMMUTABLE',
      detail = 'AI call telemetry cannot be deleted.';
  end if;

  if old.status <> 'started'
    or new.status not in ('succeeded', 'failed', 'unknown')
    or new.call_id is distinct from old.call_id
    or new.job_id is distinct from old.job_id
    or new.attempt_number is distinct from old.attempt_number
    or new.logical_call_key is distinct from old.logical_call_key
    or new.retry_index is distinct from old.retry_index
    or new.agent_id is distinct from old.agent_id
    or new.contract_id is distinct from old.contract_id
    or new.provider is distinct from old.provider
    or new.requested_model is distinct from old.requested_model
    or new.request_sha256 is distinct from old.request_sha256
    or new.maximum_cost_usd_ticks is distinct from old.maximum_cost_usd_ticks
    or new.started_at is distinct from old.started_at
  then
    raise exception using
      errcode = '55000',
      message = 'AI_CALL_TELEMETRY_IMMUTABLE',
      detail = 'Only one started-to-terminal transition is allowed.';
  end if;
  return new;
end
$function$;

drop trigger if exists build_job_ai_calls_immutable
  on build_job_ai_calls;
create trigger build_job_ai_calls_immutable
before update or delete on build_job_ai_calls
for each row execute function enforce_ai_call_telemetry_transition();

comment on table build_job_ai_calls is
  'Per-attempt AI telemetry. No prompts, responses, credentials or inferred costs are stored.';
comment on column build_job_ai_calls.cost_usd_ticks is
  'Exact integer USD ticks; one USD is 10^10 ticks. Null means cost was not measured.';
comment on column build_job_ai_calls.maximum_cost_usd_ticks is
  'Conservative per-call policy reservation. It is never reported as measured cost.';

create or replace function reserve_build_job_ai_call(
  p_call_id text,
  p_job_id text,
  p_worker_id text,
  p_logical_call_key text,
  p_retry_index integer,
  p_agent_id text,
  p_contract_id text,
  p_provider text,
  p_requested_model text,
  p_request_sha256 text,
  p_maximum_cost_usd_ticks numeric,
  p_max_calls integer,
  p_max_retries integer,
  p_max_duration_ms integer,
  p_job_max_cost_usd_ticks numeric
)
returns integer
language plpgsql
as $function$
declare
  v_attempt_number integer;
  v_updated integer;
  v_job record;
begin
  if p_retry_index < 0
    or p_max_calls < 1
    or p_max_retries < 0
    or p_max_retries > p_max_calls
    or p_max_duration_ms < 1
    or p_maximum_cost_usd_ticks < 0
    or p_job_max_cost_usd_ticks < 0
  then
    raise exception using errcode = '22023', message = 'AI_BUDGET_POLICY_INVALID';
  end if;

  update build_jobs
  set ai_call_count = ai_call_count + 1,
      ai_retry_count = ai_retry_count + case when p_retry_index > 0 then 1 else 0 end,
      ai_started_at = coalesce(ai_started_at, now()),
      ai_reserved_cost_usd_ticks =
        ai_reserved_cost_usd_ticks + p_maximum_cost_usd_ticks,
      updated_at = now()
  where id = p_job_id
    and queue_status = 'running'
    and locked_by = p_worker_id
    and cancel_requested_at is null
    and lock_expires_at > now()
    and ai_call_count < p_max_calls
    and ai_retry_count + (case when p_retry_index > 0 then 1 else 0 end)
      <= p_max_retries
    and (
      ai_started_at is null
      or ai_started_at > now() - (p_max_duration_ms * interval '1 millisecond')
    )
    and ai_accounted_cost_usd_ticks
      + ai_reserved_cost_usd_ticks
      + p_maximum_cost_usd_ticks
      <= p_job_max_cost_usd_ticks
  returning attempt_count into v_attempt_number;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    select queue_status, locked_by, cancel_requested_at, lock_expires_at,
           ai_call_count, ai_retry_count, ai_started_at,
           ai_accounted_cost_usd_ticks, ai_reserved_cost_usd_ticks
    into v_job
    from build_jobs
    where id = p_job_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'BUILD_JOB_NOT_FOUND';
    elsif v_job.queue_status <> 'running'
      or v_job.locked_by is distinct from p_worker_id
      or v_job.cancel_requested_at is not null
      or v_job.lock_expires_at <= now()
    then
      raise exception using errcode = 'P0001', message = 'BUILD_JOB_LEASE_LOST';
    elsif v_job.ai_call_count >= p_max_calls then
      raise exception using errcode = 'P0001', message = 'AI_BUDGET_MAX_CALLS';
    elsif v_job.ai_retry_count + (case when p_retry_index > 0 then 1 else 0 end)
      > p_max_retries
    then
      raise exception using errcode = 'P0001', message = 'AI_BUDGET_MAX_RETRIES';
    elsif v_job.ai_started_at is not null
      and v_job.ai_started_at
        <= now() - (p_max_duration_ms * interval '1 millisecond')
    then
      raise exception using errcode = 'P0001', message = 'AI_BUDGET_MAX_DURATION';
    elsif v_job.ai_accounted_cost_usd_ticks
      + v_job.ai_reserved_cost_usd_ticks
      + p_maximum_cost_usd_ticks
      > p_job_max_cost_usd_ticks
    then
      raise exception using errcode = 'P0001', message = 'AI_BUDGET_MAX_COST';
    end if;
    raise exception using errcode = 'P0001', message = 'AI_BUDGET_RESERVATION_REJECTED';
  end if;

  insert into build_job_ai_calls (
    call_id, job_id, attempt_number, logical_call_key, retry_index,
    agent_id, contract_id, provider, requested_model, request_sha256,
    maximum_cost_usd_ticks
  ) values (
    p_call_id, p_job_id, v_attempt_number, p_logical_call_key, p_retry_index,
    p_agent_id, p_contract_id, p_provider, p_requested_model, p_request_sha256,
    p_maximum_cost_usd_ticks
  );
  return v_attempt_number;
end
$function$;

create or replace function settle_build_job_ai_call(
  p_call_id text,
  p_job_id text,
  p_worker_id text,
  p_status text,
  p_reported_model text,
  p_response_id text,
  p_result_sha256 text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cached_input_tokens integer,
  p_total_tokens integer,
  p_latency_ms integer,
  p_cost_usd_ticks numeric,
  p_cost_kind text,
  p_pricing_version text,
  p_error_code text
)
returns text
language plpgsql
as $function$
declare
  v_maximum_cost numeric(30, 0);
  v_accounted_cost numeric(30, 0);
  v_updated integer;
  v_violation text;
begin
  select maximum_cost_usd_ticks
  into v_maximum_cost
  from build_job_ai_calls
  where call_id = p_call_id
    and job_id = p_job_id
    and status = 'started'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'AI_CALL_RESERVATION_NOT_FOUND';
  end if;

  v_accounted_cost = coalesce(p_cost_usd_ticks, v_maximum_cost);
  if p_cost_usd_ticks is not null and p_cost_usd_ticks > v_maximum_cost then
    v_violation = 'AI_COST_RESERVATION_EXCEEDED';
  end if;

  update build_jobs
  set ai_reserved_cost_usd_ticks = ai_reserved_cost_usd_ticks - v_maximum_cost,
      ai_accounted_cost_usd_ticks = ai_accounted_cost_usd_ticks + v_accounted_cost,
      updated_at = now()
  where id = p_job_id
    and queue_status = 'running'
    and locked_by = p_worker_id
    and cancel_requested_at is null
    and lock_expires_at > now()
    and ai_reserved_cost_usd_ticks >= v_maximum_cost;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception using errcode = 'P0001', message = 'BUILD_JOB_LEASE_LOST';
  end if;

  update build_job_ai_calls
  set status = p_status,
      reported_model = p_reported_model,
      response_id = p_response_id,
      result_sha256 = p_result_sha256,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      cached_input_tokens = p_cached_input_tokens,
      total_tokens = p_total_tokens,
      latency_ms = p_latency_ms,
      cost_usd_ticks = p_cost_usd_ticks,
      cost_kind = p_cost_kind,
      pricing_version = p_pricing_version,
      error_code = p_error_code,
      finished_at = now()
  where call_id = p_call_id
    and job_id = p_job_id
    and status = 'started';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception using errcode = 'P0001', message = 'AI_CALL_RESERVATION_NOT_FOUND';
  end if;
  return v_violation;
end
$function$;

create or replace function recover_build_job_ai_calls(
  p_job_id text,
  p_worker_id text
)
returns integer
language plpgsql
as $function$
declare
  v_attempt_number integer;
  v_recovered integer;
  v_recovered_cost numeric(30, 0);
  v_updated integer;
begin
  select attempt_count
  into v_attempt_number
  from build_jobs
  where id = p_job_id
    and queue_status = 'running'
    and locked_by = p_worker_id
    and cancel_requested_at is null
    and lock_expires_at > now()
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'BUILD_JOB_LEASE_LOST';
  end if;

  with recovered as (
    update build_job_ai_calls
    set status = 'unknown',
        latency_ms = least(
          2147483647,
          greatest(0, floor(extract(epoch from (now() - started_at)) * 1000))::bigint
        )::integer,
        cost_kind = 'unknown',
        error_code = 'AI_CALL_OUTCOME_UNKNOWN_AFTER_WORKER_RESTART',
        finished_at = now()
    where job_id = p_job_id
      and status = 'started'
      and attempt_number < v_attempt_number
    returning maximum_cost_usd_ticks
  )
  select count(*)::integer, coalesce(sum(maximum_cost_usd_ticks), 0)
  into v_recovered, v_recovered_cost
  from recovered;

  if v_recovered > 0 then
    update build_jobs
    set ai_reserved_cost_usd_ticks = ai_reserved_cost_usd_ticks - v_recovered_cost,
        ai_accounted_cost_usd_ticks =
          ai_accounted_cost_usd_ticks + v_recovered_cost,
        updated_at = now()
    where id = p_job_id
      and locked_by = p_worker_id
      and ai_reserved_cost_usd_ticks >= v_recovered_cost;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception using errcode = 'P0001', message = 'AI_BUDGET_RECOVERY_FAILED';
    end if;
  end if;
  return v_recovered;
end
$function$;
