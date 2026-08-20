import { createServer } from "node:http";
import {
  GENERATED_APP_SANDBOX,
  protectGeneratedHtml,
} from "../src/lib/generated-content-policy.ts";

const MAX_TWIN_HTML_BYTES = 2 * 1024 * 1024;

function escapeAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function createTwinHarnessDocument(html) {
  const bytes = Buffer.byteLength(html, "utf8");
  if (!html || bytes > MAX_TWIN_HTML_BYTES) {
    throw new Error("TWIN_ARTIFACT_SIZE_INVALID");
  }
  const protectedHtml = protectGeneratedHtml(html, { noIndex: true });
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="robots" content="noindex, nofollow">',
    '<meta name="referrer" content="no-referrer">',
    "<style>html,body,iframe{box-sizing:border-box;width:100%;height:100%;margin:0;border:0;background:#fff}</style>",
    "</head><body>",
    `<iframe id="helix-generated-app" title="Helix generated app" sandbox="${escapeAttribute(GENERATED_APP_SANDBOX)}" referrerpolicy="no-referrer" srcdoc="${escapeAttribute(protectedHtml)}"></iframe>`,
    "</body></html>",
  ].join("");
}

export async function startTwinHarness(html) {
  const document = createTwinHarnessDocument(html);
  const token = crypto.randomUUID();
  const route = `/twin/${token}`;
  const server = createServer((request, response) => {
    if (request.method !== "GET" || request.url !== route) {
      response.writeHead(404, {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; frame-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    });
    response.end(document);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("TWIN_HARNESS_BIND_FAILED");
  }
  return {
    url: `http://127.0.0.1:${address.port}${route}`,
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
