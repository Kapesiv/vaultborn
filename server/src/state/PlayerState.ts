import { Schema, defineTypes, MapSchema } from '@colyseus/schema';

export class Vec3State extends Schema {
  declare x: number;
  declare y: number;
  declare z: number;

  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.z = 0;
  }
}
defineTypes(Vec3State, {
  x: 'float32',
  y: 'float32',
  z: 'float32',
});

export class PlayerStatsState extends Schema {
  hp: number = 100;
  maxHp: number = 100;
  mana: number = 50;
  maxMana: number = 50;
  strength: number = 10;
  intelligence: number = 10;
  dexterity: number = 10;
  vitality: number = 10;
  armor: number = 0;
  level: number = 1;
  xp: number = 0;
  xpToNext: number = 100;
  skillPoints: number = 0;
}
defineTypes(PlayerStatsState, {
  hp: 'int32',
  maxHp: 'int32',
  mana: 'int32',
  maxMana: 'int32',
  strength: 'int16',
  intelligence: 'int16',
  dexterity: 'int16',
  vitality: 'int16',
  armor: 'int16',
  level: 'int16',
  xp: 'int32',
  xpToNext: 'int32',
  skillPoints: 'int16',
});

export class PlayerState extends Schema {
  declare id: string;
  declare name: string;
  declare gender: string;
  declare position: Vec3State;
  declare rotation: number;
  declare stats: PlayerStatsState;
  declare animation: string;
  declare lastProcessedInput: number;

  constructor() {
    super();
    this.id = '';
    this.name = '';
    this.gender = 'male';
    this.position = new Vec3State();
    this.rotation = 0;
    this.stats = new PlayerStatsState();
    this.animation = 'idle';
    this.lastProcessedInput = 0;
  }
}
defineTypes(PlayerState, {
  id: 'string',
  name: 'string',
  gender: 'string',
  position: Vec3State,
  rotation: 'float32',
  stats: PlayerStatsState,
  animation: 'string',
  lastProcessedInput: 'int32',
});
