import type { BuildJob } from "@/lib/agent-types";
import { AGENT_CONTRACTS } from "@/lib/server/agents/contracts";
import { parseAgentJson } from "@/lib/server/agents/json";
import { AgentOutputError, type ProductPlan } from "@/lib/server/agents/types";
import { chatModel } from "@/lib/server/ai/chat";
import { novaSystemPrompt } from "@/lib/server/prompts/helix";

export async function agentPlan(
  prompt: string,
  language: string,
  briefLock: string,
  job: BuildJob,
): Promise<ProductPlan> {
  const contract = AGENT_CONTRACTS.nova;
  const contractInput = contract.inputSchema.safeParse({
    prompt,
    language,
    briefLock,
  });
  if (!contractInput.success) throw new AgentOutputError("NOVA_INPUT_INVALID", false);
  const parsed = contract.outputSchema.safeParse(
    parseAgentJson<unknown>(
      await chatModel({
        system: novaSystemPrompt(language, briefLock, job.buildLevel),
        user: prompt,
        maxTokens: contract.maxTokens,
        timeoutMs: contract.timeoutMs,
        temperature: 0.2,
        effort: "low",
        model: contract.model ?? undefined,
        job,
        agent: "Nova",
        contractId: "nova",
        logicalCallKey: "nova:plan",
        validateContent: (content) =>
          contract.outputSchema.safeParse(parseAgentJson<unknown>(content)).success,
      }),
    ),
  );
  if (parsed.success) return parsed.data;
  throw new AgentOutputError("NOVA_PRD_INVALID");
}
