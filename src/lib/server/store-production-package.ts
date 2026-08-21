// This module is loaded directly by the standalone Node Store runner.
import {
  ProductionStoreArtifactDescriptorSchema,
  ProductionStorePackageManifestSchema,
  STORE_PACKAGE_MANIFEST_PATH,
  StoreIdentitySchema,
  type ProductionStoreArtifactDescriptor,
  type ProductionStorePackageManifest,
  type StoreIdentity,
  type StorePackageFileDescriptor,
} from "./store-artifact-contract.ts";
import { sha256Utf8Hex } from "./release/integrity.ts";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export type StoreProductionPackagingErrorCode =
  | "STORE_PRODUCTION_WORKSPACE_INVALID"
  | "STORE_PRODUCTION_PREVIEW_INTEGRITY_FAILED"
  | "STORE_PRODUCTION_REQUIREMENTS_INVALID"
  | "STORE_PRODUCTION_RUNTIME_UNSUPPORTED"
  | "STORE_PRODUCTION_RELEASE_VERSION_INVALID"
  | "STORE_PRODUCTION_PACKAGE_INVALID";

export class StoreProductionPackagingError extends Error {
  readonly status = 409;
  readonly retryable = false;
  readonly code: StoreProductionPackagingErrorCode;
  readonly runtimeProfile?: "static_site" | "client_only_app" | "service_app";

  constructor(
    code: StoreProductionPackagingErrorCode,
    options: { runtimeProfile?: "static_site" | "client_only_app" | "service_app" } = {},
  ) {
    super(code);
    this.name = "StoreProductionPackagingError";
    this.code = code;
    this.runtimeProfile = options.runtimeProfile;
  }
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function stableStoreJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStoreJson(item)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => compareText(left, right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStoreJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function canonicalStoreJson(value: unknown): string {
  return `${stableStoreJson(value)}\n`;
}

export function sortedStoreFiles(files: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).sort(([left], [right]) => compareText(left, right)),
  );
}

export async function describeStorePackageFiles(
  files: Readonly<Record<string, string>>,
): Promise<StorePackageFileDescriptor[]> {
  const encoder = new TextEncoder();
  return Promise.all(
    Object.entries(files)
      .sort(([left], [right]) => compareText(left, right))
      .map(async ([path, content]) => ({
        path,
        bytes: encoder.encode(content).byteLength,
        sha256: await sha256Utf8Hex(content),
      })),
  );
}

/** Recompute the manifest and every listed file after bounded ZIP extraction. */
export async function verifyProductionStorePackageFiles(input: {
  files: Readonly<Record<string, string>>;
  descriptor: ProductionStoreArtifactDescriptor;
  expectedIdentity: StoreIdentity;
}): Promise<ProductionStorePackageManifest> {
  const descriptor = ProductionStoreArtifactDescriptorSchema.parse(input.descriptor);
  const expectedIdentity = StoreIdentitySchema.parse(input.expectedIdentity);
  const manifestJson = input.files[STORE_PACKAGE_MANIFEST_PATH];
  if (!manifestJson || (await sha256Utf8Hex(manifestJson)) !== descriptor.packageManifestSha256) {
    throw new StoreProductionPackagingError("STORE_PRODUCTION_PACKAGE_INVALID");
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(manifestJson) as unknown;
  } catch {
    throw new StoreProductionPackagingError("STORE_PRODUCTION_PACKAGE_INVALID");
  }
  const parsed = ProductionStorePackageManifestSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new StoreProductionPackagingError("STORE_PRODUCTION_PACKAGE_INVALID");
  }
  const manifest = parsed.data;
  if (
    !SHA256_PATTERN.test(descriptor.sourcePreviewSha256) ||
    manifest.sourcePreviewSha256 !== descriptor.sourcePreviewSha256 ||
    manifest.sourceWorkspaceSha256 !== descriptor.sourceWorkspaceSha256 ||
    manifest.packagingProfile !== descriptor.packagingProfile ||
    stableStoreJson(manifest.identity) !== stableStoreJson(expectedIdentity)
  ) {
    throw new StoreProductionPackagingError("STORE_PRODUCTION_PACKAGE_INVALID");
  }
  const contentFiles = Object.fromEntries(
    Object.entries(input.files).filter(([path]) => path !== STORE_PACKAGE_MANIFEST_PATH),
  );
  const actualDescriptors = await describeStorePackageFiles(contentFiles);
  if (stableStoreJson(actualDescriptors) !== stableStoreJson(manifest.files)) {
    throw new StoreProductionPackagingError("STORE_PRODUCTION_PACKAGE_INVALID");
  }
  return manifest;
}
