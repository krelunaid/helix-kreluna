-- Persist the two release states sequentially. Two sibling data-changing CTEs
-- cannot observe each other's writes to build_jobs through the outer statement
-- snapshot, while PL/pgSQL commands advance the command counter between updates.
-- The caller still wraps this function with the release/credit/publication CTEs,
-- so any failure rolls the complete release transaction back.
create or replace function complete_build_job_release(
  p_job_id text,
  p_artifact_sha256 text,
  p_release_id text
)
returns table (release_id text)
language plpgsql
as $$
begin
  if p_job_id is null or length(trim(p_job_id)) < 8 then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_ID';
  end if;
  if p_release_id is null or length(trim(p_release_id)) < 8 then
    raise exception using errcode = 'P0001', message = 'INVALID_RELEASE_ID';
  end if;
  if p_artifact_sha256 is null
    or p_artifact_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = 'P0001', message = 'INVALID_RELEASE_ARTIFACT';
  end if;

  update build_jobs
  set queue_status = 'deploying',
      stage = 'deploying',
      updated_at = now()
  where id = p_job_id
    and queue_status in ('approved', 'deployed')
    and artifact_sha256 = p_artifact_sha256;
  if not found then
    raise exception using errcode = 'P0001', message = 'HUMAN_GATE_CLOSED';
  end if;

  update build_jobs
  set queue_status = 'deployed',
      stage = 'deployed',
      completed_at = now(),
      updated_at = now()
  where id = p_job_id
    and queue_status = 'deploying'
    and artifact_sha256 = p_artifact_sha256;
  if not found then
    raise exception using errcode = 'P0001', message = 'RELEASE_STATE_TRANSITION_FAILED';
  end if;

  return query select p_release_id;
end;
$$;
