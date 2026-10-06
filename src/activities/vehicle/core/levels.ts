// Marstopia Rover: "Bruno's Mars obstacle course", rebuilt 2026-10-02 around free building. Every
// level places Kevin's glass dome (locked, the child never drags it) and the beacon; the child
// spends the level's coins on parts from the palette, sticks them anywhere on the dome's rim,
// presses DRIVE and watches. Intro levels first, one new thing each (the palette is the gate;
// the Mount row unlocks with `introduces: ['mount']`, and each intro's `part:<kind>` entries play
// the shelf's unlock callout for the parts it adds), then challenges, then free play.
// Units are meters, y up, ground height from each level's `terrain` profile (terrain.ts), world
// 90 x 15 m since 2026-10-05 (walls at x 0 and 90; the panel shows 30 m of it and the camera
// scrolls), 19.125 m tall since 2026-10-06 (more sky over the same ground, build.ts WORLD_H). The first nine levels keep their 2026-10-02 content on x 0..30 and simply continue
// flat to the right edge; the five long challenges added 2026-10-05 (Gao: "More challenge levels
// with more varied terrain and a scrolling camera") run 75-90 m. levels.test.ts proves every
// `solution` (and every `altSolutions` build) passes its goals within the budget and every
// preset (the dome alone) does not. Terrains and solutions were tuned by simulating every
// sensible build within each budget (2-4 wheels of one shape in five layouts, cup or spring, plus
// one weight and/or one propulsion part in the usual spots; for the long levels also six layouts
// with wheels on top, ~1200 builds per level); the comments on each level say what else passes
// and what fails. Since 2026-10-05 a rover on its roof keeps driving (sim.ts `driveSign`) and
// `flipped` is no longer an outcome, so the first nine levels' tipped-over builds now end
// `stuck` (or, with wheels on top, drive on).
import { ROVER_R } from './art';
import { blockSize } from './build';
import { defaultProps } from './catalog';
import { GROUND_CLEARANCE, rimPoint } from './geometry';
import {
  flat,
  heightAt,
  jumpEnd,
  withCobbles,
  withHill,
  withJump,
  withKerb,
  withRampToLip,
  withSlope,
  withStairs,
} from './terrain';
import type { AttachmentKind, PartKind, RoverPart, Vec2, VehicleLevel } from './types';

/** Every level puts the dome here. */
export const ROVER_X = 3;
const FINISH_X = 27;
const ROVER_ID = 1;
const FINISH_ID = 2;
/** Ids of the child's (solution) parts start here. */
const FIRST_PART_ID = 10;

/** The dome as the level places it: resting on the ground (normalizeParts lifts it onto
 * whatever wheels the child adds). */
function roverAt(terrain: Vec2[]): RoverPart {
  return {
    id: ROVER_ID,
    kind: 'rover',
    x: ROVER_X,
    y: heightAt(terrain, ROVER_X) + ROVER_R + GROUND_CLEARANCE,
    props: {},
    locked: true,
    lockPosition: true,
  };
}

function finishAt(terrain: Vec2[], x: number = FINISH_X): RoverPart {
  return { id: FINISH_ID, kind: 'finish', x, y: heightAt(terrain, x), props: {}, locked: true, lockPosition: true };
}

function boulderAt(terrain: Vec2[], id: number, x: number, size: string, material: string): RoverPart {
  return {
    id,
    kind: 'block',
    x,
    y: heightAt(terrain, x) + blockSize(size).h / 2,
    props: { ...defaultProps('block'), size, material },
    locked: true,
    lockPosition: true,
  };
}

/** One attachment in a solution: kind, rim angle (degrees, 0 = front, 90 = top, -90 = bottom),
 * mount. */
export type Stick = [kind: AttachmentKind, deg: number, mount?: 'cup' | 'spring'];

/** The child's parts for `sticks`, placed on the rim of the level's dome (normalizeParts then
 * snaps them and stands the build on the ground, exactly as in the app). */
export function stickOn(terrain: Vec2[], sticks: Stick[]): RoverPart[] {
  const rover = roverAt(terrain);
  return sticks.map(([kind, deg, mount], i) => {
    const r = rimPoint((deg * Math.PI) / 180);
    return { id: FIRST_PART_ID + i, kind, x: rover.x + r.x, y: rover.y + r.y, props: { mount: mount ?? 'cup' } };
  });
}

const REACH: VehicleLevel['goals'] = [{ metric: 'reachedFinish', op: '==', value: 1, label: 'Reach the beacon' }];

interface LevelDef {
  id: string;
  title: string;
  bruno: string;
  terrain: Vec2[];
  budget: number;
  palette: PartKind[];
  introduces?: string[];
  goals?: VehicleLevel['goals'];
  hints: string[];
  failHints: VehicleLevel['failHints'];
  /** Level-placed scenery besides the dome and the beacon. */
  scenery?: (terrain: Vec2[]) => RoverPart[];
  finishX?: number;
  /** `Level.extentW` (kit/types.ts): the width (m, from x 0) this level's content actually uses.
   * The camera clamp and the edit-mode scrollbar use `min(WORLD_W, extentW)`, so a short level in
   * this 90 m-wide, 30 m-view course shows no scrollbar and never scrolls into its empty tail
   * (see levels.test.ts's `extentW` checks for how each value was chosen). */
  extentW: number;
  solution?: Stick[];
  /** More builds that pass (levels.test proves each). */
  altSolutions?: Stick[][];
  /** Seconds before `timeout` (sim.ts TIMEOUT_S when absent). */
  timeout?: number;
}

function level(def: LevelDef): VehicleLevel {
  const preset = [roverAt(def.terrain), finishAt(def.terrain, def.finishX), ...(def.scenery?.(def.terrain) ?? [])];
  return {
    id: def.id,
    title: def.title,
    bruno: def.bruno,
    goals: def.goals ?? REACH,
    parts: preset,
    palette: def.palette,
    hints: def.hints,
    failHints: def.failHints,
    terrain: def.terrain,
    budget: def.budget,
    extentW: def.extentW,
    ...(def.introduces ? { introduces: def.introduces } : {}),
    ...(def.solution ? { solution: [...preset, ...stickOn(def.terrain, def.solution)] } : {}),
    ...(def.altSolutions ? { altSolutions: def.altSolutions.map((alt) => [...preset, ...stickOn(def.terrain, alt)]) } : {}),
    ...(def.timeout !== undefined ? { timeout: def.timeout } : {}),
  };
}

/** The long challenges' timeout: room for a slow build to finish 90 m (stuck still ends a
 * hopeless run after a few seconds). */
const LONG_TIMEOUT = 45;

const WHEELS: PartKind[] = ['wheelCircle', 'wheelSquare'];
const ALL_WHEELS: PartKind[] = ['wheelCircle', 'wheelSquare', 'wheelStar'];
const WEIGHTS: PartKind[] = ['feather', 'beans', 'watermelon'];
const POWER: PartKind[] = ['fan', 'stove', 'jet'];

/** Concept ids each level's `introduces` may name, and the palette kinds they unlock (levels.test
 * checks that no palette offers a kind before its concept). 'mount' is also the drawer row's
 * property code, so the kit hides the Mount row until it is introduced. */
export const CONCEPT_KINDS: Record<string, PartKind[]> = {
  wheels: WHEELS,
  shape: ['wheelStar'],
  mount: [],
  weight: WEIGHTS,
  power: POWER,
};

/** A level's `introduces` for `concept`: the concept id, then a `part:<kind>` entry for every kind
 * it unlocks (kit/types.ts: the shelf plays its unlock callout for those kinds, with the part's
 * blurb, on that level; levels.test checks each is in the palette and offered there first). */
function unlock(concept: string): string[] {
  return [concept, ...(CONCEPT_KINDS[concept] ?? []).map((kind) => `part:${kind}`)];
}

// ---- terrains of the long challenges (2026-10-05) ----------------------------------------------

/** Topsy-turvy: a 9 m mesa, cliffs of 4.5 m at x 16 and x 40, then flat ground. */
const FLIP_TERRAIN: Vec2[] = withKerb(withKerb(flat(9), 16, -4.5), 40, -4.5);

/** Canyon climb: hills, a dip, a long climb ending in a 40 degree wall. */
const CANYON_TERRAIN: Vec2[] = (() => {
  let t = withHill(flat(), 8, 14, 0.6);
  t = withHill(t, 17, 25, 1.0);
  t = withSlope(t, 28, 32, -1.2); // down into the dip...
  t = withSlope(t, 38, 42, 1.2); // ...and out
  t = withSlope(t, 46, 62, 2.5); // the long climb
  return withSlope(t, 62, 65.6, 3); // the canyon wall
})();

/** Rocky ridge: rock stairs, a plateau, a drop, a bumpy valley. */
const RIDGE_TERRAIN: Vec2[] = withCobbles(withKerb(withStairs(flat(), 10, 4, 0.2, 0.8), 30, -1.6), 36, 56, 0.15, 0.6);

/** Crater hops: the gap after each ramp (m), widest last. */
export const HOP_GAPS = [1.5, 2.5, 3.5, 5];
const HOPS_TERRAIN: Vec2[] = (() => {
  let t = flat();
  let x = 10;
  for (const gap of HOP_GAPS) {
    t = withJump(t, x, 15, 0.6, gap);
    x = jumpEnd(x, 15, 0.6, gap) + 8;
  }
  return t;
})();

/** Marstopia marathon: a bit of everything over the whole world. */
const MARATHON_TERRAIN: Vec2[] = (() => {
  let t = withHill(flat(), 8, 14, 0.8);
  t = withCobbles(t, 18, 26, 0.12, 0.6);
  t = withStairs(t, 30, 3, 0.2, 0.8);
  t = withJump(t, 40, 15, 0.6, 2.5);
  t = withHill(t, 50, 58, 1.5);
  t = withKerb(t, 62, -1);
  t = withCobbles(t, 66, 76, 0.12, 0.6);
  return withSlope(t, 80, 84, 1);
})();

export const LEVELS: VehicleLevel[] = [
  // 1. wheels ----------------------------------------------------------------------------------
  // A gentle 1.2 m hill. Two round wheels (the default spots, -45 and -135 degrees) climb it;
  // square wheels are too slow and stall on it; one wheel alone tips onto the dome and sticks.
  level({
    id: 'wheels',
    title: 'Dusty hill',
    // 2026-10-05 playtest review (Jon): the coach (../coach.ts) carries the taps (BUILD, a Round
    // wheel, another, DRIVE); Bruno's line just sets the scene.
    bruno: "Kevin's rover is just a glass dome. Let's give it wheels!",
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
    title: 'Rock steps',
    bruno: 'Rock steps ahead! Build your rover and tap DRIVE to try them.',
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
      stuck: 'Stuck at the steps! Try a wheel shape that can grab the rock.',
    },
    solution: [
      ['wheelStar', -45],
      ['wheelStar', -135],
    ],
  }),

  // 3. mount -----------------------------------------------------------------------------------
  level({
    id: 'mount',
    title: 'Bumpy road',
    bruno: 'A bumpy road! Build your rover, tap DRIVE and watch the wheels.',
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
    title: 'Boulder push',
    bruno: 'A boulder blocks the trail! Build your rover and DRIVE into it.',
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
  // A 2.5 m rim over 6 m (53 degrees at its steepest): every wheels-only build slips back or
  // flips (2-4 round wheels, stars). A fan or a stove on the back (180 or +/-150 degrees) pushes
  // it over; a jet is too strong (it flies off the crest) and too dear with round wheels.
  level({
    id: 'power',
    title: 'Crater rim',
    bruno: 'The crater rim is so steep! Build your rover and try to DRIVE up.',
    terrain: withHill(flat(), 10, 16, 2.5),
    budget: 8,
    extentW: 30,
    palette: [...ALL_WHEELS, ...WEIGHTS, ...POWER],
    introduces: unlock('power'),
    hints: [
      'Wheels slip on a hill this steep, even with more of them.',
      'A fan, a stove or a jet pushes the rover away from where it is stuck on.',
      'Put a fan on the back of the dome. It pushes the rover forward, up the rim.',
    ],
    failHints: {
      stuck: 'The wheels slip on the rim. Stick something on the back to push!',
    },
    solution: [
      ['wheelCircle', -45],
      ['wheelCircle', -135],
      ['fan', 180],
    ],
  }),

  // 6. jump ------------------------------------------------------------------------------------
  // A 15 degree ramp to a 1 m lip, 5.5 m across, landing 0.5 m below the start. Plain wheels, one
  // fan or one stove drop in; a jet on the back (180, or tilted down 140-170 degrees) flies over.
  // Two fans, or a stove with a feather on top, also make it (fine: more than one way across).
  level({
    id: 'jump',
    title: 'Crevasse jump',
    bruno: 'A huge crevasse! Wheels alone will not get Kevin across. We need real speed.',
    terrain: withRampToLip(flat(), 9, 15, 1, 5.5, -0.5),
    budget: 9,
    extentW: 30,
    palette: [...ALL_WHEELS, ...WEIGHTS, ...POWER],
    goals: [
      ...REACH,
      { metric: 'flips', op: '==', value: 0, label: 'Land on the wheels' },
    ],
    hints: [
      'At wheel speed the rover drops into the crevasse.',
      'A jet pushes hardest of all. It keeps pushing in the air, too.',
      'Two round wheels and a jet on the back fly right over.',
    ],
    failHints: {
      fell: 'Into the crevasse! The rover needs more speed. What pushes hardest?',
      stuck: 'We made it across but landed upside down! Try the pusher lower on the back.',
    },
    solution: [
      ['wheelCircle', -45],
      ['wheelCircle', -135],
      ['jet', 180],
    ],
  }),

  // 7. rubble ----------------------------------------------------------------------------------
  // 0.2 m cobbles, then four 0.2 m steps. Rigid round wheels flip; rigid stars and squares climb
  // but miss the 12 s goal. Passing builds put the wheels on springs (round, square or star, with
  // or without a push), or push square wheels with a jet.
  level({
    id: 'rubble',
    title: 'Rubble field',
    bruno: 'Rubble AND rock steps, and Kevin is in a hurry! Use everything you have learned.',
    terrain: withStairs(withCobbles(flat(), 6, 12, 0.2, 0.6), 14, 4, 0.2, 0.6),
    budget: 10,
    extentW: 30,
    palette: [...ALL_WHEELS, ...WEIGHTS, ...POWER],
    goals: [
      ...REACH,
      { metric: 'flips', op: '==', value: 0, label: 'Stay right side up' },
      { metric: 'time', op: '<=', value: 12, label: 'Under 12 seconds' },
    ],
    hints: [
      'Stiff round wheels bounce right over. Pointy wheels climb, but slowly.',
      'Springs soak up the rubble AND the bump of every step.',
      'Two round wheels on springs roll over everything, fast.',
    ],
    failHints: {
      stuck: 'Stuck! Did the rubble tip it over? Which wheels and mounts handle rubble and steps?',
      timeout: 'Too slow for Kevin! Try springs, or a push.',
    },
    solution: [
      ['wheelCircle', -45, 'spring'],
      ['wheelCircle', -135, 'spring'],
    ],
  }),

  // 8. race ------------------------------------------------------------------------------------
  // 24 m of flat plain: wheels alone take 4.4 s, with a fan 3.8 s, with a stove 3.7 s; only a jet
  // beats 3.5 s (2.9 s).
  level({
    id: 'race',
    title: 'Flat plain race',
    bruno: 'A race across the plain! Wheels alone are not fast enough to beat the clock.',
    terrain: flat(),
    budget: 9,
    extentW: 30,
    palette: [...ALL_WHEELS, ...WEIGHTS, ...POWER],
    goals: [
      ...REACH,
      { metric: 'time', op: '<=', value: 3.5, label: 'Under 3.5 seconds' },
    ],
    hints: [
      'Wheels top out at 6 m/s. That takes about 4 seconds.',
      'Pushers make the rover go faster than its wheels.',
      'A jet on the back wins the race.',
    ],
    failHints: {
      timeout: 'Too slow! Add something that pushes.',
      stuck: 'Too wild! Keep the pusher on the back.',
    },
    solution: [
      ['wheelCircle', -45],
      ['wheelCircle', -135],
      ['jet', 180],
    ],
  }),

  // ---- the long challenges (2026-10-05) ------------------------------------------------------
  // 75-90 m each, the beacon far to the right: the level opens with a pan from the beacon back to
  // the start (spec.ts `intro`) and the camera follows the rover there. Every part is on offer.

  // 9. flip ------------------------------------------------------------------------------------
  // Kevin starts on a 9 m mesa; two 4.5 m cliffs (x 16 and 40) tumble the rover, then 40 m of flat
  // run to the beacon. A rover that lands on its roof keeps going only if it has wheels on top
  // too (sim.ts `driveSign`). Landings are chaotic, so this is a "most of the time" level, not an
  // "always" one: 36 of 621 bottom-only builds tumble through (mostly a fan or a jet rolling them a
  // full turn back onto their wheels), 70 of 368 builds with wheels on top finish (round wheels
  // top and bottom with no weight: most of them; a weight on top drags on the ground once the
  // rover is upside down, and two wheels at -90/90 or a single rigid wheel on top tip it onto the
  // glass). The solution and every alternative drive 35-60 m of it upside down.
  level({
    id: 'flip',
    title: 'Topsy-turvy',
    bruno: "Two giant cliffs! Kevin's rover will tumble and land on its roof. Stick wheels on top too, so it can drive upside down!",
    terrain: FLIP_TERRAIN,
    budget: 12,
    extentW: 84,
    palette: [...ALL_WHEELS, ...WEIGHTS, ...POWER],
    finishX: 80,
    timeout: LONG_TIMEOUT,
    hints: [
      'Wheels on the bottom just spin in the air when the rover lands on its roof.',
      'Wheels on TOP of the dome touch the ground when the rover is upside down. They drive it, too!',
      'Try four round wheels: two on the bottom and two on top, like a sandwich.',
    ],
    failHints: {
      stuck: 'Upside down and stuck! Stick wheels on top of the dome so it can drive on its roof.',
      fell: 'Off the edge! Wheels at the front and the back keep it steady.',
      timeout: 'Too slow for Kevin! Round wheels roll fastest.',
    },
    solution: [
      ['wheelCircle', -45],
      ['wheelCircle', -135],
      ['wheelCircle', 45],
      ['wheelCircle', 135],
    ],
    altSolutions: [
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['wheelCircle', 45, 'spring'], ['wheelCircle', 135, 'spring']],
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['wheelCircle', 90, 'spring']],
      [['wheelStar', -45], ['wheelStar', -135], ['wheelStar', 90]],
      [['wheelSquare', -45, 'spring'], ['wheelSquare', -135, 'spring'], ['wheelSquare', 90, 'spring']],
    ],
  }),

  // 10. canyon ---------------------------------------------------------------------------------
  // Two rolling hills, a 1.2 m dip, then the long climb out of the canyon: 2.5 m over 16 m, then
  // a 40 degree wall 3 m tall (x 62-65.6) up to the plateau and the beacon at x 78. Every
  // wheels-only build stalls on the wall except two round wheels on springs; round wheels with a
  // fan, a stove or a jet on the back push up it, and a jet hauls star or square wheels up too
  // (35 of 989 builds pass; square and star wheels without a jet stall on the hills or the wall).
  // The stove's constant 7 N push (2026-10-05) flips a cup-mounted build on the steep wall; on
  // springs it still climbs straight through.
  level({
    id: 'canyon',
    title: 'Canyon climb',
    bruno: 'Bumpy hills, a dip, then the giant canyon wall! The wall at the end is so steep, wheels alone will slip.',
    terrain: CANYON_TERRAIN,
    budget: 12,
    extentW: 82,
    palette: [...ALL_WHEELS, ...WEIGHTS, ...POWER],
    finishX: 78,
    timeout: LONG_TIMEOUT,
    hints: [
      'Round wheels roll over the hills and the dip just fine.',
      'The canyon wall at the end is too steep for wheels alone. What pushes?',
      'Two round wheels and a fan on the back push right up the wall.',
    ],
    failHints: {
      stuck: 'Stuck on the canyon wall! Stick something on the back to push.',
      fell: 'Whoa, it rolled off! Wheels at the front and the back keep it steady.',
      timeout: 'Too slow for Kevin! Round wheels roll fastest.',
    },
    solution: [
      ['wheelCircle', -45],
      ['wheelCircle', -135],
      ['fan', 180],
    ],
    altSolutions: [
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['stove', 180]],
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring']],
      [['wheelCircle', -45], ['wheelCircle', -135], ['jet', 180]],
      [['wheelStar', -45], ['wheelStar', -135], ['jet', 180]],
      [['wheelSquare', -45, 'spring'], ['wheelSquare', -135, 'spring'], ['jet', 180]],
    ],
  }),

  // 11. ridge ----------------------------------------------------------------------------------
  // Four 0.2 m rock stairs (x 10), a plateau, a 1.6 m drop at x 30, then 20 m of 0.15 m bumps and
  // the beacon at x 76. Stiff wheels trip on the stairs or flip on the drop; the passing builds
  // all ride on springs (round, square or star; 36 of 1178 builds, of the 528 that can drive this
  // far on flat ground). Square wheels with one on top often land on their roof after the drop and
  // drive the rest of the way upside down.
  level({
    id: 'ridge',
    title: 'Rocky ridge',
    bruno: 'Rock stairs up the ridge, a big drop, then a bumpy valley! What soaks up all those bumps?',
    terrain: RIDGE_TERRAIN,
    budget: 14,
    extentW: 80,
    palette: [...ALL_WHEELS, ...WEIGHTS, ...POWER],
    finishX: 76,
    timeout: LONG_TIMEOUT,
    hints: [
      'Stiff wheels bounce off the stairs and the bumps.',
      'Springs soak up stairs, drops AND bumps.',
      'Two round wheels on springs ride the whole ridge.',
    ],
    failHints: {
      stuck: 'Stuck! Springs help with stairs and bumps. Landed on its roof? Wheels on top keep it going!',
      fell: 'Whoa, it rolled off! Wheels at the front and the back keep it steady.',
      timeout: 'Too slow for Kevin! Round wheels on springs are quick AND bouncy.',
    },
    solution: [
      ['wheelCircle', -45, 'spring'],
      ['wheelCircle', -135, 'spring'],
    ],
    altSolutions: [
      [['wheelCircle', -30, 'spring'], ['wheelCircle', -90, 'spring'], ['wheelCircle', -150, 'spring'], ['stove', 180]],
      [['wheelSquare', -45, 'spring'], ['wheelSquare', -135, 'spring'], ['wheelSquare', 90, 'spring']],
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['jet', -150]],
      [['wheelCircle', -60, 'spring'], ['wheelCircle', -120, 'spring'], ['wheelCircle', 60, 'spring'], ['wheelCircle', 120, 'spring']],
      [['wheelStar', -45, 'spring'], ['wheelStar', -135, 'spring'], ['wheelStar', 90, 'spring'], ['feather', 180]],
    ],
  }),

  // 12. hops -----------------------------------------------------------------------------------
  // Four 15 degree ramps to a 0.6 m lip, each over a wider gap: 1.5, 2.5, 3.5, then 5 m, 8 m apart
  // (HOP_GAPS), the beacon at x 80. Plain wheels (and most builds with a fan or a stove) hop the
  // first three and drop into the last; a jet carries the rover over all four (32 of 1262 builds
  // pass, 26 of them with a jet). Stiff wheels and a jet clear the last gap but land on the roof
  // and stop; springs, or wheels on top, keep them going.
  level({
    id: 'hops',
    title: 'Crater hops',
    bruno: 'Ramp, gap, ramp, gap! Every gap is wider than the last one, and the last one is HUGE.',
    terrain: HOPS_TERRAIN,
    budget: 15,
    extentW: 84,
    palette: [...ALL_WHEELS, ...WEIGHTS, ...POWER],
    finishX: 80,
    timeout: LONG_TIMEOUT,
    hints: [
      'Plain wheels hop the small gaps, but not the last one.',
      'Faster means farther. What pushes hardest?',
      'Two round wheels on springs and a jet on the back fly over every gap.',
    ],
    failHints: {
      fell: 'Into the crater! Faster means farther. What pushes hardest?',
      stuck: 'Landed on its roof? Springs soften the landing, or stick wheels on top!',
      timeout: 'Too slow for Kevin! Try something that pushes.',
    },
    solution: [
      ['wheelCircle', -45, 'spring'],
      ['wheelCircle', -135, 'spring'],
      ['jet', 180],
    ],
    altSolutions: [
      [['wheelCircle', -45], ['wheelCircle', -135], ['feather', 90], ['jet', 180]],
      [['wheelCircle', -30], ['wheelCircle', -90], ['wheelCircle', -150], ['jet', 180]],
      [['wheelCircle', -60, 'spring'], ['wheelCircle', -120, 'spring'], ['jet', 180]],
      [['wheelCircle', -45], ['wheelCircle', -135], ['wheelCircle', 45], ['wheelCircle', 135], ['fan', 180]],
      [['wheelCircle', -45], ['wheelCircle', -135], ['feather', 90], ['stove', 180]],
    ],
  }),

  // 13. marathon -------------------------------------------------------------------------------
  // Everything, across the whole world: a hill, bumps, three rock stairs, a 2.5 m jump, a big
  // hill, a 1 m drop, more bumps, a rise and the beacon at x 87, under 18 s. Springs get through
  // the bumps and stairs; plain springs take ~18.8 s, so they also need a push (a fan or a stove
  // on the back) or a jet. The hardest level: 11 of 1457 builds pass (round wheels only; stars and
  // squares are too slow for the jump and fall in). The stove's constant 7 N (2026-10-05) tips a
  // bare two-wheeler over on the jump; a feather on top settles it back down in time (16.97 s).
  level({
    id: 'marathon',
    title: 'Marstopia marathon',
    bruno: 'The big one! Hills, bumps, stairs, a jump and a drop, all the way across Marstopia. And Kevin is in a hurry!',
    terrain: MARATHON_TERRAIN,
    budget: 20,
    extentW: 90,
    palette: [...ALL_WHEELS, ...WEIGHTS, ...POWER],
    finishX: 87,
    timeout: LONG_TIMEOUT,
    goals: [
      ...REACH,
      { metric: 'time', op: '<=', value: 18, label: 'Under 18 seconds' },
    ],
    hints: [
      'Bumps and stairs? Springs. A jump? Speed. The clock? A push!',
      'Round wheels on springs make it all the way, just a little too slowly.',
      'Two round wheels on springs, a feather on top, and a stove on the back. Go, Kevin, go!',
    ],
    failHints: {
      stuck: 'Stuck! Springs soak up the bumps and the stairs.',
      fell: 'Into the gap! The rover needs more speed for the jump.',
      timeout: 'Too slow for Kevin! Add something that pushes.',
    },
    solution: [
      ['wheelCircle', -45, 'spring'],
      ['wheelCircle', -135, 'spring'],
      ['feather', 90],
      ['stove', 180],
    ],
    altSolutions: [
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['fan', 180]],
      [['wheelCircle', -45], ['wheelCircle', -135], ['feather', 90], ['jet', 180]],
      [['wheelCircle', -20], ['wheelCircle', -65], ['wheelCircle', -115], ['wheelCircle', -160], ['jet', 180]],
      [['wheelCircle', -30, 'spring'], ['wheelCircle', -150, 'spring'], ['wheelCircle', 30, 'spring'], ['wheelCircle', 150, 'spring'], ['fan', 180]],
    ],
  }),

  // 14. free play -------------------------------------------------------------------------------
  level({
    id: 'free',
    title: 'Roam Marstopia',
    bruno: 'No rules! Lots of coins. Build the wildest rover you can and roam Marstopia.',
    terrain: withHill(withHill(flat(), 8, 12, 0.8), 18, 22, 0.6),
    budget: 40,
    extentW: 90,
    palette: [...ALL_WHEELS, ...WEIGHTS, ...POWER],
    goals: [],
    hints: [
      'Try fifteen wheels all around. Or two wheels and three jets!',
      'Drag any part around the dome to stick it somewhere else.',
      'There is no wrong rover in free play. Build it, drive it, watch what happens!',
    ],
    failHints: {},
  }),
];

export function findLevel(id: string): VehicleLevel | undefined {
  return LEVELS.find((level) => level.id === id);
}
