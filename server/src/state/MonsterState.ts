import { Schema, defineTypes } from '@colyseus/schema';
import { Vec3State } from './PlayerState.js';

export class MonsterState extends Schema {
  id: string = '';
  defId: string = '';
  position: Vec3State = new Vec3State();
  rotation: number = 0;
  hp: number = 100;
  maxHp: number = 100;
  aiState: string = 'idle';
  targetId: string = '';
  animation: string = 'idle';
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
});
