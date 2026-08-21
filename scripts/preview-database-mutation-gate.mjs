import { createHash, timingSafeEqual } from "node:crypto";

import { getConnectionString as getNetlifyDatabaseConnectionString } from "@netlify/database";

export const HELIX_NETLIFY_SITE_ID = "89a00a91-8730-40e6-ac92-be473f106a78";
export const HELIX_NETLIFY_SITE_NAME = "helix-kreluna";
export const PREVIEW_DATABASE_MUTATION_DISABLED = "PREVIEW_DATABASE_MUTATION_DISABLED";
export const PREVIEW_DATABASE_MUTATION_FORBIDDEN = "PREVIEW_DATABASE_MUTATION_FORBIDDEN";
export const PREVIEW_DATABASE_ATTESTATION_INVALID = "PREVIEW_DATABASE_ATTESTATION_INVALID";

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

function validPostgresUrl(candidate) {
  if (!candidate || candidate !== candidate.trim()) return false;
  try {
    return ["postgres:", "postgresql:"].includes(new URL(candidate).protocol);
  } catch {
    return false;
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
  let databaseUrl;
  try {
    databaseUrl = readNetlifyConnectionString();
  } catch {
    throw new PreviewDatabaseMutationGateError(PREVIEW_DATABASE_ATTESTATION_INVALID);
  }
  if (!validPostgresUrl(databaseUrl)) {
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
  return createHash("sha256").update(databaseUrl, "utf8").digest();
}

/**
 * Read-only attestation report for the first pinned PR build. It returns only a
 * SHA-256 digest; the SDK URL and credentials never leave this module.
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
 * Attest the exact operator-pinned Netlify PR and SDK-resolved database URL.
 * The URL is hashed in memory and never returned or included in diagnostics.
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
