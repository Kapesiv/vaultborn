import { getDB, saveDB } from '../db/index.js';
import {
  BLACKSMITH_SHOP, getDefaultSellPrice, INVENTORY_MAX_SLOTS, ITEM_DEFS,
  RARITY_BONUS_STATS,
  type ItemInstance, type BonusStat, type Rarity,
} from '@saab/shared';

const BONUS_STAT_POOL: BonusStat['stat'][] = [
  'strength', 'intelligence', 'dexterity', 'vitality', 'armor', 'hp', 'mana',
];

function rollBonusStats(rarity: Rarity): BonusStat[] {
  const range = RARITY_BONUS_STATS[rarity];
  if (!range) return [];
  const count = range.min + Math.floor(Math.random() * (range.max - range.min + 1));
  const stats: BonusStat[] = [];
  for (let i = 0; i < count; i++) {
    stats.push({
      stat: BONUS_STAT_POOL[Math.floor(Math.random() * BONUS_STAT_POOL.length)],
      value: 1 + Math.floor(Math.random() * 5),
    });
  }
  return stats;
}

function genId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class InventoryService {
  /** Ensure player row exists, return gold */
  ensurePlayer(playerId: string, name: string): number {
    const db = getDB();
    const rows = db.exec('SELECT gold FROM players WHERE id = ?', [playerId]);
    if (rows.length && rows[0].values.length) {
      return rows[0].values[0][0] as number;
    }
    db.run(
      'INSERT INTO players (id, name, created_at) VALUES (?, ?, ?)',
      [playerId, name, Date.now()],
    );
    saveDB();
    return 100; // default gold
  }

  getGold(playerId: string): number {
    const rows = getDB().exec('SELECT gold FROM players WHERE id = ?', [playerId]);
    if (rows.length && rows[0].values.length) return rows[0].values[0][0] as number;
    return 0;
  }

  addGold(playerId: string, amount: number): number {
    const db = getDB();
    db.run('UPDATE players SET gold = gold + ? WHERE id = ?', [amount, playerId]);
    saveDB();
    return this.getGold(playerId);
  }

  getItems(playerId: string): ItemInstance[] {
    const db = getDB();
    const rows = db.exec(
      'SELECT instance_id, def_id, rarity, bonus_stats, quantity FROM items WHERE owner_id = ?',
      [playerId],
    );
    if (!rows.length) return [];
    return rows[0].values.map((r) => ({
      instanceId: r[0] as string,
      defId: r[1] as string,
      rarity: r[2] as Rarity,
      bonusStats: JSON.parse(r[3] as string) as BonusStat[],
      quantity: r[4] as number,
    }));
  }

  addItem(
    playerId: string,
    defId: string,
    rarity: Rarity = 'common',
    bonusStats?: BonusStat[],
    qty = 1,
  ): ItemInstance {
    const db = getDB();
    const def = ITEM_DEFS[defId];
    const isStackable = def && (def.type === 'material' || def.type === 'consumable');

    // Stack if possible
    if (isStackable) {
      const existing = db.exec(
        'SELECT instance_id, quantity FROM items WHERE owner_id = ? AND def_id = ? AND rarity = ?',
        [playerId, defId, rarity],
      );
      if (existing.length && existing[0].values.length) {
        const existingId = existing[0].values[0][0] as string;
        const existingQty = existing[0].values[0][1] as number;
        db.run('UPDATE items SET quantity = ? WHERE instance_id = ?', [existingQty + qty, existingId]);
        saveDB();
        return {
          instanceId: existingId,
          defId,
          rarity,
          bonusStats: [],
          quantity: existingQty + qty,
        };
      }
    }

    const instanceId = genId();
    const stats = bonusStats ?? rollBonusStats(rarity);
    db.run(
      'INSERT INTO items (instance_id, owner_id, def_id, rarity, bonus_stats, quantity) VALUES (?, ?, ?, ?, ?, ?)',
      [instanceId, playerId, defId, rarity, JSON.stringify(stats), qty],
    );
    saveDB();
    return { instanceId, defId, rarity, bonusStats: stats, quantity: qty };
  }

  removeItem(playerId: string, instanceId: string): boolean {
    const db = getDB();
    const rows = db.exec(
      'SELECT owner_id, equipped FROM items WHERE instance_id = ?',
      [instanceId],
    );
    if (!rows.length || !rows[0].values.length) return false;
    const ownerId = rows[0].values[0][0] as string;
    const equipped = rows[0].values[0][1] as number;
    if (ownerId !== playerId || equipped === 1) return false;

    db.run('DELETE FROM items WHERE instance_id = ?', [instanceId]);
    saveDB();
    return true;
  }

  buyItem(playerId: string, defId: string): { item?: ItemInstance; gold?: number; error?: string } {
    const shopEntry = BLACKSMITH_SHOP.find((e) => e.defId === defId);
    if (!shopEntry) return { error: 'Item not in shop' };

    const gold = this.getGold(playerId);
    if (gold < shopEntry.buyPrice) return { error: 'Not enough gold' };

    const items = this.getItems(playerId);
    // Count non-stackable items + unique stacks
    if (items.length >= INVENTORY_MAX_SLOTS) return { error: 'Inventory full' };

    const db = getDB();
    db.run('UPDATE players SET gold = gold - ? WHERE id = ?', [shopEntry.buyPrice, playerId]);
    saveDB();

    const item = this.addItem(playerId, defId, 'common');
    const newGold = this.getGold(playerId);
    return { item, gold: newGold };
  }

  sellItem(playerId: string, instanceId: string): { goldEarned?: number; gold?: number; error?: string } {
    const db = getDB();
    const rows = db.exec(
      'SELECT owner_id, def_id, rarity, equipped, quantity FROM items WHERE instance_id = ?',
      [instanceId],
    );
    if (!rows.length || !rows[0].values.length) return { error: 'Item not found' };

    const [ownerId, defId, rarity, equipped, quantity] = rows[0].values[0] as [string, string, string, number, number];
    if (ownerId !== playerId) return { error: 'Not your item' };
    if (equipped === 1) return { error: 'Cannot sell equipped item' };

    // Calculate sell price
    const shopEntry = BLACKSMITH_SHOP.find((e) => e.defId === defId);
    const def = ITEM_DEFS[defId];
    let sellPrice: number;
    if (shopEntry) {
      sellPrice = shopEntry.sellPrice;
    } else if (def) {
      sellPrice = getDefaultSellPrice(def.tier, rarity as Rarity);
    } else {
      sellPrice = 1;
    }

    const totalEarned = sellPrice * (quantity || 1);

    db.run('DELETE FROM items WHERE instance_id = ?', [instanceId]);
    db.run('UPDATE players SET gold = gold + ? WHERE id = ?', [totalEarned, playerId]);
    saveDB();

    return { goldEarned: totalEarned, gold: this.getGold(playerId) };
  }
}
