const HOST_WITHOUT_SCHEME =
  /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?::\d{1,5})?$/i;

export function normalizePublicHostname(value: string | undefined): string {
  const hostname = value?.trim() ?? "";
  if (!hostname) return "";
  if (!HOST_WITHOUT_SCHEME.test(hostname)) {
    throw new Error(
      "Invalid environment variable: VITE_PUBLIC_HOSTNAME must be host[:port] without a scheme or path",
    );
  }
  return hostname.toLowerCase();
}

export function publicOriginFromHostname(hostname: string): string {
  const normalized = normalizePublicHostname(hostname);
  if (!normalized) return "";
  const local =
    normalized === "localhost" ||
    normalized.startsWith("localhost:") ||
    normalized === "127.0.0.1" ||
    normalized.startsWith("127.0.0.1:") ||
    normalized === "[::1]" ||
    normalized.startsWith("[::1]:");
  return `${local ? "http" : "https"}://${normalized}`;
}
