// Planet Rover's levels, in play order: the Flooftopia intros, the Mars challenges (and free
// play), then the Europa challenges. 2026-10-09: each planet's levels live in their own file under
// levels/ (flooftopia.ts, mars.ts, europa.ts, built with levels/shared.ts) so they can be worked on
// separately; this module joins them and keeps the old import path (`./core/levels`) for the spec,
// the coach and the tests. Level ids never change (the coach keys on 'wheels', 'shape', ...).
import { EUROPA_LEVELS } from './levels/europa';
import { FLOOFTOPIA_LEVELS } from './levels/flooftopia';
import { MARS_LEVELS } from './levels/mars';
import type { VehicleLevel } from './types';

export { EUROPA_LEVELS, FLOOFTOPIA_LEVELS, MARS_LEVELS };
export { HOP_GAPS } from './levels/mars';
export {
  ALL_PARTS,
  ALL_WHEELS,
  CONCEPT_KINDS,
  LONG_TIMEOUT,
  POWER,
  REACH,
  ROCK_SIZES,
  ROVER_X,
  WEIGHTS,
  WHEELS,
  boulderAt,
  finishAt,
  level,
  rockAt,
  roverAt,
  stickOn,
  unlock,
} from './levels/shared';
export type { LevelDef, Stick } from './levels/shared';

export const LEVELS: VehicleLevel[] = [...FLOOFTOPIA_LEVELS, ...MARS_LEVELS, ...EUROPA_LEVELS];

export function findLevel(id: string): VehicleLevel | undefined {
  return LEVELS.find((level) => level.id === id);
}
