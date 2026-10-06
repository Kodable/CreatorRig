// Per-course world <-> stage-pixel mapping. The stage panel geometry (origin x 32, panel bottom
// y 690, 960 px wide) is fixed across every builder-kit course; its height is the course's
// `worldH * ppm`: 480 px (top y 210, under the dash) for every course but the rover, whose
// taller world (2026-10-06, `hud.goalsOverlay`: no dash) grows the panel upward to just under
// the top bar (see `panelTopY`). Only ppm (and therefore the panel's on-screen extent) and that
// height vary with the course's WorldSpec. `WorldSpec.groundDepth` (meters of ground shown below
// world y = 0) shifts where world y = 0 lands in that panel — it never moves the panel itself.
// Drawing only: bodies, coordinates and levels do not move.
// A world WIDER than the panel (`WorldSpec.worldW` > 960 / ppm) keeps the same 960 px panel: world
// x past the view simply maps past the panel's right edge, and the world camera scrolls it in.
import type { Vec2, WorldSpec } from './types';
import { STAGE_PANEL_H, STAGE_PANEL_W, viewWidth } from './camera';

export { STAGE_PANEL_W, STAGE_PANEL_H };

export { STAGE_W, STAGE_H, COLORS, RENDER_SCALE } from '../game/view';

const ORIGIN_X = 32; // stage x of world x = 0
/** Stage y of the panel's bottom edge. Fixed for every course: world y = -groundDepth always
 * sits here (world y = 0 does, when groundDepth is 0 or absent). */
export const PANEL_BOTTOM_Y = 690;

/** Stage y of the world panel's top edge: `PANEL_BOTTOM_Y - worldH * ppm`. 210 for the default
 * 480 px panel (`STAGE_PANEL_H`, every course but the rover); a world taller than 480 px (the
 * rover's, 2026-10-06) moves it up, over where the dash would sit — the course then shows its
 * goals over the scene instead (`HudSpec.goalsOverlay`). BuilderScene sizes the world camera's
 * viewport from it and BuilderHud anchors everything over the panel (the drawer, the win banner,
 * the meters/goals overlays: the `--panel-top` CSS variable) to it. */
export function panelTopY(world: WorldSpec): number {
  return PANEL_BOTTOM_Y - world.worldH * world.ppm;
}

export function makeView(world: WorldSpec): {
  toPx(v: Vec2): Vec2;
  toWorld(p: Vec2): Vec2;
  originX: 32;
  /** Stage y of world y = 0: `PANEL_BOTTOM_Y` minus `groundDepth` meters (so `groundDepth`'s
   * band of below-zero ground draws between this line and the panel's bottom edge). */
  originY: number;
  /** Meters the panel shows across at zoom 1 (`STAGE_PANEL_W / ppm`; exactly `worldW` when the
   * world fits the panel). The panel is `viewW * ppm` = 960 stage px wide for every course. */
  viewW: number;
  /** Meters the panel shows top to bottom at zoom 1: exactly `worldH` (the panel is `worldH *
   * ppm` stage px tall, `STAGE_PANEL_H` = 480 by default; see `panelTopY`). */
  viewH: number;
} {
  const ppm = world.ppm;
  const originY = PANEL_BOTTOM_Y - (world.groundDepth ?? 0) * ppm;
  return {
    toPx(v: Vec2): Vec2 {
      return { x: ORIGIN_X + v.x * ppm, y: originY - v.y * ppm };
    },
    toWorld(p: Vec2): Vec2 {
      return { x: (p.x - ORIGIN_X) / ppm, y: (originY - p.y) / ppm };
    },
    originX: 32,
    originY,
    viewW: viewWidth(world),
    viewH: world.worldH,
  };
}
