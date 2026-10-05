import { describe, expect, it } from 'vitest';
import { hasShelfKinds, nonShelfKinds, shelfGroups } from './shelf';

type Kind = 'wheelA' | 'wheelB' | 'bodyA' | 'sensor' | 'plain';

const partInfo: Record<Kind, { image?: string; group?: string }> = {
  wheelA: { image: 'wheelA.svg', group: 'Wheels' },
  wheelB: { image: 'wheelB.svg', group: 'Wheels' },
  bodyA: { image: 'bodyA.svg', group: 'Body' },
  sensor: { image: 'sensor.svg' }, // no group -> falls into the default section
  plain: {}, // no image -> never on the shelf
};

describe('hasShelfKinds', () => {
  it('false when no palette kind has an image', () => {
    expect(hasShelfKinds(['plain'], partInfo)).toBe(false);
  });

  it('true when at least one palette kind has an image', () => {
    expect(hasShelfKinds(['plain', 'wheelA'], partInfo)).toBe(true);
  });

  it('false for an empty palette', () => {
    expect(hasShelfKinds([], partInfo)).toBe(false);
  });
});

describe('nonShelfKinds', () => {
  it('keeps only kinds without an image, in palette order', () => {
    expect(nonShelfKinds(['wheelA', 'plain', 'bodyA'], partInfo)).toEqual(['plain']);
  });

  it('empty when every palette kind has an image', () => {
    expect(nonShelfKinds(['wheelA', 'bodyA'], partInfo)).toEqual([]);
  });
});

describe('shelfGroups', () => {
  it('groups shelf kinds by partInfo.group in first-seen order', () => {
    expect(shelfGroups(['wheelA', 'bodyA', 'wheelB'], partInfo)).toEqual([
      { group: 'Wheels', kinds: ['wheelA', 'wheelB'] },
      { group: 'Body', kinds: ['bodyA'] },
    ]);
  });

  it('a group name is first-seen even when its kinds are not adjacent in the palette', () => {
    const groups = shelfGroups(['wheelA', 'bodyA', 'wheelB'], partInfo);
    expect(groups.map((g) => g.group)).toEqual(['Wheels', 'Body']);
    expect(groups[0]!.kinds).toEqual(['wheelA', 'wheelB']);
  });

  it('a kind without a group falls into the shared default section', () => {
    const groups = shelfGroups(['sensor'], partInfo);
    expect(groups).toEqual([{ group: 'Parts', kinds: ['sensor'] }]);
  });

  it('excludes kinds with no image entirely', () => {
    const groups = shelfGroups(['plain', 'wheelA'], partInfo);
    expect(groups).toEqual([{ group: 'Wheels', kinds: ['wheelA'] }]);
  });

  it('empty palette or all-imageless palette yields no groups', () => {
    expect(shelfGroups([], partInfo)).toEqual([]);
    expect(shelfGroups(['plain'], partInfo)).toEqual([]);
  });

  it('a duplicate kind in the palette appears once', () => {
    expect(shelfGroups(['wheelA', 'wheelA'], partInfo)).toEqual([{ group: 'Wheels', kinds: ['wheelA'] }]);
  });
});
