import { createServerFn } from "@tanstack/react-start";
import { applyImprovement, computeScore, type KrelunaScore } from "@/lib/score";
import { runTwin } from "@/lib/server/twin";

export const scoreProduct = createServerFn({ method: "POST" })
  .validator((input: { html: string; prompt: string; twin?: boolean; locale?: string }) => ({
    html: input.html,
    prompt: input.prompt.trim().slice(0, 2000),
    twin: Boolean(input.twin),
    locale: input.locale ?? "en",
  }))
  .handler(async ({ data }): Promise<KrelunaScore> => {
    const twin = data.twin ? await runTwin(data.html) : null;
    return computeScore(data.html, data.prompt, twin, data.locale);
  });

export const liftScore = createServerFn({ method: "POST" })
  .validator((input: { html: string; prompt: string; id: string; locale?: string }) => ({
    html: input.html,
    prompt: input.prompt.trim().slice(0, 2000),
    id: input.id,
    locale: input.locale ?? "en",
  }))
  .handler(async ({ data }) => {
    const html = applyImprovement(data.html, data.id);
    const twin = await runTwin(html);
    return { html, score: computeScore(html, data.prompt, twin, data.locale) };
  });
