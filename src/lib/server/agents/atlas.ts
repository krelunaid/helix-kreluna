import type { BuildJob } from "@/lib/agent-types";
import { AGENT_CONTRACTS } from "@/lib/server/agents/contracts";
import { parseAgentJson } from "@/lib/server/agents/json";
import { AgentOutputError, type Architecture, type ProductPlan } from "@/lib/server/agents/types";
import { chatModel } from "@/lib/server/ai/chat";
import { atlasSystemPrompt } from "@/lib/server/prompts/helix";

export async function agentArchitecture(
  prompt: string,
  plan: ProductPlan | null,
  language: string,
  briefLock: string,
  job: BuildJob,
): Promise<Architecture> {
  const contract = AGENT_CONTRACTS.atlas;
  const contractInput = contract.inputSchema.safeParse({
    prompt,
    language,
    briefLock,
    plan,
  });
  if (!contractInput.success) throw new AgentOutputError("ATLAS_INPUT_INVALID", false);
  const parsed = contract.outputSchema.safeParse(
    parseAgentJson<unknown>(
      await chatModel({
        system: atlasSystemPrompt(language, briefLock, job.buildLevel),
        user: `${prompt}\n\nPRD:\n${JSON.stringify(plan)}`,
        maxTokens: contract.maxTokens,
        timeoutMs: contract.timeoutMs,
        temperature: 0.3,
        effort: "low",
        model: contract.model ?? undefined,
        job,
        agent: "Atlas",
        contractId: "atlas",
        logicalCallKey: "atlas:architecture",
        validateContent: (content) =>
          contract.outputSchema.safeParse(parseAgentJson<unknown>(content)).success,
      }),
    ),
  );
  if (parsed.success) return parsed.data;
  throw new AgentOutputError("ATLAS_ARCHITECTURE_INVALID");
}
