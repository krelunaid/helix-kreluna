import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { verifyPassword } from "better-auth/crypto";
import { Pool } from "pg";

import { getRuntimeDatabaseConnection } from "@/lib/database-connection.server";
import { getPglite, getSql } from "@/lib/db";
import { pgliteDialect } from "@/lib/auth/pglite-dialect";
import { verifyNetlifyPullRequestDeploy } from "@/lib/preview-deploy";
import {
  PREVIEW_TEST_CREDIT_GRANT,
  PREVIEW_TEST_CREDIT_GRANT_CONFIGURATION_ERROR,
  PREVIEW_TEST_CREDIT_GRANT_ERROR,
  assertPreviewTestDatabaseMigrationsComplete,
  grantConfiguredPreviewTestCredits,
  previewCreditGrantMode,
  readPreviewTestCreditGrantConfiguration,
  type PreviewTestCreditGrantConfiguration,
} from "@/lib/server/preview-credit-grant";

export const PREVIEW_TESTER_NAME = "Helix Preview Tester" as const;
export const PREVIEW_TESTER_MINIMUM_PASSWORD_LENGTH = 16 as const;
export const PREVIEW_TESTER_MAXIMUM_PASSWORD_LENGTH = 128 as const;
export const PREVIEW_DATABASE_METADATA_ROW_ALLOWLIST = Object.freeze(["_migrations"] as const);
export const PREVIEW_TESTER_MANAGED_TABLES = Object.freeze([
  "user",
  "account",
  "session",
  "profiles",
  "credit_ledger",
] as const);

export const PREVIEW_TESTER_PROVISION_CONFIGURATION_ERROR =
  "PREVIEW_TESTER_PROVISION_CONFIGURATION_INVALID" as const;
export const PREVIEW_TESTER_PROVISION_FORBIDDEN = "PREVIEW_TESTER_PROVISION_FORBIDDEN" as const;
export const PREVIEW_TESTER_PROVISION_CONFLICT = "PREVIEW_TESTER_PROVISION_CONFLICT" as const;
export const PREVIEW_TESTER_PROVISION_FAILED = "PREVIEW_TESTER_PROVISION_FAILED" as const;

type PreviewTesterProvisionErrorCode =
  | typeof PREVIEW_TESTER_PROVISION_CONFIGURATION_ERROR
  | typeof PREVIEW_TESTER_PROVISION_FORBIDDEN
  | typeof PREVIEW_TESTER_PROVISION_CONFLICT
  | typeof PREVIEW_TESTER_PROVISION_FAILED;

export class PreviewTesterProvisionError extends Error {
  readonly code: PreviewTesterProvisionErrorCode;

  constructor(code: PreviewTesterProvisionErrorCode) {
    super(code);
    this.name = "PreviewTesterProvisionError";
    this.code = code;
  }
}

export type PreviewTesterProvisionResult = Readonly<{
  created: boolean;
  userId: string;
  email: string;
  grantWasApplied: boolean;
  balanceAfter: number;
  ledgerEntryId: number;
}>;

type ProvisionOptions = Readonly<{
  /** Only tests may opt into the in-memory PGlite runtime. Operator CLI never does. */
  allowTestRuntime?: boolean;
}>;

type UserRow = Readonly<{
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  image: string | null;
}>;

type AccountRow = Readonly<{
  id: string;
  account_id: string;
  provider_id: string;
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  id_token: string | null;
  scope: string | null;
  password: string | null;
}>;

type ProfileRow = Readonly<{
  user_id: string;
  plan: string;
  credits_balance: number;
}>;

type LedgerRow = Readonly<{
  user_id: string;
  action: string;
  credits: number;
  project_id: string | null;
  note: string | null;
  idempotency_key: string | null;
}>;

type TesterState = Readonly<{
  users: readonly UserRow[];
  accounts: readonly AccountRow[];
  sessionCount: number;
  profiles: readonly ProfileRow[];
  ledger: readonly LedgerRow[];
}>;

type CatalogTable = Readonly<{
  schema_name: string;
  table_name: string;
}>;

function validPassword(password: string): boolean {
  return (
    password.length >= PREVIEW_TESTER_MINIMUM_PASSWORD_LENGTH &&
    password.length <= PREVIEW_TESTER_MAXIMUM_PASSWORD_LENGTH &&
    !password.includes("\0")
  );
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/**
 * Inspect every ordinary/partitioned table in the active application schema.
 * On first creation only `_migrations` may contain rows. On exact replay the
 * five tester-owned tables are validated structurally by readTesterState; every
 * other table (including verification, projects and build_jobs) must stay empty.
 */
async function assertNoUnexpectedApplicationRows(allowManagedTesterRows: boolean): Promise<void> {
  const sql = await getSql();
  let tables: readonly CatalogTable[];
  try {
    tables = await sql<CatalogTable>`
      select namespace.nspname as schema_name,
             class.relname as table_name
      from pg_catalog.pg_class as class
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = class.relnamespace
      where namespace.nspname = current_schema()
        and class.relkind in ('r', 'p')
      order by namespace.nspname, class.relname
    `;
  } catch {
    throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_CONFLICT);
  }

  const metadata = new Set<string>(PREVIEW_DATABASE_METADATA_ROW_ALLOWLIST);
  const managed = new Set<string>(PREVIEW_TESTER_MANAGED_TABLES);
  for (const table of tables) {
    if (metadata.has(table.table_name)) continue;
    if (allowManagedTesterRows && managed.has(table.table_name)) continue;
    const qualifiedName = `${quoteIdentifier(table.schema_name)}.${quoteIdentifier(table.table_name)}`;
    try {
      const rows = await sql.query<{ has_rows: boolean }>(
        `select exists(select 1 from ${qualifiedName} limit 1) as has_rows`,
      );
      if (rows[0]?.has_rows !== false) {
        throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_CONFLICT);
      }
    } catch (error) {
      if (error instanceof PreviewTesterProvisionError) throw error;
      throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_CONFLICT);
    }
  }
}

async function readTesterState(): Promise<TesterState> {
  const sql = await getSql();
  const [users, accounts, sessions, profiles, ledger] = await Promise.all([
    sql<UserRow>`
      select "id" as id,
             "name" as name,
             "email" as email,
             "emailVerified" as email_verified,
             "image" as image
      from "user"
      order by "id"
    `,
    sql<AccountRow>`
      select "id" as id,
             "accountId" as account_id,
             "providerId" as provider_id,
             "userId" as user_id,
             "accessToken" as access_token,
             "refreshToken" as refresh_token,
             "idToken" as id_token,
             "scope" as scope,
             "password" as password
      from "account"
      order by "id"
    `,
    sql<{ count: number }>`
      select count(*)::bigint as count
      from "session"
    `,
    sql<ProfileRow>`
      select user_id, plan, credits_balance
      from profiles
      order by user_id
    `,
    sql<LedgerRow>`
      select user_id, action, credits, project_id, note, idempotency_key
      from credit_ledger
      order by id
    `,
  ]);

  return Object.freeze({
    users,
    accounts,
    sessionCount: sessions[0]?.count ?? 0,
    profiles,
    ledger,
  });
}

function isCompletelyAbsent(state: TesterState): boolean {
  return (
    state.users.length === 0 &&
    state.accounts.length === 0 &&
    state.sessionCount === 0 &&
    state.profiles.length === 0 &&
    state.ledger.length === 0
  );
}

function hasExactIdentity(
  state: TesterState,
  configuration: PreviewTestCreditGrantConfiguration,
): state is TesterState & {
  users: readonly [UserRow];
  accounts: readonly [AccountRow];
} {
  if (state.users.length !== 1 || state.accounts.length !== 1 || state.sessionCount !== 0) {
    return false;
  }
  const user = state.users[0];
  const account = state.accounts[0];
  return (
    user.id === configuration.userId &&
    user.name === PREVIEW_TESTER_NAME &&
    user.email.trim().toLowerCase() === configuration.expectedEmail &&
    user.email_verified === false &&
    user.image === null &&
    account.user_id === configuration.userId &&
    account.provider_id === "credential" &&
    account.account_id === configuration.userId &&
    Boolean(account.password) &&
    account.access_token === null &&
    account.refresh_token === null &&
    account.id_token === null &&
    account.scope === null
  );
}

function hasExactCreditState(
  state: TesterState,
  configuration: PreviewTestCreditGrantConfiguration,
): "profile_missing" | "ready" | "granted" | null {
  if (state.profiles.length === 0 && state.ledger.length === 0) return "profile_missing";
  if (
    state.profiles.length === 1 &&
    state.profiles[0].user_id === configuration.userId &&
    state.profiles[0].plan === "free" &&
    state.profiles[0].credits_balance === 0 &&
    state.ledger.length === 0
  ) {
    return "ready";
  }
  if (
    state.profiles.length === 1 &&
    state.profiles[0].user_id === configuration.userId &&
    state.profiles[0].plan === "free" &&
    state.profiles[0].credits_balance === configuration.amount &&
    state.ledger.length === 1
  ) {
    const entry = state.ledger[0];
    if (
      entry.action === PREVIEW_TEST_CREDIT_GRANT.action &&
      entry.user_id === configuration.userId &&
      entry.credits === configuration.amount &&
      entry.project_id === null &&
      entry.note === PREVIEW_TEST_CREDIT_GRANT.note &&
      entry.idempotency_key === PREVIEW_TEST_CREDIT_GRANT.idempotencyKey
    ) {
      return "granted";
    }
  }
  return null;
}

async function assertExactIdentityPassword(
  state: TesterState,
  configuration: PreviewTestCreditGrantConfiguration,
  password: string,
): Promise<void> {
  if (!hasExactIdentity(state, configuration)) {
    throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_CONFLICT);
  }
  const hash = state.accounts[0].password;
  if (!hash || !(await verifyPassword({ hash, password }))) {
    throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_CONFLICT);
  }
}

async function createProvisioningAuth(
  configuration: PreviewTestCreditGrantConfiguration,
  testRuntime: boolean,
) {
  const secret = process.env.BETTER_AUTH_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_CONFIGURATION_ERROR);
  }

  const preview = verifyNetlifyPullRequestDeploy(process.env);
  const connection = getRuntimeDatabaseConnection();
  let pool: Pool | undefined;
  const database = testRuntime
    ? { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const }
    : (pool = new Pool({
        connectionString: connection?.connectionString,
        connectionTimeoutMillis: 5_000,
        max: 2,
      }));

  const provisioningAuth = betterAuth({
    appName: "Helix preview tester provisioner",
    baseURL: preview?.deployPrimeUrl ?? "http://localhost:8080",
    secret,
    database,
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      minPasswordLength: PREVIEW_TESTER_MINIMUM_PASSWORD_LENGTH,
      maxPasswordLength: PREVIEW_TESTER_MAXIMUM_PASSWORD_LENGTH,
    },
    advanced: {
      database: {
        generateId: ({ model }) => (model === "user" ? configuration.userId : randomUUID()),
      },
    },
    rateLimit: { enabled: false },
    logger: { disabled: true },
  });

  return Object.freeze({
    auth: provisioningAuth,
    close: () => (pool ? pool.end() : Promise.resolve()),
  });
}

/**
 * Provision one operator-selected tester and its single ledger grant. This is a
 * server module used only by the explicit CLI script; it is never mounted on an
 * HTTP route. The password is an argument so production cannot source it from a
 * long-lived environment variable.
 */
export async function provisionConfiguredPreviewTester(
  password: string,
  options: ProvisionOptions = {},
): Promise<PreviewTesterProvisionResult> {
  if (!validPassword(password)) {
    throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_CONFIGURATION_ERROR);
  }
  if (process.env.HELIX_PREVIEW_TESTER_PROVISION_ENABLED?.trim() !== "true") {
    throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_FORBIDDEN);
  }

  const configuration = readPreviewTestCreditGrantConfiguration(process.env);
  if (!configuration) {
    throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_CONFIGURATION_ERROR);
  }
  const mode = previewCreditGrantMode();
  const testRuntime = mode === "test" && options.allowTestRuntime === true;
  if (mode !== "deploy_preview" && !testRuntime) {
    throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_FORBIDDEN);
  }
  if (mode === "deploy_preview" && getRuntimeDatabaseConnection()?.source !== "netlify") {
    throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_FORBIDDEN);
  }

  await assertPreviewTestDatabaseMigrationsComplete();
  let state = await readTesterState();
  const created = isCompletelyAbsent(state);
  if (created) {
    await assertNoUnexpectedApplicationRows(false);
  } else {
    await assertExactIdentityPassword(state, configuration, password);
    if (!hasExactCreditState(state, configuration)) {
      throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_CONFLICT);
    }
    await assertNoUnexpectedApplicationRows(true);
  }

  if (created) {
    const provisioning = await createProvisioningAuth(configuration, testRuntime);
    try {
      let tokenWasReturned = false;
      try {
        const response = await provisioning.auth.api.signUpEmail({
          body: {
            name: PREVIEW_TESTER_NAME,
            email: configuration.expectedEmail,
            password,
          },
        });
        tokenWasReturned = Boolean(response.token);
      } catch {
        // A concurrent exact invocation can win the unique insert. The
        // authoritative post-query below distinguishes that from every conflict.
      }
      if (tokenWasReturned) {
        throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_CONFLICT);
      }
    } finally {
      await provisioning.close();
    }

    state = await readTesterState();
    await assertExactIdentityPassword(state, configuration, password);
    await assertNoUnexpectedApplicationRows(true);
    const creditState = hasExactCreditState(state, configuration);
    if (creditState !== "profile_missing" && creditState !== "ready" && creditState !== "granted") {
      throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_CONFLICT);
    }
  }

  state = await readTesterState();
  await assertExactIdentityPassword(state, configuration, password);
  await assertNoUnexpectedApplicationRows(true);
  const beforeGrant = hasExactCreditState(state, configuration);
  if (beforeGrant === "profile_missing") {
    const sql = await getSql();
    await sql`
      insert into profiles (user_id, plan, credits_balance)
      values (${configuration.userId}, 'free', 0)
      on conflict (user_id) do nothing
    `;
  } else if (beforeGrant !== "ready" && beforeGrant !== "granted") {
    throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_CONFLICT);
  }

  const grant = await grantConfiguredPreviewTestCredits({
    requireHostedPreview: mode === "deploy_preview",
  }).catch((error: unknown) => {
    if (
      error instanceof Error &&
      (error.message === PREVIEW_TEST_CREDIT_GRANT_ERROR ||
        error.message === PREVIEW_TEST_CREDIT_GRANT_CONFIGURATION_ERROR)
    ) {
      throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_FORBIDDEN);
    }
    throw error;
  });

  const finalState = await readTesterState();
  await assertExactIdentityPassword(finalState, configuration, password);
  await assertNoUnexpectedApplicationRows(true);
  if (hasExactCreditState(finalState, configuration) !== "granted") {
    throw new PreviewTesterProvisionError(PREVIEW_TESTER_PROVISION_FAILED);
  }

  return Object.freeze({
    created,
    userId: configuration.userId,
    email: configuration.expectedEmail,
    grantWasApplied: grant.was_applied,
    balanceAfter: grant.balance_after,
    ledgerEntryId: grant.entry_id,
  });
}
