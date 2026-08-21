-- Durable, idempotent state for explicitly requested mobile-store releases.
-- Source-package downloads remain a separate, free action and never create a
-- row here. A release becomes chargeable only after the authenticated runner
-- has durably accepted the exact ZIP hash.
create table if not exists store_release_jobs (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  build_job_id text not null references build_jobs (id) on delete restrict,
  deploy_id text unique references deploys (id) on delete set null,
  user_id text not null,
  platform text not null check (platform in ('ios', 'android')),
  destination text not null check (destination in ('testflight', 'play_internal')),
  request_id text not null,
  idempotency_key text not null unique,
  source_artifact_sha256 text not null
    check (source_artifact_sha256 ~ '^[0-9a-f]{64}$'),
  package_sha256 text not null check (package_sha256 ~ '^[0-9a-f]{64}$'),
  package_bytes integer not null check (package_bytes > 0 and package_bytes <= 6291456),
  package_filename text not null,
  app_identifier text not null,
  eas_project_id text not null,
  apple_team_id text,
  state text not null default 'prepared' check (
    state in (
      'prepared',
      'dispatch_accepted',
      'workflow_queued',
      'build_in_progress',
      'build_succeeded',
      'submission_in_progress',
      'distributed',
      'failed',
      'action_required'
    )
  ),
  runner_job_id text,
  workflow_run_id text,
  provider_build_id text,
  provider_submission_id text,
  provider_release_id text,
  play_track text,
  credential_evidence jsonb,
  provider_evidence jsonb,
  accepted_at timestamptz,
  dispatched_at timestamptz,
  completed_at timestamptz,
  last_polled_at timestamptz,
  next_poll_at timestamptz,
  retry_count integer not null default 0 check (retry_count between 0 and 20),
  last_error_code text,
  last_error_message text,
  last_error_retryable boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_id),
  check (
    (platform = 'ios' and destination = 'testflight'
      and apple_team_id is not null and play_track is null)
    or
    (platform = 'android' and destination = 'play_internal'
      and apple_team_id is null and (play_track is null or play_track = 'internal'))
  ),
  check (
    state = 'prepared'
    or (
      runner_job_id is not null
      and accepted_at is not null
      and credential_evidence is not null
    )
  )
);

create index if not exists store_release_jobs_project_idx
  on store_release_jobs (project_id, created_at desc);
create index if not exists store_release_jobs_poll_idx
  on store_release_jobs (next_poll_at)
  where state in (
    'dispatch_accepted', 'workflow_queued', 'build_in_progress',
    'build_succeeded', 'submission_in_progress'
  );

create table if not exists store_release_events (
  id bigserial primary key,
  release_id text not null references store_release_jobs (id) on delete cascade,
  event_key text not null,
  from_state text,
  to_state text not null,
  source text not null check (source in ('helix', 'runner')),
  provider_observed_at timestamptz,
  evidence jsonb,
  error_code text,
  error_message text,
  retryable boolean,
  created_at timestamptz not null default now(),
  unique (release_id, event_key)
);

create index if not exists store_release_events_release_idx
  on store_release_events (release_id, created_at, id);

comment on table store_release_jobs is
  'Store release state backed only by signed EAS runner reports; source ZIP exports are not submissions';
comment on column store_release_jobs.credential_evidence is
  'Non-secret hashes/identifiers for an accepted runner mapping; not proof that EAS or a store accepted the credentials';
comment on column store_release_jobs.provider_evidence is
  'Latest signed, hash-bound EAS workflow evidence; never inferred from elapsed time';
