import { describe, expect, it } from 'vitest';
import { allPass, evaluateGoals } from '../../../kit/goals';
import { createStructuresSim } from './sim';
import { LEVELS, findLevel } from './levels';
import type { StructuresLevel } from './types';

/** Step the sim until it stops running, capped so a bad build cannot hang the suite. */
async function runToOutcome(sim: Awaited<ReturnType<typeof createStructuresSim>>, level: StructuresLevel) {
  sim.play();
  const cap = level.test.duration * 60 + 200;
  let ticks = 0;
  while (sim.outcome === 'running' && ticks < cap) {
    sim.step();
    ticks++;
  }
  return sim;
}

describe('structures levels', () => {
  it('has 9 entries in order with unique ids', () => {
    expect(LEVELS).toHaveLength(9);
    const expectedOrder = ['stack', 'base', 'material', 'beam', 'glue', 'wind', 'blast', 'budget', 'free'];
    expect(LEVELS.map((l) => l.id)).toEqual(expectedOrder);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });

  it('findLevel finds by id and misses unknown ids', () => {
    expect(findLevel('stack')?.title).toBe('Stack it up');
    expect(findLevel('nope')).toBeUndefined();
  });

  for (const level of LEVELS) {
    it(`${level.id}: has unique part ids in parts and solution`, () => {
      const partIds = level.parts.map((p) => p.id);
      expect(new Set(partIds).size).toBe(partIds.length);
      if (level.solution) {
        const solutionIds = level.solution.map((p) => p.id);
        expect(new Set(solutionIds).size).toBe(solutionIds.length);
      }
    });

    if (level.goals.length > 0) {
      it(`${level.id}: solution fuzz starts above keepAbove + 0.2`, () => {
        const fuzz = (level.solution ?? level.parts).find((p) => p.kind === 'fuzz');
        expect(fuzz).toBeDefined();
        expect(fuzz!.y).toBeGreaterThanOrEqual(level.keepAbove + 0.2);
      });

      it(`${level.id}: solution survives and passes its goals`, async () => {
        expect(level.solution).toBeDefined();
        const sim = await createStructuresSim(level.solution!, level);
        await runToOutcome(sim, level);
        expect(sim.outcome).toBe('survived');
        const results = evaluateGoals(level.goals, sim.metrics());
        expect(allPass(results)).toBe(true);
        sim.destroy();
      });

      it(`${level.id}: preset alone fails its goals`, async () => {
        const sim = await createStructuresSim(level.parts, level);
        await runToOutcome(sim, level);
        const results = evaluateGoals(level.goals, sim.metrics());
        expect(allPass(results)).toBe(false);
        sim.destroy();
      });
    }
  }

  it('glue: the wood preset loses the beam, steel solution holds', async () => {
    const level = findLevel('glue')!;
    const woodSim = await createStructuresSim(level.parts, level);
    await runToOutcome(woodSim, level);
    expect(woodSim.metrics().partsFell).toBeGreaterThanOrEqual(1);
    woodSim.destroy();

    const steelSim = await createStructuresSim(level.solution!, level);
    await runToOutcome(steelSim, level);
    expect(steelSim.metrics().partsFell).toBe(0);
    expect(steelSim.outcome).toBe('survived');
    steelSim.destroy();
  });
});
