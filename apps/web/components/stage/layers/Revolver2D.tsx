"use client";

import type { GunHolder } from "../types";

/** Gun rests flat at the center of the board; the rival holds it near the top edge. */
export const GUN_TABLE_ANCHOR = { x: 0.5, y: 0.47 };
export const GUN_RIVAL_ANCHOR = { x: 0.5, y: 0.3 };

const CSS =
  "@keyframes rolet-gun-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}" +
  "@keyframes rolet-gun-recoil{0%{transform:translateX(0)}25%{transform:translateX(-6%) rotate(-3deg)}100%{transform:translateX(0)}}" +
  "@keyframes rolet-muzzle-pop{0%{opacity:1;transform:translate(-50%,-50%) scale(.4)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.6)}}";

/** 2D illustrated revolver (barrel points RIGHT in the art). aim: -1 self .. 0 lifted .. +1 opponent. */
export function Revolver2D({
  gunHolder,
  gunAim,
  muzzleFlash = false,
  paused = false,
}: {
  gunHolder: GunHolder;
  gunAim: number;
  muzzleFlash?: boolean;
  paused?: boolean;
}) {
  const rival = gunHolder === "rival";
  const local = gunHolder === "local";
  const aim = Math.max(-1, Math.min(1, gunAim));

  // Top-down board: barrel RIGHT at rest; aim +1 (opponent) = -90deg (barrel up), -1 (self) = +90deg (barrel down).
  const rot = rival ? 90 : local ? -90 * aim : 0;
  const scale = local ? 1.15 : 1;
  const transform = `translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`;
  const left = GUN_TABLE_ANCHOR.x * 100;
  const top = (rival ? GUN_RIVAL_ANCHOR.y : GUN_TABLE_ANCHOR.y) * 100;

  return (
    <div
      data-testid="revolver-2d"
      className="pointer-events-none absolute w-[22%] transition-[transform,left,top] duration-[250ms] ease-out"
      style={{ left: `${left}%`, top: `${top}%`, transform }}
    >
      <style>{CSS}</style>
      <div
        style={{
          animation: paused
            ? "none"
            : muzzleFlash
              ? "rolet-gun-recoil 0.3s ease-out"
              : gunHolder === "table"
                ? "rolet-gun-bob 3.6s ease-in-out infinite"
                : "none",
        }}
      >
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/art/2d/gun.png"
            alt="Revolver"
            draggable={false}
            className="block h-auto w-full select-none"
            style={{
              filter: local
                ? "drop-shadow(0 14px 10px rgba(0,0,0,0.55))"
                : "drop-shadow(0 4px 4px rgba(0,0,0,0.55))",
              transition: "filter 250ms ease-out",
            }}
          />
          {muzzleFlash && (
            <div
              className="absolute w-[38%] mix-blend-screen"
              style={{
                left: "100%",
                top: "38%",
                aspectRatio: "1",
                background:
                  "radial-gradient(circle, rgba(255,255,235,1) 0%, rgba(255,214,90,0.85) 30%, rgba(255,160,40,0) 68%)",
                animation: "rolet-muzzle-pop 0.3s ease-out forwards",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
