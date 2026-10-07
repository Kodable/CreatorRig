import { describe, expect, it } from 'vitest';
import { GROUND_Y, PANEL_TOP_Y, PPM, WORLD_H, WORLD_W, toPx, toWorld } from './view';

// 2026-10-07: the coaster's world panel grew up into the dash's old room (src/ui/hud.ts).
describe('coaster view geometry', () => {
  it('the world panel runs from 6 px under the top bar (y 0..72) down to the ground at 690', () => {
    expect(PANEL_TOP_Y).toBe(78);
    expect(GROUND_Y).toBe(690);
    expect(WORLD_H).toBe(38.25);
    expect(GROUND_Y - WORLD_H * PPM).toBe(PANEL_TOP_Y);
  });

  it('the ground and the old 30 m sky keep their stage positions; the extra height is sky', () => {
    expect(toPx({ x: 0, y: 0 })).toEqual({ x: 32, y: 690 });
    expect(toPx({ x: 30, y: 30 })).toEqual({ x: 512, y: 210 });
    expect(toPx({ x: WORLD_W, y: WORLD_H })).toEqual({ x: 992, y: 78 });
  });

  it('toWorld undoes toPx at the panel corners', () => {
    for (const p of [{ x: 32, y: 78 }, { x: 992, y: 690 }, { x: 500, y: 300 }]) {
      const back = toPx(toWorld(p));
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });
});
