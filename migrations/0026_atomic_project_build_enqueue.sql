-- PostgreSQL gives every data-changing CTE in one statement the same command
-- snapshot. Consequently, a sibling UPDATE cannot see a project row inserted
-- by another CTE, even though RETURNING can pass that row to later CTEs. Keep
-- the create flow in one transaction while using sequential PL/pgSQL commands
-- so the durable job can be enqueued and bound to the newly inserted project.
create or replace function create_project_and_enqueue_build_job(
  p_project_id text,
  p_user_id text,
  p_title text,
  p_prompt text,
  p_build_level text,
  p_initial_html text,
  p_initial_messages text,
  p_credit_cost integer,
  p_credit_note text,
  p_credit_idempotency_key text,
  p_job_id text,
  p_job_payload text,
  p_job_idempotency_key text,
  p_request_fingerprint text,
  p_max_attempts integer default 2
)
returns table (
  job_id text,
  project_was_created boolean,
  job_was_created boolean
)
language plpgsql
as $$
declare
  v_credit_was_applied boolean;
  v_project projects%rowtype;
  v_project_was_created boolean := false;
  v_job_id text;
  v_job_was_created boolean;
  v_bound_job_id text;
begin
  if p_project_id is null or length(trim(p_project_id)) < 8 then
    raise exception using errcode = 'P0001', message = 'INVALID_PROJECT_ID';
  end if;
  if p_user_id is null or length(trim(p_user_id)) < 1 then
    raise exception using errcode = 'P0001', message = 'INVALID_PROJECT_OWNER';
  end if;
  if p_title is null or p_prompt is null then
    raise exception using errcode = 'P0001', message = 'INVALID_PROJECT_INPUT';
  end if;
  if p_build_level is null or p_build_level not in ('prototype', 'production') then
    raise exception using errcode = 'P0001', message = 'INVALID_PROJECT_BUILD_LEVEL';
  end if;
  if p_initial_messages is null
    or jsonb_typeof(p_initial_messages::jsonb) <> 'array'
  then
    raise exception using errcode = 'P0001', message = 'INVALID_PROJECT_MESSAGES';
  end if;
  if p_credit_cost is null or p_credit_cost <= 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_PROJECT_CREDIT_COST';
  end if;

  select mutation.was_applied
  into v_credit_was_applied
  from apply_credit_entry(
    p_user_id,
    -p_credit_cost,
    'generate',
    p_project_id,
    p_credit_note,
    p_credit_idempotency_key
  ) as mutation;

  if not found then
    raise exception using errcode = 'P0001', message = 'PROJECT_CREDIT_ENTRY_FAILED';
  end if;

  if v_credit_was_applied then
    insert into projects (
      id,
      user_id,
      title,
      prompt,
      kind,
      build_level,
      status,
      html,
      messages,
      credits_spent
    ) values (
      p_project_id,
      p_user_id,
      p_title,
      p_prompt,
      'web',
      p_build_level,
      'building',
      p_initial_html,
      p_initial_messages,
      p_credit_cost
    )
    returning projects.* into v_project;
    v_project_was_created := true;
  else
    -- A retry may happen after the worker has changed title/status/html/messages
    -- or after later builds have increased credits_spent. Only compare the
    -- immutable create request fields, and never overwrite the existing row.
    select project.*
    into v_project
    from projects as project
    where project.id = p_project_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'PROJECT_CREATE_REPLAY_MISSING';
    end if;

    if v_project.user_id is distinct from p_user_id
      or v_project.prompt is distinct from p_prompt
      or v_project.kind is distinct from 'web'
      or v_project.build_level is distinct from p_build_level
      or v_project.credits_spent < p_credit_cost
    then
      raise exception using errcode = 'P0001', message = 'PROJECT_CREATE_REPLAY_MISMATCH';
    end if;
  end if;

  select queued.job_id, queued.was_created
  into v_job_id, v_job_was_created
  from enqueue_build_job(
    p_job_id,
    p_project_id,
    p_user_id,
    null,
    null,
    p_job_payload,
    p_job_idempotency_key,
    p_request_fingerprint,
    p_max_attempts
  ) as queued;

  if not found then
    raise exception using errcode = 'P0001', message = 'BUILD_JOB_ENQUEUE_FAILED';
  end if;

  -- On a fresh create, or while repairing a partially committed legacy create,
  -- the current binding is null. A delayed replay must not replace a newer
  -- build that already superseded this initial job.
  update projects as project
  set current_build_job_id = v_job_id,
      updated_at = case
        when project.current_build_job_id is distinct from v_job_id then now()
        else project.updated_at
      end
  where project.id = p_project_id
    and project.user_id = p_user_id
    and (
      project.current_build_job_id is null
      or project.current_build_job_id = v_job_id
    )
  returning project.current_build_job_id into v_bound_job_id;

  if not found then
    -- A later iteration may legitimately own the current binding. Preserve it,
    -- but reject a dangling or cross-project value instead of hiding damage.
    select project.current_build_job_id
    into v_bound_job_id
    from projects as project
    join build_jobs as current_job
      on current_job.id = project.current_build_job_id
     and current_job.project_id = project.id
     and current_job.user_id = project.user_id
    where project.id = p_project_id
      and project.user_id = p_user_id;

    if not found or v_bound_job_id is null then
      raise exception using errcode = 'P0001', message = 'PROJECT_BUILD_JOB_BIND_FAILED';
    end if;
  end if;

  return query select v_job_id, v_project_was_created, v_job_was_created;
end;
$$;

comment on function create_project_and_enqueue_build_job(
  text, text, text, text, text, text, text, integer, text, text,
  text, text, text, text, integer
) is
  'Atomically debits, immutably creates/replays a project, enqueues its initial durable build, and binds the current job using sequential statements.';
