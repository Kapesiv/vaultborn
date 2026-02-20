export type CharacterClassId = 'warrior' | 'mage' | 'ranger' | 'rogue';

export interface ClassDef {
  id: CharacterClassId;
  name: string;
  description: string;
  startingStats: {
    strength: number;
    intelligence: number;
    dexterity: number;
    vitality: number;
  };
  startingWeapon: string;
  startingArmor: string;
  primarySkillTree: string;
  modelPath: string;
  color: string;
  maxHpBase: number;
  maxManaBase: number;
}
