import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { GameStateView, Item } from "../nearTypes";
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
  useItem,
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

function itemState(round: number, load = createEmptyLoad(1, 1), items: Item[] = []): GameStateView {
  const st = stateForRound(round, load, DEFAULT_GAME_CONFIG);
  st.items[0] = [...items];
  return st;
}

test("T-105: Loupe reveals current shell privately and rejects empty load", () => {
  const cfg = DEFAULT_GAME_CONFIG;
  const st = itemState(2, createEmptyLoad(1, 1), ["Loupe"]);
  const actions = useItem(st, cfg, 0, 0, null, new ScriptedSource(["Live"]));
  assert.deepEqual(actions, [
    { kind: "ItemUsed", player: 0, item: "Loupe", slot: 0, result: { kind: "Private", pos: 0, shell: "Live" } },
  ]);
  assert.deepEqual(st.items[0], []);
  assert.equal(st.load.fixed[0], "Live");

  const empty = itemState(2, createEmptyLoad(0, 0), ["Loupe"]);
  assert.throws(
    () => useItem(empty, cfg, 0, 0, null, new ScriptedSource([])),
    (err: unknown) => err instanceof GameRuleError && err.code === "NoShellsLeft",
  );
  assert.deepEqual(empty.items[0], ["Loupe"]);
});

test("T-105 & DECISIONS #9: Pipe heals +1, rejects at full HP or heal_cut without consuming", () => {
  const cfg = DEFAULT_GAME_CONFIG;
  const src = new ScriptedSource([]);
  const st = itemState(2, createEmptyLoad(1, 1), ["Pipe"]);
  st.hp = [3, 4];
  const actions = useItem(st, cfg, 0, 0, null, src);
  assert.deepEqual(actions, [
    { kind: "ItemUsed", player: 0, item: "Pipe", slot: 0, result: { kind: "Healed", amount: 1 } },
  ]);
  assert.deepEqual(st.hp, [4, 4]);
  assert.deepEqual(st.items[0], []);

  const full = itemState(2, createEmptyLoad(1, 1), ["Pipe"]);
  assert.throws(
    () => useItem(full, cfg, 0, 0, null, src),
    (err: unknown) => err instanceof GameRuleError && err.code === "ItemBlocked",
  );
  assert.deepEqual(full.items[0], ["Pipe"]);

  const cut = itemState(3, createEmptyLoad(1, 1), ["Pipe"]);
  cut.heal_cut = [true, false];
  cut.hp = [2, 4];
  assert.throws(
    () => useItem(cut, cfg, 0, 0, null, src),
    (err: unknown) => err instanceof GameRuleError && err.code === "HealBlocked",
  );
  assert.deepEqual(cut.items[0], ["Pipe"]);
});

test("T-105: Flask ejects shell keeping turn/saw, reloads on last shell, rejects empty", () => {
  const cfg = DEFAULT_GAME_CONFIG;
  const st = itemState(2, createEmptyLoad(1, 1), ["Flask"]);
  st.saw_active = true;
  const actions = useItem(st, cfg, 0, 0, null, new ScriptedSource(["Blank"]));
  assert.deepEqual(actions, [
    { kind: "ItemUsed", player: 0, item: "Flask", slot: 0, result: { kind: "Ejected", shell: "Blank" } },
    { kind: "Ejected", shell: "Blank" },
  ]);
  assert.equal(st.turn, 0);
  assert.equal(st.saw_active, true);
  assert.equal(st.load.remaining, 1);

  const last = itemState(2, createEmptyLoad(0, 1), ["Flask"]);
  last.saw_active = true;
  last.shackled = 1;
  const aLast = useItem(last, cfg, 0, 0, null, ScriptedSource.withRolls(["Blank"], new Array(12).fill(0)));
  assert.equal(aLast.some((a) => a.kind === "TurnSkipped" && a.player === 1), true);
  assert.equal(aLast.some((a) => a.kind === "LoadStarted"), true);
  assert.equal(last.saw_active, false);
  assert.equal(last.shackled, null);
  assert.equal(last.turn, 0);
  assert.equal(last.load.remaining, 8);

  const empty = itemState(2, createEmptyLoad(0, 0), ["Flask"]);
  assert.throws(
    () => useItem(empty, cfg, 0, 0, null, new ScriptedSource([])),
    (err: unknown) => err instanceof GameRuleError && err.code === "NoShellsLeft",
  );
  assert.deepEqual(empty.items[0], ["Flask"]);
});

test("T-105: Shackle and Hacksaw apply state and reject duplicates without consuming", () => {
  const cfg = DEFAULT_GAME_CONFIG;
  const src = new ScriptedSource([]);

  const stSh = itemState(2, createEmptyLoad(1, 1), ["Shackle"]);
  const aSh = useItem(stSh, cfg, 0, 0, null, src);
  assert.deepEqual(aSh, [
    { kind: "ItemUsed", player: 0, item: "Shackle", slot: 0, result: { kind: "None" } },
  ]);
  assert.equal(stSh.shackled, 1);

  const dupSh = itemState(2, createEmptyLoad(1, 1), ["Shackle"]);
  dupSh.shackled = 1;
  assert.throws(
    () => useItem(dupSh, cfg, 0, 0, null, src),
    (err: unknown) => err instanceof GameRuleError && err.code === "AlreadyShackled",
  );
  assert.deepEqual(dupSh.items[0], ["Shackle"]);

  const brokeSh = itemState(2, createEmptyLoad(1, 1), ["Shackle"]);
  brokeSh.shackle_broke_this_turn = true;
  assert.throws(
    () => useItem(brokeSh, cfg, 0, 0, null, src),
    (err: unknown) => err instanceof GameRuleError && err.code === "ShackleJustBroke",
  );
  assert.deepEqual(brokeSh.items[0], ["Shackle"]);

  const stSaw = itemState(2, createEmptyLoad(1, 1), ["Hacksaw"]);
  const aSaw = useItem(stSaw, cfg, 0, 0, null, src);
  assert.deepEqual(aSaw, [
    { kind: "ItemUsed", player: 0, item: "Hacksaw", slot: 0, result: { kind: "None" } },
  ]);
  assert.equal(stSaw.saw_active, true);

  const dupSaw = itemState(2, createEmptyLoad(1, 1), ["Hacksaw"]);
  dupSaw.saw_active = true;
  assert.throws(
    () => useItem(dupSaw, cfg, 0, 0, null, src),
    (err: unknown) => err instanceof GameRuleError && err.code === "SawAlreadyActive",
  );
  assert.deepEqual(dupSaw.items[0], ["Hacksaw"]);
});

test("T-105: useItem common rejections preserve slot order", () => {
  const cfg = DEFAULT_GAME_CONFIG;
  const src = new ScriptedSource([]);
  const st = itemState(2, createEmptyLoad(1, 1), ["Loupe", "Pipe", "Flask"]);
  st.hp[0] = st.max_hp;

  assert.throws(
    () => useItem(st, cfg, 1, 0, null, src),
    (err: unknown) => err instanceof GameRuleError && err.code === "NotYourTurn",
  );
  assert.throws(
    () => useItem(st, cfg, 0, 4, null, src),
    (err: unknown) => err instanceof GameRuleError && err.code === "SlotOutOfRange",
  );
  assert.throws(
    () => useItem(st, cfg, 0, 3, null, src),
    (err: unknown) => err instanceof GameRuleError && err.code === "SlotEmpty",
  );
  assert.throws(
    () => useItem(st, cfg, 0, 1, null, src),
    (err: unknown) => err instanceof GameRuleError && err.code === "ItemBlocked",
  );
  assert.deepEqual(st.items[0], ["Loupe", "Pipe", "Flask"]);

  const done = itemState(2, createEmptyLoad(1, 1), ["Loupe"]);
  done.score = [2, 0];
  assert.throws(
    () => useItem(done, cfg, 0, 0, null, src),
    (err: unknown) => err instanceof GameRuleError && err.code === "MatchFinished",
  );
});

test("T-106 & DECISIONS #8: Ticker reveals future shell or consumes with None when <=1 shell left", () => {
  const cfg = DEFAULT_GAME_CONFIG;
  const st = itemState(3, createEmptyLoad(1, 2), ["Ticker"]);
  const a1 = useItem(st, cfg, 0, 0, null, ScriptedSource.withRolls(["Live"], [0]));
  assert.deepEqual(a1, [
    { kind: "ItemUsed", player: 0, item: "Ticker", slot: 0, result: { kind: "Private", pos: 1, shell: "Live" } },
  ]);
  assert.equal(st.load.fixed[1], "Live");
  assert.deepEqual(st.items[0], []);

  const stOne = itemState(3, createEmptyLoad(1, 0), ["Ticker"]);
  const a2 = useItem(stOne, cfg, 0, 0, null, new ScriptedSource([]));
  assert.deepEqual(a2, [
    { kind: "ItemUsed", player: 0, item: "Ticker", slot: 0, result: { kind: "None" } },
  ]);
  assert.deepEqual(stOne.items[0], []);
});

test("T-106: Magnet flips current shell keeping announced counts, rejects empty load", () => {
  const cfg = DEFAULT_GAME_CONFIG;
  const st = itemState(3, createEmptyLoad(1, 1), ["Magnet"]);
  const a = useItem(st, cfg, 0, 0, null, new ScriptedSource(["Live"]));
  assert.deepEqual(a, [
    { kind: "ItemUsed", player: 0, item: "Magnet", slot: 0, result: { kind: "None" } },
  ]);
  assert.equal(st.load.announced_live, 1);
  assert.equal(st.load.announced_blank, 1);
  assert.equal(st.load.live_left, 0);
  assert.equal(st.load.blank_left, 2);
  assert.equal(st.load.fixed[0], "Blank");

  // Already-fixed shell flips without drawing.
  const stFixed = itemState(3, createEmptyLoad(1, 1), ["Magnet"]);
  stFixed.load.fixed[0] = "Blank";
  useItem(stFixed, cfg, 0, 0, null, new ScriptedSource([]));
  assert.equal(stFixed.load.fixed[0], "Live");
  assert.equal(stFixed.load.live_left, 2);
  assert.equal(stFixed.load.blank_left, 0);

  const empty = itemState(3, createEmptyLoad(0, 0), ["Magnet"]);
  assert.throws(
    () => useItem(empty, cfg, 0, 0, null, new ScriptedSource([])),
    (err: unknown) => err instanceof GameRuleError && err.code === "NoShellsLeft",
  );
  assert.deepEqual(empty.items[0], ["Magnet"]);
});

test("T-106: Lockpick steals & applies item, cannot steal Lockpick, atomic on rejection", () => {
  const cfg = DEFAULT_GAME_CONFIG;
  const st = itemState(2, createEmptyLoad(1, 1), ["Lockpick"]);
  st.items[1] = ["Pipe"];
  st.hp = [3, 4];
  const a = useItem(st, cfg, 0, 0, 0, new ScriptedSource([]));
  assert.deepEqual(a, [
    { kind: "ItemUsed", player: 0, item: "Lockpick", slot: 0, result: { kind: "None" } },
    { kind: "ItemUsed", player: 0, item: "Pipe", slot: 0, result: { kind: "Healed", amount: 1 } },
  ]);
  assert.deepEqual(st.hp, [4, 4]);
  assert.deepEqual(st.items[0], []);
  assert.deepEqual(st.items[1], []);

  // Cannot steal Lockpick
  const noStealLockpick = itemState(3, createEmptyLoad(1, 1), ["Lockpick"]);
  noStealLockpick.items[1] = ["Lockpick"];
  assert.throws(
    () => useItem(noStealLockpick, cfg, 0, 0, 0, new ScriptedSource([])),
    (err: unknown) => err instanceof GameRuleError && err.code === "ItemBlocked",
  );
  assert.deepEqual(noStealLockpick.items[0], ["Lockpick"]);
  assert.deepEqual(noStealLockpick.items[1], ["Lockpick"]);

  // Stolen Shackle inapplicable -> atomic rejection
  const noStealShackle = itemState(3, createEmptyLoad(1, 1), ["Lockpick"]);
  noStealShackle.items[1] = ["Shackle"];
  noStealShackle.shackled = 1;
  assert.throws(
    () => useItem(noStealShackle, cfg, 0, 0, 0, new ScriptedSource([])),
    (err: unknown) => err instanceof GameRuleError && err.code === "AlreadyShackled",
  );
  assert.deepEqual(noStealShackle.items[0], ["Lockpick"]);
  assert.deepEqual(noStealShackle.items[1], ["Shackle"]);

  assert.throws(
    () => useItem(noStealShackle, cfg, 0, 0, null, new ScriptedSource([])),
    (err: unknown) => err instanceof GameRuleError && err.code === "SlotOutOfRange",
  );
  assert.throws(
    () => useItem(noStealShackle, cfg, 0, 0, 1, new ScriptedSource([])),
    (err: unknown) => err instanceof GameRuleError && err.code === "SlotEmpty",
  );
});

test("T-106: Tincture 50% good/bad rolls, boundary 49/50, lethal bad roll, heal_cut rejection", () => {
  const cfg = DEFAULT_GAME_CONFIG;

  // Roll 49 -> +2 clamped to max_hp
  const stGood = itemState(1, createEmptyLoad(1, 1), ["Tincture"]);
  stGood.hp = [2, 4];
  const aGood = useItem(stGood, cfg, 0, 0, null, ScriptedSource.withRolls([], [49]));
  assert.deepEqual(aGood, [
    { kind: "ItemUsed", player: 0, item: "Tincture", slot: 0, result: { kind: "Healed", amount: 2 } },
  ]);
  assert.deepEqual(stGood.hp, [4, 4]);

  // Roll 50 -> -1 damage; triggers HealCut in R3
  const stBad = itemState(3, createEmptyLoad(1, 1), ["Tincture"]);
  stBad.hp = [3, 3];
  const aBad = useItem(stBad, cfg, 0, 0, null, ScriptedSource.withRolls([], [50]));
  assert.deepEqual(aBad, [
    { kind: "ItemUsed", player: 0, item: "Tincture", slot: 0, result: { kind: "Damaged", amount: 1 } },
    { kind: "HealCut", player: 0 },
  ]);
  assert.deepEqual(stBad.hp, [2, 3]);
  assert.deepEqual(stBad.heal_cut, [true, false]);

  // Lethal roll at high slot
  const stKill = itemState(1, createEmptyLoad(1, 1), ["Loupe", "Pipe", "Flask", "Tincture"]);
  stKill.hp = [1, 4];
  const aKill = useItem(
    stKill,
    cfg,
    0,
    3,
    null,
    ScriptedSource.withRolls([], [99, 0, 0, 1, 2, 3, 4, 0, 1, 2]),
  );
  assert.deepEqual(aKill[1], { kind: "RoundEnded", winner: 1, score: [0, 1] });
  assert.equal(stKill.round, 2);
  assert.equal(stKill.items[0].length, 4);
  assert.equal(stKill.items[1].length, 4);

  // Blocked under heal_cut
  const stCut = itemState(3, createEmptyLoad(1, 1), ["Tincture"]);
  stCut.heal_cut = [true, false];
  assert.throws(
    () => useItem(stCut, cfg, 0, 0, null, ScriptedSource.withRolls([], [0])),
    (err: unknown) => err instanceof GameRuleError && err.code === "HealBlocked",
  );
  assert.deepEqual(stCut.items[0], ["Tincture"]);
});
