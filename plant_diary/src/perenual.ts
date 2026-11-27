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

const PER: Record<string, string> = { yearly: 'jaar', monthly: 'maand', weekly: 'week', daily: 'dag' };
const MONTHS: Record<string, string> = {
  january: 'januari', february: 'februari', march: 'maart', april: 'april', may: 'mei', june: 'juni', july: 'juli',
  august: 'augustus', september: 'september', october: 'oktober', november: 'november', december: 'december',
};

/** Removes every string that carries the API key (Perenual embeds it in some URL fields). */
export function scrub(v: any): any {
  if (typeof v === 'string') return /[?&]key=/i.test(v) ? null : v;
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)]));
  return v;
}

const clean = (v: unknown) => String(v ?? '').replace(/["\\]/g, '').trim();

/** Days from e.g. "7-10" (average of the range) or null. */
function benchmarkDays(b: any): number | null {
  const m = clean(b?.value).match(/(\d+)(?:\s*-\s*(\d+))?/);
  if (!m) return null;
  const unit = String(b?.unit ?? 'days').toLowerCase();
  const n = m[2] ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[1]);
  return Math.round(unit.startsWith('week') ? n * 7 : n);
}

export function mapSoil(values: unknown): string | null {
  const t = (Array.isArray(values) ? values : []).map((x) => clean(x).toLowerCase()).join(' ');
  if (!t) return null;
  if (/sandy|gritty|rocky/.test(t)) return 'cactus';
  if (/well-drained|well drained|loamy|chalk/.test(t)) return 'airy';
  return 'standard';
}

const list = (v: unknown) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);

/** Maps a Perenual species-details payload to our species fields. */
export function mapDetails(d: Row): Row {
  const latin = Array.isArray(d.scientific_name) ? d.scientific_name[0] : d.scientific_name;
  const { min, max } = mapSunlight(gated(d.sunlight));
  const level = WATER[String(gated(d.watering) ?? '').toLowerCase()];
  const bench = benchmarkDays(gated(d.watering_general_benchmark));
  const water: [number, number] | undefined = bench ? [bench, Math.round(bench * 1.8)] : level;
  const flag = (v: unknown) => (v === 1 || v === true ? 1 : v === 0 || v === false ? 0 : null);
  const months = list(d.pruning_month).map((m) => MONTHS[m.toLowerCase()] ?? m);
  const count = d.pruning_count && typeof d.pruning_count === 'object' ? d.pruning_count : null;
  const extra: Row = {
    family: gated(d.family), type: gated(d.type), cycle: gated(d.cycle), origin: list(d.origin).join(', ') || null,
    care_level: gated(d.care_level), growth_rate: gated(d.growth_rate), maintenance: gated(d.maintenance),
    watering: gated(d.watering), sunlight: list(d.sunlight).join(', ') || null, soil: list(d.soil).join(', ') || null,
    indoor: gated(d.indoor), tropical: gated(d.tropical), drought_tolerant: gated(d.drought_tolerant),
    propagation: list(d.propagation).join(', ') || null, pests: list(d.pest_susceptibility).join(', ') || null,
  };
  for (const k of Object.keys(extra)) if (extra[k] == null || extra[k] === '') delete extra[k];
  return {
    name: latin,
    latin_name: latin,
    name_en: d.common_name ?? null,
    water_summer_days: water?.[0] ?? null,
    water_winter_days: water?.[1] ?? null,
    light_min: min,
    light_max: max,
    soil: mapSoil(gated(d.soil)),
    toxic_humans: flag(gated(d.poisonous_to_humans)),
    toxic_pets: flag(gated(d.poisonous_to_pets)),
    prune_tip: months.length
      ? `Snoeien in ${months.join(', ')}${count?.amount ? ` (${count.amount}x per ${PER[clean(count.interval).toLowerCase()] ?? 'jaar'})` : ''}.`
      : null,
    description: gated(d.description),
    extra: JSON.stringify(extra),
    source: 'perenual',
    external_id: `perenual:${d.id}`,
  };
}

export interface NameChoice {
  latin_name: string;
  name_nl?: string | null;
  name_en?: string | null;
  gbif_key?: number | null;
}

export class Perenual {
  constructor(
    private db: DatabaseSync,
    private svc: PlantService,
    private key: string | undefined,
    private fetcher: Fetch = (u) => fetch(u, { signal: AbortSignal.timeout(40000) }) as any,
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
    if ((used?.count ?? 0) >= DAILY_LIMIT) throw new HttpError(429, 'Dagelijks limiet voor Perenual bereikt');
    this.db
      .prepare(`INSERT INTO api_usage (day, service, count) VALUES (?, 'perenual', 1)
                ON CONFLICT(day, service) DO UPDATE SET count = count + 1`)
      .run(day);
    let res;
    try {
      res = await this.fetcher(`${BASE}${path}?${new URLSearchParams({ ...params, key: this.key })}`);
    } catch {
      throw new HttpError(502, 'Perenual niet bereikbaar');
    }
    if (!res.ok) throw new HttpError(502, `Perenual gaf status ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new HttpError(502, 'Perenual gaf een onverwacht antwoord (mogelijk alleen met betaald abonnement)');
    }
  }

  /** Finds the Perenual species whose scientific name equals `latin`; null when there is none. */
  private async find(query: string, latin: string): Promise<{ id: number } | null> {
    const data = await this.call('/species-list', { q: query });
    const want = latin.toLowerCase();
    const hit = ((data.data ?? []) as Row[]).find((r) =>
      (Array.isArray(r.scientific_name) ? r.scientific_name : [r.scientific_name]).some((n) => String(n).toLowerCase() === want));
    return hit ? { id: Number(hit.id) } : null;
  }

  /** One-time lookup for a species. Returns the mapped fields (or null) and a user-facing note. */
  private async fetchFields(choice: NameChoice): Promise<{ fields: Row | null; note: string | null }> {
    if (!this.key) return { fields: null, note: 'Geen Perenual-sleutel ingesteld: vul de soortgegevens zelf in.' };
    try {
      let hit = await this.find(choice.latin_name, choice.latin_name);
      if (!hit && choice.name_en) hit = await this.find(choice.name_en, choice.latin_name);
      if (!hit) return { fields: null, note: 'Perenual kent deze soort niet: vul de soortgegevens zelf in.' };
      if (hit.id > MAX_FREE_ID)
        return { fields: null, note: 'Deze soort zit alleen in het betaalde Perenual-abonnement: vul de soortgegevens zelf in.' };
      const details = await this.call(`/species/details/${hit.id}`, {});
      return { fields: mapDetails(scrub(details)), note: null };
    } catch (e) {
      return { fields: null, note: `Perenual-gegevens ophalen mislukt (${(e as Error).message}): vul de soortgegevens zelf in.` };
    }
  }

  private findLocal(choice: NameChoice): Row | undefined {
    const byKey = choice.gbif_key
      ? (this.db.prepare('SELECT * FROM species WHERE gbif_key = ?').get(choice.gbif_key) as Row | undefined)
      : undefined;
    return byKey ?? (this.db.prepare('SELECT * FROM species WHERE latin_name = ? COLLATE NOCASE').get(choice.latin_name) as Row | undefined);
  }

  /** Local data first; Perenual is called only once for a species that is not stored yet. */
  async resolve(choice: NameChoice): Promise<{ species: Row; created: boolean; note: string | null }> {
    const latin = String(choice.latin_name ?? '').trim();
    if (!latin) throw new HttpError(400, 'latin_name is verplicht');
    const local = this.findLocal({ ...choice, latin_name: latin });
    if (local) return { species: local, created: false, note: null };
    const { fields, note } = await this.fetchFields({ ...choice, latin_name: latin });
    const base: Row = {
      name: choice.name_nl || choice.name_en || latin,
      latin_name: latin,
      name_nl: choice.name_nl ?? null,
      name_en: choice.name_en ?? null,
      gbif_key: choice.gbif_key ?? null,
      source: fields ? 'perenual' : 'gbif',
    };
    if (fields) {
      for (const k of ['water_summer_days', 'water_winter_days', 'light_min', 'light_max', 'soil', 'toxic_humans', 'toxic_pets',
        'prune_tip', 'description', 'extra', 'external_id']) base[k] = fields[k] ?? null;
      base.name_en = base.name_en ?? fields.name_en ?? null;
    }
    try {
      return { species: this.svc.upsertSpecies(base), created: true, note };
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) {
        base.name = `${base.name} (${latin})`;
        return { species: this.svc.upsertSpecies(base), created: true, note };
      }
      throw e;
    }
  }

  /** Fills only empty fields of an existing species from Perenual; never overwrites what is there. */
  async enrich(speciesId: number): Promise<{ species: Row; note: string | null }> {
    const sp = this.svc.getSpecies(speciesId);
    const { fields, note } = await this.fetchFields({ latin_name: sp.latin_name ?? sp.name, name_en: sp.name_en });
    if (!fields) return { species: sp, note };
    const patch: Row = {};
    for (const k of ['water_summer_days', 'water_winter_days', 'light_min', 'light_max', 'soil', 'toxic_humans', 'toxic_pets',
      'prune_tip', 'description', 'extra'])
      if (sp[k] == null && fields[k] != null) patch[k] = fields[k];
    return { species: Object.keys(patch).length ? this.svc.upsertSpecies(patch, speciesId) : sp, note: null };
  }
}
