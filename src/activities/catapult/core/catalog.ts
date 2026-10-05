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
 * Medium and Heavy weights' numbers, so every level tuned before the merge flies the same. */
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

/** Every kind's default props, one place. `defaultProps()` reads this; each descriptor below
 * also stamps its `default` from here rather than relying on `options[0]` (which used to be the
 * default and put chips in a confusing order - Medium before Low, 45 before 15, ...). */
const DEFAULTS: Record<PartKind, Record<string, string>> = {
  catapult: { power: 'Medium', angle: '45', fuzz: 'Fur', arm: 'Short' },
  can: { color: 'Red' },
  block: { size: '1x1', material: 'wood' },
  shelf: { length: '2' },
  wall: { height: '2' },
  bullseye: { size: 'M' },
};

const DESCRIPTORS: Record<PartKind, PropertyDescriptor[]> = {
  catapult: [
    {
      code: 'power',
      label: 'Power',
      options: [
        opt('Low', 'Low', 'parts/catapult/power-Low.svg'),
        opt('Medium', 'Medium', 'parts/catapult/power-Medium.svg'),
        opt('High', 'High', 'parts/catapult/power-High.svg'),
        opt('Max', 'Max', 'parts/catapult/power-Max.svg'),
      ],
      default: DEFAULTS.catapult.power,
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
      code: 'arm',
      label: 'Arm',
      options: [
        opt('Short', 'Short', 'parts/catapult/arm-Short.svg'),
        opt('Long', 'Long', 'parts/catapult/arm-Long.svg'),
      ],
      default: DEFAULTS.catapult.arm,
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
      options: [opt('wood', 'Wood'), opt('brick', 'Brick'), opt('steel', 'Steel')],
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

/** Launch speed (m/s) by `power`. */
export const LAUNCH_SPEED: Record<string, number> = { Low: 7, Medium: 10, High: 12.5, Max: 15 };

/** How many rubber bands `power` shows stretched between the arm and the angle lever (product
 * direction 2026-09-22: power is visible as bands, not a power-pack picture). */
export const BAND_COUNT: Record<string, number> = { Low: 1, Medium: 2, High: 3, Max: 4 };

/** Every band is the same red (the art lead's strength band, recoloured from its grey export to
 * the reference picture's red), matching the drawer's power pictures. */
export const BAND_COLOR = 0xee3b3b;

/** Arm length (m) and launch-speed factor by `arm`. */
export const ARM: Record<string, { length: number; factor: number }> = {
  Short: { length: 2, factor: 0.95 },
  Long: { length: 3, factor: 1.05 },
};

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
};

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
