import { serverEnv } from "@/lib/env.server";
import { AiProviderError } from "@/lib/server/ai/types";

export type GuestAiRuntime = Readonly<{ isProduction: boolean }>;

/**
 * Production AI uses the site owner's quota, so anonymous generation remains
 * closed. Verified Preview and local runtimes keep their existing guest flow.
 */
export function assertGuestAiGenerationAllowed(runtime: GuestAiRuntime = serverEnv): void {
  if (runtime.isProduction) {
    throw new AiProviderError("HELIX_GUEST_AI_DISABLED_IN_PRODUCTION", {
      retryable: false,
      status: 403,
    });
  }
}
