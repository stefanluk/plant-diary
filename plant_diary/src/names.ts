import { t } from './i18n.js';
export interface NameHit {
  latin_name: string;
  name_nl?: string | null;
  name_en?: string | null;
  gbif_key?: number | null;
}

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

const GBIF = 'https://api.gbif.org/v1';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const BACKBONE = 'd7dddbf4-2cf0-4f39-9b2a-bb099caae36c';
const PLANTAE = 6;

const defaultFetch: Fetch = (u) =>
  fetch(u, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'plant-diary-addon' } }) as any;

/** Plant names from GBIF (scientific names) and Wikidata (Dutch/English common names). No API key needed. */
export class NameSearch {
  private cache = new Map<string, { at: number; hits: NameHit[] }>();

  constructor(private fetcher: Fetch = defaultFetch) {}

  private async get(url: string): Promise<any> {
    const res = await this.fetcher(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  private async gbif(q: string): Promise<NameHit[]> {
    const qs = new URLSearchParams({
      q, rank: 'SPECIES', status: 'ACCEPTED', datasetKey: BACKBONE, highertaxonKey: String(PLANTAE), limit: '8',
    });
    const data = (await this.get(`${GBIF}/species/suggest?${qs}`)) as any[];
    return data
      .filter((r) => r.canonicalName)
      .map((r) => ({ latin_name: String(r.canonicalName), gbif_key: Number(r.key) }));
  }

  /** Wikidata taxa (P225) matching a common or scientific name, with their Dutch/English labels. */
  private async wikidata(q: string, languages = ['nl', 'en']): Promise<NameHit[]> {
    const ids = new Set<string>();
    const found = await Promise.allSettled(
      languages.map((language) =>
        this.get(`${WIKIDATA}?${new URLSearchParams({ action: 'wbsearchentities', search: q, language, type: 'item', limit: '5', format: 'json', origin: '*' })}`),
      ),
    );
    for (const f of found) if (f.status === 'fulfilled') for (const e of f.value.search ?? []) ids.add(e.id);
    if (!ids.size) return [];
    const qs = new URLSearchParams({
      action: 'wbgetentities', ids: [...ids].join('|'), props: 'claims|labels', languages: 'nl|en', format: 'json', origin: '*',
    });
    const entities = (await this.get(`${WIKIDATA}?${qs}`)).entities ?? {};
    const hits: NameHit[] = [];
    for (const e of Object.values<any>(entities)) {
      const latin = e.claims?.P225?.[0]?.mainsnak?.datavalue?.value;
      if (typeof latin !== 'string') continue;
      const label = (l: string) => {
        const v = e.labels?.[l]?.value;
        return v && v.toLowerCase() !== latin.toLowerCase() ? String(v) : null;
      };
      hits.push({ latin_name: latin, name_nl: label('nl'), name_en: label('en') });
    }
    return hits;
  }

  async suggest(q: string): Promise<NameHit[]> {
    const query = q.trim();
    if (query.length < 3) return [];
    const key = query.toLowerCase();
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < 24 * 3600_000) return cached.hits;
    const [g, w] = await Promise.allSettled([this.gbif(query), this.wikidata(query)]);
    const merged = new Map<string, NameHit>();
    const add = (h: NameHit) => {
      const k = h.latin_name.toLowerCase();
      const cur = merged.get(k);
      merged.set(k, cur ? { ...h, ...cur, name_nl: cur.name_nl ?? h.name_nl, name_en: cur.name_en ?? h.name_en } : h);
    };
    if (g.status === 'fulfilled') g.value.forEach(add);
    if (w.status === 'fulfilled') w.value.forEach(add);
    if (g.status === 'rejected' && w.status === 'rejected') throw new Error(t('Online name search is unavailable'));
    const hits = [...merged.values()].slice(0, 8);
    this.cache.set(key, { at: Date.now(), hits });
    return hits;
  }
}
