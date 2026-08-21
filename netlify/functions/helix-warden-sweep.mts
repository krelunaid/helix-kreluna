import type { Config } from "@netlify/functions";

const WARDEN_BACKGROUND_PATH = "/.netlify/functions/helix-warden-background";
const WARDEN_HEADER = "x-helix-warden-token";

function dispatchSecret(): string {
  const secret = Netlify.env.get("HELIX_WARDEN_DISPATCH_SECRET")?.trim();
  if (!secret || secret.length < 32) throw new Error("HELIX_WARDEN_DISPATCH_SECRET_MISSING");
  return secret;
}

function siteOrigin(request: Request): string {
  const configuredUrl = Netlify.env.get("URL")?.trim();
  return new URL(configuredUrl || request.url).origin;
}

export default async function helixWardenSweep(request: Request): Promise<void> {
  if (Netlify.env.get("HELIX_WARDEN_ENABLED")?.trim() !== "true") {
    console.info(JSON.stringify({ level: "info", event: "warden_sweep_disabled" }));
    return;
  }
  const body = (await request.json()) as { next_run?: unknown };
  if (typeof body.next_run !== "string" || !Number.isFinite(Date.parse(body.next_run))) {
    throw new Error("WARDEN_SCHEDULE_PAYLOAD_INVALID");
  }
  const response = await fetch(new URL(WARDEN_BACKGROUND_PATH, siteOrigin(request)), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [WARDEN_HEADER]: dispatchSecret(),
    },
    body: JSON.stringify({ scheduledFor: new Date(body.next_run).toISOString() }),
  });
  if (!response.ok) throw new Error(`WARDEN_BACKGROUND_DISPATCH_FAILED_${response.status}`);
}

export const config: Config = {
  schedule: "*/5 * * * *",
};
