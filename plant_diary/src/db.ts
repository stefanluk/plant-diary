import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Row = Record<string, any>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS species (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  water_summer_days INTEGER,
  water_winter_days INTEGER,
  feed_days INTEGER,
  toxic_cat INTEGER NOT NULL DEFAULT 0,
  toxic_child INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS plants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  species_id INTEGER REFERENCES species(id),
  room TEXT,
  light TEXT,
  location_note TEXT,
  acquired TEXT,
  soil TEXT,
  pot TEXT,
  toxic_cat INTEGER,
  toxic_child INTEGER,
  water_interval_override INTEGER,
  last_watered TEXT,
  next_water_override TEXT,
  last_fed TEXT,
  last_repotted TEXT,
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT,
  outcome TEXT,
  photo TEXT
);
CREATE INDEX IF NOT EXISTS logs_plant ON logs(plant_id, date);
`;

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

export const LOG_TYPES = ['water', 'feed', 'repot', 'prune', 'note', 'photo'] as const;
export const OUTCOMES = ['good', 'bad'] as const;
