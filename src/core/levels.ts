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
    title: 'Air time',
    bruno: "Ever feel your tummy float over a hill? Let's give the fuzz that feeling.",
    goals: [
      { metric: 'hangTime', op: '>=', value: 0.5, label: 'Half a second of air time' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    // 2026-10-15 (Gao: "kids won't understand hang time"): a drag-the-top lesson like level 1. The
    // whole track is placed: a locked station, the hill's two locked feet, the hilltop (index 2),
    // which only slides up and down, and a locked end on the flag. Nothing can be added. The top
    // starts 1 m over its feet (about 0.3 s of air, short of the goal); from about 6 m to 16 m the
    // fuzz floats for half a second or more over the crest (0.5 s at 6 m, 1.6 s at 16 m); above
    // about 16.5 m the fuzz cannot get over and rocks back and forth in the valley (stuck). The
    // light-blue glow on the rail (src/core/airPreview.ts) shows where it will float before Play.
    preset: [
      { x: 2, y: 18, kind: 'curve', locked: true },
      { x: 18, y: 4, kind: 'curve', locked: true },
      { x: 30, y: 5, kind: 'curve', vertical: true },
      { x: 42, y: 4, kind: 'curve', locked: true },
      { x: 56, y: 3, kind: 'curve', locked: true }
    ],
    finish: { x: 56, y: 3, r: 2.5 },
    tools: [],
    canAdd: false,
    coach: ['drag-top'],
    hints: {
      rolledBack: "The fuzz rolled back. Let's keep the hilltop lower than the station.",
      stuck: "Too high! The fuzz could not get over. Let's drag the hilltop down a little.",
      fell: "Off the track! Let's drag the hilltop to a new height and try again."
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
    bruno: "Challenge! One second of air time, under 4 g, and end at the flag. Let's plan it.",
    goals: [
      { metric: 'hangTime', op: '>=', value: 1, label: '1 second of air time' },
      { metric: 'maxG', op: '<=', value: 4, label: 'Stay under 4 g' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' }
    ],
    // A gentle locked start stops the cheap vertical plunge off the station; the flag forces a
    // real track across the field, so the air time has to come from a hump crest. The light-blue
    // air preview shows on the rail here too (src/core/airPreview.ts).
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
  // ---- Long rides (2026-10-15, coaster review: Gao "levels where you can scroll", Jon "some
  // levels with a portion of the track already in there, as a variety thing"). Each world is wider
  // than the screen (`worldW`, src/core/world.ts): the edit view scrolls (the scrollbar under the
  // scene, or drag a point to the panel's edge), and the level opens with a pan from the flag back
  // to the station. Two of them come with a locked, prebuilt part of the track. Each has a recorded
  // passing track and failing naive tracks in levels.test.ts.
  {
    id: 'loopgate',
    title: 'Loop in the middle',
    bruno: "Challenge! My loop is built. Let's slide the station to a height that's not too slow or too fast.",
    goals: [
      { metric: 'loopsCompleted', op: '>=', value: 1, label: 'Ride through a loop' },
      { metric: 'maxG', op: '<=', value: 9, label: 'Stay under 9 g' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' }
    ],
    // The station only slides up and down (and stays on Clear); the loop and its two feet are
    // locked. From the starting 8 m the fuzz cannot get round the loop; from 12.5 m to 20.5 m it
    // loops under 9 g; higher, the loop squishes past 9 g (levels.test.ts sweeps the band). Then the
    // child builds on from the loop's exit to the flag, two screens away.
    worldW: 120,
    preset: [
      { x: 2, y: 8, kind: 'curve' },
      { x: 40, y: 3, kind: 'curve', locked: true },
      { x: 52, y: 2, kind: 'loop', locked: true },
      { x: 64, y: 3, kind: 'curve', locked: true }
    ],
    finish: { x: 116, y: 6, r: 2.5 },
    stationVertical: true,
    // The tutorial hand drags the station up once the pan and the goals are done.
    coach: ['drag-station'],
    hints: {
      rolledBack: "The fuzz rolled back. Keep the track lower than the station.",
      stuck: "Too slow for my loop. Let's slide the station up a little.",
      fell: "Too slow at the top of the loop. Let's slide the station up a bit."
    }
  },
  {
    id: 'tour',
    title: 'Grand tour',
    bruno: "A big park needs a long ride. Let's add hills and a loop, all the way to the high flag.",
    goals: [
      { metric: 'loopsCompleted', op: '>=', value: 1, label: 'Ride through a loop' },
      { metric: 'hangTime', op: '>=', value: 1, label: '1 second of air time' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' }
    ],
    // The flag stands 18 m up at the far end of a 150 m park: a loop and the floaty hills on the
    // way have to leave the fuzz enough speed for the last climb.
    worldW: 150,
    preset: [{ x: 2, y: 28, kind: 'curve', locked: true }],
    finish: { x: 146, y: 18, r: 2.5 },
    hints: {
      rolledBack: "The fuzz rolled back. Every hill has to be lower than the station.",
      stuck: "Out of speed. Let's make the hills lower so the fuzz can reach the flag.",
      fell: "The fuzz fell out of the loop. Let's move the loop lower, where it's faster."
    }
  },
  {
    id: 'finale',
    title: 'Big finish',
    bruno: "I built a big finish with two loops. Let's connect to it and give the fuzz 2 seconds of air.",
    goals: [
      { metric: 'hangTime', op: '>=', value: 2, label: '2 seconds of air time' },
      { metric: 'loopsCompleted', op: '>=', value: 2, label: 'Ride through 2 loops' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' }
    ],
    // The station and the finale (a dip, two loops and the end on the flag) are locked. The rail
    // from the station to the finale is the child's (`openAfter`): taps on it, or on the sky above
    // it, add points there. The plain rail floats the fuzz for under a second; floaty humps give
    // the air, but humps taller than the station strand it.
    worldW: 150,
    preset: [
      { x: 2, y: 28, kind: 'curve', locked: true, openAfter: true },
      { x: 96, y: 16, kind: 'curve', locked: true },
      { x: 104, y: 10, kind: 'curve', locked: true },
      { x: 112, y: 9, kind: 'loop', locked: true },
      { x: 124, y: 9, kind: 'loop', locked: true },
      { x: 134, y: 10, kind: 'curve', locked: true },
      { x: 146, y: 8, kind: 'curve', locked: true }
    ],
    finish: { x: 146, y: 8, r: 2.5 },
    hints: {
      rolledBack: "The fuzz rolled back. Keep the humps lower than the station.",
      stuck: "Not enough speed for that hump. Let's make the humps a little lower.",
      fell: "Too slow for my loops. Let's make the humps lower to save some speed."
    }
  },
  {
    id: 'marathon',
    title: 'Marathon',
    bruno: "Marathon time! Can we build a 240 meter track that still gets to the flag?",
    goals: [
      { metric: 'length', op: '>=', value: 240, label: 'Track at least 240 m long' },
      { metric: 'atFinish', op: '==', value: 1, label: 'Track reaches the flag' },
      { metric: 'reachedEnd', op: '==', value: 1, label: 'Fuzz reaches the end' }
    ],
    // A straight run to the flag is 165 m: the extra length has to come from hills, each lower
    // than the station (and than the hill before, to keep the speed).
    worldW: 170,
    preset: [{ x: 2, y: 28, kind: 'curve', locked: true }],
    finish: { x: 166, y: 12, r: 2.5 },
    hints: {
      rolledBack: "The fuzz rolled back. Every hill has to be lower than the station.",
      stuck: "Out of speed on that hill. Let's make each hill a bit lower than the last.",
      fell: "Off the track! Let's find where it flew off and smooth that spot."
    }
  },
  {
    id: 'free',
    title: 'Free play',
    bruno: "Build anything! All the meters are on.",
    goals: [],
    // 2026-10-15: free play is a wide park too, room for a long ride.
    worldW: 150,
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
