alter table public_apps
  add column if not exists visibility text not null default 'public';
alter table public_apps
  add column if not exists guest_token_hash text;
alter table public_apps
  add column if not exists expires_at timestamptz;
alter table public_apps
  add column if not exists content_bytes integer not null default 0;

create unique index if not exists public_apps_guest_token_hash_idx
  on public_apps (guest_token_hash)
  where guest_token_hash is not null;
create index if not exists public_apps_expiry_idx
  on public_apps (expires_at)
  where expires_at is not null;

create table if not exists guest_rate_limits (
  identity_hash text not null,
  action text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  total_bytes bigint not null default 0,
  estimated_cost_micro_usd bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (identity_hash, action, window_start),
  check (request_count >= 0),
  check (total_bytes >= 0),
  check (estimated_cost_micro_usd >= 0)
);
create index if not exists guest_rate_limits_updated_at_idx
  on guest_rate_limits (updated_at);

create table if not exists guest_active_leases (
  identity_hash text not null,
  action text not null,
  lease_id text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (identity_hash, action)
);
create index if not exists guest_active_leases_expiry_idx
  on guest_active_leases (expires_at);
