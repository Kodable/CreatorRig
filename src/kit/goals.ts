// Generic goal evaluation, shared by every builder-kit course (moved from
// goldberg/core/goals.ts, which now re-exports this).
import type { Goal, GoalResult } from './types';

export function evaluateGoals<M extends Record<string, number>>(goals: Goal<M>[], m: M): GoalResult<M>[] {
  return goals.map((goal) => {
    // `m[goal.metric]` is a generic indexed access, which noUncheckedIndexedAccess widens with
    // `| undefined`; the key always exists on a concrete M, so this narrows it back to number.
    const current = m[goal.metric] as number;
    let pass: boolean;

    if (goal.op === '>=') {
      pass = current >= goal.value;
    } else if (goal.op === '<=') {
      pass = current <= goal.value;
    } else if (goal.op === '==') {
      pass = Math.abs(current - goal.value) < 1e-9;
    } else {
      pass = false;
    }

    return { goal, current, pass };
  });
}

export function allPass<M extends Record<string, number>>(results: GoalResult<M>[]): boolean {
  return results.every((result) => result.pass);
}
