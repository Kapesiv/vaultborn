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
  declare players: MapSchema<PlayerState>;
  declare monsters: MapSchema<MonsterState>;
  declare lootDrops: MapSchema<LootDropState>;
  declare dungeonId: string;
  declare currentRoom: string;
  declare currentFloor: number;
  declare totalFloors: number;
  declare floorCleared: boolean;
  declare dungeonComplete: boolean;

  constructor() {
    super();
    this.players = new MapSchema<PlayerState>();
    this.monsters = new MapSchema<MonsterState>();
    this.lootDrops = new MapSchema<LootDropState>();
    this.dungeonId = '';
    this.currentRoom = '';
    this.currentFloor = 0;
    this.totalFloors = 4;
    this.floorCleared = false;
    this.dungeonComplete = false;
  }
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
