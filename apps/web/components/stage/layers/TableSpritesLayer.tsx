"use client";

import { useState, type ReactNode } from "react";
import type { Item, Shell } from "@/lib/nearTypes";
import type { StageVisualState } from "../types";
import { ItemIcon } from "./ItemIcons";

/** Layout anchors (fractions of the 16:9 stage). */
const CHAMBER_ANCHOR = { x: 0.69, y: 0.47 };
const DECK_ANCHOR = { x: 0.88, y: 0.47 };
const SCORE_NOTCH_ANCHOR = { x: 0.5, y: 0.34 };
/** Fanned hands; rotation in degrees. */
const RIVAL_ITEM_SLOTS = [
  { x: 0.4, y: 0.015, rot: 8 },
  { x: 0.467, y: 0.0, rot: 3 },
  { x: 0.533, y: 0.0, rot: -3 },
  { x: 0.6, y: 0.015, rot: -8 },
] as const;
const LOCAL_ITEM_SLOTS = [
  { x: 0.38, y: 0.97, rot: -8 },
  { x: 0.46, y: 0.955, rot: -3 },
  { x: 0.54, y: 0.955, rot: 3 },
  { x: 0.62, y: 0.97, rot: 8 },
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
      className={`relative block w-full drop-shadow-[0_6px_8px_rgba(0,0,0,0.5)] ${dim ? "opacity-60" : ""}`}
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
  "@keyframes rolet-hp-hit{0%{transform:scale(1.35);background:#8a1c1c;color:#fff}100%{transform:scale(1)}}" +
  "@keyframes rolet-turn-pulse{0%,100%{box-shadow:0 0 0 0 rgba(229,195,120,.0)}50%{box-shadow:0 0 14px 4px rgba(229,195,120,.7)}}";

function HeartGlyph() {
  return (
    <svg viewBox="0 0 24 22" className="h-[0.9em] w-[0.9em]" aria-hidden="true">
      <path
        d="M12 21C5 15.5 1.5 12 1.5 7.6 1.5 4.4 4 2 7 2c2 0 3.8 1 5 2.8C13.2 3 15 2 17 2c3 0 5.5 2.4 5.5 5.6C22.5 12 19 15.5 12 21z"
        fill="#c4553f"
      />
    </svg>
  );
}

/** KARDS-style identity block: square portrait, name, numbered HP badge + round pips. */
function Identity({
  label,
  name,
  hp,
  healCut,
  wins,
  active,
  portrait,
}: {
  label: string;
  name: string;
  hp: number;
  healCut: boolean;
  wins: number;
  active: boolean;
  portrait: ReactNode;
}) {
  const [prev, setPrev] = useState(hp);
  const [hit, setHit] = useState(0);
  if (hp !== prev) {
    setPrev(hp);
    if (hp < prev) setHit(hit + 1);
  }
  return (
    <div className="pointer-events-none flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-2">
        <div
          className="aspect-square overflow-hidden border border-[#c9a24d] bg-[#1a1511] shadow-[0_4px_8px_rgba(0,0,0,0.5)]"
          style={{
            width: "clamp(40px,5vw,76px)",
            animation: active ? "rolet-turn-pulse 1.6s ease-in-out infinite" : "none",
          }}
        >
          {portrait}
        </div>
        <span className="font-serif text-[clamp(9px,1vw,14px)] font-bold tracking-[0.14em] whitespace-nowrap text-[#e9dcc0] [text-shadow:0_1px_3px_#000]">
          {name}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div
          key={hit}
          data-testid={`hp-badge-${label.toLowerCase()}`}
          role="img"
          aria-label={`${label} HP ${hp}`}
          title={`${label} HP ${hp}${healCut ? " (heal cut)" : ""}`}
          className="flex items-center gap-1 border border-[#3a3026] bg-[#14110d]/90 px-2 py-0.5 font-serif text-[clamp(16px,2.2vw,32px)] leading-none font-bold shadow-[0_4px_6px_rgba(0,0,0,0.5)]"
          style={{
            color: healCut ? "#e61919" : "#efe3c6",
            animation: hit > 0 ? "rolet-hp-hit 0.7s ease-out" : undefined,
          }}
        >
          {hp}
          <span className="text-[0.45em]"><HeartGlyph /></span>
        </div>
        <div className="flex gap-1.5" title={`${label} rounds won: ${wins}/2`}>
          {[0, 1].map((n) => (
            <span
              key={n}
              className="block h-1.5 w-1.5 rotate-45 rounded-[1px]"
              style={{
                background: n < wins ? "#c9a24d" : "rgba(10,8,6,0.55)",
                border: "1px solid #4a3a20",
              }}
            />
          ))}
        </div>
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
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const hoverItem = hoverSlot !== null ? localItems[hoverSlot] : undefined;

  return (
    <div data-testid="table-sprites-layer" className="pointer-events-none absolute inset-0 z-30">
      <style>{POP_CSS}</style>

      {/* Rival identity: top-left */}
      <div className="absolute" style={{ left: "1.5%", top: "2.5%" }}>
        <Identity
          label="RIVAL"
          name="THE DEALER"
          hp={visual.hp[opp]}
          healCut={visual.healCut[opp]}
          wins={visual.score[opp]}
          active={rivalTurn}
          portrait={
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/art/2d/dealer-face.png"
              alt="Dealer"
              draggable={false}
              className="h-full w-full select-none object-cover brightness-125"
            />
          }
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

      {/* Player identity: bottom-left */}
      <div className="absolute" style={{ left: "1.5%", bottom: "2.5%" }}>
        <Identity
          label="YOU"
          name="YOU"
          hp={visual.hp[you]}
          healCut={visual.healCut[you]}
          wins={visual.score[you]}
          active={active && visual.turn === you}
          portrait={
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-[#3a3026] to-[#1a1511] font-serif text-[clamp(18px,2.4vw,36px)] font-bold text-[#c9a24d]">
              Y
            </div>
          }
        />
      </div>

      {/* Enlarged hover preview of the hovered hand card */}
      {hoverItem && (
        <div
          data-testid="card-preview"
          className="absolute flex -translate-y-1/2 flex-col items-center gap-1.5"
          style={{ left: "2%", top: "50%", width: "16%" }}
        >
          <ItemCard item={hoverItem} />
          <span className="font-serif text-[clamp(10px,1.1vw,16px)] font-bold tracking-[0.14em] text-[#e9dcc0] uppercase [text-shadow:0_1px_3px_#000]">
            {ITEM_NAMES[hoverItem]}
          </span>
        </div>
      )}

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
                className="block w-full select-none drop-shadow-[0_6px_8px_rgba(0,0,0,0.5)]"
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
            onMouseEnter={() => usable && setHoverSlot(idx)}
            onMouseLeave={() => setHoverSlot((h) => (h === idx ? null : h))}
            onFocus={() => usable && setHoverSlot(idx)}
            onBlur={() => setHoverSlot((h) => (h === idx ? null : h))}
          >
            {item ? (
              <span
                className={`flex w-full transition duration-200 ${
                  usable ? "group-hover:-translate-y-[42%] group-hover:scale-105" : ""
                } ${selected ? "-translate-y-[42%] drop-shadow-[0_0_12px_rgba(229,195,120,0.9)]" : ""} ${
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
