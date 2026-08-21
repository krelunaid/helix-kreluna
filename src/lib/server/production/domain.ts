import type { ProductionRequirements } from "@/lib/production-artifact-graph";

const HTTP_CONTRACT_PATTERN =
  /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/api(?:\/(?:[A-Za-z0-9_-]+|:[A-Za-z][A-Za-z0-9_]*))+)/giu;
const NON_DOMAIN_SEGMENTS = new Set([
  "auth",
  "billing",
  "callback",
  "callbacks",
  "checkout",
  "health",
  "oauth",
  "webhook",
  "webhooks",
]);
const SQL_RESERVED = new Set([
  "all",
  "and",
  "case",
  "check",
  "constraint",
  "create",
  "delete",
  "from",
  "group",
  "insert",
  "order",
  "primary",
  "references",
  "select",
  "table",
  "update",
  "user",
  "where",
]);

export type ParsedApprovedApiContract = Readonly<{
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  evidence: string;
}>;

export type ProductionDomainResource = Readonly<{
  id: string;
  singularId: string;
  tableName: string;
  repositoryPath: string;
}>;

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function productionIdentifier(value: string, fallback = "domain_items"): string {
  const folded = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .replace(/_+/gu, "_");
  let identifier = folded || fallback;
  if (!/^[a-z]/u.test(identifier)) identifier = `domain_${identifier}`;
  if (identifier.length < 2) identifier = `${identifier}_items`;
  if (SQL_RESERVED.has(identifier)) identifier = `domain_${identifier}`;
  return identifier.slice(0, 80).replace(/_+$/u, "") || fallback;
}

export function singularProductionIdentifier(value: string): string {
  if (/ies$/u.test(value) && value.length > 4) return `${value.slice(0, -3)}y`;
  if (/(?:ches|shes|xes|zes)$/u.test(value) && value.length > 4) return value.slice(0, -2);
  if (/s$/u.test(value) && !/(?:ss|us|is)$/u.test(value) && value.length > 3) {
    return value.slice(0, -1);
  }
  return value;
}

export function productionPascalIdentifier(value: string): string {
  return productionIdentifier(value)
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("");
}

function postgresIdentifier(value: string): string {
  const identifier = productionIdentifier(value);
  if (identifier.length <= 48) return identifier;
  let hash = 2_166_136_261;
  for (const character of identifier) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return `${identifier.slice(0, 39).replace(/_+$/u, "")}_${hash
    .toString(16)
    .padStart(8, "0")}`;
}

export function parseApprovedApiContracts(
  fragments: readonly string[],
): ParsedApprovedApiContract[] {
  const contracts = new Map<string, ParsedApprovedApiContract>();
  for (const evidence of fragments) {
    HTTP_CONTRACT_PATTERN.lastIndex = 0;
    for (const match of evidence.matchAll(HTTP_CONTRACT_PATTERN)) {
      const method = match[1]?.toUpperCase() as ParsedApprovedApiContract["method"];
      const rawPath = match[2];
      if (!rawPath) continue;
      const path = rawPath
        .split("/")
        .map((segment, index) =>
          index === 0 || segment.startsWith(":")
            ? segment
            : segment.toLocaleLowerCase("en-US"),
        )
        .join("/");
      const key = `${method} ${path}`;
      if (!contracts.has(key)) contracts.set(key, { method, path, evidence });
    }
  }
  return [...contracts.values()].sort((left, right) =>
    compareText(`${left.method} ${left.path}`, `${right.method} ${right.path}`),
  );
}

export function resourceIdFromApiPath(path: string): string | null {
  const segments = path
    .split("/")
    .filter(Boolean)
    .slice(1)
    .filter((segment) => !segment.startsWith(":"))
    .map((segment) => productionIdentifier(segment));
  const domainSegments = segments.filter((segment) => !NON_DOMAIN_SEGMENTS.has(segment));
  const candidate = domainSegments.at(-1);
  return candidate ? productionIdentifier(candidate) : null;
}

export function deriveProductionDomainResources(
  requirements: Pick<ProductionRequirements, "apiOperations" | "dataModel">,
): ProductionDomainResource[] {
  const ids = new Set<string>();
  for (const operation of requirements.apiOperations) {
    if (operation.access.kind === "signed_webhook") continue;
    const resourceId = resourceIdFromApiPath(operation.path);
    if (resourceId) ids.add(resourceId);
  }
  if (ids.size === 0 && requirements.dataModel === "server_persistent") {
    ids.add("domain_items");
  }
  return [...ids].sort(compareText).map((id) => {
    const tableName = postgresIdentifier(id);
    return {
      id,
      singularId: singularProductionIdentifier(id),
      tableName,
      repositoryPath: `server/core/${tableName}-repository.js`,
    };
  });
}
