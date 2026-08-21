import { serverEnv } from "../env.server";

/**
 * Runtime host policy for the narrowly scoped preview password login.
 *
 * Netlify can manually promote an immutable Deploy Preview artifact. The
 * artifact still contains its non-secret PR build evidence, so that evidence
 * alone cannot prove that the current request reached the preview hostname.
 * Every password-authenticated request therefore has to agree with the exact
 * DEPLOY_PRIME_URL that was verified from the pinned PR evidence.
 */
export type PreviewPasswordRequestPolicy = Readonly<{
  enabled: boolean;
  deployPrimeUrl: string | null;
}>;

export class PreviewPasswordRequestOriginError extends Error {
  readonly status = 403;

  constructor() {
    super("Forbidden: preview password authentication is restricted to its exact deploy origin");
    this.name = "PreviewPasswordRequestOriginError";
  }
}

export function currentPreviewPasswordRequestPolicy(): PreviewPasswordRequestPolicy {
  return Object.freeze({
    enabled: serverEnv.previewPasswordSignInEnabled,
    deployPrimeUrl: serverEnv.verifiedNetlifyPullRequestDeploy?.deployPrimeUrl ?? null,
  });
}

function fail(): never {
  throw new PreviewPasswordRequestOriginError();
}

function exactSingleHeader(request: Request, name: string, expected: string): void {
  const raw = request.headers.get(name);
  if (raw === null) return;
  const value = raw.trim();
  if (!value || value !== raw || value.includes(",") || value.toLowerCase() !== expected) fail();
}

/**
 * Fail closed when a preview-password request is served from anything other
 * than the exact verified Deploy Preview origin. Proxy identity headers are
 * optional, but when Netlify supplies them they must tell the same story.
 * Browser-only Origin / Fetch-Metadata headers are deliberately not required:
 * bearer and server-function requests still remain bound by request.url.
 */
export function assertPreviewPasswordRequestOrigin(
  request: Request,
  policy: PreviewPasswordRequestPolicy = currentPreviewPasswordRequestPolicy(),
): void {
  if (!policy.enabled) return;

  let expected: URL;
  let actual: URL;
  try {
    if (!policy.deployPrimeUrl) fail();
    expected = new URL(policy.deployPrimeUrl);
    actual = new URL(request.url);
  } catch (error) {
    if (error instanceof PreviewPasswordRequestOriginError) throw error;
    fail();
  }

  if (
    expected.protocol !== "https:" ||
    expected.username ||
    expected.password ||
    expected.pathname !== "/" ||
    expected.search ||
    expected.hash ||
    actual.origin !== expected.origin
  ) {
    fail();
  }

  const expectedHost = expected.host.toLowerCase();
  const expectedProtocol = expected.protocol.slice(0, -1).toLowerCase();
  exactSingleHeader(request, "host", expectedHost);
  exactSingleHeader(request, "x-forwarded-host", expectedHost);
  exactSingleHeader(request, "x-forwarded-proto", expectedProtocol);

  const origin = request.headers.get("origin");
  if (origin !== null && origin !== expected.origin) fail();
}

export type AuthRequestHandler = (request: Request) => Response | Promise<Response>;

/** Apply the origin gate before entering Better Auth's handler. */
export async function handlePreviewPasswordAuthRequest(
  request: Request,
  handler: AuthRequestHandler,
  policy: PreviewPasswordRequestPolicy = currentPreviewPasswordRequestPolicy(),
): Promise<Response> {
  try {
    assertPreviewPasswordRequestOrigin(request, policy);
  } catch (error) {
    if (error instanceof PreviewPasswordRequestOriginError) {
      return new Response("Forbidden", {
        status: 403,
        headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
      });
    }
    throw error;
  }
  return handler(request);
}
