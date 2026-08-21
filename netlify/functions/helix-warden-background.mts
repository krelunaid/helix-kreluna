import { createHash, timingSafeEqual } from "node:crypto";
import type { Config } from "@netlify/functions";

const WARDEN_HEADER = "x-helix-warden-token";

function configuredEnvironment(): Record<string, string | undefined> {
  return Object.fromEntries(
    [
      "HELIX_WARDEN_ENABLED",
      "HELIX_WARDEN_ADAPTER_ID",
      "HELIX_WARDEN_SOURCE_ID",
      "HELIX_WARDEN_SOURCE_URL",
      "HELIX_WARDEN_SOURCE_TOKEN",
      "HELIX_WARDEN_POLICY_JSON",
      "HELIX_WARDEN_ALERT_DEDUP_TTL_MS",
      "CONTEXT",
      "COMMIT_REF",
    ].map((name) => [name, Netlify.env.get(name)?.trim()]),
  );
}

function dispatchSecret(): string | null {
  const secret = Netlify.env.get("HELIX_WARDEN_DISPATCH_SECRET")?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

function tokenEqual(presented: string, expected: string): boolean {
  const left = createHash("sha256").update(presented, "utf8").digest();
  const right = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(left, right);
}

function reject(reason: "configuration" | "authorization" | "payload"): void {
  console.warn(JSON.stringify({ level: "warn", event: "warden_background_rejected", reason }));
}

export default async function helixWardenBackground(request: Request): Promise<void> {
  const expected = dispatchSecret();
  if (!expected) {
    reject("configuration");
    return;
  }
  const presented = request.headers.get(WARDEN_HEADER);
  if (!presented || !tokenEqual(presented, expected)) {
    reject("authorization");
    return;
  }
  let body: { scheduledFor?: unknown };
  try {
    body = (await request.json()) as { scheduledFor?: unknown };
  } catch {
    reject("payload");
    return;
  }
  if (
    typeof body.scheduledFor !== "string" ||
    !Number.isFinite(Date.parse(body.scheduledFor))
  ) {
    reject("payload");
    return;
  }
  const { runConfiguredWardenCycle } = await import(
    "../../src/lib/server/operations/warden-service"
  );
  const result = await runConfiguredWardenCycle({
    environment: configuredEnvironment(),
    scheduledFor: new Date(body.scheduledFor).toISOString(),
  });
  console.info(
    JSON.stringify({
      level: "info",
      event: result ? "warden_observation_persisted" : "warden_observation_disabled",
      observationId: result?.persistence.observationId,
      status: result?.report.status,
      newAlertCount: result?.persistence.newAlertKeys.length ?? 0,
      suppressedAlertCount: result?.persistence.suppressedAlertKeys.length ?? 0,
      automaticActions: false,
    }),
  );
}

export const config: Config = {
  background: true,
  method: "POST",
};
