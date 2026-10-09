// Test helper (imported by the levels/*.test.ts files, never by the app): proves a planet's levels
// by simulation, the way levels.test.ts always has. Each level's `solution` (and every
// `altSolutions` build) keeps the level's own parts, adds only palette parts, fits the budget,
// uses springs only once the mount is introduced, and passes its goals; the preset (the dome
// alone) does not pass. 2026-10-09: one call per planet file (flooftopia.test.ts, mars.test.ts,
// europa.test.ts), so each planet's tests live with its levels.
import { describe, expect, it } from 'vitest';
import { buildCost, mountOf } from '../catalog';
import { LEVELS } from '../levels';
import { TIMEOUT_S, createVehicleSim } from '../sim';
import type { Metrics, Outcome, RoverPart, VehicleLevel } from '../types';
import { allPass, evaluateGoals } from '../../../../kit/goals';
import { knownConcepts } from '../../../../kit/concepts';
import { FIXED_DT } from '../../../../physics';

/** Runs `parts` on `level` until the run ends (or its timeout + 1 s). */
export async function play(level: VehicleLevel, parts: RoverPart[]): Promise<{ outcome: Outcome; metrics: Metrics; pass: boolean }> {
  const sim = await createVehicleSim(parts, level);
  sim.play();
  const limit = (level.timeout ?? TIMEOUT_S) + 1;
  for (let i = 0; i < Math.ceil(limit / FIXED_DT) && sim.outcome === 'running'; i++) sim.step();
  const metrics = sim.metrics();
  const outcome = sim.outcome;
  sim.destroy();
  return { outcome, metrics, pass: outcome !== 'running' && allPass(evaluateGoals(level.goals, metrics)) };
}

/** A solution part's kind, rim angle (degrees, from the dome's centre) and mount. */
export function sticksOf(parts: RoverPart[]): [string, number, string][] {
  const dome = parts.find((p) => p.kind === 'rover')!;
  return parts
    .filter((p) => !p.locked)
    .map((p) => [p.kind, Math.round((Math.atan2(p.y - dome.y, p.x - dome.x) * 180) / Math.PI), mountOf(p.props)]);
}

/** Registers the simulation proofs for `levels`. Ids in `pending` get their proofs registered as
 * skipped (`it.skip`): levels whose solutions are known not to hold yet (being retuned). */
export function proveLevels(name: string, levels: VehicleLevel[], pending: readonly string[] = []): void {
  describe(`${name} levels: solutions (proven by simulation)`, () => {
    it('every level with goals has a solution', () => {
      for (const level of levels) if (level.goals.length > 0) expect(level.solution, level.id).toBeDefined();
    });

    for (const level of levels.filter((l) => l.solution)) {
      const solution = level.solution!;
      const added = solution.filter((p) => !p.locked);
      const sim = pending.includes(level.id) ? it.skip : it;

      it(`${level.id}: the solution keeps the level's own parts and adds only palette parts`, () => {
        for (const p of level.parts) expect(solution.find((s) => s.id === p.id)).toEqual(p);
        expect(added.length).toBeGreaterThan(0);
        for (const p of added) expect(level.palette).toContain(p.kind);
      });

      it(`${level.id}: the solution fits the budget (${level.budget} coins)`, () => {
        expect(buildCost(solution)).toBeLessThanOrEqual(level.budget!);
      });

      it(`${level.id}: the solution uses springs only once the mount is introduced`, () => {
        const known = knownConcepts(LEVELS, level.id) ?? new Set<string>();
        if (!known.has('mount')) for (const p of added) expect(mountOf(p.props)).toBe('cup');
      });

      sim(`${level.id}: the solution passes its goals`, async () => {
        const r = await play(level, solution);
        expect(r.outcome).toBe('finished');
        expect(r.pass).toBe(true);
      });

      sim(`${level.id}: the preset (the dome alone) does not pass`, async () => {
        const r = await play(level, level.parts);
        expect(r.pass).toBe(false);
      });

      if (level.altSolutions) {
        sim(`${level.id}: every altSolutions build keeps the level's parts, fits the budget and passes`, async () => {
          for (const alt of level.altSolutions!) {
            for (const p of level.parts) expect(alt.find((s) => s.id === p.id)).toEqual(p);
            expect(buildCost(alt)).toBeLessThanOrEqual(level.budget!);
            for (const p of alt.filter((q) => !q.locked)) expect(level.palette).toContain(p.kind);
            const r = await play(level, alt);
            expect(r.outcome, JSON.stringify(sticksOf(alt))).toBe('finished');
            expect(r.pass, JSON.stringify(sticksOf(alt))).toBe(true);
          }
        });
      }
    }
  });
}
