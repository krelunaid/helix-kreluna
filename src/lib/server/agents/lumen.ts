import type { BuildJob } from "@/lib/agent-types";
import { AGENT_CONTRACTS } from "@/lib/server/agents/contracts";
import { selectDesignDirection } from "@/lib/server/agents/design";
import { parseAgentJson } from "@/lib/server/agents/json";
import {
  AgentOutputError,
  type Architecture,
  type DesignSelection,
  type ProductPlan,
} from "@/lib/server/agents/types";
import { chatModel } from "@/lib/server/ai/chat";
import { lumenSystemPrompt } from "@/lib/server/prompts/helix";

export async function agentDesign(
  prompt: string,
  plan: ProductPlan | null,
  architecture: Architecture | null,
  language: string,
  job: BuildJob,
): Promise<DesignSelection> {
  const contract = AGENT_CONTRACTS.lumen;
  const contractInput = contract.inputSchema.safeParse({
    prompt,
    language,
    plan,
    architecture,
  });
  if (!contractInput.success) throw new AgentOutputError("LUMEN_INPUT_INVALID", false);
  const parsed = contract.outputSchema.safeParse(
    parseAgentJson<unknown>(
      await chatModel({
        system: lumenSystemPrompt(language),
        user: `${prompt}\n\nPLAN:\n${JSON.stringify(plan)}\n\nARCHITECTURE:\n${JSON.stringify(architecture)}`,
        maxTokens: contract.maxTokens,
        timeoutMs: contract.timeoutMs,
        temperature: 0.7,
        effort: "low",
        model: contract.model ?? undefined,
        job,
        agent: "Lumen",
        contractId: "lumen",
        logicalCallKey: "lumen:directions",
        validateContent: (content) =>
          contract.outputSchema.safeParse(parseAgentJson<unknown>(content)).success,
      }),
    ),
  );
  if (parsed.success) return selectDesignDirection(parsed.data);
  throw new AgentOutputError("LUMEN_DESIGN_INVALID");
}
