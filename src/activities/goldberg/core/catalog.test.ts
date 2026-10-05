import { describe, expect, it } from 'vitest';
import { CATALOG, defaultProps, propNumber } from './catalog';
import type { PartKind } from './types';

const KINDS: PartKind[] = ['fuzz', 'platform', 'ramp', 'domino', 'seesaw', 'lever', 'gate'];

describe('catalog', () => {
  it('every kind has at least one descriptor, each with at least one option', () => {
    for (const kind of KINDS) {
      const entry = CATALOG[kind];
      expect(entry.descriptors.length).toBeGreaterThan(0);
      for (const d of entry.descriptors) {
        expect(d.options.length).toBeGreaterThan(0);
      }
    }
  });

  it('defaultProps picks options[0] of every descriptor', () => {
    for (const kind of KINDS) {
      const props = defaultProps(kind);
      for (const d of CATALOG[kind].descriptors) {
        expect(props[d.code]).toBe(d.options[0]!.value);
      }
    }
  });

  it('propNumber maps fuzz size', () => {
    expect(propNumber('fuzz', 'size', 'M')).toBe(0.4);
    expect(propNumber('fuzz', 'size', 'S')).toBe(0.3);
    expect(propNumber('fuzz', 'size', 'L')).toBe(0.6);
  });

  it('propNumber maps platform length and rotation', () => {
    expect(propNumber('platform', 'length', 'Medium')).toBe(4);
    expect(propNumber('platform', 'length', 'Short')).toBe(2);
    expect(propNumber('platform', 'length', 'Long')).toBe(6);
    expect(propNumber('platform', 'rotation', '0')).toBe(0);
    expect(propNumber('platform', 'rotation', '-15')).toBe(-15);
    expect(propNumber('platform', 'rotation', '15')).toBe(15);
  });

  it('propNumber maps ramp angle, flip and size', () => {
    expect(propNumber('ramp', 'angle', '30')).toBe(30);
    expect(propNumber('ramp', 'angle', '15')).toBe(15);
    expect(propNumber('ramp', 'angle', '45')).toBe(45);
    expect(propNumber('ramp', 'flip', 'No')).toBe(0);
    expect(propNumber('ramp', 'flip', 'Yes')).toBe(1);
    expect(propNumber('ramp', 'size', 'Medium')).toBe(3);
    expect(propNumber('ramp', 'size', 'Large')).toBe(4);
  });

  it('propNumber maps domino count', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(propNumber('domino', 'count', String(n))).toBe(n);
    }
  });

  it('propNumber maps seesaw fulcrumPos, startState and length', () => {
    expect(propNumber('seesaw', 'length', 'Medium')).toBe(4);
    expect(propNumber('seesaw', 'length', 'Short')).toBe(3);
    expect(propNumber('seesaw', 'length', 'Long')).toBe(5);
    expect(propNumber('seesaw', 'fulcrumPos', 'Middle')).toBe(0);
    expect(propNumber('seesaw', 'fulcrumPos', 'Left')).toBe(-0.4);
    expect(propNumber('seesaw', 'fulcrumPos', 'MidLeft')).toBe(-0.2);
    expect(propNumber('seesaw', 'fulcrumPos', 'MidRight')).toBe(0.2);
    expect(propNumber('seesaw', 'fulcrumPos', 'Right')).toBe(0.4);
    expect(propNumber('seesaw', 'startState', 'Balanced')).toBe(0);
    expect(propNumber('seesaw', 'startState', 'LeftDown')).toBe(0.35);
    expect(propNumber('seesaw', 'startState', 'RightDown')).toBe(-0.35);
  });

  it('propNumber maps lever length and fulcrumPos', () => {
    expect(propNumber('lever', 'length', 'Medium')).toBe(3);
    expect(propNumber('lever', 'length', 'Short')).toBe(2);
    expect(propNumber('lever', 'length', 'Long')).toBe(4);
    expect(propNumber('lever', 'fulcrumPos', 'Middle')).toBe(0);
    expect(propNumber('lever', 'fulcrumPos', 'Edge')).toBe(0.25);
  });

  it('propNumber maps gate openTime', () => {
    expect(propNumber('gate', 'openTime', '0')).toBe(0);
    expect(propNumber('gate', 'openTime', '3')).toBe(3);
    expect(propNumber('gate', 'openTime', '5')).toBe(5);
    expect(propNumber('gate', 'openTime', '8')).toBe(8);
  });

  it('propNumber falls back to the default option for an unknown value', () => {
    expect(propNumber('fuzz', 'size', 'nonsense')).toBe(propNumber('fuzz', 'size', 'M'));
    expect(propNumber('gate', 'openTime', 'nonsense')).toBe(propNumber('gate', 'openTime', '0'));
  });
});
