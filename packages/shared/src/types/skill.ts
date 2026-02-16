export interface SkillNodeDef {
  id: string;
  name: string;
  description: string;
  tree: SkillTree;
  prerequisites: string[];
  maxPoints: number;
  effects: SkillEffect[];
  icon: string;
  position: { x: number; y: number }; // UI position in tree
}

export interface SkillEffect {
  type: 'damage' | 'heal' | 'buff' | 'debuff' | 'passive';
  stat?: string;
  value: number;
  scaling?: 'strength' | 'intelligence' | 'dexterity';
  duration?: number; // seconds
  cooldown?: number; // seconds
  manaCost?: number;
}

export type SkillTree = 'melee' | 'ranged' | 'fire' | 'ice' | 'lightning' | 'holy' | 'shadow';

export interface SkillAllocation {
  nodeId: string;
  points: number;
}
