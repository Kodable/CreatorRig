// Vehicle Obstacle Course (Marstopia rover): the child builds a rover onto Kevin's glass dome,
// sticking wheels, fans, stoves, jets and weights anywhere around it on suction cups or springs
// within a coin budget, presses DRIVE and watches it drive itself over Mars terrain toward the
// beacon. See src/kit/types.ts for the frozen builder-kit contract and src/kit/boot.ts for the
// shared scene/HUD/controller boot.
import { bootBuilderActivity } from '../../kit/boot';
import { vehicleSpec } from './spec';
import type { ActivityDef, ActivityHandle, ActivityHost } from '../types';

export const vehicle: ActivityDef = {
  id: 'vehicle',
  title: 'Marstopia Rover',
  icon: '🚗',
  bruno: 'Build Kevin a rover! Wheels, jets, watermelons... stick them anywhere!',
  status: 'ready',
  plan: {
    objects: "Kevin's glass dome (placed by the level) and the parts the child sticks on it: round/square/star wheels, fan/stove/jet, feather/beans/watermelon, each on a suction cup or a spring, each with a coin cost. Terrain, a boulder and the beacon are placed by the level.",
    child: 'Spend the coins on parts, drag them anywhere around the dome, press DRIVE and watch the rover behave.',
    signals: 'Reached the beacon, time, flips, distance, meters driven upside down, top speed, coins spent.',
  },
  start: (host: ActivityHost): ActivityHandle =>
    bootBuilderActivity(host, vehicleSpec, { sceneKey: 'vehicle', devGlobal: '__vapp' }),
};
