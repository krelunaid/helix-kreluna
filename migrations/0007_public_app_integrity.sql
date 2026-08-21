update public_apps
set content_bytes = octet_length(html)
where content_bytes is distinct from octet_length(html);

-- The application reads a single public app per project/tester code. Refuse to
-- choose or delete legacy duplicates silently: they must be reconciled by an
-- operator before the uniqueness contract is enabled.
do $migration$
begin
  if exists (
    select 1
    from public_apps
    where project_id is not null and visibility = 'public'
    group by project_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_PUBLIC_APP_PROJECTS_REQUIRE_RECONCILIATION';
  end if;

  if exists (
    select 1
    from public_apps
    where testers_code is not null and visibility = 'public'
    group by testers_code
    having count(*) > 1
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_PUBLIC_APP_TESTER_CODES_REQUIRE_RECONCILIATION';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public_apps'::regclass
      and conname = 'public_apps_visibility_ck'
  ) then
    alter table public_apps
      add constraint public_apps_visibility_ck
      check (visibility in ('public', 'guest'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public_apps'::regclass
      and conname = 'public_apps_content_bytes_ck'
  ) then
    alter table public_apps
      add constraint public_apps_content_bytes_ck
      check (content_bytes >= 0 and content_bytes = octet_length(html));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public_apps'::regclass
      and conname = 'public_apps_guest_metadata_ck'
  ) then
    alter table public_apps
      add constraint public_apps_guest_metadata_ck
      check (
        (
          visibility = 'guest'
          and guest_token_hash is not null
          and guest_token_hash ~ '^[0-9a-f]{64}$'
          and expires_at is not null
          and expires_at > created_at
          and project_id is null
          and testers_code is null
        )
        or
        (
          visibility = 'public'
          and guest_token_hash is null
          and expires_at is null
        )
      );
  end if;
end
$migration$;

create unique index if not exists public_apps_project_id_unique_idx
  on public_apps (project_id)
  where project_id is not null and visibility = 'public';

create unique index if not exists public_apps_testers_code_unique_idx
  on public_apps (testers_code)
  where testers_code is not null and visibility = 'public';
