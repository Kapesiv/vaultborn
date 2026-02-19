// Tick rates
export const HUB_SYNC_RATE = 5; // Hz
export const DUNGEON_SYNC_RATE = 20; // Hz
export const CLIENT_INPUT_RATE = 20; // Hz

// Room limits
export const HUB_MAX_PLAYERS = 50;
export const DUNGEON_MAX_PLAYERS = 4;

// Movement
export const PLAYER_SPEED = 3.5; // units/sec
export const PLAYER_SPRINT_SPEED = 8.0; // units/sec
export const PLAYER_JUMP_FORCE = 8;
export const GRAVITY = -20;

// Combat
export const BASIC_ATTACK_COOLDOWN = 0.8; // seconds
export const BASIC_ATTACK_RANGE = 2.5;
export const BASIC_ATTACK_DAMAGE = 10;

// Crit
export const BASE_CRIT_CHANCE = 0.05;
export const CRIT_PER_DEX = 0.005;
export const CRIT_MULTIPLIER = 1.5;
export const MAX_CRIT_CHANCE = 0.50;

// Dodge
export const BASE_DODGE_CHANCE = 0.03;
export const DODGE_PER_DEX = 0.003;
export const MAX_DODGE_CHANCE = 0.30;

// Potions
export const POTION_HEAL_AMOUNT = 50;
export const POTION_COOLDOWN = 5;

// XP curve: XP needed = BASE * level^EXPONENT
export const XP_BASE = 100;
export const XP_EXPONENT = 1.5;

// Inventory
export const INVENTORY_MAX_SLOTS = 30;

// Skills
export const SKILL_POINTS_PER_LEVEL = 1;
export const MAX_HOTBAR_SLOTS = 4;
export const MANA_REGEN_RATE = 2; // per second
export const SKILL_RANGE_AOE = 4.0;
export const CHARGE_DISTANCE = 6.0;

// Rarity weights for bonus stats
export const RARITY_BONUS_STATS: Record<string, { min: number; max: number }> = {
  common: { min: 0, max: 0 },
  uncommon: { min: 0, max: 1 },
  rare: { min: 1, max: 2 },
  epic: { min: 2, max: 3 },
  legendary: { min: 3, max: 4 },
};

// Rarity colors
export const RARITY_COLORS: Record<string, string> = {
  common: '#9d9d9d',
  uncommon: '#1eff00',
  rare: '#0070dd',
  epic: '#a335ee',
  legendary: '#ff8000',
};
