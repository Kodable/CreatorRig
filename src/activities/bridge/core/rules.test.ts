import { describe, expect, it } from 'vitest';
import { canAddPart, makeJoint, makeRod, normalizeParts } from './rules';
import type { BridgeLevel, PlacedPart } from './types';

function makeLevel(overrides: Partial<BridgeLevel> = {}): BridgeLevel {
  return {
    id: 'test',
    title: 'Test',
    bruno: '',
    goals: [],
    parts: [],
    palette: [],
    hints: [],
    failHints: {},
    banks: { leftX: 13, rightX: 17, y: 4 },
    load: { weight: 'Light' },
    budget: 10,
    ...overrides,
  };
}

function anchor(id: number, x: number, y: number): PlacedPart {
  return { id, kind: 'anchor', x, y, props: {}, locked: true, lockPosition: true };
}

function joint(id: number, x: number, y: number): PlacedPart {
  return { id, kind: 'joint', x, y, props: {} };
}

function rodPart(id: number, material: string, from: number, to: number): PlacedPart {
  return { id, kind: 'rod', x: 0, y: 0, props: { material, from: String(from), to: String(to) } };
}

describe('bridge rules: canAddPart (joints)', () => {
  it('refuses a joint less than 0.3 m from an existing node', () => {
    const level = makeLevel();
    const parts = [anchor(1, 13, 4)];
    expect(canAddPart(makeJoint({ x: 13.2, y: 4.1 }), parts, level)).toBe(false);
  });

  it('accepts a joint at least 0.3 m from every node and inside the world', () => {
    const level = makeLevel();
    const parts = [anchor(1, 13, 4)];
    expect(canAddPart(makeJoint({ x: 15, y: 4 }), parts, level)).toBe(true);
  });

  it('refuses a joint outside the world bounds (0..30 x 0..15)', () => {
    const level = makeLevel();
    expect(canAddPart(makeJoint({ x: -1, y: 4 }), [], level)).toBe(false);
    expect(canAddPart(makeJoint({ x: 31, y: 4 }), [], level)).toBe(false);
    expect(canAddPart(makeJoint({ x: 10, y: 16 }), [], level)).toBe(false);
  });
});

describe('bridge rules: canAddPart (rods)', () => {
  it('refuses a rod longer than its material cap (6 m wood, cap 5 m)', () => {
    const level = makeLevel({ budget: 999 });
    const parts = [anchor(1, 0, 4), anchor(2, 6, 4)];
    expect(canAddPart(makeRod('wood', 1, 2), parts, level)).toBe(false);
  });

  it('accepts a rod up to its material cap (5 m cable, cap 8 m)', () => {
    const level = makeLevel({ budget: 999 });
    const parts = [anchor(1, 0, 4), anchor(2, 5, 4)];
    expect(canAddPart(makeRod('cable', 1, 2), parts, level)).toBe(true);
  });

  it('refuses a rod to itself or to a missing node', () => {
    const level = makeLevel({ budget: 999 });
    const parts = [anchor(1, 0, 4)];
    expect(canAddPart(makeRod('wood', 1, 1), parts, level)).toBe(false);
    expect(canAddPart(makeRod('wood', 1, 99), parts, level)).toBe(false);
  });

  it('allows one road rod and one non-road (reinforcing) rod between the same pair, ' +
    'but refuses a second rod of the same bucket', () => {
    const level = makeLevel({ budget: 999 });
    const parts = [anchor(1, 0, 4), anchor(2, 4, 4), rodPart(3, 'road', 1, 2)];

    // A wood rod reinforcing the same span (node order reversed) is allowed.
    const reinforce = makeRod('steel', 2, 1);
    expect(canAddPart(reinforce, parts, level)).toBe(true);

    // A second road rod between the same pair is refused.
    expect(canAddPart(makeRod('road', 1, 2), parts, level)).toBe(false);

    // Once the steel reinforcement is placed, a second non-road rod is refused too.
    const parts2 = [...parts, reinforce];
    expect(canAddPart(makeRod('wood', 1, 2), parts2, level)).toBe(false);
  });

  it('refuses a rod over budget and accepts one within budget', () => {
    const level = makeLevel({ budget: 3 });
    const parts = [anchor(1, 0, 4), anchor(2, 4, 4)];
    expect(canAddPart(makeRod('steel', 1, 2), parts, level)).toBe(false); // 4 m x 3/m = 12 > 3

    const cheapLevel = makeLevel({ budget: 10 });
    expect(canAddPart(makeRod('wood', 1, 2), parts, cheapLevel)).toBe(true); // 4 m x 1/m = 4
  });
});

describe('bridge rules: normalizeParts', () => {
  it('drops a rod whose node is gone', () => {
    const level = makeLevel();
    const parts = [anchor(1, 0, 4), rodPart(2, 'wood', 1, 99)];
    const result = normalizeParts(parts, level);
    expect(result.find((p) => p.id === 2)).toBeUndefined();
    expect(result.find((p) => p.id === 1)).toBeDefined();
  });

  it("sets a surviving rod's x/y to the midpoint of its two nodes", () => {
    const level = makeLevel();
    const parts = [anchor(1, 0, 4), anchor(2, 4, 6), rodPart(3, 'wood', 1, 2)];
    const result = normalizeParts(parts, level);
    const r = result.find((p) => p.id === 3)!;
    expect(r.x).toBeCloseTo(2, 6);
    expect(r.y).toBeCloseTo(5, 6);
  });

  it('leaves anchors and joints untouched', () => {
    const level = makeLevel();
    const parts = [anchor(1, 3, 4), joint(2, 6, 4)];
    const result = normalizeParts(parts, level);
    expect(result).toEqual(parts);
  });
});

describe('bridge rules: makeJoint/makeRod', () => {
  it('makeJoint places an id-0 joint at the given point', () => {
    expect(makeJoint({ x: 5, y: 6 })).toEqual({ id: 0, kind: 'joint', x: 5, y: 6, props: {} });
  });

  it('makeRod records material and node ids as strings', () => {
    const p = makeRod('steel', 3, 7);
    expect(p.kind).toBe('rod');
    expect(p.props).toEqual({ material: 'steel', from: '3', to: '7' });
  });
});
