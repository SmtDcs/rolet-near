import type {
  Action,
  GameStateView,
  Item,
  ItemResult,
  LoadView,
  Shell,
  Target,
} from "../nearTypes";
import { ALL_ITEMS, newDeck, type GameConfig } from "./config";
import type { ShellSource } from "./shellSource";

export type GameErrorCode =
  | "NotYourTurn"
  | "NoShellsLeft"
  | "PositionOutOfRange"
  | "SlotOutOfRange"
  | "SlotEmpty"
  | "SlotsFull"
  | "ItemBlocked"
  | "HealBlocked"
  | "SawAlreadyActive"
  | "AlreadyShackled"
  | "ShackleJustBroke"
  | "MatchFinished";

export class GameRuleError extends Error {
  readonly code: GameErrorCode;

  constructor(code: GameErrorCode) {
    super(`GameError: ${code}`);
    this.name = "GameRuleError";
    this.code = code;
  }
}

export function createEmptyLoad(live: number, blank: number): LoadView {
  const remaining = live + blank;
  return {
    announced_live: live,
    announced_blank: blank,
    remaining,
    live_left: live,
    blank_left: blank,
    fixed: Array.from({ length: remaining }, () => null),
  };
}

export function cloneGameState(state: GameStateView): GameStateView {
  return {
    round: state.round,
    score: [state.score[0], state.score[1]],
    hp: [state.hp[0], state.hp[1]],
    max_hp: state.max_hp,
    heal_cut: [state.heal_cut[0], state.heal_cut[1]],
    items: [[...state.items[0]], [...state.items[1]]],
    load: {
      announced_live: state.load.announced_live,
      announced_blank: state.load.announced_blank,
      remaining: state.load.remaining,
      live_left: state.load.live_left,
      blank_left: state.load.blank_left,
      fixed: [...state.load.fixed],
    },
    turn: state.turn,
    shackled: state.shackled,
    shackle_broke_this_turn: state.shackle_broke_this_turn,
    saw_active: state.saw_active,
    deck_counts: [...state.deck_counts],
  };
}

export function fixedLive(load: LoadView): number {
  let count = 0;
  for (let i = 0; i < load.fixed.length; i++) {
    if (load.fixed[i] === "Live") count += 1;
  }
  return count;
}

export function fixedBlank(load: LoadView): number {
  let count = 0;
  for (let i = 0; i < load.fixed.length; i++) {
    if (load.fixed[i] === "Blank") count += 1;
  }
  return count;
}

export function liveUnfixed(load: LoadView): number {
  return load.live_left - fixedLive(load);
}

export function blankUnfixed(load: LoadView): number {
  return load.blank_left - fixedBlank(load);
}

export function loadFix(load: LoadView, pos: number, src: ShellSource): Shell {
  if (load.remaining === 0) {
    throw new GameRuleError("NoShellsLeft");
  }
  if (pos < 0 || pos >= load.remaining) {
    throw new GameRuleError("PositionOutOfRange");
  }
  const existing = load.fixed[pos];
  if (existing !== null && existing !== undefined) {
    return existing;
  }
  const shell = src.draw(liveUnfixed(load), blankUnfixed(load));
  load.fixed[pos] = shell;
  return shell;
}

export function loadCurrent(load: LoadView, src: ShellSource): Shell {
  return loadFix(load, 0, src);
}

export function loadPeekAt(load: LoadView, pos: number, src: ShellSource): Shell {
  return loadFix(load, pos, src);
}

export function loadAdvance(load: LoadView, shell: Shell): void {
  load.fixed.shift();
  load.remaining -= 1;
  if (shell === "Live") {
    load.live_left -= 1;
  } else {
    load.blank_left -= 1;
  }
}

export function newLoad(cfg: GameConfig, src: ShellSource): LoadView {
  const min = Math.min(cfg.min_live, cfg.max_live);
  const max = Math.min(Math.max(cfg.max_live, min), Math.max(0, cfg.load_size - 1));
  const span = max - min + 1;
  const live = min + src.roll(span);
  const blank = Math.max(0, cfg.load_size - live);
  return createEmptyLoad(live, blank);
}

export function dealItems(state: GameStateView, cfg: GameConfig, src: ShellSource): Action[] {
  const roundIdx = Math.max(0, state.round - 1);
  const perPlayer = cfg.rounds[roundIdx]?.items_per_load ?? 0;
  const actions: Action[] = [];
  if (perPlayer === 0 || cfg.copies_per_item === 0) {
    return actions;
  }
  for (let player = 0; player < 2; player++) {
    const free = Math.max(0, cfg.max_items - state.items[player].length);
    const count = Math.min(perPlayer, free);
    const dealt: (typeof ALL_ITEMS)[number][] = [];
    for (let k = 0; k < count; k++) {
      let total = 0;
      for (let i = 0; i < state.deck_counts.length; i++) {
        total += state.deck_counts[i] ?? 0;
      }
      if (total === 0) {
        state.deck_counts = newDeck(cfg.copies_per_item);
        total = ALL_ITEMS.length * cfg.copies_per_item;
      }
      let pick = src.roll(total);
      let drawn = ALL_ITEMS[0];
      for (let idx = 0; idx < state.deck_counts.length; idx++) {
        const c = state.deck_counts[idx] ?? 0;
        if (pick < c) {
          state.deck_counts[idx] = c - 1;
          drawn = ALL_ITEMS[idx];
          break;
        }
        pick -= c;
      }
      state.items[player].push(drawn);
      dealt.push(drawn);
    }
    if (dealt.length > 0) {
      actions.push({ kind: "ItemsDealt", player, items: dealt });
    }
  }
  return actions;
}

/**
 * Initializes round 1 state + first load + dealt items, matching Contract::reveal.
 */
export function createMatchState(
  cfg: GameConfig,
  firstTurn: 0 | 1,
  src: ShellSource,
): { state: GameStateView; actions: Action[] } {
  const rc = cfg.rounds[0];
  const load = newLoad(cfg, src);
  const state: GameStateView = {
    round: 1,
    score: [0, 0],
    hp: [rc.start_hp, rc.start_hp],
    max_hp: rc.start_hp,
    heal_cut: [false, false],
    items: [[], []],
    load,
    turn: firstTurn,
    shackled: null,
    shackle_broke_this_turn: false,
    saw_active: false,
    deck_counts: newDeck(cfg.copies_per_item),
  };
  const actions: Action[] = [
    {
      kind: "LoadStarted",
      live: state.load.announced_live,
      blank: state.load.announced_blank,
      total: state.load.remaining,
    },
    ...dealItems(state, cfg, src),
  ];
  return { state, actions };
}

export function reload(
  state: GameStateView,
  cfg: GameConfig,
  src: ShellSource,
  actions: Action[],
): void {
  state.shackled = null;
  state.shackle_broke_this_turn = false;
  state.load = newLoad(cfg, src);
  actions.push({
    kind: "LoadStarted",
    live: state.load.announced_live,
    blank: state.load.announced_blank,
    total: state.load.remaining,
  });
  actions.push(...dealItems(state, cfg, src));
}

export function applyDamage(
  state: GameStateView,
  cfg: GameConfig,
  victim: number,
  dmg: number,
  actions: Action[],
  src: ShellSource,
): number | null {
  state.hp[victim] = Math.max(0, state.hp[victim] - dmg);
  if (dmg > 0 && state.hp[victim] > 0 && !state.heal_cut[victim]) {
    const threshold = cfg.rounds[Math.max(0, state.round - 1)]?.heal_cut_at ?? null;
    if (threshold !== null && state.hp[victim] <= threshold) {
      state.heal_cut[victim] = true;
      actions.push({ kind: "HealCut", player: victim });
    }
  }
  if (state.hp[victim] > 0) {
    return null;
  }
  const winner = 1 - victim;
  state.score[winner] += 1;
  actions.push({
    kind: "RoundEnded",
    winner,
    score: [state.score[0], state.score[1]],
  });
  if (state.score[winner] >= 2) {
    actions.push({
      kind: "MatchEnded",
      winner,
      reward: cfg.reward,
    });
    return winner;
  }
  state.round += 1;
  const rc = cfg.rounds[state.round - 1];
  state.hp = [rc.start_hp, rc.start_hp];
  state.max_hp = rc.start_hp;
  state.heal_cut = [false, false];
  state.items = [[], []];
  state.shackled = null;
  state.shackle_broke_this_turn = false;
  state.saw_active = false;
  state.turn = victim;
  reload(state, cfg, src, actions);
  return winner;
}

export function endTurn(state: GameStateView, actor: number, actions: Action[]): void {
  const next = 1 - actor;
  state.turn = next;
  state.shackle_broke_this_turn = false;
  if (state.shackled === next) {
    actions.push({ kind: "TurnSkipped", player: next });
    state.shackled = null;
    state.shackle_broke_this_turn = true;
    state.turn = actor;
  }
}

export function fire(
  state: GameStateView,
  cfg: GameConfig,
  actor: number,
  target: Target,
  src: ShellSource,
): Action[] {
  if (state.score[0] >= 2 || state.score[1] >= 2) {
    throw new GameRuleError("MatchFinished");
  }
  if (actor !== 0 && actor !== 1) {
    throw new GameRuleError("NotYourTurn");
  }
  if (actor !== state.turn) {
    throw new GameRuleError("NotYourTurn");
  }
  const shell = loadCurrent(state.load, src);
  const damage = shell === "Blank" ? 0 : state.saw_active ? 2 : 1;
  const actions: Action[] = [
    { kind: "Shot", player: actor, target, shell, damage },
  ];
  loadAdvance(state.load, shell);
  actions.push({ kind: "Ejected", shell });
  state.saw_active = false;
  const victim = target === "Opponent" ? 1 - actor : actor;
  if (applyDamage(state, cfg, victim, damage, actions, src) !== null) {
    return actions;
  }
  if (!(shell === "Blank" && target === "SelfTarget")) {
    endTurn(state, actor, actions);
  }
  if (state.load.remaining === 0) {
    reload(state, cfg, src, actions);
  }
  return actions;
}

export function checkItem(
  state: GameStateView,
  cfg: GameConfig,
  actor: number,
  item: Item,
  stealSlot: number | null,
): void {
  switch (item) {
    case "Loupe":
    case "Flask":
    case "Magnet":
      if (state.load.remaining === 0) {
        throw new GameRuleError("NoShellsLeft");
      }
      break;
    case "Ticker":
      break;
    case "Pipe":
      if (state.heal_cut[actor]) {
        throw new GameRuleError("HealBlocked");
      }
      if (state.hp[actor] >= state.max_hp) {
        throw new GameRuleError("ItemBlocked");
      }
      break;
    case "Tincture":
      if (state.heal_cut[actor]) {
        throw new GameRuleError("HealBlocked");
      }
      break;
    case "Shackle":
      if (state.shackled === 1 - actor) {
        throw new GameRuleError("AlreadyShackled");
      }
      if (state.shackle_broke_this_turn) {
        throw new GameRuleError("ShackleJustBroke");
      }
      break;
    case "Hacksaw":
      if (state.saw_active) {
        throw new GameRuleError("SawAlreadyActive");
      }
      break;
    case "Lockpick": {
      if (
        stealSlot === null ||
        !Number.isInteger(stealSlot) ||
        stealSlot < 0 ||
        stealSlot >= cfg.max_items
      ) {
        throw new GameRuleError("SlotOutOfRange");
      }
      const opponent = 1 - actor;
      if (stealSlot >= state.items[opponent].length) {
        throw new GameRuleError("SlotEmpty");
      }
      const stolen = state.items[opponent][stealSlot];
      if (stolen === "Lockpick") {
        throw new GameRuleError("ItemBlocked");
      }
      checkItem(state, cfg, actor, stolen, null);
      break;
    }
  }
}

function applyItem(
  state: GameStateView,
  cfg: GameConfig,
  actor: number,
  item: Item,
  slot: number,
  stealSlot: number | null,
  src: ShellSource,
): Action[] {
  checkItem(state, cfg, actor, item, stealSlot);
  const actions: Action[] = [];
  const itemUsed = (result: ItemResult): Action => ({
    kind: "ItemUsed",
    player: actor,
    item,
    slot,
    result,
  });

  switch (item) {
    case "Loupe": {
      const shell = loadCurrent(state.load, src);
      actions.push(itemUsed({ kind: "Private", pos: 0, shell }));
      break;
    }
    case "Pipe": {
      state.hp[actor] += 1;
      actions.push(itemUsed({ kind: "Healed", amount: 1 }));
      break;
    }
    case "Flask": {
      const shell = loadCurrent(state.load, src);
      loadAdvance(state.load, shell);
      actions.push(itemUsed({ kind: "Ejected", shell }));
      actions.push({ kind: "Ejected", shell });
      if (state.load.remaining === 0) {
        state.saw_active = false;
        endTurn(state, actor, actions);
        reload(state, cfg, src, actions);
      }
      break;
    }
    case "Shackle": {
      state.shackled = 1 - actor;
      actions.push(itemUsed({ kind: "None" }));
      break;
    }
    case "Hacksaw": {
      state.saw_active = true;
      actions.push(itemUsed({ kind: "None" }));
      break;
    }
    case "Ticker": {
      if (state.load.remaining < 2) {
        actions.push(itemUsed({ kind: "None" }));
      } else {
        const max = state.load.remaining - 1;
        const pos = 1 + src.roll(max);
        const shell = loadPeekAt(state.load, pos, src);
        actions.push(itemUsed({ kind: "Private", pos, shell }));
      }
      break;
    }
    case "Magnet": {
      const shell = loadCurrent(state.load, src);
      const flipped: Shell = shell === "Live" ? "Blank" : "Live";
      state.load.fixed[0] = flipped;
      if (shell === "Live") {
        state.load.live_left -= 1;
        state.load.blank_left += 1;
      } else {
        state.load.blank_left -= 1;
        state.load.live_left += 1;
      }
      actions.push(itemUsed({ kind: "None" }));
      break;
    }
    case "Lockpick": {
      const steal = stealSlot as number;
      const opponent = 1 - actor;
      const [stolen] = state.items[opponent].splice(steal, 1);
      actions.push(itemUsed({ kind: "None" }));
      actions.push(...applyItem(state, cfg, actor, stolen, steal, null, src));
      break;
    }
    case "Tincture": {
      if (src.roll(100) < cfg.tincture_good_pct) {
        const healed = Math.min(2, Math.max(0, state.max_hp - state.hp[actor]));
        state.hp[actor] += healed;
        actions.push(itemUsed({ kind: "Healed", amount: healed }));
      } else {
        actions.push(itemUsed({ kind: "Damaged", amount: 1 }));
        applyDamage(state, cfg, actor, 1, actions, src);
      }
      break;
    }
  }
  return actions;
}

export function playItem(
  state: GameStateView,
  cfg: GameConfig,
  actor: number,
  slot: number,
  stealSlot: number | null,
  src: ShellSource,
): Action[] {
  if (state.score[0] >= 2 || state.score[1] >= 2) {
    throw new GameRuleError("MatchFinished");
  }
  if (actor !== 0 && actor !== 1) {
    throw new GameRuleError("NotYourTurn");
  }
  if (actor !== state.turn) {
    throw new GameRuleError("NotYourTurn");
  }
  if (!Number.isInteger(slot) || slot < 0 || slot >= cfg.max_items) {
    throw new GameRuleError("SlotOutOfRange");
  }
  if (slot >= state.items[actor].length) {
    throw new GameRuleError("SlotEmpty");
  }
  const [item] = state.items[actor].splice(slot, 1);
  try {
    return applyItem(state, cfg, actor, item, slot, stealSlot, src);
  } catch (err) {
    state.items[actor].splice(slot, 0, item);
    throw err;
  }
}

export const useItem = playItem;
