import { z } from "zod";
import {
  BasaltArtifactSchema,
  ForgeIntegrationArtifactSchema,
  KeyArtifactSchema,
  NexusArtifactSchema,
  NimbusArtifactSchema,
  PrismArtifactSchema,
  ProductionArchitectureEvidenceSchema,
  ProductionPrdEvidenceSchema,
  ProductionRequirementsSchema,
  ProductionStageIdSchema,
  QuartzArtifactSchema,
  VaultArtifactSchema,
  type ProductionRequirements,
  type ProductionStageId,
} from "@/lib/production-artifact-graph";
import { DesignDirectionSchema } from "@/lib/server/agents/types";
import type { NimbusStageDecisionEvidenceInput } from "@/lib/server/production/nimbus-decision";
import { WorkspacePathSchema } from "@/lib/workspace";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MAX_GENERATED_FILE_BYTES = 512 * 1024;

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function foldedPath(path: string): string {
  return path.normalize("NFC").toLocaleLowerCase("en-US");
}

function assertSortedUniqueFiles(
  files: readonly { path: string }[],
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  let prior: string | undefined;
  for (const [index, file] of files.entries()) {
    const folded = foldedPath(file.path);
    if (seen.has(folded)) {
      context.addIssue({
        code: "custom",
        path: [index, "path"],
        message: "Generated file paths must be unique under NFC/case folding",
      });
    }
    if (prior !== undefined && compareText(prior, file.path) >= 0) {
      context.addIssue({
        code: "custom",
        path: [index, "path"],
        message: "Generated files must be sorted by path",
      });
    }
    seen.add(folded);
    prior = file.path;
  }
}

export const ProductionGeneratedFileSchema = z
  .object({
    path: WorkspacePathSchema,
    content: z.string(),
  })
  .strict()
  .superRefine((file, context) => {
    if (new TextEncoder().encode(file.content).byteLength > MAX_GENERATED_FILE_BYTES) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message: `Generated files cannot exceed ${MAX_GENERATED_FILE_BYTES} UTF-8 bytes`,
      });
    }
  });

const SortedGeneratedFilesSchema = z
  .array(ProductionGeneratedFileSchema)
  .min(1)
  .max(128)
  .superRefine(assertSortedUniqueFiles);

export const ProductionStageArtifactSchema = z.union([
  PrismArtifactSchema,
  BasaltArtifactSchema,
  KeyArtifactSchema,
  NexusArtifactSchema,
  VaultArtifactSchema,
  QuartzArtifactSchema,
  ForgeIntegrationArtifactSchema,
  NimbusArtifactSchema,
]);

export type ProductionStageArtifact = z.infer<typeof ProductionStageArtifactSchema>;

export const PRODUCTION_STAGE_ARTIFACT_KINDS = {
  prism: "prism_database_artifact",
  basalt: "basalt_backend_artifact",
  key: "key_auth_artifact",
  nexus: "nexus_integrations_artifact",
  vault: "vault_api_artifact",
  quartz: "quartz_database_review_artifact",
  forgeIntegration: "forge_integration_artifact",
  nimbus: "nimbus_infrastructure_artifact",
} as const satisfies Readonly<Record<ProductionStageId, ProductionStageArtifact["kind"]>>;

export const ProductionStageDeliverySchema = z
  .object({
    kind: z.literal("helix_production_stage_delivery"),
    schemaVersion: z.literal("1.0.0"),
    stageId: ProductionStageIdSchema,
    baseWorkspaceSha256: z.string().regex(SHA256_PATTERN),
    artifact: ProductionStageArtifactSchema,
    outputFiles: SortedGeneratedFilesSchema,
    testFiles: SortedGeneratedFilesSchema,
  })
  .strict()
  .superRefine((delivery, context) => {
    if (delivery.artifact.kind !== PRODUCTION_STAGE_ARTIFACT_KINDS[delivery.stageId]) {
      context.addIssue({
        code: "custom",
        path: ["artifact", "kind"],
        message: `Artifact kind does not belong to Production stage ${delivery.stageId}`,
      });
    }

    const outputPaths = delivery.outputFiles.map((file) => file.path);
    const testPaths = delivery.testFiles.map((file) => file.path);
    if (JSON.stringify(outputPaths) !== JSON.stringify(delivery.artifact.outputPaths)) {
      context.addIssue({
        code: "custom",
        path: ["outputFiles"],
        message: "Delivered output files must exactly match artifact.outputPaths",
      });
    }
    if (JSON.stringify(testPaths) !== JSON.stringify(delivery.artifact.testPaths)) {
      context.addIssue({
        code: "custom",
        path: ["testFiles"],
        message: "Delivered test files must exactly match artifact.testPaths",
      });
    }

    const seen = new Set<string>();
    for (const [group, files] of [
      ["outputFiles", delivery.outputFiles],
      ["testFiles", delivery.testFiles],
    ] as const) {
      for (const [index, file] of files.entries()) {
        const folded = foldedPath(file.path);
        if (seen.has(folded)) {
          context.addIssue({
            code: "custom",
            path: [group, index, "path"],
            message: "A Production delivery cannot reuse an output or test path",
          });
        }
        seen.add(folded);
      }
    }
    if (seen.has(foldedPath(delivery.artifact.contractPath))) {
      context.addIssue({
        code: "custom",
        path: ["artifact", "contractPath"],
        message: "The canonical contract path is reserved for the delivery boundary",
      });
    }
  });

export type ProductionGeneratedFile = z.infer<typeof ProductionGeneratedFileSchema>;
export type ProductionStageDelivery = z.infer<typeof ProductionStageDeliverySchema>;

export const ApprovedProductionContextSchema = z
  .object({
    requirements: ProductionRequirementsSchema,
    prd: ProductionPrdEvidenceSchema,
    architecture: ProductionArchitectureEvidenceSchema,
  })
  .strict();

export type ApprovedProductionContext = {
  requirements: ProductionRequirements;
  prd: z.infer<typeof ProductionPrdEvidenceSchema>;
  architecture: z.infer<typeof ProductionArchitectureEvidenceSchema>;
};

const ProductionLogicIdentifierSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,79}$/u);

export const ProductionForgeLogicIntentSchema = z
  .object({
    kind: z.literal("forge_logic_intent"),
    schemaVersion: z.literal("1.0.0"),
    controls: z
      .array(
        z
          .object({
            id: ProductionLogicIdentifierSchema,
            label: z.string().trim().min(1).max(240),
            event: z.enum(["click", "change", "input", "submit", "keydown"]),
          })
          .strict(),
      )
      .min(1)
      .max(32),
    forms: z
      .array(
        z
          .object({
            id: ProductionLogicIdentifierSchema,
            fieldNames: z.array(ProductionLogicIdentifierSchema).max(24),
            requiredFieldNames: z.array(ProductionLogicIdentifierSchema).max(24),
          })
          .strict(),
      )
      .max(12),
    stateTargets: z.array(ProductionLogicIdentifierSchema).max(32),
    validationSignals: z
      .array(z.enum(["required", "pattern", "check_validity", "custom_validity"]))
      .max(4),
    stateSignals: z
      .array(z.enum(["text", "class", "data", "visibility", "disabled", "value"]))
      .min(1)
      .max(6),
  })
  .strict()
  .superRefine((intent, context) => {
    for (const form of intent.forms) {
      const fields = new Set(form.fieldNames);
      if (form.requiredFieldNames.some((name) => !fields.has(name))) {
        context.addIssue({
          code: "custom",
          path: ["forms"],
          message: "Required Forge form fields must exist in the same form",
        });
      }
    }
  });

export type ProductionForgeLogicIntent = z.infer<
  typeof ProductionForgeLogicIntentSchema
>;

/**
 * Optional, typed creative evidence that a caller may obtain from Lumen and
 * Forge before deterministic Production assembly. The scaffold never invents
 * this evidence and never treats its presence as runtime validation.
 */
export const ProductionCreativeDirectionEvidenceSchema = z
  .object({
    kind: z.literal("helix_production_creative_direction"),
    schemaVersion: z.literal("1.0.0"),
    source: z.literal("lumen_forge"),
    selectedDirection: DesignDirectionSchema,
    selectionRationale: z.string().trim().min(1).max(2_000),
    forgeUiIntent: z.array(z.string().trim().min(1).max(1_000)).min(1).max(32),
    forgeLogicIntent: ProductionForgeLogicIntentSchema,
  })
  .strict();

export type ProductionCreativeDirectionEvidence = z.infer<
  typeof ProductionCreativeDirectionEvidenceSchema
>;

export const TrustedProductionScaffoldSchema = z
  .object({
    kind: z.literal("helix_trusted_production_scaffold"),
    schemaVersion: z.literal("1.0.0"),
    source: z.literal("helix_built_in_template"),
    runtimeProfile: ProductionRequirementsSchema.shape.runtimeProfile,
    packageManager: z.literal("npm@10"),
    entrypoint: WorkspacePathSchema,
    approvedRequirementsSha256: z.string().regex(SHA256_PATTERN),
    files: z
      .array(ProductionGeneratedFileSchema)
      .min(1)
      .max(96)
      .superRefine(assertSortedUniqueFiles),
  })
  .strict();

export type TrustedProductionScaffold = z.infer<typeof TrustedProductionScaffoldSchema>;

export type ProductionDeliveryState = {
  readonly files: Readonly<Record<string, string>>;
  readonly workspaceSha256: string;
  readonly completedStages: readonly ProductionStageId[];
  readonly requirements: ProductionRequirements;
};

export type ProductionStageGeneratorInput = {
  readonly requirements: ProductionRequirements;
  readonly baseWorkspaceSha256: string;
  readonly nimbusDecisionEvidence?: NimbusStageDecisionEvidenceInput;
};
