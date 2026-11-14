"use client";

import type { CharacterKind, RivalClipId } from "@/lib/stage/assets";

export interface RivalPlaceholderProps {
  clipId: RivalClipId;
  characterKind?: CharacterKind;
  blinking?: boolean;
  paused?: boolean;
  className?: string;
}

const CHARACTER_ACCENTS: Record<
  CharacterKind,
  { coat: string; brass: string; visor: string; tag: string }
> = {
  Kuleci: {
    coat: "#1b1917",
    brass: "#c6a15b",
    visor: "#d9b770",
    tag: "KULECI",
  },
  Ayarci: {
    coat: "#161b1d",
    brass: "#9ea87a",
    visor: "#b8c78a",
    tag: "AYARCI",
  },
  Kacak: {
    coat: "#1e1617",
    brass: "#b67a4e",
    visor: "#d89260",
    tag: "KACAK",
  },
};

function postureTransform(clipId: RivalClipId): {
  transform: string;
  opacity: number;
  showGun: "none" | "hold" | "self" | "you";
  showHandUp: boolean;
  showSweat: boolean;
  showShackles: boolean;
} {
  switch (clipId) {
    case "aimed_at":
      return {
        transform: "translateY(8px) scale(0.97) rotate(-1.5deg)",
        opacity: 1,
        showGun: "none",
        showHandUp: false,
        showSweat: true,
        showShackles: false,
      };
    case "hit_knockback":
      return {
        transform: "translateY(34px) scale(0.9) rotate(-8deg)",
        opacity: 0.48,
        showGun: "none",
        showHandUp: false,
        showSweat: false,
        showShackles: false,
      };
    case "recover":
      return {
        transform: "translateY(10px) scale(0.98) rotate(2deg)",
        opacity: 0.9,
        showGun: "none",
        showHandUp: false,
        showSweat: true,
        showShackles: false,
      };
    case "relief":
      return {
        transform: "translateY(6px) scale(1.01) rotate(1deg)",
        opacity: 1,
        showGun: "none",
        showHandUp: false,
        showSweat: false,
        showShackles: false,
      };
    case "take_gun":
    case "hold_gun":
      return {
        transform: "translateY(0px) scale(1.01)",
        opacity: 1,
        showGun: "hold",
        showHandUp: false,
        showSweat: false,
        showShackles: false,
      };
    case "aim_self":
      return {
        transform: "translateY(4px) scale(1.01) rotate(3deg)",
        opacity: 1,
        showGun: "self",
        showHandUp: false,
        showSweat: true,
        showShackles: false,
      };
    case "aim_you":
      return {
        transform: "translateY(-4px) scale(1.03)",
        opacity: 1,
        showGun: "you",
        showHandUp: false,
        showSweat: false,
        showShackles: false,
      };
    case "fire_recoil":
      return {
        transform: "translateY(-10px) scale(1.02) rotate(-3deg)",
        opacity: 1,
        showGun: "you",
        showHandUp: false,
        showSweat: false,
        showShackles: false,
      };
    case "use_mouth":
      return {
        transform: "translateY(-2px) scale(1.01) rotate(-2deg)",
        opacity: 1,
        showGun: "none",
        showHandUp: true,
        showSweat: false,
        showShackles: false,
      };
    case "use_hands":
      return {
        transform: "translateY(6px) scale(1.02)",
        opacity: 1,
        showGun: "none",
        showHandUp: true,
        showSweat: false,
        showShackles: false,
      };
    case "shackled":
      return {
        transform: "translateY(10px) scale(0.98)",
        opacity: 0.94,
        showGun: "none",
        showHandUp: false,
        showSweat: true,
        showShackles: true,
      };
    case "round_end":
      return {
        transform: "translateY(14px) scale(0.96)",
        opacity: 0.78,
        showGun: "none",
        showHandUp: false,
        showSweat: false,
        showShackles: false,
      };
    case "idle_alt":
      return {
        transform: "translateY(2px) rotate(1.8deg)",
        opacity: 1,
        showGun: "none",
        showHandUp: false,
        showSweat: false,
        showShackles: false,
      };
    case "idle":
    default:
      return {
        transform: "translateY(0px) scale(1)",
        opacity: 1,
        showGun: "none",
        showHandUp: false,
        showSweat: false,
        showShackles: false,
      };
  }
}

export function RivalPlaceholder({
  clipId,
  characterKind = "Kuleci",
  blinking = false,
  paused = false,
  className = "",
}: RivalPlaceholderProps) {
  const palette = CHARACTER_ACCENTS[characterKind];
  const pose = postureTransform(clipId);
  const eyeScaleY = blinking ? 0.12 : 1;

  return (
    <div
      data-testid="rival-placeholder"
      data-clip={clipId}
      className={`relative flex h-full w-full items-end justify-center select-none ${className}`}
      style={{
        transform: pose.transform,
        opacity: pose.opacity,
        transition: "transform 180ms ease-out, opacity 180ms ease-out",
      }}
    >
      <div
        className="h-full w-full origin-bottom"
        style={{
          animation: paused ? "none" : "rolet-rival-breathe 4.2s ease-in-out infinite",
        }}
      >
        <svg
          viewBox="0 0 360 420"
          className="h-full w-full overflow-visible drop-shadow-[0_18px_28px_rgba(0,0,0,0.85)]"
          aria-label={`Rival silhouette (${clipId})`}
        >
          <defs>
            <radialGradient id="rivalRim" cx="50%" cy="22%" r="60%">
              <stop offset="0%" stopColor={palette.brass} stopOpacity="0.24" />
              <stop offset="70%" stopColor="#0e0d0c" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="rivalCoat" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#26221e" />
              <stop offset="45%" stopColor={palette.coat} />
              <stop offset="100%" stopColor="#090808" />
            </linearGradient>
          </defs>

          {/* Back rim aura */}
          <ellipse cx="180" cy="180" rx="140" ry="165" fill="url(#rivalRim)" />

          {/* Shoulders & trench coat */}
          <path
            d="M 55 420 L 72 256 C 78 214 114 196 146 188 L 180 184 L 214 188 C 246 196 282 214 288 256 L 305 420 Z"
            fill="url(#rivalCoat)"
            stroke={palette.brass}
            strokeOpacity="0.32"
            strokeWidth="1.5"
          />

          {/* Collar & brass lapel clasp */}
          <path
            d="M 142 190 L 166 266 L 180 248 L 194 266 L 218 190 Z"
            fill="#11100f"
            stroke={palette.brass}
            strokeOpacity="0.4"
            strokeWidth="1.2"
          />
          <circle cx="180" cy="248" r="4" fill={palette.brass} opacity="0.85" />

          {/* Neck & head */}
          <rect x="160" y="152" width="40" height="40" rx="10" fill="#171412" />
          <ellipse
            cx="180"
            cy="126"
            rx="44"
            ry="54"
            fill="#1f1b18"
            stroke={palette.brass}
            strokeOpacity="0.35"
            strokeWidth="1.5"
          />

          {/* Clockwork bowler / watchmaker cap silhouette */}
          <path
            d="M 122 104 C 128 60 232 60 238 104 Z"
            fill="#12100f"
            stroke={palette.brass}
            strokeOpacity="0.45"
            strokeWidth="1.5"
          />
          <rect x="112" y="100" width="136" height="10" rx="4" fill="#0d0b0a" />
          <rect x="134" y="92" width="92" height="6" fill={palette.brass} opacity="0.45" />

          {/* Glowing goggles / eyes with blink */}
          <g transform="translate(180 124)">
            <g transform={`scale(1, ${eyeScaleY})`}>
              <circle cx="-18" cy="0" r="10" fill="#0b0a09" stroke={palette.brass} strokeWidth="1.6" />
              <circle cx="18" cy="0" r="10" fill="#0b0a09" stroke={palette.brass} strokeWidth="1.6" />
              <ellipse cx="-18" cy="0" rx="5.5" ry="4" fill={palette.visor} opacity="0.92" />
              <ellipse cx="18" cy="0" rx="5.5" ry="4" fill={palette.visor} opacity="0.92" />
            </g>
            <line x1="-8" y1="0" x2="8" y2="0" stroke={palette.brass} strokeWidth="1.4" />
          </g>

          {/* Sweat drop when aimed at / shackled */}
          {pose.showSweat && (
            <path
              d="M 224 114 C 228 122 228 127 224 129 C 220 127 220 122 224 114 Z"
              fill="#9cc4d8"
              opacity="0.85"
            />
          )}

          {/* Raised hand silhouette for item use */}
          {pose.showHandUp && (
            <g>
              <path
                d="M 248 292 L 222 214 L 204 206"
                fill="none"
                stroke="#29231f"
                strokeWidth="22"
                strokeLinecap="round"
              />
              <circle cx="204" cy="204" r="12" fill="#2c2622" stroke={palette.brass} strokeWidth="1.4" />
            </g>
          )}

          {/* Shackles overlay */}
          {pose.showShackles && (
            <g stroke="#c6a15b" strokeWidth="2.5" opacity="0.85">
              <ellipse cx="142" cy="306" rx="14" ry="8" fill="none" />
              <ellipse cx="218" cy="306" rx="14" ry="8" fill="none" />
              <path d="M 156 306 Q 180 326 204 306" fill="none" strokeDasharray="5 4" />
            </g>
          )}

          {/* 2D Revolver silhouette when rival holds/aims */}
          {pose.showGun === "hold" && (
            <g transform="translate(216 258) rotate(-18)">
              <rect x="0" y="0" width="46" height="10" rx="2" fill="#5e5548" stroke="#c6a15b" strokeWidth="1" />
              <rect x="8" y="8" width="16" height="14" rx="2" fill="#3b3228" />
              <rect x="0" y="10" width="11" height="24" rx="2" fill="#2d2016" transform="rotate(14 0 10)" />
            </g>
          )}
          {pose.showGun === "self" && (
            <g transform="translate(218 158) rotate(-162)">
              <rect x="0" y="0" width="52" height="10" rx="2" fill="#6b6152" stroke="#c6a15b" strokeWidth="1" />
              <rect x="10" y="8" width="16" height="13" rx="2" fill="#3b3228" />
              <rect x="0" y="10" width="11" height="22" rx="2" fill="#2d2016" transform="rotate(14 0 10)" />
            </g>
          )}
          {pose.showGun === "you" && (
            <g transform="translate(188 188)">
              <circle cx="0" cy="0" r="18" fill="#171411" stroke="#c6a15b" strokeWidth="2" />
              <circle cx="0" cy="0" r="8" fill="#050505" stroke="#e61919" strokeOpacity="0.65" strokeWidth="1.5" />
              <circle cx="0" cy="-12" r="2.2" fill="#c6a15b" />
            </g>
          )}
        </svg>
      </div>

      {/* Subtle clip badge for dev clarity */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 border border-[#c6a15b]/30 bg-[#0a0a0a]/80 px-2 py-0.5 font-mono text-[10px] tracking-[0.16em] text-[#c6a15b]/80 uppercase">
        {palette.tag} · {clipId}
      </div>
    </div>
  );
}
