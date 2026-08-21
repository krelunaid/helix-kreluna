import { getSql, type Sql } from "@/lib/db";

const DEFAULT_BATCH_SIZE = 250;
const MAX_BATCH_SIZE = 500;

export type GuestPublicationCleanupResult = {
  deletedApps: number;
  deletedDeploys: number;
  hasMore: boolean;
};

function boundedBatchSize(value: number | undefined): number {
  if (value === undefined) return DEFAULT_BATCH_SIZE;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_BATCH_SIZE) {
    throw new RangeError(`Guest publication cleanup batch must be 1-${MAX_BATCH_SIZE}`);
  }
  return value;
}

/**
 * Deletes one bounded batch of expired guest publications and their anonymous
 * deploy audit rows in one database statement. Public/user-owned releases are
 * never selected. `skip locked` lets request-time and scheduled cleanup coexist
 * without waiting on the same rows.
 */
export async function deleteExpiredGuestPublicationBatch(
  sql: Pick<Sql, "query">,
  requestedBatchSize?: number,
): Promise<GuestPublicationCleanupResult> {
  const batchSize = boundedBatchSize(requestedBatchSize);
  const rows = await sql.query<{
    deleted_apps: number;
    deleted_deploys: number;
  }>(
    `with expired as materialized (
       select slug
       from public_apps
       where visibility = 'guest'
         and expires_at <= now()
       order by expires_at asc, slug asc
       limit $1
       for update skip locked
     ), deleted_deploys as (
       delete from deploys
       where user_id is null
         and slug in (select slug from expired)
       returning id
     ), deleted_apps as (
       delete from public_apps
       where visibility = 'guest'
         and expires_at <= now()
         and slug in (select slug from expired)
       returning slug
     )
     select
       (select count(*)::int from deleted_apps) as deleted_apps,
       (select count(*)::int from deleted_deploys) as deleted_deploys`,
    [batchSize],
  );
  const deletedApps = Number(rows[0]?.deleted_apps ?? 0);
  const deletedDeploys = Number(rows[0]?.deleted_deploys ?? 0);
  return {
    deletedApps,
    deletedDeploys,
    hasMore: deletedApps === batchSize,
  };
}

export async function deleteExpiredGuestPublications(
  batchSize?: number,
): Promise<GuestPublicationCleanupResult> {
  const sql = await getSql();
  return deleteExpiredGuestPublicationBatch(sql, batchSize);
}
