import { describe, expect, it } from 'vitest';
import { UNDER_WARN_AT, goalCardLive, goalCardSpec, targetText } from './goalCards';
import { LEVELS } from './levels';
import type { Goal, GoalResult, Metric, Mode } from './types';

const goal = (metric: Metric, op: Goal['op'], value: number): Goal => ({ metric, op, value, label: `${metric} ${op} ${value}` });
const result = (g: Goal, current: number): GoalResult => {
  const pass = g.op === '>=' ? current >= g.value : g.op === '<=' ? current <= g.value : Math.abs(current - g.value) < 1e-9;
  return { goal: g, current, pass };
};
const live = (g: Goal, current: number, mode: Mode, reachedEnd = true) => goalCardLive(result(g, current), mode, reachedEnd);

describe('goalCardSpec', () => {
  it('maps every metric to its icon, unit and caption', () => {
    const cases: [Metric, string, string, string][] = [
      ['maxDrop', 'drop', 'm', 'Drop'],
      ['maxSpeed', 'speed', 'm/s', 'Speed'],
      ['length', 'length', 'm', 'Track Length'],
      ['hangTime', 'air', 's', 'Air Time'],
      ['loops', 'loop', '×', 'Loops'],
      ['loopsCompleted', 'loop', '×', 'Loops'],
      ['maxG', 'g', 'g', 'G-Force'],
    ];
    for (const [metric, icon, unit, caption] of cases) {
      const spec = goalCardSpec(goal(metric, '>=', 3));
      expect(spec).toMatchObject({ icon, unit, caption, kind: 'number', number: '3', under: false });
    }
  });

  it('shows a yes/no goal as a check card with no number', () => {
    expect(goalCardSpec(goal('atFinish', '==', 1))).toEqual({ icon: 'flag', kind: 'check', number: '', unit: '', under: false, caption: 'Track to Flag' });
    expect(goalCardSpec(goal('reachedEnd', '==', 1))).toEqual({ icon: 'end', kind: 'check', number: '', unit: '', under: false, caption: 'Fuzz to the End' });
  });

  it('marks a "stay under" goal', () => {
    expect(goalCardSpec(goal('maxG', '<=', 4))).toMatchObject({ number: '4', unit: 'g', under: true });
    expect(goalCardSpec(goal('maxG', '>=', 4)).under).toBe(false);
  });

  it('prints whole targets bare, others with one decimal, loops whole, zero as 0', () => {
    expect(targetText(goal('maxDrop', '>=', 15))).toBe('15');
    expect(targetText(goal('hangTime', '>=', 0.5))).toBe('0.5');
    expect(targetText(goal('maxSpeed', '>=', 12.25))).toBe('12.3');
    expect(targetText(goal('loopsCompleted', '>=', 2))).toBe('2');
    expect(targetText(goal('loops', '>=', 1.6))).toBe('2');
    expect(targetText(goal('length', '>=', 0))).toBe('0');
  });

  it('has a card for every goal of every level (at most 3, short numbers)', () => {
    for (const level of LEVELS) {
      expect(level.goals.length).toBeLessThanOrEqual(3);
      for (const g of level.goals) {
        const spec = goalCardSpec(g);
        expect(spec.caption.length).toBeGreaterThan(0);
        expect(spec.number.length).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('goalCardLive', () => {
  const speed = goal('maxSpeed', '>=', 18);
  const drop = goal('maxDrop', '>=', 15);
  const under = goal('maxG', '<=', 4);
  const flag = goal('atFinish', '==', 1);
  const end = goal('reachedEnd', '==', 1);

  it('keeps ride goals calm while editing', () => {
    expect(live(speed, 0, 'edit')).toEqual({ state: 'idle', fill: 0, warn: false });
    expect(live(end, 0, 'edit')).toEqual({ state: 'idle', fill: 0, warn: false });
    expect(live(goal('hangTime', '>=', 1), 0, 'edit').state).toBe('idle');
  });

  it('fills track goals while editing and turns them green once met', () => {
    expect(live(drop, 10, 'edit')).toEqual({ state: 'progress', fill: 10 / 15, warn: false });
    expect(live(drop, 15, 'edit')).toEqual({ state: 'met', fill: 1, warn: false });
    expect(live(goal('length', '>=', 80), 40, 'edit')).toMatchObject({ state: 'progress', fill: 0.5 });
    expect(live(flag, 1, 'edit')).toEqual({ state: 'met', fill: 1, warn: false });
    expect(live(flag, 0, 'edit')).toEqual({ state: 'idle', fill: 0, warn: false });
  });

  it('fills toward the target during the ride and pops green the moment it is met', () => {
    expect(live(speed, 0, 'play').state).toBe('idle');
    expect(live(speed, 9, 'play')).toEqual({ state: 'progress', fill: 0.5, warn: false });
    expect(live(speed, 18.2, 'play')).toEqual({ state: 'met', fill: 1, warn: false });
    expect(live(end, 1, 'done').state).toBe('met');
  });

  it('turns a missed goal red after the ride and keeps its bar (the child has to reset)', () => {
    expect(live(speed, 12, 'done')).toEqual({ state: 'broken', fill: 12 / 18, warn: false });
    expect(live(speed, 0, 'done')).toEqual({ state: 'broken', fill: 0, warn: false });
    expect(live(end, 0, 'done')).toEqual({ state: 'broken', fill: 1, warn: false });
    expect(live(goal('loops', '==', 2), 1, 'done')).toEqual({ state: 'broken', fill: 1, warn: false });
    expect(live(speed, 18, 'done').state).toBe('met');
  });

  it('a ride that does not reach the end turns the flag and end cards red, met or not', () => {
    expect(live(flag, 1, 'done', false)).toEqual({ state: 'broken', fill: 1, warn: false });
    expect(live(end, 0, 'done', false).state).toBe('broken');
    expect(live(flag, 1, 'done', true).state).toBe('met');
    // the number cards keep their own result
    expect(live(speed, 18, 'done', false).state).toBe('met');
    // and only after the ride: while editing or riding the flag card is not red
    expect(live(flag, 1, 'edit', false).state).toBe('met');
    expect(live(flag, 1, 'play', false).state).toBe('met');
  });

  it('clamps the fill to 0..1', () => {
    expect(live(speed, -3, 'play').fill).toBe(0);
    expect(live(speed, 400, 'play').fill).toBe(1);
  });

  it('a "stay under" goal: never green while editing, fills with the limit used, warns near it', () => {
    expect(live(under, 0, 'edit')).toEqual({ state: 'idle', fill: 0, warn: false });
    expect(live(under, 0, 'play')).toEqual({ state: 'idle', fill: 0, warn: false });
    expect(live(under, 2, 'play')).toEqual({ state: 'progress', fill: 0.5, warn: false });
    expect(live(under, 4 * UNDER_WARN_AT, 'play')).toMatchObject({ state: 'progress', warn: true });
    expect(live(under, 4, 'play')).toMatchObject({ state: 'progress', fill: 1, warn: true });
  });

  it('a "stay under" goal turns red once broken, in play and after, and green only after a clean ride', () => {
    expect(live(under, 4.6, 'play')).toEqual({ state: 'broken', fill: 1, warn: false });
    expect(live(under, 4.6, 'done')).toEqual({ state: 'broken', fill: 1, warn: false });
    expect(live(under, 2.8, 'done')).toEqual({ state: 'met', fill: 0.7, warn: false });
  });

  it('handles zero targets', () => {
    // ">= 0" is met by anything; "<= 0" is broken by anything above zero.
    expect(live(goal('maxDrop', '>=', 0), 0, 'edit')).toEqual({ state: 'met', fill: 1, warn: false });
    expect(live(goal('maxSpeed', '>=', 0), 0, 'edit').state).toBe('idle');
    expect(live(goal('maxSpeed', '>=', 0), 0, 'play').state).toBe('met');
    expect(live(goal('maxG', '<=', 0), 0, 'play')).toEqual({ state: 'idle', fill: 0, warn: false });
    expect(live(goal('maxG', '<=', 0), 0, 'done')).toEqual({ state: 'met', fill: 0, warn: false });
    expect(live(goal('maxG', '<=', 0), 0.1, 'play').state).toBe('broken');
  });

  it('an "==" number goal is met or idle, never part-filled', () => {
    const exact = goal('loops', '==', 2);
    expect(live(exact, 1, 'edit')).toEqual({ state: 'idle', fill: 0, warn: false });
    expect(live(exact, 2, 'edit')).toEqual({ state: 'met', fill: 1, warn: false });
  });
});
