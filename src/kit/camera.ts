// Phaser-free camera controller math for the builder kit: a camera frame is a world-meter
// centre plus a zoom factor (1 = the whole panel). BuilderScene owns the Phaser-side state
// machine (camMode / camFrom / camTo / camT / camCur / camRest) and calls these pure helpers
// every frame; keeping the math here (no Phaser import) makes it unit-testable without a canvas.

/** Default tween duration (ms) for `focusFrame` and for a released `trackPoint` tweening back
 * to the rest frame. */
export const FOCUS_MS = 500;

/** The world panel (the world camera's viewport) in stage px: 960 wide for every builder-kit
 * course, and `STAGE_PANEL_H` tall by default. The height is really the course's `worldH * ppm`
 * (2026-10-06: the rover's taller world grows its panel upward, see view.ts `panelTopY`), so at
 * zoom 1 the panel shows `STAGE_PANEL_W / ppm` x `worldH` meters of world. */
export const STAGE_PANEL_W = 960;
export const STAGE_PANEL_H = 480;

export interface FrameState { cx: number; cy: number; zoom: number }

/** The world size a camera frame is clamped against. `ppm` (when given) sets the VIEW width,
 * `STAGE_PANEL_W / ppm` meters: a world wider than that scrolls (see `viewWidth`). Without
 * `ppm` the view is the whole world width (the single-screen case). */
export interface WorldDims { worldW: number; worldH: number; groundDepth?: number; ppm?: number }

/** Meters of world the panel shows across at zoom 1: `STAGE_PANEL_W / ppm`, or exactly `worldW`
 * when the world fits the panel (within 1e-6 m, so a float-rounded single-screen world such as
 * worldW 36 at ppm 960/36 stays byte-for-byte the single-screen case) or `ppm` is absent. */
export function viewWidth(world: { worldW: number; ppm?: number }): number {
  if (!world.ppm || world.ppm <= 0) return world.worldW;
  const v = STAGE_PANEL_W / world.ppm;
  return world.worldW <= v + 1e-6 ? world.worldW : v;
}

/** True when the world is wider than the view: the edit-mode camera window scrolls. */
export function isWideWorld(world: { worldW: number; ppm?: number }): boolean {
  return viewWidth(world) < world.worldW;
}

/** The camera centre x (world m) whose window's left edge sits at `t` (0..1, clamped) of the
 * scrollable range [0, worldW - viewW / zoom]. Zoom 1: viewW / 2 + t * (worldW - viewW). When the
 * window is as wide as the world (or wider) there is nothing to scroll: the world centre. */
export function scrollToCx(t: number, viewW: number, worldW: number, zoom = 1): number {
  const half = viewW / Math.max(zoom, 1e-6) / 2;
  const range = worldW - 2 * half;
  if (range <= 1e-9) return worldW / 2;
  const c = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  return half + c * range;
}

/** Inverse of `scrollToCx`: where (0..1, clamped) a window centred on `cx` sits in the
 * scrollable range. 0 when there is nothing to scroll. */
export function cxToScroll(cx: number, viewW: number, worldW: number, zoom = 1): number {
  const half = viewW / Math.max(zoom, 1e-6) / 2;
  const range = worldW - 2 * half;
  if (range <= 1e-9) return 0;
  return Math.max(0, Math.min(1, (cx - half) / range));
}

/** The full-panel frame at zoom 1: the LEFT view window of the world (the whole world when it
 * fits the view), its centre in world meters. With `groundDepth` the visible vertical band is
 * [-groundDepth, worldH - groundDepth] (see `clampFrame`), so the centre sits `groundDepth`
 * below `worldH / 2` instead of at it. Default groundDepth 0. */
export function fullFrame(world: WorldDims): FrameState {
  return { cx: viewWidth(world) / 2, cy: world.worldH / 2 - (world.groundDepth ?? 0), zoom: 1 };
}

/** Smoothstep-style ease in/out, t in [0, 1]. */
export function easeInOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/** Componentwise linear blend of two frames, t in [0, 1] (not clamped here; callers pass an
 * already-eased or already-clamped t). */
export function lerpFrame(a: FrameState, b: FrameState, t: number): FrameState {
  return {
    cx: a.cx + (b.cx - a.cx) * t,
    cy: a.cy + (b.cy - a.cy) * t,
    zoom: a.zoom + (b.zoom - a.zoom) * t,
  };
}

/**
 * Frame-rate independent exponential approach toward `target`: `lerp` is the fraction covered
 * in one 60 Hz frame (16.667 ms), so the same `lerp` value produces the same on-screen catch-up
 * speed regardless of the actual frame delta.
 */
export function approachFrame(cur: FrameState, target: FrameState, lerp: number, dtMs: number): FrameState {
  const l = Math.max(0, Math.min(1, lerp));
  // l = 1 (or dtMs = 0) both degenerate the exponent to "jump straight there".
  const k = l >= 1 ? 1 : 1 - Math.pow(1 - l, dtMs / 16.667);
  return lerpFrame(cur, target, k);
}

/** The subset of Phaser 4's `Camera` (node_modules/phaser/src/cameras/2d/Camera.js) that
 * `panelPxToStagePx` needs, lifted out as a plain interface so this module stays Phaser-free.
 * `worldView.x/y` and `zoom` are recomputed by the camera every `preRender`; `x/y` is the
 * viewport's own offset (canvas px), set once by `setViewport`. */
export interface CamLike {
  worldView: { x: number; y: number };
  zoom: number;
  x: number;
  y: number;
}

/**
 * Stage-px position of a point already in the world camera's own coordinate space (i.e.
 * `view.toPx(worldPoint)` — the same "panel px at zoom 1" space every game object is positioned
 * in), under the CURRENT `cam` transform (zoom + scroll + the viewport's own offset).
 *
 * Mirrors `Camera.preRender` (see the file above): the visible rect's top-left is
 * `worldView.x/y` and each unit of it maps to `zoom` canvas px, landing at the viewport's own
 * canvas-px offset (`cam.x/y`); dividing by `renderScale` converts canvas px back to stage px
 * (the canvas is `STAGE * renderScale`, and the world camera's zoom carries that same factor —
 * see `BuilderScene.updateCamera`, which sets `zoom = RENDER_SCALE * camCur.zoom`).
 */
export function panelPxToStagePx(p: { x: number; y: number }, cam: CamLike, renderScale: number): { x: number; y: number } {
  return {
    x: ((p.x - cam.worldView.x) * cam.zoom + cam.x) / renderScale,
    y: ((p.y - cam.worldView.y) * cam.zoom + cam.y) / renderScale,
  };
}

/** Clamps a frame so its visible rect (viewW/zoom x worldH/zoom, centred on cx/cy; viewW =
 * `viewWidth(world)`, i.e. worldW for a single-screen world) stays inside the world [0, worldW] x
 * [-groundDepth, worldH - groundDepth] (`groundDepth` default 0, i.e. [0, worldH] as before — a
 * camera frame never needs to know the panel's pixel geometry, only this band). A wide world
 * (worldW > viewW) lets cx range over [viewW/(2 zoom), worldW - viewW/(2 zoom)]. When the
 * visible rect is wider/taller than that band (zoom < 1) the corresponding axis is centred
 * instead of clamped. */
export function clampFrame(f: FrameState, world: WorldDims): FrameState {
  const zoom = Math.max(f.zoom, 1e-6);
  const d = world.groundDepth ?? 0;
  const halfW = viewWidth(world) / zoom / 2;
  const halfH = world.worldH / zoom / 2;
  const clamp1 = (v: number, half: number, lo: number, hi: number): number => {
    if (half * 2 >= hi - lo) return (lo + hi) / 2;
    return Math.max(lo + half, Math.min(hi - half, v));
  };
  return {
    cx: clamp1(f.cx, halfW, 0, world.worldW),
    cy: clamp1(f.cy, halfH, -d, world.worldH - d),
    zoom: f.zoom,
  };
}
