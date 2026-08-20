import type { BuildJob } from "@/lib/agent-types";
import type { Architecture, ProductPlan } from "@/lib/server/agents/types";
import {
  SCORE_METRIC_IDS,
  getCapacityForecast,
  getReadinessEvidence,
  getScoreMetric,
  type KrelunaScore,
} from "@/lib/score";

type StackDecision = {
  front: string;
  back: string;
  db: string;
  auth: string;
};

function usdTicksDisplay(ticks: string): string {
  const value = BigInt(ticks);
  const scale = 10_000_000_000n;
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(10, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function finalizeReleaseCandidate(input: {
  job: BuildJob;
  html: string;
  plan: ProductPlan | null;
  architecture: Architecture | null;
  stack: StackDecision;
  score: KrelunaScore;
}): void {
  const { job, html, plan, architecture, score, stack } = input;
  if (job.buildLevel !== "prototype") {
    throw new Error("PRODUCTION_WORKSPACE_NOT_CONFIGURED");
  }
  const readiness = getReadinessEvidence(score);
  const capacity = getCapacityForecast(score);
  const scoreMetrics = SCORE_METRIC_IDS.map((id) => getScoreMetric(score, id));
  const scoreMetricLines = scoreMetrics
    .map(
      (metric) =>
        `- ${metric.id}: ${metric.value ?? "—"} · ${metric.evidence}/${metric.status} · confidence ${Math.round(metric.confidence * 100)}% · ${metric.source}`,
    )
    .join("\n");
  job.score = score;
  job.briefing = `Kreluna estimated aggregate ${score.readiness}/100 · confidence ${Math.round(readiness.confidence * 100)}% · estimated infra scenario €${score.costEur}/mo · ${score.council.pick}`;
  job.files = {
    "README.md": `# ${job.title}\n\n${plan?.pitch ?? job.prompt}\n\n## Artifact level\n\nPrototype: interactive single-page HTML. Mock or in-memory data may be present. This artifact is not a production backend, database, authentication service or configured external integration.\n\nKreluna estimated aggregate ${score.readiness}/100 (confidence ${Math.round(readiness.confidence * 100)}%). Human approval is required.\n`,
    ".env.example": "# This prototype does not require environment variables.\n",
    "docs/artifact-level.md": `# Artifact level\n\nLevel: Prototype\n\nEntrypoint: index.html\n\nThe release candidate is a validated HTML preview plus evidence and planning documents. Backend, database, authentication, monitoring and external integrations are not production services in this artifact. Production mode is unavailable until a multi-file pipeline can compile, test and validate those capabilities.\n`,
    "docs/prd.md": plan
      ? `# PRD — ${plan.title}\n\n${plan.pitch}\n\n## Target\n${plan.target}\n\n## Problem\n${plan.problem}\n\n## MVP\n${plan.mvp.map((item) => `- ${item}`).join("\n")}\n\n## P0\n${plan.scope.p0.map((item) => `- ${item}`).join("\n")}\n\n## P1\n${plan.scope.p1.map((item) => `- ${item}`).join("\n")}\n\n## P2\n${plan.scope.p2.map((item) => `- ${item}`).join("\n")}\n\n## Non-goals\n${plan.nonGoals.map((item) => `- ${item}`).join("\n")}\n\n## User journeys\n${plan.userJourneys.map((item) => `- ${item}`).join("\n")}\n\n## Acceptance criteria\n${plan.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}\n\n## Screens\n${plan.screens.map((screen) => `- ${screen.name}: ${screen.purpose}`).join("\n")}\n`
      : `# PRD\n\n${job.prompt}\n`,
    "docs/prd.json": JSON.stringify(plan, null, 2),
    "docs/architecture.md": architecture
      ? `# Architecture\n\n## Product\n${architecture.productType}\n\n## Frontend\n${architecture.frontendArchitecture}\n\n## Backend\n${architecture.backendArchitecture}\n\n## Data flow\n${architecture.dataFlow.map((item) => `- ${item}`).join("\n")}\n\n## Routes\n${architecture.routeMap.map((item) => `- ${item}`).join("\n")}\n\n## API contracts\n${architecture.apiContracts.map((item) => `- ${item}`).join("\n") || "- Not required for this prototype"}\n\n## Database\n${architecture.databaseRequirements}\n\n## Auth\n${architecture.authModel}\n\n## Deployment\n${architecture.deploymentTarget}\n\n## Failure modes\n${architecture.failureModes.map((item) => `- ${item}`).join("\n")}\n`
      : `# Architecture\n\n${stack.front}\n\n${stack.back}\n\n${stack.db}\n\n${stack.auth}\n`,
    "docs/architecture.json": JSON.stringify(architecture, null, 2),
    "docs/decisions.md": (job.memory ?? [])
      .map((memory) => `- ${memory.agent}: ${memory.decision}`)
      .join("\n"),
    ...(job.aiUsage
      ? {
          "docs/ai-usage.json": JSON.stringify(job.aiUsage, null, 2),
          "docs/ai-usage.md": `# AI usage\n\nEvidence: provider telemetry\n\nCalls: ${job.aiUsage.callCount}\nRetries: ${job.aiUsage.retryCount}\nProvider latency total: ${job.aiUsage.totalProviderLatencyMs} ms\nElapsed AI window: ${job.aiUsage.elapsedMs} ms\nKnown input tokens: ${job.aiUsage.knownInputTokens}\nKnown cached input tokens: ${job.aiUsage.knownCachedInputTokens}\nKnown output tokens: ${job.aiUsage.knownOutputTokens}\nKnown total tokens: ${job.aiUsage.knownTotalTokens}\nUnknown usage calls: ${job.aiUsage.unknownUsageCallCount}\n\nProvider-actual cost: ${job.aiUsage.providerActualCostUsdTicks} USD ticks (USD ${usdTicksDisplay(job.aiUsage.providerActualCostUsdTicks)})\nActual cost complete: ${job.aiUsage.actualCostComplete ? "yes" : "no"}\nUnknown-cost calls: ${job.aiUsage.unknownCostCallCount}\nConservatively accounted cost: ${job.aiUsage.accountedCostUsdTicks} USD ticks (USD ${usdTicksDisplay(job.aiUsage.accountedCostUsdTicks)})\n\nOne USD is 10^10 ticks. Accounted cost is a budget safety value and is not represented as provider-actual when a call lacks cost evidence.\n\n## Job budget\n\n- Calls: ${job.aiUsage.budget.maxCalls}\n- Retries: ${job.aiUsage.budget.maxRetries}\n- Duration: ${job.aiUsage.budget.maxDurationMs} ms\n- Cost: ${job.aiUsage.budget.maxCostUsdTicks} USD ticks (USD ${usdTicksDisplay(job.aiUsage.budget.maxCostUsdTicks)})\n`,
        }
      : {}),
    "docs/score.md": `# Kreluna Score v2\n\nArtifact: ${score.artifactSha256}\nGenerated: ${score.generatedAt}\nFormula: ${score.formulaVersion}\n\n## Estimated aggregate\n\nValue: ${score.readiness}/100\nEvidence: estimated\nConfidence: ${Math.round(readiness.confidence * 100)}%\nWeighted inputs: ${readiness.measuredWeight}% measured · ${readiness.estimatedWeight}% estimated · ${readiness.notRunWeight}% not run\n\n${readiness.disclaimer}\n\n## Metrics\n\n${scoreMetricLines}\n\n## Estimated cost scenario\n\nEUR ${score.costEur}/month · confidence ${Math.round(score.costScenario.confidence * 100)}%\nAssumptions: ${score.costScenario.assumptions.join("; ")}\nNo provider quote or invoice was measured.\n\n## Automated Council Score\n\n${score.council.pick}\n\n${score.council.why}\n\nDeterministic formula, not independent specialist votes. Human approval is required.\n\n## Capacity forecast\n\nStatus: ${capacity.status}\nEvidence: ${capacity.evidence}\nRange: ${capacity.range ? `${capacity.range.min}–${capacity.range.max} ${capacity.range.unit}` : "not available"}\n\n${capacity.verdict}\n${capacity.status === "not_run" ? `\nMissing evidence:\n${capacity.missingEvidence.map((item) => `- ${item}`).join("\n")}\n` : ""}`,
    "docs/score.json": JSON.stringify(score, null, 2),
    ...(job.quality?.aegis
      ? {
          "docs/security.json": JSON.stringify(job.quality.aegis, null, 2),
          "docs/security.md": `# Aegis static security report\n\nEvidence: measured static scan\n\nArtifact: ${job.quality.aegis.artifactSha256}\n\nBlockers: ${job.quality.aegis.blockerCount}\n\n${
            job.quality.aegis.findings.length
              ? job.quality.aegis.findings
                  .map(
                    (finding) =>
                      `- ${finding.severity.toUpperCase()} · ${finding.category}: ${finding.message} (${finding.evidence})`,
                  )
                  .join("\n")
              : "No findings in the scanner scope."
          }\n\nLimitations:\n${job.quality.aegis.limitations.map((item) => `- ${item}`).join("\n")}\n`,
        }
      : {}),
    ...(job.quality?.twin || job.quality?.echo || job.quality?.swift
      ? {
          "docs/qa.json": JSON.stringify(
            {
              twin: job.quality?.twin ?? null,
              echo: job.quality?.echo ?? null,
              swift: job.quality?.swift ?? null,
            },
            null,
            2,
          ),
          "docs/qa.md": `# Browser QA evidence\n\n## Twin\n${job.quality?.twin ? `${job.quality.twin.status} · ${job.quality.twin.evidence} · artifact ${job.quality.twin.artifactSha256}` : "not_run · report missing"}\n\n## Echo\n${job.quality?.echo ? `${job.quality.echo.status} · ${job.quality.echo.evidence} · artifact ${job.quality.echo.artifactSha256}` : "not_run · report missing"}\n\n## Swift\n${job.quality?.swift ? `${job.quality.swift.status} · ${job.quality.swift.evidence} · artifact ${job.quality.swift.artifactSha256}` : "not_run · report missing"}\n`,
        }
      : {}),
    "index.html": html,
  };
}
