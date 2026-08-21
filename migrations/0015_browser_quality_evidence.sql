create table if not exists build_job_browser_reports (
  job_id text not null references build_jobs (id) on delete cascade,
  report_kind text not null,
  artifact_sha256 text not null,
  evidence_kind text not null,
  status text not null,
  runner text,
  report jsonb not null,
  created_at timestamptz not null default now(),
  primary key (job_id, report_kind, artifact_sha256),
  check (report_kind in ('twin_browser', 'echo_accessibility', 'swift_performance')),
  check (evidence_kind in ('measured', 'not_run')),
  check (status in ('completed', 'failed', 'not_run')),
  check (
    (status = 'not_run' and evidence_kind = 'not_run' and runner is null)
    or
    (status in ('completed', 'failed') and evidence_kind = 'measured' and runner is not null)
  ),
  check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  check (jsonb_typeof(report) = 'object'),
  check (report ->> 'artifactSha256' = artifact_sha256),
  check (report ->> 'kind' = report_kind),
  check (report ->> 'evidence' = evidence_kind),
  check (report ->> 'status' = status)
);

create index if not exists build_job_browser_reports_artifact_idx
  on build_job_browser_reports (job_id, artifact_sha256, report_kind, status);

-- Quality evidence is immutable through the application role. A separately
-- audited retention transaction may explicitly opt into DELETE with SET LOCAL
-- helix.quality_evidence_retention = 'on'; UPDATE is never permitted.
create or replace function reject_quality_evidence_mutation()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'DELETE'
    and current_setting('helix.quality_evidence_retention', true) = 'on'
  then
    return old;
  end if;
  raise exception using
    errcode = '55000',
    message = 'QUALITY_EVIDENCE_IMMUTABLE',
    detail = 'Quality evidence can only be appended.';
end
$function$;

drop trigger if exists build_job_quality_reports_immutable
  on build_job_quality_reports;
create trigger build_job_quality_reports_immutable
before update or delete on build_job_quality_reports
for each row execute function reject_quality_evidence_mutation();

drop trigger if exists build_job_browser_reports_immutable
  on build_job_browser_reports;
create trigger build_job_browser_reports_immutable
before update or delete on build_job_browser_reports
for each row execute function reject_quality_evidence_mutation();

comment on table build_job_quality_reports is
  'Immutable measured static security evidence bound to an exact build artifact.';
comment on table build_job_browser_reports is
  'Immutable measured or explicit not-run browser evidence bound to an exact build artifact.';
