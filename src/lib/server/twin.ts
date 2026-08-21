import { sha256Hex } from "@/lib/server/agents/patch";
import {
  TwinBrowserReportSchema,
  type TwinBrowserReport,
} from "@/lib/server/quality/types";

export type TwinNotRunReason = Extract<
  TwinBrowserReport,
  { status: "not_run" }
>["reasonCode"];

/**
 * The browser runner is deliberately outside the TanStack/Netlify SSR bundle.
 * This factory records the absence of browser evidence without inferring clicks,
 * form behavior, console state, screenshots, or runtime success from HTML text.
 */
export async function createTwinNotRunReport(
  html: string,
  reasonCode: TwinNotRunReason = "browser_runner_unconfigured",
  detail = "No isolated Playwright/Chromium runner is configured for this build.",
): Promise<TwinBrowserReport> {
  return TwinBrowserReportSchema.parse({
    kind: "twin_browser",
    version: "1.0.0",
    status: "not_run",
    evidence: "not_run",
    artifactSha256: await sha256Hex(html),
    generatedAt: new Date().toISOString(),
    reasonCode,
    detail,
  });
}

/**
 * Compatibility entrypoint for callers that previously invoked the regex
 * simulator. It now returns an explicit not_run report and never fabricates
 * actions or measurements.
 */
export async function runTwin(html: string): Promise<TwinBrowserReport> {
  return createTwinNotRunReport(html);
}
