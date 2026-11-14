"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StageCue } from "@/hooks/useSound";
import { planBeats, type Beat, type BeatId } from "@/lib/game/beats";
import { Director } from "@/lib/game/director";
import { applyAction, fromSnapshot, type GameModel } from "@/lib/game/model";
import type { Action, Item, MatchView, Shell, Target } from "@/lib/nearTypes";
import type { RivalClipId } from "@/lib/stage/assets";
import { clipForBeat, nextClipOnAim, resolveClipEnded } from "@/lib/stage/clipSchedule";
import {
  INITIAL_FX_STATE,
  createDefaultStageVisual,
  type StageFxState,
  type StageVisualState,
} from "./types";

export function visualFromModel(
  model: GameModel,
  you: 0 | 1,
  prev?: StageVisualState,
): StageVisualState {
  return {
    round: model.round,
    score: [model.score[0], model.score[1]],
    hp: [model.hp[0], model.hp[1]],
    maxHp: model.maxHp,
    healCut: [model.healCut[0], model.healCut[1]],
    items: [[...model.items[0]], [...model.items[1]]],
    announcedLive: model.announcedLive,
    announcedBlank: model.announcedBlank,
    remaining: model.remaining,
    knownShells: new Map(model.knownShells),
    turn: model.turn,
    you,
    sawActive: model.saw,
    shackledSeat: model.shackled,
    gunHolder: prev?.gunHolder ?? "table",
    gunAim: prev?.gunAim ?? 0,
    cylinderIndex: prev?.cylinderIndex ?? 0,
    craneOpen: false,
    hammerCocked: false,
    ejectedShell: null,
    phase: model.phase,
    winner: model.winner,
  };
}

function shiftKnownMap(known: ReadonlyMap<number, Shell>): Map<number, Shell> {
  const next = new Map<number, Shell>();
  for (const [pos, shell] of known.entries()) {
    if (pos > 0) {
      next.set(pos - 1, shell);
    }
  }
  return next;
}

export interface UseDirectorOptions {
  you: 0 | 1;
  initialVisual?: StageVisualState;
  playCue?: (cue: StageCue) => void;
  onIdle?: () => void;
  onModelSyncedFromSnapshot?: (model: GameModel) => void;
}

export function useDirector({
  you,
  initialVisual,
  playCue,
  onIdle,
  onModelSyncedFromSnapshot,
}: UseDirectorOptions) {
  const [visual, setVisual] = useState<StageVisualState>(
    () => initialVisual ?? createDefaultStageVisual(you),
  );
  const [fx, setFx] = useState<StageFxState>(INITIAL_FX_STATE);
  const [rivalClip, setRivalClip] = useState<RivalClipId>("idle");
  const [activeBeatId, setActiveBeatId] = useState<BeatId | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const youRef = useRef<0 | 1>(you);
  const playCueRef = useRef(playCue);
  const onIdleRef = useRef(onIdle);
  const onSnapModelRef = useRef(onModelSyncedFromSnapshot);
  const visualRef = useRef<StageVisualState>(visual);
  const timersRef = useRef<Set<number>>(new Set());
  const epochRef = useRef(0);
  const pendingStealFromRef = useRef<number | null>(null);

  useEffect(() => {
    youRef.current = you;
  }, [you]);
  useEffect(() => {
    playCueRef.current = playCue;
  }, [playCue]);
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);
  useEffect(() => {
    onSnapModelRef.current = onModelSyncedFromSnapshot;
  }, [onModelSyncedFromSnapshot]);

  const commitVisual = useCallback(
    (updater: (prev: StageVisualState) => StageVisualState) => {
      setVisual((prev) => {
        const next = updater(prev);
        visualRef.current = next;
        return next;
      });
    },
    [],
  );

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current.clear();
  }, []);

  const waitMs = useCallback((ms: number, epoch: number): Promise<boolean> => {
    if (ms <= 0) {
      return Promise.resolve(epochRef.current === epoch);
    }
    return new Promise<boolean>((resolve) => {
      const id = window.setTimeout(() => {
        timersRef.current.delete(id);
        resolve(epochRef.current === epoch);
      }, ms);
      timersRef.current.add(id);
    });
  }, []);

  const scheduleFxTimeout = useCallback((fn: () => void, ms: number, epoch: number) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      if (epochRef.current === epoch) {
        fn();
      }
    }, ms);
    timersRef.current.add(id);
  }, []);

  const executeGenericItemBeat = useCallback(
    async (beat: Beat, epoch: number) => {
      const p = beat.params ?? {};
      const actor = typeof p.actor === "number" ? p.actor : youRef.current;
      const isLocal = p.isLocal === true;
      const item = p.item as Item | undefined;
      const slot = typeof p.slot === "number" ? p.slot : 0;
      const outcome = p.outcome as "Healed" | "Damaged" | undefined;
      const amount = typeof p.amount === "number" ? p.amount : 0;

      playCueRef.current?.("item_use");

      commitVisual((prev) => {
        const items: [Item[], Item[]] = [[...prev.items[0]], [...prev.items[1]]];
        if (pendingStealFromRef.current !== null) {
          const stolenFrom = pendingStealFromRef.current;
          items[stolenFrom].splice(slot, 1);
          pendingStealFromRef.current = null;
        } else {
          items[actor].splice(slot, 1);
        }

        let nextHp: [number, number] = [prev.hp[0], prev.hp[1]];
        const nextKnown = new Map(prev.knownShells);

        if (item === "Ticker" && isLocal && typeof p.pos === "number" && p.shell) {
          nextKnown.set(p.pos, p.shell as Shell);
        } else if (item === "Magnet") {
          nextKnown.clear();
        } else if (item === "Lockpick") {
          pendingStealFromRef.current = 1 - actor;
        } else if (item === "Tincture") {
          if (outcome === "Healed") {
            nextHp = [
              actor === 0 ? Math.min(prev.maxHp, prev.hp[0] + amount) : prev.hp[0],
              actor === 1 ? Math.min(prev.maxHp, prev.hp[1] + amount) : prev.hp[1],
            ];
          } else if (outcome === "Damaged") {
            nextHp = [
              actor === 0 ? Math.max(0, prev.hp[0] - amount) : prev.hp[0],
              actor === 1 ? Math.max(0, prev.hp[1] - amount) : prev.hp[1],
            ];
          }
        }

        return {
          ...prev,
          items,
          hp: nextHp,
          knownShells: nextKnown,
        };
      });

      const clip = clipForBeat(beat.id, p);
      if (clip) {
        setRivalClip(clip);
      }

      let banner = `${isLocal ? "YOU" : "RIVAL"}: ${item ?? "ITEM"}`;
      let tone: StageFxState["bannerTone"] = "brass";
      if (item === "Tincture" && outcome === "Damaged") {
        banner = `${isLocal ? "YOU" : "RIVAL"}: TINCTURE -${amount} HP`;
        tone = "alert";
      } else if (item === "Tincture" && outcome === "Healed") {
        banner = `${isLocal ? "YOU" : "RIVAL"}: TINCTURE +${amount} HP`;
        tone = "patina";
      } else if (item === "Ticker" && isLocal && typeof p.pos === "number" && p.shell) {
        banner = `TICKER #${p.pos + 1}: ${p.shell === "Live" ? "LIVE" : "BLANK"}`;
      }

      setFx((prev) => ({
        ...prev,
        bannerText: banner,
        bannerTone: tone,
      }));

      await waitMs(beat.durationMs, epoch);
      if (epochRef.current === epoch) {
        setFx((prev) => ({ ...prev, bannerText: null }));
      }
    },
    [commitVisual, waitMs],
  );

  const executeBeat = useCallback(
    async (beat: Beat): Promise<void> => {
      const epoch = epochRef.current;
      const p = beat.params ?? {};
      const currentYou = youRef.current;
      setActiveBeatId(beat.id);

      switch (beat.id) {
        case "round_intro": {
          playCueRef.current?.("ui_select");
          setFx((prev) => ({
            ...prev,
            bannerText: `ROUND ${visualRef.current.round}`,
            bannerTone: "brass",
          }));
          await waitMs(beat.durationMs, epoch);
          if (epochRef.current === epoch) {
            setFx((prev) => ({ ...prev, bannerText: null }));
          }
          break;
        }

        case "shells_reveal": {
          playCueRef.current?.("ui_select");
          const live = typeof p.live === "number" ? p.live : 0;
          const blank = typeof p.blank === "number" ? p.blank : 0;
          const total = typeof p.total === "number" ? p.total : live + blank;

          commitVisual((prev) => {
            const needRoundReset = prev.hp[0] <= 0 || prev.hp[1] <= 0;
            return {
              ...prev,
              round: needRoundReset ? prev.round + 1 : prev.round,
              hp: needRoundReset ? [prev.maxHp, prev.maxHp] : prev.hp,
              healCut: needRoundReset ? [false, false] : prev.healCut,
              items: needRoundReset ? [[], []] : prev.items,
              announcedLive: live,
              announcedBlank: blank,
              remaining: total,
              knownShells: new Map(),
              shackledSeat: null,
              gunHolder: "table",
              gunAim: 0,
            };
          });

          setFx((prev) => ({
            ...prev,
            bannerText: `${live} LIVE · ${blank} BLANK`,
            bannerTone: "brass",
          }));
          await waitMs(beat.durationMs, epoch);
          if (epochRef.current === epoch) {
            setFx((prev) => ({ ...prev, bannerText: null }));
          }
          break;
        }

        case "shells_load": {
          playCueRef.current?.("cylinder_spin");
          setFx((prev) => ({
            ...prev,
            bannerText: "LOADING 8 CHAMBERS",
            bannerTone: "neutral",
          }));
          commitVisual((prev) => ({
            ...prev,
            cylinderIndex: (prev.cylinderIndex + 1) % 8,
          }));
          await waitMs(beat.durationMs, epoch);
          if (epochRef.current === epoch) {
            setFx((prev) => ({ ...prev, bannerText: null }));
          }
          break;
        }

        case "items_deal": {
          playCueRef.current?.("item_use");
          const player = typeof p.player === "number" ? p.player : 0;
          const dealt = Array.isArray(p.items) ? (p.items as Item[]) : [];
          commitVisual((prev) => {
            const items: [Item[], Item[]] = [[...prev.items[0]], [...prev.items[1]]];
            items[player] = [...items[player], ...dealt];
            return { ...prev, items };
          });
          setFx((prev) => ({
            ...prev,
            bannerText: `${player === currentYou ? "YOUR" : "RIVAL'S"} ITEMS (+${dealt.length})`,
            bannerTone: "brass",
          }));
          await waitMs(beat.durationMs, epoch);
          if (epochRef.current === epoch) {
            setFx((prev) => ({ ...prev, bannerText: null }));
          }
          break;
        }

        case "gun_pickup": {
          playCueRef.current?.("gun_pickup");
          commitVisual((prev) => ({
            ...prev,
            gunHolder: "local",
            gunAim: 0,
            hammerCocked: true,
          }));
          await waitMs(beat.durationMs, epoch);
          break;
        }

        case "aim_opp": {
          commitVisual((prev) => ({
            ...prev,
            gunHolder: "local",
            gunAim: 1,
          }));
          setRivalClip((curr) =>
            nextClipOnAim(curr, 1, false, visualRef.current.shackledSeat === 1 - currentYou),
          );
          await waitMs(beat.durationMs, epoch);
          break;
        }

        case "aim_self": {
          commitVisual((prev) => ({
            ...prev,
            gunHolder: "local",
            gunAim: -1,
          }));
          await waitMs(beat.durationMs, epoch);
          break;
        }

        case "tension_hold": {
          playCueRef.current?.("heartbeat");
          await waitMs(beat.durationMs, epoch);
          break;
        }

        case "tension_stall": {
          const caption = typeof p.caption === "string" ? p.caption : "mechanism jammed";
          setFx((prev) => ({ ...prev, stallCaption: caption }));
          await waitMs(Math.min(beat.durationMs, 600), epoch);
          break;
        }

        case "tension_release": {
          setFx((prev) => ({ ...prev, stallCaption: null }));
          commitVisual((prev) => ({ ...prev, hammerCocked: false }));
          await waitMs(beat.durationMs, epoch);
          break;
        }

        case "rival_take": {
          playCueRef.current?.("trigger_cock");
          commitVisual((prev) => ({
            ...prev,
            gunHolder: "rival",
            gunAim: 0,
            hammerCocked: true,
          }));
          setRivalClip("take_gun");
          await waitMs(beat.durationMs, epoch);
          break;
        }

        case "rival_aim_opp": {
          setRivalClip("aim_you");
          await waitMs(beat.durationMs, epoch);
          break;
        }

        case "rival_aim_self": {
          setRivalClip("aim_self");
          await waitMs(beat.durationMs, epoch);
          break;
        }

        case "fire_live_opp": {
          playCueRef.current?.("gunshot_live");
          const actor = typeof p.actor === "number" ? p.actor : currentYou;
          const target = (p.target as Target | undefined) ?? "Opponent";
          const damage = typeof p.damage === "number" ? p.damage : 1;
          const victim = target === "Opponent" ? 1 - actor : actor;

          commitVisual((prev) => ({
            ...prev,
            hammerCocked: false,
            hp: [
              victim === 0 ? Math.max(0, prev.hp[0] - damage) : prev.hp[0],
              victim === 1 ? Math.max(0, prev.hp[1] - damage) : prev.hp[1],
            ],
          }));

          const clip = clipForBeat("fire_live_opp", p);
          if (clip) setRivalClip(clip);

          setFx((prev) => ({
            ...prev,
            muzzleFlash: true,
            shake: "light",
            bannerText: `LIVE ROUND! -${damage} HP`,
            bannerTone: "alert",
          }));

          scheduleFxTimeout(() => {
            setFx((prev) => ({ ...prev, muzzleFlash: false, shake: "none" }));
          }, 180, epoch);

          await waitMs(beat.durationMs, epoch);
          if (epochRef.current === epoch) {
            setFx((prev) => ({ ...prev, bannerText: null }));
          }
          break;
        }

        case "fire_live_self": {
          playCueRef.current?.("gunshot_live");
          playCueRef.current?.("player_hit");
          const actor = typeof p.actor === "number" ? p.actor : currentYou;
          const target = (p.target as Target | undefined) ?? "SelfTarget";
          const damage = typeof p.damage === "number" ? p.damage : 1;
          const victim = target === "Opponent" ? 1 - actor : actor;

          commitVisual((prev) => ({
            ...prev,
            hammerCocked: false,
            hp: [
              victim === 0 ? Math.max(0, prev.hp[0] - damage) : prev.hp[0],
              victim === 1 ? Math.max(0, prev.hp[1] - damage) : prev.hp[1],
            ],
          }));

          // White flash (120ms) -> 1.5s black -> blurry recover (~1380ms)
          setFx((prev) => ({
            ...prev,
            muzzleFlash: true,
            shake: "heavy",
            blackoutStage: "white",
          }));
          if (!(await waitMs(120, epoch))) break;

          setFx((prev) => ({
            ...prev,
            muzzleFlash: false,
            shake: "none",
            blackoutStage: "black",
          }));
          if (!(await waitMs(1500, epoch))) break;

          setFx((prev) => ({
            ...prev,
            blackoutStage: "recover",
            bannerText: `YOU'RE HIT (-${damage} HP)`,
            bannerTone: "alert",
          }));
          const rem = Math.max(200, beat.durationMs - 1620);
          await waitMs(rem, epoch);
          if (epochRef.current === epoch) {
            setFx((prev) => ({
              ...prev,
              blackoutStage: "none",
              bannerText: null,
            }));
          }
          break;
        }

        case "fire_blank": {
          playCueRef.current?.("click_blank");
          const clip = clipForBeat("fire_blank", p);
          if (clip) setRivalClip(clip);
          commitVisual((prev) => ({ ...prev, hammerCocked: false }));
          setFx((prev) => ({
            ...prev,
            bannerText: "CLICK — BLANK",
            bannerTone: "neutral",
          }));
          await waitMs(beat.durationMs, epoch);
          if (epochRef.current === epoch) {
            setFx((prev) => ({ ...prev, bannerText: null }));
          }
          break;
        }

        case "cylinder_advance": {
          playCueRef.current?.("cylinder_spin");
          commitVisual((prev) => ({
            ...prev,
            cylinderIndex: (prev.cylinderIndex + 1) % 8,
            remaining: Math.max(0, prev.remaining - 1),
            knownShells: shiftKnownMap(prev.knownShells),
          }));
          await waitMs(beat.durationMs, epoch);
          break;
        }

        case "barrel_restore": {
          commitVisual((prev) => ({ ...prev, sawActive: false }));
          await waitMs(beat.durationMs, epoch);
          break;
        }

        case "gun_putdown": {
          const isLocal = p.isLocal === true;
          const actor = isLocal ? currentYou : 1 - currentYou;
          const target = (p.target as Target | undefined) ?? "Opponent";
          const shell = p.shell as Shell | undefined;
          const keepsTurn = shell === "Blank" && target === "SelfTarget";

          commitVisual((prev) => ({
            ...prev,
            gunHolder: "table",
            gunAim: 0,
            hammerCocked: false,
            craneOpen: false,
            turn: keepsTurn ? actor : 1 - actor,
          }));
          if (!isLocal) {
            setRivalClip(
              visualRef.current.shackledSeat === 1 - currentYou ? "shackled" : "idle",
            );
          }
          await waitMs(beat.durationMs, epoch);
          break;
        }

        case "opponent_knockback_return": {
          setRivalClip("recover");
          await waitMs(beat.durationMs, epoch);
          break;
        }

        case "item_loupe": {
          playCueRef.current?.("item_use");
          const actor = typeof p.actor === "number" ? p.actor : currentYou;
          const isLocal = p.isLocal === true;
          const slot = typeof p.slot === "number" ? p.slot : 0;
          const shell = p.shell as Shell | undefined;

          commitVisual((prev) => {
            const items: [Item[], Item[]] = [[...prev.items[0]], [...prev.items[1]]];
            if (pendingStealFromRef.current !== null) {
              items[pendingStealFromRef.current].splice(slot, 1);
              pendingStealFromRef.current = null;
            } else {
              items[actor].splice(slot, 1);
            }
            const knownShells = new Map(prev.knownShells);
            if (isLocal && shell) {
              knownShells.set(0, shell);
            }
            return { ...prev, items, knownShells };
          });

          if (!isLocal) {
            setRivalClip("use_hands");
          }
          setFx((prev) => ({
            ...prev,
            loupeRevealShell: isLocal && shell ? shell : null,
            bannerText: isLocal ? null : "RIVAL USED LOUPE",
            bannerTone: "brass",
          }));

          await waitMs(beat.durationMs, epoch);
          if (epochRef.current === epoch) {
            setFx((prev) => ({
              ...prev,
              loupeRevealShell: null,
              bannerText: null,
            }));
          }
          break;
        }

        case "item_pipe": {
          playCueRef.current?.("item_use");
          const actor = typeof p.actor === "number" ? p.actor : currentYou;
          const isLocal = p.isLocal === true;
          const slot = typeof p.slot === "number" ? p.slot : 0;
          const amount = typeof p.amount === "number" ? p.amount : 1;

          commitVisual((prev) => {
            const items: [Item[], Item[]] = [[...prev.items[0]], [...prev.items[1]]];
            if (pendingStealFromRef.current !== null) {
              items[pendingStealFromRef.current].splice(slot, 1);
              pendingStealFromRef.current = null;
            } else {
              items[actor].splice(slot, 1);
            }
            return {
              ...prev,
              items,
              hp: [
                actor === 0 ? Math.min(prev.maxHp, prev.hp[0] + amount) : prev.hp[0],
                actor === 1 ? Math.min(prev.maxHp, prev.hp[1] + amount) : prev.hp[1],
              ],
            };
          });

          if (!isLocal) setRivalClip("use_mouth");
          setFx((prev) => ({
            ...prev,
            bannerText: `${isLocal ? "YOU" : "RIVAL"}: PIPE +${amount} HP`,
            bannerTone: "patina",
          }));
          await waitMs(beat.durationMs, epoch);
          if (epochRef.current === epoch) {
            setFx((prev) => ({ ...prev, bannerText: null }));
          }
          break;
        }

        case "item_flask": {
          playCueRef.current?.("item_use");
          playCueRef.current?.("shell_eject");
          const actor = typeof p.actor === "number" ? p.actor : currentYou;
          const isLocal = p.isLocal === true;
          const slot = typeof p.slot === "number" ? p.slot : 0;
          const shell = p.shell as Shell | undefined;

          commitVisual((prev) => {
            const items: [Item[], Item[]] = [[...prev.items[0]], [...prev.items[1]]];
            if (pendingStealFromRef.current !== null) {
              items[pendingStealFromRef.current].splice(slot, 1);
              pendingStealFromRef.current = null;
            } else {
              items[actor].splice(slot, 1);
            }
            return {
              ...prev,
              items,
              craneOpen: true,
              ejectedShell: shell ?? null,
              remaining: Math.max(0, prev.remaining - 1),
              cylinderIndex: (prev.cylinderIndex + 1) % 8,
              knownShells: shiftKnownMap(prev.knownShells),
            };
          });

          if (!isLocal) setRivalClip("use_hands");
          setFx((prev) => ({
            ...prev,
            bannerText: shell
              ? `FLASK: ${shell === "Live" ? "LIVE" : "BLANK"} EJECTED`
              : "FLASK: ROUND EJECTED",
            bannerTone: shell === "Live" ? "alert" : "brass",
          }));

          if (!(await waitMs(Math.round(beat.durationMs * 0.65), epoch))) break;
          commitVisual((prev) => ({ ...prev, craneOpen: false, ejectedShell: null }));
          await waitMs(Math.round(beat.durationMs * 0.35), epoch);
          if (epochRef.current === epoch) {
            setFx((prev) => ({ ...prev, bannerText: null }));
          }
          break;
        }

        case "item_shackle": {
          playCueRef.current?.("shackle_lock");
          playCueRef.current?.("item_use");
          const actor = typeof p.actor === "number" ? p.actor : currentYou;
          const isLocal = p.isLocal === true;
          const slot = typeof p.slot === "number" ? p.slot : 0;
          const targetSeat = 1 - actor;

          commitVisual((prev) => {
            const items: [Item[], Item[]] = [[...prev.items[0]], [...prev.items[1]]];
            if (pendingStealFromRef.current !== null) {
              items[pendingStealFromRef.current].splice(slot, 1);
              pendingStealFromRef.current = null;
            } else {
              items[actor].splice(slot, 1);
            }
            return { ...prev, items, shackledSeat: targetSeat };
          });

          if (targetSeat !== currentYou) {
            setRivalClip("shackled");
          } else if (!isLocal) {
            setRivalClip("use_hands");
          }
          setFx((prev) => ({
            ...prev,
            bannerText: "SHACKLED",
            bannerTone: "brass",
          }));
          await waitMs(beat.durationMs, epoch);
          if (epochRef.current === epoch) {
            setFx((prev) => ({ ...prev, bannerText: null }));
          }
          break;
        }

        case "item_hacksaw": {
          playCueRef.current?.("hacksaw_cut");
          playCueRef.current?.("item_use");
          const actor = typeof p.actor === "number" ? p.actor : currentYou;
          const isLocal = p.isLocal === true;
          const slot = typeof p.slot === "number" ? p.slot : 0;

          commitVisual((prev) => {
            const items: [Item[], Item[]] = [[...prev.items[0]], [...prev.items[1]]];
            if (pendingStealFromRef.current !== null) {
              items[pendingStealFromRef.current].splice(slot, 1);
              pendingStealFromRef.current = null;
            } else {
              items[actor].splice(slot, 1);
            }
            return { ...prev, items, sawActive: true };
          });

          if (!isLocal) setRivalClip("use_hands");
          setFx((prev) => ({
            ...prev,
            bannerText: "BARREL SAWN — 2x DAMAGE",
            bannerTone: "alert",
          }));
          await waitMs(beat.durationMs, epoch);
          if (epochRef.current === epoch) {
            setFx((prev) => ({ ...prev, bannerText: null }));
          }
          break;
        }

        case "item_ticker":
        case "item_magnet":
        case "item_lockpick":
        case "item_tincture": {
          await executeGenericItemBeat(beat, epoch);
          break;
        }

        case "turn_skipped": {
          playCueRef.current?.("ui_select");
          const skippedPlayer = typeof p.player === "number" ? p.player : 1 - currentYou;
          commitVisual((prev) => ({
            ...prev,
            shackledSeat: null,
            turn: 1 - skippedPlayer,
          }));
          if (skippedPlayer !== currentYou) {
            setRivalClip("shackled");
          }
          setFx((prev) => ({
            ...prev,
            bannerText: `${skippedPlayer === currentYou ? "YOUR TURN" : "RIVAL'S TURN"} SKIPPED (SHACKLE)`,
            bannerTone: "brass",
          }));
          await waitMs(beat.durationMs, epoch);
          if (epochRef.current === epoch) {
            setFx((prev) => ({ ...prev, bannerText: null }));
          }
          break;
        }

        case "heal_cut": {
          const player = typeof p.player === "number" ? p.player : currentYou;
          commitVisual((prev) => ({
            ...prev,
            healCut: [
              player === 0 ? true : prev.healCut[0],
              player === 1 ? true : prev.healCut[1],
            ],
          }));
          setFx((prev) => ({
            ...prev,
            bannerText: "R3 CRITICAL: NO MORE HEALING",
            bannerTone: "alert",
          }));
          await waitMs(beat.durationMs, epoch);
          if (epochRef.current === epoch) {
            setFx((prev) => ({ ...prev, bannerText: null }));
          }
          break;
        }

        case "round_end": {
          playCueRef.current?.("ui_select");
          const score = Array.isArray(p.score) ? (p.score as [number, number]) : visualRef.current.score;
          const winner = typeof p.winner === "number" ? p.winner : 0;
          commitVisual((prev) => ({
            ...prev,
            score: [score[0], score[1]],
            sawActive: false,
            shackledSeat: null,
            gunHolder: "table",
            gunAim: 0,
          }));
          setRivalClip("round_end");
          setFx((prev) => ({
            ...prev,
            bannerText: `ROUND OVER — ${winner === currentYou ? "YOU WIN" : "RIVAL WINS"}`,
            bannerTone: winner === currentYou ? "patina" : "alert",
          }));
          await waitMs(beat.durationMs, epoch);
          if (epochRef.current === epoch) {
            setFx((prev) => ({ ...prev, bannerText: null }));
            setRivalClip("idle");
          }
          break;
        }

        case "match_end": {
          const winner = typeof p.winner === "number" ? p.winner : 0;
          playCueRef.current?.(winner === currentYou ? "match_win" : "match_lose");
          commitVisual((prev) => ({
            ...prev,
            phase: "finished",
            winner,
            gunHolder: "table",
            gunAim: 0,
          }));
          setRivalClip("round_end");
          setFx((prev) => ({
            ...prev,
            bannerText: winner === currentYou ? "MATCH WON" : "MATCH LOST",
            bannerTone: winner === currentYou ? "patina" : "alert",
          }));
          await waitMs(beat.durationMs, epoch);
          break;
        }

        case "rollback_gun": {
          const reason = typeof p.reason === "string" ? p.reason : "Move cancelled";
          commitVisual((prev) => ({
            ...prev,
            gunHolder: "table",
            gunAim: 0,
            hammerCocked: false,
          }));
          setFx((prev) => ({
            ...prev,
            stallCaption: null,
            errorText: reason,
          }));
          await waitMs(beat.durationMs, epoch);
          scheduleFxTimeout(() => {
            setFx((prev) => ({ ...prev, errorText: null }));
          }, 2500, epoch);
          break;
        }

        case "rollback_item": {
          const reason = typeof p.reason === "string" ? p.reason : "Item could not be used";
          setFx((prev) => ({
            ...prev,
            stallCaption: null,
            errorText: reason,
          }));
          await waitMs(beat.durationMs, epoch);
          scheduleFxTimeout(() => {
            setFx((prev) => ({ ...prev, errorText: null }));
          }, 2500, epoch);
          break;
        }
      }
    },
    [commitVisual, executeGenericItemBeat, scheduleFxTimeout, waitMs],
  );

  const directorRef = useRef<Director | null>(null);

  useEffect(() => {
    const d = new Director({
      execute: (beat) => executeBeat(beat),
      onIdle: () => {
        setActiveBeatId(null);
        setIsBusy(false);
        onIdleRef.current?.();
      },
      onDeferredSnapshot: (snap) => {
        const syncedModel = fromSnapshot(snap, youRef.current, visualRef.current.knownShells);
        commitVisual((prev) => visualFromModel(syncedModel, youRef.current, prev));
        onSnapModelRef.current?.(syncedModel);
      },
    });
    directorRef.current = d;
    return () => {
      epochRef.current += 1;
      clearTimers();
      d.dispose();
      if (directorRef.current === d) {
        directorRef.current = null;
      }
    };
  }, [clearTimers, commitVisual, executeBeat]);

  const enqueueBeats = useCallback((beats: Beat | readonly Beat[]) => {
    const d = directorRef.current;
    if (!d) return;
    setIsBusy(true);
    d.enqueue(beats);
  }, []);

  const enqueueActions = useCallback(
    (
      actions: readonly Action[],
      startingModel: GameModel,
      localPrepPlayed: boolean,
    ): GameModel => {
      let cursor = startingModel;
      const allBeats: Beat[] = [];
      let prepUsed = false;

      for (const action of actions) {
        const usePrep = localPrepPlayed && !prepUsed && action.kind === "Shot";
        if (usePrep) prepUsed = true;
        const planned = planBeats(action, {
          you: youRef.current,
          localPrepPlayed: usePrep,
          model: cursor,
        });
        allBeats.push(...planned);
        cursor = applyAction(cursor, action, youRef.current);
      }

      if (allBeats.length > 0) {
        enqueueBeats(allBeats);
      }
      return cursor;
    },
    [enqueueBeats],
  );

  const applyOrDeferSnapshot = useCallback((snapshot: MatchView) => {
    directorRef.current?.applyOrDeferSnapshot(snapshot);
  }, []);

  const syncImmediately = useCallback(
    (model: GameModel, targetYou: 0 | 1) => {
      commitVisual((prev) => visualFromModel(model, targetYou, prev));
    },
    [commitVisual],
  );

  const setLiveAim = useCallback(
    (aim: number) => {
      commitVisual((prev) => ({
        ...prev,
        gunHolder: "local",
        gunAim: aim,
        hammerCocked: true,
      }));
      setRivalClip((curr) =>
        nextClipOnAim(
          curr,
          aim,
          false,
          visualRef.current.shackledSeat === 1 - youRef.current,
        ),
      );
    },
    [commitVisual],
  );

  const cancelLocalAim = useCallback(() => {
    commitVisual((prev) => ({
      ...prev,
      gunHolder: "table",
      gunAim: 0,
      hammerCocked: false,
    }));
    setRivalClip((curr) =>
      nextClipOnAim(
        curr,
        0,
        false,
        visualRef.current.shackledSeat === 1 - youRef.current,
      ),
    );
  }, [commitVisual]);

  const handleRivalClipEnded = useCallback((ended: RivalClipId) => {
    setRivalClip((curr) =>
      curr === ended
        ? resolveClipEnded(
            ended,
            visualRef.current.gunHolder === "rival",
            visualRef.current.shackledSeat === 1 - youRef.current,
          )
        : curr,
    );
  }, []);

  const resetStage = useCallback(
    (nextVisual?: StageVisualState) => {
      epochRef.current += 1;
      clearTimers();
      pendingStealFromRef.current = null;
      directorRef.current?.clear();
      const target = nextVisual ?? createDefaultStageVisual(youRef.current);
      visualRef.current = target;
      setVisual(target);
      setFx(INITIAL_FX_STATE);
      setRivalClip("idle");
      setActiveBeatId(null);
      setIsBusy(false);
    },
    [clearTimers],
  );

  return {
    visual,
    fx,
    rivalClip,
    activeBeatId,
    isBusy,
    enqueueBeats,
    enqueueActions,
    applyOrDeferSnapshot,
    syncImmediately,
    setLiveAim,
    cancelLocalAim,
    setRivalClip,
    handleRivalClipEnded,
    resetStage,
  };
}
