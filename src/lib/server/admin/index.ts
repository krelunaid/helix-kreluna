import { createServerFn } from "@tanstack/react-start";
import { dbSource } from "@/lib/db";
import { serverEnv } from "@/lib/env.server";
import { httpErrorStatusMiddleware } from "@/lib/server/http-error-status";
import { adminAuthMiddleware } from "./middleware";
import { readAdminOverview } from "./overview";

async function markAdminResponsePrivate(): Promise<void> {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "private, no-store, max-age=0");
  setResponseHeader("Referrer-Policy", "no-referrer");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
}

/** Read-only aggregate console. No individual records or secret values leave the server. */
export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([httpErrorStatusMiddleware, adminAuthMiddleware])
  .handler(async ({ context }) => {
    await markAdminResponsePrivate();
    return readAdminOverview(context.sql, {
      dbSource,
      stripeBillingEnabled: serverEnv.stripeBillingEnabled,
      stripeMode: serverEnv.STRIPE_MODE ?? null,
      aiGatewayEnabled: serverEnv.aiGatewayEnabled,
      googleAuthEnabled: serverEnv.googleAuthEnabled,
    });
  });
