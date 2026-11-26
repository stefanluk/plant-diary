import type { PlantService } from './service.js';
import type { DatabaseSync } from 'node:sqlite';
import { syncCatalog } from './catalog.js';

// Starter plants link to catalog species (by Latin name); intervals come from the catalog.
const SPECIES: Record<string, string> = {
  'Cactus': 'Cactaceae',
  'Ficus elastica': 'Ficus elastica',
  'Pannenkoekplant': 'Pilea peperomioides',
  'Sansevieria': 'Dracaena trifasciata',
  'Lepelplant': 'Spathiphyllum wallisii',
  'Orchidee': 'Phalaenopsis',
};

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
  syncCatalog(db);
  const find = db.prepare('SELECT id FROM species WHERE latin_name = ?');
  for (const [name, species, room, light, note] of PLANTS)
    svc.createPlant({
      name, species_id: (find.get(SPECIES[species]) as { id: number }).id, room, light, location_note: note,
    });
  return true;
}
