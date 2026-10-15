import { describe, expect, it } from 'vitest';
import { LEVELS, findLevel } from './levels';
import {
  DRAG_HAND, DRAG_HAND_PERIOD_MS, LOOP_HAND_TAPS, TAP_PERIOD_MS,
  coachSteps, dragHandPose, nextCoachStep, pointAdded, stationMoved, tapHandFrame,
} from './coach';
import { insertionIndex } from './trackPoints';
import type { CoachStep } from './types';

describe('coaster tutorial hand (2026-10-15)', () => {
  it('level 1: drag the station, then the fuzz button, then Play', () => {
    const steps = coachSteps(LEVELS[0]!);
    expect(steps).toEqual(['drag-station', 'skin', 'play']);
    const done = new Set<CoachStep>();
    expect(nextCoachStep(steps, done)).toBe('drag-station');
    done.add('drag-station');
    expect(nextCoachStep(steps, done)).toBe('skin');
    done.add('skin');
    expect(nextCoachStep(steps, done)).toBe('play');
    done.add('play');
    expect(nextCoachStep(steps, done)).toBeNull();
  });

  it('a step done early is skipped (Play pressed before the fuzz button)', () => {
    const steps = coachSteps(LEVELS[0]!);
    expect(nextCoachStep(steps, new Set<CoachStep>(['drag-station', 'play']))).toBe('skin');
    expect(nextCoachStep(steps, new Set<CoachStep>(['play']))).toBe('drag-station');
  });

  it('level 2 taps an empty sky spot (not on the track) toward the flag; the loop lesson taps Loop', () => {
    const complete = findLevel('complete')!;
    expect(coachSteps(complete)).toEqual(['add-point']);
    const spot = complete.coachSpot!;
    const preset = complete.preset!;
    expect(spot.x).toBeGreaterThan(preset[preset.length - 1]!.x);
    expect(spot.x).toBeLessThan(complete.finish!.x);
    // a tap there appends (it is not on the preset's rail)
    expect(insertionIndex(preset, spot, 20 / 16)).toBeNull();
    expect(coachSteps(findLevel('loop')!)).toEqual(['loop-tool']);
  });

  it('only levels 1, 2 and the loop lesson have a hand', () => {
    expect(LEVELS.filter((l) => coachSteps(l).length > 0).map((l) => l.id)).toEqual(['drop', 'complete', 'loop']);
  });

  it('the drag step is done once the station moves; the add step once a point is added', () => {
    const preset = LEVELS[0]!.preset!;
    expect(stationMoved(preset, preset)).toBe(false);
    expect(stationMoved(preset, [{ ...preset[0]!, y: 15 }, preset[1]!])).toBe(true);
    const p2 = findLevel('complete')!.preset!;
    expect(pointAdded(p2, p2)).toBe(false);
    expect(pointAdded(p2, [...p2, { x: 40, y: 5, kind: 'curve' }])).toBe(true);
  });

  it('the drag-up stroke: press, slide up while pressed, release at the top, fade, pause', () => {
    expect(dragHandPose(0)).toMatchObject({ frame: 0, rise: 0, alpha: 0 });
    const pressedAt = DRAG_HAND.fadeIn + DRAG_HAND.press - 1;
    expect(dragHandPose(pressedAt)).toMatchObject({ frame: 2, rise: 0, alpha: 1 });
    const mid = dragHandPose(DRAG_HAND.fadeIn + DRAG_HAND.press + DRAG_HAND.move / 2);
    expect(mid.frame).toBe(2);
    expect(mid.rise).toBeCloseTo(0.5, 5);
    const top = dragHandPose(DRAG_HAND.fadeIn + DRAG_HAND.press + DRAG_HAND.move + 1);
    expect(top).toMatchObject({ frame: 2, rise: 1, alpha: 1 });
    const released = dragHandPose(DRAG_HAND.fadeIn + DRAG_HAND.press + DRAG_HAND.move + DRAG_HAND.hold + DRAG_HAND.release + 1);
    expect(released).toMatchObject({ frame: 0, rise: 1 });
    expect(dragHandPose(DRAG_HAND_PERIOD_MS - 1).alpha).toBe(0);
    // it repeats
    expect(dragHandPose(DRAG_HAND_PERIOD_MS + 10)).toEqual(dragHandPose(10));
    // the rise never runs backwards inside a stroke
    let last = 0;
    for (let t = 0; t < DRAG_HAND_PERIOD_MS; t += 10) {
      const r = dragHandPose(t).rise;
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });

  it('a tap: finger out, bend, pressed, back, rest; the Loop hand gives a few taps', () => {
    const frames = new Set<number>();
    for (let t = 0; t < TAP_PERIOD_MS; t += 10) frames.add(tapHandFrame(t));
    expect([...frames].sort()).toEqual([0, 1, 2]);
    expect(tapHandFrame(TAP_PERIOD_MS - 1)).toBe(0);
    expect(LOOP_HAND_TAPS).toBeGreaterThanOrEqual(2);
    expect(LOOP_HAND_TAPS).toBeLessThanOrEqual(3);
  });
});
