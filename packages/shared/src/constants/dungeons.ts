import type { DungeonDef, MonsterDef } from '../types/dungeon.js';

export const MONSTER_DEFS: Record<string, MonsterDef> = {
  forest_wolf: {
    id: 'forest_wolf',
    name: 'Forest Wolf',
    hp: 60,
    damage: 8,
    armor: 2,
    speed: 4,
    aggroRange: 10,
    attackRange: 2,
    attackCooldown: 1.2,
    xpReward: 25,
    lootTableId: 'forest_wolf_loot',
    model: 'wolf',
  },
  forest_spider: {
    id: 'forest_spider',
    name: 'Giant Spider',
    hp: 40,
    damage: 12,
    armor: 1,
    speed: 5,
    aggroRange: 8,
    attackRange: 1.5,
    attackCooldown: 0.8,
    xpReward: 20,
    lootTableId: 'forest_spider_loot',
    model: 'spider',
  },
  forest_treant: {
    id: 'forest_treant',
    name: 'Ancient Treant',
    hp: 200,
    damage: 25,
    armor: 10,
    speed: 2,
    aggroRange: 12,
    attackRange: 3,
    attackCooldown: 2.0,
    xpReward: 100,
    lootTableId: 'forest_treant_loot',
    model: 'treant',
  },
};

export const FOREST_DUNGEON: DungeonDef = {
  id: 'forest',
  name: 'Dark Forest',
  description: 'A twisted forest filled with dangerous creatures.',
  maxPlayers: 4,
  recommendedLevel: 1,
  rooms: [
    {
      id: 'forest_entrance',
      spawns: [
        { monsterId: 'forest_wolf', position: { x: 5, y: 0, z: 5 }, respawnTime: 30 },
        { monsterId: 'forest_wolf', position: { x: -5, y: 0, z: 8 }, respawnTime: 30 },
      ],
      connections: ['forest_clearing'],
    },
    {
      id: 'forest_clearing',
      spawns: [
        { monsterId: 'forest_spider', position: { x: 3, y: 0, z: 0 }, respawnTime: 30 },
        { monsterId: 'forest_spider', position: { x: -3, y: 0, z: 2 }, respawnTime: 30 },
        { monsterId: 'forest_wolf', position: { x: 0, y: 0, z: -5 }, respawnTime: 30 },
      ],
      connections: ['forest_entrance', 'forest_depths'],
    },
    {
      id: 'forest_depths',
      spawns: [
        { monsterId: 'forest_spider', position: { x: 4, y: 0, z: 4 }, respawnTime: 45 },
        { monsterId: 'forest_wolf', position: { x: -4, y: 0, z: 4 }, respawnTime: 45 },
        { monsterId: 'forest_wolf', position: { x: 0, y: 0, z: -3 }, respawnTime: 45 },
      ],
      connections: ['forest_clearing', 'forest_boss'],
    },
    {
      id: 'forest_boss',
      spawns: [
        { monsterId: 'forest_treant', position: { x: 0, y: 0, z: 0 }, respawnTime: 0 },
      ],
      connections: ['forest_depths'],
    },
  ],
  bossId: 'forest_treant',
};
