-- Durable Harbor web releases for sealed multi-file Production workspaces.
-- No provider identifiers, URLs, timestamps, or rollback claims are written
-- before an authenticated runner report has been verified by the application.
create table if not exists harbor_production_releases (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  build_job_id text not null references build_jobs (id) on delete restrict,
  deploy_id text unique references deploys (id) on delete set null,
  user_id text not null,
  request_id text not null,
  idempotency_key text not null unique,
  human_gate_artifact_sha256 text not null
    check (human_gate_artifact_sha256 ~ '^[0-9a-f]{64}$'),
  workspace_artifact_sha256 text not null
    check (workspace_artifact_sha256 ~ '^[0-9a-f]{64}$'),
  package_sha256 text not null check (package_sha256 ~ '^[0-9a-f]{64}$'),
  provenance_sha256 text not null check (provenance_sha256 ~ '^[0-9a-f]{64}$'),
  package_bytes integer not null check (package_bytes > 0 and package_bytes <= 4194304),
  package_file_count integer not null check (package_file_count > 1 and package_file_count <= 256),
  package_filename text not null,
  package_base64 text check (
    package_base64 is null
    or (length(package_base64) >= 4 and length(package_base64) <= 5592424)
  ),
  credit_cost integer check (credit_cost is null or credit_cost > 0),
  credit_reserved_at timestamptz,
  credit_reservation_expires_at timestamptz,
  credit_refunded_at timestamptz,
  accept_dispatch_intent_at timestamptz,
  state text not null default 'prepared' check (
    state in (
      'prepared', 'accepted', 'queued', 'deploying', 'active',
      'failed', 'action_required', 'retry_exhausted'
    )
  ),
  runner_release_id text,
  provider text,
  provider_deployment_id text,
  public_url text,
  rollback_ref text,
  provider_report jsonb,
  runner_response_body text,
  runner_signature text,
  runner_response_sha256 text,
  runner_signature_sha256 text,
  accepted_at timestamptz,
  provider_observed_at timestamptz,
  deployed_at timestamptz,
  last_reconciled_at timestamptz,
  next_poll_at timestamptz,
  action_claim_token text,
  action_claimed_at timestamptz,
  action_claim_expires_at timestamptz,
  action_attempt_count integer not null default 0 check (action_attempt_count between 0 and 64),
  retry_count integer not null default 0 check (retry_count between 0 and 20),
  last_error_code text,
  last_error_message text,
  last_error_retryable boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_id),
  check (
    (
      credit_cost is null and credit_reserved_at is null
      and credit_reservation_expires_at is null and credit_refunded_at is null
      and accept_dispatch_intent_at is null
    )
    or (
      credit_cost is not null and credit_reserved_at is not null
      and credit_reservation_expires_at is not null
      and credit_reservation_expires_at > credit_reserved_at
      and accept_dispatch_intent_at is not null
    )
  ),
  check (
    state <> 'prepared' or package_base64 is not null
  ),
  check (
    state in ('prepared', 'retry_exhausted')
    or (
      runner_release_id is not null
      and provider is not null
      and provider_report is not null
      and runner_response_body is not null
      and runner_signature ~ '^[0-9a-f]{64}$'
      and runner_response_sha256 ~ '^[0-9a-f]{64}$'
      and runner_signature_sha256 ~ '^[0-9a-f]{64}$'
      and accepted_at is not null
      and provider_observed_at is not null
    )
  ),
  check (
    state <> 'prepared'
    or (
      deploy_id is null
      and runner_release_id is null
      and provider is null
      and provider_deployment_id is null
      and public_url is null
      and rollback_ref is null
      and provider_report is null
      and runner_response_body is null
      and runner_signature is null
      and runner_response_sha256 is null
      and runner_signature_sha256 is null
      and accepted_at is null
      and provider_observed_at is null
      and deployed_at is null
    )
  ),
  check (
    state = 'active'
    or (public_url is null and deployed_at is null and rollback_ref is null)
  ),
  check (
    (action_claim_token is null and action_claimed_at is null and action_claim_expires_at is null)
    or
    (action_claim_token is not null and action_claimed_at is not null and action_claim_expires_at is not null)
  ),
  check (
    state <> 'active'
    or (
      provider_deployment_id is not null
      and public_url ~ '^https://'
      and deployed_at is not null
      and rollback_ref is not null
      and last_error_code is null
      and last_error_message is null
    )
  )
);

create index if not exists harbor_production_releases_project_idx
  on harbor_production_releases (project_id, created_at desc);
create index if not exists harbor_production_releases_poll_idx
  on harbor_production_releases (next_poll_at)
  where state in ('accepted', 'queued', 'deploying');
create index if not exists harbor_production_releases_reservation_expiry_idx
  on harbor_production_releases (credit_reservation_expires_at)
  where state = 'prepared' and credit_refunded_at is null;

create table if not exists harbor_production_release_events (
  id bigserial primary key,
  release_id text not null references harbor_production_releases (id) on delete cascade,
  event_key text not null,
  from_state text,
  to_state text not null,
  source text not null check (source in ('helix', 'runner')),
  action text,
  provider_observed_at timestamptz,
  response_sha256 text,
  signature_sha256 text,
  evidence jsonb,
  response_body text,
  signature text,
  error_code text,
  error_message text,
  retryable boolean,
  created_at timestamptz not null default now(),
  unique (release_id, event_key),
  check (
    source <> 'runner'
    or (
      action in ('accept', 'activate', 'reconcile')
      and provider_observed_at is not null
      and response_sha256 ~ '^[0-9a-f]{64}$'
      and signature_sha256 ~ '^[0-9a-f]{64}$'
      and evidence is not null
      and response_body is not null
      and signature ~ '^[0-9a-f]{64}$'
    )
  )
);

create index if not exists harbor_production_release_events_release_idx
  on harbor_production_release_events (release_id, created_at, id);

comment on table harbor_production_releases is
  'Idempotent Harbor Production web release state bound to a sealed workspace package';
comment on column harbor_production_releases.provider_report is
  'Latest HMAC-authenticated runner report; provider facts are copied only from this evidence';
comment on column harbor_production_releases.rollback_ref is
  'Exact provider snapshot, rollback token, or prior-deployment reference from signed evidence';
