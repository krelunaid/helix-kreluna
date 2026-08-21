export interface OwnershipQueryable {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
}

export class DeployOwnershipError extends Error {
  readonly code = "DEPLOY_FORBIDDEN";
  readonly status = 403;

  constructor() {
    super("Forbidden: project is not owned by this user");
    this.name = "DeployOwnershipError";
  }
}

/** Verify project ownership inside the same server operation that publishes it. */
export async function assertDeployProjectOwnership(
  sql: OwnershipQueryable,
  projectId: string,
  userId: string,
): Promise<void> {
  if (!projectId.trim() || !userId.trim()) throw new DeployOwnershipError();
  const rows = await sql.query<{ owned: number }>(
    `select 1 as owned
     from projects
     where id = $1 and user_id = $2
     limit 1`,
    [projectId, userId],
  );
  if (!rows[0]) throw new DeployOwnershipError();
}
