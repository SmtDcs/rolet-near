import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import type { Action, MatchView } from "../nearTypes";
import { chooseBotIntent } from "./bot";
import { DEFAULT_GAME_CONFIG } from "./config";
import { applyAction, fromSnapshot, type GameModel } from "./model";
import { PracticeEngine } from "./practiceEngine";
import { createMatchState, fire, playItem } from "./rules";
import { SeededSource } from "./shellSource";

class FakeClock {
  nowMs = 0;
  private nextId = 1;
  private tasks = new Map<number, { at: number; fn: () => void }>();

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

test("F3-9 bot: 200-seed bot-vs-bot simulation finishes with MatchEnded in <= 300 moves", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const src = new SeededSource(seed * 1009 + 3);
    const created = createMatchState(DEFAULT_GAME_CONFIG, (seed % 2) as 0 | 1, src);
    const state = created.state;

    const initialView: MatchView = {
      id: `bvb-${seed}`,
      status: "Active",
      players: ["bot0", "bot1"],
      tokens: ["t0", "t1"],
      revealed: [true, true],
      game: state,
      reveal_deadline_ms: 0,
      deadline_ms: 0,
      winner: null,
      seq: created.actions.length,
      log: [],
    };
    const models: [GameModel, GameModel] = [
      fromSnapshot(initialView, 0),
      fromSnapshot(initialView, 1),
    ];

    let moves = 0;
    let sawMatchEnded = false;
    while (state.score[0] < 2 && state.score[1] < 2 && moves < 300) {
      moves++;
      const actor = state.turn;
      const intent = chooseBotIntent(models[actor], actor, moves);
      const actions =
        intent.kind === "fire"
          ? fire(state, DEFAULT_GAME_CONFIG, actor, intent.target, src)
          : playItem(state, DEFAULT_GAME_CONFIG, actor, intent.slot, intent.stealSlot ?? null, src);

      for (const a of actions) {
        if (a.kind === "MatchEnded") {
          sawMatchEnded = true;
        }
        models[0] = applyAction(models[0], a, 0, DEFAULT_GAME_CONFIG);
        models[1] = applyAction(models[1], a, 1, DEFAULT_GAME_CONFIG);
      }
    }

    assert.equal(sawMatchEnded, true, `seed=${seed} failed to reach MatchEnded (moves=${moves})`);
    assert.ok(moves <= 300, `seed=${seed} took ${moves} moves`);
  }
});

test("F3-9 practiceEngine: bot receives only redacted view (cannot read player's Private Loupe result)", async () => {
  // Locate a deterministic seed where player 0 receives Loupe in round 1
  let loupeSeed = 1;
  while (loupeSeed <= 100) {
    const probe = new PracticeEngine({ seed: loupeSeed, you: 0, firstTurn: 0 });
    const hasLoupe = probe.snapshot().game.items[0].includes("Loupe");
    probe.dispose();
    if (hasLoupe) break;
    loupeSeed++;
  }
  assert.ok(loupeSeed <= 100, "expected to find a seed with Loupe in opening hand");

  const clock = new FakeClock();
  let firstBotKnownSize: number | null = null;
  const engine = new PracticeEngine({
    seed: loupeSeed,
    you: 0,
    firstTurn: 0,
    clock,
    latencyMs: 50,
    botChooser: (botModel, botSeat, seq) => {
      if (firstBotKnownSize === null) {
        firstBotKnownSize = botModel.knownShells.size;
      }
      return chooseBotIntent(botModel, botSeat, seq);
    },
  });

  const snap = engine.snapshot();
  assert.ok(snap.game.load.fixed.every((s) => s === null));

  const loupeIdx = snap.game.items[0].indexOf("Loupe");
  assert.ok(loupeIdx >= 0);

  const pLoupe = engine.submitIntent({ id: "p-loupe", kind: "item", slot: loupeIdx });
  await clock.advance(50);
  const loupeActions = await pLoupe;
  assert.equal(loupeActions[0].kind, "ItemUsed");
  if (loupeActions[0].kind === "ItemUsed") {
    assert.equal(loupeActions[0].result.kind, "Private");
  }

  // Player knows pos 0 after Loupe; then player shoots Opponent to pass turn to bot
  assert.notEqual(engine.snapshot().game.load.fixed[0], null);
  const pFire = engine.submitIntent({ id: "p-fire", kind: "fire", target: "Opponent" });
  await clock.advance(200);
  await pFire;

  // Bot must not have inherited any Private shell knowledge from player 0
  assert.equal(firstBotKnownSize, 0);
  engine.dispose();
});

test("F3-9 practiceEngine: same seed yields identical action sequence", async () => {
  async function playFullMatch(seed: string): Promise<Action[]> {
    const clock = new FakeClock();
    const engine = new PracticeEngine({
      seed,
      you: 0,
      firstTurn: 0,
      clock,
      latencyMs: [300, 1500],
    });
    const trace: Action[] = [];
    let clientModel = fromSnapshot(engine.snapshot(), 0);
    engine.onActions((actions) => {
      trace.push(...actions);
      for (const a of actions) {
        clientModel = applyAction(clientModel, a, 0, DEFAULT_GAME_CONFIG);
      }
    });

    let seq = 0;
    while (clientModel.phase !== "finished" && seq < 300) {
      seq++;
      if (clientModel.turn === 0) {
        const intent = chooseBotIntent(clientModel, 0, seq);
        const pending = engine.submitIntent(intent);
        await clock.advance(1600);
        await pending;
      } else {
        await clock.advance(1600);
      }
    }
    assert.equal(clientModel.phase, "finished");
    engine.dispose();
    return trace;
  }

  const runA = await playFullMatch("deterministic-seed-99");
  const runB = await playFullMatch("deterministic-seed-99");
  assert.deepEqual(runA, runB);
  assert.ok(runA.some((a) => a.kind === "MatchEnded"));
});

test("F3-9 practiceEngine: invalid intent fails tx without mutating state", async () => {
  const clock = new FakeClock();
  const engine = new PracticeEngine({
    seed: 7,
    you: 0,
    firstTurn: 0,
    clock,
    latencyMs: 250,
  });
  const before = engine.snapshot();

  const pInvalidSlot = engine.submitIntent({ id: "bad-slot", kind: "item", slot: 9 });
  const pRejected = assert.rejects(pInvalidSlot, /tx failed/);
  await clock.advance(250);
  await pRejected;

  const afterInvalidSlot = engine.snapshot();
  assert.deepEqual(afterInvalidSlot.game, before.game);
  assert.equal(afterInvalidSlot.seq, before.seq);

  // Also test out-of-turn rejection cleanly
  const clockTurn1 = new FakeClock();
  const wrongTurnEngine = new PracticeEngine({
    seed: 7,
    you: 0,
    firstTurn: 1,
    clock: clockTurn1,
    latencyMs: 100,
  });
  const pWrongTurn = wrongTurnEngine.submitIntent({
    id: "wrong-turn",
    kind: "fire",
    target: "Opponent",
  });
  const pWrongRejected = assert.rejects(pWrongTurn, /tx failed:.*NotYourTurn/);
  await clockTurn1.advance(100);
  await pWrongRejected;

  engine.dispose();
  wrongTurnEngine.dispose();
});

test("F3-9 audit: bot.ts and practiceEngine.ts contain no console.*", () => {
  const dir = resolve(process.cwd(), "lib/game");
  for (const name of ["bot.ts", "practiceEngine.ts"]) {
    const src = readFileSync(resolve(dir, name), "utf8");
    assert.equal(src.includes("console."), false, `${name} must not call console.*`);
  }
});
