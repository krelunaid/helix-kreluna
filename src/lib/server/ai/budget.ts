import { isValidAiCost, parseUsdTicks, type AiCost, type UsdTicks } from "@/lib/server/ai/types";

export type AiJobBudgetPolicy = Readonly<{
  maxCalls: number;
  maxRetries: number;
  maxDurationMs: number;
  /** Null means that a hard monetary ceiling is intentionally not configured. */
  maxCostUsdTicks: UsdTicks | null;
}>;

export type AiBudgetReservation = Readonly<{
  id: string;
  retry: boolean;
  /** Trusted upper bound. It is policy accounting, never reported as actual cost. */
  maximumCostUsdTicks: UsdTicks | null;
}>;

export type AiJobBudgetState = Readonly<{
  startedAtMs: number;
  callCount: number;
  retryCount: number;
  knownCostUsdTicks: UsdTicks;
  /** Known settled cost plus conservative accounting for unknown-cost calls. */
  accountedCostUsdTicks: UsdTicks;
  unknownCostCalls: number;
  activeReservations: Readonly<Record<string, AiBudgetReservation>>;
}>;

export class AiBudgetError extends Error {
  readonly code: string;
  readonly retryable = false;

  constructor(code: string) {
    super(code);
    this.name = "AiBudgetError";
    this.code = code;
  }
}

function ticks(value: UsdTicks | string): bigint {
  const parsed = parseUsdTicks(value);
  if (parsed === null) throw new AiBudgetError("AI_BUDGET_COST_INVALID");
  return BigInt(parsed);
}

function asTicks(value: bigint): UsdTicks {
  if (value < 0n) throw new AiBudgetError("AI_BUDGET_COST_INVALID");
  return value.toString() as UsdTicks;
}

function validateCount(value: number, minimum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum;
}

export function defineAiJobBudgetPolicy(input: {
  maxCalls: number;
  maxRetries: number;
  maxDurationMs: number;
  maxCostUsdTicks?: string | null;
}): AiJobBudgetPolicy {
  const maxCostUsdTicks =
    input.maxCostUsdTicks === null || input.maxCostUsdTicks === undefined
      ? null
      : parseUsdTicks(input.maxCostUsdTicks);
  if (
    !validateCount(input.maxCalls, 1) ||
    !validateCount(input.maxRetries, 0) ||
    input.maxRetries > input.maxCalls ||
    !validateCount(input.maxDurationMs, 1) ||
    (input.maxCostUsdTicks !== null &&
      input.maxCostUsdTicks !== undefined &&
      maxCostUsdTicks === null)
  ) {
    throw new AiBudgetError("AI_BUDGET_POLICY_INVALID");
  }
  return Object.freeze({
    maxCalls: input.maxCalls,
    maxRetries: input.maxRetries,
    maxDurationMs: input.maxDurationMs,
    maxCostUsdTicks,
  });
}

export function createAiJobBudgetState(startedAtMs: number): AiJobBudgetState {
  if (!Number.isSafeInteger(startedAtMs) || startedAtMs < 0) {
    throw new AiBudgetError("AI_BUDGET_START_TIME_INVALID");
  }
  return Object.freeze({
    startedAtMs,
    callCount: 0,
    retryCount: 0,
    knownCostUsdTicks: "0" as UsdTicks,
    accountedCostUsdTicks: "0" as UsdTicks,
    unknownCostCalls: 0,
    activeReservations: Object.freeze({}),
  });
}

function activeReservedCost(state: AiJobBudgetState): bigint {
  return Object.values(state.activeReservations).reduce(
    (sum, reservation) =>
      sum +
      (reservation.maximumCostUsdTicks === null ? 0n : ticks(reservation.maximumCostUsdTicks)),
    0n,
  );
}

export function reserveAiBudgetCall(input: {
  policy: AiJobBudgetPolicy;
  state: AiJobBudgetState;
  reservationId: string;
  nowMs: number;
  retry: boolean;
  /** Must come from provider cost or an explicitly versioned pricing policy. */
  maximumCostUsdTicks?: string | null;
}): { state: AiJobBudgetState; reservation: AiBudgetReservation } {
  const { policy, state } = input;
  const reservationId = input.reservationId.trim();
  if (!reservationId || Object.hasOwn(state.activeReservations, reservationId)) {
    throw new AiBudgetError(
      reservationId ? "AI_CALL_RESERVATION_DUPLICATE" : "AI_CALL_RESERVATION_ID_INVALID",
    );
  }
  if (!Number.isSafeInteger(input.nowMs) || input.nowMs < state.startedAtMs) {
    throw new AiBudgetError("AI_BUDGET_TIME_INVALID");
  }
  if (input.nowMs - state.startedAtMs >= policy.maxDurationMs) {
    throw new AiBudgetError("AI_BUDGET_MAX_DURATION");
  }
  if (state.callCount >= policy.maxCalls) {
    throw new AiBudgetError("AI_BUDGET_MAX_CALLS");
  }
  if (input.retry && state.retryCount >= policy.maxRetries) {
    throw new AiBudgetError("AI_BUDGET_MAX_RETRIES");
  }

  const maximumCostUsdTicks =
    input.maximumCostUsdTicks === null || input.maximumCostUsdTicks === undefined
      ? null
      : parseUsdTicks(input.maximumCostUsdTicks);
  if (
    input.maximumCostUsdTicks !== null &&
    input.maximumCostUsdTicks !== undefined &&
    maximumCostUsdTicks === null
  ) {
    throw new AiBudgetError("AI_COST_RESERVATION_INVALID");
  }
  if (policy.maxCostUsdTicks !== null && maximumCostUsdTicks === null) {
    throw new AiBudgetError("AI_COST_RESERVATION_REQUIRED");
  }
  if (policy.maxCostUsdTicks !== null) {
    const projected =
      ticks(state.accountedCostUsdTicks) +
      activeReservedCost(state) +
      ticks(maximumCostUsdTicks as UsdTicks);
    if (projected > ticks(policy.maxCostUsdTicks)) {
      throw new AiBudgetError("AI_BUDGET_MAX_COST");
    }
  }

  const reservation: AiBudgetReservation = Object.freeze({
    id: reservationId,
    retry: input.retry,
    maximumCostUsdTicks,
  });
  return {
    reservation,
    state: Object.freeze({
      ...state,
      callCount: state.callCount + 1,
      retryCount: state.retryCount + (input.retry ? 1 : 0),
      activeReservations: Object.freeze({
        ...state.activeReservations,
        [reservationId]: reservation,
      }),
    }),
  };
}

export function settleAiBudgetCall(input: {
  policy: AiJobBudgetPolicy;
  state: AiJobBudgetState;
  reservationId: string;
  cost: AiCost;
}): { state: AiJobBudgetState; violationCode: "AI_COST_RESERVATION_EXCEEDED" | null } {
  if (!isValidAiCost(input.cost)) {
    throw new AiBudgetError("AI_COST_EVIDENCE_INVALID");
  }
  const reservation = input.state.activeReservations[input.reservationId];
  if (!reservation) throw new AiBudgetError("AI_CALL_RESERVATION_NOT_FOUND");
  const remaining = { ...input.state.activeReservations };
  delete remaining[input.reservationId];

  const measuredCost = input.cost.usdTicks === null ? null : ticks(input.cost.usdTicks);
  const reservedCost =
    reservation.maximumCostUsdTicks === null ? null : ticks(reservation.maximumCostUsdTicks);
  const violationCode =
    measuredCost !== null && reservedCost !== null && measuredCost > reservedCost
      ? ("AI_COST_RESERVATION_EXCEEDED" as const)
      : null;
  const accountedIncrement =
    measuredCost ?? (input.policy.maxCostUsdTicks !== null ? (reservedCost ?? 0n) : 0n);

  return {
    violationCode,
    state: Object.freeze({
      ...input.state,
      knownCostUsdTicks: asTicks(ticks(input.state.knownCostUsdTicks) + (measuredCost ?? 0n)),
      accountedCostUsdTicks: asTicks(ticks(input.state.accountedCostUsdTicks) + accountedIncrement),
      unknownCostCalls: input.state.unknownCostCalls + (measuredCost === null ? 1 : 0),
      activeReservations: Object.freeze(remaining),
    }),
  };
}
