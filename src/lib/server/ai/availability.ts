import { AiProviderError } from "@/lib/server/ai/types";

export type AiGatewayAvailabilityEnvironment = Readonly<{
  HELIX_AI_GATEWAY_ENABLED?: string;
}>;

/**
 * Keep every build-creation boundary fail-closed while the owner-funded AI
 * gateway is disabled. This check must run before any credit, project, queue,
 * guest-budget or provider side effect.
 */
export function assertAiGenerationEnabled(
  environment: AiGatewayAvailabilityEnvironment = process.env,
): void {
  if (environment.HELIX_AI_GATEWAY_ENABLED !== "true") {
    throw new AiProviderError("HELIX_AI_DISABLED", {
      retryable: false,
      status: 503,
    });
  }
}
