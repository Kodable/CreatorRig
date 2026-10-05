import { describe, expect, it } from 'vitest';
import { buildTrack } from './track';
import { CartSim, DEFAULTS } from './sim';
import { RunMeters } from './meters';
import { evaluateGoals, allPass } from './goals';
import { findLevel } from './levels';
import { FIXED_DT } from './stepper';
import { expandTrackPoints } from './trackPoints';
import type { FinishZone, TrackPoint } from './types';

function ride(points: TrackPoint[], c?: Partial<typeof DEFAULTS>, finish?: FinishZone) {
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

describe('track + sim integration', () => {
  it('rides the level 1 preset to the end', () => {
    const level = findLevel('drop')!;
    const { sim, metrics } = ride(level.preset!);
    expect(sim.outcome).toBe('reachedEnd');
    expect(metrics.maxDrop).toBeCloseTo(10, 0);
    // free fall from 10 m is 14.0 m/s; friction and drag take a little
    expect(metrics.maxSpeed).toBeGreaterThan(12);
    expect(metrics.maxSpeed).toBeLessThan(14.1);
    expect(metrics.reachedEnd).toBe(1);
  });

  it('passes level 1 when the station is high enough', () => {
    const level = findLevel('drop')!;
    const { metrics } = ride([{ x: 8, y: 20, kind: 'curve' }, { x: 52, y: 4, kind: 'curve' }], undefined, level.finish);
    expect(allPass(evaluateGoals(level.goals, metrics))).toBe(true);
  });

  it('conserves energy on a spline valley with no friction', () => {
    const track = buildTrack([{ x: 5, y: 25 }, { x: 20, y: 6 }, { x: 30, y: 3 }, { x: 40, y: 6 }, { x: 55, y: 25 }])!;
    const sim = new CartSim(track, { MU: 0, DRAG: 0, V0: 0.5 });
    const e0 = 0.5 * 0.5 * 0.5 + DEFAULTS.G * track.lookup(0).pos.y;
    let worst = 0;
    for (let i = 0; i < 60 * 15 && sim.outcome === 'running'; i++) {
      sim.step();
      const snap = sim.snapshot();
      const e = 0.5 * snap.v * snap.v + DEFAULTS.G * snap.pos.y;
      worst = Math.max(worst, Math.abs(e - e0) / e0);
    }
    expect(worst).toBeLessThan(0.01);
  });

  it('detects and completes a loop from a high start, and falls from a low one', () => {
    // A loop of radius about 5 m centered near (30, 8), entered from the left.
    const loopPts = (startY: number): TrackPoint[] => {
      const pts: TrackPoint[] = [{ x: 4, y: startY, kind: 'curve' }, { x: 22, y: 3, kind: 'curve' }];
      const cx = 30, cy = 8, r = 5;
      for (let k = 1; k <= 7; k++) {
        const a = -Math.PI / 2 + (k * 2 * Math.PI) / 8;
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), kind: 'curve' });
      }
      pts.push({ x: 38, y: 3, kind: 'curve' }, { x: 56, y: 3, kind: 'curve' });
      return pts;
    };
    const high = ride(loopPts(28), { MU: 0, DRAG: 0 });
    expect(high.track.loops.length).toBe(1);
    expect(high.sim.outcome).toBe('reachedEnd');
    expect(high.metrics.loopsCompleted).toBe(1);

    const low = ride(loopPts(12), { MU: 0, DRAG: 0 });
    expect(low.track.loops.length).toBe(1);
    expect(low.sim.outcome).toBe('fell');
    expect(low.metrics.loopsCompleted).toBe(0);
  });
});
