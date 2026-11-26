import type { DatabaseSync } from 'node:sqlite';
import { LOG_TYPES, OUTCOMES, type Row } from './db.js';
import { LIGHT_LEVELS, SOILS, lightStatus } from './options.js';
import { daysOverdue, nextWater, toISODate } from './schedule.js';

const PLANT_FIELDS = [
  'name', 'species_id', 'room', 'light', 'light_level', 'location_note', 'acquired', 'soil', 'pot',
  'toxic', 'water_interval_override', 'last_watered',
  'next_water_override', 'last_fed', 'last_repotted',
] as const;

const SPECIES_FIELDS = [
  'name', 'latin_name', 'name_nl', 'name_en', 'synonyms', 'water_summer_days', 'water_winter_days',
  'feed_days', 'light_min', 'light_max', 'soil', 'toxic', 'feed_tip', 'repot_tip', 'prune_tip',
  'description', 'verified', 'source', 'external_id',
] as const;

function validate(data: Row): void {
  for (const f of ['light_level', 'light_min', 'light_max'])
    if (data[f] != null && !(LIGHT_LEVELS as readonly string[]).includes(data[f]))
      throw new HttpError(400, `${f} moet een van ${LIGHT_LEVELS.join(', ')} zijn`);
  if (data.soil != null && !(SOILS as readonly string[]).includes(data.soil))
    throw new HttpError(400, `soil moet een van ${SOILS.join(', ')} zijn`);
  for (const f of ['toxic', 'verified']) if (f in data && data[f] != null) data[f] = data[f] ? 1 : 0;
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

const pick = (src: Row, fields: readonly string[]) =>
  Object.fromEntries(fields.filter((f) => f in src).map((f) => [f, src[f] === '' ? null : src[f]]));

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
    return {
      ...r,
      toxic_own: r.toxic,
      toxic: r.toxic ?? r.species_toxic ?? 0,
      soil_effective: r.soil ?? r.species_soil ?? null,
      light_status: lightStatus(r.light_level, r.light_min, r.light_max),
      next_water: next,
      days_overdue: daysOverdue(next, today),
    };
  }

  private plantSelect = `SELECT p.*, s.name AS species_name, s.latin_name, s.name_nl, s.name_en,
    s.water_summer_days, s.water_winter_days, s.feed_days, s.light_min, s.light_max,
    s.toxic AS species_toxic, s.soil AS species_soil
    FROM plants p LEFT JOIN species s ON s.id = p.species_id`;

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
    const cols = Object.keys(data);
    const res = this.db
      .prepare(`INSERT INTO plants (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .run(...(Object.values(data) as any[]));
    return this.getPlant(Number(res.lastInsertRowid));
  }

  updatePlant(id: number, body: Row): Row {
    this.getPlant(id);
    const data = pick(body, PLANT_FIELDS);
    validate(data);
    if ('archived' in body) (data as Row).archived = body.archived ? 1 : 0;
    const cols = Object.keys(data);
    if (cols.length) {
      this.db
        .prepare(`UPDATE plants SET ${cols.map((c) => `${c} = ?`).join(',')} WHERE id = ?`)
        .run(...(Object.values(data) as any[]), id);
    }
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
    const data = pick(body, SPECIES_FIELDS) as Row;
    validate(data);
    if (id) {
      this.getSpecies(id);
      const cols = Object.keys(data);
      // Marks the entry as customised so a catalog refresh never overwrites it.
      uniqueGuard(() =>
        this.db
          .prepare(`UPDATE species SET ${[...cols.map((c) => `${c} = ?`), 'user_edited = 1'].join(',')} WHERE id = ?`)
          .run(...(Object.values(data) as any[]), id),
      );
      return this.getSpecies(id);
    }
    const cols = Object.keys(data);
    const res = uniqueGuard(() =>
      this.db
        .prepare(`INSERT INTO species (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
        .run(...(Object.values(data) as any[])),
    );
    return this.getSpecies(Number(res.lastInsertRowid));
  }

  /** Local ranked search; every query token must match somewhere in the species names. */
  searchSpecies(q: string, limit = 6): Row[] {
    const tokens = normalize(q).split(' ').filter(Boolean);
    if (!tokens.length || normalize(q).length < 2) return [];
    const scored: { score: number; row: Row }[] = [];
    for (const row of this.listSpecies()) {
      const fields = [row.name, row.latin_name, row.name_nl, row.name_en, ...String(row.synonyms ?? '').split(',')]
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
      source: row.source, verified: row.verified,
    }));
  }

  listLogs(plantId: number): Row[] {
    return this.db.prepare('SELECT * FROM logs WHERE plant_id = ? ORDER BY date DESC, id DESC').all(plantId);
  }

  addLog(plantId: number, body: Row): Row {
    this.getPlant(plantId);
    const type = body.type;
    if (!LOG_TYPES.includes(type)) throw new HttpError(400, `type moet een van ${LOG_TYPES.join(', ')} zijn`);
    if (body.outcome && !OUTCOMES.includes(body.outcome)) throw new HttpError(400, 'outcome moet good of bad zijn');
    const date: string = body.date || toISODate(this.now());
    this.db
      .prepare('INSERT INTO logs (plant_id, type, date, note, outcome, photo) VALUES (?,?,?,?,?,?)')
      .run(plantId, type, date, body.note ?? null, body.outcome ?? null, body.photo ?? null);
    const column = { water: 'last_watered', feed: 'last_fed', repot: 'last_repotted' }[type as string];
    if (column) {
      // Back-dated entries must not move the "last" date backwards.
      this.db
        .prepare(`UPDATE plants SET ${column} = ? WHERE id = ? AND (${column} IS NULL OR ${column} < ?)`)
        .run(date, plantId, date);
    }
    return this.getPlant(plantId);
  }

  deletePlant(id: number): void {
    this.getPlant(id);
    this.db.prepare('DELETE FROM plants WHERE id = ?').run(id);
  }

  private syncLast(plantId: number, type: string): void {
    const column = { water: 'last_watered', feed: 'last_fed', repot: 'last_repotted' }[type];
    if (!column) return;
    const m = this.db.prepare('SELECT MAX(date) AS d FROM logs WHERE plant_id = ? AND type = ?').get(plantId, type) as Row;
    if (m.d) this.db.prepare(`UPDATE plants SET ${column} = ? WHERE id = ?`).run(m.d, plantId);
  }

  updateLog(plantId: number, logId: number, body: Row): Row {
    const old = this.db.prepare('SELECT * FROM logs WHERE id = ? AND plant_id = ?').get(logId, plantId);
    if (!old) throw new HttpError(404, 'Bericht niet gevonden');
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
