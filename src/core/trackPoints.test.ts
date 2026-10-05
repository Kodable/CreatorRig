import { describe, expect, it } from 'vitest';
import type { FinishZone, SimConstants, TrackPoint } from './types';
import {
  LOOP_PITCH,
  LOOP_RADIUS,
  LOOP_STEPS,
  clonePoints,
  expandTrackPoints,
  insertionIndex,
} from './trackPoints';
import { buildTrack } from './track';
import { CartSim } from './sim';
import { RunMeters } from './meters';
import { FIXED_DT } from './stepper';
import { evaluateGoals, allPass } from './goals';
import { LEVELS, findLevel } from './levels';

function loopTrackPoints(startY: number): TrackPoint[] {
  return [
    { x: 4, y: startY, kind: 'curve' },
    { x: 30, y: 3, kind: 'loop' },
    { x: 56, y: 3, kind: 'curve' },
  ];
}

function ride(points: TrackPoint[], c?: Partial<SimConstants>, finish?: FinishZone) {
  const track = buildTrack(expandTrackPoints(points).pts);
  if (!track) throw new Error('no track');
  const sim = new CartSim(track, c);
  const meters = new RunMeters();
  meters.reset();
  for (let i = 0; i < 60 * 90 && sim.outcome === 'running'; i++) {
    sim.step();
    meters.observe(sim.snapshot(), FIXED_DT);
  }
  return { track, sim, metrics: meters.toMetrics(track, finish) };
}

describe('expandTrackPoints', () => {
  it('expands all-curve points to identity copies with identity owners', () => {
    const points: TrackPoint[] = [
      { x: 0, y: 0, kind: 'curve' },
      { x: 5, y: 2, kind: 'curve', locked: true },
      { x: 10, y: -1, kind: 'curve' },
    ];
    const { pts, owner } = expandTrackPoints(points);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 2 },
      { x: 10, y: -1 },
    ]);
    expect(owner).toEqual([0, 1, 2]);
  });

  it('expands a loop point into 9 points on the loop circle with correct owners', () => {
    const points: TrackPoint[] = [
      { x: 4, y: 24, kind: 'curve' },
      { x: 30, y: 3, kind: 'loop' },
      { x: 56, y: 3, kind: 'curve' },
    ];
    const { pts, owner } = expandTrackPoints(points);

    expect(pts).toHaveLength(11);
    expect(owner).toEqual([0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2]);

    // travel is rightward (p0.x=4 < p2.x=56), so sign = 1
    const cx = 30;
    const cy = 3 + LOOP_RADIUS;
    for (let k = 0; k <= LOOP_STEPS; k++) {
      const shift = -LOOP_PITCH / 2 + (LOOP_PITCH * k) / LOOP_STEPS;
      const p = pts[1 + k]!;
      const dx = p.x - shift - cx;
      const dy = p.y - cy;
      expect(Math.hypot(dx, dy)).toBeCloseTo(LOOP_RADIUS, 6);
    }
  });

  it('builds a track from the loop expansion with exactly one detected loop', () => {
    const track = buildTrack(expandTrackPoints(loopTrackPoints(24)).pts)!;
    expect(track.loops.length).toBe(1);
  });

  it('also detects a loop on a leftward track', () => {
    const points: TrackPoint[] = [
      { x: 56, y: 24, kind: 'curve' },
      { x: 30, y: 3, kind: 'loop' },
      { x: 4, y: 3, kind: 'curve' },
    ];
    const track = buildTrack(expandTrackPoints(points).pts)!;
    expect(track.loops.length).toBe(1);
  });
});

describe('clonePoints', () => {
  it('deep-copies points, preserving kind and locked', () => {
    const points: TrackPoint[] = [
      { x: 1, y: 2, kind: 'curve' },
      { x: 3, y: 4, kind: 'loop', locked: true },
    ];
    const clone = clonePoints(points);

    expect(clone).toEqual(points);
    expect(clone).not.toBe(points);
    expect(clone[0]).not.toBe(points[0]);

    clone[0]!.x = 999;
    expect(points[0]!.x).toBe(1);

    expect('locked' in clone[0]!).toBe(false);
    expect(clone[1]!.locked).toBe(true);
  });
});

describe('riding a loop built from TrackPoints', () => {
  it('completes the loop from a high start', () => {
    const { sim, metrics } = ride(loopTrackPoints(24), { MU: 0, DRAG: 0 });
    expect(sim.outcome).toBe('reachedEnd');
    expect(metrics.loopsCompleted).toBe(1);
  });

  it('falls off the loop from a low start with no stick allowance', () => {
    const { sim } = ride(loopTrackPoints(12), { MU: 0, DRAG: 0, STICK: 0 });
    expect(sim.outcome).toBe('fell');
  });
});

describe('insertionIndex', () => {
  const flat: TrackPoint[] = [
    { x: 0, y: 5, kind: 'curve' },
    { x: 20, y: 5, kind: 'curve' },
    { x: 40, y: 5, kind: 'curve' },
  ];

  it('maps a tap near the first segment to index 0', () => {
    expect(insertionIndex(flat, { x: 10, y: 5.2 }, 1)).toBe(0);
  });

  it('maps a tap near the second segment to index 1', () => {
    expect(insertionIndex(flat, { x: 30, y: 5.1 }, 1)).toBe(1);
  });

  it('returns null when the tap is too far from the track', () => {
    expect(insertionIndex(flat, { x: 30, y: 12 }, 1)).toBeNull();
  });

  it('returns null with fewer than two points', () => {
    expect(insertionIndex([flat[0]!], { x: 10, y: 5.2 }, 1)).toBeNull();
  });

  it('returns null when the two nearest points are both locked', () => {
    const locked: TrackPoint[] = [{ ...flat[0]!, locked: true }, { ...flat[1]!, locked: true }, flat[2]!];
    expect(insertionIndex(locked, { x: 10, y: 5.2 }, 1)).toBeNull();
  });

  it('still inserts when only one bracketing point is locked', () => {
    const oneLocked: TrackPoint[] = [{ ...flat[0]!, locked: true }, flat[1]!, flat[2]!];
    expect(insertionIndex(oneLocked, { x: 10, y: 5.2 }, 1)).toBe(0);
  });
});

describe('level "complete"', () => {
  it('is inserted at index 1 with an all-locked preset and a finish zone', () => {
    expect(LEVELS[1]!.id).toBe('complete');
    LEVELS[1]!.preset!.forEach((p) => expect(p.locked).toBe(true));
    expect(findLevel('complete')!.finish).toBeDefined();
  });

  it('reaches the end but misses the finish zone with only the preset', () => {
    const level = findLevel('complete')!;
    const { sim, metrics } = ride(level.preset!, undefined, level.finish);
    expect(sim.outcome).toBe('reachedEnd');
    expect(metrics.atFinish).toBe(0);
  });

  it('reaches the finish zone and passes both goals once extended to the flag', () => {
    const level = findLevel('complete')!;
    const points: TrackPoint[] = [...level.preset!, { x: 40, y: 4, kind: 'curve' }, { x: 54, y: 3, kind: 'curve' }];
    const { metrics } = ride(points, undefined, level.finish);
    expect(metrics.atFinish).toBe(1);
    expect(allPass(evaluateGoals(level.goals, metrics))).toBe(true);
  });
});
