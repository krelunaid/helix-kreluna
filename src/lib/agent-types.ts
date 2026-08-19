import type { Locale } from "@/lib/i18n-core";
import type { HouseId, Gear } from "@/lib/house";
import type { KrelunaScore } from "@/lib/score";
import type { GemRun } from "@/lib/gems";

export type AgentId = HouseId;

export type AgentStep = {
  id: AgentId;
  agent: string;
  role: string;
  desk?: string;
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
  gear?: Gear;
  max?: boolean;
  currentHtml: string | null;
  status: "running" | "ready" | "error";
  steps: AgentStep[];
  html: string | null;
  usedAi: boolean;
  wire?: string | null;
  beat?: number | null;
  title: string;
  error?: string;
  projectId?: string;
  userId?: string;
  createdAt: number;
  briefing?: string;
  score?: KrelunaScore;
  interventions?: string[];
  memory?: MemoryEntry[];
  files?: Record<string, string>;
  gate?: "approve" | "open";
  thoughts?: Thought[];
  look?: string;
  designMood?: string;
  gems?: GemRun[];
  liveUrl?: string;
  stores?: { appStore: string; play: string; testersUrl: string; testersCode: string };
};
