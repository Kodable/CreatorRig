import { describe, expect, it } from 'vitest';
import {
  ARM_LENGTHS,
  BAND_COLOR,
  BAND_OPTIONS,
  BAND_SPEED,
  CATALOG,
  CAN_COLORS,
  CRATE_BREAK,
  FUZZ,
  FUZZ_NAMES,
  FUZZ_TINT,
  SPLIT_ANGLE_DEG,
  SPLIT_OFFSET,
  FUZZ_REF,
  FUZZ_SPEED_EXPONENT,
  MATERIALS,
  MAX_BANDS,
  MAX_VISIBLE_BANDS,
  SPACE_SPEED,
  armFactor,
  armLength,
  bandCount,
  bandSpeed,
  fuzzMass,
  isSpaceShot,
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
    // 2026-10-16: Power became the band count (1..60), Arm the arm length (1.5..4 m).
    expect(catapult.descriptors.map((d) => d.code)).toEqual(['bands', 'angle', 'fuzz', 'armLen']);
    expect(catapult.descriptors[0]!.label).toBe('Rubber bands');
    expect(catapult.descriptors[0]!.options.map((o) => o.value)).toEqual(Array.from({ length: 60 }, (_, i) => String(i + 1)));
    expect(catapult.descriptors[0]!.options.every((o) => o.image === undefined)).toBe(true);
    expect(catapult.descriptors[0]!.default).toBe('2');
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
    expect(catapult.descriptors[3]!.label).toBe('Arm length');
    expect(catapult.descriptors[3]!.options.map((o) => o.value)).toEqual([...ARM_LENGTHS]);
    expect(catapult.descriptors[3]!.options.map((o) => o.label)).toEqual(ARM_LENGTHS.map((l) => `${l} m`));
    expect(catapult.descriptors[3]!.default).toBe('2');

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
    expect(defaultProps('catapult')).toEqual({ bands: '2', angle: '45', fuzz: 'Fur', armLen: '2' });
    expect(defaultProps('can')).toEqual({ color: 'Red' });
    expect(defaultProps('block')).toEqual({ size: '1x1', material: 'wood' });
    expect(defaultProps('shelf')).toEqual({ length: '2' });
    expect(defaultProps('wall')).toEqual({ height: '2' });
    expect(defaultProps('bullseye')).toEqual({ size: 'M' });
  });

  it('PART_LIMIT is 12', () => {
    expect(PART_LIMIT).toBe(12);
  });

  it('the band and arm options (2026-10-16): 1..60 bands, 1.5..4 m in quarter metres, six bands drawn', () => {
    expect(MAX_BANDS).toBe(60);
    expect(BAND_OPTIONS).toHaveLength(60);
    expect(ARM_LENGTHS).toEqual(['1.5', '1.75', '2', '2.25', '2.5', '2.75', '3', '3.25', '3.5', '3.75', '4']);
    expect(MAX_VISIBLE_BANDS).toBe(6);
  });

  it('legacy props map: power Low/Medium/High/Max -> 1..4 bands, arm Short/Long -> 2 / 3 m; the new props win', () => {
    expect(bandCount({ power: 'Low' })).toBe(1);
    expect(bandCount({ power: 'Medium' })).toBe(2);
    expect(bandCount({ power: 'High' })).toBe(3);
    expect(bandCount({ power: 'Max' })).toBe(4);
    expect(bandCount({})).toBe(2);
    expect(bandCount({ power: 'Nope' })).toBe(2);
    expect(bandCount({ bands: '45', power: 'Low' })).toBe(45);
    expect(bandCount({ bands: '0' })).toBe(1);
    expect(bandCount({ bands: '99' })).toBe(60);
    expect(armLength({ arm: 'Short' })).toBe(2);
    expect(armLength({ arm: 'Long' })).toBe(3);
    expect(armLength({})).toBe(2);
    expect(armLength({ armLen: '3.75', arm: 'Short' })).toBe(3.75);
    expect(armLength({ armLen: '9' })).toBe(4);
    expect(armLength({ armLen: '1' })).toBe(1.5);
    // A saved old tuning flies exactly as before.
    expect(launchSpeed({ power: 'High', arm: 'Long', fuzz: 'Metal' })).toBe(launchSpeed({ bands: '3', armLen: '3', fuzz: 'Metal' }));
  });

  it('band speed: the old table for 1..4 bands (7, 10, 12.5, 15), then 15 * sqrt(n / 4); no cap', () => {
    expect(BAND_SPEED).toEqual([7, 10, 12.5, 15]);
    expect([1, 2, 3, 4].map(bandSpeed)).toEqual([7, 10, 12.5, 15]);
    for (const n of [5, 6, 10, 16, 45, 60]) expect(bandSpeed(n)).toBeCloseTo(15 * Math.sqrt(n / 4), 12);
    expect(bandSpeed(16)).toBeCloseTo(30, 12);
    for (let n = 2; n <= 60; n++) expect(bandSpeed(n)).toBeGreaterThan(bandSpeed(n - 1));
  });

  it('arm factor 0.75 + 0.1 L: 0.95 at 2 m and 1.05 at 3 m (the old Short and Long)', () => {
    expect(armFactor(2)).toBeCloseTo(0.95, 12);
    expect(armFactor(3)).toBeCloseTo(1.05, 12);
    expect(armFactor(1.5)).toBeCloseTo(0.9, 12);
    expect(armFactor(4)).toBeCloseTo(1.15, 12);
    for (const len of ARM_LENGTHS) {
      expect(launchSpeed({ bands: '4', armLen: len, fuzz: 'Fur' })).toBeCloseTo(15 * (0.75 + 0.1 * Number(len)), 12);
    }
  });

  it('space shot: over SPACE_SPEED (24 m/s) - 12 bands on the Fur with the 2 m arm, 10 with 3 m, 8 for the Flower; 45 bands always', () => {
    expect(SPACE_SPEED).toBe(24);
    const firstSpace = (fuzz: string, armLen: string) => {
      for (let n = 1; n <= 60; n++) if (isSpaceShot({ bands: String(n), fuzz, armLen })) return n;
      return null;
    };
    expect(firstSpace('Fur', '2')).toBe(12);
    expect(firstSpace('Fur', '3')).toBe(10);
    expect(firstSpace('Flower', '2')).toBe(8);
    expect(firstSpace('Metal', '2')).toBe(20);
    for (const fuzz of FUZZ_NAMES) for (const armLen of ARM_LENGTHS) {
      expect(isSpaceShot({ bands: '45', fuzz, armLen }), `${fuzz}/${armLen}`).toBe(true);
      // Every old tuning (1..4 bands, 2 or 3 m) stays on the ground.
      for (const bands of ['1', '2', '3', '4']) expect(isSpaceShot({ bands, fuzz, armLen: '2' })).toBe(false);
    }
    expect(isSpaceShot({ bands: '11', fuzz: 'Fur', armLen: '2' })).toBe(false);
    expect(launchSpeed({ bands: '12', fuzz: 'Fur', armLen: '2' })).toBeGreaterThan(SPACE_SPEED);
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

  it('every band is the same red (BAND_COLOR)', () => {
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
// fixed energy per band count: a heavier fuzz leaves slower, a lighter one faster.
describe('catapult catalog: the energy rule (launchSpeed)', () => {
  const BANDS = ['1', '2', '3', '4', '6', '10'];
  const ARMS = ['1.5', '2', '3', '4'];

  it('fuzzMass is the disc mass Rapier gives the body (pi r^2 density), light to heavy', () => {
    expect(fuzzMass({ r: 0.3, density: 1 })).toBeCloseTo(Math.PI * 0.09, 12);
    const masses = FUZZ_NAMES.map((name) => fuzzMass(FUZZ[name]!));
    for (let i = 1; i < masses.length; i++) expect(masses[i]!).toBeGreaterThan(masses[i - 1]!);
  });

  it('the Fur (the reference) flies at exactly band speed x arm factor', () => {
    expect(FUZZ_REF).toBe('Fur');
    for (const bands of BANDS) {
      for (const armLen of ARMS) {
        expect(launchSpeed({ bands, armLen, fuzz: 'Fur' })).toBeCloseTo(bandSpeed(Number(bands)) * armFactor(Number(armLen)), 12);
      }
    }
    // Defaults: 2 bands, the 2 m arm, the Fur.
    expect(launchSpeed({})).toBeCloseTo(10 * 0.95, 12);
  });

  it('a lighter fuzz always leaves faster (no cap any more, 2026-10-16)', () => {
    for (const bands of BANDS) {
      for (const armLen of ARMS) {
        const speeds = FUZZ_NAMES.map((fuzz) => launchSpeed({ bands, armLen, fuzz })); // light to heavy
        for (let i = 1; i < speeds.length; i++) expect(speeds[i]!, `${bands}/${armLen}`).toBeLessThan(speeds[i - 1]!);
      }
    }
    // The old 15.75 m/s cap is gone: the Flower at 4 bands on the 2 m arm leaves at 17.7 m/s.
    expect(launchSpeed({ bands: '4', armLen: '2', fuzz: 'Flower' })).toBeGreaterThan(15.75);
  });

  it('speed goes as mass^-FUZZ_SPEED_EXPONENT (0.25): m v^4 is the same for every fuzz at a band count', () => {
    expect(FUZZ_SPEED_EXPONENT).toBe(0.25);
    const mRef = fuzzMass(FUZZ.Fur!);
    for (const bands of BANDS) {
      for (const armLen of ARMS) {
        const vRef = launchSpeed({ bands, armLen, fuzz: 'Fur' });
        for (const fuzz of FUZZ_NAMES) {
          const v = launchSpeed({ bands, armLen, fuzz });
          const m = fuzzMass(FUZZ[fuzz]!);
          expect(v / vRef, `${bands}/${armLen}/${fuzz}`).toBeCloseTo(Math.pow(mRef / m, 0.25), 12);
          expect(m * v ** 4).toBeCloseTo(mRef * vRef ** 4, 6);
        }
      }
    }
    // The pure energy rule (1/2 m v^2 fixed) would be the exponent 0.5; softened so the Metal still
    // reaches mid-range targets and the Flower does not fly 2.4x as far. The heavier fuzz still
    // carries more momentum (m v ~ m^0.75): it hits harder.
    const p = (fuzz: string) => fuzzMass(FUZZ[fuzz]!) * launchSpeed({ bands: '3', fuzz });
    expect(p('Metal')).toBeGreaterThan(p('Helmet'));
    expect(p('Helmet')).toBeGreaterThan(p('Fur'));
    expect(p('Fur')).toBeGreaterThan(p('Flower'));
  });

  it('the speed table (m/s, 2 m arm, 1..4 bands) the levels are tuned against', () => {
    const table = Object.fromEntries(
      FUZZ_NAMES.map((fuzz) => [fuzz, ['1', '2', '3', '4'].map((bands) => Math.round(launchSpeed({ bands, fuzz, armLen: '2' }) * 100) / 100)]),
    );
    expect(table).toEqual({
      Flower: [8.28, 11.82, 14.78, 17.74],
      Donut: [7.28, 10.4, 13, 15.6],
      Fur: [6.65, 9.5, 11.88, 14.25],
      Helmet: [5.77, 8.24, 10.3, 12.36],
      Metal: [5.12, 7.32, 9.14, 10.97],
    });
  });
});
