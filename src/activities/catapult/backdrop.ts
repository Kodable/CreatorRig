// 2026-10-16 (Jon's huddle 2026-10-15: "each game needs its own environment", drop the ferris
// wheel): the catapult's own placeholder backdrop, a sunny backyard where kids build a catapult
// from a classroom supply bin. Real background art comes later; swap the pictures in
// public/bg/catapult/ (or this list) without touching the spec. Layout and depths mirror the
// coaster's backdrop that the catapult used until now, so every lagging layer still covers the
// whole view at every camera (full view, the 2.8x build view near x 3.5 .. 6, the 1.6x follow
// camera): no gap ever shows.
import type { WorldSpec } from '../../kit/types';
import { PARALLAX } from '../../kit/parallax';

const PPM = 32;
const WORLD_H = 19.125;
const BG = 'bg/catapult/';
/** px (stage) -> m. */
const M = (px: number): number => px / PPM;
/** The top of the visible sky (world y): the panel's top edge, 1.5 m of ground below y 0. */
const SKY_TOP_Y = WORLD_H - 1.5;
/** The bottom of the world camera's viewport: the 1.5 m of ground plus the kit's 10 px earth margin. */
const VIEW_BOTTOM_Y = -1.5 - M(10);

/**
 * The backyard, back to front. Pictures are 4x stage px (128 px per metre) so the 2.8x build zoom
 * stays sharp. Everything right of x 10 m (where the cans, blocks, crates and bullseyes stand) is
 * kept calm: pale hazy hills and houses far behind, a low white picket fence, and nothing tall or
 * dark there. The shed and the big tree sit at the far left behind the catapult.
 *  - sky.jpg      1920 x 1244, whole viewport y -1.8125 .. 17.625, blue to pale blue, soft sun upper left.
 *  - cloud1..3    three white puffs that drift right and wrap, above y 10 m, clear of the targets.
 *  - far.png      3840 x 1200 (30 x 9.375 m, ground line 40 px over its bottom): hazy green hills, pale rooftops.
 *  - mid.png      3840 x 1088 (30 x 8.5 m, same ground line): white picket fence, shed (x 2.3 .. 4.9),
 *                 a tree (x 0 .. 2.3), bushes, and one faded tree at the far right edge.
 */
export const CATAPULT_BACKDROP: NonNullable<WorldSpec['backgrounds']> = [
  {
    url: `${BG}sky.jpg`,
    x: 15,
    y: (SKY_TOP_Y + VIEW_BOTTOM_Y) / 2,
    w: 30,
    h: SKY_TOP_Y - VIEW_BOTTOM_Y,
    parallax: PARALLAX.sky,
  },
  { url: `${BG}cloud1.png`, x: 8, y: 14.5, w: 5.5, h: 1.5625, parallax: PARALLAX.flyers, drift: 0.2 },
  { url: `${BG}cloud2.png`, x: 19, y: 11.5, w: 4.375, h: 1.328, parallax: PARALLAX.flyers, drift: 0.14 },
  { url: `${BG}cloud3.png`, x: 26, y: 16, w: 3.28, h: 1.094, parallax: PARALLAX.flyers, drift: 0.25 },
  // Hills + rooftops: 9.375 m tall, ground line 40 / 128 m over the bottom.
  { url: `${BG}far.png`, x: 15, y: 9.375 / 2 - 0.3125, w: 30, h: 9.375, parallax: PARALLAX.far },
  // Fence, shed, trees: 8.5 m tall, same ground line, at the near-tree depth.
  { url: `${BG}mid.png`, x: 15, y: 8.5 / 2 - 0.3125, w: 30, h: 8.5, parallax: PARALLAX.mid },
];

/** sky.jpg's own top and bottom rows (92, 185, 243) / (217, 242, 255), for the kit sky under it. */
export const CATAPULT_SKY: { top: number; bottom: number } = { top: 0x5cb9f3, bottom: 0xd9f2ff };
/** The ground strip's grass top: Kodable green, matching the lawn the fence stands on. */
export const CATAPULT_GRASS: number = 0x61bb46;
/** The ground strip's earth below the grass: warm garden soil. */
export const CATAPULT_EARTH: number = 0x6e4a2a;
