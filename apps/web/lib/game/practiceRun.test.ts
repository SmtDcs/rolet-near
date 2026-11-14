import assert from "node:assert/strict";
import test from "node:test";

import type { Action } from "../nearTypes";
import { planBeats } from "./beats";
import { chooseBotIntent } from "./bot";
import { Director } from "./director";
import { applyAction, fromSnapshot } from "./model";
import { PracticeEngine, type PracticeClock } from "./practiceEngine";

class FakePracticeClock implements PracticeClock {
  nowMs = 0;
  private nextId = 1;
  private tasks = new Map<unknown, { at: number; fn: () => void }>();

  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.nowMs + Math.max(0, ms), fn });
    return id;
  }

  clearTimeout(id: unknown): void {
    this.tasks.delete(id);
  }

  async flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
  }

  async runNext(): Promise<boolean> {
    if (this.tasks.size === 0) return false;
    let earliestId: unknown = null;
    let earliestAt = Infinity;
    for (const [id, task] of this.tasks.entries()) {
      if (task.at < earliestAt) {
        earliestAt = task.at;
        earliestId = id;
      }
    }
    if (earliestId === null) return false;
    const task = this.tasks.get(earliestId)!;
    this.tasks.delete(earliestId);
    this.nowMs = task.at;
    task.fn();
    await this.flushMicrotasks();
    return true;
  }
}

test("F3-13 practiceRun: full match with PracticeEngine + GameModel + Director emits anim_idle per intent and matches snapshot", async () => {
  const clock = new FakePracticeClock();
  const engine = new PracticeEngine({
    seed: "practice-run-seed-1",
    you: 0,
    firstTurn: 0,
    latencyMs: 300,
    clock,
  });

  let model = fromSnapshot(engine.snapshot(), 0);
  let idleCount = 0;
  let sawMatchEnded = false;
  const executedBeats: string[] = [];

  const director = new Director({
    execute: async (beat) => {
      executedBeats.push(beat.id);
      await new Promise<void>((resolve) => {
        clock.setTimeout(resolve, beat.durationMs);
      });
    },
    onIdle: () => {
      idleCount += 1;
    },
  });

  const processActions = (actions: readonly Action[], localPrep: boolean) => {
    let prepUsed = false;
    for (const action of actions) {
      if (action.kind === "MatchEnded") {
        sawMatchEnded = true;
      }
      const usePrep = localPrep && !prepUsed && action.kind === "Shot";
      if (usePrep) prepUsed = true;
      const beats = planBeats(action, {
        you: 0,
        localPrepPlayed: usePrep,
        model,
      });
      if (beats.length > 0) {
        director.enqueue(beats);
      }
      model = applyAction(model, action, 0);
    }
  };

  engine.onActions((actions) => {
    // Only process bot-initiated actions here; player's own intents are handled on submit resolution below.
    const first = actions[0];
    if (first && "player" in first && first.player === 0) {
      return;
    }
    processActions(actions, false);
  });

  let intentsSubmitted = 0;
  let seq = 0;
  const maxSteps = 400;

  for (let step = 0; step < maxSteps && model.phase !== "finished"; step += 1) {
    if (!director.isBusy && model.turn === 0) {
      const intent = chooseBotIntent(model, 0, ++seq);
      const idlesBefore = idleCount;
      let resolved = false;
      let resolvedActions: Action[] = [];

      void engine.submitIntent(intent).then((actions) => {
        resolved = true;
        resolvedActions = actions;
      });
      intentsSubmitted += 1;

      while (!resolved) {
        const progressed = await clock.runNext();
        assert.ok(progressed, "clock stalled waiting for submitIntent");
      }

      processActions(resolvedActions, intent.kind === "fire");

      while (director.isBusy) {
        const progressed = await clock.runNext();
        assert.ok(progressed, "clock stalled waiting for Director drain");
      }
      assert.ok(
        idleCount > idlesBefore,
        `expected anim_idle after intent #${intentsSubmitted}`,
      );
    } else {
      const progressed = await clock.runNext();
      if (!progressed) {
        break;
      }
    }
  }

  while (director.isBusy) {
    const progressed = await clock.runNext();
    if (!progressed) break;
  }

  assert.ok(intentsSubmitted > 0, "expected at least one player intent");
  assert.equal(sawMatchEnded, true, "expected MatchEnded action");
  assert.equal(model.phase, "finished");
  assert.ok(model.winner === 0 || model.winner === 1);
  assert.ok(executedBeats.includes("match_end"));

  const finalSnap = engine.snapshot();
  const finalFromSnap = fromSnapshot(finalSnap, 0, model.knownShells);
  assert.deepEqual(model.hp, finalFromSnap.hp);
  assert.deepEqual(model.score, finalFromSnap.score);
  assert.equal(model.round, finalFromSnap.round);
  assert.equal(model.winner, finalFromSnap.winner);
  assert.equal(model.remaining, finalFromSnap.remaining);
  assert.deepEqual(model.items, finalFromSnap.items);

  director.dispose();
  engine.dispose();
});
