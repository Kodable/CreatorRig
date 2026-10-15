import type { Level, Outcome, Track } from './types';
import { CartSim } from './sim';
import { FIXED_DT } from './stepper';

/**
 * The air time preview (2026-10-15, Gao: level 5 was too hard, "kids won't understand hang time").
 * Pure: a quiet dry run of the same deterministic sim the ride uses, on the track being edited, that
 * reports where along the rail the fuzz would float (seat g under 0.3, CartSnapshot.airborne) and
 * for how long. CoasterScene paints those stretches as a light-blue glow on the rail in edit mode,
 * on levels with an air time goal. The run is capped (AIR_PREVIEW_MAX_S of sim time): a real ride
 * on a lesson track ends well inside it, so the preview's air time is the ride's `hangTime` (the
 * same steps, the same FIXED_DT per airborne step, src/core/meters.ts).
 */

/** A floaty stretch of rail, in arc length (m): s0 <= s1. */
export interface AirStretch { s0: number; s1: number }

export interface AirPreview {
  /** Where the fuzz floats, in ride order (a fuzz that rolls back may float over a stretch twice). */
  stretches: AirStretch[];
  /** Seconds airborne over the whole dry run (the ride's hangTime). */
  airTime: number;
  /** How the dry run ended ('running' when it hit the cap). */
  outcome: Outcome;
  /** Fixed steps simulated (the cost: four sim substeps each). */
  steps: number;
}

/** Sim seconds the dry run may take: 40 s, 2400 steps (a ride that is still going by then has
 * crawled to a stop and is about to be called stuck). A few ms at most. */
export const AIR_PREVIEW_MAX_S = 40;

/** Stretches closer than this (m) merge into one, so a crest that dips under 0.3 g for one step
 * reads as one glow. */
const MERGE_GAP_M = 0.6;

export function previewAir(track: Track, maxSeconds = AIR_PREVIEW_MAX_S): AirPreview {
  const sim = new CartSim(track);
  const maxSteps = Math.ceil(maxSeconds / FIXED_DT);
  const raw: AirStretch[] = [];
  let cur: AirStretch | null = null;
  let airTime = 0;
  let steps = 0;
  while (sim.outcome === 'running' && steps < maxSteps) {
    sim.step();
    steps++;
    const snap = sim.snapshot();
    if (snap.airborne) {
      airTime += FIXED_DT;
      if (!cur) cur = { s0: snap.s, s1: snap.s };
      cur.s0 = Math.min(cur.s0, snap.s);
      cur.s1 = Math.max(cur.s1, snap.s);
    } else if (cur) {
      raw.push(cur);
      cur = null;
    }
  }
  if (cur) raw.push(cur);
  return { stretches: mergeStretches(raw), airTime, outcome: sim.outcome, steps };
}

/** Overlapping or nearly touching stretches merged, sorted along the rail. */
export function mergeStretches(stretches: readonly AirStretch[]): AirStretch[] {
  const sorted = [...stretches].sort((a, b) => a.s0 - b.s0);
  const out: AirStretch[] = [];
  for (const st of sorted) {
    const last = out[out.length - 1];
    if (last && st.s0 <= last.s1 + MERGE_GAP_M) last.s1 = Math.max(last.s1, st.s1);
    else out.push({ s0: st.s0, s1: st.s1 });
  }
  return out;
}

/** The level's air time goal in seconds (its `hangTime >=` goal), or null: the preview, the float
 * counter and the goal pop show only on levels that have one (the lesson and Thrill ride). */
export function airGoal(level: Level): number | null {
  const g = level.goals.find((goal) => goal.metric === 'hangTime' && goal.op === '>=');
  return g ? g.value : null;
}

/** The longest stretch (where the scene puts the preview's number), or null. */
export function longestStretch(stretches: readonly AirStretch[]): AirStretch | null {
  let best: AirStretch | null = null;
  for (const st of stretches) if (!best || st.s1 - st.s0 > best.s1 - best.s0) best = st;
  return best;
}

/** The float counter's text: tenths of a second while it counts ("0.4 s"), the goal in words the
 * moment it is reached ("Half a second!", "1 second!"). */
export function airCounterText(air: number, goal: number | null, reachedNow: boolean): string {
  if (reachedNow && goal !== null) return goalWords(goal);
  return `${(Math.floor(air * 10 + 1e-6) / 10).toFixed(1)} s`;
}

export function goalWords(goal: number): string {
  if (Math.abs(goal - 0.5) < 1e-9) return 'Half a second!';
  if (Math.abs(goal - 1) < 1e-9) return '1 second!';
  return `${goal} seconds!`;
}
