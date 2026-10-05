// Bridge Builder spec: the child places joints on the banks the level provides, draws rods
// between two points in road, wood, steel or cable, each with a cost and a strength, then presses
// Play and watches the buggy try to cross. See src/kit/types.ts for the frozen CourseSpec contract
// this course plugs into.
import type { CourseSpec, RenderItem } from '../../kit/types';
import type { PartKind, Material, Metrics, Outcome, BridgeLevel } from './core/types';
import { PART_LIMIT, CATALOG, defaultProps, totalCost } from './core/catalog';
import { canAddPart, normalizeParts, makeJoint, makeRod } from './core/rules';
import { createBridgeSim } from './core/sim';
import { LEVELS } from './core/levels';

export const bridgeSpec: CourseSpec<PartKind, Metrics, Outcome, BridgeLevel> = {
  id: 'bridge',
  levels: LEVELS,
  catalog: CATALOG,
  defaultProps,
  partLimit: PART_LIMIT,

  createSim: (parts, level) => createBridgeSim(parts, level),

  tools: [
    { id: 'move', label: 'Move', icon: '✋', kind: 'move' },
    { id: 'road', label: 'Road', icon: '🛣', kind: 'link' },
    { id: 'wood', label: 'Wood', icon: '🪵', kind: 'link' },
    { id: 'steel', label: 'Steel', icon: '🔩', kind: 'link' },
    { id: 'cable', label: 'Cable', icon: '🧵', kind: 'link' },
  ],
  grid: 0.5,

  // A rod drawn from anywhere to anywhere: each end that is not an existing point gets a new
  // joint at the snapped grid point (Poly Bridge style), so there is no separate Joint tool.
  linkWithTool: (tool, from, to, parts, _level, allocId) => {
    if (!(['road', 'wood', 'steel', 'cable'] as string[]).includes(tool)) return null;
    const isNode = (p: { kind: string }): boolean => p.kind === 'anchor' || p.kind === 'joint';
    const added: ReturnType<typeof makeJoint>[] = [];
    const resolve = (end: { partId: number | null; at: { x: number; y: number } }): number => {
      if (end.partId != null) {
        const hit = parts.find((p) => p.id === end.partId);
        if (hit && isNode(hit)) return hit.id;
      }
      const near = [...parts, ...added].find(
        (p) => isNode(p) && Math.abs(p.x - end.at.x) < 0.01 && Math.abs(p.y - end.at.y) < 0.01,
      );
      if (near) return near.id;
      const joint = makeJoint(end.at);
      joint.id = allocId();
      added.push(joint);
      return joint.id;
    };
    const a = resolve(from);
    const b = resolve(to);
    if (a === b) return null;
    return [...added, makeRod(tool as Material, a, b)];
  },

  normalizeParts,
  canAdd: canAddPart,

  editMetrics: (parts) => ({
    crossed: 0,
    rodsBroken: 0,
    cost: totalCost(parts),
    maxStress: 0,
    time: 0,
  }),

  canPlay: (parts) => parts.some((p) => p.kind === 'rod'),

  passed: (outcome, goalsPass) => outcome !== 'running' && goalsPass,

  spawn: { x: 15, y: 8 },
  writeBackSettled: true,
  world: { worldW: 30, worldH: 15, ppm: 32 },

  roles: {
    rider: { texture: { key: 'fuzz', url: 'blueFuzz_idle.png', scale: 1.25 } },
    anchor: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
    joint: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
    deck: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
    slider: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
    bank: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
    chassis: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
    wheel: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
    axle: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
  },

  hud: {
    partInfo: {
      anchor: { label: 'Anchor', icon: '📍' },
      joint: { label: 'Joint', icon: '⚪' },
      rod: { label: 'Rod', icon: '➖' },
    },
    chipLabels: {
      road: 'Road',
      wood: 'Wood',
      steel: 'Steel',
      cable: 'Cable',
    },
    meters: [
      {
        id: 'meter-crossed',
        label: 'Crossed',
        metric: 'crossed',
        format: (v) => (v >= 1 ? 'yes' : 'not yet'),
      },
      {
        id: 'meter-cost',
        label: 'Cost',
        metric: 'cost',
        format: (v, m, live) => `${Math.round(v)}`,
      },
      {
        id: 'meter-broken',
        label: 'Rods broken',
        metric: 'rodsBroken',
        format: (v) => `${Math.round(v)}`,
      },
      {
        id: 'meter-stress',
        label: 'Max stress',
        metric: 'maxStress',
        format: (v) => `${Math.round(v * 100)} %`,
      },
    ],
    goalValueText: (goal, current) => {
      switch (goal.metric) {
        case 'crossed':
          return current >= 1 ? 'yes' : 'not yet';
        case 'cost':
          return `${Math.round(current)} of budget`;
        case 'rodsBroken':
          return `${Math.round(current)} of max`;
        case 'maxStress':
          return `${Math.round(current * 100)} % of ${Math.round(goal.value * 100)} %`;
        case 'time':
          return `${current.toFixed(1)} of ${goal.value.toFixed(1)} s`;
        default:
          return `${current} of ${goal.value}`;
      }
    },
    barlessMetrics: ['crossed'],
    lines: {
      play: 'Easy does it, fuzz!',
      pass: 'It holds! Fuzz engineering!',
      doneNotPassed: 'The buggy made it. Now check the goals.',
      freePlay: 'Build any bridge you like!',
      refused: 'That rod is too long, a duplicate, or over budget.',
    },
    failOutcomes: ['fell', 'stuck', 'timeout'],
  },
};
