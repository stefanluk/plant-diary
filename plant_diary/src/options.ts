// Fixed option lists shared by the API and the UI.
export const LIGHT_LEVELS = ['shade', 'half_shade', 'indirect', 'full_sun'] as const;
export type LightLevel = (typeof LIGHT_LEVELS)[number];

export const SOILS = ['cactus', 'airy', 'standard', 'moist', 'orchid_bark'] as const;
export type Soil = (typeof SOILS)[number];

export type LightStatus = 'ok' | 'too_dark' | 'too_bright';

/** Compares where a plant stands with the range its species wants. A missing bound is open-ended. */
export function lightStatus(level: string | null, min: string | null, max: string | null): LightStatus | null {
  if (!level || (!min && !max)) return null;
  const at = LIGHT_LEVELS.indexOf(level as LightLevel);
  if (at < 0) return null;
  const lo = min ? LIGHT_LEVELS.indexOf(min as LightLevel) : 0;
  const hi = max ? LIGHT_LEVELS.indexOf(max as LightLevel) : LIGHT_LEVELS.length - 1;
  if (at < lo) return 'too_dark';
  if (at > hi) return 'too_bright';
  return 'ok';
}
