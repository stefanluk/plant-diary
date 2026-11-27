import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { PlantService } from '../src/service.js';
import { nextWater, seasonOf } from '../src/schedule.js';

const base = { lastWatered: null, nextOverride: null, intervalOverrideDays: null, speciesSummerDays: 10, speciesWinterDays: 20 };

test('season and interval switch automatically', () => {
  assert.equal(seasonOf(new Date(2026, 6, 1)), 'summer');
  assert.equal(seasonOf(new Date(2026, 11, 1)), 'winter');
  assert.equal(nextWater({ ...base, lastWatered: '2026-07-01' }, new Date(2026, 6, 5)), '2026-07-11');
  assert.equal(nextWater({ ...base, lastWatered: '2026-12-01' }, new Date(2026, 11, 5)), '2026-12-21');
});

test('plant override beats species interval; manual next date wins until watered', () => {
  const p = { ...base, lastWatered: '2026-07-01', intervalOverrideDays: 3 };
  assert.equal(nextWater(p, new Date(2026, 6, 2)), '2026-07-04');
  const o = { ...base, lastWatered: '2026-07-01', nextOverride: '2026-07-20' };
  assert.equal(nextWater(o, new Date(2026, 6, 2)), '2026-07-20');
  assert.equal(nextWater({ ...o, lastWatered: '2026-07-20' }, new Date(2026, 6, 21)), '2026-07-30');
});

test('service: watering logs, back-dating, due list, toxic fallback', () => {
  const db = openDb(':memory:');
  const now = new Date(2026, 6, 15);
  const svc = new PlantService(db, () => now);
  const sp = svc.upsertSpecies({ name: 'Lepelplant', water_summer_days: 5, water_winter_days: 10, toxic_pets: 1, toxic_humans: 0 });
  const lepel = svc.createPlant({ name: 'Lepelplant', species_id: sp.id });
  assert.equal(lepel.toxic, 1);
  assert.equal(lepel.toxic_pets, 1);
  assert.equal(lepel.toxic_humans, 0);
  assert.equal(lepel.next_water, null);

  let p = svc.addLog(lepel.id, { type: 'water', date: '2026-07-05' });
  assert.equal(p.next_water, '2026-07-10');
  assert.ok(svc.dueToday().some((d) => d.id === lepel.id));

  p = svc.addLog(lepel.id, { type: 'water', date: '2026-07-01' });
  assert.equal(p.last_watered, '2026-07-05');

  p = svc.addLog(lepel.id, { type: 'water' });
  assert.equal(p.last_watered, '2026-07-15');
  assert.equal(p.next_water, '2026-07-20');
  assert.ok(!svc.dueToday().some((d) => d.id === lepel.id));

  assert.throws(() => svc.addLog(lepel.id, { type: 'bogus' }), /type moet/);
});

import { lightStatus } from '../src/options.js';
import { NameSearch } from '../src/names.js';

test('light status compares placement with species range', () => {
  assert.equal(lightStatus('full_sun', 'half_shade', 'indirect'), 'too_bright');
  assert.equal(lightStatus('shade', 'half_shade', 'indirect'), 'too_dark');
  assert.equal(lightStatus('indirect', 'half_shade', 'indirect'), 'ok');
  assert.equal(lightStatus('indirect', null, null), null);
  assert.equal(lightStatus(null, 'shade', 'full_sun'), null);
});

test('plant light mismatch, validation and species name clash', () => {
  const db = openDb(':memory:');
  const svc = new PlantService(db);
  const sp = svc.upsertSpecies({ name: 'Lepel', light_min: 'shade', light_max: 'half_shade' });
  const p = svc.createPlant({ name: 'Lepel', species_id: sp.id, light_level: 'full_sun' });
  assert.equal(p.light_status, 'too_bright');
  assert.equal(svc.updatePlant(p.id, { light_level: 'half_shade' }).light_status, 'ok');
  assert.throws(() => svc.updatePlant(p.id, { light_level: 'zon' }), /light_level/);
  svc.upsertSpecies({ name: 'Eigen' });
  assert.throws(() => svc.upsertSpecies({ name: 'Eigen' }), (e: any) => e.status === 409);
  svc.deletePlant(p.id);
  assert.equal(svc.listPlants().length, 0);
});

test('resolveSpecies reuses stored species and creates name-only ones otherwise', () => {
  const svc = new PlantService(openDb(':memory:'));
  const first = svc.resolveSpecies({ latin_name: 'Ficus elastica', name_nl: 'Rubberplant', gbif_key: 1 });
  assert.equal(first.created, true);
  svc.upsertSpecies({ water_summer_days: 9 }, Number(first.species.id));
  const again = svc.resolveSpecies({ latin_name: 'ficus elastica', gbif_key: 1 });
  assert.equal(again.created, false);
  assert.equal(again.species.water_summer_days, 9);
  const clash = svc.resolveSpecies({ latin_name: 'Ficus lyrata', name_nl: 'Rubberplant' });
  assert.equal(clash.created, true);
  assert.throws(() => svc.resolveSpecies({}), /latin_name/);
});

test('name suggestions merge GBIF and Wikidata and survive one source failing', async () => {
  const fetcher = async (url: string) => {
    if (url.includes('gbif')) return { ok: true, status: 200, json: async () => [{ key: 9, canonicalName: 'Dracaena trifasciata' }] };
    if (url.includes('wbsearchentities')) return { ok: true, status: 200, json: async () => ({ search: [{ id: 'Q1' }] }) };
    return { ok: true, status: 200, json: async () => ({ entities: { Q1: { claims: { P225: [{ mainsnak: { datavalue: { value: 'Dracaena trifasciata' } } }] },
      labels: { nl: { value: 'Vrouwentongen' }, en: { value: 'Snake plant' } } } } }) };
  };
  const hits = await new NameSearch(fetcher).suggest('sanse');
  assert.deepEqual(hits, [{ latin_name: 'Dracaena trifasciata', gbif_key: 9, name_nl: 'Vrouwentongen', name_en: 'Snake plant' }]);
  const gbifDown = async (url: string) => (url.includes('gbif') ? { ok: false, status: 500, json: async () => ({}) } : fetcher(url));
  assert.equal((await new NameSearch(gbifDown).suggest('sanse'))[0].name_nl, 'Vrouwentongen');
});

test('ingress-only mode rejects other clients; input is validated', async () => {
  const { buildApp } = await import('../src/server.js');
  const svc = new PlantService(openDb(':memory:'));
  const app = buildApp(svc, undefined, true);
  assert.equal((await app.inject({ url: '/api/plants', remoteAddress: '192.168.1.5' })).statusCode, 403);
  const ok = await app.inject({ url: '/api/plants', remoteAddress: '172.30.32.2' });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers['x-content-type-options'], 'nosniff');
  const p = svc.createPlant({ name: 'X' });
  assert.throws(() => svc.addLog(Number(p.id), { type: 'note', photo: '../../etc/passwd' }), /Ongeldige foto/);
  assert.throws(() => svc.addLog(Number(p.id), { type: 'note', note: 'x'.repeat(5000) }), /te lang/);
  await app.close();
});

test('resetAll empties the database and restarts ids', () => {
  const svc = new PlantService(openDb(':memory:'));
  const p = svc.createPlant({ name: 'X' });
  svc.addLog(Number(p.id), { type: 'water' });
  svc.resolveSpecies({ latin_name: 'Monstera deliciosa' });
  svc.resetAll();
  assert.equal(svc.listPlants().length, 0);
  assert.equal(svc.listSpecies().length, 0);
  assert.equal(svc.createPlant({ name: 'Y' }).id, 1);
});
