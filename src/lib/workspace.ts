import { BUILD_LEVELS, type BuildLevel as ProductBuildLevel } from "@/lib/build-level";
import { z } from "zod";

export const WORKSPACE_MANIFEST_PATH = "helix.workspace.json";
export const MAX_WORKSPACE_FILES = 192;
export const MAX_WORKSPACE_FILE_BYTES = 512 * 1024;
export const MAX_WORKSPACE_TOTAL_BYTES = 4 * 1024 * 1024;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const WINDOWS_RESERVED_NAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const FORBIDDEN_SEGMENTS = new Set([
  ".env",
  ".git",
  "node_modules",
  "__proto__",
  "prototype",
  "constructor",
]);
const SECRET_CONTENT_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/u,
  /\b(?:sk|xai)-[A-Za-z0-9_-]{20,}\b/u,
  /(?:client[_-]?secret|api[_-]?key|access[_-]?token|password)\s*[:=]\s*["'][A-Za-z0-9_+./=-]{24,}["']/iu,
] as const;

export const BuildLevelSchema = z.enum(BUILD_LEVELS);
export type BuildLevel = ProductBuildLevel;

export const WorkspaceFileRoleSchema = z.enum([
  "entrypoint",
  "source",
  "readme",
  "prd",
  "architecture",
  "environment",
  "migration",
  "test",
  "deployment",
  "decision",
  "score",
  "documentation",
  "configuration",
  "asset",
]);
export type WorkspaceFileRole = z.infer<typeof WorkspaceFileRoleSchema>;

export const WorkspaceCapabilityIdSchema = z.enum([
  "frontend",
  "backend",
  "api",
  "database",
  "auth",
  "integrations",
  "tests",
  "deployment",
  "monitoring",
]);
export type WorkspaceCapabilityId = z.infer<typeof WorkspaceCapabilityIdSchema>;

export const WorkspaceCapabilityStatusSchema = z.enum([
  "implemented",
  "not_required",
  "not_configured",
  "blocked",
]);

export const WorkspaceValidationScopeSchema = z.enum([
  "typecheck",
  "lint",
  "test",
  "build",
  "security",
  "browser",
  "accessibility",
  "performance",
  "deployment",
]);
export type WorkspaceValidationScope = z.infer<typeof WorkspaceValidationScopeSchema>;

const REQUIRED_PRODUCTION_ROLES = [
  "entrypoint",
  "source",
  "readme",
  "prd",
  "architecture",
  "environment",
  "migration",
  "test",
  "deployment",
  "decision",
  "score",
] as const satisfies readonly WorkspaceFileRole[];

const REQUIRED_PRODUCTION_VALIDATIONS = [
  "typecheck",
  "lint",
  "test",
  "build",
  "security",
] as const satisfies readonly WorkspaceValidationScope[];

const REQUIRED_PRODUCTION_CAPABILITIES = WorkspaceCapabilityIdSchema.options;

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function pathIssues(value: string): string[] {
  const issues: string[] = [];
  if (value.length === 0) issues.push("Workspace paths cannot be empty");
  if (value !== value.trim()) {
    issues.push("Workspace paths cannot start or end with whitespace");
  }
  if (value.startsWith("/")) {
    issues.push("Workspace paths must be relative");
  }
  if (value.includes("\\")) {
    issues.push("Workspace paths must use forward slashes");
  }
  if (value.includes(":")) {
    issues.push("Workspace paths cannot contain a colon");
  }
  if (value.includes("%")) {
    issues.push("Workspace paths cannot contain percent-encoded segments");
  }
  if (containsControlCharacter(value)) {
    issues.push("Workspace paths cannot contain control characters");
  }
  if (utf8Bytes(value) > 512) {
    issues.push("Workspace paths cannot exceed 512 UTF-8 bytes");
  }

  const normalized = value.normalize("NFC");
  const segments = normalized.split("/");
  for (const segment of segments) {
    const folded = segment.toLocaleLowerCase("en-US");
    if (segment.length === 0 || segment === "." || segment === "..") {
      issues.push("Workspace paths cannot contain empty, dot, or parent segments");
      continue;
    }
    if (segment.endsWith(".") || segment.endsWith(" ")) {
      issues.push("Workspace path segments cannot end with a dot or space");
    }
    if (utf8Bytes(segment) > 255) {
      issues.push("Workspace path segments cannot exceed 255 UTF-8 bytes");
    }
    if (FORBIDDEN_SEGMENTS.has(folded)) {
      issues.push(`Workspace path contains reserved segment: ${segment}`);
    }
    if (WINDOWS_RESERVED_NAME_PATTERN.test(segment)) {
      issues.push(`Workspace path contains reserved device name: ${segment}`);
    }
  }
  if (
    normalized.toLocaleLowerCase("en-US") === WORKSPACE_MANIFEST_PATH.toLocaleLowerCase("en-US")
  ) {
    issues.push(`${WORKSPACE_MANIFEST_PATH} is reserved for the sealed manifest`);
  }
  return [...new Set(issues)];
}

export const WorkspacePathSchema = z
  .string()
  .max(512)
  .superRefine((value, context) => {
    for (const message of pathIssues(value)) {
      context.addIssue({ code: "custom", message });
    }
  })
  .transform((value) => value.normalize("NFC"));

export const WorkspaceCapabilitySchema = z
  .object({
    id: WorkspaceCapabilityIdSchema,
    status: WorkspaceCapabilityStatusSchema,
    detail: z.string().trim().min(1).max(1_000),
    evidencePaths: z.array(WorkspacePathSchema).max(32),
  })
  .strict()
  .superRefine((capability, context) => {
    if (capability.evidencePaths.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["evidencePaths"],
        message: "Every capability declaration requires at least one evidence path",
      });
    }
  });
export type WorkspaceCapability = z.infer<typeof WorkspaceCapabilitySchema>;

export const WorkspaceValidationSchema = z
  .object({
    scope: WorkspaceValidationScopeSchema,
    status: z.enum(["passed", "failed", "not_run"]),
    evidence: z.enum(["measured", "not_run"]),
    detail: z.string().trim().min(1).max(1_000),
    tool: z.string().trim().min(1).max(160).optional(),
    completedAt: z.string().datetime({ offset: true }).optional(),
    evidencePaths: z.array(WorkspacePathSchema).max(32),
  })
  .strict()
  .superRefine((validation, context) => {
    if (validation.status === "not_run") {
      if (validation.evidence !== "not_run") {
        context.addIssue({
          code: "custom",
          path: ["evidence"],
          message: "A not-run validation must use not_run evidence",
        });
      }
      return;
    }
    if (validation.evidence !== "measured") {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "Executed validations must use measured evidence",
      });
    }
    if (!validation.tool) {
      context.addIssue({
        code: "custom",
        path: ["tool"],
        message: "Executed validations must identify the tool used",
      });
    }
    if (!validation.completedAt) {
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "Executed validations must include their completion time",
      });
    }
  });
export type WorkspaceValidation = z.infer<typeof WorkspaceValidationSchema>;

export const WorkspaceFileDescriptorSchema = z
  .object({
    path: WorkspacePathSchema,
    role: WorkspaceFileRoleSchema,
    mediaType: z.string().trim().min(1).max(160),
    bytes: z.number().int().nonnegative().max(MAX_WORKSPACE_FILE_BYTES),
    sha256: z.string().regex(SHA256_PATTERN),
  })
  .strict();
export type WorkspaceFileDescriptor = z.infer<typeof WorkspaceFileDescriptorSchema>;

const WorkspaceCandidateShape = z
  .object({
    kind: z.literal("helix_workspace_candidate"),
    schemaVersion: z.literal("1.0.0"),
    jobId: z.string().trim().min(1).max(200),
    projectId: z.string().trim().min(1).max(200).optional(),
    locale: z.enum(["it", "en", "es", "fr", "de", "pt"]),
    pipelineVersion: z.string().trim().min(1).max(120),
    createdAt: z.string().datetime({ offset: true }),
    buildLevel: z.literal("production"),
    entrypoint: WorkspacePathSchema,
    fileCount: z.number().int().positive().max(MAX_WORKSPACE_FILES),
    totalBytes: z.number().int().nonnegative().max(MAX_WORKSPACE_TOTAL_BYTES),
    files: z.array(WorkspaceFileDescriptorSchema).min(1).max(MAX_WORKSPACE_FILES),
    sourceSha256: z.string().regex(SHA256_PATTERN),
  })
  .strict();

export const WorkspaceCandidateSchema = WorkspaceCandidateShape.superRefine(
  (candidate, context) => {
    const paths = new Set<string>();
    const foldedPaths = new Set<string>();
    let priorPath: string | undefined;
    let totalBytes = 0;
    let entrypointCount = 0;

    for (const [index, descriptor] of candidate.files.entries()) {
      const folded = descriptor.path.normalize("NFC").toLocaleLowerCase("en-US");
      if (paths.has(descriptor.path) || foldedPaths.has(folded)) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: "Workspace candidate paths must be unique under NFC/case folding",
        });
      }
      if (priorPath !== undefined && compareText(priorPath, descriptor.path) >= 0) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: "Workspace candidate file descriptors must be sorted",
        });
      }
      paths.add(descriptor.path);
      foldedPaths.add(folded);
      priorPath = descriptor.path;
      totalBytes += descriptor.bytes;
      if (descriptor.path === candidate.entrypoint && descriptor.role === "entrypoint") {
        entrypointCount += 1;
      }
    }

    if (candidate.fileCount !== candidate.files.length) {
      context.addIssue({
        code: "custom",
        path: ["fileCount"],
        message: "Workspace candidate fileCount does not match its descriptors",
      });
    }
    if (candidate.totalBytes !== totalBytes) {
      context.addIssue({
        code: "custom",
        path: ["totalBytes"],
        message: "Workspace candidate totalBytes does not match its descriptors",
      });
    }
    if (!paths.has(candidate.entrypoint) || entrypointCount !== 1) {
      context.addIssue({
        code: "custom",
        path: ["entrypoint"],
        message: "Workspace candidate must reference exactly one existing entrypoint",
      });
    }
    const roles = new Set(candidate.files.map((file) => file.role));
    for (const role of REQUIRED_PRODUCTION_ROLES) {
      if (!roles.has(role)) {
        context.addIssue({
          code: "custom",
          path: ["files"],
          message: `Production candidate is missing required deliverable role: ${role}`,
        });
      }
    }
  },
);
export type WorkspaceCandidate = z.infer<typeof WorkspaceCandidateSchema>;

const ManifestShape = z
  .object({
    kind: z.literal("helix_workspace"),
    schemaVersion: z.literal("1.0.0"),
    jobId: z.string().trim().min(1).max(200),
    projectId: z.string().trim().min(1).max(200).optional(),
    locale: z.enum(["it", "en", "es", "fr", "de", "pt"]),
    pipelineVersion: z.string().trim().min(1).max(120),
    createdAt: z.string().datetime({ offset: true }),
    buildLevel: BuildLevelSchema,
    entrypoint: WorkspacePathSchema,
    fileCount: z.number().int().positive().max(MAX_WORKSPACE_FILES),
    totalBytes: z.number().int().nonnegative().max(MAX_WORKSPACE_TOTAL_BYTES),
    files: z.array(WorkspaceFileDescriptorSchema).min(1).max(MAX_WORKSPACE_FILES),
    capabilities: z.array(WorkspaceCapabilitySchema).max(32),
    validations: z.array(WorkspaceValidationSchema).max(32),
    artifactSha256: z.string().regex(SHA256_PATTERN),
  })
  .strict();

export const WorkspaceManifestSchema = ManifestShape.superRefine((manifest, context) => {
  const descriptorPaths = new Set<string>();
  const foldedPaths = new Set<string>();
  let priorPath: string | undefined;
  let summedBytes = 0;
  let entrypointCount = 0;

  for (const [index, descriptor] of manifest.files.entries()) {
    const folded = descriptor.path.normalize("NFC").toLocaleLowerCase("en-US");
    if (descriptorPaths.has(descriptor.path) || foldedPaths.has(folded)) {
      context.addIssue({
        code: "custom",
        path: ["files", index, "path"],
        message: "Workspace descriptor paths must be unique under NFC/case folding",
      });
    }
    descriptorPaths.add(descriptor.path);
    foldedPaths.add(folded);
    summedBytes += descriptor.bytes;
    if (priorPath !== undefined && compareText(priorPath, descriptor.path) >= 0) {
      context.addIssue({
        code: "custom",
        path: ["files", index, "path"],
        message: "Workspace file descriptors must be sorted by path",
      });
    }
    priorPath = descriptor.path;

    const expectedRole = inferWorkspaceFileRole(descriptor.path, manifest.entrypoint);
    if (descriptor.role !== expectedRole) {
      context.addIssue({
        code: "custom",
        path: ["files", index, "role"],
        message: `File role must be derived from its path (${expectedRole})`,
      });
    }
    const expectedMediaType = inferWorkspaceMediaType(descriptor.path);
    if (descriptor.mediaType !== expectedMediaType) {
      context.addIssue({
        code: "custom",
        path: ["files", index, "mediaType"],
        message: `File media type must be derived from its path (${expectedMediaType})`,
      });
    }
    if (descriptor.role === "entrypoint") entrypointCount += 1;
  }

  if (manifest.fileCount !== manifest.files.length) {
    context.addIssue({
      code: "custom",
      path: ["fileCount"],
      message: "Manifest fileCount does not match its descriptors",
    });
  }
  if (manifest.totalBytes !== summedBytes) {
    context.addIssue({
      code: "custom",
      path: ["totalBytes"],
      message: "Manifest totalBytes does not match its descriptors",
    });
  }
  if (!descriptorPaths.has(manifest.entrypoint) || entrypointCount !== 1) {
    context.addIssue({
      code: "custom",
      path: ["entrypoint"],
      message: "Manifest must reference exactly one existing entrypoint",
    });
  }

  validateUniqueSortedByKey(manifest.capabilities, (item) => item.id, ["capabilities"], context);
  validateUniqueSortedByKey(manifest.validations, (item) => item.scope, ["validations"], context);

  for (const [index, capability] of manifest.capabilities.entries()) {
    for (const evidencePath of capability.evidencePaths) {
      if (!descriptorPaths.has(evidencePath)) {
        context.addIssue({
          code: "custom",
          path: ["capabilities", index, "evidencePaths"],
          message: `Capability evidence file does not exist: ${evidencePath}`,
        });
      }
    }
  }
  for (const [index, validation] of manifest.validations.entries()) {
    for (const evidencePath of validation.evidencePaths) {
      if (!descriptorPaths.has(evidencePath)) {
        context.addIssue({
          code: "custom",
          path: ["validations", index, "evidencePaths"],
          message: `Validation evidence file does not exist: ${evidencePath}`,
        });
      }
    }
  }

  if (manifest.buildLevel !== "production") return;

  const roles = new Set(manifest.files.map((file) => file.role));
  for (const role of REQUIRED_PRODUCTION_ROLES) {
    if (!roles.has(role)) {
      context.addIssue({
        code: "custom",
        path: ["files"],
        message: `Production workspace is missing required deliverable role: ${role}`,
      });
    }
  }

  const capabilities = new Map(
    manifest.capabilities.map((capability) => [capability.id, capability]),
  );
  for (const capabilityId of REQUIRED_PRODUCTION_CAPABILITIES) {
    const capability = capabilities.get(capabilityId);
    if (!capability) {
      context.addIssue({
        code: "custom",
        path: ["capabilities"],
        message: `Production workspace must declare capability: ${capabilityId}`,
      });
      continue;
    }
    if (capability.status === "blocked" || capability.status === "not_configured") {
      context.addIssue({
        code: "custom",
        path: ["capabilities"],
        message: `Production capability is not release-ready: ${capabilityId}`,
      });
    }
  }
  for (const capabilityId of ["frontend", "tests", "deployment", "monitoring"] as const) {
    if (capabilities.get(capabilityId)?.status !== "implemented") {
      context.addIssue({
        code: "custom",
        path: ["capabilities"],
        message: `Production capability must be implemented: ${capabilityId}`,
      });
    }
  }

  const validations = new Map(
    manifest.validations.map((validation) => [validation.scope, validation]),
  );
  for (const scope of REQUIRED_PRODUCTION_VALIDATIONS) {
    const validation = validations.get(scope);
    if (validation?.status !== "passed" || validation.evidence !== "measured") {
      context.addIssue({
        code: "custom",
        path: ["validations"],
        message: `Production validation must be measured and passed: ${scope}`,
      });
    }
  }
});

export type WorkspaceManifest = z.infer<typeof WorkspaceManifestSchema>;

export type SealWorkspaceInput = {
  jobId: string;
  projectId?: string;
  locale: "it" | "en" | "es" | "fr" | "de" | "pt";
  pipelineVersion: string;
  createdAt: string | number | Date;
  buildLevel: BuildLevel;
  entrypoint: string;
  files: Readonly<Record<string, string>>;
  capabilities?: readonly WorkspaceCapability[];
  validations?: readonly WorkspaceValidation[];
};

export type SealedWorkspace = {
  files: Record<string, string>;
  manifest: WorkspaceManifest;
};

export type CreateProductionWorkspaceCandidateInput = Omit<
  SealWorkspaceInput,
  "buildLevel" | "capabilities" | "validations"
>;

export type WorkspaceVerification = {
  valid: boolean;
  errors: string[];
  artifactSha256?: string;
};

export class WorkspaceValidationError extends Error {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[]) {
    super(issues.length > 0 ? `${message}: ${issues.join("; ")}` : message);
    this.name = "WorkspaceValidationError";
    this.issues = issues;
  }
}

function validateUniqueSortedByKey<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  path: PropertyKey[],
  context: z.core.$RefinementCtx<unknown>,
): void {
  const keys = new Set<string>();
  let prior: string | undefined;
  for (const [index, item] of items.entries()) {
    const key = getKey(item);
    if (keys.has(key)) {
      context.addIssue({
        code: "custom",
        path: [...path, index],
        message: `Duplicate manifest declaration: ${key}`,
      });
    }
    if (prior !== undefined && compareText(prior, key) >= 0) {
      context.addIssue({
        code: "custom",
        path: [...path, index],
        message: "Manifest declarations must be sorted",
      });
    }
    keys.add(key);
    prior = key;
  }
}

function normalizedExtension(path: string): string {
  const fileName = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot);
}

export function inferWorkspaceFileRole(path: string, entrypoint: string): WorkspaceFileRole {
  const normalized = path.normalize("NFC");
  const folded = normalized.toLocaleLowerCase("en-US");
  const basename = folded.slice(folded.lastIndexOf("/") + 1);
  if (normalized === entrypoint.normalize("NFC")) return "entrypoint";
  if (/^readme(?:\.[^/]*)?$/u.test(basename)) return "readme";
  if (/^(?:docs\/)?prd(?:\.[^/]*)?$/u.test(folded)) return "prd";
  if (/^(?:docs\/)?architecture(?:\.[^/]*)?$/u.test(folded)) {
    return "architecture";
  }
  if (basename === ".env.example" || basename.endsWith(".env.example")) {
    return "environment";
  }
  if (
    folded.startsWith("migrations/") ||
    folded.includes("/migrations/") ||
    basename.endsWith(".migration.sql")
  ) {
    return "migration";
  }
  if (
    folded.startsWith("tests/") ||
    folded.includes("/tests/") ||
    /\.(?:test|spec)\.[^/]+$/u.test(basename)
  ) {
    return "test";
  }
  if (
    basename === "netlify.toml" ||
    basename === "vercel.json" ||
    basename === "dockerfile" ||
    basename.startsWith("wrangler.") ||
    folded.startsWith("infra/") ||
    folded.startsWith("deployment/") ||
    folded.startsWith(".github/workflows/")
  ) {
    return "deployment";
  }
  if (/^(?:docs\/)?decisions(?:\.[^/]*)?$/u.test(folded)) return "decision";
  if (/^(?:docs\/)?score(?:\.[^/]*)?$/u.test(folded)) return "score";

  const extension = normalizedExtension(folded);
  if (
    [
      ".html",
      ".css",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".ts",
      ".tsx",
      ".vue",
      ".svelte",
      ".py",
      ".go",
      ".rs",
      ".java",
      ".kt",
      ".swift",
      ".sql",
    ].includes(extension)
  ) {
    return "source";
  }
  if ([".md", ".mdx", ".txt"].includes(extension)) return "documentation";
  if ([".json", ".jsonc", ".toml", ".yaml", ".yml", ".xml"].includes(extension)) {
    return "configuration";
  }
  return "asset";
}

export function inferWorkspaceMediaType(path: string): string {
  const extension = normalizedExtension(path);
  const mediaTypes: Readonly<Record<string, string>> = {
    ".css": "text/css",
    ".csv": "text/csv",
    ".html": "text/html",
    ".java": "text/x-java-source",
    ".js": "text/javascript",
    ".jsx": "text/jsx",
    ".json": "application/json",
    ".jsonc": "application/jsonc",
    ".kt": "text/x-kotlin",
    ".md": "text/markdown",
    ".mdx": "text/mdx",
    ".mjs": "text/javascript",
    ".cjs": "text/javascript",
    ".py": "text/x-python",
    ".rs": "text/x-rust",
    ".sql": "application/sql",
    ".svelte": "text/x-svelte",
    ".swift": "text/x-swift",
    ".toml": "application/toml",
    ".ts": "text/typescript",
    ".tsx": "text/tsx",
    ".txt": "text/plain",
    ".vue": "text/x-vue",
    ".xml": "application/xml",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
  };
  return mediaTypes[extension] ?? "text/plain";
}

function normalizeFiles(value: Readonly<Record<string, string>>): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkspaceValidationError("Workspace files are invalid", [
      "Workspace files must be a path-to-text record",
    ]);
  }
  const entries = Object.entries(value);
  const issues: string[] = [];
  if (entries.length === 0) issues.push("Workspace must contain at least one file");
  if (entries.length > MAX_WORKSPACE_FILES) {
    issues.push(`Workspace cannot contain more than ${MAX_WORKSPACE_FILES} files`);
  }

  const normalizedEntries: Array<[string, string]> = [];
  const foldedPaths = new Map<string, string>();
  let totalBytes = 0;
  for (const [rawPath, contents] of entries) {
    const parsedPath = WorkspacePathSchema.safeParse(rawPath);
    if (!parsedPath.success) {
      issues.push(...zodIssues(parsedPath.error, rawPath));
      continue;
    }
    if (typeof contents !== "string") {
      issues.push(`${parsedPath.data}: workspace files must contain text`);
      continue;
    }
    const path = parsedPath.data;
    const folded = path.toLocaleLowerCase("en-US");
    const collision = foldedPaths.get(folded);
    if (collision !== undefined) {
      issues.push(`Workspace path collision under NFC/case folding: ${collision} and ${rawPath}`);
      continue;
    }
    foldedPaths.set(folded, rawPath);
    const bytes = utf8Bytes(contents);
    totalBytes += bytes;
    if (bytes > MAX_WORKSPACE_FILE_BYTES) {
      issues.push(`${path}: file exceeds ${MAX_WORKSPACE_FILE_BYTES} UTF-8 bytes`);
    }
    if (SECRET_CONTENT_PATTERNS.some((pattern) => pattern.test(contents))) {
      issues.push(`${path}: potential secret content is not allowed in a workspace`);
    }
    if (path.toLocaleLowerCase("en-US").endsWith(".env.example")) {
      for (const line of contents.split(/\r?\n/u)) {
        const assignment = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
        if (!assignment) continue;
        const [, name = "", rawValue = ""] = assignment;
        const value = rawValue.replace(/^['"]|['"]$/gu, "");
        const isSecretName = /(?:SECRET|TOKEN|PASSWORD|PRIVATE|API_?KEY|CLIENT_?KEY)/iu.test(name);
        const isPlaceholder =
          value === "" ||
          /^<[^>]+>$/.test(value) ||
          /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(value) ||
          /^(?:YOUR|REPLACE|CHANGEME|EXAMPLE|PLACEHOLDER)[_-]/iu.test(value);
        if (isSecretName && !isPlaceholder) {
          issues.push(`${path}: secret-like environment values must be empty placeholders`);
        }
      }
    }
    normalizedEntries.push([path, contents]);
  }
  if (totalBytes > MAX_WORKSPACE_TOTAL_BYTES) {
    issues.push(`Workspace exceeds ${MAX_WORKSPACE_TOTAL_BYTES} total UTF-8 bytes`);
  }
  if (issues.length > 0) {
    throw new WorkspaceValidationError("Workspace files are invalid", issues);
  }
  normalizedEntries.sort(([left], [right]) => compareText(left, right));
  return Object.fromEntries(normalizedEntries);
}

function normalizeDate(value: string | number | Date): string {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new WorkspaceValidationError("Workspace metadata is invalid", [
      "createdAt must be a valid date",
    ]);
  }
  return date.toISOString();
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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

function manifestHashPayload(manifest: Omit<WorkspaceManifest, "artifactSha256">): string {
  return `helix-workspace-v1\n${stableJson(manifest)}`;
}

function unsignedManifest(manifest: WorkspaceManifest): Omit<WorkspaceManifest, "artifactSha256"> {
  const { artifactSha256: _artifactSha256, ...unsigned } = manifest;
  return unsigned;
}

async function descriptorsForFiles(
  files: Readonly<Record<string, string>>,
  entrypoint: string,
): Promise<WorkspaceFileDescriptor[]> {
  return Promise.all(
    Object.entries(files).map(async ([path, contents]) => ({
      path,
      role: inferWorkspaceFileRole(path, entrypoint),
      mediaType: inferWorkspaceMediaType(path),
      bytes: utf8Bytes(contents),
      sha256: await sha256Hex(contents),
    })),
  );
}

function candidateHashPayload(candidate: Omit<WorkspaceCandidate, "sourceSha256">): string {
  return `helix-workspace-candidate-v1\n${stableJson(candidate)}`;
}

function unsignedCandidate(
  candidate: WorkspaceCandidate,
): Omit<WorkspaceCandidate, "sourceSha256"> {
  const { sourceSha256: _sourceSha256, ...unsigned } = candidate;
  return unsigned;
}

/**
 * Create an immutable descriptor for an untrusted Production workspace before
 * any build claims exist. The structural/secret checks are intentionally
 * reused from the Prototype sealer, but the resulting candidate is explicitly
 * Production and contains no validation status. Only measured runner evidence
 * may later be converted into a release manifest.
 */
export async function createProductionWorkspaceCandidate(
  input: CreateProductionWorkspaceCandidateInput,
): Promise<{ files: Record<string, string>; candidate: WorkspaceCandidate }> {
  const structurallySealed = await sealWorkspace({
    ...input,
    buildLevel: "prototype",
    capabilities: [],
    validations: [],
  });
  const { manifest } = structurallySealed;
  const unsigned = {
    kind: "helix_workspace_candidate" as const,
    schemaVersion: "1.0.0" as const,
    jobId: manifest.jobId,
    ...(manifest.projectId === undefined ? {} : { projectId: manifest.projectId }),
    locale: manifest.locale,
    pipelineVersion: manifest.pipelineVersion,
    createdAt: manifest.createdAt,
    buildLevel: "production" as const,
    entrypoint: manifest.entrypoint,
    fileCount: manifest.fileCount,
    totalBytes: manifest.totalBytes,
    files: manifest.files,
  };
  const sourceSha256 = await sha256Hex(candidateHashPayload(unsigned));
  const candidate = WorkspaceCandidateSchema.parse({ ...unsigned, sourceSha256 });
  return { files: structurallySealed.files, candidate };
}

export async function verifyProductionWorkspaceCandidate(
  sourceFiles: Readonly<Record<string, string>>,
  sourceCandidate: unknown,
): Promise<WorkspaceVerification> {
  const parsed = WorkspaceCandidateSchema.safeParse(sourceCandidate);
  if (!parsed.success) {
    return {
      valid: false,
      errors: zodIssues(parsed.error, "candidate"),
    };
  }
  const candidate = parsed.data;
  try {
    const reconstructed = await createProductionWorkspaceCandidate({
      jobId: candidate.jobId,
      ...(candidate.projectId === undefined ? {} : { projectId: candidate.projectId }),
      locale: candidate.locale,
      pipelineVersion: candidate.pipelineVersion,
      createdAt: candidate.createdAt,
      entrypoint: candidate.entrypoint,
      files: sourceFiles,
    });
    const errors: string[] = [];
    if (stableJson(reconstructed.candidate.files) !== stableJson(candidate.files)) {
      errors.push("Workspace candidate descriptors do not match the supplied files");
    }
    if (reconstructed.candidate.sourceSha256 !== candidate.sourceSha256) {
      errors.push("Workspace candidate source hash does not match its canonical payload");
    }
    const canonicalHash = await sha256Hex(candidateHashPayload(unsignedCandidate(candidate)));
    if (canonicalHash !== candidate.sourceSha256) {
      errors.push("Workspace candidate source hash does not match its metadata");
    }
    return {
      valid: errors.length === 0,
      errors,
      artifactSha256: reconstructed.candidate.sourceSha256,
    };
  } catch (error) {
    return {
      valid: false,
      errors:
        error instanceof WorkspaceValidationError
          ? [...error.issues]
          : [error instanceof Error ? error.message : String(error)],
    };
  }
}

function parseDeclarations<T>(
  values: readonly T[] | undefined,
  schema: z.ZodType<T>,
  label: string,
  getKey: (item: T) => string,
): T[] {
  const result = z.array(schema).safeParse(values ?? []);
  if (!result.success) {
    throw new WorkspaceValidationError(
      `Workspace ${label} are invalid`,
      zodIssues(result.error, label),
    );
  }
  return [...result.data].sort((left, right) => compareText(getKey(left), getKey(right)));
}

export async function sealWorkspace(input: SealWorkspaceInput): Promise<SealedWorkspace> {
  const files = normalizeFiles(input.files);
  const entrypointResult = WorkspacePathSchema.safeParse(input.entrypoint);
  if (!entrypointResult.success) {
    throw new WorkspaceValidationError(
      "Workspace entrypoint is invalid",
      zodIssues(entrypointResult.error, "entrypoint"),
    );
  }
  const entrypoint = entrypointResult.data;
  if (!Object.hasOwn(files, entrypoint)) {
    throw new WorkspaceValidationError("Workspace entrypoint is invalid", [
      `Entrypoint does not exist in workspace files: ${entrypoint}`,
    ]);
  }

  const capabilities = parseDeclarations(
    input.capabilities,
    WorkspaceCapabilitySchema,
    "capabilities",
    (capability) => capability.id,
  );
  const validations = parseDeclarations(
    input.validations,
    WorkspaceValidationSchema,
    "validations",
    (validation) => validation.scope,
  );
  const descriptors = await descriptorsForFiles(files, entrypoint);
  descriptors.sort((left, right) => compareText(left.path, right.path));
  const totalBytes = descriptors.reduce((sum, descriptor) => sum + descriptor.bytes, 0);

  const unsigned = {
    kind: "helix_workspace" as const,
    schemaVersion: "1.0.0" as const,
    jobId: input.jobId,
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
    locale: input.locale,
    pipelineVersion: input.pipelineVersion,
    createdAt: normalizeDate(input.createdAt),
    buildLevel: input.buildLevel,
    entrypoint,
    fileCount: descriptors.length,
    totalBytes,
    files: descriptors,
    capabilities,
    validations,
  };
  const artifactSha256 = await sha256Hex(manifestHashPayload(unsigned));
  const parsed = WorkspaceManifestSchema.safeParse({
    ...unsigned,
    artifactSha256,
  });
  if (!parsed.success) {
    throw new WorkspaceValidationError(
      "Workspace manifest is invalid",
      zodIssues(parsed.error, "manifest"),
    );
  }
  return { files, manifest: parsed.data };
}

export async function verifyWorkspace(
  sourceFiles: Readonly<Record<string, string>>,
  sourceManifest: unknown,
): Promise<WorkspaceVerification> {
  const errors: string[] = [];
  let files: Record<string, string>;
  try {
    files = normalizeFiles(sourceFiles);
  } catch (error) {
    return {
      valid: false,
      errors:
        error instanceof WorkspaceValidationError
          ? [...error.issues]
          : [error instanceof Error ? error.message : String(error)],
    };
  }

  const parsed = WorkspaceManifestSchema.safeParse(sourceManifest);
  if (!parsed.success) {
    return {
      valid: false,
      errors: zodIssues(parsed.error, "manifest"),
    };
  }
  const manifest = parsed.data;
  const descriptors = await descriptorsForFiles(files, manifest.entrypoint);
  descriptors.sort((left, right) => compareText(left.path, right.path));
  if (stableJson(descriptors) !== stableJson(manifest.files)) {
    errors.push("Workspace file descriptors do not match the supplied files");
  }
  if (manifest.fileCount !== descriptors.length) {
    errors.push("Workspace file count does not match the supplied files");
  }
  const totalBytes = descriptors.reduce((sum, descriptor) => sum + descriptor.bytes, 0);
  if (manifest.totalBytes !== totalBytes) {
    errors.push("Workspace byte total does not match the supplied files");
  }

  const artifactSha256 = await sha256Hex(manifestHashPayload(unsignedManifest(manifest)));
  if (artifactSha256 !== manifest.artifactSha256) {
    errors.push("Workspace manifest artifact hash does not match its canonical payload");
  }
  return {
    valid: errors.length === 0,
    errors,
    artifactSha256,
  };
}

export async function workspaceExportFiles(
  files: Readonly<Record<string, string>>,
  manifest: WorkspaceManifest,
): Promise<Record<string, string>> {
  const verification = await verifyWorkspace(files, manifest);
  if (!verification.valid) {
    throw new WorkspaceValidationError("Cannot export an invalid workspace", verification.errors);
  }
  const normalized = normalizeFiles(files);
  const entries = [
    ...Object.entries(normalized),
    [WORKSPACE_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`] as const,
  ].sort(([left], [right]) => compareText(left, right));
  return Object.fromEntries(entries);
}

function zodIssues(error: z.ZodError, prefix: string): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `.${issue.path.join(".")}` : "";
    return `${prefix}${path}: ${issue.message}`;
  });
}
