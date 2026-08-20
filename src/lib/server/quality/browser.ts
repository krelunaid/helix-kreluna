import { sha256Hex } from "@/lib/server/agents/patch";
import {
  EchoAccessibilityReportSchema,
  SwiftPerformanceReportSchema,
  type EchoAccessibilityReport,
  type SwiftPerformanceReport,
} from "@/lib/server/quality/types";

export async function createBrowserQualityNotRun(input: {
  html: string;
  reasonCode?:
    | "browser_runner_unconfigured"
    | "browser_dependency_missing"
    | "browser_binary_missing"
    | "explicitly_disabled";
  detail?: string;
}): Promise<{
  echo: EchoAccessibilityReport;
  swift: SwiftPerformanceReport;
}> {
  const artifactSha256 = await sha256Hex(input.html);
  const generatedAt = new Date().toISOString();
  const reasonCode = input.reasonCode ?? "browser_runner_unconfigured";
  const detail =
    input.detail ??
    "The isolated browser quality runner was not dispatched for this artifact.";
  return {
    echo: EchoAccessibilityReportSchema.parse({
      kind: "echo_accessibility",
      version: "1.0.0",
      status: "not_run",
      evidence: "not_run",
      artifactSha256,
      generatedAt,
      reasonCode,
      detail,
    }),
    swift: SwiftPerformanceReportSchema.parse({
      kind: "swift_performance",
      version: "1.0.0",
      status: "not_run",
      evidence: "not_run",
      artifactSha256,
      generatedAt,
      reasonCode,
      detail,
    }),
  };
}
