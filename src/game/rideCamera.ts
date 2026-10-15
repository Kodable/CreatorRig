// 2026-10-12 (Gao: "zoom in the camera when the coaster is playing"; Jon's earlier review asked
// for the same): the coaster's ride camera, as Phaser-free maths so it is unit-tested
// (rideCamera.test.ts). A camera frame is a world-meter centre plus a zoom (1 = the whole level,
// exactly today's edit view); the frame helpers are the builder kit's (src/kit/camera.ts), fed the
// coaster's world. CoasterScene owns the state and applies the frame to its world camera.
import type { FinishZone, Vec2 } from '../core/types';
import {
  approachFrame, clampFrame, cxToScroll, easeInOutCubic, fullFrame, lerpFrame, scrollToCx, viewWidth,
  type FrameState, type WorldDims,
} from '../kit/camera';
import { parallaxShift } from '../kit/parallax';
import { GROUND_Y, ORIGIN_X, PANEL_TOP_Y, PPM, WORLD_H, WORLD_W, toPx } from './view';

/** The panel runs 10 px (0.625 m) below the ground line to its bottom edge at stage y 700. */
export const GROUND_DEPTH = (700 - GROUND_Y) / PPM;

/**
 * The band a camera frame may show for a level `worldW` meters wide (2026-10-15: per level, see
 * src/core/world.ts): x 0..worldW, y -0.625..38.25 m. `clampFrame` keeps every frame inside it, so
 * the camera never shows anything outside the world. `ppm` makes the view 960 / 16 = 60 m across at
 * zoom 1 (the builder kit's wide-world rule, src/kit/camera.ts): a 60 m world is exactly one view
 * (the one-screen levels, unchanged), a wider one scrolls.
 */
export function coasterCamWorld(worldW: number = WORLD_W): WorldDims {
  return { worldW, worldH: WORLD_H + GROUND_DEPTH, groundDepth: GROUND_DEPTH, ppm: PPM };
}

/** The one-screen world (x 0..60 m, stage x 32..992, y 78..700). */
export const COASTER_CAM_WORLD: WorldDims = coasterCamWorld(WORLD_W);

/** Meters of world the panel shows across at zoom 1 (60). */
export const VIEW_W = viewWidth(COASTER_CAM_WORLD);

/** Edit mode (and the end of a ride) on a one-screen level: the whole level, zoom 1, centred on the
 * panel (stage 512, 389). On a wide level it is the left end's view (the station's). */
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
export function rideTarget(fuzz: Vec2, vel: Vec2, zoom = RIDE_ZOOM, world: WorldDims = COASTER_CAM_WORLD): FrameState {
  const ax = vel.x * LOOK_AHEAD_S;
  const ay = vel.y * LOOK_AHEAD_S;
  const len = Math.hypot(ax, ay);
  const k = len > LOOK_AHEAD_MAX ? LOOK_AHEAD_MAX / len : 1;
  return clampFrame({ cx: fuzz.x + ax * k, cy: fuzz.y + ay * k, zoom }, world);
}

/**
 * One frame of camera motion toward `target`: the centre approaches at FOLLOW_LERP and the zoom at
 * ZOOM_LERP, then the frame is clamped to the world panel (at the in-between zoom, so the camera
 * never shows outside the world mid-zoom either). Snaps onto the target once within a hair, so the
 * edit view lands exactly on FULL_FRAME (no sub-pixel blur on the editor).
 */
export function stepCamera(
  cur: FrameState,
  target: FrameState,
  dtMs: number,
  world: WorldDims = COASTER_CAM_WORLD,
  lerp = FOLLOW_LERP,
): FrameState {
  const pos = approachFrame(cur, target, lerp, dtMs);
  const zoom = approachFrame(cur, target, ZOOM_LERP, dtMs).zoom;
  let next: FrameState = { cx: pos.cx, cy: pos.cy, zoom };
  if (
    Math.abs(next.cx - target.cx) < 1e-3 &&
    Math.abs(next.cy - target.cy) < 1e-3 &&
    Math.abs(next.zoom - target.zoom) < 1e-4
  ) {
    next = { ...target };
  }
  return clampFrame(next, world);
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

// ---------------- wide levels (2026-10-15) ----------------

/** Per-60 Hz-frame approach of the edit view while it scrolls (the scrollbar, the edge scroll):
 * the builder kit's GLIDE_LERP, about 90 % of the way in 110 ms. */
export const SCROLL_LERP = 0.3;

/** The edit view centred (across) on `cx`, at zoom 1 and the full height, clamped to the world:
 * on a one-screen level always FULL_FRAME. */
export function editFrame(cx: number, world: WorldDims = COASTER_CAM_WORLD): FrameState {
  return clampFrame({ cx, cy: FULL_FRAME.cy, zoom: 1 }, world);
}

/** The edit view whose window sits at `t` of the scrollable range (0 = the left end). */
export function editFrameAt(t: number, world: WorldDims = COASTER_CAM_WORLD): FrameState {
  return editFrame(scrollToCx(t, VIEW_W, world.worldW), world);
}

/** The scrollbar for the frame `f` (the HUD's `scroll`): where the view sits (0..1) and how much
 * of the world it shows (0..1). Null on a one-screen level (nothing to scroll). */
export function scrollOf(f: FrameState, world: WorldDims = COASTER_CAM_WORLD): { t: number; view: number } | null {
  if (world.worldW <= VIEW_W + 1e-6) return null;
  return { t: cxToScroll(f.cx, VIEW_W, world.worldW, Math.max(1, f.zoom)), view: VIEW_W / world.worldW };
}

/** The intro pan's length (Gao: "on Rover ... you start at the end and then it shows you the
 * whole thing and zooms back"). A tap skips it. */
export const INTRO_MS = 2500;

export interface IntroPan { from: FrameState; to: FrameState; ms: number }

/**
 * A wide level's opening pan: from the flag's view (the far right end when the level has no flag)
 * back to the station's (the left end), over INTRO_MS. Null when the level fits one screen, or the
 * flag is already in the station's view.
 */
export function introPan(world: WorldDims, finish: FinishZone | null | undefined): IntroPan | null {
  if (world.worldW <= VIEW_W + 1e-6) return null;
  const to = editFrameAt(0, world);
  const from = finish ? editFrame(finish.x, world) : editFrameAt(1, world);
  if (finish && finish.x + finish.r <= to.cx + VIEW_W / 2) return null;
  if (Math.abs(from.cx - to.cx) < 1e-6) return null;
  return { from, to, ms: INTRO_MS };
}

/** The intro pan's frame `tMs` in: an ease in-out from `from` to `to` (held at either end). */
export function introFrame(pan: IntroPan, tMs: number): FrameState {
  const t = pan.ms > 0 ? Math.max(0, Math.min(1, tMs / pan.ms)) : 1;
  return lerpFrame(pan.from, pan.to, easeInOutCubic(t));
}

/** The world panel on the stage (the world camera's viewport): x 32..992, y 78..700. */
export const PANEL_RECT = { x0: ORIGIN_X, y0: PANEL_TOP_Y, x1: ORIGIN_X + VIEW_W * PPM, y1: 700 } as const;
const PANEL_CX = (PANEL_RECT.x0 + PANEL_RECT.x1) / 2;
const PANEL_CY = (PANEL_RECT.y0 + PANEL_RECT.y1) / 2;

/** A point on the screen (stage px: the canvas px over RENDER_SCALE) inside the world panel. */
export function inPanel(screen: Vec2): boolean {
  return screen.x >= PANEL_RECT.x0 && screen.x <= PANEL_RECT.x1 && screen.y >= PANEL_RECT.y0 && screen.y <= PANEL_RECT.y1;
}

/**
 * Where a screen point (stage px) lands in the world camera's space (the stage px every world
 * object is placed in, `toPx`), with the camera on frame `f`: the panel's centre shows the frame's
 * centre, and the zoom scales about it. Taps and drags map through this, so they stay right
 * however far the edit view has scrolled (and while the ride camera is zoomed).
 */
export function screenToStage(screen: Vec2, f: FrameState): Vec2 {
  const c = frameCentrePx(f);
  const z = Math.max(f.zoom, 1e-6);
  return { x: c.x + (screen.x - PANEL_CX) / z, y: c.y + (screen.y - PANEL_CY) / z };
}

/** The inverse of `screenToStage`: where a world-camera point shows on the screen. */
export function stageToScreen(p: Vec2, f: FrameState): Vec2 {
  const c = frameCentrePx(f);
  return { x: PANEL_CX + (p.x - c.x) * f.zoom, y: PANEL_CY + (p.y - c.y) * f.zoom };
}

/** Auto-scroll while a point is dragged (2026-10-15): within EDGE_SCROLL_PX of the panel's left
 * or right edge the edit view scrolls that way, faster the closer the finger is, up to
 * EDGE_SCROLL_MAX m/s at the edge (and past it). */
export const EDGE_SCROLL_PX = 64;
export const EDGE_SCROLL_MAX = 24;

/** The edge scroll's speed (m/s, negative = toward the left end) for a finger at screen x. */
export function edgeScrollSpeed(screenX: number): number {
  const left = (PANEL_RECT.x0 + EDGE_SCROLL_PX - screenX) / EDGE_SCROLL_PX;
  if (left > 0) return -EDGE_SCROLL_MAX * Math.min(1, left);
  const right = (screenX - (PANEL_RECT.x1 - EDGE_SCROLL_PX)) / EDGE_SCROLL_PX;
  if (right > 0) return EDGE_SCROLL_MAX * Math.min(1, right);
  return 0;
}

/**
 * How wide (stage px, from the panel's left edge) a backdrop layer with depth factor `f` must be
 * to never show a gap in a world `worldW` m wide: the camera's centre ranges over the world, and
 * the layer lags it by (1 - f) of that travel from the rest view (the left end), so it shows its
 * own x from 0 to f * worldW_px + (1 - f) * 960. One panel (960) for a one-screen level, whatever f.
 */
export function backdropSpanPx(worldW: number, f: number): number {
  const panel = VIEW_W * PPM;
  return Math.max(panel, f * worldW * PPM + (1 - f) * panel);
}
