-- A build created from a Human Gate "modify" decision must be linked to the
-- superseded candidate in the same database command that enqueues it. A row
-- inserted inside enqueue_build_job() is not visible to a sibling data-changing
-- CTE through the outer statement snapshot, so the parent update belongs inside
-- this sequential PL/pgSQL wrapper.
create or replace function enqueue_linked_build_job(
  p_id text,
  p_parent_job_id text,
  p_project_id text,
  p_user_id text,
  p_guest_access_token_hash text,
  p_guest_access_expires_at timestamptz,
  p_payload text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_max_attempts integer default 2
)
returns table (
  job_id text,
  was_created boolean,
  guest_access_expires_at timestamptz
)
language plpgsql
as $$
declare
  queued_id text;
  queued_created boolean;
  stored_parent_job_id text;
  stored_guest_expiry timestamptz;
begin
  if p_parent_job_id is not null
    and length(trim(p_parent_job_id)) < 8
  then
    raise exception using errcode = 'P0001', message = 'INVALID_PARENT_JOB_ID';
  end if;

  select queued.job_id, queued.was_created
  into queued_id, queued_created
  from enqueue_build_job(
    p_id,
    p_project_id,
    p_user_id,
    p_guest_access_token_hash,
    p_guest_access_expires_at,
    p_payload,
    p_idempotency_key,
    p_request_fingerprint,
    p_max_attempts
  ) as queued;

  select job.parent_job_id, job.guest_access_expires_at
  into stored_parent_job_id, stored_guest_expiry
  from build_jobs as job
  where job.id = queued_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'BUILD_JOB_ENQUEUE_FAILED';
  end if;

  if stored_parent_job_id is distinct from p_parent_job_id then
    if stored_parent_job_id is null and p_parent_job_id is not null then
      update build_jobs
      set parent_job_id = p_parent_job_id,
          updated_at = now()
      where id = queued_id
        and parent_job_id is null;
      if not found then
        raise exception using errcode = 'P0001', message = 'JOB_PARENT_MISMATCH';
      end if;
    else
      raise exception using errcode = 'P0001', message = 'JOB_PARENT_MISMATCH';
    end if;
  end if;

  return query select queued_id, queued_created, stored_guest_expiry;
end;
$$;
