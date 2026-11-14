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
export function FxLayer({ fx, aim, paused = false }: FxLayerProps) {
  const selfTension = aim < -0.6 ? Math.min(1, (-aim - 0.6) / 0.4) : 0;
  const vignetteOpacity = 0.45 + selfTension * 0.42;

  return (
    <div data-testid="fx-layer" className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      {/* Swinging lamp light cone & pool */}
      <div
        className="absolute inset-0 mix-blend-screen"
        style={{
          background:
            "radial-gradient(ellipse 46% 40% at 50% 42%, rgba(235, 192, 118, 0.14) 0%, rgba(198, 161, 91, 0.05) 45%, transparent 75%)",
          animation: paused ? "none" : "rolet-cone-flicker 5.4s ease-in-out infinite",
        }}
      />

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

      {/* Muzzle flash */}
      {fx.muzzleFlash && (
        <div
          className="absolute inset-0 mix-blend-screen"
          style={{
            background:
              "radial-gradient(circle at 50% 56%, rgba(255, 240, 200, 0.92) 0%, rgba(245, 158, 11, 0.55) 28%, transparent 62%)",
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
          <span className="text-[#9a9a9a]">SIRADAKİ FİŞEK: </span>
          <span
            className={
              fx.loupeRevealShell === "Live" ? "font-bold text-[#e61919]" : "font-bold text-[#93c5fd]"
            }
          >
            {fx.loupeRevealShell === "Live" ? "DOLU (LIVE)" : "KURU (BLANK)"}
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
