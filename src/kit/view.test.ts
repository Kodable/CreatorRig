import { describe, expect, it } from 'vitest';
import { makeView, PANEL_BOTTOM_Y, STAGE_PANEL_H, panelTopY } from './view';
import type { WorldSpec } from './types';

const WORLD: WorldSpec = { worldW: 32, worldH: 16, ppm: 30 }; // worldH * ppm = 480, per WorldSpec

describe('makeView', () => {
  it('origin: stage x 32 for world x = 0, panel-bottom stage y for world y = 0 at depth 0', () => {
    const view = makeView(WORLD);
    expect(view.originX).toBe(32);
    expect(view.originY).toBe(PANEL_BOTTOM_Y);
    expect(view.toPx({ x: 0, y: 0 })).toEqual({ x: 32, y: PANEL_BOTTOM_Y });
  });

  it('round-trips toPx/toWorld at depth 0', () => {
    const view = makeView(WORLD);
    for (const p of [{ x: 0, y: 0 }, { x: 5, y: 3 }, { x: -2, y: 10 }, { x: 16, y: 8 }]) {
      const back = view.toWorld(view.toPx(p));
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it('shifts world y = 0 up by groundDepth * ppm, and puts world y = -groundDepth on the panel bottom', () => {
    const depth = 2;
    const view = makeView({ ...WORLD, groundDepth: depth });
    expect(view.originY).toBe(PANEL_BOTTOM_Y - depth * WORLD.ppm);
    expect(view.toPx({ x: 0, y: 0 })).toEqual({ x: 32, y: PANEL_BOTTOM_Y - depth * WORLD.ppm });
    expect(view.toPx({ x: 0, y: -depth })).toEqual({ x: 32, y: PANEL_BOTTOM_Y });
  });

  it('round-trips toPx/toWorld with a groundDepth set', () => {
    const view = makeView({ ...WORLD, groundDepth: 1.5 });
    for (const p of [{ x: 0, y: 0 }, { x: 0, y: -1.5 }, { x: 5, y: 3 }, { x: 10, y: -0.5 }]) {
      const back = view.toWorld(view.toPx(p));
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it('treats an absent groundDepth the same as 0', () => {
    const withZero = makeView({ ...WORLD, groundDepth: 0 });
    const withoutField = makeView(WORLD);
    expect(withoutField.originY).toBe(withZero.originY);
    expect(withoutField.toPx({ x: 4, y: 4 })).toEqual(withZero.toPx({ x: 4, y: 4 }));
  });

  it('reports the view size: the whole world for a single-screen world', () => {
    const view = makeView(WORLD);
    expect(view.viewW).toBe(32);
    expect(view.viewH).toBe(16);
    expect(view.viewW * WORLD.ppm).toBe(960);
  });

  it('a wide world keeps the 960 x 480 px panel: the view is 960 / ppm meters wide', () => {
    const wide: WorldSpec = { worldW: 90, worldH: 15, ppm: 32 };
    const view = makeView(wide);
    expect(view.viewW).toBe(30);
    expect(view.viewH).toBe(15);
    expect(view.viewW * wide.ppm).toBe(960);
    expect(view.viewH * wide.ppm).toBe(480);
  });

  it('panelTopY: the default 480 px panel (every course but the rover) starts at y 210', () => {
    expect(STAGE_PANEL_H).toBe(480);
    expect(panelTopY(WORLD)).toBe(210);
    expect(panelTopY({ worldW: 90, worldH: 15, ppm: 32 })).toBe(210);
    expect(PANEL_BOTTOM_Y - STAGE_PANEL_H).toBe(210);
  });

  it('a taller world (2026-10-06: the rover, no dash) grows the panel upward from the same bottom edge', () => {
    // Any height: worldH * ppm px tall, the top that much above y 690, the view the whole worldH.
    for (const [px, top] of [[604, 86], [612, 78]] as const) {
      const tall: WorldSpec = { worldW: 90, worldH: px / 32, ppm: 32 };
      expect(makeView(tall).viewH).toBe(px / 32);
      expect(makeView(tall).viewH * tall.ppm).toBe(px);
      expect(panelTopY(tall)).toBe(top);
    }
    // The rover's: 19.125 m at ppm 32 over 1.5 m of ground. The ground line stays where the 480 px
    // panel had it (only sky is added on top), and the visible band's top is the panel's top.
    const rover: WorldSpec = { worldW: 90, worldH: 19.125, ppm: 32, groundDepth: 1.5 };
    const view = makeView(rover);
    expect(view.originY).toBe(makeView({ ...rover, worldH: 15 }).originY);
    expect(view.toPx({ x: 0, y: rover.worldH - 1.5 }).y).toBe(panelTopY(rover));
    expect(panelTopY(rover)).toBe(78);
  });

  it('a wide world maps world x past the view beyond the panel (the camera scrolls it in)', () => {
    const view = makeView({ worldW: 90, worldH: 15, ppm: 32 });
    expect(view.toPx({ x: 30, y: 0 }).x).toBe(32 + 960); // the panel's right edge
    expect(view.toPx({ x: 90, y: 0 }).x).toBe(32 + 90 * 32);
    expect(view.toWorld(view.toPx({ x: 75, y: 3 }))).toEqual({ x: 75, y: 3 });
  });
});

