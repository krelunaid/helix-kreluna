import type { BuildJob, AgentStep, Thought } from "@/lib/agent-types";
import { HOUSE_BY_ID, agentByName, type Gear } from "@/lib/house";
import { htmlForPrompt } from "@/lib/templates";
import { titleFromPrompt } from "@/lib/utils";
import type { Locale } from "@/lib/i18n-core";
import { HELIX_PIPELINE_VERSION } from "@/lib/server/jobs/pipeline";
import { AGENT_CONTRACTS } from "@/lib/server/agents/contracts";
import { parseBuildLevel, type BuildLevel } from "@/lib/build-level";

export type BuildJobDraftInput = {
  prompt: string;
  locale: Locale;
  mode: BuildJob["mode"];
  buildLevel?: BuildLevel;
  currentHtml: string | null;
  projectId?: string;
  userId?: string;
  guestAccessTokenHash?: string;
  guestAccessExpiresAt?: number;
  guestBudgetLease?: BuildJob["guestBudgetLease"];
  gear?: Gear;
  max?: boolean;
};

function initialStep(): AgentStep {
  const helix = HOUSE_BY_ID.gemini;
  return {
    id: "gemini",
    agent: helix.name,
    role: helix.role,
    desk: helix.desk,
    kind: "orchestrator",
    version: AGENT_CONTRACTS.helix.version,
    artifact: AGENT_CONTRACTS.helix.artifact,
    status: "queued",
    detail: "",
  };
}

function initialThought(input: BuildJobDraftInput): Thought {
  const helix = agentByName("Helix");
  const text =
    input.locale === "it"
      ? `Preso. «${input.prompt.slice(0, 90)}». ${
          input.gear === "fast"
            ? "Veloce: pochi desk."
            : input.gear === "house"
              ? "House intera."
              : "Auto: scelgo io chi entra."
        }${input.max ? " Max acceso." : ""}`
      : `Taken. “${input.prompt.slice(0, 90)}”. ${
          input.gear === "fast"
            ? "Fast: few desks."
            : input.gear === "house"
              ? "Full house."
              : "Auto: I pick who works."
        }${input.max ? " Max on." : ""}`;
  return {
    at: Date.now(),
    agent: "Helix",
    text,
    role: helix?.role ?? "Supervisor",
    craft: input.locale === "it" ? (helix?.craftIt ?? "Orchestrazione") : (helix?.craft ?? "Orchestration"),
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fingerprintBuildRequest(input: BuildJobDraftInput): Promise<string> {
  const canonical = JSON.stringify({
    prompt: input.prompt,
    locale: input.locale,
    mode: input.mode,
    buildLevel: parseBuildLevel(input.buildLevel),
    currentHtml: input.currentHtml,
    projectId: input.projectId ?? null,
    userId: input.userId ?? null,
    gear: input.gear ?? "auto",
    max: Boolean(input.max),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return bytesToHex(new Uint8Array(digest));
}

export async function createBuildJobDraft(
  input: BuildJobDraftInput,
): Promise<{ job: BuildJob; requestFingerprint: string }> {
  const requestFingerprint = await fingerprintBuildRequest(input);
  const seed =
    input.currentHtml && input.currentHtml.length > 40
      ? input.currentHtml
      : htmlForPrompt(input.prompt, input.locale);
  const job: BuildJob = {
    id: crypto.randomUUID(),
    prompt: input.prompt,
    locale: input.locale,
    mode: input.mode,
    buildLevel: parseBuildLevel(input.buildLevel),
    gear: input.gear ?? "auto",
    max: Boolean(input.max),
    currentHtml: input.currentHtml ?? seed,
    status: "running",
    steps: [initialStep()],
    html: seed,
    usedAi: false,
    title: titleFromPrompt(input.prompt, input.locale),
    projectId: input.projectId,
    userId: input.userId,
    guestAccessTokenHash: input.guestAccessTokenHash,
    guestAccessExpiresAt: input.guestAccessExpiresAt,
    guestBudgetLease: input.guestBudgetLease,
    requestFingerprint,
    createdAt: Date.now(),
    checkpoint: {
      pipelineVersion: HELIX_PIPELINE_VERSION,
      requestFingerprint,
      stage: "queued",
    },
  };
  job.thoughts = [initialThought(input)];
  return { job, requestFingerprint };
}
