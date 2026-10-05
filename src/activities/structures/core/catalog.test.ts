import { describe, expect, it } from 'vitest';
import { CATALOG, MATERIALS, PART_LIMIT, beamSize, blockSize, defaultProps } from './catalog';

describe('structures catalog', () => {
  it('has the three part kinds with their descriptors', () => {
    expect(Object.keys(CATALOG).sort()).toEqual(['beam', 'block', 'fuzz']);

    const block = CATALOG.block;
    expect(block.descriptors.map((d) => d.code)).toEqual(['size', 'material']);
    expect(block.descriptors[0]!.options.map((o) => o.value)).toEqual(['1x1', '2x1', '1x2']);
    expect(block.descriptors[1]!.options.map((o) => o.value)).toEqual(['wood', 'brick', 'steel']);

    const beam = CATALOG.beam;
    expect(beam.descriptors.map((d) => d.code)).toEqual(['length', 'material']);
    expect(beam.descriptors[0]!.options.map((o) => o.value)).toEqual(['3', '5']);

    const fuzz = CATALOG.fuzz;
    expect(fuzz.descriptors.map((d) => d.code)).toEqual(['size']);
    expect(fuzz.descriptors[0]!.options.map((o) => o.value)).toEqual(['M']);
  });

  it('defaultProps picks the first option of every descriptor', () => {
    expect(defaultProps('block')).toEqual({ size: '1x1', material: 'wood' });
    expect(defaultProps('beam')).toEqual({ length: '3', material: 'wood' });
    expect(defaultProps('fuzz')).toEqual({ size: 'M' });
  });

  it('PART_LIMIT is 12', () => {
    expect(PART_LIMIT).toBe(12);
  });

  // breakSpeed replaces breakDistance as the primary glue-break rule (coordinator, 2026-09-15):
  // see glue.ts's FALLBACK_BREAK_DISTANCE for the (now flat, per-joint) distance fallback.
  it('MATERIALS has the density/friction/color from the plan, plus breakSpeed', () => {
    expect(MATERIALS.wood).toEqual({ density: 0.6, friction: 0.6, color: 0xc98a4b, breakSpeed: 3 });
    expect(MATERIALS.brick).toEqual({ density: 1.8, friction: 0.7, color: 0xb0413e, breakSpeed: 5 });
    expect(MATERIALS.steel).toEqual({ density: 4, friction: 0.5, color: 0x9aa1c0, breakSpeed: 9 });
  });

  it('blockSize maps the three sizes', () => {
    expect(blockSize('1x1')).toEqual({ w: 1, h: 1 });
    expect(blockSize('2x1')).toEqual({ w: 2, h: 1 });
    expect(blockSize('1x2')).toEqual({ w: 1, h: 2 });
  });

  it('beamSize maps length option to width, fixed 0.3 m thickness', () => {
    expect(beamSize('3')).toEqual({ w: 3, h: 0.3 });
    expect(beamSize('5')).toEqual({ w: 5, h: 0.3 });
  });
});
