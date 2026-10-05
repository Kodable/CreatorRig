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
