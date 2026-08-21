-- Authenticated, artifact/deploy-bound capacity evidence. The provider payload
-- is retained without bearer credentials or the HMAC itself; the complete
-- envelope hash and the server-side seal make every accepted bundle auditable.
create table if not exists augur_capacity_evidence (
  id text primary key,
  job_id text not null references build_jobs (id) on delete restrict,
  project_id text not null references projects (id) on delete restrict,
  user_id text not null,
  deploy_id text not null references deploys (id) on delete restrict,
  request_id text not null,
  source_id text not null,
  key_id text not null,
  source_nonce text not null,
  source_observed_at timestamptz not null,
  artifact_sha256 text not null,
  deploy_sha256 text not null,
  envelope_sha256 text not null,
  evidence_sha256 text not null,
  source_payload jsonb not null,
  evidence jsonb not null,
  created_at timestamptz not null default now(),
  unique (job_id, request_id),
  unique (source_id, key_id, source_nonce),
  unique (job_id, deploy_id, evidence_sha256),
  check (length(id) between 8 and 160),
  check (length(project_id) between 1 and 128),
  check (length(user_id) between 1 and 240),
  check (length(deploy_id) between 1 and 160),
  check (request_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  check (source_nonce ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  check (source_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  check (key_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  check (deploy_sha256 ~ '^[0-9a-f]{64}$'),
  check (envelope_sha256 ~ '^[0-9a-f]{64}$'),
  check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  check (jsonb_typeof(source_payload) = 'object'),
  check (jsonb_typeof(evidence) = 'object'),
  check (source_payload ->> 'kind' = 'augur_capacity_evidence_delivery'),
  check (source_payload ->> 'version' = '1.0.0'),
  check (source_payload ->> 'jobId' = job_id),
  check (source_payload ->> 'projectId' = project_id),
  check (source_payload ->> 'deployId' = deploy_id),
  check (source_payload ->> 'requestId' = request_id),
  check (source_payload ->> 'requestNonce' = source_nonce),
  check (source_payload ->> 'sourceId' = source_id),
  check (source_payload ->> 'keyId' = key_id),
  check (source_payload ->> 'artifactSha256' = artifact_sha256),
  check (source_payload ->> 'deploySha256' = deploy_sha256),
  check (evidence ->> 'kind' = 'augur_capacity_evidence'),
  check (evidence ->> 'version' = '1.0.0'),
  check (evidence ->> 'artifactSha256' = artifact_sha256),
  check (evidence ->> 'deploySha256' = deploy_sha256),
  check (evidence ->> 'evidenceSha256' = evidence_sha256),
  check (source_payload -> 'evidence' = evidence - 'evidenceSha256')
);

create index if not exists augur_capacity_evidence_owner_idx
  on augur_capacity_evidence (user_id, project_id, job_id, created_at desc);
create index if not exists augur_capacity_evidence_deploy_idx
  on augur_capacity_evidence (deploy_id, created_at desc);

-- Every authenticated pull gets an immutable idempotency/replay record even
-- when its evidence body is byte-identical to an earlier accepted bundle.
create table if not exists augur_capacity_ingestion_requests (
  id bigserial primary key,
  job_id text not null references build_jobs (id) on delete restrict,
  project_id text not null references projects (id) on delete restrict,
  user_id text not null,
  deploy_id text not null references deploys (id) on delete restrict,
  request_id text not null,
  evidence_id text not null references augur_capacity_evidence (id) on delete restrict,
  source_id text not null,
  key_id text not null,
  source_nonce text not null,
  source_observed_at timestamptz not null,
  envelope_sha256 text not null,
  created_at timestamptz not null default now(),
  unique (job_id, request_id),
  unique (source_id, key_id, source_nonce),
  check (request_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  check (source_nonce ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  check (source_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  check (key_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  check (envelope_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists augur_capacity_ingestion_requests_owner_idx
  on augur_capacity_ingestion_requests (user_id, project_id, job_id, created_at desc);

-- One mutable throttle row per exact tenant/job/deploy scope. It is acquired
-- before any provider I/O; evidence and request records remain append-only.
create table if not exists augur_capacity_ingestion_claims (
  user_id text not null,
  project_id text not null references projects (id) on delete restrict,
  job_id text not null references build_jobs (id) on delete restrict,
  deploy_id text not null references deploys (id) on delete restrict,
  request_id text not null,
  claim_token text not null,
  state text not null check (state in ('pending', 'completed', 'failed')),
  evidence_id text references augur_capacity_evidence (id) on delete restrict,
  claimed_at timestamptz not null,
  lease_expires_at timestamptz,
  next_allowed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id, job_id, deploy_id),
  check (request_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  check (claim_token ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  check (
    (state = 'pending' and evidence_id is null and lease_expires_at is not null)
    or (state = 'completed' and evidence_id is not null and lease_expires_at is null)
    or (state = 'failed' and evidence_id is null and lease_expires_at is null)
  )
);

create or replace function reject_augur_capacity_evidence_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = 'AUGUR_EVIDENCE_IMMUTABLE';
end
$$;

drop trigger if exists augur_capacity_evidence_immutable on augur_capacity_evidence;
create trigger augur_capacity_evidence_immutable
before update or delete on augur_capacity_evidence
for each row execute function reject_augur_capacity_evidence_mutation();

drop trigger if exists augur_capacity_ingestion_requests_immutable
  on augur_capacity_ingestion_requests;
create trigger augur_capacity_ingestion_requests_immutable
before update or delete on augur_capacity_ingestion_requests
for each row execute function reject_augur_capacity_evidence_mutation();

comment on table augur_capacity_evidence is
  'Append-only authenticated capacity bundles bound to the current owned build and exact deployed web output';
comment on column augur_capacity_evidence.source_payload is
  'Validated provider payload only; bearer credentials and the HMAC signature are never persisted';
comment on column augur_capacity_evidence.envelope_sha256 is
  'SHA-256 of the complete authenticated envelope, including its HMAC signature';
comment on table augur_capacity_ingestion_claims is
  'Tenant/job/deploy-scoped pre-network lease and cooldown; it cannot itself prove source execution';
