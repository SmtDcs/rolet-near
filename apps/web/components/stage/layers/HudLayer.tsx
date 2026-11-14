"use client";

import type { StageHudProps, StageVisualState } from "../types";

export interface HudLayerComponentProps {
  visual: StageVisualState;
  hud: StageHudProps;
  stallCaption: string | null;
  errorText: string | null;
  deadlineSecondsLeft?: number | null;
}

/**
 * L6: React DOM HUD overlay (turn/round/shells bar, drag-to-aim split zones, Lockpick prompt, mute).
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

  return (
    <div data-testid="hud-layer" className="pointer-events-none absolute inset-0 z-[60] flex flex-col justify-between p-3 sm:p-4">
      {/* Top HUD bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="pointer-events-auto flex items-center gap-3 border border-[#c6a15b]/35 bg-[#0a0a0a]/85 px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] uppercase">
          <span className={isYourTurn ? "font-bold text-[#52c41a]" : "text-[#e5c378]"}>
            {visual.phase === "finished"
              ? visual.winner === visual.you
                ? "KAZANDIN"
                : "KAYBETTİN"
              : isYourTurn
                ? "SIRA SENDE"
                : "RAKİP SIRASI"}
          </span>
          <span className="text-[#5c5c5c]">|</span>
          <span className="text-[#eaeaea]">ROUND {visual.round}</span>
          <span className="text-[#5c5c5c]">|</span>
          <span className="text-[#c6a15b]">
            {visual.remaining}/8 HAZNE
          </span>
          {visual.sawActive && (
            <>
              <span className="text-[#5c5c5c]">|</span>
              <span className="font-bold text-[#e61919]">TESTERE AKTİF (2x)</span>
            </>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {deadlineSecondsLeft !== null && (
            <div
              className={`border px-2.5 py-1 font-mono text-[11px] tracking-[0.14em] ${
                deadlineSecondsLeft <= 10
                  ? "border-[#e61919] bg-[#2a0909]/90 text-[#ff8080]"
                  : "border-[#3a3a3a] bg-[#0a0a0a]/85 text-[#9a9a9a]"
              }`}
            >
              {deadlineSecondsLeft}s
            </div>
          )}

          {hud.statusLabel && (
            <div className="border border-[#3a3a3a] bg-[#0a0a0a]/85 px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-[#9a9a9a] uppercase">
              {hud.statusLabel}
            </div>
          )}

          <button
            type="button"
            onClick={hud.onToggleMute}
            className="cursor-pointer border border-[#c6a15b]/40 bg-[#0a0a0a]/85 px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-[#c6a15b] uppercase hover:border-[#e5c378]"
          >
            {hud.muted ? "SES: KAPALI" : "SES: AÇIK"}
          </button>
        </div>
      </div>

      {/* Aim split-zone overlay while dragging / aiming with keyboard */}
      {aiming && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between py-14 px-8">
          <div
            className={`mx-auto border px-4 py-1.5 font-mono text-xs tracking-[0.18em] uppercase transition ${
              hud.aimState.zone === "opp"
                ? hud.aimState.canConfirm
                  ? "border-[#e61919] bg-[#3b0b0b]/90 text-[#fff]"
                  : "border-[#c6a15b] bg-[#1c160d]/85 text-[#e5c378]"
                : "border-[#3a3a3a] bg-[#0a0a0a]/65 text-[#777]"
            }`}
          >
            ↑ YUKARI SÜRÜKLE: RAKİBE ATEŞ {hud.aimState.zone === "opp" && hud.aimState.canConfirm ? "(BIRAK = ATEŞ)" : ""}
          </div>

          <div className="mx-auto border border-[#3a3a3a] bg-[#0a0a0a]/75 px-3 py-1 font-mono text-[10px] tracking-[0.16em] text-[#9a9a9a] uppercase">
            ORTA BÖLGE = İPTAL · ESC İPTAL · ↑/↓ + ENTER
          </div>

          <div
            className={`mx-auto border px-4 py-1.5 font-mono text-xs tracking-[0.18em] uppercase transition ${
              hud.aimState.zone === "self"
                ? hud.aimState.canConfirm
                  ? "border-[#52c41a] bg-[#0e2609]/90 text-[#fff]"
                  : "border-[#c6a15b] bg-[#1c160d]/85 text-[#e5c378]"
                : "border-[#3a3a3a] bg-[#0a0a0a]/65 text-[#777]"
            }`}
          >
            ↓ AŞAĞI SÜRÜKLE: KENDİNE ATEŞ {hud.aimState.zone === "self" && hud.aimState.canConfirm ? "(BIRAK = ATEŞ)" : ""}
          </div>
        </div>
      )}

      {/* Lockpick target selection prompt */}
      {hud.lockpickSlot !== null && (
        <div className="pointer-events-auto mx-auto mb-4 flex items-center gap-3 border border-[#e5c378] bg-[#16120b]/95 px-4 py-2 font-mono text-xs tracking-[0.14em] text-[#eaeaea] uppercase">
          <span>MAYMUNCUK: RAKİBİN ÇALINACAK EŞYASINI SEÇ</span>
          {hud.onCancelLockpick && (
            <button
              type="button"
              onClick={hud.onCancelLockpick}
              className="cursor-pointer border border-[#c6a15b]/60 px-2 py-0.5 text-[10px] text-[#c6a15b] hover:bg-[#2a2216]"
            >
              İPTAL
            </button>
          )}
        </div>
      )}

      {/* Bottom status / stall / error bar */}
      <div className="flex items-end justify-between gap-3">
        <div className="font-mono text-[10px] tracking-[0.14em] text-[#9a9a9a] uppercase">
          {hud.canAct && !aiming && hud.lockpickSlot === null
            ? "SİLAHA TIKLA VE SÜRÜKLE · VEYA EŞYA SEÇ"
            : hud.txPhase === "sent" || hud.txPhase === "holding"
              ? stallCaption ?? "HOROZ BEKLENİYOR..."
              : hud.activeBeatId
                ? `BEAT: ${hud.activeBeatId}`
                : ""}
        </div>

        {errorText && (
          <div className="border border-[#e61919] bg-[#240909]/95 px-3 py-1 font-mono text-[11px] text-[#ffb3b3]">
            {errorText}
          </div>
        )}
      </div>
    </div>
  );
}
