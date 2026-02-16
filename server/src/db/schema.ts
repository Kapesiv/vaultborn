import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  level: integer('level').notNull().default(1),
  xp: integer('xp').notNull().default(0),
  strength: integer('strength').notNull().default(10),
  intelligence: integer('intelligence').notNull().default(10),
  dexterity: integer('dexterity').notNull().default(10),
  vitality: integer('vitality').notNull().default(10),
  posX: real('pos_x').notNull().default(0),
  posY: real('pos_y').notNull().default(0),
  posZ: real('pos_z').notNull().default(0),
  currentRoom: text('current_room').notNull().default('hub'),
  gold: integer('gold').notNull().default(100),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const items = sqliteTable('items', {
  instanceId: text('instance_id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => players.id),
  defId: text('def_id').notNull(),
  rarity: text('rarity').notNull().default('common'),
  bonusStats: text('bonus_stats').notNull().default('[]'), // JSON
  equipped: integer('equipped', { mode: 'boolean' }).notNull().default(false),
  equipSlot: text('equip_slot'),
  transmogId: text('transmog_id'),
  quantity: integer('quantity').notNull().default(1),
});

export const skillAllocations = sqliteTable('skill_allocations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playerId: text('player_id').notNull().references(() => players.id),
  nodeId: text('node_id').notNull(),
  points: integer('points').notNull().default(1),
});

export const dungeonProgress = sqliteTable('dungeon_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playerId: text('player_id').notNull().references(() => players.id),
  dungeonId: text('dungeon_id').notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  bestTime: integer('best_time'), // seconds
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});
