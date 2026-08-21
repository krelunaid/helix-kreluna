import { createHash, timingSafeEqual } from "node:crypto";
import type { Config } from "@netlify/functions";

const HARBOR_HEADER = "x-helix-harbor-sweeper-token";

function dispatchSecret(): string | null {
  const secret = Netlify.env.get("HELIX_HARBOR_SWEEPER_DISPATCH_SECRET")?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

function tokenEqual(presented: string, expected: string): boolean {
  const left = createHash("sha256").update(presented, "utf8").digest();
  const right = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(left, right);
}

function reject(reason: "configuration" | "authorization" | "payload"): void {
  console.warn(
    JSON.stringify({ level: "warn", event: "harbor_sweeper_background_rejected", reason }),
  );
}

function configuredEnvironment(): Record<string, string | undefined> {
  return Object.fromEntries(
    ["HELIX_HARBOR_SWEEPER_ENABLED", "HELIX_HARBOR_RUNNER_URL", "HELIX_HARBOR_RUNNER_SECRET"].map(
      (name) => [name, Netlify.env.get(name)?.trim()],
    ),
  );
}

export default async function helixHarborProductionBackground(request: Request): Promise<void> {
  const expected = dispatchSecret();
  if (!expected) {
    reject("configuration");
    return;
  }
  const presented = request.headers.get(HARBOR_HEADER);
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
  if (typeof body.scheduledFor !== "string" || !Number.isFinite(Date.parse(body.scheduledFor))) {
    reject("payload");
    return;
  }
  const { runConfiguredHarborProductionSweep } =
    await import("../../src/lib/server/release/harbor-production-sweeper");
  const result = await runConfiguredHarborProductionSweep({
    environment: configuredEnvironment(),
  });
  console.info(
    JSON.stringify({
      level: result?.failed ? "warn" : "info",
      event: result ? "harbor_reservation_sweep_completed" : "harbor_sweeper_disabled",
      scheduledFor: new Date(body.scheduledFor).toISOString(),
      ...(result ?? {}),
    }),
  );
  if (result?.failed) throw new Error("HARBOR_RESERVATION_SWEEP_INCOMPLETE");
}

export const config: Config = {
  background: true,
  method: "POST",
};
