import { Schema, defineTypes } from '@colyseus/schema';
import { Vec3State } from './PlayerState.js';

export class MonsterState extends Schema {
  declare id: string;
  declare defId: string;
  declare position: Vec3State;
  declare rotation: number;
  declare hp: number;
  declare maxHp: number;
  declare aiState: string;
  declare targetId: string;
  declare animation: string;
  declare bossPhase: number;
  declare statusEffect: string;

  constructor() {
    super();
    this.id = '';
    this.defId = '';
    this.position = new Vec3State();
    this.rotation = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.aiState = 'idle';
    this.targetId = '';
    this.animation = 'idle';
    this.bossPhase = 0;
    this.statusEffect = '';
  }
}
defineTypes(MonsterState, {
  id: 'string',
  defId: 'string',
  position: Vec3State,
  rotation: 'float32',
  hp: 'int32',
  maxHp: 'int32',
  aiState: 'string',
  targetId: 'string',
  animation: 'string',
  bossPhase: 'uint8',
  statusEffect: 'string',
});
