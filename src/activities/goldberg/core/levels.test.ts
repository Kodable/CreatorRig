import { describe, it, expect } from 'vitest';
import { LEVELS, findLevel } from './levels';
import { createGoldbergSim } from './sim';
import { evaluateGoals, allPass } from './goals';
import type { GoldbergSim } from './sim';
import type { PlacedPart } from './types';

const MAX_TICKS = 30 * 60 + 10; // a hair past the sim's 30s timeout so it always resolves

async function runToOutcome(parts: PlacedPart[]): Promise<GoldbergSim> {
  const sim = await createGoldbergSim(parts);
  sim.play();
  let ticks = 0;
  while (sim.outcome === 'running' && ticks < MAX_TICKS) {
    sim.step();
    ticks++;
  }
  return sim;
}

describe('LEVELS', () => {
  it('has 9 levels in the fixed order with unique ids', () => {
    expect(LEVELS.map(level => level.id)).toEqual([
      'angle', 'flip', 'add-ramp', 'dominoes', 'seesaw', 'lever', 'timing', 'chain', 'free'
    ]);
    expect(new Set(LEVELS.map(level => level.id)).size).toBe(LEVELS.length);
  });

  it('has unique, positive part ids within each level (parts and solution)', () => {
    for (const level of LEVELS) {
      const partIds = level.parts.map(part => part.id);
      expect(new Set(partIds).size).toBe(partIds.length);
      for (const id of partIds) expect(id).toBeGreaterThan(0);

      if (level.solution) {
        const solutionIds = level.solution.map(part => part.id);
        expect(new Set(solutionIds).size).toBe(solutionIds.length);
        for (const id of solutionIds) expect(id).toBeGreaterThan(0);
      }
    }
  });

  it('findLevel looks up by id and returns undefined for unknown ids', () => {
    expect(findLevel('angle')?.title).toBe('Tilt the ramp');
    expect(findLevel('free')?.title).toBe('Free play');
    expect(findLevel('does-not-exist')).toBeUndefined();
  });

  for (const level of LEVELS) {
    if (level.goals.length === 0) continue; // free play has no goals to prove

    it(`${level.id}: solution reaches the gate and passes every goal`, async () => {
      expect(level.solution).toBeTruthy();
      const sim = await runToOutcome(level.solution!);
      try {
        expect(sim.outcome).toBe('reachedGate');
        expect(allPass(evaluateGoals(level.goals, sim.metrics()))).toBe(true);
      } finally {
        sim.destroy();
      }
    });

    it(`${level.id}: the preset alone does not pass`, async () => {
      const sim = await runToOutcome(level.parts);
      try {
        const passed = sim.outcome === 'reachedGate' && allPass(evaluateGoals(level.goals, sim.metrics()));
        expect(passed).toBe(false);
      } finally {
        sim.destroy();
      }
    });
  }

  it('timing: the solution arrives at or after 5.5s and the preset ends tooEarly before 4s', async () => {
    const level = findLevel('timing')!;

    const solSim = await runToOutcome(level.solution!);
    try {
      expect(solSim.outcome).toBe('reachedGate');
      expect(solSim.metrics().elapsed).toBeGreaterThanOrEqual(5.5);
    } finally {
      solSim.destroy();
    }

    const presetSim = await runToOutcome(level.parts);
    try {
      expect(presetSim.outcome).toBe('tooEarly');
      expect(presetSim.metrics().elapsed).toBeLessThan(4);
    } finally {
      presetSim.destroy();
    }
  });
});
