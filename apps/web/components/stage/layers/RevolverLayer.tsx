"use client";

import type { PointerEventHandler } from "react";
import type { GunPose, GunPoseId } from "@/lib/stage/gunPoses";
import type { GunHolder } from "../types";
import { GUN_TABLE_ANCHOR, Revolver2D } from "./Revolver2D";

export interface RevolverLayerProps {
  gunHolder: GunHolder;
  gunAim: number;
  cylinderIndex: number;
  craneOpen: boolean;
  hammerCocked: boolean;
  sawActive: boolean;
  canPickUp: boolean;
  paused?: boolean;
  customPoses?: Partial<Record<GunPoseId, GunPose>>;
  overridePose?: GunPose | null;
  onGunPointerDown?: PointerEventHandler<HTMLElement>;
  muzzleFlash?: boolean;
}

/**
 * L4: 2D illustrated revolver sprite.
 */
export function RevolverLayer({
  gunHolder,
  gunAim,
  canPickUp,
  paused = false,
  onGunPointerDown,
  muzzleFlash = false,
}: RevolverLayerProps) {
  return (
    <div data-testid="revolver-layer" className="pointer-events-none absolute inset-0 z-40">
      <Revolver2D
        gunHolder={gunHolder}
        gunAim={gunAim}
        muzzleFlash={muzzleFlash}
        paused={paused}
      />

      {/* Table pickup hit-target (only active when revolver rests on table and player can act) */}
      {canPickUp && gunHolder === "table" && (
        <button
          type="button"
          aria-label="Pick up the revolver and aim"
          onPointerDown={onGunPointerDown}
          style={{
            left: `${GUN_TABLE_ANCHOR.x * 100}%`,
            top: `${GUN_TABLE_ANCHOR.y * 100}%`,
          }}
          className="pointer-events-auto absolute h-[14%] w-[22%] -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full transition hover:bg-[#e5c378]/10 active:cursor-grabbing"
        >
          <span className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] tracking-[0.2em] text-[#e5c378]/80 uppercase [text-shadow:0_1px_2px_#000]">
            Drag the gun
          </span>
        </button>
      )}
    </div>
  );
}
