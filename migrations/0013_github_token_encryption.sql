alter table profiles add column if not exists github_login text;
alter table profiles add column if not exists github_token_ciphertext text;
alter table profiles add column if not exists github_token_nonce text;
alter table profiles add column if not exists github_token_key_version text;

-- Expand/contract rollout safety: the previously deployed application creates
-- and writes `github_token` at request time. Keep a constrained tombstone for
-- one deployment so an old instance cannot recreate the column and persist a
-- PAT in plaintext while the new deploy is activating. A later, post-activation
-- contract migration may remove the tombstone after old instances are drained.
alter table profiles add column if not exists github_token text;

-- Any legacy plaintext token is intentionally discarded. It cannot be migrated
-- safely inside SQL because the application encryption key is not available to
-- the database migration. Affected users must explicitly reconnect GitHub.
update profiles
set github_login = null,
    github_token = null,
    github_token_ciphertext = null,
    github_token_nonce = null,
    github_token_key_version = null
where github_token is not null;

-- Normalize every partial envelope before installing the strict constraint.
-- PostgreSQL CHECK constraints accept UNKNOWN, so the constraint below uses
-- explicit IS NOT NULL predicates instead of relying on length(NULL).
update profiles
set github_login = null,
    github_token_ciphertext = null,
    github_token_nonce = null,
    github_token_key_version = null
where num_nonnulls(
  github_login,
  github_token_ciphertext,
  github_token_nonce,
  github_token_key_version
) between 1 and 3;

-- A plain CHECK would reject the old writer but PostgreSQL may include the
-- complete failing row (and therefore the PAT) in error.detail. Intercept the
-- write first and emit only a controlled, non-sensitive error. The CHECK below
-- remains as defense in depth if the trigger is ever disabled accidentally.
create or replace function reject_plaintext_github_token()
returns trigger
language plpgsql
as $function$
begin
  if new.github_token is not null then
    raise exception using
      errcode = '23514',
      message = 'GITHUB_TOKEN_PLAINTEXT_FORBIDDEN',
      detail = 'Legacy plaintext GitHub token storage is disabled.';
  end if;
  return new;
end
$function$;

drop trigger if exists profiles_reject_plaintext_github_token on profiles;
create trigger profiles_reject_plaintext_github_token
before insert or update of github_token on profiles
for each row execute function reject_plaintext_github_token();

alter table profiles
  drop constraint if exists profiles_github_token_plaintext_forbidden_ck;
alter table profiles
  add constraint profiles_github_token_plaintext_forbidden_ck
  check (github_token is null);

alter table profiles
  drop constraint if exists profiles_github_token_envelope_ck;
alter table profiles
  add constraint profiles_github_token_envelope_ck
  check (
    (github_login is null
      and github_token_ciphertext is null
      and github_token_nonce is null
      and github_token_key_version is null)
    or
    (github_login is not null
      and github_token_ciphertext is not null
      and github_token_nonce is not null
      and github_token_key_version is not null
      and length(github_token_ciphertext) >= 24
      and length(github_token_nonce) >= 16
      and github_token_key_version ~ '^[A-Za-z0-9._-]{1,40}$')
  );
