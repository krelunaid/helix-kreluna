-- Human Gate seals the generated source artifact. Harbor may then add a PWA
-- wrapper and the generated-content policy, so the bytes that are served or
-- exported have a different digest. Persist both hashes instead of presenting
-- the approved-source digest as proof of the transformed output.
alter table deploys add column if not exists published_sha256 text;
alter table deploys add column if not exists output_integrity_version smallint;

alter table public_apps add column if not exists source_artifact_sha256 text;
alter table public_apps add column if not exists served_sha256 text;
alter table public_apps add column if not exists publication_integrity_version smallint;

-- The approved source hash can be recovered without guessing output bytes.
-- Existing output hashes deliberately remain null: older rows were served
-- through a runtime transformation and no immutable exact-byte claim exists.
update public_apps as app
set source_artifact_sha256 = job.artifact_sha256
from build_jobs as job
where app.source_job_id = job.id
  and app.source_artifact_sha256 is null
  and job.artifact_sha256 ~ '^[0-9a-f]{64}$';

-- Existing rows keep NULL versions. New inserts default to the strict v1
-- envelope and fail unless both the approved source and exact output hashes
-- are present.
alter table deploys alter column output_integrity_version set default 1;
alter table public_apps alter column publication_integrity_version set default 1;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'deploys'::regclass
      and conname = 'deploys_published_sha256_ck'
  ) then
    alter table deploys
      add constraint deploys_published_sha256_ck
      check (
        published_sha256 is null
        or published_sha256 ~ '^[0-9a-f]{64}$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'deploys'::regclass
      and conname = 'deploys_output_integrity_ck'
  ) then
    alter table deploys
      add constraint deploys_output_integrity_ck
      check (
        output_integrity_version is null
        or (
          output_integrity_version = 1
          and artifact_sha256 is not null
          and artifact_sha256 ~ '^[0-9a-f]{64}$'
          and published_sha256 is not null
          and published_sha256 ~ '^[0-9a-f]{64}$'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public_apps'::regclass
      and conname = 'public_apps_source_artifact_sha256_ck'
  ) then
    alter table public_apps
      add constraint public_apps_source_artifact_sha256_ck
      check (
        source_artifact_sha256 is null
        or source_artifact_sha256 ~ '^[0-9a-f]{64}$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public_apps'::regclass
      and conname = 'public_apps_served_sha256_ck'
  ) then
    alter table public_apps
      add constraint public_apps_served_sha256_ck
      check (
        served_sha256 is null
        or served_sha256 ~ '^[0-9a-f]{64}$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public_apps'::regclass
      and conname = 'public_apps_publication_integrity_ck'
  ) then
    alter table public_apps
      add constraint public_apps_publication_integrity_ck
      check (
        publication_integrity_version is null
        or (
          publication_integrity_version = 1
          and source_job_id is not null
          and source_artifact_sha256 is not null
          and source_artifact_sha256 ~ '^[0-9a-f]{64}$'
          and served_sha256 is not null
          and served_sha256 ~ '^[0-9a-f]{64}$'
        )
      );
  end if;
end
$migration$;

comment on column deploys.artifact_sha256 is
  'SHA-256 of the source artifact sealed and approved by Human Gate';
comment on column deploys.published_sha256 is
  'SHA-256 of the exact UTF-8 HTML or ZIP bytes persisted/exported by Harbor';
comment on column public_apps.source_artifact_sha256 is
  'SHA-256 of the Human Gate approved source HTML';
comment on column public_apps.served_sha256 is
  'SHA-256 of the exact protected UTF-8 HTML returned to the srcdoc consumer';
