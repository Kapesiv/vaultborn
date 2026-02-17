// SECRET: Crafting recipes are server-only. Players must discover them!
export interface CraftingRecipe {
  id: string;
  inputs: { itemDefId: string; quantity: number }[];
  output: { itemDefId: string; rarity: string };
  hint: string; // NPC hint text
}

export const RECIPES: CraftingRecipe[] = [
  {
    id: 'recipe_iron_sword',
    inputs: [
      { itemDefId: 'wood_scrap', quantity: 3 },
    ],
    output: { itemDefId: 'iron_sword', rarity: 'uncommon' },
    hint: 'I heard that enough wood scraps can be fashioned into something sharp...',
  },
  {
    id: 'recipe_leather_vest',
    inputs: [
      { itemDefId: 'wolf_pelt', quantity: 3 },
    ],
    output: { itemDefId: 'leather_vest', rarity: 'uncommon' },
    hint: 'Wolf pelts are excellent for crafting armor, if you gather enough...',
  },
  {
    id: 'recipe_forest_bow',
    inputs: [
      { itemDefId: 'wood_scrap', quantity: 5 },
      { itemDefId: 'wolf_pelt', quantity: 2 },
    ],
    output: { itemDefId: 'forest_bow', rarity: 'rare' },
    hint: 'They say the old forest wood combined with sturdy pelts makes a fine bow...',
  },
];
