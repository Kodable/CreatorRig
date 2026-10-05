import { describe, expect, it } from 'vitest';
import { CATALOG, MATERIALS, PART_LIMIT, defaultProps, rodCost, rodLength, totalCost } from './catalog';
import type { PlacedPart } from './types';

function node(id: number, kind: 'anchor' | 'joint', x: number, y: number): PlacedPart {
  return { id, kind, x, y, props: {} };
}

function rodPart(id: number, material: string, from: number, to: number): PlacedPart {
  return { id, kind: 'rod', x: 0, y: 0, props: { material, from: String(from), to: String(to) } };
}

describe('bridge catalog', () => {
  it('PART_LIMIT is 80', () => {
    expect(PART_LIMIT).toBe(80);
  });

  it('anchor/joint have no descriptors; rod has a 4-way material descriptor', () => {
    expect(CATALOG.anchor.descriptors).toHaveLength(0);
    expect(CATALOG.joint.descriptors).toHaveLength(0);
    expect(CATALOG.rod.descriptors).toHaveLength(1);
    expect(CATALOG.rod.descriptors[0]!.options.map((o) => o.value)).toEqual(['road', 'wood', 'steel', 'cable']);
  });

  it("defaultProps('rod') carries only the material chip, never from/to", () => {
    const props = defaultProps('rod');
    expect(props.material).toBeDefined();
    expect(props.from).toBeUndefined();
    expect(props.to).toBeUndefined();
  });

  it('material numbers match the plan', () => {
    // Deviation, measured in sim.test.ts "(b)": at the plan's K1 1000, the flat 6 m two-rod road
    // stress at 0.33-0.34 (the plan's target range is 0.3-0.7) while still failing under Light.
    expect(MATERIALS.road).toEqual({ k1: 1000, tension: 0.035, compression: 0.035, cost: 2, color: 0x8a6a3a, maxLength: 5 });
    // Deviation, measured in sim.test.ts "(c)": at the plan's 4% limit, the 6 m kingpost's wood
    // struts already break under the Light buggy. 5.2% (+30%, the plan's suggested bound) holds
    // Light with a ~0.79 peak while Heavy still overloads the tie.
    expect(MATERIALS.wood).toEqual({ k1: 1000, tension: 0.052, compression: 0.052, cost: 1, color: 0xc98a4b, maxLength: 5 });
    expect(MATERIALS.steel).toEqual({ k1: 3000, tension: 0.04, compression: 0.04, cost: 3, color: 0x9aa1c0, maxLength: 5 });
    expect(MATERIALS.cable).toEqual({ k1: 500, tension: 0.2, compression: 0.05, cost: 1, color: 0xffffff, maxLength: 8 });
  });

  it('rodLength is the straight-line distance between the two nodes', () => {
    const parts = [node(1, 'anchor', 0, 0), node(2, 'anchor', 4, 0), rodPart(3, 'wood', 1, 2)];
    expect(rodLength(parts[2]!, parts)).toBeCloseTo(4, 6);
  });

  it('rodLength/rodCost are 0 when a node is missing (an orphan rod, pre-normalize)', () => {
    const parts = [node(1, 'anchor', 0, 0), rodPart(2, 'wood', 1, 99)];
    expect(rodLength(parts[1]!, parts)).toBe(0);
    expect(rodCost(parts[1]!, parts)).toBe(0);
  });

  it('rodCost = cost per meter x length (4 m steel = 3/m x 4 = 12)', () => {
    const parts = [node(1, 'anchor', 0, 0), node(2, 'anchor', 4, 0), rodPart(3, 'steel', 1, 2)];
    expect(rodCost(parts[2]!, parts)).toBeCloseTo(12, 6);
  });

  it('rodCost for a 6 m cable = 1/m x 6 = 6', () => {
    const parts = [node(1, 'anchor', 0, 0), node(2, 'anchor', 6, 0), rodPart(3, 'cable', 1, 2)];
    expect(rodCost(parts[2]!, parts)).toBeCloseTo(6, 6);
  });

  it('totalCost sums every rod and ignores nodes', () => {
    const parts = [
      node(1, 'anchor', 0, 0),
      node(2, 'anchor', 4, 0),
      node(3, 'anchor', 8, 0),
      rodPart(4, 'wood', 1, 2), // 4 m x 1/m = 4
      rodPart(5, 'road', 2, 3), // 4 m x 2/m = 8
    ];
    expect(totalCost(parts)).toBeCloseTo(12, 6);
  });
});
