"use client";

import type { StageFxState } from "../types";

export interface FxLayerProps {
  fx: StageFxState;
  aim: number;
  paused?: boolean;
}

/**
 * L5: Lighting pool sway, muzzle flash, self-hit white->black->recover blackout, and tension vignette.
 */
const HIT_FLASH_CSS = "@keyframes rolet-hit-flash{0%{opacity:1}100%{opacity:0}}";

export function FxLayer({ fx, aim, paused = false }: FxLayerProps) {
  const selfTension = aim < -0.6 ? Math.min(1, (-aim - 0.6) / 0.4) : 0;
  const vignetteOpacity = 0.3 + selfTension * 0.42;

  return (
    <div data-testid="fx-layer" className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      <style>{HIT_FLASH_CSS}</style>
      {/* Base vignette + deepened self-aim pulse */}
      <div
        className="absolute inset-0 transition-opacity duration-200"
        style={{
          opacity: vignetteOpacity,
          background:
            selfTension > 0
              ? "radial-gradient(ellipse at center, transparent 36%, rgba(60, 4, 4, 0.72) 78%, rgba(0, 0, 0, 0.96) 100%)"
              : "radial-gradient(ellipse at center, transparent 48%, rgba(0, 0, 0, 0.85) 100%)",
        }}
      />

      {/* Red hit flash on heavy impacts */}
      {fx.shake === "heavy" && (
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at center, rgba(200,20,20,0.25) 0%, rgba(160,0,0,0.55) 100%)",
            animation: paused ? "none" : "rolet-hit-flash 0.45s ease-out forwards",
          }}
        />
      )}

      {/* Self-hit blackout sequence: white flash -> 1.5s black -> blurry recovery */}
      {fx.blackoutStage === "white" && (
        <div className="absolute inset-0 bg-[#fff8eb] opacity-95 transition-opacity duration-75" />
      )}
      {fx.blackoutStage === "black" && (
        <div className="absolute inset-0 bg-black opacity-100 transition-opacity duration-150" />
      )}
      {fx.blackoutStage === "recover" && (
        <div className="absolute inset-0 bg-black/55 backdrop-blur-[5px] transition-all duration-700" />
      )}

      {/* Loupe/Ticker private shell reveal badge */}
      {fx.loupeRevealShell && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 border border-[#c6a15b] bg-[#0a0a0a]/95 px-4 py-2 text-center font-mono text-xs tracking-[0.18em] uppercase shadow-[0_0_24px_rgba(0,0,0,0.9)]">
          <span className="text-[#9a9a9a]">NEXT ROUND: </span>
          <span
            className={
              fx.loupeRevealShell === "Live" ? "font-bold text-[#e61919]" : "font-bold text-[#93c5fd]"
            }
          >
            {fx.loupeRevealShell === "Live" ? "LIVE" : "BLANK"}
          </span>
        </div>
      )}

      {/* Beat narrative banner */}
      {fx.bannerText && (
        <div
          className={`absolute top-[14%] left-1/2 -translate-x-1/2 border px-4 py-1.5 font-mono text-xs tracking-[0.18em] uppercase ${
            fx.bannerTone === "alert"
              ? "border-[#e61919] bg-[#1f0909]/95 text-[#ffd0d0]"
              : fx.bannerTone === "patina"
                ? "border-[#52c41a] bg-[#0b1909]/95 text-[#c7f5b2]"
                : fx.bannerTone === "brass"
                  ? "border-[#c6a15b] bg-[#16120b]/95 text-[#e5c378]"
                  : "border-[#3a3a3a] bg-[#0e0e0e]/90 text-[#eaeaea]"
          }`}
        >
          {fx.bannerText}
        </div>
      )}
    </div>
  );
}
