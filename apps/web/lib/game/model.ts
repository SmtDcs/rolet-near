import type { Action, Item, MatchStatus, MatchView, Shell } from "../nearTypes";
import { DEFAULT_GAME_CONFIG, type GameConfig } from "./config";
import { redactAction, redactSnapshot } from "./privacy";

export type GamePhase = "revealing" | "active" | "finished" | "cancelled";

export interface GameModel {
  round: number;
  score: [number, number];
  hp: [number, number];
  maxHp: number;
  healCut: [boolean, boolean];
  items: [Item[], Item[]];
  announcedLive: number;
  announcedBlank: number;
  leftLive: number;
  leftBlank: number;
  remaining: number;
  knownShells: Map<number, Shell>;
  turn: number;
  saw: boolean;
  shackled: number | null;
  shackleBrokeThisTurn: boolean;
  phase: GamePhase;
  winner: number | null;
  reward: string | null;
  magnetDirty: boolean;
  pendingStealFrom: number | null;
  lastFlaskActor: number | null;
}

function phaseFromStatus(status: MatchStatus): GamePhase {
  switch (status) {
    case "Pending":
    case "Revealing":
      return "revealing";
    case "Active":
      return "active";
    case "Finished":
      return "finished";
    case "Cancelled":
      return "cancelled";
  }
}

export function fromSnapshot(
  view: MatchView,
  you: number,
  ownPrivate?: ReadonlyMap<number, Shell>,
): GameModel {
  const safe = redactSnapshot(view, you, ownPrivate);
  const g = safe.game;
  const knownShells = new Map<number, Shell>();
  const startRedact = Math.max(0, g.load.fixed.length - g.load.remaining);
  for (let i = startRedact; i < g.load.fixed.length; i++) {
    const s = g.load.fixed[i];
    if (s !== null && s !== undefined) {
      knownShells.set(i - startRedact, s);
    }
  }

  return {
    round: g.round,
    score: [g.score[0], g.score[1]],
    hp: [g.hp[0], g.hp[1]],
    maxHp: g.max_hp,
    healCut: [g.heal_cut[0], g.heal_cut[1]],
    items: [[...g.items[0]], [...g.items[1]]],
    announcedLive: g.load.announced_live,
    announcedBlank: g.load.announced_blank,
    leftLive: g.load.live_left,
    leftBlank: g.load.blank_left,
    remaining: g.load.remaining,
    knownShells,
    turn: g.turn,
    saw: g.saw_active,
    shackled: g.shackled,
    shackleBrokeThisTurn: g.shackle_broke_this_turn,
    phase: phaseFromStatus(safe.status),
    winner: safe.winner,
    reward: null,
    magnetDirty: false,
    pendingStealFrom: null,
    lastFlaskActor: null,
  };
}

function cloneModel(m: GameModel): GameModel {
  return {
    round: m.round,
    score: [m.score[0], m.score[1]],
    hp: [m.hp[0], m.hp[1]],
    maxHp: m.maxHp,
    healCut: [m.healCut[0], m.healCut[1]],
    items: [[...m.items[0]], [...m.items[1]]],
    announcedLive: m.announcedLive,
    announcedBlank: m.announcedBlank,
    leftLive: m.leftLive,
    leftBlank: m.leftBlank,
    remaining: m.remaining,
    knownShells: new Map(m.knownShells),
    turn: m.turn,
    saw: m.saw,
    shackled: m.shackled,
    shackleBrokeThisTurn: m.shackleBrokeThisTurn,
    phase: m.phase,
    winner: m.winner,
    reward: m.reward,
    magnetDirty: m.magnetDirty,
    pendingStealFrom: m.pendingStealFrom,
    lastFlaskActor: m.lastFlaskActor,
  };
}

function shiftKnownShells(known: Map<number, Shell>): Map<number, Shell> {
  const next = new Map<number, Shell>();
  for (const [pos, shell] of known.entries()) {
    if (pos > 0) {
      next.set(pos - 1, shell);
    }
  }
  return next;
}

/**
 * Pure reducer applying a single contract Action to GameModel after privacy redaction.
 */
export function applyAction(
  model: GameModel,
  rawAction: Action,
  you: number,
  cfg: GameConfig = DEFAULT_GAME_CONFIG,
): GameModel {
  const action = redactAction(rawAction, you);
  const next = cloneModel(model);

  switch (action.kind) {
    case "LoadStarted": {
      next.phase = next.phase === "revealing" ? "active" : next.phase;
      next.announcedLive = action.live;
      next.announcedBlank = action.blank;
      next.leftLive = action.live;
      next.leftBlank = action.blank;
      next.remaining = action.total;
      next.knownShells.clear();
      next.shackled = null;
      next.shackleBrokeThisTurn = false;
      next.magnetDirty = false;
      next.pendingStealFrom = null;
      next.lastFlaskActor = null;
      break;
    }
    case "ItemsDealt": {
      next.items[action.player].push(...action.items);
      break;
    }
    case "ItemUsed": {
      if (next.pendingStealFrom !== null) {
        const stolenFrom = next.pendingStealFrom;
        next.items[stolenFrom].splice(action.slot, 1);
        next.pendingStealFrom = null;
      } else {
        next.items[action.player].splice(action.slot, 1);
      }

      next.lastFlaskActor = action.item === "Flask" ? action.player : null;

      switch (action.item) {
        case "Loupe":
        case "Ticker": {
          if (action.result.kind === "Private") {
            next.knownShells.set(action.result.pos, action.result.shell);
          }
          break;
        }
        case "Pipe": {
          if (action.result.kind === "Healed") {
            next.hp[action.player] = Math.min(
              next.maxHp,
              next.hp[action.player] + action.result.amount,
            );
          }
          break;
        }
        case "Flask":
          break;
        case "Shackle": {
          next.shackled = 1 - action.player;
          break;
        }
        case "Hacksaw": {
          next.saw = true;
          break;
        }
        case "Magnet": {
          next.knownShells.clear();
          next.magnetDirty = true;
          break;
        }
        case "Lockpick": {
          next.pendingStealFrom = 1 - action.player;
          break;
        }
        case "Tincture": {
          if (action.result.kind === "Healed") {
            next.hp[action.player] = Math.min(
              next.maxHp,
              next.hp[action.player] + action.result.amount,
            );
          } else if (action.result.kind === "Damaged") {
            next.hp[action.player] = Math.max(
              0,
              next.hp[action.player] - action.result.amount,
            );
          }
          break;
        }
      }
      break;
    }
    case "Shot": {
      next.lastFlaskActor = null;
      const victim = action.target === "Opponent" ? 1 - action.player : action.player;
      if (action.damage > 0) {
        next.hp[victim] = Math.max(0, next.hp[victim] - action.damage);
      }
      next.saw = false;
      if (next.hp[victim] > 0 && !(action.shell === "Blank" && action.target === "SelfTarget")) {
        next.turn = 1 - action.player;
        next.shackleBrokeThisTurn = false;
      }
      break;
    }
    case "Ejected": {
      next.remaining = Math.max(0, next.remaining - 1);
      if (action.shell === "Live") {
        next.leftLive = Math.max(0, next.leftLive - 1);
      } else {
        next.leftBlank = Math.max(0, next.leftBlank - 1);
      }
      next.knownShells = shiftKnownShells(next.knownShells);
      if (next.lastFlaskActor !== null) {
        const actor = next.lastFlaskActor;
        next.lastFlaskActor = null;
        if (next.remaining === 0) {
          next.saw = false;
          next.turn = 1 - actor;
          next.shackleBrokeThisTurn = false;
        }
      }
      break;
    }
    case "TurnSkipped": {
      next.shackled = null;
      next.shackleBrokeThisTurn = true;
      next.turn = 1 - action.player;
      break;
    }
    case "HealCut": {
      next.healCut[action.player] = true;
      break;
    }
    case "RoundEnded": {
      next.score = [action.score[0], action.score[1]];
      if (next.score[0] < 2 && next.score[1] < 2) {
        next.round += 1;
        const rc = cfg.rounds[Math.max(0, next.round - 1)] ?? cfg.rounds[0];
        next.hp = [rc.start_hp, rc.start_hp];
        next.maxHp = rc.start_hp;
        next.healCut = [false, false];
        next.items = [[], []];
        next.shackled = null;
        next.shackleBrokeThisTurn = false;
        next.saw = false;
        next.turn = 1 - action.winner;
        next.knownShells.clear();
        next.pendingStealFrom = null;
        next.lastFlaskActor = null;
      }
      break;
    }
    case "MatchEnded": {
      next.phase = "finished";
      next.winner = action.winner;
      next.reward = action.reward;
      break;
    }
    case "TimeoutClaimed": {
      break;
    }
  }

  return next;
}
