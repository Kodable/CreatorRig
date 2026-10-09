import { describe, expect, it } from 'vitest';
import { FLOOFTOPIA_LEVELS } from './flooftopia';
import { proveLevels, sticksOf } from './prove';
import { PLANETS } from '../planets';
import { flat, withCobbles, withHill, withStairs } from '../terrain';
import type { Vec2 } from '../types';

/** The five intros as they were on 2026-10-02 (their terrain, beacon, budget, palette size and
 * solution), rebuilt here with the same helpers: moving them to Flooftopia (2026-10-09) changed
 * their words only, and Flooftopia's gravity and grass ground are the old physics exactly. */
const OLD_INTROS: Record<string, { terrain: Vec2[]; finishX: number; budget: number; palette: number; solution: [string, number, string][] }> = {
  wheels: { terrain: withHill(flat(), 11, 17, 1.2), finishX: 27, budget: 4, palette: 2, solution: [['wheelCircle', -45, 'cup'], ['wheelCircle', -135, 'cup']] },
  shape: { terrain: withStairs(flat(), 12, 4, 0.15, 0.6), finishX: 27, budget: 6, palette: 2, solution: [['wheelStar', -45, 'cup'], ['wheelStar', -135, 'cup']] },
  mount: { terrain: withCobbles(flat(), 8, 18, 0.15, 0.6), finishX: 27, budget: 6, palette: 1, solution: [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring']] },
  weight: { terrain: flat(), finishX: 17, budget: 7, palette: 6, solution: [['wheelCircle', -45, 'cup'], ['wheelCircle', -135, 'cup'], ['watermelon', 0, 'cup']] },
  power: { terrain: withHill(flat(), 10, 16, 2.5), finishX: 27, budget: 8, palette: 9, solution: [['wheelCircle', -45, 'cup'], ['wheelCircle', -135, 'cup'], ['fan', 180, 'cup']] },
};

describe('Flooftopia levels (the intros)', () => {
  it('Flooftopia is like Earth for the floofs: the old 10 m/s^2 gravity, grass ground', () => {
    expect(PLANETS.flooftopia.gravity).toBe(10);
    expect(PLANETS.flooftopia.ground).toBe('grass');
  });

  for (const level of FLOOFTOPIA_LEVELS) {
    it(`${level.id}: same terrain, beacon, budget, palette and solution as on 2026-10-02, all grass`, () => {
      const old = OLD_INTROS[level.id]!;
      expect(level.terrain).toEqual(old.terrain);
      expect(level.parts.find((p) => p.kind === 'finish')!.x).toBe(old.finishX);
      expect(level.budget).toBe(old.budget);
      expect(level.palette).toHaveLength(old.palette);
      expect(level.timeout).toBeUndefined();
      expect(level.altSolutions).toBeUndefined();
      expect(sticksOf(level.solution!)).toEqual(old.solution);
      expect(level.surfaces).toBeUndefined();
      expect(level.rocks).toBeUndefined();
      expect(level.extentW).toBe(30);
    });

    it(`${level.id}: the words are Flooftopia's, not Mars's`, () => {
      const words = [level.title, level.bruno, ...level.hints, ...Object.values(level.failHints)].join(' ');
      expect(words).not.toMatch(/mars|crater|marstopia|dusty|rust/i);
    });
  }

  it('the first level welcomes the child to Flooftopia', () => {
    expect(FLOOFTOPIA_LEVELS[0]!.bruno).toMatch(/Flooftopia/);
  });

  it('the intro Bruno lines are short (the coach carries the steps) and coins are not on them', () => {
    for (const level of FLOOFTOPIA_LEVELS) {
      expect(level.bruno.length, level.id).toBeLessThanOrEqual(70);
      expect(level.bruno, level.id).not.toMatch(/coin/i);
    }
  });
});

proveLevels('Flooftopia', FLOOFTOPIA_LEVELS);
