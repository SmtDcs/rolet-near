"use client";

import { useEffect, useState } from "react";
import type { StageHudProps, StageVisualState } from "../types";

export interface HudLayerComponentProps {
  visual: StageVisualState;
  hud: StageHudProps;
  stallCaption: string | null;
  errorText: string | null;
  deadlineSecondsLeft?: number | null;
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" fillOpacity="0.25" />
      {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  );
}

/**
 * L6: Minimal HUD: subtle turn text, speaker icon, aim glows, lockpick prompt, errors.
 */
export function HudLayer({
  visual,
  hud,
  stallCaption,
  errorText,
  deadlineSecondsLeft = null,
}: HudLayerComponentProps) {
  const isYourTurn = visual.turn === visual.you && visual.phase === "active";
  const aiming = hud.aimState.active;
  const zone = hud.aimState.zone;
  const [hasActed, setHasActed] = useState(false);

  useEffect(() => {
    if (aiming || hud.lockpickSlot !== null || hud.txPhase !== "idle") setHasActed(true);
  }, [aiming, hud.lockpickSlot, hud.txPhase]);

  const waiting = hud.txPhase === "sent" || hud.txPhase === "holding";
  const showHint = hud.canAct && !hasActed && !aiming && hud.lockpickSlot === null;

  return (
    <div data-testid="hud-layer" className="pointer-events-none absolute inset-0 z-[60] flex flex-col justify-between p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div />

        <div className="pointer-events-auto flex items-center gap-3">
          {hud.canClaimTimeout && hud.onClaimTimeout && (
            <button
              type="button"
              disabled={hud.claimTimeoutBusy}
              onClick={hud.onClaimTimeout}
              className="cursor-pointer border border-[#e61919] bg-[#3b0b0b]/95 px-2.5 py-1 font-mono text-[10px] font-bold tracking-[0.14em] text-[#ffd6d6] uppercase hover:bg-[#5c1212] disabled:cursor-wait disabled:opacity-50"
            >
              {hud.claimTimeoutBusy ? "Claiming..." : "Time out — claim win"}
            </button>
          )}

          {deadlineSecondsLeft !== null && (
            <span
              className={`font-mono text-[11px] tracking-[0.14em] ${
                deadlineSecondsLeft <= 10 ? "text-[#ff8080]" : "text-[#9a9a9a]"
              }`}
            >
              {deadlineSecondsLeft}s
            </span>
          )}
          <button
            type="button"
            onClick={hud.onToggleMute}
            aria-label={hud.muted ? "Unmute sound" : "Mute sound"}
            title={hud.muted ? "Sound off" : "Sound on"}
            className="cursor-pointer text-[#c6a15b]/50 transition hover:text-[#e5c378]"
          >
            <SpeakerIcon muted={hud.muted} />
          </button>
        </div>
      </div>

      {visual.phase !== "finished" && (
        <div
          data-testid="turn-status"
          className="pointer-events-none absolute top-[66%] right-[2%] -translate-y-1/2 border border-[#e9dcc0]/70 bg-[#14110d]/90 px-3 py-1.5 font-serif text-[clamp(9px,1vw,14px)] font-bold tracking-[0.18em] whitespace-nowrap uppercase shadow-[0_4px_8px_rgba(0,0,0,0.5)]"
          style={{ color: isYourTurn ? "#e5c378" : "#c4553f" }}
        >
          {isYourTurn ? "Your turn" : "Rival&apos;s turn"}
        </div>
      )}

      {/* Aim overlay: soft glows toward top (rival) / bottom (you) */}
      {aiming && (
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-x-0 top-0 h-1/2 transition-opacity duration-150"
            style={{
              opacity: zone === "opp" ? (hud.aimState.canConfirm ? 1 : 0.65) : 0.22,
              background: "linear-gradient(to bottom, rgba(220,30,30,0.42), transparent 85%)",
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-1/2 transition-opacity duration-150"
            style={{
              opacity: zone === "self" ? (hud.aimState.canConfirm ? 1 : 0.65) : 0.22,
              background: "linear-gradient(to top, rgba(220,30,30,0.42), transparent 85%)",
            }}
          />
          <div
            className={`absolute top-[6%] left-1/2 -translate-x-1/2 font-mono text-sm tracking-[0.5em] uppercase transition-colors ${
              zone === "opp" ? "text-[#ffd0d0]" : "text-[#ffd0d0]/35"
            }`}
          >
            Rival
          </div>
          <div
            className={`absolute bottom-[6%] left-1/2 -translate-x-1/2 font-mono text-sm tracking-[0.5em] uppercase transition-colors ${
              zone === "self" ? "text-[#ffd0d0]" : "text-[#ffd0d0]/35"
            }`}
          >
            You
          </div>
        </div>
      )}

      {/* Lockpick target selection prompt */}
      {hud.lockpickSlot !== null && (
        <div className="pointer-events-auto mx-auto mb-4 flex items-center gap-3 font-mono text-xs tracking-[0.2em] text-[#e5c378] uppercase [text-shadow:0_1px_6px_#000]">
          <span>Pick a rival item to steal</span>
          {hud.onCancelLockpick && (
            <button
              type="button"
              onClick={hud.onCancelLockpick}
              className="cursor-pointer text-[10px] text-[#9a9a9a] underline underline-offset-4 hover:text-[#eaeaea]"
            >
              cancel
            </button>
          )}
        </div>
      )}

      <div className="flex items-end justify-between gap-3">
        <div className="ml-[18%] font-mono text-[10px] tracking-[0.25em] text-[#9a9a9a]/70 uppercase [text-shadow:0_1px_6px_#000]">
          {showHint
            ? "Pick up the gun, or use an item"
            : waiting
              ? (stallCaption ?? "Waiting for the hammer...")
              : ""}
        </div>

        {errorText && (
          <div className="font-mono text-[11px] text-[#ff9d9d] [text-shadow:0_1px_6px_#000]">
            {errorText}
          </div>
        )}
      </div>
    </div>
  );
}
