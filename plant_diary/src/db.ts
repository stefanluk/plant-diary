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
CREATE TABLE IF NOT EXISTS api_usage (
  day TEXT NOT NULL,
  service TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, service)
);
CREATE TABLE IF NOT EXISTS online_cache (
  key TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  fetched TEXT NOT NULL
);
`;

// Columns added after the first release; applied additively so existing data stays intact.
const SPECIES_COLUMNS: Record<string, string> = {
  latin_name: 'TEXT',
  name_nl: 'TEXT',
  name_en: 'TEXT',
  synonyms: 'TEXT',
  light_min: 'TEXT',
  light_max: 'TEXT',
  soil: 'TEXT',
  repot_tip: 'TEXT',
  prune_tip: 'TEXT',
  feed_tip: 'TEXT',
  description: 'TEXT',
  toxic: 'INTEGER',
  source: "TEXT NOT NULL DEFAULT 'custom'",
  verified: 'INTEGER NOT NULL DEFAULT 0',
  external_id: 'TEXT',
  user_edited: 'INTEGER NOT NULL DEFAULT 0',
  gbif_key: 'INTEGER',
  toxic_pets: 'INTEGER',
  toxic_humans: 'INTEGER',
  extra: 'TEXT',
  raw_json: 'TEXT',
};
const PLANT_COLUMNS: Record<string, string> = { light_level: 'TEXT', toxic: 'INTEGER' };

/** Returns the names of the columns that were newly added. */
function addColumns(db: DatabaseSync, table: string, cols: Record<string, string>): string[] {
  const have = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Row[]).map((r) => r.name));
  const added: string[] = [];
  for (const [name, def] of Object.entries(cols)) {
    if (have.has(name)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
    added.push(name);
  }
  return added;
}

function migrate(db: DatabaseSync): void {
  // The single "toxic" flag replaces the separate cat/child flags; carry the old values over once.
  const added = addColumns(db, 'species', SPECIES_COLUMNS);
  if (added.includes('toxic')) db.exec('UPDATE species SET toxic = MAX(toxic_cat, toxic_child)');
  // The single flag used to mean "toxic to people and pets"; carry it over to both new flags once.
  if (added.includes('toxic_pets')) db.exec('UPDATE species SET toxic_pets = toxic, toxic_humans = toxic WHERE toxic IS NOT NULL');
  // Soil types were reduced to four; map the old values.
  for (const t of ['species', 'plants'])
    db.exec(`UPDATE ${t} SET soil = CASE soil WHEN 'airy' THEN 'aroid' WHEN 'orchid_bark' THEN 'orchid' WHEN 'moist' THEN 'standard' ELSE soil END
      WHERE soil IN ('airy', 'orchid_bark', 'moist')`);
  // The online cache of earlier versions may contain an API key; it is no longer used.
  db.exec('DROP TABLE IF EXISTS online_cache');
  if (addColumns(db, 'plants', PLANT_COLUMNS).includes('toxic'))
    db.exec(`UPDATE plants SET toxic = MAX(COALESCE(toxic_cat, 0), COALESCE(toxic_child, 0))
             WHERE toxic_cat IS NOT NULL OR toxic_child IS NOT NULL`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS species_gbif ON species(gbif_key) WHERE gbif_key IS NOT NULL');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS species_external ON species(external_id) WHERE external_id IS NOT NULL');
}

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export const LOG_TYPES = ['water', 'feed', 'repot', 'prune', 'note', 'photo'] as const;
export const OUTCOMES = ['good', 'bad'] as const;
