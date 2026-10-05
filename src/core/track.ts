import type { Vec2, Track, TrackSample, LoopSpan } from './types';
import { DS } from './types';
import { sub, dist, normalize, cross, wrapAngle } from './vec';
import { sampleCatmullRom } from './spline';

export const KAPPA_MAX = 1 / 1.5;
/** Half-width of the curvature smoothing window, in samples (10 samples = 1 m). */
export const KAPPA_SMOOTH_HALF = 10;

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

function lerpVec(a: Vec2, b: Vec2, f: number): Vec2 {
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) };
}

/** Resample a polyline at uniform arc-length spacing DS, with a final sample
 * forced to land exactly at the polyline's total length. */
function resamplePolyline(poly: Vec2[]): { s: number[]; pos: Vec2[]; length: number } {
  const n = poly.length;
  // cumulative arc length along the raw polyline
  const cum: number[] = new Array(n);
  cum[0] = 0;
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1]! + dist(poly[i - 1]!, poly[i]!);
  }
  const L = cum[n - 1]!;

  const sOut: number[] = [];
  const posOut: Vec2[] = [];

  const count = Math.floor(L / DS);

  let segIdx = 0;
  const sampleAt = (s: number): Vec2 => {
    if (n === 1) return { x: poly[0]!.x, y: poly[0]!.y };
    while (segIdx < n - 2 && cum[segIdx + 1]! < s) segIdx++;
    const a = poly[segIdx]!;
    const b = poly[segIdx + 1]!;
    const segLen = cum[segIdx + 1]! - cum[segIdx]!;
    const f = segLen > 1e-12 ? (s - cum[segIdx]!) / segLen : 0;
    return lerpVec(a, b, f);
  };

  for (let k = 0; k <= count; k++) {
    const s = k * DS;
    sOut.push(s);
    posOut.push(sampleAt(s));
  }
  if (L - count * DS > 1e-9) {
    sOut.push(L);
    posOut.push(sampleAt(L));
  }

  return { s: sOut, pos: posOut, length: L };
}

export function findLoops(samples: readonly TrackSample[]): LoopSpan[] {
  const m = samples.length;
  if (m < 2) return [];

  const theta: number[] = new Array(m);
  for (let i = 0; i < m; i++) {
    theta[i] = Math.atan2(samples[i]!.tangent.y, samples[i]!.tangent.x);
  }

  const W: number[] = new Array(m);
  W[0] = 0;
  for (let i = 1; i < m; i++) {
    W[i] = W[i - 1]! + wrapAngle(theta[i]! - theta[i - 1]!);
  }

  // Coarse indices: every 5th sample, always including the last sample.
  const coarseIdx: number[] = [];
  for (let i = 0; i < m; i += 5) coarseIdx.push(i);
  if (coarseIdx[coarseIdx.length - 1] !== m - 1) coarseIdx.push(m - 1);

  const nc = coarseIdx.length;
  if (nc < 4) return [];

  const spans: LoopSpan[] = [];

  const segIntersect = (p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean => {
    const d1 = cross(sub(p4, p3), sub(p1, p3));
    const d2 = cross(sub(p4, p3), sub(p2, p3));
    const d3 = cross(sub(p2, p1), sub(p3, p1));
    const d4 = cross(sub(p2, p1), sub(p4, p1));
    return (
      ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    );
  };

  for (let k1 = 0; k1 < nc - 1; k1++) {
    for (let k2 = k1 + 2; k2 < nc - 1; k2++) {
      const iA = coarseIdx[k1]!;
      const iB = coarseIdx[k1 + 1]!;
      const jA = coarseIdx[k2]!;
      const jB = coarseIdx[k2 + 1]!;

      const p1 = samples[iA]!.pos;
      const p2 = samples[iB]!.pos;
      const p3 = samples[jA]!.pos;
      const p4 = samples[jB]!.pos;

      if (!segIntersect(p1, p2, p3, p4)) continue;

      const i = iA;
      const j = jA;
      if (Math.abs(W[j]! - W[i]!) >= 1.5 * Math.PI) {
        spans.push({ entryS: samples[i]!.s, exitS: samples[j]!.s });
      }
    }
  }

  spans.sort((a, b) => a.entryS - b.entryS);

  const merged: LoopSpan[] = [];
  for (const span of spans) {
    const lastMerged = merged[merged.length - 1];
    if (lastMerged !== undefined && span.entryS <= lastMerged.exitS) {
      if (span.exitS > lastMerged.exitS) lastMerged.exitS = span.exitS;
    } else {
      merged.push({ entryS: span.entryS, exitS: span.exitS });
    }
  }

  return merged;
}

export function buildTrack(points: Vec2[]): Track | null {
  if (points.length < 2) return null;

  const raw = sampleCatmullRom(points);
  const { s, pos, length } = resamplePolyline(raw);
  const m = s.length;

  const tangent: Vec2[] = new Array(m);
  for (let i = 0; i < m; i++) {
    if (m === 1) {
      tangent[i] = { x: 1, y: 0 };
    } else if (i === 0) {
      tangent[i] = normalize(sub(pos[1]!, pos[0]!));
    } else if (i === m - 1) {
      tangent[i] = normalize(sub(pos[m - 1]!, pos[m - 2]!));
    } else {
      tangent[i] = normalize(sub(pos[i + 1]!, pos[i - 1]!));
    }
  }

  const theta: number[] = new Array(m);
  for (let i = 0; i < m; i++) {
    theta[i] = Math.atan2(tangent[i]!.y, tangent[i]!.x);
  }

  const kappaRaw: number[] = new Array(m);
  for (let i = 0; i < m; i++) {
    if (m === 1) {
      kappaRaw[i] = 0;
    } else if (i === 0) {
      const ds = s[1]! - s[0]!;
      kappaRaw[i] = ds > 1e-12 ? wrapAngle(theta[1]! - theta[0]!) / ds : 0;
    } else if (i === m - 1) {
      const ds = s[m - 1]! - s[m - 2]!;
      kappaRaw[i] = ds > 1e-12 ? wrapAngle(theta[m - 1]! - theta[m - 2]!) / ds : 0;
    } else {
      const ds = s[i + 1]! - s[i - 1]!;
      kappaRaw[i] = ds > 1e-12 ? wrapAngle(theta[i + 1]! - theta[i - 1]!) / ds : 0;
    }
    kappaRaw[i] = Math.max(-KAPPA_MAX, Math.min(KAPPA_MAX, kappaRaw[i]!));
  }

  // Box-smooth the curvature over +-KAPPA_SMOOTH_HALF samples (1 m each side). A Catmull-Rom
  // curve is only C1, so raw curvature spikes at every control point; the rider feels the
  // average over about a cart length, and that is what the intense-o-meter should show.
  const kappa: number[] = new Array(m);
  for (let i = 0; i < m; i++) {
    const lo = Math.max(0, i - KAPPA_SMOOTH_HALF);
    const hi = Math.min(m - 1, i + KAPPA_SMOOTH_HALF);
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += kappaRaw[k]!;
    kappa[i] = sum / (hi - lo + 1);
  }

  const dyds: number[] = new Array(m);
  for (let i = 0; i < m - 1; i++) {
    const ds = s[i + 1]! - s[i]!;
    dyds[i] = ds > 1e-12 ? (pos[i + 1]!.y - pos[i]!.y) / ds : 0;
  }
  dyds[m - 1] = m >= 2 ? dyds[m - 2]! : 0;

  const samples: TrackSample[] = new Array(m);
  for (let i = 0; i < m; i++) {
    samples[i] = {
      pos: pos[i]!,
      s: s[i]!,
      tangent: tangent[i]!,
      kappa: kappa[i]!,
      dyds: dyds[i]!,
    };
  }

  // maxDrop: suffix minimum of y
  let maxDrop = 0;
  if (m > 0) {
    let suffixMin = pos[m - 1]!.y;
    for (let i = m - 1; i >= 0; i--) {
      const y = pos[i]!.y;
      if (y < suffixMin) suffixMin = y;
      const drop = y - suffixMin;
      if (drop > maxDrop) maxDrop = drop;
    }
  }

  const loops = findLoops(samples);

  const lookup = (sQuery: number): TrackSample => {
    const clamped = Math.max(0, Math.min(length, sQuery));
    if (m === 1) {
      const only = samples[0]!;
      return { pos: only.pos, s: clamped, tangent: only.tangent, kappa: only.kappa, dyds: only.dyds };
    }
    let i = Math.floor(clamped / DS);
    if (i > m - 2) i = m - 2;
    if (i < 0) i = 0;
    const a = samples[i]!;
    const b = samples[i + 1]!;
    const segLen = b.s - a.s;
    let f = segLen > 1e-12 ? (clamped - a.s) / segLen : 0;
    if (f < 0) f = 0;
    if (f > 1) f = 1;

    const lerpedPos = lerpVec(a.pos, b.pos, f);
    const lerpedKappa = lerp(a.kappa, b.kappa, f);
    const lerpedTangent = normalize(lerpVec(a.tangent, b.tangent, f));

    return {
      pos: lerpedPos,
      s: clamped,
      tangent: lerpedTangent,
      kappa: lerpedKappa,
      dyds: a.dyds,
    };
  };

  return {
    length,
    samples,
    maxDrop,
    loops,
    lookup,
  };
}
