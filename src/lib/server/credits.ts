import { getSql } from "@/lib/db";

export const CREDIT_ERROR_CODES = [
  "INSUFFICIENT_CREDITS",
  "INVALID_CREDIT_DELTA",
  "INVALID_IDEMPOTENCY_KEY",
  "IDEMPOTENCY_KEY_REUSED",
  "PROFILE_NOT_FOUND",
] as const;

export type CreditErrorCode = (typeof CREDIT_ERROR_CODES)[number];

export class CreditMutationError extends Error {
  readonly code: CreditErrorCode;

  constructor(code: CreditErrorCode) {
    super(code);
    this.name = "CreditMutationError";
    this.code = code;
  }
}

export type CreditMutationResult = {
  was_applied: boolean;
  balance_after: number;
  entry_id: number;
};

export type CreditEntryInput = {
  userId: string;
  delta: number;
  action: string;
  projectId: string | null;
  note: string;
  idempotencyKey: string;
};

export function initialWebHostingIdempotencyKey(projectId: string): string {
  return `web-host:${projectId}:initial`;
}

function knownCreditError(error: unknown): CreditErrorCode | null {
  const message = error instanceof Error ? error.message : String(error);
  return CREDIT_ERROR_CODES.find((code) => message.includes(code)) ?? null;
}

export function rethrowCreditMutationError(error: unknown): never {
  const code = knownCreditError(error);
  if (code) throw new CreditMutationError(code);
  throw error;
}

/**
 * Apply one ledger entry and its balance delta in the same database transaction.
 * The SQL function serializes concurrent retries on `(user_id, idempotency_key)`
 * and rejects debits that would make the balance negative.
 */
export async function applyCreditEntry(input: CreditEntryInput): Promise<CreditMutationResult> {
  if (!Number.isSafeInteger(input.delta) || input.delta === 0) {
    throw new CreditMutationError("INVALID_CREDIT_DELTA");
  }
  const idempotencyKey = input.idempotencyKey.trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    throw new CreditMutationError("INVALID_IDEMPOTENCY_KEY");
  }

  try {
    const sql = await getSql();
    const rows = await sql<CreditMutationResult>`
      select was_applied, balance_after, entry_id
      from apply_credit_entry(
        ${input.userId},
        ${input.delta},
        ${input.action},
        ${input.projectId},
        ${input.note},
        ${idempotencyKey}
      )
    `;
    if (!rows[0]) throw new Error("Credit mutation returned no result");
    return rows[0];
  } catch (error) {
    rethrowCreditMutationError(error);
  }
}

export function debitCredits(input: Omit<CreditEntryInput, "delta"> & { amount: number }) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new CreditMutationError("INVALID_CREDIT_DELTA");
  }
  return applyCreditEntry({ ...input, delta: -input.amount });
}

export function refundCredits(input: Omit<CreditEntryInput, "delta"> & { amount: number }) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new CreditMutationError("INVALID_CREDIT_DELTA");
  }
  return applyCreditEntry({ ...input, delta: input.amount });
}
