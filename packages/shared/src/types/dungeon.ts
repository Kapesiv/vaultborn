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
  spawns: MonsterSpawn[];
  connections: string[]; // connected room ids
}

export interface MonsterSpawn {
  monsterId: string;
  position: { x: number; y: number; z: number };
  respawnTime: number; // seconds, 0 = no respawn
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
}

export type MonsterAIState = 'idle' | 'patrol' | 'chase' | 'attack' | 'return' | 'dead';
