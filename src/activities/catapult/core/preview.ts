// The shot preview (Gao, 2026-10-15: "add a dotted line that fades out relatively quickly that
// shows the trajectory" ... "i want the preview"; this overrides the 2026-09-16 "no guideline arc"
// note): a dotted arc of where the fuzz will fly from the current settings, from the cup's release
// point to the first thing it would touch (a can, a block, a shelf, a wall, the ground). It shows
// after each change that moves the shot, once on level load (after Bruno's intro) and again
// between shots, and stays at full strength until FIRE (2026-10-15, Gao: "make the dotted line not
// fade out until fired"; it first faded after 1.5 s). Pure: the sim hands in the release point and velocity (build.ts `catapultRelease`,
// exactly what the shot uses) and a ray cast against its own world's colliders; nothing here
// touches the physics, so shots and metrics are unchanged.
import type { OverlayItem, Vec2 } from '../../../kit/types';

/** Metres of arc between two dots. */
export const PREVIEW_SPACING = 0.45;
/** The flight is sampled every PREVIEW_DT seconds for at most PREVIEW_MAX_T (a Low shot lands in
 * ~1 s, a Max 45-degree one crosses the 30 m world in ~2 s). */
export const PREVIEW_DT = 1 / 60;
export const PREVIEW_MAX_T = 4;
/** The dot: a white core over a slightly bigger, soft dark disc (its outline), so it reads on the
 * blue sky and the green grass alike. Radii in screen px at any camera zoom (`screen` dots). */
export const PREVIEW_CORE_R = 3;
export const PREVIEW_RIM_R = 4.5;
const CORE_ALPHA = 0.95;
const RIM_ALPHA = 0.45;
const RIM_COLOR = 0x1d2b3a;

/** First hit along the segment a -> b, as 0..1 of the way, or null when it is clear. */
export type SegmentCast = (a: Vec2, b: Vec2) => number | null;

/** The fuzz's flight from `tip` at velocity `v` under `gravity` (m/s^2, negative = down), as a
 * polyline sampled every PREVIEW_DT seconds, cut at the first hit `cast` reports (the hit point is
 * the last point) or at PREVIEW_MAX_T. */
export function flightPath(tip: Vec2, v: Vec2, gravity: number, cast: SegmentCast): Vec2[] {
  const at = (t: number): Vec2 => ({ x: tip.x + v.x * t, y: tip.y + v.y * t + 0.5 * gravity * t * t });
  const path: Vec2[] = [{ ...tip }];
  const steps = Math.round(PREVIEW_MAX_T / PREVIEW_DT);
  let prev = path[0]!;
  for (let i = 1; i <= steps; i++) {
    const next = at(i * PREVIEW_DT);
    const f = cast(prev, next);
    if (f !== null) {
      const k = Math.max(0, Math.min(1, f));
      path.push({ x: prev.x + (next.x - prev.x) * k, y: prev.y + (next.y - prev.y) * k });
      return path;
    }
    path.push(next);
    prev = next;
  }
  return path;
}

/** Points every PREVIEW_SPACING metres along `path` (by arc length), starting at its first point;
 * the last partial gap gets no dot. */
export function dotsAlong(path: Vec2[], spacing = PREVIEW_SPACING): Vec2[] {
  if (path.length === 0) return [];
  const out: Vec2[] = [{ ...path[0]! }];
  let need = spacing; // arc length to the next dot
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let used = 0;
    while (len - used >= need - 1e-12) {
      used += need;
      const k = used / len;
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      need = spacing;
    }
    need -= len - used;
  }
  return out;
}

/** The arc's strength `age` seconds after it was shown: 1 while shown (until FIRE), 0 before it was
 * shown or once FIRE hid it. */
export function previewAlpha(age: number): number {
  // Shown (a finite age since showPreview) = full strength; never shown or hidden by FIRE
  // (previewShownAt = -Infinity, so age = Infinity) = nothing.
  return age >= 0 && Number.isFinite(age) ? 1 : 0;
}

/** The dots as overlay items at strength `alpha` (per dot its dark rim, then its white core);
 * nothing at 0. */
export function previewOverlay(dots: Vec2[], alpha: number): OverlayItem[] {
  if (alpha <= 0) return [];
  const out: OverlayItem[] = [];
  for (const p of dots) {
    out.push({ kind: 'dot', p, r: PREVIEW_RIM_R, color: RIM_COLOR, alpha: RIM_ALPHA * alpha, screen: true });
    out.push({ kind: 'dot', p, r: PREVIEW_CORE_R, color: 0xffffff, alpha: CORE_ALPHA * alpha, screen: true });
  }
  return out;
}
