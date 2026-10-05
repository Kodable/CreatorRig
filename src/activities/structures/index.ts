// Structural Stability: the child stacks blocks and beams, puts a fuzz on top, then presses
// Play and watches the shaker, the wind or the blast. See src/kit/types.ts for the frozen
// builder-kit contract and src/kit/boot.ts for the shared scene/HUD/controller boot.
import { bootBuilderActivity } from '../../kit/boot';
import { structuresSpec } from './spec';
import type { ActivityDef, ActivityHandle, ActivityHost } from '../types';

export const structures: ActivityDef = {
  id: 'structures',
  title: 'Structural Stability',
  icon: '🧱',
  bruno: 'Build it tall. Then the shaker comes!',
  status: 'ready',
  plan: {
    objects: 'Blocks and beams in wood, brick or steel, and a fuzz on top. Touching parts glue together.',
    child: 'Stack and tune the parts, put the fuzz up high, press Play and watch the shaker, the wind or the blast.',
    signals: 'Fuzz height, survival time, parts that fell, part count.',
  },
  start: (host: ActivityHost): ActivityHandle =>
    bootBuilderActivity(host, structuresSpec, { sceneKey: 'structures', devGlobal: '__sapp' }),
};
