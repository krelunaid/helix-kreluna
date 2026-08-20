import { extractHtml, isValidHtmlArtifact } from "@/lib/server/agents/html";
import { AGENT_CONTRACTS } from "@/lib/server/agents/contracts";
import {
  AgentOutputError,
  IrisAssessmentSchema,
  ReviewResultSchema,
  type AgentFixInput,
  type AgentReviewInput,
  type ChatContentPart,
  type IrisAssessment,
  type ReviewResult,
} from "@/lib/server/agents/types";
import { requestAgentCompletion } from "@/lib/server/ai/gateway";

export function finalizeIrisReview(input: {
  assessment: IrisAssessment;
  twin: AgentReviewInput["twin"];
  echo: AgentReviewInput["echo"];
  swift: AgentReviewInput["swift"];
  artifactSha256: string;
}): ReviewResult {
  if (
    input.twin.artifactSha256 !== input.artifactSha256 ||
    input.echo.artifactSha256 !== input.artifactSha256 ||
    input.swift.artifactSha256 !== input.artifactSha256
  ) {
    throw new AgentOutputError("IRIS_EVIDENCE_STALE", false);
  }
  const browserCompleted = input.twin.status === "completed";
  const suiteCompleted =
    input.twin.status === "completed" &&
    input.echo.status === "completed" &&
    input.swift.status === "completed";
  const runtimeErrors =
    input.twin.status === "completed"
      ? [...input.twin.consoleErrors, ...input.twin.runtimeErrors]
      : [];
  const failedActions =
    input.twin.status === "completed"
      ? input.twin.actions.filter(
          (action) =>
            (action.type === "click" || action.type === "submit") &&
            (action.status === "failed" || action.status === "no_change"),
        )
      : [];
  const changedInteraction =
    input.twin.status === "completed"
      ? input.twin.actions.some(
          (action) => (action.type === "click" || action.type === "submit") && action.changed,
        )
      : false;
  const accessibilityFailed = input.echo.status === "completed" && !input.echo.passed;
  const measuredApplicationFailure =
    runtimeErrors.length > 0 || failedActions.length > 0 || accessibilityFailed;
  const status =
    input.assessment.recommendation === "fail" || measuredApplicationFailure
      ? ("failed" as const)
      : suiteCompleted && changedInteraction
        ? ("passed" as const)
        : ("inconclusive" as const);
  const evidenceIssues = [
    ...(runtimeErrors.length ? [`Measured browser errors: ${runtimeErrors.length}`] : []),
    ...(failedActions.length
      ? [`Measured failed or unchanged primary actions: ${failedActions.length}`]
      : []),
    ...(browserCompleted && !changedInteraction
      ? ["Twin did not verify any changed click or submit interaction."]
      : []),
    ...(accessibilityFailed
      ? [
          `Echo reported ${
            input.echo.status === "completed" ? input.echo.findings.length : 0
          } accessibility finding group(s).`,
        ]
      : []),
    ...(input.twin.status === "failed" ? [`Twin browser run failed: ${input.twin.errorCode}`] : []),
    ...(input.echo.status === "failed"
      ? [`Echo browser audit failed: ${input.echo.errorCode}`]
      : []),
    ...(input.swift.status === "failed"
      ? [`Swift browser measurement failed: ${input.swift.errorCode}`]
      : []),
  ];
  const parsed = ReviewResultSchema.safeParse({
    artifactSha256: input.artifactSha256,
    status,
    evidence: browserCompleted ? "browser_assisted" : "static_only",
    confidence:
      status === "passed" ? 0.9 : measuredApplicationFailure ? 0.85 : browserCompleted ? 0.55 : 0.4,
    score: input.assessment.score,
    pass: status === "passed",
    issues: [...input.assessment.issues, ...evidenceIssues],
    mustFix: [
      ...input.assessment.mustFix,
      ...(runtimeErrors.length ? ["Fix measured browser runtime errors."] : []),
      ...(failedActions.length
        ? ["Make every exercised primary action produce a verifiable result."]
        : []),
      ...(accessibilityFailed ? ["Resolve the measured Echo accessibility findings."] : []),
    ],
  });
  if (!parsed.success) throw new AgentOutputError("IRIS_REVIEW_INVALID");
  return parsed.data;
}

export async function runIrisReview(input: AgentReviewInput): Promise<ReviewResult> {
  const contract = AGENT_CONTRACTS.iris;
  const validatedInput = contract.inputSchema.safeParse({
    prompt: input.prompt,
    language: input.lang,
    html: input.html,
    plan: input.plan,
    consoleErrors: input.consoleErrors,
    staticFindings: input.staticFindings,
    acceptanceCriteria: input.acceptanceCriteria,
    artifactSha256: input.artifactSha256,
    twin: input.twin,
    echo: input.echo,
    swift: input.swift,
    ...(input.shot ? { screenshotBase64: input.shot } : {}),
  });
  if (!validatedInput.success || validatedInput.data.twin.artifactSha256 !== input.artifactSha256) {
    throw new AgentOutputError("IRIS_INPUT_INVALID", false);
  }
  const browserCompleted = input.twin.status === "completed";
  const content: ChatContentPart[] = [
    {
      type: "text",
      text: [
        `User asked: ${input.prompt}`,
        input.plan ? `Plan: ${JSON.stringify(input.plan)}` : "",
        input.acceptanceCriteria.length
          ? `ACCEPTANCE CRITERIA:\n${input.acceptanceCriteria.join("\n")}`
          : "No explicit acceptance criteria were provided.",
        `TWIN REPORT:\n${JSON.stringify(input.twin)}`,
        `ECHO ACCESSIBILITY REPORT:\n${JSON.stringify(input.echo)}`,
        `SWIFT PERFORMANCE REPORT:\n${JSON.stringify(input.swift)}`,
        input.consoleErrors.length
          ? `CONSOLE ERRORS:\n${input.consoleErrors.join("\n")}`
          : "Console capture not available; no runtime browser test was executed.",
        input.staticFindings.length
          ? `STATIC HEURISTIC FINDINGS (not browser evidence):\n${input.staticFindings.join("\n")}`
          : "No static findings.",
        `COMPLETE HTML ARTIFACT (${input.html.length} characters):\n`,
        input.html,
        `\nReturn ONLY JSON: {"score":1-10,"recommendation":"pass"|"fail","issues":[],"mustFix":[]} in ${input.lang} for the issue strings.`,
        browserCompleted
          ? "Use the supplied measured browser evidence. Recommend pass only if the tested main actions work and the artifact meets its acceptance criteria."
          : "No completed browser evidence exists. You may recommend a visual/static pass, but Helix will keep runtime QA inconclusive.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
  if (input.shot) {
    content.push({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${input.shot}` },
    });
  }
  const response = await requestAgentCompletion({
    job: input.job,
    contractId: "iris",
    agentId: "Iris",
    logicalCallKey: `iris:${input.artifactSha256.slice(0, 24)}`,
    system:
      "You are Iris, the evidence reviewer at Helix. Review only the supplied artifact and evidence. Never claim you clicked, navigated, measured, or saw a screenshot unless the input contains that evidence. Fail empty first screens on every product type and flag generic chrome without content. Return ONLY JSON.",
    user: content,
    temperature: 0.2,
    effort: "low",
  });
  const parsedText =
    response.content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? response.content;
  const start = parsedText.indexOf("{");
  const end = parsedText.lastIndexOf("}");
  let candidate: unknown = null;
  if (start >= 0 && end > start) {
    try {
      candidate = JSON.parse(parsedText.slice(start, end + 1)) as unknown;
    } catch {
      candidate = null;
    }
  }
  const assessment = IrisAssessmentSchema.safeParse(candidate);
  if (!assessment.success) throw new AgentOutputError("IRIS_REVIEW_INVALID");
  return finalizeIrisReview({
    assessment: assessment.data,
    twin: input.twin,
    echo: input.echo,
    swift: input.swift,
    artifactSha256: input.artifactSha256,
  });
}

export async function runSuperiorFix(input: AgentFixInput): Promise<string> {
  const contract = AGENT_CONTRACTS.superior;
  const validatedInput = contract.inputSchema.safeParse({
    prompt: input.prompt,
    locale: input.locale,
    language: input.lang,
    html: input.html,
    review: input.review,
  });
  if (!validatedInput.success) {
    throw new AgentOutputError("SUPERIOR_INPUT_INVALID", false);
  }
  const response = await requestAgentCompletion({
    job: input.job,
    contractId: "superior",
    agentId: "Superior",
    logicalCallKey: `superior:${input.review.artifactSha256.slice(0, 24)}`,
    system: `You are Superior, principal closer at Helix. You close ANY brief — shop, game, dashboard, estate, café, CRM, chat. Empty first screens are not shipped. Apply MUST-FIX. Fill the primary view for THIS prompt with real items and working taps. Return ONLY a complete HTML document. Keep language ${input.lang}. No localStorage. Preserve the offline boundary: use CSS, inline SVG, self/data/blob assets only; no remote assets or network APIs. No markdown.`,
    user: `PROMPT:\n${input.prompt}\n\nMUST FIX:\n${input.review.mustFix.join("\n")}\n\nISSUES:\n${input.review.issues.join("\n")}\n\nHTML:\n${input.html.slice(0, 70_000)}`,
    temperature: 0.35,
    effort: "low",
  });
  const html = extractHtml(response.content);
  const parsed = contract.outputSchema.safeParse(html);
  if (!parsed.success || !isValidHtmlArtifact(parsed.data)) {
    throw new AgentOutputError("SUPERIOR_HTML_INVALID");
  }
  return parsed.data;
}
