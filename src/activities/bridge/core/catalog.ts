// Static data: what parts exist, their tunable properties, and the physical numbers those
// property choices map to. No physics or Phaser imports here.
import type { PropertyDescriptor, PropertyOption } from '../../../kit/types';
import type { Material, PartKind, PlacedPart } from './types';

/** Max parts the child may add on top of a level's locked anchors. */
export const PART_LIMIT = 80;

interface CatalogEntry {
  label: string;
  icon: string;
  descriptors: PropertyDescriptor[];
}

function opt(value: string, label?: string): PropertyOption {
  return { value, label: label ?? value };
}

const DESCRIPTORS: Record<PartKind, PropertyDescriptor[]> = {
  anchor: [],
  joint: [],
  rod: [
    {
      code: 'material',
      label: 'Material',
      options: [opt('road', 'Road'), opt('wood', 'Wood'), opt('steel', 'Steel'), opt('cable', 'Cable')],
    },
  ],
};

const ICONS: Record<PartKind, string> = {
  anchor: '\u{1F4CD}', // 📍
  joint: '\u{1F535}', // 🔵
  rod: '\u{1FAB5}', // 🪵
};

const LABELS: Record<PartKind, string> = {
  anchor: 'Anchor',
  joint: 'Joint',
  rod: 'Rod',
};

export const CATALOG: Record<PartKind, CatalogEntry> = (Object.keys(DESCRIPTORS) as PartKind[]).reduce(
  (acc, kind) => {
    acc[kind] = { label: LABELS[kind], icon: ICONS[kind], descriptors: DESCRIPTORS[kind] };
    return acc;
  },
  {} as Record<PartKind, CatalogEntry>,
);

/** options[0] of every descriptor for `kind`. `rod`'s `from`/`to` are not descriptors (extra
 * props strings assigned by `linkWithTool`/`makeRod`, never shown as chips). */
export function defaultProps(kind: PartKind): Record<string, string> {
  const props: Record<string, string> = {};
  for (const d of DESCRIPTORS[kind]) {
    const first = d.options[0];
    if (first) props[d.code] = first.value;
  }
  return props;
}

// ---- physical numbers -----------------------------------------------------------------------

/** K1 = the stiffness (N) of a 1 m rod of this material (k = K1 / length, so strain = F / K1 is
 * independent of length). `tension`/`compression` are strain limits (fraction); a rod breaks when
 * |strain| / limit(sign) reaches 1. `cost` is per meter. `maxLength` caps `canAddPart`. */
// Edit mode holds every joint static (no dead-load sag), so the plan's K1 values apply as is.
export const MATERIALS: Record<
  Material,
  { k1: number; tension: number; compression: number; cost: number; color: number; maxLength: number }
> = {
  road: { k1: 1000, tension: 0.035, compression: 0.035, cost: 2, color: 0x8a6a3a, maxLength: 5 },
  // Deviation (measured, see sim.test.ts "(c)"): the plan gives wood a 4% strain limit. In the
  // 6 m kingpost (a joint 1.5 m above the middle, two wood struts to the anchors, a wood tie
  // down), the two struts peak at stress 1 (break) under the Light buggy alone - the plan expects
  // this design to hold under Light and fail only under Heavy. Raising the limit by +30% (the
  // plan's suggested bound) to 5.2% brings the Light-load peak down to ~0.79 (holds, rodsBroken
  // 0) while Heavy still overloads the tie (see "(c)"); steel (unchanged) still holds Heavy in
  // the same geometry (see "(d)").
  wood: { k1: 1000, tension: 0.052, compression: 0.052, cost: 1, color: 0xc98a4b, maxLength: 5 },
  steel: { k1: 3000, tension: 0.04, compression: 0.04, cost: 3, color: 0x9aa1c0, maxLength: 5 },
  cable: { k1: 500, tension: 0.2, compression: 0.05, cost: 1, color: 0xffffff, maxLength: 8 },
};

function findNode(id: number, parts: PlacedPart[]): PlacedPart | undefined {
  return parts.find((p) => p.id === id && (p.kind === 'anchor' || p.kind === 'joint'));
}

/** Straight-line distance between a rod's two nodes (0 if either node is missing). */
export function rodLength(rod: PlacedPart, parts: PlacedPart[]): number {
  const fromId = Number(rod.props.from);
  const toId = Number(rod.props.to);
  const a = findNode(fromId, parts);
  const b = findNode(toId, parts);
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Cost = material cost per meter x length. */
export function rodCost(rod: PlacedPart, parts: PlacedPart[]): number {
  const material = (rod.props.material as Material) ?? 'wood';
  const spec = MATERIALS[material] ?? MATERIALS.wood;
  return spec.cost * rodLength(rod, parts);
}

/** Sum of every rod's cost. */
export function totalCost(parts: PlacedPart[]): number {
  return parts.filter((p) => p.kind === 'rod').reduce((sum, rod) => sum + rodCost(rod, parts), 0);
}
