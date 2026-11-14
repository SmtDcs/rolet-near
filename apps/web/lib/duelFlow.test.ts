import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialDuelFlow,
  hasOwedReward,
  reduceDuelFlow,
  shouldAutoReveal,
  type DuelFlowEvent,
  type DuelStep,
} from "./duelFlow";
import type { MatchStatus, MatchView } from "./nearTypes";

function makeMatch(
  status: MatchStatus,
  overrides: Partial<MatchView> = {},
): MatchView {
  return {
    id: "1001",
    status,
    players: ["alice.testnet", "bob.testnet"],
    tokens: ["1", "2"],
    revealed: status === "Active" || status === "Finished" ? [true, true] : [false, false],
    game: {
      round: 1,
      score: [0, 0],
      hp: [4, 4],
      max_hp: 4,
      heal_cut: [false, false],
      items: [[], []],
      load: {
        announced_live: 3,
        announced_blank: 5,
        remaining: 8,
        live_left: 3,
        blank_left: 5,
        fixed: [],
      },
      turn: 0,
      shackled: null,
      shackle_broke_this_turn: false,
      saw_active: false,
      deck_counts: [],
    },
    reveal_deadline_ms: 0,
    deadline_ms: 0,
    winner: status === "Finished" ? 0 : null,
    seq: 1,
    log: [],
    ...overrides,
  };
}

test("F3-18 duelFlow: happy path table connect -> key -> character -> queue -> join -> reveal -> play -> result", () => {
  const steps: Array<{ event: DuelFlowEvent; expectedStep: DuelStep }> = [
    { event: { type: "WALLET_CHANGED", accountId: "alice.testnet" }, expectedStep: "key" },
    { event: { type: "KEY_READY", ready: true }, expectedStep: "character" },
    { event: { type: "CHARACTER_SELECTED", tokenId: "1" }, expectedStep: "queue" },
    {
      event: { type: "QUEUE_PAIRED", matchId: "1001", opponent: "bob.testnet" },
      expectedStep: "join",
    },
    {
      event: { type: "JOIN_SUBMITTED", matchId: "1001", opponent: "bob.testnet" },
      expectedStep: "reveal",
    },
    {
      event: {
        type: "SYNC_MATCH",
        match: makeMatch("Revealing", { revealed: [false, false] }),
      },
      expectedStep: "reveal",
    },
    { event: { type: "REVEAL_SUBMITTED" }, expectedStep: "reveal" },
    {
      event: { type: "SYNC_MATCH", match: makeMatch("Active") },
      expectedStep: "play",
    },
    {
      event: { type: "SYNC_MATCH", match: makeMatch("Finished", { winner: 0 }) },
      expectedStep: "result",
    },
  ];

  let state = createInitialDuelFlow();
  assert.equal(state.step, "connect");

  for (const row of steps) {
    state = reduceDuelFlow(state, row.event);
    assert.equal(state.step, row.expectedStep);
  }

  assert.equal(state.winner, 0);
  assert.equal(state.you, 0);
  assert.equal(state.opponent, "bob.testnet");
});

test("F3-18 duelFlow: auto-reveal fires only when status is Revealing and you has not revealed", () => {
  let state = createInitialDuelFlow("alice.testnet");
  state = reduceDuelFlow(state, { type: "KEY_READY", ready: true });
  state = reduceDuelFlow(state, { type: "CHARACTER_SELECTED", tokenId: "1" });
  state = reduceDuelFlow(state, {
    type: "QUEUE_PAIRED",
    matchId: "1001",
    opponent: "bob.testnet",
  });
  state = reduceDuelFlow(state, {
    type: "JOIN_SUBMITTED",
    matchId: "1001",
    opponent: "bob.testnet",
  });

  // Before SYNC_MATCH confirms both players joined (Revealing), must not auto-reveal
  assert.equal(shouldAutoReveal(state), false);

  state = reduceDuelFlow(state, {
    type: "SYNC_MATCH",
    match: makeMatch("Revealing", { revealed: [false, true] }),
  });
  assert.equal(shouldAutoReveal(state), true);

  state = reduceDuelFlow(state, { type: "REVEAL_SUBMITTED" });
  assert.equal(shouldAutoReveal(state), false);
});

test("F3-18 duelFlow: ?match= reconnect resumes directly to on-chain phase", () => {
  const cases: Array<{ status: MatchStatus; expected: DuelStep }> = [
    { status: "Pending", expected: "join" },
    { status: "Revealing", expected: "reveal" },
    { status: "Active", expected: "play" },
    { status: "Finished", expected: "result" },
    { status: "Cancelled", expected: "result" },
  ];

  for (const c of cases) {
    let state = createInitialDuelFlow(null, "1001");
    assert.equal(state.pendingMatchId, "1001");

    state = reduceDuelFlow(state, {
      type: "WALLET_CHANGED",
      accountId: "bob.testnet",
    });
    state = reduceDuelFlow(state, { type: "KEY_READY", ready: true });
    assert.equal(state.step, "character");

    state = reduceDuelFlow(state, {
      type: "RECONNECT_MATCH",
      matchId: "1001",
      match: makeMatch(c.status),
    });
    assert.equal(state.step, c.expected);
    assert.equal(state.you, 1);
    assert.equal(state.opponent, "alice.testnet");
  }
});

test("F3-18 duelFlow: owed > 0 surfaces claimSuggested and clears on REWARD_CLAIMED", () => {
  assert.equal(hasOwedReward("0"), false);
  assert.equal(hasOwedReward("1500000000000000000000000"), true);

  let state = createInitialDuelFlow();
  state = reduceDuelFlow(state, {
    type: "WALLET_CHANGED",
    accountId: "alice.testnet",
    owedYocto: "1500000000000000000000000",
  });
  assert.equal(state.claimSuggested, true);

  state = reduceDuelFlow(state, { type: "REWARD_CLAIMED" });
  assert.equal(state.claimSuggested, false);
  assert.equal(state.owedYocto, "0");

  state = reduceDuelFlow(state, {
    type: "PLAYER_UPDATED",
    owedYocto: "200",
  });
  assert.equal(state.claimSuggested, true);
});

test("F3-18 duelFlow: error branches, retry recovery, cancel, and reset", () => {
  let state = createInitialDuelFlow("alice.testnet");
  state = reduceDuelFlow(state, { type: "KEY_READY", ready: true });
  state = reduceDuelFlow(state, { type: "CHARACTER_SELECTED", tokenId: "1" });
  state = reduceDuelFlow(state, {
    type: "ERROR",
    message: "RPC timeout",
  });
  assert.equal(state.step, "error");
  assert.equal(state.error?.recoverableStep, "queue");

  state = reduceDuelFlow(state, { type: "RETRY" });
  assert.equal(state.step, "queue");
  assert.equal(state.error, null);

  state = reduceDuelFlow(state, {
    type: "QUEUE_PAIRED",
    matchId: "88",
    opponent: "bob.testnet",
  });
  state = reduceDuelFlow(state, { type: "MATCH_CANCELLED" });
  assert.equal(state.step, "result");
  assert.equal(state.cancelled, true);

  state = reduceDuelFlow(state, { type: "RESET" });
  assert.equal(state.step, "queue");
  assert.equal(state.matchId, null);

  // Disconnecting returns to connect while preserving URL matchId if pending
  state = reduceDuelFlow(state, { type: "WALLET_CHANGED", accountId: null });
  assert.equal(state.step, "connect");
});
