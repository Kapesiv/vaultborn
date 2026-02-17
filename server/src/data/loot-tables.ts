import type { Rarity } from '@saab/shared';

export interface LootEntry {
  itemDefId: string;
  weight: number;
  minRarity: Rarity;
  maxRarity: Rarity;
}

export interface LootTable {
  id: string;
  guaranteedDrops: number;
  maxDrops: number;
  entries: LootEntry[];
}

export const LOOT_TABLES: Record<string, LootTable> = {
  forest_wolf_loot: {
    id: 'forest_wolf_loot',
    guaranteedDrops: 0,
    maxDrops: 2,
    entries: [
      { itemDefId: 'wolf_pelt', weight: 40, minRarity: 'common', maxRarity: 'uncommon' },
      { itemDefId: 'leather_cap', weight: 15, minRarity: 'common', maxRarity: 'uncommon' },
      { itemDefId: 'leather_boots', weight: 15, minRarity: 'common', maxRarity: 'uncommon' },
      { itemDefId: 'health_potion', weight: 30, minRarity: 'common', maxRarity: 'common' },
    ],
  },
  forest_spider_loot: {
    id: 'forest_spider_loot',
    guaranteedDrops: 0,
    maxDrops: 2,
    entries: [
      { itemDefId: 'wood_scrap', weight: 35, minRarity: 'common', maxRarity: 'common' },
      { itemDefId: 'leather_vest', weight: 15, minRarity: 'common', maxRarity: 'rare' },
      { itemDefId: 'leather_pants', weight: 15, minRarity: 'common', maxRarity: 'uncommon' },
      { itemDefId: 'health_potion', weight: 35, minRarity: 'common', maxRarity: 'common' },
    ],
  },
  forest_treant_loot: {
    id: 'forest_treant_loot',
    guaranteedDrops: 1,
    maxDrops: 3,
    entries: [
      { itemDefId: 'iron_sword', weight: 20, minRarity: 'uncommon', maxRarity: 'epic' },
      { itemDefId: 'iron_chainmail', weight: 20, minRarity: 'uncommon', maxRarity: 'epic' },
      { itemDefId: 'forest_bow', weight: 15, minRarity: 'rare', maxRarity: 'legendary' },
      { itemDefId: 'wood_scrap', weight: 25, minRarity: 'common', maxRarity: 'uncommon' },
      { itemDefId: 'health_potion', weight: 20, minRarity: 'common', maxRarity: 'common' },
    ],
  },
};
