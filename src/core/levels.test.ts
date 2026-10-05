import { describe, expect, it } from 'vitest';
import { buildTrack } from './track';
import { CartSim } from './sim';
import { RunMeters } from './meters';
import { allPass, evaluateGoals } from './goals';
import { LEVELS, findLevel } from './levels';
import { FIXED_DT } from './stepper';
import { LOOP_RADIUS, expandTrackPoints } from './trackPoints';
import type { Level, Metrics, Outcome, TrackPoint } from './types';

// The same path the App takes: expand the points, build the track, step the sim at FIXED_DT with
// the run meters observing every tick, then score the goals with the level's finish zone. A level
// passes only when the goals pass and the fuzz did not fall (App.frame).
function ride(level: Level, points: TrackPoint[]): { outcome: Outcome; metrics: Metrics; passed: boolean } {
  const track = buildTrack(expandTrackPoints(points).pts);
  if (!track) throw new Error('no track');
  const sim = new CartSim(track);
  const meters = new RunMeters();
  meters.reset();
  for (let i = 0; i < 60 * 95 && sim.outcome === 'running'; i++) {
    sim.step();
    meters.observe(sim.snapshot(), FIXED_DT);
  }
  const metrics = meters.toMetrics(track, level.finish);
  const passed = sim.outcome !== 'fell' && allPass(evaluateGoals(level.goals, metrics));
  return { outcome: sim.outcome, metrics, passed };
}

const lock = (x: number, y: number): TrackPoint => ({ x, y, kind: 'curve', locked: true });
const c = (x: number, y: number): TrackPoint => ({ x, y, kind: 'curve' });
const loop = (x: number, y: number): TrackPoint => ({ x, y, kind: 'loop' });

/** Challenge levels: a recorded passing track (found by sim search) and naive tracks that fail. */
const CHALLENGES: { id: string; solution: TrackPoint[]; naive: { why: string; points: TrackPoint[] }[] }[] = [
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
    // A steep plunge off the station floats the fuzz, then long round-bottomed valleys stay gentle.
    solution: [lock(2, 26), c(4, 16), c(23, 5), c(41, 5), c(52, 6), c(58, 3)],
    naive: [
      { why: 'a gentle slope never floats', points: [lock(2, 26), c(58, 2)] },
      { why: 'a big drop into a sharp valley squishes past 4 g', points: [lock(2, 26), c(14, 2), c(30, 12), c(44, 2), c(58, 2)] },
    ],
  },
  {
    id: 'express',
    // A tall zigzag: the first drop gives the speed, shrinking hills give the length.
    solution: [c(2, 29), c(12, 2), c(22, 18), c(32, 2), c(42, 14), c(52, 2), c(58, 2)],
    naive: [
      { why: 'a gentle slope is too short and too slow', points: [c(2, 28), c(58, 2)] },
      { why: 'one big drop is fast but too short', points: [c(2, 29), c(14, 2), c(58, 2)] },
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

describe('challenge levels', () => {
  it('sit between intense and free, in order', () => {
    const ids = LEVELS.map((l) => l.id);
    expect(ids.slice(ids.indexOf('intense') + 1)).toEqual(['double', 'thrill', 'express', 'grand', 'free']);
  });

  for (const ch of CHALLENGES) {
    describe(ch.id, () => {
      const level = findLevel(ch.id)!;

      it('exists with goals, a Bruno line and all three hints', () => {
        expect(level).toBeDefined();
        expect(level.goals.length).toBeGreaterThanOrEqual(3);
        expect(level.bruno.length).toBeGreaterThan(0);
        for (const h of [level.hints.rolledBack, level.hints.stuck, level.hints.fell]) expect(h.length).toBeGreaterThan(0);
      });

      it('recorded solution keeps the locked points and stays inside the editor bounds', () => {
        const locked = (level.preset ?? []).filter((p) => p.locked);
        expect(ch.solution.slice(0, locked.length)).toEqual(locked);
        for (const p of ch.solution) {
          expect(p.x).toBeGreaterThanOrEqual(0.5);
          expect(p.x).toBeLessThanOrEqual(59.5);
          expect(p.y).toBeGreaterThanOrEqual(0.5);
          // a loop's top (2 radii above its point) must stay in the 30 m sky
          expect(p.y + (p.kind === 'loop' ? 2 * LOOP_RADIUS : 0)).toBeLessThanOrEqual(29.5);
        }
      });

      it('recorded solution passes every goal through the sim', () => {
        const r = ride(level, ch.solution);
        expect(r.outcome).toBe('reachedEnd');
        for (const g of evaluateGoals(level.goals, r.metrics)) expect(g.pass, `${g.goal.label}: ${g.current}`).toBe(true);
        expect(r.passed).toBe(true);
      });

      it('solution is not a knife edge: moving any one point 1 m still passes', () => {
        ch.solution.forEach((p, i) => {
          if (p.locked) return;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const moved = ch.solution.map((q, k) => (k === i ? { ...q, x: q.x + dx, y: q.y + dy } : q));
            expect(ride(level, moved).passed, `point ${i} moved by (${dx}, ${dy})`).toBe(true);
          }
        });
      });

      for (const n of ch.naive) {
        it(`naive track fails: ${n.why}`, () => {
          expect(ride(level, n.points).passed).toBe(false);
        });
      }
    });
  }

  it('every level fits the HUD goal column: at most 3 goals, at most 2 with a progress bar', () => {
    for (const level of LEVELS) {
      expect(level.goals.length, level.id).toBeLessThanOrEqual(3);
      const barred = level.goals.filter((g) => g.metric !== 'reachedEnd' && g.metric !== 'atFinish');
      expect(barred.length, level.id).toBeLessThanOrEqual(2);
    }
  });
});
