export const HELIX_PREVIEW_ORIGIN_HEADER = "x-helix-preview-origin";

export type NetlifyPreviewDispatchContext = Readonly<{
  requestUrl: string | URL;
  cookieHeader?: string | null;
  verifiedDeployPrimeUrl?: string | null;
}>;

export type NetlifyPreviewDispatchCredentials = Readonly<{
  cookieHeader: string;
  previewOrigin: string;
}>;

export class NetlifyDispatchBoundaryError extends Error {
  readonly code:
    | "NETLIFY_DISPATCH_ORIGIN_MISMATCH"
    | "NETLIFY_DISPATCH_INSECURE_ORIGIN"
    | "NETLIFY_DISPATCH_INVALID_ORIGIN";

  constructor(code: NetlifyDispatchBoundaryError["code"]) {
    super(code);
    this.name = "NetlifyDispatchBoundaryError";
    this.code = code;
  }
}

function requestUrl(value: string | URL): URL {
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) {
      throw new NetlifyDispatchBoundaryError("NETLIFY_DISPATCH_INVALID_ORIGIN");
    }
    return parsed;
  } catch (error) {
    if (error instanceof NetlifyDispatchBoundaryError) throw error;
    throw new NetlifyDispatchBoundaryError("NETLIFY_DISPATCH_INVALID_ORIGIN");
  }
}

/**
 * Returns the perimeter session only when the request and target match an
 * independently verified Netlify PR Deploy Preview. Netlify does not document
 * a stable cookie name for Team Login/SSO, so filtering by a guessed name would
 * break protected previews. Forwarding the complete header to the exact origin
 * mirrors a browser request to the same endpoint.
 */
export function netlifyPreviewDispatchCredentials(
  target: URL,
  context?: NetlifyPreviewDispatchContext,
): NetlifyPreviewDispatchCredentials | null {
  if (!context) return null;

  const source = requestUrl(context.requestUrl);
  if (source.origin !== target.origin) {
    throw new NetlifyDispatchBoundaryError("NETLIFY_DISPATCH_ORIGIN_MISMATCH");
  }

  if (!context.verifiedDeployPrimeUrl) return null;
  const verifiedPreview = requestUrl(context.verifiedDeployPrimeUrl);
  if (
    verifiedPreview.pathname !== "/" ||
    verifiedPreview.search ||
    verifiedPreview.hash ||
    verifiedPreview.origin !== target.origin
  ) {
    throw new NetlifyDispatchBoundaryError("NETLIFY_DISPATCH_ORIGIN_MISMATCH");
  }
  if (target.protocol !== "https:") {
    throw new NetlifyDispatchBoundaryError("NETLIFY_DISPATCH_INSECURE_ORIGIN");
  }

  const cookieHeader = context.cookieHeader?.trim();
  return cookieHeader
    ? Object.freeze({ cookieHeader, previewOrigin: verifiedPreview.origin })
    : null;
}
