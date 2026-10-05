import { Level } from './types';

export const LEVELS: Level[] = [
  {
    id: 'drop',
    title: 'Vertical drop',
    bruno: "I'm building a theme park for fuzzes, and fuzzes love a big drop! Drag the station up so the fall to the flag is at least 15 meters.",
    goals: [
      { metric: 'maxDrop', op: '>=', value: 15, label: 'Drop at least 15 m' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    // Nothing locked: dragging the station up IS the lesson, and a locked end would become the
    // station after Clear (Clear keeps only locked points). The flag marks where the ride ends.
    preset: [{ x: 8, y: 14, kind: 'curve' }, { x: 52, y: 4, kind: 'curve' }],
    finish: { x: 52, y: 4, r: 2.5 },
    hints: {
      rolledBack: "The fuzz rolled back! Keep every hill lower than the station.",
      stuck: "The fuzz got stuck. Let it roll straight down to the flag.",
      fell: "The fuzz fell off the track! Just drag the station up and let it roll down to the flag."
    }
  },
  {
    id: 'complete',
    title: 'Complete the track',
    bruno: "I built the first part! Tap the track or the sky to add points, and bring the rail down to the finish flag.",
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
    hints: {
      rolledBack: "The fuzz rolled back. Keep the track going downhill toward the flag.",
      stuck: "The fuzz got stuck. Make the hills smaller so it can reach the flag.",
      fell: "Too slow at the top! The fuzz fell off the track."
    }
  },
  {
    id: 'speed',
    title: 'Speed',
    bruno: "Speedy fuzzes are happy fuzzes! The station is bolted down, so dive down low on the way to the flag. The deeper the dip, the faster: hit 18 meters per second.",
    goals: [
      { metric: 'maxSpeed', op: '>=', value: 18, label: 'Reach 18 m/s' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    preset: [{ x: 2, y: 21, kind: 'curve', locked: true }],
    finish: { x: 56, y: 8, r: 2.5 },
    hints: {
      rolledBack: "The fuzz rolled back. Keep every hill lower than the station.",
      stuck: "Out of speed before the flag! Make the climb up to the flag smoother.",
      fell: "The fuzz fell off! No loops needed: dive down low, then swoop up to the flag."
    }
  },
  {
    id: 'length',
    title: 'Length',
    bruno: "A long ride to the flag! Add ups and downs until the track is at least 80 meters long, and make sure the fuzz gets there.",
    goals: [
      { metric: 'length', op: '>=', value: 80, label: 'Track at least 80 m long' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    preset: [{ x: 2, y: 20, kind: 'curve', locked: true }],
    finish: { x: 56, y: 4, r: 2.5 },
    hints: {
      rolledBack: "The fuzz rolled back. Every hill has to be lower than the station.",
      stuck: "Not enough speed for that hill. Make each hill lower than the one before.",
      fell: "The fuzz fell off! Use hills and dips to make the track longer."
    }
  },
  {
    id: 'hang',
    title: 'Hang time',
    bruno: "Over a hill top you float! After the first drop, build a hump and give the fuzz one whole second of floaty time on the way to the flag.",
    goals: [
      { metric: 'hangTime', op: '>=', value: 1, label: '1 second of hang time' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    // A gentle locked start: the track cannot drop straight down off the station, so the floaty
    // time has to come from going over a hump (a straight plunge after it gives at most 0.9 s).
    preset: [{ x: 2, y: 16, kind: 'curve', locked: true }, { x: 10, y: 12, kind: 'curve', locked: true }],
    finish: { x: 56, y: 3, r: 2.5 },
    hints: {
      rolledBack: "The fuzz rolled back. Make the hump lower than the station.",
      stuck: "Not enough speed for that hump. Make it a little lower.",
      fell: "The fuzz fell off! Floaty time comes from going over a hump."
    }
  },
  {
    id: 'loop',
    title: 'Loops',
    bruno: "Pick the Loop tool, then tap the track to add a loop. Put it down low so the fuzz is fast enough to stick, then ride on to the flag!",
    goals: [
      { metric: 'loopsCompleted', op: '>=', value: 1, label: 'Ride through a loop' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    preset: [{ x: 2, y: 24, kind: 'curve', locked: true }],
    finish: { x: 56, y: 3, r: 2.5 },
    hints: {
      rolledBack: "The fuzz rolled back. Every hill has to be lower than the station.",
      stuck: "Out of speed before the flag. Keep the track after the loop low.",
      fell: "Too slow at the top! The fuzz fell off. Drag the loop lower, where the fuzz goes faster."
    }
  },
  {
    id: 'intense',
    title: 'Intense-o-meter',
    bruno: "Fast but gentle! Dip down to reach 15 meters per second, then come up to the flag. Round off the bottom of the dip so the fuzz stays under 4 g.",
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
      fell: "The fuzz fell off! No loops needed: one big round dip, then up to the flag."
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
    bruno: "Challenge! Build a hump to catch air for one whole second, and round off the valleys so the fuzz stays under 4 g. End at the flag.",
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
      fell: "The fuzz fell off! Build a hump to catch air, and round off the valleys with extra points."
    }
  },
  {
    id: 'express',
    title: 'Fuzz express',
    bruno: "Challenge! The express starts at the very top. Hit 20 meters per second on a track at least 100 meters long, and get the fuzz to the end.",
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
    bruno: "Grand finale! Build a loop off my tallest station, but don't squish the fuzz past 7 g. Where should the loop go?",
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
      fell: "Too slow at the top! The fuzz fell off the track. Start higher or make the loop smaller."
    }
  }
];

export function findLevel(id: string): Level | undefined {
  return LEVELS.find(level => level.id === id);
}
