// Bridge Builder: the child places joints on the banks the level provides, draws rods between two
// points in road, wood, steel or cable, each with a cost and a strength, presses Play and watches
// the buggy try to cross without going over budget. See src/kit/types.ts for the frozen
// builder-kit contract and src/kit/boot.ts for the shared scene/HUD/controller boot.
import { bootBuilderActivity } from '../../kit/boot';
import { bridgeSpec } from './spec';
import type { ActivityDef, ActivityHandle, ActivityHost } from '../types';

export const bridge: ActivityDef = {
  id: 'bridge',
  title: 'Bridge Builder',
  icon: '🌉',
  bruno: 'Get the buggy across. Do not go over budget!',
  status: 'ready',
  plan: {
    objects: 'Anchor points on the banks placed by the level; joints the child adds; rods drawn between two points in road, wood, steel or cable, each with a cost and a strength.',
    child: 'Add joints, draw rods from point to point, pick a material per rod, then press Play for the load test.',
    signals: 'The buggy crossed, stress per rod by colour, rods that broke, cost spent.',
  },
  start: (host: ActivityHost): ActivityHandle =>
    bootBuilderActivity(host, bridgeSpec, { sceneKey: 'bridge', devGlobal: '__bapp' }),
};
