// Vehicle Obstacle Course (Planet Rover): the child builds a rover onto Kevin's glass dome,
// sticking wheels, fans, stoves, jets and weights anywhere around it on suction cups or springs
// within a coin budget, presses DRIVE and watches it drive itself toward the beacon across three
// planets: Flooftopia (the intros), Mars and Europa (2026-10-09, Gao: "i want to introduce more
// planets, so we cant call it mars rover specifically anymore"). See src/kit/types.ts for the frozen builder-kit contract and src/kit/boot.ts for the
// shared scene/HUD/controller boot.
import { bootBuilderActivity } from '../../kit/boot';
import { vehicleSpec } from './spec';
import type { ActivityDef, ActivityHandle, ActivityHost } from '../types';

export const vehicle: ActivityDef = {
  id: 'vehicle',
  title: 'Planet Rover',
  icon: '🚗',
  bruno: 'Build Kevin a rover and drive it on other planets!',
  status: 'ready',
  plan: {
    objects: "Kevin's glass dome (placed by the level) and the parts the child sticks on it: round/square/star wheels, fan/stove/jet, feather/beans/watermelon, each on a suction cup or a spring, each with a coin cost. The planet (gravity, sky), the terrain and its ground (grass, rock, sand, ice, rocks in sand), a boulder and the beacon are set by the level.",
    child: 'Spend the coins on parts, drag them anywhere around the dome, press DRIVE and watch the rover behave.',
    signals: 'Reached the beacon, time, flips, distance, meters driven upside down, top speed, coins spent.',
  },
  start: (host: ActivityHost): ActivityHandle =>
    bootBuilderActivity(host, vehicleSpec, { sceneKey: 'vehicle', devGlobal: '__vapp' }),
};
