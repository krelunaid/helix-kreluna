import type { AgentStep, BuildJob } from "@/lib/agent-types";
import { GEMS } from "@/lib/gems";
import {
  HOUSE_BY_ID,
  agentByName,
  craftOf,
  type HouseId,
} from "@/lib/house";
import {
  AGENT_CONTRACTS,
  type AgentContractId,
} from "@/lib/server/agents/contracts";
import { AgentOutputError } from "@/lib/server/agents/types";
import { HELIX_PIPELINE_VERSION } from "@/lib/server/jobs/pipeline";

const CONTRACT_BY_HOUSE_ID: Partial<Record<HouseId, AgentContractId>> = {
  gemini: "helix",
  nova: "nova",
  atlas: "atlas",
  lumen: "lumen",
  forge: "forgeLogic",
  iris: "iris",
  patch: "superior",
};

function stepKind(id: HouseId): AgentStep["kind"] {
  if (CONTRACT_BY_HOUSE_ID[id]) return id === "gemini" ? "orchestrator" : "ai_agent";
  if (["aegis", "veil", "echo"].includes(id)) return "scanner";
  if (["twin", "storm", "harbor", "nimbus", "warden", "orbit", "cedar"].includes(id)) {
    return "service";
  }
  if (id === "seal") return "gate";
  if (
    ["swift", "moth", "quill", "senate", "augur", "kiln", "beacon", "ledger", "mend"].includes(
      id,
    )
  ) {
    return "validator";
  }
  return "rule";
}

function stepFor(
  id: HouseId,
  status: AgentStep["status"] = "queued",
  detail = "",
): AgentStep {
  const agent = HOUSE_BY_ID[id];
  const contractId = CONTRACT_BY_HOUSE_ID[id];
  const contract = contractId ? AGENT_CONTRACTS[contractId] : undefined;
  const localContract =
    id === "aegis" ? { version: "1.0.0", artifact: "static_security_report" } : undefined;
  return {
    id,
    agent: agent.name,
    role: agent.role,
    desk: agent.desk,
    kind: stepKind(id),
    ...(contract
      ? { version: contract.version, artifact: contract.artifact }
      : (localContract ?? {})),
    status,
    detail,
  };
}

export function setStep(
  job: BuildJob,
  id: HouseId,
  patch: Partial<Omit<AgentStep, "id">>,
): void {
  const index = job.steps.findIndex((step) => step.id === id);
  if (index < 0) job.steps.push({ ...stepFor(id), ...patch });
  else job.steps[index] = { ...job.steps[index], ...patch };
}

export function setBrowserEvidenceStep(
  job: BuildJob,
  id: "twin" | "echo" | "swift",
  label: string,
  report: {
    status: "completed" | "failed" | "not_run";
    evidence: "measured" | "not_run";
    durationMs?: number;
    errorCode?: string;
    reasonCode?: string;
  },
): void {
  const completed = report.status === "completed";
  const failed = report.status === "failed";
  setStep(job, id, {
    status: completed ? "done" : failed ? "error" : "skipped",
    detail: completed
      ? `${label} measured · ${report.durationMs ?? 0} ms`
      : failed
        ? `${label} failed · ${report.errorCode ?? "unknown error"}`
        : `${label} not run · ${report.reasonCode ?? "runner unavailable"}`,
    validation: report.evidence === "measured" ? "validated" : "not_run",
  });
}

export function think(job: BuildJob, agent: string, it: string, en: string): void {
  const houseAgent = agentByName(agent);
  const gem = GEMS.find((candidate) => candidate.name === agent);
  const craft = houseAgent
    ? job.locale === "it"
      ? houseAgent.craftIt
      : houseAgent.craft
    : gem
      ? job.locale === "it"
        ? gem.craftIt
        : gem.craft
      : "";
  const role = houseAgent
    ? job.locale === "it"
      ? houseAgent.roleIt
      : houseAgent.role
    : gem
      ? job.locale === "it"
        ? gem.craftIt
        : gem.craft
      : "";
  job.thoughts = [
    ...(job.thoughts ?? []),
    { at: Date.now(), agent, text: job.locale === "it" ? it : en, role, craft },
  ];
  if (job.thoughts.length > 50) job.thoughts = job.thoughts.slice(-40);
}

export function pulse(
  job: BuildJob,
  agent: string,
  doingIt: string,
  doingEn: string,
): () => void {
  const start = Date.now();
  const id = setInterval(() => {
    const seconds = Math.round((Date.now() - start) / 1e3);
    const text = job.locale === "it" ? `${doingIt} ${seconds}s.` : `${doingEn} ${seconds}s.`;
    const previous = job.thoughts ?? [];
    const last = previous[previous.length - 1];
    if (last?.agent === agent && /\d+s/.test(last.text)) {
      last.text = text;
      last.at = Date.now();
      if (!last.craft) last.craft = craftOf(agent, job.locale);
      if (!last.role) last.role = agentByName(agent)?.role ?? "";
    } else {
      job.thoughts = [
        ...previous,
        {
          at: Date.now(),
          agent,
          text,
          craft: craftOf(agent, job.locale),
          role: agentByName(agent)?.role ?? "",
        },
      ];
    }
  }, 4_000);
  return () => clearInterval(id);
}

export function remember(job: BuildJob, agent: string, decision: string): void {
  job.memory = [...(job.memory ?? []), { at: Date.now(), agent, decision }];
}

export function loadPipeline(
  job: BuildJob,
  active: HouseId[],
  standby: HouseId[],
  why: string,
): void {
  setStep(job, "gemini", { status: "done", detail: why });
  const rest = active.filter((id) => id !== "gemini");
  job.steps = [
    job.steps.find((step) => step.id === "gemini") ?? stepFor("gemini", "done", why),
    ...rest.map((id) => stepFor(id)),
    ...standby.map((id) => stepFor(id, "standby", "Standby")),
  ];
}

type CheckpointStage = NonNullable<BuildJob["checkpoint"]>["stage"];
type CheckpointArtifacts = NonNullable<
  NonNullable<BuildJob["checkpoint"]>["artifacts"]
>;

export function checkpoint(
  job: BuildJob,
  stage: CheckpointStage,
  artifacts: CheckpointArtifacts = {},
  gemIndex = job.checkpoint?.gemIndex,
): void {
  if (!job.requestFingerprint) {
    throw new AgentOutputError("BUILD_JOB_FINGERPRINT_MISSING", false);
  }
  job.checkpoint = {
    pipelineVersion: HELIX_PIPELINE_VERSION,
    requestFingerprint: job.requestFingerprint,
    stage,
    artifacts: { ...(job.checkpoint?.artifacts ?? {}), ...artifacts },
    ...(gemIndex === undefined ? {} : { gemIndex }),
  };
}
