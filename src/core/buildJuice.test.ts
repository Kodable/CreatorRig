import { describe, expect, it } from 'vitest';
import {
  BEAM_DELAY, BEAM_MS, BEAM_STAGGER, BUILD_RAIL_MS, BUILD_TOTAL_MS, DROP_MS, EXTEND_DROP_PX, EXTEND_MS, POP_MS,
  RETRACT_MS, SINK_MS, WOBBLE_MS, animDone, animDuration, backOut, beamDelay, beamRise, ghostBeam, ghostRetract,
  ghostSink, knot, knotArcLengths, pointScale, railOffset, railReveal, type BuildAnim,
} from './buildJuice';

// A straight 30 m rail with control points at s = 0, 10, 20, 30.
const knots = [0, 10, 20, 30];
const len = 30;

describe('track-building juice (2026-10-15)', () => {
  it('finds each control point along the rail, in order', () => {
    const samples = Array.from({ length: 301 }, (_, i) => ({ s: i / 10, pos: { x: i / 10, y: 0 } }));
    expect(knotArcLengths(samples, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20.04, y: 1 }, { x: 30, y: 0 }])).toEqual([0, 10, 20, 30]);
    expect(knot(knots, 1.5, len)).toBe(15);
    expect(knot(knots, -1, len)).toBe(0);
    expect(knot(knots, 9, len)).toBe(len);
  });

  it('an appended segment draws out from the previous point in 200-300 ms, swinging down into place', () => {
    const a: BuildAnim[] = [{ kind: 'extend', from: 2, t0: 0 }];
    expect(EXTEND_MS).toBeGreaterThanOrEqual(200);
    expect(EXTEND_MS).toBeLessThanOrEqual(300);
    expect(railReveal(a, knots, len, 0)).toBe(20);
    const mid = railReveal(a, knots, len, EXTEND_MS / 2);
    expect(mid).toBeGreaterThan(25); // ease-out: most of the way at half time
    expect(railReveal(a, knots, len, EXTEND_MS)).toBe(len);
    // Hinged at the previous point: lifted most at the new end, not at all at the hinge.
    expect(railOffset(a, knots, len, 20, 0)).toBeCloseTo(0, 9);
    expect(railOffset(a, knots, len, 30, 0)).toBeCloseTo(-EXTEND_DROP_PX, 9);
    // It overshoots below its place (the bounce), then settles.
    let maxDown = 0;
    for (let t = 0; t <= DROP_MS; t += 5) maxDown = Math.max(maxDown, railOffset(a, knots, len, 30, t));
    expect(maxDown).toBeGreaterThan(0.5);
    expect(railOffset(a, knots, len, 30, DROP_MS)).toBeCloseTo(0, 9);
    // The rail before it never moves.
    expect(railOffset(a, knots, len, 5, 50)).toBe(0);
  });

  it('beams under a new segment rise after it, staggered, 150-250 ms each; beams elsewhere stand', () => {
    const a: BuildAnim[] = [{ kind: 'extend', from: 2, t0: 1000 }];
    expect(BEAM_MS).toBeGreaterThanOrEqual(150);
    expect(BEAM_MS).toBeLessThanOrEqual(250);
    expect(beamRise(a, knots, len, 8, 1000)).toBe(1);
    expect(beamRise(a, knots, len, 24, 1000)).toBe(0);
    expect(beamDelay(a[0]!, knots, len, 20)).toBe(BEAM_DELAY);
    expect(beamDelay(a[0]!, knots, len, 30)).toBe(BEAM_DELAY + BEAM_STAGGER);
    expect(beamDelay(a[0]!, knots, len, 8)).toBeNull();
    const near = beamRise(a, knots, len, 20, 1000 + BEAM_DELAY + 60);
    const far = beamRise(a, knots, len, 30, 1000 + BEAM_DELAY + 60);
    expect(near).toBeGreaterThan(far);
    expect(beamRise(a, knots, len, 30, 1000 + BEAM_DELAY + BEAM_STAGGER + BEAM_MS)).toBeCloseTo(1, 9);
  });

  it('an inserted point drops with its two segments, most at the point itself', () => {
    const a: BuildAnim[] = [{ kind: 'drop', a: 0, peak: 1, b: 2, px: 10, t0: 0 }];
    expect(railOffset(a, knots, len, 10, 0)).toBeCloseTo(-10, 9);
    expect(railOffset(a, knots, len, 0, 0)).toBeCloseTo(0, 9);
    expect(railOffset(a, knots, len, 25, 0)).toBe(0);
    expect(railReveal(a, knots, len, 0)).toBe(len);
    expect(beamRise(a, knots, len, 25, 0)).toBe(1);
    expect(beamRise(a, knots, len, 12, 0)).toBe(0);
  });

  it('a new handle pops (0, overshoot, 1); a moved point wobbles and settles', () => {
    const pop: BuildAnim[] = [{ kind: 'pop', index: 3, t0: 0 }];
    expect(pointScale(pop, knots, len, 3, 0)).toBe(0);
    let max = 0;
    for (let t = 0; t <= POP_MS; t += 5) max = Math.max(max, pointScale(pop, knots, len, 3, t));
    expect(max).toBeGreaterThan(1.05);
    expect(pointScale(pop, knots, len, 3, POP_MS)).toBeCloseTo(1, 9);
    expect(pointScale(pop, knots, len, 2, 0)).toBe(1);
    const wob: BuildAnim[] = [{ kind: 'wobble', a: 1, peak: 2, b: 3, t0: 0 }];
    expect(Math.abs(railOffset(wob, knots, len, 20, 40))).toBeGreaterThan(0.5);
    expect(railOffset(wob, knots, len, 20, WOBBLE_MS)).toBe(0);
    expect(railOffset(wob, knots, len, 5, 40)).toBe(0);
  });

  it('the preset builds in from the station in about 0.6 s; held, nothing shows', () => {
    const held: BuildAnim[] = [{ kind: 'build', t0: Infinity }];
    expect(railReveal(held, knots, len, 5000)).toBe(0);
    expect(beamRise(held, knots, len, 4, 5000)).toBe(0);
    expect(pointScale(held, knots, len, 0, 5000)).toBe(0);
    expect(animDone(held[0]!, 1e9)).toBe(false);
    expect(BUILD_TOTAL_MS).toBeGreaterThanOrEqual(500);
    expect(BUILD_TOTAL_MS).toBeLessThanOrEqual(700);
    const b: BuildAnim[] = [{ kind: 'build', t0: 100 }];
    expect(railReveal(b, knots, len, 100 + BUILD_RAIL_MS / 2)).toBeCloseTo(15, 9);
    // The station's handle pops first; the end's when the rail reaches it.
    expect(pointScale(b, knots, len, 0, 150)).toBeGreaterThan(0);
    expect(pointScale(b, knots, len, 3, 150)).toBe(0);
    // A stretch drops as it appears: the leading edge is lifted, the start has landed.
    const t = 100 + BUILD_RAIL_MS * 0.8;
    expect(railOffset(b, knots, len, 23, t)).toBeLessThan(-5);
    expect(Math.abs(railOffset(b, knots, len, 0, t))).toBeLessThan(1.5);
    // Beams rise behind the rail, the station end first.
    expect(beamRise(b, knots, len, 4, t)).toBeGreaterThan(beamRise(b, knots, len, 20, t));
    // Everything is in place at the end.
    const end = 100 + BUILD_TOTAL_MS;
    expect(animDone(b[0]!, end)).toBe(true);
    expect(railReveal(b, knots, len, end)).toBe(len);
    expect(railOffset(b, knots, len, 30, end)).toBeCloseTo(0, 9);
    expect(beamRise(b, knots, len, 28, end)).toBeCloseTo(1, 9);
    expect(pointScale(b, knots, len, 3, end)).toBeCloseTo(1, 9);
  });

  it('every animation ends, and then changes nothing', () => {
    const all: BuildAnim[] = [
      { kind: 'extend', from: 2, t0: 0 },
      { kind: 'drop', a: 0, peak: 1, b: 2, px: 10, t0: 0 },
      { kind: 'wobble', a: 0, peak: 1, b: 2, t0: 0 },
      { kind: 'pop', index: 1, t0: 0 },
      { kind: 'build', t0: 0 },
    ];
    const end = Math.max(...all.map(animDuration));
    expect(all.every((a) => animDone(a, end))).toBe(true);
    expect(railReveal(all, knots, len, end)).toBe(len);
    for (const s of [0, 5, 10, 15, 20, 25, 30]) {
      expect(Math.abs(railOffset(all, knots, len, s, end))).toBeLessThan(1e-9);
      expect(beamRise(all, knots, len, s, end)).toBeCloseTo(1, 9);
    }
  });

  it('removed rail retracts or sinks away, its beams sink into the ground', () => {
    expect(ghostRetract(0)).toBe(1);
    expect(ghostRetract(RETRACT_MS)).toBe(0);
    expect(ghostSink(0)).toEqual({ alpha: 1, offsetPx: 0 });
    expect(ghostSink(SINK_MS).alpha).toBe(0);
    expect(ghostBeam(0, 0)).toBe(1);
    expect(ghostBeam(100, 0)).toBeLessThan(ghostBeam(100, 1));
    expect(ghostBeam(1000, 1)).toBe(0);
    expect(backOut(0)).toBeCloseTo(0, 9);
    expect(backOut(1)).toBeCloseTo(1, 9);
  });
});
