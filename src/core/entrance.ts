/**
 * The coaster's entrance (2026-10-15, Jon: "I want to have something where like the fuzz like jumps
 * into the roller coaster ... like here I go"; Gao: "instead of just snapping onto the track: we zoom
 * in, it jumps onto the track, and then it rolls"). Pure: the fuzz's pose over time as it leaves the
 * station deck and lands on the start of the rail. On Play the App waits ENTRANCE_MS (a tap skips)
 * before the sim takes its first step; CoasterScene draws this pose meanwhile and the ride camera
 * zooms in on it. The sim, the metrics and every level solution are unchanged: the ride just starts
 * a second later.
 *
 * Coordinates are stage px (y down). `from` is the waiting fuzz's centre on the deck, `to` the
 * rolling fuzz's centre at s = 0 (the rail start plus a fuzz radius along the seat normal).
 */
import type { Vec2 } from './types';

/** Crouch on the deck (squash down, feet planted). */
export const CROUCH_MS = 220;
/** The hop: an arc up and onto the rail with one forward spin, stretched at take-off and touch-down. */
export const HOP_MS = 440;
/** The landing squish on the rail, springing back. */
export const LAND_MS = 200;
/** A beat on the rail before it rolls ("here I go"). */
export const SETTLE_MS = 140;
/** The whole entrance; the sim starts when it is over. */
export const ENTRANCE_MS = CROUCH_MS + HOP_MS + LAND_MS + SETTLE_MS;

/** How high the arc's apex rises over the midpoint of the straight line between its ends (stage px). */
export const HOP_ARC_PX = 46;

export type EntrancePhase = 'crouch' | 'hop' | 'land' | 'settle' | 'done';

export interface EntrancePose {
  phase: EntrancePhase;
  /** The fuzz's centre (stage px). */
  x: number;
  y: number;
  /** Scale along the fuzz's own up (sy) and across it (sx); 1 = round. */
  sx: number;
  sy: number;
  /** Turns of forward spin so far (0..1: one full turn over the hop, so it lands as it rolls off). */
  spin: number;
  /** 0 on the deck (upright) .. 1 on the rail (lined up with the rail's slope). */
  tilt: number;
  /** The excited face (in the air, "here I go"). */
  excited: boolean;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const easeOutQuad = (p: number): number => 1 - (1 - p) * (1 - p);
const easeInOutQuad = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));

export function entrancePhase(t: number): EntrancePhase {
  if (t < CROUCH_MS) return 'crouch';
  if (t < CROUCH_MS + HOP_MS) return 'hop';
  if (t < CROUCH_MS + HOP_MS + LAND_MS) return 'land';
  if (t < ENTRANCE_MS) return 'settle';
  return 'done';
}

/**
 * The pose `t` ms into the entrance. `radiusPx` is the fuzz's radius: a squash keeps its feet on
 * the deck (the crouch) or on the rail (the landing), so the centre drops by (1 - sy) radii.
 * `railUp` is the seat normal at the rail start, in stage px (unit; (0, -1) on flat rail).
 */
export function entrancePose(t: number, from: Vec2, to: Vec2, radiusPx: number, railUp: Vec2 = { x: 0, y: -1 }): EntrancePose {
  const phase = entrancePhase(t);
  if (phase === 'crouch') {
    const e = easeOutQuad(clamp01(t / CROUCH_MS));
    const sy = 1 - 0.3 * e;
    return { phase, x: from.x, y: from.y + (1 - sy) * radiusPx, sx: 1 + 0.24 * e, sy, spin: 0, tilt: 0, excited: false };
  }
  if (phase === 'hop') {
    const p = clamp01((t - CROUCH_MS) / HOP_MS);
    // A parabola from `from` (p = 0) to `to` (p = 1), HOP_ARC_PX over the straight line at the middle.
    const x = from.x + (to.x - from.x) * p;
    const lineY = from.y + (to.y - from.y) * p;
    const lift = HOP_ARC_PX * 4 * p * (1 - p);
    // Stretched along the flight at take-off and touch-down, round at the apex.
    const stretch = 0.22 * Math.pow(Math.abs(1 - 2 * p), 1.5);
    const sy = 1 + stretch;
    return { phase, x, y: lineY - lift, sx: 1 / sy, sy, spin: easeInOutQuad(p), tilt: easeInOutQuad(p), excited: true };
  }
  if (phase === 'land' || phase === 'settle') {
    const p = phase === 'land' ? clamp01((t - CROUCH_MS - HOP_MS) / LAND_MS) : 1;
    // A damped squish: flat on impact, springing back with a hair of overshoot.
    const sy = phase === 'land' ? 1 - 0.3 * Math.exp(-4 * p) * Math.cos(3 * Math.PI * p) : 1;
    const drop = (1 - sy) * radiusPx;
    return { phase, x: to.x - railUp.x * drop, y: to.y - railUp.y * drop, sx: 1 / sy, sy, spin: 1, tilt: 1, excited: phase === 'land' };
  }
  return { phase, x: to.x, y: to.y, sx: 1, sy: 1, spin: 1, tilt: 1, excited: false };
}
