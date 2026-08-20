create table if not exists build_jobs (
  id text primary key,
  project_id text,
  user_id text,
  guest_access_token_hash text,
  guest_access_expires_at timestamptz,
  payload text not null,
  updated_at timestamptz not null default now()
);

alter table build_jobs add column if not exists project_id text;
alter table build_jobs add column if not exists user_id text;
alter table build_jobs add column if not exists guest_access_token_hash text;
alter table build_jobs add column if not exists guest_access_expires_at timestamptz;
alter table build_jobs add column if not exists updated_at timestamptz not null default now();

-- Runtime versions before this migration persisted only project_id + payload.
-- Recover ownership from the authoritative project row instead of locking the
-- legitimate owner out of every in-flight legacy job.
update build_jobs as job
set user_id = project.user_id
from projects as project
where job.user_id is null
  and job.project_id = project.id;

create index if not exists build_jobs_project_owner_idx
  on build_jobs (project_id, user_id, updated_at desc);
create unique index if not exists build_jobs_guest_token_hash_idx
  on build_jobs (guest_access_token_hash)
  where guest_access_token_hash is not null;
