import { Schema, defineTypes, MapSchema } from '@colyseus/schema';
import { PlayerState } from './PlayerState.js';
import { MonsterState } from './MonsterState.js';

export class LootDropState extends Schema {
  id: string = '';
  itemDefId: string = '';
  rarity: string = 'common';
  x: number = 0;
  y: number = 0;
  z: number = 0;
  despawnAt: number = 0;
}
defineTypes(LootDropState, {
  id: 'string',
  itemDefId: 'string',
  rarity: 'string',
  x: 'float32',
  y: 'float32',
  z: 'float32',
  despawnAt: 'float64',
});

export class HubState extends Schema {
  players = new MapSchema<PlayerState>();
}
defineTypes(HubState, {
  players: { map: PlayerState },
});

export class DungeonState extends Schema {
  players = new MapSchema<PlayerState>();
  monsters = new MapSchema<MonsterState>();
  lootDrops = new MapSchema<LootDropState>();
  dungeonId: string = '';
  currentRoom: string = '';
}
defineTypes(DungeonState, {
  players: { map: PlayerState },
  monsters: { map: MonsterState },
  lootDrops: { map: LootDropState },
  dungeonId: 'string',
  currentRoom: 'string',
});
