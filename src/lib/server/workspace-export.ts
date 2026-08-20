import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { slugify } from "@/lib/expo-pack";
import { getApprovedOwnedBuild } from "@/lib/server/review/human-gate";
import { sha256BytesHex } from "@/lib/server/release/integrity";
import { workspaceExportFiles } from "@/lib/workspace";
import { toBase64, zipFiles } from "@/lib/zip";

export class WorkspaceExportError extends Error {
  readonly code: "WORKSPACE_MANIFEST_MISSING" | "WORKSPACE_EXPORT_INVALID";
  readonly status = 409;

  constructor(code: WorkspaceExportError["code"]) {
    super(code);
    this.name = "WorkspaceExportError";
    this.code = code;
  }
}

export const downloadApprovedWorkspace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { projectId: string; jobId: string }) => ({
    projectId: input.projectId.trim().slice(0, 128),
    jobId: input.jobId.trim().slice(0, 128),
  }))
  .handler(async ({ context, data }) => {
    const artifact = await getApprovedOwnedBuild({
      jobId: data.jobId,
      projectId: data.projectId,
      userId: context.userId,
    });
    if (!artifact.workspace) {
      throw new WorkspaceExportError("WORKSPACE_MANIFEST_MISSING");
    }
    const files = await workspaceExportFiles(
      artifact.files,
      artifact.workspace,
    ).catch(() => {
      throw new WorkspaceExportError("WORKSPACE_EXPORT_INVALID");
    });
    const zip = zipFiles(files);
    return {
      filename: `${slugify(artifact.title || "helix-project")}-${artifact.buildLevel}-workspace.zip`,
      base64: toBase64(zip),
      buildLevel: artifact.buildLevel,
      workspaceSha256: artifact.workspace.artifactSha256,
      previewSha256: artifact.artifactSha256,
      packageSha256: await sha256BytesHex(zip),
      fileCount: Object.keys(files).length,
      status: "source_workspace_prepared" as const,
    };
  });
