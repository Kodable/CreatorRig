import { describe, it, expect } from 'vitest';
import { evaluateGoals, allPass } from './goals';
import { LEVELS, findLevel } from './levels';
import { Goal, Metrics, GoalResult } from './types';

describe('evaluateGoals', () => {
  describe('operator >= (greater than or equal)', () => {
    it('passes when current >= value', () => {
      const goals: Goal[] = [
        { metric: 'maxDrop', op: '>=', value: 10, label: 'test' }
      ];
      const metrics: Metrics = {
        maxDrop: 15,
        maxSpeed: 0,
        length: 0,
        hangTime: 0,
        loops: 0,
        loopsCompleted: 0,
        maxG: 0,
        reachedEnd: 0,
        atFinish: 0
      };
      const results = evaluateGoals(goals, metrics);
      expect(results[0]!.pass).toBe(true);
      expect(results[0]!.current).toBe(15);
    });

    it('passes when current == value', () => {
      const goals: Goal[] = [
        { metric: 'maxSpeed', op: '>=', value: 20, label: 'test' }
      ];
      const metrics: Metrics = {
        maxDrop: 0,
        maxSpeed: 20,
        length: 0,
        hangTime: 0,
        loops: 0,
        loopsCompleted: 0,
        maxG: 0,
        reachedEnd: 0,
        atFinish: 0
      };
      const results = evaluateGoals(goals, metrics);
      expect(results[0]!.pass).toBe(true);
    });

    it('fails when current < value', () => {
      const goals: Goal[] = [
        { metric: 'length', op: '>=', value: 100, label: 'test' }
      ];
      const metrics: Metrics = {
        maxDrop: 0,
        maxSpeed: 0,
        length: 50,
        hangTime: 0,
        loops: 0,
        loopsCompleted: 0,
        maxG: 0,
        reachedEnd: 0,
        atFinish: 0
      };
      const results = evaluateGoals(goals, metrics);
      expect(results[0]!.pass).toBe(false);
    });
  });

  describe('operator <= (less than or equal)', () => {
    it('passes when current <= value', () => {
      const goals: Goal[] = [
        { metric: 'maxG', op: '<=', value: 5, label: 'test' }
      ];
      const metrics: Metrics = {
        maxDrop: 0,
        maxSpeed: 0,
        length: 0,
        hangTime: 0,
        loops: 0,
        loopsCompleted: 0,
        maxG: 3,
        reachedEnd: 0,
        atFinish: 0
      };
      const results = evaluateGoals(goals, metrics);
      expect(results[0]!.pass).toBe(true);
      expect(results[0]!.current).toBe(3);
    });

    it('passes when current == value', () => {
      const goals: Goal[] = [
        { metric: 'hangTime', op: '<=', value: 2, label: 'test' }
      ];
      const metrics: Metrics = {
        maxDrop: 0,
        maxSpeed: 0,
        length: 0,
        hangTime: 2,
        loops: 0,
        loopsCompleted: 0,
        maxG: 0,
        reachedEnd: 0,
        atFinish: 0
      };
      const results = evaluateGoals(goals, metrics);
      expect(results[0]!.pass).toBe(true);
    });

    it('fails when current > value', () => {
      const goals: Goal[] = [
        { metric: 'maxG', op: '<=', value: 3, label: 'test' }
      ];
      const metrics: Metrics = {
        maxDrop: 0,
        maxSpeed: 0,
        length: 0,
        hangTime: 0,
        loops: 0,
        loopsCompleted: 0,
        maxG: 5,
        reachedEnd: 0,
        atFinish: 0
      };
      const results = evaluateGoals(goals, metrics);
      expect(results[0]!.pass).toBe(false);
    });
  });

  describe('operator == (equal)', () => {
    it('passes when current == value (within epsilon)', () => {
      const goals: Goal[] = [
        { metric: 'loops', op: '==', value: 1, label: 'test' }
      ];
      const metrics: Metrics = {
        maxDrop: 0,
        maxSpeed: 0,
        length: 0,
        hangTime: 0,
        loops: 1,
        loopsCompleted: 0,
        maxG: 0,
        reachedEnd: 0,
        atFinish: 0
      };
      const results = evaluateGoals(goals, metrics);
      expect(results[0]!.pass).toBe(true);
    });

    it('passes when current is very close to value (epsilon tolerance)', () => {
      const goals: Goal[] = [
        { metric: 'reachedEnd', op: '==', value: 1, label: 'test' }
      ];
      const metrics: Metrics = {
        maxDrop: 0,
        maxSpeed: 0,
        length: 0,
        hangTime: 0,
        loops: 0,
        loopsCompleted: 0,
        maxG: 0,
        reachedEnd: 1 + 1e-10,  // within epsilon
        atFinish: 0
      };
      const results = evaluateGoals(goals, metrics);
      expect(results[0]!.pass).toBe(true);
    });

    it('fails when current != value', () => {
      const goals: Goal[] = [
        { metric: 'reachedEnd', op: '==', value: 1, label: 'test' }
      ];
      const metrics: Metrics = {
        maxDrop: 0,
        maxSpeed: 0,
        length: 0,
        hangTime: 0,
        loops: 0,
        loopsCompleted: 0,
        maxG: 0,
        reachedEnd: 0,
        atFinish: 0
      };
      const results = evaluateGoals(goals, metrics);
      expect(results[0]!.pass).toBe(false);
    });
  });

  describe('all metrics coverage', () => {
    it('evaluates all 8 metrics correctly', () => {
      const goals: Goal[] = [
        { metric: 'maxDrop', op: '>=', value: 10, label: 'maxDrop' },
        { metric: 'maxSpeed', op: '>=', value: 15, label: 'maxSpeed' },
        { metric: 'length', op: '>=', value: 50, label: 'length' },
        { metric: 'hangTime', op: '>=', value: 0.5, label: 'hangTime' },
        { metric: 'loops', op: '>=', value: 0, label: 'loops' },
        { metric: 'loopsCompleted', op: '>=', value: 0, label: 'loopsCompleted' },
        { metric: 'maxG', op: '<=', value: 5, label: 'maxG' },
        { metric: 'reachedEnd', op: '==', value: 1, label: 'reachedEnd' }
      ];
      const metrics: Metrics = {
        maxDrop: 15,
        maxSpeed: 20,
        length: 100,
        hangTime: 1.5,
        loops: 1,
        loopsCompleted: 1,
        maxG: 4,
        reachedEnd: 1,
        atFinish: 0
      };
      const results = evaluateGoals(goals, metrics);
      expect(results).toHaveLength(8);
      expect(results.every(r => r.pass)).toBe(true);
    });
  });
});

describe('allPass', () => {
  it('returns true for empty results array', () => {
    expect(allPass([])).toBe(true);
  });

  it('returns true when all results pass', () => {
    const results: GoalResult[] = [
      { goal: { metric: 'maxDrop', op: '>=', value: 10, label: 'test' }, current: 15, pass: true },
      { goal: { metric: 'maxSpeed', op: '>=', value: 15, label: 'test' }, current: 20, pass: true }
    ];
    expect(allPass(results)).toBe(true);
  });

  it('returns false when at least one result fails', () => {
    const results: GoalResult[] = [
      { goal: { metric: 'maxDrop', op: '>=', value: 10, label: 'test' }, current: 15, pass: true },
      { goal: { metric: 'maxSpeed', op: '>=', value: 15, label: 'test' }, current: 10, pass: false }
    ];
    expect(allPass(results)).toBe(false);
  });

  it('returns false when all results fail', () => {
    const results: GoalResult[] = [
      { goal: { metric: 'maxDrop', op: '>=', value: 10, label: 'test' }, current: 5, pass: false },
      { goal: { metric: 'maxSpeed', op: '>=', value: 15, label: 'test' }, current: 10, pass: false }
    ];
    expect(allPass(results)).toBe(false);
  });
});

describe('LEVELS', () => {
  it('has exactly 12 levels', () => {
    expect(LEVELS).toHaveLength(12);
  });

  it('has levels in correct order with correct ids', () => {
    const expectedIds = ['drop', 'complete', 'speed', 'length', 'hang', 'loop', 'intense', 'double', 'thrill', 'express', 'grand', 'free'];
    const actualIds = LEVELS.map(level => level.id);
    expect(actualIds).toEqual(expectedIds);
  });

  it('drop level has correct structure', () => {
    const dropLevel = LEVELS[0];
    expect(dropLevel).toBeDefined();
    expect(dropLevel!.id).toBe('drop');
    expect(dropLevel!.title).toBe('Vertical drop');
    expect(dropLevel!.goals).toHaveLength(3);
    expect(dropLevel!.goals[0]!.metric).toBe('maxDrop');
    expect(dropLevel!.goals[0]!.op).toBe('>=');
    expect(dropLevel!.goals[0]!.value).toBe(15);
    expect(dropLevel!.preset).toEqual([
      { x: 8, y: 14, kind: 'curve' },
      { x: 52, y: 4, kind: 'curve' }
    ]);
  });

  it('drop level preset has 2 points', () => {
    const dropLevel = LEVELS[0];
    expect(dropLevel!.preset).toHaveLength(2);
  });

  it('complete level has a locked preset and a finish zone', () => {
    const completeLevel = LEVELS[1];
    expect(completeLevel).toBeDefined();
    expect(completeLevel!.id).toBe('complete');
    expect(completeLevel!.preset).toBeDefined();
    completeLevel!.preset!.forEach(p => expect(p.locked).toBe(true));
    expect(completeLevel!.finish).toBeDefined();
  });

  it('length level has correct goals', () => {
    const lengthLevel = LEVELS[3];
    expect(lengthLevel).toBeDefined();
    expect(lengthLevel!.id).toBe('length');
    expect(lengthLevel!.goals).toHaveLength(3);
    expect(lengthLevel!.goals[0]!.metric).toBe('length');
    expect(lengthLevel!.goals[0]!.op).toBe('>=');
    expect(lengthLevel!.goals[1]!.metric).toBe('atFinish');
    expect(lengthLevel!.goals[2]!.metric).toBe('reachedEnd');
    expect(lengthLevel!.goals[2]!.op).toBe('==');
  });

  it('free level is last and has no goals', () => {
    const freeLevel = LEVELS[LEVELS.length - 1];
    expect(freeLevel).toBeDefined();
    expect(freeLevel!.id).toBe('free');
    expect(freeLevel!.goals).toHaveLength(0);
  });

  it('all levels have required hint strings', () => {
    LEVELS.forEach(level => {
      expect(level.hints).toBeDefined();
      expect(level.hints.rolledBack).toBeDefined();
      expect(level.hints.stuck).toBeDefined();
      expect(level.hints.fell).toBeDefined();
      expect(typeof level.hints.rolledBack).toBe('string');
      expect(typeof level.hints.stuck).toBe('string');
      expect(typeof level.hints.fell).toBe('string');
    });
  });
});

describe('findLevel', () => {
  it('returns the loop level when searching for "loop"', () => {
    const level = findLevel('loop');
    expect(level).toBeDefined();
    expect(level!.id).toBe('loop');
    expect(level!.title).toBe('Loops');
  });

  it('returns undefined when searching for non-existent level', () => {
    const level = findLevel('nope');
    expect(level).toBeUndefined();
  });

  it('finds all levels by their id', () => {
    const ids = ['drop', 'complete', 'speed', 'length', 'hang', 'loop', 'intense', 'double', 'thrill', 'express', 'grand', 'free'];
    ids.forEach(id => {
      const level = findLevel(id);
      expect(level).toBeDefined();
      expect(level!.id).toBe(id);
    });
  });
});
