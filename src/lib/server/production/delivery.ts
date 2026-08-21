import {
  PRODUCTION_STAGE_ORDER,
  ProductionRequirementsSchema,
  canonicalProductionContractFile,
  deriveRequiredProductionStages,
  type ProductionStageId,
} from "@/lib/production-artifact-graph";
import {
  ProductionStageDeliverySchema,
  TrustedProductionScaffoldSchema,
  type ProductionDeliveryState,
  type ProductionStageDelivery,
  type TrustedProductionScaffold,
} from "@/lib/server/production/types";

type PathRule = string | { readonly prefix: string };

const STAGE_OUTPUT_RULES = {
  prism: [{ prefix: "db/migrations/" }, "db/schema.sql"],
  basalt: ["server/env.js", "server/errors.js", "server/index.js", { prefix: "server/core/" }],
  key: [{ prefix: "server/auth/" }],
  nexus: [{ prefix: "server/integrations/" }],
  vault: [{ prefix: "server/api/" }, { prefix: "server/schemas/" }],
  quartz: ["db/rollback.sql", { prefix: "docs/database/" }],
  forgeIntegration: [{ prefix: "apps/web/src/integrations/" }],
  nimbus: [
    ".env.example",
    "netlify.toml",
    { prefix: "infra/" },
    { prefix: "server/runtime/" },
  ],
} as const satisfies Readonly<Record<ProductionStageId, readonly PathRule[]>>;

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function foldPath(path: string): string {
  return path.normalize("NFC").toLocaleLowerCase("en-US");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => compareText(left, right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashProductionWorkspace(
  files: Readonly<Record<string, string>>,
): Promise<string> {
  return sha256Hex(
    stableJson(
      Object.entries(files)
        .sort(([left], [right]) => compareText(left, right))
        .map(([path, content]) => ({ path, content })),
    ),
  );
}

function isOwnedOutput(stageId: ProductionStageId, path: string): boolean {
  return STAGE_OUTPUT_RULES[stageId].some((rule) =>
    typeof rule === "string" ? path === rule : path.startsWith(rule.prefix),
  );
}

function assertStageOwnership(delivery: ProductionStageDelivery): void {
  for (const file of delivery.outputFiles) {
    if (!isOwnedOutput(delivery.stageId, file.path)) {
      throw new Error(
        `Production stage ${delivery.stageId} cannot own output path ${file.path}`,
      );
    }
  }
  const testPrefix = `tests/${delivery.stageId}/`;
  for (const file of delivery.testFiles) {
    if (!file.path.startsWith(testPrefix)) {
      throw new Error(
        `Production stage ${delivery.stageId} cannot own test path ${file.path}`,
      );
    }
  }
}

function assertNoPathCollisions(
  existing: Readonly<Record<string, string>>,
  delivery: ProductionStageDelivery,
): void {
  const occupied = new Map<string, string>();
  for (const path of Object.keys(existing)) {
    occupied.set(foldPath(path), path);
  }
  const additions = [
    ...delivery.outputFiles,
    ...delivery.testFiles,
    { path: delivery.artifact.contractPath, content: "" },
  ];
  for (const file of additions) {
    const collision = occupied.get(foldPath(file.path));
    if (collision !== undefined) {
      throw new Error(
        `Production delivery path collision: ${file.path} conflicts with ${collision}`,
      );
    }
    occupied.set(foldPath(file.path), file.path);
  }
}

function parseRequirementsFromScaffold(
  scaffold: TrustedProductionScaffold,
): ReturnType<typeof ProductionRequirementsSchema.parse> {
  const requirementsFile = scaffold.files.find(
    (file) => file.path === "docs/requirements.json",
  );
  if (!requirementsFile) {
    throw new Error("Trusted Production scaffold is missing docs/requirements.json");
  }
  let source: unknown;
  try {
    source = JSON.parse(requirementsFile.content);
  } catch {
    throw new Error("Trusted Production scaffold requirements are not valid JSON");
  }
  return ProductionRequirementsSchema.parse(source);
}

export async function createProductionDeliveryState(
  source: TrustedProductionScaffold,
): Promise<ProductionDeliveryState> {
  const scaffold = TrustedProductionScaffoldSchema.parse(source);
  if (!scaffold.files.some((file) => file.path === scaffold.entrypoint)) {
    throw new Error("Trusted Production scaffold entrypoint does not exist");
  }
  const files = Object.freeze(
    Object.fromEntries(scaffold.files.map((file) => [file.path, file.content])),
  );
  const requirements = parseRequirementsFromScaffold(scaffold);
  const actualRequirementsSha256 = await sha256Hex(
    canonicalProductionContractFile(requirements),
  );
  if (actualRequirementsSha256 !== scaffold.approvedRequirementsSha256) {
    throw new Error("Trusted Production scaffold requirements hash does not match its fence");
  }
  if (requirements.runtimeProfile !== scaffold.runtimeProfile) {
    throw new Error("Trusted Production scaffold runtime profile is inconsistent");
  }
  return {
    files,
    workspaceSha256: await hashProductionWorkspace(files),
    completedStages: Object.freeze([]),
    requirements,
  };
}

export async function applyProductionStageDelivery(
  state: ProductionDeliveryState,
  source: ProductionStageDelivery,
): Promise<ProductionDeliveryState> {
  const delivery = ProductionStageDeliverySchema.parse(source);
  const currentHash = await hashProductionWorkspace(state.files);
  if (currentHash !== state.workspaceSha256) {
    throw new Error("Production delivery state has been mutated outside the delivery boundary");
  }
  if (delivery.baseWorkspaceSha256 !== currentHash) {
    throw new Error(
      `Stale Production delivery for ${delivery.stageId}: base workspace hash does not match`,
    );
  }

  const required = deriveRequiredProductionStages(state.requirements);
  if (!required[delivery.stageId]) {
    throw new Error(`Production stage is not required by the approved requirements: ${delivery.stageId}`);
  }
  if (state.completedStages.includes(delivery.stageId)) {
    throw new Error(`Production stage has already delivered: ${delivery.stageId}`);
  }
  const expectedStage = PRODUCTION_STAGE_ORDER.find(
    (stageId) => required[stageId] && !state.completedStages.includes(stageId),
  );
  if (delivery.stageId !== expectedStage) {
    throw new Error(
      `Production stage delivery is out of canonical order: expected ${expectedStage ?? "none"}, received ${delivery.stageId}`,
    );
  }

  assertStageOwnership(delivery);
  assertNoPathCollisions(state.files, delivery);

  const nextFiles = Object.freeze({
    ...state.files,
    ...Object.fromEntries(delivery.outputFiles.map((file) => [file.path, file.content])),
    ...Object.fromEntries(delivery.testFiles.map((file) => [file.path, file.content])),
    [delivery.artifact.contractPath]: canonicalProductionContractFile(delivery.artifact),
  });
  return {
    files: nextFiles,
    workspaceSha256: await hashProductionWorkspace(nextFiles),
    completedStages: Object.freeze([...state.completedStages, delivery.stageId]),
    requirements: state.requirements,
  };
}
