import { describe, expect, it } from 'vitest';
import {
  dotsAlong,
  flightPath,
  PREVIEW_CORE_R,
  PREVIEW_DT,
  PREVIEW_MAX_T,
  PREVIEW_RIM_R,
  PREVIEW_SPACING,
  previewAlpha,
  distanceFade,
  PREVIEW_FADE_M,
  PREVIEW_FULL_M,
  previewOverlay,
} from './preview';
import type { Vec2 } from '../../../kit/types';

/** A cast against the ground (y = 0) and, optionally, a wall face at x = `wallX`. */
function groundAndWall(wallX = Infinity) {
  return (a: Vec2, b: Vec2): number | null => {
    let best: number | null = null;
    if (b.y < 0 && a.y >= 0) best = a.y / (a.y - b.y);
    if (b.x >= wallX && a.x < wallX) {
      const f = (wallX - a.x) / (b.x - a.x);
      if (best === null || f < best) best = f;
    }
    return best;
  };
}

describe('the shot preview: the flight path', () => {
  it('follows the ballistic arc from the release point and stops exactly where it first touches the ground', () => {
    const tip = { x: 4, y: 2 };
    const v = { x: 8, y: 6 };
    const path = flightPath(tip, v, -10, groundAndWall());
    expect(path[0]).toEqual(tip);
    // Every sampled point (but the last, the hit) lies on the parabola at its own time.
    path.slice(1, -1).forEach((p, i) => {
      const t = (i + 1) * PREVIEW_DT;
      expect(p.x).toBeCloseTo(tip.x + v.x * t, 9);
      expect(p.y).toBeCloseTo(tip.y + v.y * t - 5 * t * t, 9);
    });
    const end = path.at(-1)!;
    expect(end.y).toBeCloseTo(0, 9);
    // Lands where the parabola meets y = 0 (t = (6 + sqrt(36 + 40)) / 10), up to the chord's sag.
    const tLand = (6 + Math.sqrt(76)) / 10;
    expect(end.x).toBeCloseTo(tip.x + v.x * tLand, 1);
  });

  it('stops at the first thing in the way (a wall), not at the ground beyond it', () => {
    const path = flightPath({ x: 4, y: 2 }, { x: 8, y: 6 }, -10, groundAndWall(9));
    const end = path.at(-1)!;
    expect(end.x).toBeCloseTo(9, 9);
    expect(end.y).toBeGreaterThan(0);
    expect(path.every((p) => p.x <= 9 + 1e-9)).toBe(true);
  });

  it('gives up after PREVIEW_MAX_T when nothing is hit', () => {
    const path = flightPath({ x: 0, y: 0 }, { x: 1, y: 100 }, -10, () => null);
    expect(path).toHaveLength(Math.round(PREVIEW_MAX_T / PREVIEW_DT) + 1);
  });
});

describe('the shot preview: dots', () => {
  it('lays a dot at the start and then every PREVIEW_SPACING metres of arc, across sample boundaries', () => {
    const path = [{ x: 0, y: 0 }, { x: 0.3, y: 0 }, { x: 0.3, y: 0.3 }, { x: 0.3, y: 2 }];
    const dots = dotsAlong(path);
    expect(dots[0]).toEqual({ x: 0, y: 0 });
    // The second dot turns the corner: 0.3 along x, then 0.15 up.
    expect(dots[1]!.x).toBeCloseTo(0.3, 9);
    expect(dots[1]!.y).toBeCloseTo(PREVIEW_SPACING - 0.3, 9);
    // Total length 2.3 m: a dot at 0, 0.45, ..., 2.25.
    expect(dots).toHaveLength(Math.floor(2.3 / PREVIEW_SPACING) + 1);
    for (let i = 2; i < dots.length; i++) expect(dots[i]!.y - dots[i - 1]!.y).toBeCloseTo(PREVIEW_SPACING, 9);
  });

  it('evenly spaced along a real arc (each gap one spacing as the chord of a short arc)', () => {
    const dots = dotsAlong(flightPath({ x: 4, y: 2 }, { x: 8, y: 6 }, -10, groundAndWall()));
    expect(dots.length).toBeGreaterThan(10);
    for (let i = 1; i < dots.length; i++) {
      const gap = Math.hypot(dots[i]!.x - dots[i - 1]!.x, dots[i]!.y - dots[i - 1]!.y);
      expect(gap).toBeGreaterThan(PREVIEW_SPACING * 0.98);
      expect(gap).toBeLessThanOrEqual(PREVIEW_SPACING + 1e-9);
    }
    expect(dotsAlong([])).toEqual([]);
  });
});

describe('the shot preview: the fade', () => {
  it('full strength from the moment it is shown until FIRE hides it; nothing before it is shown (2026-10-15: no fade)', () => {
    expect(previewAlpha(0)).toBe(1);
    expect(previewAlpha(1.5)).toBe(1);
    expect(previewAlpha(600)).toBe(1);
    expect(previewAlpha(-1)).toBe(0);
    expect(previewAlpha(Infinity)).toBe(0);
    expect(previewAlpha(NaN)).toBe(0);
  });

  it('overlay: a dark rim then a white core per dot, screen-sized, both at the fade; nothing once faded', () => {
    const dots = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
    const items = previewOverlay(dots, 0.5);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ kind: 'dot', p: dots[0], r: PREVIEW_RIM_R, screen: true });
    expect(items[1]).toMatchObject({ kind: 'dot', p: dots[0], r: PREVIEW_CORE_R, color: 0xffffff, screen: true });
    expect((items[1] as { alpha: number }).alpha).toBeCloseTo(0.95 * 0.5, 9);
    expect(previewOverlay(dots, 0)).toEqual([]);
  });
});

describe('the shot preview: fading along the arc (2026-10-15)', () => {
  it('full for the first PREVIEW_FULL_M metres, then linear to nothing over PREVIEW_FADE_M', () => {
    expect(distanceFade(0)).toBe(1);
    expect(distanceFade(PREVIEW_FULL_M)).toBe(1);
    expect(distanceFade(PREVIEW_FULL_M + PREVIEW_FADE_M / 2)).toBeCloseTo(0.5, 9);
    expect(distanceFade(PREVIEW_FULL_M + PREVIEW_FADE_M)).toBe(0);
    expect(distanceFade(50)).toBe(0);
  });

  it('the overlay dims the dots by their distance along the arc, and keeps the faded tail', () => {
    const dots = Array.from({ length: 30 }, (_, i) => ({ x: i * PREVIEW_SPACING, y: 1 }));
    const cores = previewOverlay(dots, 1).filter((o) => o.kind === 'dot' && o.color === 0xffffff) as { alpha: number }[];
    expect(cores).toHaveLength(30);
    expect(cores[0]!.alpha).toBeCloseTo(0.95, 9);
    const at = (m: number) => cores[Math.round(m / PREVIEW_SPACING)]!.alpha;
    expect(at(PREVIEW_FULL_M + PREVIEW_FADE_M / 2)).toBeLessThan(0.6);
    expect(cores.at(-1)!.alpha).toBe(0);
  });
});
