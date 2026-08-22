import { createServerFn } from "@tanstack/react-start";
import { mapHomeSessionUser } from "@/lib/home-surface";
import { DEV_USER, type AppUser } from "./use-current-user";

/**
 * Cookie-backed identity for the home document. Used by the `/` loader so the
 * first HTML for a signed-in visitor is the authenticated shell, not sign-in.
 * Never throws: a session miss renders compact Accedi chrome.
 */
export const getHomeSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<AppUser | null> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { auth, authConfigured } = await import("./server");
    const { serverEnv } = await import("../env.server");

    if (!serverEnv.authEnabled) return DEV_USER;
    if (!authConfigured) return null;

    const request = getRequest();
    if (!request) return null;

    try {
      const session = await auth.api.getSession({ headers: request.headers });
      return mapHomeSessionUser(session?.user ?? null);
    } catch {
      return null;
    }
  },
);
