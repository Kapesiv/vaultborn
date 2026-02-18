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
  declare hp: number;
  declare maxHp: number;
  declare mana: number;
  declare maxMana: number;
  declare strength: number;
  declare intelligence: number;
  declare dexterity: number;
  declare vitality: number;
  declare armor: number;
  declare level: number;
  declare xp: number;
  declare xpToNext: number;
  declare skillPoints: number;

  constructor() {
    super();
    this.hp = 100;
    this.maxHp = 100;
    this.mana = 50;
    this.maxMana = 50;
    this.strength = 10;
    this.intelligence = 10;
    this.dexterity = 10;
    this.vitality = 10;
    this.armor = 0;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 100;
    this.skillPoints = 0;
  }
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
