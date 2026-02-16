export interface DamageEvent {
  sourceId: string;
  targetId: string;
  amount: number;
  type: 'physical' | 'magical' | 'true';
  isCrit: boolean;
  skillId?: string;
}

export interface ProjectileData {
  id: string;
  ownerId: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  damage: number;
  type: string;
  lifetime: number;
}

export interface CombatAction {
  type: 'basic_attack' | 'skill';
  skillId?: string;
  targetId?: string;
  direction?: { x: number; y: number; z: number };
}
