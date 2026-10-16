// Goal cards for kit courses (2026-10-16, Gao: "use goal cards like the roller coaster: big number
// + icon per goal, green when met, red when the level is failed"). The coaster's card look
// (src/core/goalCards.ts, style.css `.gcard`) with the kit's own rule for when a card turns red:
// a multi-shot course (the catapult) is not over after one shot, so an unmet card stays calm
// between shots and only goes red once no further shot or run is possible. Pure state, no DOM:
// BuilderHud draws it, this file is unit tested in node.
import type { GoalResult, Mode } from './types';

/** How a card looks this frame (the coaster's states, same CSS classes). */
export type KitGoalCardState = 'idle' | 'progress' | 'met' | 'broken';

export interface KitGoalCardLive {
  state: KitGoalCardState;
  /** The bar along the card's bottom, 0..1 (an "under" goal: how much of the limit is used). */
  fill: number;
  /** An "under" goal at 75%+ of its limit: the bar turns orange. */
  warn: boolean;
}

/** What the card needs to know besides its goal's result. */
export interface KitGoalCardContext {
  mode: Mode;
  /** A yes/no card (`KitGoalCard.check`): no bar, met or not. */
  check: boolean;
  /** The goal's metric is in `HudSpec.goalCardEditMetrics`: the card fills while editing. */
  editLive: boolean;
  /** The level is over and can go no further: done mode with no replay left (`levelOver`). */
  levelOver: boolean;
  /** The level was passed (an "under" goal turns green then). */
  passed: boolean;
}

/** The share of an "under" goal's limit at which its bar turns orange (the coaster's). */
export const KIT_UNDER_WARN_AT = 0.75;

/** The level is over and failed for the cards: done mode, not passed, and no further shot or run
 * (`HudState.canPlay` is false in done mode once the sim cannot replay: no shots left, or the
 * outcome ended the level). Between shots with shots left it is false, so unmet cards stay calm. */
export function levelOver(mode: Mode, passed: boolean, canPlay: boolean): boolean {
  return mode === 'done' && !passed && !canPlay;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return v > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * A kit goal card's look this frame.
 * - While editing only `editLive` metrics fill (and turn green once met); the rest stay idle.
 * - During a run and between runs every card fills toward its target and turns green once met.
 * - An "under" goal (op '<=') turns red the moment it goes over its limit (once its metric is
 *   live), and green only when the level is passed or over; until then it shows how much of the
 *   limit is used (orange from 75%).
 * - Any other unmet goal turns red only when the level is over and failed (`ctx.levelOver`),
 *   keeping its bar so the child sees how close it was.
 */
export function kitGoalCardLive<M>(result: GoalResult<M>, ctx: KitGoalCardContext): KitGoalCardLive {
  const { goal, current, pass } = result;
  const live = ctx.mode !== 'edit' || ctx.editLive;

  if (goal.op === '<=' && !ctx.check) {
    const used = goal.value > 0 ? clamp01(current / goal.value) : current > 0 ? 1 : 0;
    if (!live) return { state: 'idle', fill: 0, warn: false };
    if (!pass) return { state: 'broken', fill: 1, warn: false };
    if (ctx.mode === 'edit') return { state: 'idle', fill: 0, warn: false };
    if (ctx.mode === 'done' && (ctx.passed || ctx.levelOver)) return { state: 'met', fill: used, warn: false };
    return { state: used > 0 ? 'progress' : 'idle', fill: used, warn: used >= KIT_UNDER_WARN_AT };
  }

  if (!live) return { state: 'idle', fill: 0, warn: false };
  if (pass) return { state: 'met', fill: 1, warn: false };
  const exact = goal.op === '==' || ctx.check;
  const fill = exact ? 0 : goal.value > 0 ? clamp01(current / goal.value) : 0;
  if (ctx.levelOver) return { state: 'broken', fill: exact ? 1 : fill, warn: false };
  if (exact) return { state: 'idle', fill: 0, warn: false };
  return { state: fill > 0 ? 'progress' : 'idle', fill, warn: false };
}
