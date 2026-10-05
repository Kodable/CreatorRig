import { describe, it, expect } from 'vitest';
import { sampleCatmullRom } from './spline';
import type { Vec2 } from './types';

function containsPointWithin(points: Vec2[], target: Vec2, eps: number): boolean {
  return points.some((p) => Math.abs(p.x - target.x) < eps && Math.abs(p.y - target.y) < eps);
}

describe('sampleCatmullRom', () => {
  it('contains every control point for a 5-point zigzag', () => {
    const controls: Vec2[] = [
      { x: 0, y: 0 },
      { x: 5, y: 10 },
      { x: 10, y: 0 },
      { x: 15, y: 10 },
      { x: 20, y: 0 },
    ];
    const out = sampleCatmullRom(controls);
    for (const c of controls) {
      expect(containsPointWithin(out, c, 1e-9)).toBe(true);
    }
  });

  it('produces no NaN when two consecutive control points are coincident', () => {
    const controls: Vec2[] = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ];
    const out = sampleCatmullRom(controls);
    for (const p of out) {
      expect(Number.isNaN(p.x)).toBe(false);
      expect(Number.isNaN(p.y)).toBe(false);
    }
  });

  it('returns [] for 0 points', () => {
    expect(sampleCatmullRom([])).toEqual([]);
  });

  it('returns [that point] for 1 point', () => {
    const p = { x: 3, y: 4 };
    expect(sampleCatmullRom([p])).toEqual([p]);
  });
});
