import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import type { Action, MatchView, Shell } from "../nearTypes";
import { mergeActionsPage } from "./actionSync";
import { DEFAULT_GAME_CONFIG } from "./config";
import { applyAction, fromSnapshot, type GameModel } from "./model";
import { redactAction, redactSnapshot } from "./privacy";
import { createMatchState, fire, playItem } from "./rules";
import { SeededSource } from "./shellSource";

function makeBaseView(fixed: Shell[], remaining: number): MatchView {
  return {
    id: "m-1",
    status: "Active",
    players: ["alice.testnet", "bob.testnet"],
    tokens: ["t0", "t1"],
    revealed: [true, true],
    game: {
      round: 1,
      score: [0, 0],
      hp: [4, 4],
      max_hp: 4,
      heal_cut: [false, false],
      items: [["Loupe", "Flask"], ["Pipe"]],
      load: {
        announced_live: 2,
        announced_blank: 2,
        live_left: 1,
        blank_left: 1,
        remaining,
        fixed,
      },
      turn: 0,
      saw_active: false,
      shackled: null,
      shackle_broke_this_turn: false,
      deck_counts: [4, 4, 4, 4, 4, 4, 4, 4, 4],
    },
    reveal_deadline_ms: 0,
    deadline_ms: 10_000,
    winner: null,
    seq: 4,
    log: [
      { kind: "LoadStarted", live: 2, blank: 2, total: 4 },
      {
        kind: "ItemUsed",
        player: 1,
        item: "Loupe",
        slot: 0,
        result: { kind: "Private", pos: 0, shell: "Live" },
      },
      {
        kind: "ItemUsed",
        player: 0,
        item: "Ticker",
        slot: 0,
        result: { kind: "Private", pos: 1, shell: "Blank" },
      },
    ],
  };
}

test("F3-4 privacy: redactAction strips opponent Private and keeps self Private", () => {
  const oppLoupe: Action = {
    kind: "ItemUsed",
    player: 1,
    item: "Loupe",
    slot: 0,
    result: { kind: "Private", pos: 0, shell: "Live" },
  };
  const selfLoupe: Action = {
    kind: "ItemUsed",
    player: 0,
    item: "Loupe",
    slot: 0,
    result: { kind: "Private", pos: 0, shell: "Blank" },
  };

  assert.deepEqual(redactAction(oppLoupe, 0), {
    kind: "ItemUsed",
    player: 1,
    item: "Loupe",
    slot: 0,
    result: { kind: "None" },
  });
  assert.deepEqual(redactAction(selfLoupe, 0), selfLoupe);

  const shot: Action = {
    kind: "Shot",
    player: 1,
    target: "Opponent",
    shell: "Live",
    damage: 1,
  };
  assert.deepEqual(redactAction(shot, 0), shot);
});

test("F3-4 privacy: redactSnapshot masks unfired shells except ownPrivate without mutating input", () => {
  const rawFixed: Shell[] = ["Live", "Blank", "Live", "Blank"];
  const view = makeBaseView([...rawFixed], 2);
  const ownPrivate = new Map<number, Shell>([[1, "Blank"]]);

  const safe = redactSnapshot(view, 0, ownPrivate);

  assert.deepEqual(safe.game.load.fixed, ["Live", "Blank", null, "Blank"]);
  assert.deepEqual(view.game.load.fixed, rawFixed);

  assert.equal(safe.log[1].kind, "ItemUsed");
  if (safe.log[1].kind === "ItemUsed") {
    assert.deepEqual(safe.log[1].result, { kind: "None" });
  }
  if (safe.log[2].kind === "ItemUsed") {
    assert.deepEqual(safe.log[2].result, { kind: "Private", pos: 1, shell: "Blank" });
  }
  if (view.log[1].kind === "ItemUsed") {
    assert.deepEqual(view.log[1].result, { kind: "Private", pos: 0, shell: "Live" });
  }
});

test("F3-4 model: Magnet clears knownShells and Ejected/Shot shifts positions", () => {
  const view = makeBaseView(["Live", "Blank", "Live", "Blank"], 4);
  let m = fromSnapshot(view, 0, new Map<number, Shell>([[0, "Live"], [2, "Live"]]));
  assert.equal(m.knownShells.get(0), "Live");
  assert.equal(m.knownShells.get(2), "Live");

  m = applyAction(m, { kind: "Ejected", shell: "Live" }, 0);
  assert.equal(m.knownShells.get(0), undefined);
  assert.equal(m.knownShells.get(1), "Live");

  m = applyAction(
    m,
    { kind: "ItemUsed", player: 1, item: "Magnet", slot: 0, result: { kind: "None" } },
    0,
  );
  assert.equal(m.knownShells.size, 0);
  assert.equal(m.magnetDirty, true);
});

test("F3-4 actionSync: mergeActionsPage handles advance, gap resync, and overlaps", () => {
  const step1 = mergeActionsPage(4, {
    first_seq: 5,
    actions: [{ kind: "Ejected", shell: "Blank" }],
  });
  assert.equal(step1.resync, false);
  assert.equal(step1.nextSeq, 5);
  assert.equal(step1.apply.length, 1);

  const gap = mergeActionsPage(5, {
    first_seq: 8,
    actions: [{ kind: "Ejected", shell: "Live" }],
  });
  assert.equal(gap.resync, true);
  assert.equal(gap.apply.length, 0);
  assert.equal(gap.nextSeq, 5);

  const overlap = mergeActionsPage(
    7,
    {
      first_seq: 4,
      actions: [
        { kind: "Ejected", shell: "Live" },
        { kind: "TurnSkipped", player: 0 },
        { kind: "HealCut", player: 1 },
        { kind: "Ejected", shell: "Blank" },
        { kind: "Shot", player: 1, target: "Opponent", shell: "Live", damage: 1 },
      ],
    },
    4,
  );
  assert.equal(overlap.resync, false);
  assert.equal(overlap.nextSeq, 9);
  assert.equal(overlap.apply.length, 2);
  assert.equal(overlap.apply[0].kind, "Ejected");
  assert.equal(overlap.apply[1].kind, "Shot");

  const dup = mergeActionsPage(
    9,
    {
      first_seq: 8,
      actions: [
        { kind: "Ejected", shell: "Blank" },
        { kind: "Shot", player: 1, target: "Opponent", shell: "Live", damage: 1 },
      ],
    },
    7,
  );
  assert.equal(dup.resync, false);
  assert.equal(dup.apply.length, 0);
  assert.equal(dup.nextSeq, 9);
});

test("F3-4 privacy audit: privacy.ts and model.ts contain no console.*", () => {
  const dir = resolve(process.cwd(), "lib/game");
  for (const name of ["privacy.ts", "model.ts"]) {
    const src = readFileSync(resolve(dir, name), "utf8");
    assert.equal(src.includes("console."), false, `${name} must not call console.*`);
  }
});

function assertModelMatchesState(
  model: GameModel,
  state: ReturnType<typeof createMatchState>["state"],
  seed: number,
  step: number,
): void {
  assert.equal(model.round, state.round, `seed=${seed} step=${step} round`);
  assert.deepEqual(model.score, state.score, `seed=${seed} step=${step} score`);
  assert.deepEqual(model.hp, state.hp, `seed=${seed} step=${step} hp`);
  assert.equal(model.maxHp, state.max_hp, `seed=${seed} step=${step} maxHp`);
  assert.deepEqual(model.healCut, state.heal_cut, `seed=${seed} step=${step} healCut`);
  assert.deepEqual(model.items, state.items, `seed=${seed} step=${step} items`);
  assert.equal(model.announcedLive, state.load.announced_live, `seed=${seed} step=${step} announcedLive`);
  assert.equal(model.announcedBlank, state.load.announced_blank, `seed=${seed} step=${step} announcedBlank`);
  assert.equal(model.remaining, state.load.remaining, `seed=${seed} step=${step} remaining`);
  assert.equal(model.turn, state.turn, `seed=${seed} step=${step} turn`);
  assert.equal(model.saw, state.saw_active, `seed=${seed} step=${step} saw`);
  assert.equal(model.shackled, state.shackled, `seed=${seed} step=${step} shackled`);
  assert.equal(
    model.shackleBrokeThisTurn,
    state.shackle_broke_this_turn,
    `seed=${seed} step=${step} shackleBrokeThisTurn`,
  );
  if (!model.magnetDirty) {
    assert.equal(model.leftLive, state.load.live_left, `seed=${seed} step=${step} leftLive`);
    assert.equal(model.leftBlank, state.load.blank_left, `seed=${seed} step=${step} leftBlank`);
  }
  const expectedWinner = state.score[0] >= 2 ? 0 : state.score[1] >= 2 ? 1 : null;
  assert.equal(model.winner, expectedWinner, `seed=${seed} step=${step} winner`);
}

test("F3-4 parity: 100-seed rules.ts simulation matches GameModel after every action", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const src = new SeededSource(seed * 7919 + 17);
    const created = createMatchState(DEFAULT_GAME_CONFIG, seed % 2 as 0 | 1, src);
    const state = created.state;

    const initialView: MatchView = {
      id: `sim-${seed}`,
      status: "Active",
      players: ["p0", "p1"],
      tokens: ["t0", "t1"],
      revealed: [true, true],
      game: {
        ...state,
        load: {
          ...state.load,
          fixed: [...state.load.fixed],
        },
        items: [[...state.items[0]], [...state.items[1]]],
        hp: [state.hp[0], state.hp[1]],
        score: [state.score[0], state.score[1]],
        heal_cut: [state.heal_cut[0], state.heal_cut[1]],
      },
      reveal_deadline_ms: 0,
      deadline_ms: 0,
      winner: null,
      seq: created.actions.length,
      log: [],
    };
    let model = fromSnapshot(initialView, 0);

    let step = 0;
    while (state.score[0] < 2 && state.score[1] < 2 && step < 250) {
      step++;
      const actor = state.turn;
      const hand = state.items[actor];

      let emitted: Action[] = [];
      let acted = false;
      if (hand.length > 0 && src.roll(100) < 45) {
        const slot = src.roll(hand.length);
        const stealSlot = state.items[1 - actor].length > 0 ? src.roll(state.items[1 - actor].length) : 0;
        try {
          emitted = playItem(state, DEFAULT_GAME_CONFIG, actor, slot, stealSlot, src);
          acted = true;
        } catch {
          acted = false;
        }
      }
      if (!acted) {
        const target = src.roll(2) === 0 ? "Opponent" : "SelfTarget";
        emitted = fire(state, DEFAULT_GAME_CONFIG, actor, target, src);
      }

      for (const action of emitted) {
        model = applyAction(model, action, 0, DEFAULT_GAME_CONFIG);
      }
      assertModelMatchesState(model, state, seed, step);
    }
    assert.ok(state.score[0] >= 2 || state.score[1] >= 2, `seed=${seed} did not finish within 250 steps`);
    assert.equal(model.phase, "finished");
  }
});
