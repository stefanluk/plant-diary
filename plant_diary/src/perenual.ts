import type { DatabaseSync } from 'node:sqlite';
import { LIGHT_LEVELS, type LightLevel } from './options.js';
import { HttpError, type PlantService } from './service.js';
import type { Row } from './db.js';

const BASE = 'https://perenual.com/api/v2';
const DAILY_LIMIT = 95; // free tier allows 100/day; keep a margin
const MAX_FREE_ID = 3000; // species above this id are premium-only
type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

const gated = (v: unknown) => (typeof v === 'string' && /upgrade plans/i.test(v) ? null : v ?? null);

export function mapSunlight(values: unknown): { min: LightLevel | null; max: LightLevel | null } {
  const levels: number[] = [];
  for (const raw of Array.isArray(values) ? values : []) {
    const v = String(raw).toLowerCase();
    let l: LightLevel | null = null;
    if (/deep shade|full shade/.test(v)) l = 'shade';
    else if (/part shade|filtered shade/.test(v) && !/sun/.test(v)) l = 'half_shade';
    else if (/part sun|bright indirect|sun-part shade|part shade/.test(v)) l = 'indirect';
    else if (/full sun/.test(v)) l = 'full_sun';
    if (l) levels.push(LIGHT_LEVELS.indexOf(l));
  }
  if (!levels.length) return { min: null, max: null };
  return { min: LIGHT_LEVELS[Math.min(...levels)], max: LIGHT_LEVELS[Math.max(...levels)] };
}

const WATER: Record<string, [number, number]> = { frequent: [5, 9], average: [10, 18], minimum: [21, 42] };

/** Maps a Perenual species-details payload to our species fields. */
export function mapDetails(d: Row): Row {
  const latin = Array.isArray(d.scientific_name) ? d.scientific_name[0] : d.scientific_name;
  const { min, max } = mapSunlight(gated(d.sunlight));
  const water = WATER[String(gated(d.watering) ?? '').toLowerCase()];
  const toxicFlag = [gated(d.poisonous_to_humans), gated(d.poisonous_to_pets)];
  return {
    name: latin,
    latin_name: latin,
    name_en: d.common_name ?? null,
    water_summer_days: water?.[0] ?? null,
    water_winter_days: water?.[1] ?? null,
    light_min: min,
    light_max: max,
    toxic: toxicFlag.some((v) => v === 1 || v === true) ? 1 : toxicFlag.every((v) => v == null) ? null : 0,
    description: gated(d.description),
    source: 'perenual',
    external_id: `perenual:${d.id}`,
    verified: 0,
  };
}

export class Perenual {
  constructor(
    private db: DatabaseSync,
    private svc: PlantService,
    private key: string | undefined,
    private fetcher: Fetch = (u) => fetch(u) as any,
    private today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {}

  get enabled(): boolean {
    return !!this.key;
  }

  private async call(path: string, params: Record<string, string>): Promise<any> {
    if (!this.key) throw new HttpError(503, 'Geen Perenual API-sleutel ingesteld in de add-on opties');
    const day = this.today();
    const used = this.db.prepare("SELECT count FROM api_usage WHERE day = ? AND service = 'perenual'").get(day) as
      | { count: number }
      | undefined;
    if ((used?.count ?? 0) >= DAILY_LIMIT) throw new HttpError(429, 'Dagelijks limiet voor online zoeken bereikt; probeer morgen opnieuw');
    this.db
      .prepare(`INSERT INTO api_usage (day, service, count) VALUES (?, 'perenual', 1)
                ON CONFLICT(day, service) DO UPDATE SET count = count + 1`)
      .run(day);
    const qs = new URLSearchParams({ ...params, key: this.key });
    const res = await this.fetcher(`${BASE}${path}?${qs}`);
    if (!res.ok) throw new HttpError(502, `Perenual gaf status ${res.status}`);
    return res.json();
  }

  private cached(key: string): any | null {
    const r = this.db.prepare('SELECT json FROM online_cache WHERE key = ?').get(key) as { json: string } | undefined;
    return r ? JSON.parse(r.json) : null;
  }

  private store(key: string, value: unknown): void {
    this.db
      .prepare('INSERT OR REPLACE INTO online_cache (key, json, fetched) VALUES (?, ?, ?)')
      .run(key, JSON.stringify(value), new Date().toISOString());
  }

  async search(q: string): Promise<Row[]> {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];
    const cacheKey = `search:${query}`;
    let data = this.cached(cacheKey);
    if (!data) {
      data = await this.call('/species-list', { q: query });
      this.store(cacheKey, data);
    }
    return ((data.data ?? []) as Row[])
      .filter((r) => r.id <= MAX_FREE_ID)
      .slice(0, 6)
      .map((r) => ({
        external_id: `perenual:${r.id}`,
        latin_name: Array.isArray(r.scientific_name) ? r.scientific_name[0] : r.scientific_name,
        name_en: r.common_name ?? null,
      }));
  }

  /** Imports one species; reuses a local row when it already exists. */
  async importSpecies(externalId: string): Promise<Row> {
    const existing = this.db.prepare('SELECT * FROM species WHERE external_id = ?').get(externalId) as Row | undefined;
    if (existing) return existing;
    const id = externalId.replace(/^perenual:/, '');
    if (!/^\d+$/.test(id)) throw new HttpError(400, 'Ongeldige external_id');
    const cacheKey = `details:${id}`;
    let details = this.cached(cacheKey);
    if (!details) {
      details = await this.call(`/species/details/${id}`, {});
      this.store(cacheKey, details);
    }
    const fields = mapDetails(details);
    const sameName = this.db.prepare('SELECT * FROM species WHERE latin_name = ? COLLATE NOCASE').get(fields.name) as Row | undefined;
    if (sameName) return sameName;
    return this.svc.upsertSpecies(fields);
  }
}
