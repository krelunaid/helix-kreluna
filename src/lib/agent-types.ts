import type { Locale } from "@/lib/i18n-core";
import type { HouseId, Gear } from "@/lib/house";
import type { KrelunaScore } from "@/lib/score";
import type { GemRun } from "@/lib/gems";
import type { BuildQualityEvidence } from "@/lib/server/quality/types";
import type { BuildLevel } from "@/lib/build-level";
import type { WorkspaceManifest } from "@/lib/workspace";
import type { AiJobUsageSummary } from "@/lib/server/ai/types";

export type AgentId = HouseId;

export type AgentStep = {
  id: AgentId;
  agent: string;
  role: string;
  desk?: string;
  kind: "orchestrator" | "ai_agent" | "validator" | "scanner" | "service" | "gate" | "rule";
  version?: string;
  artifact?: string;
  validation?: "validated" | "estimated" | "not_run";
  errorCode?: string;
  status: "queued" | "running" | "done" | "skipped" | "error" | "standby";
  detail: string;
};

export type MemoryEntry = {
  at: number;
  agent: string;
  decision: string;
};

export type Thought = {
  at: number;
  agent: string;
  text: string;
  role?: string;
  craft?: string;
};

export type BuildJob = {
  id: string;
  prompt: string;
  locale: Locale;
  mode: "generate" | "iterate" | "debug" | "host";
  /** Product fidelity, distinct from the generate/iterate/debug action. */
  buildLevel: BuildLevel;
  gear?: Gear;
  max?: boolean;
  currentHtml: string | null;
  status: "running" | "ready" | "error" | "cancelled";
  steps: AgentStep[];
  html: string | null;
  usedAi: boolean;
  wire?: string | null;
  beat?: number | null;
  title: string;
  error?: string;
  projectId?: string;
  userId?: string;
  /** Server-only guest access metadata. Never include it in a public DTO. */
  guestAccessTokenHash?: string;
  /** Unix epoch milliseconds. Server-only; never include it in a public DTO. */
  guestAccessExpiresAt?: number;
  /** Server-only persistent abuse-control lease. Never include it in a public DTO. */
  guestBudgetLease?: {
    identityHash: string;
    action: "publish" | "ai_generation";
    leaseId: string;
    windowStart: string;
  };
  /** Server-only immutable request fingerprint from the durable queue row. */
  requestFingerprint?: string;
  createdAt: number;
  briefing?: string;
  score?: KrelunaScore;
  /** Provider-measured AI usage plus conservative budget accounting. */
  aiUsage?: AiJobUsageSummary;
  quality?: BuildQualityEvidence;
  interventions?: string[];
  memory?: MemoryEntry[];
  files?: Record<string, string>;
  /** Hash-bound descriptor only; source files remain server-side. */
  workspace?: WorkspaceManifest;
  thoughts?: Thought[];
  look?: string;
  designMood?: string;
  gems?: GemRun[];
  liveUrl?: string;
  stores?: { appStore: string; play: string; testersUrl: string; testersCode: string };
  checkpoint?: {
    pipelineVersion: string;
    requestFingerprint: string;
    stage:
      | "queued"
      | "planned"
      | "architected"
      | "designed"
      | "forge_ui"
      | "forged"
      | "gems"
      | "reviewed"
      | "patched"
      | "finalized";
    artifacts?: {
      plan?: unknown;
      architecture?: unknown;
      design?: unknown;
      designSelection?: unknown;
      structureHtml?: string;
      html?: string;
      usedAi?: boolean;
      review?: unknown;
    };
    gemIndex?: number;
  };
  queue?: {
    status:
      | "queued"
      | "running"
      | "retry"
      | "awaiting_human_approval"
      | "approved"
      | "rejected"
      | "deploying"
      | "deployed"
      | "failed"
      | "cancelled";
    attemptCount: number;
    maxAttempts: number;
    heartbeatAt?: number;
    artifactSha256?: string;
  };
  /** Process-local worker context. Never persist or expose it. */
  runtime?: {
    workerId: string;
    abortSignal: AbortSignal;
  };
};

export type PublicBuildJob = Omit<
  BuildJob,
  | "currentHtml"
  | "projectId"
  | "userId"
  | "guestAccessTokenHash"
  | "guestAccessExpiresAt"
  | "guestBudgetLease"
  | "requestFingerprint"
  | "checkpoint"
  | "runtime"
  | "stores"
  | "files"
> & {
  stores?: {
    appStore: string;
    play: string;
    testersUrl: string;
  };
};
