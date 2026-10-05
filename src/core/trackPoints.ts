import type { TrackPoint, Vec2 } from './types';
import { dist, normalize, sub } from './vec';
import { sampleCatmullRom } from './spline';

export const LOOP_RADIUS = 4;   // meters
export const LOOP_PITCH = 2;    // horizontal shift from loop entry to loop exit, meters
export const LOOP_STEPS = 8;    // control points around the circle (9 points incl. the return to the bottom)

const SAMPLES_PER_SEGMENT = 24;

/** Deep copy of a TrackPoint list, preserving kind and locked. */
export function clonePoints(points: readonly TrackPoint[]): TrackPoint[] {
  return points.map((p) => {
    const copy: TrackPoint = { x: p.x, y: p.y, kind: p.kind };
    if (p.locked) copy.locked = true;
    return copy;
  });
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
  const raw = sampleCatmullRom(expanded.pts, SAMPLES_PER_SEGMENT);

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

  let seg = Math.floor(bestK / SAMPLES_PER_SEGMENT);
  if (seg > expanded.pts.length - 2) seg = expanded.pts.length - 2;
  if (seg < 0) seg = 0;

  const i = expanded.owner[seg]!;

  const a = points[i]!;
  const b = points[i + 1];
  if (a.locked && b && b.locked) return null;

  return i;
}
