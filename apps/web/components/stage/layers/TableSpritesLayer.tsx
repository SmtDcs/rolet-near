"use client";

import type { Item, Shell } from "@/lib/nearTypes";
import type { StageVisualState } from "../types";
import { ItemIcon } from "./ItemIcons";

/** Anchors aligned to the felt in /art/scene.webp (felt spans x 5-95%, y 71-93%). */
const RIVAL_HP_ANCHOR = { x: 0.09, y: 0.8 };
const LOCAL_HP_ANCHOR = { x: 0.91, y: 0.8 };
const SHELL_RACK_ANCHOR = { x: 0.5, y: 0.8 };
const SCORE_NOTCH_ANCHOR = { x: 0.5, y: 0.73 };
const RIVAL_ITEM_SLOTS = [
  { x: 0.17, y: 0.76 },
  { x: 0.3, y: 0.76 },
  { x: 0.7, y: 0.76 },
  { x: 0.83, y: 0.76 },
] as const;
const LOCAL_ITEM_SLOTS = [
  { x: 0.17, y: 0.88 },
  { x: 0.3, y: 0.88 },
  { x: 0.7, y: 0.88 },
  { x: 0.83, y: 0.88 },
] as const;

export interface TableSpritesLayerProps {
  visual: StageVisualState;
  canAct: boolean;
  lockpickSlot: number | null;
  onUseItem?: (slot: number) => void;
  onSelectStealSlot?: (stealSlot: number) => void;
}

const ITEM_NAMES: Record<Item, string> = {
  Loupe: "Loupe",
  Pipe: "Pipe",
  Flask: "Flask",
  Shackle: "Shackle",
  Hacksaw: "Hacksaw",
  Ticker: "Ticker",
  Magnet: "Magnet",
  Lockpick: "Lockpick",
  Tincture: "Tincture",
};

/** Glowing bulbs standing on the table + best-of-3 notches carved beside them. */
function SideTokens({
  label,
  hp,
  maxHp,
  healCut,
  wins,
  xPct,
  yPct,
  tone,
}: {
  label: string;
  hp: number;
  maxHp: number;
  healCut: boolean;
  wins: number;
  xPct: number;
  yPct: number;
  tone: "warm" | "red";
}) {
  const lit = tone === "warm" ? "#f2c46a" : "#e04545";
  const glow = tone === "warm" ? "rgba(242,196,106,0.75)" : "rgba(224,69,69,0.75)";
  return (
    <div
      className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2"
      style={{ left: `${xPct}%`, top: `${yPct}%` }}
    >
      <div className="flex gap-2">
        {Array.from({ length: maxHp }, (_, i) => {
          const on = i < hp;
          const cut = on && healCut && i === 0;
          return (
            <div key={i} className="relative" title={`${label} HP ${i + 1}`}>
              <div
                className="h-5 w-3 rounded-t-full rounded-b-[3px] transition-all duration-300"
                style={{
                  background: on
                    ? `radial-gradient(circle at 35% 30%, #fff8e0 0%, ${cut ? "#e61919" : lit} 55%, #5a3a10 100%)`
                    : "linear-gradient(#1a1713, #0d0b09)",
                  boxShadow: on
                    ? `0 0 10px 2px ${cut ? "rgba(230,25,25,0.7)" : glow}, 0 4px 5px rgba(0,0,0,0.7)`
                    : "0 3px 4px rgba(0,0,0,0.7)",
                  border: on ? "none" : "1px solid #2a241c",
                }}
              />
              <div className="mx-auto h-1 w-2 bg-[#3a3228]" />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5" title={`${label} rounds won: ${wins}/2`}>
        {[0, 1].map((n) => (
          <span
            key={n}
            className="block h-[3px] w-5 rounded-full"
            style={{
              background: n < wins ? "#e5c378" : "#2a241c",
              boxShadow: n < wins ? "0 0 6px rgba(229,195,120,0.7)" : "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** 8-chamber cylinder ring drawn beside the revolver. */
function ChamberRing({ visual }: { visual: StageVisualState }) {
  const R = 17;
  return (
    <svg
      viewBox="-26 -26 52 52"
      className="h-12 w-12 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
      role="img"
      aria-label={`${visual.remaining} of 8 chambers loaded`}
    >
      <circle r="23" fill="#14110d" stroke="#5c4228" strokeWidth="1.5" />
      <circle r="5" fill="#0a0806" stroke="#3a2c1c" strokeWidth="1" />
      {Array.from({ length: 8 }, (_, idx) => {
        const a = (idx * Math.PI) / 4 - Math.PI / 2;
        const loaded = idx < visual.remaining;
        const known: Shell | undefined = loaded ? visual.knownShells.get(idx) : undefined;
        const fill = !loaded
          ? "#0c0a08"
          : known === "Live"
            ? "#e03030"
            : known === "Blank"
              ? "#7fa6bd"
              : "#c6a15b";
        return (
          <circle
            key={idx}
            cx={Math.cos(a) * R}
            cy={Math.sin(a) * R}
            r="4.2"
            fill={fill}
            stroke={loaded ? "#2a1d10" : "#2a241c"}
            strokeWidth="1"
            style={loaded && known === "Live" ? { filter: "drop-shadow(0 0 3px #e03030)" } : undefined}
          >
            <title>
              {!loaded
                ? "Empty chamber"
                : known
                  ? `Chamber ${idx + 1}: ${known}`
                  : `Chamber ${idx + 1}: Loaded`}
            </title>
          </circle>
        );
      })}
    </svg>
  );
}

/**
 * L3: Tabletop objects: chamber ring, items lying on the felt, HP bulbs, round notches.
 */
export function TableSpritesLayer({
  visual,
  canAct,
  lockpickSlot,
  onUseItem,
  onSelectStealSlot,
}: TableSpritesLayerProps) {
  const you = visual.you;
  const opp = (1 - you) as 0 | 1;
  const localItems = visual.items[you];
  const oppItems = visual.items[opp];
  const pickingSteal = lockpickSlot !== null;
  const active = visual.phase === "active";
  const yourTurn = active && visual.turn === you;
  const rivalTurn = active && visual.turn === opp;

  return (
    <div data-testid="table-sprites-layer" className="pointer-events-none absolute inset-0 z-30">
      {/* Table lighting: warm pool on your side, red cast on the rival's */}
      <div
        className="absolute inset-x-0 bottom-0 h-[34%] transition-opacity duration-700"
        style={{
          opacity: yourTurn ? 1 : 0,
          background:
            "radial-gradient(ellipse 60% 70% at 50% 100%, rgba(255,190,100,0.20) 0%, transparent 72%)",
        }}
      />
      <div
        className="absolute inset-x-0 top-[66%] h-[16%] transition-opacity duration-700"
        style={{
          opacity: rivalTurn ? 1 : 0,
          background:
            "radial-gradient(ellipse 60% 80% at 50% 30%, rgba(220,30,30,0.22) 0%, transparent 72%)",
        }}
      />

      {/* Chamber ring by the revolver */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${(SHELL_RACK_ANCHOR.x + 0.13) * 100}%`, top: `${(SHELL_RACK_ANCHOR.y + 0.05) * 100}%` }}
      >
        <ChamberRing visual={visual} />
      </div>

      {/* Hacksaw marker (subtle) */}
      {visual.sawActive && (
        <div
          className="absolute -translate-x-1/2 font-mono text-[10px] tracking-[0.2em] text-[#e04545]/90 uppercase"
          style={{ left: `${SCORE_NOTCH_ANCHOR.x * 100}%`, top: `${SCORE_NOTCH_ANCHOR.y * 100 - 1}%` }}
        >
          sawn-off · 2×
        </div>
      )}

      <SideTokens
        label="RIVAL"
        hp={visual.hp[opp]}
        maxHp={visual.maxHp}
        healCut={visual.healCut[opp]}
        wins={visual.score[opp]}
        xPct={RIVAL_HP_ANCHOR.x * 100}
        yPct={RIVAL_HP_ANCHOR.y * 100}
        tone="red"
      />
      <SideTokens
        label="YOU"
        hp={visual.hp[you]}
        maxHp={visual.maxHp}
        healCut={visual.healCut[you]}
        wins={visual.score[you]}
        xPct={LOCAL_HP_ANCHOR.x * 100}
        yPct={LOCAL_HP_ANCHOR.y * 100}
        tone="warm"
      />

      {/* Rival items */}
      {RIVAL_ITEM_SLOTS.map((pos, idx) => {
        const item = oppItems[idx];
        const stealable = pickingSteal && item !== undefined && item !== "Lockpick";
        return (
          <button
            key={`opp-slot-${idx}`}
            type="button"
            disabled={!stealable}
            onClick={() => {
              if (stealable) onSelectStealSlot?.(idx);
            }}
            className={`absolute flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition ${
              stealable
                ? "pointer-events-auto cursor-pointer drop-shadow-[0_0_10px_rgba(229,195,120,0.9)] hover:scale-110"
                : "pointer-events-none"
            }`}
            style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
            title={item ? `${item}${stealable ? " (steal)" : ""}` : "Empty slot"}
          >
            {item ? (
              <ItemIcon
                item={item}
                className="h-16 w-16 -rotate-6 opacity-90"
              />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-[#2a241c]" />
            )}
          </button>
        );
      })}

      {/* Your items */}
      {LOCAL_ITEM_SLOTS.map((pos, idx) => {
        const item = localItems[idx];
        const usable = canAct && !pickingSteal && item !== undefined;
        const selected = lockpickSlot === idx;
        return (
          <button
            key={`local-slot-${idx}`}
            type="button"
            disabled={!usable}
            onClick={() => {
              if (usable) onUseItem?.(idx);
            }}
            className={`absolute flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition duration-200 ${
              usable
                ? "pointer-events-auto cursor-pointer hover:-translate-y-[60%] hover:scale-110"
                : "pointer-events-none"
            }`}
            style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
            title={item ? `Use ${ITEM_NAMES[item]}` : "Empty slot"}
          >
            {item ? (
              <>
                {(usable || selected) && (
                  <span
                    className="absolute inset-1 rounded-full"
                    style={{
                      background: `radial-gradient(circle, rgba(242,196,106,${selected ? 0.5 : 0.22}) 0%, transparent 70%)`,
                    }}
                  />
                )}
                <ItemIcon
                  item={item}
                  className={`relative h-20 w-20 rotate-3 ${
                    usable || selected ? "" : "opacity-60"
                  }`}
                />
              </>
            ) : (
              <span className="h-2 w-2 rounded-full bg-[#2a241c]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
