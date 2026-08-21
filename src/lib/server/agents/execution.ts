import { z } from "zod";
import {
  AGENT_CONTRACTS,
  AgentExecutionErrorSchema,
  type AgentContractId,
} from "@/lib/server/agents/contracts";
import { sha256Hex } from "@/lib/server/agents/patch";

const AgentArtifactEvidenceSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    validation: z.literal("passed"),
  })
  .strict();

export const AgentExecutionEnvelopeSchema = z.discriminatedUnion("status", [
  z
    .object({
      contractId: z.string().trim().min(1),
      status: z.literal("queued"),
      artifact: z.null(),
      error: z.null(),
    })
    .strict(),
  z
    .object({
      contractId: z.string().trim().min(1),
      status: z.literal("running"),
      artifact: z.null(),
      error: z.null(),
    })
    .strict(),
  z
    .object({
      contractId: z.string().trim().min(1),
      status: z.literal("done"),
      artifact: AgentArtifactEvidenceSchema,
      error: z.null(),
    })
    .strict(),
  z
    .object({
      contractId: z.string().trim().min(1),
      status: z.literal("error"),
      artifact: z.null(),
      error: AgentExecutionErrorSchema,
    })
    .strict(),
  z
    .object({
      contractId: z.string().trim().min(1),
      status: z.literal("skipped"),
      artifact: z.null(),
      error: z.null(),
      reason: z.string().trim().min(1).max(2_000),
    })
    .strict(),
]);

export type AgentExecutionEnvelope = z.infer<typeof AgentExecutionEnvelopeSchema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("AGENT_ARTIFACT_NOT_SERIALIZABLE");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function serializedArtifact(value: unknown): string {
  return typeof value === "string" ? value : canonicalJson(value);
}

export async function completeAgentExecution(
  contractId: AgentContractId,
  output: unknown,
): Promise<AgentExecutionEnvelope> {
  const contract = AGENT_CONTRACTS[contractId];
  const parsed = contract.outputSchema.safeParse(output);
  if (!parsed.success) throw new Error("AGENT_OUTPUT_VALIDATION_FAILED");
  const envelope = {
    contractId,
    status: "done" as const,
    artifact: {
      name: contract.artifact,
      sha256: await sha256Hex(serializedArtifact(parsed.data)),
      validation: "passed" as const,
    },
    error: null,
  };
  return validateAgentExecution(contractId, envelope);
}

export function validateAgentExecution(
  contractId: AgentContractId,
  value: unknown,
): AgentExecutionEnvelope {
  const parsed = AgentExecutionEnvelopeSchema.safeParse(value);
  if (!parsed.success || parsed.data.contractId !== contractId) {
    throw new Error("AGENT_EXECUTION_ENVELOPE_INVALID");
  }
  const contract = AGENT_CONTRACTS[contractId];
  if (
    parsed.data.status === "done" &&
    parsed.data.artifact.name !== contract.artifact
  ) {
    throw new Error("AGENT_EXECUTION_ARTIFACT_MISMATCH");
  }
  return parsed.data;
}
