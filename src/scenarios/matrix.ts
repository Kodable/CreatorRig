/**
 * The scenario matrix is plain data with no browser or Phaser imports, so Playwright and
 * Vitest can read it in Node. The runtime registry (registry.ts) maps ids to modules.
 *
 * Add a scenario here AND in registry.ts. The index page and the bench read this file.
 */
export interface ScenarioVariant {
  /** Short label used in file names, e.g. "500". */
  label: string;
  params: Record<string, string | number>;
}

export interface ScenarioEntry {
  id: string;
  title: string;
  description: string;
  /** Task in Notion that owns the scenario. */
  task: string;
  /** Variants the bench runs and the index page links. */
  variants: ScenarioVariant[];
  /** Adapters the scenario runs on. Empty means the scenario does not simulate physics. */
  adapters: string[];
}

export const MATRIX: ScenarioEntry[] = [
  {
    id: 'baseline',
    title: 'Baseline: moving sprites',
    description:
      'N textured sprites moving and rotating with no physics. Validates the harness and gives the renderer floor for each device.',
    task: 'CW-01.1',
    variants: [
      { label: '200', params: { count: 200 } },
      { label: '1000', params: { count: 1000 } },
      { label: '5000', params: { count: 5000 } },
    ],
    adapters: [],
  },
];

export interface BenchRun {
  key: string;
  scenario: string;
  adapter: string;
  params: Record<string, string | number>;
}

/** Flattens the matrix into one run per scenario, variant and adapter. */
export function benchRuns(): BenchRun[] {
  const runs: BenchRun[] = [];
  for (const s of MATRIX) {
    const adapters = s.adapters.length > 0 ? s.adapters : ['none'];
    for (const v of s.variants) {
      for (const adapter of adapters) {
        const suffix = adapter === 'none' ? '' : `-${adapter}`;
        runs.push({
          key: `${s.id}-${v.label}${suffix}`,
          scenario: s.id,
          adapter,
          params: { scenario: s.id, adapter, ...v.params },
        });
      }
    }
  }
  return runs;
}
