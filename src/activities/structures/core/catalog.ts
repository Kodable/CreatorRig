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

function opt(value: string, label?: string): PropertyOption {
  return { value, label: label ?? value };
}

const MATERIAL_DESCRIPTOR: PropertyDescriptor = {
  code: 'material',
  label: 'Material',
  options: [opt('wood', 'Wood'), opt('brick', 'Brick'), opt('steel', 'Steel')],
};

const DESCRIPTORS: Record<PartKind, PropertyDescriptor[]> = {
  block: [
    {
      code: 'size',
      label: 'Size',
      options: [opt('1x1', '1 x 1'), opt('2x1', '2 wide'), opt('1x2', '2 tall')],
    },
    MATERIAL_DESCRIPTOR,
  ],
  beam: [
    {
      code: 'length',
      label: 'Length',
      options: [opt('3', '3 m'), opt('5', '5 m')],
    },
    MATERIAL_DESCRIPTOR,
  ],
  fuzz: [
    {
      code: 'size',
      label: 'Size',
      options: [opt('M', 'Medium')],
    },
  ],
};

const ICONS: Record<PartKind, string> = {
  block: '\u{1F9F1}', // 🧱
  beam: '\u{1FA9A}', // 🪚 (stand-in for a beam icon)
  fuzz: '\u{1F43E}', // 🐾
};

const LABELS: Record<PartKind, string> = {
  block: 'Block',
  beam: 'Beam',
  fuzz: 'Fuzz',
};

export const CATALOG: Record<PartKind, CatalogEntry> = (Object.keys(DESCRIPTORS) as PartKind[]).reduce(
  (acc, kind) => {
    acc[kind] = { label: LABELS[kind], icon: ICONS[kind], descriptors: DESCRIPTORS[kind] };
    return acc;
  },
  {} as Record<PartKind, CatalogEntry>,
);

/** options[0] of every descriptor for `kind`. */
export function defaultProps(kind: PartKind): Record<string, string> {
  const props: Record<string, string> = {};
  for (const d of DESCRIPTORS[kind]) {
    const first = d.options[0];
    if (first) props[d.code] = first.value;
  }
  return props;
}

export interface MaterialSpec {
  density: number;
  friction: number;
  color: number;
  /** Break rule (coordinator, 2026-09-15): relative speed at the seam (m/s) beyond which a glue
   * joint on this material snaps. The joints' own `breakDistance` (BaseWorld.checkBreakables) is
   * now a flat, rarely-firing fallback — see glue.ts's FALLBACK_BREAK_DISTANCE — not a per-
   * material number, so it isn't listed here. */
  breakSpeed: number;
}

export const MATERIALS: Record<Material, MaterialSpec> = {
  wood: { density: 0.6, friction: 0.6, color: 0xc98a4b, breakSpeed: 3 },
  brick: { density: 1.8, friction: 0.7, color: 0xb0413e, breakSpeed: 5 },
  steel: { density: 4, friction: 0.5, color: 0x9aa1c0, breakSpeed: 9 },
};

/** Block width/height in meters for a `size` option. */
export function blockSize(size: string): { w: number; h: number } {
  switch (size) {
    case '2x1':
      return { w: 2, h: 1 };
    case '1x2':
      return { w: 1, h: 2 };
    case '1x1':
    default:
      return { w: 1, h: 1 };
  }
}

/** Beam width/height in meters for a `length` option (fixed 0.3 m thickness). */
export function beamSize(length: string): { w: number; h: number } {
  const n = Number(length);
  return { w: Number.isFinite(n) && n > 0 ? n : 3, h: 0.3 };
}
