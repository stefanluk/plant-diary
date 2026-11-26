export type Season = 'summer' | 'winter';

export interface ScheduleInput {
  lastWatered: string | null;
  nextOverride: string | null;
  intervalOverrideDays: number | null;
  speciesSummerDays: number | null;
  speciesWinterDays: number | null;
}

export const DAY_MS = 86_400_000;

export function seasonOf(date: Date): Season {
  const m = date.getMonth() + 1;
  return m >= 4 && m <= 9 ? 'summer' : 'winter';
}

export function intervalDays(p: ScheduleInput, date: Date): number | null {
  if (p.intervalOverrideDays) return p.intervalOverrideDays;
  return seasonOf(date) === 'summer' ? p.speciesSummerDays : p.speciesWinterDays;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function toISODate(d: Date): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return z.toISOString().slice(0, 10);
}

/** Next watering date. A manual override wins until the plant is watered again. */
export function nextWater(p: ScheduleInput, today: Date): string | null {
  if (p.nextOverride && (!p.lastWatered || p.nextOverride > p.lastWatered)) return p.nextOverride;
  if (!p.lastWatered) return null;
  const days = intervalDays(p, today);
  return days ? addDays(p.lastWatered, days) : null;
}

export function daysOverdue(next: string | null, today: Date): number | null {
  if (!next) return null;
  const t = new Date(toISODate(today) + 'T00:00:00Z').getTime();
  return Math.round((t - new Date(next + 'T00:00:00Z').getTime()) / DAY_MS);
}
