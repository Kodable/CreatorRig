// The catapult's backdrop: the roller coaster's theme park without its ferris wheel.
//
// History: 2026-10-15 (Gao: "add the roller coaster course bg into it") the catapult used the
// coaster's theme-park backdrop, ferris wheel included. 2026-10-16 (Jon's huddle 2026-10-15: "each
// game needs its own environment", drop the ferris wheel) a placeholder backyard replaced it (fence,
// shed, rooftops). Later on 2026-10-16 (Gao: "for the background, just use the roller coaster's bg
// but without the ferris wheel"): back to the coaster's sky, clouds, hills and trees, with the
// wheel's layers left out. Real catapult art comes later.
//
// Laid out in world metres so it reads as on the coaster: both panels are 960 stage px wide (30 m
// here at 32 px/m), so every layer keeps the coaster's stage-px sizes and its height over the ground
// line (the coaster's ground is stage y 690, its panel bottom 700; here world y 0). The catapult's
// copies of the far hills and the trees (public/bg/coaster/catapult-far.png, catapult-mid.png) are
// 4x stage px (the coaster's are 2x) for the 2.5x build view. Each layer lags the camera by the
// coaster's depth factor (PARALLAX) and the clouds drift; every layer that lags covers the whole
// panel (or stands on the ground and only shifts sideways), so no frame shows a gap.
import type { WorldSpec } from '../../kit/types';
import { PARALLAX } from '../../kit/parallax';

/** Stage px per world metre (the catapult's `world.ppm`). */
const PPM = 32;
/** The catapult world's height (m), core/build.ts WORLD_H. */
const WORLD_H = 19.125;
const BG = 'bg/coaster/';
/** px (stage) -> m. */
const M = (px: number): number => px / PPM;
/** The top of the visible sky (world y): the panel's top edge, 1.5 m of ground below y 0. */
const SKY_TOP_Y = WORLD_H - 1.5;
/** The bottom of the world camera's viewport (world y): the 1.5 m of ground plus the kit's 10 px
 * earth margin. The sky picture reaches down to it so its vertical parallax never lifts its bottom
 * edge into view (the ground band covers it anyway). */
const VIEW_BOTTOM_Y = -1.5 - M(10);

/** Back to front: sky, three drifting clouds, the hazy hills and tree line, the near trees. */
export const CATAPULT_BACKDROP: NonNullable<WorldSpec['backgrounds']> = [
  // The sky gradient + cloud puffs (1920 x 1244, the coaster's whole 622 px panel) over the whole
  // viewport, y -1.8125 .. 17.625 (unsquashed), at the coaster's sky depth.
  {
    url: `${BG}sky.jpg`,
    x: 15,
    y: (SKY_TOP_Y + VIEW_BOTTOM_Y) / 2,
    w: 30,
    h: SKY_TOP_Y - VIEW_BOTTOM_Y,
    parallax: PARALLAX.sky,
  },
  // The coaster's three clouds from its start positions (stage x 300 / 720 / 860 and y 300 / 175 /
  // 420, i.e. 390 / 515 / 270 px over the ground line), half their 2x size, creeping right at the
  // coaster's 5 / 3.5 / 6 stage px a second and wrapping out of view.
  { url: `${BG}cloud1.png`, x: M(300 - 32), y: M(690 - 300), w: M(170), h: M(35.5), parallax: PARALLAX.flyers, drift: M(5) },
  { url: `${BG}cloud2.png`, x: M(720 - 32), y: M(690 - 175), w: M(170), h: M(49), parallax: PARALLAX.flyers, drift: M(3.5) },
  { url: `${BG}cloud3.png`, x: M(860 - 32), y: M(690 - 420), w: M(130), h: M(29.5), parallax: PARALLAX.flyers, drift: M(6) },
  // Hazy hills + a tree line: the coaster's 300 px band, its ground line 10 px over its bottom.
  { url: `${BG}catapult-far.png`, x: 15, y: M(300 / 2 - 10), w: 30, h: M(300), parallax: PARALLAX.far },
  // (No ferris wheel: its stand, turning rim and cars stood here at x 10 m until 2026-10-16.)
  // The trees (the coaster's 230 px band, ground line 10 px over its bottom) at x 1, 23.6 and
  // 29.3 m: none behind the catapult or the near targets in the full view. At the coaster's
  // near-tree depth.
  { url: `${BG}catapult-mid.png`, x: 15, y: M(230 / 2 - 10), w: 30, h: M(230), parallax: PARALLAX.mid },
];

/** sky.jpg's own top and bottom rows (40, 105, 197) / (184, 223, 250), for the kit sky under it. */
export const CATAPULT_SKY: { top: number; bottom: number } = { top: 0x2869c5, bottom: 0xb8dffa };
/** The coaster's grass strip (ground.png, (44, 190, 75)) for the kit ground band's grass. */
export const CATAPULT_GRASS: number = 0x2cbe4b;
/** The warm earth brown under the grass (the old catapult-drawn ground fill). */
export const CATAPULT_EARTH: number = 0x5a3d1e;
