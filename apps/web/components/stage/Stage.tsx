"use client";

import type { PointerEventHandler, ReactNode, RefObject } from "react";
import type { CharacterKind, RivalClipId } from "@/lib/stage/assets";
import type { GunPose, GunPoseId } from "@/lib/stage/gunPoses";
import { AmbientLayer } from "./ambient/AmbientLayer";
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

const SCENE_CSS = `
@keyframes rolet-scene-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.015)}}
@keyframes rolet-lamp-flicker{0%,100%{opacity:.8}18%{opacity:.7}20%{opacity:.92}47%{opacity:.76}49%{opacity:.88}80%{opacity:.68}82%{opacity:.85}}
`;

/**
 * 16:9 fixed-aspect letterboxed hybrid 2.5D stage stacking L0..L6.
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
        className={`relative aspect-video w-full max-h-full max-w-[calc(100vh*16/9)] overflow-hidden border border-[#2a241c] bg-[#090807] shadow-[0_0_60px_rgba(0,0,0,0.95)] ${shakeClass}`}
      >
        {/* L0-L2: Painted scene (dealer, lamp, table) with breathing + lamp flicker */}
        <style>{SCENE_CSS}</style>
        <div
          data-testid="background-layer"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
          <div
            data-testid="rival-layer"
            className="absolute inset-0"
            style={{
              transformOrigin: "50% 60%",
              animation: paused ? "none" : "rolet-scene-breathe 8s ease-in-out infinite",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/art/scene.webp"
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full select-none object-cover"
            />
            <div
              className="absolute inset-0 mix-blend-screen"
              style={{
                background:
                  "radial-gradient(ellipse 38% 46% at 50% 12%, rgba(255,205,120,0.38) 0%, rgba(255,170,80,0.12) 50%, transparent 80%)",
                animation: paused ? "none" : "rolet-lamp-flicker 4.7s ease-in-out infinite",
              }}
            />
          </div>
          <div
            data-testid="table-layer"
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
            }}
          />
        </div>

        <div className="pointer-events-none absolute inset-0 z-[25]">
          <AmbientLayer />
        </div>

        {/* L3: Tabletop sprites (8 chambers, 4+4 items, HP tubes, score notches) */}
        <TableSpritesLayer
          visual={visual}
          canAct={hud.canAct}
          lockpickSlot={hud.lockpickSlot}
          onUseItem={onUseItem}
          onSelectStealSlot={onSelectStealSlot}
        />

        {/* L4: 3D Three.js Revolver layer (with 2D fallback) */}
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
