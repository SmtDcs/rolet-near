"use client";

import type { PointerEventHandler, ReactNode, RefObject } from "react";
import type { CharacterKind, RivalClipId } from "@/lib/stage/assets";
import { REVOLVER_TABLE_ANCHOR } from "@/lib/stage/layout";
import { BackgroundLayer } from "./layers/BackgroundLayer";
import { FxLayer } from "./layers/FxLayer";
import { HudLayer } from "./layers/HudLayer";
import { RivalLayer } from "./layers/RivalLayer";
import { TableLayer } from "./layers/TableLayer";
import { TableSpritesLayer } from "./layers/TableSpritesLayer";
import {
  INITIAL_FX_STATE,
  type StageFxState,
  type StageHudProps,
  type StageVisualState,
} from "./types";

export interface StageProps {
  visual: StageVisualState;
  rivalClip: RivalClipId;
  characterKind?: CharacterKind;
  fx?: StageFxState;
  hud: StageHudProps;
  paused?: boolean;
  seed?: number;
  deadlineSecondsLeft?: number | null;
  stageRef?: RefObject<HTMLDivElement | null>;
  revolverLayer?: ReactNode;
  onRivalClipEnded?: (clipId: RivalClipId) => void;
  onUseItem?: (slot: number) => void;
  onSelectStealSlot?: (stealSlot: number) => void;
  onGunPointerDown?: PointerEventHandler<HTMLElement>;
  onStagePointerMove?: PointerEventHandler<HTMLDivElement>;
  onStagePointerUp?: PointerEventHandler<HTMLDivElement>;
  onStagePointerCancel?: PointerEventHandler<HTMLDivElement>;
}

/**
 * 16:9 fixed-aspect letterboxed hybrid 2.5D stage stacking L0..L6.
 */
export function Stage({
  visual,
  rivalClip,
  characterKind = "Kuleci",
  fx = INITIAL_FX_STATE,
  hud,
  paused = false,
  seed = 101,
  deadlineSecondsLeft = null,
  stageRef,
  revolverLayer,
  onRivalClipEnded,
  onUseItem,
  onSelectStealSlot,
  onGunPointerDown,
  onStagePointerMove,
  onStagePointerUp,
  onStagePointerCancel,
}: StageProps) {
  const shakeClass =
    fx.shake === "heavy"
      ? "animate-shake"
      : fx.shake === "light"
        ? "animate-jolt"
        : "";

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-[#050505] overflow-hidden select-none">
      {/* 16:9 letterboxed stage frame */}
      <div
        ref={stageRef}
        data-testid="rolet-stage"
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerCancel}
        className={`relative aspect-video w-full max-h-full max-w-[calc(100vh*16/9)] overflow-hidden border border-[#2a241c] bg-[#090807] shadow-[0_0_60px_rgba(0,0,0,0.95)] ${shakeClass}`}
      >
        {/* L0: Animated environment background */}
        <BackgroundLayer paused={paused} />

        {/* L1: Opponent animated clips / placeholder */}
        <RivalLayer
          clipId={rivalClip}
          characterKind={characterKind}
          paused={paused}
          seed={seed}
          onClipEnded={onRivalClipEnded}
        />

        {/* L2: Foreground table plate */}
        <TableLayer />

        {/* L3: Tabletop sprites (8 chambers, 4+4 items, HP tubes, score notches) */}
        <TableSpritesLayer
          visual={visual}
          canAct={hud.canAct}
          lockpickSlot={hud.lockpickSlot}
          onUseItem={onUseItem}
          onSelectStealSlot={onSelectStealSlot}
        />

        {/* L4: Revolver layer (3D R3F canvas in F3-11+, clickable mat proxy in F3-10) */}
        {revolverLayer ?? (
          <div className="pointer-events-none absolute inset-0 z-40">
            <button
              type="button"
              disabled={!hud.canAct || hud.lockpickSlot !== null}
              onPointerDown={onGunPointerDown}
              style={{
                left: `${REVOLVER_TABLE_ANCHOR.x * 100}%`,
                top: `${REVOLVER_TABLE_ANCHOR.y * 100}%`,
              }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 border px-4 py-2 font-mono text-[10px] tracking-[0.16em] uppercase transition ${
                hud.canAct && hud.lockpickSlot === null
                  ? "pointer-events-auto cursor-grab border-[#c6a15b] bg-[#1b1610]/90 text-[#e5c378] hover:border-[#fff]"
                  : "pointer-events-none border-[#3a3226] bg-[#120f0b]/70 text-[#73644e]"
              }`}
            >
              8-HAZNELİ REVOLVER ({visual.gunHolder})
            </button>
          </div>
        )}

        {/* L5: Lighting, muzzle flash, self-hit blackout, vignette */}
        <FxLayer fx={fx} aim={hud.aimState.aim} paused={paused} />

        {/* L6: React DOM HUD & split-screen aim overlay */}
        <HudLayer
          visual={visual}
          hud={hud}
          stallCaption={fx.stallCaption}
          errorText={fx.errorText}
          deadlineSecondsLeft={deadlineSecondsLeft}
        />
      </div>
    </div>
  );
}
