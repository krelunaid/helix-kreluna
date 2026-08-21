import type { BuildJob, PublicBuildJob } from "@/lib/agent-types";

export const GUEST_BUILD_ACCESS_TTL_MS = 2 * 60 * 60 * 1000;
const GUEST_TOKEN_BYTES = 32;
const SHA_256_HEX_LENGTH = 64;

export class BuildJobForbiddenError extends Error {
  readonly status = 403;

  constructor() {
    super("Forbidden");
    this.name = "BuildJobForbiddenError";
  }
}

export type GuestBuildCredential = {
  token: string;
  tokenHash: string;
  expiresAt: number;
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashGuestBuildToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return bytesToHex(new Uint8Array(digest));
}

export async function createGuestBuildCredential(
  now = Date.now(),
): Promise<GuestBuildCredential> {
  const random = crypto.getRandomValues(new Uint8Array(GUEST_TOKEN_BYTES));
  const token = bytesToHex(random);
  return {
    token,
    tokenHash: await hashGuestBuildToken(token),
    expiresAt: now + GUEST_BUILD_ACCESS_TTL_MS,
  };
}

/**
 * Stable per-request capability for an idempotent guest modification. The
 * source capability remains scoped to its original job; the derived raw token
 * is different and only its SHA-256 hash is persisted on the child job.
 */
export async function deriveGuestBuildCredential(
  sourceToken: string,
  requestId: string,
  now = Date.now(),
): Promise<GuestBuildCredential> {
  if (
    !/^[a-f0-9]{64}$/i.test(sourceToken) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestId,
    )
  ) {
    throw new BuildJobForbiddenError();
  }
  const token = await hashGuestBuildToken(
    `helix-guest-iteration-v1\u0000${sourceToken.toLowerCase()}\u0000${requestId.toLowerCase()}`,
  );
  return {
    token,
    tokenHash: await hashGuestBuildToken(token),
    expiresAt: now + GUEST_BUILD_ACCESS_TTL_MS,
  };
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (
    left.length !== SHA_256_HEX_LENGTH ||
    right.length !== SHA_256_HEX_LENGTH
  ) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < SHA_256_HEX_LENGTH; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function assertOwnedBuildJob(
  callerUserId: string,
  jobUserId: string | null | undefined,
  projectUserId?: string | null,
): void {
  if (
    !jobUserId ||
    jobUserId !== callerUserId ||
    (projectUserId !== undefined && projectUserId !== callerUserId)
  ) {
    throw new BuildJobForbiddenError();
  }
}

export async function guestTokenAuthorizesJob({
  presentedToken,
  storedTokenHash,
  expiresAt,
  now = Date.now(),
}: {
  presentedToken: string;
  storedTokenHash: string | null | undefined;
  expiresAt: number | null | undefined;
  now?: number;
}): Promise<boolean> {
  if (
    !storedTokenHash ||
    !expiresAt ||
    expiresAt <= now ||
    !/^[a-f0-9]{64}$/i.test(presentedToken)
  ) {
    return false;
  }
  const presentedHash = await hashGuestBuildToken(presentedToken);
  return constantTimeHexEqual(presentedHash, storedTokenHash);
}

export async function assertGuestBuildAccess(input: {
  presentedToken: string;
  storedTokenHash: string | null | undefined;
  expiresAt: number | null | undefined;
  now?: number;
}): Promise<void> {
  if (!(await guestTokenAuthorizesJob(input))) {
    throw new BuildJobForbiddenError();
  }
}

export function toPublicBuildJob(job: BuildJob): PublicBuildJob {
  const {
    currentHtml: _currentHtml,
    projectId: _projectId,
    userId: _userId,
    guestAccessTokenHash: _guestAccessTokenHash,
    guestAccessExpiresAt: _guestAccessExpiresAt,
    guestBudgetLease: _guestBudgetLease,
    requestFingerprint: _requestFingerprint,
    checkpoint: _checkpoint,
    runtime: _runtime,
    files: _files,
    stores,
    ...safe
  } = job;
  return {
    ...safe,
    ...(stores
      ? {
          stores: {
            appStore: stores.appStore,
            play: stores.play,
            testersUrl: stores.testersUrl,
          },
        }
      : {}),
  };
}
