import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Must be set before the server module is loaded: photo routes write below DATA_DIR.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'pd-test-'));
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { PlantService } from '../src/service.js';
import { daysOverdue, nextWater, seasonOf } from '../src/schedule.js';

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

  assert.throws(() => svc.addLog(lepel.id, { type: 'bogus' }), /type must/);
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
  assert.throws(() => svc.setPhoto(Number(p.id), '../../etc/passwd'), /Invalid photo/);
  assert.equal(svc.setPhoto(Number(p.id), '11111111-2222-3333-4444-555555555555.jpg'), null);
  assert.equal(svc.getPlant(Number(p.id)).photo, '11111111-2222-3333-4444-555555555555.jpg');
  assert.throws(() => svc.addLog(Number(p.id), { type: 'note', note: 'x'.repeat(5000) }), /too long/);
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

test('pot must be a diameter in cm', () => {
  const svc = new PlantService(openDb(':memory:'));
  assert.equal(svc.createPlant({ name: 'A', pot: '14,5' }).pot, '14.5');
  assert.throws(() => svc.createPlant({ name: 'B', pot: 'terracotta' }), /diameter/);
});

test('season boundaries and overdue days', () => {
  assert.equal(seasonOf(new Date(2026, 2, 31)), 'winter');
  assert.equal(seasonOf(new Date(2026, 3, 1)), 'summer');
  assert.equal(seasonOf(new Date(2026, 8, 30)), 'summer');
  assert.equal(seasonOf(new Date(2026, 9, 1)), 'winter');
  assert.equal(daysOverdue('2026-07-10', new Date(2026, 6, 13)), 3);
  assert.equal(daysOverdue('2026-07-10', new Date(2026, 6, 10)), 0);
  assert.equal(daysOverdue('2026-07-10', new Date(2026, 6, 8)), -2);
  assert.equal(daysOverdue(null, new Date()), null);
});

test('undoing a watering restores the previous last-watered date', () => {
  const svc = new PlantService(openDb(':memory:'), () => new Date(2026, 6, 15));
  const id = Number(svc.createPlant({ name: 'A' }).id);
  const first = svc.addLog(id, { type: 'water', date: '2026-07-01' });
  const second = svc.addLog(id, { type: 'water' });
  assert.equal(second.last_watered, '2026-07-15');
  svc.deleteLog(id, Number(second.log_id));
  assert.equal(svc.getPlant(id).last_watered, '2026-07-01');
  svc.deleteLog(id, Number(first.log_id));
  assert.equal(svc.getPlant(id).last_watered, null);
});

test('duplicating a plant keeps species and place but not photo, dates or diary', () => {
  const svc = new PlantService(openDb(':memory:'), () => new Date(2026, 6, 15));
  const sp = svc.upsertSpecies({ name: 'Pilea' });
  const src = svc.createPlant({ name: 'Pilea', species_id: sp.id, room: 'Keuken', light_level: 'indirect', pot: '12' });
  svc.addLog(Number(src.id), { type: 'water' });
  svc.setPhoto(Number(src.id), '11111111-2222-3333-4444-555555555555.jpg');
  const copy = svc.duplicatePlant(Number(src.id));
  assert.equal(copy.name, 'Pilea (cutting)');
  assert.equal(copy.species_id, sp.id);
  assert.equal(copy.room, 'Keuken');
  assert.equal(copy.acquired, '2026-07-15');
  assert.equal(copy.photo, null);
  assert.equal(copy.last_watered, null);
  assert.equal(copy.pot, null);
  assert.equal((copy.logs as unknown[]).length, 0);
});

test('backup export can be imported again; invalid backups change nothing', () => {
  const svc = new PlantService(openDb(':memory:'));
  const sp = svc.upsertSpecies({ name: 'Monstera', water_summer_days: 7 });
  const p = svc.createPlant({ name: 'Mo', species_id: sp.id });
  svc.addLog(Number(p.id), { type: 'note', note: 'hoi' });
  const photo = '11111111-2222-3333-4444-555555555555.jpg';
  svc.setPhoto(Number(p.id), photo);
  const backup = JSON.parse(JSON.stringify(svc.exportData()));

  const other = new PlantService(openDb(':memory:'));
  other.createPlant({ name: 'Oud' });
  assert.deepEqual(other.importData(backup, new Set([photo])), { plants: 1 });
  const got = other.getPlant(Number(p.id));
  assert.equal(got.name, 'Mo');
  assert.equal(got.photo, photo);
  assert.equal((got.logs as any[])[0].note, 'hoi');
  assert.equal(other.listPlants().length, 1);

  other.importData(backup, new Set());
  assert.equal(other.getPlant(Number(p.id)).photo, null);

  assert.throws(() => other.importData({ format: 'nope' }, new Set()), /not a valid/);
  assert.throws(() => other.importData({ ...backup, plants: [{ id: 1, name: 'A' }, { id: 1, name: 'B' }] }, new Set()), /could not be read/);
  assert.equal(other.listPlants().length, 1);
});

test('export and import routes round-trip photos', async () => {
  const { buildApp } = await import('../src/server.js');
  const svc = new PlantService(openDb(':memory:'));
  const app = buildApp(svc);
  const photo = '11111111-2222-3333-4444-555555555555.jpg';
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
  const p = svc.createPlant({ name: 'A' });
  svc.setPhoto(Number(p.id), photo);
  const bad = await app.inject({ method: 'POST', url: '/api/import', payload: { format: 'x' } });
  assert.equal(bad.statusCode, 400);
  const res = await app.inject({
    method: 'POST', url: '/api/import',
    payload: { ...svc.exportData(), photos: { [photo]: jpeg.toString('base64'), '../evil.jpg': 'AAAA' } },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(svc.getPlant(Number(p.id)).photo, photo);
  const out = await app.inject({ url: '/api/export' });
  assert.match(String(out.headers['content-disposition']), /attachment/);
  assert.equal(Object.keys(out.json().photos).join(), photo);
  const dup = await app.inject({ method: 'POST', url: `/api/plants/${p.id}/duplicate` });
  assert.equal(dup.statusCode, 201);
  await app.close();
});

test('daily summary sends one push for all due plants, once a day', async () => {
  const { HaBridge } = await import('../src/ha.js');
  const svc = new PlantService(openDb(':memory:'), () => new Date(2026, 6, 15));
  const sp = svc.upsertSpecies({ name: 'S', water_summer_days: 3 });
  for (const n of ['A', 'B']) svc.addLog(Number(svc.createPlant({ name: n, species_id: sp.id }).id), { type: 'water', date: '2026-07-01' });
  const calls: any[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_u: string, init: any) => (calls.push(JSON.parse(init.body)), { ok: true })) as any;
  try {
    const ha = new HaBridge({ notifyService: 'notify.phone', supervisorToken: 't', haUrl: 'http://x' }, svc, { error() {} } as any);
    await ha.notifyDue('2026-07-15');
    await ha.notifyDue('2026-07-15');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].title, '2 plants need water');
    assert.equal(calls[0].message, 'A, B');
    await ha.notifyDue('2026-07-16');
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('diary entries cannot be dated in the future', () => {
  const svc = new PlantService(openDb(':memory:'), () => new Date(2026, 6, 15));
  const id = Number(svc.createPlant({ name: 'A' }).id);
  assert.throws(() => svc.addLog(id, { type: 'note', date: '2026-07-16' }), /future/);
  assert.doesNotThrow(() => svc.addLog(id, { type: 'note', date: '2026-07-15' }));
});
