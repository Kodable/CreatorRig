// The coach hand's drag demonstration on a dial (`CoachStep.gesture`, src/kit/types.ts), as pure
// pose maths: BuilderScene only places the glove and the ghost handle where this says. 2026-10-15
// (Gao: "add a drag tutorial on level 2", the catapult's angle lever): the glove presses on the
// knob, slides along the dial's arc to a higher notch while pressed, lets go, fades, pauses and
// repeats. The timing is the coaster's level-1 drag hand (src/core/coach.ts `dragHandPose`), so
// both courses' drag tutorials feel the same; only the path differs (an arc, not straight up).
import { dragHandPose, DRAG_HAND, DRAG_HAND_PERIOD_MS } from '../core/coach';
import type { Vec2 } from './types';
import { dialPoint, slideValuePoint, type DialGeom, type SlideGeom } from './widgetLayout';

export { DRAG_HAND as DIAL_DRAG_HAND, DRAG_HAND_PERIOD_MS as DIAL_DRAG_PERIOD_MS };

export interface DialDragPose {
  /** Index into the glove's 3 frames (0 = finger out, 2 = pressed). */
  frame: 0 | 1 | 2;
  /** 0..1 of the way from the handle's current angle to the target's (eased). */
  along: number;
  /** World-axis angle (radians, CCW, 0 = +x) the fingertip is at. */
  angle: number;
  /** The fingertip, stage px: on the dial's arc at `angle`. */
  tip: Vec2;
  /** The glove's opacity, 0..1 (0 during the pause between strokes). */
  alpha: number;
  /** Where the faint ghost handle sits (stage px), or null when the finger is not pressed: it rides
   * under the pressed finger and stays at the target through the hold, like the coaster's ghost
   * station. */
  ghost: Vec2 | null;
}

/** World-axis angle of option `value` on the laid-out dial, or null when it has no such option. */
export function dialOptionAngle(geom: DialGeom, value: string): number | null {
  const n = geom.options.length;
  const i = geom.options.findIndex((o) => o.value === value);
  if (i === -1) return null;
  return n > 1 ? geom.arcFrom + ((geom.arcTo - geom.arcFrom) * i) / (n - 1) : geom.arcFrom;
}

/** The glove's pose `tMs` after the drag step started, from the dial's current handle to option
 * `toValue`. Null (the scene falls back to the plain tap) when the dial has no such option or the
 * handle is already there. */
export function dialDragPose(geom: DialGeom, toValue: string, tMs: number): DialDragPose | null {
  const to = dialOptionAngle(geom, toValue);
  if (to === null || toValue === geom.value) return null;
  const from = geom.handleAngle;
  const p = dragHandPose(tMs);
  const angle = from + (to - from) * p.rise;
  const tip = dialPoint(geom.pivot, geom.radiusPx, angle);
  const pressed = p.alpha > 0 && (p.frame === 2 || p.rise > 0);
  return { frame: p.frame, along: p.rise, angle, tip, alpha: p.alpha, ghost: pressed ? tip : null };
}

/** The glove's pose on a straight stroke (a slide's knob, a bin tile's ghost): the same fields as
 * the dial's, with the fingertip on the path instead of an arc. */
export interface StrokePose {
  frame: 0 | 1 | 2;
  /** 0..1 of the way from the start to the end (eased). */
  along: number;
  /** The fingertip, stage px. */
  tip: Vec2;
  alpha: number;
  /** The ghost under the pressed finger (stage px), or null when the finger is not pressed. */
  ghost: Vec2 | null;
}

/** 2026-10-16: the drag demonstration on a SLIDE widget (the catapult's arm-length handle): the
 * glove presses the knob, slides it along the track to option `toValue`, lets go, fades, repeats
 * (the dial's stroke, straight). Null (the plain tap) when the slide has no such option or the
 * knob is already there. */
export function slideDragPose(geom: SlideGeom, toValue: string, tMs: number): StrokePose | null {
  const to = slideValuePoint(geom, toValue);
  if (!to || toValue === geom.value) return null;
  const from = geom.knob;
  const p = dragHandPose(tMs);
  const tip = { x: from.x + (to.x - from.x) * p.rise, y: from.y + (to.y - from.y) * p.rise };
  const pressed = p.alpha > 0 && (p.frame === 2 || p.rise > 0);
  return { frame: p.frame, along: p.rise, tip, alpha: p.alpha, ghost: pressed ? tip : null };
}

/** How high (stage px) the 'drop' stroke arcs over the straight line from the bin to the machine,
 * at its middle: the ghost is lifted out of the bin and set down, not dragged along the floor. */
export const DROP_ARC_PX = 60;

/** 2026-10-16: the 'drop' demonstration on a SUPPLY BIN tile (`CoachGesture` 'drop'): the glove
 * presses the tile at `from`, carries a ghost of its picture along a gentle arc to the drop zone
 * at `to` (stage px both), lets go there, fades, pauses and repeats: the drag hand's 2.65 s stroke.
 * The ghost rides under the pressed finger and stays at the drop zone through the hold. */
export function dropPose(from: Vec2, to: Vec2, tMs: number): StrokePose {
  const p = dragHandPose(tMs);
  const k = p.rise;
  const tip = {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k - Math.sin(Math.PI * k) * DROP_ARC_PX,
  };
  const pressed = p.alpha > 0 && (p.frame === 2 || p.rise > 0);
  return { frame: p.frame, along: k, tip, alpha: p.alpha, ghost: pressed ? tip : null };
}
