import { describe, expect, it } from 'vitest';
import { gatedOptions, isKnown, isOptionKnown, knownConcepts } from './concepts';

describe('knownConcepts', () => {
  it('returns null when no level in the list sets introduces', () => {
    const levels = [{ id: 'a' }, { id: 'b', introduces: [] }];
    expect(knownConcepts(levels, 'b')).toBeNull();
  });

  it('unions introduces up to and including the given level', () => {
    const levels = [
      { id: 'a', introduces: ['power'] },
      { id: 'b', introduces: ['angle'] },
      { id: 'c', introduces: ['fuzz'] },
    ];
    expect(knownConcepts(levels, 'b')).toEqual(new Set(['power', 'angle']));
  });

  it('later levels know every earlier concept plus their own', () => {
    const levels = [
      { id: 'a', introduces: ['power'] },
      { id: 'b', introduces: ['angle'] },
      { id: 'c', introduces: ['fuzz'] },
    ];
    expect(knownConcepts(levels, 'c')).toEqual(new Set(['power', 'angle', 'fuzz']));
  });

  it('order matters: a concept introduced after the target level is not known yet', () => {
    const levels = [
      { id: 'a', introduces: ['power'] },
      { id: 'b', introduces: ['angle'] },
    ];
    const known = knownConcepts(levels, 'a')!;
    expect(known.has('power')).toBe(true);
    expect(known.has('angle')).toBe(false);
  });

  it('a level with no introduces of its own still inherits earlier concepts', () => {
    const levels = [
      { id: 'a', introduces: ['power'] },
      { id: 'b' },
    ];
    expect(knownConcepts(levels, 'b')).toEqual(new Set(['power']));
  });
});

describe('isKnown', () => {
  it('is always true when the set is null', () => {
    expect(isKnown(null, 'anything')).toBe(true);
  });

  it('checks membership otherwise', () => {
    const known = new Set(['power']);
    expect(isKnown(known, 'power')).toBe(true);
    expect(isKnown(known, 'angle')).toBe(false);
  });
});

describe('gatedOptions', () => {
  it('collects every code:value entry across every level', () => {
    const levels = [
      { id: 'a', introduces: ['fuzz', 'fuzz:Donut'] },
      { id: 'b', introduces: ['fuzz:Robo'] },
      { id: 'c', introduces: ['power'] },
    ];
    expect(gatedOptions(levels)).toEqual(new Set(['fuzz:Donut', 'fuzz:Robo']));
  });

  it('is empty when no level gates an option', () => {
    const levels = [{ id: 'a', introduces: ['power'] }, { id: 'b' }];
    expect(gatedOptions(levels)).toEqual(new Set());
  });
});

describe('isOptionKnown', () => {
  const levels = [
    { id: 'a', introduces: ['fuzz'] },
    { id: 'b', introduces: ['fuzz:Donut'] },
    { id: 'c', introduces: ['fuzz:Robo'] },
  ];
  const gated = gatedOptions(levels);

  it('an ungated option is always known, even before any level introduces anything', () => {
    expect(isOptionKnown(null, gated, 'power', 'Low')).toBe(true);
    expect(isOptionKnown(new Set(), gated, 'power', 'Low')).toBe(true);
  });

  it('a gated option is hidden before the level that introduces it', () => {
    const known = knownConcepts(levels, 'a')!;
    expect(isOptionKnown(known, gated, 'fuzz', 'Donut')).toBe(false);
    expect(isOptionKnown(known, gated, 'fuzz', 'Robo')).toBe(false);
  });

  it('a gated option becomes known from its intro level on', () => {
    const atB = knownConcepts(levels, 'b')!;
    expect(isOptionKnown(atB, gated, 'fuzz', 'Donut')).toBe(true);
    expect(isOptionKnown(atB, gated, 'fuzz', 'Robo')).toBe(false);

    const atC = knownConcepts(levels, 'c')!;
    expect(isOptionKnown(atC, gated, 'fuzz', 'Donut')).toBe(true);
    expect(isOptionKnown(atC, gated, 'fuzz', 'Robo')).toBe(true);
  });

  it('known null (no course-wide gating) treats a gated option as known too, same as isKnown', () => {
    // null means "no level in the course sets introduces at all"; a course that gates an option
    // always has at least one introduces entry, so this combination is defensive, not a real
    // course shape, but the contract (null = everything known) still has to hold.
    expect(isOptionKnown(null, gated, 'fuzz', 'Donut')).toBe(true);
  });
});
