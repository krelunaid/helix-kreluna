import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { getApprovedOwnedBuild } from "@/lib/server/review/human-gate";
import { workspaceExportFiles } from "@/lib/workspace";

const GITHUB_TOKEN_KEY_ENV = "GITHUB_TOKEN_ENCRYPTION_KEY";
const GITHUB_TOKEN_KEY_VERSION_ENV = "GITHUB_TOKEN_KEY_VERSION";

type GithubTokenEnvelope = {
  ciphertext: string;
  nonce: string;
  keyVersion: string;
};

type GithubTokenSecurityErrorCode =
  | "GITHUB_TOKEN_ENCRYPTION_KEY_MISSING"
  | "GITHUB_TOKEN_ENCRYPTION_KEY_INVALID"
  | "GITHUB_TOKEN_DECRYPT_FAILED";

export class GithubTokenConfigurationError extends Error {
  readonly code: GithubTokenSecurityErrorCode;
  readonly status: 409 | 503;

  constructor(code: GithubTokenSecurityErrorCode) {
    super(code);
    this.name = "GithubTokenConfigurationError";
    this.code = code;
    this.status = code === "GITHUB_TOKEN_DECRYPT_FAILED" ? 409 : 503;
  }
}

function ownedArrayBuffer(bytes: ArrayLike<number>): ArrayBuffer {
  const owned = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    owned[index] = bytes[index] ?? 0;
  }
  return owned.buffer;
}

function githubTokenKeyMaterial(): ArrayBuffer {
  const configured = process.env[GITHUB_TOKEN_KEY_ENV]?.trim();
  if (!configured) {
    throw new GithubTokenConfigurationError(
      "GITHUB_TOKEN_ENCRYPTION_KEY_MISSING",
    );
  }
  const isHex = /^[0-9a-f]{64}$/i.test(configured);
  const isBase64Url = /^[A-Za-z0-9_-]{43}=?$/.test(configured);
  if (!isHex && !isBase64Url) {
    throw new GithubTokenConfigurationError(
      "GITHUB_TOKEN_ENCRYPTION_KEY_INVALID",
    );
  }
  const bytes = /^[0-9a-f]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64url");
  if (bytes.byteLength !== 32) {
    throw new GithubTokenConfigurationError(
      "GITHUB_TOKEN_ENCRYPTION_KEY_INVALID",
    );
  }
  return ownedArrayBuffer(bytes);
}

function githubTokenKeyVersion(): string {
  const version =
    process.env[GITHUB_TOKEN_KEY_VERSION_ENV]?.trim() || "v1";
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(version)) {
    throw new GithubTokenConfigurationError(
      "GITHUB_TOKEN_ENCRYPTION_KEY_INVALID",
    );
  }
  return version;
}

async function importGithubTokenKey() {
  return crypto.subtle.importKey(
    "raw",
    githubTokenKeyMaterial(),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

function githubTokenAad(userId: string, keyVersion: string): ArrayBuffer {
  return ownedArrayBuffer(
    new TextEncoder().encode(`helix-github-token:${keyVersion}:${userId}`),
  );
}

export async function encryptGithubToken(
  token: string,
  userId: string,
): Promise<GithubTokenEnvelope> {
  const keyVersion = githubTokenKeyVersion();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: ownedArrayBuffer(nonce),
      additionalData: githubTokenAad(userId, keyVersion),
      tagLength: 128,
    },
    await importGithubTokenKey(),
    ownedArrayBuffer(new TextEncoder().encode(token)),
  );
  return {
    ciphertext: Buffer.from(ciphertext).toString("base64url"),
    nonce: Buffer.from(nonce).toString("base64url"),
    keyVersion,
  };
}

export async function decryptGithubToken(
  envelope: GithubTokenEnvelope,
  userId: string,
): Promise<string> {
  if (envelope.keyVersion !== githubTokenKeyVersion()) {
    throw new GithubTokenConfigurationError("GITHUB_TOKEN_DECRYPT_FAILED");
  }
  // Preserve missing/invalid key configuration as a configuration error. Only
  // authenticated-decryption failures are collapsed to DECRYPT_FAILED.
  const key = await importGithubTokenKey();
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ownedArrayBuffer(Buffer.from(envelope.nonce, "base64url")),
        additionalData: githubTokenAad(userId, envelope.keyVersion),
        tagLength: 128,
      },
      key,
      ownedArrayBuffer(Buffer.from(envelope.ciphertext, "base64url")),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new GithubTokenConfigurationError("GITHUB_TOKEN_DECRYPT_FAILED");
  }
}

async function githubUser(token: string) {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const u = (await res.json()) as { login?: string };
  if (!u.login) throw new Error("GitHub: no login");
  return u.login;
}

function b64(text: string) {
  return Buffer.from(text, "utf8").toString("base64");
}

function slug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "helix-app"
  );
}

export const githubStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ github_login: string | null }>`
      select github_login from profiles where user_id = ${context.userId}
    `;
    return { login: rows[0]?.github_login ?? null };
  });

export const linkGithub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { token: string }) => ({
    token: input.token.trim().slice(0, 512),
  }))
  .handler(async ({ context, data }) => {
    if (data.token.length < 8) throw new Error("Token too short");
    const envelope = await encryptGithubToken(data.token, context.userId);
    const login = await githubUser(data.token);
    const sql = await getSql();
    await sql`
      update profiles
      set github_login = ${login},
          github_token_ciphertext = ${envelope.ciphertext},
          github_token_nonce = ${envelope.nonce},
          github_token_key_version = ${envelope.keyVersion}
      where user_id = ${context.userId}
    `;
    return { login };
  });

export const unlinkGithub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`
      update profiles
      set github_login = null,
          github_token_ciphertext = null,
          github_token_nonce = null,
          github_token_key_version = null
      where user_id = ${context.userId}
    `;
    return { ok: true };
  });

export const pushProjectGithub = createServerFn({ method: "POST" })
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
    const sql = await getSql();
    const prof = await sql<{
      github_login: string | null;
      github_token_ciphertext: string | null;
      github_token_nonce: string | null;
      github_token_key_version: string | null;
    }>`
      select github_login, github_token_ciphertext, github_token_nonce,
             github_token_key_version
      from profiles where user_id = ${context.userId}
    `;
    const tokenRow = prof[0];
    if (
      !tokenRow?.github_login ||
      !tokenRow.github_token_ciphertext ||
      !tokenRow.github_token_nonce ||
      !tokenRow.github_token_key_version
    ) {
      throw new Error("Collega il tuo GitHub dal menu account");
    }
    const token = await decryptGithubToken(
      {
        ciphertext: tokenRow.github_token_ciphertext,
        nonce: tokenRow.github_token_nonce,
        keyVersion: tokenRow.github_token_key_version,
      },
      context.userId,
    );
    const proj = await sql<{ title: string; prompt: string }>`
      select title, prompt from projects
      where id = ${data.projectId} and user_id = ${context.userId}
    `;
    if (!proj[0]) throw new Error("Nessuna app da pubblicare");
    const name = `${slug(proj[0].title)}-${Date.now().toString(36).slice(-4)}`;
    const created = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        name,
        description: `Helix by Kreluna — ${proj[0].prompt.slice(0, 120)}`,
        private: true,
        auto_init: true,
      }),
    });
    if (!created.ok) {
      const err = await created.text();
      throw new Error(`GitHub repo: ${created.status} ${err.slice(0, 180)}`);
    }
    const repo = (await created.json()) as {
      full_name?: string;
      html_url?: string;
      default_branch?: string;
    };
    const full = repo.full_name;
    if (!full) throw new Error("GitHub: no repo");

    async function githubJson<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetch(`https://api.github.com/repos/${full}${path}`, {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(init?.headers ?? {}),
        },
      });
      if (!response.ok) {
        throw new Error(`GitHub export: ${response.status}`);
      }
      return (await response.json()) as T;
    }

    const files = artifact.workspace
      ? await workspaceExportFiles(artifact.files, artifact.workspace)
      : {
          "README.md": `# ${proj[0].title}\n\nPrototype export built with [Helix by Kreluna](https://helix.kreluna.it).\n\n${proj[0].prompt}\n`,
          "index.html": artifact.html,
        };
    const branch = repo.default_branch || "main";
    const ref = await githubJson<{ object?: { sha?: string } }>(
      `/git/ref/heads/${branch}`,
    );
    const parentSha = ref.object?.sha;
    if (!parentSha) throw new Error("GitHub: no initial commit");
    const parent = await githubJson<{ tree?: { sha?: string } }>(
      `/git/commits/${parentSha}`,
    );
    const baseTree = parent.tree?.sha;
    if (!baseTree) throw new Error("GitHub: no initial tree");

    const entries = Object.entries(files);
    const treeEntries: Array<{
      path: string;
      mode: "100644";
      type: "blob";
      sha: string;
    }> = [];
    for (let offset = 0; offset < entries.length; offset += 8) {
      const batch = entries.slice(offset, offset + 8);
      const blobs = await Promise.all(
        batch.map(async ([path, content]) => {
          const blob = await githubJson<{ sha?: string }>("/git/blobs", {
            method: "POST",
            body: JSON.stringify({ content: b64(content), encoding: "base64" }),
          });
          if (!blob.sha) throw new Error("GitHub: blob upload failed");
          return { path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
        }),
      );
      treeEntries.push(...blobs);
    }
    const tree = await githubJson<{ sha?: string }>("/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTree, tree: treeEntries }),
    });
    if (!tree.sha) throw new Error("GitHub: tree creation failed");
    const commit = await githubJson<{ sha?: string }>("/git/commits", {
      method: "POST",
      body: JSON.stringify({
        message: `Helix: approved ${artifact.buildLevel} workspace`,
        tree: tree.sha,
        parents: [parentSha],
      }),
    });
    if (!commit.sha) throw new Error("GitHub: commit creation failed");
    await githubJson(`/git/refs/heads/${branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    return {
      url: repo.html_url || `https://github.com/${full}`,
      repo: full,
      commit: commit.sha,
      fileCount: entries.length,
      workspaceSha256: artifact.workspace?.artifactSha256 ?? null,
    };
  });
