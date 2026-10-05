// The CourseSpec that drives the builder kit for Floof Goldberg Machines: level/catalog data,
// the sim factory and the HUD/world/role tables the old GoldbergHud and GoldbergScene hardcoded.
import type { CourseSpec, RoleRenderer } from '../../kit/types';
import { CATALOG, defaultProps, PART_LIMIT } from './core/catalog';
import { LEVELS } from './core/levels';
import { createGoldbergSim } from './core/sim';
import type { GoldbergLevel, Metrics, Outcome, PartKind } from './core/types';

function fmt1(v: number): string {
  return v.toFixed(1);
}
// Whole-number goal targets ("15", "18") print without a decimal; anything else keeps one.
function fmtTarget(v: number): string {
  return Number.isInteger(v) ? String(v) : fmt1(v);
}

const PART_INFO: Record<PartKind, { label: string; icon: string }> = {
  fuzz: { label: 'Fuzz', icon: '🔵' },
  platform: { label: 'Platform', icon: '▬' },
  ramp: { label: 'Ramp', icon: '◢' },
  domino: { label: 'Dominoes', icon: '▮▮' },
  seesaw: { label: 'Seesaw', icon: '⚖' },
  lever: { label: 'Lever', icon: '⟋' },
  gate: { label: 'Gate', icon: '🏁' },
};

// The property panel is squeezed to 22px-tall chips, so long option labels/values
// (from the seesaw's fulcrumPos/startState/hook descriptors) get a short display form.
// Only the on-screen text changes — the value sent to setProp is always opt.value.
const CHIP_LABELS: Record<string, string> = {
  MidLeft: 'Mid-L',
  'Mid Left': 'Mid-L',
  MidRight: 'Mid-R',
  'Mid Right': 'Mid-R',
  RightDown: 'R down',
  'Right Down': 'R down',
  LeftDown: 'L down',
  'Left Down': 'L down',
  Balanced: 'Level',
};

const ROLES: Record<string, RoleRenderer> = {
  fuzz: { texture: { key: 'fuzz', url: 'blueFuzz_idle.png', scale: 1.25 } },
  sensor: { fill: () => ({ color: 0x61bb46, alpha: 0.35 }), decorate: 'flag' },
  door: { decorate: 'stripe' },
};

export const goldbergSpec: CourseSpec<PartKind, Metrics, Outcome, GoldbergLevel> = {
  id: 'goldberg',
  levels: LEVELS,
  catalog: CATALOG,
  defaultProps,
  partLimit: PART_LIMIT,
  createSim: (parts) => createGoldbergSim(parts),
  editMetrics: (parts) => ({ reachedGate: 0, elapsed: 0, partsMoved: 0, partCount: parts.length, maxSpeed: 0 }),
  canPlay: (parts) => parts.some((p) => p.kind === 'fuzz'),
  passed: (outcome, goalsPass, level) => goalsPass && (level.goals.length > 0 || outcome === 'reachedGate'),
  spawn: { x: 15, y: 7.5 },
  world: { worldW: 30, worldH: 15, ppm: 32 },
  roles: ROLES,
  hud: {
    partInfo: PART_INFO,
    chipLabels: CHIP_LABELS,
    meters: [
      { id: 'meter-elapsed', label: 'Elapsed', metric: 'elapsed', format: (v) => `${fmt1(v)} s` },
      { id: 'meter-partsMoved', label: 'Parts moved', metric: 'partsMoved', format: (v) => `${Math.round(v)}` },
      { id: 'meter-parts', label: 'Parts', metric: 'partCount', format: (v) => `${Math.round(v)}` },
      { id: 'meter-speed', label: 'Top speed', metric: 'maxSpeed', format: (v) => `${fmt1(v)} m/s` },
    ],
    goalValueText: (goal, current) => {
      switch (goal.metric) {
        case 'reachedGate':
          return current >= 1 ? 'yes' : 'not yet';
        case 'elapsed':
          return `${fmt1(current)} of ${fmtTarget(goal.value)} s`;
        case 'partsMoved':
          return `${Math.round(current)} of ${Math.round(goal.value)} parts`;
        case 'partCount':
          return `${Math.round(current)} of ${Math.round(goal.value)} parts`;
        case 'maxSpeed':
          return `${fmt1(current)} of ${fmtTarget(goal.value)} m/s`;
        default:
          return `${fmt1(current)} of ${fmtTarget(goal.value)}`;
      }
    },
    barlessMetrics: ['reachedGate'],
    lines: {
      play: 'Go, fuzz, go!',
      pass: 'Machine complete! Great engineering!',
      doneNotPassed: 'The fuzz made it! Now check the goals.',
      freePlay: 'Build anything you like!',
    },
    failOutcomes: ['tooEarly', 'settled', 'timeout'],
  },
};
