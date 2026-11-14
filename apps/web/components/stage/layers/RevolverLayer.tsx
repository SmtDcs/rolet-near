"use client";

import {
  Component,
  useMemo,
  useSyncExternalStore,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import type { GunPose, GunPoseId } from "@/lib/stage/gunPoses";
import { REVOLVER_TABLE_ANCHOR, RIVAL_HAND_ANCHOR } from "@/lib/stage/layout";
import type { GunHolder } from "../types";

const DynamicRevolverCanvas = dynamic(
  () => import("../RevolverCanvas").then((mod) => mod.RevolverCanvas),
  { ssr: false },
);

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
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class RevolverErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    // Graceful fallback to 2D revolver sprite when WebGL fails
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function detectWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl")),
    );
  } catch {
    return false;
  }
}

function Revolver2DFallback({
  gunHolder,
  gunAim,
  sawActive,
  craneOpen,
}: {
  gunHolder: GunHolder;
  gunAim: number;
  sawActive: boolean;
  craneOpen: boolean;
}) {
  const pos =
    gunHolder === "rival"
      ? { left: `${RIVAL_HAND_ANCHOR.x * 100}%`, top: `${RIVAL_HAND_ANCHOR.y * 100}%`, scale: 0.55 }
      : gunHolder === "local"
        ? {
            left: "50%",
            top: `${(0.68 - gunAim * 0.14) * 100}%`,
            scale: gunAim < -0.5 ? 1.25 : 1.05,
          }
        : {
            left: `${REVOLVER_TABLE_ANCHOR.x * 100}%`,
            top: `${REVOLVER_TABLE_ANCHOR.y * 100}%`,
            scale: 1,
          };

  return (
    <div
      data-testid="revolver-2d-fallback"
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-200"
      style={{
        left: pos.left,
        top: pos.top,
        transform: `translate(-50%, -50%) scale(${pos.scale})`,
      }}
    >
      <svg width="210" height="96" viewBox="0 0 210 96" aria-label="2D Revolver Fallback">
        {/* Grip */}
        <path d="M 38 42 L 22 86 L 46 88 L 58 46 Z" fill="#3c2618" stroke="#c6a15b" strokeWidth="1.5" />
        {/* Frame */}
        <rect x="46" y="24" width="64" height="24" rx="3" fill="#3a352f" stroke="#c6a15b" strokeWidth="1.5" />
        {/* Cylinder */}
        <rect
          x="64"
          y={craneOpen ? "14" : "22"}
          width="34"
          height="26"
          rx="3"
          fill="#524c43"
          stroke="#e5c378"
          strokeWidth="1.5"
        />
        {/* Barrel */}
        <rect x="110" y="26" width={sawActive ? "46" : "88"} height="14" rx="2" fill="#4e483f" stroke="#c6a15b" strokeWidth="1.5" />
        {!sawActive && <rect x="188" y="20" width="7" height="8" fill="#e5c378" />}
      </svg>
    </div>
  );
}

const noopSubscribe = () => () => {};

/**
 * L4: 3D Three.js Revolver layer loaded dynamically without SSR, with 2D sprite fallback if WebGL is unavailable.
 */
export function RevolverLayer({
  gunHolder,
  gunAim,
  cylinderIndex,
  craneOpen,
  hammerCocked,
  sawActive,
  canPickUp,
  paused = false,
  customPoses,
  overridePose,
  onGunPointerDown,
}: RevolverLayerProps) {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const webglReady = useMemo(() => (isClient ? detectWebGL() : null), [isClient]);

  const fallback2D = (
    <Revolver2DFallback
      gunHolder={gunHolder}
      gunAim={gunAim}
      sawActive={sawActive}
      craneOpen={craneOpen}
    />
  );

  return (
    <div data-testid="revolver-layer" className="pointer-events-none absolute inset-0 z-40">
      {webglReady === true ? (
        <RevolverErrorBoundary fallback={fallback2D}>
          <DynamicRevolverCanvas
            gunHolder={gunHolder}
            gunAim={gunAim}
            cylinderIndex={cylinderIndex}
            craneOpen={craneOpen}
            hammerCocked={hammerCocked}
            sawActive={sawActive}
            paused={paused}
            customPoses={customPoses}
            overridePose={overridePose}
          />
        </RevolverErrorBoundary>
      ) : webglReady === false ? (
        fallback2D
      ) : null}

      {/* Table pickup hit-target (only active when revolver rests on table and player can act) */}
      {canPickUp && gunHolder === "table" && (
        <button
          type="button"
          aria-label="Revolveri al ve nişan al"
          onPointerDown={onGunPointerDown}
          style={{
            left: `${REVOLVER_TABLE_ANCHOR.x * 100}%`,
            top: `${REVOLVER_TABLE_ANCHOR.y * 100}%`,
          }}
          className="pointer-events-auto absolute h-24 w-56 -translate-x-1/2 -translate-y-1/2 cursor-grab border border-[#c6a15b]/45 bg-[#c6a15b]/5 transition hover:border-[#e5c378] hover:bg-[#c6a15b]/15 active:cursor-grabbing"
        >
          <span className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#0a0a0a]/90 px-2 py-0.5 font-mono text-[10px] tracking-[0.16em] text-[#e5c378] uppercase">
            SİLAHI AL / SÜRÜKLE
          </span>
        </button>
      )}
    </div>
  );
}
