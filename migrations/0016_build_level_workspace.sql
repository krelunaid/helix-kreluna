alter table projects
  add column if not exists build_level text not null default 'prototype';

update projects
set build_level = 'prototype'
where build_level is null;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'projects'::regclass
      and conname = 'projects_build_level_ck'
  ) then
    alter table projects
      add constraint projects_build_level_ck
      check (build_level in ('prototype', 'production'));
  end if;
end
$migration$;

-- The durable payload remains the canonical job snapshot. Make the legacy
-- default explicit so replay/fingerprinting never interprets an old build as
-- Production.
update build_jobs
set payload = (
  payload::jsonb || jsonb_build_object('buildLevel', 'prototype')
)::text
where not (payload::jsonb ? 'buildLevel');

comment on column projects.build_level is
  'Product fidelity, separate from the generate/iterate/debug job action. Legacy rows are prototype.';
