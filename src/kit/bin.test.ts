// The SUPPLY BIN's pure rules (2026-10-16): gating and stamping tiles, the value a tile sets (a
// `step` adds to the prop's integer value), grouping and the drop test.
import { describe, expect, it } from 'vitest';
import { binGroups, binItemValue, drawerHasContent, insideDropZone, visibleBinItems } from './bin';
import type { BinItem, PropertyDescriptor } from './types';

const BANDS: PropertyDescriptor = {
  code: 'bands',
  label: 'Rubber bands',
  options: Array.from({ length: 60 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
  default: '2',
};
const FUZZ: PropertyDescriptor = {
  code: 'fuzz',
  label: 'Fuzz',
  options: ['Flower', 'Donut', 'Fur'].map((v) => ({ value: v, label: v })),
};

const band: BinItem = { id: 'band', image: 'ui/bin/band.svg', label: 'Rubber band', group: 'Rubber bands', code: 'bands', step: 1, badge: '∞' };
const flower: BinItem = { id: 'flower', image: 'f.png', label: 'Flower', group: 'Fuzzes', code: 'fuzz', value: 'Flower', active: true };
const donut: BinItem = { id: 'donut', image: 'd.png', label: 'Donut', group: 'Fuzzes', code: 'fuzz', value: 'Donut' };
const fur: BinItem = { id: 'fur', image: 'u.png', label: 'Fur', group: 'Fuzzes', code: 'fuzz', value: 'Fur' };
const ALL = [band, flower, donut, fur];

describe('visibleBinItems: the drawer rows rule (Level.introduces) and the controller stamps', () => {
  it('shows everything on a course that never gates (known null), stamping nothing', () => {
    const out = visibleBinItems(ALL, {}, null, new Set(), []);
    expect(out.map((it) => it.id)).toEqual(['band', 'flower', 'donut', 'fur']);
    expect(out.every((it) => it.locked === false && it.isNew === false)).toBe(true);
  });

  it('hides items whose code is not known yet, and items whose code:value is gated and not known', () => {
    const gated = new Set(['fuzz:Donut', 'fuzz:Fur']);
    expect(visibleBinItems(ALL, {}, new Set(['bands']), gated, []).map((it) => it.id)).toEqual(['band']);
    expect(visibleBinItems(ALL, {}, new Set(['bands', 'fuzz']), gated, []).map((it) => it.id)).toEqual(['band', 'flower']);
    expect(visibleBinItems(ALL, {}, new Set(['bands', 'fuzz', 'fuzz:Donut']), gated, []).map((it) => it.id)).toEqual(['band', 'flower', 'donut']);
  });

  it('stamps locked from lockedProps and isNew from this level (code or code:value)', () => {
    const out = visibleBinItems(ALL, { lockedProps: ['fuzz'] }, null, new Set(), ['bands', 'fuzz:Fur']);
    expect(out.map((it) => [it.id, it.locked, it.isNew])).toEqual([
      ['band', false, true],
      ['flower', true, false],
      ['donut', true, false],
      ['fur', true, true],
    ]);
  });

  it("never mutates the course's own items", () => {
    visibleBinItems(ALL, { lockedProps: ['bands'] }, null, new Set(), ['bands']);
    expect(band.locked).toBeUndefined();
    expect(band.isNew).toBeUndefined();
  });
});

describe('binItemValue', () => {
  it('a step item adds to the integer prop (the descriptor default stands in for a missing prop)', () => {
    expect(binItemValue(band, { bands: '2' }, BANDS)).toBe('3');
    expect(binItemValue(band, {}, BANDS)).toBe('3');
    expect(binItemValue({ ...band, step: -1 }, { bands: '5' }, BANDS)).toBe('4');
    expect(binItemValue({ ...band, step: 10 }, { bands: '45' }, BANDS)).toBe('55');
  });

  it('refuses a step past the row (61 bands, 0 bands) or off a non-number', () => {
    expect(binItemValue(band, { bands: '60' }, BANDS)).toBeNull();
    expect(binItemValue({ ...band, step: -1 }, { bands: '1' }, BANDS)).toBeNull();
    expect(binItemValue(band, { bands: 'High' }, BANDS)).toBeNull();
    expect(binItemValue({ ...band, step: 0.5 }, { bands: '2' }, BANDS)).toBeNull();
  });

  it('without a descriptor a step is unbounded', () => {
    expect(binItemValue(band, { bands: '60' })).toBe('61');
  });

  it('a value item sets its value; nothing for the active item, the current value or an unknown option', () => {
    expect(binItemValue(donut, { fuzz: 'Flower' }, FUZZ)).toBe('Donut');
    expect(binItemValue(flower, { fuzz: 'Flower' }, FUZZ)).toBeNull();
    expect(binItemValue({ ...donut, active: false }, { fuzz: 'Donut' }, FUZZ)).toBeNull();
    expect(binItemValue({ ...donut, value: 'Helmet' }, { fuzz: 'Flower' }, FUZZ)).toBeNull();
    expect(binItemValue({ code: 'fuzz' }, {}, FUZZ)).toBeNull();
  });
});

describe('binGroups', () => {
  it('sections in first-seen order; an ungrouped item gets a "" section', () => {
    const loose: BinItem = { id: 'loose', image: '', label: 'Loose', code: 'x', value: 'y' };
    expect(binGroups([band, donut, loose, fur]).map((s) => [s.group, s.items.map((it) => it.id)])).toEqual([
      ['Rubber bands', ['band']],
      ['Fuzzes', ['donut', 'fur']],
      ['', ['loose']],
    ]);
  });
});

describe('insideDropZone', () => {
  it('within the radius, never under the minimum radius', () => {
    expect(insideDropZone({ x: 100, y: 100, r: 80 }, { x: 150, y: 150 })).toBe(true);
    expect(insideDropZone({ x: 100, y: 100, r: 80 }, { x: 200, y: 100 })).toBe(false);
    expect(insideDropZone({ x: 100, y: 100, r: 5 }, { x: 130, y: 100 })).toBe(true); // 40 px minimum
    expect(insideDropZone({ x: 100, y: 100, r: 5 }, { x: 130, y: 100 }, 20)).toBe(false);
  });
});

// 2026-10-16: once the catapult's bands moved onto the machine, Fling it had no tile and no row.
describe('drawerHasContent: the drawer opens only with something in it', () => {
  const tile: BinItem = { id: 'fuzz-Fur', image: 'x.png', label: 'Fur', code: 'fuzz', value: 'Fur' };
  it('a shelf, a bin tile or a row opens it; none of them keeps it shut', () => {
    expect(drawerHasContent({ shelfOn: false, bin: null, rows: 0 })).toBe(false);
    expect(drawerHasContent({ shelfOn: false, bin: [], rows: 0 })).toBe(false);
    expect(drawerHasContent({ shelfOn: true, bin: null, rows: 0 })).toBe(true);
    expect(drawerHasContent({ shelfOn: false, bin: [tile], rows: 0 })).toBe(true);
    expect(drawerHasContent({ shelfOn: false, bin: null, rows: 1 })).toBe(true);
  });
});
