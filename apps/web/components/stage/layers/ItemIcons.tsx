import type { Item } from "@/lib/nearTypes";

/** Painted sprites; Loupe/Pipe/Magnet reuse the closest available art. */
const SPRITES: Record<Item, string> = {
  Lockpick: "/art/item-lockpick.png",
  Flask: "/art/item-flask.png",
  Shackle: "/art/item-shackle.png",
  Hacksaw: "/art/item-hacksaw.png",
  Tincture: "/art/item-tincture.png",
  Ticker: "/art/item-ticker.png",
  Loupe: "/art/item-ticker.png",
  Pipe: "/art/item-tincture.png",
  Magnet: "/art/item-shackle.png",
};

export function ItemIcon({ item, className }: { item: Item; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SPRITES[item]}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`select-none object-contain ${className ?? ""}`}
      style={{ filter: "drop-shadow(0 6px 5px rgba(0,0,0,0.85))" }}
    />
  );
}
