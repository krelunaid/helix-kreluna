import { getRequest } from "@tanstack/react-start/server";
import { dbSource } from "../db";
import {
  assertPreviewPasswordRequestOrigin,
  PreviewPasswordRequestOriginError,
  type PreviewPasswordRequestPolicy,
} from "./preview-origin.server";
import { auth, authConfigured } from "./server";

/**
 * Server-side session resolution (server-only).
 *
 * Because this app runs its OWN Better Auth at same-origin `/api/auth/*`, the
 * session cookie is sent with every request to this app — server functions AND
 * SSR loaders included. So we resolve the user straight from the request cookies
 * via `auth.api.getSession` (no client-minted JWT needed). Never trust a
 * client-supplied user id — only the result of this verification.
 */

/** True when a real database is configured server-side. */
const databaseConfigured = dbSource !== "pglite";

/** Re-export so callers can branch on it without importing `server.ts`. */
export { authConfigured };

if (databaseConfigured && !authConfigured) {
  console.error(
    "[auth] A durable database is configured but auth is disabled (VITE_AUTH_ENABLED=false) " +
      "— requireUserId() will reject every request (fail closed) rather than " +
      "share one dev user on a real database.",
  );
}

/** Dev fallback user id, used only when auth is disabled (VITE_AUTH_ENABLED=false). */
export const DEV_USER_ID = "dev-user";

/**
 * Thrown by `requireUserId` when the caller has no valid session. Carries
 * `status: 401`; the message is a stable contract — match
 * `err.message === "Unauthorized"` client-side to send the visitor to sign-in.
 */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = { id: string; email: string | null };

type SessionEnvelope = {
  user?: { id: string; email?: string | null } | null;
} | null;

export type SessionReader = (headers: Headers) => Promise<SessionEnvelope>;

export type SessionRequestOptions = Readonly<{
  bearerToken?: string;
  readSession?: SessionReader;
  previewPolicy?: PreviewPasswordRequestPolicy;
}>;

const readBetterAuthSession: SessionReader = async (headers) => auth.api.getSession({ headers });

/**
 * Request-explicit session resolver used by both server functions and tests.
 * The preview origin check intentionally runs before bearer-token handling and
 * before Better Auth can consult a cookie/session.
 */
export async function getSessionUserFromRequest(
  request: Request,
  options: SessionRequestOptions = {},
): Promise<VerifiedUser | null> {
  try {
    assertPreviewPasswordRequestOrigin(request, options.previewPolicy);
  } catch (error) {
    if (error instanceof PreviewPasswordRequestOriginError) return null;
    throw error;
  }

  let headers = request.headers;
  if (options.bearerToken) {
    headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${options.bearerToken}`);
  }
  const session = await (options.readSession ?? readBetterAuthSession)(headers);
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email ?? null };
}

/** Request-explicit counterpart used to prove the requireUserId fail-closed path. */
export async function requireUserIdFromRequest(
  request: Request,
  options: SessionRequestOptions = {},
): Promise<string> {
  const user = await getSessionUserFromRequest(request, options);
  if (!user) throw new UnauthorizedError();
  return user.id;
}

/**
 * Resolve the signed-in user from the current request, or `null` when auth isn't
 * configured / nobody is signed in. Safe to call from server functions and SSR
 * loaders.
 *
 * `bearerToken` is for the LIVE PREVIEW: the app runs in a partitioned iframe
 * whose cookies don't reach the server, so `authMiddleware` forwards the session
 * as a bearer token, which we present as `Authorization: Bearer …` (the `bearer`
 * plugin resolves it). When deployed no token is passed and the cookie is used.
 */
export async function getSessionUser(bearerToken?: string): Promise<VerifiedUser | null> {
  if (!authConfigured) return null;
  const request = getRequest();
  if (!request) return null;
  return getSessionUserFromRequest(request, { bearerToken });
}

/**
 * Resolve the current user id for a server function, or throw when unauthorized.
 * Prefer `authMiddleware` (`./middleware`), which calls this for you.
 * - Auth enabled explicitly -> the verified session user id; throws
 *   `UnauthorizedError` when signed out. A sandbox preview needs injected
 *   GROK_AUTH_* credentials for real sign-in.
 * - Auth disabled (`VITE_AUTH_ENABLED=false`) + durable database -> throw (fail
 *   closed): one shared dev user on a real database would let every visitor
 *   read/write everyone's rows.
 * - Auth disabled + no database -> the shared dev user id.
 */
export async function requireUserId(bearerToken?: string): Promise<string> {
  if (!authConfigured) {
    if (databaseConfigured) {
      throw new Error(
        "Auth is disabled (VITE_AUTH_ENABLED=false) but a durable database is configured — " +
          "refusing to fall back to the shared dev user against a real database.",
      );
    }
    return DEV_USER_ID;
  }
  const request = getRequest();
  if (!request) throw new UnauthorizedError();
  return requireUserIdFromRequest(request, { bearerToken });
}
