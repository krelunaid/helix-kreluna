import {
  PRODUCTION_STAGE_ORDER,
  ProductionArtifactBundleSchema,
  ProductionProvenanceArtifactSchema,
  canonicalProductionContractFile,
  type ProductionArtifactBundle,
  type ProductionFileOwner,
  type ProductionProvenanceArtifact,
  type ProductionStageId,
} from "@/lib/production-artifact-graph";
import {
  applyProductionStageDelivery,
  createProductionDeliveryState,
} from "@/lib/server/production/delivery";
import { createTrustedProductionScaffold } from "@/lib/server/production/scaffold";
import {
  generateProductionStageDelivery,
  requiredProductionStageIds,
} from "@/lib/server/production/stages";
import type {
  ApprovedProductionContext,
  ProductionCreativeDirectionEvidence,
  ProductionStageArtifact,
} from "@/lib/server/production/types";
import type {
  NimbusDecisionEvidenceProvider,
  NimbusStageDecisionEvidenceInput,
} from "@/lib/server/production/nimbus-decision";
import { inferWorkspaceFileRole } from "@/lib/workspace";

const PROVENANCE_PATH = "docs/artifacts/provenance.json";

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function scaffoldOwner(path: string, entrypoint: string): ProductionFileOwner {
  if (path === "docs/requirements.json") return "atlas";
  const role = inferWorkspaceFileRole(path, entrypoint);
  switch (role) {
    case "entrypoint":
    case "asset":
      return "forgeUi";
    case "source":
      return path.startsWith("apps/web/") ? "forgeUi" : "forgeLogic";
    case "readme":
    case "documentation":
      return "folio";
    case "prd":
      return "nova";
    case "architecture":
      return "atlas";
    case "environment":
    case "deployment":
      return "nimbus";
    case "migration":
      return "atlas";
    case "test":
      return "kiln";
    case "decision":
      return "archive";
    case "score":
      return "score";
    case "configuration":
      return "helix";
  }
}

function createCanonicalProvenance(
  files: Readonly<Record<string, string>>,
  entrypoint: string,
  artifacts: ProductionArtifactBundle,
): ProductionProvenanceArtifact {
  const owners = new Map<string, ProductionFileOwner>();
  const paths = [...Object.keys(files), PROVENANCE_PATH].sort(compareText);
  for (const path of paths) owners.set(path, scaffoldOwner(path, entrypoint));
  owners.set(PROVENANCE_PATH, "helix");
  for (const stageId of PRODUCTION_STAGE_ORDER) {
    const artifact = artifacts[stageId];
    if (!artifact) continue;
    owners.set(artifact.contractPath, stageId);
    for (const path of artifact.outputPaths) owners.set(path, stageId);
    for (const path of artifact.testPaths) owners.set(path, "kiln");
  }
  return ProductionProvenanceArtifactSchema.parse({
    kind: "helix_production_file_provenance",
    schemaVersion: "1.0.0",
    contractPath: PROVENANCE_PATH,
    files: paths.map((path) => ({ path, owner: owners.get(path) })),
  });
}

export type AssembledProductionSource = {
  readonly files: Readonly<Record<string, string>>;
  readonly requirements: ApprovedProductionContext["requirements"];
  readonly artifacts: ProductionArtifactBundle;
  readonly provenance: ProductionProvenanceArtifact;
  readonly entrypoint: string;
};

export async function assembleProductionSource(
  context: ApprovedProductionContext,
  options: {
    creativeEvidence?: ProductionCreativeDirectionEvidence;
    nimbusDecisionEvidence?: NimbusStageDecisionEvidenceInput;
    nimbusDecisionEvidenceProvider?: NimbusDecisionEvidenceProvider;
  } = {},
): Promise<AssembledProductionSource> {
  if (options.nimbusDecisionEvidence && options.nimbusDecisionEvidenceProvider) {
    throw new Error("Nimbus decision evidence must have exactly one source");
  }
  const scaffold = await createTrustedProductionScaffold(
    context,
    options.creativeEvidence,
  );
  let state = await createProductionDeliveryState(scaffold);
  const artifactSource = Object.fromEntries(
    PRODUCTION_STAGE_ORDER.map((stageId) => [stageId, null]),
  ) as Record<ProductionStageId, ProductionStageArtifact | null>;

  for (const stageId of requiredProductionStageIds(state.requirements)) {
    const nimbusDecisionEvidence =
      stageId === "nimbus"
        ? options.nimbusDecisionEvidenceProvider
          ? await options.nimbusDecisionEvidenceProvider({
              productionRequirements: state.requirements,
              baseWorkspaceSha256: state.workspaceSha256,
            })
          : options.nimbusDecisionEvidence
        : undefined;
    const delivery = generateProductionStageDelivery(stageId, {
      requirements: state.requirements,
      baseWorkspaceSha256: state.workspaceSha256,
      ...(nimbusDecisionEvidence ? { nimbusDecisionEvidence } : {}),
    });
    state = await applyProductionStageDelivery(state, delivery);
    artifactSource[stageId] = delivery.artifact;
  }

  const artifacts = ProductionArtifactBundleSchema.parse(artifactSource);
  const provenance = createCanonicalProvenance(state.files, scaffold.entrypoint, artifacts);
  const files = Object.freeze({
    ...state.files,
    [provenance.contractPath]: canonicalProductionContractFile(provenance),
  });
  return {
    files,
    requirements: state.requirements,
    artifacts,
    provenance,
    entrypoint: scaffold.entrypoint,
  };
}

export {
  applyProductionStageDelivery,
  createProductionDeliveryState,
  createTrustedProductionScaffold,
  generateProductionStageDelivery,
  requiredProductionStageIds,
};
