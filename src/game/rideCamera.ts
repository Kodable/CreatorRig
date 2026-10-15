// 2026-10-12 (Gao: "zoom in the camera when the coaster is playing"; Jon's earlier review asked
// for the same): the coaster's ride camera, as Phaser-free maths so it is unit-tested
// (rideCamera.test.ts). A camera frame is a world-meter centre plus a zoom (1 = the whole level,
// exactly today's edit view); the frame helpers are the builder kit's (src/kit/camera.ts), fed the
// coaster's world. CoasterScene owns the state and applies the frame to its world camera.
import type { Vec2 } from '../core/types';
import { approachFrame, clampFrame, fullFrame, type FrameState, type WorldDims } from '../kit/camera';
import { parallaxShift } from '../kit/parallax';
import { GROUND_Y, PPM, WORLD_H, WORLD_W, toPx } from './view';

/** The panel runs 10 px (0.625 m) below the ground line to its bottom edge at stage y 700. */
export const GROUND_DEPTH = (700 - GROUND_Y) / PPM;

/** The band a camera frame may show: the whole world panel, x 0..60 m, y -0.625..38.25 m (stage
 * x 32..992, y 78..700). `clampFrame` keeps every frame inside it, so the camera never shows
 * anything outside the world. */
export const COASTER_CAM_WORLD: WorldDims = {
  worldW: WORLD_W,
  worldH: WORLD_H + GROUND_DEPTH,
  groundDepth: GROUND_DEPTH,
};

/** Edit mode (and the end of a ride): the whole level, zoom 1, centred on the panel (stage 512, 389). */
export const FULL_FRAME: FrameState = fullFrame(COASTER_CAM_WORLD);

/** Play mode zoom: twice today's view, 30 x 19.4 m on screen. A 4 m loop then fills about 40 % of
 * the screen's height and the fuzz is 52 px across. */
export const RIDE_ZOOM = 2;

/** Per-60 Hz-frame approach factors (frame-rate independent, see `approachFrame`). The centre
 * keeps up with a fast fuzz (lag about 4 m at 25 m/s, balanced by the look-ahead); the zoom eases
 * in and out over about a second. */
export const FOLLOW_LERP = 0.12;
export const ZOOM_LERP = 0.06;

/** The camera aims this far ahead of the fuzz along its velocity (seconds of travel), capped, so a
 * fast fuzz is not chased off the screen's edge and the drop ahead is in view. */
export const LOOK_AHEAD_S = 0.3;
export const LOOK_AHEAD_MAX = 5;

/** After the run ends the camera holds on the fuzz this long (the payoff at the flag, a fall),
 * then glides back out to the full view. */
export const END_HOLD_MS = 1100;

/** Where the ride camera wants to be: the fuzz centre (world m) plus a capped look-ahead along its
 * velocity (world m/s), at `zoom`, clamped to the world panel. */
export function rideTarget(fuzz: Vec2, vel: Vec2, zoom = RIDE_ZOOM): FrameState {
  const ax = vel.x * LOOK_AHEAD_S;
  const ay = vel.y * LOOK_AHEAD_S;
  const len = Math.hypot(ax, ay);
  const k = len > LOOK_AHEAD_MAX ? LOOK_AHEAD_MAX / len : 1;
  return clampFrame({ cx: fuzz.x + ax * k, cy: fuzz.y + ay * k, zoom }, COASTER_CAM_WORLD);
}

/**
 * One frame of camera motion toward `target`: the centre approaches at FOLLOW_LERP and the zoom at
 * ZOOM_LERP, then the frame is clamped to the world panel (at the in-between zoom, so the camera
 * never shows outside the world mid-zoom either). Snaps onto the target once within a hair, so the
 * edit view lands exactly on FULL_FRAME (no sub-pixel blur on the editor).
 */
export function stepCamera(cur: FrameState, target: FrameState, dtMs: number): FrameState {
  const pos = approachFrame(cur, target, FOLLOW_LERP, dtMs);
  const zoom = approachFrame(cur, target, ZOOM_LERP, dtMs).zoom;
  let next: FrameState = { cx: pos.cx, cy: pos.cy, zoom };
  if (
    Math.abs(next.cx - target.cx) < 1e-3 &&
    Math.abs(next.cy - target.cy) < 1e-3 &&
    Math.abs(next.zoom - target.zoom) < 1e-4
  ) {
    next = { ...target };
  }
  return clampFrame(next, COASTER_CAM_WORLD);
}

/** The frame's centre in stage px (what the world camera centres on). */
export function frameCentrePx(f: FrameState): Vec2 {
  return toPx({ x: f.cx, y: f.cy });
}

/**
 * Parallax: the stage-px offset to add to a backdrop layer whose depth factor is `fx` across and
 * `fy` up and down (1 = moves with the world, like the track; 0 = pinned to the camera). At the
 * full frame it is 0, so the edit view is the composed picture. A layer as big as the panel and
 * anchored to it never shows a gap for any clamped frame (it lags the camera by (1 - f) of the
 * camera's travel, and the travel at zoom z is at most (1 - 1/z) of the panel's half size).
 */
export function parallaxOffset(f: FrameState, fx: number, fy = fx): Vec2 {
  // 2026-10-15: the rule itself lives in the builder kit (src/kit/parallax.ts), shared with the
  // kit's moving `WorldSpec.backgrounds`; same arithmetic, so the coaster is unchanged.
  return parallaxShift(frameCentrePx(f), frameCentrePx(FULL_FRAME), fx, fy);
}
