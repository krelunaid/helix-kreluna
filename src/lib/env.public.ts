import { normalizePublicHostname, publicOriginFromHostname } from "@/lib/env.shared";

const publicHostname = normalizePublicHostname(
  import.meta.env.VITE_PUBLIC_HOSTNAME as string | undefined,
);

export const publicEnv = Object.freeze({
  hostname: publicHostname,
  origin: publicHostname ? publicOriginFromHostname(publicHostname) : "",
  // Auth is opt-in. Local development therefore uses the isolated dev user
  // unless real broker credentials are deliberately configured server-side.
  authEnabled: import.meta.env.VITE_AUTH_ENABLED === "true",
});
