// Static data: what parts exist, their tunable properties, and the physical numbers
// those property choices map to. No physics or Phaser imports here.
import type { PartKind, PropertyDescriptor } from './types';

/** Max parts the child may add on top of a level's locked preset. */
export const PART_LIMIT = 12;

interface CatalogEntry {
  label: string;
  icon: string;
  descriptors: PropertyDescriptor[];
}

function opt(value: string, label?: string) {
  return { value, label: label ?? value };
}

/** code -> option value -> physical number, per the property table in the plan. */
type NumberMap = Record<string, Record<string, number>>;

const DESCRIPTORS: Record<PartKind, PropertyDescriptor[]> = {
  fuzz: [
    {
      code: 'size',
      label: 'Size',
      options: [opt('M', 'Medium'), opt('S', 'Small'), opt('L', 'Large')],
    },
  ],
  platform: [
    {
      code: 'length',
      label: 'Length',
      options: [opt('Medium'), opt('Short'), opt('Long')],
    },
    {
      code: 'rotation',
      label: 'Rotation',
      options: [opt('0', '0°'), opt('-15', '-15°'), opt('15', '15°')],
    },
  ],
  ramp: [
    {
      code: 'angle',
      label: 'Angle',
      options: [opt('30', '30°'), opt('15', '15°'), opt('45', '45°')],
    },
    {
      code: 'flip',
      label: 'Flip',
      options: [opt('No'), opt('Yes')],
    },
    {
      code: 'size',
      label: 'Size',
      options: [opt('Medium'), opt('Large')],
    },
  ],
  domino: [
    {
      code: 'count',
      label: 'Count',
      options: [opt('3'), opt('1'), opt('2'), opt('4'), opt('5'), opt('6')],
    },
  ],
  seesaw: [
    {
      code: 'length',
      label: 'Length',
      options: [opt('Medium'), opt('Short'), opt('Long')],
    },
    {
      code: 'fulcrumPos',
      label: 'Fulcrum',
      options: [opt('Middle'), opt('Left'), opt('MidLeft'), opt('MidRight'), opt('Right')],
    },
    {
      code: 'startState',
      label: 'Start',
      options: [opt('Balanced'), opt('LeftDown'), opt('RightDown')],
    },
    {
      code: 'hook',
      label: 'Hook',
      options: [opt('None'), opt('Left'), opt('Right'), opt('Both')],
    },
  ],
  lever: [
    {
      code: 'length',
      label: 'Length',
      options: [opt('Medium'), opt('Short'), opt('Long')],
    },
    {
      code: 'fulcrumPos',
      label: 'Fulcrum',
      options: [opt('Middle'), opt('Edge')],
    },
    {
      code: 'direction',
      label: 'Direction',
      options: [opt('Right'), opt('Left')],
    },
  ],
  gate: [
    {
      code: 'openTime',
      label: 'Opens at',
      options: [opt('0', '0s'), opt('3', '3s'), opt('5', '5s'), opt('8', '8s')],
    },
  ],
};

const NUMBERS: Record<PartKind, NumberMap> = {
  fuzz: {
    size: { M: 0.4, S: 0.3, L: 0.6 },
  },
  platform: {
    length: { Medium: 4, Short: 2, Long: 6 },
    rotation: { '0': 0, '-15': -15, '15': 15 },
  },
  ramp: {
    angle: { '30': 30, '15': 15, '45': 45 },
    flip: { No: 0, Yes: 1 },
    size: { Medium: 3, Large: 4 },
  },
  domino: {
    count: { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 },
  },
  seesaw: {
    length: { Medium: 4, Short: 3, Long: 5 },
    fulcrumPos: { Middle: 0, Left: -0.4, MidLeft: -0.2, MidRight: 0.2, Right: 0.4 },
    startState: { Balanced: 0, LeftDown: 0.35, RightDown: -0.35 },
    hook: { None: 0, Left: 1, Right: 2, Both: 3 },
  },
  lever: {
    length: { Medium: 3, Short: 2, Long: 4 },
    fulcrumPos: { Middle: 0, Edge: 0.25 },
    // Signed: Right = high end on the right (+1), Left = high end on the left (-1).
    direction: { Right: 1, Left: -1 },
  },
  gate: {
    openTime: { '0': 0, '3': 3, '5': 5, '8': 8 },
  },
};

const ICONS: Record<PartKind, string> = {
  fuzz: '🐾',
  platform: '▬',
  ramp: '📐',
  domino: '🁢',
  seesaw: '⚖️',
  lever: '🎚️',
  gate: '🚪',
};

const LABELS: Record<PartKind, string> = {
  fuzz: 'Fuzz',
  platform: 'Platform',
  ramp: 'Ramp',
  domino: 'Domino',
  seesaw: 'Seesaw',
  lever: 'Lever',
  gate: 'Gate',
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

/**
 * The physical number behind an option. Falls back to the default option (options[0])
 * when `value` does not match a known option for this kind/code.
 */
export function propNumber(kind: PartKind, code: string, value: string): number {
  const map = NUMBERS[kind]?.[code];
  if (map && value in map) return map[value] as number;
  const descriptor = DESCRIPTORS[kind].find(d => d.code === code);
  const fallbackValue = descriptor?.options[0]?.value;
  if (map && fallbackValue !== undefined && fallbackValue in map) return map[fallbackValue] as number;
  return 0;
}
