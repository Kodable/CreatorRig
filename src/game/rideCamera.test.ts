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
  EDGE_SCROLL_MAX, INTRO_MS, PANEL_RECT, VIEW_W, backdropSpanPx, coasterCamWorld, edgeScrollSpeed, editFrame,
  editFrameAt, inPanel, introFrame, introPan, screenToStage, scrollOf, stageToScreen,
} from './rideCamera';
import { WORLD_H, WORLD_W, toPx } from './view';
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

// ---- 2026-10-15: wide levels ----

describe('wide levels: the camera per level width', () => {
  const wide = coasterCamWorld(150);

  it('a 60 m world is today\'s one screen: no scroll, the edit frame is FULL_FRAME', () => {
    expect(VIEW_W).toBe(60);
    expect(coasterCamWorld(60)).toMatchObject({ worldW: 60, worldH: COASTER_CAM_WORLD.worldH });
    expect(editFrame(10)).toEqual(FULL_FRAME);
    expect(editFrame(100, coasterCamWorld(60))).toEqual(FULL_FRAME);
    expect(scrollOf(FULL_FRAME)).toBeNull();
    expect(introPan(COASTER_CAM_WORLD, { x: 56, y: 3, r: 2.5 })).toBeNull();
  });

  it('the edit view scrolls across a wide world at zoom 1, never past either end', () => {
    expect(editFrameAt(0, wide)).toEqual({ cx: 30, cy: FULL_FRAME.cy, zoom: 1 });
    expect(editFrameAt(1, wide)).toEqual({ cx: 120, cy: FULL_FRAME.cy, zoom: 1 });
    expect(editFrameAt(0.5, wide).cx).toBeCloseTo(75, 9);
    expect(editFrame(-50, wide).cx).toBe(30);
    expect(editFrame(500, wide).cx).toBe(120);
    expect(scrollOf(editFrameAt(0.25, wide), wide)).toEqual({ t: 0.25, view: 0.4 });
  });

  it('the ride camera clamps to the level\'s width: it follows the fuzz past 60 m, up to the far edge', () => {
    // At 60 m wide the camera stops at cx 45 (zoom 2); at 150 m it follows the fuzz out to 135.
    expect(rideTarget({ x: 100, y: 15 }, { x: 0, y: 0 }).cx).toBe(45);
    expect(rideTarget({ x: 100, y: 15 }, { x: 0, y: 0 }, RIDE_ZOOM, wide).cx).toBe(100);
    expect(rideTarget({ x: 149, y: 15 }, { x: 10, y: 0 }, RIDE_ZOOM, wide).cx).toBe(135);
    const f = stepCamera({ cx: 130, cy: 15, zoom: 2 }, { cx: 140, cy: 15, zoom: 2 }, 16.667, wide);
    expect(f.cx).toBeLessThanOrEqual(135);
    expect(f.cx).toBeGreaterThan(130);
  });

  it('the intro pan starts on the flag, ends on the station, and eases between (start, middle, end)', () => {
    const pan = introPan(wide, { x: 146, y: 18, r: 2.5 })!;
    expect(pan.ms).toBe(INTRO_MS);
    expect(pan.ms).toBe(2500);
    expect(pan.from).toEqual({ cx: 120, cy: FULL_FRAME.cy, zoom: 1 }); // the flag at 146 m, clamped
    expect(pan.to).toEqual({ cx: 30, cy: FULL_FRAME.cy, zoom: 1 }); // the station's view
    expect(introFrame(pan, -100)).toEqual(pan.from);
    expect(introFrame(pan, 0)).toEqual(pan.from);
    expect(introFrame(pan, pan.ms / 2).cx).toBeCloseTo(75, 9);
    expect(introFrame(pan, pan.ms)).toEqual(pan.to);
    expect(introFrame(pan, pan.ms * 3)).toEqual(pan.to);
    // Eased: slow at both ends, quick in the middle.
    const at = (k: number): number => introFrame(pan, pan.ms * k).cx;
    expect(120 - at(0.1)).toBeLessThan(at(0.45) - at(0.55));
    for (let k = 0; k < 1; k += 0.05) expect(at(k + 0.05)).toBeLessThanOrEqual(at(k) + 1e-9);
    // The flag is in view at the start (and the zoom never changes).
    expect(Math.abs(146 - pan.from.cx)).toBeLessThan(VIEW_W / 2);
    expect(introFrame(pan, 1234).zoom).toBe(1);
  });

  it('a wide level with no flag pans from the far end; a flag near the station needs no pan', () => {
    const free = introPan(wide, undefined)!;
    expect(free.from.cx).toBe(120);
    expect(introPan(wide, { x: 50, y: 5, r: 2.5 })).toBeNull();
    expect(introPan(coasterCamWorld(120), { x: 116, y: 6, r: 2.5 })!.from.cx).toBe(90);
  });

  it('taps map through the camera: a point drawn on screen maps back to itself, scrolled or zoomed', () => {
    for (const f of [FULL_FRAME, editFrameAt(0.5, wide), editFrameAt(1, wide), { cx: 100, cy: 12, zoom: 2 }]) {
      for (const w of [{ x: f.cx, y: f.cy }, { x: f.cx - 20, y: 5 }, { x: f.cx + 25, y: 30 }]) {
        const stage = toPx(w);
        const screen = stageToScreen(stage, f);
        const back = screenToStage(screen, f);
        expect(back.x).toBeCloseTo(stage.x, 9);
        expect(back.y).toBeCloseTo(stage.y, 9);
      }
    }
    // Scrolled to the far end, the panel's left edge shows world x 90 and its right edge 150.
    const end = editFrameAt(1, wide);
    expect((screenToStage({ x: PANEL_RECT.x0, y: 389 }, end).x - 32) / 16).toBeCloseTo(90, 9);
    expect((screenToStage({ x: PANEL_RECT.x1, y: 389 }, end).x - 32) / 16).toBeCloseTo(150, 9);
    // At the full frame the mapping is the identity (the one-screen levels, unchanged).
    expect(screenToStage({ x: 300, y: 500 }, FULL_FRAME)).toEqual({ x: 300, y: 500 });
    expect(inPanel({ x: 31, y: 300 })).toBe(false);
    expect(inPanel({ x: 500, y: 701 })).toBe(false);
    expect(inPanel({ x: 500, y: 300 })).toBe(true);
  });

  it('dragging a point near the panel\'s edge scrolls that way, faster nearer the edge', () => {
    expect(edgeScrollSpeed(512)).toBe(0);
    expect(edgeScrollSpeed(PANEL_RECT.x0 + 70)).toBe(0);
    expect(edgeScrollSpeed(PANEL_RECT.x1 - 70)).toBe(0);
    expect(edgeScrollSpeed(PANEL_RECT.x1 - 32)).toBeCloseTo(EDGE_SCROLL_MAX / 2, 9);
    expect(edgeScrollSpeed(PANEL_RECT.x1)).toBe(EDGE_SCROLL_MAX);
    expect(edgeScrollSpeed(PANEL_RECT.x1 + 100)).toBe(EDGE_SCROLL_MAX);
    expect(edgeScrollSpeed(PANEL_RECT.x0 + 32)).toBeCloseTo(-EDGE_SCROLL_MAX / 2, 9);
    expect(edgeScrollSpeed(0)).toBe(-EDGE_SCROLL_MAX);
  });

  it('backdrop layers cover what the camera can show: one panel on a one-screen level, more on a wide one', () => {
    for (const f of [0.15, 0.35, 0.75, 1]) expect(backdropSpanPx(60, f)).toBe(960);
    expect(backdropSpanPx(150, 1)).toBe(2400);
    expect(backdropSpanPx(150, 0)).toBe(960);
    expect(backdropSpanPx(150, 0.35)).toBeCloseTo(0.35 * 2400 + 0.65 * 960, 9);
    // Check the bound against the camera: for frames across the world (zoom 1 and 2), the part of
    // a layer's own space on screen stays within [0, span] (panel-relative px).
    for (const fx of [0.15, 0.35, 0.55, 0.75]) {
      const span = backdropSpanPx(150, fx);
      for (const zoom of [1, 2]) {
        for (let cx = 0; cx <= 150; cx += 5) {
          const f = clampFrameFor(wide, cx, zoom);
          const o = parallaxOffset(f, fx, 1);
          const c = frameCentrePx(f).x - 32;
          const half = 480 / zoom;
          expect(c - half - o.x, `f ${fx} z ${zoom} cx ${cx}`).toBeGreaterThanOrEqual(-1e-6);
          expect(c + half - o.x, `f ${fx} z ${zoom} cx ${cx}`).toBeLessThanOrEqual(span + 1e-6);
        }
      }
    }
  });
});

function clampFrameFor(world: ReturnType<typeof coasterCamWorld>, cx: number, zoom: number): FrameState {
  return rideTarget({ x: cx, y: 15 }, { x: 0, y: 0 }, zoom, world);
}
