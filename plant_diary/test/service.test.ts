import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { PlantService } from '../src/service.js';
import { seedIfEmpty } from '../src/seed.js';
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
  assert.equal(seedIfEmpty(db, svc), true);
  assert.equal(seedIfEmpty(db, svc), false);

  const plants = svc.listPlants();
  assert.equal(plants.length, 10);
  const lepel = plants.find((p) => p.name === 'Lepelplant')!;
  assert.equal(lepel.toxic, 1);
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
import { syncCatalog, CATALOG } from '../src/catalog.js';
import { mapDetails, mapSunlight, Perenual } from '../src/perenual.js';

test('light status compares placement with species range', () => {
  assert.equal(lightStatus('full_sun', 'half_shade', 'indirect'), 'too_bright');
  assert.equal(lightStatus('shade', 'half_shade', 'indirect'), 'too_dark');
  assert.equal(lightStatus('indirect', 'half_shade', 'indirect'), 'ok');
  assert.equal(lightStatus('indirect', null, null), null);
  assert.equal(lightStatus(null, 'shade', 'full_sun'), null);
});

test('catalog sync is idempotent and respects user edits; search ranks and finds synonyms', () => {
  const db = openDb(':memory:');
  const svc = new PlantService(db);
  assert.equal(syncCatalog(db).added, CATALOG.length);
  assert.equal(syncCatalog(db).added, 0);
  const found = svc.searchSpecies('sanse');
  assert.equal(found[0].latin_name, 'Dracaena trifasciata');
  assert.ok(found.length <= 6);
  assert.ok(svc.searchSpecies('Orchidee').some((s) => s.latin_name === 'Phalaenopsis'));
  assert.equal(svc.searchSpecies('x').length, 0);

  svc.upsertSpecies({ name_nl: 'Mijn sansevieria' }, Number(found[0].id));
  db.prepare("UPDATE species SET name_nl = 'zzz' WHERE latin_name = 'Monstera deliciosa'").run();
  syncCatalog(db);
  assert.equal(svc.getSpecies(Number(found[0].id)).name_nl, 'Mijn sansevieria');
  assert.equal(svc.searchSpecies('monstera deliciosa')[0].name_nl, 'Gatenplant');
});

test('plant light mismatch, validation and species name clash', () => {
  const db = openDb(':memory:');
  const svc = new PlantService(db);
  syncCatalog(db);
  const sp = svc.searchSpecies('Spathiphyllum')[0];
  const p = svc.createPlant({ name: 'Lepel', species_id: sp.id, light_level: 'full_sun' });
  assert.equal(p.light_status, 'too_bright');
  assert.equal(svc.updatePlant(p.id, { light_level: 'half_shade' }).light_status, 'ok');
  assert.throws(() => svc.updatePlant(p.id, { light_level: 'zon' }), /light_level/);
  svc.upsertSpecies({ name: 'Eigen' });
  assert.throws(() => svc.upsertSpecies({ name: 'Eigen' }), (e: any) => e.status === 409);
  svc.deletePlant(p.id);
  assert.equal(svc.listPlants().length, 0);
});

test('Perenual mapping, free-tier filtering, caching and quota', async () => {
  assert.deepEqual(mapSunlight(['full sun', 'part shade']), { min: 'half_shade', max: 'full_sun' });
  const m = mapDetails({ id: 7, common_name: 'Rubber', scientific_name: ['Ficus elastica'], watering: 'Average',
    sunlight: ['part sun/part shade'], poisonous_to_pets: 1, poisonous_to_humans: 0, description: 'Upgrade Plans To Premium' });
  assert.equal(m.water_summer_days, 10);
  assert.equal(m.toxic, 1);
  assert.equal(m.description, null);

  const db = openDb(':memory:');
  const svc = new PlantService(db);
  let calls = 0;
  const fetcher = async (url: string) => {
    calls++;
    const body = url.includes('/species-list')
      ? { data: [{ id: 7, common_name: 'Rubber', scientific_name: ['Ficus elastica'] }, { id: 5000, common_name: 'Premium', scientific_name: ['X y'] }] }
      : { id: 7, common_name: 'Rubber', scientific_name: ['Ficus elastica'], watering: 'Minimum', sunlight: ['full sun'] };
    return { ok: true, status: 200, json: async () => body };
  };
  const online = new Perenual(db, svc, 'k', fetcher);
  const res = await online.search('ficus');
  assert.equal(res.length, 1);
  await online.search('Ficus');
  assert.equal(calls, 1);
  const sp = await online.importSpecies(res[0].external_id);
  assert.equal(sp.water_summer_days, 21);
  await online.importSpecies(res[0].external_id);
  assert.equal(calls, 2);
  await assert.rejects(new Perenual(db, svc, undefined, fetcher).search('rose'), /sleutel/);
});

test('ingress-only mode rejects other clients; input is validated', async () => {
  const { buildApp } = await import('../src/server.js');
  const svc = new PlantService(openDb(':memory:'));
  const app = buildApp(svc, undefined, undefined, true);
  assert.equal((await app.inject({ url: '/api/plants', remoteAddress: '192.168.1.5' })).statusCode, 403);
  const ok = await app.inject({ url: '/api/plants', remoteAddress: '172.30.32.2' });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers['x-content-type-options'], 'nosniff');
  const p = svc.createPlant({ name: 'X' });
  assert.throws(() => svc.addLog(Number(p.id), { type: 'note', photo: '../../etc/passwd' }), /Ongeldige foto/);
  assert.throws(() => svc.addLog(Number(p.id), { type: 'note', note: 'x'.repeat(5000) }), /te lang/);
  await app.close();
});
