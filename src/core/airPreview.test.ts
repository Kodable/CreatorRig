import { describe, expect, it } from 'vitest';
import { buildTrack } from './track';
import { CartSim } from './sim';
import { RunMeters } from './meters';
import { FIXED_DT } from './stepper';
import { expandTrackPoints } from './trackPoints';
import { findLevel, LEVELS } from './levels';
import { AIR_PREVIEW_MAX_S, airCounterText, airGoal, longestStretch, mergeStretches, previewAir } from './airPreview';
import type { Track, TrackPoint } from './types';

const lock = (x: number, y: number): TrackPoint => ({ x, y, kind: 'curve', locked: true });
const c = (x: number, y: number): TrackPoint => ({ x, y, kind: 'curve' });

function trackOf(points: TrackPoint[]): Track {
  const t = buildTrack(expandTrackPoints(points).pts);
  if (!t) throw new Error('no track');
  return t;
}

/** The ride exactly as the App runs it: the meters observe every fixed step. */
function realRide(track: Track): { hangTime: number; airborneS: number[] } {
  const sim = new CartSim(track);
  const meters = new RunMeters();
  meters.reset();
  const airborneS: number[] = [];
  for (let i = 0; i < 60 * 95 && sim.outcome === 'running'; i++) {
    sim.step();
    const snap = sim.snapshot();
    meters.observe(snap, FIXED_DT);
    if (snap.airborne) airborneS.push(snap.s);
  }
  return { hangTime: meters.toMetrics(track).hangTime, airborneS };
}

const hang = findLevel('hang')!;
const withTop = (y: number): TrackPoint[] => hang.preset!.map((p) => (p.vertical ? { ...p, y } : { ...p }));

describe('air time preview (2026-10-15)', () => {
  it('matches the real ride on the lesson solution: same air time, every floaty spot inside a stretch', () => {
    const track = trackOf(withTop(10));
    const pv = previewAir(track);
    const real = realRide(track);
    expect(pv.outcome).toBe('reachedEnd');
    expect(real.hangTime).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(pv.airTime - real.hangTime)).toBeLessThan(0.02);
    for (const s of real.airborneS) {
      expect(pv.stretches.some((st) => s >= st.s0 - 1e-9 && s <= st.s1 + 1e-9), `s ${s}`).toBe(true);
    }
  });

  it('marks the crest of the hill: the longest stretch sits over the hilltop', () => {
    const track = trackOf(withTop(10));
    const st = longestStretch(previewAir(track).stretches)!;
    expect(st).not.toBeNull();
    const a = track.lookup(st.s0).pos.x;
    const b = track.lookup(st.s1).pos.x;
    expect(a).toBeLessThan(30);
    expect(b).toBeGreaterThan(30);
    expect(b - a).toBeGreaterThan(4);
  });

  it('the blue stretch grows as the hilltop goes up: start height little, in the band more', () => {
    const at = (y: number): { air: number; len: number } => {
      const pv = previewAir(trackOf(withTop(y)));
      return { air: pv.airTime, len: pv.stretches.reduce((sum, st) => sum + st.s1 - st.s0, 0) };
    };
    const start = at(hang.preset![2]!.y);
    const mid = at(10);
    const high = at(15);
    expect(start.air).toBeLessThan(0.5);
    expect(mid.air).toBeGreaterThanOrEqual(0.5);
    expect(mid.len).toBeGreaterThan(start.len);
    expect(high.len).toBeGreaterThan(mid.len);
  });

  it('a straight slope never floats: no stretches', () => {
    const pv = previewAir(trackOf([lock(2, 16), c(56, 3)]));
    expect(pv.stretches).toEqual([]);
    expect(pv.airTime).toBe(0);
  });

  it('matches the real ride on the Thrill ride solution too', () => {
    const track = trackOf([lock(2, 22), lock(8, 20), c(13, 15), c(25, 11), c(44, 14), c(52, 8), c(56, 4)]);
    const pv = previewAir(track);
    expect(Math.abs(pv.airTime - realRide(track).hangTime)).toBeLessThan(0.02);
    expect(pv.airTime).toBeGreaterThanOrEqual(1);
  });

  it('is capped: a stranded fuzz ends the dry run inside the cap, and the cost stays small', () => {
    const track = trackOf(withTop(25));
    const t0 = performance.now();
    const pv = previewAir(track);
    const ms = performance.now() - t0;
    expect(pv.outcome).not.toBe('reachedEnd');
    expect(pv.steps).toBeLessThanOrEqual(Math.ceil(AIR_PREVIEW_MAX_S / FIXED_DT));
    expect(ms).toBeLessThan(50); // a few ms in practice; generous for a busy CI box
    const capped = previewAir(trackOf(withTop(10)), 0.5);
    expect(capped.steps).toBe(Math.ceil(0.5 / FIXED_DT));
    expect(capped.outcome).toBe('running');
  });

  it('merges stretches that overlap or nearly touch', () => {
    expect(mergeStretches([{ s0: 5, s1: 6 }, { s0: 1, s1: 2 }, { s0: 2.3, s1: 3 }])).toEqual([{ s0: 1, s1: 3 }, { s0: 5, s1: 6 }]);
  });

  it('shows on the levels with an air time goal only: the lesson (0.5 s) and Thrill ride (1 s)', () => {
    expect(LEVELS.filter((l) => airGoal(l) !== null).map((l) => [l.id, airGoal(l)])).toEqual([['hang', 0.5], ['thrill', 1]]);
  });

  it('the float counter counts in tenths and says the goal in words when it is reached', () => {
    expect(airCounterText(0.43)).toBe('0.4 s');
    expect(airCounterText(0.8)).toBe('0.8 s');
    expect(airCounterText(0.5)).toBe('0.5 s'); // the goal moment shows the time too, no words
    expect(airCounterText(1.01)).toBe('1.0 s');
  });

  it('kids see "air time", never "hang time"', () => {
    for (const level of LEVELS) {
      const text = [level.title, level.bruno, ...level.goals.map((g) => g.label), ...Object.values(level.hints)].join(' ');
      expect(text.toLowerCase(), level.id).not.toContain('hang');
    }
  });
});
