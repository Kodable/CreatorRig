// Picture geometry of the real Marstopia rover art: public/parts/rover/real/*.png, prepared
// 2026-10-01 from the art lead's exports. manifest.json in that folder lists every picture's
// trimmed size and anchor points in px of the trimmed image (y DOWN); the numbers below are
// copied from it (art.test.ts cross-checks them against the file). No physics or Phaser here.
//
// SCALE RULE (the one place it is decided):
//  - The dome and Kevin are drawn at BASE_PPM = 323.5 px / 0.75 m = 431.3 px/m: the dome
//    picture's manifest radius IS the dome collider's radius R.
//  - Wheels: the picture's manifest radius (the square: its halfSide) maps onto the collider's
//    outer radius (circle 0.3 m, star tips 0.33 m, square half-side 0.27 m), i.e. drawn size =
//    picture bbox x (collider radius / manifest radius).
//  - Every other attachment picture (fan, stove, jet, feather, beans, watermelon, plate,
//    suction cup, spring) and the effects (thrust flame, poof) use PART_PPM = 200.6 px / 0.3 m =
//    668.7 px/m: the circle wheel's own scale, so all the parts keep the art's proportions to
//    each other and to the wheels. (At BASE_PPM the watermelon would be as wide as the dome and
//    the suction cup 0.21 m tall; at PART_PPM the cup is 0.14 m, the jet 0.68 m long.)
import type { Vec2 } from './types';

export const ART_DIR = 'parts/rover/real/';

/** Dome collider radius (m). */
export const ROVER_R = 0.75;
export const BASE_PPM = 323.5 / ROVER_R;
export const PART_PPM = 200.6 / 0.3;

export interface Picture {
  /** Texture key in `CourseSpec.textures`. */
  key: string;
  file: string;
  /** Trimmed size, px. */
  w: number;
  h: number;
}

function pic(key: string, file: string, w: number, h: number): Picture {
  return { key, file, w, h };
}

export const PICS = {
  cockpit: pic('rv-cockpit', 'cockpit.png', 654, 609),
  kevin: pic('rv-kevin', 'kevin.png', 426, 481),
  shadow: pic('rv-shadow', 'shadow.png', 539, 111),
  wheelCircle: pic('rv-wheel-circle', 'wheel-circle.png', 399, 394),
  wheelSquare: pic('rv-wheel-square', 'wheel-square.png', 398, 380),
  wheelStar: pic('rv-wheel-star', 'wheel-star1.png', 443, 411),
  fan: pic('rv-fan', 'power-fan.png', 235, 249),
  stove: pic('rv-stove', 'power-stove.png', 384, 490),
  jet: pic('rv-jet', 'power-jet.png', 455, 476),
  // Vertical mirrors of the three propulsion pictures (prepared with Pillow, same size; anchors
  // y -> h - y): a stove on the FRONT half of the dome is drawn with this copy so it stands the
  // right way up instead of upside down (the plain picture, turned to face the rim, would be).
  fanFlip: pic('rv-fan-flip', 'power-fan-flip.png', 235, 249),
  stoveFlip: pic('rv-stove-flip', 'power-stove-flip.png', 384, 490),
  jetFlip: pic('rv-jet-flip', 'power-jet-flip.png', 455, 476),
  thrust: pic('rv-fx-thrust', 'fx-thrust.png', 324, 233),
  poof: pic('rv-fx-poof', 'fx-poof.png', 95, 100),
  feather: pic('rv-feather', 'weight-feather.png', 586, 193),
  beans: pic('rv-beans', 'weight-beans.png', 267, 324),
  watermelon: pic('rv-watermelon', 'weight-watermelon.png', 627, 398),
  plate: pic('rv-plate', 'plate.png', 429, 100),
  spring: pic('rv-spring', 'spring.png', 106, 121),
  cup: pic('rv-cup', 'suctioncup.png', 292, 92),
} as const;

export type PictureName = keyof typeof PICS;

// ---- anchors (px, y down, from manifest.json) -----------------------------------------------

export const COCKPIT = { center: { x: 326.2, y: 312.1 }, radius: 323.5, baseBottom: 608 };
export const KEVIN = { center: { x: 212.5, y: 154.5 }, bodyBbox: { x0: 31, y0: 310, x1: 399, y1: 480 } };
export const WHEEL_ART = {
  wheelCircle: { center: { x: 199.0, y: 196.5 }, radius: 200.6 },
  wheelSquare: { center: { x: 198.5, y: 189.5 }, radius: 239.0, halfSide: 198.5 },
  wheelStar: { center: { x: 221.0, y: 205.0 }, radius: 243.8 },
} as const;
/** `mount`: the picture's suction-cup face (sits on the rim); `axis`: unit vector from the mount
 * into the body (points away from the dome once attached). */
export const POWER_ART = {
  fan: { mount: { x: 234.0, y: 127.8 }, axis: { x: -1.0, y: -0.031 } },
  stove: { mount: { x: 383.0, y: 303.8 }, axis: { x: -0.976, y: -0.219 }, chimney: { x: 46.0, y: 70.5 } },
  jet: { mount: { x: 454.0, y: 249.2 }, axis: { x: -1.0, y: -0.031 }, thrustOrigin: { x: 0.0, y: 249.6 } },
} as const;
export const WEIGHT_ART = {
  feather: { bottom: { x: 222.2, y: 192.0 } },
  beans: { bottom: { x: 133.1, y: 323.0 } },
  watermelon: { bottom: { x: 390.8, y: 397.0 } },
} as const;
export const PLATE_ART = { top: { x: 214.5, y: 0.0 }, bottom: { x: 215.0, y: 99.0 } };
export const SPRING_ART = { top: { x: 65.4, y: 0.0 }, bottom: { x: 44.1, y: 120.0 } };
export const CUP_ART = { top: { x: 147.0, y: 0.0 }, bottom: { x: 144.5, y: 91.0 } };
export const THRUST_ART = { base: { x: 323.0, y: 111.9 } };
export const POOF_ART = { attach: { x: 36.9, y: 99.0 } };

// ---- helpers ---------------------------------------------------------------------------------

/** Drawn size (m) of a picture at `ppm`. */
export function sizeAt(p: Picture, ppm: number): { w: number; h: number } {
  return { w: p.w / ppm, h: p.h / ppm };
}

/** Where a picture's centre sits relative to one of its own anchor points, in meters, y UP, at
 * `ppm`: place the anchor on a point, add this, and you have the picture's centre. */
export function centreFromAnchor(p: Picture, anchor: Vec2, ppm: number): Vec2 {
  return { x: (p.w / 2 - anchor.x) / ppm, y: (anchor.y - p.h / 2) / ppm };
}

/** An anchor point relative to the picture's centre, in meters, y UP, at `ppm`. */
export function anchorFromCentre(p: Picture, anchor: Vec2, ppm: number): Vec2 {
  return { x: (anchor.x - p.w / 2) / ppm, y: (p.h / 2 - anchor.y) / ppm };
}

/** The same anchor in the vertically mirrored copy of a picture (`PICS.*Flip`). */
export function flipAnchor(p: Picture, anchor: Vec2): Vec2 {
  return { x: anchor.x, y: p.h - anchor.y };
}
