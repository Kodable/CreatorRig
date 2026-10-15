import { describe, expect, it } from 'vitest';
import {
  DRIFT_WRAP_MARGIN,
  PARALLAX,
  backgroundUrls,
  driftX,
  isMovingBackground,
  layoutBackground,
  parallaxShift,
  satellitePoses,
} from './parallax';
import { clampFrame, fullFrame, viewWidth, type WorldDims } from './camera';
import { FULL_FRAME, frameCentrePx, parallaxOffset, rideTarget } from '../game/rideCamera';
import type { BackgroundLayer } from './types';

describe('parallaxShift (the one parallax rule, shared with the coaster)', () => {
  it('is 0 at the rest view, (1 - f) of the camera travel otherwise, per axis', () => {
    expect(parallaxShift({ x: 3, y: 4 }, { x: 3, y: 4 }, 0.3)).toEqual({ x: 0, y: 0 });
    const s = parallaxShift({ x: 10, y: 2 }, { x: 15, y: 8 }, 0.25, 1);
    expect(s.x).toBeCloseTo(-5 * 0.75, 12);
    expect(s.y).toBeCloseTo(0, 12);
    expect(parallaxShift({ x: 10, y: 2 }, { x: 15, y: 8 }, 0).x).toBe(-5); // pinned to the camera
    expect(parallaxShift({ x: 10, y: 2 }, { x: 15, y: 8 }, 1).x).toBeCloseTo(0, 12); // moves with the world
  });

  it('the coaster keeps its exact numbers: parallaxOffset is parallaxShift on its stage-px frame centres', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 50, y: 30 }, { x: 13, y: 20 }]) {
      const f = rideTarget(p, { x: 4, y: -2 });
      const c = frameCentrePx(f);
      const c0 = frameCentrePx(FULL_FRAME);
      for (const d of Object.values(PARALLAX)) {
        const o = parallaxOffset(f, d.x, d.y);
        // the formula the coaster had before the move, byte for byte
        expect(o).toEqual({ x: (c.x - c0.x) * (1 - d.x), y: (c.y - c0.y) * (1 - d.y) });
        expect(o).toEqual(parallaxShift(c, c0, d.x, d.y));
      }
    }
  });

  it('PARALLAX holds the coaster\'s depth factors; ground-standing layers only shift sideways', () => {
    expect(PARALLAX).toEqual({
      sky: { x: 0.15, y: 0.15 },
      flyers: { x: 0.3, y: 0.3 },
      far: { x: 0.35, y: 1 },
      wheel: { x: 0.55, y: 1 },
      mid: { x: 0.75, y: 1 },
    });
  });
});

describe('driftX', () => {
  it('advances at speed and wraps from hi back to lo, frame-rate independent', () => {
    expect(driftX(5, 2, 0, 0, 10)).toBe(5);
    expect(driftX(5, 2, 1, 0, 10)).toBe(7);
    expect(driftX(5, 2, 3, 0, 10)).toBeCloseTo(1, 12); // 11 wraps to 1
    expect(driftX(5, 2, 13, 0, 10)).toBeCloseTo(1, 9); // 31 -> 1
    expect(driftX(5, -2, 3, 0, 10)).toBeCloseTo(9, 12); // leftward wraps too
    // summing many small steps lands where one big step does (closed form in t)
    let t = 0;
    for (let i = 0; i < 1000; i++) t += 0.0173;
    expect(driftX(-3, 0.4, t, -4, 34)).toBeCloseTo(driftX(-3, 0.4, 17.3, -4, 34), 9);
  });

  it('a degenerate range leaves x alone', () => {
    expect(driftX(5, 2, 3, 4, 4)).toBe(5);
  });
});

describe('satellitePoses', () => {
  it('count points evenly round the circle from the turn angle, all upright', () => {
    const poses = satellitePoses(10, 2.625, 0.4);
    expect(poses).toHaveLength(10);
    poses.forEach((p, i) => {
      expect(Math.hypot(p.dx, p.dy)).toBeCloseTo(2.625, 12);
      const a = 0.4 + (i / 10) * Math.PI * 2;
      expect(p.dx).toBeCloseTo(Math.cos(a) * 2.625, 12);
      expect(p.dy).toBeCloseTo(Math.sin(a) * 2.625, 12);
      expect(p.rotation).toBe(0);
    });
  });

  it('stay upright however far the wheel has turned', () => {
    for (const angle of [0, 1, Math.PI, 7.5, -2]) {
      expect(satellitePoses(5, 1, angle).every((p) => p.rotation === 0)).toBe(true);
    }
  });
});

const STILL: BackgroundLayer = { url: 'park.png', x: 15, y: 7.5, w: 30, h: 15, alpha: 0.8 };

describe('layoutBackground', () => {
  it('a layer without the motion fields draws exactly as before, whatever the camera or the clock', () => {
    expect(isMovingBackground(STILL)).toBe(false);
    for (const cam of [{ x: 15, y: 7.5 }, { x: 4.2, y: 2 }, { x: 25, y: 11 }]) {
      for (const t of [0, 3.3, 1000]) {
        expect(layoutBackground(STILL, cam, { x: 15, y: 7.5 }, t, 30)).toEqual([
          { url: 'park.png', x: 15, y: 7.5, w: 30, h: 15, rotation: 0, originX: 0.5, originY: 0.5 },
        ]);
      }
    }
  });

  it('parallax: the layer lags the camera by its depth factor', () => {
    const bg: BackgroundLayer = { ...STILL, parallax: { x: 0.35, y: 1 } };
    expect(isMovingBackground(bg)).toBe(true);
    const [p] = layoutBackground(bg, { x: 5, y: 2 }, { x: 15, y: 8 }, 0, 30);
    expect(p!.x).toBeCloseTo(15 + (5 - 15) * 0.65, 12);
    expect(p!.y).toBeCloseTo(7.5, 12);
    // at the rest view: where the spec says
    const [q] = layoutBackground(bg, { x: 15, y: 8 }, { x: 15, y: 8 }, 0, 30);
    expect(q).toMatchObject({ x: 15, y: 7.5 });
  });

  it('drift: m/s to the right, wrapping just outside the world', () => {
    const cloud: BackgroundLayer = { url: 'c.png', x: 10, y: 12, w: 4, h: 1, drift: 0.5 };
    expect(layoutBackground(cloud, { x: 15, y: 8 }, { x: 15, y: 8 }, 4, 30)[0]!.x).toBeCloseTo(12, 12);
    const lo = -DRIFT_WRAP_MARGIN - 2;
    const hi = 30 + DRIFT_WRAP_MARGIN + 2;
    for (let t = 0; t < 400; t += 0.37) {
      const x = layoutBackground(cloud, { x: 15, y: 8 }, { x: 15, y: 8 }, t, 30)[0]!.x;
      expect(x).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(x).toBeLessThan(hi + 1e-9);
    }
    // the jump happens with the cloud wholly outside the world: its left edge past worldW + margin,
    // and it comes back with its right edge short of -margin
    const tWrap = (hi - 10) / 0.5;
    const before = layoutBackground(cloud, { x: 15, y: 8 }, { x: 15, y: 8 }, tWrap - 1e-6, 30)[0]!.x;
    const after = layoutBackground(cloud, { x: 15, y: 8 }, { x: 15, y: 8 }, tWrap + 1e-6, 30)[0]!.x;
    expect(before - 2).toBeGreaterThan(30 + DRIFT_WRAP_MARGIN - 1e-6);
    expect(after + 2).toBeLessThan(-DRIFT_WRAP_MARGIN + 1e-6);
  });

  it('spin turns the layer; satellites ride its circle upright, at their pivot, url list in turn', () => {
    const wheel: BackgroundLayer = {
      url: 'rim.png',
      x: 10,
      y: 3.25,
      w: 5.625,
      h: 5.625,
      spin: 0.12,
      parallax: { x: 0.55, y: 1 },
      satellites: { url: ['a.png', 'b.png'], count: 4, r: 2.625, w: 0.7, h: 0.6, pivot: { x: 0.5, y: 0.05 } },
    };
    const cam = { x: 6, y: 2 };
    const rest = { x: 15, y: 8 };
    const pieces = layoutBackground(wheel, cam, rest, 5, 30);
    expect(pieces).toHaveLength(5);
    const hub = pieces[0]!;
    expect(hub.rotation).toBeCloseTo(0.6, 12);
    expect(hub.x).toBeCloseTo(10 + (6 - 15) * 0.45, 12);
    expect(hub.y).toBeCloseTo(3.25, 12);
    pieces.slice(1).forEach((s, i) => {
      expect(s.url).toBe(i % 2 === 0 ? 'a.png' : 'b.png');
      expect(s.rotation).toBe(0);
      expect(s.originX).toBe(0.5);
      expect(s.originY).toBe(0.05);
      expect(Math.hypot(s.x - hub.x, s.y - hub.y)).toBeCloseTo(2.625, 12);
      // clockwise on screen (y down) is clockwise with world y up mirrored: screen dy = -(world dy)
      const a = 0.6 + (i / 4) * Math.PI * 2;
      expect(s.x - hub.x).toBeCloseTo(Math.cos(a) * 2.625, 12);
      expect(hub.y - s.y).toBeCloseTo(Math.sin(a) * 2.625, 12);
    });
  });

  it('a layer covering the whole world never shows a gap for any clamped camera frame', () => {
    // the catapult's world: 30 m across, 19.125 m tall with 1.5 m of ground shown
    const world: WorldDims = { worldW: 30, worldH: 19.125, groundDepth: 1.5, ppm: 32 };
    const rest = fullFrame(world);
    const hw0 = viewWidth(world) / 2;
    const hh0 = world.worldH / 2;
    const layer: BackgroundLayer = { url: 'x', x: 15, y: world.worldH / 2 - 1.5, w: 30, h: world.worldH };
    for (const zoom of [1, 1.6, 2.3, 3.6]) {
      for (const p of [{ x: 0, y: 0 }, { x: 30, y: 20 }, { x: 5.2, y: 2 }, { x: 22, y: 9 }]) {
        const f = clampFrame({ cx: p.x, cy: p.y, zoom }, world);
        for (const d of Object.values(PARALLAX)) {
          const [piece] = layoutBackground({ ...layer, parallax: d }, { x: f.cx, y: f.cy }, { x: rest.cx, y: rest.cy }, 0, 30);
          expect(piece!.x - piece!.w / 2).toBeLessThanOrEqual(f.cx - hw0 / zoom + 1e-9);
          expect(piece!.x + piece!.w / 2).toBeGreaterThanOrEqual(f.cx + hw0 / zoom - 1e-9);
          expect(piece!.y - piece!.h / 2).toBeLessThanOrEqual(f.cy - hh0 / zoom + 1e-9);
          expect(piece!.y + piece!.h / 2).toBeGreaterThanOrEqual(f.cy + hh0 / zoom - 1e-9);
        }
      }
    }
  });
});

describe('backgroundUrls', () => {
  it('lists each layer picture, then its satellites\' pictures', () => {
    expect(backgroundUrls(undefined)).toEqual([]);
    expect(
      backgroundUrls([
        STILL,
        { url: 'rim.png', x: 0, y: 0, w: 1, h: 1, satellites: { url: ['a.png', 'b.png'], count: 4, r: 1, w: 1, h: 1 } },
        { url: 'r2.png', x: 0, y: 0, w: 1, h: 1, satellites: { url: 'c.png', count: 2, r: 1, w: 1, h: 1 } },
      ]),
    ).toEqual(['park.png', 'rim.png', 'a.png', 'b.png', 'r2.png', 'c.png']);
  });
});
