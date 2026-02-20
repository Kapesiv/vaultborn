import initSqlJs, { type Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const DB_PATH = process.env.DB_PATH || './data/game.db';

let db: Database;

export async function initDB(): Promise<Database> {
  const SQL = await initSqlJs();

  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      strength INTEGER NOT NULL DEFAULT 10,
      intelligence INTEGER NOT NULL DEFAULT 10,
      dexterity INTEGER NOT NULL DEFAULT 10,
      vitality INTEGER NOT NULL DEFAULT 10,
      pos_x REAL NOT NULL DEFAULT 0,
      pos_y REAL NOT NULL DEFAULT 0,
      pos_z REAL NOT NULL DEFAULT 0,
      current_room TEXT NOT NULL DEFAULT 'hub',
      gold INTEGER NOT NULL DEFAULT 100,
      created_at INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      instance_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES players(id),
      def_id TEXT NOT NULL,
      rarity TEXT NOT NULL DEFAULT 'common',
      bonus_stats TEXT NOT NULL DEFAULT '[]',
      equipped INTEGER NOT NULL DEFAULT 0,
      equip_slot TEXT,
      transmog_id TEXT,
      quantity INTEGER NOT NULL DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS skill_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL REFERENCES players(id),
      node_id TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS skill_hotbar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL REFERENCES players(id),
      slot INTEGER NOT NULL,
      skill_id TEXT NOT NULL,
      UNIQUE(player_id, slot)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS dungeon_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL REFERENCES players(id),
      dungeon_id TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      best_time INTEGER,
      completed_at INTEGER
    )
  `);

  // Migrations for existing DBs
  try { db.run('ALTER TABLE players ADD COLUMN gold INTEGER NOT NULL DEFAULT 100'); } catch (_) {}
  try { db.run('ALTER TABLE items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1'); } catch (_) {}
  try { db.run('ALTER TABLE players ADD COLUMN skill_points INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.run("ALTER TABLE players ADD COLUMN class TEXT NOT NULL DEFAULT 'warrior'"); } catch (_) {}

  saveDB();
  return db;
}

export function getDB(): Database {
  return db;
}

export function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(DB_PATH, buffer);
}
