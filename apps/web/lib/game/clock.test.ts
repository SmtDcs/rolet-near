import assert from "node:assert/strict";
import test from "node:test";
import {
  canClaimRevealTimeout,
  claimable,
  isLowTimeWarning,
  remainingMs,
  remainingSeconds,
  TIMEOUT_GRACE_MS,
} from "./clock";

test("F3-20 clock: remainingMs, remainingSeconds, and last-10s warning", () => {
  const deadline = 50_000;

  assert.equal(remainingMs(deadline, 40_000), 10_000);
  assert.equal(remainingSeconds(deadline, 40_000), 10);
  assert.equal(isLowTimeWarning(deadline, 40_000), true);

  assert.equal(remainingMs(deadline, 39_999), 10_001);
  assert.equal(remainingSeconds(deadline, 39_999), 11);
  assert.equal(isLowTimeWarning(deadline, 39_999), false);

  assert.equal(remainingMs(deadline, 50_000), 0);
  assert.equal(remainingMs(deadline, 55_000), 0);
  assert.equal(remainingSeconds(deadline, 55_000), 0);
  assert.equal(isLowTimeWarning(deadline, 50_000), false);

  assert.equal(remainingSeconds(0, 50_000), null);
});

test("F3-20 clock: claimable enforces active phase, opponent turn, and grace delay", () => {
  const deadline = 100_000;

  // Before grace passes
  assert.equal(
    claimable(
      { phase: "active", turn: 1 },
      0,
      deadline,
      deadline + TIMEOUT_GRACE_MS - 1,
    ),
    false,
  );

  // At and after grace when opponent's turn
  assert.equal(
    claimable(
      { phase: "active", turn: 1 },
      0,
      deadline,
      deadline + TIMEOUT_GRACE_MS,
    ),
    true,
  );

  // Never claimable on own turn
  assert.equal(
    claimable(
      { phase: "active", turn: 0 },
      0,
      deadline,
      deadline + TIMEOUT_GRACE_MS + 5_000,
    ),
    false,
  );

  // Never claimable when non-active or zero deadline
  assert.equal(
    claimable(
      { phase: "finished", turn: 1 },
      0,
      deadline,
      deadline + TIMEOUT_GRACE_MS + 5_000,
    ),
    false,
  );
  assert.equal(
    claimable({ phase: "active", turn: 1 }, 0, 0, 999_999),
    false,
  );
});

test("F3-20 clock: canClaimRevealTimeout enforces reveal rules and grace", () => {
  const revealDeadline = 60_000;
  // Too early
  assert.equal(
    canClaimRevealTimeout([true, false], 0, revealDeadline, revealDeadline + 1_999),
    false,
  );
  // I revealed, opponent stalled -> allowed
  assert.equal(
    canClaimRevealTimeout([true, false], 0, revealDeadline, revealDeadline + 2_000),
    true,
  );
  // Opponent revealed, I didn't -> I cannot punish opponent
  assert.equal(
    canClaimRevealTimeout([false, true], 0, revealDeadline, revealDeadline + 2_000),
    false,
  );
  // Neither revealed -> cleanup allowed
  assert.equal(
    canClaimRevealTimeout([false, false], 0, revealDeadline, revealDeadline + 2_000),
    true,
  );
});
