const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", owned.buffer);
  return bytesToHex(new Uint8Array(digest));
}

export async function sha256Utf8Hex(value: string): Promise<string> {
  return sha256BytesHex(new TextEncoder().encode(value));
}

export class PublishedArtifactIntegrityError extends Error {
  readonly code = "PUBLISHED_ARTIFACT_INTEGRITY_FAILED";
  readonly status = 500;

  constructor() {
    super("PUBLISHED_ARTIFACT_INTEGRITY_FAILED");
    this.name = "PublishedArtifactIntegrityError";
  }
}

export async function assertPublishedBytes(input: {
  bytes: Uint8Array;
  expectedSha256: string | null | undefined;
}): Promise<string> {
  if (!input.expectedSha256 || !SHA256_HEX_PATTERN.test(input.expectedSha256)) {
    throw new PublishedArtifactIntegrityError();
  }
  const digest = await sha256BytesHex(input.bytes);
  if (digest !== input.expectedSha256) {
    throw new PublishedArtifactIntegrityError();
  }
  return digest;
}

export async function assertPublishedUtf8(input: {
  value: string;
  expectedSha256: string | null | undefined;
}): Promise<string> {
  return assertPublishedBytes({
    bytes: new TextEncoder().encode(input.value),
    expectedSha256: input.expectedSha256,
  });
}
