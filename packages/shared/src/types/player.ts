export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlayerStats {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  strength: number;
  intelligence: number;
  dexterity: number;
  vitality: number;
  armor: number;
  level: number;
  xp: number;
  xpToNext: number;
}

export interface PlayerInput {
  seq: number;
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  rotation: number; // y-axis rotation
  dt: number;
  attack?: string; // skill id or 'basic'
}

export interface PlayerData {
  id: string;
  name: string;
  position: Vec3;
  rotation: number;
  stats: PlayerStats;
  equippedItems: Record<EquipSlot, string | null>;
  currentRoom: string;
  animation: string;
}

export type EquipSlot = 'head' | 'chest' | 'legs' | 'feet' | 'mainHand' | 'offHand';

export const EQUIP_SLOTS: EquipSlot[] = ['head', 'chest', 'legs', 'feet', 'mainHand', 'offHand'];
