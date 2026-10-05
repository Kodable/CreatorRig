import { Goal, GoalResult, Metrics } from './types';

export function evaluateGoals(goals: Goal[], m: Metrics): GoalResult[] {
  return goals.map(goal => {
    const current = m[goal.metric];
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

export function allPass(results: GoalResult[]): boolean {
  return results.every(result => result.pass);
}
