import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

async function ensureGithubCols() {
  const sql = await getSql();
  await sql.query(`
    alter table profiles add column if not exists github_login text;
    alter table profiles add column if not exists github_token text;
  `);
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
    await ensureGithubCols();
    const sql = await getSql();
    const rows = await sql<{ github_login: string | null }>`
      select github_login from profiles where user_id = ${context.userId}
    `;
    return { login: rows[0]?.github_login ?? null };
  });

export const linkGithub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { token: string }) => ({ token: input.token.trim() }))
  .handler(async ({ context, data }) => {
    if (data.token.length < 8) throw new Error("Token too short");
    const login = await githubUser(data.token);
    await ensureGithubCols();
    const sql = await getSql();
    await sql`
      update profiles
      set github_login = ${login}, github_token = ${data.token}
      where user_id = ${context.userId}
    `;
    return { login };
  });

export const unlinkGithub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureGithubCols();
    const sql = await getSql();
    await sql`
      update profiles set github_login = null, github_token = null
      where user_id = ${context.userId}
    `;
    return { ok: true };
  });

export const pushProjectGithub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { projectId: string }) => ({ projectId: input.projectId }))
  .handler(async ({ context, data }) => {
    await ensureGithubCols();
    const sql = await getSql();
    const prof = await sql<{ github_login: string | null; github_token: string | null }>`
      select github_login, github_token from profiles where user_id = ${context.userId}
    `;
    const token = prof[0]?.github_token;
    if (!token) throw new Error("Collega il tuo GitHub dal menu account");
    const proj = await sql<{ title: string; html: string | null; prompt: string }>`
      select title, html, prompt from projects
      where id = ${data.projectId} and user_id = ${context.userId}
    `;
    if (!proj[0]?.html) throw new Error("Nessuna app da pubblicare");
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
    const repo = (await created.json()) as { full_name?: string; html_url?: string };
    const full = repo.full_name;
    if (!full) throw new Error("GitHub: no repo");

    async function put(path: string, content: string, message: string) {
      const r = await fetch(`https://api.github.com/repos/${full}/contents/${path}`, {
        method: "PUT",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ message, content: b64(content) }),
      });
      if (!r.ok) throw new Error(`GitHub file ${path}: ${r.status}`);
    }

    await put(
      "README.md",
      `# ${proj[0].title}\n\nBuilt with [Helix by Kreluna](https://helix.kreluna.it).\n\n${proj[0].prompt}\n`,
      "Helix: README",
    );
    await put("index.html", proj[0].html, "Helix: working product");
    return { url: repo.html_url || `https://github.com/${full}`, repo: full };
  });
