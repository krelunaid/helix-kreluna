import { z } from "zod";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const APP_IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*){2,}$/u;
const APPLE_TEAM_PATTERN = /^[A-Z0-9]{10}$/u;

export const STORE_PACKAGE_MANIFEST_PATH = "helix.store-package.json";
export const LEGACY_PROTOTYPE_PACKAGE_PROFILE = "legacy_expo_wrapper_v1" as const;
export const ORBIT_PRODUCTION_PACKAGE_PROFILE = "orbit_expo_static_wrapper_v1" as const;
export const MAX_STORE_PACKAGE_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_STORE_PACKAGE_FILES = 32;
const FORBIDDEN_PACKAGE_SEGMENTS = new Set([
  ".git",
  "node_modules",
  "__proto__",
  "prototype",
  "constructor",
]);

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

export const StorePackagePathSchema = z
  .string()
  .min(1)
  .max(512)
  .superRefine((value, context) => {
    const normalized = value.normalize("NFC");
    const segments = normalized.split("/");
    if (
      value !== normalized ||
      value !== value.trim() ||
      value.startsWith("/") ||
      value.includes("\\") ||
      value.includes(":") ||
      value.includes("%") ||
      containsControlCharacter(value) ||
      new TextEncoder().encode(value).byteLength > 512 ||
      segments.some(
        (segment) =>
          segment === "" ||
          segment === "." ||
          segment === ".." ||
          segment.endsWith(".") ||
          segment.endsWith(" ") ||
          FORBIDDEN_PACKAGE_SEGMENTS.has(segment.toLocaleLowerCase("en-US")) ||
          new TextEncoder().encode(segment).byteLength > 255,
      )
    ) {
      context.addIssue({ code: "custom", message: "Store package path is unsafe" });
    }
  });

export const StoreIdentitySchema = z
  .object({
    platform: z.enum(["ios", "android"]),
    appIdentifier: z.string().trim().min(5).max(160).regex(APP_IDENTIFIER_PATTERN),
    easProjectId: z.string().uuid(),
    version: z.string().trim().min(1).max(40),
    appleTeamId: z.string().regex(APPLE_TEAM_PATTERN).nullable(),
    destination: z.enum(["testflight", "play_internal"]),
  })
  .strict()
  .superRefine((identity, context) => {
    if (
      identity.platform === "ios" &&
      (identity.destination !== "testflight" || identity.appleTeamId === null)
    ) {
      context.addIssue({ code: "custom", message: "iOS requires TestFlight and Apple Team ID" });
    }
    if (
      identity.platform === "android" &&
      (identity.destination !== "play_internal" || identity.appleTeamId !== null)
    ) {
      context.addIssue({ code: "custom", message: "Android requires the Play internal track" });
    }
  });
export type StoreIdentity = z.infer<typeof StoreIdentitySchema>;

export const StorePackageFileDescriptorSchema = z
  .object({
    path: StorePackagePathSchema,
    bytes: z.number().int().nonnegative().max(MAX_STORE_PACKAGE_FILE_BYTES),
    sha256: z.string().regex(SHA256_PATTERN),
  })
  .strict();
export type StorePackageFileDescriptor = z.infer<typeof StorePackageFileDescriptorSchema>;

export const LegacyPrototypeStoreArtifactDescriptorSchema = z
  .object({
    kind: z.literal("helix_store_artifact_descriptor"),
    schemaVersion: z.literal("1.0.0"),
    sourceBuildLevel: z.literal("prototype"),
    artifactKind: z.literal("legacy_web_to_native_wrapper"),
    packagingProfile: z.literal(LEGACY_PROTOTYPE_PACKAGE_PROFILE),
    nativeImplementation: z.literal(false),
    runtimeProfile: z.literal("prototype_preview"),
    sourcePreviewSha256: z.null(),
    sourceWorkspaceSha256: z.null(),
    packageManifestSha256: z.null(),
  })
  .strict();
export type LegacyPrototypeStoreArtifactDescriptor = z.infer<
  typeof LegacyPrototypeStoreArtifactDescriptorSchema
>;

export const ProductionStoreArtifactDescriptorSchema = z
  .object({
    kind: z.literal("helix_store_artifact_descriptor"),
    schemaVersion: z.literal("1.0.0"),
    sourceBuildLevel: z.literal("production"),
    artifactKind: z.literal("web_to_native_wrapper"),
    packagingProfile: z.literal(ORBIT_PRODUCTION_PACKAGE_PROFILE),
    nativeImplementation: z.literal(false),
    runtimeProfile: z.literal("static_site"),
    sourcePreviewSha256: z.string().regex(SHA256_PATTERN),
    sourceWorkspaceSha256: z.string().regex(SHA256_PATTERN),
    packageManifestSha256: z.string().regex(SHA256_PATTERN),
  })
  .strict();
export type ProductionStoreArtifactDescriptor = z.infer<
  typeof ProductionStoreArtifactDescriptorSchema
>;

export const StoreArtifactDescriptorSchema = z.discriminatedUnion("sourceBuildLevel", [
  LegacyPrototypeStoreArtifactDescriptorSchema,
  ProductionStoreArtifactDescriptorSchema,
]);
export type StoreArtifactDescriptor = z.infer<typeof StoreArtifactDescriptorSchema>;

export const LEGACY_PROTOTYPE_STORE_ARTIFACT_DESCRIPTOR =
  LegacyPrototypeStoreArtifactDescriptorSchema.parse({
    kind: "helix_store_artifact_descriptor",
    schemaVersion: "1.0.0",
    sourceBuildLevel: "prototype",
    artifactKind: "legacy_web_to_native_wrapper",
    packagingProfile: LEGACY_PROTOTYPE_PACKAGE_PROFILE,
    nativeImplementation: false,
    runtimeProfile: "prototype_preview",
    sourcePreviewSha256: null,
    sourceWorkspaceSha256: null,
    packageManifestSha256: null,
  });

export const ProductionStorePackageManifestSchema = z
  .object({
    kind: z.literal("helix_store_package_manifest"),
    schemaVersion: z.literal("1.0.0"),
    sourceBuildLevel: z.literal("production"),
    artifactKind: z.literal("web_to_native_wrapper"),
    packager: z.literal("orbit"),
    packagingProfile: z.literal(ORBIT_PRODUCTION_PACKAGE_PROFILE),
    nativeImplementation: z.literal(false),
    runtimeProfile: z.literal("static_site"),
    networkPolicy: z.literal("offline_embedded_document"),
    jobId: z.string().trim().min(1).max(200),
    sourcePreviewSha256: z.string().regex(SHA256_PATTERN),
    sourceWorkspaceSha256: z.string().regex(SHA256_PATTERN),
    identity: StoreIdentitySchema,
    files: z.array(StorePackageFileDescriptorSchema).min(1).max(MAX_STORE_PACKAGE_FILES),
  })
  .strict()
  .superRefine((manifest, context) => {
    const paths = new Set<string>();
    let priorPath: string | undefined;
    for (const [index, descriptor] of manifest.files.entries()) {
      const folded = descriptor.path.normalize("NFC").toLocaleLowerCase("en-US");
      if (paths.has(folded)) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: "Store package paths must be unique under NFC/case folding",
        });
      }
      if (priorPath !== undefined && priorPath >= descriptor.path) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: "Store package file descriptors must be sorted",
        });
      }
      if (descriptor.path === STORE_PACKAGE_MANIFEST_PATH) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: "The package manifest cannot describe itself",
        });
      }
      paths.add(folded);
      priorPath = descriptor.path;
    }
  });
export type ProductionStorePackageManifest = z.infer<typeof ProductionStorePackageManifestSchema>;
