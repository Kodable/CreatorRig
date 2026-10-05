import type { Vec2 } from './types';
import { sub, len } from './vec';

function lerpKnot(a: Vec2, b: Vec2, ta: number, tb: number, t: number): Vec2 {
  const denom = tb - ta;
  const wa = (tb - t) / denom;
  const wb = (t - ta) / denom;
  return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb };
}

export function sampleCatmullRom(points: Vec2[], perSegment = 24): Vec2[] {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: points[0]!.x, y: points[0]!.y }];

  const p0 = points[0]!;
  const p1 = points[1]!;
  const pnLast = points[n - 1]!;
  const pnSecondLast = points[n - 2]!;

  const phantomStart: Vec2 = { x: 2 * p0.x - p1.x, y: 2 * p0.y - p1.y };
  const phantomEnd: Vec2 = { x: 2 * pnLast.x - pnSecondLast.x, y: 2 * pnLast.y - pnSecondLast.y };

  const ext: Vec2[] = [phantomStart, ...points, phantomEnd];

  const result: Vec2[] = [];

  // ext indices: 0..n+1, real points are ext[1..n]
  // segments run between ext[k+1] and ext[k+2] for k = 0..n-2 (i.e. P1..P2 = real point i, i+1)
  for (let seg = 0; seg < n - 1; seg++) {
    const P0 = ext[seg]!;
    const P1 = ext[seg + 1]!;
    const P2 = ext[seg + 2]!;
    const P3 = ext[seg + 3]!;

    const t0 = 0;
    const t1 = t0 + Math.max(Math.pow(len(sub(P1, P0)), 0.5), 1e-4);
    const t2 = t1 + Math.max(Math.pow(len(sub(P2, P1)), 0.5), 1e-4);
    const t3 = t2 + Math.max(Math.pow(len(sub(P3, P2)), 0.5), 1e-4);

    for (let step = 0; step < perSegment; step++) {
      const t = t1 + (t2 - t1) * (step / perSegment);

      const A1 = lerpKnot(P0, P1, t0, t1, t);
      const A2 = lerpKnot(P1, P2, t1, t2, t);
      const A3 = lerpKnot(P2, P3, t2, t3, t);
      const B1 = lerpKnot(A1, A2, t0, t2, t);
      const B2 = lerpKnot(A2, A3, t1, t3, t);
      const C = lerpKnot(B1, B2, t1, t2, t);

      result.push(C);
    }
  }

  const last = points[n - 1]!;
  result.push({ x: last.x, y: last.y });

  return result;
}
