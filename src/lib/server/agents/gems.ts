import { AGENT_CONTRACTS } from "@/lib/server/agents/contracts";
import { parseAgentJson } from "@/lib/server/agents/json";
import { sha256Hex } from "@/lib/server/agents/patch";
import { AgentOutputError, type AgentGemInput, type GemPatch } from "@/lib/server/agents/types";
import { chatModel } from "@/lib/server/ai/chat";
import { gemSystemPrompt } from "@/lib/server/prompts/helix";

export async function agentGem(input: AgentGemInput): Promise<GemPatch> {
  const contract = AGENT_CONTRACTS.gemPatch;
  const contractInput = contract.inputSchema.safeParse({
    prompt: input.prompt,
    locale: input.locale,
    language: input.lang,
    html: input.html,
    gemName: input.gem,
    brief: input.brief,
  });
  if (!contractInput.success) throw new AgentOutputError("GEM_INPUT_INVALID", false);
  const beforeHash = await sha256Hex(input.html);
  const parsed = contract.outputSchema.safeParse(
    parseAgentJson<unknown>(
      await chatModel({
        system: gemSystemPrompt({
          name: input.gem,
          brief: input.brief,
          language: input.lang,
        }),
        user: `BRIEF:\n${input.prompt}\n\nCURRENT_HTML_SHA256:\n${beforeHash}\n\nCURRENT HTML:\n${input.html.slice(0, 65_000)}`,
        maxTokens: contract.maxTokens,
        timeoutMs: contract.timeoutMs,
        temperature: 0.4,
        model: contract.model ?? undefined,
        effort: "low",
        job: input.job,
        agent: input.gem,
        contractId: "gemPatch",
        logicalCallKey: `gem:${input.gem
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 80)}`,
        validateContent: (content) =>
          contract.outputSchema.safeParse(parseAgentJson<unknown>(content)).success,
      }),
    ),
  );
  if (parsed.success) return parsed.data;
  throw new AgentOutputError("GEM_PATCH_INVALID");
}
