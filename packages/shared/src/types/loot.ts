import type { Rarity } from './inventory.js';

export interface LootTableEntry {
  itemDefId: string;
  weight: number;
  minRarity: Rarity;
  maxRarity: Rarity;
}

export interface LootTable {
  id: string;
  entries: LootTableEntry[];
  guaranteedDrops?: number; // min drops
  maxDrops: number;
}
