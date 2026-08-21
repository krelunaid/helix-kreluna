import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import installPageTemplate from "../scripts/install-page.html?raw";
import {
  acceptsHtml,
  isDocumentPath,
  isInstallQuery,
  renderInstallPageHtml,
  renderWebManifest,
} from "../scripts/grok-pwa-shared.mjs";
import { httpErrorStatusMiddleware } from "@/lib/server/http-error-status";

function requestHost(request: Request): string {
  return (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host
  );
}

// Defining a custom Start instance disables TanStack Start's implicit CSRF
// middleware. Keep the same protection explicitly for every server function.
const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
});

// These platform routes must be handled by the SSR runtime in production. The
// response-body transformation lives in src/server.ts so streaming SSR remains
// owned and disposed by TanStack Start correctly.
const grokPwaRoutes = createMiddleware().server(async ({ request, next }) => {
  if (request.method.toUpperCase() !== "GET") return next();

  const url = new URL(request.url);
  const path = url.pathname;
  const urlWithQuery = `${path}${url.search}`;
  const host = requestHost(request);

  if (path === "/__grok/manifest.webmanifest" || path === "/__grok/manifest.json") {
    return new Response(renderWebManifest(host), {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  }

  if (
    isInstallQuery(urlWithQuery) &&
    isDocumentPath(path) &&
    acceptsHtml(request.headers.get("accept"))
  ) {
    return new Response(
      renderInstallPageHtml(installPageTemplate, {
        host,
        url: urlWithQuery,
      }),
      {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-cache",
        },
      },
    );
  }

  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, grokPwaRoutes],
  functionMiddleware: [httpErrorStatusMiddleware],
}));
