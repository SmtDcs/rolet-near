"use client";

import { useState } from "react";
import type { Item, Shell } from "@/lib/nearTypes";
import type { StageVisualState } from "../types";
import { ItemIcon } from "./ItemIcons";

/** Layout anchors (fractions of the 16:9 stage). */
const RIVAL_AVATAR = { x: 0.15, y: 0.15 };
const LOCAL_HP_ANCHOR = { x: 0.16, y: 0.86 };
const CHAMBER_ANCHOR = { x: 0.29, y: 0.47 };
const DECK_ANCHOR = { x: 0.7, y: 0.47 };
const SCORE_NOTCH_ANCHOR = { x: 0.5, y: 0.34 };
/** Fanned hands; rotation in degrees. */
const RIVAL_ITEM_SLOTS = [
  { x: 0.4, y: 0.12, rot: 6 },
  { x: 0.467, y: 0.115, rot: 2 },
  { x: 0.533, y: 0.115, rot: -2 },
  { x: 0.6, y: 0.12, rot: -6 },
] as const;
const LOCAL_ITEM_SLOTS = [
  { x: 0.38, y: 0.83, rot: -8 },
  { x: 0.46, y: 0.82, rot: -3 },
  { x: 0.54, y: 0.82, rot: 3 },
  { x: 0.62, y: 0.83, rot: 8 },
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


const ITEM_ART: Partial<Record<Item, string>> = {
  Lockpick: "/art/2d/item-lockpick.png",
  Flask: "/art/2d/item-flask.png",
  Shackle: "/art/2d/item-shackle.png",
  Hacksaw: "/art/2d/item-hacksaw.png",
  Tincture: "/art/2d/item-tincture.png",
  Ticker: "/art/2d/item-ticker.png",
};

/** Face-up card: parchment frame, item art in the window, name in the banner. Fills its (container-sized) parent. */
function ItemCard({ item, dim = false }: { item: Item; dim?: boolean }) {
  const art = ITEM_ART[item];
  return (
    <span
      className={`relative block w-full shadow-[0_6px_10px_rgba(0,0,0,0.55)] ${dim ? "opacity-60" : ""}`}
      style={{ aspectRatio: "321 / 480", containerType: "inline-size" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/art/2d/card-frame.png"
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full select-none"
      />
      <span
        className="absolute flex items-center justify-center"
        style={{ left: "12%", top: "17%", width: "76%", height: "58%" }}
      >
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt="" draggable={false} className="h-full w-full object-contain" />
        ) : (
          <ItemIcon item={item} className="h-full w-full" />
        )}
      </span>
      <span
        className="absolute flex items-center justify-center font-serif font-bold tracking-wider whitespace-nowrap text-[#2a1d10] uppercase"
        style={{ left: "22%", top: "79%", width: "56%", height: "11%", fontSize: "9cqw" }}
      >
        {ITEM_NAMES[item]}
      </span>
    </span>
  );
}

const POP_CSS =
  "@keyframes rolet-hp-pop{0%{transform:scale(1.7);filter:brightness(1.6) saturate(2)}60%{transform:scale(.85)}100%{transform:scale(1)}}" +
  "@keyframes rolet-turn-pulse{0%,100%{box-shadow:0 0 0 0 rgba(229,195,120,.0)}50%{box-shadow:0 0 14px 4px rgba(229,195,120,.7)}}";

function Heart({ on, cut, pop, color }: { on: boolean; cut: boolean; pop: boolean; color: string }) {
  return (
    <svg
      viewBox="0 0 24 22"
      className="h-full w-full"
      style={pop ? { animation: "rolet-hp-pop 0.5s ease-out" } : undefined}
    >
      <path
        d="M12 21C5 15.5 1.5 12 1.5 7.6 1.5 4.4 4 2 7 2c2 0 3.8 1 5 2.8C13.2 3 15 2 17 2c3 0 5.5 2.4 5.5 5.6C22.5 12 19 15.5 12 21z"
        fill={on ? (cut ? "#e61919" : color) : "rgba(10,8,6,0.55)"}
        stroke={on ? "#2a0f0a" : "#3a3228"}
        strokeWidth="1.4"
        style={on ? { filter: `drop-shadow(0 2px 2px rgba(0,0,0,0.6))` } : undefined}
      />
      {on && <ellipse cx="7.5" cy="7" rx="2.2" ry="1.3" fill="rgba(255,255,255,0.5)" transform="rotate(-30 7.5 7)" />}
    </svg>
  );
}

/** HP hearts + best-of-3 round pips. */
function HpTokens({
  label,
  hp,
  maxHp,
  healCut,
  wins,
  tone,
}: {
  label: string;
  hp: number;
  maxHp: number;
  healCut: boolean;
  wins: number;
  tone: "warm" | "red";
}) {
  const lit = tone === "warm" ? "#e8b44a" : "#d93b3b";
  const [prev, setPrev] = useState(hp);
  const [pop, setPop] = useState({ lo: 0, hi: 0, k: 0 });
  if (hp !== prev) {
    setPrev(hp);
    if (hp < prev) setPop({ lo: hp, hi: prev, k: pop.k + 1 });
  }
  return (
    <div className="pointer-events-none flex flex-col items-start gap-1.5">
      <div className="flex gap-1.5">
        {Array.from({ length: maxHp }, (_, i) => {
          const on = i < hp;
          const popped = i >= pop.lo && i < pop.hi && pop.k > 0;
          return (
            <div
              key={`${i}-${popped ? pop.k : 0}`}
              className="h-[clamp(14px,2.4vw,34px)] w-[clamp(14px,2.4vw,34px)]"
              title={`${label} HP ${i + 1}`}
            >
              <Heart on={on} cut={on && healCut && i === 0} pop={popped} color={lit} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5" title={`${label} rounds won: ${wins}/2`}>
        {[0, 1].map((n) => (
          <span
            key={n}
            className="block h-1.5 w-1.5 rotate-45 rounded-[1px]"
            style={{
              background: n < wins ? "#e5c378" : "rgba(10,8,6,0.55)",
              boxShadow: n < wins ? "0 0 6px rgba(229,195,120,0.8)" : "none",
              border: "1px solid #4a3a20",
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
      className="h-[clamp(40px,5vw,72px)] w-[clamp(40px,5vw,72px)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
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
  const rivalTurn = active && visual.turn === opp;

  return (
    <div data-testid="table-sprites-layer" className="pointer-events-none absolute inset-0 z-30">
      <style>{POP_CSS}</style>

      {/* Rival: round avatar with gold ring + HP */}
      <div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-3"
        style={{ left: `${RIVAL_AVATAR.x * 100}%`, top: `${RIVAL_AVATAR.y * 100}%` }}
      >
        <div
          className="aspect-square overflow-hidden rounded-full border-[3px] border-[#d4a84b] bg-[#14110d] shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
          style={{
            width: "clamp(36px,5.2vw,80px)",
            animation: rivalTurn ? "rolet-turn-pulse 1.6s ease-in-out infinite" : "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/art/2d/dealer-face.png"
            alt="Dealer"
            draggable={false}
            className="h-full w-full select-none object-cover"
          />
        </div>
        <HpTokens
          label="RIVAL"
          hp={visual.hp[opp]}
          maxHp={visual.maxHp}
          healCut={visual.healCut[opp]}
          wins={visual.score[opp]}
          tone="red"
        />
      </div>

      {/* Center: cylinder + live/blank counts, deck pile */}
      <div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
        style={{ left: `${CHAMBER_ANCHOR.x * 100}%`, top: `${CHAMBER_ANCHOR.y * 100}%` }}
      >
        <ChamberRing visual={visual} />
        <span className="font-mono text-[10px] tracking-[0.15em] whitespace-nowrap text-[#f4e9cc] uppercase [text-shadow:0_1px_2px_#000]">
          <span className="text-[#ff7a6a]">{visual.announcedLive} live</span>
          {" · "}
          <span className="text-[#9fc8e0]">{visual.announcedBlank} blank</span>
        </span>
      </div>
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${DECK_ANCHOR.x * 100}%`, top: `${DECK_ANCHOR.y * 100}%`, width: "6%" }}
        aria-hidden="true"
      >
        <div className="relative w-full" style={{ aspectRatio: "332 / 480" }}>
          {[0, 1, 2].map((n) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={n}
              src="/art/2d/card-back.png"
              alt=""
              draggable={false}
              className="absolute h-full w-full select-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]"
              style={{ left: n * 2, top: -n * 2 }}
            />
          ))}
        </div>
      </div>

      {/* Hacksaw marker */}
      {visual.sawActive && (
        <div
          className="absolute -translate-x-1/2 font-mono text-[10px] tracking-[0.2em] text-[#ff8a7a] uppercase [text-shadow:0_1px_2px_#000]"
          style={{ left: `${SCORE_NOTCH_ANCHOR.x * 100}%`, top: `${SCORE_NOTCH_ANCHOR.y * 100}%` }}
        >
          sawn-off · 2×
        </div>
      )}

      {/* Player HP */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${LOCAL_HP_ANCHOR.x * 100}%`, top: `${LOCAL_HP_ANCHOR.y * 100}%` }}
      >
        <HpTokens
          label="YOU"
          hp={visual.hp[you]}
          maxHp={visual.maxHp}
          healCut={visual.healCut[you]}
          wins={visual.score[you]}
          tone="warm"
        />
      </div>

      {/* Rival items: face-down cards along the top edge */}
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
            className={`absolute flex items-center justify-center rounded-md transition ${
              stealable
                ? "pointer-events-auto cursor-pointer drop-shadow-[0_0_10px_rgba(229,195,120,0.9)] hover:scale-110"
                : "pointer-events-none"
            }`}
            style={{
              left: `${pos.x * 100}%`,
              top: `${pos.y * 100}%`,
              width: "7%",
              transform: `translate(-50%, -50%) rotate(${pos.rot}deg)`,
            }}
            title={item ? `${item}${stealable ? " (steal)" : ""}` : "Empty slot"}
          >
            {item ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/art/2d/card-back.png"
                alt=""
                draggable={false}
                className="block w-full select-none drop-shadow-[0_4px_5px_rgba(0,0,0,0.6)]"
              />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-black/40" />
            )}
          </button>
        );
      })}

      {/* Your items: face-up fan */}
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
            className={`absolute group flex items-center justify-center rounded-md transition-transform duration-200 ${
              usable
                ? "pointer-events-auto cursor-pointer hover:z-10"
                : "pointer-events-none"
            }`}
            style={{
              left: `${pos.x * 100}%`,
              top: `${pos.y * 100}%`,
              width: "10%",
              transform: `translate(-50%, -50%) rotate(${pos.rot}deg)`,
            }}
            title={item ? `Use ${ITEM_NAMES[item]}` : "Empty slot"}
          >
            {item ? (
              <span
                className={`flex w-full transition duration-200 ${
                  usable ? "group-hover:-translate-y-4 group-hover:scale-105" : ""
                } ${selected ? "-translate-y-4 drop-shadow-[0_0_12px_rgba(229,195,120,0.9)]" : ""} ${
                  usable && !selected ? "drop-shadow-[0_0_8px_rgba(242,196,106,0.35)]" : ""
                }`}
              >
                <ItemCard item={item} dim={!(usable || selected)} />
              </span>
            ) : (
              <span className="h-2 w-2 rounded-full bg-black/40" />
            )}
          </button>
        );
      })}
    </div>
  );
}
