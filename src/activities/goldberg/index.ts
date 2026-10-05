// Floof Goldberg Machines: the child places and tunes chain-reaction parts, presses Play, and
// watches a fuzz roll through the machine into the gate. See src/activities/types.ts for the
// frozen contract. Built on the builder kit (src/kit/): this file only supplies the metadata and
// boots bootBuilderActivity with goldberg/spec.ts's CourseSpec.
import { bootBuilderActivity } from '../../kit/boot';
import { goldbergSpec } from './spec';
import type { ActivityDef, ActivityHandle, ActivityHost } from '../types';

export const goldberg: ActivityDef = {
  id: 'goldberg',
  title: 'Floof Goldberg Machines',
  icon: '⚙️',
  bruno: 'Push one thing and watch the whole chain go!',
  status: 'ready',
  plan: {
    objects: 'Fuzz, platform, ramp, domino run, seesaw, lever and a timed gate. Levels pre-place parts; intro levels only tune them.',
    child: 'Place and tune the parts, press Play and watch the chain reach the gate.',
    signals: 'Gate reached, parts that moved, elapsed time, part count.',
  },
  start(host: ActivityHost): ActivityHandle {
    return bootBuilderActivity(host, goldbergSpec, { sceneKey: 'goldberg', devGlobal: '__gapp' });
  },
};
