export type HostedRuntimeEnvironment = Readonly<{
  HELIX_RUNTIME_ENV?: string;
  NETLIFY?: string;
  NETLIFY_DEPLOY_ID?: string;
  DEPLOY_ID?: string;
  SITE_ID?: string;
  AWS_LAMBDA_FUNCTION_NAME?: string;
  LAMBDA_TASK_ROOT?: string;
  CONTEXT?: string;
}>;

function present(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

/**
 * Detect a server runtime that must never use process-local execution or
 * persistence fallbacks. NODE_ENV is deliberately excluded: local Vite builds
 * set it to production without becoming a hosted runtime.
 */
export function isHostedRuntimeEnvironment(
  environment: HostedRuntimeEnvironment = process.env,
): boolean {
  const context = environment.CONTEXT?.trim();
  return (
    environment.HELIX_RUNTIME_ENV?.trim() === "production" ||
    environment.NETLIFY?.trim() === "true" ||
    present(environment.NETLIFY_DEPLOY_ID) ||
    (present(environment.DEPLOY_ID) && present(environment.SITE_ID)) ||
    present(environment.AWS_LAMBDA_FUNCTION_NAME) ||
    present(environment.LAMBDA_TASK_ROOT) ||
    context === "production" ||
    context === "deploy-preview" ||
    context === "branch-deploy"
  );
}

/** Netlify-only signals safe for trusting Netlify-specific request headers. */
export function isNetlifyRuntimeEnvironment(
  environment: HostedRuntimeEnvironment = process.env,
): boolean {
  const context = environment.CONTEXT?.trim();
  return (
    environment.NETLIFY?.trim() === "true" ||
    present(environment.NETLIFY_DEPLOY_ID) ||
    (present(environment.DEPLOY_ID) && present(environment.SITE_ID)) ||
    context === "production" ||
    context === "deploy-preview" ||
    context === "branch-deploy"
  );
}
