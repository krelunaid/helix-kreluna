import { getRuntimeDatabaseConnection } from "@/lib/database-connection.server";
import { getSql } from "@/lib/db";
import { isHostedRuntimeEnvironment, type HostedRuntimeEnvironment } from "@/lib/hosted-runtime";
import {
  verifyNetlifyPullRequestDeploy,
  type NetlifyPreviewDeployEnvironment,
} from "@/lib/preview-deploy";
import { applyCreditEntry, type CreditMutationResult } from "@/lib/server/credits";

export const PREVIEW_TEST_CREDIT_GRANT = Object.freeze({
  amount: 10,
  action: "preview_test_grant",
  idempotencyKey: "preview-test-grant:manual:v1",
  note: "Manual preview/test credit grant v1",
});

export const PREVIEW_TEST_CREDIT_GRANT_ERROR = "PREVIEW_TEST_CREDIT_GRANT_FORBIDDEN" as const;
export const PREVIEW_TEST_CREDIT_GRANT_CONFIGURATION_ERROR =
  "PREVIEW_TEST_CREDIT_GRANT_CONFIGURATION_INVALID" as const;
export const PREVIEW_TEST_CREDIT_GRANT_TARGET_ERROR =
  "PREVIEW_TEST_CREDIT_GRANT_TARGET_MISMATCH" as const;
export const PREVIEW_TEST_DATABASE_MIGRATIONS_ERROR =
  "PREVIEW_TEST_DATABASE_MIGRATIONS_INCOMPLETE" as const;

/**
 * Deliberately pinned schema allowlist. Provisioning a tester against a partial,
 * older or unexpectedly newer schema requires a code review instead of silently
 * mutating the wrong database branch.
 */
export const PREVIEW_TEST_REQUIRED_MIGRATIONS = Object.freeze([
  "0001_auth.sql",
  "0002_vetra.sql",
  "0003_deploys.sql",
  "0004_guest_security.sql",
  "0005_billing_integrity.sql",
  "0006_build_jobs_access.sql",
  "0007_public_app_integrity.sql",
  "0008_build_job_queue.sql",
  "0009_human_gate_release.sql",
  "0010_linked_build_enqueue.sql",
  "0011_release_state_transition.sql",
  "0012_quality_evidence.sql",
  "0013_github_token_encryption.sql",
  "0014_published_artifact_integrity.sql",
  "0015_browser_quality_evidence.sql",
  "0016_build_level_workspace.sql",
  "0017_ai_call_telemetry.sql",
  "0018_stripe_billing.sql",
  "0019_ai_response_cache.sql",
  "0020_pipeline_version.sql",
  "0021_warden_operations.sql",
  "0022_store_release_pipeline.sql",
  "0023_augur_capacity_evidence.sql",
  "0024_harbor_production_release.sql",
  "0025_store_production_provenance.sql",
  "0026_atomic_project_build_enqueue.sql",
] as const);

type PreviewCreditGrantEnvironment = NodeJS.ProcessEnv &
  HostedRuntimeEnvironment & {
    HELIX_PREVIEW_CREDIT_GRANT_ENABLED?: string;
    HELIX_PREVIEW_CREDIT_GRANT_AMOUNT?: string;
    HELIX_PREVIEW_CREDIT_GRANT_USER_ID?: string;
    HELIX_PREVIEW_CREDIT_GRANT_EMAIL?: string;
  } & NetlifyPreviewDeployEnvironment;

export type PreviewCreditGrantMode = "disabled" | "test" | "deploy_preview" | "forbidden";

type PreviewCreditGrantEvidence = Readonly<{
  databaseSource?: "netlify" | "postgres" | "pglite" | null;
}>;

type ManualGrantOptions = Readonly<{
  requireHostedPreview?: boolean;
}>;

export type PreviewTestCreditGrantConfiguration = Readonly<{
  amount: number;
  userId: string;
  expectedEmail: string;
}>;

type PreviewCreditGrantErrorCode =
  | typeof PREVIEW_TEST_CREDIT_GRANT_ERROR
  | typeof PREVIEW_TEST_CREDIT_GRANT_CONFIGURATION_ERROR
  | typeof PREVIEW_TEST_CREDIT_GRANT_TARGET_ERROR
  | typeof PREVIEW_TEST_DATABASE_MIGRATIONS_ERROR;

export class PreviewCreditGrantError extends Error {
  readonly code: PreviewCreditGrantErrorCode;

  constructor(code: PreviewCreditGrantErrorCode) {
    super(code);
    this.name = "PreviewCreditGrantError";
    this.code = code;
  }
}

function configured(value: string | undefined): string {
  return value?.trim() ?? "";
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/u.test(value);
}

function validUserId(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 255 &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  );
}

export function readPreviewTestCreditGrantConfiguration(
  environment: PreviewCreditGrantEnvironment = process.env,
): PreviewTestCreditGrantConfiguration | null {
  const enabled = configured(environment.HELIX_PREVIEW_CREDIT_GRANT_ENABLED);
  const amountText = configured(environment.HELIX_PREVIEW_CREDIT_GRANT_AMOUNT);
  const userId = configured(environment.HELIX_PREVIEW_CREDIT_GRANT_USER_ID);
  const expectedEmail = configured(environment.HELIX_PREVIEW_CREDIT_GRANT_EMAIL).toLowerCase();
  if (enabled !== "true") {
    if ((enabled && enabled !== "false") || amountText || userId || expectedEmail) {
      throw new PreviewCreditGrantError(PREVIEW_TEST_CREDIT_GRANT_CONFIGURATION_ERROR);
    }
    return null;
  }

  const amount = Number(amountText);
  if (
    !Number.isSafeInteger(amount) ||
    amount !== PREVIEW_TEST_CREDIT_GRANT.amount ||
    !validUserId(userId) ||
    !validEmail(expectedEmail)
  ) {
    throw new PreviewCreditGrantError(PREVIEW_TEST_CREDIT_GRANT_CONFIGURATION_ERROR);
  }
  return Object.freeze({ amount, userId, expectedEmail });
}

/**
 * Resolve the grant mode without touching the database. Production and Stripe
 * markers win. Hosted grants require a real Netlify deploy-preview identity and
 * the Netlify Database SDK connection, not a caller-supplied URL.
 */
export function previewCreditGrantMode(
  environment: PreviewCreditGrantEnvironment = process.env,
  evidence: PreviewCreditGrantEvidence = {},
): PreviewCreditGrantMode {
  if (environment.HELIX_PREVIEW_CREDIT_GRANT_ENABLED?.trim() !== "true") {
    return "disabled";
  }

  const context = environment.CONTEXT?.trim();
  const runtime = environment.HELIX_RUNTIME_ENV?.trim();
  if (
    context === "production" ||
    runtime === "production" ||
    environment.STRIPE_BILLING_ENABLED?.trim() !== "false"
  ) {
    return "forbidden";
  }

  if (context === "deploy-preview") {
    const databaseSource =
      evidence.databaseSource ??
      (environment === process.env ? (getRuntimeDatabaseConnection()?.source ?? null) : null);
    if (
      !verifyNetlifyPullRequestDeploy(environment) ||
      databaseSource !== "netlify" ||
      environment.VITE_AUTH_ENABLED?.trim() !== "true" ||
      environment.VITE_PREVIEW_PASSWORD_SIGNIN_ENABLED?.trim() !== "true" ||
      environment.VITE_GROK_AUTH_ENABLED?.trim() !== "false" ||
      Boolean(environment.GROK_AUTH_CLIENT_ID?.trim()) ||
      Boolean(environment.GROK_AUTH_CLIENT_SECRET?.trim()) ||
      environment.HELIX_PREVIEW_TESTER_PROVISION_ENABLED?.trim() !== "true"
    ) {
      return "forbidden";
    }
    return "deploy_preview";
  }

  if (isHostedRuntimeEnvironment(environment)) return "forbidden";
  if (environment.NODE_ENV?.trim() === "test") return "test";
  return "forbidden";
}

/** Verify the target branch has exactly the reviewed 0001-0026 migration set. */
export async function assertPreviewTestDatabaseMigrationsComplete(): Promise<void> {
  try {
    const sql = await getSql();
    const rows = await sql<{ name: string }>`select name from _migrations order by name`;
    if (
      rows.length !== PREVIEW_TEST_REQUIRED_MIGRATIONS.length ||
      rows.some((row, index) => row.name !== PREVIEW_TEST_REQUIRED_MIGRATIONS[index])
    ) {
      throw new PreviewCreditGrantError(PREVIEW_TEST_DATABASE_MIGRATIONS_ERROR);
    }
  } catch (error) {
    if (error instanceof PreviewCreditGrantError) throw error;
    throw new PreviewCreditGrantError(PREVIEW_TEST_DATABASE_MIGRATIONS_ERROR);
  }
}

/**
 * Apply the configured grant manually. The target cannot be supplied by an HTTP
 * caller: both immutable user id and expected email come from server-only env.
 * The ledger function serializes concurrent retries and prevents amount reuse.
 */
export async function grantConfiguredPreviewTestCredits(
  options: ManualGrantOptions = {},
): Promise<CreditMutationResult> {
  const configuration = readPreviewTestCreditGrantConfiguration(process.env);
  if (!configuration) {
    throw new PreviewCreditGrantError(PREVIEW_TEST_CREDIT_GRANT_CONFIGURATION_ERROR);
  }
  const mode = previewCreditGrantMode();
  if (
    mode === "forbidden" ||
    mode === "disabled" ||
    (options.requireHostedPreview && mode !== "deploy_preview")
  ) {
    throw new PreviewCreditGrantError(PREVIEW_TEST_CREDIT_GRANT_ERROR);
  }

  await assertPreviewTestDatabaseMigrationsComplete();

  const sql = await getSql();
  const users = await sql<{ email: string }>`
    select "email" as email
    from "user"
    where "id" = ${configuration.userId}
  `;
  const actualEmail = users[0]?.email?.trim().toLowerCase();
  if (!actualEmail || actualEmail !== configuration.expectedEmail) {
    throw new PreviewCreditGrantError(PREVIEW_TEST_CREDIT_GRANT_TARGET_ERROR);
  }

  return applyCreditEntry({
    userId: configuration.userId,
    delta: configuration.amount,
    action: PREVIEW_TEST_CREDIT_GRANT.action,
    projectId: null,
    note: PREVIEW_TEST_CREDIT_GRANT.note,
    idempotencyKey: PREVIEW_TEST_CREDIT_GRANT.idempotencyKey,
  });
}
