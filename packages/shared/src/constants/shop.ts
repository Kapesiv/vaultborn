import type { Rarity } from '../types/inventory.js';

export interface ShopEntry {
  defId: string;
  buyPrice: number;
  sellPrice: number;
}

export const BLACKSMITH_SHOP: ShopEntry[] = [
  { defId: 'wooden_sword', buyPrice: 50, sellPrice: 15 },
  { defId: 'leather_cap', buyPrice: 30, sellPrice: 9 },
  { defId: 'leather_vest', buyPrice: 60, sellPrice: 18 },
  { defId: 'leather_pants', buyPrice: 45, sellPrice: 13 },
  { defId: 'leather_boots', buyPrice: 25, sellPrice: 7 },
  { defId: 'health_potion', buyPrice: 15, sellPrice: 5 },
];

const SELL_MULTIPLIERS: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.5,
  rare: 2.5,
  epic: 4,
  legendary: 8,
};

/** Sell price for items not in the shop (loot drops, etc.) */
export function getDefaultSellPrice(tier: number, rarity: Rarity): number {
  const base = tier * 5;
  return Math.floor(base * SELL_MULTIPLIERS[rarity]);
}

/** Gold dropped by monsters per tier range */
export const MONSTER_GOLD_DROP: Record<number, { min: number; max: number }> = {
  1: { min: 3, max: 8 },
  2: { min: 8, max: 18 },
  3: { min: 18, max: 40 },
};
