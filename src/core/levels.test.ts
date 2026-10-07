import { describe, expect, it } from 'vitest';
import { buildTrack } from './track';
import { CartSim } from './sim';
import { RunMeters } from './meters';
import { allPass, evaluateGoals } from './goals';
import { LEVELS, findLevel } from './levels';
import { FIXED_DT } from './stepper';
import { LOOP_RADIUS, expandTrackPoints } from './trackPoints';
import type { Level, Metrics, Outcome, TrackPoint } from './types';
import { WORLD_H, WORLD_W } from '../game/view';

// The same path the App takes: expand the points, build the track, step the sim at FIXED_DT with
// the run meters observing every tick, then score the goals with the level's finish zone. A level
// passes only when the goals pass and the fuzz did not fall (App.frame). `steepHang` is the part of
// the hang time spent on track steeper than ~72.5 degrees (a plunge) rather than over a crest.
function ride(level: Level, points: TrackPoint[]): { outcome: Outcome; metrics: Metrics; passed: boolean; steepHang: number } {
  const track = buildTrack(expandTrackPoints(points).pts);
  if (!track) throw new Error('no track');
  const sim = new CartSim(track);
  const meters = new RunMeters();
  meters.reset();
  let steepHang = 0;
  for (let i = 0; i < 60 * 95 && sim.outcome === 'running'; i++) {
    sim.step();
    const snap = sim.snapshot();
    meters.observe(snap, FIXED_DT);
    if (snap.airborne && Math.abs(track.lookup(snap.s).tangent.x) < 0.3) steepHang += FIXED_DT;
  }
  const metrics = meters.toMetrics(track, level.finish);
  const passed = sim.outcome !== 'fell' && allPass(evaluateGoals(level.goals, metrics));
  return { outcome: sim.outcome, metrics, passed, steepHang };
}

const lock = (x: number, y: number): TrackPoint => ({ x, y, kind: 'curve', locked: true });
const c = (x: number, y: number): TrackPoint => ({ x, y, kind: 'curve' });
const loop = (x: number, y: number): TrackPoint => ({ x, y, kind: 'loop' });

/** Every level but free: a recorded passing track (found by sim search) and naive tracks that fail. */
const SOLUTIONS: { id: string; solution: TrackPoint[]; naive: { why: string; points: TrackPoint[] }[] }[] = [
  {
    id: 'drop',
    solution: [c(8, 22), c(52, 4)],
    naive: [
      { why: 'the starting track only drops 10 m', points: [c(8, 14), c(52, 4)] },
      { why: 'a tall hill gives a big drop but the fuzz rolls back', points: [c(8, 14), c(30, 26), c(52, 4)] },
    ],
  },
  {
    id: 'complete',
    solution: [lock(5, 22), lock(14, 20), lock(22, 12), c(40, 4), c(54, 3)],
    naive: [{ why: 'the preset alone stops short of the flag', points: [lock(5, 22), lock(14, 20), lock(22, 12)] }],
  },
  {
    id: 'speed',
    // Dive down near the ground, then swoop up to the flag.
    solution: [lock(2, 21), c(16, 2), c(30, 1), c(44, 3), c(56, 8)],
    naive: [{ why: 'a straight slope to the flag only reaches about 15 m/s', points: [lock(2, 21), c(56, 8)] }],
  },
  {
    id: 'length',
    // Three hills, each lower than the last.
    solution: [lock(2, 20), c(11, 2), c(20, 15), c(29, 2), c(38, 13), c(47, 2), c(56, 4)],
    naive: [
      { why: 'a straight slope to the flag is too short', points: [lock(2, 20), c(56, 4)] },
      { why: 'a hill taller than the station strands the fuzz', points: [lock(2, 20), c(12, 3), c(22, 24), c(32, 3), c(42, 10), c(50, 3), c(56, 4)] },
    ],
  },
  {
    id: 'hang',
    // Drop off the gentle start, float over a hump, coast to the flag.
    solution: [lock(2, 16), lock(10, 12), c(18, 3), c(28, 9), c(36, 3), c(56, 3)],
    naive: [
      { why: 'a straight slope to the flag never floats', points: [lock(2, 16), lock(10, 12), c(56, 3)] },
      { why: 'plunging straight down after the start is not enough', points: [lock(2, 16), lock(10, 12), c(10.5, 0.5), c(56, 3)] },
    ],
  },
  {
    id: 'loop',
    // The loop sits near the ground, far below the station.
    solution: [lock(2, 24), c(14, 6), loop(24, 4), c(38, 3), c(56, 3)],
    naive: [
      { why: 'a straight slope has no loop', points: [lock(2, 24), c(56, 3)] },
      { why: 'a loop high on the slope is too slow and the fuzz falls', points: [lock(2, 24), loop(20, 17), c(56, 3)] },
    ],
  },
  {
    id: 'intense',
    // One big dip with a round bottom, then up to the high flag.
    solution: [lock(2, 22), c(8, 15), c(23, 4), c(41, 3), c(56, 11)],
    naive: [
      { why: 'a straight slope to the high flag is too slow', points: [lock(2, 22), c(56, 11)] },
      { why: 'a sharp V dip is fast but squishes past 4 g', points: [lock(2, 22), c(20, 2), c(56, 11)] },
    ],
  },
  {
    id: 'double',
    // Both loops down on the ground (11+ m below the station), then a climb to the flag.
    solution: [lock(3, 16), c(12, 2), loop(20, 1), loop(32, 1), c(44, 2), c(56, 10)],
    naive: [
      { why: 'a straight rail to the flag has no loops', points: [lock(3, 16), c(56, 10)] },
      { why: 'loops left up on the slope are too slow', points: [lock(3, 16), loop(20, 13), loop(36, 11.5), c(56, 10)] },
    ],
  },
  {
    id: 'thrill',
    // Drop into a wide, round valley, catch air over a hump at x 44, swoop down to the flag.
    solution: [lock(2, 22), lock(8, 20), c(13, 15), c(25, 11), c(44, 14), c(52, 8), c(56, 4)],
    naive: [
      { why: 'a straight slope to the flag never floats', points: [lock(2, 22), lock(8, 20), c(56, 4)] },
      { why: 'one node straight down after the start makes a sharp valley past 4 g', points: [lock(2, 22), lock(8, 20), c(9, 2), c(56, 4)] },
    ],
  },
  {
    id: 'express',
    // A tall zigzag: the first drop gives the speed, shrinking hills give the length.
    solution: [lock(2, 29), c(12, 2), c(22, 18), c(32, 2), c(42, 14), c(52, 2), c(58, 2)],
    naive: [
      { why: 'a gentle slope is too short and too slow', points: [lock(2, 29), c(58, 2)] },
      { why: 'one big drop is fast but too short', points: [lock(2, 29), c(14, 2), c(58, 2)] },
    ],
  },
  {
    id: 'grand',
    // The loop sits high (11 m under the station) so it is not too squishy, then a smooth swoop down.
    solution: [lock(2, 28), c(5, 21), loop(20, 17), c(28, 17), c(39, 7), c(51, 3), c(59, 4)],
    naive: [
      { why: 'a gentle slope has no loop', points: [lock(2, 28), c(58, 2)] },
      { why: 'a loop down on the ground is far past 7 g', points: [lock(2, 28), c(14, 2), loop(24, 1), c(40, 1), c(58, 1)] },
    ],
  },
];

describe('levels', () => {
  it('challenge levels sit between intense and free, in order', () => {
    const ids = LEVELS.map((l) => l.id);
    expect(ids.slice(ids.indexOf('intense') + 1)).toEqual(['double', 'thrill', 'express', 'grand', 'free']);
  });

  it('every level but free has a recorded solution', () => {
    expect(SOLUTIONS.map((s) => s.id)).toEqual(LEVELS.filter((l) => l.id !== 'free').map((l) => l.id));
  });

  it('every level but drop and free starts from a locked station', () => {
    for (const level of LEVELS) {
      if (level.id === 'drop' || level.id === 'free') continue;
      expect(level.preset?.[0]?.locked, level.id).toBe(true);
    }
  });

  it('free play stays open: no preset, no flag, no goals', () => {
    const free = findLevel('free')!;
    expect(free.preset).toBeUndefined();
    expect(free.finish).toBeUndefined();
    expect(free.goals).toHaveLength(0);
  });

  it('every level with a flag has a "reach the flag" goal', () => {
    for (const level of LEVELS) {
      if (!level.finish) continue;
      expect(level.goals.some((g) => g.metric === 'atFinish'), level.id).toBe(true);
    }
  });

  it('every level fits the HUD goal column: at most 3 goals, at most 2 with a progress bar', () => {
    for (const level of LEVELS) {
      expect(level.goals.length, level.id).toBeLessThanOrEqual(3);
      const barred = level.goals.filter((g) => g.metric !== 'reachedEnd' && g.metric !== 'atFinish');
      expect(barred.length, level.id).toBeLessThanOrEqual(2);
    }
  });

  for (const sol of SOLUTIONS) {
    describe(sol.id, () => {
      const level = findLevel(sol.id)!;

      it('has goals, a Bruno line and all three hints', () => {
        expect(level).toBeDefined();
        expect(level.goals.length).toBeGreaterThan(0);
        expect(level.bruno.length).toBeGreaterThan(0);
        for (const h of [level.hints.rolledBack, level.hints.stuck, level.hints.fell]) expect(h.length).toBeGreaterThan(0);
      });

      it('recorded solution keeps the locked points and stays inside the editor bounds', () => {
        const locked = (level.preset ?? []).filter((p) => p.locked);
        expect(sol.solution.slice(0, locked.length)).toEqual(locked);
        for (const p of sol.solution) {
          expect(p.x).toBeGreaterThanOrEqual(0.5);
          expect(p.x).toBeLessThanOrEqual(WORLD_W - 0.5);
          expect(p.y).toBeGreaterThanOrEqual(0.5);
          // a loop's top (2 radii above its point) must stay in the sky (WORLD_H: 38.25 m since
          // 2026-10-07, 30 m before; CoasterScene clamps points the same way)
          expect(p.y + (p.kind === 'loop' ? 2 * LOOP_RADIUS : 0)).toBeLessThanOrEqual(WORLD_H - 0.5);
        }
      });

      it('recorded solution passes every goal through the sim and the fuzz reaches the end', () => {
        const r = ride(level, sol.solution);
        expect(r.outcome).toBe('reachedEnd');
        for (const g of evaluateGoals(level.goals, r.metrics)) expect(g.pass, `${g.goal.label}: ${g.current}`).toBe(true);
        expect(r.passed).toBe(true);
      });

      it('solution is not a knife edge: moving any one point 1 m still passes', () => {
        sol.solution.forEach((p, i) => {
          if (p.locked) return;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const moved = sol.solution.map((q, k) => (k === i ? { ...q, x: q.x + dx, y: q.y + dy } : q));
            expect(ride(level, moved).passed, `point ${i} moved by (${dx}, ${dy})`).toBe(true);
          }
        });
      });

      for (const n of sol.naive) {
        it(`naive track fails: ${n.why}`, () => {
          expect(ride(level, n.points).passed).toBe(false);
        });
      }
    });
  }

  // The plunge cheat (Gao's playtest of thrill): one node dropped straight below the start makes a
  // near-vertical fall, which floats the fuzz without any hump. Sweep that node over the whole
  // area just after the locked start.
  describe.each([
    { id: 'thrill', end: c(56, 4) },
    { id: 'hang', end: c(56, 3) },
  ])('$id: a single plunge node after the locked start never passes', ({ id, end }) => {
    it('sweeps the node below the lead-in', () => {
      const level = findLevel(id)!;
      const start = level.preset!;
      const lead = start[start.length - 1]!;
      const passing: string[] = [];
      for (let x = lead.x + 0.5; x <= lead.x + 6; x += 0.5) {
        for (let y = 0.5; y < lead.y; y += 1) {
          if (ride(level, [...start, c(x, y), end]).passed) passing.push(`(${x}, ${y})`);
        }
      }
      expect(passing).toEqual([]);
    });
  });

  it('thrill: the solution gets its hang time from crests (a hump), not from a plunge', () => {
    const level = findLevel('thrill')!;
    const r = ride(level, SOLUTIONS.find((s) => s.id === 'thrill')!.solution);
    expect(r.metrics.hangTime).toBeGreaterThanOrEqual(1);
    expect(r.steepHang).toBeLessThan(0.05);
    expect(r.metrics.maxG).toBeLessThanOrEqual(4);
  });
});
