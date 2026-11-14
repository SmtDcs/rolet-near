import { ITEMS, type Item } from "../nearTypes";

export interface RoundConfig {
  start_hp: number;
  items_per_load: number;
  heal_cut_at: number | null;
}

export interface GameConfig {
  price: string;
  ops_bps: number;
  durability: number;
  reward: string;
  reveal_ms: number;
  turn_ms: number;
  allowance_hint: string;
  tincture_good_pct: number;
  max_items: number;
  min_treasury: string;
  load_size: number;
  min_live: number;
  max_live: number;
  copies_per_item: number;
  rounds: [RoundConfig, RoundConfig, RoundConfig];
}

export const ALL_ITEMS: readonly Item[] = ITEMS;

/**
 * Default Rolet NEAR configuration matching contracts/rolet-near/init-config.json
 * and Config::default() in contracts/rolet-near/src/config.rs.
 */
export const DEFAULT_GAME_CONFIG: GameConfig = {
  price: "1000000000000000000000000",
  ops_bps: 500,
  durability: 10,
  reward: "100000000000000000000000",
  reveal_ms: 60000,
  turn_ms: 45000,
  allowance_hint: "500000000000000000000000",
  tincture_good_pct: 50,
  max_items: 4,
  min_treasury: "100000000000000000000000",
  load_size: 8,
  min_live: 2,
  max_live: 6,
  copies_per_item: 4,
  rounds: [
    { start_hp: 4, items_per_load: 4, heal_cut_at: null },
    { start_hp: 4, items_per_load: 4, heal_cut_at: null },
    { start_hp: 4, items_per_load: 4, heal_cut_at: 2 },
  ],
};

export function newDeck(copiesPerItem: number): number[] {
  return Array.from({ length: ALL_ITEMS.length }, () => copiesPerItem);
}

export function deckRemaining(deckCounts: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < deckCounts.length; i++) {
    total += deckCounts[i] ?? 0;
  }
  return total;
}
