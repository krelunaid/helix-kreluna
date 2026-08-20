/**
 * Non-secret defaults for local/live-preview auth routing.
 *
 * OAuth client credentials are never bundled in this repository. A preview
 * that needs real broker sign-in must receive GROK_AUTH_CLIENT_ID and
 * GROK_AUTH_CLIENT_SECRET through the runtime environment. Without them auth is
 * explicitly unavailable and local development uses the isolated dev user.
 */

/** The shared auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/**
 * Host patterns whose callbacks the preview client accepts. Better Auth derives
 * the live preview's real origin from the request host and validates it against
 * this list (wildcard-matched), so the OAuth `redirect_uri` becomes the concrete
 * `https://<preview-host>/api/auth/oauth2/callback/...` the broker allows.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
