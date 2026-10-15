/**
 * Track-building juice (2026-10-15, Jon: "the placement needs a lot more juice ... when you're
 * laying out the tracks, it should feel fun"; Gao: "each segment drops down and then the beams come
 * up"). Pure: how far each part of the drawn rail is revealed, how far it is lifted above its place,
 * how high each support beam has risen and how big each point handle is, at a moment `now` (ms), from
 * a short list of animations. CoasterScene keeps the list, redraws the track from these numbers while
 * any animation runs, and drops the finished ones. Cosmetic only: the track data changes at once; only
 * the drawing catches up.
 *
 * Animations name control points by index (a segment is point i to point i + 1), resolved to arc
 * length on the current track through `knotS` (the s of each control point, `knotArcLengths`), so a
 * point dragged right after it was added keeps its animation.
 */
import type { Vec2 } from './types';

export type BuildAnim =
  /** A point appended at the end: the rail grows from point `from` to the end and swings down into
   * place (hinged at `from`), then the beams under it rise. */
  | { kind: 'extend'; from: number; t0: number }
  /** Points a..b drop into place (an inserted point, a: its left neighbour, peak: it, b: its right
   * neighbour; or the segment a merged rail after a delete), then their beams rise. */
  | { kind: 'drop'; a: number; peak: number; b: number; px: number; t0: number }
  /** A moved point let go: the rail around it and its handle wobble and settle. */
  | { kind: 'wobble'; a: number; peak: number; b: number; t0: number }
  /** A new point's handle pops in. */
  | { kind: 'pop'; index: number; t0: number }
  /** The level's preset builds in from the station: the rail draws along, each stretch dropping into
   * place as it appears, the handles pop as the rail reaches them, the beams rise behind it. A t0 of
   * Infinity holds the track hidden (behind Bruno's intro) until `build` starts it. */
  | { kind: 'build'; t0: number };

// ---- timings (ms) and sizes (stage px) ----
/** An appended segment draws out over EXTEND_MS (ease-out) and drops EXTEND_DROP_PX into place. */
export const EXTEND_MS = 240;
export const EXTEND_DROP_PX = 16;
/** A drop lands with a little overshoot (Back.out) over DROP_MS. */
export const DROP_MS = 320;
export const INSERT_DROP_PX = 10;
/** Beams start rising BEAM_DELAY after the segment appears, spread over BEAM_STAGGER along it,
 * each over BEAM_MS (Back.out), with a dust puff at the foot. */
export const BEAM_DELAY = 130;
export const BEAM_STAGGER = 90;
export const BEAM_MS = 210;
/** A new handle pops over POP_MS. */
export const POP_MS = 260;
/** The release wobble. */
export const WOBBLE_MS = 420;
export const WOBBLE_PX = 4;
const WOBBLE_PERIOD_MS = 150;
const WOBBLE_TAU_MS = 120;
/** The preset build-in: the rail draws from the station to the end over BUILD_RAIL_MS (linear),
 * each stretch dropping BUILD_DROP_PX over BUILD_DROP_MS as it appears; a beam rises BUILD_BEAM_LAG
 * after the rail passes it. About 0.6 s in all. */
export const BUILD_RAIL_MS = 380;
export const BUILD_DROP_PX = 12;
export const BUILD_DROP_MS = 220;
export const BUILD_BEAM_LAG = 20;
/** Delete: the removed tail retracts over RETRACT_MS; a removed middle stretch sinks and fades over
 * SINK_MS; their beams sink back into the ground over GHOST_BEAM_MS, staggered by GHOST_STAGGER. */
export const RETRACT_MS = 220;
export const SINK_MS = 260;
export const SINK_PX = 10;
export const GHOST_BEAM_MS = 180;
export const GHOST_STAGGER = 60;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
export const easeOutCubic = (p: number): number => 1 - Math.pow(1 - p, 3);
const easeInOutQuad = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));
/** Phaser's Back.easeOut (overshoot 1.70158): 0 -> about 1.1 -> 1. */
export function backOut(p: number): number {
  const s = 1.70158;
  const q = p - 1;
  return q * q * ((s + 1) * q + s) + 1;
}

/** The s (m) of each control point on the track: the nearest sample, searching forward from the
 * previous point's, so a rail that doubles back still finds its points in order. */
export function knotArcLengths(samples: readonly { s: number; pos: Vec2 }[], points: readonly Vec2[]): number[] {
  const out: number[] = [];
  let from = 0;
  for (const p of points) {
    let best = from;
    let bestD = Infinity;
    for (let i = from; i < samples.length; i++) {
      const q = samples[i]!.pos;
      const d = (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    out.push(samples[best]?.s ?? 0);
    from = best;
  }
  return out;
}

/** The s of control point i, clamped into the track (0 / len past either end). A fractional i lies
 * between two points (2.5: halfway from point 2 to point 3 along the rail). */
export function knot(knotS: readonly number[], i: number, len: number): number {
  if (i <= 0) return i < 0 || knotS.length === 0 ? 0 : knotS[0]!;
  if (i >= knotS.length - 1) return i > knotS.length - 1 ? len : knotS[knotS.length - 1]!;
  const lo = Math.floor(i);
  const f = i - lo;
  return knotS[lo]! + (knotS[lo + 1]! - knotS[lo]!) * f;
}

/** 0 at sA, 1 at sPeak, 0 at sB, smooth (a sine bump on each side). */
function bump(s: number, sA: number, sPeak: number, sB: number): number {
  if (s < sA || s > sB) return 0;
  if (s <= sPeak) return sPeak - sA < 1e-6 ? 1 : Math.sin((Math.PI / 2) * ((s - sA) / (sPeak - sA)));
  return sB - sPeak < 1e-6 ? 1 : Math.sin((Math.PI / 2) * ((sB - s) / (sB - sPeak)));
}

/** How long an animation runs (ms); Infinity for a held build. */
export function animDuration(a: BuildAnim): number {
  switch (a.kind) {
    case 'extend': return Math.max(EXTEND_MS, DROP_MS, BEAM_DELAY + BEAM_STAGGER + BEAM_MS);
    case 'drop': return Math.max(DROP_MS, BEAM_DELAY + BEAM_STAGGER + BEAM_MS);
    case 'wobble': return WOBBLE_MS;
    case 'pop': return POP_MS;
    case 'build': return BUILD_RAIL_MS + Math.max(BUILD_DROP_MS, BUILD_BEAM_LAG + BEAM_MS, POP_MS);
  }
}

/** The preset build-in's total length (ms). */
export const BUILD_TOTAL_MS = animDuration({ kind: 'build', t0: 0 });

export function animDone(a: BuildAnim, now: number): boolean {
  return Number.isFinite(a.t0) && now >= a.t0 + animDuration(a);
}

/** How much of the rail is drawn: everything up to this s (m). */
export function railReveal(anims: readonly BuildAnim[], knotS: readonly number[], len: number, now: number): number {
  let reveal = len;
  for (const a of anims) {
    if (a.kind === 'extend') {
      const s0 = knot(knotS, a.from, len);
      reveal = Math.min(reveal, s0 + (len - s0) * easeOutCubic(clamp01((now - a.t0) / EXTEND_MS)));
    } else if (a.kind === 'build') {
      reveal = Math.min(reveal, Number.isFinite(a.t0) ? len * clamp01((now - a.t0) / BUILD_RAIL_MS) : 0);
    }
  }
  return reveal;
}

/** How far the rail at s is drawn above its place (stage px, negative = up the screen). */
export function railOffset(anims: readonly BuildAnim[], knotS: readonly number[], len: number, s: number, now: number): number {
  let off = 0;
  for (const a of anims) {
    const t = now - a.t0;
    if (!(t >= 0)) continue;
    if (a.kind === 'extend') {
      const s0 = knot(knotS, a.from, len);
      const w = bump(s, s0, len, len);
      if (w > 0) off -= EXTEND_DROP_PX * (1 - backOut(clamp01(t / DROP_MS))) * w;
    } else if (a.kind === 'drop') {
      const w = bump(s, knot(knotS, a.a, len), knot(knotS, a.peak, len), knot(knotS, a.b, len));
      if (w > 0) off -= a.px * (1 - backOut(clamp01(t / DROP_MS))) * w;
    } else if (a.kind === 'wobble') {
      if (t >= WOBBLE_MS) continue;
      const w = bump(s, knot(knotS, a.a, len), knot(knotS, a.peak, len), knot(knotS, a.b, len));
      if (w > 0) off += WOBBLE_PX * Math.sin((2 * Math.PI * t) / WOBBLE_PERIOD_MS) * Math.exp(-t / WOBBLE_TAU_MS) * w;
    } else if (a.kind === 'build') {
      const local = (t - (len > 0 ? (BUILD_RAIL_MS * s) / len : 0)) / BUILD_DROP_MS;
      off -= BUILD_DROP_PX * (1 - backOut(clamp01(local)));
    }
  }
  return off;
}

/** When the beam at s starts rising in animation `a` (ms after a.t0), or null when `a` leaves that
 * beam alone. The scene puffs dust at its foot then. */
export function beamDelay(a: BuildAnim, knotS: readonly number[], len: number, s: number): number | null {
  if (a.kind === 'extend') {
    const s0 = knot(knotS, a.from, len);
    if (s < s0 - 1e-6) return null;
    const u = len - s0 > 1e-6 ? (s - s0) / (len - s0) : 0;
    return BEAM_DELAY + BEAM_STAGGER * clamp01(u);
  }
  if (a.kind === 'drop') {
    const sA = knot(knotS, a.a, len);
    const sB = knot(knotS, a.b, len);
    if (s < sA - 1e-6 || s > sB + 1e-6) return null;
    const u = sB - sA > 1e-6 ? (s - sA) / (sB - sA) : 0;
    return BEAM_DELAY + BEAM_STAGGER * clamp01(u);
  }
  if (a.kind === 'build') return (len > 0 ? (BUILD_RAIL_MS * s) / len : 0) + BUILD_BEAM_LAG;
  return null;
}

/** How high the beam at s stands (0 = not yet out of the ground, 1 = full; overshoots a hair). */
export function beamRise(anims: readonly BuildAnim[], knotS: readonly number[], len: number, s: number, now: number): number {
  let rise = 1;
  for (const a of anims) {
    if (a.kind === 'build' && !Number.isFinite(a.t0)) return 0;
    const d = beamDelay(a, knotS, len, s);
    if (d === null) continue;
    const p = clamp01((now - a.t0 - d) / BEAM_MS);
    rise = Math.min(rise, p <= 0 ? 0 : backOut(p));
  }
  return rise;
}

/** The handle of control point i: its scale (0 = not shown yet, 1 = full size). */
export function pointScale(anims: readonly BuildAnim[], knotS: readonly number[], len: number, i: number, now: number): number {
  let k = 1;
  for (const a of anims) {
    const t = now - a.t0;
    if (a.kind === 'pop' && a.index === i) {
      k *= t <= 0 ? 0 : backOut(clamp01(t / POP_MS));
    } else if (a.kind === 'build') {
      if (!Number.isFinite(a.t0)) return 0;
      const start = len > 0 ? (BUILD_RAIL_MS * knot(knotS, i, len)) / len : 0;
      const p = clamp01((t - start) / POP_MS);
      k *= p <= 0 ? 0 : backOut(p);
    } else if (a.kind === 'wobble' && a.peak === i && t >= 0 && t < WOBBLE_MS) {
      k *= 1 + 0.18 * Math.sin((2 * Math.PI * t) / WOBBLE_PERIOD_MS + Math.PI / 2) * Math.exp(-t / WOBBLE_TAU_MS);
    }
  }
  return k;
}

/** A removed tail (the last point deleted): the fraction of it still drawn, `t` ms after. */
export function ghostRetract(t: number): number {
  return 1 - easeInOutQuad(clamp01(t / RETRACT_MS));
}

/** A removed middle stretch: its opacity and how far it has sunk (stage px, down), `t` ms after. */
export function ghostSink(t: number): { alpha: number; offsetPx: number } {
  const p = clamp01(t / SINK_MS);
  return { alpha: 1 - p, offsetPx: SINK_PX * p * p };
}

/** A removed beam (u: 0..1 along the removed stretch): how high it still stands, `t` ms after. */
export function ghostBeam(t: number, u: number): number {
  const p = clamp01((t - GHOST_STAGGER * clamp01(u)) / GHOST_BEAM_MS);
  return 1 - p * p;
}

/** The ghosts' total length (ms). */
export const GHOST_MS = Math.max(RETRACT_MS, SINK_MS, GHOST_STAGGER + GHOST_BEAM_MS);
