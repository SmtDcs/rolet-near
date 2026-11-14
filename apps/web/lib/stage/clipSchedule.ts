import type { BeatId } from "../game/beats";
import type { RivalClipId } from "./assets";

export const CLIP_CROSSFADE_MS = 120;
export const BLINK_MIN_MS = 2500;
export const BLINK_MAX_MS = 6000;
export const AIMED_AT_THRESHOLD = 0.6;

export interface ClipMeta {
  readonly id: RivalClipId;
  readonly loop: boolean;
  readonly defaultDurationMs: number;
  readonly interruptibleByAim: boolean;
}

export const RIVAL_CLIP_META: Readonly<Record<RivalClipId, ClipMeta>> = {
  idle: { id: "idle", loop: true, defaultDurationMs: 6500, interruptibleByAim: true },
  idle_alt: { id: "idle_alt", loop: false, defaultDurationMs: 6000, interruptibleByAim: true },
  aimed_at: { id: "aimed_at", loop: true, defaultDurationMs: 3000, interruptibleByAim: true },
  hit_knockback: { id: "hit_knockback", loop: false, defaultDurationMs: 1200, interruptibleByAim: false },
  recover: { id: "recover", loop: false, defaultDurationMs: 1200, interruptibleByAim: false },
  relief: { id: "relief", loop: false, defaultDurationMs: 800, interruptibleByAim: false },
  take_gun: { id: "take_gun", loop: false, defaultDurationMs: 500, interruptibleByAim: false },
  hold_gun: { id: "hold_gun", loop: true, defaultDurationMs: 2000, interruptibleByAim: false },
  aim_self: { id: "aim_self", loop: false, defaultDurationMs: 1200, interruptibleByAim: false },
  aim_you: { id: "aim_you", loop: false, defaultDurationMs: 1200, interruptibleByAim: false },
  fire_recoil: { id: "fire_recoil", loop: false, defaultDurationMs: 450, interruptibleByAim: false },
  use_mouth: { id: "use_mouth", loop: false, defaultDurationMs: 1500, interruptibleByAim: false },
  use_hands: { id: "use_hands", loop: false, defaultDurationMs: 1300, interruptibleByAim: false },
  shackled: { id: "shackled", loop: true, defaultDurationMs: 2000, interruptibleByAim: true },
  round_end: { id: "round_end", loop: true, defaultDurationMs: 2500, interruptibleByAim: false },
};

/**
 * Deterministic seeded blink interval in [2500, 6000] ms given a roll function in [0, 1).
 */
export function nextBlinkDelayMs(roll01: () => number): number {
  const r = Math.min(0.999999, Math.max(0, roll01()));
  return Math.round(BLINK_MIN_MS + r * (BLINK_MAX_MS - BLINK_MIN_MS));
}

/**
 * Deterministic seeded PRNG helper (Mulberry32) for procedural stage loops.
 */
export function createStageRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks primary idle or alternate idle variant.
 */
export function selectIdleVariant(roll01: () => number, isShackled = false): RivalClipId {
  if (isShackled) {
    return "shackled";
  }
  const r = Math.min(0.999999, Math.max(0, roll01()));
  return r < 0.2 ? "idle_alt" : "idle";
}

/**
 * Updates rival clip in response to local aim value (`aim > 0.6` -> `aimed_at`).
 */
export function nextClipOnAim(
  currentClip: RivalClipId,
  aim: number,
  rivalHoldsGun: boolean,
  isShackled: boolean,
): RivalClipId {
  if (rivalHoldsGun) {
    return currentClip;
  }
  const meta = RIVAL_CLIP_META[currentClip];
  if (!meta.interruptibleByAim) {
    return currentClip;
  }
  if (aim > AIMED_AT_THRESHOLD) {
    return "aimed_at";
  }
  if (currentClip === "aimed_at") {
    return isShackled ? "shackled" : "idle";
  }
  return currentClip;
}

/**
 * Maps a Director beat (and optional params) to the rival clip to trigger, or null if unaffected.
 */
export function clipForBeat(
  beatId: BeatId,
  params?: Record<string, unknown>,
): RivalClipId | null {
  const isLocal = params?.isLocal === true;

  switch (beatId) {
    case "rival_take":
      return "take_gun";
    case "rival_aim_opp":
      return "aim_you";
    case "rival_aim_self":
      return "aim_self";
    case "fire_live_opp":
      return isLocal ? "hit_knockback" : "fire_recoil";
    case "fire_live_self":
      return isLocal ? null : "hit_knockback";
    case "fire_blank":
      if (isLocal) {
        return null;
      }
      return params?.target === "SelfTarget" ? "relief" : "fire_recoil";
    case "opponent_knockback_return":
      return "recover";
    case "gun_putdown":
      return isLocal ? null : "idle";
    case "item_pipe":
    case "item_tincture":
      return isLocal ? null : "use_mouth";
    case "item_loupe":
    case "item_flask":
    case "item_shackle":
    case "item_hacksaw":
    case "item_ticker":
    case "item_magnet":
    case "item_lockpick":
      return isLocal ? null : "use_hands";
    case "turn_skipped":
      return isLocal ? null : "shackled";
    case "round_end":
    case "match_end":
      return "round_end";
    default:
      return null;
  }
}

/**
 * Resolves the next rival clip when a non-looping clip finishes playing.
 */
export function resolveClipEnded(
  currentClip: RivalClipId,
  rivalHoldsGun: boolean,
  isShackled: boolean,
): RivalClipId {
  const meta = RIVAL_CLIP_META[currentClip];
  if (meta.loop) {
    return currentClip;
  }
  if (currentClip === "take_gun") {
    return "hold_gun";
  }
  if (currentClip === "hit_knockback") {
    return "recover";
  }
  if (
    currentClip === "aim_self" ||
    currentClip === "aim_you" ||
    currentClip === "fire_recoil"
  ) {
    if (rivalHoldsGun) {
      return "hold_gun";
    }
  }
  return isShackled ? "shackled" : "idle";
}
