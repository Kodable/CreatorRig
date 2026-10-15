import type { CoachStep, Level, TrackPoint } from './types';

/**
 * The coaster's tutorial hand (2026-10-15, Gao: "show the tutorial hand dragging up to increase
 * the height"). Pure: which step shows, and the glove's pose over time. The glove is the builder
 * kit's 3-frame hand (public/ui/hand_01..03.png: the hand holds still and only the index finger
 * bends; frame index 0 = finger out, 2 = pressed). CoasterScene draws the in-scene steps
 * ('drag-station', 'drag-top', 'add-point'), the HUD the bar-button steps ('skin', 'play',
 * 'loop-tool'). 'drag-top' is the same drag-up stroke as 'drag-station', on the level's
 * vertical-only point (the air time lesson's hump top) instead of the station.
 */

/** A level's steps in order (none when the level has no hand). */
export function coachSteps(level: Level): readonly CoachStep[] {
  return level.coach ?? [];
}

/** The first step not done yet, or null when every step is done (the hand is gone for good on
 * this level load). Steps are done by the child's action whenever it happens, so a child who
 * presses Play early never sees the Play hand. */
export function nextCoachStep(steps: readonly CoachStep[], done: ReadonlySet<CoachStep>): CoachStep | null {
  for (const s of steps) if (!done.has(s)) return s;
  return null;
}

/** The station moved off its preset height (the 'drag-station' step is done). */
export function stationMoved(preset: readonly TrackPoint[], points: readonly TrackPoint[]): boolean {
  const a = preset[0];
  const b = points[0];
  if (!a || !b) return false;
  return Math.abs(a.y - b.y) > 1e-6 || Math.abs(a.x - b.x) > 1e-6;
}

/** The index of the point the 'drag-top' hand drags: the first unlocked point flagged `vertical`
 * (the air time lesson's hump top), or -1. */
export function dragTopIndex(points: readonly TrackPoint[]): number {
  return points.findIndex((p) => p.vertical && !p.locked);
}

/** The vertical-only point moved off its preset height (the 'drag-top' step is done). */
export function topMoved(preset: readonly TrackPoint[], points: readonly TrackPoint[]): boolean {
  const i = dragTopIndex(preset);
  if (i < 0) return false;
  const a = preset[i]!;
  const b = points[i];
  return !!b && (Math.abs(a.y - b.y) > 1e-6 || Math.abs(a.x - b.x) > 1e-6);
}

/** The child added a point to the preset (the 'add-point' step is done). */
export function pointAdded(preset: readonly TrackPoint[], points: readonly TrackPoint[]): boolean {
  return points.length > preset.length;
}

// ---- the drag-up stroke (the 'drag-station' hand) ----

/** One drag-up stroke, in ms: fade in on the station, press (finger 1 -> 2 -> 3), slide straight up
 * DRAG_RISE_PX while pressed (ease in-out), hold, release (3 -> 2 -> 1), fade out at the top, pause
 * with no hand, repeat. */
export const DRAG_HAND = {
  fadeIn: 250,
  press: 250,
  move: 900,
  hold: 150,
  release: 200,
  fadeOut: 300,
  pause: 600,
} as const;
export const DRAG_HAND_PERIOD_MS = Object.values(DRAG_HAND).reduce((a, b) => a + b, 0);
/** How far up the stroke goes, stage px (16 px = 1 m: 140 px = 8.75 m, the level-1 station from
 * 14 m to 22.75 m, well past the 19 m the 15 m drop needs). */
export const DRAG_RISE_PX = 140;
/** The 'drag-top' stroke is shorter (80 px = 5 m): the air time lesson's hump top from 5 m to
 * 10 m, the middle of the heights that float the fuzz for half a second (levels.test.ts). */
export const DRAG_TOP_RISE_PX = 80;

export interface DragHandPose {
  /** Index into the 3 glove frames (0 = finger out, 2 = pressed). */
  frame: 0 | 1 | 2;
  /** 0 at the station, 1 at the top of the stroke. */
  rise: number;
  /** 0..1; 0 during the pause. */
  alpha: number;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** The glove's pose `tMs` after the step started. */
export function dragHandPose(tMs: number): DragHandPose {
  const D = DRAG_HAND;
  let t = ((tMs % DRAG_HAND_PERIOD_MS) + DRAG_HAND_PERIOD_MS) % DRAG_HAND_PERIOD_MS;
  if (t < D.fadeIn) return { frame: 0, rise: 0, alpha: t / D.fadeIn };
  t -= D.fadeIn;
  if (t < D.press) return { frame: Math.min(2, Math.floor((t / D.press) * 3)) as 0 | 1 | 2, rise: 0, alpha: 1 };
  t -= D.press;
  if (t < D.move) return { frame: 2, rise: easeInOut(t / D.move), alpha: 1 };
  t -= D.move;
  if (t < D.hold) return { frame: 2, rise: 1, alpha: 1 };
  t -= D.hold;
  if (t < D.release) return { frame: (2 - Math.min(2, Math.floor((t / D.release) * 3))) as 0 | 1 | 2, rise: 1, alpha: 1 };
  t -= D.release;
  if (t < D.fadeOut) return { frame: 0, rise: 1, alpha: 1 - t / D.fadeOut };
  return { frame: 0, rise: 1, alpha: 0 };
}

// ---- the tap (every other step) ----

/** One tap, in ms: finger out, bend (1 -> 2), pressed (3), back (2), rest with the finger out. A
 * rest after each tap so it reads as "tap here" rather than a jitter. */
export const TAP_HAND = { out: 120, bend: 120, pressed: 200, back: 120, rest: 540 } as const;
export const TAP_PERIOD_MS = Object.values(TAP_HAND).reduce((a, b) => a + b, 0);
/** The Loop button's hand taps this many times, then leaves (the NEW badge stays). */
export const LOOP_HAND_TAPS = 3;

/** The glove frame `tMs` after a tapping hand appeared. */
export function tapHandFrame(tMs: number): 0 | 1 | 2 {
  const T = TAP_HAND;
  const t = ((tMs % TAP_PERIOD_MS) + TAP_PERIOD_MS) % TAP_PERIOD_MS;
  if (t < T.out) return 0;
  if (t < T.out + T.bend) return 1;
  if (t < T.out + T.bend + T.pressed) return 2;
  if (t < T.out + T.bend + T.pressed + T.back) return 1;
  return 0;
}
