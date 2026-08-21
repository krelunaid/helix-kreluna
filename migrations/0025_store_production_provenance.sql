-- Bind Store releases to an explicit source/build profile. Existing rows were
-- created before Production Store packaging existed and are therefore
-- backfilled as legacy Prototype wrappers without workspace provenance.
alter table store_release_jobs
  add column if not exists source_build_level text not null default 'prototype';
alter table store_release_jobs
  add column if not exists source_workspace_sha256 text;
alter table store_release_jobs
  add column if not exists package_manifest_sha256 text;
alter table store_release_jobs
  add column if not exists packaging_profile text not null default 'legacy_expo_wrapper_v1';

update store_release_jobs
set source_build_level = 'prototype',
    source_workspace_sha256 = null,
    package_manifest_sha256 = null,
    packaging_profile = 'legacy_expo_wrapper_v1'
where source_build_level is null
   or packaging_profile is null;

-- Older code could persist `distributed` while EAS/provider submission or
-- platform-specific release evidence was absent. TestFlight is bound to the
-- documented EAS submission ID; Android additionally requires a verified Play
-- release ID. Preserve the signed report for audit, but remove unsupported
-- completion claims before installing the new CHECK.
with invalid as materialized (
  select id, deploy_id
  from store_release_jobs
  where state = 'distributed'
    and not coalesce((
      nullif(btrim(workflow_run_id), '') is not null
      and nullif(btrim(provider_build_id), '') is not null
      and nullif(btrim(provider_submission_id), '') is not null
      and (
        platform = 'ios'
        or (platform = 'android' and nullif(btrim(provider_release_id), '') is not null)
      )
      and completed_at is not null
      and next_poll_at is null
      and last_error_code is null
      and last_error_message is null
      and last_error_retryable is null
      and jsonb_typeof(provider_evidence) = 'object'
      and provider_evidence ->> 'state' = 'distributed'
      and provider_evidence ->> 'workflowRunId' = workflow_run_id
      and provider_evidence ->> 'providerBuildId' = provider_build_id
      and provider_evidence ->> 'providerSubmissionId' = provider_submission_id
      and (provider_evidence ->> 'providerReleaseId') is not distinct from provider_release_id
      and nullif(btrim(provider_evidence ->> 'workflowBuildJobId'), '') is not null
      and nullif(btrim(provider_evidence ->> 'workflowDistributionJobId'), '') is not null
      and provider_evidence #>> '{providerEvidence,workflowStatus}' = 'success'
      and provider_evidence #>> '{providerEvidence,buildStatus}' = 'succeeded'
      and provider_evidence #>> '{providerEvidence,submissionStatus}' = 'succeeded'
      and (
        source_build_level <> 'production'
        or (
          jsonb_typeof(provider_evidence -> 'artifactDescriptor') = 'object'
          and provider_evidence #>> '{artifactDescriptor,sourceBuildLevel}' = source_build_level
          and provider_evidence #>> '{artifactDescriptor,sourcePreviewSha256}' = source_artifact_sha256
          and provider_evidence #>> '{artifactDescriptor,sourceWorkspaceSha256}'
            = source_workspace_sha256
          and provider_evidence #>> '{artifactDescriptor,packageManifestSha256}'
            = package_manifest_sha256
          and provider_evidence #>> '{artifactDescriptor,packagingProfile}' = packaging_profile
        )
      )
    ), false)
  for update
), demoted as (
  update store_release_jobs as release
  set state = 'action_required',
      completed_at = null,
      next_poll_at = null,
      last_error_code = 'STORE_DISTRIBUTED_PROVIDER_EVIDENCE_INCOMPLETE',
      last_error_message = 'Prior distributed state lacked complete provider evidence',
      last_error_retryable = false,
      updated_at = now()
  from invalid
  where release.id = invalid.id
  returning release.id, invalid.deploy_id
), deploy_demoted as (
  update deploys as deploy
  set status = 'action_required',
      completed_at = null,
      log = jsonb_build_array(
        jsonb_build_object(
          'id', 'migration-provider-evidence',
          'label', 'Harbor · Store provider evidence',
          'status', 'blocked',
          'detail', 'Prior distributed state lacked complete provider evidence'
        )
      )::text,
      error_code = 'STORE_DISTRIBUTED_PROVIDER_EVIDENCE_INCOMPLETE',
      error_message = 'Prior distributed state lacked complete provider evidence',
      updated_at = now()
  from demoted
  where deploy.id = demoted.deploy_id
  returning deploy.id
)
insert into store_release_events (
  release_id, event_key, from_state, to_state, source,
  evidence, error_code, error_message, retryable
)
select demoted.id, 'migration:0025:provider-evidence-incomplete',
       'distributed', 'action_required', 'helix',
       jsonb_build_object(
         'migration', '0025_store_production_provenance',
         'providerEvidenceRetained', true
       ),
       'STORE_DISTRIBUTED_PROVIDER_EVIDENCE_INCOMPLETE',
       'Prior distributed state lacked complete provider evidence', false
from demoted
on conflict (release_id, event_key) do nothing;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'store_release_jobs'::regclass
      and conname = 'store_release_jobs_source_provenance_ck'
  ) then
    alter table store_release_jobs
      add constraint store_release_jobs_source_provenance_ck
      check (
        (
          source_build_level = 'prototype'
          and source_workspace_sha256 is null
          and package_manifest_sha256 is null
          and packaging_profile = 'legacy_expo_wrapper_v1'
        )
        or
        (
          source_build_level = 'production'
          and source_workspace_sha256 is not null
          and source_workspace_sha256 ~ '^[0-9a-f]{64}$'
          and package_manifest_sha256 is not null
          and package_manifest_sha256 ~ '^[0-9a-f]{64}$'
          and packaging_profile = 'orbit_expo_static_wrapper_v1'
        )
      );
  end if;
end
$migration$;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'store_release_jobs'::regclass
      and conname = 'store_release_jobs_distributed_evidence_ck'
  ) then
    alter table store_release_jobs
      add constraint store_release_jobs_distributed_evidence_ck
      check (
        state <> 'distributed'
        or coalesce((
          nullif(btrim(workflow_run_id), '') is not null
          and nullif(btrim(provider_build_id), '') is not null
          and nullif(btrim(provider_submission_id), '') is not null
          and (
            platform = 'ios'
            or (platform = 'android' and nullif(btrim(provider_release_id), '') is not null)
          )
          and completed_at is not null
          and next_poll_at is null
          and last_error_code is null
          and last_error_message is null
          and last_error_retryable is null
          and jsonb_typeof(provider_evidence) = 'object'
          and provider_evidence ->> 'state' = 'distributed'
          and provider_evidence ->> 'workflowRunId' = workflow_run_id
          and provider_evidence ->> 'providerBuildId' = provider_build_id
          and provider_evidence ->> 'providerSubmissionId' = provider_submission_id
          and (provider_evidence ->> 'providerReleaseId') is not distinct from provider_release_id
          and nullif(btrim(provider_evidence ->> 'workflowBuildJobId'), '') is not null
          and nullif(btrim(provider_evidence ->> 'workflowDistributionJobId'), '') is not null
          and provider_evidence #>> '{providerEvidence,workflowStatus}' = 'success'
          and provider_evidence #>> '{providerEvidence,buildStatus}' = 'succeeded'
          and provider_evidence #>> '{providerEvidence,submissionStatus}' = 'succeeded'
        ), false)
      );
  end if;
end
$migration$;

-- A signed runner report is not sufficient if its artifact descriptor names a
-- different Production workspace or package than the durable release row.
-- Keep this separate from the general provider-evidence constraint so a
-- rerun also hardens databases that briefly applied an earlier 0025 draft.
do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'store_release_jobs'::regclass
      and conname = 'store_release_jobs_distributed_artifact_descriptor_ck'
  ) then
    alter table store_release_jobs
      add constraint store_release_jobs_distributed_artifact_descriptor_ck
      check (
        state <> 'distributed'
        or source_build_level <> 'production'
        or coalesce((
          jsonb_typeof(provider_evidence -> 'artifactDescriptor') = 'object'
          and provider_evidence #>> '{artifactDescriptor,sourceBuildLevel}' = source_build_level
          and provider_evidence #>> '{artifactDescriptor,sourcePreviewSha256}'
            = source_artifact_sha256
          and provider_evidence #>> '{artifactDescriptor,sourceWorkspaceSha256}'
            = source_workspace_sha256
          and provider_evidence #>> '{artifactDescriptor,packageManifestSha256}'
            = package_manifest_sha256
          and provider_evidence #>> '{artifactDescriptor,packagingProfile}' = packaging_profile
        ), false)
      );
  end if;
end
$migration$;

comment on column store_release_jobs.source_build_level is
  'Approved source fidelity. Legacy Store rows are explicitly Prototype.';
comment on column store_release_jobs.source_workspace_sha256 is
  'Sealed Production workspace manifest hash; null for legacy Prototype wrappers.';
comment on column store_release_jobs.package_manifest_sha256 is
  'Hash of helix.store-package.json inside a verified Production Store package.';
comment on column store_release_jobs.packaging_profile is
  'Versioned packager contract; Production currently permits only the offline Orbit static wrapper.';
