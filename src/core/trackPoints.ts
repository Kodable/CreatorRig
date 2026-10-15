import type { TrackPoint, Vec2 } from './types';
import { dist, normalize, sub } from './vec';
import { sampleCatmullRom } from './spline';

export const LOOP_RADIUS = 4;   // meters
export const LOOP_PITCH = 2;    // horizontal shift from loop entry to loop exit, meters
export const LOOP_STEPS = 8;    // control points around the circle (9 points incl. the return to the bottom)

const SAMPLES_PER_SEGMENT = 24;
/** The longest gap (m) between the samples a tap is matched against (insertionIndex). */
const INSERT_SPACING = 0.25;

/** Deep copy of a TrackPoint list, preserving kind, locked, vertical and openAfter. */
export function clonePoints(points: readonly TrackPoint[]): TrackPoint[] {
  return points.map((p) => {
    const copy: TrackPoint = { x: p.x, y: p.y, kind: p.kind };
    if (p.locked) copy.locked = true;
    if (p.vertical) copy.vertical = true;
    if (p.openAfter) copy.openAfter = true;
    return copy;
  });
}

/** May a point go between points i and i + 1? Not between two locked points (a level's prebuilt
 * part stays whole), unless the first one is `openAfter` (the stretch the child builds, on the
 * prebuilt-track levels). */
export function gapOpen(points: readonly TrackPoint[], i: number): boolean {
  const a = points[i];
  const b = points[i + 1];
  if (!a) return false;
  if (!b) return true;
  return !(a.locked && b.locked) || !!a.openAfter;
}

/**
 * A tap on empty sky on a prebuilt-track level (2026-10-15): when its x falls inside an open
 * stretch between two locked points (`openAfter`, e.g. from the station to a prebuilt loop in the
 * middle), the new point goes into that stretch, not after the track's end. Returns the index i
 * such that the point is inserted at i + 1, or null (the tap appends at the end, as before).
 * Only `openAfter` stretches count, so every other level's sky taps are unchanged.
 */
export function openGapIndex(points: readonly TrackPoint[], x: number): number | null {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    if (!a.openAfter || !a.locked) continue;
    // The stretch runs from this locked point through the child's points to the next locked one.
    let j = i + 1;
    while (j < points.length && !points[j]!.locked) j++;
    const b = points[j];
    if (!b) return null;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    if (x <= lo || x >= hi) continue;
    // Keep the stretch's points in x order: after the last point left of the tap.
    let at = i;
    for (let k = i + 1; k < j; k++) if (points[k]!.x < x) at = k;
    return at;
  }
  return null;
}

/** Expand a TrackPoint list into the Vec2 control points that buildTrack/sampleCatmullRom
 * consume. owner[k] is the index into `points` that produced pts[k]. */
export function expandTrackPoints(points: readonly TrackPoint[]): { pts: Vec2[]; owner: number[] } {
  const pts: Vec2[] = [];
  const owner: number[] = [];
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const p = points[i]!;

    if (p.kind !== 'loop') {
      pts.push({ x: p.x, y: p.y });
      owner.push(i);
      continue;
    }

    const prev = i > 0 ? points[i - 1] : undefined;
    const next = i < n - 1 ? points[i + 1] : undefined;

    let d: Vec2 | null = null;
    if (prev && next) {
      d = normalize(sub({ x: next.x, y: next.y }, { x: prev.x, y: prev.y }));
    } else if (next) {
      d = normalize(sub({ x: next.x, y: next.y }, { x: p.x, y: p.y }));
    } else if (prev) {
      d = normalize(sub({ x: p.x, y: p.y }, { x: prev.x, y: prev.y }));
    }

    if (d === null) {
      // No neighbours at all: treat this point as a plain curve point.
      pts.push({ x: p.x, y: p.y });
      owner.push(i);
      continue;
    }

    const sign = d.x >= 0 ? 1 : -1;
    const C: Vec2 = { x: p.x, y: p.y + LOOP_RADIUS };

    for (let k = 0; k <= LOOP_STEPS; k++) {
      const a = -Math.PI / 2 + sign * k * ((2 * Math.PI) / LOOP_STEPS);
      const shift = sign * (-LOOP_PITCH / 2 + (LOOP_PITCH * k) / LOOP_STEPS);
      pts.push({
        x: C.x + LOOP_RADIUS * Math.cos(a) + shift,
        y: C.y + LOOP_RADIUS * Math.sin(a),
      });
      owner.push(i);
    }
  }

  return { pts, owner };
}

/** Where a tap at world point `p` should insert a new point: returns the index i of `points`
 * such that the new point is inserted at index i+1, or null when no insertion applies. */
export function insertionIndex(points: readonly TrackPoint[], p: Vec2, maxDist: number): number | null {
  if (points.length < 2) return null;

  const expanded = expandTrackPoints(points);
  // 2026-10-15 (wide levels): enough samples per segment that the longest one is sampled every
  // INSERT_SPACING m at most, so a tap right on a long stretch of rail (a 90 m run across a wide
  // world) still finds it within `maxDist`.
  let longest = 0;
  for (let k = 1; k < expanded.pts.length; k++) longest = Math.max(longest, dist(expanded.pts[k - 1]!, expanded.pts[k]!));
  const perSeg = Math.max(SAMPLES_PER_SEGMENT, Math.ceil(longest / INSERT_SPACING));
  const raw = sampleCatmullRom(expanded.pts, perSeg);

  let bestK = -1;
  let bestDist = Infinity;
  for (let k = 0; k < raw.length; k++) {
    const d = dist(raw[k]!, p);
    if (d < bestDist) {
      bestDist = d;
      bestK = k;
    }
  }

  if (bestK < 0 || bestDist > maxDist) return null;

  let seg = Math.floor(bestK / perSeg);
  if (seg > expanded.pts.length - 2) seg = expanded.pts.length - 2;
  if (seg < 0) seg = 0;

  const i = expanded.owner[seg]!;

  if (!gapOpen(points, i)) return null;

  return i;
}
