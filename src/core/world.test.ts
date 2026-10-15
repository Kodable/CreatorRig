import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD_W, MAX_WORLD_W, clampToWorld, isWideLevel, levelWorldW } from './world';
import { clonePoints, gapOpen } from './trackPoints';
import { samePoints } from './editRules';
import type { TrackPoint } from './types';

const H = 38.25;

describe('per-level world width (2026-10-15)', () => {
  it('a level without worldW is one screen, 60 m; worldW is kept within 60..180 m', () => {
    expect(DEFAULT_WORLD_W).toBe(60);
    expect(levelWorldW({})).toBe(60);
    expect(levelWorldW(undefined)).toBe(60);
    expect(levelWorldW({ worldW: 150 })).toBe(150);
    expect(levelWorldW({ worldW: 20 })).toBe(60);
    expect(levelWorldW({ worldW: 900 })).toBe(MAX_WORLD_W);
    expect(levelWorldW({ worldW: Number.NaN })).toBe(60);
    expect(isWideLevel({})).toBe(false);
    expect(isWideLevel({ worldW: 60 })).toBe(false);
    expect(isWideLevel({ worldW: 120 })).toBe(true);
  });

  it('points clamp to the level\'s own right edge, not 60 m', () => {
    expect(clampToWorld({ x: 100, y: 10 }, 'curve', 60, H)).toEqual({ x: 59.5, y: 10 });
    expect(clampToWorld({ x: 100, y: 10 }, 'curve', 150, H)).toEqual({ x: 100, y: 10 });
    expect(clampToWorld({ x: 200, y: 10 }, 'curve', 150, H)).toEqual({ x: 149.5, y: 10 });
    expect(clampToWorld({ x: -3, y: -1 }, 'curve', 150, H)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('a loop point stops two radii lower so the loop stays in the sky, at any width', () => {
    expect(clampToWorld({ x: 120, y: 40 }, 'loop', 150, H)).toEqual({ x: 120, y: H - 0.5 - 8 });
    expect(clampToWorld({ x: 120, y: 40 }, 'curve', 150, H)).toEqual({ x: 120, y: H - 0.5 });
  });
});

describe('open stretches between locked points (openAfter, 2026-10-15)', () => {
  const lock = (x: number, y: number, openAfter = false): TrackPoint => ({ x, y, kind: 'curve', locked: true, ...(openAfter ? { openAfter: true } : {}) });
  const c = (x: number, y: number): TrackPoint => ({ x, y, kind: 'curve' });

  it('two locked neighbours are closed unless the first is openAfter; any unlocked side is open', () => {
    expect(gapOpen([lock(0, 10), lock(10, 5)], 0)).toBe(false);
    expect(gapOpen([lock(0, 10, true), lock(10, 5)], 0)).toBe(true);
    expect(gapOpen([lock(0, 10), c(10, 5)], 0)).toBe(true);
    expect(gapOpen([c(0, 10), lock(10, 5)], 0)).toBe(true);
    // after the last point: appending is a separate rule
    expect(gapOpen([lock(0, 10)], 0)).toBe(true);
  });

  it('copies and comparisons keep the flag', () => {
    const pts = [lock(0, 10, true), lock(10, 5)];
    expect(clonePoints(pts)[0]!.openAfter).toBe(true);
    expect(clonePoints(pts)[1]!.openAfter).toBeUndefined();
    expect(samePoints(pts, clonePoints(pts))).toBe(true);
    expect(samePoints(pts, [lock(0, 10), lock(10, 5)])).toBe(false);
  });
});
