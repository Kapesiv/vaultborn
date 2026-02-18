import { Schema, defineTypes, MapSchema } from '@colyseus/schema';
import { PlayerState } from './PlayerState.js';
import { MonsterState } from './MonsterState.js';

export class LootDropState extends Schema {
  declare id: string;
  declare itemDefId: string;
  declare rarity: string;
  declare x: number;
  declare y: number;
  declare z: number;
  declare despawnAt: number;

  constructor() {
    super();
    this.id = '';
    this.itemDefId = '';
    this.rarity = 'common';
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.despawnAt = 0;
  }
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
  declare players: MapSchema<PlayerState>;

  constructor() {
    super();
    this.players = new MapSchema<PlayerState>();
  }
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
  currentFloor: number = 0;
  totalFloors: number = 4;
  floorCleared: boolean = false;
  dungeonComplete: boolean = false;
}
defineTypes(DungeonState, {
  players: { map: PlayerState },
  monsters: { map: MonsterState },
  lootDrops: { map: LootDropState },
  dungeonId: 'string',
  currentRoom: 'string',
  currentFloor: 'uint8',
  totalFloors: 'uint8',
  floorCleared: 'boolean',
  dungeonComplete: 'boolean',
});
