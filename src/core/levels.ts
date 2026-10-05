import { Level } from './types';

export const LEVELS: Level[] = [
  {
    id: 'drop',
    title: 'Vertical drop',
    bruno: "I'm building a theme park for fuzzes, and fuzzes love a big drop! Drag the station up so the fall is at least 15 meters.",
    goals: [
      { metric: 'maxDrop', op: '>=', value: 15, label: 'Drop at least 15 m' }
    ],
    preset: [{ x: 8, y: 14, kind: 'curve' }, { x: 52, y: 4, kind: 'curve' }],
    hints: {
      rolledBack: "Start higher! The fuzz rolled back to the station.",
      stuck: "Not enough speed for that hill. Try a bigger drop first.",
      fell: "Too slow at the top! The fuzz fell off the track. Start higher or make the loop smaller."
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
    bruno: "Speedy fuzzes are happy fuzzes. Build a track that hits 18 meters per second.",
    goals: [
      { metric: 'maxSpeed', op: '>=', value: 18, label: 'Reach 18 m/s' }
    ],
    hints: {
      rolledBack: "Start higher! The fuzz rolled back to the station.",
      stuck: "Not enough speed for that hill. Try a bigger drop first.",
      fell: "Too slow at the top! The fuzz fell off the track. Start higher or make the loop smaller."
    }
  },
  {
    id: 'length',
    title: 'Length',
    bruno: "A long ride! Make the track at least 80 meters long, and make sure the fuzz gets to the end.",
    goals: [
      { metric: 'length', op: '>=', value: 80, label: 'Track at least 80 m long' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    hints: {
      rolledBack: "Start higher! The fuzz rolled back to the station.",
      stuck: "Not enough speed for that hill. Try a bigger drop first.",
      fell: "Too slow at the top! The fuzz fell off the track. Start higher or make the loop smaller."
    }
  },
  {
    id: 'hang',
    title: 'Hang time',
    bruno: "Over a hill top you float! Give the fuzz one whole second of floaty time.",
    goals: [
      { metric: 'hangTime', op: '>=', value: 1, label: '1 second of hang time' }
    ],
    hints: {
      rolledBack: "Start higher! The fuzz rolled back to the station.",
      stuck: "Not enough speed for that hill. Try a bigger drop first.",
      fell: "Too slow at the top! The fuzz fell off the track. Start higher or make the loop smaller."
    }
  },
  {
    id: 'loop',
    title: 'Loops',
    bruno: "Pick the Loop tool, then tap the track to add a loop. Fast enough and the fuzz sticks to the track!",
    goals: [
      { metric: 'loops', op: '>=', value: 1, label: 'Build a loop' },
      { metric: 'loopsCompleted', op: '>=', value: 1, label: 'Ride through the loop' }
    ],
    hints: {
      rolledBack: "Start higher! The fuzz rolled back to the station.",
      stuck: "Not enough speed for that hill. Try a bigger drop first.",
      fell: "Too slow at the top! The fuzz fell off the track. Start higher or make the loop smaller."
    }
  },
  {
    id: 'intense',
    title: 'Intense-o-meter',
    bruno: "Fast but gentle! Reach 15 meters per second without squishing the fuzz past 4 g.",
    goals: [
      { metric: 'maxSpeed', op: '>=', value: 15, label: 'Reach 15 m/s' },
      { metric: 'maxG', op: '<=', value: 4, label: 'Stay under 4 g' }
    ],
    hints: {
      rolledBack: "Start higher! The fuzz rolled back to the station.",
      stuck: "Not enough speed for that hill. Try a bigger drop first.",
      fell: "Too slow at the top! The fuzz fell off the track. Start higher or make the loop smaller."
    }
  },
  // ---- Challenge levels: each mixes mechanics the seven levels above taught, several goals at
  // once. Every one has a recorded passing track in levels.test.ts. The HUD goal column fits three
  // goal rows (at most two with a bar), so each challenge keeps to three goals and uses a locked
  // station or a flag to shape the rest of the problem.
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
    bruno: "Challenge! My tallest station yet. Give the fuzz one second of floaty time, but don't squish it past 4 g.",
    goals: [
      { metric: 'hangTime', op: '>=', value: 1, label: '1 second of hang time' },
      { metric: 'maxG', op: '<=', value: 4, label: 'Stay under 4 g' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    preset: [{ x: 2, y: 26, kind: 'curve', locked: true }],
    hints: {
      rolledBack: "The fuzz rolled back. Every hill has to be lower than the station.",
      stuck: "Not enough speed for that hill. Make it a little lower.",
      fell: "The fuzz fell off! This ride needs floaty hills, not loops."
    }
  },
  {
    id: 'express',
    title: 'Fuzz express',
    bruno: "Challenge! All aboard the express: hit 20 meters per second on a track at least 100 meters long.",
    goals: [
      { metric: 'maxSpeed', op: '>=', value: 20, label: 'Reach 20 m/s' },
      { metric: 'length', op: '>=', value: 100, label: 'Track at least 100 m long' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
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
