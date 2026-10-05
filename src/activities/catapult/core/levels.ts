// Fuzz Fling: "Bruno's carnival stall." The child tunes a catapult (power, angle, fuzz, arm),
// presses Launch, and flings fuzzes at cans, block towers and a bullseye. Units are meters, y up,
// ground top at y = 0, world 30 x 15 m, walls at x 0 and 30. See core/types.ts for the frozen
// shapes and core/sim.ts for how a shot resolves.
//
// Every solution below (and every preset's failure) was tuned against the live sim
// (`createCatapultSim`) with `npx vitest run src/activities/catapult/core/levels.test.ts`,
// not derived from the reference range table alone: release-point geometry (pivot =
// (part.x - 0.6, part.y + 0.6), tip = pivot + L*(cos theta, sin theta)) plus real ballistic flight
// (rolling resistance now only applies once the fuzz is in contact with something, matching the
// plan) put targets and catapult x positions a bit off the plan's own back-of-envelope guesses in
// a few places - see the final report for exactly where and why.
//
// Stakeholder direction 2026-09-22: introduce one new mechanic at a time up front, then a run of
// challenge levels that mix everything. `introduces` (see kit/types.ts's Level doc comment) names
// the property codes each intro level unlocks; the kit hides any drawer row / widget whose code
// isn't known yet (the union of every earlier level's `introduces`) and keeps that prop at its
// default. Order: power, angle, weight (unlocks the fuzz row: Flower, Fur, Helmet, Metal), arm, move
// (no new code - the mechanic is dragging the catapult itself), donut (unlocks the Donut option,
// `fuzz:Donut`) - then the challenge run: both, cans, tower, line, chain, pyramid, towers, wall,
// dominoes, free, none of which introduce anything new.
//
// Stakeholder direction 2026-10-01: the old weight row (Light/Medium/Heavy) and fuzz row (Blue/
// Prism) merged into one Fuzz row. Every level's props moved over with identical physics: Light ->
// Flower, Medium -> Fur, Heavy -> Metal (same radius and density), Blue -> nothing (only the Donut
// splits now); the old Prism level became the Donut's, re-tuned for the Donut's own numbers.
import { defaultProps } from './catalog';
import type { CatapultLevel, PlacedPart } from './types';

const TARGET_ICON = '🎯';

/** A locked, position-locked block (the stack levels 12-15 are built from these). */
function stackBlock(id: number, x: number, y: number, size = '1x1', material = 'wood'): PlacedPart {
  return { id, kind: 'block', x, y, props: { ...defaultProps('block'), size, material }, locked: true, lockPosition: true };
}

/** The stack levels' catapult: x = 5, everything free, with the given props over the defaults. */
function stackCatapult(props: Record<string, string>): PlacedPart {
  return { id: 1, kind: 'catapult', x: 5, y: 0, props: { ...defaultProps('catapult'), ...props }, locked: true, lockPosition: true };
}

/** Every stack level starts on the same soft toss (Low, 45 degrees, Flower) that never reaches. */
const STACK_PRESET = { power: 'Low', angle: '45', fuzz: 'Flower' };

const LINE_COLOR = 0xffc629;

/** 12. A 3-2-1 wood pyramid centered at x = 13, two blocks balanced half-off its peak. */
function pyramidStack(): PlacedPart[] {
  const x = 13;
  return [
    stackBlock(2, x - 1, 0.5), stackBlock(3, x, 0.5), stackBlock(4, x + 1, 0.5),
    stackBlock(5, x - 0.5, 1.5), stackBlock(6, x + 0.5, 1.5),
    stackBlock(7, x, 2.5),
    stackBlock(8, x - 0.5, 3.5), stackBlock(9, x + 0.5, 3.5),
  ];
}

/** 13. Two wood towers (1x2 post + 1x1) at x = 15, a 2x1 plank across, a block on each plank end. */
function towersStack(): PlacedPart[] {
  const x = 15;
  return [
    stackBlock(2, x - 0.75, 1, '1x2'), stackBlock(3, x + 0.75, 1, '1x2'),
    stackBlock(4, x - 0.75, 2.5), stackBlock(5, x + 0.75, 2.5),
    stackBlock(6, x, 3.5, '2x1'),
    stackBlock(7, x - 1, 4.5), stackBlock(8, x + 1, 4.5),
  ];
}

/** 14. A plank wall at x = 13: two brick 2x1s, one wood 2x1 on them, two wood 2x1s half off its ends. */
function wallStack(): PlacedPart[] {
  const x = 13;
  return [
    stackBlock(2, x - 1, 0.5, '2x1', 'brick'), stackBlock(3, x + 1, 0.5, '2x1', 'brick'),
    stackBlock(4, x, 1.5, '2x1'),
    stackBlock(5, x - 1, 2.5, '2x1'), stackBlock(6, x + 1, 2.5, '2x1'),
  ];
}

/** 15. Three wood dominoes leading into a tower at x = 14: 1x2 post, 2x1 plank, a block on each end. */
function dominoesStack(): PlacedPart[] {
  const x = 14;
  return [
    stackBlock(2, x - 4.2, 1, 'domino'), stackBlock(3, x - 2.8, 1, 'domino'), stackBlock(4, x - 1.4, 1, 'domino'),
    stackBlock(5, x, 1, '1x2'),
    stackBlock(6, x, 2.5, '2x1'),
    stackBlock(7, x - 1, 3.5), stackBlock(8, x + 1, 3.5),
  ];
}

export const LEVELS: CatapultLevel[] = [
  // 1. power ---------------------------------------------------------------------------------
  // Angle locked 45. At x = 5.5 (inside C1's measured 5.0-6.5 passing range), Low barely clears
  // the base and Medium lands square on the can. The angle lever is hidden (not yet introduced),
  // so the hints no longer mention it as a visible control.
  {
    id: 'power',
    introduces: ['power'],
    title: 'Fling it',
    bruno:
      "My fuzz is ready to fly! That can just needs a good hard fling. Turn up the power and let's see it soar.",
    goals: [{ metric: 'knockedDown', op: '>=', value: 1, label: 'Can knocked down' }],
    palette: [],
    shots: 3,
    parts: [
      {
        id: 1,
        kind: 'catapult',
        x: 5.5,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Low', angle: '45' },
        locked: true,
        lockPosition: true,
        lockedProps: ['angle'],
      },
      {
        id: 2,
        kind: 'shelf',
        x: 14.5,
        y: 2,
        props: { ...defaultProps('shelf'), length: '2' },
        locked: true,
        lockPosition: true,
      },
      {
        id: 3,
        kind: 'can',
        x: 14.5,
        y: 2.5,
        props: { ...defaultProps('can') },
        locked: true,
        lockPosition: true,
      },
    ],
    hints: [
      'Low power barely gets the fuzz off the ground, it needs more oomph to reach that shelf.',
      'Tap the catapult, then check the rubber bands. Power is yours to tune.',
      "Set power to Medium, then tap FIRE. That snips the string and sends the fuzz flying right into the can.",
    ],
    failHints: { outOfShots: 'Out of fuzzes! The can is still standing up there. Try turning up the power.' },
    markers: [{ kind: 'icon', p: { x: 14.5, y: 2.5 }, text: TARGET_ICON }],
    solution: [
      {
        id: 1,
        kind: 'catapult',
        x: 5.5,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Medium', angle: '45' },
        locked: true,
        lockPosition: true,
        lockedProps: ['angle'],
      },
      {
        id: 2,
        kind: 'shelf',
        x: 14.5,
        y: 2,
        props: { ...defaultProps('shelf'), length: '2' },
        locked: true,
        lockPosition: true,
      },
      {
        id: 3,
        kind: 'can',
        x: 14.5,
        y: 2.5,
        props: { ...defaultProps('can') },
        locked: true,
        lockPosition: true,
      },
    ],
  },

  // 2. angle ---------------------------------------------------------------------------------
  // Power is locked High. At x = 5.25 (inside C1's measured 4.75-6.25 passing range) the preset
  // 30 degrees still clips the wall; 60 degrees clears it by a wide margin and comes down right
  // on the can. This is the level that unlocks the angle lever, so the hint now names it directly.
  {
    id: 'angle',
    introduces: ['angle'],
    title: 'Over the wall',
    bruno: "There's a wall in the way! I need to loop my fuzz up and over it, right onto that can.",
    goals: [{ metric: 'knockedDown', op: '>=', value: 1, label: 'Can knocked down' }],
    palette: [],
    shots: 3,
    parts: [
      {
        id: 1,
        kind: 'catapult',
        x: 5.25,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'High', angle: '30' },
        locked: true,
        lockPosition: true,
        lockedProps: ['power'],
      },
      {
        id: 2,
        kind: 'wall',
        x: 11.5,
        y: 2,
        props: { ...defaultProps('wall'), height: '4' },
        locked: true,
        lockPosition: true,
      },
      {
        id: 3,
        kind: 'shelf',
        x: 17.5,
        y: 0.5,
        props: { ...defaultProps('shelf'), length: '2' },
        locked: true,
        lockPosition: true,
      },
      {
        id: 4,
        kind: 'can',
        x: 17.5,
        y: 1,
        props: { ...defaultProps('can') },
        locked: true,
        lockPosition: true,
      },
    ],
    hints: [
      'That flat, low arc just smacks straight into the wall.',
      'Tap the catapult and drag the lever knob to something steeper. Power is locked at High, so angle does all the work.',
      'Set the angle to 60. That loops the fuzz well over the wall and back down onto the can.',
    ],
    failHints: { outOfShots: 'Out of fuzzes! That wall keeps stopping me. Try a steeper angle.' },
    markers: [{ kind: 'icon', p: { x: 17.5, y: 1 }, text: TARGET_ICON }],
    solution: [
      {
        id: 1,
        kind: 'catapult',
        x: 5.25,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'High', angle: '60' },
        locked: true,
        lockPosition: true,
        lockedProps: ['power'],
      },
      {
        id: 2,
        kind: 'wall',
        x: 11.5,
        y: 2,
        props: { ...defaultProps('wall'), height: '4' },
        locked: true,
        lockPosition: true,
      },
      {
        id: 3,
        kind: 'shelf',
        x: 17.5,
        y: 0.5,
        props: { ...defaultProps('shelf'), length: '2' },
        locked: true,
        lockPosition: true,
      },
      {
        id: 4,
        kind: 'can',
        x: 17.5,
        y: 1,
        props: { ...defaultProps('can') },
        locked: true,
        lockPosition: true,
      },
    ],
  },

  // 3. weight --------------------------------------------------------------------------------
  // Power/angle locked Max/45. At x = 5.25 (inside C1's measured 5.0-5.5 passing range) a brick
  // 1x2 block stands about 21 m out from the release point; the Flower (old Light) or Fur (old
  // Medium) just bounces off, the Metal fuzz (old Heavy) topples it. This is the level that unlocks
  // the fuzz row (every fuzz but the Donut, which waits for its own level).
  {
    id: 'weight',
    introduces: ['fuzz'],
    title: 'Heavy hitter',
    bruno: "My fuzz keeps bouncing right off that block! I bet a heavier fuzz would knock it right over.",
    goals: [{ metric: 'knockedDown', op: '>=', value: 1, label: 'Block knocked down' }],
    palette: [],
    shots: 2,
    parts: [
      {
        id: 1,
        kind: 'catapult',
        x: 5.25,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Max', angle: '45', fuzz: 'Flower' },
        locked: true,
        lockPosition: true,
        lockedProps: ['power', 'angle'],
      },
      {
        id: 2,
        kind: 'block',
        x: 26.7,
        y: 1,
        props: { ...defaultProps('block'), size: '1x2', material: 'brick' },
        locked: true,
        lockPosition: true,
      },
    ],
    hints: [
      'That fuzz hits the block dead center but just bounces off, too light to budge a brick.',
      "Tap the catapult, then pick a heavier fuzz. Power and angle are locked, so the fuzz is the answer here.",
      'Pick the heavy Metal fuzz. It hits hard enough to topple that brick block.',
    ],
    failHints: { outOfShots: 'Out of fuzzes! That block will not fall over from a light tap, try something heavier.' },
    markers: [{ kind: 'icon', p: { x: 26.7, y: 1.5 }, text: TARGET_ICON }],
    solution: [
      {
        id: 1,
        kind: 'catapult',
        x: 5.25,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Max', angle: '45', fuzz: 'Metal' },
        locked: true,
        lockPosition: true,
        lockedProps: ['power', 'angle'],
      },
      {
        id: 2,
        kind: 'block',
        x: 26.7,
        y: 1,
        props: { ...defaultProps('block'), size: '1x2', material: 'brick' },
        locked: true,
        lockPosition: true,
      },
    ],
  },

  // 4. arm -------------------------------------------------------------------------------------
  // Power/angle locked Max/45. At x = 5.5 (inside C1's measured 4.5-6.5 passing range) the Short
  // arm's arc lands well short of the bullseye; the Long arm reaches it right through the middle.
  // This is the level that unlocks the arm chip.
  {
    id: 'arm',
    introduces: ['arm'],
    title: 'Long arm',
    bruno: "That target is so far away! I think this catapult's arm is too short to reach it.",
    goals: [{ metric: 'hits', op: '>=', value: 1, label: 'Bullseye hit' }],
    palette: [],
    shots: 2,
    parts: [
      {
        id: 1,
        kind: 'catapult',
        x: 5.5,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Max', angle: '45', arm: 'Short' },
        locked: true,
        lockPosition: true,
        lockedProps: ['power', 'angle'],
      },
      {
        id: 2,
        kind: 'bullseye',
        x: 28.5,
        y: 4,
        props: { ...defaultProps('bullseye') },
        locked: true,
        lockPosition: true,
      },
    ],
    hints: [
      "Even at max power, this short arm just does not have the reach.",
      'Power and angle are locked at Max and 45. Tap the catapult and check the arm chip instead.',
      'Switch the arm to Long. The extra length and speed get the fuzz all the way out to the bullseye.',
    ],
    failHints: { outOfShots: 'Out of fuzzes! That short arm just cannot reach, try a longer one.' },
    solution: [
      {
        id: 1,
        kind: 'catapult',
        x: 5.5,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Max', angle: '45', arm: 'Long' },
        locked: true,
        lockPosition: true,
        lockedProps: ['power', 'angle'],
      },
      {
        id: 2,
        kind: 'bullseye',
        x: 28.5,
        y: 4,
        props: { ...defaultProps('bullseye') },
        locked: true,
        lockPosition: true,
      },
    ],
  },

  // 5. move ------------------------------------------------------------------------------------
  // Power locked High. From the preset spot the wall blocks any 45-degree shot; rolled up to
  // x ~10.4 (inside the widened region, x 3.5..10.5) a steep 75-degree arc clears the 6 m wall and
  // drops onto the can. No new property code here - the mechanic is dragging the catapult itself
  // along the ground, so `introduces` is empty (everything up to `arm` is already unlocked).
  {
    id: 'move',
    introduces: [],
    title: 'Roll closer',
    bruno: 'That can is too far away for this angle. Roll my catapult closer along the ground until I can arc right over the wall.',
    goals: [{ metric: 'knockedDown', op: '>=', value: 1, label: 'Can knocked down' }],
    palette: [],
    shots: 3,
    parts: [
      {
        id: 1,
        kind: 'catapult',
        x: 3.5,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'High', angle: '45' },
        locked: true,
        lockedProps: ['power'],
        region: { x: 7, y: 0, w: 7, h: 1 },
      },
      {
        id: 2,
        kind: 'wall',
        x: 13.5,
        y: 3,
        props: { ...defaultProps('wall'), height: '6' },
        locked: true,
        lockPosition: true,
      },
      {
        id: 3,
        kind: 'shelf',
        x: 16.5,
        y: 0.5,
        props: { ...defaultProps('shelf'), length: '2' },
        locked: true,
        lockPosition: true,
      },
      {
        id: 4,
        kind: 'can',
        x: 16.5,
        y: 1,
        props: { ...defaultProps('can') },
        locked: true,
        lockPosition: true,
      },
    ],
    hints: [
      'From way back here, that six-meter wall blocks the shot no matter the angle.',
      'Drag the catapult closer, it can roll along the ground between the gold guides.',
      'Roll it up near the wall and set a steep angle, like 75, to loop straight over and down onto the can.',
    ],
    failHints: { outOfShots: 'Out of fuzzes! Try rolling the catapult closer to the wall first.' },
    markers: [{ kind: 'icon', p: { x: 16.5, y: 1 }, text: TARGET_ICON }],
    solution: [
      {
        id: 1,
        kind: 'catapult',
        x: 10.4,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'High', angle: '75' },
        locked: true,
        lockedProps: ['power'],
        region: { x: 7, y: 0, w: 7, h: 1 },
      },
      {
        id: 2,
        kind: 'wall',
        x: 13.5,
        y: 3,
        props: { ...defaultProps('wall'), height: '6' },
        locked: true,
        lockPosition: true,
      },
      {
        id: 3,
        kind: 'shelf',
        x: 16.5,
        y: 0.5,
        props: { ...defaultProps('shelf'), length: '2' },
        locked: true,
        lockPosition: true,
      },
      {
        id: 4,
        kind: 'can',
        x: 16.5,
        y: 1,
        props: { ...defaultProps('can') },
        locked: true,
        lockPosition: true,
      },
    ],
  },

  // 6. donut ----------------------------------------------------------------------------------
  // The Donut is locked in; it splits into three at the top of its arc (sim.ts). The cans climb as
  // they get farther (shelf tops 0.6, 1.4, 2.2 m at x 17.8, 19.4, 21.2), each sitting on one of the
  // three paths of a split, so no single fuzz can take two: across every power, angle, fuzz and
  // arm, no fuzz that doesn't split knocks two in one shot (levels.test.ts proves it). Re-tuned for
  // the Donut (r 0.28, density 0.8) on 2026-10-01 by a one-shot sweep of all 40 Donut tunings and
  // all 160 non-splitting ones (4 power x 5 angle x 4 fuzz x 2 arm): the old Prism layout (cans at
  // x 17.4, 19, 20.8) let a Max/15 Helmet take two, so the shelves moved 0.4 m out. There the Donut
  // passes 5 of 40 (High/30, High/45 and Max/60 on the Short arm, High/45 and Max/15 on the Long),
  // and no other fuzz passes at all - nor with the shelves anywhere from 0.3 to 0.45 m out.
  // Last intro level: unlocks the Donut option (`fuzz:Donut`), so the whole drawer is open from
  // here on.
  {
    id: 'donut',
    introduces: ['fuzz:Donut'],
    title: 'Three at once',
    bruno: "Meet the Donut! At the top of the flight it splits into three little donuts. Two cans, one shot. Can you do it?",
    goals: [{ metric: 'knockedDown', op: '>=', value: 2, label: 'Cans knocked down' }],
    palette: [],
    shots: 1,
    parts: [
      {
        id: 1,
        kind: 'catapult',
        x: 5,
        y: 0,
        props: { ...defaultProps('catapult'), fuzz: 'Donut' },
        locked: true,
        lockPosition: true,
        lockedProps: ['fuzz'],
      },
      { id: 2, kind: 'shelf', x: 17.8, y: 0.5, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
      { id: 3, kind: 'can', x: 17.8, y: 1, props: { ...defaultProps('can'), color: 'Red' }, locked: true, lockPosition: true },
      { id: 4, kind: 'shelf', x: 19.4, y: 1.3, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
      { id: 5, kind: 'can', x: 19.4, y: 1.8, props: { ...defaultProps('can'), color: 'Blue' }, locked: true, lockPosition: true },
      { id: 6, kind: 'shelf', x: 21.2, y: 2.1, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
      { id: 7, kind: 'can', x: 21.2, y: 2.6, props: { ...defaultProps('can'), color: 'Green' }, locked: true, lockPosition: true },
    ],
    hints: [
      'The Donut splits into three at the top of the arc. Each little donut flies a little differently.',
      'The low one drops short, the high one flies long. Get the top of the arc just before the cans.',
      'Try High power at 30 degrees. The three little donuts spread out right across the shelves.',
    ],
    failHints: { outOfShots: 'Not enough cans down! Change the power and angle so the Donut splits right before the shelves.' },
    markers: [
      { kind: 'icon', p: { x: 17.8, y: 1 }, text: TARGET_ICON },
      { kind: 'icon', p: { x: 19.4, y: 1.8 }, text: TARGET_ICON },
      { kind: 'icon', p: { x: 21.2, y: 2.6 }, text: TARGET_ICON },
    ],
    solution: [
      {
        id: 1,
        kind: 'catapult',
        x: 5,
        y: 0,
        props: { ...defaultProps('catapult'), fuzz: 'Donut', power: 'High', angle: '30' },
        locked: true,
        lockPosition: true,
        lockedProps: ['fuzz'],
      },
      { id: 2, kind: 'shelf', x: 17.8, y: 0.5, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
      { id: 3, kind: 'can', x: 17.8, y: 1, props: { ...defaultProps('can'), color: 'Red' }, locked: true, lockPosition: true },
      { id: 4, kind: 'shelf', x: 19.4, y: 1.3, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
      { id: 5, kind: 'can', x: 19.4, y: 1.8, props: { ...defaultProps('can'), color: 'Blue' }, locked: true, lockPosition: true },
      { id: 6, kind: 'shelf', x: 21.2, y: 2.1, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
      { id: 7, kind: 'can', x: 21.2, y: 2.6, props: { ...defaultProps('can'), color: 'Green' }, locked: true, lockPosition: true },
    ],
  },

  // 7. both ------------------------------------------------------------------------------------
  // First challenge level: everything is unlocked by now, so nothing is hidden here.
  {
    id: 'both',
    title: 'Bullseye',
    bruno: 'See that target way out there? Line up the power and the angle just right and my fuzz will land dead center.',
    goals: [{ metric: 'hits', op: '>=', value: 1, label: 'Bullseye hit' }],
    palette: [],
    shots: 3,
    parts: [
      {
        id: 1,
        kind: 'catapult',
        x: 6,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Low', angle: '45' },
        locked: true,
        lockPosition: true,
      },
      {
        id: 2,
        kind: 'bullseye',
        x: 23.5,
        y: 5,
        props: { ...defaultProps('bullseye') },
        locked: true,
        lockPosition: true,
      },
    ],
    hints: [
      "Low power barely leaves the stall, that target is way out there.",
      'Nothing is locked this time, both power and angle are yours to tune.',
      'Try Max power at 45 degrees. That sends the fuzz all the way out to the bullseye.',
    ],
    failHints: { outOfShots: 'Out of fuzzes! Try more power, that target is further than it looks.' },
    solution: [
      {
        id: 1,
        kind: 'catapult',
        x: 6,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Max', angle: '45' },
        locked: true,
        lockPosition: true,
      },
      {
        id: 2,
        kind: 'bullseye',
        x: 23.5,
        y: 5,
        props: { ...defaultProps('bullseye') },
        locked: true,
        lockPosition: true,
      },
    ],
  },

  // 8. cans ----------------------------------------------------------------------------------
  // Nothing locked: the child must retune the catapult between shots. At x = 11 no single
  // power sweeps all three shelves (x 13.5, 18.5, 23.5 at three heights); Low power at 60 degrees
  // takes the near, low can, then High power at 15 and 30 degrees takes the far two.
  {
    id: 'cans',
    title: 'Three cans',
    bruno: 'Three fuzzes, three cans! Retune the catapult before every shot and knock all three down.',
    goals: [{ metric: 'knockedDown', op: '>=', value: 3, label: 'Cans knocked down' }],
    palette: [],
    shots: 3,
    parts: [
      {
        id: 1,
        kind: 'catapult',
        x: 11,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Low', angle: '45' },
        locked: true,
        lockPosition: true,
      },
      { id: 2, kind: 'shelf', x: 13.5, y: 1, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
      { id: 3, kind: 'can', x: 13.5, y: 1.5, props: { ...defaultProps('can') }, locked: true, lockPosition: true },
      { id: 4, kind: 'shelf', x: 18.5, y: 3, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
      { id: 5, kind: 'can', x: 18.5, y: 3.5, props: { ...defaultProps('can') }, locked: true, lockPosition: true },
      { id: 6, kind: 'shelf', x: 23.5, y: 2, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
      { id: 7, kind: 'can', x: 23.5, y: 2.5, props: { ...defaultProps('can') }, locked: true, lockPosition: true },
    ],
    hints: [
      'One tuning will not hit all three cans, they sit at different heights and distances.',
      'Nothing is locked. Retune both the rubber bands and the angle lever before each launch.',
      'Fire Low power at 60 first, then switch to High power at 15, then High power at 30.',
    ],
    failHints: { outOfShots: 'Out of fuzzes! Retune the catapult for each can, they are not all the same shot.' },
    markers: [
      { kind: 'icon', p: { x: 13.5, y: 1.5 }, text: TARGET_ICON },
      { kind: 'icon', p: { x: 18.5, y: 3.5 }, text: TARGET_ICON },
      { kind: 'icon', p: { x: 23.5, y: 2.5 }, text: TARGET_ICON },
    ],
    solution: [
      {
        id: 1,
        kind: 'catapult',
        x: 11,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Low', angle: '60' },
        locked: true,
        lockPosition: true,
      },
      { id: 2, kind: 'shelf', x: 13.5, y: 1, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
      { id: 3, kind: 'can', x: 13.5, y: 1.5, props: { ...defaultProps('can') }, locked: true, lockPosition: true },
      { id: 4, kind: 'shelf', x: 18.5, y: 3, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
      { id: 5, kind: 'can', x: 18.5, y: 3.5, props: { ...defaultProps('can') }, locked: true, lockPosition: true },
      { id: 6, kind: 'shelf', x: 23.5, y: 2, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
      { id: 7, kind: 'can', x: 23.5, y: 2.5, props: { ...defaultProps('can') }, locked: true, lockPosition: true },
    ],
    solutionShots: [
      { power: 'Low', angle: '60' },
      { power: 'High', angle: '15' },
      { power: 'High', angle: '30' },
    ],
  },

  // 9. tower -----------------------------------------------------------------------------------
  // Blocks are not glued, so a solid hit drops the whole column. High power at 45 degrees (robust
  // from about catX 4.0-5.5 and angle 40-50) knocks down all four blocks; the can rides the
  // collapse down but is not reliably latched as "knocked", so the goal is set to 4.
  {
    id: 'tower',
    title: 'Timber!',
    bruno: 'Look at that tower of blocks with a can on top! One good hit low down should send the whole thing tumbling.',
    goals: [{ metric: 'knockedDown', op: '>=', value: 4, label: 'Targets knocked down' }],
    palette: [],
    shots: 2,
    parts: [
      {
        id: 1,
        kind: 'catapult',
        x: 4.5,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Low', angle: '45', fuzz: 'Flower' },
        locked: true,
        lockPosition: true,
      },
      { id: 2, kind: 'block', x: 19.5, y: 0.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 3, kind: 'block', x: 19.5, y: 1.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 4, kind: 'block', x: 19.5, y: 2.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 5, kind: 'block', x: 19.5, y: 3.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 6, kind: 'can', x: 19.5, y: 4.4, props: { ...defaultProps('can') }, locked: true, lockPosition: true },
    ],
    hints: [
      "That soft, low toss does not even reach the tower.",
      'Aim for the middle of the stack and hit it hard. Knock it loose and the rest comes down with it.',
      'Set power to High, angle to 45, and pick the Metal fuzz. That hard shot sends the whole tower tumbling.',
    ],
    failHints: { outOfShots: 'Out of fuzzes! That soft toss will not even reach the tower, hit it hard.' },
    markers: [{ kind: 'icon', p: { x: 19.5, y: 4.4 }, text: TARGET_ICON }],
    solution: [
      {
        id: 1,
        kind: 'catapult',
        x: 4.5,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'High', angle: '45', fuzz: 'Metal' },
        locked: true,
        lockPosition: true,
      },
      { id: 2, kind: 'block', x: 19.5, y: 0.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 3, kind: 'block', x: 19.5, y: 1.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 4, kind: 'block', x: 19.5, y: 2.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 5, kind: 'block', x: 19.5, y: 3.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 6, kind: 'can', x: 19.5, y: 4.4, props: { ...defaultProps('can') }, locked: true, lockPosition: true },
    ],
  },

  // 10. line -----------------------------------------------------------------------------------
  // Huddle 2026-09-22: once there are real structures, the goal can be broader than a target -
  // nothing may stay above the line, knock it down any way you like. Deviation from the brief's
  // 2-wide x 3-high tower: in the live sim a 2-wide wood tower is too stable for a fuzz (the Metal
  // fuzz at High power never leaves fewer than 2 blocks above 1.5 m in one shot, and only three
  // knife-edge 3-shot sequences pass), so the tower is one block wide: three 1x1 wood blocks
  // capped by a 2x1 plank, a top-heavy stack 12 m out. Metal/High/30/Short topples it in one shot;
  // so do Metal/High/15 and Metal/Max/15 and Fur/Max/15 (Short), and Metal/High/15, Fur/High/15
  // and Metal/Medium/30 (Long).
  {
    id: 'line',
    title: 'Bring it down',
    bruno: "See the gold line? Nothing on that tower can stay above it. Knock it down any way you like!",
    goals: [{ metric: 'aboveLine', op: '==', value: 0, label: 'Nothing left above the line' }],
    palette: [],
    shots: 3,
    line: 1.5,
    parts: [
      {
        id: 1,
        kind: 'catapult',
        x: 5,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Low', angle: '45', fuzz: 'Flower' },
        locked: true,
        lockPosition: true,
      },
      { id: 2, kind: 'block', x: 17, y: 0.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 3, kind: 'block', x: 17, y: 1.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 4, kind: 'block', x: 17, y: 2.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 5, kind: 'block', x: 17, y: 3.5, props: { ...defaultProps('block'), size: '2x1', material: 'wood' }, locked: true, lockPosition: true },
    ],
    hints: [
      'A soft toss with a light fuzz does not even reach the tower.',
      'Pick a heavy fuzz so it hits hard, then aim a fast, flat shot right at the tower.',
      'Try High power, 30 degrees and the Metal fuzz. The whole stack comes crashing down.',
    ],
    failHints: { outOfShots: 'Out of fuzzes! Some of the tower is still above the line. Hit it harder!' },
    markers: [{ kind: 'hline', y: 1.5, color: 0xffc629, label: 'Nothing above this line!' }],
    solution: [
      {
        id: 1,
        kind: 'catapult',
        x: 5,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'High', angle: '30', fuzz: 'Metal' },
        locked: true,
        lockPosition: true,
      },
      { id: 2, kind: 'block', x: 17, y: 0.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 3, kind: 'block', x: 17, y: 1.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 4, kind: 'block', x: 17, y: 2.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 5, kind: 'block', x: 17, y: 3.5, props: { ...defaultProps('block'), size: '2x1', material: 'wood' }, locked: true, lockPosition: true },
    ],
  },

  // 11. chain ----------------------------------------------------------------------------------
  // The over-the-top moment: one fuzz tips the first domino and the row goes down in sequence
  // (CRASH! fires on the third). Deviation from the brief's 1x2 blocks: a 1 m-wide block is too
  // squat to knock its neighbour over (at 1.4 m apart a hit one just leans on the next and no
  // shot topples more than two), so these are 'domino' slabs (0.4 x 2 m wood). Lying flat they
  // stand 0.4 m tall, under the 1.2 m line. The solution (Medium power, 30 degrees, defaults
  // otherwise) is wide: Medium power at 15/30/45 with the Flower or Fur fuzz on the Short arm all
  // pass; a shot that lands past the first domino leaves it standing.
  {
    id: 'chain',
    title: 'Chain reaction',
    bruno: "Five dominoes in a row! Knock the first one and watch them all go. Every one has to end up below the line.",
    goals: [{ metric: 'aboveLine', op: '==', value: 0, label: 'Nothing left above the line' }],
    palette: [],
    shots: 2,
    line: 1.2,
    parts: [
      {
        id: 1,
        kind: 'catapult',
        x: 5,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Low', angle: '45' },
        locked: true,
        lockPosition: true,
      },
      { id: 2, kind: 'block', x: 15, y: 1, props: { ...defaultProps('block'), size: 'domino', material: 'wood' }, locked: true, lockPosition: true },
      { id: 3, kind: 'block', x: 16.4, y: 1, props: { ...defaultProps('block'), size: 'domino', material: 'wood' }, locked: true, lockPosition: true },
      { id: 4, kind: 'block', x: 17.8, y: 1, props: { ...defaultProps('block'), size: 'domino', material: 'wood' }, locked: true, lockPosition: true },
      { id: 5, kind: 'block', x: 19.2, y: 1, props: { ...defaultProps('block'), size: 'domino', material: 'wood' }, locked: true, lockPosition: true },
      { id: 6, kind: 'block', x: 20.6, y: 1, props: { ...defaultProps('block'), size: 'domino', material: 'wood' }, locked: true, lockPosition: true },
    ],
    hints: [
      'That toss lands short. The fuzz has to reach the very first domino.',
      'Hit the FIRST domino. If you hit one in the middle, the ones behind it stay standing.',
      'Try Medium power at 30 degrees. That tips the first domino and the rest follow.',
    ],
    failHints: { outOfShots: 'Out of fuzzes! Some dominoes are still standing. Aim for the first one in the row.' },
    markers: [{ kind: 'hline', y: 1.2, color: 0xffc629, label: 'Nothing above this line!' }],
    solution: [
      {
        id: 1,
        kind: 'catapult',
        x: 5,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Medium', angle: '30' },
        locked: true,
        lockPosition: true,
      },
      { id: 2, kind: 'block', x: 15, y: 1, props: { ...defaultProps('block'), size: 'domino', material: 'wood' }, locked: true, lockPosition: true },
      { id: 3, kind: 'block', x: 16.4, y: 1, props: { ...defaultProps('block'), size: 'domino', material: 'wood' }, locked: true, lockPosition: true },
      { id: 4, kind: 'block', x: 17.8, y: 1, props: { ...defaultProps('block'), size: 'domino', material: 'wood' }, locked: true, lockPosition: true },
      { id: 5, kind: 'block', x: 19.2, y: 1, props: { ...defaultProps('block'), size: 'domino', material: 'wood' }, locked: true, lockPosition: true },
      { id: 6, kind: 'block', x: 20.6, y: 1, props: { ...defaultProps('block'), size: 'domino', material: 'wood' }, locked: true, lockPosition: true },
    ],
  },

  // 12-15. stack levels --------------------------------------------------------------------------
  // Stakeholder request 2026-09-22 (Gao): more levels at the end with various stacks and a more
  // lenient line, so many settings pass. Tuned by a one-shot sweep of all 120 tunings of the three
  // fuzzes there were then (today's Flower, Fur and Metal: 4 power x 5 angle x 3 fuzz x 2 arm) from
  // the preset world: each level passes with at least 20%
  // of them, across at least 3 power levels. What makes them lenient in the live sim: each stack
  // carries blocks balanced right on an edge (half on, half off), and the line only asks for those
  // top pieces to come down - a partial collapse counts. A plain 3-2-1 pyramid or a squared-off
  // bridge is too sturdy for a fuzz (under 10 of 120 tunings move its top block at all). The
  // preset (Low, 45, Flower) never reaches the stack, so doing nothing fails. The old splitting
  // fuzz passed a few more in each level (42, 33, 39, 58 of 120) without trivialising any. `altSolutions` records
  // other passing tunings, each proven on its own by levels.test.ts.

  // 12. pyramid --------------------------------------------------------------------------------
  // A 3-2-1 wood pyramid at x = 13 with two blocks balanced on its peak, each half hanging off.
  // Line 3.5 (peak 3, hat blocks' tops 4): knock both hat blocks down. 29 of those 120 tunings pass
  // in one shot (Low 4, Medium 16, High 4, Max 5).
  {
    id: 'pyramid',
    title: 'Pyramid hats',
    bruno: 'My pyramid is wearing two blocks for a hat! Knock the hat off so nothing stays above the line.',
    goals: [{ metric: 'aboveLine', op: '==', value: 0, label: 'Nothing left above the line' }],
    palette: [],
    shots: 3,
    line: 3.5,
    parts: [stackCatapult(STACK_PRESET), ...pyramidStack()],
    hints: [
      'That soft toss does not even reach the pyramid.',
      'Those two top blocks are wobbly. Any good bump to the pyramid can shake them off.',
      'Lots of settings work here. Try more power, a heavier fuzz, or a new angle, and see what happens!',
    ],
    failHints: { outOfShots: 'Out of fuzzes! The hat is still on. Try more power or a heavier fuzz.' },
    markers: [{ kind: 'hline', y: 3.5, color: LINE_COLOR, label: 'Nothing above this line!' }],
    solution: [stackCatapult({ power: 'Medium', angle: '45', fuzz: 'Fur' }), ...pyramidStack()],
    altSolutions: [
      { power: 'Low', angle: '15', fuzz: 'Metal', arm: 'Short' },
      { power: 'Medium', angle: '30', fuzz: 'Metal', arm: 'Short' },
      { power: 'High', angle: '15', fuzz: 'Metal', arm: 'Short' },
      { power: 'Max', angle: '15', fuzz: 'Metal', arm: 'Short' },
      { power: 'Max', angle: '75', fuzz: 'Fur', arm: 'Short' },
    ],
  },

  // 13. towers ---------------------------------------------------------------------------------
  // Two wood towers (a 1x2 post and a 1x1 each) at x = 15 with a 2x1 plank across them and a block
  // balanced on each end of the plank. Line 4.5 (plank top 4, end blocks' tops 5). 30 of those 120
  // tunings pass in one shot (Low 1, Medium 12, High 11, Max 6).
  {
    id: 'towers',
    title: 'Twin towers',
    bruno: 'Two towers holding up a plank, with a block on each end. Get both blocks below the line!',
    goals: [{ metric: 'aboveLine', op: '==', value: 0, label: 'Nothing left above the line' }],
    palette: [],
    shots: 3,
    line: 4.5,
    parts: [stackCatapult(STACK_PRESET), ...towersStack()],
    hints: [
      'That soft toss lands way short of the towers.',
      'Shake the towers and those end blocks slide right off. You do not have to knock it all down.',
      'Try a heavier fuzz or more power, then try a flatter or a higher angle. Plenty of shots work!',
    ],
    failHints: { outOfShots: 'Out of fuzzes! A block is still up there. Try a heavier fuzz or more power.' },
    markers: [{ kind: 'hline', y: 4.5, color: LINE_COLOR, label: 'Nothing above this line!' }],
    solution: [stackCatapult({ power: 'High', angle: '45', fuzz: 'Metal' }), ...towersStack()],
    altSolutions: [
      { power: 'Medium', angle: '15', fuzz: 'Fur', arm: 'Short' },
      { power: 'Medium', angle: '30', fuzz: 'Flower', arm: 'Short' },
      { power: 'High', angle: '60', fuzz: 'Fur', arm: 'Short' },
      { power: 'Max', angle: '15', fuzz: 'Metal', arm: 'Short' },
      { power: 'Low', angle: '30', fuzz: 'Fur', arm: 'Long' },
    ],
  },

  // 14. wall -----------------------------------------------------------------------------------
  // A 2x1 plank wall at x = 13, bricks on the bottom row for a heavier feel: two brick planks, one
  // wood plank centered on them, then two wood planks balanced half off its ends. Line 2.5 (middle
  // row top 2, top row 3). 26 of those 120 tunings pass in one shot (Low 1, Medium 16, High 5,
  // Max 4).
  {
    id: 'wall',
    title: 'Wobbly wall',
    bruno: 'A brick wall with wooden planks on top! Knock the top row down below the line.',
    goals: [{ metric: 'aboveLine', op: '==', value: 0, label: 'Nothing left above the line' }],
    palette: [],
    shots: 3,
    line: 2.5,
    parts: [stackCatapult(STACK_PRESET), ...wallStack()],
    hints: [
      'That toss does not reach the wall yet.',
      'The bricks are heavy, but the top planks are only half on. Rattle the wall and they tip.',
      'Experiment! Try more power or a heavier fuzz, and try a few different angles.',
    ],
    failHints: { outOfShots: 'Out of fuzzes! A plank is still above the line. Try a new angle or more power.' },
    markers: [{ kind: 'hline', y: 2.5, color: LINE_COLOR, label: 'Nothing above this line!' }],
    solution: [stackCatapult({ power: 'Medium', angle: '45', fuzz: 'Metal' }), ...wallStack()],
    altSolutions: [
      { power: 'Medium', angle: '15', fuzz: 'Flower', arm: 'Short' },
      { power: 'Medium', angle: '60', fuzz: 'Fur', arm: 'Short' },
      { power: 'High', angle: '15', fuzz: 'Metal', arm: 'Short' },
      { power: 'Max', angle: '75', fuzz: 'Metal', arm: 'Short' },
      { power: 'Low', angle: '15', fuzz: 'Fur', arm: 'Long' },
    ],
  },

  // 15. dominoes -------------------------------------------------------------------------------
  // Three wood dominoes lead into a small tower at x = 14 (a 1x2 post, a 2x1 plank, a block
  // balanced on each plank end). Hit the dominoes or the tower: either knocks the end blocks off.
  // Line 3.5 (plank top 3, end blocks' tops 4). 41 of those 120 tunings pass in one shot (Low 11,
  // Medium 13, High 10, Max 7) - the most lenient of the four, a fun finale before free play.
  {
    id: 'dominoes',
    title: 'Domino drop',
    bruno: 'Dominoes, then a tower! Tip them into it, or hit the tower yourself. Just get it below the line.',
    goals: [{ metric: 'aboveLine', op: '==', value: 0, label: 'Nothing left above the line' }],
    palette: [],
    shots: 3,
    line: 3.5,
    parts: [stackCatapult(STACK_PRESET), ...dominoesStack()],
    hints: [
      'That light little toss does not do much.',
      'Knock any domino and it pushes the rest into the tower. Or hit the tower straight on!',
      'Try a heavier fuzz first, then more power. Lots of settings bring it down.',
    ],
    failHints: { outOfShots: 'Out of fuzzes! Something is still above the line. Try a heavier fuzz or more power.' },
    markers: [{ kind: 'hline', y: 3.5, color: LINE_COLOR, label: 'Nothing above this line!' }],
    solution: [stackCatapult({ power: 'Medium', angle: '30', fuzz: 'Metal' }), ...dominoesStack()],
    altSolutions: [
      { power: 'Low', angle: '15', fuzz: 'Fur', arm: 'Short' },
      { power: 'Medium', angle: '15', fuzz: 'Fur', arm: 'Short' },
      { power: 'High', angle: '30', fuzz: 'Metal', arm: 'Short' },
      { power: 'High', angle: '60', fuzz: 'Fur', arm: 'Short' },
      { power: 'Max', angle: '75', fuzz: 'Fur', arm: 'Short' },
    ],
  },

  // 16. free play ----------------------------------------------------------------------------
  {
    id: 'free',
    title: 'Free play',
    bruno: 'No rules this time! Set up my catapult however you like and fling fuzzes at everything.',
    goals: [],
    palette: ['can', 'block', 'shelf', 'wall', 'bullseye'],
    shots: 0,
    parts: [
      {
        id: 1,
        kind: 'catapult',
        x: 4.5,
        y: 0,
        props: { ...defaultProps('catapult') },
        locked: true,
        region: { x: 7, y: 0, w: 9, h: 1 },
      },
      { id: 2, kind: 'shelf', x: 16.5, y: 2, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
      { id: 3, kind: 'can', x: 16.5, y: 2.5, props: { ...defaultProps('can') }, locked: true, lockPosition: true },
      { id: 4, kind: 'bullseye', x: 25.5, y: 5, props: { ...defaultProps('bullseye') }, locked: true, lockPosition: true },
    ],
    hints: [
      'Try rolling the catapult around, or add your own cans, blocks and walls from the palette.',
      'Stack blocks into your own tower, or line up a shelf just where you want it.',
      "There's no wrong answer in free play, just have fun flinging fuzzes!",
    ],
    failHints: { outOfShots: 'All out of fuzzes for now! Hit reset to fling some more.' },
  },
];

export function findLevel(id: string): CatapultLevel | undefined {
  return LEVELS.find((level) => level.id === id);
}
