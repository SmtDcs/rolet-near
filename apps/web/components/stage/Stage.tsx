"use client";

import type { PointerEventHandler, ReactNode, RefObject } from "react";
import type { CharacterKind, RivalClipId } from "@/lib/stage/assets";
import type { GunPose, GunPoseId } from "@/lib/stage/gunPoses";
import { FxLayer } from "./layers/FxLayer";
import { HudLayer } from "./layers/HudLayer";
import { RevolverLayer } from "./layers/RevolverLayer";
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
  customGunPoses?: Partial<Record<GunPoseId, GunPose>>;
  overrideGunPose?: GunPose | null;
  onRivalClipEnded?: (clipId: RivalClipId) => void;
  onUseItem?: (slot: number) => void;
  onSelectStealSlot?: (stealSlot: number) => void;
  onGunPointerDown?: PointerEventHandler<HTMLElement>;
  onStagePointerMove?: PointerEventHandler<HTMLDivElement>;
  onStagePointerUp?: PointerEventHandler<HTMLDivElement>;
  onStagePointerCancel?: PointerEventHandler<HTMLDivElement>;
}

/**
 * 16:9 fixed-aspect letterboxed top-down 2D card board.
 */
export function Stage({
  visual,
  fx = INITIAL_FX_STATE,
  hud,
  paused = false,
  deadlineSecondsLeft = null,
  stageRef,
  revolverLayer,
  customGunPoses,
  overrideGunPose,
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
        className={`relative aspect-video w-full max-h-full max-w-[calc(100vh*16/9)] overflow-hidden border border-[#2a241c] bg-[#0b1a10] shadow-[0_0_60px_rgba(0,0,0,0.95)] ${shakeClass}`}
      >
        {/* Board: top-down felt table */}
        <div
          data-testid="background-layer"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/art/2d/board.webp"
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full select-none object-cover"
          />
        </div>

        {/* L3: Tabletop sprites (8 chambers, 4+4 items, HP tubes, score notches) */}
        <TableSpritesLayer
          visual={visual}
          canAct={hud.canAct}
          lockpickSlot={hud.lockpickSlot}
          onUseItem={onUseItem}
          onSelectStealSlot={onSelectStealSlot}
        />

        {/* L4: revolver sprite */}
        {revolverLayer ?? (
          <RevolverLayer
            gunHolder={visual.gunHolder}
            gunAim={visual.gunAim}
            cylinderIndex={visual.cylinderIndex}
            craneOpen={visual.craneOpen}
            hammerCocked={visual.hammerCocked}
            sawActive={visual.sawActive}
            canPickUp={hud.canAct && hud.lockpickSlot === null}
            paused={paused}
            customPoses={customGunPoses}
            overridePose={overrideGunPose}
            onGunPointerDown={onGunPointerDown}
            muzzleFlash={fx.muzzleFlash}
          />
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
