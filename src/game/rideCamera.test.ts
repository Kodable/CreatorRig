import { describe, expect, it } from 'vitest';
import {
  COASTER_CAM_WORLD,
  FULL_FRAME,
  LOOK_AHEAD_MAX,
  RIDE_ZOOM,
  frameCentrePx,
  parallaxOffset,
  rideTarget,
  stepCamera,
} from './rideCamera';
import { WORLD_H, WORLD_W } from './view';
import type { FrameState } from '../kit/camera';

/** The frame's visible rect in world meters. */
function visible(f: FrameState): { x0: number; x1: number; y0: number; y1: number } {
  const hw = WORLD_W / f.zoom / 2;
  const hh = COASTER_CAM_WORLD.worldH / f.zoom / 2;
  return { x0: f.cx - hw, x1: f.cx + hw, y0: f.cy - hh, y1: f.cy + hh };
}

describe('ride camera', () => {
  it('the full frame is today\'s edit view: zoom 1 centred on the world panel (stage 512, 389)', () => {
    expect(FULL_FRAME.zoom).toBe(1);
    const c = frameCentrePx(FULL_FRAME);
    expect(c.x).toBeCloseTo(512, 9);
    expect(c.y).toBeCloseTo(389, 9);
    const v = visible(FULL_FRAME);
    expect(v.x0).toBeCloseTo(0, 9);
    expect(v.x1).toBeCloseTo(WORLD_W, 9);
    expect(v.y0).toBeCloseTo(-0.625, 9);
    expect(v.y1).toBeCloseTo(WORLD_H, 9);
  });

  it('follows the fuzz at RIDE_ZOOM with a capped look-ahead along its velocity', () => {
    const still = rideTarget({ x: 30, y: 15 }, { x: 0, y: 0 });
    expect(still).toEqual({ cx: 30, cy: 15, zoom: RIDE_ZOOM });
    const slow = rideTarget({ x: 30, y: 15 }, { x: 5, y: 0 });
    expect(slow.cx).toBeCloseTo(31.5, 9);
    const fast = rideTarget({ x: 30, y: 15 }, { x: 30, y: -40 });
    expect(Math.hypot(fast.cx - 30, fast.cy - 15)).toBeCloseTo(LOOK_AHEAD_MAX, 9);
  });

  it('clamps the frame to the world panel at every corner', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 0, y: 40 }, { x: 60, y: 40 }, { x: -5, y: -5 }]) {
      const v = visible(rideTarget(p, { x: 0, y: 0 }));
      expect(v.x0).toBeGreaterThanOrEqual(-1e-9);
      expect(v.x1).toBeLessThanOrEqual(WORLD_W + 1e-9);
      expect(v.y0).toBeGreaterThanOrEqual(-0.625 - 1e-9);
      expect(v.y1).toBeLessThanOrEqual(WORLD_H + 1e-9);
    }
  });

  it('zooms in smoothly from the full view and lands exactly back on it', () => {
    let f: FrameState = { ...FULL_FRAME };
    const target = rideTarget({ x: 5, y: 25 }, { x: 0, y: 0 });
    let prevZoom = f.zoom;
    for (let i = 0; i < 240; i++) {
      f = stepCamera(f, target, 16.667);
      expect(f.zoom).toBeGreaterThanOrEqual(prevZoom - 1e-12); // never zooms back out on the way in
      prevZoom = f.zoom;
      const v = visible(f);
      expect(v.x0).toBeGreaterThanOrEqual(-1e-9);
      expect(v.y1).toBeLessThanOrEqual(WORLD_H + 1e-9);
    }
    expect(f.zoom).toBeCloseTo(RIDE_ZOOM, 3);
    // after ~1 s it is mostly zoomed in, not all the way (smooth, not a cut)
    let g: FrameState = { ...FULL_FRAME };
    for (let i = 0; i < 6; i++) g = stepCamera(g, target, 16.667);
    expect(g.zoom).toBeGreaterThan(1.1);
    expect(g.zoom).toBeLessThan(1.6);
    // and back out to exactly the full frame
    for (let i = 0; i < 600; i++) f = stepCamera(f, FULL_FRAME, 16.667);
    expect(f).toEqual(FULL_FRAME);
  });

  it('is frame-rate independent: 30 Hz covers what 60 Hz covers in the same time', () => {
    const target = rideTarget({ x: 40, y: 10 }, { x: 0, y: 0 });
    let a: FrameState = { ...FULL_FRAME };
    let b: FrameState = { ...FULL_FRAME };
    for (let i = 0; i < 30; i++) a = stepCamera(a, target, 16.667);
    for (let i = 0; i < 15; i++) b = stepCamera(b, target, 33.334);
    expect(a.zoom).toBeCloseTo(b.zoom, 2);
    expect(a.cx).toBeCloseTo(b.cx, 1);
  });

  it('parallax: no offset at the full frame; a far layer lags the camera, a layer at 1 moves with it', () => {
    expect(parallaxOffset(FULL_FRAME, 0.3)).toEqual({ x: 0, y: 0 });
    const f = rideTarget({ x: 50, y: 30 }, { x: 0, y: 0 });
    const c = frameCentrePx(f);
    const c0 = frameCentrePx(FULL_FRAME);
    const off = parallaxOffset(f, 0.25, 1);
    expect(off.x).toBeCloseTo((c.x - c0.x) * 0.75, 9);
    expect(off.y).toBeCloseTo(0, 12);
    expect(parallaxOffset(f, 1).x).toBeCloseTo(0, 12);
  });

  it('a panel-sized parallax layer covers the view for every clamped frame', () => {
    // panel stage rect x 32..992, y 78..700
    for (const zoom of [1, 1.4, RIDE_ZOOM, 3]) {
      for (const p of [{ x: 0, y: 0 }, { x: 60, y: 38 }, { x: 13, y: 20 }]) {
        const f = rideTarget(p, { x: 0, y: 0 }, zoom);
        const c = frameCentrePx(f);
        const hw = 960 / zoom / 2;
        const hh = 622 / zoom / 2;
        for (const fx of [0, 0.2, 0.5, 0.9]) {
          const o = parallaxOffset(f, fx);
          expect(32 + o.x).toBeLessThanOrEqual(c.x - hw + 1e-6);
          expect(992 + o.x).toBeGreaterThanOrEqual(c.x + hw - 1e-6);
          expect(78 + o.y).toBeLessThanOrEqual(c.y - hh + 1e-6);
          expect(700 + o.y).toBeGreaterThanOrEqual(c.y + hh - 1e-6);
        }
      }
    }
  });
});
