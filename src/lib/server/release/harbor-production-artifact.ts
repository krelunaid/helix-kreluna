import { z } from "zod";
import { toBase64, zipFiles } from "@/lib/zip";
import {
  WORKSPACE_MANIFEST_PATH,
  WorkspaceManifestSchema,
  verifyWorkspace,
  workspaceExportFiles,
  type WorkspaceManifest,
} from "@/lib/workspace";
import { sha256BytesHex, sha256Utf8Hex } from "@/lib/server/release/integrity";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
export const HARBOR_PRODUCTION_PROVENANCE_PATH = "helix.harbor-provenance.json";
// The package is embedded as base64 in an authenticated JSON request. Keep raw
// bytes at 4 MiB so the encoded request stays below common 6 MiB buffered
// function ingress limits, including protocol metadata and signatures.
export const MAX_HARBOR_PRODUCTION_PACKAGE_BYTES = 4 * 1024 * 1024;

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const HarborProductionProvenanceSchema = z
  .object({
    kind: z.literal("helix_harbor_production_provenance"),
    schemaVersion: z.literal("1.0.0"),
    target: z.literal("web"),
    buildJobId: z.string().trim().min(1).max(200),
    projectId: z.string().trim().min(1).max(200),
    humanGateArtifactSha256: z.string().regex(SHA256_PATTERN),
    workspaceArtifactSha256: z.string().regex(SHA256_PATTERN),
    workspaceManifestPath: z.literal(WORKSPACE_MANIFEST_PATH),
    entrypoint: z.string().trim().min(1).max(512),
    pipelineVersion: z.string().trim().min(1).max(120),
    workspaceCreatedAt: z.string().datetime({ offset: true }),
    workspaceFileCount: z.number().int().positive(),
  })
  .strict();
export type HarborProductionProvenance = z.infer<typeof HarborProductionProvenanceSchema>;

export const HarborProductionPackageSchema = z
  .object({
    filename: z
      .string()
      .trim()
      .min(5)
      .max(200)
      .regex(/\.zip$/u),
    sha256: z.string().regex(SHA256_PATTERN),
    byteLength: z.number().int().positive().max(MAX_HARBOR_PRODUCTION_PACKAGE_BYTES),
    fileCount: z.number().int().positive().max(256),
    provenanceSha256: z.string().regex(SHA256_PATTERN),
    base64: z
      .string()
      .min(4)
      .max(Math.ceil(MAX_HARBOR_PRODUCTION_PACKAGE_BYTES / 3) * 4 + 16),
  })
  .strict();
export type HarborProductionPackage = z.infer<typeof HarborProductionPackageSchema>;

export type HarborProductionArtifact = {
  provenance: HarborProductionProvenance;
  sourcePackage: HarborProductionPackage;
};

export class HarborProductionArtifactError extends Error {
  readonly code: string;
  readonly retryable = false;

  constructor(code: string) {
    super(code);
    this.name = "HarborProductionArtifactError";
    this.code = code;
  }
}

function safeFilenamePart(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120);
  return normalized || "workspace";
}

function decodeBase64(value: string): Uint8Array {
  try {
    const decoded = Buffer.from(value, "base64");
    if (decoded.toString("base64") !== value) {
      throw new HarborProductionArtifactError("HARBOR_PRODUCTION_PACKAGE_INVALID");
    }
    return Uint8Array.from(decoded);
  } catch {
    throw new HarborProductionArtifactError("HARBOR_PRODUCTION_PACKAGE_INVALID");
  }
}

/**
 * Package the exact sealed multi-file Production workspace. The ZIP includes
 * both the workspace manifest and a deterministic Human-Gate provenance file;
 * changing any source byte, descriptor, job identity, or approved preview hash
 * therefore changes the package SHA-256 accepted by Harbor.
 */
export async function createHarborProductionArtifact(input: {
  buildJobId: string;
  projectId: string;
  humanGateArtifactSha256: string;
  files: Readonly<Record<string, string>>;
  workspace: WorkspaceManifest;
}): Promise<HarborProductionArtifact> {
  const workspace = WorkspaceManifestSchema.parse(input.workspace);
  if (
    workspace.buildLevel !== "production" ||
    workspace.jobId !== input.buildJobId ||
    workspace.projectId !== input.projectId ||
    !SHA256_PATTERN.test(input.humanGateArtifactSha256)
  ) {
    throw new HarborProductionArtifactError("HARBOR_PRODUCTION_PROVENANCE_MISMATCH");
  }
  const verification = await verifyWorkspace(input.files, workspace);
  if (!verification.valid || verification.artifactSha256 !== workspace.artifactSha256) {
    throw new HarborProductionArtifactError("HARBOR_PRODUCTION_WORKSPACE_INVALID");
  }
  const provenance = HarborProductionProvenanceSchema.parse({
    kind: "helix_harbor_production_provenance",
    schemaVersion: "1.0.0",
    target: "web",
    buildJobId: input.buildJobId,
    projectId: input.projectId,
    humanGateArtifactSha256: input.humanGateArtifactSha256,
    workspaceArtifactSha256: workspace.artifactSha256,
    workspaceManifestPath: WORKSPACE_MANIFEST_PATH,
    entrypoint: workspace.entrypoint,
    pipelineVersion: workspace.pipelineVersion,
    workspaceCreatedAt: workspace.createdAt,
    workspaceFileCount: workspace.fileCount,
  });
  const provenanceJson = `${JSON.stringify(provenance, null, 2)}\n`;
  const provenanceSha256 = await sha256Utf8Hex(provenanceJson);
  const exported = await workspaceExportFiles(input.files, workspace);
  const foldedProvenancePath = HARBOR_PRODUCTION_PROVENANCE_PATH.toLocaleLowerCase("en-US");
  if (
    Object.keys(exported).some(
      (path) => path.normalize("NFC").toLocaleLowerCase("en-US") === foldedProvenancePath,
    )
  ) {
    throw new HarborProductionArtifactError("HARBOR_PRODUCTION_PROVENANCE_PATH_COLLISION");
  }
  const packageFiles = Object.fromEntries(
    [
      ...Object.entries(exported),
      [HARBOR_PRODUCTION_PROVENANCE_PATH, provenanceJson] as const,
    ].sort(([left], [right]) => compareCodePoints(left, right)),
  );
  const bytes = zipFiles(packageFiles);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_HARBOR_PRODUCTION_PACKAGE_BYTES) {
    throw new HarborProductionArtifactError("HARBOR_PRODUCTION_PACKAGE_TOO_LARGE");
  }
  const sourcePackage = HarborProductionPackageSchema.parse({
    filename: `${safeFilenamePart(input.projectId)}-production.zip`,
    sha256: await sha256BytesHex(bytes),
    byteLength: bytes.byteLength,
    fileCount: Object.keys(packageFiles).length,
    provenanceSha256,
    base64: toBase64(bytes),
  });
  return { provenance, sourcePackage };
}

export async function verifyHarborProductionArtifact(
  artifact: HarborProductionArtifact,
): Promise<void> {
  const provenance = HarborProductionProvenanceSchema.safeParse(artifact.provenance);
  if (!provenance.success) {
    throw new HarborProductionArtifactError("HARBOR_PRODUCTION_PACKAGE_INVALID");
  }
  const sourcePackage = await verifyHarborProductionPackage(artifact.sourcePackage);
  const canonicalProvenance = `${JSON.stringify(provenance.data, null, 2)}\n`;
  if ((await sha256Utf8Hex(canonicalProvenance)) !== sourcePackage.provenanceSha256) {
    throw new HarborProductionArtifactError("HARBOR_PRODUCTION_PACKAGE_INTEGRITY_FAILED");
  }
}

export async function verifyHarborProductionPackage(
  candidate: unknown,
): Promise<HarborProductionPackage> {
  const sourcePackage = HarborProductionPackageSchema.safeParse(candidate);
  if (!sourcePackage.success) {
    throw new HarborProductionArtifactError("HARBOR_PRODUCTION_PACKAGE_INVALID");
  }
  const packageBytes = decodeBase64(sourcePackage.data.base64);
  if (
    packageBytes.byteLength !== sourcePackage.data.byteLength ||
    (await sha256BytesHex(packageBytes)) !== sourcePackage.data.sha256
  ) {
    throw new HarborProductionArtifactError("HARBOR_PRODUCTION_PACKAGE_INTEGRITY_FAILED");
  }
  return sourcePackage.data;
}
