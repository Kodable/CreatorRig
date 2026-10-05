import { coaster } from './coaster';
import { goldberg } from './goldberg';
import { structures } from './structures';
import { catapult } from './catapult';
import { vehicle } from './vehicle';
import { bridge } from './bridge';
import type { ActivityDef } from './types';

export const ACTIVITIES: ActivityDef[] = [coaster, goldberg, structures, catapult, vehicle, bridge];

/** Playtest build (2026-10-05, Gao): only these three rides are shown on the park map. The other
 * three activities stay in ACTIVITIES so direct URLs (?activity=bridge) keep working. */
export const PARK_ACTIVITIES: ActivityDef[] = [coaster, catapult, vehicle];

export function findActivity(id: string): ActivityDef | undefined {
  return ACTIVITIES.find((a) => a.id === id);
}
