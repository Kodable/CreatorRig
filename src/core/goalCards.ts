// The coaster's goal cards (2026-10-15, Jon: "We need to do a much better job of communicating the
// goals ... big font for the number. And then like icons for like speed, gravity, etc."): the pure
// mapping from a level goal to what its card shows (src/ui/hud.ts draws it, style.css `.gcard`).
// Each card is a big target number with a small unit and a picture of the metric under it; a
// yes/no goal (the flag, the end) is a big picture alone. No DOM here, so it is unit tested in node.
import type { Goal, GoalResult, Metric, Mode } from './types';

/** The picture under the number: public/ui/goals/<icon>.svg. */
export type GoalIcon = 'drop' | 'speed' | 'length' | 'air' | 'loop' | 'g' | 'flag' | 'end';

export interface GoalCardSpec {
  icon: GoalIcon;
  /** 'number': the big target number + unit over the icon; 'check': a yes/no goal, the icon alone. */
  kind: 'number' | 'check';
  /** The big target number ("15", "0.5"), '' for a check card. */
  number: string;
  /** The unit set small beside the number ("m", "m/s", "s", "g", "×"), '' for a check card. */
  unit: string;
  /** A "stay under" goal (op '<='): the card wears an UNDER badge. */
  under: boolean;
  /** The tiny caption under the card, in Title Case (2026-10-15, Gao: "capitalize things"):
   * "Speed", "Track to Flag". The units stay lower case: "m" is metres, "M" is not. */
  caption: string;
}

/** How a card looks this frame: 'idle' (nothing to show yet), 'progress' (filling toward the
 * target), 'met' (green, with a check), 'broken' (red, with a "!": a "stay under" limit went over,
 * or the ride is over and the goal was missed, so the child has to reset and try again). */
export type GoalCardState = 'idle' | 'progress' | 'met' | 'broken';

export interface GoalCardLive {
  state: GoalCardState;
  /** The bar along the card's bottom, 0..1: how near the target (or, for a "stay under" goal, how
   * much of the limit is used). */
  fill: number;
  /** A "stay under" goal close to its limit (75%+): the bar turns orange as a warning. */
  warn: boolean;
}

const ICON: Record<Metric, GoalIcon> = {
  maxDrop: 'drop',
  maxSpeed: 'speed',
  length: 'length',
  hangTime: 'air',
  loops: 'loop',
  loopsCompleted: 'loop',
  maxG: 'g',
  atFinish: 'flag',
  reachedEnd: 'end',
};

const UNIT: Record<Metric, string> = {
  maxDrop: 'm',
  maxSpeed: 'm/s',
  length: 'm',
  hangTime: 's',
  loops: '×',
  loopsCompleted: '×',
  maxG: 'g',
  atFinish: '',
  reachedEnd: '',
};

const CAPTION: Record<Metric, string> = {
  maxDrop: 'Drop',
  maxSpeed: 'Speed',
  length: 'Track Length',
  hangTime: 'Air Time',
  loops: 'Loops',
  loopsCompleted: 'Loops',
  maxG: 'G-Force',
  atFinish: 'Track to Flag',
  reachedEnd: 'Fuzz to the End',
};

/** Yes/no metrics (0 or 1): a check card. */
const BOOL_METRICS: ReadonlySet<Metric> = new Set<Metric>(['atFinish', 'reachedEnd']);

/** Metrics the edited track already has before any ride (src/core/meters.ts staticMetrics): their
 * cards fill while the child edits. The rest are 0 until the fuzz rolls, so their cards stay idle. */
const STATIC_METRICS: ReadonlySet<Metric> = new Set<Metric>(['maxDrop', 'length', 'loops', 'atFinish']);

/** The share of the limit used at which a "stay under" bar turns orange. */
export const UNDER_WARN_AT = 0.75;

/** A target as kids read it: whole numbers bare ("15"), else one decimal ("0.5"); loops whole. */
export function targetText(goal: Goal): string {
  const v = goal.value;
  if (goal.metric === 'loops' || goal.metric === 'loopsCompleted') return String(Math.round(v));
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

export function goalCardSpec(goal: Goal): GoalCardSpec {
  const check = BOOL_METRICS.has(goal.metric);
  return {
    icon: ICON[goal.metric],
    kind: check ? 'check' : 'number',
    number: check ? '' : targetText(goal),
    unit: check ? '' : UNIT[goal.metric],
    under: goal.op === '<=' && !check,
    caption: CAPTION[goal.metric],
  };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return v > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * A card's look this frame. While editing only the metrics the track already has (drop, length,
 * loops placed, the flag) fill; the ride metrics stay idle and calm. During the ride every card
 * fills toward its target and turns green the moment it is met; a "stay under" goal is never green
 * while editing (nothing has pushed on it yet) and turns red once its limit breaks.
 *
 * When the ride is over (2026-10-15, Gao: "show goal as red when they need to reset and failed
 * something"), every missed goal turns red and keeps its bar, so the child sees how close it was.
 * `reachedEnd` is false when the fuzz fell, rolled back or got stuck: then the flag and end cards
 * are red too, even when the track itself reaches the flag.
 */
export function goalCardLive(result: GoalResult, mode: Mode, reachedEnd = true): GoalCardLive {
  const { goal, current, pass } = result;
  if (mode === 'done' && !reachedEnd && BOOL_METRICS.has(goal.metric)) return { state: 'broken', fill: 1, warn: false };
  const live = mode !== 'edit' || STATIC_METRICS.has(goal.metric);

  if (goal.op === '<=') {
    const used = goal.value > 0 ? clamp01(current / goal.value) : current > 0 ? 1 : 0;
    if (!pass) return { state: 'broken', fill: 1, warn: false };
    if (mode === 'edit') return { state: 'idle', fill: 0, warn: false };
    if (mode === 'done') return { state: 'met', fill: used, warn: false };
    return { state: used > 0 ? 'progress' : 'idle', fill: used, warn: used >= UNDER_WARN_AT };
  }

  if (!live) return { state: 'idle', fill: 0, warn: false };
  if (pass) return { state: 'met', fill: 1, warn: false };
  const exact = goal.op === '==' || BOOL_METRICS.has(goal.metric);
  const fill = exact ? 0 : goal.value > 0 ? clamp01(current / goal.value) : 0;
  if (mode === 'done') return { state: 'broken', fill: exact ? 1 : fill, warn: false };
  if (exact) return { state: 'idle', fill: 0, warn: false };
  return { state: fill > 0 ? 'progress' : 'idle', fill, warn: false };
}
