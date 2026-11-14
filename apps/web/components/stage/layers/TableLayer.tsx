"use client";

import { getStageAsset } from "@/lib/stage/assets";
import { TABLE_PLATE_RECT } from "@/lib/stage/layout";

/**
 * L2: Foreground table plate masking the lower edge of the opponent layer.
 */
export function TableLayer() {
  const asset = getStageAsset("V-02");

  if (asset.type === "image") {
    return (
      <div
        className="pointer-events-none absolute z-20 overflow-hidden"
        style={{
          left: `${TABLE_PLATE_RECT.x * 100}%`,
          top: `${TABLE_PLATE_RECT.y * 100}%`,
          width: `${TABLE_PLATE_RECT.width * 100}%`,
          height: `${TABLE_PLATE_RECT.height * 100}%`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.src} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div
      data-testid="table-layer"
      className="pointer-events-none absolute z-20 overflow-hidden"
      style={{
        left: `${TABLE_PLATE_RECT.x * 100}%`,
        top: `${TABLE_PLATE_RECT.y * 100}%`,
        width: `${TABLE_PLATE_RECT.width * 100}%`,
        height: `${TABLE_PLATE_RECT.height * 100}%`,
      }}
    >
      {/* Perspective workbench surface */}
      <svg
        viewBox="0 0 1920 500"
        className="h-full w-full"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="tableFelt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d1a14" />
            <stop offset="35%" stopColor="#262118" />
            <stop offset="100%" stopColor="#120f0b" />
          </linearGradient>
          <linearGradient id="tableRail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3c2818" />
            <stop offset="100%" stopColor="#1b1109" />
          </linearGradient>
        </defs>

        {/* Far rail */}
        <polygon points="180,20 1740,20 1920,500 0,500" fill="url(#tableFelt)" />
        <polygon points="170,8 1750,8 1740,34 180,34" fill="url(#tableRail)" stroke="#5c4228" strokeWidth="2" />

        {/* Brass inlay lines */}
        <polygon
          points="240,42 1680,42 1840,475 80,475"
          fill="none"
          stroke="#c6a15b"
          strokeOpacity="0.22"
          strokeWidth="2"
        />

        {/* Center revolver mat */}
        <ellipse
          cx="960"
          cy="215"
          rx="210"
          ry="82"
          fill="#15120d"
          stroke="#c6a15b"
          strokeOpacity="0.32"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
