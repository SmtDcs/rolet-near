import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { GameStateView } from "../nearTypes";
import {
  ALL_ITEMS,
  DEFAULT_GAME_CONFIG,
  deckRemaining,
  newDeck,
  type GameConfig,
} from "./config";
import {
  GameRuleError,
  createEmptyLoad,
  dealItems,
  fire,
  loadAdvance,
  loadCurrent,
  newLoad,
} from "./rules";
import { ScriptedSource, SeededSource } from "./shellSource";

function stateForRound(
  round: number,
  load = createEmptyLoad(1, 1),
  cfg: GameConfig = DEFAULT_GAME_CONFIG,
): GameStateView {
  const rc = cfg.rounds[round - 1];
  return {
    round,
    score: [0, 0],
    hp: [rc.start_hp, rc.start_hp],
    max_hp: rc.start_hp,
    heal_cut: [false, false],
    items: [[], []],
    load,
    turn: 0,
    shackled: null,
    shackle_broke_this_turn: false,
    saw_active: false,
    deck_counts: newDeck(cfg.copies_per_item),
  };
}

test("DEFAULT_GAME_CONFIG equals contracts/rolet-near/init-config.json", () => {
  const path = resolve(__dirname, "../../../../contracts/rolet-near/init-config.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as GameConfig;
  assert.deepEqual(DEFAULT_GAME_CONFIG, raw);
});

test("T-103: newLoad and dealItems bounds hold across 10,000 seeds", () => {
  const cfg = DEFAULT_GAME_CONFIG;
  const seenLive = new Array<boolean>(cfg.load_size + 1).fill(false);

  for (let seed = 1; seed <= 10_000; seed++) {
    const src = new SeededSource(seed);
    for (const round of [1, 2, 3]) {
      const load = newLoad(cfg, src);
      assert.equal(load.remaining, cfg.load_size);
      assert.ok(
        load.announced_live >= cfg.min_live && load.announced_live <= cfg.max_live,
        `seed ${seed} round ${round}: live=${load.announced_live}`,
      );
      assert.equal(load.announced_blank, cfg.load_size - load.announced_live);
      assert.equal(load.live_left, load.announced_live);
      assert.equal(load.blank_left, load.announced_blank);
      assert.equal(load.fixed.length, cfg.load_size);
      assert.ok(load.fixed.every((s) => s === null));
      seenLive[load.announced_live] = true;

      const expectedLive = load.announced_live;
      const expectedBlank = load.announced_blank;
      let drawnLive = 0;
      let drawnBlank = 0;
      while (load.remaining > 0) {
        const shell = loadCurrent(load, src);
        loadAdvance(load, shell);
        if (shell === "Live") drawnLive += 1;
        else drawnBlank += 1;
      }
      assert.equal(drawnLive, expectedLive);
      assert.equal(drawnBlank, expectedBlank);

      const st = stateForRound(round, newLoad(cfg, src), cfg);
      const actions = dealItems(st, cfg, src);
      const expected = cfg.rounds[round - 1].items_per_load;
      for (const p of [0, 1]) {
        assert.equal(st.items[p].length, expected);
        assert.ok(st.items[p].every((it) => ALL_ITEMS.includes(it)));
        assert.ok(st.items[p].length <= cfg.max_items);
      }
      assert.equal(deckRemaining(st.deck_counts), 36 - expected * 2);
      assert.equal(actions.length, 2);
    }
  }

  for (let live = cfg.min_live; live <= cfg.max_live; live++) {
    assert.equal(seenLive[live], true, `live=${live} not seen in 10,000 seeds`);
  }
});

test("T-103: dealItems drops extras when slots are full and refills shared deck when empty", () => {
  const cfg = DEFAULT_GAME_CONFIG;
  const src = new SeededSource(42);
  const st = stateForRound(2, createEmptyLoad(2, 2), cfg);
  st.items[0] = ["Pipe", "Pipe", "Pipe", "Pipe"];
  st.items[1] = ["Pipe", "Pipe", "Pipe"];
  const actions = dealItems(st, cfg, src);
  assert.equal(st.items[0].length, 4);
  assert.equal(st.items[1].length, 4);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].kind, "ItemsDealt");
  if (actions[0].kind === "ItemsDealt") {
    assert.equal(actions[0].player, 1);
    assert.equal(actions[0].items.length, 1);
  }
  assert.equal(deckRemaining(st.deck_counts), 35);

  // Exhaust remaining 35 cards and verify refill on next deal.
  const stDeck = stateForRound(1, createEmptyLoad(4, 4), cfg);
  const counts = new Array<number>(9).fill(0);
  for (let step = 0; step < 4; step++) {
    dealItems(stDeck, cfg, src);
    for (const p of [0, 1]) {
      for (const it of stDeck.items[p].splice(0)) {
        counts[ALL_ITEMS.indexOf(it)] += 1;
      }
    }
  }
  stDeck.items[1] = ["Pipe", "Pipe", "Pipe", "Pipe"];
  dealItems(stDeck, cfg, src);
  for (const it of stDeck.items[0].splice(0)) {
    counts[ALL_ITEMS.indexOf(it)] += 1;
  }
  assert.deepEqual(counts, new Array(9).fill(4));
  assert.equal(deckRemaining(stDeck.deck_counts), 0);

  stDeck.items = [[], []];
  dealItems(stDeck, cfg, src);
  assert.equal(stDeck.items[0].length, 4);
  assert.equal(stDeck.items[1].length, 4);
  assert.equal(deckRemaining(stDeck.deck_counts), 28);
});

test("T-104: blank self-shot keeps turn; live self-shot and opponent shots pass turn", () => {
  const cfg = DEFAULT_GAME_CONFIG;

  const srcBlankSelf = new ScriptedSource(["Blank"]);
  const st1 = stateForRound(1, createEmptyLoad(1, 1), cfg);
  const a1 = fire(st1, cfg, 0, "SelfTarget", srcBlankSelf);
  assert.deepEqual(a1, [
    { kind: "Shot", player: 0, target: "SelfTarget", shell: "Blank", damage: 0 },
    { kind: "Ejected", shell: "Blank" },
  ]);
  assert.equal(st1.turn, 0);
  assert.deepEqual(st1.hp, [4, 4]);
  assert.equal(st1.load.remaining, 1);

  const srcLiveSelf = new ScriptedSource(["Live"]);
  const st2 = stateForRound(1, createEmptyLoad(1, 1), cfg);
  fire(st2, cfg, 0, "SelfTarget", srcLiveSelf);
  assert.deepEqual(st2.hp, [3, 4]);
  assert.equal(st2.turn, 1);

  const srcBlankOpp = new ScriptedSource(["Blank"]);
  const st3 = stateForRound(1, createEmptyLoad(1, 1), cfg);
  fire(st3, cfg, 0, "Opponent", srcBlankOpp);
  assert.deepEqual(st3.hp, [4, 4]);
  assert.equal(st3.turn, 1);

  const srcLiveOpp = new ScriptedSource(["Live"]);
  const st4 = stateForRound(1, createEmptyLoad(1, 1), cfg);
  const a4 = fire(st4, cfg, 0, "Opponent", srcLiveOpp);
  assert.deepEqual(st4.hp, [4, 3]);
  assert.equal(st4.turn, 1);
  assert.deepEqual(a4[0], {
    kind: "Shot",
    player: 0,
    target: "Opponent",
    shell: "Live",
    damage: 1,
  });
});

test("T-104: sawed live deals 2 damage and saw resets on both live and blank", () => {
  const cfg = DEFAULT_GAME_CONFIG;

  const st1 = stateForRound(2, createEmptyLoad(2, 2), cfg);
  st1.saw_active = true;
  const a1 = fire(st1, cfg, 0, "Opponent", new ScriptedSource(["Live"]));
  assert.deepEqual(st1.hp, [4, 2]);
  assert.equal(st1.saw_active, false);
  assert.deepEqual(a1[0], {
    kind: "Shot",
    player: 0,
    target: "Opponent",
    shell: "Live",
    damage: 2,
  });

  const st2 = stateForRound(2, createEmptyLoad(2, 2), cfg);
  st2.saw_active = true;
  const a2 = fire(st2, cfg, 0, "Opponent", new ScriptedSource(["Blank"]));
  assert.deepEqual(st2.hp, [4, 4]);
  assert.equal(st2.saw_active, false);
  assert.deepEqual(a2[0], {
    kind: "Shot",
    player: 0,
    target: "Opponent",
    shell: "Blank",
    damage: 0,
  });
});

test("T-104: shackle skips opponent, breaks, and resets on real turn pass", () => {
  const cfg = DEFAULT_GAME_CONFIG;
  const src = new ScriptedSource(["Blank", "Blank", "Blank"]);
  const st = stateForRound(1, createEmptyLoad(1, 3), cfg);
  st.shackled = 1;

  const a1 = fire(st, cfg, 0, "Opponent", src);
  assert.deepEqual(a1, [
    { kind: "Shot", player: 0, target: "Opponent", shell: "Blank", damage: 0 },
    { kind: "Ejected", shell: "Blank" },
    { kind: "TurnSkipped", player: 1 },
  ]);
  assert.equal(st.turn, 0);
  assert.equal(st.shackled, null);
  assert.equal(st.shackle_broke_this_turn, true);

  fire(st, cfg, 0, "SelfTarget", src);
  assert.equal(st.turn, 0);
  assert.equal(st.shackle_broke_this_turn, true);

  fire(st, cfg, 0, "Opponent", src);
  assert.equal(st.turn, 1);
  assert.equal(st.shackle_broke_this_turn, false);
});

test("T-104: last shell triggers reload + item dealing and blank self-shot on last shell clears shackle", () => {
  const cfg = DEFAULT_GAME_CONFIG;
  const src = ScriptedSource.withRolls(
    ["Blank", "Live"],
    [3, 0, 1, 2, 3, 4, 0, 1, 2],
  );
  const st = stateForRound(1, createEmptyLoad(1, 1), cfg);

  const a1 = fire(st, cfg, 0, "SelfTarget", src);
  const a2 = fire(st, cfg, 0, "SelfTarget", src);
  const all = [...a1, ...a2];

  assert.equal(all.length, 7);
  assert.deepEqual(all[4], { kind: "LoadStarted", live: 5, blank: 3, total: 8 });
  assert.equal(all[5].kind, "ItemsDealt");
  assert.equal(all[6].kind, "ItemsDealt");
  assert.equal(st.load.remaining, 8);
  assert.equal(st.items[0].length, 4);
  assert.equal(st.items[1].length, 4);
  assert.equal(st.turn, 1);

  // FIX-11: Blank self-shot on last shell clears shackle and shackle_broke_this_turn.
  const src2 = ScriptedSource.withRolls(["Blank"], new Array(12).fill(0));
  const st2 = stateForRound(2, createEmptyLoad(0, 1), cfg);
  st2.shackled = 1;
  st2.shackle_broke_this_turn = true;
  fire(st2, cfg, 0, "SelfTarget", src2);
  assert.equal(st2.shackled, null);
  assert.equal(st2.shackle_broke_this_turn, false);
  assert.equal(st2.turn, 0);
});

test("T-104: death ends round with loser starting next; 2nd win ends match; R3 heal_cut", () => {
  const cfg = DEFAULT_GAME_CONFIG;

  // Round 1 -> Round 2
  const st1 = stateForRound(1, createEmptyLoad(1, 1), cfg);
  st1.hp = [4, 1];
  const a1 = fire(st1, cfg, 0, "Opponent", ScriptedSource.withRolls(["Live"], new Array(12).fill(0)));
  assert.deepEqual(a1[2], { kind: "RoundEnded", winner: 0, score: [1, 0] });
  assert.equal(a1[3].kind, "LoadStarted");
  assert.equal(st1.round, 2);
  assert.deepEqual(st1.hp, [4, 4]);
  assert.equal(st1.turn, 1); // loser starts
  assert.equal(st1.items[0].length, 4);

  // Round 2 -> MatchEnded
  const st2 = stateForRound(2, createEmptyLoad(1, 1), cfg);
  st2.score = [1, 0];
  st2.hp = [4, 1];
  const a2 = fire(st2, cfg, 0, "Opponent", new ScriptedSource(["Live"]));
  assert.deepEqual(a2, [
    { kind: "Shot", player: 0, target: "Opponent", shell: "Live", damage: 1 },
    { kind: "Ejected", shell: "Live" },
    { kind: "RoundEnded", winner: 0, score: [2, 0] },
    { kind: "MatchEnded", winner: 0, reward: cfg.reward },
  ]);

  // R3 heal_cut at <= 2
  const st3 = stateForRound(3, createEmptyLoad(2, 2), cfg);
  st3.hp = [4, 3];
  st3.saw_active = true;
  const a3 = fire(st3, cfg, 0, "Opponent", new ScriptedSource(["Live"]));
  assert.deepEqual(st3.heal_cut, [false, true]);
  assert.deepEqual(st3.hp, [4, 1]);
  assert.deepEqual(a3[2], { kind: "HealCut", player: 1 });

  // Fatal shot in R3 does not emit HealCut
  const st4 = stateForRound(3, createEmptyLoad(2, 2), cfg);
  st4.score = [1, 1];
  st4.hp = [4, 2];
  st4.saw_active = true;
  const a4 = fire(st4, cfg, 0, "Opponent", new ScriptedSource(["Live"]));
  assert.deepEqual(st4.heal_cut, [false, false]);
  assert.equal(a4.some((a) => a.kind === "HealCut"), false);
  assert.equal(a4[3].kind, "MatchEnded");
});

test("T-104: fire rejects wrong turn, empty load, and finished match", () => {
  const cfg = DEFAULT_GAME_CONFIG;
  const src = new ScriptedSource(["Blank"]);

  const wrongTurn = stateForRound(1, createEmptyLoad(1, 1), cfg);
  assert.throws(
    () => fire(wrongTurn, cfg, 1, "Opponent", src),
    (err: unknown) => err instanceof GameRuleError && err.code === "NotYourTurn",
  );

  const empty = stateForRound(1, createEmptyLoad(0, 0), cfg);
  assert.throws(
    () => fire(empty, cfg, 0, "Opponent", src),
    (err: unknown) => err instanceof GameRuleError && err.code === "NoShellsLeft",
  );

  const done = stateForRound(1, createEmptyLoad(1, 1), cfg);
  done.score = [2, 0];
  assert.throws(
    () => fire(done, cfg, 0, "Opponent", src),
    (err: unknown) => err instanceof GameRuleError && err.code === "MatchFinished",
  );
});
