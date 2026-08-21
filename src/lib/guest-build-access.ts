type StoredGuestBuildAccess = {
  token: string;
  expiresAt: number;
};

const KEY_PREFIX = "kreluna.guest.build-access.";

function accessKey(jobId: string): string {
  return `${KEY_PREFIX}${jobId}`;
}

export function saveGuestBuildAccess(
  jobId: string,
  token: string,
  expiresAt: number,
): void {
  if (typeof window === "undefined") return;
  try {
    const value: StoredGuestBuildAccess = { token, expiresAt };
    window.sessionStorage.setItem(accessKey(jobId), JSON.stringify(value));
  } catch {
    // A disabled browser storage surface makes the guest job intentionally
    // unavailable after navigation; the access token is never weakened or
    // moved to a URL/localStorage fallback.
  }
}

export function loadGuestBuildAccess(jobId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const key = accessKey(jobId);
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredGuestBuildAccess>;
    if (
      typeof value.token !== "string" ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= Date.now()
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return value.token;
  } catch {
    return null;
  }
}
