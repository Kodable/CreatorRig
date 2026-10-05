import type { GoldbergLevel } from './types';
import { defaultProps } from './catalog';

export const LEVELS: GoldbergLevel[] = [
  // 1. angle -----------------------------------------------------------------
  {
    id: 'angle',
    title: 'Tilt the ramp',
    bruno: "I built my fuzz a ramp, but it's too gentle. The fuzz just stops before the gate! Fuzzes need more zoom to make it all the way.",
    goals: [
      { metric: 'reachedGate', op: '==', value: 1, label: 'Fuzz reaches the gate' }
    ],
    palette: [],
    parts: [
      { id: 1, kind: 'ramp', x: 4, y: 0, props: { ...defaultProps('ramp'), angle: '15', flip: 'No', size: 'Medium' }, locked: true, lockPosition: true },
      { id: 2, kind: 'fuzz', x: 2.7, y: 4.0, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 3, kind: 'gate', x: 13, y: 0, props: { ...defaultProps('gate'), openTime: '0' }, locked: true, lockPosition: true }
    ],
    hints: [
      "That ramp is too gentle for the fuzz to keep rolling all the way to the gate.",
      "Tap the ramp and open its angle chips.",
      "Set the ramp's angle to 30 or 45 degrees so the fuzz keeps enough speed to reach the far gate."
    ],
    failHints: {
      tooEarly: "The fuzz reached the gate before it even opened. Check the gate's timer.",
      settled: "The fuzz ran out of speed and stopped before the gate. Make the ramp steeper.",
      timeout: "The fuzz never picked up enough speed to cross the park. Give the ramp a bigger angle."
    },
    solution: [
      { id: 1, kind: 'ramp', x: 4, y: 0, props: { ...defaultProps('ramp'), angle: '30', flip: 'No', size: 'Medium' }, locked: true, lockPosition: true },
      { id: 2, kind: 'fuzz', x: 2.7, y: 4.0, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 3, kind: 'gate', x: 13, y: 0, props: { ...defaultProps('gate'), openTime: '0' }, locked: true, lockPosition: true }
    ]
  },

  // 2. flip --------------------------------------------------------------
  {
    id: 'flip',
    title: 'Flip it',
    bruno: "My fuzz keeps rolling the wrong way off this ramp! I think I built it backwards.",
    goals: [
      { metric: 'reachedGate', op: '==', value: 1, label: 'Fuzz reaches the gate' }
    ],
    palette: [],
    parts: [
      { id: 1, kind: 'ramp', x: 6, y: 0, props: { ...defaultProps('ramp'), angle: '30', flip: 'Yes', size: 'Medium' }, locked: true, lockPosition: true },
      { id: 2, kind: 'fuzz', x: 6, y: 1.33, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 3, kind: 'gate', x: 12, y: 0, props: { ...defaultProps('gate'), openTime: '0' }, locked: true, lockPosition: true }
    ],
    hints: [
      "The ramp's high side is facing away from the gate.",
      "Tap the ramp and look at the flip chip.",
      "Set flip to No so the high side is away from the gate and the fuzz rolls toward it."
    ],
    failHints: {
      tooEarly: "The fuzz reached the gate before it opened. Check the gate's timer.",
      settled: "The fuzz rolled off the wrong side of the ramp and stopped there. Flip the ramp.",
      timeout: "The fuzz never got moving toward the gate. Check which way the ramp faces."
    },
    solution: [
      { id: 1, kind: 'ramp', x: 6, y: 0, props: { ...defaultProps('ramp'), angle: '30', flip: 'No', size: 'Medium' }, locked: true, lockPosition: true },
      { id: 2, kind: 'fuzz', x: 6, y: 1.33, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 3, kind: 'gate', x: 12, y: 0, props: { ...defaultProps('gate'), openTime: '0' }, locked: true, lockPosition: true }
    ]
  },

  // 3. add-ramp ------------------------------------------------------------
  {
    id: 'add-ramp',
    title: 'Add a ramp',
    bruno: "My fuzz is stuck up on this platform with nowhere to go! It needs a ramp to slide down to the gate.",
    goals: [
      { metric: 'reachedGate', op: '==', value: 1, label: 'Fuzz reaches the gate' }
    ],
    palette: ['ramp'],
    parts: [
      { id: 1, kind: 'platform', x: 5, y: 5, props: { ...defaultProps('platform'), length: 'Medium', rotation: '0' }, locked: true, lockPosition: true },
      { id: 2, kind: 'fuzz', x: 7.2, y: 5.55, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 3, kind: 'gate', x: 16, y: 0, props: { ...defaultProps('gate'), openTime: '0' }, locked: true, lockPosition: true }
    ],
    hints: [
      "The fuzz has nothing to land on when it falls off the platform.",
      "Add a ramp from the palette and drag it under the platform's edge.",
      "Point the ramp's high side toward the platform (flip No) so the fuzz rolls right down to the gate."
    ],
    failHints: {
      tooEarly: "The fuzz reached the gate before it opened. Check the gate's timer.",
      settled: "The fuzz landed and stopped short of the gate. Try a bigger ramp angle.",
      timeout: "The fuzz never made it down. Make sure the ramp actually catches it."
    },
    solution: [
      { id: 1, kind: 'platform', x: 5, y: 5, props: { ...defaultProps('platform'), length: 'Medium', rotation: '0' }, locked: true, lockPosition: true },
      { id: 2, kind: 'fuzz', x: 7.2, y: 5.55, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 3, kind: 'gate', x: 16, y: 0, props: { ...defaultProps('gate'), openTime: '0' }, locked: true, lockPosition: true },
      { id: 4, kind: 'ramp', x: 9, y: 0, props: { ...defaultProps('ramp'), angle: '45', flip: 'No', size: 'Large' } }
    ]
  },

  // 4. dominoes ------------------------------------------------------------
  {
    id: 'dominoes',
    title: 'Domino run',
    bruno: "Three little dominoes don't fall far enough for my fuzz's chain! I bet more dominoes reach further.",
    goals: [
      { metric: 'reachedGate', op: '==', value: 1, label: 'Fuzz reaches the gate' }
    ],
    palette: [],
    parts: [
      { id: 1, kind: 'ramp', x: 7.8, y: 0, props: { ...defaultProps('ramp'), angle: '30', flip: 'No', size: 'Medium' }, locked: true, lockPosition: true },
      { id: 2, kind: 'fuzz', x: 6.6, y: 2.0, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 3, kind: 'domino', x: 10, y: 0, props: { ...defaultProps('domino'), count: '3' }, locked: true, lockPosition: true },
      { id: 4, kind: 'gate', x: 14.9, y: 0, props: { ...defaultProps('gate'), openTime: '0' }, locked: true, lockPosition: true }
    ],
    hints: [
      "Three dominoes fall in a much shorter line than the gate needs.",
      "Tap the domino run and check its count chip.",
      "Set count to 6 so the last domino topples right into the gate."
    ],
    failHints: {
      tooEarly: "The fuzz reached the gate before it opened. Check the gate's timer.",
      settled: "The domino chain stopped short of the gate. Add more dominoes.",
      timeout: "Nothing reached the gate in time. Check the domino count."
    },
    solution: [
      { id: 1, kind: 'ramp', x: 7.8, y: 0, props: { ...defaultProps('ramp'), angle: '30', flip: 'No', size: 'Medium' }, locked: true, lockPosition: true },
      { id: 2, kind: 'fuzz', x: 6.6, y: 2.0, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 3, kind: 'domino', x: 10, y: 0, props: { ...defaultProps('domino'), count: '6' }, locked: true, lockPosition: true },
      { id: 4, kind: 'gate', x: 14.9, y: 0, props: { ...defaultProps('gate'), openTime: '0' }, locked: true, lockPosition: true }
    ]
  },

  // 5. seesaw ------------------------------------------------------------
  {
    id: 'seesaw',
    title: 'Seesaw',
    bruno: "My fuzz drops right onto this seesaw, but the plank isn't there to catch it! I think the pivot is in the wrong spot.",
    goals: [
      { metric: 'reachedGate', op: '==', value: 1, label: 'Fuzz reaches the gate' }
    ],
    palette: [],
    parts: [
      { id: 1, kind: 'seesaw', x: 10, y: 1, props: { ...defaultProps('seesaw'), length: 'Medium', fulcrumPos: 'Middle', startState: 'LeftDown', hook: 'None' }, locked: true, lockPosition: true },
      { id: 2, kind: 'fuzz', x: 13.5, y: 6, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 3, kind: 'gate', x: 15.5, y: 0, props: { ...defaultProps('gate'), openTime: '0' }, locked: true, lockPosition: true }
    ],
    hints: [
      "The fuzz falls past the seesaw's raised end instead of landing on it.",
      "Tap the seesaw and check the fulcrumPos chip.",
      "Set fulcrumPos to Left so the raised end reaches under the fuzz and rolls it into the gate."
    ],
    failHints: {
      tooEarly: "The fuzz reached the gate before it opened. Check the gate's timer.",
      settled: "The fuzz missed the seesaw and just dropped to the ground. Move the pivot.",
      timeout: "The fuzz never made it to the gate. Check the seesaw's pivot."
    },
    solution: [
      { id: 1, kind: 'seesaw', x: 10, y: 1, props: { ...defaultProps('seesaw'), length: 'Medium', fulcrumPos: 'Left', startState: 'LeftDown', hook: 'None' }, locked: true, lockPosition: true },
      { id: 2, kind: 'fuzz', x: 13.5, y: 6, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 3, kind: 'gate', x: 15.5, y: 0, props: { ...defaultProps('gate'), openTime: '0' }, locked: true, lockPosition: true }
    ]
  },

  // 6. lever ------------------------------------------------------------
  {
    id: 'lever',
    title: 'Launch',
    bruno: "Drop one fuzz on the high end and watch the low end go! I just can't get the direction right.",
    goals: [
      { metric: 'reachedGate', op: '==', value: 1, label: 'Fuzz reaches the gate' }
    ],
    palette: [],
    parts: [
      { id: 1, kind: 'fuzz', x: 15.75, y: 5, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 2, kind: 'lever', x: 15, y: 1, props: { ...defaultProps('lever'), length: 'Medium', fulcrumPos: 'Edge', direction: 'Left' }, locked: true, lockPosition: true },
      { id: 3, kind: 'fuzz', x: 12.75, y: 0.42, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 4, kind: 'gate', x: 11.8, y: 0, props: { ...defaultProps('gate'), openTime: '0' }, locked: true, lockPosition: true }
    ],
    hints: [
      "The lever's high end is on the wrong side, so dropping fuzz A doesn't do anything to fuzz B.",
      "Tap the lever and check the direction chip.",
      "Set direction to Right so fuzz A's drop on the high end throws fuzz B toward the gate."
    ],
    failHints: {
      tooEarly: "The fuzz reached the gate before it opened. Check the gate's timer.",
      settled: "Fuzz B just sat there instead of launching. Check the lever's direction.",
      timeout: "Nothing reached the gate in time. Check the lever's high end."
    },
    solution: [
      { id: 1, kind: 'fuzz', x: 15.75, y: 5, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 2, kind: 'lever', x: 15, y: 1, props: { ...defaultProps('lever'), length: 'Medium', fulcrumPos: 'Edge', direction: 'Right' }, locked: true, lockPosition: true },
      { id: 3, kind: 'fuzz', x: 12.75, y: 0.42, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 4, kind: 'gate', x: 11.8, y: 0, props: { ...defaultProps('gate'), openTime: '0' }, locked: true, lockPosition: true }
    ]
  },

  // 7. timing ------------------------------------------------------------
  {
    id: 'timing',
    title: 'Wait for the gate',
    bruno: "This gate won't open for five whole seconds, but my fuzz gets there way too fast! I need to slow the trip down.",
    goals: [
      { metric: 'reachedGate', op: '==', value: 1, label: 'Fuzz reaches the gate' },
      { metric: 'elapsed', op: '>=', value: 5, label: 'Arrive after 5 seconds' }
    ],
    palette: ['platform', 'domino', 'seesaw'],
    parts: [
      { id: 1, kind: 'ramp', x: 5, y: 2, props: { ...defaultProps('ramp'), angle: '45', flip: 'No', size: 'Medium' }, locked: true, lockPosition: true },
      { id: 2, kind: 'fuzz', x: 3.7, y: 5.4, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 3, kind: 'gate', x: 14, y: 0, props: { ...defaultProps('gate'), openTime: '5' }, locked: true, lockPosition: true }
    ],
    hints: [
      "The fuzz gets to the gate before the door even opens.",
      "Add a seesaw under the ramp so the fuzz has to roll down its tipping plank first.",
      "Place the seesaw so the fuzz lands on it and takes its time crossing before the door opens at 5 seconds."
    ],
    failHints: {
      tooEarly: "The fuzz hit the closed door. Add more parts to slow it down.",
      settled: "The fuzz stopped before reaching the gate at all. Make the detour gentler.",
      timeout: "The fuzz never made it. Check that your detour still leads to the gate."
    },
    solution: [
      { id: 1, kind: 'ramp', x: 5, y: 2, props: { ...defaultProps('ramp'), angle: '45', flip: 'No', size: 'Medium' }, locked: true, lockPosition: true },
      { id: 2, kind: 'fuzz', x: 3.7, y: 5.4, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 3, kind: 'gate', x: 14, y: 0, props: { ...defaultProps('gate'), openTime: '5' }, locked: true, lockPosition: true },
      { id: 4, kind: 'seesaw', x: 8.3, y: 1, props: { ...defaultProps('seesaw'), length: 'Medium', fulcrumPos: 'Middle', startState: 'LeftDown', hook: 'None' } }
    ]
  },

  // 8. chain ------------------------------------------------------------
  {
    id: 'chain',
    title: 'Big chain',
    bruno: "A REALLY big chain reaction this time. I want to see at least six parts, with four of them actually moving!",
    goals: [
      { metric: 'reachedGate', op: '==', value: 1, label: 'Fuzz reaches the gate' },
      { metric: 'partsMoved', op: '>=', value: 4, label: '4 parts move' },
      { metric: 'partCount', op: '>=', value: 6, label: 'At least 6 parts' }
    ],
    palette: ['fuzz', 'platform', 'ramp', 'domino', 'seesaw', 'lever', 'gate'],
    parts: [
      { id: 1, kind: 'fuzz', x: 6.6, y: 2.0, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 2, kind: 'gate', x: 14.9, y: 0, props: { ...defaultProps('gate'), openTime: '0' }, locked: true, lockPosition: true }
    ],
    hints: [
      "One part won't cut it. The fuzz needs a ramp and a real domino chain to reach that far gate.",
      "Add a ramp so the fuzz rolls into a run of dominoes, then place a second domino run just 0.8 m past the first so the fall keeps going.",
      "Use three short domino runs back to back (2 dominoes each works) so the last one topples into the gate, plus a platform for extra parts."
    ],
    failHints: {
      tooEarly: "The fuzz reached the gate before it opened. Check the gate's timer.",
      settled: "Everything stopped before reaching the gate. Add another part to bridge the gap.",
      timeout: "Nothing reached the gate in time. Check every link in the chain."
    },
    solution: [
      { id: 1, kind: 'fuzz', x: 6.6, y: 2.0, props: { ...defaultProps('fuzz'), size: 'M' }, locked: true, lockPosition: true },
      { id: 2, kind: 'gate', x: 14.9, y: 0, props: { ...defaultProps('gate'), openTime: '0' }, locked: true, lockPosition: true },
      { id: 3, kind: 'ramp', x: 7.8, y: 0, props: { ...defaultProps('ramp'), angle: '30', flip: 'No', size: 'Medium' } },
      { id: 4, kind: 'domino', x: 10, y: 0, props: { ...defaultProps('domino'), count: '2' } },
      { id: 5, kind: 'domino', x: 11.6, y: 0, props: { ...defaultProps('domino'), count: '2' } },
      { id: 6, kind: 'domino', x: 13.2, y: 0, props: { ...defaultProps('domino'), count: '2' } },
      { id: 7, kind: 'platform', x: 25, y: 0.15, props: { ...defaultProps('platform'), length: 'Short', rotation: '0' } }
    ]
  },

  // 9. free play ------------------------------------------------------------
  {
    id: 'free',
    title: 'Free play',
    bruno: "No rules this time. Build whatever wild machine you like for your fuzzes!",
    goals: [],
    palette: ['fuzz', 'platform', 'ramp', 'domino', 'seesaw', 'lever', 'gate'],
    parts: [
      { id: 1, kind: 'fuzz', x: 3, y: 3, props: { ...defaultProps('fuzz'), size: 'M' } },
      { id: 2, kind: 'gate', x: 25, y: 0, props: { ...defaultProps('gate'), openTime: '0' } }
    ],
    hints: [
      "Try mixing ramps and dominoes.",
      "Add a seesaw or a lever for extra flair.",
      "There's no wrong answer in free play!"
    ],
    failHints: {
      tooEarly: "The fuzz hit a closed door. Try opening it sooner or slowing the fuzz down.",
      settled: "Everything came to rest. Add more parts to keep the chain going.",
      timeout: "Time ran out before anything settled. Simplify the machine and try again."
    }
  }
];

export function findLevel(id: string): GoldbergLevel | undefined {
  return LEVELS.find(level => level.id === id);
}
