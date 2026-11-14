"use client";

import { useEffect, useRef } from "react";
import { getStageAsset } from "@/lib/stage/assets";

export interface BackgroundLayerProps {
  paused?: boolean;
}

/**
 * L0: Animated workshop room background (gears, pendulum, dial glow, smoke, swinging lamp body).
 * Uses V-01 video when manifest switches from procedural to video; otherwise lightweight CSS/SVG loops.
 */
export function BackgroundLayer({ paused = false }: BackgroundLayerProps) {
  const asset = getStageAsset("V-01");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || asset.type !== "video") return;
    if (paused) {
      el.pause();
    } else {
      el.play().catch(() => {});
    }
  }, [asset.type, paused]);

  if (asset.type === "video") {
    return (
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#0a0908]">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          loop
          playsInline
          preload="auto"
          poster={asset.posterSrc}
        >
          <source src={asset.src} type="video/webm" />
          {asset.fallbackSrc && <source src={asset.fallbackSrc} type="video/mp4" />}
        </video>
      </div>
    );
  }

  return (
    <div
      data-testid="background-layer"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#090807]"
    >
      {/* Room depth & cold iron walls */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 68% 58% at 50% 24%, rgba(64, 48, 28, 0.36) 0%, rgba(19, 16, 13, 0.85) 55%, #070606 100%)",
        }}
      />

      {/* Structural workshop beams & arched clockface */}
      <svg
        viewBox="0 0 1920 1080"
        className="absolute inset-0 h-full w-full opacity-55"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        {/* Side pillars */}
        <rect x="88" y="0" width="76" height="1080" fill="#100e0c" />
        <rect x="1756" y="0" width="76" height="1080" fill="#100e0c" />
        <rect x="164" y="0" width="8" height="1080" fill="#231c15" />
        <rect x="1748" y="0" width="8" height="1080" fill="#231c15" />

        {/* Overhead rafters */}
        <polygon points="0,0 1920,0 1920,96 0,96" fill="#0d0b0a" />
        <line x1="0" y1="96" x2="1920" y2="96" stroke="#2c2218" strokeWidth="3" />

        {/* Distant clock dial glow */}
        <circle
          cx="960"
          cy="280"
          r="210"
          fill="none"
          stroke="#c6a15b"
          strokeOpacity="0.14"
          strokeWidth="3"
        />
        <circle
          cx="960"
          cy="280"
          r="182"
          fill="none"
          stroke="#c6a15b"
          strokeOpacity="0.09"
          strokeWidth="12"
          strokeDasharray="6 24"
        />

        {/* Rotating clockwork gear left */}
        <g
          transform="translate(390 250)"
          style={{
            transformOrigin: "0px 0px",
            animation: paused ? "none" : "rolet-gear-spin 42s linear infinite",
          }}
        >
          <circle r="106" fill="none" stroke="#3c2f20" strokeWidth="14" strokeDasharray="18 14" />
          <circle r="76" fill="none" stroke="#251d14" strokeWidth="4" />
          <line x1="-76" y1="0" x2="76" y2="0" stroke="#251d14" strokeWidth="5" />
          <line x1="0" y1="-76" x2="0" y2="76" stroke="#251d14" strokeWidth="5" />
        </g>

        {/* Counter-rotating gear right */}
        <g
          transform="translate(1530 270)"
          style={{
            transformOrigin: "0px 0px",
            animation: paused ? "none" : "rolet-gear-spin 56s linear infinite reverse",
          }}
        >
          <circle r="128" fill="none" stroke="#33271a" strokeWidth="16" strokeDasharray="20 16" />
          <circle r="90" fill="none" stroke="#221a12" strokeWidth="4" />
          <line x1="-90" y1="0" x2="90" y2="0" stroke="#221a12" strokeWidth="5" />
          <line x1="0" y1="-90" x2="0" y2="90" stroke="#221a12" strokeWidth="5" />
        </g>
      </svg>

      {/* Swinging overhead workshop lamp body */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 origin-top"
        style={{
          animation: paused ? "none" : "rolet-lamp-swing 6.4s ease-in-out infinite",
        }}
      >
        <div className="mx-auto h-14 w-[3px] bg-[#3a2e22]" />
        <div className="mx-auto h-5 w-24 border border-[#c6a15b]/40 bg-[#1a1510]" />
        <div className="mx-auto h-2 w-12 bg-[#f5cb7a]/80 blur-[2px]" />
      </div>

      {/* Subtle drifting smoke haze */}
      <div
        className="absolute inset-x-[15%] top-[18%] h-[42%] rounded-full"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(198,161,91,0.08) 0%, rgba(120,110,95,0.04) 45%, transparent 72%)",
          animation: paused ? "none" : "rolet-stage-smoke 11s ease-in-out infinite",
        }}
      />
    </div>
  );
}
