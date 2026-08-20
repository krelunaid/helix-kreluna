import { isValidHtmlArtifact } from "@/lib/server/agents/html";
import { AgentOutputError, type GemPatch } from "@/lib/server/agents/types";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(digest));
}

function occurrenceCount(value: string, needle: string): number {
  let count = 0;
  let offset = 0;
  while (offset <= value.length - needle.length) {
    const index = value.indexOf(needle, offset);
    if (index < 0) break;
    count += 1;
    offset = index + needle.length;
  }
  return count;
}

export async function applyControlledGemPatch(
  html: string,
  change: GemPatch,
): Promise<string> {
  if ((await sha256Hex(html)) !== change.beforeHash) {
    throw new AgentOutputError("GEM_PATCH_STALE_BASE");
  }
  if (occurrenceCount(html, change.before) !== 1) {
    throw new AgentOutputError("GEM_PATCH_TARGET_NOT_UNIQUE");
  }
  const next = html.replace(change.before, change.patch);
  if (!isValidHtmlArtifact(next) || next.length > 256_000) {
    throw new AgentOutputError("GEM_PATCH_HTML_INVALID");
  }
  return next;
}
