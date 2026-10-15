import { describe, expect, it } from 'vitest';
import {
  ARM,
  BAND_COLOR,
  BAND_COUNT,
  CATALOG,
  CAN_COLORS,
  CRATE_BREAK,
  FUZZ,
  FUZZ_NAMES,
  FUZZ_TINT,
  SPLIT_ANGLE_DEG,
  SPLIT_OFFSET,
  LAUNCH_SPEED,
  FUZZ_REF,
  FUZZ_SPEED_EXPONENT,
  MATERIALS,
  MAX_LAUNCH_SPEED,
  fuzzMass,
  launchSpeed,
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
    expect(block.descriptors[1]!.options.map((o) => o.value)).toEqual(['wood', 'brick', 'steel', 'crate']);

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

  it('the crate (2026-10-15) stacks like wood and breaks above a 1.8 N s hit closing at 4 m/s', () => {
    expect(MATERIALS.crate.density).toBe(MATERIALS.wood.density);
    expect(MATERIALS.crate.friction).toBe(MATERIALS.wood.friction);
    expect(CRATE_BREAK).toEqual({ impulse: 1.8, speed: 4, force: 60 });
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

// Gao, 2026-10-15: "theres no gameplay reason to use a lighter fuzz right now". The bands store a
// fixed energy per power setting: a heavier fuzz leaves slower, a lighter one faster.
describe('catapult catalog: the energy rule (launchSpeed)', () => {
  const POWERS = ['Low', 'Medium', 'High', 'Max'];
  const ARMS = ['Short', 'Long'];

  it('fuzzMass is the disc mass Rapier gives the body (pi r^2 density), light to heavy', () => {
    expect(fuzzMass({ r: 0.3, density: 1 })).toBeCloseTo(Math.PI * 0.09, 12);
    const masses = FUZZ_NAMES.map((name) => fuzzMass(FUZZ[name]!));
    for (let i = 1; i < masses.length; i++) expect(masses[i]!).toBeGreaterThan(masses[i - 1]!);
  });

  it('the Fur (the reference) keeps exactly the speeds every fuzz had before: power x arm factor', () => {
    expect(FUZZ_REF).toBe('Fur');
    for (const power of POWERS) {
      for (const arm of ARMS) {
        expect(launchSpeed({ power, arm, fuzz: 'Fur' })).toBeCloseTo(LAUNCH_SPEED[power]! * ARM[arm]!.factor, 12);
      }
    }
    // Defaults: Medium, Short arm, the Fur.
    expect(launchSpeed({})).toBeCloseTo(10 * 0.95, 12);
  });

  it('a lighter fuzz leaves faster at every power and arm (equal only where two hit the cap)', () => {
    for (const power of POWERS) {
      for (const arm of ARMS) {
        const speeds = FUZZ_NAMES.map((fuzz) => launchSpeed({ power, arm, fuzz })); // light to heavy
        for (let i = 1; i < speeds.length; i++) {
          if (speeds[i - 1]! < MAX_LAUNCH_SPEED) expect(speeds[i]!, `${power}/${arm}`).toBeLessThan(speeds[i - 1]!);
          else expect(speeds[i]!, `${power}/${arm}`).toBeLessThanOrEqual(speeds[i - 1]!);
        }
        // The Fur and everything heavier never hit the cap; the Metal is always slowest.
        expect(speeds[2]!).toBeLessThanOrEqual(MAX_LAUNCH_SPEED);
        expect(speeds[4]!).toBeLessThan(speeds[2]!);
      }
    }
  });

  it('below the cap, speed goes as mass^-FUZZ_SPEED_EXPONENT (0.25): m v^4 is the same for every fuzz at a power', () => {
    expect(FUZZ_SPEED_EXPONENT).toBe(0.25);
    const mRef = fuzzMass(FUZZ.Fur!);
    for (const power of POWERS) {
      for (const arm of ARMS) {
        const vRef = launchSpeed({ power, arm, fuzz: 'Fur' });
        for (const fuzz of FUZZ_NAMES) {
          const v = launchSpeed({ power, arm, fuzz });
          if (v >= MAX_LAUNCH_SPEED) continue;
          const m = fuzzMass(FUZZ[fuzz]!);
          expect(v / vRef, `${power}/${arm}/${fuzz}`).toBeCloseTo(Math.pow(mRef / m, 0.25), 12);
          expect(m * v ** 4).toBeCloseTo(mRef * vRef ** 4, 6);
        }
      }
    }
    // The pure energy rule (1/2 m v^2 fixed) would be the exponent 0.5; softened so the Metal still
    // reaches mid-range targets and the Flower does not fly 2.4x as far. The heavier fuzz still
    // carries more momentum (m v ~ m^0.75): it hits harder.
    const p = (fuzz: string) => fuzzMass(FUZZ[fuzz]!) * launchSpeed({ power: 'High', fuzz });
    expect(p('Metal')).toBeGreaterThan(p('Helmet'));
    expect(p('Helmet')).toBeGreaterThan(p('Fur'));
    expect(p('Fur')).toBeGreaterThan(p('Flower'));
  });

  it('nothing ever leaves faster than the fastest shot before the rule (Max power, Long arm, 15.75 m/s)', () => {
    expect(MAX_LAUNCH_SPEED).toBeCloseTo(LAUNCH_SPEED.Max! * ARM.Long!.factor, 12);
    for (const power of POWERS) for (const arm of ARMS) for (const fuzz of FUZZ_NAMES) {
      expect(launchSpeed({ power, arm, fuzz })).toBeLessThanOrEqual(MAX_LAUNCH_SPEED);
    }
    // Only the light ones near the top are capped: the Flower at High / Long and at Max, the Donut at Max / Long.
    expect(launchSpeed({ power: 'Max', arm: 'Short', fuzz: 'Flower' })).toBe(MAX_LAUNCH_SPEED);
    expect(launchSpeed({ power: 'High', arm: 'Short', fuzz: 'Flower' })).toBeLessThan(MAX_LAUNCH_SPEED);
  });

  it('the speed table (m/s, Short arm) the levels are tuned against', () => {
    const table = Object.fromEntries(
      FUZZ_NAMES.map((fuzz) => [fuzz, POWERS.map((power) => Math.round(launchSpeed({ power, fuzz, arm: 'Short' }) * 100) / 100)]),
    );
    expect(table).toEqual({
      Flower: [8.28, 11.82, 14.78, 15.75],
      Donut: [7.28, 10.4, 13, 15.6],
      Fur: [6.65, 9.5, 11.88, 14.25],
      Helmet: [5.77, 8.24, 10.3, 12.36],
      Metal: [5.12, 7.32, 9.14, 10.97],
    });
  });
});
