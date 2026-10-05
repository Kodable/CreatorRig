// Catapults: the child sets power, angle and arm length and picks a fuzz, then launches within a
// shot budget to knock down cans, block towers and shelves — sometimes chasing a bullseye. See
// src/kit/types.ts for the frozen builder-kit contract and src/kit/boot.ts for the shared
// scene/HUD/controller boot.
import { bootBuilderActivity } from '../../kit/boot';
import { catapultSpec } from './spec';
import type { ActivityDef, ActivityHandle, ActivityHost } from '../types';

export const catapult: ActivityDef = {
  id: 'catapult',
  title: 'Catapults',
  icon: '🏹',
  bruno: 'Set the arm, pick the power, knock it all down!',
  status: 'ready',
  plan: {
    objects: 'One catapult with power, angle, fuzz (five, each its own weight) and arm length. Cans, block towers, shelves, walls and a bullseye placed by the level.',
    child: 'Tune the catapult (some settings are locked per level), launch, watch, and launch again within the shot budget.',
    signals: 'Targets knocked down, bullseye hits, shots used, distance.',
  },
  start: (host: ActivityHost): ActivityHandle =>
    bootBuilderActivity(host, catapultSpec, { sceneKey: 'catapult', devGlobal: '__capp' }),
};
