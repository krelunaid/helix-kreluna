import {
  PRODUCTION_STAGE_ORDER,
  ProductionRequirementsSchema,
  deriveRequiredProductionStages,
  type ProductionStageId,
} from "@/lib/production-artifact-graph";
import type {
  ProductionStageDelivery,
  ProductionStageGeneratorInput,
} from "@/lib/server/production/types";
import { generateBasaltDelivery } from "@/lib/server/production/stages/basalt";
import { generateForgeIntegrationDelivery } from "@/lib/server/production/stages/forge-integration";
import { generateKeyDelivery } from "@/lib/server/production/stages/key";
import { generateNexusDelivery } from "@/lib/server/production/stages/nexus";
import { generateNimbusDelivery } from "@/lib/server/production/stages/nimbus";
import { generatePrismDelivery } from "@/lib/server/production/stages/prism";
import { generateQuartzDelivery } from "@/lib/server/production/stages/quartz";
import { generateVaultDelivery } from "@/lib/server/production/stages/vault";

export {
  generateBasaltDelivery,
  generateForgeIntegrationDelivery,
  generateKeyDelivery,
  generateNexusDelivery,
  generateNimbusDelivery,
  generatePrismDelivery,
  generateQuartzDelivery,
  generateVaultDelivery,
};

type StageGenerator = (input: ProductionStageGeneratorInput) => ProductionStageDelivery;

export const PRODUCTION_STAGE_GENERATORS = Object.freeze({
  prism: generatePrismDelivery,
  basalt: generateBasaltDelivery,
  key: generateKeyDelivery,
  nexus: generateNexusDelivery,
  vault: generateVaultDelivery,
  quartz: generateQuartzDelivery,
  forgeIntegration: generateForgeIntegrationDelivery,
  nimbus: generateNimbusDelivery,
}) satisfies Readonly<Record<ProductionStageId, StageGenerator>>;

export function requiredProductionStageIds(source: unknown): ProductionStageId[] {
  const requirements = ProductionRequirementsSchema.parse(source);
  const required = deriveRequiredProductionStages(requirements);
  return PRODUCTION_STAGE_ORDER.filter((stageId) => required[stageId]);
}

export function generateProductionStageDelivery(
  stageId: ProductionStageId,
  input: ProductionStageGeneratorInput,
): ProductionStageDelivery {
  return PRODUCTION_STAGE_GENERATORS[stageId](input);
}
