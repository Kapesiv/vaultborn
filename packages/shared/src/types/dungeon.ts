export interface DungeonDef {
  id: string;
  name: string;
  description: string;
  maxPlayers: number;
  recommendedLevel: number;
  rooms: DungeonRoomDef[];
  bossId?: string;
}

export interface DungeonRoomDef {
  id: string;
  floorName?: string;
  spawns: MonsterSpawn[];
  connections: string[]; // connected room ids
}

export interface MonsterSpawn {
  monsterId: string;
  position: { x: number; y: number; z: number };
  respawnTime: number; // seconds, 0 = no respawn
}

export interface StatusEffectDef {
  type: 'bleed' | 'poison' | 'stun' | 'root';
  damage: number;
  duration: number;
  tickRate: number;
}

export interface MonsterAbility {
  id: string;
  name: string;
  type: 'melee' | 'ranged' | 'aoe' | 'debuff' | 'summon';
  damage: number;
  range: number;
  cooldown: number;
  statusEffect?: StatusEffectDef;
  projectileSpeed?: number;
}

export interface BossPhase {
  phase: number;
  hpThreshold: number;
  damageMultiplier: number;
  speedMultiplier: number;
  armorMultiplier: number;
  abilities: string[];
}

export interface MonsterDef {
  id: string;
  name: string;
  hp: number;
  damage: number;
  armor: number;
  speed: number;
  aggroRange: number;
  attackRange: number;
  attackCooldown: number;
  xpReward: number;
  lootTableId: string;
  model: string;
  isBoss?: boolean;
  abilities?: MonsterAbility[];
  phases?: BossPhase[];
}

export type MonsterAIState = 'idle' | 'patrol' | 'chase' | 'attack' | 'return' | 'dead';
