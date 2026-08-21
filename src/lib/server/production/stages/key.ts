import { KeyArtifactSchema } from "@/lib/production-artifact-graph";
import type { ProductionStageGeneratorInput } from "@/lib/server/production/types";
import {
  artifactBase,
  generatedFile,
  javascriptValue,
  makeStageDelivery,
  parseStageInput,
  uniqueSorted,
} from "@/lib/server/production/stages/shared";

export function generateKeyDelivery(input: ProductionStageGeneratorInput) {
  const requirements = parseStageInput("key", input);
  const roles = uniqueSorted(requirements.roles.length > 0 ? requirements.roles : ["user"]);
  const protectedRoutes = uniqueSorted([
    ...requirements.apiOperations
      .filter((operation) => ["authenticated", "roles"].includes(operation.access.kind))
      .map((operation) => operation.path),
    ...(requirements.apiOperations.some((operation) =>
      ["authenticated", "roles"].includes(operation.access.kind),
    )
      ? []
      : ["/api/session"]),
  ]);
  const outputPaths = [
    "server/auth/authorization.js",
    "server/auth/recovery.js",
    "server/auth/session.js",
  ];
  const testPath = "tests/key/auth-contract.test.mjs";
  const sessionSource = `const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

/** @param {Uint8Array} bytes */
function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\\+/gu, "-").replace(/\\//gu, "_").replace(/=+$/gu, "");
}

/** @param {string} value */
function base64UrlToBytes(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) {
    throw new Error("INVALID_BASE64URL");
  }
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  if (bytesToBase64Url(bytes) !== value) throw new Error("NON_CANONICAL_BASE64URL");
  return bytes;
}

/** @param {unknown} value */
function parseSession(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const subject = Reflect.get(value, "subject");
  const roles = Reflect.get(value, "roles");
  const expiresAt = Reflect.get(value, "expiresAt");
  if (
    typeof subject !== "string" || !subject ||
    !Array.isArray(roles) || !roles.every((role) => typeof role === "string" && role.length > 0) ||
    typeof expiresAt !== "number" || !Number.isFinite(expiresAt)
  ) return null;
  const validatedRoles = /** @type {string[]} */ (roles);
  return Object.freeze({ subject, roles: Object.freeze([...validatedRoles]), expiresAt });
}

/** @param {string} secret */
export async function createSignedSessionCodec(secret) {
  if (typeof secret !== "string" || encoder.encode(secret).byteLength < 32) {
    throw new Error("Session signing secret must be at least 32 bytes");
  }
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return Object.freeze({
    /** @param {{ subject: string, roles: string[], expiresAt: number }} session */
    async encode(session) {
      const validated = parseSession(session);
      if (!validated || validated.expiresAt <= Date.now()) throw new Error("INVALID_SESSION");
      const payload = bytesToBase64Url(encoder.encode(JSON.stringify(validated)));
      const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
      return payload + "." + bytesToBase64Url(new Uint8Array(signature));
    },
    /** @param {unknown} value */
    async decode(value) {
      try {
        if (typeof value !== "string") return null;
        const segments = value.split(".");
        if (segments.length !== 2 || !segments[0] || !segments[1]) return null;
        const [payload, signature] = segments;
        const signatureBytes = base64UrlToBytes(signature);
        const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(payload));
        if (!valid) return null;
        const session = parseSession(JSON.parse(decoder.decode(base64UrlToBytes(payload))));
        if (!session || session.expiresAt <= Date.now()) return null;
        return session;
      } catch {
        return null;
      }
    },
  });
}

export function clearSessionCookie() {
  return "helix_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}
`;
  const authorizationSource = `export const approvedRoles = Object.freeze(${javascriptValue(roles)});

/** @param {{ subject: string, roles: readonly string[] } | null} session @param {readonly string[]} permittedRoles */
export function requireAuthorization(session, permittedRoles = []) {
  if (!session || typeof session.subject !== "string" || !Array.isArray(session.roles)) {
    throw new Error("AUTHENTICATION_REQUIRED");
  }
  const unknown = session.roles.filter((role) => !approvedRoles.includes(role));
  if (unknown.length > 0) throw new Error("UNKNOWN_SESSION_ROLE");
  if (permittedRoles.some((role) => !approvedRoles.includes(role))) {
    throw new Error("UNKNOWN_PERMISSION_ROLE");
  }
  if (permittedRoles.length > 0 && !permittedRoles.some((role) => session.roles.includes(role))) {
    throw new Error("AUTHORIZATION_REQUIRED");
  }
  return session;
}
`;
  const recoverySource = `const encoder = new TextEncoder();

/** @param {Uint8Array} bytes */
function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\\+/gu, "-").replace(/\\//gu, "_").replace(/=+$/gu, "");
}

/** @param {string} token */
async function digestToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Creates and consumes one-time recovery requests without exposing raw tokens to persistence callers.
 * @param {{ saveDigest(record: { address: string, digest: string, expiresAt: number }): Promise<void>, consumeDigest(input: { digest: string, now: number }): Promise<unknown>, deleteDigest(digest: string): Promise<void> }} store
 * @param {{ deliver(address: string, token: string): Promise<void> }} messenger
 * @param {{ now?(): number, ttlMs?: number }} [options]
 */
export function createRecoveryService(store, messenger, options = {}) {
  if (
    !store || typeof store.saveDigest !== "function" ||
    typeof store.consumeDigest !== "function" || typeof store.deleteDigest !== "function"
  ) throw new TypeError("Recovery persistence port is required");
  if (!messenger || typeof messenger.deliver !== "function") throw new TypeError("Recovery delivery port is required");
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 15 * 60 * 1000;
  if (typeof now !== "function" || !Number.isInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 86_400_000) {
    throw new TypeError("Invalid recovery lifetime");
  }
  return Object.freeze({
    /** @param {string} address */
    async request(address) {
      if (typeof address !== "string" || !address.trim()) throw new Error("INVALID_RECOVERY_REQUEST");
      const random = crypto.getRandomValues(new Uint8Array(32));
      const token = bytesToBase64Url(random);
      const digest = await digestToken(token);
      const expiresAt = now() + ttlMs;
      await store.saveDigest(Object.freeze({ address: address.trim(), digest, expiresAt }));
      try {
        await messenger.deliver(address.trim(), token);
      } catch (error) {
        await store.deleteDigest(digest);
        throw error;
      }
      return Object.freeze({ expiresAt });
    },
    /** @param {unknown} token */
    async consume(token) {
      if (typeof token !== "string" || !token) return null;
      const digest = await digestToken(token);
      return (await store.consumeDigest(Object.freeze({ digest, now: now() }))) ?? null;
    },
  });
}
`;
  const artifact = KeyArtifactSchema.parse({
    ...artifactBase(
      "key_auth_artifact",
      "docs/artifacts/key.json",
      outputPaths,
      [testPath],
      "Signed-session, authorization, logout-cookie, and recovery primitives are available as non-mock libraries. No identity issuer, lifecycle route, recovery store, messenger, or provider is reported as configured.",
    ),
    provider: "custom_adapter",
    mock: false,
    sessionStrategy: "signed_cookie",
    requiredEnv: ["SESSION_SIGNING_SECRET"],
    sourcePaths: outputPaths,
    roles,
    permissions: roles.map((role) => ({ role, actions: ["access_account"] })),
    protectedRoutes,
    logoutImplemented: false,
    recovery: { status: "available_library", sourcePath: "server/auth/recovery.js" },
  });
  const test = `import assert from "node:assert/strict";
import test from "node:test";
import { requireAuthorization } from "../../server/auth/authorization.js";
import { createRecoveryService } from "../../server/auth/recovery.js";
import { clearSessionCookie, createSignedSessionCodec } from "../../server/auth/session.js";

test("Key signs sessions, fails closed, and persists only recovery digests", async () => {
  const codec = await createSignedSessionCodec("0123456789abcdef0123456789abcdef");
  const encoded = await codec.encode({ subject: "user-1", roles: [${JSON.stringify(
    roles[0],
  )}], expiresAt: Date.now() + 60_000 });
  const session = await codec.decode(encoded);
  if (!session) throw new Error("Expected a valid session");
  assert.equal(session.subject, "user-1");
  assert.equal(requireAuthorization(session, [${JSON.stringify(roles[0])}]).subject, "user-1");
  assert.equal(await codec.decode(encoded + "tampered"), null);
  assert.equal(await codec.decode("%%%.$$$"), null);
  assert.equal(await codec.decode(null), null);
  assert.match(clearSessionCookie(), /HttpOnly; Secure/u);

  /** @type {{ address: string, digest: string, expiresAt: number } | undefined} */
  let saved;
  /** @type {{ address: string, token: string } | undefined} */
  let delivered;
  const service = createRecoveryService(
    {
      async saveDigest(record) { saved = record; },
      async consumeDigest(input) { return input.digest === saved?.digest ? { accountId: "user-1" } : null; },
      async deleteDigest() {},
    },
    { async deliver(address, token) { delivered = { address, token }; } },
    { now: () => 1_000, ttlMs: 60_000 },
  );
  assert.deepEqual(await service.request("user@example.com"), { expiresAt: 61_000 });
  if (!saved || !delivered) throw new Error("Recovery ports were not called");
  assert.equal(saved.address, "user@example.com");
  assert.notEqual(saved.digest, delivered.token);
  const expectedDigest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(delivered.token))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  assert.equal(saved.digest, expectedDigest);
  assert.deepEqual(await service.consume(delivered.token), { accountId: "user-1" });
});
`;
  return makeStageDelivery(
    "key",
    input,
    artifact,
    [
      generatedFile("server/auth/authorization.js", authorizationSource),
      generatedFile("server/auth/recovery.js", recoverySource),
      generatedFile("server/auth/session.js", sessionSource),
    ],
    [generatedFile(testPath, test)],
  );
}
