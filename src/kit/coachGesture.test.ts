import { describe, expect, it } from 'vitest';
import { DIAL_DRAG_HAND, DIAL_DRAG_PERIOD_MS, DROP_ARC_PX, dialDragPose, dialOptionAngle, dropPose, slideDragPose } from './coachGesture';
import { dragHandPose } from '../core/coach';
import type { DialWidget, SlideWidget, Vec2 } from './types';
import { layoutWidgets, slideValuePoint, type DialGeom, type SlideGeom } from './widgetLayout';

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

// 2026-10-16: the same stroke on a SLIDE widget (the catapult's arm length) and the 'drop' gesture
// on a SUPPLY BIN tile.
describe('coachGesture: the drag demonstration on a slide', () => {
  const slide: SlideWidget = {
    id: 'arm',
    kind: 'slide',
    from: { x: 10, y: 10 },
    to: { x: 0, y: 10 },
    options: ['1.5', '2', '2.5', '3', '3.5', '4'].map((v) => ({ value: v, label: v })),
    value: '2',
  };
  const [sg] = layoutWidgets([slide], toPx, 1) as [SlideGeom];

  it('null (the plain tap) for an unknown option or the current one', () => {
    expect(slideDragPose(sg, '9', 500)).toBeNull();
    expect(slideDragPose(sg, '2', 500)).toBeNull();
  });

  it('presses the knob, slides it along the straight track to the target, holds, lets go, repeats', () => {
    const to = slideValuePoint(sg, '3.5')!;
    const pose = (t: number) => slideDragPose(sg, '3.5', t)!;
    expect(pose(0)).toMatchObject({ frame: 0, along: 0, alpha: 0, ghost: null, tip: sg.knob });
    const mid = pose(pressedAt + D.move / 2);
    expect(mid.frame).toBe(2);
    expect(mid.tip.x).toBeCloseTo((sg.knob.x + to.x) / 2, 9);
    expect(mid.tip.y).toBeCloseTo(sg.knob.y, 9);
    expect(mid.ghost).toEqual(mid.tip);
    expect(pose(doneMoving + D.hold / 2).tip.x).toBeCloseTo(to.x, 9);
    expect(pose(DIAL_DRAG_PERIOD_MS - 1)).toMatchObject({ alpha: 0, ghost: null });
    expect(pose(DIAL_DRAG_PERIOD_MS + 700)).toEqual(pose(700));
    for (let t = 0; t < DIAL_DRAG_PERIOD_MS; t += 53) {
      const c = dragHandPose(t);
      expect(pose(t).frame).toBe(c.frame);
      expect(pose(t).along).toBeCloseTo(c.rise, 12);
    }
  });
});

describe("coachGesture: the 'drop' demonstration (bin tile -> drop zone)", () => {
  const from = { x: 800, y: 300 };
  const to = { x: 300, y: 500 };
  it('starts on the tile, carries the ghost along an arc over the line, ends on the drop zone', () => {
    expect(dropPose(from, to, 0)).toMatchObject({ frame: 0, alpha: 0, ghost: null, tip: from });
    const pressed = dropPose(from, to, pressedAt - 1);
    expect(pressed.frame).toBe(2);
    expect(pressed.tip).toEqual(from);
    expect(pressed.ghost).toEqual(from);
    const mid = dropPose(from, to, pressedAt + D.move / 2);
    expect(mid.along).toBeCloseTo(0.5, 9);
    expect(mid.tip.x).toBeCloseTo(550, 9);
    expect(mid.tip.y).toBeCloseTo(400 - DROP_ARC_PX, 9); // lifted over the straight line
    expect(mid.ghost).toEqual(mid.tip);
    const held = dropPose(from, to, doneMoving + D.hold / 2);
    expect(held.tip.x).toBeCloseTo(to.x, 9);
    expect(held.tip.y).toBeCloseTo(to.y, 9);
    expect(held.ghost).toEqual(held.tip);
    expect(dropPose(from, to, DIAL_DRAG_PERIOD_MS - 1)).toMatchObject({ alpha: 0, ghost: null });
    expect(dropPose(from, to, DIAL_DRAG_PERIOD_MS + 900)).toEqual(dropPose(from, to, 900));
  });
  it("uses the drag hand's frames and fades", () => {
    for (let t = 0; t < DIAL_DRAG_PERIOD_MS; t += 41) {
      const c = dragHandPose(t);
      const p = dropPose(from, to, t);
      expect(p.frame).toBe(c.frame);
      expect(p.alpha).toBeCloseTo(c.alpha, 12);
    }
  });
});
