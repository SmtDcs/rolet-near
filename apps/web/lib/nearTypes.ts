/**
 * TypeScript mirrors of Rolet NEAR contract views and action log types
 * (contracts/rolet-near/src/game.rs & views.rs, docs/near/schema/*.json).
 */

export const SHELLS = ["Live", "Blank"] as const;
export type Shell = (typeof SHELLS)[number];

export const ITEMS = [
  "Loupe",
  "Pipe",
  "Flask",
  "Shackle",
  "Hacksaw",
  "Ticker",
  "Magnet",
  "Lockpick",
  "Tincture",
] as const;
export type Item = (typeof ITEMS)[number];

export const TARGETS = ["SelfTarget", "Opponent"] as const;
export type Target = (typeof TARGETS)[number];

export type ItemResult =
  | { kind: "None" }
  | { kind: "Private"; pos: number; shell: Shell }
  | { kind: "Ejected"; shell: Shell }
  | { kind: "Healed"; amount: number }
  | { kind: "Damaged"; amount: number };

export type Action =
  | { kind: "LoadStarted"; live: number; blank: number; total: number }
  | { kind: "ItemsDealt"; player: number; items: Item[] }
  | { kind: "ItemUsed"; player: number; item: Item; slot: number; result: ItemResult }
  | { kind: "Shot"; player: number; target: Target; shell: Shell; damage: number }
  | { kind: "Ejected"; shell: Shell }
  | { kind: "TurnSkipped"; player: number }
  | { kind: "HealCut"; player: number }
  | { kind: "RoundEnded"; winner: number; score: [number, number] }
  | { kind: "MatchEnded"; winner: number; reward: string }
  | { kind: "TimeoutClaimed"; by: number };

export interface LoadView {
  announced_live: number;
  announced_blank: number;
  remaining: number;
  live_left: number;
  blank_left: number;
  fixed: (Shell | null)[];
}

export interface GameStateView {
  round: number;
  score: [number, number];
  hp: [number, number];
  max_hp: number;
  heal_cut: [boolean, boolean];
  items: [Item[], Item[]];
  load: LoadView;
  turn: number;
  shackled: number | null;
  shackle_broke_this_turn: boolean;
  saw_active: boolean;
  deck_counts: number[];
}

export type MatchStatus =
  | "Pending"
  | "Revealing"
  | "Active"
  | "Finished"
  | "Cancelled";

export interface MatchView {
  id: string;
  status: MatchStatus;
  players: [string, string];
  tokens: [string, string];
  revealed: [boolean, boolean];
  game: GameStateView;
  reveal_deadline_ms: number;
  deadline_ms: number;
  winner: number | null;
  seq: number;
  log: Action[];
}

export interface ActionsPage {
  first_seq: number;
  actions: Action[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isUint8(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 255;
}

function isPlayerIdx(x: unknown): x is number {
  return x === 0 || x === 1;
}

export function isShell(x: unknown): x is Shell {
  return x === "Live" || x === "Blank";
}

export function isItem(x: unknown): x is Item {
  return typeof x === "string" && (ITEMS as readonly string[]).includes(x);
}

export function isTarget(x: unknown): x is Target {
  return x === "SelfTarget" || x === "Opponent";
}

export function isItemResult(x: unknown): x is ItemResult {
  if (!isRecord(x) || typeof x.kind !== "string") return false;
  switch (x.kind) {
    case "None":
      return true;
    case "Private":
      return isUint8(x.pos) && isShell(x.shell);
    case "Ejected":
      return isShell(x.shell);
    case "Healed":
    case "Damaged":
      return isUint8(x.amount);
    default:
      return false;
  }
}

/**
 * Runtime type guard for contract Action enum variants (serde tag="kind").
 */
export function isAction(x: unknown): x is Action {
  if (!isRecord(x) || typeof x.kind !== "string") return false;
  switch (x.kind) {
    case "LoadStarted":
      return isUint8(x.live) && isUint8(x.blank) && isUint8(x.total);
    case "ItemsDealt":
      return isPlayerIdx(x.player) && Array.isArray(x.items) && x.items.every(isItem);
    case "ItemUsed":
      return (
        isPlayerIdx(x.player) &&
        isItem(x.item) &&
        isUint8(x.slot) &&
        isItemResult(x.result)
      );
    case "Shot":
      return (
        isPlayerIdx(x.player) &&
        isTarget(x.target) &&
        isShell(x.shell) &&
        isUint8(x.damage)
      );
    case "Ejected":
      return isShell(x.shell);
    case "TurnSkipped":
    case "HealCut":
      return isPlayerIdx(x.player);
    case "RoundEnded":
      return (
        isPlayerIdx(x.winner) &&
        Array.isArray(x.score) &&
        x.score.length === 2 &&
        isUint8(x.score[0]) &&
        isUint8(x.score[1])
      );
    case "MatchEnded":
      return (
        isPlayerIdx(x.winner) &&
        typeof x.reward === "string" &&
        /^\d+$/.test(x.reward)
      );
    case "TimeoutClaimed":
      return isPlayerIdx(x.by);
    default:
      return false;
  }
}
