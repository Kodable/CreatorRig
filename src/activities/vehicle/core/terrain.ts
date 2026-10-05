// Ground profiles for the vehicle obstacle course. A profile is a Vec2[] with x ascending from
// -1 to WORLD_W + 1 and no duplicate x; y = 0 is the default ground. Every helper below returns a
// NEW array (the input is never mutated) so a level can build a profile by chaining calls:
// `withStairs(withCrest(flat(), 12, 20), 13.5, 4)`.
//
// 2026-10-05 (wide worlds): the world is WORLD_W (90 m) wide while the panel shows a VIEW_W (30 m)
// window of it (the kit scrolls the camera). Every level's profile spans the whole world; the
// first nine levels keep their 0..30 content and simply continue at their last height to the
// right edge.
import type { Vec2 } from './types';

/** World width (m): `WorldSpec.worldW` (spec.ts). The walls stand just past 0 and WORLD_W. */
export const WORLD_W = 90;
/** The width (m) of the window the panel shows at zoom 1 (960 stage px / ppm 32). */
export const VIEW_W = 30;

/** Tiny x offset used to keep a near-vertical edge's two points distinct (no duplicate x). */
const EPS = 0.001;
/** Sentinel y used by `withGap`/`withRampToLip` to mark a pit's floor - not a real height, just a
 * flag `findGaps` looks for. `terrainPolygon`'s own `depth` clips it away, which is why a pit
 * degenerates to zero visible height there instead of showing -3 m of "ground". */
const PIT_Y = -3;
const DEG2RAD = Math.PI / 180;
/** Sample spacing (m) used to approximate a smooth hill as a polyline. */
const HILL_STEP = 0.25;
/** Horizontal run (m) of a `withCrest` rise. Not given by the plan; chosen so a 20 deg crest
 * (as used before the stairs level) rises ~0.55 m over the run, enough to visibly kill speed. */
export const CREST_RUN = 1.5;

function sortAscending(points: Vec2[]): Vec2[] {
  return [...points].sort((a, b) => a.x - b.x);
}

/** Flat ground at height `y` (default 0, the usual ground) from x -1 to WORLD_W + 1. A level that
 * starts high up (the Topsy-turvy mesa) passes its height. */
export function flat(y = 0): Vec2[] {
  return [
    { x: -1, y },
    { x: WORLD_W + 1, y },
  ];
}

/** Linear interpolation of a profile's height at `x` (clamped to the profile's own ends). */
export function heightAt(profile: Vec2[], x: number): number {
  if (profile.length === 0) return 0;
  const first = profile[0]!;
  if (x <= first.x) return first.y;
  const last = profile[profile.length - 1]!;
  if (x >= last.x) return last.y;
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i]!;
    const b = profile[i + 1]!;
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
  }
  return last.y;
}

/** Inserts a smooth cosine bump (up and back down to the surrounding baseline) between x0 and
 * x1: y(x) = baseline + height/2 * (1 - cos(2*pi*(x-x0)/(x1-x0))). Its steepest grade, at the
 * quarter points, is atan(pi * height / (x1 - x0)); for a 20 deg hill 1.5 m tall that gives
 * x1 - x0 = pi * 1.5 / tan(20 deg) ~= 13 m (a level may use a shorter run for a steeper
 * effective grade). */
export function withHill(profile: Vec2[], x0: number, x1: number, height: number): Vec2[] {
  const baseline = heightAt(profile, x0);
  const before = profile.filter((p) => p.x < x0 - EPS);
  const after = profile.filter((p) => p.x > x1 + EPS);
  const span = x1 - x0;
  const steps = Math.max(2, Math.round(span / HILL_STEP));
  const bump: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = x0 + (span * i) / steps;
    const y = baseline + (height / 2) * (1 - Math.cos((2 * Math.PI * (x - x0)) / span));
    bump.push({ x, y });
  }
  return sortAscending([...before, ...bump, ...after]);
}

/** A vertical drop to y -3 (a pit) between x0 and x1. Terrain resumes its original height at x1
 * (a pit, not a permanent grade change). */
export function withGap(profile: Vec2[], x0: number, x1: number): Vec2[] {
  const y0 = heightAt(profile, x0);
  const y1 = heightAt(profile, x1);
  const before = profile.filter((p) => p.x < x0 - EPS);
  const after = profile.filter((p) => p.x > x1 + EPS);
  return sortAscending([
    ...before,
    { x: x0, y: y0 },
    { x: x0 + EPS, y: PIT_Y },
    { x: x1 - EPS, y: PIT_Y },
    { x: x1, y: y1 },
    ...after,
  ]);
}

/** `steps` stair steps starting at x0 (rise per step, tread length per step). Permanent: any
 * terrain beyond the last riser is raised by `steps * rise` so the profile stays composable. */
export function withStairs(profile: Vec2[], x0: number, steps: number, rise = 0.3, tread = 0.6): Vec2[] {
  const baseline = heightAt(profile, x0);
  const x1 = x0 + steps * tread;
  const totalRise = steps * rise;
  const before = profile.filter((p) => p.x < x0 - EPS);
  const after = profile.filter((p) => p.x > x1 + EPS).map((p) => ({ x: p.x, y: p.y + totalRise }));
  const treads: Vec2[] = [{ x: x0, y: baseline }];
  for (let i = 0; i < steps; i++) {
    const riserX = x0 + i * tread;
    const topY = baseline + (i + 1) * rise;
    treads.push({ x: riserX + EPS, y: topY });
    treads.push({ x: riserX + tread, y: topY });
  }
  return sortAscending([...before, ...treads, ...after]);
}

/** A single step up at x that stays up (a kerb/curb): terrain beyond x is raised by `height`. */
export function withKerb(profile: Vec2[], x: number, height: number): Vec2[] {
  const baseline = heightAt(profile, x);
  const before = profile.filter((p) => p.x < x - EPS);
  const after = profile.filter((p) => p.x > x + EPS).map((p) => ({ x: p.x, y: p.y + height }));
  return sortAscending([...before, { x: x - EPS, y: baseline }, { x: x + EPS, y: baseline + height }, ...after]);
}

/** Small vertical-edged cobbles between x0 and x1: y alternates between the baseline and
 * baseline + edge every pitch / 2, with near-vertical transitions. Terrain resumes the baseline
 * height at x1. */
export function withCobbles(profile: Vec2[], x0: number, x1: number, edge = 0.06, pitch = 0.4): Vec2[] {
  const baseline = heightAt(profile, x0);
  const before = profile.filter((p) => p.x < x0 - EPS);
  const after = profile.filter((p) => p.x > x1 + EPS);
  const half = pitch / 2;
  const pts: Vec2[] = [{ x: x0, y: baseline }];
  let x = x0;
  let high = false;
  while (x + half < x1 - EPS) {
    const b = x + half;
    pts.push({ x: b - EPS, y: baseline + (high ? edge : 0) });
    high = !high;
    pts.push({ x: b + EPS, y: baseline + (high ? edge : 0) });
    x = b;
  }
  pts.push({ x: x1, y: baseline });
  return sortAscending([...before, ...pts, ...after]);
}

/** A short straight rise to `angleDeg` over `CREST_RUN` meters, that stays up (the new height
 * persists into whatever terrain follows, e.g. a stair flight built with `withStairs` right
 * after). Used to kill speed before an obstacle. */
export function withCrest(profile: Vec2[], x0: number, angleDeg: number): Vec2[] {
  const baseline = heightAt(profile, x0);
  const x1 = x0 + CREST_RUN;
  const height = CREST_RUN * Math.tan(angleDeg * DEG2RAD);
  const before = profile.filter((p) => p.x < x0 - EPS);
  const after = profile.filter((p) => p.x > x1 + EPS).map((p) => ({ x: p.x, y: p.y + height }));
  return sortAscending([...before, { x: x0, y: baseline }, { x: x1, y: baseline + height }, ...after]);
}

/** A straight ramp from x0 up to a lip `lipHeight` above the baseline at x0, a gap `gapWidth`
 * wide, then flat at the absolute height `landingY`. This helper owns the rest of the profile
 * from x0 onward (any existing points between x0 and the profile's own end are replaced; the
 * final x is preserved so the profile still spans to its original last x, typically
 * WORLD_W + 1). For a jump in the middle of a long course use `withJump`, which keeps what
 * follows. */
export function withRampToLip(
  profile: Vec2[],
  x0: number,
  angleDeg: number,
  lipHeight: number,
  gapWidth: number,
  landingY: number,
): Vec2[] {
  const baseline = heightAt(profile, x0);
  const rampLength = lipHeight / Math.tan(angleDeg * DEG2RAD);
  const lipX = x0 + rampLength;
  const gapEndX = lipX + gapWidth;
  const before = profile.filter((p) => p.x < x0 - EPS);
  const maxX = profile.length > 0 ? profile[profile.length - 1]!.x : WORLD_W + 1;
  const tail: Vec2[] = [
    { x: x0, y: baseline },
    { x: lipX, y: baseline + lipHeight },
    { x: lipX + EPS, y: PIT_Y },
    { x: gapEndX - EPS, y: PIT_Y },
    { x: gapEndX, y: landingY },
  ];
  if (maxX > gapEndX + EPS) tail.push({ x: maxX, y: landingY });
  return sortAscending([...before, ...tail]);
}

/** A straight grade from x0 to x1 that rises `dy` (falls, when negative) and stays there: terrain
 * beyond x1 is moved by `dy` (a long climb, a slope down into a dip). */
export function withSlope(profile: Vec2[], x0: number, x1: number, dy: number): Vec2[] {
  const baseline = heightAt(profile, x0);
  const before = profile.filter((p) => p.x < x0 - EPS);
  const after = profile.filter((p) => p.x > x1 + EPS).map((p) => ({ x: p.x, y: p.y + dy }));
  return sortAscending([...before, { x: x0, y: baseline }, { x: x1, y: baseline + dy }, ...after]);
}

/** A jump in the middle of a course: a straight ramp from x0 up `lipHeight` at `angleDeg`, a gap
 * `gapWidth` wide (a `PIT_Y` pit, like `withGap`), then the landing `landingDy` above the
 * baseline at x0 (below, when negative). Unlike `withRampToLip` the terrain that follows is kept:
 * everything beyond the gap is moved by `landingDy`. Returns the profile; `jumpEnd` gives the x
 * where the landing starts. */
export function withJump(
  profile: Vec2[],
  x0: number,
  angleDeg: number,
  lipHeight: number,
  gapWidth: number,
  landingDy = 0,
): Vec2[] {
  const baseline = heightAt(profile, x0);
  const lipX = x0 + lipHeight / Math.tan(angleDeg * DEG2RAD);
  const gapEndX = lipX + gapWidth;
  const before = profile.filter((p) => p.x < x0 - EPS);
  const after = profile.filter((p) => p.x > gapEndX + EPS).map((p) => ({ x: p.x, y: p.y + landingDy }));
  return sortAscending([
    ...before,
    { x: x0, y: baseline },
    { x: lipX, y: baseline + lipHeight },
    { x: lipX + EPS, y: PIT_Y },
    { x: gapEndX - EPS, y: PIT_Y },
    { x: gapEndX, y: heightAt(profile, gapEndX) + landingDy },
    ...after,
  ]);
}

/** Where `withJump(profile, x0, angleDeg, lipHeight, gapWidth)`'s landing starts. */
export function jumpEnd(x0: number, angleDeg: number, lipHeight: number, gapWidth: number): number {
  return x0 + lipHeight / Math.tan(angleDeg * DEG2RAD) + gapWidth;
}

/** The shortest distance (m) from point `p` to the profile's polyline, looking only at segments
 * within `reach` of p horizontally (pass the largest distance you care about; anything farther
 * comes back as Infinity). The sim asks it whether a wheel is resting on the ground. */
export function distanceToGround(profile: Vec2[], p: Vec2, reach: number): number {
  // First point at or past p.x - reach (binary search), then walk the segments up to p.x + reach.
  let lo = 0;
  let hi = profile.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (profile[mid]!.x < p.x - reach) lo = mid + 1;
    else hi = mid;
  }
  let best = Infinity;
  for (let i = Math.max(0, lo - 1); i < profile.length - 1; i++) {
    const a = profile[i]!;
    const b = profile[i + 1]!;
    if (a.x > p.x + reach) break;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y));
  }
  return best;
}

/** One gap in a profile (a `withGap` pit or a `withRampToLip` jump): the x-range with no real
 * terrain surface (the `PIT_Y` sentinel), and the real height at its left and right edges - its
 * "lips", which can differ (e.g. a ramp's takeoff lip and a lower landing). */
export interface Gap {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Finds every gap in `profile`, left to right: a run of one or more consecutive `PIT_Y` points,
 * bounded by the real terrain point just before it (the left lip) and just after it (the right
 * lip). `withGap`/`withRampToLip` always leave a real point on each side (the sentinel never
 * starts a profile or reaches its end), so both lips are guaranteed to exist wherever `PIT_Y`
 * appears. Used by `build.ts:buildTerrain` to draw a visible chasm over each gap - on top of the
 * kit's own ground band (`WorldSpec.groundDepth`) - since `terrainPolygon` itself degenerates to
 * zero height across a gap and draws nothing there. Clipped to the world (x 0..WORLD_W). */
export function findGaps(profile: Vec2[]): Gap[] {
  const gaps: Gap[] = [];
  let i = 0;
  while (i < profile.length) {
    if (profile[i]!.y === PIT_Y) {
      const left = profile[i - 1];
      let j = i;
      while (j < profile.length && profile[j]!.y === PIT_Y) j++;
      const right = profile[j];
      // Clipped to the world like the drawn ground: a gap wholly outside 0..WORLD_W is dropped.
      if (left && right && right.x > 0 && left.x < WORLD_W) {
        gaps.push({ x0: Math.max(0, left.x), y0: left.y, x1: Math.min(WORLD_W, right.x), y1: right.y });
      }
      i = j;
    } else {
      i++;
    }
  }
  return gaps;
}

/** The drawn ground: the profile clipped to the world (x 0..WORLD_W, y not below `-depth`), closed
 * along the bottom at `-depth`. The collider keeps the full profile.
 *
 * Used by `build.ts:buildTerrain` ONLY for the darker "under" layer, closed at the course's full
 * `groundDepth` (1.5 m), so that layer's polygon fills the kit's WHOLE below-y=0 ground band
 * (`WorldSpec.groundBand: false` - the kit itself draws no band there any more). Because the
 * clip-to-`depth` here is what makes a pit/gap's floor (y -3) collapse the polygon to zero height
 * across its x-range, closing at the full ground depth makes the "under" layer degenerate the
 * same way, all the way down: a pit still reads as an open hole for the kit's whole ground band
 * (the chasm visual shows through instead). The rust top "crust" no longer uses this helper (a
 * fixed absolute closing depth clips away wherever the real surface sits below `-depth`, e.g. a
 * jump's lower landing) - see `crustPolygons` below. */
export function terrainPolygon(profile: Vec2[], depth = 0.3): Vec2[] {
  const clipped = profile
    .map((p) => ({ x: Math.min(WORLD_W, Math.max(0, p.x)), y: Math.max(-depth, p.y) }))
    .filter((p, i, arr) => i === 0 || p.x !== arr[i - 1]!.x || p.y !== arr[i - 1]!.y);
  return [...clipped, { x: WORLD_W, y: -depth }, { x: 0, y: -depth }];
}

/** Splits `profile` into the maximal runs of REAL terrain, dropping the `PIT_Y` gap sentinel: a
 * gap has no real surface, so it breaks a run in two instead of joining the terrain on either
 * side of it into one. Each run's first/last point is exactly a gap's lip (see `findGaps`), since
 * `withGap`/`withRampToLip` always leave a real point immediately before/after the sentinel run.
 * Internal helper for `crustPolygons`. */
function terrainSegments(profile: Vec2[]): Vec2[][] {
  const segments: Vec2[][] = [];
  let current: Vec2[] = [];
  for (const p of profile) {
    if (p.y === PIT_Y) {
      if (current.length > 0) segments.push(current);
      current = [];
      continue;
    }
    current.push(p);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

/** The rust "crust": a `thickness`-m band that hugs the terrain surface wherever it exists,
 * instead of closing at a fixed absolute depth (which clips away wherever the real surface sits
 * below `-thickness`, e.g. a jump's lower landing - see `build.ts:buildTerrain`'s doc comment).
 * One polygon per contiguous run of real terrain (`terrainSegments`), clipped to the world (x
 * 0..WORLD_W) like `terrainPolygon`: each polygon runs forward along the surface, then back along
 * surface `- thickness`, closing a thin ribbon that follows every rise, drop and dip in the
 * terrain, above OR below y = 0. A gap has no real surface for the crust to sit under, so it
 * produces no polygon at all across it (the chasm visual shows through there instead); the
 * segments on either side simply stop at the gap's lips, so the crust's own cut edge there may
 * show the crust colour or the darker "under" layer behind it, whichever looks natural - there is
 * no separate "wall" texture to draw. A segment that clips away entirely (outside x 0..WORLD_W) is
 * dropped. */
export function crustPolygons(profile: Vec2[], thickness = 0.3): Vec2[][] {
  return terrainSegments(profile)
    .map((segment) =>
      segment
        .map((p) => ({ x: Math.min(WORLD_W, Math.max(0, p.x)), y: p.y }))
        .filter((p, i, arr) => i === 0 || p.x !== arr[i - 1]!.x || p.y !== arr[i - 1]!.y),
    )
    .filter((clipped) => clipped.length >= 2)
    .map((clipped) => {
      const bottom = [...clipped].reverse().map((p) => ({ x: p.x, y: p.y - thickness }));
      return [...clipped, ...bottom];
    });
}
