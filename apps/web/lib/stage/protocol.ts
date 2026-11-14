import type { Action, MatchView, Shell, Target } from "../nearTypes";
import { DEFAULT_GAME_CONFIG } from "../game/config";

/**
 * Intent emitted from the stage / input layer toward the intent flow & transport.
 */
export type Intent =
  | {
      id: string;
      kind: "fire";
      target: Target;
    }
  | {
      id: string;
      kind: "item";
      slot: number;
      stealSlot?: number;
    };

export type TxStatus = "preparing" | "sent" | "confirmed" | "failed";

/**
 * Messages flowing into the 2.5D/3D stage boundary (CLIENT-CONTRACT / PLAN-F3 §2).
 */
export type StageInput =
  | {
      type: "init";
      you: 0 | 1;
      snapshot: MatchView;
      mode: "practice" | "near";
    }
  | {
      type: "snapshot";
      snapshot: MatchView;
    }
  | {
      type: "actions";
      actions: Action[];
      seq: number;
    }
  | {
      type: "tx";
      intentId: string;
      status: TxStatus;
      reason?: string;
    }
  | {
      type: "private";
      pos: number;
      shell: Shell;
    }
  | {
      type: "clock";
      nowMs: number;
      deadlineMs: number;
    };

/**
 * Messages emitted out of the stage boundary.
 */
export type StageOutput =
  | { type: "ready" }
  | { type: "intent"; intent: Intent }
  | { type: "anim_idle"; seq?: number };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isValidSlot(x: unknown, maxItems: number): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= 0 && x < maxItems;
}

/**
 * Validates an untrusted StageOutput intent payload.
 * Returns a normalized Intent or null on any invalid field or out-of-range slot.
 */
export function parseIntent(
  x: unknown,
  maxItems: number = DEFAULT_GAME_CONFIG.max_items,
): Intent | null {
  if (!isRecord(x)) {
    return null;
  }
  if (typeof x.id !== "string" || x.id.trim().length === 0) {
    return null;
  }
  if (x.kind === "fire") {
    if (x.target !== "SelfTarget" && x.target !== "Opponent") {
      return null;
    }
    return {
      id: x.id,
      kind: "fire",
      target: x.target,
    };
  }
  if (x.kind === "item") {
    if (!isValidSlot(x.slot, maxItems)) {
      return null;
    }
    if (x.stealSlot !== undefined) {
      if (!isValidSlot(x.stealSlot, maxItems)) {
        return null;
      }
      return {
        id: x.id,
        kind: "item",
        slot: x.slot,
        stealSlot: x.stealSlot,
      };
    }
    return {
      id: x.id,
      kind: "item",
      slot: x.slot,
    };
  }
  return null;
}
