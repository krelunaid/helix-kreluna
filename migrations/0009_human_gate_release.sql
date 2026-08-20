alter table build_jobs add column if not exists artifact_sha256 text;
alter table build_jobs add column if not exists parent_job_id text;

alter table projects add column if not exists current_build_job_id text;

-- Bind each project to its newest durable build. This prevents an older,
-- approved candidate from authorizing a release after a newer iteration exists.
update projects as project
set current_build_job_id = (
  select job.id
  from build_jobs as job
  where job.project_id = project.id
  order by job.created_at desc, job.updated_at desc, job.id desc
  limit 1
)
where project.current_build_job_id is null
  and exists (
    select 1 from build_jobs as job where job.project_id = project.id
  );

create index if not exists projects_current_build_job_idx
  on projects (current_build_job_id)
  where current_build_job_id is not null;
create index if not exists build_jobs_parent_job_idx
  on build_jobs (parent_job_id)
  where parent_job_id is not null;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'build_jobs'::regclass
      and conname = 'build_jobs_artifact_sha256_ck'
  ) then
    alter table build_jobs
      add constraint build_jobs_artifact_sha256_ck
      check (
        artifact_sha256 is null
        or artifact_sha256 ~ '^[0-9a-f]{64}$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'build_jobs'::regclass
      and conname = 'build_jobs_release_sealed_ck'
  ) then
    alter table build_jobs
      add constraint build_jobs_release_sealed_ck
      check (
        queue_status not in ('approved', 'deploying', 'deployed')
        or artifact_sha256 is not null
      );
  end if;
end
$migration$;

create table if not exists build_job_gate_events (
  id bigserial primary key,
  job_id text not null references build_jobs (id) on delete cascade,
  project_id text,
  actor_type text not null,
  actor_user_id text,
  actor_guest_hash text,
  decision text not null,
  from_status text not null,
  to_status text not null,
  request_id text not null,
  reason text,
  artifact_sha256 text not null,
  result_job_id text,
  created_at timestamptz not null default now(),
  unique (job_id, actor_type, request_id),
  check (actor_type in ('user', 'guest')),
  check (decision in ('approve', 'reject', 'modify')),
  check (from_status = 'awaiting_human_approval'),
  check (to_status in ('approved', 'rejected')),
  check (request_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  check (
    (actor_type = 'user' and actor_user_id is not null and actor_guest_hash is null)
    or
    (actor_type = 'guest' and actor_user_id is null and actor_guest_hash ~ '^[0-9a-f]{64}$')
  ),
  check (
    (decision = 'modify' and result_job_id is not null)
    or
    (decision <> 'modify' and result_job_id is null)
  )
);
create index if not exists build_job_gate_events_job_idx
  on build_job_gate_events (job_id, created_at desc);
create index if not exists build_job_gate_events_project_idx
  on build_job_gate_events (project_id, created_at desc)
  where project_id is not null;

alter table deploys add column if not exists build_job_id text;
alter table deploys add column if not exists provider text;
alter table deploys add column if not exists provider_deploy_id text;
alter table deploys add column if not exists artifact_ref text;
alter table deploys add column if not exists artifact_sha256 text;
alter table deploys add column if not exists rollback_ref text;
alter table deploys add column if not exists release_key text;
alter table deploys add column if not exists completed_at timestamptz;
alter table deploys add column if not exists error_code text;
alter table deploys add column if not exists error_message text;

create unique index if not exists deploys_release_key_unique_idx
  on deploys (release_key)
  where release_key is not null;
create index if not exists deploys_build_job_idx
  on deploys (build_job_id, created_at desc)
  where build_job_id is not null;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'deploys'::regclass
      and conname = 'deploys_artifact_sha256_ck'
  ) then
    alter table deploys
      add constraint deploys_artifact_sha256_ck
      check (
        artifact_sha256 is null
        or artifact_sha256 ~ '^[0-9a-f]{64}$'
      );
  end if;
end
$migration$;

alter table public_apps add column if not exists source_job_id text;
create unique index if not exists public_apps_source_job_unique_idx
  on public_apps (source_job_id)
  where source_job_id is not null;
