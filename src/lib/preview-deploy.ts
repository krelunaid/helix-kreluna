/** Immutable Netlify site identity for Helix/Kreluna. */
export const HELIX_NETLIFY_SITE_ID = "89a00a91-8730-40e6-ac92-be473f106a78" as const;
export const HELIX_NETLIFY_SITE_NAME = "helix-kreluna" as const;

export type NetlifyPreviewDeployEnvironment = Readonly<{
  NETLIFY?: string;
  CONTEXT?: string;
  HELIX_RUNTIME_ENV?: string;
  PULL_REQUEST?: string;
  REVIEW_ID?: string;
  COMMIT_REF?: string;
  DEPLOY_ID?: string;
  SITE_ID?: string;
  SITE_NAME?: string;
  DEPLOY_PRIME_URL?: string;
  HELIX_PREVIEW_EXPECTED_REVIEW_ID?: string;
  HELIX_PREVIEW_EXPECTED_COMMIT_REF?: string;
}>;

export type VerifiedNetlifyPullRequestDeploy = Readonly<{
  reviewId: string;
  commitRef: string;
  deployId: string;
  deployPrimeUrl: string;
}>;

export type EmbeddedNetlifyPreviewBuildEvidence = Readonly<{
  context?: string;
  pullRequest?: string;
  reviewId?: string;
  commitRef?: string;
  deployId?: string;
  deployPrimeUrl?: string;
}>;

function value(
  environment: NetlifyPreviewDeployEnvironment,
  name: keyof NetlifyPreviewDeployEnvironment,
) {
  return environment[name]?.trim() ?? "";
}

function embeddedValue(
  evidence: EmbeddedNetlifyPreviewBuildEvidence,
  name: keyof EmbeddedNetlifyPreviewBuildEvidence,
) {
  return evidence[name]?.trim() ?? "";
}

/**
 * Non-secret build identity embedded into the server artifact by the dedicated
 * deploy-preview command. Netlify Functions do not expose the corresponding
 * build-time variables, so cold starts combine this immutable artifact evidence
 * with runtime SITE_ID/SITE_NAME and operator-owned expected PR/SHA pins.
 */
export function embeddedNetlifyPreviewBuildEvidence(): EmbeddedNetlifyPreviewBuildEvidence {
  return Object.freeze({
    context: import.meta.env.VITE_HELIX_PREVIEW_BUILD_CONTEXT,
    pullRequest: import.meta.env.VITE_HELIX_PREVIEW_BUILD_PULL_REQUEST,
    reviewId: import.meta.env.VITE_HELIX_PREVIEW_BUILD_REVIEW_ID,
    commitRef: import.meta.env.VITE_HELIX_PREVIEW_BUILD_COMMIT_REF,
    deployId: import.meta.env.VITE_HELIX_PREVIEW_BUILD_DEPLOY_ID,
    deployPrimeUrl: import.meta.env.VITE_HELIX_PREVIEW_BUILD_DEPLOY_PRIME_URL,
  });
}

/**
 * Resolve a Netlify PR Deploy Preview only when every platform marker agrees
 * with the operator-pinned PR number and commit. A generic deploy-preview
 * context (including a manually promoted deploy) is deliberately insufficient.
 */
export function verifyNetlifyPullRequestDeploy(
  environment: NetlifyPreviewDeployEnvironment,
  embeddedEvidence: EmbeddedNetlifyPreviewBuildEvidence = embeddedNetlifyPreviewBuildEvidence(),
): VerifiedNetlifyPullRequestDeploy | null {
  const hasBuildRuntimeMarkers = [
    "CONTEXT",
    "PULL_REQUEST",
    "REVIEW_ID",
    "COMMIT_REF",
    "DEPLOY_ID",
    "DEPLOY_PRIME_URL",
  ].some((name) => value(environment, name as keyof NetlifyPreviewDeployEnvironment));
  const context = hasBuildRuntimeMarkers
    ? value(environment, "CONTEXT")
    : embeddedValue(embeddedEvidence, "context");
  const pullRequest = hasBuildRuntimeMarkers
    ? value(environment, "PULL_REQUEST")
    : embeddedValue(embeddedEvidence, "pullRequest");
  const reviewId = hasBuildRuntimeMarkers
    ? value(environment, "REVIEW_ID")
    : embeddedValue(embeddedEvidence, "reviewId");
  const commitRef = hasBuildRuntimeMarkers
    ? value(environment, "COMMIT_REF")
    : embeddedValue(embeddedEvidence, "commitRef");
  const deployId = hasBuildRuntimeMarkers
    ? value(environment, "DEPLOY_ID")
    : embeddedValue(embeddedEvidence, "deployId");
  const deployPrimeUrl = hasBuildRuntimeMarkers
    ? value(environment, "DEPLOY_PRIME_URL")
    : embeddedValue(embeddedEvidence, "deployPrimeUrl");
  const expectedReviewId = value(environment, "HELIX_PREVIEW_EXPECTED_REVIEW_ID");
  const expectedCommitRef = value(environment, "HELIX_PREVIEW_EXPECTED_COMMIT_REF");
  const expectedDeployPrimeUrl =
    reviewId && `https://deploy-preview-${reviewId}--${HELIX_NETLIFY_SITE_NAME}.netlify.app`;

  if (
    (hasBuildRuntimeMarkers && value(environment, "NETLIFY") !== "true") ||
    context !== "deploy-preview" ||
    value(environment, "HELIX_RUNTIME_ENV") === "production" ||
    pullRequest !== "true" ||
    !/^[1-9][0-9]*$/u.test(reviewId) ||
    !/^[0-9a-f]{40}$/u.test(commitRef) ||
    !deployId ||
    value(environment, "SITE_ID") !== HELIX_NETLIFY_SITE_ID ||
    value(environment, "SITE_NAME") !== HELIX_NETLIFY_SITE_NAME ||
    deployPrimeUrl !== expectedDeployPrimeUrl ||
    expectedReviewId !== reviewId ||
    expectedCommitRef !== commitRef
  ) {
    return null;
  }

  return Object.freeze({
    reviewId,
    commitRef,
    deployId,
    deployPrimeUrl: expectedDeployPrimeUrl,
  });
}

export function isVerifiedNetlifyPullRequestDeploy(
  environment: NetlifyPreviewDeployEnvironment,
): boolean {
  return verifyNetlifyPullRequestDeploy(environment) !== null;
}
