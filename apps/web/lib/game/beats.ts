import type { Action, Item, Target } from "../nearTypes";
import type { GameModel } from "./model";
import { redactAction } from "./privacy";

export type BeatId =
  | "round_intro"
  | "shells_reveal"
  | "shells_load"
  | "items_deal"
  | "gun_pickup"
  | "aim_opp"
  | "aim_self"
  | "tension_hold"
  | "tension_stall"
  | "tension_release"
  | "fire_live_opp"
  | "fire_live_self"
  | "fire_blank"
  | "cylinder_advance"
  | "gun_putdown"
  | "opponent_knockback_return"
  | "rival_take"
  | "rival_aim_opp"
  | "rival_aim_self"
  | "item_loupe"
  | "item_pipe"
  | "item_flask"
  | "item_shackle"
  | "item_hacksaw"
  | "barrel_restore"
  | "item_ticker"
  | "item_magnet"
  | "item_lockpick"
  | "item_tincture"
  | "turn_skipped"
  | "heal_cut"
  | "round_end"
  | "match_end"
  | "rollback_gun"
  | "rollback_item";

export interface BeatLayers {
  background?: boolean;
  rival?: boolean;
  table?: boolean;
  revolver?: boolean;
  fx?: boolean;
  hud?: boolean;
}

export interface BeatCatalogEntry {
  id: BeatId;
  designId: string;
  durationMs: number;
  layers: BeatLayers;
}

export interface Beat extends BeatCatalogEntry {
  params?: Record<string, unknown>;
}

/**
 * Beat duration & layer catalog aligned with DESIGN §3.7 (revolver-adapted).
 */
export const BEAT_CATALOG: Readonly<Record<BeatId, BeatCatalogEntry>> = {
  round_intro: {
    id: "round_intro",
    designId: "A02",
    durationMs: 2500,
    layers: { background: true, hud: true },
  },
  shells_reveal: {
    id: "shells_reveal",
    designId: "A03",
    durationMs: 2500,
    layers: { table: true, hud: true },
  },
  shells_load: {
    id: "shells_load",
    designId: "A04",
    durationMs: 2000,
    layers: { revolver: true, table: true },
  },
  items_deal: {
    id: "items_deal",
    designId: "A05",
    durationMs: 350,
    layers: { table: true, rival: true, hud: true },
  },
  gun_pickup: {
    id: "gun_pickup",
    designId: "A06",
    durationMs: 500,
    layers: { revolver: true },
  },
  aim_opp: {
    id: "aim_opp",
    designId: "A07",
    durationMs: 400,
    layers: { revolver: true },
  },
  aim_self: {
    id: "aim_self",
    designId: "A08",
    durationMs: 500,
    layers: { revolver: true },
  },
  tension_hold: {
    id: "tension_hold",
    designId: "A09",
    durationMs: 700,
    layers: { revolver: true, fx: true },
  },
  tension_stall: {
    id: "tension_stall",
    designId: "A09",
    durationMs: 4000,
    layers: { revolver: true, hud: true },
  },
  tension_release: {
    id: "tension_release",
    designId: "A09",
    durationMs: 150,
    layers: { revolver: true },
  },
  fire_live_opp: {
    id: "fire_live_opp",
    designId: "A10",
    durationMs: 1600,
    layers: { revolver: true, rival: true, fx: true, hud: true },
  },
  fire_live_self: {
    id: "fire_live_self",
    designId: "A11",
    durationMs: 3000,
    layers: { revolver: true, fx: true, hud: true },
  },
  fire_blank: {
    id: "fire_blank",
    designId: "A12",
    durationMs: 800,
    layers: { revolver: true, fx: true },
  },
  cylinder_advance: {
    id: "cylinder_advance",
    designId: "A13",
    durationMs: 800,
    layers: { revolver: true, fx: true },
  },
  gun_putdown: {
    id: "gun_putdown",
    designId: "A14",
    durationMs: 500,
    layers: { revolver: true },
  },
  opponent_knockback_return: {
    id: "opponent_knockback_return",
    designId: "A15",
    durationMs: 1200,
    layers: { rival: true, fx: true },
  },
  rival_take: {
    id: "rival_take",
    designId: "A06",
    durationMs: 500,
    layers: { rival: true, revolver: true },
  },
  rival_aim_opp: {
    id: "rival_aim_opp",
    designId: "A07",
    durationMs: 400,
    layers: { rival: true, revolver: true },
  },
  rival_aim_self: {
    id: "rival_aim_self",
    designId: "A08",
    durationMs: 500,
    layers: { rival: true, revolver: true },
  },
  item_loupe: {
    id: "item_loupe",
    designId: "A17",
    durationMs: 1400,
    layers: { table: true, rival: true, fx: true },
  },
  item_pipe: {
    id: "item_pipe",
    designId: "A18",
    durationMs: 1600,
    layers: { table: true, rival: true, fx: true, hud: true },
  },
  item_flask: {
    id: "item_flask",
    designId: "A19",
    durationMs: 1800,
    layers: { revolver: true, table: true, fx: true },
  },
  item_shackle: {
    id: "item_shackle",
    designId: "A20",
    durationMs: 1400,
    layers: { table: true, rival: true, fx: true, hud: true },
  },
  item_hacksaw: {
    id: "item_hacksaw",
    designId: "A21",
    durationMs: 1600,
    layers: { revolver: true, table: true, fx: true },
  },
  barrel_restore: {
    id: "barrel_restore",
    designId: "A22",
    durationMs: 400,
    layers: { revolver: true },
  },
  item_ticker: {
    id: "item_ticker",
    designId: "A23",
    durationMs: 1600,
    layers: { table: true, rival: true, fx: true },
  },
  item_magnet: {
    id: "item_magnet",
    designId: "A24",
    durationMs: 1200,
    layers: { revolver: true, table: true, fx: true },
  },
  item_lockpick: {
    id: "item_lockpick",
    designId: "A25",
    durationMs: 1000,
    layers: { table: true, rival: true, fx: true },
  },
  item_tincture: {
    id: "item_tincture",
    designId: "A26",
    durationMs: 1600,
    layers: { table: true, rival: true, fx: true, hud: true },
  },
  turn_skipped: {
    id: "turn_skipped",
    designId: "A20",
    durationMs: 800,
    layers: { rival: true, fx: true, hud: true },
  },
  heal_cut: {
    id: "heal_cut",
    designId: "A27",
    durationMs: 1200,
    layers: { hud: true, fx: true },
  },
  round_end: {
    id: "round_end",
    designId: "A28",
    durationMs: 2500,
    layers: { background: true, rival: true, hud: true },
  },
  match_end: {
    id: "match_end",
    designId: "A29",
    durationMs: 4000,
    layers: { background: true, rival: true, hud: true, fx: true },
  },
  rollback_gun: {
    id: "rollback_gun",
    designId: "A14",
    durationMs: 400,
    layers: { revolver: true, hud: true },
  },
  rollback_item: {
    id: "rollback_item",
    designId: "A14",
    durationMs: 300,
    layers: { table: true, hud: true },
  },
};

export function createBeat(
  id: BeatId,
  params?: Record<string, unknown>,
  durationOverrideMs?: number,
): Beat {
  const entry = BEAT_CATALOG[id];
  return {
    id: entry.id,
    designId: entry.designId,
    durationMs: durationOverrideMs ?? entry.durationMs,
    layers: { ...entry.layers },
    ...(params !== undefined ? { params } : {}),
  };
}

export interface PlanBeatsContext {
  you: number;
  localPrepPlayed: boolean;
  model: GameModel;
}

const ITEM_BEAT_MAP: Readonly<Record<Item, BeatId>> = {
  Loupe: "item_loupe",
  Pipe: "item_pipe",
  Flask: "item_flask",
  Shackle: "item_shackle",
  Hacksaw: "item_hacksaw",
  Ticker: "item_ticker",
  Magnet: "item_magnet",
  Lockpick: "item_lockpick",
  Tincture: "item_tincture",
};

function resolveFireBeatId(
  isLocal: boolean,
  target: Target,
  shell: "Live" | "Blank",
): BeatId {
  if (shell === "Blank") {
    return "fire_blank";
  }
  if (isLocal) {
    return target === "Opponent" ? "fire_live_opp" : "fire_live_self";
  }
  // From opponent's perspective, Opponent target hits `you` (self-hit camera), SelfTarget hits rival.
  return target === "Opponent" ? "fire_live_self" : "fire_live_opp";
}

/**
 * Translates a single contract Action into the sequential Beat list for the stage Director.
 */
export function planBeats(rawAction: Action, ctx: PlanBeatsContext): Beat[] {
  const action = redactAction(rawAction, ctx.you);

  switch (action.kind) {
    case "LoadStarted": {
      return [
        createBeat("shells_reveal", {
          live: action.live,
          blank: action.blank,
          total: action.total,
        }),
        createBeat("shells_load", { total: action.total }),
      ];
    }
    case "ItemsDealt": {
      const durationMs = Math.max(350, action.items.length * BEAT_CATALOG.items_deal.durationMs);
      return [
        createBeat(
          "items_deal",
          { player: action.player, isLocal: action.player === ctx.you, items: action.items },
          durationMs,
        ),
      ];
    }
    case "ItemUsed": {
      const isLocal = action.player === ctx.you;
      const beatId = ITEM_BEAT_MAP[action.item];
      const baseParams: Record<string, unknown> = {
        actor: action.player,
        isLocal,
        item: action.item,
        slot: action.slot,
      };
      if (action.item === "Flask") {
        baseParams.mechanic = "crane_open_eject";
        if (action.result.kind === "Ejected") {
          baseParams.shell = action.result.shell;
        }
      } else if (action.result.kind === "Private" && isLocal) {
        baseParams.pos = action.result.pos;
        baseParams.shell = action.result.shell;
      } else if (
        action.result.kind === "Healed" ||
        action.result.kind === "Damaged"
      ) {
        baseParams.amount = action.result.amount;
        baseParams.outcome = action.result.kind;
      }
      return [createBeat(beatId, baseParams)];
    }
    case "Shot": {
      const isLocal = action.player === ctx.you;
      const beats: Beat[] = [];
      if (isLocal) {
        if (!ctx.localPrepPlayed) {
          beats.push(createBeat("gun_pickup", { isLocal: true }));
          beats.push(
            createBeat(action.target === "Opponent" ? "aim_opp" : "aim_self", {
              isLocal: true,
              target: action.target,
            }),
          );
        }
        beats.push(createBeat("tension_release", { isLocal: true }));
      } else {
        beats.push(createBeat("rival_take", { isLocal: false }));
        beats.push(
          createBeat(
            action.target === "Opponent" ? "rival_aim_opp" : "rival_aim_self",
            { isLocal: false, target: action.target },
          ),
        );
      }

      const fireId = resolveFireBeatId(isLocal, action.target, action.shell);
      beats.push(
        createBeat(fireId, {
          actor: action.player,
          isLocal,
          target: action.target,
          shell: action.shell,
          damage: action.damage,
        }),
      );
      beats.push(createBeat("cylinder_advance", { shell: action.shell }));

      if (ctx.model.saw) {
        beats.push(createBeat("barrel_restore", { isLocal }));
      }

      const victim = action.target === "Opponent" ? 1 - action.player : action.player;
      const lethal = ctx.model.hp[victim] - action.damage <= 0;
      const keepsTurn =
        !lethal &&
        action.shell === "Blank" &&
        action.target === "SelfTarget" &&
        ctx.model.remaining > 1;

      if (!keepsTurn) {
        beats.push(createBeat("gun_putdown", { isLocal }));
      }
      return beats;
    }
    case "Ejected": {
      return [];
    }
    case "TurnSkipped": {
      return [
        createBeat("turn_skipped", {
          player: action.player,
          isLocal: action.player === ctx.you,
        }),
      ];
    }
    case "HealCut": {
      return [
        createBeat("heal_cut", {
          player: action.player,
          isLocal: action.player === ctx.you,
        }),
      ];
    }
    case "RoundEnded": {
      return [
        createBeat("round_end", {
          winner: action.winner,
          score: action.score,
        }),
      ];
    }
    case "MatchEnded": {
      return [
        createBeat("match_end", {
          winner: action.winner,
          reward: action.reward,
        }),
      ];
    }
    case "TimeoutClaimed": {
      return [];
    }
  }
}
