// What every rover level is built from (2026-10-09: the levels moved into one file per planet,
// flooftopia.ts / mars.ts / europa.ts, so each planet's levels can be worked on alone; ../levels.ts
// joins them into LEVELS). Every level places Kevin's glass dome (locked, the child never drags
// it) at ROVER_X and the beacon; the child spends the level's coins on parts from the palette,
// sticks them anywhere on the dome's rim, presses DRIVE and watches. Units are meters, y up; the
// world is 90 x 19.125 m (terrain.ts WORLD_W, build.ts WORLD_H; the panel shows 30 m and scrolls).
//
// How to write a level (see `LevelDef` for every field; `sand`/`ice`/`rock`/`grass` come from
// ../surfaces, the terrain helpers from ../terrain, `rockAt` and `level` from here):
//   level({
//     id: 'dunes', planet: 'mars', title: 'Dune drive', bruno: '...', hints: [...], failHints: {...},
//     terrain: withSlope(flat(), 20, 30, 1),      // the ground's shape (terrain.ts helpers)
//     surfaces: [sand(10, 50), ice(60, 70)],       // other ground than the planet's (surfaces.ts)
//     rocks: [rockAt(18), rockAt(24, 'big')],      // rocks standing in the ground (raised + drawn)
//     budget: 12, extentW: 84, palette: [...ALL_PARTS], finishX: 80, timeout: LONG_TIMEOUT,
//     solution: [['wheelStar', -45], ['wheelStar', -135]],
//   })
// `planet` sets the gravity (planets.ts), the ground outside `surfaces`, the sky look and the HUD
// chapter. levels.test.ts proves every `solution` and `altSolutions` build passes within budget
// and that the dome alone does not.
import { ROVER_R } from '../art';
import { blockSize } from '../build';
import { defaultProps } from '../catalog';
import { GROUND_CLEARANCE, rimPoint } from '../geometry';
import { PLANETS } from '../planets';
import type { PlanetId } from '../planets';
import { rockRanges } from '../surfaces';
import type { Rock, SurfaceRange } from '../surfaces';
import { heightAt, withRocks } from '../terrain';
import type { AttachmentKind, PartKind, RoverPart, Vec2, VehicleLevel } from '../types';

/** Every level puts the dome here. */
export const ROVER_X = 3;
export const FINISH_X = 27;
export const ROVER_ID = 1;
export const FINISH_ID = 2;
/** Ids of the child's (solution) parts start here; level scenery (a boulder) uses 3..9. */
export const FIRST_PART_ID = 10;

/** The dome as the level places it: resting on the ground (normalizeParts lifts it onto
 * whatever wheels the child adds). */
export function roverAt(terrain: Vec2[]): RoverPart {
  return {
    id: ROVER_ID,
    kind: 'rover',
    x: ROVER_X,
    y: heightAt(terrain, ROVER_X) + ROVER_R + GROUND_CLEARANCE,
    props: {},
    locked: true,
    lockPosition: true,
  };
}

export function finishAt(terrain: Vec2[], x: number = FINISH_X): RoverPart {
  return { id: FINISH_ID, kind: 'finish', x, y: heightAt(terrain, x), props: {}, locked: true, lockPosition: true };
}

/** A pushable boulder (`size` "<w>x<h>" m, `material` light / rock / heavy, build.ts) on the
 * ground at x. */
export function boulderAt(terrain: Vec2[], id: number, x: number, size: string, material: string): RoverPart {
  return {
    id,
    kind: 'block',
    x,
    y: heightAt(terrain, x) + blockSize(size).h / 2,
    props: { ...defaultProps('block'), size, material },
    locked: true,
    lockPosition: true,
  };
}

/** One attachment in a solution: kind, rim angle (degrees, 0 = front, 90 = top, -90 = bottom),
 * mount. */
export type Stick = [kind: AttachmentKind, deg: number, mount?: 'cup' | 'spring'];

/** The child's parts for `sticks`, placed on the rim of the level's dome (normalizeParts then
 * snaps them and stands the build on the ground, exactly as in the app). */
export function stickOn(terrain: Vec2[], sticks: Stick[]): RoverPart[] {
  const rover = roverAt(terrain);
  return sticks.map(([kind, deg, mount], i) => {
    const r = rimPoint((deg * Math.PI) / 180);
    return { id: FIRST_PART_ID + i, kind, x: rover.x + r.x, y: rover.y + r.y, props: { mount: mount ?? 'cup' } };
  });
}

export const REACH: VehicleLevel['goals'] = [{ metric: 'reachedFinish', op: '==', value: 1, label: 'Get to the end' }];

/** Rock sizes for `rockAt` (m): a small stone a round wheel rolls over, a medium one it bumps
 * over at speed, a big one that stops a slow rover (tune with the sim, not by eye). */
export const ROCK_SIZES = {
  small: { w: 0.5, h: 0.16 },
  medium: { w: 0.7, h: 0.25 },
  big: { w: 1.0, h: 0.38 },
} as const;

/** A rock standing in the ground at x, for `LevelDef.rocks`. */
export function rockAt(x: number, size: keyof typeof ROCK_SIZES = 'medium'): Rock {
  return { x, ...ROCK_SIZES[size] };
}

export interface LevelDef {
  id: string;
  /** The planet (planets.ts): gravity, the default ground, the sky look and the HUD chapter. */
  planet: PlanetId;
  title: string;
  bruno: string;
  terrain: Vec2[];
  /** Ground other than the planet's (surfaces.ts `sand(a, b)`, `ice(a, b)`, ...; later ranges
   * paint over earlier ones). */
  surfaces?: SurfaceRange[];
  /** Rocks standing in the ground (`rockAt`): `level()` raises each into the terrain
   * (terrain.ts `withRocks`), makes it rock ground (after `surfaces`, so a rock in a sand stretch
   * is rock) and the course draws it with a rock picture. Keep them clear of gaps and of each
   * other. */
  rocks?: Rock[];
  budget: number;
  palette: PartKind[];
  introduces?: string[];
  goals?: VehicleLevel['goals'];
  hints: string[];
  failHints: VehicleLevel['failHints'];
  /** Level-placed scenery besides the dome and the beacon (ids 3..9). */
  scenery?: (terrain: Vec2[]) => RoverPart[];
  finishX?: number;
  /** `Level.extentW` (kit/types.ts): the width (m, from x 0) this level's content actually uses.
   * The camera clamp and the edit-mode scrollbar use `min(WORLD_W, extentW)`, so a short level in
   * this 90 m-wide, 30 m-view course shows no scrollbar and never scrolls into its empty tail
   * (see levels.test.ts's `extentW` checks for how each value was chosen). */
  extentW: number;
  solution?: Stick[];
  /** More builds that pass (levels.test proves each). */
  altSolutions?: Stick[][];
  /** Seconds before `timeout` (sim.ts TIMEOUT_S when absent). */
  timeout?: number;
}

export function level(def: LevelDef): VehicleLevel {
  const rocks = def.rocks ?? [];
  const terrain = rocks.length > 0 ? withRocks(def.terrain, rocks) : def.terrain;
  const surfaces = [...(def.surfaces ?? []), ...rockRanges(rocks)];
  const planet = PLANETS[def.planet];
  const preset = [roverAt(terrain), finishAt(terrain, def.finishX), ...(def.scenery?.(terrain) ?? [])];
  return {
    id: def.id,
    planet: def.planet,
    // 2026-10-09: the sky look and the level picker's chapter ("Mars · 3 of 9") come from the planet.
    look: planet.look,
    chapter: planet.name,
    title: def.title,
    bruno: def.bruno,
    goals: def.goals ?? REACH,
    parts: preset,
    palette: def.palette,
    hints: def.hints,
    failHints: def.failHints,
    terrain,
    ...(surfaces.length > 0 ? { surfaces } : {}),
    ...(rocks.length > 0 ? { rocks } : {}),
    budget: def.budget,
    extentW: def.extentW,
    ...(def.introduces ? { introduces: def.introduces } : {}),
    ...(def.solution ? { solution: [...preset, ...stickOn(terrain, def.solution)] } : {}),
    ...(def.altSolutions ? { altSolutions: def.altSolutions.map((alt) => [...preset, ...stickOn(terrain, alt)]) } : {}),
    ...(def.timeout !== undefined ? { timeout: def.timeout } : {}),
  };
}

/** The long challenges' timeout: room for a slow build to finish 90 m (stuck still ends a
 * hopeless run after a few seconds). */
export const LONG_TIMEOUT = 45;

export const WHEELS: PartKind[] = ['wheelCircle', 'wheelSquare'];
export const ALL_WHEELS: PartKind[] = ['wheelCircle', 'wheelSquare', 'wheelStar'];
export const WEIGHTS: PartKind[] = ['feather', 'beans', 'watermelon'];
export const POWER: PartKind[] = ['fan', 'stove', 'jet'];
/** Every attachment: the challenges' palette. */
export const ALL_PARTS: PartKind[] = [...ALL_WHEELS, ...WEIGHTS, ...POWER];

/** Concept ids each level's `introduces` may name, and the palette kinds they unlock (levels.test
 * checks that no palette offers a kind before its concept). 'mount' is also the drawer row's
 * property code, so the kit hides the Mount row until it is introduced. */
export const CONCEPT_KINDS: Record<string, PartKind[]> = {
  wheels: WHEELS,
  shape: ['wheelStar'],
  mount: [],
  weight: WEIGHTS,
  power: POWER,
};

/** A level's `introduces` for `concept`: the concept id, then a `part:<kind>` entry for every kind
 * it unlocks (kit/types.ts: the shelf plays its unlock callout for those kinds, with the part's
 * blurb, on that level; levels.test checks each is in the palette and offered there first). */
export function unlock(concept: string): string[] {
  return [concept, ...(CONCEPT_KINDS[concept] ?? []).map((kind) => `part:${kind}`)];
}
