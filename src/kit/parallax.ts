// 2026-10-15 (Gao: the catapult's theme park "lost the coaster's life"): Phaser-free maths for
// moving backdrop layers, shared by the coaster (CoasterScene, via rideCamera.parallaxOffset) and
// the builder kit's `WorldSpec.backgrounds` (BuilderScene). One copy of the parallax rule and the
// coaster's depth factors; unit-tested in parallax.test.ts.
import type { BackgroundLayer, Vec2 } from './types';

/** A layer's depth factors across (x) and up/down (y): 1 moves with the world, 0 stays put. */
export interface ParallaxDepth {
  x: number;
  y: number;
}

/** The coaster's depth factors (CoasterScene, 2026-10-12), back to front. Layers standing on the
 * ground only shift sideways (y 1), so nothing sinks into the grass. */
export const PARALLAX = {
  /** The sky picture. */
  sky: { x: 0.15, y: 0.15 },
  /** Things flying in the sky: the drifting clouds. */
  flyers: { x: 0.3, y: 0.3 },
  /** The far hazy hills and their tree line. */
  far: { x: 0.35, y: 1 },
  /** The ferris wheel. */
  wheel: { x: 0.55, y: 1 },
  /** The row of trees nearest the play field. */
  mid: { x: 0.75, y: 1 },
} as const satisfies Record<string, ParallaxDepth>;

/**
 * Parallax: the offset to add to a layer whose depth factor is `fx` across and `fy` up and down,
 * when the camera centre is at `c` and the composed (rest) view's centre at `c0`, in the same
 * linear space as `c` (stage px for the coaster, world m for the kit). The layer lags the camera
 * by (1 - f) of the camera's travel; at the rest view it is 0, so that view is the composed
 * picture. A layer as big as the panel and anchored to it never shows a gap for any frame clamped
 * to the panel (the travel at zoom z is at most (1 - 1/z) of the panel's half size).
 */
export function parallaxShift(c: Vec2, c0: Vec2, fx: number, fy = fx): Vec2 {
  return { x: (c.x - c0.x) * (1 - fx), y: (c.y - c0.y) * (1 - fy) };
}

/** A drifting layer's x after `t` seconds at `speed` (units/s) from `x0`, wrapped into
 * [lo, hi): once past `hi` it comes back in at `lo`. Closed form, so it is smooth and frame-rate
 * independent whatever the frame times. */
export function driftX(x0: number, speed: number, t: number, lo: number, hi: number): number {
  const span = hi - lo;
  if (!(span > 0)) return x0;
  let v = (x0 - lo + speed * t) % span;
  if (v < 0) v += span;
  return lo + v;
}

/** Where `count` upright satellites sit on a circle of radius `r` around (0, 0) when the circle
 * has turned by `angle` (radians, clockwise on screen): offsets in SCREEN orientation (y down,
 * the same units as `r`), the first at `angle` itself. `rotation` is always 0: a ferris wheel's
 * cars hang level however far the wheel has turned. */
export function satellitePoses(count: number, r: number, angle: number): { dx: number; dy: number; rotation: 0 }[] {
  const out: { dx: number; dy: number; rotation: 0 }[] = [];
  const n = Math.max(0, Math.floor(count));
  for (let i = 0; i < n; i++) {
    const a = angle + (i / n) * Math.PI * 2;
    out.push({ dx: Math.cos(a) * r, dy: Math.sin(a) * r, rotation: 0 });
  }
  return out;
}

/** One picture to draw for a background layer: a world-meter centre (y up) + size, a rotation
 * (radians, clockwise on screen) and the origin (fractions of the picture) placed at the centre. */
export interface BgPiece {
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  originX: number;
  originY: number;
}

/** Meters past the world's edges a drifting layer travels (beyond its own half width) before it
 * wraps, so it is always out of view when it jumps. */
export const DRIFT_WRAP_MARGIN = 1;

/** True when `bg` moves at all (parallax, drift or spin): the scene re-places only these. */
export function isMovingBackground(bg: BackgroundLayer): boolean {
  return bg.parallax !== undefined || bg.drift !== undefined || bg.spin !== undefined;
}

/**
 * The pictures a background layer draws `t` seconds into the scene's clock, with the camera at
 * `cam` and the composed (full) view at `rest` (frame centres, world m), in a world `worldW`
 * wide. The layer's own picture comes first, then its satellites. A layer without `parallax`,
 * `drift`, `spin` or `satellites` is always one picture exactly at its `x`, `y`, `w`, `h`,
 * unrotated and centred: what the kit drew before these fields existed.
 *
 * Why the drift wrap keeps a drifter hidden at the jump: for any camera frame clamped to the
 * world and depth factor in [0, 1], the part of a layer's own space the panel shows lies within
 * [0, worldW] (the parallax lag never exceeds the room the camera has to travel), so a drifter
 * wholly outside [-margin, worldW + margin] is never on screen.
 */
export function layoutBackground(
  bg: BackgroundLayer,
  cam: Vec2,
  rest: Vec2,
  t: number,
  worldW: number,
): BgPiece[] {
  const shift = bg.parallax ? parallaxShift(cam, rest, bg.parallax.x, bg.parallax.y) : { x: 0, y: 0 };
  let x = bg.x;
  if (bg.drift) {
    const half = bg.w / 2;
    x = driftX(bg.x, bg.drift, t, -DRIFT_WRAP_MARGIN - half, worldW + DRIFT_WRAP_MARGIN + half);
  }
  const cx = x + shift.x;
  const cy = bg.y + shift.y;
  const angle = bg.spin ? (bg.spin * t) % (Math.PI * 2) : 0;
  const pieces: BgPiece[] = [
    { url: bg.url, x: cx, y: cy, w: bg.w, h: bg.h, rotation: angle, originX: 0.5, originY: 0.5 },
  ];
  const sat = bg.satellites;
  if (sat) {
    const urls = Array.isArray(sat.url) ? sat.url : [sat.url];
    const poses = satellitePoses(sat.count, sat.r, angle);
    for (let i = 0; i < poses.length && urls.length > 0; i++) {
      const p = poses[i]!;
      pieces.push({
        url: urls[i % urls.length]!,
        x: cx + p.dx,
        y: cy - p.dy, // screen y down -> world y up
        w: sat.w,
        h: sat.h,
        rotation: p.rotation,
        originX: sat.pivot?.x ?? 0.5,
        originY: sat.pivot?.y ?? 0.5,
      });
    }
  }
  return pieces;
}

/** Every picture URL a background list uses (the layers and their satellites). */
export function backgroundUrls(bgs: readonly BackgroundLayer[] | undefined): string[] {
  const out: string[] = [];
  for (const bg of bgs ?? []) {
    out.push(bg.url);
    const s = bg.satellites?.url;
    if (s !== undefined) out.push(...(Array.isArray(s) ? s : [s]));
  }
  return out;
}
