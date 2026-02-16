import type { SkillNodeDef } from '../types/skill.js';

// Proto: only Melee tree
export const MELEE_SKILL_TREE: SkillNodeDef[] = [
  {
    id: 'melee_power_strike',
    name: 'Power Strike',
    description: 'A heavy overhead swing dealing 150% weapon damage.',
    tree: 'melee',
    prerequisites: [],
    maxPoints: 5,
    effects: [
      { type: 'damage', value: 1.5, scaling: 'strength', cooldown: 3, manaCost: 10 },
    ],
    icon: 'power_strike',
    position: { x: 0, y: 0 },
  },
  {
    id: 'melee_whirlwind',
    name: 'Whirlwind',
    description: 'Spin attack hitting all nearby enemies for 80% weapon damage.',
    tree: 'melee',
    prerequisites: ['melee_power_strike'],
    maxPoints: 5,
    effects: [
      { type: 'damage', value: 0.8, scaling: 'strength', cooldown: 6, manaCost: 20 },
    ],
    icon: 'whirlwind',
    position: { x: 0, y: 1 },
  },
  {
    id: 'melee_toughness',
    name: 'Toughness',
    description: 'Passive: +5% max HP per point.',
    tree: 'melee',
    prerequisites: [],
    maxPoints: 5,
    effects: [
      { type: 'passive', stat: 'maxHp', value: 0.05 },
    ],
    icon: 'toughness',
    position: { x: -1, y: 0 },
  },
  {
    id: 'melee_charge',
    name: 'Charge',
    description: 'Dash forward, stunning the first enemy hit for 1.5s.',
    tree: 'melee',
    prerequisites: ['melee_power_strike'],
    maxPoints: 3,
    effects: [
      { type: 'debuff', stat: 'stun', value: 1.5, scaling: 'strength', cooldown: 10, manaCost: 15 },
    ],
    icon: 'charge',
    position: { x: 1, y: 1 },
  },
];
