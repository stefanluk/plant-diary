import type { DatabaseSync } from 'node:sqlite';
import { LOG_TYPES, OUTCOMES, type Row } from './db.js';
import { LIGHT_LEVELS, SOILS, lightStatus } from './options.js';
import { daysOverdue, nextWater, toISODate } from './schedule.js';

const PLANT_FIELDS = [
  'name', 'species_id', 'room', 'light', 'light_level', 'location_note', 'acquired', 'soil', 'pot',
  'toxic', 'water_interval_override', 'last_watered', 'next_water_override', 'last_fed', 'last_repotted',
] as const;

const SPECIES_FIELDS = [
  'name', 'latin_name', 'name_nl', 'name_en', 'gbif_key', 'water_summer_days', 'water_winter_days',
  'light_min', 'light_max', 'soil', 'toxic_pets', 'toxic_humans', 'feed_tip', 'repot_tip', 'prune_tip', 'description',
] as const;

// Log types that also update a "last ..." date on the plant.
const LAST_COLUMN: Record<string, string> = { water: 'last_watered', feed: 'last_fed', repot: 'last_repotted' };
const DATE_FIELDS = new Set(['acquired', 'last_watered', 'next_water_override', 'last_fed', 'last_repotted']);

function validate(data: Row): void {
  for (const f of ['light_level', 'light_min', 'light_max'])
    if (data[f] != null && !(LIGHT_LEVELS as readonly string[]).includes(data[f]))
      throw new HttpError(400, `${f} moet een van ${LIGHT_LEVELS.join(', ')} zijn`);
  if (data.soil != null && !(SOILS as readonly string[]).includes(data.soil))
    throw new HttpError(400, `soil moet een van ${SOILS.join(', ')} zijn`);
  if (data.pot != null) {
    const cm = Number(String(data.pot).replace(',', '.'));
    if (!(cm > 0 && cm <= 200)) throw new HttpError(400, 'pot moet een diameter in cm zijn (1-200)');
    data.pot = String(cm);
  }
  for (const f of ['toxic', 'toxic_pets', 'toxic_humans']) if (data[f] != null) data[f] = data[f] ? 1 : 0;
}

const normalize = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function uniqueGuard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err: any) {
    if (/UNIQUE/i.test(String(err?.message))) throw new HttpError(409, 'Er bestaat al een soort met die naam');
    throw err;
  }
}

const MAX_TEXT = 2000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHOTO_NAME = /^[0-9a-f-]{36}\.(jpe?g|png|webp|heic)$/;

function checkText(v: unknown, field: string): void {
  if (typeof v === 'string' && v.length > MAX_TEXT) throw new HttpError(400, `${field} is te lang (max ${MAX_TEXT} tekens)`);
}

/** Copies the allowed fields from a request body, validating text length and dates; '' becomes null. */
const pick = (src: Row, fields: readonly string[]): Row =>
  Object.fromEntries(
    fields
      .filter((f) => f in src)
      .map((f) => {
        checkText(src[f], f);
        if (DATE_FIELDS.has(f) && src[f] && !ISO_DATE.test(String(src[f]))) throw new HttpError(400, `${f} moet YYYY-MM-DD zijn`);
        return [f, src[f] === '' ? null : src[f]];
      }),
  );

function checkLog(body: Row): void {
  checkText(body.note, 'note');
  if (body.date && !ISO_DATE.test(String(body.date))) throw new HttpError(400, 'date moet YYYY-MM-DD zijn');
  if (body.photo != null && !PHOTO_NAME.test(String(body.photo))) throw new HttpError(400, 'Ongeldige foto');
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class PlantService {
  constructor(private db: DatabaseSync, private now: () => Date = () => new Date()) {}

  private decorate(r: Row): Row {
    const today = this.now();
    const next = nextWater(
      {
        lastWatered: r.last_watered,
        nextOverride: r.next_water_override,
        intervalOverrideDays: r.water_interval_override,
        speciesSummerDays: r.water_summer_days,
        speciesWinterDays: r.water_winter_days,
      },
      today,
    );
    // A toxicity set on the plant itself overrides the species for both groups.
    const pets = r.toxic ?? r.species_toxic_pets ?? 0;
    const humans = r.toxic ?? r.species_toxic_humans ?? 0;
    return {
      ...r,
      toxic_own: r.toxic,
      toxic_pets: pets,
      toxic_humans: humans,
      toxic: pets || humans ? 1 : 0,
      soil_effective: r.soil ?? r.species_soil ?? null,
      light_status: lightStatus(r.light_level, r.light_min, r.light_max),
      next_water: next,
      days_overdue: daysOverdue(next, today),
    };
  }

  private plantSelect = `SELECT p.*, s.name AS species_name, s.latin_name, s.name_nl, s.name_en,
    s.water_summer_days, s.water_winter_days, s.light_min, s.light_max,
    s.toxic_pets AS species_toxic_pets, s.toxic_humans AS species_toxic_humans, s.soil AS species_soil
    FROM plants p LEFT JOIN species s ON s.id = p.species_id`;

  private insert(table: string, data: Row): number {
    const cols = Object.keys(data);
    const sql = cols.length
      ? `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
      : `INSERT INTO ${table} DEFAULT VALUES`;
    return Number(this.db.prepare(sql).run(...Object.values(data)).lastInsertRowid);
  }

  private update(table: string, id: number, data: Row): void {
    const cols = Object.keys(data);
    if (cols.length) this.db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(',')} WHERE id = ?`).run(...Object.values(data), id);
  }

  listPlants(): Row[] {
    const rows = this.db.prepare(`${this.plantSelect} WHERE p.archived = 0 ORDER BY p.name`).all();
    return rows.map((r) => this.decorate(r));
  }

  getPlant(id: number): Row {
    const r = this.db.prepare(`${this.plantSelect} WHERE p.id = ?`).get(id);
    if (!r) throw new HttpError(404, 'Plant niet gevonden');
    const species = r.species_id ? this.db.prepare('SELECT * FROM species WHERE id = ?').get(r.species_id) : null;
    return { ...this.decorate(r), species, logs: this.listLogs(id) };
  }

  createPlant(body: Row): Row {
    if (!body.name) throw new HttpError(400, 'name is verplicht');
    const data = pick(body, PLANT_FIELDS);
    validate(data);
    return this.getPlant(this.insert('plants', data));
  }

  updatePlant(id: number, body: Row): Row {
    this.getPlant(id);
    const data = pick(body, PLANT_FIELDS);
    validate(data);
    if ('archived' in body) data.archived = body.archived ? 1 : 0;
    this.update('plants', id, data);
    return this.getPlant(id);
  }

  listSpecies(): Row[] {
    return this.db.prepare('SELECT * FROM species ORDER BY name').all();
  }

  getSpecies(id: number): Row {
    const r = this.db.prepare('SELECT * FROM species WHERE id = ?').get(id);
    if (!r) throw new HttpError(404, 'Soort niet gevonden');
    return r;
  }

  upsertSpecies(body: Row, id?: number): Row {
    if (!id && !body.name) throw new HttpError(400, 'name is verplicht');
    const data = pick(body, SPECIES_FIELDS);
    validate(data);
    if (id) {
      this.getSpecies(id);
      uniqueGuard(() => this.update('species', id, data));
      return this.getSpecies(id);
    }
    return this.getSpecies(uniqueGuard(() => this.insert('species', data)));
  }

  /** Returns the stored species for a chosen name, or creates one with only the names filled in. */
  resolveSpecies(choice: Row): { species: Row; created: boolean } {
    const latin = String(choice.latin_name ?? '').trim();
    if (!latin) throw new HttpError(400, 'latin_name is verplicht');
    const gbif = Number.isInteger(choice.gbif_key) ? Number(choice.gbif_key) : null;
    const found = ((gbif && this.db.prepare('SELECT * FROM species WHERE gbif_key = ?').get(gbif)) ||
      this.db.prepare('SELECT * FROM species WHERE latin_name = ? COLLATE NOCASE').get(latin)) as Row | undefined;
    if (found) return { species: found, created: false };
    const nl = choice.name_nl || null;
    const en = choice.name_en || null;
    const base = { latin_name: latin, name_nl: nl, name_en: en, gbif_key: gbif };
    try {
      return { species: this.upsertSpecies({ ...base, name: nl || en || latin }), created: true };
    } catch (e) {
      if (!(e instanceof HttpError && e.status === 409)) throw e;
      return { species: this.upsertSpecies({ ...base, name: `${nl || en || latin} (${latin})` }), created: true };
    }
  }

  /** Local ranked search; every query token must match somewhere in the species names. */
  searchSpecies(q: string, limit = 6): Row[] {
    const tokens = normalize(q).split(' ').filter(Boolean);
    if (!tokens.length || normalize(q).length < 2) return [];
    const scored: { score: number; row: Row }[] = [];
    for (const row of this.listSpecies()) {
      const fields = [row.name, row.latin_name, row.name_nl, row.name_en]
        .filter(Boolean)
        .map((f) => normalize(String(f)));
      let total = 0;
      for (const t of tokens) {
        let best = Infinity;
        for (const f of fields) {
          const words = f.split(' ');
          const sc = f === t ? 0 : f.startsWith(t) ? 1 : words.some((w) => w.startsWith(t)) ? 2 : f.includes(t) ? 3 : Infinity;
          best = Math.min(best, sc);
        }
        total += best;
      }
      if (Number.isFinite(total)) scored.push({ score: total, row });
    }
    scored.sort((a, b) => a.score - b.score || a.row.id - b.row.id);
    return scored.slice(0, limit).map(({ row }) => ({
      id: row.id, name: row.name, latin_name: row.latin_name, name_nl: row.name_nl, name_en: row.name_en,
    }));
  }

  listLogs(plantId: number): Row[] {
    return this.db.prepare('SELECT * FROM logs WHERE plant_id = ? ORDER BY date DESC, id DESC').all(plantId);
  }

  addLog(plantId: number, body: Row): Row {
    this.getPlant(plantId);
    checkLog(body);
    const type = body.type;
    if (!LOG_TYPES.includes(type)) throw new HttpError(400, `type moet een van ${LOG_TYPES.join(', ')} zijn`);
    if (body.outcome && !OUTCOMES.includes(body.outcome)) throw new HttpError(400, 'outcome moet good of bad zijn');
    const date: string = body.date || toISODate(this.now());
    this.db
      .prepare('INSERT INTO logs (plant_id, type, date, note, outcome, photo) VALUES (?,?,?,?,?,?)')
      .run(plantId, type, date, body.note ?? null, body.outcome ?? null, body.photo ?? null);
    const column = LAST_COLUMN[type];
    // Back-dated entries must not move the "last" date backwards.
    if (column)
      this.db.prepare(`UPDATE plants SET ${column} = ? WHERE id = ? AND (${column} IS NULL OR ${column} < ?)`).run(date, plantId, date);
    return this.getPlant(plantId);
  }

  deletePlant(id: number): void {
    this.getPlant(id);
    this.db.prepare('DELETE FROM plants WHERE id = ?').run(id);
  }

  /** Deletes all plants, logs and species and restarts the id counters. */
  resetAll(): void {
    this.db.exec("DELETE FROM logs; DELETE FROM plants; DELETE FROM species; DELETE FROM sqlite_sequence WHERE name IN ('logs','plants','species')");
  }

  private syncLast(plantId: number, type: string): void {
    const column = LAST_COLUMN[type];
    if (!column) return;
    const m = this.db.prepare('SELECT MAX(date) AS d FROM logs WHERE plant_id = ? AND type = ?').get(plantId, type) as Row;
    if (m.d) this.db.prepare(`UPDATE plants SET ${column} = ? WHERE id = ?`).run(m.d, plantId);
  }

  updateLog(plantId: number, logId: number, body: Row): Row {
    const old = this.db.prepare('SELECT * FROM logs WHERE id = ? AND plant_id = ?').get(logId, plantId);
    if (!old) throw new HttpError(404, 'Bericht niet gevonden');
    checkLog({ ...body, photo: undefined });
    if (body.type && !LOG_TYPES.includes(body.type)) throw new HttpError(400, `type moet een van ${LOG_TYPES.join(', ')} zijn`);
    const type = body.type ?? old.type;
    const date = body.date || old.date;
    const note = 'note' in body ? body.note || null : old.note;
    this.db.prepare('UPDATE logs SET type = ?, date = ?, note = ? WHERE id = ?').run(type, date, note, logId);
    this.syncLast(plantId, String(old.type));
    this.syncLast(plantId, String(type));
    return this.getPlant(plantId);
  }

  deleteLog(plantId: number, logId: number): void {
    const old = this.db.prepare('SELECT type FROM logs WHERE id = ? AND plant_id = ?').get(logId, plantId);
    this.db.prepare('DELETE FROM logs WHERE id = ? AND plant_id = ?').run(logId, plantId);
    if (old) this.syncLast(plantId, String(old.type));
  }

  dueToday(): Row[] {
    return this.listPlants().filter((p) => p.days_overdue !== null && p.days_overdue >= 0);
  }
}
