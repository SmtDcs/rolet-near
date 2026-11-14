"use client";

import type { Item, Shell } from "@/lib/nearTypes";
import {
  LOCAL_HP_ANCHOR,
  LOCAL_ITEM_SLOTS,
  RIVAL_HP_ANCHOR,
  RIVAL_ITEM_SLOTS,
  SCORE_NOTCH_ANCHOR,
  SHELL_RACK_ANCHOR,
} from "@/lib/stage/layout";
import type { StageVisualState } from "../types";

export interface TableSpritesLayerProps {
  visual: StageVisualState;
  canAct: boolean;
  lockpickSlot: number | null;
  onUseItem?: (slot: number) => void;
  onSelectStealSlot?: (stealSlot: number) => void;
}

const ITEM_LABELS: Record<Item, { short: string; name: string }> = {
  Loupe: { short: "LOU", name: "Loupe" },
  Pipe: { short: "PIP", name: "Pipe" },
  Flask: { short: "FLA", name: "Flask" },
  Shackle: { short: "SHA", name: "Shackle" },
  Hacksaw: { short: "SAW", name: "Hacksaw" },
  Ticker: { short: "TIC", name: "Ticker" },
  Magnet: { short: "MAG", name: "Magnet" },
  Lockpick: { short: "LCK", name: "Lockpick" },
  Tincture: { short: "TIN", name: "Tincture" },
};

function HpTubePanel({
  label,
  hp,
  maxHp,
  healCut,
  xPct,
  yPct,
  align,
}: {
  label: string;
  hp: number;
  maxHp: number;
  healCut: boolean;
  xPct: number;
  yPct: number;
  align: "left" | "right";
}) {
  return (
    <div
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 border border-[#c6a15b]/35 bg-[#0e0c0a]/90 px-2.5 py-1.5"
      style={{ left: `${xPct}%`, top: `${yPct}%` }}
    >
      <div
        className={`mb-1 flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] uppercase ${
          align === "right" ? "justify-end" : "justify-start"
        }`}
      >
        <span className="text-[#c6a15b]">{label}</span>
        {healCut && (
          <span className="border border-[#e61919]/70 bg-[#e61919]/20 px-1 text-[9px] text-[#ff6b6b]">
            HEAL CUT
          </span>
        )}
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: maxHp }, (_, i) => {
          const lit = i < hp;
          return (
            <div
              key={i}
              className={`h-6 w-3 border transition-colors duration-200 ${
                lit
                  ? healCut && i === 0
                    ? "border-[#e61919] bg-[#e61919]/80 shadow-[0_0_8px_rgba(230,25,25,0.65)]"
                    : "border-[#e5c378] bg-[#c6a15b]/85 shadow-[0_0_8px_rgba(198,161,91,0.55)]"
                  : "border-[#3a3228] bg-[#161310]"
              }`}
              title={`${label} HP ${i + 1}`}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * L3: Interactive & animated tabletop sprites (8 chambers, 4+4 items, HP tubes, score notches).
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

  return (
    <div data-testid="table-sprites-layer" className="pointer-events-none absolute inset-0 z-30">
      {/* Best-of-3 Score Notches */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-4 border border-[#c6a15b]/25 bg-[#0c0a08]/85 px-3 py-1 font-mono text-[10px] tracking-[0.16em]"
        style={{
          left: `${SCORE_NOTCH_ANCHOR.x * 100}%`,
          top: `${SCORE_NOTCH_ANCHOR.y * 100}%`,
        }}
      >
        <span className="text-[#9a9a9a]">
          RIVAL {visual.score[opp]}/2
        </span>
        <span className="text-[#c6a15b]">R{visual.round}</span>
        <span className="text-[#eaeaea]">
          YOU {visual.score[you]}/2
        </span>
      </div>

      {/* 8-Chamber Shell Rack */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 border border-[#c6a15b]/30 bg-[#0d0b09]/90 px-2.5 py-1.5"
        style={{
          left: `${SHELL_RACK_ANCHOR.x * 100}%`,
          top: `${SHELL_RACK_ANCHOR.y * 100}%`,
        }}
      >
        {Array.from({ length: 8 }, (_, idx) => {
          const isLoaded = idx < visual.remaining;
          const known: Shell | undefined = isLoaded ? visual.knownShells.get(idx) : undefined;
          let tone = "border-[#2e2820] bg-[#14110e] text-[#4a4339]";
          let label = "·";
          if (isLoaded) {
            if (known === "Live") {
              tone = "border-[#e61919] bg-[#7f1616] text-[#ffd6d6]";
              label = "!";
            } else if (known === "Blank") {
              tone = "border-[#6e8a9c] bg-[#1e313d] text-[#c8e6f5]";
              label = "○";
            } else {
              tone = "border-[#c6a15b]/60 bg-[#2a2217] text-[#e5c378]";
              label = "?";
            }
          }
          return (
            <div
              key={idx}
              className={`flex h-6 w-3.5 items-center justify-center border font-mono text-[10px] font-bold ${tone}`}
              title={
                !isLoaded
                  ? "Empty chamber"
                  : known
                    ? `Chamber ${idx + 1}: ${known}`
                    : `Chamber ${idx + 1}: Loaded`
              }
            >
              {label}
            </div>
          );
        })}
        <span className="ml-2 font-mono text-[10px] text-[#9a9a9a]">
          {visual.announcedLive}D/{visual.announcedBlank}K
        </span>
      </div>

      {/* HP Tube Panels */}
      <HpTubePanel
        label="RIVAL"
        hp={visual.hp[opp]}
        maxHp={visual.maxHp}
        healCut={visual.healCut[opp]}
        xPct={RIVAL_HP_ANCHOR.x * 100}
        yPct={RIVAL_HP_ANCHOR.y * 100}
        align="left"
      />
      <HpTubePanel
        label="YOU"
        hp={visual.hp[you]}
        maxHp={visual.maxHp}
        healCut={visual.healCut[you]}
        xPct={LOCAL_HP_ANCHOR.x * 100}
        yPct={LOCAL_HP_ANCHOR.y * 100}
        align="right"
      />

      {/* Rival 4 Item Slots */}
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
            className={`absolute -translate-x-1/2 -translate-y-1/2 flex h-11 w-16 flex-col items-center justify-center border font-mono text-[10px] transition ${
              item
                ? stealable
                  ? "pointer-events-auto cursor-pointer border-[#e5c378] bg-[#2a2114]/95 text-[#eaeaea] ring-2 ring-[#c6a15b]/60 hover:bg-[#3a2d1b]"
                  : "pointer-events-none border-[#4a3e2c] bg-[#16130f]/90 text-[#c6a15b]"
                : "pointer-events-none border-[#25201a] bg-[#0e0c0a]/50 text-[#3e382f]"
            }`}
            style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
            title={item ? `${item}${stealable ? " (steal)" : ""}` : "Empty slot"}
          >
            <span className="font-bold tracking-wider">
              {item ? ITEM_LABELS[item].short : "—"}
            </span>
            {item && (
              <span className="text-[8px] text-[#9a9a9a] uppercase">
                {ITEM_LABELS[item].name}
              </span>
            )}
          </button>
        );
      })}

      {/* Local Player 4 Item Slots */}
      {LOCAL_ITEM_SLOTS.map((pos, idx) => {
        const item = localItems[idx];
        const usable = canAct && !pickingSteal && item !== undefined;
        const selectedForLockpick = lockpickSlot === idx;
        return (
          <button
            key={`local-slot-${idx}`}
            type="button"
            disabled={!usable}
            onClick={() => {
              if (usable) onUseItem?.(idx);
            }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 flex h-14 w-20 flex-col items-center justify-center border font-mono text-xs transition ${
              selectedForLockpick
                ? "pointer-events-auto border-[#e5c378] bg-[#362a16] text-[#fff] ring-2 ring-[#e5c378]"
                : usable
                  ? "pointer-events-auto cursor-pointer border-[#c6a15b]/70 bg-[#1a1611]/95 text-[#eaeaea] hover:border-[#e5c378] hover:bg-[#2a2218]"
                  : item
                    ? "pointer-events-none border-[#3d3426] bg-[#14110d]/85 text-[#8a703f]"
                    : "pointer-events-none border-[#241f19] bg-[#0d0b09]/55 text-[#38322a]"
            }`}
            style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
            title={item ? `${ITEM_LABELS[item].name} kullan` : "Empty slot"}
          >
            <span className="font-bold tracking-widest">
              {item ? ITEM_LABELS[item].short : "—"}
            </span>
            {item && (
              <span className="mt-0.5 text-[9px] text-[#c6a15b] uppercase">
                {ITEM_LABELS[item].name}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
