// Proves every scored level's `solution` (with `solutionShots` retunes where given) clears its
// goals within its shot budget, and that the preset alone (fired for every shot) does not.
import { describe, expect, it } from 'vitest';
import { allPass, evaluateGoals } from '../../../kit/goals';
import { createCatapultSim } from './sim';
import { LEVELS, findLevel } from './levels';
import type { CatapultLevel } from './types';

const MAX_TICKS_PER_SHOT = 660;
const STACK_LEVEL_IDS = ['pyramid', 'towers', 'wall', 'dominoes'];
const LINE_LEVEL_IDS = ['line', 'chain', ...STACK_LEVEL_IDS];

async function fireAllShots(parts: CatapultLevel['parts'], level: CatapultLevel, solutionShots?: Record<string, string>[]) {
  const sim = await createCatapultSim(parts, level);
  const catapultPart = parts.find((part) => part.kind === 'catapult');
  if (!catapultPart) throw new Error(`level ${level.id} has no catapult part`);

  let passed = false;
  const shotBudget = level.shots > 0 ? level.shots : 1;
  for (let shot = 0; shot < shotBudget; shot++) {
    const override = solutionShots?.[shot];
    if (override && sim.updatePart) {
      sim.updatePart({ ...catapultPart, props: { ...catapultPart.props, ...override } });
    }
    sim.play();
    for (let tick = 0; tick < MAX_TICKS_PER_SHOT && sim.outcome === 'running'; tick++) {
      sim.step();
    }
    passed = allPass(evaluateGoals(level.goals, sim.metrics()));
    if (passed || sim.outcome === 'cleared' || sim.outcome === 'outOfShots') break;
  }
  return { sim, passed };
}

describe('catapult levels: structure', () => {
  it('has 16 entries with unique ids, free play last', () => {
    expect(LEVELS).toHaveLength(15);
    // Stakeholder direction 2026-09-22: intro levels (one new mechanic each) up front, then a run
    // of challenge levels that mix everything.
    expect(LEVELS.map((level) => level.id)).toEqual([
      'power', 'angle', 'weight', 'arm', 'move', 'donut', 'both', 'tower', 'line', 'chain',
      // Stakeholder request 2026-09-22: stack levels with a lenient line, before free play.
      'pyramid', 'towers', 'wall', 'dominoes',
      'free',
    ]);
    expect(new Set(LEVELS.map((level) => level.id)).size).toBe(LEVELS.length);
  });

  it('the first six levels each introduce at most one code, and together introduce exactly ' +
    'power, angle, fuzz (the weight level), arm and the Donut option (fuzz:Donut, its own level); ' +
    'the challenge levels introduce nothing', () => {
    const introLevels = LEVELS.slice(0, 6);
    const challengeLevels = LEVELS.slice(6);

    for (const level of introLevels) {
      expect(level.introduces?.length ?? 0).toBeLessThanOrEqual(1);
    }
    const introducedTogether = introLevels.flatMap((level) => level.introduces ?? []);
    expect(new Set(introducedTogether)).toEqual(new Set(['power', 'angle', 'fuzz', 'arm', 'fuzz:Donut']));
    expect(findLevel('weight')!.introduces).toEqual(['fuzz']);
    expect(findLevel('donut')!.introduces).toEqual(['fuzz:Donut']);
    expect(introducedTogether).toHaveLength(5); // no duplicates, no empties beyond 'move'

    for (const level of challengeLevels) {
      expect(level.introduces ?? []).toEqual([]);
    }
  });

  it('finds a level by id and returns undefined for an unknown one', () => {
    expect(findLevel('power')?.title).toBe('Fling it');
    expect(findLevel('nope')).toBeUndefined();
  });

  for (const level of LEVELS) {
    it(`${level.id}: unique part ids, exactly one catapult, valid lockedProps`, () => {
      const partIds = level.parts.map((part) => part.id);
      expect(new Set(partIds).size).toBe(partIds.length);

      const catapults = level.parts.filter((part) => part.kind === 'catapult');
      expect(catapults).toHaveLength(1);

      const catapult = catapults[0]!;
      expect(catapult.locked).toBe(true);
      for (const code of catapult.lockedProps ?? []) {
        expect(Object.keys(catapult.props)).toContain(code);
      }

      if (level.solution) {
        const solutionCatapults = level.solution.filter((part) => part.kind === 'catapult');
        expect(solutionCatapults).toHaveLength(1);
      }
    });
  }
});

describe('catapult levels: solutions', () => {
  for (const level of LEVELS) {
    if (level.goals.length === 0) continue;

    it(`${level.id}: solution passes within the shot budget`, async () => {
      const solutionParts = level.solution ?? level.parts;
      const { sim, passed } = await fireAllShots(solutionParts, level, level.solutionShots);
      expect(passed).toBe(true);
      sim.destroy();
    });

    it(`${level.id}: the preset alone does not pass`, async () => {
      const { sim, passed } = await fireAllShots(level.parts, level);
      expect(passed).toBe(false);
      sim.destroy();
    });
  }
});

// The three levels from the 2026-09-22 huddle: a line goal, a chain reaction, the split (Prism's
// then, the Donut's since 2026-10-01).
describe('catapult levels: line, chain, donut', () => {
  it('line levels draw their line: an hline marker at level.line, goal aboveLine == 0', () => {
    for (const id of LINE_LEVEL_IDS) {
      const level = findLevel(id)!;
      expect(level.line).toBeDefined();
      expect(level.markers).toContainEqual(expect.objectContaining({ kind: 'hline', y: level.line }));
      expect(level.goals).toEqual([expect.objectContaining({ metric: 'aboveLine', op: '==', value: 0 })]);
    }
  });

  it('the old levels have no line (aboveLine stays 0 there)', () => {
    for (const level of LEVELS) {
      if (LINE_LEVEL_IDS.includes(level.id)) continue;
      expect(level.line).toBeUndefined();
    }
  });

  it('chain: the solution tips the dominoes in order, left to right, and CRASH! fires', async () => {
    const level = findLevel('chain')!;
    const parts = level.solution!;
    const sim = await createCatapultSim(parts, level);
    const dominoes = sim.handles().filter((h) => h.kind === 'block').sort((a, b) => a.bounds.x - b.bounds.x);
    const tippedAt = new Map<number, number>();
    let crash = false;
    sim.play();
    for (let tick = 0; tick < MAX_TICKS_PER_SHOT && sim.outcome === 'running'; tick++) {
      sim.step();
      const snap = sim.snapshot();
      for (const d of dominoes) {
        const t = snap.transforms.get(d.bodies[0]!.id)!;
        if (!tippedAt.has(d.partId) && Math.abs(t.angle) > Math.PI / 4) tippedAt.set(d.partId, tick);
      }
      if ((snap.overlay ?? []).some((o) => o.kind === 'sprite' && o.textureKey === 'fx-crash')) crash = true;
    }
    const order = dominoes.map((d) => tippedAt.get(d.partId));
    expect(order.every((t) => t !== undefined)).toBe(true);
    for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThan(order[i - 1]!);
    expect(crash).toBe(true);
    expect(sim.metrics().aboveLine).toBe(0);
    sim.destroy();
  });

  it('donut: the Donut is locked in the preset and the solution', () => {
    const level = findLevel('donut')!;
    for (const parts of [level.parts, level.solution!]) {
      const cp = parts.find((p) => p.kind === 'catapult')!;
      expect(cp.props.fuzz).toBe('Donut');
      expect(cp.lockedProps).toContain('fuzz');
    }
  });

  it('donut: no fuzz that doesn\'t split (every power, angle, fuzz, arm) takes two cans in one shot', async () => {
    const level = findLevel('donut')!;
    const cp = level.solution!.find((p) => p.kind === 'catapult')!;
    for (const power of ['Low', 'Medium', 'High', 'Max']) {
      for (const angle of ['15', '30', '45', '60', '75']) {
        for (const fuzz of ['Flower', 'Fur', 'Helmet', 'Metal']) {
          for (const arm of ['Short', 'Long']) {
            const single = { ...cp, props: { ...cp.props, fuzz, power, angle, arm } };
            const parts = level.solution!.map((p) => (p.kind === 'catapult' ? single : p));
            const { sim, passed } = await fireAllShots(parts, level);
            expect(passed, `${power}/${angle}/${fuzz}/${arm}`).toBe(false);
            sim.destroy();
          }
        }
      }
    }
  });

  it('solutions have neighbours that also pass (not a knife edge)', async () => {
    const neighbours: Record<string, Record<string, string>[]> = {
      line: [
        { power: 'High', angle: '15', fuzz: 'Metal', arm: 'Short' },
        { power: 'Max', angle: '15', fuzz: 'Metal', arm: 'Short' },
        { power: 'High', angle: '15', fuzz: 'Metal', arm: 'Long' },
      ],
      chain: [
        { power: 'Medium', angle: '15' },
        { power: 'Medium', angle: '45' },
        { power: 'Medium', angle: '30', fuzz: 'Flower' },
      ],
      donut: [
        { power: 'High', angle: '45' },
        { power: 'Max', angle: '60' },
        { power: 'High', angle: '45', arm: 'Long' },
      ],
    };
    for (const [id, tunings] of Object.entries(neighbours)) {
      const level = findLevel(id)!;
      for (const tuning of tunings) {
        const parts = level.solution!.map((p) => (p.kind === 'catapult' ? { ...p, props: { ...p.props, ...tuning } } : p));
        const { sim, passed } = await fireAllShots(parts, level);
        expect(passed, `${id} ${JSON.stringify(tuning)}`).toBe(true);
        sim.destroy();
      }
    }
  });
});

// Stakeholder request 2026-09-22: stack levels with a lenient line, so many settings pass. The
// one-shot 120-tuning sweep that set each line lives in levels.ts's comments; here every recorded
// alternate is proven on its own.
describe('catapult levels: lenient stack levels', () => {
  it('nothing is locked, 3 shots each, and the alternates spread over power and angle', () => {
    for (const id of STACK_LEVEL_IDS) {
      const level = findLevel(id)!;
      expect(level.shots).toBe(3);
      const cp = level.parts.find((p) => p.kind === 'catapult')!;
      expect(cp.lockedProps ?? []).toEqual([]);

      const alts = level.altSolutions ?? [];
      expect(alts.length, id).toBeGreaterThanOrEqual(4);
      const solutionProps = level.solution!.find((p) => p.kind === 'catapult')!.props;
      const tunings = [solutionProps, ...alts.map((alt) => ({ ...solutionProps, ...alt }))];
      // Each alternate differs from the solution and from each other in power or angle.
      const powerAngle = new Set(tunings.map((t) => `${t.power}/${t.angle}`));
      expect(powerAngle.size, id).toBe(tunings.length);
      expect(new Set(tunings.map((t) => t.power)).size, id).toBeGreaterThanOrEqual(3);
    }
  });

  for (const id of STACK_LEVEL_IDS) {
    it(`${id}: the solution and every altSolutions tuning pass on their own, in one shot`, async () => {
      // One fuzz, not the level's three: the sweep's leniency is measured per single shot.
      const level = { ...findLevel(id)!, shots: 1 };
      const single = await fireAllShots(level.solution!, level);
      expect(single.passed, `${id} solution`).toBe(true);
      single.sim.destroy();
      for (const alt of level.altSolutions ?? []) {
        const parts = level.solution!.map((p) => (p.kind === 'catapult' ? { ...p, props: { ...p.props, ...alt } } : p));
        const { sim, passed } = await fireAllShots(parts, level);
        expect(passed, `${id} ${JSON.stringify(alt)}`).toBe(true);
        sim.destroy();
      }
    });
  }
});
