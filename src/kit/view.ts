// Per-course world <-> stage-pixel mapping. The stage panel geometry (origin x 32, panel bottom
// y 690, 960 x 480 px) is fixed across every builder-kit course; only ppm (and therefore the
// panel's on-screen extent) varies with the course's WorldSpec. `WorldSpec.groundDepth` (meters
// of ground shown below world y = 0) shifts where world y = 0 lands in that fixed panel — it
// never moves the panel itself. Drawing only: bodies, coordinates and levels do not move.
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
  /** Meters the panel shows top to bottom at zoom 1 (`STAGE_PANEL_H / ppm`, = worldH). */
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
    viewH: STAGE_PANEL_H / ppm,
  };
}
