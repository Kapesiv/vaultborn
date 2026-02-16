export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type ItemType = 'weapon' | 'armor' | 'consumable' | 'material' | 'quest';

export type ArmorSlot = 'head' | 'chest' | 'legs' | 'feet';
export type WeaponSlot = 'mainHand' | 'offHand';

export interface BonusStat {
  stat: 'strength' | 'intelligence' | 'dexterity' | 'vitality' | 'armor' | 'hp' | 'mana';
  value: number;
}

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  slot?: ArmorSlot | WeaponSlot;
  tier: number; // 1-10 for armor
  rarity: Rarity;
  baseDamage?: number;
  baseArmor?: number;
  description: string;
  icon: string;
  model?: string;
}

export interface ItemInstance {
  instanceId: string;
  defId: string;
  rarity: Rarity;
  bonusStats: BonusStat[];
  quantity?: number;
  transmogId?: string;
}

export interface InventoryState {
  items: ItemInstance[];
  maxSlots: number;
}
