create table if not exists build_job_quality_reports (
  job_id text not null references build_jobs (id) on delete cascade,
  report_kind text not null,
  artifact_sha256 text not null,
  evidence_kind text not null,
  scanner text not null,
  scanner_version text not null,
  passed boolean not null,
  blocker_count integer not null,
  report jsonb not null,
  created_at timestamptz not null default now(),
  primary key (job_id, report_kind, artifact_sha256),
  check (report_kind in ('aegis_static_security')),
  check (evidence_kind in ('measured')),
  check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  check (blocker_count >= 0),
  check (jsonb_typeof(report) = 'object'),
  check (report ->> 'artifactSha256' = artifact_sha256),
  check (report ->> 'kind' = report_kind),
  check (report ->> 'evidence' = evidence_kind),
  check ((report ->> 'passed')::boolean = passed),
  check ((report ->> 'blockerCount')::integer = blocker_count),
  check (not passed or blocker_count = 0)
);

create index if not exists build_job_quality_reports_release_idx
  on build_job_quality_reports (job_id, artifact_sha256, report_kind)
  where passed and blocker_count = 0;

comment on table build_job_quality_reports is
  'Append-only measured quality evidence bound to an exact build artifact.';
