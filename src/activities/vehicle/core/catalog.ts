// Static data: what parts exist, what they cost, their one tunable property (the mount), and the
// physical numbers behind them. No physics or Phaser imports here.
//
// Stakeholder direction 2026-10-02 (Gao): "We need to be back to putting parts onto a rover base.
// Wheels, or different ways to propel the rover, or different weights, and choose the suspension.
// Each part will cost a different amount. Parts can be placed anywhere on the base." Jon (huddle
// 2026-09-22): "the more freedom the better".
import type { PropertyDescriptor } from '../../../kit/types';
import { ART_DIR } from './art';
import type { AttachmentKind, PartKind, PowerKind, WeightKind, WheelKind } from './types';

// The Bridge course drives the old buggy and imports these two tables from here.
export { POWER, WHEEL_R } from './buggy';

/** Max parts the child may add on top of a level's locked preset (Jon's "15 wheels all
 * around" fits). Budgets are the real limit. */
export const PART_LIMIT = 20;

export const WHEEL_KINDS: readonly WheelKind[] = ['wheelCircle', 'wheelSquare', 'wheelStar'];
export const POWER_KINDS: readonly PowerKind[] = ['fan', 'stove', 'jet'];
export const WEIGHT_KINDS: readonly WeightKind[] = ['feather', 'beans', 'watermelon'];
export const ATTACHMENT_KINDS: readonly AttachmentKind[] = [...WHEEL_KINDS, ...POWER_KINDS, ...WEIGHT_KINDS];

export function isAttachment(kind: string): kind is AttachmentKind {
  return (ATTACHMENT_KINDS as readonly string[]).includes(kind);
}
export function isWheel(kind: string): kind is WheelKind {
  return (WHEEL_KINDS as readonly string[]).includes(kind);
}
export function isPower(kind: string): kind is PowerKind {
  return (POWER_KINDS as readonly string[]).includes(kind);
}
export function isWeight(kind: string): kind is WeightKind {
  return (WEIGHT_KINDS as readonly string[]).includes(kind);
}

// ---- the mount ---------------------------------------------------------------------------------

/** A spring mount costs this much more than a suction cup. */
export const SPRING_EXTRA = 1;

/** Every attachment's one property: how it is stuck to the dome. `cup` = a suction cup, rigid;
 * `spring` = on a spring, soft (wheels: suspension; weights: bouncy). The options carry pictures,
 * so the drawer shows no caption under them; its row title reads "Mount · <active label>"
 * (BuilderHud `syncDrawerActive`, 16 px bold in the 340 px drawer: "Mount · Spring (bouncy, +1
 * coin)" fits on one line), which is where the spring says what it does and what it costs
 * (Jon, playtest review 2026-10-05: "show what the spring does"). */
export const MOUNT_DESCRIPTOR: PropertyDescriptor = {
  code: 'mount',
  label: 'Mount',
  options: [
    { value: 'cup', label: 'Suction cup', image: `${ART_DIR}suctioncup.png` },
    { value: 'spring', label: `Spring (bouncy, +${SPRING_EXTRA} coin)`, image: `${ART_DIR}spring.png` },
  ],
  default: 'cup',
};

export type Mount = 'cup' | 'spring';

export function mountOf(props: Record<string, string>): Mount {
  return props.mount === 'spring' ? 'spring' : 'cup';
}

// ---- costs -------------------------------------------------------------------------------------

/** Coins per attachment with a suction cup. */
export const COST: Record<AttachmentKind, number> = {
  wheelSquare: 1,
  wheelCircle: 2,
  wheelStar: 3,
  fan: 2,
  stove: 3,
  jet: 5,
  feather: 1,
  beans: 2,
  watermelon: 3,
};

/** `CourseSpec.partCost`: an attachment's coins (its kind + its mount); the dome and the level's
 * scenery are free. */
export function partCost(part: { kind: string; props: Record<string, string> }): number {
  if (!isAttachment(part.kind)) return 0;
  return COST[part.kind] + (mountOf(part.props) === 'spring' ? SPRING_EXTRA : 0);
}

/** Total coins of a part list (locked parts never count, as in the kit's budget check). */
export function buildCost(parts: { kind: string; props: Record<string, string>; locked?: boolean }[]): number {
  return parts.reduce((sum, p) => sum + (p.locked ? 0 : partCost(p)), 0);
}

// ---- catalog -----------------------------------------------------------------------------------

interface CatalogEntry {
  label: string;
  icon: string;
  descriptors: PropertyDescriptor[];
}

export const LABELS: Record<PartKind, string> = {
  rover: 'Rover',
  wheelCircle: 'Round',
  wheelSquare: 'Square',
  wheelStar: 'Star',
  fan: 'Fan',
  stove: 'Stove',
  jet: 'Jet',
  feather: 'Feather',
  beans: 'Beans',
  watermelon: 'Melon',
  block: 'Boulder',
  finish: 'Beacon',
};

export const ICONS: Record<PartKind, string> = {
  rover: '\u{1F468}\u{200D}\u{1F680}', // 👨‍🚀
  wheelCircle: '\u{1F6DE}', // 🛞
  wheelSquare: '\u{1F7EB}', // 🟫
  wheelStar: '\u{2B50}', // ⭐
  fan: '\u{1F300}', // 🌀
  stove: '\u{1F525}', // 🔥
  jet: '\u{1F680}', // 🚀
  feather: '\u{1FAB6}', // 🪶
  beans: '\u{1F96B}', // 🥫
  watermelon: '\u{1F349}', // 🍉
  block: '\u{1FAA8}', // 🪨
  finish: '\u{1F3C1}', // 🏁
};

export const CATALOG: Record<PartKind, CatalogEntry> = (Object.keys(LABELS) as PartKind[]).reduce(
  (acc, kind) => {
    acc[kind] = { label: LABELS[kind], icon: ICONS[kind], descriptors: isAttachment(kind) ? [MOUNT_DESCRIPTOR] : [] };
    return acc;
  },
  {} as Record<PartKind, CatalogEntry>,
);

/** One kid-friendly sentence per part (`HudSpec.partInfo.blurb`): shown in the shelf's unlock
 * callout when a level introduces the part, and as its shelf button's title (Jon, playtest
 * review 2026-10-05: "explain what each part does"). */
export const BLURBS: Record<AttachmentKind, string> = {
  wheelCircle: 'Fast and smooth on flat ground.',
  wheelSquare: 'Grips rocks and steps. Slow!',
  wheelStar: 'Climbs almost anything.',
  fan: 'A gentle push. Stick it on the back.',
  stove: 'Puffs of push! Stick it on the back.',
  jet: 'A huge push. Watch out, it can lift you!',
  feather: 'Almost no weight.',
  beans: 'Adds some weight to hold you down.',
  watermelon: 'Heavy! Great for ramming.',
};

/** The default props for `kind` (a copy; callers may mutate it freely). */
export function defaultProps(kind: PartKind): Record<string, string> {
  if (isAttachment(kind)) return { mount: 'cup' };
  if (kind === 'block') return { size: '1x1' };
  return {};
}

// ---- physical numbers --------------------------------------------------------------------------

/** The dome: one dynamic circle (radius ROVER_R in art.ts) of this mass and friction. */
export const ROVER_MASS = 2.5;
export const ROVER_FRICTION = 0.6;

/** Ground speed the wheel motors aim for (`speed`, m/s) and each wheel motor's torque cap (`torque`,
 * N.m). Above
 * the target speed a wheel freewheels (sim.ts), so a jet can push the rover faster than its
 * wheels would drive it. */
export const DRIVE = { speed: 6, torque: 4 };

export interface WheelSpec {
  /** Rolling radius (m): the motor target is DRIVE.speed / r. */
  r: number;
  /** How far the wheel reaches from its axle (m): the square's corner, the star's tips. The
   * axle sits this far plus the mount length out from the rim, so a wheel never sweeps the dome. */
  reach: number;
  density: number;
  friction: number;
}

/** Circle r 0.3; square half-side 0.27 (box); star = hub 0.12 + five tips reaching 0.33 (the
 * old buggy's star geometry: tips from 0.3 x reach, 0.35 x reach wide). Density 1 for all. */
export const WHEEL: Record<WheelKind, WheelSpec> = {
  wheelCircle: { r: 0.3, reach: 0.3, density: 1, friction: 1 },
  wheelSquare: { r: 0.27, reach: 0.27 * Math.SQRT2, density: 1, friction: 1 },
  wheelStar: { r: 0.33, reach: 0.33, density: 1, friction: 1 },
};
export const SQUARE_HALF = 0.27;
export const STAR_HUB = 0.12;

/** Thrust (N) each propulsion part pushes the rover with while driving, away from itself: a jet
 * on the back pushes forward, one under the dome lifts. */
export const POWER_FORCE: Record<PowerKind, number> = { fan: 4, stove: 7, jet: 12 };
/** The stove puffs: on for STOVE_ON s of every STOVE_PERIOD s. */
export const STOVE_ON = 0.6;
export const STOVE_PERIOD = 1.0;
/** Propulsion bodies are light boxes about their picture's size. */
export const POWER_DENSITY = 0.3;
/** Fraction of the picture's box used as the propulsion/weight collider (pictures carry empty
 * corners and overhangs). */
export const COLLIDER_FRACTION = 0.8;

/** Weight masses (kg), plate included. */
export const WEIGHT_MASS: Record<WeightKind, number> = { feather: 0.05, beans: 1.5, watermelon: 4 };

/** Gap (m) between the rim and the part, by mount: the suction cup or spring shows in it. A
 * propulsion picture carries its own suction cup at its mount point, so with a cup it sits right
 * on the rim. */
export const MOUNT_LEN: Record<Mount, number> = { cup: 0.1, spring: 0.25 };
export const POWER_MOUNT_LEN: Record<Mount, number> = { cup: 0, spring: 0.25 };

/** Spring mounts: a prismatic spring along the part's outward axis. Wheels use the old buggy's
 * soft suspension (2.5 Hz, damping 0.7, half the dome's mass per spring); weights and
 * propulsion bounce (2.5 Hz on their own mass, damping 0.3). Travel +/- SPRING_TRAVEL m. */
export const SPRING_HZ = 2.5;
export const WHEEL_SPRING_DAMPING = 0.7;
export const PART_SPRING_DAMPING = 0.3;
export const SPRING_TRAVEL = 0.15;
