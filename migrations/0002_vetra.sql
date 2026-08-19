create table if not exists profiles (
  user_id text primary key,
  plan text not null default 'free',
  credits_balance integer not null default 10,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id text primary key,
  user_id text not null,
  title text not null,
  prompt text not null,
  kind text not null default 'web',
  status text not null default 'draft',
  html text,
  messages text not null default '[]',
  credits_spent integer not null default 0,
  hosted boolean not null default false,
  hosted_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_user_id_idx on projects (user_id);

create table if not exists credit_ledger (
  id serial primary key,
  user_id text not null,
  project_id text,
  action text not null,
  credits integer not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_user_id_idx on credit_ledger (user_id);
