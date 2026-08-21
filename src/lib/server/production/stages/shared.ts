import {
  ProductionRequirementsSchema,
  deriveRequiredProductionStages,
  type ProductionRequirements,
  type ProductionStageId,
} from "@/lib/production-artifact-graph";
import {
  ProductionStageDeliverySchema,
  type ProductionGeneratedFile,
  type ProductionStageArtifact,
  type ProductionStageDelivery,
  type ProductionStageGeneratorInput,
} from "@/lib/server/production/types";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

export function parseStageInput(
  stageId: ProductionStageId,
  input: ProductionStageGeneratorInput,
): ProductionRequirements {
  const requirements = ProductionRequirementsSchema.parse(input.requirements);
  if (!SHA256_PATTERN.test(input.baseWorkspaceSha256)) {
    throw new Error("Production stage generator requires a SHA-256 workspace fence");
  }
  if (!deriveRequiredProductionStages(requirements)[stageId]) {
    throw new Error(`Production stage is not required by approved requirements: ${stageId}`);
  }
  return requirements;
}

export function artifactBase(
  kind: ProductionStageArtifact["kind"],
  contractPath: ProductionStageArtifact["contractPath"],
  outputPaths: readonly string[],
  testPaths: readonly string[],
  summary: string,
) {
  return {
    kind,
    schemaVersion: "1.0.0" as const,
    contractPath,
    status: "source_candidate" as const,
    summary,
    outputPaths: uniqueSorted(outputPaths),
    testPaths: uniqueSorted(testPaths),
    evidencePaths: ["docs/requirements.json"],
  };
}

export function generatedFile(path: string, content: string): ProductionGeneratedFile {
  return { path, content: content.endsWith("\n") ? content : `${content}\n` };
}

export function makeStageDelivery(
  stageId: ProductionStageId,
  input: ProductionStageGeneratorInput,
  artifact: ProductionStageArtifact,
  outputFiles: readonly ProductionGeneratedFile[],
  testFiles: readonly ProductionGeneratedFile[],
): ProductionStageDelivery {
  return ProductionStageDeliverySchema.parse({
    kind: "helix_production_stage_delivery",
    schemaVersion: "1.0.0",
    stageId,
    baseWorkspaceSha256: input.baseWorkspaceSha256,
    artifact,
    outputFiles: [...outputFiles].sort((left, right) => compareText(left.path, right.path)),
    testFiles: [...testFiles].sort((left, right) => compareText(left.path, right.path)),
  });
}

export function javascriptValue(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function relativeFromStageTest(path: string): string {
  return `../../${path}`;
}
