import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import type { Action, MatchView } from "../nearTypes";
import type { Beat } from "./beats";
import { canAct, IntentFlow } from "./intentFlow";
import { fromSnapshot } from "./model";

class FakeClock {
  nowMs = 0;
  private nextId = 1;
  private tasks = new Map<number, { at: number; fn: () => void }>();

  now = (): number => this.nowMs;

  setTimeout = (fn: () => void, ms: number): number => {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.nowMs + ms, fn });
    return id;
  };

  clearTimeout = (id: unknown): void => {
    if (typeof id === "number") {
      this.tasks.delete(id);
    }
  };

  async advance(ms: number): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    const target = this.nowMs + ms;
    while (true) {
      let earliestId: number | null = null;
      let earliestAt = Infinity;
      for (const [id, task] of this.tasks.entries()) {
        if (task.at <= target && task.at < earliestAt) {
          earliestAt = task.at;
          earliestId = id;
        }
      }
      if (earliestId === null) {
        break;
      }
      const task = this.tasks.get(earliestId)!;
      this.tasks.delete(earliestId);
      this.nowMs = task.at;
      task.fn();
      await Promise.resolve();
      await Promise.resolve();
    }
    this.nowMs = target;
  }
}

function makeActiveView(turn: 0 | 1): MatchView {
  return {
    id: "if-1",
    status: "Active",
    players: ["p0", "p1"],
    tokens: ["t0", "t1"],
    revealed: [true, true],
    game: {
      round: 1,
      score: [0, 0],
      hp: [4, 4],
      max_hp: 4,
      heal_cut: [false, false],
      items: [["Loupe"], []],
      load: {
        announced_live: 2,
        announced_blank: 2,
        live_left: 2,
        blank_left: 2,
        remaining: 4,
        fixed: ["Live", "Blank", "Live", "Blank"],
      },
      turn,
      saw_active: false,
      shackled: null,
      shackle_broke_this_turn: false,
      deck_counts: [4, 4, 4, 4, 4, 4, 4, 4, 4],
    },
    reveal_deadline_ms: 0,
    deadline_ms: 0,
    winner: null,
    seq: 1,
    log: [],
  };
}

test("F3-7 intentFlow: fast 200ms response still holds >= 700ms and rejects concurrent intent", async () => {
  const clock = new FakeClock();
  const beats: Beat[] = [];
  const resolved: number[] = [];

  const flow = new IntentFlow({
    clock,
    submit: () =>
      new Promise<Action[]>((resolve) => {
        clock.setTimeout(() => {
          resolve([{ kind: "Shot", player: 0, target: "Opponent", shell: "Blank", damage: 0 }]);
        }, 200);
      }),
    emitBeat: (b) => beats.push(b),
    onResolved: () => resolved.push(clock.nowMs),
  });

  const first = flow.startIntent({ id: "i1", kind: "fire", target: "Opponent" });
  assert.equal(first.accepted, true);
  assert.deepEqual(
    beats.map((b) => b.id),
    ["gun_pickup", "aim_opp", "tension_hold"],
  );

  await clock.advance(200);
  assert.equal(flow.state.phase, "holding");
  assert.equal(resolved.length, 0);

  const second = flow.startIntent({ id: "i2", kind: "fire", target: "SelfTarget" });
  assert.equal(second.accepted, false);
  assert.equal(second.reason, "busy");

  await clock.advance(499);
  assert.equal(resolved.length, 0);

  await clock.advance(1);
  assert.equal(flow.state.phase, "resolved");
  assert.deepEqual(resolved, [700]);
});

test("F3-7 intentFlow: emits 4s filler beat, times out at 20s with rollback, ignores late resolution", async () => {
  const clock = new FakeClock();
  const beats: Beat[] = [];
  const failed: Array<{ at: number; reason: string }> = [];
  const resolved: number[] = [];
  let resolveLate: ((actions: Action[]) => void) | undefined;

  const flow = new IntentFlow({
    clock,
    submit: () =>
      new Promise<Action[]>((resolve) => {
        resolveLate = resolve;
      }),
    emitBeat: (b) => beats.push(b),
    onResolved: () => resolved.push(clock.nowMs),
    onFailed: (_intent, reason) => failed.push({ at: clock.nowMs, reason }),
  });

  flow.startIntent({ id: "i-slow", kind: "fire", target: "SelfTarget" });
  await clock.advance(3999);
  assert.equal(beats.some((b) => b.id === "tension_stall"), false);

  await clock.advance(1);
  const stall = beats.find((b) => b.id === "tension_stall");
  assert.ok(stall);
  assert.equal(stall.params?.caption, "mechanism jammed");
  assert.equal(failed.length, 0);

  await clock.advance(15999);
  assert.equal(failed.length, 0);

  await clock.advance(1);
  assert.equal(flow.state.phase, "failed");
  assert.deepEqual(failed, [{ at: 20_000, reason: "timeout" }]);
  assert.equal(beats[beats.length - 1]?.id, "rollback_gun");

  if (resolveLate) {
    resolveLate([{ kind: "Ejected", shell: "Blank" }]);
  }
  await Promise.resolve();
  assert.equal(resolved.length, 0);
  assert.equal(flow.state.phase, "failed");
});

test("F3-7 intentFlow: submit error rolls back and allows immediate retry", async () => {
  const clock = new FakeClock();
  const beats: Beat[] = [];
  const failed: string[] = [];
  let attempt = 0;

  const flow = new IntentFlow({
    clock,
    submit: () => {
      attempt += 1;
      if (attempt === 1) {
        return Promise.reject(new Error("rpc rejected"));
      }
      return Promise.resolve([{ kind: "ItemUsed", player: 0, item: "Loupe", slot: 0, result: { kind: "Private", pos: 0, shell: "Live" } }]);
    },
    emitBeat: (b) => beats.push(b),
    onFailed: (_intent, reason) => failed.push(reason),
  });

  flow.startIntent({ id: "i-err", kind: "item", slot: 0 });
  await clock.advance(10);
  assert.equal(flow.state.phase, "failed");
  assert.deepEqual(failed, ["rpc rejected"]);
  assert.equal(beats[beats.length - 1]?.id, "rollback_item");

  const retry = flow.startIntent({ id: "i-retry", kind: "item", slot: 0 });
  assert.equal(retry.accepted, true);
  await clock.advance(700);
  assert.equal(flow.state.phase, "resolved");
});

test("F3-7 canAct: enforces active phase, local turn, idle director, and idle intentFlow", () => {
  const myTurnModel = fromSnapshot(makeActiveView(0), 0);
  const oppTurnModel = fromSnapshot(makeActiveView(1), 0);
  const finishedView = makeActiveView(0);
  finishedView.status = "Finished";
  const finishedModel = fromSnapshot(finishedView, 0);

  assert.equal(canAct(myTurnModel, 0, false, "idle"), true);
  assert.equal(canAct(oppTurnModel, 0, false, "idle"), false);
  assert.equal(canAct(myTurnModel, 0, true, "idle"), false);
  assert.equal(canAct(myTurnModel, 0, false, "preparing"), false);
  assert.equal(canAct(myTurnModel, 0, false, "sent"), false);
  assert.equal(canAct(myTurnModel, 0, false, "holding"), false);
  assert.equal(canAct(myTurnModel, 0, false, "failed"), true);
  assert.equal(canAct(finishedModel, 0, false, "idle"), false);
});

test("F3-7 audit: intentFlow.ts contains no console.*", () => {
  const src = readFileSync(resolve(process.cwd(), "lib/game/intentFlow.ts"), "utf8");
  assert.equal(src.includes("console."), false);
});
