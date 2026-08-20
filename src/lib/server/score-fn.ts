import { createServerFn } from "@tanstack/react-start";
import { applyImprovement, computeScore, type KrelunaScore } from "@/lib/score";
import { runTwin } from "@/lib/server/twin";
import { runAegisStaticScan } from "@/lib/server/quality/aegis";
import { authMiddleware } from "@/lib/auth/middleware";

export const scoreProduct = createServerFn({ method: "POST" })
  .validator(
    (input: {
      html: string;
      prompt: string;
      twin?: boolean;
      locale?: string;
    }) => ({
      html:
        typeof input.html === "string"
          ? input.html.slice(0, 256 * 1024)
          : "",
      prompt:
        typeof input.prompt === "string"
          ? input.prompt.trim().slice(0, 2_000)
          : "",
      locale: input.locale ?? "en",
    }),
  )
  .handler(async ({ data }): Promise<KrelunaScore> => {
    const [aegis, twin] = await Promise.all([
      runAegisStaticScan(data.html),
      runTwin(data.html),
    ]);
    return computeScore(
      data.html,
      data.prompt,
      { aegis, twin },
      data.locale,
    );
  });

export const liftScore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { html: string; prompt: string; id: string; locale?: string }) => ({
    html:
      typeof input.html === "string" ? input.html.slice(0, 256 * 1024) : "",
    prompt:
      typeof input.prompt === "string"
        ? input.prompt.trim().slice(0, 2_000)
        : "",
    id: typeof input.id === "string" ? input.id.slice(0, 80) : "",
    locale: input.locale ?? "en",
  }))
  .handler(async ({ data }) => {
    const html = applyImprovement(data.html, data.id);
    const [aegis, twin] = await Promise.all([
      runAegisStaticScan(html),
      runTwin(html),
    ]);
    return {
      html,
      score: await computeScore(
        html,
        data.prompt,
        { aegis, twin },
        data.locale,
      ),
    };
  });
