import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Row = Record<string, any>;

// Tables start with their key columns; everything else is declared once below and added when missing,
// so new installs and upgraded databases end up with the same shape.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS species (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS plants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT,
  outcome TEXT
);
CREATE INDEX IF NOT EXISTS logs_plant ON logs(plant_id, date);
`;

const SPECIES_COLUMNS: Record<string, string> = {
  latin_name: 'TEXT',
  name_nl: 'TEXT',
  name_en: 'TEXT',
  gbif_key: 'INTEGER',
  water_summer_days: 'INTEGER',
  water_winter_days: 'INTEGER',
  light_min: 'TEXT',
  light_max: 'TEXT',
  soil: 'TEXT',
  toxic_pets: 'INTEGER',
  toxic_humans: 'INTEGER',
  feed_tip: 'TEXT',
  repot_tip: 'TEXT',
  prune_tip: 'TEXT',
  description: 'TEXT',
};

const PLANT_COLUMNS: Record<string, string> = {
  species_id: 'INTEGER REFERENCES species(id)',
  room: 'TEXT',
  light: 'TEXT',
  light_level: 'TEXT',
  location_note: 'TEXT',
  acquired: 'TEXT',
  soil: 'TEXT',
  pot: 'TEXT',
  toxic: 'INTEGER',
  water_interval_override: 'INTEGER',
  last_watered: 'TEXT',
  next_water_override: 'TEXT',
  last_fed: 'TEXT',
  last_repotted: 'TEXT',
  photo: 'TEXT',
  archived: 'INTEGER NOT NULL DEFAULT 0',
};

function columnsOf(db: DatabaseSync, table: string): Set<string> {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Row[]).map((r) => r.name));
}

/** Returns the names of the columns that were newly added. */
function addColumns(db: DatabaseSync, table: string, cols: Record<string, string>): string[] {
  const have = columnsOf(db, table);
  const added = Object.keys(cols).filter((name) => !have.has(name));
  for (const name of added) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${cols[name]}`);
  return added;
}

function migrate(db: DatabaseSync): void {
  const hadLegacyToxic = columnsOf(db, 'species').has('toxic');
  const added = addColumns(db, 'species', SPECIES_COLUMNS);
  addColumns(db, 'plants', PLANT_COLUMNS);
  // One flag used to cover people and pets; carry it over to both new flags once.
  if (hadLegacyToxic && added.includes('toxic_pets'))
    db.exec('UPDATE species SET toxic_pets = toxic, toxic_humans = toxic WHERE toxic IS NOT NULL');
  // Soil types were reduced to four; map the old values.
  for (const table of ['species', 'plants'])
    db.exec(`UPDATE ${table} SET soil = CASE soil WHEN 'airy' THEN 'aroid' WHEN 'orchid_bark' THEN 'orchid' ELSE 'standard' END
      WHERE soil IN ('airy', 'orchid_bark', 'moist')`);
  // Leftovers of the removed online lookup (the cache could contain an API key).
  db.exec('DROP TABLE IF EXISTS online_cache; DROP TABLE IF EXISTS api_usage; DROP INDEX IF EXISTS species_external');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS species_gbif ON species(gbif_key) WHERE gbif_key IS NOT NULL');
}

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export const LOG_TYPES = ['water', 'feed', 'repot', 'prune', 'note'] as const;
export const OUTCOMES = ['good', 'bad'] as const;
