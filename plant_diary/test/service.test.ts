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
  assert.equal(lepel.toxic_cat, 1);
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
