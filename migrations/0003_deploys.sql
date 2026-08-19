create table if not exists deploys (
  id text primary key,
  project_id text,
  user_id text,
  target text not null,
  status text not null,
  slug text,
  bundle_id text,
  apple_team text,
  version text not null default '1.0.0',
  testers_code text,
  url text,
  log text not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deploys_project_id_idx on deploys (project_id);
create index if not exists deploys_testers_code_idx on deploys (testers_code);

create table if not exists public_apps (
  slug text primary key,
  title text not null,
  html text not null,
  testers_code text,
  project_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists public_apps_testers_code_idx on public_apps (testers_code);
