export const GUEST_PUBLISH_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_GUEST_PUBLISH_HTML_BYTES = 512 * 1024;
export const MAX_GUEST_PUBLISH_TITLE_CHARS = 80;

export class GuestPublishInputError extends Error {
  readonly code = "INVALID_GUEST_PUBLISH";
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "GuestPublishInputError";
  }
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function normalizeGuestPublishInput(input: unknown): {
  title: string;
  html: string;
  htmlBytes: number;
} {
  if (!input || typeof input !== "object") {
    throw new GuestPublishInputError("Invalid guest publish request");
  }
  const value = input as { title?: unknown; html?: unknown };
  if (typeof value.html !== "string" || !value.html.trim()) {
    throw new GuestPublishInputError("Nothing to publish");
  }
  const htmlBytes = utf8ByteLength(value.html);
  if (htmlBytes > MAX_GUEST_PUBLISH_HTML_BYTES) {
    throw new GuestPublishInputError(
      `Guest HTML exceeds ${MAX_GUEST_PUBLISH_HTML_BYTES} bytes`,
    );
  }
  const rawTitle = typeof value.title === "string" ? value.title.trim() : "";
  return {
    title: rawTitle.slice(0, MAX_GUEST_PUBLISH_TITLE_CHARS) || "App",
    html: value.html,
    htmlBytes,
  };
}

export function createOpaqueToken(bytes = 32): string {
  if (!Number.isSafeInteger(bytes) || bytes < 16 || bytes > 64) {
    throw new Error("Opaque tokens must contain between 16 and 64 random bytes");
  }
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isOpaqueGuestToken(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export async function hashOpaqueToken(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
