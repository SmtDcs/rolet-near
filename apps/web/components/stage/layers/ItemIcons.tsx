import type { ReactNode } from "react";
import type { Item } from "@/lib/nearTypes";

const S = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;

const ICONS: Record<Item, ReactNode> = {
  Loupe: (
    <>
      <circle cx="20" cy="20" r="11" stroke="#d9c08a" strokeWidth="3" {...S} fill="rgba(150,200,220,0.18)" />
      <path d="M12 16a9 9 0 0 1 7-5" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" {...S} />
      <path d="M28 28l13 13" stroke="#6b4a2a" strokeWidth="5" {...S} />
    </>
  ),
  Pipe: (
    <>
      <path d="M8 34h18c6 0 9-3 9-8v-6" stroke="#6b4a2a" strokeWidth="4" {...S} />
      <path d="M30 20h10v-8H30z" fill="#3a2614" stroke="#8a6238" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M33 10c0-3 3-3 3-6" stroke="#aaa" strokeOpacity="0.5" strokeWidth="1.5" {...S} />
    </>
  ),
  Flask: (
    <>
      <path d="M19 6h10M21 6v10L11 36c-1 3 1 5 4 5h18c3 0 5-2 4-5L27 16V6" stroke="#d9c08a" strokeWidth="2.5" {...S} fill="rgba(120,60,30,0.2)" />
      <path d="M14 32h20l3 6c.5 1.5-.5 2.5-2 2.5H13c-1.500 0-2.500-1-2-2.500z" fill="#a8531f" fillOpacity="0.8" />
    </>
  ),
  Shackle: (
    <>
      <circle cx="15" cy="30" r="9" stroke="#b9b4aa" strokeWidth="4" {...S} />
      <circle cx="33" cy="30" r="9" stroke="#b9b4aa" strokeWidth="4" {...S} />
      <path d="M19 12a5 5 0 0 1 10 0v6" stroke="#b9b4aa" strokeWidth="3.5" {...S} />
      <path d="M21 22h6" stroke="#b9b4aa" strokeWidth="4" {...S} />
    </>
  ),
  Hacksaw: (
    <>
      <path d="M8 14h32" stroke="#c9c4ba" strokeWidth="3" {...S} />
      <path d="M8 14v20h6M40 14v10" stroke="#8a6238" strokeWidth="4" {...S} />
      <path d="M8 34h26l6-10" stroke="#8b8b8b" strokeWidth="2" {...S} />
      <path d="M12 34l2 4 2-4 2 4 2-4 2 4 2-4 2 4 2-4 2 4" stroke="#ccc" strokeWidth="1.5" {...S} />
    </>
  ),
  Ticker: (
    <>
      <rect x="7" y="22" width="34" height="18" rx="3" fill="#2a2118" stroke="#8a6238" strokeWidth="2.5" />
      <path d="M13 22c0-8 6-12 11-12s11 4 11 12" stroke="#d9c08a" strokeWidth="2" {...S} />
      <path d="M24 10V4M20 4h8" stroke="#d9c08a" strokeWidth="2.5" {...S} />
      <path d="M13 33h22" stroke="#d9c08a" strokeOpacity="0.7" strokeWidth="2" {...S} />
      <circle cx="35" cy="28" r="1.8" fill="#e5c378" />
    </>
  ),
  Magnet: (
    <>
      <path d="M12 40V22a12 12 0 0 1 24 0v18" stroke="#c42b2b" strokeWidth="8" {...S} />
      <path d="M8 40h8M32 40h8" stroke="#e8e8e8" strokeWidth="8" strokeLinecap="butt" />
    </>
  ),
  Lockpick: (
    <>
      <path d="M8 38L30 16" stroke="#c9c4ba" strokeWidth="3" {...S} />
      <path d="M30 16c3-3 7-3 8 0s-1 5-4 4" stroke="#c9c4ba" strokeWidth="3" {...S} />
      <path d="M10 26L28 8" stroke="#8b8b8b" strokeWidth="2.5" {...S} />
      <path d="M6 40l5-5" stroke="#6b4a2a" strokeWidth="5" {...S} />
    </>
  ),
  Tincture: (
    <>
      <path d="M19 8h10v6H19z" fill="#6b4a2a" />
      <path d="M20 14h8v4c5 3 8 7 8 13 0 6-4 10-12 10S12 37 12 31c0-6 3-10 8-13z" fill="rgba(90,170,110,0.35)" stroke="#d9c08a" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M14 30h20c0 5-4 8-10 8s-10-3-10-8z" fill="#4cae6a" fillOpacity="0.7" />
    </>
  ),
};

export function ItemIcon({ item, className }: { item: Item; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {ICONS[item]}
    </svg>
  );
}
