import { AGENT_CONTRACTS } from "@/lib/server/agents/contracts";
import { extractHtml } from "@/lib/server/agents/html";
import { AgentOutputError, type AgentBuildInput } from "@/lib/server/agents/types";
import { chatModel } from "@/lib/server/ai/chat";
import { forgeLogicSystemPrompt, forgeUiSystemPrompt } from "@/lib/server/prompts/helix";

export async function agentBuild(
  input: AgentBuildInput,
  phase: "ui" | "logic",
  retryIndex = 0,
  logicalCallKey = phase === "ui" ? "forge:ui" : "forge:logic",
): Promise<string | null> {
  const contract = phase === "ui" ? AGENT_CONTRACTS.forgeUi : AGENT_CONTRACTS.forgeLogic;
  const contractInput = contract.inputSchema.safeParse({
    prompt: input.prompt,
    locale: input.locale,
    language: input.lang,
    mode: input.mode,
    currentHtml: input.currentHtml,
    plan: input.plan,
    architecture: input.architecture,
    design: input.design,
    notes: input.extra,
  });
  if (!contractInput.success) {
    throw new AgentOutputError(
      phase === "ui" ? "FORGE_UI_INPUT_INVALID" : "FORGE_LOGIC_INPUT_INVALID",
      false,
    );
  }
  const userParts = [input.prompt];
  if (input.plan) userParts.push("\nPLAN:\n", JSON.stringify(input.plan));
  if (input.architecture) {
    userParts.push("\nARCHITECTURE:\n", JSON.stringify(input.architecture));
  }
  if (input.design) userParts.push("\nDESIGN:\n", JSON.stringify(input.design));
  if (input.extra?.length) userParts.push("\nHOUSE NOTES:\n", input.extra.join("\n"));
  if (input.currentHtml && phase === "logic") {
    userParts.push("\nSTRUCTURE HTML:\n", input.currentHtml.slice(0, 70_000));
  }
  const html = extractHtml(
    await chatModel({
      system:
        phase === "ui"
          ? forgeUiSystemPrompt({ language: input.lang, locale: input.locale })
          : forgeLogicSystemPrompt({
              mode: input.mode,
              language: input.lang,
              locale: input.locale,
            }),
      user: userParts.join(""),
      maxTokens: contract.maxTokens,
      timeoutMs: contract.timeoutMs,
      temperature: 0.5,
      model: contract.model ?? undefined,
      effort: input.extra?.includes("MAX") ? "high" : "low",
      job: input.job,
      agent: phase === "ui" ? "Forge UI" : "Forge Logic",
      contractId: phase === "ui" ? "forgeUi" : "forgeLogic",
      logicalCallKey,
      retryIndex,
      validateContent: (content) => contract.outputSchema.safeParse(extractHtml(content)).success,
    }),
  );
  const parsed = contract.outputSchema.safeParse(html);
  return parsed.success ? parsed.data : null;
}
