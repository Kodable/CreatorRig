// Structural Stability course spec: the child stacks blocks and beams, puts a fuzz on top,
// then presses Play and watches the shaker, the wind or the blast. See src/kit/types.ts for the
// frozen CourseSpec contract this course plugs into.
import type { CourseSpec, RenderItem } from '../../kit/types';
import type { PartKind, Metrics, Outcome, StructuresLevel } from './core/types';
import { PART_LIMIT, CATALOG, defaultProps } from './core/catalog';
import { createStructuresSim } from './core/sim';
import { LEVELS } from './core/levels';

export const structuresSpec: CourseSpec<PartKind, Metrics, Outcome, StructuresLevel> = {
  id: 'structures',
  levels: LEVELS,
  catalog: CATALOG,
  defaultProps,
  partLimit: PART_LIMIT,

  createSim: (parts, level) => createStructuresSim(parts, level),

  editMetrics: (parts, _level, sim) => {
    const fuzz = parts.find((p) => p.kind === 'fuzz');
    let fuzzHeight = 0;
    if (fuzz) {
      const settled = sim?.settledPositions?.();
      const pos = settled?.get(fuzz.id);
      fuzzHeight = pos ? pos.y : fuzz.y;
    }
    return { fuzzHeight, survivalTime: 0, partsFell: 0, partCount: parts.length, topHeight: 0 };
  },

  canPlay: (parts, level, sim) => {
    const fuzz = parts.find((p) => p.kind === 'fuzz');
    if (!fuzz) return false;
    const settled = sim?.settledPositions?.();
    const y = settled?.get(fuzz.id)?.y ?? fuzz.y;
    return y >= level.keepAbove + 0.2;
  },

  passed: (outcome, goalsPass, level) => goalsPass && (level.goals.length > 0 || outcome === 'survived'),

  spawn: { x: 12, y: 6 },
  resolveOverlaps: true,
  writeBackSettled: true,
  world: { worldW: 24, worldH: 12, ppm: 40 },

  roles: {
    fuzz: { texture: { key: 'fuzz', url: 'blueFuzz_idle.png', scale: 1.25 } },
    // Material decoration (plank / brick texture) depends on the part's material, which
    // RenderItem doesn't carry (only a resolved colour). Flat fill for now; per-material
    // decoration is a follow-up once RenderItem (or the role lookup) carries material.
    block: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
    beam: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
    ground: { fill: () => ({ color: 0x5a3d1e, alpha: 1 }) },
    wall: {},
  },

  hud: {
    partInfo: {
      block: { label: 'Block', icon: '🧱' },
      beam: { label: 'Beam', icon: '▬' },
      fuzz: { label: 'Fuzz', icon: '🔵' },
    },
    chipLabels: {
      '1x1': '1 x 1',
      '2x1': '2 wide',
      '1x2': '2 tall',
      wood: 'Wood',
      brick: 'Brick',
      steel: 'Steel',
    },
    meters: [
      { id: 'meter-height', label: 'Fuzz height', metric: 'fuzzHeight', format: (v) => `${v.toFixed(1)} m` },
      { id: 'meter-survived', label: 'Survived', metric: 'survivalTime', format: (v) => `${v.toFixed(1)} s` },
      { id: 'meter-fell', label: 'Parts fell', metric: 'partsFell', format: (v) => `${Math.round(v)}` },
      { id: 'meter-parts', label: 'Parts', metric: 'partCount', format: (v) => `${Math.round(v)}` },
    ],
    goalValueText: (goal, current) => {
      switch (goal.metric) {
        case 'fuzzHeight':
          return `${current.toFixed(1)} of ${goal.value.toFixed(1)} m`;
        case 'survivalTime':
          return `${current.toFixed(1)} of ${goal.value.toFixed(1)} s`;
        case 'partsFell':
          return `${Math.round(current)} of ${Math.round(goal.value)}`;
        case 'partCount':
          return `${Math.round(current)} of ${Math.round(goal.value)} parts`;
        case 'topHeight':
          return `${current.toFixed(1)} of ${goal.value.toFixed(1)} m`;
        default:
          return `${current} of ${goal.value}`;
      }
    },
    barlessMetrics: [],
    lines: {
      play: 'Hold on, fuzz!',
      pass: 'It stands! Great building!',
      doneNotPassed: 'It survived! Now check the goals.',
      freePlay: 'Build anything you like!',
    },
    failOutcomes: ['collapsed'],
  },
};
