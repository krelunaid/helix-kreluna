-- Keep the durable queue version aligned with the checkpoint serialized by the
-- application. In-flight v2 workers are fenced first by clearing their leases
-- and returning the jobs to retry. Matching checkpoints then advance to v3;
-- their stage, artifacts, gem cursor and gem results remain intact for
-- application-level validation. A pre-deploy worker cannot write afterwards.
-- Version-bound release outputs are removed so they must be rebuilt and sealed.
-- Mismatches stay on v2 so the application resets them fail-closed.

alter table build_jobs alter column pipeline_version set default 'helix-v3';

update build_job_attempts as attempt
set outcome = 'retry',
    error_code = 'PIPELINE_UPGRADE_FENCED',
    error_message = 'Worker lease fenced by helix-v3 migration',
    finished_at = now()
from build_jobs as job
where job.pipeline_version = 'helix-v2'
  and job.queue_status = 'running'
  and attempt.job_id = job.id
  and attempt.attempt_number = job.attempt_count
  and attempt.outcome is null;

update build_jobs
set queue_status = 'retry',
    locked_by = null,
    lock_expires_at = null,
    heartbeat_at = null,
    available_at = now(),
    attempt_count = greatest(attempt_count - 1, 0),
    last_error_code = 'PIPELINE_UPGRADE_FENCED',
    last_error_message = 'Worker lease fenced by helix-v3 migration',
    updated_at = now()
where pipeline_version = 'helix-v2'
  and queue_status = 'running';

update build_jobs
set pipeline_version = 'helix-v3',
    payload = (
      jsonb_set(
        payload::jsonb,
        '{checkpoint,pipelineVersion}',
        to_jsonb('helix-v3'::text),
        false
      )
      - 'files'
      - 'workspace'
      - 'production'
      - 'quality'
      - 'score'
      - 'wire'
      - 'liveUrl'
      - 'stores'
      || jsonb_build_object('html', null, 'usedAi', false)
    )::text,
    updated_at = now()
where pipeline_version = 'helix-v2'
  and queue_status in ('queued', 'retry')
  and payload::jsonb #>> '{checkpoint,pipelineVersion}' = 'helix-v2'
  and payload::jsonb #>> '{checkpoint,requestFingerprint}' = request_fingerprint;

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
  payload_json jsonb;
  payload_pipeline_version text;
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
  payload_json := p_payload::jsonb;
  if jsonb_typeof(payload_json) <> 'object' then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_PAYLOAD';
  end if;
  payload_pipeline_version := payload_json #>> '{checkpoint,pipelineVersion}';
  if payload_pipeline_version is null
    or payload_pipeline_version !~ '^helix-v[1-9][0-9]*$'
    or length(payload_pipeline_version) > 120
  then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_PIPELINE_VERSION';
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
    p_request_fingerprint, p_max_attempts, payload_pipeline_version,
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
    or existing_job.pipeline_version is distinct from payload_pipeline_version
  then
    raise exception using errcode = 'P0001', message = 'JOB_IDEMPOTENCY_KEY_REUSED';
  end if;

  return query select existing_job.id, false;
end;
$$;
