import type { Level, PointKind, Vec2 } from './types';
import { LOOP_RADIUS } from './trackPoints';

/**
 * Per-level world width (2026-10-15, Gao: "levels where you can scroll, it feels quite short of a
 * coaster if you can't"). A level may declare `worldW` (meters); the default is one screen, 60 m.
 * Pure: the scene clamps dragged and added points with `clampToWorld`, the camera clamps to the
 * same width (src/game/rideCamera.ts), and levels.test.ts checks every recorded solution against
 * it. Nothing in the sim depends on the width: the run ends on the rail (end, roll back, stuck, a
 * fall off an upside-down stretch), never at a world edge.
 */

/** One screen: the world panel's 960 px at 16 px per meter. */
export const DEFAULT_WORLD_W = 60;
/** The widest world a level may ask for (about three screens). */
export const MAX_WORLD_W = 180;
/** Points stay this far (m) inside the world's edges. */
export const POINT_EDGE = 0.5;

/** The level's world width in meters: `worldW`, kept within one screen .. MAX_WORLD_W. */
export function levelWorldW(level: Pick<Level, 'worldW'> | null | undefined): number {
  const w = level?.worldW;
  if (w === undefined || !Number.isFinite(w)) return DEFAULT_WORLD_W;
  return Math.max(DEFAULT_WORLD_W, Math.min(MAX_WORLD_W, w));
}

/** The level is wider than one screen: its edit view scrolls. */
export function isWideLevel(level: Pick<Level, 'worldW'> | null | undefined): boolean {
  return levelWorldW(level) > DEFAULT_WORLD_W + 1e-9;
}

/** Where a point of `kind` dragged or tapped at `p` may go in a world `worldW` x `worldH`: inside
 * the edges by POINT_EDGE, and a loop point (the loop's bottom) low enough that the whole loop
 * (two radii tall) stays in the sky. */
export function clampToWorld(p: Vec2, kind: PointKind, worldW: number, worldH: number): Vec2 {
  const yMax = worldH - POINT_EDGE - (kind === 'loop' ? 2 * LOOP_RADIUS : 0);
  return {
    x: Math.max(POINT_EDGE, Math.min(worldW - POINT_EDGE, p.x)),
    y: Math.max(POINT_EDGE, Math.min(yMax, p.y)),
  };
}
