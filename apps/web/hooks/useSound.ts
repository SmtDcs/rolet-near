"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SoundKey =
  | "triggerCock"
  | "gunshotLive"
  | "clickBlank"
  | "playerHit"
  | "cardPlay"
  | "uiSelect"
  | "matchWin"
  | "matchLose";

export type StageCue =
  | "gun_pickup"
  | "trigger_cock"
  | "gunshot_live"
  | "click_blank"
  | "player_hit"
  | "item_use"
  | "ui_select"
  | "match_win"
  | "match_lose"
  | "cylinder_spin"
  | "heartbeat"
  | "shell_eject"
  | "shackle_lock"
  | "hacksaw_cut";

const SOUND_SRCS: Record<SoundKey, string> = {
  triggerCock: "/sounds/triggerCock.ogg",
  gunshotLive: "/sounds/gunshotLive.ogg",
  clickBlank: "/sounds/clickBlank.ogg",
  playerHit: "/sounds/playerHit.ogg",
  cardPlay: "/sounds/cardPlay.ogg",
  uiSelect: "/sounds/uiSelect.ogg",
  matchWin: "/sounds/matchWin.ogg",
  matchLose: "/sounds/matchLose.ogg",
};

/**
 * Maps stage cue IDs to existing audio assets; cues without recorded files yet stay silent (no 404).
 */
const STAGE_CUE_TO_KEY: Partial<Record<StageCue, SoundKey>> = {
  gun_pickup: "triggerCock",
  trigger_cock: "triggerCock",
  gunshot_live: "gunshotLive",
  click_blank: "clickBlank",
  player_hit: "playerHit",
  item_use: "cardPlay",
  ui_select: "uiSelect",
  match_win: "matchWin",
  match_lose: "matchLose",
};

const MUTE_KEY = "rolet:muted";

// Pre-created audio elements, cached across renders
const audioCache: Partial<Record<SoundKey, HTMLAudioElement>> = {};

function getAudio(key: SoundKey): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audioCache[key]) {
    const el = new Audio(SOUND_SRCS[key]);
    el.preload = "auto";
    audioCache[key] = el;
  }
  return audioCache[key]!;
}

export function useSound(): {
  play: (key: SoundKey, opts?: { volume?: number }) => void;
  playCue: (cue: StageCue, opts?: { volume?: number }) => void;
  muted: boolean;
  toggleMute: () => void;
} {
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(MUTE_KEY) === "true";
  });

  // Keep ref in sync so play() closure always reads current value
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // Pre-load all audio on mount
  useEffect(() => {
    (Object.keys(SOUND_SRCS) as SoundKey[]).forEach(getAudio);
  }, []);

  const play = useCallback((key: SoundKey, opts?: { volume?: number }) => {
    if (mutedRef.current) return;
    const el = getAudio(key);
    if (!el) return;
    el.currentTime = 0;
    el.volume = opts?.volume ?? 0.6;
    el.play().catch(() => {
      // Autoplay blocked — silently ignore
    });
  }, []);

  const playCue = useCallback(
    (cue: StageCue, opts?: { volume?: number }) => {
      const mapped = STAGE_CUE_TO_KEY[cue];
      if (!mapped) return;
      play(mapped, opts);
    },
    [play],
  );

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      localStorage.setItem(MUTE_KEY, String(next));
      return next;
    });
  }, []);

  return { play, playCue, muted, toggleMute };
}
