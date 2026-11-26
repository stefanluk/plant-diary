import type { PlantService } from './service.js';
import type { DatabaseSync } from 'node:sqlite';

// Starting intervals (days) are rough defaults; adjust per species or per plant in the UI.
const SPECIES = [
  { name: 'Cactus', water_summer_days: 21, water_winter_days: 42, feed_days: 60, toxic_cat: 0, toxic_child: 0 },
  { name: 'Ficus elastica', water_summer_days: 7, water_winter_days: 14, feed_days: 30, toxic_cat: 1, toxic_child: 1 },
  { name: 'Pannenkoekplant', water_summer_days: 7, water_winter_days: 12, feed_days: 30, toxic_cat: 0, toxic_child: 0 },
  { name: 'Sansevieria', water_summer_days: 14, water_winter_days: 28, feed_days: 60, toxic_cat: 1, toxic_child: 1 },
  { name: 'Lepelplant', water_summer_days: 5, water_winter_days: 9, feed_days: 30, toxic_cat: 1, toxic_child: 1 },
  { name: 'Orchidee', water_summer_days: 7, water_winter_days: 10, feed_days: 21, toxic_cat: 0, toxic_child: 0 },
];

const PLANTS = [
  ['Cactus klein 1', 'Cactus', 'Woonkamer', 'Raam NO, helder', 'Raamkozijn'],
  ['Cactus klein 2', 'Cactus', 'Woonkamer', 'Raam NO, helder', 'Raamkozijn'],
  ['Cactus groot', 'Cactus', 'Woonkamer', 'Halfschaduw', 'Dressoir, ~3 m van raam'],
  ['Ficus elastica', 'Ficus elastica', 'Woonkamer', 'Raam NO, gefilterd', 'Achter vitrage'],
  ['Pannenkoekplant', 'Pannenkoekplant', 'Keuken', 'Helder, indirect', 'Op keukenkastjes (1,90 m)'],
  ['Sansevieria 1', 'Sansevieria', 'Keuken', 'Helder, indirect', 'Op keukenkastjes (1,90 m)'],
  ['Sansevieria 2', 'Sansevieria', 'Keuken', 'Helder, indirect', 'Op keukenkastjes (1,90 m)'],
  ['Sansevieria stekje', 'Sansevieria', 'Keuken', 'Helder, indirect', 'Op keukenkastjes (1,90 m)'],
  ['Lepelplant', 'Lepelplant', 'Keuken', 'Halfschaduw', 'Op afzuiger (1,60 m)'],
  ['Orchidee', 'Orchidee', 'Woonkamer', 'Helder, indirect', ''],
];

export function seedIfEmpty(db: DatabaseSync, svc: PlantService): boolean {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM plants').get() as { n: number };
  if (n > 0) return false;
  const ids = new Map<string, number>();
  for (const s of SPECIES) ids.set(s.name, Number(svc.upsertSpecies(s).id));
  for (const [name, species, room, light, note] of PLANTS)
    svc.createPlant({ name, species_id: ids.get(species), room, light, location_note: note });
  return true;
}
