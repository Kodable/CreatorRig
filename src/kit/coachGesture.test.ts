import { describe, expect, it } from 'vitest';
import { DIAL_DRAG_HAND, DIAL_DRAG_PERIOD_MS, dialDragPose, dialOptionAngle } from './coachGesture';
import { dragHandPose } from '../core/coach';
import type { DialWidget, Vec2 } from './types';
import { layoutWidgets, type DialGeom } from './widgetLayout';

// A five-notch dial like the catapult's angle lever: 15..75 over a quarter turn, handle at 30.
const toPx = (v: Vec2): Vec2 => ({ x: v.x * 10, y: 500 - v.y * 10 });
const dial: DialWidget = {
  id: 'angle',
  kind: 'dial',
  pivot: { x: 10, y: 10 },
  radiusPx: 0,
  radiusM: 5,
  arcFrom: Math.PI / 2,
  arcTo: Math.PI,
  options: ['15', '30', '45', '60', '75'].map((v) => ({ value: v, label: `${v}°` })),
  value: '30',
  track: 'none',
  readout: 'knob',
  notches: false,
  size: 56,
};
const [geom] = layoutWidgets([dial], toPx, 1) as [DialGeom];
const D = DIAL_DRAG_HAND;
const pressedAt = D.fadeIn + D.press;
const doneMoving = pressedAt + D.move;

describe('coachGesture: the drag demonstration on a dial', () => {
  it("uses the coaster's drag-hand stroke (2.65 s: fade in, press, move, hold, release, fade, pause)", () => {
    expect(D).toEqual({ fadeIn: 250, press: 250, move: 900, hold: 150, release: 200, fadeOut: 300, pause: 600 });
    expect(DIAL_DRAG_PERIOD_MS).toBe(2650);
  });

  it('dialOptionAngle: the same spacing the dial lays its options out with, null for an unknown one', () => {
    expect(dialOptionAngle(geom, '15')).toBeCloseTo(Math.PI / 2, 12);
    expect(dialOptionAngle(geom, '75')).toBeCloseTo(Math.PI, 12);
    expect(dialOptionAngle(geom, '30')).toBeCloseTo(geom.handleAngle, 12);
    expect(dialOptionAngle(geom, '90')).toBeNull();
  });

  it('null (the plain tap) when the target is not an option or is where the handle already is', () => {
    expect(dialDragPose(geom, '90', 500)).toBeNull();
    expect(dialDragPose(geom, '30', 500)).toBeNull();
  });

  it('presses on the knob (frames 0 -> 1 -> 2), slides along the arc to the target while pressed, ' +
    'holds there, lets go (2 -> 1 -> 0), fades and pauses, then repeats', () => {
    const from = geom.handleAngle;
    const to = dialOptionAngle(geom, '60')!;
    const pose = (t: number) => dialDragPose(geom, '60', t)!;
    // Fading in on the knob, finger out, no ghost yet.
    expect(pose(0)).toMatchObject({ frame: 0, along: 0, alpha: 0, ghost: null });
    expect(pose(D.fadeIn / 2).alpha).toBeCloseTo(0.5, 9);
    expect(pose(D.fadeIn / 2).angle).toBeCloseTo(from, 12);
    // The press: the three frames in turn, still on the knob.
    expect([D.fadeIn + 1, D.fadeIn + D.press / 2, pressedAt - 1].map((t) => pose(t).frame)).toEqual([0, 1, 2]);
    // Pressed and moving: the ghost knob rides under the fingertip, which is on the arc.
    const mid = pose(pressedAt + D.move / 2);
    expect(mid.frame).toBe(2);
    expect(mid.along).toBeCloseTo(0.5, 9);
    expect(mid.angle).toBeCloseTo((from + to) / 2, 9);
    expect(mid.ghost).toEqual(mid.tip);
    expect(Math.hypot(mid.tip.x - geom.pivot.x, mid.tip.y - geom.pivot.y)).toBeCloseTo(geom.radiusPx, 9);
    // Eased: slow at both ends of the move.
    expect(pose(pressedAt + D.move * 0.1).along).toBeLessThan(0.1);
    expect(pose(pressedAt + D.move * 0.9).along).toBeGreaterThan(0.9);
    // Hold at the target: the tip is exactly the target option's spot.
    const held = pose(doneMoving + D.hold / 2);
    expect(held).toMatchObject({ frame: 2, along: 1, alpha: 1 });
    expect(held.angle).toBeCloseTo(to, 12);
    expect(held.tip.x).toBeCloseTo(geom.pivot.x + geom.radiusPx * Math.cos(to), 9);
    expect(held.tip.y).toBeCloseTo(geom.pivot.y - geom.radiusPx * Math.sin(to), 9);
    // The release: frames back to 0, still at the target.
    const releaseAt = doneMoving + D.hold;
    expect([releaseAt + 1, releaseAt + D.release / 2, releaseAt + D.release - 1].map((t) => pose(t).frame)).toEqual([2, 1, 0]);
    // Fading out, then nothing during the pause.
    expect(pose(releaseAt + D.release + D.fadeOut / 2).alpha).toBeCloseTo(0.5, 9);
    expect(pose(DIAL_DRAG_PERIOD_MS - 1)).toMatchObject({ alpha: 0, ghost: null });
    // Repeats.
    expect(pose(DIAL_DRAG_PERIOD_MS + 400)).toEqual(pose(400));
  });

  it("matches the coaster's stroke frame for frame, only along the arc", () => {
    for (let t = 0; t < DIAL_DRAG_PERIOD_MS; t += 37) {
      const p = dialDragPose(geom, '75', t)!;
      const c = dragHandPose(t);
      expect(p.frame).toBe(c.frame);
      expect(p.alpha).toBeCloseTo(c.alpha, 12);
      expect(p.along).toBeCloseTo(c.rise, 12);
    }
  });

  it('runs downward when the target is below the handle', () => {
    const top = { ...geom, value: '75', handleAngle: dialOptionAngle(geom, '75')! };
    const p = dialDragPose(top, '45', doneMoving + 1)!;
    expect(p.angle).toBeCloseTo(dialOptionAngle(geom, '45')!, 12);
  });
});
