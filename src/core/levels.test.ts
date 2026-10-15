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
import { DEFAULT_WORLD_W, isWideLevel, levelWorldW } from './world';
import { canAppend, canDeletePoint, canGrab, clearedPoints, editRules } from './editRules';
import { insertionIndex, openGapIndex } from './trackPoints';

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
  // App.frame: a level with a flag passes only when the fuzz gets to the end of the rail.
  const reached = !level.finish || sim.outcome === 'reachedEnd';
  const passed = sim.outcome !== 'fell' && reached && allPass(evaluateGoals(level.goals, metrics));
  return { outcome: sim.outcome, metrics, passed, steepHang };
}

const lock = (x: number, y: number): TrackPoint => ({ x, y, kind: 'curve', locked: true });
const c = (x: number, y: number): TrackPoint => ({ x, y, kind: 'curve' });
const loop = (x: number, y: number): TrackPoint => ({ x, y, kind: 'loop' });
const top = (x: number, y: number): TrackPoint => ({ x, y, kind: 'curve', vertical: true });
const lockLoop = (x: number, y: number): TrackPoint => ({ x, y, kind: 'loop', locked: true });
const lockOpen = (x: number, y: number): TrackPoint => ({ x, y, kind: 'curve', locked: true, openAfter: true });
/** The "Loop in the middle" level's track with its station at height `y` (the prebuilt loop and
 * its feet locked) and `rest` built on from the loop's exit. */
const gate = (y: number, rest: TrackPoint[] = [c(90, 4), c(116, 6)]): TrackPoint[] =>
  [c(2, y), lock(40, 3), lockLoop(52, 2), lock(64, 3), ...rest];
/** The "Big finish" level's prebuilt finale (a dip, two loops, the end on the flag). */
const FINALE: TrackPoint[] = [lock(96, 16), lock(104, 10), lockLoop(112, 9), lockLoop(124, 9), lock(134, 10), lock(146, 8)];

/** Every level but free: a recorded passing track (found by sim search) and naive tracks that fail. */
const SOLUTIONS: { id: string; solution: TrackPoint[]; naive: { why: string; points: TrackPoint[] }[] }[] = [
  {
    id: 'drop',
    // The station dragged straight up (the only move the level allows); the end stays locked on the flag.
    solution: [c(8, 22), lock(52, 4)],
    naive: [
      { why: 'the starting track only drops 10 m', points: [c(8, 14), lock(52, 4)] },
      { why: 'a tall hill gives a big drop but the fuzz rolls back', points: [c(8, 14), c(30, 26), lock(52, 4)] },
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
    // Three hills, each lower than the last (2026-10-15: the station moved up from 20 m to 26 m).
    solution: [lock(2, 26), c(11, 2), c(20, 15), c(29, 2), c(38, 13), c(47, 2), c(56, 4)],
    naive: [
      { why: 'a straight slope to the flag is too short', points: [lock(2, 26), c(56, 4)] },
      { why: 'a hill taller than the station strands the fuzz', points: [lock(2, 26), c(12, 3), c(22, 30), c(32, 3), c(42, 10), c(50, 3), c(56, 4)] },
    ],
  },
  {
    id: 'hang',
    // 2026-10-15: the drag-the-top lesson. The hilltop dragged from 5 m up to 10 m (0.87 s of air,
    // the middle of the band; the good band is checked below); nothing else moves.
    solution: [lock(2, 18), lock(18, 4), top(30, 10), lock(42, 4), lock(56, 3)],
    naive: [
      { why: 'the hilltop left where it starts floats for only about 0.3 s', points: [lock(2, 18), lock(18, 4), top(30, 5), lock(42, 4), lock(56, 3)] },
      { why: 'a hilltop too high strands the fuzz in the valley', points: [lock(2, 18), lock(18, 4), top(30, 20), lock(42, 4), lock(56, 3)] },
      { why: 'a hilltop dragged down into a dip floats too little', points: [lock(2, 18), lock(18, 4), top(30, 1), lock(42, 4), lock(56, 3)] },
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
  // ---- 2026-10-15: the long rides (wide worlds) and the prebuilt-track levels ----
  {
    id: 'loopgate',
    // The station slid up from 8 m to 17 m (the middle of the 12.5..20.5 m band), then two points
    // from the loop's exit to the flag.
    solution: gate(17),
    naive: [
      { why: 'the station left at 8 m is too slow for the loop', points: gate(8) },
      { why: 'the station slid to the top makes the loop squish past 9 g', points: gate(30) },
      { why: 'the prebuilt track alone stops short of the flag', points: gate(17, []) },
    ],
  },
  {
    id: 'tour',
    // Down to a loop near the ground, a long floaty hill, a smaller one, then up to the high flag.
    solution: [lock(2, 34), c(14, 4), loop(26, 2), c(40, 3), c(60, 8), c(80, 18), c(96, 10), c(110, 12), c(130, 16), c(146, 18)],
    naive: [
      { why: 'a straight rail to the flag has no loop and no air', points: [lock(2, 34), c(146, 18)] },
      { why: 'a loop high on the first slope is too slow and the fuzz falls', points: [lock(2, 34), c(10, 30), loop(20, 26), c(40, 22), c(146, 18)] },
      { why: 'a hill taller than the station strands the fuzz', points: [lock(2, 34), c(14, 4), loop(26, 2), c(40, 3), c(70, 36), c(100, 8), c(146, 18)] },
    ],
  },
  {
    id: 'finale',
    // Three floaty humps on the open stretch, each round and lower than the station.
    solution: [lockOpen(2, 28), c(14, 12), c(26, 10), c(42, 18), c(54, 13), c(70, 10), c(86, 16), ...FINALE],
    naive: [
      { why: 'the plain prebuilt rail floats the fuzz for under a second', points: [lockOpen(2, 28), ...FINALE] },
      { why: 'a hump taller than the station strands the fuzz', points: [lockOpen(2, 28), c(16, 4), c(36, 30), c(56, 4), ...FINALE] },
    ],
  },
  {
    id: 'marathon',
    // Six hills, each lower than the one before, then up to the flag.
    solution: [lock(2, 30), c(14, 4), c(28, 24), c(42, 4), c(56, 22), c(70, 4), c(84, 20), c(98, 4), c(112, 18), c(126, 4), c(140, 16), c(154, 6), c(166, 12)],
    naive: [
      { why: 'a straight rail to the flag is only about 165 m', points: [lock(2, 30), c(166, 12)] },
      { why: 'one big hill is still too short', points: [lock(2, 30), c(30, 3), c(80, 24), c(130, 3), c(166, 12)] },
      { why: 'a hill taller than the station strands the fuzz', points: [lock(2, 30), c(14, 4), c(40, 34), c(70, 4), c(166, 12)] },
    ],
  },
];

describe('levels', () => {
  it('challenge levels sit between intense and free, then the long rides, then free play last', () => {
    const ids = LEVELS.map((l) => l.id);
    expect(ids.slice(ids.indexOf('intense') + 1)).toEqual(['double', 'thrill', 'express', 'grand', 'loopgate', 'tour', 'finale', 'marathon', 'free']);
  });

  it('every level but free has a recorded solution', () => {
    expect(SOLUTIONS.map((s) => s.id)).toEqual(LEVELS.filter((l) => l.id !== 'free').map((l) => l.id));
  });

  it('every level but free starts from a locked station or one that only slides up and down', () => {
    for (const level of LEVELS) {
      if (level.id === 'free') continue;
      const station = level.preset?.[0];
      expect(!!station?.locked || !!level.stationVertical, level.id).toBe(true);
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
        // The preset's locked points, in order, unmoved (a locked end sits last, level 1).
        const locked = (level.preset ?? []).filter((p) => p.locked);
        expect(sol.solution.filter((p) => p.locked)).toEqual(locked);
        // Nothing added on a no-add level; a vertical-only station keeps its x.
        if (level.canAdd === false) expect(sol.solution).toHaveLength(level.preset!.length);
        if (level.stationVertical) expect(sol.solution[0]!.x).toBe(level.preset![0]!.x);
        // A vertical-only point keeps its x and its flag.
        (level.preset ?? []).forEach((p, i) => {
          if (!p.vertical) return;
          expect(sol.solution[i]!.vertical, `point ${i}`).toBe(true);
          expect(sol.solution[i]!.x, `point ${i}`).toBe(p.x);
        });
        // Only the level's tools: no loop before the loop lesson.
        const tools = level.tools ?? ['point', 'loop'];
        if (!tools.includes('loop')) expect(sol.solution.some((p) => p.kind === 'loop')).toBe(false);
        for (const p of sol.solution) {
          expect(p.x).toBeGreaterThanOrEqual(0.5);
          // the level's own width (src/core/world.ts): 60 m unless it is a long ride
          expect(p.x).toBeLessThanOrEqual(levelWorldW(level) - 0.5);
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
            if (dx !== 0 && (p.vertical || (i === 0 && level.stationVertical))) continue; // it cannot move sideways
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

  // 2026-10-15: the air time lesson's good band. The child only drags the hilltop up and down; a
  // wide band of heights (6 m to 16 m: 10 m of slack) floats the fuzz for the half second, the start
  // height does not, and too high strands it.
  describe('hang: the hilltop band', () => {
    const level = findLevel('hang')!;
    const withTop = (y: number): TrackPoint[] => level.preset!.map((p) => (p.vertical ? { ...p, y } : { ...p }));

    it('the preset is the drag-the-top shape: locked station, feet and end, one vertical-only top', () => {
      const preset = level.preset!;
      expect(preset.map((p) => !!p.locked)).toEqual([true, true, false, true, true]);
      expect(preset.filter((p) => p.vertical)).toHaveLength(1);
      expect(preset[2]!.vertical).toBe(true);
      expect(preset[preset.length - 1]).toMatchObject({ x: level.finish!.x, y: level.finish!.y });
      expect(level.tools).toEqual([]);
      expect(level.canAdd).toBe(false);
      expect(level.goals[0]).toMatchObject({ metric: 'hangTime', op: '>=', value: 0.5 });
    });

    it('the start height floats a little, short of the goal', () => {
      const r = ride(level, withTop(level.preset![2]!.y));
      expect(r.outcome).toBe('reachedEnd');
      expect(r.metrics.hangTime).toBeGreaterThan(0.1);
      expect(r.metrics.hangTime).toBeLessThan(0.4);
      expect(r.passed).toBe(false);
    });

    it('every height from 6.5 m to 15.5 m passes (9 m of slack), with more air the higher it goes', () => {
      let last = 0;
      for (let y = 6.5; y <= 15.5; y += 0.5) {
        const r = ride(level, withTop(y));
        expect(r.passed, `top ${y}: ${r.outcome} ${r.metrics.hangTime.toFixed(2)} s`).toBe(true);
        expect(r.metrics.hangTime, `top ${y}`).toBeGreaterThanOrEqual(last - 0.02);
        last = r.metrics.hangTime;
      }
    });

    it('too high (17 m and up) the fuzz cannot get over the hill', () => {
      for (let y = 17; y <= 37; y += 2) {
        const r = ride(level, withTop(y));
        expect(r.outcome, `top ${y}`).not.toBe('reachedEnd');
        expect(r.passed, `top ${y}`).toBe(false);
      }
    });

    it('the air comes from the crest of the hill, not a plunge', () => {
      const r = ride(level, withTop(10));
      expect(r.steepHang).toBeLessThan(0.05);
    });
  });

  it('thrill: the solution gets its hang time from crests (a hump), not from a plunge', () => {
    const level = findLevel('thrill')!;
    const r = ride(level, SOLUTIONS.find((s) => s.id === 'thrill')!.solution);
    expect(r.metrics.hangTime).toBeGreaterThanOrEqual(1);
    expect(r.steepHang).toBeLessThan(0.05);
    expect(r.metrics.maxG).toBeLessThanOrEqual(4);
  });

  // ---- 2026-10-15: per-level world width ----
  describe('world width', () => {
    it('one-screen levels keep the 60 m world; the long rides and free play are wider', () => {
      expect(DEFAULT_WORLD_W).toBe(WORLD_W);
      const wide = LEVELS.filter((l) => isWideLevel(l)).map((l) => l.id);
      expect(wide).toEqual(['loopgate', 'tour', 'finale', 'marathon', 'free']);
      for (const level of LEVELS) {
        if (!isWideLevel(level)) expect(levelWorldW(level), level.id).toBe(60);
        else expect(levelWorldW(level), level.id).toBeGreaterThanOrEqual(120);
      }
    });

    it('every flag and every preset point sits inside its level\'s world, the flag in its far half', () => {
      for (const level of LEVELS) {
        const w = levelWorldW(level);
        for (const p of level.preset ?? []) {
          expect(p.x, level.id).toBeGreaterThanOrEqual(0.5);
          expect(p.x, level.id).toBeLessThanOrEqual(w - 0.5);
        }
        if (!level.finish) continue;
        expect(level.finish.x + level.finish.r, level.id).toBeLessThanOrEqual(w);
        if (isWideLevel(level)) expect(level.finish.x, level.id).toBeGreaterThan(w - 10);
      }
    });

    it('each long ride needs its room: the recorded solution runs past the first screen', () => {
      for (const id of ['loopgate', 'tour', 'finale', 'marathon']) {
        const sol = SOLUTIONS.find((s) => s.id === id)!.solution;
        expect(Math.max(...sol.map((p) => p.x)), id).toBeGreaterThan(110);
        const r = ride(findLevel(id)!, sol);
        expect(r.metrics.length, id).toBeGreaterThan(130);
      }
    });

    it('a ride on a wide world runs to the end of the rail far past 60 m (no edge ends the run)', () => {
      const level = findLevel('marathon')!;
      const track = buildTrack(expandTrackPoints(SOLUTIONS.find((s) => s.id === 'marathon')!.solution).pts)!;
      const sim = new CartSim(track);
      let maxX = 0;
      for (let i = 0; i < 60 * 95 && sim.outcome === 'running'; i++) {
        sim.step();
        maxX = Math.max(maxX, sim.snapshot().pos.x);
      }
      expect(sim.outcome).toBe('reachedEnd');
      expect(maxX).toBeGreaterThan(160);
      expect(ride(level, SOLUTIONS.find((s) => s.id === 'marathon')!.solution).metrics.atFinish).toBe(1);
    });

    it('a fall far out on a wide world is still a fall (the loop test does not depend on x)', () => {
      const level = findLevel('tour')!;
      // A loop 130 m out, only a little below the station: too slow at its top.
      const r = ride(level, [lock(2, 34), c(20, 22), c(110, 21), loop(130, 21), c(146, 18)]);
      expect(r.outcome).toBe('fell');
      expect(r.passed).toBe(false);
    });
  });

  // ---- 2026-10-15: the prebuilt-track levels ----
  describe('loopgate: the station band', () => {
    const level = findLevel('loopgate')!;

    it('the station only slides up and down and stays on Clear; the loop and its feet are locked', () => {
      expect(level.stationVertical).toBe(true);
      const preset = level.preset!;
      expect(preset.map((p) => !!p.locked)).toEqual([false, true, true, true]);
      expect(preset[2]!.kind).toBe('loop');
      const rules = editRules(level);
      const built = gate(17);
      expect(clearedPoints(rules, built)).toEqual(gate(17, []));
      expect(canDeletePoint(rules, built, 0)).toBe(false);
      expect(canDeletePoint(rules, built, 4)).toBe(true);
      for (const i of [1, 2, 3]) {
        expect(canGrab(built, i), `point ${i}`).toBe(false);
        expect(canDeletePoint(rules, built, i), `point ${i}`).toBe(false);
      }
    });

    it('no point goes into the prebuilt loop: taps on its rail add nothing', () => {
      const pts = gate(17, []);
      // On the rail just past the loop's left foot and just before its right foot.
      expect(insertionIndex(pts, { x: 44, y: 2.8 }, 1.25)).toBeNull();
      expect(insertionIndex(pts, { x: 60, y: 2.6 }, 1.25)).toBeNull();
      // The open rail from the station to the loop takes a point.
      expect(insertionIndex(pts, { x: 21, y: 10.2 }, 2)).toBe(0);
    });

    it('every station height from 12.5 m to 20.5 m passes (8 m of slack); lower falls short, higher squishes', () => {
      for (let y = 12.5; y <= 20.5; y += 0.5) {
        expect(ride(level, gate(y)).passed, `station ${y}`).toBe(true);
      }
      for (const y of [6, 8, 10, 12]) {
        const r = ride(level, gate(y));
        expect(r.metrics.loopsCompleted, `station ${y}`).toBe(0);
        expect(r.passed, `station ${y}`).toBe(false);
      }
      for (const y of [21.5, 24, 28, 34]) {
        const r = ride(level, gate(y));
        expect(r.outcome, `station ${y}`).toBe('reachedEnd');
        expect(r.metrics.maxG, `station ${y}`).toBeGreaterThan(9);
        expect(r.passed, `station ${y}`).toBe(false);
      }
    });
  });

  describe('finale: the prebuilt finish', () => {
    const level = findLevel('finale')!;
    const sol = SOLUTIONS.find((s) => s.id === 'finale')!.solution;

    it('the station and the finale are locked; only the stretch between them is open', () => {
      const preset = level.preset!;
      expect(preset.every((p) => p.locked)).toBe(true);
      expect(preset.filter((p) => p.openAfter)).toHaveLength(1);
      expect(preset[0]!.openAfter).toBe(true);
      expect(preset[preset.length - 1]).toMatchObject({ x: level.finish!.x, y: level.finish!.y });
      // Clear keeps the whole prebuilt track.
      expect(clearedPoints(editRules(level), sol)).toEqual(preset);
      // No locked point can be grabbed or deleted.
      sol.forEach((p, i) => {
        if (!p.locked) return;
        expect(canGrab(sol, i), `point ${i}`).toBe(false);
        expect(canDeletePoint(editRules(level), sol, i), `point ${i}`).toBe(false);
      });
    });

    it('a tap on the open rail adds a point there; a tap on the finale adds nothing', () => {
      const preset = level.preset!;
      // A spot on the plain rail from (2, 28) to (96, 16), read off the built track.
      const rail = buildTrack(expandTrackPoints(preset).pts)!.samples;
      const at48 = rail.reduce((a, b) => (Math.abs(b.pos.x - 48) < Math.abs(a.pos.x - 48) ? b : a)).pos;
      expect(insertionIndex(preset, at48, 1.5)).toBe(0);
      // On the finale's rail (between its locked points).
      expect(insertionIndex(preset, { x: 100, y: 13.2 }, 1.5)).toBeNull();
      expect(insertionIndex(preset, { x: 140, y: 9 }, 1.5)).toBeNull();
    });

    it('a sky tap past the open stretch adds nothing: the locked end already sits on the flag', () => {
      expect(canAppend(level.preset!, level.finish)).toBe(false);
      expect(canAppend(sol, level.finish)).toBe(false);
      // Every other level may still append after its end (the drop and air time lessons add
      // nothing at all through `canAdd`).
      for (const l of LEVELS) {
        if (l.id === 'finale' || l.canAdd === false) continue;
        expect(canAppend(l.preset ?? [], l.finish), l.id).toBe(true);
      }
    });

    it('a tap on the sky over the open stretch goes into it, in x order; past the finale it does not', () => {
      const preset = level.preset!;
      expect(openGapIndex(preset, 30)).toBe(0);
      expect(openGapIndex(sol, 30)).toBe(2); // after c(26, 10)
      expect(openGapIndex(sol, 90)).toBe(6); // after c(86, 16), before the finale
      expect(openGapIndex(sol, 110)).toBeNull();
      // Levels without an open stretch never redirect a sky tap.
      for (const l of LEVELS) {
        if (l.id === 'finale') continue;
        for (const x of [10, 30, 50, 100]) expect(openGapIndex(l.preset ?? [], x), l.id).toBeNull();
      }
    });
  });
});
