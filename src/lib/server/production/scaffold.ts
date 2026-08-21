import {
  ApprovedProductionContextSchema,
  ProductionCreativeDirectionEvidenceSchema,
  TrustedProductionScaffoldSchema,
  type ApprovedProductionContext,
  type ProductionCreativeDirectionEvidence,
  type ProductionGeneratedFile,
  type TrustedProductionScaffold,
} from "@/lib/server/production/types";
import {
  canonicalProductionContractFile,
  productionRequirementSnapshot,
} from "@/lib/production-artifact-graph";

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function packageManifest(needsPostgres: boolean): string {
  const dependencies = needsPostgres ? { pg: "8.23.0" } : undefined;
  const devDependencies = {
    ...(needsPostgres ? { "@types/pg": "8.23.1" } : {}),
    "@types/node": "22.20.1",
    typescript: "5.9.3",
  };
  return `${JSON.stringify(
    {
      name: "helix-production-workspace",
      version: "1.0.0",
      private: true,
      type: "module",
      engines: { node: ">=22" },
      scripts: {
        build: "node scripts/build.mjs",
        lint: "node scripts/lint.mjs",
        test: "node --test tests",
        typecheck: "tsc --noEmit",
      },
      ...(dependencies ? { dependencies } : {}),
      devDependencies,
    },
    null,
    2,
  )}\n`;
}

function packageLock(needsPostgres: boolean): string {
  const rootDependencies = needsPostgres ? { pg: "8.23.0" } : undefined;
  const rootDevDependencies = {
    ...(needsPostgres ? { "@types/pg": "8.23.1" } : {}),
    "@types/node": "22.20.1",
    typescript: "5.9.3",
  };
  const postgresPackages = needsPostgres
    ? {
        "node_modules/@types/pg": {
          version: "8.23.1",
          resolved: "https://registry.npmjs.org/@types/pg/-/pg-8.23.1.tgz",
          integrity:
            "sha512-fKVHpikPdg4GKks3JuLEhvwSyvwzF23hnabPy6DD8ljVbC7+6J5dQzdv4arV6jqq57djnMgs1HKBxX4P8aBI3A==",
          dev: true,
          license: "MIT",
          dependencies: {
            "@types/node": "*",
            "pg-protocol": "*",
            "pg-types": "^2.2.0",
          },
        },
        "node_modules/pg": {
          version: "8.23.0",
          resolved: "https://registry.npmjs.org/pg/-/pg-8.23.0.tgz",
          integrity:
            "sha512-Ip2EQCngowJLGOfCwkFhPXU7/ljlhn6Rxlmy4XYfL2Y+vyRM59+8uR2xqRWKdYmbXmxCFOAmKxBuSUCdF34qLg==",
          license: "MIT",
          dependencies: {
            "pg-connection-string": "^2.14.0",
            "pg-pool": "^3.14.0",
            "pg-protocol": "^1.16.0",
            "pg-types": "2.2.0",
            pgpass: "1.0.5",
          },
          engines: { node: ">= 16.0.0" },
          optionalDependencies: { "pg-cloudflare": "^1.4.0" },
          peerDependencies: { "pg-native": ">=3.0.1" },
          peerDependenciesMeta: { "pg-native": { optional: true } },
        },
        "node_modules/pg-cloudflare": {
          version: "1.4.0",
          resolved: "https://registry.npmjs.org/pg-cloudflare/-/pg-cloudflare-1.4.0.tgz",
          integrity:
            "sha512-Vo7z/6rrQYxpNRylp4Tlob2elzbh+N/MOQbxFVWCxS7oEx6jF53GTJFxK2WWpKuBRkmiin4Mt+xofFDjx09R0A==",
          license: "MIT",
          optional: true,
        },
        "node_modules/pg-connection-string": {
          version: "2.14.0",
          resolved:
            "https://registry.npmjs.org/pg-connection-string/-/pg-connection-string-2.14.0.tgz",
          integrity:
            "sha512-XwWDGcLRGCXAR8F/AM5bG7Q+A3Wm2s6QeEjlOKZLlH3UYcguiqCWKyWXVag5TLTIjR7oOJUY8kcADaZgWPyLeg==",
          license: "MIT",
        },
        "node_modules/pg-int8": {
          version: "1.0.1",
          resolved: "https://registry.npmjs.org/pg-int8/-/pg-int8-1.0.1.tgz",
          integrity:
            "sha512-WCtabS6t3c8SkpDBUlb1kjOs7l66xsGdKpIPZsg4wR+B3+u9UAum2odSsF9tnvxg80h4ZxLwMy4pRjOsFIqQpw==",
          license: "ISC",
          engines: { node: ">=4.0.0" },
        },
        "node_modules/pg-pool": {
          version: "3.14.0",
          resolved: "https://registry.npmjs.org/pg-pool/-/pg-pool-3.14.0.tgz",
          integrity:
            "sha512-gKtPkFdQPU3DksooVLi9LsjZxrsBUZIpa+7aVx+LV5pNh0KzP4Zleud2po+ConrxbuXGBJ6Hfer6hdgpIBpBaw==",
          license: "MIT",
          peerDependencies: { pg: ">=8.0" },
        },
        "node_modules/pg-protocol": {
          version: "1.16.0",
          resolved: "https://registry.npmjs.org/pg-protocol/-/pg-protocol-1.16.0.tgz",
          integrity:
            "sha512-sILXutLVjCLjcDuOmvhX5e2Z4cS5qG/6Bu3VkpFwdf/633ElGLpEh9bgmuI5I4sqKqkifQiGyiCcx1HdtrK7tg==",
          license: "MIT",
        },
        "node_modules/pg-types": {
          version: "2.2.0",
          resolved: "https://registry.npmjs.org/pg-types/-/pg-types-2.2.0.tgz",
          integrity:
            "sha512-qTAAlrEsl8s4OiEQY69wDvcMIdQN6wdz5ojQiOy6YRMuynxenON0O5oCpJI6lshc6scgAY8qvJ2On/p+CXY0GA==",
          license: "MIT",
          dependencies: {
            "pg-int8": "1.0.1",
            "postgres-array": "~2.0.0",
            "postgres-bytea": "~1.0.0",
            "postgres-date": "~1.0.4",
            "postgres-interval": "^1.1.0",
          },
          engines: { node: ">=4" },
        },
        "node_modules/pgpass": {
          version: "1.0.5",
          resolved: "https://registry.npmjs.org/pgpass/-/pgpass-1.0.5.tgz",
          integrity:
            "sha512-FdW9r/jQZhSeohs1Z3sI1yxFQNFvMcnmfuj4WBMUTxOrAyLMaTcE1aAMBiTlbMNaXvBCQuVi0R7hd8udDSP7ug==",
          license: "MIT",
          dependencies: { split2: "^4.1.0" },
        },
        "node_modules/postgres-array": {
          version: "2.0.0",
          resolved: "https://registry.npmjs.org/postgres-array/-/postgres-array-2.0.0.tgz",
          integrity:
            "sha512-VpZrUqU5A69eQyW2c5CA1jtLecCsN2U/bD6VilrFDWq5+5UIEVO7nazS3TEcHf1zuPYO/sqGvUvW62g86RXZuA==",
          license: "MIT",
          engines: { node: ">=4" },
        },
        "node_modules/postgres-bytea": {
          version: "1.0.1",
          resolved: "https://registry.npmjs.org/postgres-bytea/-/postgres-bytea-1.0.1.tgz",
          integrity:
            "sha512-5+5HqXnsZPE65IJZSMkZtURARZelel2oXUEO8rH83VS/hxH5vv1uHquPg5wZs8yMAfdv971IU+kcPUczi7NVBQ==",
          license: "MIT",
          engines: { node: ">=0.10.0" },
        },
        "node_modules/postgres-date": {
          version: "1.0.7",
          resolved: "https://registry.npmjs.org/postgres-date/-/postgres-date-1.0.7.tgz",
          integrity:
            "sha512-suDmjLVQg78nMK2UZ454hAG+OAWHQPZ6n++TNDUX+L0+uUlLywnoxJKDou51Zm+zTCjrCl0Nq6J9C5hP9vK/Q==",
          license: "MIT",
          engines: { node: ">=0.10.0" },
        },
        "node_modules/postgres-interval": {
          version: "1.2.0",
          resolved: "https://registry.npmjs.org/postgres-interval/-/postgres-interval-1.2.0.tgz",
          integrity:
            "sha512-9ZhXKM/rw350N1ovuWHbGxnGh/SNJ4cnxHiM0rxE4VN41wsg8P8zWn9hv/buK00RP4WvlOyr/RBDiptyxVbkZQ==",
          license: "MIT",
          dependencies: { xtend: "^4.0.0" },
          engines: { node: ">=0.10.0" },
        },
        "node_modules/split2": {
          version: "4.2.0",
          resolved: "https://registry.npmjs.org/split2/-/split2-4.2.0.tgz",
          integrity:
            "sha512-UcjcJOWknrNkF6PLX83qcHM6KHgVKNkV62Y8a5uYDVv9ydGQVwAHMKqHdJje1VTWpljG0WYpCDhrCdAOYH4TWg==",
          license: "ISC",
          engines: { node: ">= 10.x" },
        },
        "node_modules/xtend": {
          version: "4.0.2",
          resolved: "https://registry.npmjs.org/xtend/-/xtend-4.0.2.tgz",
          integrity:
            "sha512-LKYU1iAXJXUgAXn9URjiu+MWhyUXHsvfp7mcuYm9dSUKK0/CjtrUwFAxD82/mCWbtLsGjFIad0wIsod4zrTAEQ==",
          license: "MIT",
          engines: { node: ">=0.4" },
        },
      }
    : {};
  return `${JSON.stringify(
    {
      name: "helix-production-workspace",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "helix-production-workspace",
          version: "1.0.0",
          ...(rootDependencies ? { dependencies: rootDependencies } : {}),
          devDependencies: rootDevDependencies,
          engines: { node: ">=22" },
        },
        ...postgresPackages,
        "node_modules/@types/node": {
          version: "22.20.1",
          resolved: "https://registry.npmjs.org/@types/node/-/node-22.20.1.tgz",
          integrity:
            "sha512-EANqOCF9QFyra+4pfxUcX9STKJpCLjMbObVzljIJomAWSnuSIEAvyzEU53GaajbXJEgdh0iEcPL+DGvpUd4k1Q==",
          dev: true,
          license: "MIT",
          dependencies: { "undici-types": "~6.21.0" },
        },
        "node_modules/typescript": {
          version: "5.9.3",
          resolved: "https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz",
          integrity:
            "sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==",
          dev: true,
          license: "Apache-2.0",
          bin: { tsc: "bin/tsc", tsserver: "bin/tsserver" },
          engines: { node: ">=14.17" },
        },
        "node_modules/undici-types": {
          version: "6.21.0",
          resolved: "https://registry.npmjs.org/undici-types/-/undici-types-6.21.0.tgz",
          integrity:
            "sha512-iwDZqg0QAGrg9Rav5H4n0M64c3mkR59cJ6wQp+7C4nI0gsmExaedaYLNO44eT4AtBBwjbTiGPMlt2Md0T9H9JQ==",
          dev: true,
          license: "MIT",
        },
      },
    },
    null,
    2,
  )}\n`;
}

function buildScript(
  runtimeProfile: ApprovedProductionContext["requirements"]["runtimeProfile"],
): string {
  const serviceBundle =
    runtimeProfile === "service_app"
      ? `
await cp(new URL("../server/", import.meta.url), new URL("../dist/server/", import.meta.url), { recursive: true });
try {
  await cp(new URL("../infra/netlify/functions/", import.meta.url), new URL("../dist/infra/netlify/functions/", import.meta.url), { recursive: true });
} catch (error) {
  if (!error || error.code !== "ENOENT") throw error;
}
`
      : "";
  return `import { cp, mkdir, rm } from "node:fs/promises";

const source = new URL("../apps/web/", import.meta.url);
const target = new URL("../dist/", import.meta.url);
await rm(target, { force: true, recursive: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
${serviceBundle}`;
}

function lintScript(): string {
  return `import { readFile, readdir } from "node:fs/promises";

const roots = ["apps", "server", "infra", "tests", "scripts"];
const issues = [];
async function visit(path) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const child = path + "/" + entry.name;
    if (entry.isDirectory()) await visit(child);
    else if (/\\.(?:js|mjs|css|html)$/u.test(entry.name)) {
      const content = await readFile(child, "utf8");
      content.split(/\\r?\\n/u).forEach((line, index) => {
        if (/\\s+$/u.test(line)) issues.push(child + ":" + (index + 1) + " trailing whitespace");
      });
    }
  }
}
for (const root of roots) await visit(root);
if (issues.length > 0) throw new Error(issues.join("\\n"));
`;
}

type ControlledVisualTokens = {
  density: "compact" | "balanced" | "spacious";
  grid: "asymmetric" | "matrix" | "radial" | "modular";
  geometry: "sharp" | "rounded" | "clipped" | "soft";
  motion: "none" | "quick" | "measured" | "standard";
  iconography: "hairline" | "solid" | "engraved" | "functional";
  imagery: "none" | "technical" | "editorial" | "atmospheric";
};

function controlledVisualTokens(
  creativeEvidence?: ProductionCreativeDirectionEvidence,
): ControlledVisualTokens {
  const direction = creativeEvidence?.selectedDirection;
  const density = direction?.density.toLocaleLowerCase("en-US") ?? "";
  const grid = `${direction?.grid ?? ""} ${direction?.layout ?? ""}`.toLocaleLowerCase(
    "en-US",
  );
  const geometry = direction?.componentGeometry.toLocaleLowerCase("en-US") ?? "";
  const motion = direction?.motion.toLocaleLowerCase("en-US") ?? "";
  const iconography = direction?.iconography.toLocaleLowerCase("en-US") ?? "";
  const imagery = direction?.imagery.toLocaleLowerCase("en-US") ?? "";
  return {
    density: /\b(?:compact|compressed|dense|tight)\b/u.test(density)
      ? "compact"
      : /\b(?:airy|spacious|open|gallery)\b/u.test(density)
        ? "spacious"
        : "balanced",
    grid: /\b(?:radial|orbital|circular)\b/u.test(grid)
      ? "radial"
      : /\b(?:asymmetric|broken|editorial)\b/u.test(grid)
        ? "asymmetric"
        : /\b(?:matrix|sixteen|16|technical|terminal)\b/u.test(grid)
          ? "matrix"
          : "modular",
    geometry: /\b(?:sharp|square|squared|ruled|rectilinear)\b/u.test(geometry)
      ? "sharp"
      : /\b(?:round|rounded|circular|arched|pill)\b/u.test(geometry)
        ? "rounded"
        : /\b(?:clip|clipped|angular|cut)\b/u.test(geometry)
          ? "clipped"
          : "soft",
    motion: /\b(?:none|static|no motion|reduced)\b/u.test(motion)
      ? "none"
      : /\b(?:immediate|fast|quick|snap)\b/u.test(motion)
        ? "quick"
        : /\b(?:measured|slow|cinematic|deliberate)\b/u.test(motion)
          ? "measured"
          : "standard",
    iconography: /\b(?:hairline|line|outline|thin)\b/u.test(iconography)
      ? "hairline"
      : /\b(?:filled|solid|bold)\b/u.test(iconography)
        ? "solid"
        : /\b(?:engraved|etched|carved)\b/u.test(iconography)
          ? "engraved"
          : "functional",
    imagery: /\b(?:no imagery|none|data-first)\b/u.test(imagery)
      ? "none"
      : /\b(?:map|technical|diagram|data)\b/u.test(imagery)
        ? "technical"
        : /\b(?:photo|plate|specimen|documentary|editorial)\b/u.test(imagery)
          ? "editorial"
          : "atmospheric",
  };
}

function mainSource(
  context: ApprovedProductionContext,
  creativeEvidence?: ProductionCreativeDirectionEvidence,
): string {
  const browserOperations = context.requirements.apiOperations.filter(
    (operation) => operation.access.kind !== "signed_webhook",
  );
  const operationImports = browserOperations
    .map(
      (operation, index) =>
        `import { createOperationClient as createOperationClient${index}, operation as operation${index} } from "./integrations/${operation.operationId}.js";`,
    )
    .join("\n");
  const localStateImport =
    context.requirements.runtimeProfile === "client_only_app"
      ? 'import { createLocalState } from "./integrations/local-state.js";\n'
      : "";
  const operationValues = browserOperations
    .map(
      (operation, index) =>
        `{ client: createOperationClient${index}((url, init) => fetch(url, init)), contract: operation${index}, label: operation${index}.operationId.replaceAll("_", " ") }`,
    )
    .join(",\n  ");
  const runtimeStatus =
    context.requirements.runtimeProfile === "service_app"
      ? "Helix Production candidate · runtime activation follows the generated Nimbus contract"
      : context.requirements.runtimeProfile === "client_only_app"
        ? "Helix Production candidate · device-local source"
        : "Helix Production candidate · static delivery source";
  const directionCopy = creativeEvidence
    ? `${creativeEvidence.selectedDirection.name} · ${creativeEvidence.selectedDirection.mood} · ${creativeEvidence.forgeUiIntent[0]}`
    : "Built-in accessible product direction";
  const visualTokens = controlledVisualTokens(creativeEvidence);
  const visualSpec = creativeEvidence
    ? {
        name: creativeEvidence.selectedDirection.name,
        mood: creativeEvidence.selectedDirection.mood,
        layout: creativeEvidence.selectedDirection.layout,
        density: creativeEvidence.selectedDirection.density,
        grid: creativeEvidence.selectedDirection.grid,
        motion: creativeEvidence.selectedDirection.motion,
        iconography: creativeEvidence.selectedDirection.iconography,
        imagery: creativeEvidence.selectedDirection.imagery,
        componentGeometry: creativeEvidence.selectedDirection.componentGeometry,
        forbiddenCliches: creativeEvidence.selectedDirection.forbiddenCliches,
        tokens: visualTokens,
      }
    : {
        name: "Built-in accessible direction",
        mood: "Clear product focus",
        layout: "Modular product flow",
        density: "Balanced",
        grid: "Responsive modular grid",
        motion: "Reduced-motion-safe transitions",
        iconography: "Functional symbols",
        imagery: "No decorative imagery",
        componentGeometry: "Soft rectangular surfaces",
        forbiddenCliches: [],
        tokens: visualTokens,
      };
  const logicIntent = creativeEvidence?.forgeLogicIntent ?? {
    kind: "forge_logic_intent",
    schemaVersion: "1.0.0",
    controls: [],
    forms: [],
    stateTargets: [],
    validationSignals: [],
    stateSignals: [],
  };
  return `${operationImports}${operationImports ? "\n" : ""}${localStateImport}const approvedProduct = Object.freeze(${JSON.stringify(
    {
      title: context.prd.title,
      target: context.prd.target,
      problem: context.prd.problem,
      useCases: context.prd.useCases,
      acceptanceCriteria: context.prd.acceptanceCriteria,
    },
    null,
    2,
  )});
const approvedVisualSpec = Object.freeze(${JSON.stringify(visualSpec, null, 2)});
/** @type {{kind:string,schemaVersion:string,controls:Array<{id:string,label:string,event:string}>,forms:Array<{id:string,fieldNames:string[],requiredFieldNames:string[]}>,stateTargets:string[],validationSignals:string[],stateSignals:string[]}} */
const approvedLogicIntent = Object.freeze(${JSON.stringify(logicIntent, null, 2)});
/** @type {ReadonlyArray<{ client: { execute(input: unknown, options?: { requestId?: string, pathParams?: Record<string, string> }): Promise<unknown> }, contract: { idempotencyRequired: boolean, method: string, path: string }, label: string }>} */
const approvedOperations = Object.freeze([
  ${operationValues}
]);
${
  context.requirements.runtimeProfile === "client_only_app"
    ? "const localApplicationState = createLocalState();\n"
    : ""
}
const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("Application root is missing");

/** @param {string} tag @param {string} className @param {string} value */
function textElement(tag, className, value) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}

const main = document.createElement("main");
main.dataset.density = approvedVisualSpec.tokens.density;
main.dataset.grid = approvedVisualSpec.tokens.grid;
main.dataset.geometry = approvedVisualSpec.tokens.geometry;
main.dataset.motion = approvedVisualSpec.tokens.motion;
main.dataset.iconography = approvedVisualSpec.tokens.iconography;
main.dataset.imagery = approvedVisualSpec.tokens.imagery;
const hero = document.createElement("header");
hero.className = "hero";
const heading = document.createElement("h1");
heading.textContent = approvedProduct.title;
hero.append(
  textElement("p", "eyebrow", ${JSON.stringify(runtimeStatus)}),
  heading,
  textElement("p", "lede", approvedProduct.problem),
  textElement("p", "target", "For " + approvedProduct.target),
  textElement("p", "direction", ${JSON.stringify(directionCopy)}),
);

const workflowSection = document.createElement("section");
workflowSection.append(textElement("h2", "", "Approved workflows"));
const workflowList = document.createElement("ol");
for (const workflow of approvedProduct.useCases) {
  const item = document.createElement("li");
  item.textContent = workflow;
  workflowList.append(item);
}
workflowSection.append(workflowList);

const visualSection = document.createElement("section");
visualSection.className = "visual-spec";
visualSection.append(textElement("h2", "", "Visual direction"));
const visualGrid = document.createElement("dl");
visualGrid.className = "visual-grid";
for (const [label, value] of [
  ["Layout", approvedVisualSpec.layout],
  ["Density", approvedVisualSpec.density],
  ["Grid", approvedVisualSpec.grid],
  ["Motion", approvedVisualSpec.motion],
  ["Iconography", approvedVisualSpec.iconography],
  ["Imagery", approvedVisualSpec.imagery],
  ["Geometry", approvedVisualSpec.componentGeometry],
]) {
  visualGrid.append(textElement("dt", "", label), textElement("dd", "", value));
}
if (approvedVisualSpec.forbiddenCliches.length > 0) {
  visualGrid.append(
    textElement("dt", "", "Excluded patterns"),
    textElement("dd", "", approvedVisualSpec.forbiddenCliches.join(" · ")),
  );
}
visualSection.append(visualGrid);

const interactionSection = document.createElement("section");
interactionSection.className = "interaction-spec";
interactionSection.append(textElement("h2", "", "Interactive workflow"));
const interactionStatus = textElement(
  "p",
  "interaction-status",
  approvedLogicIntent.controls.length > 0
    ? "Choose an approved interaction."
    : "No model-derived interaction evidence was supplied.",
);
interactionStatus.setAttribute("role", "status");
interactionStatus.setAttribute("aria-live", "polite");
const interactionGrid = document.createElement("div");
interactionGrid.className = "interaction-grid";
for (const intent of approvedLogicIntent.controls) {
  /** @type {HTMLElement} */
  let surface;
  /** @type {HTMLElement} */
  let eventTarget;
  if (intent.event === "submit") {
    const form = document.createElement("form");
    const button = document.createElement("button");
    button.type = "submit";
    button.textContent = intent.label;
    form.append(button);
    surface = form;
    eventTarget = form;
  } else if (["change", "input", "keydown"].includes(intent.event)) {
    const field = document.createElement("input");
    field.type = "text";
    field.setAttribute("aria-label", intent.label);
    field.placeholder = intent.label;
    surface = field;
    eventTarget = field;
  } else {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = intent.label;
    surface = button;
    eventTarget = button;
  }
  surface.dataset.intentId = intent.id;
  eventTarget.addEventListener(intent.event, (event) => {
    if (intent.event === "submit") event.preventDefault();
    interactionStatus.hidden = false;
    interactionStatus.dataset.state = intent.id;
    interactionStatus.classList.add("is-active");
    interactionStatus.textContent = intent.label + " · " + intent.event + " · local interaction ready";
  });
  interactionGrid.append(surface);
}
for (const formIntent of approvedLogicIntent.forms) {
  const form = document.createElement("form");
  form.dataset.intentId = formIntent.id;
  form.append(textElement("h3", "", formIntent.id.replaceAll("-", " ")));
  for (const fieldName of formIntent.fieldNames) {
    const label = document.createElement("label");
    label.textContent = fieldName.replaceAll("-", " ");
    const input = document.createElement("input");
    input.name = fieldName;
    input.required = formIntent.requiredFieldNames.includes(fieldName);
    label.append(input);
    form.append(label);
  }
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Confirm";
  form.append(submit);
  /** @type {string | undefined} */
  let pendingRequestId;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const binding = approvedOperations.find((candidate) => candidate.contract.method !== "GET") ?? approvedOperations[0];
    if (!binding) {
      interactionStatus.textContent = formIntent.id.replaceAll("-", " ") + " · validated for local state";
      return;
    }
    const input = Object.fromEntries(new FormData(form).entries());
    /** @type {{ requestId?: string, pathParams?: Record<string, string> }} */
    const options = {};
    const pathParameterNames = [...binding.contract.path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/gu)]
      .map((match) => match[1])
      .filter((name) => typeof name === "string");
    if (pathParameterNames.length > 0) {
      options.pathParams = Object.fromEntries(pathParameterNames.map((name) => [name, String(input[name] ?? "")]));
    }
    if (binding.contract.idempotencyRequired) {
      if (typeof globalThis.crypto?.randomUUID !== "function") throw new Error("IDEMPOTENCY_KEY_GENERATOR_UNAVAILABLE");
      pendingRequestId ??= globalThis.crypto.randomUUID();
      options.requestId = pendingRequestId;
    }
    interactionStatus.dataset.state = "loading";
    interactionStatus.textContent = binding.label + " · loading";
    try {
      const value = await binding.client.execute(input, options);
      pendingRequestId = undefined;
      interactionStatus.dataset.state = "success";
      interactionStatus.textContent = binding.label + " · success · " + JSON.stringify(value);
    } catch (error) {
      if (error instanceof Error && /^REQUEST_FAILED_\\d+$/u.test(error.message)) pendingRequestId = undefined;
      interactionStatus.dataset.state = "error";
      interactionStatus.textContent = binding.label + " · error · " + (error instanceof Error ? error.message : "REQUEST_FAILED");
    }
  });
  interactionGrid.append(form);
}
interactionSection.append(
  interactionStatus,
  interactionGrid,
  textElement(
    "p",
    "interaction-evidence",
    "State: " + approvedLogicIntent.stateSignals.join(", ") +
      " · Targets: " + approvedLogicIntent.stateTargets.join(", ") +
      " · Validation: " + approvedLogicIntent.validationSignals.join(", "),
  ),
);

const contractSection = document.createElement("section");
contractSection.append(textElement("h2", "", "Product contracts"));
const contractGrid = document.createElement("div");
contractGrid.className = "contract-grid";
if (approvedOperations.length === 0) {
  contractGrid.append(
    textElement(
      "p",
      "empty-state",
      ${JSON.stringify(
        context.requirements.runtimeProfile === "client_only_app"
          ? "This approved product keeps its state on this device; no server API is claimed."
          : "This approved product has no server API contract.",
      )},
    ),
  );
} else {
  for (const binding of approvedOperations) {
    const article = document.createElement("article");
    const operationStatus = textElement("p", "contract-status", "idle · ready to call the fail-closed API client");
    operationStatus.dataset.state = "idle";
    operationStatus.setAttribute("role", "status");
    operationStatus.setAttribute("aria-live", "polite");
    const operationForm = document.createElement("form");
    const pathParameterNames = [...binding.contract.path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/gu)]
      .map((match) => match[1])
      .filter((name) => typeof name === "string");
    /** @type {Record<string, HTMLInputElement>} */
    const pathFields = {};
    for (const name of pathParameterNames) {
      const label = document.createElement("label");
      label.textContent = name.replaceAll("_", " ");
      const field = document.createElement("input");
      field.name = name;
      field.required = true;
      label.append(field);
      operationForm.append(label);
      pathFields[name] = field;
    }
    /** @type {HTMLTextAreaElement | undefined} */
    let payloadField;
    if (binding.contract.method !== "GET") {
      const label = document.createElement("label");
      label.textContent = "JSON payload";
      payloadField = document.createElement("textarea");
      payloadField.name = "payload";
      payloadField.value = "{}";
      payloadField.rows = 5;
      label.append(payloadField);
      operationForm.append(label);
    }
    const execute = document.createElement("button");
    execute.type = "submit";
    execute.textContent = binding.contract.method === "GET" ? "Load" : "Send";
    operationForm.append(execute);
    /** @type {string | undefined} */
    let pendingRequestId;
    operationForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!operationForm.reportValidity()) return;
      /** @type {{ requestId?: string, pathParams?: Record<string, string> }} */
      const options = {};
      if (pathParameterNames.length > 0) {
        options.pathParams = Object.fromEntries(pathParameterNames.map((name) => [name, pathFields[name]?.value ?? ""]));
      }
      let input = null;
      try {
        if (payloadField) {
          input = JSON.parse(payloadField.value);
          if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_JSON_OBJECT");
        }
        if (binding.contract.idempotencyRequired) {
          if (typeof globalThis.crypto?.randomUUID !== "function") throw new Error("IDEMPOTENCY_KEY_GENERATOR_UNAVAILABLE");
          pendingRequestId ??= globalThis.crypto.randomUUID();
          options.requestId = pendingRequestId;
        }
        operationStatus.dataset.state = "loading";
        operationStatus.textContent = "loading";
        const value = await binding.client.execute(input, options);
        pendingRequestId = undefined;
        const result = value !== null && typeof value === "object" ? Reflect.get(value, "result") : value;
        const items = result !== null && typeof result === "object" ? Reflect.get(result, "items") : null;
        const empty = result === null || (Array.isArray(items) && items.length === 0);
        operationStatus.dataset.state = empty ? "empty" : "success";
        operationStatus.textContent = (empty ? "empty" : "success") + " · " + JSON.stringify(value);
      } catch (error) {
        if (error instanceof Error && /^REQUEST_FAILED_\\d+$/u.test(error.message)) pendingRequestId = undefined;
        operationStatus.dataset.state = "error";
        operationStatus.textContent = "error · " + (error instanceof Error ? error.message : "REQUEST_FAILED");
      }
    });
    article.append(
      textElement("h3", "", binding.label),
      textElement("code", "", binding.contract.method + " " + binding.contract.path),
      operationStatus,
      operationForm,
    );
    contractGrid.append(article);
  }
}
contractSection.append(contractGrid);

const acceptanceSection = document.createElement("section");
acceptanceSection.append(textElement("h2", "", "Acceptance criteria"));
const acceptanceList = document.createElement("ul");
for (const criterion of approvedProduct.acceptanceCriteria) {
  const item = document.createElement("li");
  item.textContent = criterion;
  acceptanceList.append(item);
}
acceptanceSection.append(acceptanceList);
${
  context.requirements.runtimeProfile === "client_only_app"
    ? "void localApplicationState.getSnapshot();\n"
    : ""
}main.append(
  hero,
  workflowSection,
  visualSection,
  interactionSection,
  contractSection,
  acceptanceSection,
);
root.replaceChildren(main);
`;
}

function safePaletteColor(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/iu.test(value) ? value : fallback;
}

function safeFontFamily(value: string | undefined, fallback: string): string {
  const primary = value?.split(",", 1)[0]?.trim();
  return primary && /^[a-z0-9 _-]{1,80}$/iu.test(primary)
    ? `${JSON.stringify(primary)},ui-sans-serif,system-ui,sans-serif`
    : fallback;
}

function stylesSource(creativeEvidence?: ProductionCreativeDirectionEvidence): string {
  const palette = creativeEvidence?.selectedDirection.palette;
  const background = safePaletteColor(palette?.bg ?? "", "#08111f");
  const foreground = safePaletteColor(palette?.fg ?? "", "#f8fafc");
  const accent = safePaletteColor(palette?.accent ?? "", "#7dd3fc");
  const muted = safePaletteColor(palette?.muted ?? "", "#94a3b8");
  const elevated = safePaletteColor(palette?.elevated ?? "", "#0d1d2f");
  const displayFont = safeFontFamily(
    creativeEvidence?.selectedDirection.fonts.display,
    "ui-serif,Georgia,serif",
  );
  const bodyFont = safeFontFamily(
    creativeEvidence?.selectedDirection.fonts.body,
    "ui-sans-serif,system-ui,sans-serif",
  );
  const tokens = controlledVisualTokens(creativeEvidence);
  const density = {
    compact: { space: ".72rem", section: "1.4rem", padding: "clamp(1.25rem,4vw,3rem)" },
    balanced: { space: "1rem", section: "clamp(2rem,6vw,5rem)", padding: "clamp(2rem,6vw,6rem)" },
    spacious: { space: "1.45rem", section: "clamp(3rem,9vw,7rem)", padding: "clamp(2.5rem,8vw,8rem)" },
  }[tokens.density];
  const geometry = {
    sharp: { radius: "0", clip: "none" },
    rounded: { radius: "1.75rem", clip: "none" },
    clipped: { radius: ".25rem", clip: "polygon(0 0,calc(100% - 1rem) 0,100% 1rem,100% 100%,1rem 100%,0 calc(100% - 1rem))" },
    soft: { radius: "1rem", clip: "none" },
  }[tokens.geometry];
  const motionDuration = {
    none: "0ms",
    quick: "120ms",
    measured: "520ms",
    standard: "260ms",
  }[tokens.motion];
  const gridMinimum = {
    asymmetric: "21rem",
    matrix: "13rem",
    radial: "18rem",
    modular: "17rem",
  }[tokens.grid];
  const ruleWidth = {
    hairline: "1px",
    solid: "3px",
    engraved: "2px",
    functional: "1px",
  }[tokens.iconography];
  const heroPattern = {
    none: "none",
    technical: "linear-gradient(90deg,color-mix(in srgb,var(--accent) 12%,transparent) 1px,transparent 1px),linear-gradient(color-mix(in srgb,var(--accent) 12%,transparent) 1px,transparent 1px)",
    editorial: "linear-gradient(135deg,color-mix(in srgb,var(--accent) 18%,transparent),transparent 62%)",
    atmospheric: "radial-gradient(circle at 82% 18%,color-mix(in srgb,var(--accent) 20%,transparent),transparent 42%)",
  }[tokens.imagery];
  return `:root{--bg:${background};--fg:${foreground};--accent:${accent};--muted:${muted};--elevated:${elevated};--font-display:${displayFont};--font-body:${bodyFont};--space-unit:${density.space};--section-gap:${density.section};--page-padding:${density.padding};--surface-radius:${geometry.radius};--surface-clip:${geometry.clip};--motion-duration:${motionDuration};--grid-min:${gridMinimum};--rule-width:${ruleWidth};font-family:var(--font-body);color:var(--fg);background:var(--bg)}*{box-sizing:border-box}body{margin:0;background:var(--bg)}button,input,textarea{min-height:44px;font:inherit;color:inherit;border:var(--rule-width) solid var(--muted);border-radius:var(--surface-radius);background:var(--elevated);padding:.75rem 1rem}textarea{width:100%;resize:vertical}button{cursor:pointer}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--accent);outline-offset:3px}main{min-height:100vh;display:grid;gap:var(--section-gap);padding:var(--page-padding);max-width:80rem;margin:auto}.hero{position:relative;isolation:isolate;display:grid;gap:var(--space-unit);max-width:62rem;padding:clamp(1rem,4vw,3rem);border:var(--rule-width) solid color-mix(in srgb,var(--muted) 55%,transparent);border-radius:var(--surface-radius);clip-path:var(--surface-clip);background-image:${heroPattern};background-size:2rem 2rem}.hero>*{position:relative}h1,h2,h3,p,dd{margin:0}h1,h2,h3{font-family:var(--font-display)}h1{font-size:clamp(3rem,9vw,7rem);line-height:.92;letter-spacing:-.055em}h2{font-size:clamp(1.5rem,3vw,2.4rem)}h3{font-size:1rem;text-transform:capitalize}.eyebrow,.contract-status,.interaction-status.is-active{color:var(--accent)}.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:.75rem}.lede{font-size:clamp(1.1rem,2.4vw,1.55rem);line-height:1.5}.target,.direction,.interaction-evidence{color:var(--muted)}section{display:grid;gap:var(--space-unit);animation:section-enter var(--motion-duration) ease-out both}ol,ul{margin:0;padding-left:1.25rem;display:grid;gap:calc(var(--space-unit) * .7)}.contract-grid,.interaction-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--grid-min)),1fr));gap:var(--space-unit)}.contract-grid article,.empty-state,.interaction-grid>*,.visual-grid{display:grid;gap:calc(var(--space-unit) * .75);padding:calc(var(--space-unit) * 1.2);border:var(--rule-width) solid var(--muted);border-radius:var(--surface-radius);clip-path:var(--surface-clip);background:var(--elevated)}.interaction-grid form label,.contract-grid form,.contract-grid form label{display:grid;gap:.4rem}.visual-grid{grid-template-columns:minmax(7rem,.35fr) 1fr;margin:0}.visual-grid dt{color:var(--accent);font-weight:700}.contract-grid code{overflow-wrap:anywhere}.contract-status,.interaction-evidence{font-size:.82rem;line-height:1.45}main[data-grid="asymmetric"] .contract-grid>*:first-child,main[data-grid="asymmetric"] .interaction-grid>*:first-child{grid-column:span 2}main[data-grid="matrix"]{max-width:90rem}main[data-grid="radial"] .visual-grid{border-radius:50% 50% var(--surface-radius) var(--surface-radius)}main[data-motion="none"] section{animation:none}@keyframes section-enter{from{opacity:.01;transform:translateY(.75rem)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}@media(max-width:36rem){main{padding:1.5rem}.contract-grid,.interaction-grid{grid-template-columns:1fr}main[data-grid="asymmetric"] .contract-grid>*:first-child,main[data-grid="asymmetric"] .interaction-grid>*:first-child{grid-column:auto}.visual-grid{grid-template-columns:1fr}}\n`;
}

function scaffoldFiles(
  context: ApprovedProductionContext,
  creativeEvidence?: ProductionCreativeDirectionEvidence,
): ProductionGeneratedFile[] {
  const requirements = context.requirements;
  const files: ProductionGeneratedFile[] = [
    {
      path: "README.md",
      content: `# ${context.prd.title}\n\nThis workspace is assembled from approved Production evidence. Generated infrastructure and services remain source candidates until independent validation runs.\n`,
    },
    {
      path: "apps/web/index.html",
      content:
        '<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Helix Production</title><link rel="stylesheet" href="./src/styles.css"></head><body><div id="app"></div><script type="module" src="./src/main.js"></script></body></html>\n',
    },
    { path: "apps/web/src/main.js", content: mainSource(context, creativeEvidence) },
    {
      path: "apps/web/src/styles.css",
      content: stylesSource(creativeEvidence),
    },
    {
      path: "docs/architecture.json",
      content: canonicalProductionContractFile(context.architecture),
    },
    {
      path: "docs/architecture.md",
      content: `# Approved architecture\n\n${context.architecture.frontendArchitecture}\n\n${context.architecture.backendArchitecture}\n`,
    },
    {
      path: "docs/decisions.md",
      content:
        "# Decisions\n\nProduction stages are selected only from the approved requirements contract. Each stage delivery is hash-fenced and path-owned.\n",
    },
    ...(creativeEvidence
      ? [
          {
            path: "docs/design.json",
            content: canonicalProductionContractFile(creativeEvidence),
          },
        ]
      : []),
    { path: "docs/prd.json", content: canonicalProductionContractFile(context.prd) },
    {
      path: "docs/prd.md",
      content: `# ${context.prd.title}\n\n## Target\n\n${context.prd.target}\n\n## Problem\n\n${context.prd.problem}\n`,
    },
    {
      path: "docs/requirements.json",
      content: canonicalProductionContractFile(requirements),
    },
    {
      path: "docs/score.md",
      content:
        "# Production score\n\nNo runtime, security, accessibility, performance, or deployment score is asserted by the scaffold.\n",
    },
    {
      path: "package-lock.json",
      content: packageLock(
        requirements.runtimeProfile === "service_app" &&
          requirements.dataModel === "server_persistent",
      ),
    },
    {
      path: "package.json",
      content: packageManifest(
        requirements.runtimeProfile === "service_app" &&
          requirements.dataModel === "server_persistent",
      ),
    },
    { path: "scripts/build.mjs", content: buildScript(requirements.runtimeProfile) },
    { path: "scripts/lint.mjs", content: lintScript() },
    {
      path: "tsconfig.json",
      content: `${JSON.stringify(
        {
          compilerOptions: {
            allowJs: true,
            checkJs: true,
            lib: ["ES2022", "DOM", "DOM.Iterable"],
            module: "ESNext",
            moduleResolution: "Bundler",
            noEmit: true,
            strict: true,
            target: "ES2022",
            types: ["node"],
          },
          include: ["apps/**/*.js", "infra/**/*.js", "server/**/*.js", "tests/**/*.mjs"],
        },
        null,
        2,
      )}\n`,
    },
  ];
  if (requirements.dataModel !== "server_persistent") {
    files.push({
      path: "db/migrations/not-required.md",
      content:
        "# Migration scope\n\nThe approved requirements do not include server-persistent data, so no database migration is required.\n",
    });
  }
  return files.sort((left, right) => compareText(left.path, right.path));
}

export async function createTrustedProductionScaffold(
  source: ApprovedProductionContext,
  creativeSource?: ProductionCreativeDirectionEvidence,
): Promise<TrustedProductionScaffold> {
  const context = ApprovedProductionContextSchema.parse(source);
  const creativeEvidence = creativeSource
    ? ProductionCreativeDirectionEvidenceSchema.parse(creativeSource)
    : undefined;
  const expectedSnapshot = canonicalProductionContractFile(
    productionRequirementSnapshot(context.requirements),
  );
  if (
    canonicalProductionContractFile(context.prd.requirements) !== expectedSnapshot ||
    canonicalProductionContractFile(context.architecture.requirements) !== expectedSnapshot
  ) {
    throw new Error("Approved PRD and architecture must use the exact requirements snapshot");
  }
  const requirementsFile = canonicalProductionContractFile(context.requirements);
  return TrustedProductionScaffoldSchema.parse({
    kind: "helix_trusted_production_scaffold",
    schemaVersion: "1.0.0",
    source: "helix_built_in_template",
    runtimeProfile: context.requirements.runtimeProfile,
    packageManager: "npm@10",
    entrypoint: "apps/web/index.html",
    approvedRequirementsSha256: await sha256Hex(requirementsFile),
    files: scaffoldFiles(context, creativeEvidence),
  });
}
