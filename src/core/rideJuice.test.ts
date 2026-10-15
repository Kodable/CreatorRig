import { describe, expect, it } from 'vitest';
import { buildTrack } from './track';
import { CartSim } from './sim';
import { expandTrackPoints } from './trackPoints';
import { FIXED_DT } from './stepper';
import { RunMeters } from './meters';
import { allPass, evaluateGoals } from './goals';
import { findLevel } from './levels';
import {
  FLIP_AIR_S, FLIP_LIFT_PX, FLIP_MS, FlipTrigger, HAPPY_MS, LAND_SQUISH_MS, flipPose, happyBounce, landingHit, landingSquish, speedStretch,
} from './rideJuice';
import type { TrackPoint } from './types';

const lock = (x: number, y: number): TrackPoint => ({ x, y, kind: 'curve', locked: true });
const c = (x: number, y: number): TrackPoint => ({ x, y, kind: 'curve' });

/** Feeds a ride's airborne flags, one fixed step per frame; returns the flip times (s). */
function flipsOn(points: TrackPoint[]): { flips: number[]; longest: number } {
  const track = buildTrack(expandTrackPoints(points).pts)!;
  const sim = new CartSim(track);
  const trig = new FlipTrigger();
  const flips: number[] = [];
  let longest = 0;
  let t = 0;
  for (let i = 0; i < 60 * 95 && sim.outcome === 'running'; i++) {
    sim.step();
    t += FIXED_DT;
    const snap = sim.snapshot();
    if (trig.update(snap.airborne, FIXED_DT)) flips.push(t);
    longest = Math.max(longest, trig.airSeconds);
  }
  return { flips, longest };
}

describe('the backflip trigger (2026-10-15)', () => {
  it('fires once when one airborne stretch reaches 1 s, not before', () => {
    const trig = new FlipTrigger();
    let fired = 0;
    let at = -1;
    for (let i = 1; i <= 90; i++) {
      if (trig.update(true, 1 / 60)) {
        fired++;
        at = i / 60;
      }
    }
    expect(fired).toBe(1);
    expect(at).toBeCloseTo(FLIP_AIR_S, 6);
  });

  it('two short floats never add up to a flip; a brief touch inside a float does not split it', () => {
    const trig = new FlipTrigger();
    let fired = 0;
    for (let i = 0; i < 36; i++) fired += trig.update(true, 1 / 60) ? 1 : 0; // 0.6 s
    for (let i = 0; i < 12; i++) fired += trig.update(false, 1 / 60) ? 1 : 0; // back on the rail
    for (let i = 0; i < 36; i++) fired += trig.update(true, 1 / 60) ? 1 : 0; // 0.6 s
    expect(fired).toBe(0);
    trig.reset();
    for (let i = 0; i < 36; i++) fired += trig.update(true, 1 / 60) ? 1 : 0;
    fired += trig.update(false, 1 / 60) ? 1 : 0; // one step under 0.3 g
    for (let i = 0; i < 30; i++) fired += trig.update(true, 1 / 60) ? 1 : 0;
    expect(fired).toBe(1);
  });

  it('a Thrill ride track with a long float over the hump earns a flip (and passes); the recorded solution and the lesson do not', () => {
    // A taller hump (15 m at x 42): 1.6 s in one float, 2 s of air in all, under 4 g, to the flag.
    const big = [lock(2, 22), lock(8, 20), c(13, 15), c(25, 10), c(42, 15), c(52, 10), c(56, 4)];
    const thrill = findLevel('thrill')!;
    const r = flipsOn(big);
    expect(r.longest).toBeGreaterThanOrEqual(1.5);
    expect(r.flips.length).toBe(1);
    const track = buildTrack(expandTrackPoints(big).pts)!;
    const sim = new CartSim(track);
    const meters = new RunMeters();
    meters.reset();
    while (sim.outcome === 'running') {
      sim.step();
      meters.observe(sim.snapshot(), FIXED_DT);
    }
    expect(sim.outcome).toBe('reachedEnd');
    expect(allPass(evaluateGoals(thrill.goals, meters.toMetrics(track, thrill.finish)))).toBe(true);
    // The recorded solution (src/core/levels.test.ts) gets its 1.4 s of air in pieces: the longest
    // float is about 0.9 s, so no flip; neither does the lesson's (about 0.8 s).
    const solution = flipsOn([lock(2, 22), lock(8, 20), c(13, 15), c(25, 11), c(44, 14), c(52, 8), c(56, 4)]);
    expect(solution.longest).toBeLessThan(1);
    expect(solution.flips).toEqual([]);
    const hang = flipsOn([lock(2, 18), lock(18, 4), { x: 30, y: 10, kind: 'curve', vertical: true }, lock(42, 4), lock(56, 3)]);
    expect(hang.flips).toEqual([]);
  });

  it('the flip turns once backwards, eased, with a lift that comes back to zero', () => {
    expect(flipPose(-1).active).toBe(false);
    expect(flipPose(0)).toEqual({ turns: 0, liftPx: 0, active: true });
    expect(flipPose(FLIP_MS / 2).turns).toBeCloseTo(0.5, 9);
    expect(flipPose(FLIP_MS / 2).liftPx).toBeCloseTo(FLIP_LIFT_PX, 9);
    expect(flipPose(FLIP_MS)).toEqual({ turns: 1, liftPx: 0, active: false });
  });
});

describe('the ride squash and bounce', () => {
  it('stretches with speed, round when slow', () => {
    expect(speedStretch(3)).toBe(1);
    expect(speedStretch(-30)).toBeCloseTo(1.14, 9);
    expect(speedStretch(16)).toBeGreaterThan(1.05);
  });

  it('a hard landing squishes: coming off a float into a g spike, or a sudden big jump in g', () => {
    expect(landingHit(0.1, 2.5, true)).toBeGreaterThan(0);
    expect(landingHit(0.9, 1.1, true)).toBe(0);
    expect(landingHit(1, 1.3, false)).toBe(0);
    expect(landingHit(1, 4, false)).toBeGreaterThan(0);
    const k = landingHit(0.1, 3, true);
    expect(landingSquish(0, k)).toBeLessThan(0.8);
    expect(landingSquish(LAND_SQUISH_MS, k)).toBe(1);
    expect(landingSquish(100, 0)).toBe(1);
  });

  it('the happy bounce hops twice and ends round on the rail', () => {
    const lifts = [];
    for (let t = 0; t < HAPPY_MS; t += 10) lifts.push(happyBounce(t).liftPx);
    expect(Math.max(...lifts)).toBeCloseTo(14, 0);
    expect(happyBounce(HAPPY_MS)).toEqual({ liftPx: 0, sy: 1, active: false });
    expect(happyBounce(240).liftPx).toBeGreaterThan(happyBounce(585).liftPx);
  });
});
