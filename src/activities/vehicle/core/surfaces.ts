// What the ground is made of (2026-10-09): grass, rock, sand or ice. A level's ground is its
// planet's (planets.ts `ground`) except where its `surfaces` ranges say otherwise; each surface
// changes how the wheels grip, and sand also holds them back. Bruno's rules, the ones the numbers
// below have to make true:
//  - Grass and rock: ordinary ground (the course's physics from before 2026-10-09, exactly).
//  - Sand: "Sand is soft: round and square wheels sink and slow down; star wheels paddle through.
//    Heavy rovers sink more."
//  - Ice: "Ice is slippery: round and square wheels spin and slide; star wheels' points bite into
//    the ice. Fans, stoves and jets push no matter what is under you."
// Pure data and lookups: no physics or Phaser imports.
import { heightAt } from './terrain';
import type { Vec2, WheelKind } from './types';

export type SurfaceKind = 'grass' | 'rock' | 'sand' | 'ice';

export const SURFACE_KINDS: readonly SurfaceKind[] = ['grass', 'rock', 'sand', 'ice'];

/** One stretch of a level's ground (`VehicleLevel.surfaces`): x from..to (m). Later ranges paint
 * over earlier ones, so rocks inside a sand stretch are listed after it. */
export interface SurfaceRange {
  from: number;
  to: number;
  kind: SurfaceKind;
}

export interface SurfaceSpec {
  /** The ground collider's friction on this stretch (terrain chain, build.ts). */
  groundFriction: number;
  /** Each wheel's collider friction while it rests on this ground (sim.ts sets it every step).
   * Rapier combines two colliders' frictions as their AVERAGE, so the grip a wheel actually gets
   * is (wheel + ground) / 2; `grip` below lists that result. */
  wheelFriction: Record<WheelKind, number>;
  /** Rolling resistance on soft ground (sand only), per wheel touching it: a force against the
   * wheel's motion along the ground of `load x (crr + perSpeed x speed)`, where `load` is the
   * wheel's share of the rover's weight (rover mass x planet gravity / wheels on the ground). The
   * constant part is the wheel ploughing its rut; the speed part is why a sinking wheel cannot
   * just spin up to full speed (the motor's torque would otherwise beat any constant drag). */
  drag?: { crr: Record<WheelKind, number>; perSpeed: Record<WheelKind, number> };
  /** How far (m) a wheel is drawn sunk into this ground (render only): `sink` for a light rover,
   * up to `sink + sinkHeavy` for a heavy one (see `sinkDepth`). */
  sink?: Record<WheelKind, number>;
  sinkHeavy?: number;
}

/** The ground friction of grass and rock (the course's terrain friction since 2026-09-22). */
export const GROUND_FRICTION = 0.8;

const SAME: Record<WheelKind, number> = { wheelCircle: 1, wheelSquare: 1, wheelStar: 1 };

/** The surface table. Grass and rock leave the wheels at their catalog friction (1, catalog.ts
 * WHEEL) on a 0.8 ground: the old physics, grip 0.9.
 *  - Sand (ground 0.8): round and square wheels drop to friction 0.19, grip (0.19 + 0.8) / 2 =
 *    0.495 (x 0.55 of normal), and plough a deep rut; the star's points keep full grip and barely
 *    sink.
 *  - Ice (ground 0): round 0.12 and square 0.14, grip 0.06 / 0.07, so they spin and slide; the
 *    star keeps friction 1, grip 0.5, its points biting in. A boulder or the dome on ice slides
 *    too (grip 0.35 / 0.3). */
export const SURFACES: Record<SurfaceKind, SurfaceSpec> = {
  grass: { groundFriction: GROUND_FRICTION, wheelFriction: SAME },
  rock: { groundFriction: GROUND_FRICTION, wheelFriction: SAME },
  sand: {
    groundFriction: GROUND_FRICTION,
    wheelFriction: { wheelCircle: 0.19, wheelSquare: 0.19, wheelStar: 1 },
    drag: {
      crr: { wheelCircle: 0.22, wheelSquare: 0.3, wheelStar: 0.07 },
      perSpeed: { wheelCircle: 0.3, wheelSquare: 0.3, wheelStar: 0.03 },
    },
    sink: { wheelCircle: 0.06, wheelSquare: 0.07, wheelStar: 0.03 },
    sinkHeavy: 0.05,
  },
  ice: { groundFriction: 0, wheelFriction: { wheelCircle: 0.12, wheelSquare: 0.14, wheelStar: 1 } },
};

/** The grip (combined friction) a wheel of `kind` gets on `surface`: Rapier's average rule. */
export function grip(surface: SurfaceKind, kind: WheelKind): number {
  const s = SURFACES[surface];
  return (s.wheelFriction[kind] + s.groundFriction) / 2;
}

/** The ground at x: the last `ranges` entry covering x (from <= x < to), else `ground`. */
export function surfaceAt(ranges: readonly SurfaceRange[] | undefined, ground: SurfaceKind, x: number): SurfaceKind {
  if (ranges) {
    for (let i = ranges.length - 1; i >= 0; i--) {
      const r = ranges[i]!;
      if (x >= r.from && x < r.to) return r.kind;
    }
  }
  return ground;
}

/** The ground from x0 to x1 as contiguous runs (neighbours of the same kind merged), left to
 * right, covering x0..x1 exactly: what build.ts splits the terrain collider and its drawing by. */
export function surfaceRuns(ranges: readonly SurfaceRange[] | undefined, ground: SurfaceKind, x0: number, x1: number): SurfaceRange[] {
  const cuts = new Set<number>([x0, x1]);
  for (const r of ranges ?? []) {
    if (r.from > x0 && r.from < x1) cuts.add(r.from);
    if (r.to > x0 && r.to < x1) cuts.add(r.to);
  }
  const xs = [...cuts].sort((a, b) => a - b);
  const runs: SurfaceRange[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const from = xs[i]!;
    const to = xs[i + 1]!;
    const kind = surfaceAt(ranges, ground, (from + to) / 2);
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.to = to;
    else runs.push({ from, to, kind });
  }
  return runs;
}

/** How far a wheel is drawn sunk into `surface` (m; 0 off soft ground): deeper for a heavier
 * load per wheel (`load` N; 15 N, a two-wheeler's share on Flooftopia, counts as heavy). */
export function sinkDepth(surface: SurfaceKind, kind: WheelKind, load: number): number {
  const s = SURFACES[surface];
  if (!s.sink) return 0;
  return s.sink[kind] + (s.sinkHeavy ?? 0) * Math.min(1, Math.max(0, load / 15));
}

// ---- level helpers ---------------------------------------------------------------------------

/** `{ from, to, kind: 'sand' }`: a sand stretch for a level's `surfaces`. */
export function sand(from: number, to: number): SurfaceRange {
  return { from, to, kind: 'sand' };
}
export function ice(from: number, to: number): SurfaceRange {
  return { from, to, kind: 'ice' };
}
export function rock(from: number, to: number): SurfaceRange {
  return { from, to, kind: 'rock' };
}
export function grass(from: number, to: number): SurfaceRange {
  return { from, to, kind: 'grass' };
}

/** A rock standing in the ground (`VehicleLevel.rocks`, Mars "sand + rocks"): a hard lump `h` m
 * tall and `w` m wide centred on x, raised into the terrain by terrain.ts `withRocks` and drawn
 * with a rock picture (build.ts). */
export interface Rock {
  x: number;
  w: number;
  h: number;
}

/** The rock surface ranges over `rocks` (each lump is rock even inside a sand stretch). */
export function rockRanges(rocks: readonly Rock[]): SurfaceRange[] {
  return rocks.map((r) => rock(r.x - r.w / 2, r.x + r.w / 2));
}

/** Unit tangent of `profile` at x (pointing toward +x), the direction sand drag acts along:
 * the slope across x +/- TANGENT_SPAN, so a wheel on a cobble's corner or a rock's edge gets the
 * ground's general lie, not a vertical sliver. */
export function tangentAt(profile: readonly Vec2[], x: number): Vec2 {
  const dy = heightAt(profile as Vec2[], x + TANGENT_SPAN) - heightAt(profile as Vec2[], x - TANGENT_SPAN);
  const len = Math.hypot(2 * TANGENT_SPAN, dy);
  return { x: (2 * TANGENT_SPAN) / len, y: dy / len };
}
const TANGENT_SPAN = 0.15;
