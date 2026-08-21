import { expoFiles } from "@/lib/expo-pack";
import {
  PRODUCTION_REQUIREMENTS_PATH,
  ProductionRequirementsSchema,
} from "@/lib/production-artifact-graph";
import { sha256Utf8Hex } from "@/lib/server/release/integrity";
import {
  ORBIT_PRODUCTION_PACKAGE_PROFILE,
  ProductionStoreArtifactDescriptorSchema,
  ProductionStorePackageManifestSchema,
  STORE_PACKAGE_MANIFEST_PATH,
  StoreIdentitySchema,
  type ProductionStoreArtifactDescriptor,
  type ProductionStorePackageManifest,
  type StoreIdentity,
} from "@/lib/server/store-artifact-contract";
import {
  canonicalStoreJson,
  describeStorePackageFiles,
  sortedStoreFiles,
  StoreProductionPackagingError,
} from "@/lib/server/store-production-package";
import { WorkspaceManifestSchema, verifyWorkspace, type WorkspaceManifest } from "@/lib/workspace";

export {
  ORBIT_PRODUCTION_PACKAGE_PROFILE,
  ProductionStoreArtifactDescriptorSchema,
  ProductionStorePackageManifestSchema,
  STORE_PACKAGE_MANIFEST_PATH,
} from "@/lib/server/store-artifact-contract";
export type {
  ProductionStoreArtifactDescriptor,
  ProductionStorePackageManifest,
  StorePackageFileDescriptor,
} from "@/lib/server/store-artifact-contract";
export {
  StoreProductionPackagingError,
  verifyProductionStorePackageFiles,
} from "@/lib/server/store-production-package";
export type { StoreProductionPackagingErrorCode } from "@/lib/server/store-production-package";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

export type ApprovedProductionStoreSource = Readonly<{
  jobId: string;
  buildLevel: "production";
  html: string;
  artifactSha256: string;
  files: Readonly<Record<string, string>>;
  workspace: WorkspaceManifest;
}>;

export type PreparedProductionStorePackage = Readonly<{
  files: Record<string, string>;
  manifest: ProductionStorePackageManifest;
  manifestJson: string;
  descriptor: ProductionStoreArtifactDescriptor;
  status: "source_package_prepared";
  submissionStatus: "not_executed";
}>;

function parseRequirements(files: Readonly<Record<string, string>>) {
  const source = files[PRODUCTION_REQUIREMENTS_PATH];
  if (!source) throw new StoreProductionPackagingError("STORE_PRODUCTION_REQUIREMENTS_INVALID");
  let candidate: unknown;
  try {
    candidate = JSON.parse(source) as unknown;
  } catch {
    throw new StoreProductionPackagingError("STORE_PRODUCTION_REQUIREMENTS_INVALID");
  }
  const parsed = ProductionRequirementsSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new StoreProductionPackagingError("STORE_PRODUCTION_REQUIREMENTS_INVALID");
  }
  return parsed.data;
}

async function assertApprovedStaticProductionSource(
  source: ApprovedProductionStoreSource,
): Promise<void> {
  const parsedWorkspace = WorkspaceManifestSchema.safeParse(source.workspace);
  if (
    !parsedWorkspace.success ||
    parsedWorkspace.data.buildLevel !== "production" ||
    parsedWorkspace.data.jobId !== source.jobId
  ) {
    throw new StoreProductionPackagingError("STORE_PRODUCTION_WORKSPACE_INVALID");
  }
  const workspaceVerification = await verifyWorkspace(source.files, parsedWorkspace.data);
  if (!workspaceVerification.valid) {
    throw new StoreProductionPackagingError("STORE_PRODUCTION_WORKSPACE_INVALID");
  }
  if (
    !SHA256_PATTERN.test(source.artifactSha256) ||
    (await sha256Utf8Hex(source.html)) !== source.artifactSha256
  ) {
    throw new StoreProductionPackagingError("STORE_PRODUCTION_PREVIEW_INTEGRITY_FAILED");
  }
  const requirements = parseRequirements(source.files);
  if (requirements.runtimeProfile !== "static_site") {
    throw new StoreProductionPackagingError("STORE_PRODUCTION_RUNTIME_UNSUPPORTED", {
      runtimeProfile: requirements.runtimeProfile,
    });
  }
}

function versionedExpoFiles(input: {
  source: ApprovedProductionStoreSource;
  identity: StoreIdentity;
  title: string;
  slug: string;
  liveUrl: string;
}): Record<string, string> {
  const files = expoFiles({
    title: input.title,
    slug: input.slug,
    html: input.source.html,
    bundleId: input.identity.appIdentifier,
    easProjectId: input.identity.easProjectId,
    appleTeam: input.identity.appleTeamId ?? undefined,
    liveUrl: input.liveUrl,
    platform: input.identity.platform,
  });
  const app = JSON.parse(files["app.json"] ?? "null") as {
    expo?: { version?: string };
  } | null;
  const packageJson = JSON.parse(files["package.json"] ?? "null") as {
    version?: string;
    dependencies?: Record<string, string>;
  } | null;
  const eas = JSON.parse(files["eas.json"] ?? "null") as {
    cli?: Record<string, unknown>;
    build?: { production?: Record<string, unknown> };
  } | null;
  if (!app?.expo || !packageJson || !eas?.build?.production) {
    throw new StoreProductionPackagingError("STORE_PRODUCTION_PACKAGE_INVALID");
  }
  app.expo.version = input.identity.version;
  packageJson.version = input.identity.version;
  if (packageJson.dependencies) {
    packageJson.dependencies = Object.fromEntries(
      Object.entries(packageJson.dependencies).map(([name, version]) => [
        name,
        version.replace(/^[~^]/u, ""),
      ]),
    );
  }
  eas.cli = { ...(eas.cli ?? {}), appVersionSource: "remote" };
  eas.build.production = { ...eas.build.production, autoIncrement: true };
  files["app.json"] = JSON.stringify(app, null, 2);
  files["package.json"] = JSON.stringify(packageJson, null, 2);
  files["eas.json"] = JSON.stringify(eas, null, 2);
  return files;
}

/**
 * Package only a Human-Gate-approved, sealed static Production workspace.
 * The output is deliberately classified as a web-to-native wrapper: Orbit
 * prepares source, while the authenticated EAS runner remains the only path
 * that may later claim a measured native build or Store distribution.
 */
export async function prepareApprovedProductionStorePackage(input: {
  source: ApprovedProductionStoreSource;
  identity: StoreIdentity;
  title: string;
  slug: string;
  liveUrl: string;
}): Promise<PreparedProductionStorePackage> {
  const identity = StoreIdentitySchema.parse(input.identity);
  if (!RELEASE_VERSION_PATTERN.test(identity.version)) {
    throw new StoreProductionPackagingError("STORE_PRODUCTION_RELEASE_VERSION_INVALID");
  }
  await assertApprovedStaticProductionSource(input.source);
  const packageFiles = versionedExpoFiles({ ...input, identity });
  const manifest = ProductionStorePackageManifestSchema.parse({
    kind: "helix_store_package_manifest",
    schemaVersion: "1.0.0",
    sourceBuildLevel: "production",
    artifactKind: "web_to_native_wrapper",
    packager: "orbit",
    packagingProfile: ORBIT_PRODUCTION_PACKAGE_PROFILE,
    nativeImplementation: false,
    runtimeProfile: "static_site",
    networkPolicy: "offline_embedded_document",
    jobId: input.source.jobId,
    sourcePreviewSha256: input.source.artifactSha256,
    sourceWorkspaceSha256: input.source.workspace.artifactSha256,
    identity,
    files: await describeStorePackageFiles(packageFiles),
  });
  const manifestJson = canonicalStoreJson(manifest);
  const packageManifestSha256 = await sha256Utf8Hex(manifestJson);
  const descriptor = ProductionStoreArtifactDescriptorSchema.parse({
    kind: "helix_store_artifact_descriptor",
    schemaVersion: "1.0.0",
    sourceBuildLevel: "production",
    artifactKind: "web_to_native_wrapper",
    packagingProfile: ORBIT_PRODUCTION_PACKAGE_PROFILE,
    nativeImplementation: false,
    runtimeProfile: "static_site",
    sourcePreviewSha256: input.source.artifactSha256,
    sourceWorkspaceSha256: input.source.workspace.artifactSha256,
    packageManifestSha256,
  });
  return {
    files: sortedStoreFiles({ ...packageFiles, [STORE_PACKAGE_MANIFEST_PATH]: manifestJson }),
    manifest,
    manifestJson,
    descriptor,
    status: "source_package_prepared",
    submissionStatus: "not_executed",
  };
}
