// Flooftopia (2026-10-09): the five intro levels, one new thing each (the palette is the gate;
// the Mount row unlocks with `introduces: ['mount']`, and each intro's `part:<kind>` entries play
// the shelf's unlock callout for the parts it adds). Gao, 2026-10-09: "i want the introduction
// levels to be on flooftopia, which is like earth but for the floofs". Flooftopia's gravity is
// the course's old 10 m/s^2 and its ground is grass with the old ground friction, so these are
// the 2026-10-02 intros unchanged in physics (same terrain, budget, palette and solution; tuned
// then by simulating every sensible build, see the comments on each); only the words moved from
// Mars to Flooftopia. The coach (../../coach.ts) walks the taps on all five.
import { flat, withCobbles, withHill, withStairs } from '../terrain';
import type { VehicleLevel } from '../types';
import { ALL_WHEELS, POWER, WEIGHTS, WHEELS, boulderAt, level, unlock } from './shared';

export const FLOOFTOPIA_LEVELS: VehicleLevel[] = [
  // 1. wheels ----------------------------------------------------------------------------------
  // A gentle 1.2 m hill. Two round wheels (the default spots, -45 and -135 degrees) climb it;
  // square wheels are too slow and stall on it; one wheel alone tips onto the dome and sticks.
  level({
    id: 'wheels',
    planet: 'flooftopia',
    title: 'Grassy hill',
    // 2026-10-05 playtest review (Jon): the coach (../coach.ts) carries the taps (BUILD, a Round
    // wheel, another, DRIVE); Bruno's line just sets the scene. 2026-10-09: and welcomes the child
    // to Flooftopia, where the intros now are.
    bruno: "Welcome to Flooftopia! Kevin's rover needs wheels. Let's add some!",
    terrain: withHill(flat(), 11, 17, 1.2),
    budget: 4,
    extentW: 30,
    palette: WHEELS,
    introduces: unlock('wheels'),
    hints: [
      'A dome with no wheels just sits there. Wheels make it roll!',
      'Each wheel costs coins. Round wheels cost 2, square wheels cost 1.',
      'Stick two round wheels on the bottom of the dome, one at the front and one at the back.',
    ],
    failHints: {
      stuck: 'The rover is stuck. Does it have wheels touching the ground? Try one at the front AND one at the back.',
    },
    solution: [
      ['wheelCircle', -45],
      ['wheelCircle', -135],
    ],
  }),

  // 2. shape -----------------------------------------------------------------------------------
  level({
    id: 'shape',
    planet: 'flooftopia',
    title: 'Stone steps',
    bruno: 'Stone steps ahead! Build your rover and tap DRIVE to try them.',
    terrain: withStairs(flat(), 12, 4, 0.15, 0.6),
    budget: 6,
    extentW: 30,
    // Every round layout trips over the first step and flips (rigid, at 6 m/s); every star layout
    // climbs. Square wheels climb too (slowly), so this intro compares round with star only.
    palette: ['wheelCircle', 'wheelStar'],
    introduces: unlock('shape'),
    hints: [
      'Round wheels roll fast, so they trip over the first step and tip over.',
      'Try the new star wheels. Their points hook onto each step.',
      'Two star wheels on the bottom of the dome climb right up.',
    ],
    failHints: {
      stuck: 'Stuck at the steps! Try a wheel shape that can grab the stone.',
    },
    solution: [
      ['wheelStar', -45],
      ['wheelStar', -135],
    ],
  }),

  // 3. mount -----------------------------------------------------------------------------------
  level({
    id: 'mount',
    planet: 'flooftopia',
    title: 'Bumpy road',
    bruno: 'A bumpy dirt road! Build your rover, tap DRIVE and watch the wheels.',
    terrain: withCobbles(flat(), 8, 18, 0.15, 0.6),
    budget: 6,
    extentW: 30,
    // Every rigid layout (2 or 3 round wheels) bounces over; every spring layout rolls through.
    // Round wheels only: square and star wheels crawl over the bumps on suction cups, which
    // would hide the lesson (springs soak up bumps).
    palette: ['wheelCircle'],
    introduces: unlock('mount'),
    hints: [
      'Stiff wheels bounce on every bump.',
      'Tap a wheel on your rover, then pick the spring in the drawer. A spring costs 1 more coin.',
      'Two round wheels on springs soak up the bumps.',
    ],
    failHints: {
      stuck: 'Did the bumps tip it over? Try putting the wheels on springs. Springs soak up bumps.',
    },
    solution: [
      ['wheelCircle', -45, 'spring'],
      ['wheelCircle', -135, 'spring'],
    ],
  }),

  // 4. weight ----------------------------------------------------------------------------------
  // The boulder (1.6 x 1.2 m, 3.8 kg) is too heavy for bare wheels: the front wheel jams against
  // it. A watermelon on the front (anywhere from 15 degrees below the nose to 10 above) rams it
  // all the way past the beacon; beans or a feather there do not (simulated, see levels.test).
  level({
    id: 'weight',
    planet: 'flooftopia',
    title: 'Boulder push',
    bruno: 'A boulder blocks the path! Build your rover and DRIVE into it.',
    terrain: flat(),
    budget: 7,
    extentW: 30,
    palette: [...ALL_WHEELS, ...WEIGHTS],
    introduces: unlock('weight'),
    finishX: 17,
    scenery: (terrain) => [boulderAt(terrain, 3, 14, '1.6x1.2', 'rock')],
    hints: [
      'Wheels alone just bump into the boulder and stop.',
      'Try a feather, then beans, then a watermelon on the front of the dome. Which one shoves the boulder?',
      'The watermelon is the heaviest. Stick it on the front, level with Kevin, and ram the boulder away.',
    ],
    failHints: {
      stuck: 'The boulder will not budge. Ram it with something heavier on the front!',
    },
    solution: [
      ['wheelCircle', -45],
      ['wheelCircle', -135],
      ['watermelon', 0],
    ],
  }),

  // 5. power -----------------------------------------------------------------------------------
  // A 2.5 m hill over 6 m (53 degrees at its steepest): every wheels-only build slips back or
  // flips (2-4 round wheels, stars). A fan or a stove on the back (180 or +/-150 degrees) pushes
  // it over; a jet is too strong (it flies off the crest) and too dear with round wheels. (It was
  // Mars's "Crater rim" until 2026-10-09; same hill, same physics.)
  level({
    id: 'power',
    planet: 'flooftopia',
    title: 'Big hill',
    bruno: 'This hill is SO steep! Build your rover and try to DRIVE up.',
    terrain: withHill(flat(), 10, 16, 2.5),
    budget: 8,
    extentW: 30,
    palette: [...ALL_WHEELS, ...WEIGHTS, ...POWER],
    introduces: unlock('power'),
    hints: [
      'Wheels slip on a hill this steep, even with more of them.',
      'A fan, a stove or a jet pushes the rover away from where it is stuck on.',
      'Put a fan on the back of the dome. It pushes the rover forward, up the hill.',
    ],
    failHints: {
      stuck: 'The wheels slip on the hill. Stick something on the back to push!',
    },
    solution: [
      ['wheelCircle', -45],
      ['wheelCircle', -135],
      ['fan', 180],
    ],
  }),
];
