// Proves every bridge level's `solution` actually crosses the river within its goals, every
// preset (anchors alone, or the wood kingpost in `material`) does not, every added part in a
// solution passes `canAddPart` in build order, `normalizeParts` drops nothing, and every
// solution's cost fits its budget. Requires `core/sim.ts` (`createBridgeSim`); if it is not on
// disk yet these tests fail to import rather than to run.
import { describe, expect, it } from 'vitest';
import { allPass, evaluateGoals } from '../../../kit/goals';
import { totalCost } from './catalog';
import { findLevel, LEVELS } from './levels';
import { canAddPart, normalizeParts } from './rules';
import { createBridgeSim } from './sim';
import type { BridgeLevel, PlacedPart } from './types';

const MAX_TICKS = 32 * 60; // 32 s at 60 Hz, past the sim's own 30 s timeout

async function runToEnd(parts: PlacedPart[], level: BridgeLevel) {
  const sim = await createBridgeSim(parts, level);
  sim.play();
  let ticks = 0;
  while (sim.outcome === 'running' && ticks < MAX_TICKS) {
    sim.step();
    ticks++;
  }
  return sim;
}

describe('bridge levels', () => {
  it('has the exact ids, in order', () => {
    expect(LEVELS.map((level) => level.id)).toEqual([
      'span',
      'triangle',
      'material',
      'budget',
      'cable',
      'heavy',
      'long',
      'tight',
      'free',
    ]);
  });

  it('findLevel looks up by id and misses cleanly', () => {
    expect(findLevel('triangle')?.title).toBe('Triangles!');
    expect(findLevel('nope')).toBeUndefined();
  });

  it('every level has three hints and a bruno line with no em-dashes', () => {
    for (const level of LEVELS) {
      expect(level.hints.length).toBe(3);
      expect(level.bruno).not.toMatch(/—/);
      for (const hint of level.hints) expect(hint).not.toMatch(/—/);
    }
  });

  for (const level of LEVELS) {
    describe(level.id, () => {
      it('every anchor (in the preset and in the solution) is locked', () => {
        for (const part of level.parts) {
          if (part.kind === 'anchor') expect(part.locked).toBe(true);
        }
        for (const part of level.solution ?? []) {
          if (part.kind === 'anchor') expect(part.locked).toBe(true);
        }
      });

      if (level.solution) {
        it('solution ids are unique and positive', () => {
          const ids = level.solution!.map((part) => part.id);
          expect(new Set(ids).size).toBe(ids.length);
          for (const id of ids) expect(id).toBeGreaterThan(0);
        });

        it('solution cost fits the budget', () => {
          expect(totalCost(level.solution!)).toBeLessThanOrEqual(level.budget);
        });

        it('every part added on top of the preset passes canAddPart in build order, and normalizeParts keeps them all', () => {
          const presetIds = new Set(level.parts.map((part) => part.id));
          const built: PlacedPart[] = [...level.parts];
          for (const part of level.solution!) {
            if (presetIds.has(part.id)) continue; // already placed by the level itself
            expect(canAddPart(part, built, level)).toBe(true);
            built.push(part);
          }
          const normalized = normalizeParts(built, level);
          expect(normalized.length).toBe(built.length);
          for (const part of built) {
            expect(normalized.some((p) => p.id === part.id)).toBe(true);
          }
        });
      }

      if (level.goals.length > 0) {
        it('the preset alone does not pass', async () => {
          const sim = await runToEnd(level.parts, level);
          try {
            const passed = sim.outcome === 'crossed' && allPass(evaluateGoals(level.goals, sim.metrics()));
            expect(passed).toBe(false);
          } finally {
            sim.destroy();
          }
        });

        it('the solution crosses and passes every goal', async () => {
          const sim = await runToEnd(level.solution!, level);
          try {
            expect(sim.outcome).toBe('crossed');
            expect(allPass(evaluateGoals(level.goals, sim.metrics()))).toBe(true);
          } finally {
            sim.destroy();
          }
        });
      } else {
        it('free play has no goals and no solution to prove', () => {
          expect(level.goals).toEqual([]);
          expect(level.solution).toBeUndefined();
        });
      }
    });
  }
});

