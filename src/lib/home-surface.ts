import type { AppUser } from "@/lib/auth/use-current-user";

/** Personalized `/` must never be stored in a shared CDN/HTML cache. */
export const HOME_DOCUMENT_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
} as const;

type SessionLikeUser = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

/** Map a Better Auth session user onto the client `AppUser` shape. */
export function mapHomeSessionUser(user: SessionLikeUser | null | undefined): AppUser | null {
  if (!user?.id) return null;
  return {
    id: user.id,
    displayName: user.name ?? null,
    primaryEmail: user.email ?? null,
    profileImageUrl: user.image ?? null,
    isDevFallback: false,
  };
}

/**
 * First-paint identity for `/`.
 *
 * The cookie-backed loader is the SSR source of truth. The client session is
 * preferred once it exists so a later sign-out still wins. Do not branch on
 * `isPending` here: that flag differs between server and client and would
 * hydrate the guest landing over an authenticated document (or the reverse).
 */
export function resolveHomeUser(
  clientUser: AppUser | null,
  loaderUser: AppUser | null,
): AppUser | null {
  return clientUser ?? loaderUser;
}

export function resolveHomeSurface(
  clientUser: AppUser | null,
  loaderUser: AppUser | null,
): "authenticated" | "guest" {
  return resolveHomeUser(clientUser, loaderUser) ? "authenticated" : "guest";
}
