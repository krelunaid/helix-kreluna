import { createMiddleware } from "@tanstack/react-start";
import type { Sql } from "@/lib/db";
import {
  AdminNotFoundError,
  assertAdminSessionId,
  resolveAdminBinding,
  type AdminBinding,
} from "./access";

/**
 * The database row is the second half of the binding: the configured immutable
 * id must still belong to the configured, verified Better Auth email address.
 */
export async function assertDatabaseAdminBinding(sql: Sql, binding: AdminBinding): Promise<void> {
  const rows = await sql.query<{ id: string }>(
    `select "id"
       from "user"
      where "id" = $1
        and lower("email") = $2
        and "emailVerified" = true
      limit 1`,
    [binding.userId, binding.email],
  );
  if (rows.length !== 1 || rows[0]?.id !== binding.userId) {
    throw new AdminNotFoundError();
  }
}

/**
 * Better Auth + immutable server configuration + verified database identity.
 * The client hook only forwards the existing preview bearer token; Production
 * continues to use the same-origin Better Auth cookie.
 */
export const adminAuthMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { getBearerToken } = await import("@/lib/auth/client");
    return next({ sendContext: { bearerToken: getBearerToken() ?? undefined } });
  })
  .server(async ({ next, context }) => {
    try {
      const [{ assertSameSiteRequest }, { getSessionUser }, { getSql }, { serverEnv }] =
        await Promise.all([
          import("@/lib/auth/isolation.server"),
          import("@/lib/auth/verify.server"),
          import("@/lib/db"),
          import("@/lib/env.server"),
        ]);
      assertSameSiteRequest();
      const binding = resolveAdminBinding(serverEnv);
      const user = await getSessionUser(context.bearerToken);
      assertAdminSessionId(user?.id, binding);
      const sql = await getSql();
      await assertDatabaseAdminBinding(sql, binding);
      return await next({ context: { adminUserId: binding.userId, sql } });
    } catch (error) {
      if (error instanceof AdminNotFoundError) throw error;
      throw new AdminNotFoundError();
    }
  });
