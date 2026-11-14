import type { GameModel } from "./model";

/** Must match `TIMEOUT_GRACE_MS` in `contracts/rolet-near/src/matches.rs`. */
export const TIMEOUT_GRACE_MS = 2_000;

/** Warning threshold highlighted in the HUD countdown. */
export const LOW_TIME_WARNING_MS = 10_000;

/**
 * Returns remaining milliseconds before `deadlineMs`, clamped to >= 0.
 */
export function remainingMs(
  deadlineMs: number,
  nowMs: number = Date.now(),
): number {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    return 0;
  }
  return Math.max(0, deadlineMs - nowMs);
}

/**
 * Returns whole seconds remaining (rounded up while > 0), or null if no deadline is active.
 */
export function remainingSeconds(
  deadlineMs: number,
  nowMs: number = Date.now(),
): number | null {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    return null;
  }
  return Math.ceil(remainingMs(deadlineMs, nowMs) / 1000);
}

/**
 * True during the final <= 10 seconds before deadline (while > 0 ms remains).
 */
export function isLowTimeWarning(
  deadlineMs: number,
  nowMs: number = Date.now(),
): boolean {
  const rem = remainingMs(deadlineMs, nowMs);
  return rem > 0 && rem <= LOW_TIME_WARNING_MS;
}

/**
 * True when the waiting player (`you !== model.turn`) can claim turn timeout on-chain.
 */
export function claimable(
  model: Pick<GameModel, "phase" | "turn">,
  you: number,
  deadlineMs: number,
  nowMs: number = Date.now(),
  graceMs: number = TIMEOUT_GRACE_MS,
): boolean {
  if (model.phase !== "active") return false;
  if (model.turn === you) return false;
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) return false;
  return nowMs >= deadlineMs + graceMs;
}

/**
 * True when a revealing-phase timeout can be claimed on-chain.
 */
export function canClaimRevealTimeout(
  revealed: readonly [boolean, boolean],
  you: 0 | 1,
  revealDeadlineMs: number,
  nowMs: number = Date.now(),
  graceMs: number = TIMEOUT_GRACE_MS,
): boolean {
  if (!Number.isFinite(revealDeadlineMs) || revealDeadlineMs <= 0) {
    return false;
  }
  if (nowMs < revealDeadlineMs + graceMs) {
    return false;
  }
  const other = 1 - you;
  return revealed[you] || !revealed[other];
}
