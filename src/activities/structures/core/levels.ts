// Structural Stability: "Bruno builds a theme park for fuzzes." The child stacks blocks and
// beams, puts a fuzz on top, presses Play, and a test (shake, wind or blast) tries to bring it
// down. Units are meters, y up, ground top at y = 0. See core/types.ts for the frozen shapes.
//
// Glue (touching parts sticking together) is on everywhere (the default) from level 1 - a glued
// stack behaves as one rigid rocking body under shake, which is what makes `base`'s "wide base"
// lesson work at all. Level 5 ("glue") is where Bruno calls out that weak (wood) glue can snap
// under a sharp enough hit, while heavier materials hold.
import { defaultProps } from './catalog';
import type { StructuresLevel } from './types';

const KEEP_ABOVE_COLOR = 0xffb40f;
const KEEP_ABOVE_LABEL = 'Keep the fuzz above here';

export const LEVELS: StructuresLevel[] = [
  // 1. stack -----------------------------------------------------------------------------
  {
    id: 'stack',
    title: 'Stack it up',
    bruno:
      "My fuzz needs a lookout tower! Stack some blocks up nice and high so it can see over the wall. Just keep it above that gold line.",
    goals: [{ metric: 'fuzzHeight', op: '>=', value: 2.5, label: 'Fuzz above 2.5 m' }],
    palette: ['block'],
    parts: [{ id: 1, kind: 'fuzz', x: 12, y: 0.4, props: { ...defaultProps('fuzz') } }],
    hints: [
      'The fuzz is just sitting on the ground. It needs to get up high, above the gold line.',
      'Add a block from the palette, then add another and drop it on top of the first.',
      'Stack three 1x1 blocks straight on top of each other at the same spot, then drag the fuzz onto the very top block.',
    ],
    failHints: {
      collapsed: 'Something toppled before the fuzz could settle. Try stacking the blocks straight, one right above the other.',
    },
    test: { kind: 'none', duration: 3 },
    keepAbove: 2.5,
    markers: [{ kind: 'hline', y: 2.5, color: KEEP_ABOVE_COLOR, label: KEEP_ABOVE_LABEL }],
    solution: [
      { id: 1, kind: 'fuzz', x: 12, y: 3.4, props: { ...defaultProps('fuzz') } },
      { id: 2, kind: 'block', x: 12, y: 0.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' } },
      { id: 3, kind: 'block', x: 12, y: 1.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' } },
      { id: 4, kind: 'block', x: 12, y: 2.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' } },
    ],
  },

  // 2. base ------------------------------------------------------------------------------
  // Glue is on: the column is one rigid rocking body, exactly the case the plan describes ("a
  // glued column rocks and topples as one unit"). A slow, wide shake pulse (low frequency, large
  // amplitude, peak accel kept under the ~6.5 m/s^2 friction limit so the base doesn't just slide)
  // topples the 1-wide column but not the 2-wide-footed one.
  {
    id: 'base',
    title: 'Shake it',
    bruno:
      "I built my fuzz a tall tower! Touching parts stick together now, but a tall thin tower still rocks right over when the ground shakes.",
    goals: [
      { metric: 'fuzzHeight', op: '>=', value: 4, label: 'Fuzz above 4 m' },
      { metric: 'survivalTime', op: '>=', value: 8, label: 'Survives 8 s' },
    ],
    palette: ['block'],
    parts: [
      { id: 1, kind: 'block', x: 12, y: 1, props: { ...defaultProps('block'), size: '1x2', material: 'wood' }, locked: true, lockPosition: true },
      { id: 2, kind: 'block', x: 12, y: 3, props: { ...defaultProps('block'), size: '1x2', material: 'wood' }, locked: true, lockPosition: true },
      { id: 3, kind: 'fuzz', x: 12, y: 4.4, props: { ...defaultProps('fuzz') }, locked: true, lockPosition: true },
    ],
    hints: [
      'That skinny tower rocks right over the moment the ground starts shaking, even glued together.',
      'Add blocks beside the bottom of the tower to make its footing wider.',
      'Stick one block on each side of the tower, right at the bottom, so the whole thing has a wider foot to rock on.',
    ],
    failHints: {
      collapsed: "The tower rocked right over. A tall skinny base can't survive a shake, give it a wider foot.",
    },
    test: { kind: 'shake', duration: 10, amplitude: 0.3, frequency: 0.6 },
    keepAbove: 3.5,
    markers: [
      { kind: 'hline', y: 3.5, color: KEEP_ABOVE_COLOR, label: KEEP_ABOVE_LABEL },
      { kind: 'icon', p: { x: 1, y: 0.6 }, text: '〰' },
    ],
    solution: [
      { id: 1, kind: 'block', x: 12, y: 1, props: { ...defaultProps('block'), size: '1x2', material: 'wood' }, locked: true, lockPosition: true },
      { id: 2, kind: 'block', x: 12, y: 3, props: { ...defaultProps('block'), size: '1x2', material: 'wood' }, locked: true, lockPosition: true },
      { id: 3, kind: 'fuzz', x: 12, y: 4.4, props: { ...defaultProps('fuzz') }, locked: true, lockPosition: true },
      { id: 4, kind: 'block', x: 11, y: 0.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' } },
      { id: 5, kind: 'block', x: 13, y: 0.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' } },
    ],
  },

  // 3. material --------------------------------------------------------------------------
  // Tune only: a simple 1-wide 1x2 column, 2 tall. The fuzz has no wind force and its own rolling
  // resistance now, so it just rides out the wind as long as the column itself does not tip.
  {
    id: 'material',
    title: 'Heavy or light',
    bruno: "This tower keeps blowing right over in the wind! I think I built it out of the wrong stuff.",
    goals: [
      { metric: 'fuzzHeight', op: '>=', value: 3, label: 'Fuzz above 3 m' },
      { metric: 'survivalTime', op: '>=', value: 8, label: 'Survives 8 s' },
    ],
    palette: [],
    parts: [
      { id: 1, kind: 'block', x: 12, y: 1, props: { ...defaultProps('block'), size: '1x2', material: 'wood' }, locked: true, lockPosition: true },
      { id: 2, kind: 'block', x: 12, y: 3, props: { ...defaultProps('block'), size: '1x2', material: 'wood' }, locked: true, lockPosition: true },
      { id: 3, kind: 'fuzz', x: 12, y: 4.4, props: { ...defaultProps('fuzz') }, locked: true, lockPosition: true },
    ],
    hints: [
      'Wood blocks are light, and the wind just pushes this tower right down.',
      'Tap each block and check its material chip.',
      'Switch both blocks to steel, heavy enough to stand up to the wind.',
    ],
    failHints: {
      collapsed: "The wind knocked it flat. Heavier blocks won't blow over so easily.",
    },
    test: { kind: 'wind', duration: 8, strength: 6, from: 'left', ramp: 2 },
    keepAbove: 3,
    markers: [
      { kind: 'hline', y: 3, color: KEEP_ABOVE_COLOR, label: KEEP_ABOVE_LABEL },
      { kind: 'icon', p: { x: 0, y: 4 }, text: '\u{1F4A8}' },
    ],
    solution: [
      { id: 1, kind: 'block', x: 12, y: 1, props: { ...defaultProps('block'), size: '1x2', material: 'steel' }, locked: true, lockPosition: true },
      { id: 2, kind: 'block', x: 12, y: 3, props: { ...defaultProps('block'), size: '1x2', material: 'steel' }, locked: true, lockPosition: true },
      { id: 3, kind: 'fuzz', x: 12, y: 4.4, props: { ...defaultProps('fuzz') }, locked: true, lockPosition: true },
    ],
  },

  // 4. beam --------------------------------------------------------------------------------
  // Glue is on: once the beam is placed, the whole frame (both towers + beam) glues into one 5 m-
  // wide rigid unit, which rides out the same shake as `base` easily. The towers sit at x 9.5 and
  // 14.5 (not 9/15) so a 5 m beam gets a real 0.5 m bearing on each side instead of balancing on
  // a knife edge. The preset fails simply because the fuzz has nothing to rest on yet and drops.
  {
    id: 'beam',
    title: 'Bridge the gap',
    bruno: "There's a gap between my two towers and my fuzz has nowhere to stand! It needs a bridge.",
    goals: [
      { metric: 'fuzzHeight', op: '>=', value: 3.5, label: 'Fuzz above 3.5 m' },
      { metric: 'survivalTime', op: '>=', value: 8, label: 'Survives 8 s' },
    ],
    palette: ['beam', 'block'],
    parts: [
      { id: 1, kind: 'block', x: 9.5, y: 1, props: { ...defaultProps('block'), size: '1x2', material: 'brick' }, locked: true, lockPosition: true },
      { id: 2, kind: 'block', x: 9.5, y: 3, props: { ...defaultProps('block'), size: '1x2', material: 'brick' }, locked: true, lockPosition: true },
      { id: 3, kind: 'block', x: 14.5, y: 1, props: { ...defaultProps('block'), size: '1x2', material: 'brick' }, locked: true, lockPosition: true },
      { id: 4, kind: 'block', x: 14.5, y: 3, props: { ...defaultProps('block'), size: '1x2', material: 'brick' }, locked: true, lockPosition: true },
      { id: 5, kind: 'fuzz', x: 12, y: 4.6, props: { ...defaultProps('fuzz') } },
    ],
    hints: [
      'The fuzz has nothing to stand on between those two towers.',
      'Add a beam from the palette and lay it flat across the tops of both towers.',
      'Use the long beam (5 m) so it reaches both towers, then drag the fuzz onto it.',
    ],
    failHints: {
      collapsed: 'The bridge gave way. Make sure the beam reaches both towers and the fuzz sits right on top of it.',
    },
    test: { kind: 'shake', duration: 10, amplitude: 0.3, frequency: 0.6 },
    keepAbove: 3.5,
    markers: [
      { kind: 'hline', y: 3.5, color: KEEP_ABOVE_COLOR, label: KEEP_ABOVE_LABEL },
      { kind: 'icon', p: { x: 1, y: 0.6 }, text: '〰' },
    ],
    solution: [
      { id: 1, kind: 'block', x: 9.5, y: 1, props: { ...defaultProps('block'), size: '1x2', material: 'brick' }, locked: true, lockPosition: true },
      { id: 2, kind: 'block', x: 9.5, y: 3, props: { ...defaultProps('block'), size: '1x2', material: 'brick' }, locked: true, lockPosition: true },
      { id: 3, kind: 'block', x: 14.5, y: 1, props: { ...defaultProps('block'), size: '1x2', material: 'brick' }, locked: true, lockPosition: true },
      { id: 4, kind: 'block', x: 14.5, y: 3, props: { ...defaultProps('block'), size: '1x2', material: 'brick' }, locked: true, lockPosition: true },
      { id: 5, kind: 'fuzz', x: 12, y: 4.7, props: { ...defaultProps('fuzz') } },
      { id: 6, kind: 'beam', x: 12, y: 4.15, props: { ...defaultProps('beam'), length: '5', material: 'steel' } },
    ],
  },

  // 5. glue --------------------------------------------------------------------------------
  // Glue arrives: touching parts stick, but each material's glue snaps once the seam's relative
  // speed passes a threshold (wood 3 m/s, steel 9). The tower's centre of mass sits inside the
  // tower's footprint (so it rests fine on its own before the blast, not because glue is holding
  // it up), but the beam's overhang means the blast's kick is what glue must resist.
  {
    id: 'glue',
    title: 'Snap!',
    bruno: "My cantilever looks great, until something goes boom nearby. Touching parts stick together, but weak glue can still snap clean off when the blast hits.",
    goals: [
      { metric: 'fuzzHeight', op: '>=', value: 3, label: 'Fuzz above 3 m' },
      { metric: 'survivalTime', op: '>=', value: 6, label: 'Survives 6 s' },
    ],
    palette: [],
    parts: [
      { id: 1, kind: 'block', x: 8, y: 0.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 2, kind: 'block', x: 8, y: 1.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 3, kind: 'block', x: 8, y: 2.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 4, kind: 'beam', x: 7.7, y: 3.15, props: { ...defaultProps('beam'), length: '3', material: 'wood' }, locked: true, lockPosition: true },
      { id: 5, kind: 'fuzz', x: 8.5, y: 3.7, props: { ...defaultProps('fuzz') }, locked: true, lockPosition: true },
    ],
    hints: [
      'Wood glue is weak, and that blast is strong enough to snap it clean off.',
      'Tap the top block and the beam and look at their material chips.',
      'Switch the top block and the beam to steel, steel glue is strong enough to survive the blast.',
    ],
    failHints: {
      collapsed: 'Snap! The blast broke the glue and the beam came down with the fuzz. Try a stronger material.',
    },
    test: { kind: 'blast', duration: 6, at: { x: 9.7, y: 1.8 }, impulse: 6, delay: 1 },
    keepAbove: 3,
    markers: [
      { kind: 'hline', y: 3, color: KEEP_ABOVE_COLOR, label: KEEP_ABOVE_LABEL },
      { kind: 'icon', p: { x: 9.7, y: 1.8 }, text: '\u{1F4A5}' },
    ],
    solution: [
      { id: 1, kind: 'block', x: 8, y: 0.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 2, kind: 'block', x: 8, y: 1.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 3, kind: 'block', x: 8, y: 2.5, props: { ...defaultProps('block'), size: '1x1', material: 'steel' }, locked: true, lockPosition: true },
      { id: 4, kind: 'beam', x: 7.7, y: 3.15, props: { ...defaultProps('beam'), length: '3', material: 'steel' }, locked: true, lockPosition: true },
      { id: 5, kind: 'fuzz', x: 8.5, y: 3.7, props: { ...defaultProps('fuzz') }, locked: true, lockPosition: true },
    ],
  },

  // 6. wind --------------------------------------------------------------------------------
  // Glue is on: the child's bracing glues to the column, and (per the new rule) a shake or wind
  // cannot break glue, so a glued, wide, heavy assembly simply does not tip. The fuzz has no wind
  // force of its own, so once the column stands, it stands.
  {
    id: 'wind',
    title: 'Windy day',
    bruno: "My fuzz is way up high, and a strong wind is coming! I'm worried it'll get blown right off.",
    goals: [
      { metric: 'fuzzHeight', op: '>=', value: 4, label: 'Fuzz above 4 m' },
      { metric: 'survivalTime', op: '>=', value: 10, label: 'Survives 10 s' },
    ],
    palette: ['block', 'beam'],
    parts: [
      { id: 1, kind: 'block', x: 12, y: 1, props: { ...defaultProps('block'), size: '1x2', material: 'brick' }, locked: true, lockPosition: true },
      { id: 2, kind: 'block', x: 12, y: 3, props: { ...defaultProps('block'), size: '1x2', material: 'brick' }, locked: true, lockPosition: true },
      { id: 3, kind: 'fuzz', x: 12, y: 4.4, props: { ...defaultProps('fuzz') }, locked: true, lockPosition: true },
    ],
    hints: [
      'That column is tall and skinny, a strong wind will push it right over.',
      'Add heavy blocks to brace the column, especially on the side the wind is blowing from.',
      'Stack brick blocks two layers high against both sides of the column so it cannot be pushed over.',
    ],
    failHints: {
      collapsed: 'The wind won. Brace the column with heavy blocks on the side facing the wind (and behind it too).',
    },
    test: { kind: 'wind', duration: 10, strength: 12, from: 'left', ramp: 2 },
    keepAbove: 4,
    markers: [
      { kind: 'hline', y: 4, color: KEEP_ABOVE_COLOR, label: KEEP_ABOVE_LABEL },
      { kind: 'icon', p: { x: 0, y: 4 }, text: '\u{1F4A8}' },
    ],
    solution: [
      { id: 1, kind: 'block', x: 12, y: 1, props: { ...defaultProps('block'), size: '1x2', material: 'brick' }, locked: true, lockPosition: true },
      { id: 2, kind: 'block', x: 12, y: 3, props: { ...defaultProps('block'), size: '1x2', material: 'brick' }, locked: true, lockPosition: true },
      { id: 3, kind: 'fuzz', x: 12, y: 4.4, props: { ...defaultProps('fuzz') }, locked: true, lockPosition: true },
      { id: 4, kind: 'block', x: 10.5, y: 0.5, props: { ...defaultProps('block'), size: '2x1', material: 'brick' } },
      { id: 5, kind: 'block', x: 10.5, y: 1.5, props: { ...defaultProps('block'), size: '2x1', material: 'brick' } },
      { id: 6, kind: 'block', x: 13.5, y: 0.5, props: { ...defaultProps('block'), size: '2x1', material: 'brick' } },
      { id: 7, kind: 'block', x: 13.5, y: 1.5, props: { ...defaultProps('block'), size: '2x1', material: 'brick' } },
    ],
  },

  // 7. blast -------------------------------------------------------------------------------
  // Glue is on. The blast sits close to the tower (about 2 m away); a wall between them shields
  // both the tower's own blocks and the fuzz (which only gets 20% of the impulse in the first
  // place, and has rolling resistance of its own now).
  {
    id: 'blast',
    title: 'Kaboom',
    bruno: "There's a blast going off near my tower and I'm worried it'll knock my fuzz right down!",
    goals: [
      { metric: 'fuzzHeight', op: '>=', value: 3, label: 'Fuzz above 3 m' },
      { metric: 'partsFell', op: '<=', value: 1, label: 'At most 1 part falls' },
    ],
    palette: ['block'],
    parts: [
      { id: 1, kind: 'block', x: 14, y: 0.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 2, kind: 'block', x: 14, y: 1.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 3, kind: 'block', x: 14, y: 2.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 4, kind: 'fuzz', x: 14, y: 3.4, props: { ...defaultProps('fuzz') }, locked: true, lockPosition: true },
    ],
    hints: [
      'That blast is close enough to knock pieces right off the tower.',
      'Add a wall of blocks between the blast and the tower to shield it.',
      'Build a wall of brick or steel blocks right between the blast point and the tower to soak up the blow.',
    ],
    failHints: {
      collapsed: 'The blast reached the tower and knocked the fuzz down. Put something heavy in the way to shield it.',
    },
    test: { kind: 'blast', duration: 6, at: { x: 12, y: 1.5 }, impulse: 12, delay: 1 },
    keepAbove: 3,
    markers: [
      { kind: 'hline', y: 3, color: KEEP_ABOVE_COLOR, label: KEEP_ABOVE_LABEL },
      { kind: 'icon', p: { x: 12, y: 1.5 }, text: '\u{1F4A5}' },
    ],
    solution: [
      { id: 1, kind: 'block', x: 14, y: 0.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 2, kind: 'block', x: 14, y: 1.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 3, kind: 'block', x: 14, y: 2.5, props: { ...defaultProps('block'), size: '1x1', material: 'wood' }, locked: true, lockPosition: true },
      { id: 4, kind: 'fuzz', x: 14, y: 3.4, props: { ...defaultProps('fuzz') }, locked: true, lockPosition: true },
      { id: 5, kind: 'block', x: 13, y: 1, props: { ...defaultProps('block'), size: '1x2', material: 'brick' } },
      { id: 6, kind: 'block', x: 13, y: 3, props: { ...defaultProps('block'), size: '1x2', material: 'brick' } },
    ],
  },

  // 8. budget ------------------------------------------------------------------------------
  {
    id: 'budget',
    title: 'Sky high',
    bruno: "I want my fuzz way up high this time, but I've only got a few blocks and beams to spare!",
    goals: [
      { metric: 'fuzzHeight', op: '>=', value: 6, label: 'Fuzz above 6 m' },
      { metric: 'survivalTime', op: '>=', value: 8, label: 'Survives 8 s' },
      { metric: 'partCount', op: '<=', value: 8, label: 'At most 8 parts' },
    ],
    palette: ['block', 'beam'],
    parts: [{ id: 1, kind: 'fuzz', x: 12, y: 0.4, props: { ...defaultProps('fuzz') } }],
    hints: [
      "The fuzz needs to get really high this time, but you don't have parts to waste.",
      'Build a wide, sturdy base first, then a narrower column on top to save parts.',
      'Use four blocks for a wide base and two more stacked on top for height, that is six parts plus the fuzz.',
    ],
    failHints: {
      collapsed: 'It came down before it got high enough. Make sure the base is wide before you build up.',
    },
    test: { kind: 'shake', duration: 10, amplitude: 0.3, frequency: 0.6 },
    keepAbove: 6,
    markers: [
      { kind: 'hline', y: 6, color: KEEP_ABOVE_COLOR, label: KEEP_ABOVE_LABEL },
      { kind: 'icon', p: { x: 1, y: 0.6 }, text: '〰' },
    ],
    solution: [
      { id: 1, kind: 'fuzz', x: 12, y: 6.4, props: { ...defaultProps('fuzz') } },
      { id: 2, kind: 'block', x: 11, y: 0.5, props: { ...defaultProps('block'), size: '2x1', material: 'wood' } },
      { id: 3, kind: 'block', x: 13, y: 0.5, props: { ...defaultProps('block'), size: '2x1', material: 'wood' } },
      { id: 4, kind: 'block', x: 11, y: 1.5, props: { ...defaultProps('block'), size: '2x1', material: 'wood' } },
      { id: 5, kind: 'block', x: 13, y: 1.5, props: { ...defaultProps('block'), size: '2x1', material: 'wood' } },
      { id: 6, kind: 'block', x: 12, y: 3, props: { ...defaultProps('block'), size: '1x2', material: 'wood' } },
      { id: 7, kind: 'block', x: 12, y: 5, props: { ...defaultProps('block'), size: '1x2', material: 'wood' } },
    ],
  },

  // 9. free play ---------------------------------------------------------------------------
  {
    id: 'free',
    title: 'Free play',
    bruno: 'No rules this time. Build whatever wild tower you like for your fuzzes!',
    goals: [],
    palette: ['block', 'beam', 'fuzz'],
    parts: [{ id: 1, kind: 'fuzz', x: 12, y: 0.4, props: { ...defaultProps('fuzz') } }],
    hints: ['Try mixing blocks and beams.', 'Build tall, wide, or both!', "There's no wrong answer in free play!"],
    failHints: {
      collapsed: 'Everything came down. Try again with a wider or sturdier build.',
    },
    test: { kind: 'shake', duration: 8, amplitude: 0.12, frequency: 1 },
    keepAbove: 0,
    markers: [
      { kind: 'hline', y: 0, color: KEEP_ABOVE_COLOR, label: KEEP_ABOVE_LABEL },
      { kind: 'icon', p: { x: 1, y: 0.6 }, text: '〰' },
    ],
  },
];

export function findLevel(id: string): StructuresLevel | undefined {
  return LEVELS.find((level) => level.id === id);
}
