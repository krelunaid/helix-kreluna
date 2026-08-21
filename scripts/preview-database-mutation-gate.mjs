import { createHash, timingSafeEqual } from "node:crypto";

import { getConnectionString as getNetlifyDatabaseConnectionString } from "@netlify/database";

export const HELIX_NETLIFY_SITE_ID = "89a00a91-8730-40e6-ac92-be473f106a78";
export const HELIX_NETLIFY_SITE_NAME = "helix-kreluna";
export const PREVIEW_DATABASE_MUTATION_DISABLED = "PREVIEW_DATABASE_MUTATION_DISABLED";
export const PREVIEW_DATABASE_MUTATION_FORBIDDEN = "PREVIEW_DATABASE_MUTATION_FORBIDDEN";
export const PREVIEW_DATABASE_ATTESTATION_INVALID = "PREVIEW_DATABASE_ATTESTATION_INVALID";
export const PREVIEW_DATABASE_FORBIDDEN_PG_ENVIRONMENT = Object.freeze([
  "PGAPPNAME",
  "PGCHANNELBINDING",
  "PGCLIENTENCODING",
  "PGCLIENT_ENCODING",
  "PGCONNECT_TIMEOUT",
  "PGDATABASE",
  "PGGSSENCMODE",
  "PGGSSLIB",
  "PGHOST",
  "PGHOSTADDR",
  "PGKRBSRVNAME",
  "PGLOADBALANCEHOSTS",
  "PGOPTIONS",
  "PGPASSFILE",
  "PGPASSWORD",
  "PGPORT",
  "PGREPLICATION",
  "PGREQUIREPEER",
  "PGREQUIRESSL",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGSSLCERT",
  "PGSSLCOMPRESSION",
  "PGSSLCRL",
  "PGSSLCRLDIR",
  "PGSSLKEY",
  "PGSSLMODE",
  "PGSSLNEGOTIATION",
  "PGSSLROOTCERT",
  "PGSSLSNI",
  "PGSYSCONFDIR",
  "PGTARGETSESSIONATTRS",
  "PGUSER",
]);
const DATABASE_TARGET_FINGERPRINT_VERSION = "helix-preview-database-target-v1";
const REQUIRED_DATABASE_QUERY = Object.freeze([
  ["channel_binding", "require"],
  ["sslmode", "require"],
]);

export class PreviewDatabaseMutationGateError extends Error {
  constructor(code) {
    super(code);
    this.name = "PreviewDatabaseMutationGateError";
    this.code = code;
  }
}

function value(environment, name) {
  return environment[name]?.trim() ?? "";
}

function canonicalPostgresTarget(candidate) {
  if (!candidate || candidate !== candidate.trim()) return null;
  try {
    const parsed = new URL(candidate);
    if (
      !["postgres:", "postgresql:"].includes(parsed.protocol) ||
      !parsed.username ||
      !parsed.password ||
      !parsed.hostname ||
      !parsed.pathname ||
      parsed.pathname === "/" ||
      parsed.hash
    ) {
      return null;
    }
    const queryEntries = [...parsed.searchParams.entries()];
    if (
      queryEntries.length !== REQUIRED_DATABASE_QUERY.length ||
      REQUIRED_DATABASE_QUERY.some(
        ([name, expected]) =>
          parsed.searchParams.getAll(name).length !== 1 ||
          parsed.searchParams.get(name) !== expected,
      )
    ) {
      return null;
    }
    // `pg-connection-string` lets arbitrary query keys override URL authority
    // and TLS behavior. A preview therefore accepts only Netlify's observed,
    // non-secret secure pair above. Password stays rotatable in URL userinfo;
    // every accepted connection-affecting field is fingerprinted below.
    return [
      DATABASE_TARGET_FINGERPRINT_VERSION,
      parsed.protocol,
      parsed.username,
      parsed.hostname,
      parsed.port,
      parsed.pathname,
      ...REQUIRED_DATABASE_QUERY.flatMap(([name, expected]) => [name, expected]),
    ].join("\0");
  } catch {
    return null;
  }
}

export function previewDatabaseMutationsEnabled(environment = process.env) {
  const enabled = value(environment, "HELIX_PREVIEW_DB_MUTATIONS_ENABLED");
  if (!enabled || enabled === "false") return false;
  if (enabled !== "true") {
    throw new PreviewDatabaseMutationGateError(PREVIEW_DATABASE_MUTATION_FORBIDDEN);
  }
  return true;
}

function pinnedPreviewIdentity(environment) {
  const reviewId = value(environment, "REVIEW_ID");
  const commitRef = value(environment, "COMMIT_REF");
  const deployId = value(environment, "DEPLOY_ID");
  const expectedReviewId = value(environment, "HELIX_PREVIEW_EXPECTED_REVIEW_ID");
  const expectedCommitRef = value(environment, "HELIX_PREVIEW_EXPECTED_COMMIT_REF");
  const expectedPrimeUrl =
    reviewId && `https://deploy-preview-${reviewId}--${HELIX_NETLIFY_SITE_NAME}.netlify.app`;
  if (
    value(environment, "NETLIFY") !== "true" ||
    value(environment, "CONTEXT") !== "deploy-preview" ||
    value(environment, "PULL_REQUEST") !== "true" ||
    !/^[1-9][0-9]*$/u.test(reviewId) ||
    !/^[0-9a-f]{40}$/u.test(commitRef) ||
    !deployId ||
    value(environment, "SITE_ID") !== HELIX_NETLIFY_SITE_ID ||
    value(environment, "SITE_NAME") !== HELIX_NETLIFY_SITE_NAME ||
    value(environment, "DEPLOY_PRIME_URL") !== expectedPrimeUrl ||
    expectedReviewId !== reviewId ||
    expectedCommitRef !== commitRef ||
    value(environment, "STRIPE_BILLING_ENABLED") !== "false"
  ) {
    throw new PreviewDatabaseMutationGateError(PREVIEW_DATABASE_MUTATION_FORBIDDEN);
  }

  return Object.freeze({ reviewId, commitRef, deployId });
}

function resolvedDatabaseUrl(environment, readNetlifyConnectionString) {
  if (
    Object.entries(environment).some(
      ([name, configured]) =>
        /^PG[A-Z0-9_]*$/u.test(name) &&
        configured !== undefined &&
        configured !== null &&
        String(configured).length > 0,
    )
  ) {
    throw new PreviewDatabaseMutationGateError(PREVIEW_DATABASE_ATTESTATION_INVALID);
  }
  let databaseUrl;
  try {
    databaseUrl = readNetlifyConnectionString();
  } catch {
    throw new PreviewDatabaseMutationGateError(PREVIEW_DATABASE_ATTESTATION_INVALID);
  }
  if (!canonicalPostgresTarget(databaseUrl)) {
    throw new PreviewDatabaseMutationGateError(PREVIEW_DATABASE_ATTESTATION_INVALID);
  }
  for (const name of ["DATABASE_URL", "NETLIFY_DB_URL"]) {
    const configured = environment[name];
    if (configured !== undefined && configured.trim() && configured !== databaseUrl) {
      throw new PreviewDatabaseMutationGateError(PREVIEW_DATABASE_ATTESTATION_INVALID);
    }
  }
  return databaseUrl;
}

function databaseUrlDigest(databaseUrl) {
  const target = canonicalPostgresTarget(databaseUrl);
  if (!target) {
    throw new PreviewDatabaseMutationGateError(PREVIEW_DATABASE_ATTESTATION_INVALID);
  }
  return createHash("sha256").update(target, "utf8").digest();
}

/**
 * Read-only attestation report for the first pinned PR build. It returns only a
 * SHA-256 digest of the canonical database target. The rotatable userinfo
 * password is excluded; the exact accepted TLS/channel-binding query is included.
 * The SDK URL and credentials never leave this module.
 */
export function reportPreviewDatabaseAttestation(
  environment = process.env,
  readNetlifyConnectionString = getNetlifyDatabaseConnectionString,
) {
  if (previewDatabaseMutationsEnabled(environment)) {
    throw new PreviewDatabaseMutationGateError(PREVIEW_DATABASE_MUTATION_FORBIDDEN);
  }
  const identity = pinnedPreviewIdentity(environment);
  const databaseUrl = resolvedDatabaseUrl(environment, readNetlifyConnectionString);
  const databaseAttestationSha256 = databaseUrlDigest(databaseUrl).toString("hex");
  return Object.freeze({ ...identity, databaseAttestationSha256 });
}

/**
 * Attest the exact operator-pinned Netlify PR and SDK-resolved database target.
 * The rotatable password is removed before hashing and never returned or logged.
 */
export function attestPreviewDatabaseMutation(
  environment = process.env,
  readNetlifyConnectionString = getNetlifyDatabaseConnectionString,
) {
  if (!previewDatabaseMutationsEnabled(environment)) {
    throw new PreviewDatabaseMutationGateError(PREVIEW_DATABASE_MUTATION_DISABLED);
  }
  const identity = pinnedPreviewIdentity(environment);
  const expectedDigest = value(environment, "HELIX_PREVIEW_DATABASE_URL_SHA256");
  if (!/^[0-9a-f]{64}$/u.test(expectedDigest)) {
    throw new PreviewDatabaseMutationGateError(PREVIEW_DATABASE_ATTESTATION_INVALID);
  }
  const databaseUrl = resolvedDatabaseUrl(environment, readNetlifyConnectionString);

  const actualDigest = databaseUrlDigest(databaseUrl);
  const expectedDigestBytes = Buffer.from(expectedDigest, "hex");
  if (
    actualDigest.length !== expectedDigestBytes.length ||
    !timingSafeEqual(actualDigest, expectedDigestBytes)
  ) {
    throw new PreviewDatabaseMutationGateError(PREVIEW_DATABASE_ATTESTATION_INVALID);
  }

  return identity;
}
