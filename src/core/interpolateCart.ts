// Render interpolation for the coaster's fuzz ("Fix Your Timestep"), the same fix the builder kit
// got for the rover (src/kit/interpolate.ts): the sim steps at a fixed 60 Hz and the display may
// run at 120 Hz (or drift), so a fuzz drawn at the latest step holds for a frame, then jumps. With
// the ride camera following it (2026-10-12), that hold-and-jump reads as flicker. The fuzz is drawn
// at prev + alpha * (cur - prev) instead, alpha = the stepper's fraction of the next tick.
import type { CartSnapshot, Vec2 } from './types';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

function lerpUnit(a: Vec2, b: Vec2, t: number): Vec2 {
  const x = lerp(a.x, b.x, t);
  const y = lerp(a.y, b.y, t);
  const len = Math.hypot(x, y);
  return len > 1e-9 ? { x: x / len, y: y / len } : b;
}

/** The pose between two snapshots. Discrete state (outcome, airborne) is `cur`'s; with no `prev`
 * (the first tick of a run) or alpha >= 1 it is `cur` itself, and alpha <= 0 draws `prev`'s pose
 * (one tick of latency, no jump). */
export function interpolateCart(prev: CartSnapshot | null, cur: CartSnapshot, alpha: number): CartSnapshot {
  if (!prev || alpha >= 1 || cur.outcome !== 'running') return cur;
  const t = Math.max(0, alpha);
  return {
    ...cur,
    s: lerp(prev.s, cur.s, t),
    v: lerp(prev.v, cur.v, t),
    pos: { x: lerp(prev.pos.x, cur.pos.x, t), y: lerp(prev.pos.y, cur.pos.y, t) },
    theta: lerpAngle(prev.theta, cur.theta, t),
    up: lerpUnit(prev.up, cur.up, t),
    gNormal: lerp(prev.gNormal, cur.gNormal, t),
    time: lerp(prev.time, cur.time, t),
  };
}
