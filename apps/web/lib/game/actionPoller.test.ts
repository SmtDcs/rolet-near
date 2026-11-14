import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { Action, ActionsPage, MatchView } from "../nearTypes";
import { ActionPoller, type PollerClock } from "./actionPoller";

class FakeClock implements PollerClock {
  nowMs = 0;
  private nextId = 1;
  private tasks = new Map<number, { at: number; delay: number; fn: () => void }>();

  setTimeout = (fn: () => void, ms: number): unknown => {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.nowMs + ms, delay: ms, fn });
    return id;
  };

  clearTimeout = (id: unknown): void => {
    this.tasks.delete(Number(id));
  };

  pendingDelays(): number[] {
    return Array.from(this.tasks.values()).map((t) => t.delay);
  }

  async stepNext(): Promise<number | null> {
    if (this.tasks.size === 0) return null;
    let earliestId: number | null = null;
    let earliestAt = Infinity;
    for (const [id, task] of this.tasks) {
      if (task.at < earliestAt) {
        earliestAt = task.at;
        earliestId = id;
      }
    }
    if (earliestId === null) return null;
    const task = this.tasks.get(earliestId)!;
    this.tasks.delete(earliestId);
    this.nowMs = task.at;
    task.fn();
    await new Promise((r) => setImmediate(r));
    return task.delay;
  }
}

function makeShot(player: number): Action {
  return {
    kind: "Shot",
    player,
    target: "Opponent",
    shell: "Blank",
    damage: 0,
  };
}

function makeMatch(seq: number): MatchView {
  return {
    id: "7",
    status: "Active",
    players: ["alice.testnet", "bob.testnet"],
    tokens: ["1", "2"],
    revealed: [true, true],
    game: {
      round: 2,
      score: [1, 0],
      hp: [4, 3],
      max_hp: 4,
      heal_cut: [false, false],
      items: [["Loupe"], []],
      load: {
        announced_live: 2,
        announced_blank: 4,
        remaining: 6,
        live_left: 2,
        blank_left: 4,
        fixed: [],
      },
      turn: 1,
      shackled: null,
      shackle_broke_this_turn: false,
      saw_active: false,
      deck_counts: [],
    },
    reveal_deadline_ms: 0,
    deadline_ms: 999999,
    winner: null,
    seq,
    log: [],
  };
}

test("F3-19 actionPoller: uses 600ms active, 3000ms hidden, and exponential error backoff", async () => {
  const clock = new FakeClock();
  let hidden = false;
  let shouldFail = false;
  const delivered: Action[][] = [];
  let pageToReturn: ActionsPage = { first_seq: 1, actions: [] };

  const poller = new ActionPoller({
    matchId: "7",
    players: ["alice.testnet", "bob.testnet"],
    initialSeq: 0,
    clock,
    isHidden: () => hidden,
    views: {
      async getActions() {
        if (shouldFail) throw new Error("rpc hiccup");
        return pageToReturn;
      },
      async getMatch() {
        return null;
      },
    },
    onActions: (actions) => delivered.push(actions),
  });

  poller.start();
  assert.deepEqual(clock.pendingDelays(), [600]);

  pageToReturn = { first_seq: 1, actions: [makeShot(0)] };
  await clock.stepNext();
  assert.equal(delivered.length, 1);
  assert.equal(poller.getLastSeq(), 1);
  assert.deepEqual(clock.pendingDelays(), [600]);

  // Switch to hidden tab -> next schedule after tick uses 3000ms
  hidden = true;
  pageToReturn = { first_seq: 2, actions: [] };
  await clock.stepNext();
  assert.deepEqual(clock.pendingDelays(), [3000]);

  // Back to active, trigger 3 consecutive failures -> 1200, 2400, 4800
  hidden = false;
  shouldFail = true;
  await clock.stepNext(); // 1st error
  assert.equal(poller.getConsecutiveErrors(), 1);
  assert.deepEqual(clock.pendingDelays(), [1200]);

  await clock.stepNext(); // 2nd error
  assert.equal(poller.getConsecutiveErrors(), 2);
  assert.deepEqual(clock.pendingDelays(), [2400]);

  await clock.stepNext(); // 3rd error
  assert.equal(poller.getConsecutiveErrors(), 3);
  assert.deepEqual(clock.pendingDelays(), [4800]);

  // Recovery resets delay back to 600ms
  shouldFail = false;
  await clock.stepNext();
  assert.equal(poller.getConsecutiveErrors(), 0);
  assert.deepEqual(clock.pendingDelays(), [600]);

  poller.stop();
  assert.deepEqual(clock.pendingDelays(), []);
});

test("F3-19 actionPoller: gap triggers getMatch resync", async () => {
  const clock = new FakeClock();
  const resynced: MatchView[] = [];
  let getMatchCalls = 0;

  const poller = new ActionPoller({
    matchId: "7",
    players: ["alice.testnet", "bob.testnet"],
    initialSeq: 2,
    clock,
    views: {
      async getActions() {
        // Missed seq 3..4 (first_seq 5 > lastSeq 2 + 1)
        return { first_seq: 5, actions: [makeShot(1)] };
      },
      async getMatch() {
        getMatchCalls += 1;
        return makeMatch(40);
      },
    },
    onActions: () => {
      throw new Error("should not emit partial actions on gap");
    },
    onResync: (m) => resynced.push(m),
  });

  poller.start();
  await clock.stepNext();

  assert.equal(getMatchCalls, 1);
  assert.equal(resynced.length, 1);
  assert.equal(poller.getLastSeq(), 40);
  poller.stop();
});

test("F3-19 privacy audit: actionPoller.ts and nearTransport.ts contain no console.*", () => {
  for (const rel of ["./actionPoller.ts", "./nearTransport.ts"]) {
    const src = readFileSync(resolve(__dirname, rel), "utf8");
    assert.equal(/\bconsole\./.test(src), false, `${rel} must not use console.*`);
  }
});
