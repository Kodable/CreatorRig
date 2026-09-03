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
  /** A human drives this variant on a device; the headless bench skips it. */
  manual?: boolean;
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
  {
    id: 'physics-smoke',
    title: 'Physics smoke: bodies in a bowl',
    description:
      'N circles and boxes dropped into a chain-shape bowl through the physics interface. Proves each adapter loads in the browser and shows the transform hash.',
    task: 'CW-01.2',
    variants: [
      { label: '100', params: { count: 100 } },
      { label: '300', params: { count: 300 } },
    ],
    adapters: ['box2d', 'rapier'],
  },
  {
    id: 'bodies',
    title: 'Bodies: rain into a bowl',
    description: 'N dynamic circles and boxes rain into a chain bowl. The count where a device drops under 30 fps is its live-object cap.',
    task: 'CW-01.3',
    variants: [
      { label: '200', params: { count: 200 } },
      { label: '500', params: { count: 500 } },
      { label: '1000', params: { count: 1000 } },
    ],
    adapters: ['box2d', 'rapier'],
  },
  {
    id: 'stack',
    title: 'Stack: tower at rest',
    description: 'A tower of N unit boxes must stand still. Reports the drift of the top box; pass is under 0.5 m and no topple.',
    task: 'CW-01.3',
    variants: [
      { label: '20', params: { count: 20 } },
      { label: '30', params: { count: 30 } },
      { label: '40', params: { count: 40 } },
      { label: '40-sub8', params: { count: 40, substeps: 8 } },
      { label: '50', params: { count: 50 } },
    ],
    adapters: ['box2d', 'rapier'],
  },
  {
    id: 'joints',
    title: 'Joints: motor carts and a breakable bridge',
    description: 'N motorized carts drive inside a chain arena while heavy balls load a plank bridge of breakable spring rods. Pass: wheel joints hold. substeps=8 stiffens Box2D joints; stiff=1 raises its joint hertz.',
    task: 'CW-01.3',
    variants: [
      { label: '100', params: { count: 100 } },
      { label: '100-sub8', params: { count: 100, substeps: 8 } },
    ],
    adapters: ['box2d', 'rapier'],
  },
  {
    id: 'ccd',
    title: 'Continuous collision: ball vs 1 px wall',
    description: 'A 6 cm ball at 90 m/s is fired N times at a wall 1 cm thick. Pass: zero tunnels. bullet=0 turns continuous collision off for comparison; resume=1 starts every launch with a fake 2,000 ms frame (app switch) through the clamped accumulator.',
    task: 'CW-01.3',
    variants: [
      { label: '1000', params: { count: 1000 } },
      { label: '1000-nobullet', params: { count: 1000, bullet: 0 } },
      { label: '1000-resume', params: { count: 1000, resume: 1 } },
    ],
    adapters: ['box2d', 'rapier'],
  },
  {
    id: 'catapult',
    title: 'Catapult: hinge, spring, motor, stack',
    description: 'A hinged arm with a spring launches a ball into a stack of boxes. Sanity check for limits, motors, springs and contact events together.',
    task: 'CW-01.3',
    variants: [{ label: '30', params: { count: 30 } }],
    adapters: ['box2d', 'rapier'],
  },
  {
    id: 'determinism',
    title: 'Determinism: replay hash',
    description:
      'A seeded coaster scene (200 bodies, 30 joints, one motor) steps 3,000 fixed steps as fast as the frame budget allows, hashes every transform, then runs again. Compare the big hash across devices; pass means the two runs in this browser agree.',
    task: 'CW-01.4',
    variants: [{ label: '200', params: { count: 200, duration: 15 } }],
    adapters: ['box2d', 'rapier'],
  },
  {
    id: 'particles',
    title: 'Particles: additive emitters over the bowl',
    description:
      'N live additive particles over the 200-body bowl scene. The largest count that holds 30 fps, divided by 4, is the per-effect cap. 5x500 spreads 2,500 particles over 5 emitters, the way effects are used.',
    task: 'CW-01.5',
    variants: [
      { label: '1000', params: { count: 1000 } },
      { label: '5000', params: { count: 5000 } },
      { label: '20000', params: { count: 20000 } },
      { label: '5x500', params: { count: 2500, emitters: 5 } },
    ],
    adapters: ['box2d'],
  },
  {
    id: 'sprites',
    title: 'Sprites: Creator item atlas',
    description: 'N images from the real Creator item atlas (one 2048 page) moving and rotating. Reports draw calls per frame.',
    task: 'CW-01.6',
    variants: [
      { label: '500', params: { count: 500 } },
      { label: '2000', params: { count: 2000 } },
    ],
    adapters: [],
  },
  {
    id: 'spine',
    title: 'Spine: Floof skeletons',
    description: 'N Floof skeletons (Spine 4.2 export, spine-phaser-v4 4.2 runtime) looping their idle animations in a grid. The count that holds 30 fps is the skeleton budget.',
    task: 'CW-01.6',
    variants: [
      { label: '10', params: { count: 10 } },
      { label: '30', params: { count: 30 } },
      { label: '60', params: { count: 60 } },
    ],
    adapters: [],
  },
  {
    id: 'textures',
    title: 'Textures: raw PNG vs KTX',
    description: 'The 2048x1536 backdrop and the item atlas, raw and compressed (KTX), side by side. Reports GPU bytes per texture. auto lets the GPU pick; astc, etc2 and s3tc force one format.',
    task: 'CW-01.6',
    variants: [
      { label: 'auto', params: {} },
      { label: 'astc', params: { format: 'ASTC' } },
      { label: 'etc2', params: { format: 'ETC' } },
      { label: 's3tc', params: { format: 'S3TC' } },
    ],
    adapters: [],
  },
  {
    id: 'overlay',
    title: 'Editor overlay: React panels and DOM gizmo over Phaser',
    description:
      'A React rail, a 20-input properties panel, an object list and a DOM gizmo over 60 atlas sprites. Measures frame time while dragging, pointer-to-frame latency, gizmo drift during zoom and pan, React commits and long tasks. robot variants drive it; manual is for fingers on a device.',
    task: 'CW-01.7',
    variants: [
      { label: 'robot', params: { count: 60, robot: 1 } },
      { label: 'robot-noflush', params: { count: 60, robot: 1, flush: 0 } },
      { label: 'robot-imperative', params: { count: 60, robot: 1, gizmo: 'imperative' } },
      { label: 'manual', params: { count: 60 }, manual: true },
      { label: 'manual-imperative', params: { count: 60, gizmo: 'imperative' }, manual: true },
    ],
    adapters: [],
  },
  {
    id: 'soak',
    title: 'Soak: play scene left running',
    description: '200 bodies, 1,000 additive particles from 5 emitters and 10 Floof skeletons. Samples the JS heap where the browser exposes it and notices a reload or a memory kill. 10min is the device run.',
    task: 'CW-01.8',
    variants: [
      { label: '1min', params: { count: 200, duration: 60, sampleEvery: 10 } },
      { label: '10min', params: { count: 200, duration: 600, sampleEvery: 30 }, manual: true },
    ],
    adapters: ['box2d'],
  },
  {
    id: 'audio',
    title: 'Audio: Web Audio unlock on Safari',
    description: 'Tap to play a beep; background and resume; trigger an interruption (Siri, timer) and come back. Reports what played.',
    task: 'CW-01.8',
    variants: [{ label: 'tap', params: { duration: 60 }, manual: true }],
    adapters: [],
  },
  {
    id: 'fonts',
    title: 'Fonts: text before and after fonts.ready',
    description: 'A Kodable-font text created before the font loads and one after. Reports whether the first baked fallback glyphs, which sets the runtime rule.',
    task: 'CW-01.8',
    variants: [{ label: 'kodable', params: { duration: 3 } }],
    adapters: [],
  },
  {
    id: 'pwa',
    title: 'PWA: standalone and service worker',
    description: 'Reports display mode, service worker state and cached entries. Run it from the Home Screen icon on the iPad.',
    task: 'CW-01.8',
    variants: [{ label: 'check', params: { duration: 2 } }],
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
      if (v.manual) continue;
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
