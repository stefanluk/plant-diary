import type { DatabaseSync } from 'node:sqlite';
import { LOG_TYPES, OUTCOMES, type Row } from './db.js';
import { daysOverdue, nextWater, toISODate } from './schedule.js';

const PLANT_FIELDS = [
  'name', 'species_id', 'room', 'light', 'location_note', 'acquired', 'soil', 'pot',
  'toxic_cat', 'toxic_child', 'water_interval_override', 'last_watered',
  'next_water_override', 'last_fed', 'last_repotted',
] as const;

const SPECIES_FIELDS = [
  'name', 'water_summer_days', 'water_winter_days', 'feed_days', 'toxic_cat', 'toxic_child',
] as const;

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
      toxic_cat: r.toxic_cat ?? r.species_toxic_cat ?? 0,
      toxic_child: r.toxic_child ?? r.species_toxic_child ?? 0,
      next_water: next,
      days_overdue: daysOverdue(next, today),
    };
  }

  private plantSelect = `SELECT p.*, s.name AS species_name, s.water_summer_days, s.water_winter_days,
    s.feed_days, s.toxic_cat AS species_toxic_cat, s.toxic_child AS species_toxic_child
    FROM plants p LEFT JOIN species s ON s.id = p.species_id`;

  listPlants(): Row[] {
    const rows = this.db.prepare(`${this.plantSelect} WHERE p.archived = 0 ORDER BY p.name`).all();
    return rows.map((r) => this.decorate(r));
  }

  getPlant(id: number): Row {
    const r = this.db.prepare(`${this.plantSelect} WHERE p.id = ?`).get(id);
    if (!r) throw new HttpError(404, 'Plant niet gevonden');
    return { ...this.decorate(r), logs: this.listLogs(id) };
  }

  createPlant(body: Row): Row {
    if (!body.name) throw new HttpError(400, 'name is verplicht');
    const data = pick(body, PLANT_FIELDS);
    const cols = Object.keys(data);
    const res = this.db
      .prepare(`INSERT INTO plants (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .run(...(Object.values(data) as any[]));
    return this.getPlant(Number(res.lastInsertRowid));
  }

  updatePlant(id: number, body: Row): Row {
    this.getPlant(id);
    const data = pick(body, PLANT_FIELDS);
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

  upsertSpecies(body: Row, id?: number): Row {
    if (!id && !body.name) throw new HttpError(400, 'name is verplicht');
    const data = pick(body, SPECIES_FIELDS);
    const cols = Object.keys(data);
    if (id) {
      if (cols.length)
        this.db
          .prepare(`UPDATE species SET ${cols.map((c) => `${c} = ?`).join(',')} WHERE id = ?`)
          .run(...(Object.values(data) as any[]), id);
      return this.db.prepare('SELECT * FROM species WHERE id = ?').get(id)!;
    }
    const res = this.db
      .prepare(`INSERT INTO species (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .run(...(Object.values(data) as any[]));
    return this.db.prepare('SELECT * FROM species WHERE id = ?').get(Number(res.lastInsertRowid))!;
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

  deleteLog(plantId: number, logId: number): void {
    this.db.prepare('DELETE FROM logs WHERE id = ? AND plant_id = ?').run(logId, plantId);
  }

  dueToday(): Row[] {
    return this.listPlants().filter((p) => p.days_overdue !== null && p.days_overdue >= 0);
  }
}
