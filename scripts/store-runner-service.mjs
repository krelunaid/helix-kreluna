#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_STORE_PACKAGE_BYTES,
  StoreRunnerReportSchema,
  StoreRunnerRequestSchema,
} from "../src/lib/server/store-runner.ts";

const MAX_REQUEST_BYTES = Math.ceil(MAX_STORE_PACKAGE_BYTES / 3) * 4 + 256 * 1024;
const MAX_CONCURRENT_REQUESTS = 4;
const REQUEST_TIMEOUT_MS = 30_000;
const HEADERS_TIMEOUT_MS = 10_000;
const KEEP_ALIVE_TIMEOUT_MS = 5_000;
const MAX_CONNECTIONS = 16;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const NONCE_TTL_MS = 24 * 60 * 60 * 1_000;
const CLI_TIMEOUT_MS = 2 * 60 * 1_000;
const WORKFLOW_FILE = ".eas/workflows/helix-store.yml";
const REPLAY_TABLE = "helix_store_runner_replay_nonces";
const JOB_TABLE = "helix_store_runner_jobs";
const EVENT_TABLE = "helix_store_runner_events";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(secret, value) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function equalSignature(left, right) {
  if (!/^[0-9a-f]{64}$/i.test(left ?? "") || !/^[0-9a-f]{64}$/i.test(right ?? "")) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function postgresUrl(value, name) {
  if (!value) throw new Error(`${name} is required; the Store runner has no volatile fallback`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a PostgreSQL URL`);
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || parsed.hash) {
    throw new Error(`${name} must be a PostgreSQL URL`);
  }
  return value;
}

function parseCredentialList(raw, platform) {
  if (!raw?.trim()) return [];
  let candidate;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw new Error(`HELIX_STORE_${platform.toUpperCase()}_CREDENTIALS_JSON must be valid JSON`);
  }
  if (!Array.isArray(candidate) || candidate.length === 0) {
    throw new Error(
      `HELIX_STORE_${platform.toUpperCase()}_CREDENTIALS_JSON must be a non-empty array`,
    );
  }
  return candidate;
}

/**
 * Parse configuration without opening sockets or contacting Expo. A real
 * service refuses startup unless it has a durable database, an absolute EAS
 * executable path, an exact CLI version pin and explicit per-app mappings for
 * credentials that the operator has pre-uploaded to EAS. The acknowledgement
 * is not provider proof; only later build/distribution evidence is.
 */
export function parseStoreRunnerConfiguration(environment = process.env) {
  const secret = environment.HELIX_STORE_RUNNER_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("HELIX_STORE_RUNNER_SECRET must contain at least 32 characters");
  }
  const databaseUrl = postgresUrl(
    environment.HELIX_STORE_RUNNER_DATABASE_URL?.trim(),
    "HELIX_STORE_RUNNER_DATABASE_URL",
  );
  const easCliPath = environment.HELIX_STORE_EAS_CLI_PATH?.trim();
  if (!easCliPath || !isAbsolute(easCliPath)) {
    throw new Error("HELIX_STORE_EAS_CLI_PATH must be an absolute path to a pinned eas executable");
  }
  const easCliVersion = environment.HELIX_STORE_EAS_CLI_VERSION?.trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(easCliVersion ?? "")) {
    throw new Error("HELIX_STORE_EAS_CLI_VERSION must be an exact semver pin");
  }
  const expoToken = environment.EXPO_TOKEN?.trim();
  const expoAccountId = environment.HELIX_STORE_EXPO_ACCOUNT_ID?.trim();
  if (!expoToken || expoToken.length < 20 || !expoAccountId) {
    throw new Error("EXPO_TOKEN and HELIX_STORE_EXPO_ACCOUNT_ID are required");
  }
  const iosCredentials = parseCredentialList(environment.HELIX_STORE_IOS_CREDENTIALS_JSON, "ios");
  const androidCredentials = parseCredentialList(
    environment.HELIX_STORE_ANDROID_CREDENTIALS_JSON,
    "android",
  );
  if (iosCredentials.length === 0 && androidCredentials.length === 0) {
    throw new Error("At least one platform credential mapping is required");
  }
  return {
    secret,
    databaseUrl,
    easCliPath,
    easCliVersion,
    expoToken,
    expoAccountId,
    iosCredentials,
    androidCredentials,
  };
}

function assertHash(value, name) {
  if (!/^[0-9a-f]{64}$/.test(value ?? "")) throw new Error(`${name} must be a SHA-256`);
  return value;
}

/** Validate a non-secret, operator-acknowledged mapping for the exact app. */
export function createCredentialAuthority(configuration) {
  const accountHash = sha256(configuration.expoAccountId);
  return {
    verify(identity) {
      const candidates =
        identity.platform === "ios"
          ? configuration.iosCredentials
          : configuration.androidCredentials;
      const configured = candidates.find(
        (entry) =>
          entry?.easProjectId === identity.easProjectId &&
          entry?.appIdentifier === identity.appIdentifier,
      );
      if (!configured) throw new Error("STORE_CREDENTIAL_MAPPING_NOT_FOUND");
      if (configured.easCredentialsPreuploaded !== true) {
        throw new Error("STORE_EAS_CREDENTIALS_NOT_ACKNOWLEDGED");
      }
      if (identity.platform === "ios") {
        if (configured.appleTeamId !== identity.appleTeamId) {
          throw new Error("STORE_APPLE_TEAM_MISMATCH");
        }
        if (
          typeof configured.appStoreConnectKeyId !== "string" ||
          !/^[A-Za-z0-9_-]{3,80}$/.test(configured.appStoreConnectKeyId)
        ) {
          throw new Error("STORE_APP_STORE_CONNECT_KEY_ID_INVALID");
        }
        return {
          platform: "ios",
          easProjectId: identity.easProjectId,
          bundleId: identity.appIdentifier,
          appleTeamId: identity.appleTeamId,
          expoAccountIdSha256: accountHash,
          distributionCertificateSha256: assertHash(
            configured.distributionCertificateSha256,
            "distributionCertificateSha256",
          ),
          provisioningProfileSha256: assertHash(
            configured.provisioningProfileSha256,
            "provisioningProfileSha256",
          ),
          appStoreConnectKeyIdSha256: sha256(String(configured.appStoreConnectKeyId ?? "")),
        };
      }
      if (
        typeof configured.playServiceAccountEmail !== "string" ||
        !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(configured.playServiceAccountEmail)
      ) {
        throw new Error("STORE_PLAY_SERVICE_ACCOUNT_MAPPING_INVALID");
      }
      return {
        platform: "android",
        easProjectId: identity.easProjectId,
        packageName: identity.appIdentifier,
        expoAccountIdSha256: accountHash,
        keystoreCertificateSha256: assertHash(
          configured.keystoreCertificateSha256,
          "keystoreCertificateSha256",
        ),
        playServiceAccountEmailSha256: sha256(configured.playServiceAccountEmail),
        artifactType: "aab",
        track: "internal",
      };
    },
  };
}

export function createPostgresStoreRunnerPersistence(client) {
  if (!client || typeof client.query !== "function") throw new Error("STORE_RUNNER_DB_INVALID");
  return {
    async initialize() {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${REPLAY_TABLE} (
          nonce_sha256 TEXT PRIMARY KEY CHECK (nonce_sha256 ~ '^[0-9a-f]{64}$'),
          expires_at TIMESTAMPTZ NOT NULL,
          claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${JOB_TABLE} (
          release_id TEXT PRIMARY KEY,
          idempotency_key TEXT NOT NULL UNIQUE,
          package_sha256 TEXT NOT NULL CHECK (package_sha256 ~ '^[0-9a-f]{64}$'),
          source_zip BYTEA NOT NULL,
          identity JSONB NOT NULL,
          credential_evidence JSONB NOT NULL,
          state TEXT NOT NULL,
          runner_job_id TEXT NOT NULL UNIQUE,
          workflow_run_id TEXT,
          activation_started_at TIMESTAMPTZ,
          accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          latest_report JSONB,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${EVENT_TABLE} (
          id BIGSERIAL PRIMARY KEY,
          release_id TEXT NOT NULL REFERENCES ${JOB_TABLE} (release_id) ON DELETE CASCADE,
          event_key TEXT NOT NULL,
          event JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (release_id, event_key)
        )
      `);
      await client.query(`DELETE FROM ${REPLAY_TABLE} WHERE expires_at <= NOW()`);
    },
    async claimNonce({ nonceSha256, expiresAtMs }) {
      const result = await client.query(
        `INSERT INTO ${REPLAY_TABLE} (nonce_sha256, expires_at)
         VALUES ($1, TO_TIMESTAMP($2 / 1000.0))
         ON CONFLICT (nonce_sha256) DO UPDATE
           SET expires_at = EXCLUDED.expires_at, claimed_at = NOW()
           WHERE ${REPLAY_TABLE}.expires_at <= NOW()
         RETURNING nonce_sha256`,
        [nonceSha256, expiresAtMs],
      );
      return result.rows.length === 1;
    },
    async accept(input) {
      const runnerJobId = `eas-${input.releaseId}`;
      const result = await client.query(
        `INSERT INTO ${JOB_TABLE} (
           release_id, idempotency_key, package_sha256, source_zip, identity,
           credential_evidence, state, runner_job_id
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'dispatch_accepted', $7)
         ON CONFLICT (release_id) DO UPDATE SET updated_at = ${JOB_TABLE}.updated_at
         WHERE ${JOB_TABLE}.idempotency_key = EXCLUDED.idempotency_key
           AND ${JOB_TABLE}.package_sha256 = EXCLUDED.package_sha256
           AND ${JOB_TABLE}.identity = EXCLUDED.identity
         RETURNING *, accepted_at::text`,
        [
          input.releaseId,
          input.idempotencyKey,
          input.packageSha256,
          input.sourceZip,
          JSON.stringify(input.identity),
          JSON.stringify(input.credentialEvidence),
          runnerJobId,
        ],
      );
      if (result.rows.length !== 1) throw new Error("STORE_RUNNER_IDEMPOTENCY_CONFLICT");
      await this.recordEvent(input.releaseId, `accepted:${input.packageSha256}`, {
        state: "dispatch_accepted",
        packageSha256: input.packageSha256,
      });
      return result.rows[0];
    },
    async get(releaseId) {
      const result = await client.query(
        `SELECT *, accepted_at::text, activation_started_at::text
         FROM ${JOB_TABLE} WHERE release_id = $1`,
        [releaseId],
      );
      if (result.rows.length !== 1) throw new Error("STORE_RUNNER_JOB_NOT_FOUND");
      return result.rows[0];
    },
    async claimActivation(releaseId) {
      const result = await client.query(
        `WITH claimed AS (
           UPDATE ${JOB_TABLE}
           SET activation_started_at = NOW(), updated_at = NOW()
           WHERE release_id = $1
             AND state = 'dispatch_accepted'
             AND activation_started_at IS NULL
             AND workflow_run_id IS NULL
           RETURNING *, TRUE AS may_dispatch
         )
         SELECT *, accepted_at::text, activation_started_at::text FROM claimed
         UNION ALL
         SELECT existing.*, FALSE AS may_dispatch,
                existing.accepted_at::text, existing.activation_started_at::text
         FROM ${JOB_TABLE} AS existing
         WHERE existing.release_id = $1 AND NOT EXISTS (SELECT 1 FROM claimed)
         LIMIT 1`,
        [releaseId],
      );
      if (result.rows.length !== 1) throw new Error("STORE_RUNNER_JOB_NOT_FOUND");
      const row = result.rows[0];
      return { row, mayDispatch: row.may_dispatch === true };
    },
    async recordWorkflow(releaseId, workflowRunId, report) {
      const result = await client.query(
        `UPDATE ${JOB_TABLE}
         SET workflow_run_id = $2, state = 'workflow_queued', latest_report = $3::jsonb,
             updated_at = NOW()
         WHERE release_id = $1 AND workflow_run_id IS NULL
         RETURNING *, accepted_at::text`,
        [releaseId, workflowRunId, JSON.stringify(report)],
      );
      if (result.rows.length !== 1) throw new Error("STORE_RUNNER_WORKFLOW_RECORD_CONFLICT");
      await this.recordEvent(releaseId, `workflow:${workflowRunId}`, report);
      return result.rows[0];
    },
    async markReconciliationRequired(releaseId, code) {
      await client.query(
        `UPDATE ${JOB_TABLE} SET state = 'action_required', updated_at = NOW()
         WHERE release_id = $1 AND workflow_run_id IS NULL`,
        [releaseId],
      );
      await this.recordEvent(releaseId, `error:${code}`, { code, retryable: false });
    },
    async recordRetryableActivationFailure(releaseId, code) {
      await client.query(
        `UPDATE ${JOB_TABLE}
         SET activation_started_at = NULL, state = 'dispatch_accepted', updated_at = NOW()
         WHERE release_id = $1 AND workflow_run_id IS NULL`,
        [releaseId],
      );
      await this.recordEvent(releaseId, `retryable:${code}`, { code, retryable: true });
    },
    async recordObservation(releaseId, report) {
      const result = await client.query(
        `UPDATE ${JOB_TABLE}
         SET state = $2, latest_report = $3::jsonb, updated_at = NOW()
         WHERE release_id = $1 AND workflow_run_id = $4
         RETURNING *, accepted_at::text`,
        [releaseId, report.state, JSON.stringify(report), report.workflowRunId],
      );
      if (result.rows.length !== 1) throw new Error("STORE_RUNNER_OBSERVATION_CONFLICT");
      await this.recordEvent(
        releaseId,
        `observation:${report.providerEvidence.rawReportSha256 ?? report.observedAt}`,
        report,
      );
      return result.rows[0];
    },
    async recordEvent(releaseId, eventKey, event) {
      await client.query(
        `INSERT INTO ${EVENT_TABLE} (release_id, event_key, event)
         VALUES ($1, $2, $3::jsonb) ON CONFLICT (release_id, event_key) DO NOTHING`,
        [releaseId, eventKey, JSON.stringify(event)],
      );
    },
  };
}

function validateZipEntryName(name) {
  return (
    name &&
    !name.startsWith("/") &&
    !name.includes("\\") &&
    !name.split("/").some((part) => part === "" || part === "." || part === "..")
  );
}

/** Extract only the uncompressed, bounded ZIP format emitted by src/lib/zip.ts. */
export async function extractStoreOnlyZip(bytes, root) {
  let offset = 0;
  let files = 0;
  while (offset + 4 <= bytes.byteLength) {
    const signature = bytes.readUInt32LE(offset);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50 || offset + 30 > bytes.byteLength) {
      throw new Error("STORE_RUNNER_ZIP_INVALID");
    }
    const flags = bytes.readUInt16LE(offset + 6);
    const method = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const uncompressedSize = bytes.readUInt32LE(offset + 22);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    if (flags !== 0 || method !== 0 || compressedSize !== uncompressedSize) {
      throw new Error("STORE_RUNNER_ZIP_PROFILE_INVALID");
    }
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.byteLength) throw new Error("STORE_RUNNER_ZIP_INVALID");
    const name = bytes.subarray(nameStart, nameStart + nameLength).toString("utf8");
    if (!validateZipEntryName(name)) throw new Error("STORE_RUNNER_ZIP_PATH_INVALID");
    const destination = join(root, name);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes.subarray(dataStart, dataEnd));
    files += 1;
    if (files > 64) throw new Error("STORE_RUNNER_ZIP_TOO_MANY_FILES");
    offset = dataEnd;
  }
  if (files < 6) throw new Error("STORE_RUNNER_ZIP_INCOMPLETE");
}

function parseJsonObject(value, code) {
  let candidate;
  try {
    candidate = JSON.parse(value);
  } catch {
    throw new Error(code);
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    throw new Error(code);
  return candidate;
}

function expectedWorkflow(platform) {
  return platform === "ios"
    ? `name: Helix iOS TestFlight release

jobs:
  build_ios:
    name: Build signed iOS archive
    type: build
    params:
      platform: ios
      profile: production
  distribute_testflight:
    name: Upload and distribute with TestFlight
    needs: [build_ios]
    type: testflight
    params:
      build_id: \${{ needs.build_ios.outputs.build_id }}
      profile: production
      wait_processing_timeout_seconds: 1800
`
    : `name: Helix Android internal-track release

jobs:
  build_android:
    name: Build signed Android App Bundle
    type: build
    params:
      platform: android
      profile: production
  submit_play_internal:
    name: Upload to Google Play internal track
    needs: [build_android]
    type: submit
    params:
      build_id: \${{ needs.build_android.outputs.build_id }}
      profile: production
`;
}

function workflowRunId(candidate) {
  const values = [candidate?.id, candidate?.workflowRunId, candidate?.workflowRun?.id];
  const id = values.find((value) => typeof value === "string" && value.trim());
  if (!id) throw new Error("STORE_EAS_WORKFLOW_ID_MISSING");
  return id.trim().slice(0, 200);
}

function normalizedWorkflowStatus(value) {
  const status = String(value ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("-", "_");
  const known = {
    NEW: "new",
    IN_PROGRESS: "in_progress",
    SUCCESS: "success",
    FAILURE: "failure",
    ACTION_REQUIRED: "action_required",
    CANCELED: "canceled",
  };
  return known[status] ?? null;
}

function jobById(candidate, id) {
  const jobs = Array.isArray(candidate?.jobs) ? candidate.jobs : [];
  return jobs.find((job) => job?.id === id || job?.key === id || job?.name === id) ?? null;
}

function jobOutput(job, key) {
  const value = job?.outputs?.[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
}

function normalizedJobStatus(job) {
  if (job === null) return "not_started";
  const status = String(job?.status ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("-", "_");
  if (["NEW", "QUEUED", "PENDING"].includes(status)) return "not_started";
  if (["IN_PROGRESS", "RUNNING"].includes(status)) return "in_progress";
  if (["SUCCESS", "SUCCEEDED", "COMPLETED"].includes(status)) return "succeeded";
  if (["ACTION_REQUIRED"].includes(status)) return "action_required";
  if (["FAILURE", "FAILED", "CANCELED", "CANCELLED"].includes(status)) return "failed";
  return null;
}

/**
 * Convert EAS `workflow:view --json` output without guessing. `distributed` is
 * emitted only for an explicit SUCCESS plus successful build/distribution jobs
 * and their documented identifiers.
 */
export function normalizeEasWorkflowView({ raw, job, action = "status", observedAt }) {
  const candidate = parseJsonObject(raw, "STORE_EAS_WORKFLOW_REPORT_INVALID");
  const workflowStatus = normalizedWorkflowStatus(candidate.status);
  if (!workflowStatus) throw new Error("STORE_EAS_WORKFLOW_STATUS_UNKNOWN");
  const buildJobId = job.identity.platform === "ios" ? "build_ios" : "build_android";
  const submitJobId =
    job.identity.platform === "ios" ? "distribute_testflight" : "submit_play_internal";
  const buildJob = jobById(candidate, buildJobId);
  const submitJob = jobById(candidate, submitJobId);
  const buildStatus = normalizedJobStatus(buildJob);
  const submissionStatus = normalizedJobStatus(submitJob);
  if (buildStatus === null || submissionStatus === null) {
    throw new Error("STORE_EAS_JOB_STATUS_UNKNOWN");
  }
  const buildId = jobOutput(buildJob, "build_id");
  const submittedIdentifier =
    job.identity.platform === "ios"
      ? jobOutput(submitJob, "ios_bundle_identifier")
      : jobOutput(submitJob, "android_package_id");
  if (submittedIdentifier && submittedIdentifier !== job.identity.appIdentifier) {
    throw new Error("STORE_EAS_APP_IDENTIFIER_MISMATCH");
  }
  let state;
  let error = null;
  if (workflowStatus === "failure" || workflowStatus === "canceled") {
    state = "failed";
    error = {
      code: "EAS_WORKFLOW_FAILED",
      message: "EAS workflow did not succeed",
      retryable: false,
    };
  } else if (workflowStatus === "action_required" || submissionStatus === "action_required") {
    state = "action_required";
    error = {
      code: "EAS_ACTION_REQUIRED",
      message: "EAS reported that provider action is required",
      retryable: false,
    };
  } else if (
    workflowStatus === "success" &&
    buildStatus === "succeeded" &&
    submissionStatus === "succeeded" &&
    buildId &&
    submittedIdentifier === job.identity.appIdentifier &&
    submitJob &&
    typeof submitJob.id === "string"
  ) {
    state = "distributed";
  } else if (submissionStatus === "in_progress") {
    state = "submission_in_progress";
  } else if (buildStatus === "succeeded") {
    state = "build_succeeded";
  } else if (buildStatus === "in_progress") {
    state = "build_in_progress";
  } else {
    state = "workflow_queued";
  }
  const rawReportSha256 = sha256(raw);
  const providerSubmissionId =
    state === "distributed" ? jobOutput(submitJob, "submission_id") : null;
  const providerReleaseId =
    state === "distributed"
      ? job.identity.platform === "ios"
        ? jobOutput(submitJob, "asc_build_id")
        : jobOutput(submitJob, "release_id")
      : null;
  return StoreRunnerReportSchema.parse({
    kind: "helix_store_release_report",
    schemaVersion: "1.0.0",
    action,
    requestNonce: job.requestNonce,
    releaseId: job.releaseId,
    idempotencyKey: job.idempotencyKey,
    packageSha256: job.packageSha256,
    identity: job.identity,
    state,
    runnerJobId: job.runnerJobId,
    workflowRunId: job.workflowRunId,
    workflowBuildJobId:
      buildJob && typeof buildJob.id === "string" ? buildJob.id.slice(0, 200) : null,
    workflowDistributionJobId:
      submitJob && typeof submitJob.id === "string" ? submitJob.id.slice(0, 200) : null,
    providerBuildId: buildId,
    providerSubmissionId,
    providerReleaseId,
    credentialEvidence: job.credentialEvidence,
    providerEvidence: {
      provider: "eas_workflows",
      easCliVersion: job.easCliVersion,
      workflowStatus,
      buildStatus,
      submissionStatus,
      observedAt,
      rawReportSha256,
    },
    acceptedAt: job.acceptedAt,
    observedAt,
    retryAfterSeconds: [
      "workflow_queued",
      "build_in_progress",
      "build_succeeded",
      "submission_in_progress",
    ].includes(state)
      ? 30
      : null,
    error,
  });
}

function runExecutable(executable, argv, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(executable, argv, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let started = false;
    child.once("spawn", () => {
      started = true;
    });
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-256 * 1024);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-16 * 1024);
    });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      const error = new Error("STORE_EAS_CLI_TIMEOUT");
      error.processStarted = started;
      rejectRun(error);
    }, options.timeoutMs ?? CLI_TIMEOUT_MS);
    child.once("error", (cause) => {
      clearTimeout(timeout);
      const error = new Error("STORE_EAS_CLI_START_FAILED", { cause });
      error.processStarted = started;
      rejectRun(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) return resolveRun({ stdout, stderr });
      const error = new Error("STORE_EAS_CLI_FAILED");
      error.processStarted = started;
      rejectRun(error);
    });
  });
}

export async function assertPinnedEasCli(configuration, run = runExecutable) {
  const result = await run(configuration.easCliPath, ["--version"], {
    env: { PATH: process.env.PATH ?? "" },
    timeoutMs: 10_000,
  });
  const output = `${String(result.stdout)}\n${String(result.stderr ?? "")}`;
  const version = output.match(
    /(?:^|\s)(?:eas-cli\/)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?=\s|$)/,
  )?.[1];
  if (version !== configuration.easCliVersion)
    throw new Error("HELIX_STORE_EAS_CLI_VERSION_MISMATCH");
}

export function createEasWorkflowExecutor(configuration, options = {}) {
  const run = options.run ?? runExecutable;
  return {
    async dispatch({ sourceZip, identity }) {
      const directory = await mkdtemp(join(tmpdir(), "helix-store-runner-"));
      let processStarted = false;
      try {
        await extractStoreOnlyZip(Buffer.from(sourceZip), directory);
        const appJson = parseJsonObject(
          await readFile(join(directory, "app.json"), "utf8"),
          "STORE_EAS_APP_JSON_INVALID",
        );
        const easJson = parseJsonObject(
          await readFile(join(directory, "eas.json"), "utf8"),
          "STORE_EAS_CONFIG_INVALID",
        );
        const workflow = await readFile(join(directory, WORKFLOW_FILE), "utf8");
        if (workflow !== expectedWorkflow(identity.platform)) {
          throw new Error("STORE_EAS_WORKFLOW_PROFILE_INVALID");
        }
        const expo = appJson.expo;
        const configuredIdentifier =
          identity.platform === "ios" ? expo?.ios?.bundleIdentifier : expo?.android?.package;
        if (
          configuredIdentifier !== identity.appIdentifier ||
          expo?.extra?.eas?.projectId !== identity.easProjectId ||
          (identity.platform === "ios" && expo?.ios?.appleTeamId !== identity.appleTeamId)
        ) {
          throw new Error("STORE_EAS_APP_IDENTITY_MISMATCH");
        }
        const androidSubmit = easJson?.submit?.production?.android;
        if (
          easJson?.build?.production?.android?.buildType !== "app-bundle" ||
          (identity.platform === "android" &&
            (androidSubmit?.track !== "internal" ||
              androidSubmit?.releaseStatus !== "completed" ||
              Object.hasOwn(androidSubmit, "serviceAccountKeyPath")))
        ) {
          throw new Error("STORE_EAS_CONFIG_INVALID");
        }
        const environment = {
          PATH: process.env.PATH ?? "",
          XDG_CONFIG_HOME: join(directory, ".xdg-config"),
          XDG_CACHE_HOME: join(directory, ".xdg-cache"),
          CI: "1",
          EXPO_TOKEN: configuration.expoToken,
        };
        const result = await run(
          configuration.easCliPath,
          ["workflow:run", WORKFLOW_FILE, "--non-interactive", "--no-wait", "--json"],
          { cwd: directory, env: environment, timeoutMs: CLI_TIMEOUT_MS },
        ).catch((error) => {
          processStarted = Boolean(error?.processStarted);
          throw error;
        });
        processStarted = true;
        const candidate = parseJsonObject(result.stdout, "STORE_EAS_WORKFLOW_DISPATCH_INVALID");
        return { workflowRunId: workflowRunId(candidate), processStarted };
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    async inspect({ workflowRunId: id }) {
      const directory = await mkdtemp(join(tmpdir(), "helix-store-inspect-"));
      try {
        const result = await run(
          configuration.easCliPath,
          ["workflow:view", id, "--json", "--non-interactive"],
          {
            env: {
              PATH: process.env.PATH ?? "",
              XDG_CONFIG_HOME: join(directory, ".xdg-config"),
              XDG_CACHE_HOME: join(directory, ".xdg-cache"),
              CI: "1",
              EXPO_TOKEN: configuration.expoToken,
            },
            timeoutMs: CLI_TIMEOUT_MS,
          },
        );
        return result.stdout;
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}

class RunnerRejection extends Error {
  constructor(status, code, authenticatedNonce = null) {
    super(code);
    this.status = status;
    this.code = code;
    this.authenticatedNonce = authenticatedNonce;
  }
}

async function readBoundedBody(request) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_REQUEST_BYTES)) {
    throw new RunnerRejection(413, "STORE_RUNNER_REQUEST_TOO_LARGE");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_REQUEST_BYTES)
        throw new RunnerRejection(413, "STORE_RUNNER_REQUEST_TOO_LARGE");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

async function authenticate(request, body, dependencies) {
  const timestamp = request.headers.get("x-helix-store-timestamp") ?? "";
  const nonce = request.headers.get("x-helix-store-nonce") ?? "";
  const signature = request.headers.get("x-helix-store-signature") ?? "";
  const timestampMs = Number(timestamp);
  const receivedAt = dependencies.now();
  if (
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(receivedAt - timestampMs) > MAX_CLOCK_SKEW_MS ||
    !equalSignature(signature, hmac(dependencies.secret, `${timestamp}\n${nonce}\n${body}`))
  ) {
    throw new RunnerRejection(401, "STORE_RUNNER_UNAUTHORIZED");
  }
  let claimed;
  try {
    claimed = await dependencies.persistence.claimNonce({
      nonceSha256: sha256(nonce),
      expiresAtMs: receivedAt + NONCE_TTL_MS,
    });
  } catch {
    throw new RunnerRejection(503, "STORE_RUNNER_REPLAY_STORE_UNAVAILABLE", nonce);
  }
  if (!claimed) throw new RunnerRejection(409, "STORE_RUNNER_REPLAY_DETECTED", nonce);
  return nonce;
}

function emptyProviderEvidence(easCliVersion, observedAt) {
  return {
    provider: "eas_workflows",
    easCliVersion,
    workflowStatus: "not_started",
    buildStatus: "not_started",
    submissionStatus: "not_started",
    observedAt,
    rawReportSha256: null,
  };
}

function reportFromRow(request, row, options) {
  const observedAt = options.observedAt;
  return StoreRunnerReportSchema.parse({
    kind: "helix_store_release_report",
    schemaVersion: "1.0.0",
    action: request.action,
    requestNonce: request.requestNonce,
    releaseId: request.releaseId,
    idempotencyKey: request.idempotencyKey,
    packageSha256: request.packageSha256,
    identity: request.identity,
    state: options.state,
    runnerJobId: row.runner_job_id,
    workflowRunId: options.workflowRunId ?? row.workflow_run_id ?? null,
    workflowBuildJobId: null,
    workflowDistributionJobId: null,
    providerBuildId: null,
    providerSubmissionId: null,
    providerReleaseId: null,
    credentialEvidence: row.credential_evidence,
    providerEvidence: emptyProviderEvidence(options.easCliVersion, observedAt),
    acceptedAt: new Date(row.accepted_at).toISOString(),
    observedAt,
    retryAfterSeconds: options.retryAfterSeconds ?? null,
    error: options.error ?? null,
  });
}

function assertImmutableRequest(row, request) {
  if (
    row.idempotency_key !== request.idempotencyKey ||
    row.package_sha256 !== request.packageSha256 ||
    JSON.stringify(row.identity) !== JSON.stringify(request.identity)
  ) {
    throw new RunnerRejection(409, "STORE_RUNNER_IDEMPOTENCY_CONFLICT", request.requestNonce);
  }
}

async function executeAction(request, dependencies) {
  const observedAt = new Date(dependencies.now()).toISOString();
  if (request.action === "accept") {
    const sourceZip = Buffer.from(request.sourcePackage.base64, "base64");
    if (
      sourceZip.byteLength !== request.sourcePackage.byteLength ||
      sourceZip.byteLength > MAX_STORE_PACKAGE_BYTES ||
      sha256(sourceZip) !== request.packageSha256
    ) {
      throw new RunnerRejection(422, "STORE_RUNNER_PACKAGE_MISMATCH", request.requestNonce);
    }
    let credentialEvidence;
    try {
      credentialEvidence = dependencies.credentialAuthority.verify(request.identity);
    } catch (error) {
      throw new RunnerRejection(
        422,
        error instanceof Error ? error.message : "STORE_RUNNER_CREDENTIALS_INVALID",
        request.requestNonce,
      );
    }
    const row = await dependencies.persistence.accept({
      releaseId: request.releaseId,
      idempotencyKey: request.idempotencyKey,
      packageSha256: request.packageSha256,
      sourceZip,
      identity: request.identity,
      credentialEvidence,
    });
    assertImmutableRequest(row, request);
    return reportFromRow(request, row, {
      state: "dispatch_accepted",
      observedAt,
      easCliVersion: dependencies.easCliVersion,
    });
  }

  const existing = await dependencies.persistence.get(request.releaseId);
  assertImmutableRequest(existing, request);
  if (request.action === "activate") {
    const claimed = await dependencies.persistence.claimActivation(request.releaseId);
    if (claimed.row.workflow_run_id) {
      return reportFromRow(request, claimed.row, {
        state: "workflow_queued",
        workflowRunId: claimed.row.workflow_run_id,
        observedAt,
        easCliVersion: dependencies.easCliVersion,
        retryAfterSeconds: 30,
      });
    }
    if (!claimed.mayDispatch) {
      const activationStartedAt = Date.parse(claimed.row.activation_started_at ?? "");
      const activationAgeMs = Date.parse(observedAt) - activationStartedAt;
      if (
        Number.isFinite(activationStartedAt) &&
        activationAgeMs >= -MAX_CLOCK_SKEW_MS &&
        activationAgeMs <= CLI_TIMEOUT_MS + MAX_CLOCK_SKEW_MS
      ) {
        return reportFromRow(request, claimed.row, {
          state: "dispatch_accepted",
          observedAt,
          easCliVersion: dependencies.easCliVersion,
          retryAfterSeconds: 5,
        });
      }
      return reportFromRow(request, claimed.row, {
        state: "action_required",
        observedAt,
        easCliVersion: dependencies.easCliVersion,
        error: {
          code: "STORE_RUNNER_ACTIVATION_RECONCILIATION_REQUIRED",
          message: "Activation started without a durably recorded workflow ID",
          retryable: false,
        },
      });
    }
    let dispatched;
    try {
      dispatched = await dependencies.executor.dispatch({
        sourceZip: claimed.row.source_zip,
        identity: request.identity,
      });
    } catch (error) {
      // Once the executable started, EAS may have accepted the workflow even if
      // the local response was lost. Never auto-dispatch a second workflow.
      if (error?.processStarted) {
        await dependencies.persistence.markReconciliationRequired(
          request.releaseId,
          "STORE_RUNNER_ACTIVATION_OUTCOME_UNKNOWN",
        );
      } else {
        await dependencies.persistence.recordRetryableActivationFailure(
          request.releaseId,
          "STORE_RUNNER_ACTIVATION_FAILED",
        );
      }
      throw new RunnerRejection(
        503,
        error?.processStarted
          ? "STORE_RUNNER_ACTIVATION_OUTCOME_UNKNOWN"
          : "STORE_RUNNER_ACTIVATION_FAILED",
        request.requestNonce,
      );
    }
    const queued = reportFromRow(request, claimed.row, {
      state: "workflow_queued",
      workflowRunId: dispatched.workflowRunId,
      observedAt,
      easCliVersion: dependencies.easCliVersion,
      retryAfterSeconds: 30,
    });
    await dependencies.persistence.recordWorkflow(
      request.releaseId,
      dispatched.workflowRunId,
      queued,
    );
    return queued;
  }

  if (!existing.workflow_run_id) {
    return reportFromRow(request, existing, {
      state: existing.state === "action_required" ? "action_required" : "dispatch_accepted",
      observedAt,
      easCliVersion: dependencies.easCliVersion,
      error:
        existing.state === "action_required"
          ? {
              code: "STORE_RUNNER_ACTIVATION_RECONCILIATION_REQUIRED",
              message: "No workflow ID is available for polling",
              retryable: false,
            }
          : null,
    });
  }
  const raw = await dependencies.executor.inspect({ workflowRunId: existing.workflow_run_id });
  const report = normalizeEasWorkflowView({
    raw,
    job: {
      requestNonce: request.requestNonce,
      releaseId: request.releaseId,
      idempotencyKey: request.idempotencyKey,
      packageSha256: request.packageSha256,
      identity: request.identity,
      runnerJobId: existing.runner_job_id,
      workflowRunId: existing.workflow_run_id,
      credentialEvidence: existing.credential_evidence,
      acceptedAt: new Date(existing.accepted_at).toISOString(),
      easCliVersion: dependencies.easCliVersion,
    },
    observedAt,
  });
  await dependencies.persistence.recordObservation(request.releaseId, report);
  return report;
}

function signedResponse(secret, nonce, status, payload) {
  const body = JSON.stringify(payload);
  return new Response(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "content-length": String(Buffer.byteLength(body)),
      "x-content-type-options": "nosniff",
      "x-helix-store-signature": hmac(secret, `${nonce}\n${body}`),
    },
  });
}

export function createStoreRunnerHandler(dependencies) {
  if (!dependencies?.secret || dependencies.secret.length < 32) {
    throw new Error("STORE_RUNNER_SECRET_INVALID");
  }
  if (!dependencies.persistence || !dependencies.executor || !dependencies.credentialAuthority) {
    throw new Error("STORE_RUNNER_DURABLE_DEPENDENCIES_REQUIRED");
  }
  const now = dependencies.now ?? Date.now;
  return async (request) => {
    let authenticatedNonce = null;
    try {
      if (request.method !== "POST")
        throw new RunnerRejection(405, "STORE_RUNNER_METHOD_NOT_ALLOWED");
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        throw new RunnerRejection(415, "STORE_RUNNER_CONTENT_TYPE_INVALID");
      }
      const body = await readBoundedBody(request);
      authenticatedNonce = await authenticate(request, body, {
        secret: dependencies.secret,
        persistence: dependencies.persistence,
        now,
      });
      let candidate;
      try {
        candidate = JSON.parse(body);
      } catch {
        throw new RunnerRejection(400, "STORE_RUNNER_REQUEST_INVALID", authenticatedNonce);
      }
      const parsed = StoreRunnerRequestSchema.safeParse(candidate);
      if (!parsed.success || parsed.data.requestNonce !== authenticatedNonce) {
        throw new RunnerRejection(400, "STORE_RUNNER_REQUEST_INVALID", authenticatedNonce);
      }
      const report = await executeAction(parsed.data, { ...dependencies, now });
      return signedResponse(dependencies.secret, authenticatedNonce, 200, report);
    } catch (error) {
      const rejection = error instanceof RunnerRejection ? error : null;
      const nonce = rejection?.authenticatedNonce ?? authenticatedNonce;
      if (!nonce) {
        return new Response(null, {
          status: rejection?.status ?? 401,
          headers: { "cache-control": "no-store" },
        });
      }
      return signedResponse(dependencies.secret, nonce, rejection?.status ?? 500, {
        kind: "helix_store_release_error",
        schemaVersion: "1.0.0",
        errorCode: String(rejection?.code ?? "STORE_RUNNER_INTERNAL_ERROR").slice(0, 120),
      });
    }
  };
}

export function nodeHandler(
  fetchHandler,
  { maxConcurrentRequests = MAX_CONCURRENT_REQUESTS } = {},
) {
  if (!Number.isSafeInteger(maxConcurrentRequests) || maxConcurrentRequests < 1) {
    throw new Error("STORE_RUNNER_MAX_CONCURRENT_REQUESTS_INVALID");
  }
  let activeRequests = 0;
  return async (incoming, outgoing) => {
    const sendEmpty = (status) => {
      if (outgoing.headersSent || outgoing.destroyed || outgoing.writableEnded) return false;
      try {
        outgoing.writeHead(status, {
          "cache-control": "no-store",
          "content-length": "0",
          "x-content-type-options": "nosniff",
        });
        outgoing.end();
        return true;
      } catch {
        if (!outgoing.destroyed) outgoing.destroy();
        return false;
      }
    };
    if (incoming.method !== "POST") {
      incoming.resume();
      sendEmpty(405);
      return;
    }
    if (activeRequests >= maxConcurrentRequests) {
      incoming.resume();
      sendEmpty(503);
      return;
    }
    activeRequests += 1;
    let bodyReadComplete = false;
    try {
      const declaredLength = incoming.headers["content-length"];
      const declared = Array.isArray(declaredLength) ? declaredLength[0] : declaredLength;
      if (
        declared !== undefined &&
        (!/^\d+$/.test(declared) || Number(declared) > MAX_REQUEST_BYTES)
      ) {
        incoming.resume();
        sendEmpty(413);
        return;
      }
      const chunks = [];
      let receivedBytes = 0;
      let oversized = false;
      for await (const chunk of incoming) {
        const bytes = Buffer.from(chunk);
        receivedBytes += bytes.byteLength;
        if (oversized || receivedBytes > MAX_REQUEST_BYTES) {
          oversized = true;
          chunks.length = 0;
          continue;
        }
        chunks.push(bytes);
      }
      bodyReadComplete = true;
      if (oversized) {
        // Consume and discard the remainder without buffering. Explicit server
        // timeouts bound a peer that stops mid-stream, while the concurrency cap
        // bounds aggregate pre-authentication memory.
        sendEmpty(413);
        return;
      }
      const request = new Request(`http://127.0.0.1${incoming.url ?? "/"}`, {
        method: incoming.method,
        headers: incoming.headers,
        body: Buffer.concat(chunks),
      });
      const response = await fetchHandler(request);
      const responseBody = Buffer.from(await response.arrayBuffer());
      if (outgoing.destroyed || outgoing.writableEnded) return;
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(responseBody);
    } catch {
      try {
        incoming.resume();
      } catch {
        // The peer may already have aborted; there is nothing left to drain.
      }
      if (!sendEmpty(bodyReadComplete ? 500 : 400) && !outgoing.destroyed) {
        outgoing.destroy();
      }
    } finally {
      activeRequests -= 1;
    }
  };
}

export async function startStoreRunnerService(environment = process.env) {
  const configuration = parseStoreRunnerConfiguration(environment);
  await assertPinnedEasCli(configuration);
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: configuration.databaseUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: 5,
  });
  const persistence = createPostgresStoreRunnerPersistence(pool);
  try {
    await persistence.initialize();
  } catch {
    await pool.end().catch(() => undefined);
    throw new Error("HELIX_STORE_RUNNER_DATABASE_UNAVAILABLE");
  }
  const handler = createStoreRunnerHandler({
    secret: configuration.secret,
    persistence,
    credentialAuthority: createCredentialAuthority(configuration),
    executor: createEasWorkflowExecutor(configuration),
    easCliVersion: configuration.easCliVersion,
  });
  const port = Number(environment.HELIX_STORE_RUNNER_PORT ?? "8790");
  const host = environment.HELIX_STORE_RUNNER_HOST?.trim() || "127.0.0.1";
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    await pool.end();
    throw new Error("HELIX_STORE_RUNNER_PORT must be an integer between 1 and 65535");
  }
  const server = createServer(nodeHandler(handler));
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.maxConnections = MAX_CONNECTIONS;
  try {
    await new Promise((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(port, host, resolveListen);
    });
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
  server.once("close", () => void pool.end());
  process.stdout.write(`Helix Store runner listening on http://${host}:${port}/\n`);
  return { server, pool };
}

const isMain = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (isMain) {
  startStoreRunnerService().catch((error) => {
    process.stderr.write(
      `Helix Store runner failed to start: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  });
}
