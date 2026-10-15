import { Level } from './types';

export const LEVELS: Level[] = [
  {
    id: 'drop',
    title: 'Vertical drop',
    bruno: "I'm building a park for fuzzes. Let's drag the station up for a 15 meter drop!",
    goals: [
      { metric: 'maxDrop', op: '>=', value: 15, label: 'Drop at least 15 m' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    // 2026-10-15 (Gao): the end sits locked on the flag and nothing can be added, deleted or
    // looped: the only thing to do is drag the station, and it only slides up and down. Clear goes
    // back to this preset (canAdd false), so the locked end never becomes the station. The hand
    // drags the station up, then taps the fuzz button, then Play (src/core/coach.ts).
    preset: [{ x: 8, y: 14, kind: 'curve' }, { x: 52, y: 4, kind: 'curve', locked: true }],
    finish: { x: 52, y: 4, r: 2.5 },
    tools: [],
    canAdd: false,
    stationVertical: true,
    coach: ['drag-station', 'skin', 'play'],
    hints: {
      rolledBack: "The fuzz rolled back! Keep every hill lower than the station.",
      stuck: "The fuzz got stuck. Let it roll straight down to the flag.",
      fell: "Off the track! Let's drag the station up and roll straight to the flag."
    }
  },
  {
    id: 'complete',
    title: 'Complete the track',
    bruno: "I built the first part. Let's tap the track or sky to add points to the flag.",
    goals: [
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    preset: [
      { x: 5, y: 22, kind: 'curve', locked: true },
      { x: 14, y: 20, kind: 'curve', locked: true },
      { x: 22, y: 12, kind: 'curve', locked: true }
    ],
    finish: { x: 54, y: 3, r: 2.5 },
    // Loops wait for the loop lesson. The hand taps the sky about two thirds of the way to the
    // flag, where the recorded solution's first point goes (levels.test.ts).
    tools: ['point'],
    coach: ['add-point'],
    coachSpot: { x: 40, y: 5 },
    hints: {
      rolledBack: "The fuzz rolled back. Keep the track going downhill toward the flag.",
      stuck: "The fuzz got stuck. Make the hills smaller so it can reach the flag.",
      fell: "Too slow at the top. What would give the fuzz more speed?"
    }
  },
  {
    id: 'speed',
    title: 'Speed',
    bruno: "Speedy fuzzes are happy fuzzes! Hit 18 m/s. What happens if we dip down low?",
    goals: [
      { metric: 'maxSpeed', op: '>=', value: 18, label: 'Reach 18 m/s' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    preset: [{ x: 2, y: 21, kind: 'curve', locked: true }],
    finish: { x: 56, y: 8, r: 2.5 },
    tools: ['point'],
    hints: {
      rolledBack: "The fuzz rolled back. Keep every hill lower than the station.",
      stuck: "Out of speed before the flag! Make the climb up to the flag smoother.",
      fell: "Off the track! No loops needed. Let's dive low, then swoop up to the flag."
    }
  },
  {
    id: 'length',
    title: 'Length',
    bruno: "A long ride! Can we stretch the track to 80 meters and still reach the flag?",
    goals: [
      { metric: 'length', op: '>=', value: 80, label: 'Track at least 80 m long' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    // 2026-10-15 (Gao: "move the start node up"): 26 m (was 20 m). From 26 m one tall up-and-down
    // hill already makes 80 m, so the lesson reads as "go up and down to stretch the ride"; from
    // 20 m it took three hills squeezed under the station. A hill taller than 26 m still strands
    // the fuzz, and a straight slope (58 m) is still too short (levels.test.ts).
    preset: [{ x: 2, y: 26, kind: 'curve', locked: true }],
    finish: { x: 56, y: 4, r: 2.5 },
    tools: ['point'],
    hints: {
      rolledBack: "The fuzz rolled back. Every hill has to be lower than the station.",
      stuck: "Not enough speed for that hill. Make each hill lower than the one before.",
      fell: "Off the track! Let's find where it flew off and smooth that spot."
    }
  },
  {
    id: 'hang',
    title: 'Hang time',
    bruno: "Fuzzes love to float! Can we give them one whole second of air over a hump?",
    goals: [
      { metric: 'hangTime', op: '>=', value: 1, label: '1 second of hang time' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    // A gentle locked start: the track cannot drop straight down off the station, so the floaty
    // time has to come from going over a hump (a straight plunge after it gives at most 0.9 s).
    preset: [{ x: 2, y: 16, kind: 'curve', locked: true }, { x: 10, y: 12, kind: 'curve', locked: true }],
    finish: { x: 56, y: 3, r: 2.5 },
    tools: ['point'],
    hints: {
      rolledBack: "The fuzz rolled back. Make the hump lower than the station.",
      stuck: "Not enough speed for that hump. Make it a little lower.",
      fell: "The fuzz fell off! Floaty time comes from going over a hump."
    }
  },
  {
    id: 'loop',
    title: 'Loops',
    bruno: "Time for a loop! Pick the Loop tool and tap the track. Where will it be fast enough?",
    goals: [
      { metric: 'loopsCompleted', op: '>=', value: 1, label: 'Ride through a loop' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    preset: [{ x: 2, y: 24, kind: 'curve', locked: true }],
    finish: { x: 56, y: 3, r: 2.5 },
    // The Loop tool first shows here, with a NEW badge and a hand tapping it after the intro.
    newTool: 'loop',
    coach: ['loop-tool'],
    hints: {
      rolledBack: "The fuzz rolled back. Every hill has to be lower than the station.",
      stuck: "Out of speed before the flag. Keep the track after the loop low.",
      fell: "Too slow at the top! Let's move the loop lower, where the fuzz is faster."
    }
  },
  {
    id: 'intense',
    title: 'Intense-o-meter',
    bruno: "Fast but gentle! Reach 15 m/s, but stay under 4 g. How round can we make the dip?",
    goals: [
      { metric: 'maxSpeed', op: '>=', value: 15, label: 'Reach 15 m/s' },
      { metric: 'maxG', op: '<=', value: 4, label: 'Stay under 4 g' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' }
    ],
    // The flag sits up high, so a straight slope is too slow (13.9 m/s): the track must dip, and the
    // dip must be round to stay under 4 g.
    preset: [{ x: 2, y: 22, kind: 'curve', locked: true }],
    finish: { x: 56, y: 11, r: 2.5 },
    hints: {
      rolledBack: "The fuzz rolled back. Every hill has to be lower than the station.",
      stuck: "Out of speed before the flag! Make the climb up to the flag smoother.",
      fell: "Off the track! No loops needed. Let's try one big round dip, then up to the flag."
    }
  },
  // ---- Challenge levels: each mixes mechanics the seven levels above taught, several goals at
  // once. Every level except free has a recorded passing track in levels.test.ts. The HUD goal
  // column fits three goal rows (at most two with a bar), so levels keep to three goals and use
  // locked points and flags to shape the rest of the problem.
  {
    id: 'double',
    title: 'Double loop',
    bruno: "Challenge! My station is stuck at this height. Send the fuzz through two loops, then up to the flag.",
    goals: [
      { metric: 'loopsCompleted', op: '>=', value: 2, label: 'Ride through 2 loops' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    preset: [{ x: 3, y: 16, kind: 'curve', locked: true }],
    finish: { x: 56, y: 10, r: 2.5 },
    hints: {
      rolledBack: "The fuzz rolled back. Every hill has to be lower than the station.",
      stuck: "Out of speed before the flag! Keep the loops close together and near the ground.",
      fell: "The fuzz fell out of a loop! Drag the loops way down low so the fuzz goes fast."
    }
  },
  {
    id: 'thrill',
    title: 'Thrill ride',
    bruno: "Challenge! One second of air, under 4 g, and end at the flag. Let's plan it.",
    goals: [
      { metric: 'hangTime', op: '>=', value: 1, label: '1 second of hang time' },
      { metric: 'maxG', op: '<=', value: 4, label: 'Stay under 4 g' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' }
    ],
    // A gentle locked start stops the cheap vertical plunge off the station; the flag forces a
    // real track across the field, so the floaty time has to come from a hump crest.
    preset: [{ x: 2, y: 22, kind: 'curve', locked: true }, { x: 8, y: 20, kind: 'curve', locked: true }],
    finish: { x: 56, y: 4, r: 2.5 },
    hints: {
      rolledBack: "The fuzz rolled back. Keep the hump lower than the station.",
      stuck: "Not enough speed for that hump. Make it a little lower, and round off the valleys.",
      fell: "Off the track! Let's find where it flew off and round that spot with extra points."
    }
  },
  {
    id: 'express',
    title: 'Fuzz express',
    bruno: "Challenge! We start way up high. Can we hit 20 m/s on a 100 meter track?",
    goals: [
      { metric: 'maxSpeed', op: '>=', value: 20, label: 'Reach 20 m/s' },
      { metric: 'length', op: '>=', value: 100, label: 'Track at least 100 m long' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    // No flag: with two bar goals the HUD has room for one yes/no row, and it has to be "reaches
    // the end" (length is measured on the rail, so a stuck ride would otherwise pass).
    preset: [{ x: 2, y: 29, kind: 'curve', locked: true }],
    hints: {
      rolledBack: "The fuzz rolled back. Every hill has to be lower than the station.",
      stuck: "Out of zoom on that hill! Make each hill a bit lower than the one before.",
      fell: "The fuzz fell out of the loop! Loops need lots of speed, so put them down low."
    }
  },
  {
    id: 'grand',
    title: 'Grand finale',
    bruno: "Grand finale! A loop off my tallest station, under 7 g. Where should the loop go?",
    goals: [
      { metric: 'loopsCompleted', op: '>=', value: 1, label: 'Ride through a loop' },
      { metric: 'maxG', op: '<=', value: 7, label: 'Stay under 7 g' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    preset: [{ x: 2, y: 28, kind: 'curve', locked: true }],
    hints: {
      rolledBack: "The fuzz rolled back. Every hill has to be lower than the station.",
      stuck: "Not enough speed for that hill. Make it lower.",
      fell: "Too slow at the top! The fuzz fell out of the loop. Move the loop a little lower."
    }
  },
  {
    id: 'free',
    title: 'Free play',
    bruno: "Build anything! All the meters are on.",
    goals: [],
    hints: {
      rolledBack: "Start higher! The fuzz rolled back to the station.",
      stuck: "Not enough speed for that hill. Try a bigger drop first.",
      fell: "Too slow at the top. Let's try a higher start, or a smaller loop."
    }
  }
];

/** Bruno's coaster quick lines (src/ui/brunoDialog.ts) that are not per level (src/ui/hud.ts): while the fuzz rides, on a
 * pass, and when the ride reaches the end without passing. */
export const COASTER_LINES = {
  play: 'Here it goes. Watch the fuzz!',
  pass: "Now that's a coaster. Great plan!",
  endShortOfFlag: 'The fuzz got to the end, but the track does not reach the flag yet.',
  end: 'The fuzz made it! Now check the goals.',
} as const;

export function findLevel(id: string): Level | undefined {
  return LEVELS.find(level => level.id === id);
}
