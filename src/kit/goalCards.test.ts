// Kit goal cards (2026-10-16): the coaster's card states with the kit's red rule (red only once
// an "under" limit breaks or the level is over and failed; calm between shots with shots left).
import { describe, expect, it } from 'vitest';
import { KIT_UNDER_WARN_AT, kitGoalCardLive, levelOver, type KitGoalCardContext } from './goalCards';
import type { Goal, GoalResult, Mode } from './types';

type M = { knocked: number; shots: number; hit: number };

const knocked: Goal<M> = { metric: 'knocked', op: '>=', value: 4, label: 'Knock down 4 cans' };
const shots: Goal<M> = { metric: 'shots', op: '<=', value: 2, label: 'Use at most 2 shots' };
const hit: Goal<M> = { metric: 'hit', op: '>=', value: 1, label: 'Hit the bullseye' };
const exact: Goal<M> = { metric: 'knocked', op: '==', value: 3, label: 'Exactly 3' };

function r(goal: Goal<M>, current: number): GoalResult<M> {
  const pass = goal.op === '>=' ? current >= goal.value : goal.op === '<=' ? current <= goal.value : current === goal.value;
  return { goal, current, pass };
}
function ctx(mode: Mode, o: Partial<KitGoalCardContext> = {}): KitGoalCardContext {
  return { mode, check: false, editLive: false, levelOver: false, passed: false, ...o };
}

describe('levelOver: the level is over and failed (the cards may go red)', () => {
  it('only in done mode, not passed, with no further shot or run', () => {
    expect(levelOver('done', false, false)).toBe(true);
    expect(levelOver('done', false, true)).toBe(false); // between shots, shots left
    expect(levelOver('done', true, false)).toBe(false);
    expect(levelOver('edit', false, false)).toBe(false);
    expect(levelOver('play', false, false)).toBe(false);
  });
});

describe('kitGoalCardLive', () => {
  it('editing: idle unless the metric is an edit metric (then it fills, and turns green once met)', () => {
    expect(kitGoalCardLive(r(knocked, 2), ctx('edit'))).toEqual({ state: 'idle', fill: 0, warn: false });
    expect(kitGoalCardLive(r(knocked, 2), ctx('edit', { editLive: true }))).toEqual({ state: 'progress', fill: 0.5, warn: false });
    expect(kitGoalCardLive(r(knocked, 4), ctx('edit', { editLive: true })).state).toBe('met');
    expect(kitGoalCardLive(r(knocked, 0), ctx('edit', { editLive: true })).state).toBe('idle');
  });

  it('during a run a card fills toward its target and turns green the moment it is met', () => {
    expect(kitGoalCardLive(r(knocked, 1), ctx('play'))).toEqual({ state: 'progress', fill: 0.25, warn: false });
    expect(kitGoalCardLive(r(knocked, 4), ctx('play'))).toEqual({ state: 'met', fill: 1, warn: false });
    expect(kitGoalCardLive(r(knocked, 9), ctx('play')).fill).toBe(1);
  });

  it('between shots with shots left an unmet card stays calm (never red)', () => {
    expect(kitGoalCardLive(r(knocked, 3), ctx('done'))).toEqual({ state: 'progress', fill: 0.75, warn: false });
    expect(kitGoalCardLive(r(hit, 0), ctx('done')).state).toBe('idle');
    expect(kitGoalCardLive(r(hit, 0), ctx('done', { check: true })).state).toBe('idle');
  });

  it('the level over and failed: every unmet card turns red, keeping its bar', () => {
    expect(kitGoalCardLive(r(knocked, 3), ctx('done', { levelOver: true }))).toEqual({ state: 'broken', fill: 0.75, warn: false });
    expect(kitGoalCardLive(r(hit, 0), ctx('done', { levelOver: true, check: true }))).toEqual({ state: 'broken', fill: 1, warn: false });
    expect(kitGoalCardLive(r(exact, 2), ctx('done', { levelOver: true }))).toEqual({ state: 'broken', fill: 1, warn: false });
    // A met card stays green.
    expect(kitGoalCardLive(r(knocked, 4), ctx('done', { levelOver: true })).state).toBe('met');
  });

  it("an exact or yes/no goal shows no partial bar: idle until it is met", () => {
    expect(kitGoalCardLive(r(exact, 2), ctx('play'))).toEqual({ state: 'idle', fill: 0, warn: false });
    expect(kitGoalCardLive(r(exact, 3), ctx('play')).state).toBe('met');
    expect(kitGoalCardLive(r(hit, 1), ctx('play', { check: true })).state).toBe('met');
  });

  it('an "under" goal: calm while editing, shows the limit used (orange from 75%), red once over', () => {
    expect(kitGoalCardLive(r(shots, 0), ctx('edit'))).toEqual({ state: 'idle', fill: 0, warn: false });
    expect(kitGoalCardLive(r(shots, 1), ctx('play'))).toEqual({ state: 'progress', fill: 0.5, warn: false });
    expect(kitGoalCardLive(r(shots, 2), ctx('done'))).toEqual({ state: 'progress', fill: 1, warn: 1 >= KIT_UNDER_WARN_AT });
    expect(kitGoalCardLive(r(shots, 3), ctx('done'))).toEqual({ state: 'broken', fill: 1, warn: false });
    expect(kitGoalCardLive(r(shots, 3), ctx('play')).state).toBe('broken');
  });

  it('an "under" goal turns green only once the level is passed or over', () => {
    expect(kitGoalCardLive(r(shots, 1), ctx('done', { passed: true }))).toEqual({ state: 'met', fill: 0.5, warn: false });
    expect(kitGoalCardLive(r(shots, 2), ctx('done', { levelOver: true })).state).toBe('met');
  });

  it('an "under" goal breaks while editing only when its metric is live there', () => {
    expect(kitGoalCardLive(r(shots, 3), ctx('edit')).state).toBe('idle');
    expect(kitGoalCardLive(r(shots, 3), ctx('edit', { editLive: true })).state).toBe('broken');
  });
});
