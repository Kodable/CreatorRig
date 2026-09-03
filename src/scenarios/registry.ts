import type { Scenario } from './types';

/**
 * Runtime registry: id -> lazy module. Lazy so a scenario's dependencies (a physics
 * engine, a Spine runtime) only load when that scenario runs, and load size stays honest.
 */
const LOADERS: Record<string, () => Promise<{ default: Scenario }>> = {
  baseline: () => import('./baseline'),
  'physics-smoke': () => import('./physics-smoke'),
};

export async function loadScenario(id: string): Promise<Scenario | null> {
  const loader = LOADERS[id];
  if (!loader) return null;
  const mod = await loader();
  return mod.default;
}

export function scenarioIds(): string[] {
  return Object.keys(LOADERS);
}
