// Fuzz Fling: "Bruno's carnival stall." The child tunes a catapult (power, angle, fuzz, arm),
// taps FIRE, and flings fuzzes at cans, block towers and a bullseye. Units are meters, y up,
// ground top at y = 0, world 30 x 19.125 m (15 m until 2026-10-07: the taller world is all sky,
// see build.ts WORLD_H), walls at x 0 and 30. See core/types.ts for the frozen
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
// default. Order: power, angle, weight (unlocks the fuzz row: Flower, Fur, Helmet, Metal), arm (the 'move'
// level, dragging the catapult, was removed 2026-10-15: no more catapult moving), donut (unlocks
// the Donut option, `fuzz:Donut`), smash (the breakable crates' first level; a target, so nothing
// to unlock) - then the challenge run: longshot, tower, line, chain, pyramid, towers, wall,
// dominoes, free, none of which introduce anything new. The Bullseye level (both) was removed 2026-10-15 (Gao: "get
// rid of level 6 as well"); the bullseye stays a free-play part and the arm level's target.
//
// Crates (2026-10-15, Gao: "from level 7 and on, we want to introduce breakable boxes, if hit with
// enough force, they just get destroyed"): a block with `material: 'crate'` breaks when it takes a
// hard hit (catalog.ts CRATE_BREAK) and then counts as knocked down. Smash it introduces them, and
// every challenge level from Timber! on mixes some in (each level's comment says where). The
// challenge sweeps below count one-shot passes over all 200 tunings (4 power x 5 angle x 5 fuzz x
// 2 arm) and, in brackets, over the old 120 (Flower, Fur and Metal only) the earlier counts used.
//
// Stakeholder direction 2026-10-01: the old weight row (Light/Medium/Heavy) and fuzz row (Blue/
// Prism) merged into one Fuzz row. Every level's props moved over with identical physics: Light ->
// Flower, Medium -> Fur, Heavy -> Metal (same radius and density), Blue -> nothing (only the Donut
// splits now); the old Prism level became the Donut's, re-tuned for the Donut's own numbers.
//
// The energy rule (Gao, 2026-10-15: "theres no gameplay reason to use a lighter fuzz right now"):
// the bands store a fixed energy per power, so a heavier fuzz leaves slower and lands shorter and a
// lighter one flies farther but hits softer (catalog.ts launchSpeed; the Fur keeps its old speeds).
// Every level was re-swept over all 200 tunings: the weight level (Heavy or light) now teaches both
// halves of the trade-off, Smash it fires flat so every fuzz reaches its crate, the new Long shot
// level (after Smash it) needs a light fuzz, and the Donut level was re-laid for the faster Donut.
// The other levels kept their layouts and, where a heavy fuzz now falls short, re-picked a
// solution with more power (each level's comment gives the counts before and after).
import { defaultProps } from './catalog';
import type { CatapultLevel, PlacedPart } from './types';


/** A locked, position-locked block (the stack levels 11-14 are built from these). */
function stackBlock(id: number, x: number, y: number, size = '1x1', material = 'wood'): PlacedPart {
  return { id, kind: 'block', x, y, props: { ...defaultProps('block'), size, material }, locked: true, lockPosition: true };
}

/** A locked, position-locked breakable crate (a block with `material: 'crate'`, 2026-10-15). */
function crateBlock(id: number, x: number, y: number, size = '1x1'): PlacedPart {
  return stackBlock(id, x, y, size, 'crate');
}

/** The weight level (Heavy or light): catapult at x 5 locked at High / 45, a wood 1x2 block where the
 * Metal comes down and a can on a shelf where only the Flower reaches, with the given fuzz loaded. */
function weightParts(fuzz: string): PlacedPart[] {
  return [
    {
      id: 1,
      kind: 'catapult',
      x: 5,
      y: 0,
      props: { ...defaultProps('catapult'), power: 'High', angle: '45', fuzz },
      locked: true,
      lockPosition: true,
      lockedProps: ['power', 'angle'],
    },
    { id: 2, kind: 'block', x: 14.5, y: 1, props: { ...defaultProps('block'), size: '1x2', material: 'wood' }, locked: true, lockPosition: true },
    { id: 3, kind: 'shelf', x: 27, y: 2, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
    { id: 4, kind: 'can', x: 27, y: 2.5, props: { ...defaultProps('can') }, locked: true, lockPosition: true },
  ];
}

/** Where the Smash it level's tall crate stands: in the path of the locked Max / 15 shot, where every
 * fuzz reaches it (the Flower only bumps it; the Fur, Helmet and Metal smash it anywhere from 21 to
 * 24 m). */
const SMASH_CRATE_X = 22.5;

/** The Long shot level: catapult at x 5, power locked at Medium, a can on a crate on a low shelf
 * 13.5 m out, with the given props over the defaults. */
function longShotParts(props: Record<string, string>): PlacedPart[] {
  return [
    {
      id: 1,
      kind: 'catapult',
      x: 5,
      y: 0,
      props: { ...defaultProps('catapult'), power: 'Medium', ...props },
      locked: true,
      lockPosition: true,
      lockedProps: ['power'],
    },
    { id: 2, kind: 'shelf', x: 18.5, y: 1, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
    crateBlock(3, 18.5, 1.6),
    { id: 4, kind: 'can', x: 18.5, y: 2.5, props: { ...defaultProps('can') }, locked: true, lockPosition: true },
  ];
}

/** The Donut level's three shelves (x, y of the shelf's centre), climbing as they get farther. */
const DONUT_SHELVES: [number, number][] = [[21.2, 0.625], [23.2, 1.625], [25.45, 2.625]];
const DONUT_COLORS = ['Red', 'Blue', 'Green'];

function donutTargets(): PlacedPart[] {
  return DONUT_SHELVES.flatMap(([x, y], i) => [
    { id: 2 + i * 2, kind: 'shelf', x, y, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
    { id: 3 + i * 2, kind: 'can', x, y: y + 0.5, props: { ...defaultProps('can'), color: DONUT_COLORS[i]! }, locked: true, lockPosition: true },
  ] as PlacedPart[]);
}

/** The stack levels' catapult: x = 5, everything free, with the given props over the defaults. */
function stackCatapult(props: Record<string, string>): PlacedPart {
  return { id: 1, kind: 'catapult', x: 5, y: 0, props: { ...defaultProps('catapult'), ...props }, locked: true, lockPosition: true };
}

/** Every stack level starts on the same soft toss (Low, 45 degrees, the heavy Metal) that never
 * reaches (the Flower did until the energy rule; now it flies 8 m at Low). */
const STACK_PRESET = { power: 'Low', angle: '45', fuzz: 'Metal' };

const LINE_COLOR = 0xffc629;

/** A 3-2-1 wood pyramid centered at x = 13, two crates balanced half-off its peak (the hat). */
function pyramidStack(): PlacedPart[] {
  const x = 13;
  return [
    stackBlock(2, x - 1, 0.5), stackBlock(3, x, 0.5), stackBlock(4, x + 1, 0.5),
    stackBlock(5, x - 0.5, 1.5), stackBlock(6, x + 0.5, 1.5),
    stackBlock(7, x, 2.5),
    crateBlock(8, x - 0.5, 3.5), crateBlock(9, x + 0.5, 3.5),
  ];
}

/** Two towers (a wood 1x2 post + a crate) at x = 15, a 2x1 plank across, a block on each plank end. */
function towersStack(): PlacedPart[] {
  const x = 15;
  return [
    stackBlock(2, x - 0.75, 1, '1x2'), stackBlock(3, x + 0.75, 1, '1x2'),
    crateBlock(4, x - 0.75, 2.5), crateBlock(5, x + 0.75, 2.5),
    stackBlock(6, x, 3.5, '2x1'),
    stackBlock(7, x - 1, 4.5), stackBlock(8, x + 1, 4.5),
  ];
}

/** A plank wall at x = 13: two brick 2x1s, one wood 2x1 on them, two 2x1 crates half off its ends. */
function wallStack(): PlacedPart[] {
  const x = 13;
  return [
    stackBlock(2, x - 1, 0.5, '2x1', 'brick'), stackBlock(3, x + 1, 0.5, '2x1', 'brick'),
    stackBlock(4, x, 1.5, '2x1'),
    crateBlock(5, x - 1, 2.5, '2x1'), crateBlock(6, x + 1, 2.5, '2x1'),
  ];
}

/** Three wood dominoes leading into a tower at x = 14: 1x2 post, a 2x1 crate plank, a block on each end. */
function dominoesStack(): PlacedPart[] {
  const x = 14;
  return [
    stackBlock(2, x - 4.2, 1, 'domino'), stackBlock(3, x - 2.8, 1, 'domino'), stackBlock(4, x - 1.4, 1, 'domino'),
    stackBlock(5, x, 1, '1x2'),
    crateBlock(6, x, 2.5, '2x1'),
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
      "Let's knock that can down. How much power will it take?",
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
      'Low power barely leaves the ground. What could reach that shelf?',
      'Tap the catapult, then check the rubber bands. Power is yours to tune.',
      "Try Medium power, then tap FIRE.",
    ],
    failHints: { outOfShots: 'Out of fuzzes! The can is still standing up there. Try turning up the power.' },
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
      'Power is locked at High. What else can we change? Try the lever knob.',
      'Set the angle to 60. That loops the fuzz well over the wall and back down onto the can.',
    ],
    failHints: { outOfShots: "Out of fuzzes. Good tests! Let's try a steeper angle." },
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
  // Gao, 2026-10-15: "theres no gameplay reason to use a lighter fuzz right now". Since the energy
  // rule (catalog.ts launchSpeed) a heavier fuzz leaves slower and lands shorter, a lighter one
  // flies farther but hits softer, and this level (the one that unlocks the fuzz row: every fuzz
  // but the Donut, which waits for its own level) teaches both halves of that trade-off. Power and
  // angle are locked at High / 45 (the arm is still the hidden Short one). Two targets: a wood 1x2
  // block 9.5 m out and a can on a shelf 22 m out. At these settings the Metal lands right on the
  // block and topples it (the Flower, Fur and Helmet never move it: at 13.75-15.25 m only the Metal
  // does); only the Flower sails all the way to the can (it is the only fuzz to reach a can on a
  // 1.5-2.5 m shelf anywhere from 26 to 28 m); the preset Fur lands in the gap between them and
  // hits nothing. So it takes two shots with two different fuzzes: heavy for the near block,
  // light for the far can (levels.test.ts proves each half).
  {
    id: 'weight',
    introduces: ['fuzz'],
    title: 'Heavy or light',
    bruno: "A block up close, a can far away. Let's pick the right fuzz for each one.",
    goals: [{ metric: 'knockedDown', op: '>=', value: 2, label: 'Block and can knocked down' }],
    palette: [],
    shots: 3,
    parts: weightParts('Fur'),
    hints: [
      'The Fur fuzz lands right between them. Each target needs a different fuzz.',
      'Same bands, different fuzz. A light fuzz flies farther, a heavy one hits harder.',
      "Pick Metal for the block, then the light Flower for the can. Let's try both.",
    ],
    failHints: { outOfShots: "Out of fuzzes. Heavy for the near block, light for the far can. Let's try again." },
    solution: weightParts('Metal'),
    // Shot 1 keeps the solution's Metal (the block), shot 2 switches to the Flower (the can).
    solutionShots: [{ fuzz: 'Metal' }, { fuzz: 'Flower' }],
  },

  // 4. arm -------------------------------------------------------------------------------------
  // Power/angle locked Max/45. At x = 5.5 (inside C1's measured 4.5-6.5 passing range) the Short
  // arm's arc lands well short of the bullseye; the Long arm reaches it right through the middle.
  // This is the level that unlocks the arm chip. Since the energy rule (2026-10-15) the fuzz is
  // locked too (the Fur, the default): the light Flower on the Short arm reaches the bullseye at
  // Max / 45, which would skip the arm lesson right after the weight level taught "light flies far".
  {
    id: 'arm',
    introduces: ['arm'],
    title: 'Long arm',
    bruno: "That target is far away. What could help us reach it?",
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
        lockedProps: ['power', 'angle', 'fuzz'],
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
      'Power, angle and fuzz are locked. Tap the catapult and look at the Arm.',
      'Switch the arm to Long. The extra length and speed get the fuzz all the way out to the bullseye.',
    ],
    failHints: { outOfShots: "Out of fuzzes. That arm can't reach. Let's try a longer one." },
    solution: [
      {
        id: 1,
        kind: 'catapult',
        x: 5.5,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Max', angle: '45', arm: 'Long' },
        locked: true,
        lockPosition: true,
        lockedProps: ['power', 'angle', 'fuzz'],
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

  // 5. donut ----------------------------------------------------------------------------------
  // The Donut is locked in; it splits into three at the top of its arc (sim.ts). The cans climb as
  // they get farther, each sitting on one of the three paths of a split, so no single fuzz can take
  // two: across every power, angle, fuzz and arm, no fuzz that doesn't split knocks two in one shot
  // (levels.test.ts proves it). Re-tuned for the energy rule on 2026-10-15 (the Donut now leaves 9%
  // faster than the Fur and flies 20% farther): the 2026-10-01 layout (shelves at x 17.8, 19.4,
  // 21.2, y 0.5, 1.3, 2.1) let the Flower, Helmet and Metal take two, so the whole layout was scaled
  // 1.25x about the catapult and moved 0.2 m out (x 21.2, 23.2, 25.45; y 0.625, 1.625, 2.625),
  // picked by a one-shot sweep of all 40 Donut tunings and all 160 non-splitting ones over scales
  // 1-1.27 and offsets 0-0.8 m. There the Donut passes 8 of 40 (Medium/30 Long; High/15 Long,
  // High/30 and High/45 Short; Max/15, Max/30 and Max/60 Short, Max/60 Long) and no other fuzz
  // passes at all (nor 0.05 m nearer). Last intro level: unlocks the Donut option (`fuzz:Donut`), so
  // the whole drawer is open from here on.
  {
    id: 'donut',
    introduces: ['fuzz:Donut'],
    title: 'Three at once',
    bruno: "Meet the Donut! It splits in three at the top. Can we knock down two cans with one shot?",
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
      ...donutTargets(),
    ],
    hints: [
      'The Donut splits into three at the top of the arc. Each little donut flies a little differently.',
      'The low one falls short and the high one flies long. Split it just before the cans.',
      'Try High power at 45 degrees. The three little donuts spread out right across the shelves.',
    ],
    failHints: { outOfShots: 'Not enough cans down! Change the power and angle so the Donut splits right before the shelves.' },
    solution: [
      {
        id: 1,
        kind: 'catapult',
        x: 5,
        y: 0,
        props: { ...defaultProps('catapult'), fuzz: 'Donut', power: 'High', angle: '45' },
        locked: true,
        lockPosition: true,
        lockedProps: ['fuzz'],
      },
      ...donutTargets(),
    ],
  },

  // 6. smash ----------------------------------------------------------------------------------
  // Gao, 2026-10-15: "from level 7 and on, we want to introduce breakable boxes, if hit with enough
  // force, they just get destroyed" (level 7 was Timber!, the level after the removed Bullseye).
  // The crates' own first level, gentle (course rule: one new thing at a time): one tall wooden
  // crate (1x2) on the ground. Since the energy rule each fuzz flies its own arc, so the shot is
  // locked fast and flat (Max / 15): every fuzz comes in low and reaches the crate (a lob would
  // carry the light ones over it and drop the heavy ones short). The preset's Flower hits it and
  // bounces off (a light fuzz never passes the crate's break impulse, catalog.ts CRATE_BREAK); the
  // Fur, Helmet and Metal all smash it (anywhere from 21 to 24 m; Medium / 45 on a 1x1 crate, the
  // first version, now sails the Flower over it). The goal counts smashed crates, so shoving the
  // crate over does not count. No `introduces`: crates are a target, not a drawer row.
  {
    id: 'smash',
    title: 'Smash it',
    bruno: 'Crates break if you hit them hard enough. Can we smash that one?',
    goals: [{ metric: 'smashed', op: '>=', value: 1, label: 'Crate smashed' }],
    palette: [],
    shots: 3,
    parts: [
      {
        id: 1,
        kind: 'catapult',
        x: 5,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Max', angle: '15', fuzz: 'Flower' },
        locked: true,
        lockPosition: true,
        lockedProps: ['power', 'angle'],
      },
      crateBlock(2, SMASH_CRATE_X, 1, '1x2'),
    ],
    hints: [
      'A good hit, but the little Flower just bounced off the crate.',
      'Power and angle are locked. Tap the catapult. Which fuzz hits harder?',
      'Pick a heavier fuzz, like Fur or Metal. Same shot, much harder hit.',
    ],
    failHints: { outOfShots: "Out of fuzzes. That crate needs a harder hit. Let's try a heavier fuzz." },
    solution: [
      {
        id: 1,
        kind: 'catapult',
        x: 5,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Max', angle: '15', fuzz: 'Fur' },
        locked: true,
        lockPosition: true,
        lockedProps: ['power', 'angle'],
      },
      crateBlock(2, SMASH_CRATE_X, 1, '1x2'),
    ],
  },

  // 7. longshot -------------------------------------------------------------------------------
  // Gao, 2026-10-15: a light fuzz needs a reason to exist - here it is the answer. Power is locked
  // at Medium; angle, fuzz and arm are free. A can stands on a crate on a low shelf 13.5 m out
  // (shelf x 18.5, y 1): at Medium power only the light fuzzes get there. One-shot sweep of all 50
  // tunings (5 angles x 5 fuzzes x 2 arms): 8 pass, every one a Flower (15 Long, 30 Short, 45
  // Short, 60 Long) or a Donut (15 Long, 30 Short and Long, 45 Long); the Fur, Helmet and Metal
  // never reach at any angle or arm (levels.test.ts proves it). The shelf keeps a heavy fuzz from
  // rolling in along the ground (with the crate on the ground the Fur and Helmet did, at 15
  // degrees). The preset's Metal lands about 7 m out.
  {
    id: 'longshot',
    title: 'Long shot',
    bruno: "That can is way out there, and power is stuck at Medium. How can we reach it?",
    goals: [{ metric: 'knockedDown', op: '>=', value: 1, label: 'Can knocked down' }],
    palette: [],
    shots: 3,
    parts: longShotParts({ angle: '45', fuzz: 'Metal' }),
    hints: [
      'The heavy Metal fuzz drops way short. Power is locked, so what else can change?',
      'The bands push every fuzz the same. A lighter fuzz leaves faster and flies farther.',
      'Try the light Flower at 45 degrees. It sails all the way to the can.',
    ],
    failHints: { outOfShots: "Out of fuzzes. A heavy fuzz can't get that far. Let's try a lighter one." },
    solution: longShotParts({ angle: '45', fuzz: 'Flower' }),
    altSolutions: [
      { angle: '30', fuzz: 'Flower', arm: 'Short' },
      { angle: '60', fuzz: 'Flower', arm: 'Long' },
      { angle: '30', fuzz: 'Donut', arm: 'Long' },
    ],
  },

  // 8. tower -----------------------------------------------------------------------------------
  // Blocks are not glued, so a solid hit drops the whole column. High power at 45 degrees (robust
  // from about catX 4.0-5.5 and angle 40-50) knocks down all four blocks; the can rides the
  // collapse down but is not reliably latched as "knocked", so the goal is set to 4. Since
  // 2026-10-15 the bottom block is a crate: smash it and the whole column drops a metre, which
  // knocks everything down (the solution smashes it and downs all five). 36 of 200 tunings pass in
  // one shot (18 of the old 120; it was 17 of 200 with the wood block), now from Medium power up.
  // Energy rule (2026-10-15): 32 of 200 pass, from Medium up; the Metal now lands short at High
  // (9.8 m at 45 degrees), so the solution is Max / 45 / Metal (High / 45 with the Helmet passes too).
  {
    id: 'tower',
    title: 'Timber!',
    bruno: 'A tower of blocks with a crate at the bottom! Where should we hit it?',
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
      crateBlock(2, 19.5, 0.5),
      { id: 3, kind: 'block', x: 19.5, y: 1.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 4, kind: 'block', x: 19.5, y: 2.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 5, kind: 'block', x: 19.5, y: 3.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 6, kind: 'can', x: 19.5, y: 4.4, props: { ...defaultProps('can') }, locked: true, lockPosition: true },
    ],
    hints: [
      "That soft, low toss does not even reach the tower.",
      'Smash the crate at the bottom and the whole tower drops. A heavy fuzz needs lots of power.',
      'Try Max power, angle 45 and the Metal fuzz. That sends the whole tower tumbling.',
    ],
    failHints: { outOfShots: "Out of fuzzes. Let's hit the tower harder this time." },
    solution: [
      {
        id: 1,
        kind: 'catapult',
        x: 4.5,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Max', angle: '45', fuzz: 'Metal' },
        locked: true,
        lockPosition: true,
      },
      crateBlock(2, 19.5, 0.5),
      { id: 3, kind: 'block', x: 19.5, y: 1.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 4, kind: 'block', x: 19.5, y: 2.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 5, kind: 'block', x: 19.5, y: 3.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 6, kind: 'can', x: 19.5, y: 4.4, props: { ...defaultProps('can') }, locked: true, lockPosition: true },
    ],
  },

  // 9. line -----------------------------------------------------------------------------------
  // 2026-10-15: the bottom block is a crate (15 of 200 tunings pass in one shot, 9 of the old 120;
  // 12 of 200 with wood); the solution smashes it and the tower above drops onto the wreck.
  // Huddle 2026-09-22: once there are real structures, the goal can be broader than a target -
  // nothing may stay above the line, knock it down any way you like. Deviation from the brief's
  // 2-wide x 3-high tower: in the live sim a 2-wide wood tower is too stable for a fuzz (the Metal
  // fuzz at High power never leaves fewer than 2 blocks above 1.5 m in one shot, and only three
  // knife-edge 3-shot sequences pass), so the tower is one block wide: three 1x1 wood blocks
  // capped by a 2x1 plank, a top-heavy stack 12 m out. Energy rule (2026-10-15): 15 of 200 still
  // pass, but the heavy fuzzes need more power now: Metal/Max/30/Short (the solution) topples it in
  // one shot; so do Metal/Max/45 and Helmet/Max/15 (Short), Metal/Max/15 and Helmet/High/30 (Long).
  // (Metal/High/30/Short, the solution before the energy rule, now lands short.)
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
      crateBlock(2, 17, 0.5),
      { id: 3, kind: 'block', x: 17, y: 1.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 4, kind: 'block', x: 17, y: 2.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 5, kind: 'block', x: 17, y: 3.5, props: { ...defaultProps('block'), size: '2x1', material: 'wood' }, locked: true, lockPosition: true },
    ],
    hints: [
      'A soft toss with a light fuzz does not even reach the tower.',
      'Pick a heavy fuzz with lots of power, then aim a fast, flat shot low. That crate can break.',
      'Try Max power, 30 degrees and the Metal fuzz. The whole stack comes crashing down.',
    ],
    failHints: { outOfShots: "Out of fuzzes! Some of the tower is still above the line. Let's hit it harder." },
    markers: [{ kind: 'hline', y: 1.5, color: 0xffc629, label: 'Nothing above this line!' }],
    solution: [
      {
        id: 1,
        kind: 'catapult',
        x: 5,
        y: 0,
        props: { ...defaultProps('catapult'), power: 'Max', angle: '30', fuzz: 'Metal' },
        locked: true,
        lockPosition: true,
      },
      crateBlock(2, 17, 0.5),
      { id: 3, kind: 'block', x: 17, y: 1.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 4, kind: 'block', x: 17, y: 2.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 5, kind: 'block', x: 17, y: 3.5, props: { ...defaultProps('block'), size: '2x1', material: 'wood' }, locked: true, lockPosition: true },
    ],
  },

  // 10. chain ----------------------------------------------------------------------------------
  // The over-the-top moment: one fuzz tips the first domino and the row goes down in sequence
  // (CRASH! fires on the third). Deviation from the brief's 1x2 blocks: a 1 m-wide block is too
  // squat to knock its neighbour over (at 1.4 m apart a hit one just leans on the next and no
  // shot topples more than two), so these are 'domino' slabs (0.4 x 2 m wood). Lying flat they
  // stand 0.4 m tall, under the 1.2 m line. The solution (Medium power, 30 degrees, defaults
  // otherwise) is wide: Medium power at 15/30/45 with the Flower or Fur fuzz on the Short arm all
  // pass; a shot that lands past the first domino leaves it standing. 2026-10-15: the last domino
  // is a crate, so the row ends with a smash when it slams down (44 of the 46 one-shot passes over
  // 200 tunings break it; it was 46 passes with wood). Energy rule (2026-10-15): 45 of 200 pass;
  // the Fur and Helmet at Medium / 15-45 still do, the Flower at Medium / 30 now flies past.
  {
    id: 'chain',
    title: 'Chain reaction',
    bruno: 'Five dominoes in a row, and the last one is a crate. Which one should we hit first?',
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
      crateBlock(6, 20.6, 1, 'domino'),
    ],
    hints: [
      'That toss lands short. The fuzz has to reach the very first domino.',
      'Hit the first domino. If you hit one in the middle, the ones behind it stay standing.',
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
      crateBlock(6, 20.6, 1, 'domino'),
    ],
  },

  // 11-14. stack levels --------------------------------------------------------------------------
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
  // other passing tunings, each proven on its own by levels.test.ts. 2026-10-15: each stack has
  // crates in it now (see each level), re-swept: every one is a little more lenient than before.
  // Energy rule (2026-10-15, catalog.ts launchSpeed): re-swept over all 200 tunings again (counts in
  // each level's comment). The preset is now Low / 45 with the Metal: since the rule the Flower at
  // Low flies 8 m and reached three of the four stacks, while the heavy Metal at Low drops about
  // 3.4 m out - and shows the new rule on the first shot.

  // 11. pyramid -------------------------------------------------------------------------------
  // A 3-2-1 wood pyramid at x = 13 with two blocks balanced on its peak, each half hanging off.
  // Line 3.5 (peak 3, hat blocks' tops 4): knock both hat blocks down. 29 of those 120 tunings pass
  // in one shot (Low 4, Medium 16, High 4, Max 5). 2026-10-15: the hat is two crates, which smash
  // when they hit the ground: 55 of 200 pass (31 of the old 120), every pass smashing both.
  // Energy rule: 51 of 200 (Low 5, Medium 21, High 17, Max 8); the Metal at Low no longer gets there.
  {
    id: 'pyramid',
    title: 'Pyramid hats',
    bruno: 'My pyramid is wearing two crates for a hat! Knock the hat off so nothing stays above the line.',
    goals: [{ metric: 'aboveLine', op: '==', value: 0, label: 'Nothing left above the line' }],
    palette: [],
    shots: 3,
    line: 3.5,
    parts: [stackCatapult(STACK_PRESET), ...pyramidStack()],
    hints: [
      'That heavy fuzz on Low power drops way short of the pyramid.',
      'Those two top crates are wobbly. Any good bump to the pyramid can shake them off.',
      'Lots of settings work here. A heavy fuzz needs more power, a light one flies far. Try a few!',
    ],
    failHints: { outOfShots: 'Out of fuzzes! The hat is still on. Try more power, or a lighter fuzz to reach farther.' },
    markers: [{ kind: 'hline', y: 3.5, color: LINE_COLOR, label: 'Nothing above this line!' }],
    solution: [stackCatapult({ power: 'Medium', angle: '45', fuzz: 'Fur' }), ...pyramidStack()],
    altSolutions: [
      { power: 'Low', angle: '30', fuzz: 'Flower', arm: 'Long' },
      { power: 'Medium', angle: '15', fuzz: 'Metal', arm: 'Short' },
      { power: 'High', angle: '30', fuzz: 'Metal', arm: 'Short' },
      { power: 'High', angle: '75', fuzz: 'Flower', arm: 'Short' },
      { power: 'Max', angle: '15', fuzz: 'Metal', arm: 'Short' },
    ],
  },

  // 12. towers --------------------------------------------------------------------------------
  // Two wood towers (a 1x2 post and a 1x1 each) at x = 15 with a 2x1 plank across them and a block
  // balanced on each end of the plank. Line 4.5 (plank top 4, end blocks' tops 5). 30 of those 120
  // tunings pass in one shot (Low 1, Medium 12, High 11, Max 6). 2026-10-15: each tower's top block
  // is a crate; smash one and the plank drops: 57 of 200 pass (33 of the old 120), 28 by a smash.
  // Energy rule: 56 of 200 (Low 4, Medium 20, High 20, Max 12); every recorded tuning still passes.
  {
    id: 'towers',
    title: 'Twin towers',
    bruno: 'Two towers with crates on top hold up a plank. Get both end blocks below the line!',
    goals: [{ metric: 'aboveLine', op: '==', value: 0, label: 'Nothing left above the line' }],
    palette: [],
    shots: 3,
    line: 4.5,
    parts: [stackCatapult(STACK_PRESET), ...towersStack()],
    hints: [
      'That heavy fuzz on Low power lands way short of the towers.',
      'Shake the towers and the end blocks slide off. Or smash a crate and the plank drops.',
      'Try more power, or a lighter fuzz to fly farther, then a flatter or higher angle. Plenty work!',
    ],
    failHints: { outOfShots: 'Out of fuzzes! A block is still up there. Try more power, or a heavier fuzz with it.' },
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

  // 13. wall ------------------------------------------------------------------------------------
  // A 2x1 plank wall at x = 13, bricks on the bottom row for a heavier feel: two brick planks, one
  // wood plank centered on them, then two wood planks balanced half off its ends. Line 2.5 (middle
  // row top 2, top row 3). 26 of those 120 tunings pass in one shot (Low 1, Medium 16, High 5,
  // Max 4). 2026-10-15: the top row is two 2x1 crates, which smash when they fall: 53 of 200 pass
  // (25 of the old 120), every pass smashing both. Energy rule: 48 of 200 (Low 7, Medium 20,
  // High 15, Max 6); the Metal at Medium / 45 now drops short, so the solution is the Fur there.
  {
    id: 'wall',
    title: 'Wobbly wall',
    bruno: 'A brick wall with two crates on top! Knock the top row down below the line.',
    goals: [{ metric: 'aboveLine', op: '==', value: 0, label: 'Nothing left above the line' }],
    palette: [],
    shots: 3,
    line: 2.5,
    parts: [stackCatapult(STACK_PRESET), ...wallStack()],
    hints: [
      'That heavy fuzz on Low power does not reach the wall yet.',
      'The bricks are heavy, but the top crates are only half on. Rattle the wall and they tip.',
      'Experiment! Try more power or a lighter fuzz, and try a few different angles.',
    ],
    failHints: { outOfShots: 'Out of fuzzes! A crate is still above the line. Try a new angle or more power.' },
    markers: [{ kind: 'hline', y: 2.5, color: LINE_COLOR, label: 'Nothing above this line!' }],
    solution: [stackCatapult({ power: 'Medium', angle: '45', fuzz: 'Fur' }), ...wallStack()],
    altSolutions: [
      { power: 'Low', angle: '30', fuzz: 'Flower', arm: 'Short' },
      { power: 'Medium', angle: '60', fuzz: 'Fur', arm: 'Short' },
      { power: 'High', angle: '15', fuzz: 'Metal', arm: 'Short' },
      { power: 'Max', angle: '15', fuzz: 'Metal', arm: 'Short' },
      { power: 'Low', angle: '15', fuzz: 'Fur', arm: 'Long' },
    ],
  },

  // 14. dominoes ------------------------------------------------------------------------------
  // Three wood dominoes lead into a small tower at x = 14 (a 1x2 post, a 2x1 plank, a block
  // balanced on each plank end). Hit the dominoes or the tower: either knocks the end blocks off.
  // Line 3.5 (plank top 3, end blocks' tops 4). 41 of those 120 tunings pass in one shot (Low 11,
  // Medium 13, High 10, Max 7) - the most lenient of the four, a fun finale before free play.
  // 2026-10-15: the plank is a 2x1 crate; smash it and the end blocks fall: 75 of 200 pass (41 of
  // the old 120). Energy rule: 77 of 200 (Low 17, Medium 23, High 20, Max 17); every recorded
  // tuning still passes.
  {
    id: 'dominoes',
    title: 'Domino drop',
    bruno: 'Dominoes, then a tower with a crate on top. How many ways can we bring it down?',
    goals: [{ metric: 'aboveLine', op: '==', value: 0, label: 'Nothing left above the line' }],
    palette: [],
    shots: 3,
    line: 3.5,
    parts: [stackCatapult(STACK_PRESET), ...dominoesStack()],
    hints: [
      'That heavy fuzz drops short on Low power. What would reach?',
      'Knock any domino and it pushes the rest into the tower. Or smash the crate on top!',
      'Try more power with that heavy fuzz, or a lighter fuzz. Lots of settings bring it down.',
    ],
    failHints: { outOfShots: 'Out of fuzzes! Something is still above the line. Try more power.' },
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

  // 15. free play ---------------------------------------------------------------------------
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
        // 2026-10-15 (Gao: "no more catapult moving"): the catapult stays where it is.
        lockPosition: true,
      },
      { id: 2, kind: 'shelf', x: 16.5, y: 2, props: { ...defaultProps('shelf'), length: '2' }, locked: true, lockPosition: true },
      { id: 3, kind: 'can', x: 16.5, y: 2.5, props: { ...defaultProps('can') }, locked: true, lockPosition: true },
      { id: 4, kind: 'bullseye', x: 25.5, y: 5, props: { ...defaultProps('bullseye') }, locked: true, lockPosition: true },
    ],
    hints: [
      'Add your own cans, blocks and walls from the palette. A block can be a crate, too.',
      'Stack blocks into your own tower, or line up a shelf just where you want it.',
      "There's no wrong answer in free play, just have fun flinging fuzzes!",
    ],
    failHints: { outOfShots: 'All out of fuzzes for now! Hit reset to fling some more.' },
  },
];

export function findLevel(id: string): CatapultLevel | undefined {
  return LEVELS.find((level) => level.id === id);
}
