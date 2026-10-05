import { describe, expect, it } from 'vitest';
import {
  ARM,
  BAND_COLOR,
  BAND_COUNT,
  CATALOG,
  CAN_COLORS,
  FUZZ,
  FUZZ_NAMES,
  FUZZ_TINT,
  SPLIT_ANGLE_DEG,
  SPLIT_OFFSET,
  LAUNCH_SPEED,
  MATERIALS,
  PART_LIMIT,
  blockSize,
  defaultProps,
  fuzzName,
  fuzzSpec,
} from './catalog';

describe('catapult catalog', () => {
  it('has the six part kinds with their descriptors', () => {
    expect(Object.keys(CATALOG).sort()).toEqual(['block', 'bullseye', 'can', 'catapult', 'shelf', 'wall']);

    const catapult = CATALOG.catapult;
    expect(catapult.descriptors.map((d) => d.code)).toEqual(['power', 'angle', 'fuzz', 'arm']);
    expect(catapult.descriptors[0]!.options.map((o) => o.value)).toEqual(['Low', 'Medium', 'High', 'Max']);
    expect(catapult.descriptors[0]!.default).toBe('Medium');
    expect(catapult.descriptors[1]!.options.map((o) => o.value)).toEqual(['15', '30', '45', '60', '75']);
    expect(catapult.descriptors[1]!.default).toBe('45');
    // One Fuzz row (stakeholder direction 2026-10-01: weight and shot type merged), five fuzzes in
    // weight order, each with its own picture.
    expect(catapult.descriptors[2]!.label).toBe('Fuzz');
    expect(catapult.descriptors[2]!.options.map((o) => o.value)).toEqual(['Flower', 'Donut', 'Fur', 'Helmet', 'Metal']);
    expect(catapult.descriptors[2]!.options.map((o) => o.label)).toEqual(['Flower', 'Donut', 'Fur', 'Helmet', 'Metal']);
    expect(catapult.descriptors[2]!.options.map((o) => o.image)).toEqual([
      'parts/catapult/fuzz-Flower.png',
      'parts/catapult/fuzz-Donut.png',
      'parts/catapult/fuzz-Fur.png',
      'parts/catapult/fuzz-Helmet.png',
      'parts/catapult/fuzz-Metal.png',
    ]);
    expect(catapult.descriptors[2]!.default).toBe('Fur');
    expect(catapult.descriptors[3]!.options.map((o) => o.value)).toEqual(['Short', 'Long']);
    expect(catapult.descriptors[3]!.default).toBe('Short');

    const can = CATALOG.can;
    expect(can.descriptors.map((d) => d.code)).toEqual(['color']);
    expect(can.descriptors[0]!.options.map((o) => o.value)).toEqual(['Red', 'Blue', 'Green']);

    const block = CATALOG.block;
    expect(block.descriptors.map((d) => d.code)).toEqual(['size', 'material']);
    expect(block.descriptors[0]!.options.map((o) => o.value)).toEqual(['1x1', '2x1', '1x2', 'domino']);
    expect(block.descriptors[1]!.options.map((o) => o.value)).toEqual(['wood', 'brick', 'steel']);

    const shelf = CATALOG.shelf;
    expect(shelf.descriptors[0]!.options.map((o) => o.value)).toEqual(['2', '4']);

    const wall = CATALOG.wall;
    expect(wall.descriptors[0]!.options.map((o) => o.value)).toEqual(['2', '4', '6']);

    const bullseye = CATALOG.bullseye;
    expect(bullseye.descriptors[0]!.options.map((o) => o.value)).toEqual(['M']);
  });

  it('defaultProps returns each descriptor\'s stamped default', () => {
    expect(defaultProps('catapult')).toEqual({ power: 'Medium', angle: '45', fuzz: 'Fur', arm: 'Short' });
    expect(defaultProps('can')).toEqual({ color: 'Red' });
    expect(defaultProps('block')).toEqual({ size: '1x1', material: 'wood' });
    expect(defaultProps('shelf')).toEqual({ length: '2' });
    expect(defaultProps('wall')).toEqual({ height: '2' });
    expect(defaultProps('bullseye')).toEqual({ size: 'M' });
  });

  it('PART_LIMIT is 12', () => {
    expect(PART_LIMIT).toBe(12);
  });

  it('LAUNCH_SPEED has the four power numbers from the plan', () => {
    expect(LAUNCH_SPEED).toEqual({ Low: 7, Medium: 10, High: 12.5, Max: 15 });
  });

  it('ARM has length and speed factor per option', () => {
    expect(ARM.Short).toEqual({ length: 2, factor: 0.95 });
    expect(ARM.Long).toEqual({ length: 3, factor: 1.05 });
  });

  it('FUZZ has radius and density per fuzz, light to heavy; Flower/Fur/Metal keep the old ' +
    'Light/Medium/Heavy numbers; only the Donut splits', () => {
    expect(FUZZ_NAMES).toEqual(['Flower', 'Donut', 'Fur', 'Helmet', 'Metal']);
    expect(Object.keys(FUZZ)).toEqual([...FUZZ_NAMES]);
    const numbers = FUZZ_NAMES.map((name) => [FUZZ[name]!.r, FUZZ[name]!.density]);
    expect(numbers).toEqual([[0.25, 0.6], [0.28, 0.8], [0.3, 1], [0.35, 1.3], [0.4, 1.6]]);
    expect(FUZZ_NAMES.filter((name) => FUZZ[name]!.splits)).toEqual(['Donut']);
    for (const name of FUZZ_NAMES) {
      expect(FUZZ[name]!.label).toBe(name);
      expect(FUZZ[name]!.image).toBe(`parts/catapult/fuzz-${name}.png`);
      expect(typeof FUZZ_TINT[name]).toBe('number');
    }
  });

  it('MATERIALS has density/friction/color from the plan', () => {
    expect(MATERIALS.wood).toEqual({ density: 0.6, friction: 0.6, color: 0xc98a4b });
    expect(MATERIALS.brick).toEqual({ density: 1.8, friction: 0.7, color: 0xb0413e });
    expect(MATERIALS.steel).toEqual({ density: 4, friction: 0.5, color: 0x9aa1c0 });
  });

  it('CAN_COLORS has the three cosmetic colours', () => {
    expect(CAN_COLORS).toEqual({ Red: 0xe0392f, Blue: 0x05aeed, Green: 0x61bb46 });
  });

  it('BAND_COUNT gives 1..4 rubber bands, Low to Max', () => {
    expect(BAND_COUNT).toEqual({ Low: 1, Medium: 2, High: 3, Max: 4 });
  });

  it('every band is the same red (BAND_COLOR), matching the drawer\'s power pictures', () => {
    expect(BAND_COLOR).toBe(0xee3b3b);
  });

  it('fuzzName reads the fuzz prop; a part saved before the merge maps its weight (Light/Medium/' +
    'Heavy -> Flower/Fur/Metal); anything else is Fur', () => {
    for (const name of FUZZ_NAMES) expect(fuzzName({ fuzz: name })).toBe(name);
    expect(fuzzName({ fuzz: 'Blue', weight: 'Light' })).toBe('Flower');
    expect(fuzzName({ fuzz: 'Prism', weight: 'Medium' })).toBe('Fur');
    expect(fuzzName({ weight: 'Heavy' })).toBe('Metal');
    expect(fuzzName({})).toBe('Fur');
    expect(fuzzName({ fuzz: 'Nope' })).toBe('Fur');
    expect(fuzzSpec({ fuzz: 'Donut' })).toBe(FUZZ.Donut);
    expect(fuzzSpec({ weight: 'Heavy' })).toBe(FUZZ.Metal);
  });

  it('the split turns +/- 14 degrees with a 0.1 m sideways offset', () => {
    expect(SPLIT_ANGLE_DEG).toBe(14);
    expect(SPLIT_OFFSET).toBe(0.1);
  });

  it('blockSize maps the four sizes', () => {
    expect(blockSize('1x1')).toEqual({ w: 1, h: 1 });
    expect(blockSize('2x1')).toEqual({ w: 2, h: 1 });
    expect(blockSize('1x2')).toEqual({ w: 1, h: 2 });
    expect(blockSize('domino')).toEqual({ w: 0.4, h: 2 });
  });
});
