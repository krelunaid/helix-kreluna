import { applyControlledGemPatch, sha256Hex } from "@/lib/server/agents/patch";
import { AgentOutputError, type GemPatch } from "@/lib/server/agents/types";
import { runAegisStaticScan } from "@/lib/server/quality/aegis";
import type { AegisReport } from "@/lib/server/quality/types";

export type ValidatedGemPatch = Readonly<{
  html: string;
  artifactSha256: string;
  aegis: AegisReport;
}>;

/**
 * Applies one hash-fenced fragment patch and immediately re-runs the blocking
 * static security gate. The caller must persist only the returned HTML.
 */
export async function applyAndValidateGemPatch(
  html: string,
  change: GemPatch,
): Promise<ValidatedGemPatch> {
  const next = await applyControlledGemPatch(html, change);
  const aegis = await runAegisStaticScan(next);
  if (!aegis.passed || aegis.blockerCount > 0) {
    throw new AgentOutputError("GEM_PATCH_SECURITY_VALIDATION_FAILED", false);
  }
  return {
    html: next,
    artifactSha256: await sha256Hex(next),
    aegis,
  };
}
