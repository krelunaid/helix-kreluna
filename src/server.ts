import type { Register } from "@tanstack/react-router";
import {
  createStartHandler,
  defaultStreamHandler,
  type RequestHandler,
} from "@tanstack/react-start/server";
import { grokOgIdentity } from "virtual:grok-og-identity";
import { createHeadInjector, isDocumentPath, isInstallQuery } from "../scripts/grok-pwa-shared.mjs";
import { validateServerEnvironment } from "@/lib/env.server";

let environmentValidated = false;
function ensureRuntimeConfiguration(): void {
  if (environmentValidated) return;
  validateServerEnvironment();
  environmentValidated = true;
}

const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https://images.unsplash.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "permissions-policy": "camera=(), geolocation=(), usb=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
} as const;

function requestHost(request: Request): string {
  return (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host
  );
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if (response.status >= 400 && !headers.has("cache-control")) {
    headers.set("cache-control", "no-store");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function injectHeadStreaming(response: Response, host: string): Response {
  const injector = createHeadInjector({
    host,
    site: grokOgIdentity.site,
  });
  const transformed = response.body!.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        for (const output of injector.push(chunk)) controller.enqueue(output);
      },
      flush(controller) {
        for (const output of injector.flush()) controller.enqueue(output);
      },
    }),
  );
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const startFetch = createStartHandler(defaultStreamHandler);

const fetch: RequestHandler<Register> = async (request, options) => {
  // This call intentionally lives inside the handler. package.json declares
  // sideEffects=false, so a top-level validation-only import can be tree-shaken.
  ensureRuntimeConfiguration();
  let response = await startFetch(request, options);
  const url = new URL(request.url);

  if (
    request.method.toUpperCase() === "GET" &&
    isDocumentPath(url.pathname) &&
    !isInstallQuery(`${url.pathname}${url.search}`) &&
    response.body &&
    response.headers.get("content-type")?.includes("text/html") &&
    !response.headers.get("content-encoding")
  ) {
    response = injectHeadStreaming(response, requestHost(request));
  }

  return withSecurityHeaders(response);
};

export default { fetch };
