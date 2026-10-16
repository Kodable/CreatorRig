// Static data: what parts exist, their tunable properties, and the physical numbers those
// property choices map to. No physics or Phaser imports here.
import type { PropertyDescriptor, PropertyOption } from '../../../kit/types';
import type { Material, PartKind } from './types';

/** Max parts the child may add on top of a level's locked preset. */
export const PART_LIMIT = 12;

interface CatalogEntry {
  label: string;
  icon: string;
  descriptors: PropertyDescriptor[];
}

function opt(value: string, label?: string, image?: string): PropertyOption {
  return { value, label: label ?? value, ...(image ? { image } : {}) };
}

/** One fuzz the child can load: collider radius (m) and density, the drawer label and picture
 * (a square canvas centred on the fuzz's round body - see spec.ts's `FUZZ_ART_SCALE`), and whether
 * it splits in three at the top of its arc. */
export interface FuzzSpec {
  r: number;
  density: number;
  label: string;
  image: string;
  splits?: boolean;
}

/** The five fuzzes, in drawer (weight) order. Flower, Fur and Metal carry exactly the old Light,
 * Medium and Heavy weights' numbers. Since the energy rule (2026-10-15, `launchSpeed`) each one's
 * mass also sets its launch speed: lighter leaves faster. */
export const FUZZ_NAMES = ['Flower', 'Donut', 'Fur', 'Helmet', 'Metal'] as const;
export type FuzzName = (typeof FUZZ_NAMES)[number];

export const FUZZ: Record<string, FuzzSpec> = {
  Flower: { r: 0.25, density: 0.6, label: 'Flower', image: 'parts/catapult/fuzz-Flower.png' },
  Donut: { r: 0.28, density: 0.8, label: 'Donut', image: 'parts/catapult/fuzz-Donut.png', splits: true },
  Fur: { r: 0.3, density: 1, label: 'Fur', image: 'parts/catapult/fuzz-Fur.png' },
  Helmet: { r: 0.35, density: 1.3, label: 'Helmet', image: 'parts/catapult/fuzz-Helmet.png' },
  Metal: { r: 0.4, density: 1.6, label: 'Metal', image: 'parts/catapult/fuzz-Metal.png' },
};

/** A part saved before the merge carries `weight` (and maybe `fuzz: 'Blue'`/`'Prism'`) instead:
 * its weight maps onto the fuzz with the same numbers. */
const LEGACY_WEIGHT: Record<string, FuzzName> = { Light: 'Flower', Medium: 'Fur', Heavy: 'Metal' };

/** `props.fuzz` when it names one of the five, else the legacy `weight` mapping, else Fur (the
 * default). */
export function fuzzName(props: Record<string, string>): FuzzName {
  const fuzz = props.fuzz;
  if (fuzz !== undefined && (FUZZ_NAMES as readonly string[]).includes(fuzz)) return fuzz as FuzzName;
  return LEGACY_WEIGHT[props.weight ?? ''] ?? 'Fur';
}

/** The `FUZZ` entry for a catapult's props (see `fuzzName`). */
export function fuzzSpec(props: Record<string, string>): FuzzSpec {
  return FUZZ[fuzzName(props)]!;
}

/** Fallback fill per fuzz for the loaded/flying fuzz RenderItems if the picture ever fails to
 * load: each fuzz's own main colour. */
export const FUZZ_TINT: Record<string, number> = {
  Flower: 0xe0392f,
  Donut: 0x9fd3ff,
  Fur: 0xf39a1e,
  Helmet: 0x8a7fd8,
  Metal: 0x9aa1c0,
};

// ---- rubber bands and arm length (2026-10-16) -------------------------------------------
// Huddle 2026-10-15/16, Jon: "rubber bands unlimited like rover wheels ... 45 bands launches into
// space and fails" and "arm length fully customizable". The old Power row (Low/Medium/High/Max) is
// now a band count, the old Arm row (Short/Long) a length in metres. Parts saved before carry
// `power` / `arm` instead; `bandCount` / `armLength` map them (Low..Max = 1..4 bands, Short/Long =
// 2/3 m), so every old tuning flies exactly as it did.

/** The most bands a catapult can carry (the descriptor's last option). */
export const MAX_BANDS = 60;
/** '1'..'60', the `bands` descriptor's options. */
export const BAND_OPTIONS: string[] = Array.from({ length: MAX_BANDS }, (_, i) => String(i + 1));
/** Arm lengths (m) the `armLen` prop takes, shortest first, a quarter metre apart. */
export const ARM_LENGTHS = ['1.5', '1.75', '2', '2.25', '2.5', '2.75', '3', '3.25', '3.5', '3.75', '4'] as const;
export const MIN_ARM_LENGTH = 1.5;
export const MAX_ARM_LENGTH = 4;
/** Bands drawn on the machine at most; past this the bundle shows a "×n" label (build.ts). */
export const MAX_VISIBLE_BANDS = 6;

const LEGACY_POWER_BANDS: Record<string, number> = { Low: 1, Medium: 2, High: 3, Max: 4 };
const LEGACY_ARM_LENGTH: Record<string, number> = { Short: 2, Long: 3 };

/** The catapult's band count: `props.bands` (an integer, clamped to 1..MAX_BANDS), else the legacy
 * `power` (Low/Medium/High/Max = 1/2/3/4), else 2 (the default). */
export function bandCount(props: Record<string, string>): number {
  const n = Number(props.bands);
  if (props.bands !== undefined && props.bands !== '' && Number.isFinite(n)) {
    return Math.min(MAX_BANDS, Math.max(1, Math.round(n)));
  }
  return LEGACY_POWER_BANDS[props.power ?? ''] ?? 2;
}

/** The catapult's arm length (m): `props.armLen` clamped to 1.5..4, else the legacy `arm`
 * (Short/Long = 2/3 m), else 2 (the default). */
export function armLength(props: Record<string, string>): number {
  const len = Number(props.armLen);
  if (props.armLen !== undefined && props.armLen !== '' && Number.isFinite(len)) {
    return Math.min(MAX_ARM_LENGTH, Math.max(MIN_ARM_LENGTH, len));
  }
  return LEGACY_ARM_LENGTH[props.arm ?? ''] ?? 2;
}

/** Every kind's default props, one place. `defaultProps()` reads this; each descriptor below
 * also stamps its `default` from here rather than relying on `options[0]` (which used to be the
 * default and put chips in a confusing order - Medium before Low, 45 before 15, ...). */
const DEFAULTS: Record<PartKind, Record<string, string>> = {
  catapult: { bands: '2', angle: '45', fuzz: 'Fur', armLen: '2' },
  can: { color: 'Red' },
  block: { size: '1x1', material: 'wood' },
  shelf: { length: '2' },
  wall: { height: '2' },
  bullseye: { size: 'M' },
};

const DESCRIPTORS: Record<PartKind, PropertyDescriptor[]> = {
  catapult: [
    {
      // 2026-10-16 (Jon): "rubber bands unlimited like rover wheels ... 45 bands launches into space
      // and fails". One band per option, 1..MAX_BANDS (was Power: Low/Medium/High/Max = 1..4 bands).
      code: 'bands',
      label: 'Rubber bands',
      options: BAND_OPTIONS.map((n) => opt(n)),
      default: DEFAULTS.catapult.bands,
    },
    {
      code: 'angle',
      label: 'Angle',
      options: [
        opt('15', '15°', 'parts/catapult/angle-15.svg'),
        opt('30', '30°', 'parts/catapult/angle-30.svg'),
        opt('45', '45°', 'parts/catapult/angle-45.svg'),
        opt('60', '60°', 'parts/catapult/angle-60.svg'),
        opt('75', '75°', 'parts/catapult/angle-75.svg'),
      ],
      default: DEFAULTS.catapult.angle,
    },
    {
      // Which fuzz rides the arm (stakeholder direction 2026-10-01: one row, five fuzzes, each its
      // own weight - weight and shot type merged). In weight order, light to heavy; the Donut also
      // splits into three at the top of its arc (sim.ts). The pictures are the fuzzes themselves.
      code: 'fuzz',
      label: 'Fuzz',
      options: FUZZ_NAMES.map((name) => opt(name, FUZZ[name]!.label, FUZZ[name]!.image)),
      default: DEFAULTS.catapult.fuzz,
    },
    {
      // 2026-10-16 (Jon): "arm length fully customizable" - 1.5 to 4 m in quarter metres (was Arm:
      // Short/Long = 2/3 m).
      code: 'armLen',
      label: 'Arm length',
      options: ARM_LENGTHS.map((len) => opt(len, `${len} m`)),
      default: DEFAULTS.catapult.armLen,
    },
  ],
  can: [
    {
      code: 'color',
      label: 'Color',
      options: [opt('Red'), opt('Blue'), opt('Green')],
      default: DEFAULTS.can.color,
    },
  ],
  block: [
    {
      code: 'size',
      label: 'Size',
      // 'domino' is a thin 0.4 x 2 m slab: a 1x2 block is too squat to knock its neighbour over,
      // so the chain-reaction level stands these up instead.
      options: [opt('1x1', '1 x 1'), opt('2x1', '2 wide'), opt('1x2', '2 tall'), opt('domino', 'Domino')],
      default: DEFAULTS.block.size,
    },
    {
      code: 'material',
      label: 'Material',
      // 'crate' (2026-10-15): a wooden crate that breaks when it is hit hard enough (CRATE_BREAK).
      options: [opt('wood', 'Wood'), opt('brick', 'Brick'), opt('steel', 'Steel'), opt('crate', 'Crate')],
      default: DEFAULTS.block.material,
    },
  ],
  shelf: [
    {
      code: 'length',
      label: 'Length',
      options: [opt('2', '2 m'), opt('4', '4 m')],
      default: DEFAULTS.shelf.length,
    },
  ],
  wall: [
    {
      code: 'height',
      label: 'Height',
      options: [opt('2', '2 m'), opt('4', '4 m'), opt('6', '6 m')],
      default: DEFAULTS.wall.height,
    },
  ],
  bullseye: [{ code: 'size', label: 'Size', options: [opt('M', 'Medium')], default: DEFAULTS.bullseye.size }],
};

const ICONS: Record<PartKind, string> = {
  catapult: '\u{1F3F9}', // 🏹
  can: '\u{1F94B}', // stand-in tin-can-ish glyph
  block: '\u{1F9F1}', // 🧱
  shelf: '\u{1F4D0}', // 📐 stand-in for a shelf
  wall: '\u{1F9F1}',
  bullseye: '\u{1F3AF}', // 🎯
};

const LABELS: Record<PartKind, string> = {
  catapult: 'Catapult',
  can: 'Can',
  block: 'Block',
  shelf: 'Shelf',
  wall: 'Wall',
  bullseye: 'Bullseye',
};

export const CATALOG: Record<PartKind, CatalogEntry> = (Object.keys(DESCRIPTORS) as PartKind[]).reduce(
  (acc, kind) => {
    acc[kind] = { label: LABELS[kind], icon: ICONS[kind], descriptors: DESCRIPTORS[kind] };
    return acc;
  },
  {} as Record<PartKind, CatalogEntry>,
);

/** `DEFAULTS[kind]`, copied so callers may freely spread/mutate the result. */
export function defaultProps(kind: PartKind): Record<string, string> {
  return { ...DEFAULTS[kind] };
}

// ---- physical numbers -----------------------------------------------------------------------

/** Launch speed (m/s) of the reference fuzz (the Fur, `FUZZ_REF`) on a factor-1 arm, by band
 * count 1..4: exactly the old Low, Medium, High and Max. Past 4 bands the speed grows as the square
 * root of the count (`bandSpeed`): the stored energy goes as the bands, the speed as its root. */
export const BAND_SPEED = [7, 10, 12.5, 15] as const;

/** The speed (m/s) `n` bands give the Fur on a factor-1 arm: the BAND_SPEED table for 1..4, then
 * 15 * sqrt(n / 4) (6 bands 18.4, 10 bands 23.7, 45 bands 50.3). */
export function bandSpeed(n: number): number {
  const k = Math.max(1, Math.round(n));
  return k <= BAND_SPEED.length ? BAND_SPEED[k - 1]! : BAND_SPEED[BAND_SPEED.length - 1]! * Math.sqrt(k / 4);
}

/** The arm's launch-speed factor for a length L (m): 0.75 + 0.1 L - 0.95 at 2 m and 1.05 at 3 m,
 * exactly the old Short and Long; 0.9 at 1.5 m, 1.15 at 4 m. */
export function armFactor(L: number): number {
  return 0.75 + 0.1 * L;
}

/** The fuzz whose launch speeds are exactly `bandSpeed` x arm factor (every Fur-based tuning from
 * before the energy rule flies the same). */
export const FUZZ_REF = 'Fur';

/** Gao, 2026-10-15: "theres no gameplay reason to use a lighter fuzz right now" - every fuzz left at
 * the same speed, so with no air drag they all flew the same distance. Now the bands store a fixed
 * energy per band count: a heavier fuzz leaves slower and lands shorter, a lighter one flies
 * farther but hits softer. The pure energy rule (1/2 m v^2 fixed, v ~ m^-0.5) made the Metal useless
 * past 9 m and sent the Flower 2.4x as far, so the speed goes as m^-FUZZ_SPEED_EXPONENT instead,
 * relative to the Fur: speed x1.25 Flower, x1.09 Donut, x1 Fur, x0.87 Helmet, x0.77 Metal (ranges
 * x1.55, x1.20, x1, x0.75, x0.59). */
export const FUZZ_SPEED_EXPONENT = 0.25;

/** A shot leaving faster than this (m/s) is a SPACE SHOT (2026-10-16, Jon: "45 bands launches into
 * space and fails"): the fuzz rockets off out of the top of the world, hits nothing and uses up the
 * shot (sim.ts). About 12 bands on the Fur with the 2 m arm (10 with the 3 m arm, 8 for the Flower, 20 for the Metal).
 * Until 2026-10-16 every shot was capped at 15.75 m/s (the old Max power, Long arm); the cap is gone
 * - more bands always fling harder, until the fuzz leaves the world. */
export const SPACE_SPEED = 24;

/** A fuzz's mass as Rapier gives its body: a disc of radius r at its density (2D, per metre). */
export function fuzzMass(spec: Pick<FuzzSpec, 'r' | 'density'>): number {
  return Math.PI * spec.r * spec.r * spec.density;
}

/** The release speed (m/s) for a catapult's props: `bandSpeed(bandCount)` x `armFactor(armLength)`
 * x (m_ref / m)^FUZZ_SPEED_EXPONENT. No cap (2026-10-16): over SPACE_SPEED it is a space shot. The
 * one formula the shot, the swing and the dotted preview all use (build.ts `catapultRelease`). */
export function launchSpeed(props: Record<string, string>): number {
  const massRatio = fuzzMass(FUZZ[FUZZ_REF]!) / fuzzMass(fuzzSpec(props));
  return bandSpeed(bandCount(props)) * armFactor(armLength(props)) * Math.pow(massRatio, FUZZ_SPEED_EXPONENT);
}

/** True when these props fling the fuzz into space (`launchSpeed` over SPACE_SPEED). */
export function isSpaceShot(props: Record<string, string>): boolean {
  return launchSpeed(props) > SPACE_SPEED;
}

/** Every band is the same red (the art lead's strength band, recoloured from its grey export to
 * the reference picture's red). */
export const BAND_COLOR = 0xee3b3b;

/** The split at the top of the arc: each extra fuzz leaves at the parent's speed with the direction
 * turned by this much (one +, one -), offset sideways so the three read as separate fuzzes. Only a
 * fuzz whose `FUZZ` entry `splits` (the Donut) does this. */
export const SPLIT_ANGLE_DEG = 14;
export const SPLIT_OFFSET = 0.1;

export interface MaterialSpec {
  density: number;
  friction: number;
  color: number;
}

export const MATERIALS: Record<Material, MaterialSpec> = {
  wood: { density: 0.6, friction: 0.6, color: 0xc98a4b },
  brick: { density: 1.8, friction: 0.7, color: 0xb0413e },
  steel: { density: 4, friction: 0.5, color: 0x9aa1c0 },
  // The breakable crate: wood's numbers, so a crate stacks and topples like a wood block until it
  // takes a hit hard enough to break (CRATE_BREAK).
  crate: { density: 0.6, friction: 0.6, color: 0xd29a55 },
};

/** Gao, 2026-10-15: "breakable boxes, if hit with enough force, they just get destroyed". A crate
 * (a block with `material: 'crate'`) breaks at the end of the step in which one other body (the
 * fuzz, another block, the ground, a shelf) hits it hard: a contact impulse over `impulse` N s
 * within one fixed step, from a body that was closing on it at `speed` m/s or more just before the
 * step (sim.ts). The speed gate is what keeps a stack whole: a hit on its top crate pushes hard
 * through every crate under it, but those were resting on each other, so only the hit one breaks.
 * Measured (one 1 x 1 crate on the ground, every power/fuzz/angle, before the energy rule): the
 * Flower never passes 1.6 (a gentle bump), the Fur hits 1.7-3, the Helmet 2.4-6.7, the Metal 4.5-11
 * (since the rule the Helmet and Metal hit up to ~25% softer; until 2026-10-16 the Flower's speed
 * was capped at 15.75 m/s so it never broke one - with unlimited bands a fast enough Flower can); a
 * crate falling
 * about a metre or more onto the ground breaks too. `force` (N) is the per-sub-step floor below
 * which a contact is not even reported: a crate resting under a whole tower pushes far less. */
export const CRATE_BREAK = { impulse: 1.8, speed: 4, force: 60 };

/** Can colour by `color` prop. */
export const CAN_COLORS: Record<string, number> = { Red: 0xe0392f, Blue: 0x05aeed, Green: 0x61bb46 };

/** Block width/height in meters for a `size` option. */
export function blockSize(size: string): { w: number; h: number } {
  switch (size) {
    case '2x1':
      return { w: 2, h: 1 };
    case '1x2':
      return { w: 1, h: 2 };
    case 'domino':
      return { w: 0.4, h: 2 };
    case '1x1':
    default:
      return { w: 1, h: 1 };
  }
}
