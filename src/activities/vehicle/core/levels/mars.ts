// Mars (2026-10-09): the challenge chapter, then free play. Gao, 2026-10-09: "i want the current
// challenge levels on mars, but adjust for the gravity different between mars and earth. also, i
// want to add levels to mars to account for sandy ground as well as sandy + rocks on the ground";
// earlier: "im ok with multiple solutions per level". Mars gravity is 3.7 m/s^2 and its ground is
// rock wherever a level's `surfaces` say nothing (planets.ts); the wheel motors' torque scales with
// gravity, so top speed stays 6 m/s but a rover takes ~3.5 s to reach it (1.3 s at home).
//
// What Mars changes, and how the chapter uses it (every number below measured in the sim):
//  - Jumps fly farther: the same 15 degree ramp throws plain round wheels 5.1 m on Mars (3.6 m at
//    home), so the crevasse and the crater hops are WIDER here; a push carries the rover farther
//    still (fans, stoves and jets do not scale with gravity, so they push a light rover hard).
//  - Bumps throw the rover higher: a rover that hits rubble, a rock or a hill crest fast is tossed
//    over (stiff round wheels bounce off a 0.2 m cobble and stall; a fan-pushed rover flips on the
//    rubble), so springs matter more and "faster" is not always better.
//  - Sand (surfaces.ts): round and square wheels sink and crawl (flat sand: round 0.9 m/s, square
//    0.2, star 2.0, star on springs 3.2), a 15 degree sand slope stops round wheels (stars climb),
//    heavy rovers sink more (two stars with a melon stall on that slope), and a push helps in sand
//    (round wheels + fan 2.0 m/s, + stove 2.7). New mechanic, gentle level first: `sand`, then
//    `dunes`.
//  - Rocks in sand: hard lumps a slow stiff wheel cannot climb out of the soft sand; springs
//    bounce over them, star wheels grip between them (`rocky`, then `rockfield`).
// Order: the welcome jump, the two short rock-ground challenges, sand (gentle, then challenge),
// rocky sand (gentle, then challenge), the five long challenges hardest last, free play last.
//
// Tuning: every level was searched with the Mars sim over every sensible build within its budget
// (2-4 wheels of one shape in six layouts, cup or spring, plus one weight and/or one power part in
// the usual spots; ~750-860 builds per short level, ~1600-2400 with wheels-on-top layouts for the
// long ones); the comment on each level says what passes and what fails. Since 2026-10-05 a rover
// on its roof keeps driving (sim.ts `driveSign`) and `flipped` is no longer an outcome.
//
// History: "Bruno's Mars obstacle course", rebuilt 2026-10-02 around free building; the five long
// challenges were added 2026-10-05 (Gao: "More challenge levels with more varied terrain and a
// scrolling camera"); all of them were tuned at the old 10 m/s^2 until the 2026-10-09 move to Mars
// gravity, when every one was retuned (same ids, same ideas) and the four sand levels were added.
import { sand } from '../surfaces';
import { flat, jumpEnd, withCobbles, withHill, withJump, withKerb, withRampToLip, withSlope, withStairs } from '../terrain';
import type { Vec2, VehicleLevel } from '../types';
import { ALL_PARTS, LONG_TIMEOUT, REACH, level, rockAt } from './shared';

// ---- terrains --------------------------------------------------------------------------------

/** Topsy-turvy: a 9 m mesa, cliffs of 4.5 m at x 16 and x 40, then flat ground; the last 4 m
 * before each cliff edge is sand (FLIP_SAND). */
const FLIP_TERRAIN: Vec2[] = withKerb(withKerb(flat(9), 16, -4.5), 40, -4.5);
/** Sand right before each cliff edge. Mars-specific: on rock a rover reaches the edge at ~7 m/s
 * and, with Mars's long fall, tumbles every which way (two round wheels with a fan or a stove,
 * nothing on top, came through half the time, rolled back onto their wheels by the push); in the
 * sand it creeps to the edge, tips over it nose first and lands on its roof. */
const FLIP_SAND = [sand(12, 16), sand(36, 40)];

/** Canyon climb: two low hills, a dip, a long climb ending in a 4 m wall at 45 degrees (x 62-66).
 * On Mars the old 3 m, 40 degree wall was no barrier (two round wheels bounced up it), and the old
 * hills and 17 degree dip tossed a pushed rover onto its roof; the hills are lower and the dip
 * gentler (8 degrees), the wall taller and steeper. */
const CANYON_TERRAIN: Vec2[] = (() => {
  let t = withHill(flat(), 8, 14, 0.4);
  t = withHill(t, 17, 25, 0.6);
  t = withSlope(t, 28, 34, -0.8); // down into the dip...
  t = withSlope(t, 38, 44, 0.8); // ...and out
  t = withSlope(t, 46, 62, 2.5); // the long climb
  return withSlope(t, 62, 66, 4); // the canyon wall
})();

/** Rocky ridge: rock stairs, a plateau, a 1.6 m drop, flat ground, a bumpy valley (x 40-60). On
 * Mars the drop throws a rover ~5 m, so the bumps start 10 m after it (6 m before 2026-10-09): a
 * rover landing on them tumbled. */
const RIDGE_TERRAIN: Vec2[] = withCobbles(withKerb(withStairs(flat(), 10, 4, 0.2, 0.8), 30, -1.6), 40, 60, 0.15, 0.6);

/** Crater hops: the gap after each ramp (m), widest last. Mars lets a rover jump farther, so each
 * is about 1.5x the old one (1.5, 2.5, 3.5, 5 m at 10 m/s^2). */
export const HOP_GAPS = [2.5, 4, 5.5, 7.5];
const HOPS_TERRAIN: Vec2[] = (() => {
  let t = flat();
  let x = 10;
  for (const gap of HOP_GAPS) {
    t = withJump(t, x, 15, 0.6, gap);
    x = jumpEnd(x, 15, 0.6, gap) + 8;
  }
  return t;
})();

/** Mars marathon: the chapter in one run. Rubble and three rock steps right after the start
 * (where the rover is still slow: at speed, rubble flips a Mars rover), a long run-up to a 5.5 m
 * jump, then sand from x 46 to 74 with a dune and three rocks, and a rise to the beacon. */
const MARATHON_TERRAIN: Vec2[] = (() => {
  let t = withCobbles(flat(), 7, 13, 0.15, 0.6);
  t = withStairs(t, 16, 3, 0.2, 0.8);
  t = withJump(t, 30, 15, 0.6, 5.5);
  t = withHill(t, 50, 58, 1);
  return withSlope(t, 78, 82, 1);
})();
const MARATHON_SAND = [sand(46, 74)];
const MARATHON_ROCKS = [rockAt(62), rockAt(66), rockAt(70, 'big')];

export const MARS_LEVELS: VehicleLevel[] = [
  // 1. jump: the welcome to Mars ----------------------------------------------------------------
  // A 15 degree ramp to a 1 m lip, an 8 m crevasse (5.5 m before Mars), landing 0.5 m below the
  // start. On Mars plain round wheels fly 5.1 m off this ramp, so the crevasse is wider than at
  // home: every wheels-only build drops in. A push on round wheels flies over (on Mars even the fan
  // pushes hard): the fan most reliably (33 of 62 round-wheel fan builds), a stove or a jet less
  // often (16 of 48, 4 of 20: their big push can tip a light rover onto its roof as it lands).
  // Star and square wheels are too slow up the ramp; a jet or a stove carries some of them across.
  // "Land on the wheels" is `upsideDown == 0` (2026-10-09, main: `flips` counts only full turns,
  // so a rover sliding in on its roof would have passed): 64 of 742 builds pass.
  level({
    id: 'jump',
    planet: 'mars',
    title: 'Crevasse jump',
    bruno: 'Welcome to Mars! Gravity is weak here, so Kevin falls slower, jumps farther and bounces higher. But look at this HUGE crevasse!',
    terrain: withRampToLip(flat(), 9, 15, 1, 8, -0.5),
    budget: 9,
    extentW: 30,
    palette: ALL_PARTS,
    goals: [
      ...REACH,
      { metric: 'upsideDown', op: '==', value: 0, label: 'Land on the wheels' },
    ],
    hints: [
      'On Mars the rover jumps farther than at home, but at wheel speed it still drops into this crevasse.',
      'Faster means farther. On Mars even a little fan pushes the rover hard!',
      'Two round wheels and a fan on the back fly right over.',
    ],
    failHints: {
      fell: 'Into the crevasse! The rover needs more speed. Stick something on the back that pushes.',
      stuck: 'We made it across but landed upside down! Try the pusher lower on the back.',
    },
    solution: [
      ['wheelCircle', -45],
      ['wheelCircle', -135],
      ['fan', 180],
    ],
    altSolutions: [
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['fan', 180]],
      [['wheelCircle', -30], ['wheelCircle', -150], ['stove', 180]],
      [['wheelCircle', -45], ['wheelCircle', -135], ['jet', 180]],
      [['wheelCircle', -30], ['wheelCircle', -90], ['wheelCircle', -150], ['stove', 180]],
      [['wheelSquare', -30, 'spring'], ['wheelSquare', -150, 'spring'], ['jet', 180]],
    ],
  }),

  // 2. rubble ----------------------------------------------------------------------------------
  // 0.2 m cobbles (x 6-12), then four 0.15 m steps from x 16, under 12 s. On Mars a rover reaches
  // the rubble slowly and every stiff round wheel bounces off the first cobble and stalls (a push
  // only flips it over backwards); stars and squares climb but take 13-24 s (stiff stars mostly
  // stall at the steps). Round wheels on
  // springs ride through in 9-12 s, with a fan or a stove in 6-8 s; a fan or a stove also gets
  // stiff stars or cheap square wheels there in time. "Stay right side up" is `upsideDown == 0`
  // (not `flips == 0`, which missed a rover sliding on its roof): 114 of 862 builds pass.
  level({
    id: 'rubble',
    planet: 'mars',
    title: 'Rubble field',
    bruno: 'Rubble AND rock steps, and Kevin is in a hurry! On Mars every bump throws the rover up high.',
    terrain: withStairs(withCobbles(flat(), 6, 12, 0.2, 0.6), 16, 4, 0.15, 0.6),
    budget: 10,
    extentW: 30,
    palette: ALL_PARTS,
    goals: [
      ...REACH,
      { metric: 'upsideDown', op: '==', value: 0, label: 'Stay right side up' },
      { metric: 'time', op: '<=', value: 12, label: 'Under 12 seconds' },
    ],
    hints: [
      'Stiff round wheels bounce off the rubble and stop. Pointy wheels climb, but slowly.',
      'Springs soak up the rubble AND the bump of every step.',
      'Two round wheels on springs roll over everything, fast.',
    ],
    failHints: {
      stuck: 'Stuck at the rubble! Which mount soaks up bumps?',
      timeout: 'Too slow for Kevin! Try springs, or a push.',
    },
    solution: [
      ['wheelCircle', -45, 'spring'],
      ['wheelCircle', -135, 'spring'],
    ],
    altSolutions: [
      [['wheelCircle', -30, 'spring'], ['wheelCircle', -150, 'spring']],
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['fan', 180]],
      [['wheelSquare', -45, 'spring'], ['wheelSquare', -135, 'spring'], ['stove', 180]],
      [['wheelStar', -45, 'spring'], ['wheelStar', -135, 'spring'], ['fan', 180]],
    ],
  }),

  // 3. race ------------------------------------------------------------------------------------
  // 24 m of flat plain, under 4 s. On Mars the wheels speed up slowly (the torque scales with
  // gravity): wheels alone take 5.2 s, with a fan 4.3 s; a stove (3.8 s) or a jet (3.2 s) wins.
  level({
    id: 'race',
    planet: 'mars',
    title: 'Flat plain race',
    bruno: 'A race across the plain! On Mars the wheels speed up slowly. Can you beat the clock?',
    terrain: flat(),
    budget: 9,
    extentW: 30,
    palette: ALL_PARTS,
    goals: [
      ...REACH,
      { metric: 'time', op: '<=', value: 4, label: 'Under 4 seconds' },
    ],
    hints: [
      'Wheels alone take more than 5 seconds to cross the plain.',
      'Pushers make the rover go faster than its wheels. A fan is not quite enough.',
      'A stove or a jet on the back wins the race.',
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
    altSolutions: [
      [['wheelCircle', -45], ['wheelCircle', -135], ['stove', 180]],
      [['wheelCircle', -30, 'spring'], ['wheelCircle', -150, 'spring'], ['stove', 180]],
      [['wheelSquare', -45], ['wheelSquare', -135], ['jet', 180]],
      [['wheelCircle', -90], ['jet', 180]],
    ],
  }),

  // 4. sand: meet sand (gentle) ------------------------------------------------------------------
  // Rock, then sand from x 8 to 20 with a 15 degree sand rise 1 m tall at x 12, then rock to the
  // beacon on the top. Two round wheels crawl into the sand and stall on the rise, squares barely
  // move; two star wheels paddle up (on springs, faster). A push gets round or square wheels up too
  // (fan, stove). Heavy rovers sink more: two stars with a melon stall on the rise.
  level({
    id: 'sand',
    planet: 'mars',
    title: 'Soft sand',
    bruno: 'Sand! It is soft: round and square wheels sink and slow down. Star wheels paddle through. Heavy rovers sink more.',
    terrain: withSlope(flat(), 12, 12 + 1 / Math.tan((15 * Math.PI) / 180), 1),
    surfaces: [sand(8, 20)],
    budget: 9,
    extentW: 30,
    palette: ALL_PARTS,
    hints: [
      'Round wheels sink in the sand and cannot climb the sandy hill.',
      'Star wheels dig their points in and paddle. Leave the heavy things at home!',
      'Two star wheels drive right through the sand.',
    ],
    failHints: {
      stuck: 'Stuck in the sand! Which wheels paddle through sand? Is the rover too heavy?',
      timeout: 'So slow in the sand! Try wheels that grip sand.',
    },
    solution: [
      ['wheelStar', -45],
      ['wheelStar', -135],
    ],
    altSolutions: [
      [['wheelStar', -45, 'spring'], ['wheelStar', -135, 'spring']],
      [['wheelCircle', -45], ['wheelCircle', -135], ['fan', 180]],
      [['wheelCircle', -45], ['wheelCircle', -135], ['stove', 180]],
      [['wheelSquare', -45], ['wheelSquare', -135], ['fan', 180]],
    ],
  }),

  // 5. dunes (sand challenge) ---------------------------------------------------------------------
  // Two sand dunes (1.2 m and 1.6 m, slopes up to 28 degrees) from x 7 to 26, under 10 s. Round
  // and square wheels alone stall on the first dune; stars climb both but take 11-18 s (on springs,
  // the quicker). A push makes the dash: two stars with a fan (8.4 s; on springs 7.4 s) or a stove
  // (6 s), round wheels with a stove (9.3 s), or a jet (it shoves even square wheels over).
  // Weight costs time in sand: beans on the springy stars with a fan, 9.2-9.7 s.
  level({
    id: 'dunes',
    planet: 'mars',
    title: 'Dune dash',
    bruno: 'Big sand dunes, and Kevin is in a hurry! Star wheels can climb them. What makes them faster?',
    terrain: withHill(withHill(flat(), 7, 14.2, 1.2), 16.2, 25.8, 1.6),
    surfaces: [sand(6, 26.5)],
    budget: 12,
    extentW: 30,
    palette: ALL_PARTS,
    goals: [
      ...REACH,
      { metric: 'time', op: '<=', value: 10, label: 'Under 10 seconds' },
    ],
    hints: [
      'Star wheels paddle up every dune, but slowly.',
      'A push helps in sand too. And a light rover sinks less!',
      'Two star wheels and a fan on the back dash over the dunes.',
    ],
    failHints: {
      stuck: 'Stuck on a dune! Round wheels sink in sand. Which wheels paddle up?',
      timeout: 'Too slow for Kevin! Add a push.',
    },
    solution: [
      ['wheelStar', -45],
      ['wheelStar', -135],
      ['fan', 180],
    ],
    altSolutions: [
      [['wheelStar', -45, 'spring'], ['wheelStar', -135, 'spring'], ['fan', 180]],
      [['wheelStar', -45], ['wheelStar', -135], ['stove', 180]],
      [['wheelCircle', -45], ['wheelCircle', -135], ['stove', 180]],
      [['wheelCircle', -30, 'spring'], ['wheelCircle', -150, 'spring'], ['jet', 180]],
      [['wheelSquare', -45], ['wheelSquare', -135], ['jet', 180]],
    ],
  }),

  // 6. rocky: meet rocky sand (gentle) ------------------------------------------------------------
  // Sand from x 8 to 23 with three medium rocks (x 12, 16, 20). A stiff wheel crawling through the
  // sand hits a rock and cannot climb out over it (two round wheels, two stars, with or without a
  // fan); springs bounce the wheels over: two stars on springs grip the sand AND bounce (12 s), two
  // round wheels on springs bounce and crawl (15 s). A fan or a stove also shoves cheap square
  // wheels over.
  level({
    id: 'rocky',
    planet: 'mars',
    title: 'Rocky sand',
    bruno: 'Rocks in the sand! Sand is soft and rocks are hard. Grip the sand, and bounce over the rocks.',
    terrain: flat(),
    surfaces: [sand(8, 23)],
    rocks: [rockAt(12), rockAt(16), rockAt(20)],
    budget: 9,
    extentW: 30,
    palette: ALL_PARTS,
    hints: [
      'Stiff wheels bump into a rock and stop.',
      'Springs bounce the wheels over rocks. Star wheels grip the sand.',
      'Two star wheels on springs grip AND bounce.',
    ],
    failHints: {
      stuck: 'Stuck at a rock! What makes wheels bounce over bumps?',
      timeout: 'So slow! Star wheels grip sand best.',
    },
    solution: [
      ['wheelStar', -45, 'spring'],
      ['wheelStar', -135, 'spring'],
    ],
    altSolutions: [
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring']],
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['fan', 180]],
      [['wheelSquare', -45], ['wheelSquare', -135], ['fan', 180]],
      [['wheelStar', -30, 'spring'], ['wheelStar', -150, 'spring'], ['feather', 90]],
    ],
  }),

  // 7. rockfield (rocky-sand challenge) -----------------------------------------------------------
  // Sand from x 6 to 26: a medium rock, a big one, a dune 0.9 m tall with a small rock on top, a
  // medium rock. On Mars a rover that hits a big rock fast is tossed over it nose first, so this
  // is grip, bounce and steady: two stars on springs (14 s), with a fan (10-12 s), round wheels on
  // springs with a fan (13 s) or a stove; a jet blasts over the rocks. Stiff wheels with no push
  // stall at a rock (a fan or a stove shoves stiff stars, slowly squares, over). 60 of 1075 builds
  // pass; of the wheels-only builds just the default two stars on springs.
  level({
    id: 'rockfield',
    planet: 'mars',
    title: 'Rock garden',
    bruno: 'A big rock garden in the sand! Big rocks can toss a fast rover over. Grip, bounce and keep steady.',
    terrain: withHill(flat(), 15, 22, 0.9),
    surfaces: [sand(6, 26)],
    rocks: [rockAt(9), rockAt(12.5, 'big'), rockAt(18.5, 'small'), rockAt(23.5)],
    budget: 12,
    extentW: 30,
    palette: ALL_PARTS,
    hints: [
      'Stiff wheels get stuck at the rocks.',
      'Springs bounce over rocks, star wheels grip sand. Too fast, and a big rock flips you!',
      'Two star wheels on springs crawl through the whole garden.',
    ],
    failHints: {
      stuck: 'Stuck! Springs bounce over rocks. Tipped over? Not so fast!',
      timeout: 'Too slow! Star wheels grip sand best. A gentle push helps.',
    },
    solution: [
      ['wheelStar', -45, 'spring'],
      ['wheelStar', -135, 'spring'],
    ],
    altSolutions: [
      [['wheelStar', -30, 'spring'], ['wheelStar', -150, 'spring'], ['fan', 180]],
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['fan', 180]],
      [['wheelCircle', -30, 'spring'], ['wheelCircle', -150, 'spring'], ['stove', 180]],
      [['wheelStar', -45], ['wheelStar', -135], ['jet', 150]],
    ],
  }),

  // ---- the long challenges (2026-10-05) ------------------------------------------------------
  // 75-90 m each, the beacon far to the right: the level opens with a pan from the beacon back to
  // the start (spec.ts `intro`) and the camera follows the rover there. Every part is on offer.

  // 8. flip ------------------------------------------------------------------------------------
  // Kevin starts on a 9 m mesa; two 4.5 m cliffs (x 16 and 40), each with 4 m of sand before its
  // edge (FLIP_SAND), then 40 m of flat run to the beacon. The rover creeps through the sand, tips
  // over the edge and lands on its roof; it keeps going only with wheels on top too (sim.ts
  // `driveSign`). Landings are chaotic, so this is a "most of the time" level: none of the 386
  // wheels-only builds without top wheels gets through, and a push rolls only one in eleven of the
  // others back onto its wheels (65 of 689); round wheels top and bottom pass about a third of the
  // time (48 of 166), stars and squares on top are mostly too slow in the sand. The solution and
  // the alternatives drive 20-57 m of it upside down (the plain sandwich at +/-45 degrees passes
  // too, mostly on its side).
  level({
    id: 'flip',
    planet: 'mars',
    title: 'Topsy-turvy',
    bruno: 'Giant cliffs with sand at the edges! The rover will tip onto its roof. Stick wheels on top too, so it can drive upside down!',
    terrain: FLIP_TERRAIN,
    surfaces: FLIP_SAND,
    budget: 12,
    extentW: 84,
    palette: ALL_PARTS,
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
      ['wheelCircle', -30],
      ['wheelCircle', -150],
      ['wheelCircle', 30],
      ['wheelCircle', 150],
    ],
    altSolutions: [
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['wheelCircle', 45, 'spring'], ['wheelCircle', 135, 'spring']],
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['wheelCircle', 90, 'spring']],
      [['wheelCircle', -45], ['wheelCircle', -135], ['wheelCircle', 45], ['wheelCircle', 135], ['fan', 180]],
      [['wheelStar', -45, 'spring'], ['wheelStar', -135, 'spring'], ['wheelStar', 90, 'spring']],
    ],
  }),

  // 9. canyon ----------------------------------------------------------------------------------
  // Two low hills, a gentle dip, the long climb (2.5 m over 16 m), then a 4 m wall at 45 degrees
  // (x 62-66) up to the plateau and the beacon at x 78. Wheels alone stall or flip over backwards
  // on the wall (7 of 611 wheels-only builds pass: two or three round wheels on springs with a
  // wide stance or a weight in front); a push gets up it: two round wheels on springs with a fan or
  // a stove, a wide stance with a fan, three or four round wheels with a fan. A stiff two-wheeler
  // at the default spots with only a fan stalls just below the top.
  level({
    id: 'canyon',
    planet: 'mars',
    title: 'Canyon climb',
    bruno: 'Hills, a dip, then the giant canyon wall! It is extra tall and steep. Wheels alone will slip.',
    terrain: CANYON_TERRAIN,
    budget: 12,
    extentW: 82,
    palette: ALL_PARTS,
    finishX: 78,
    timeout: LONG_TIMEOUT,
    hints: [
      'Round wheels roll over the hills and the dip just fine.',
      'The canyon wall at the end is too steep for wheels alone. What pushes?',
      'Two round wheels on springs and a fan on the back push right up the wall.',
    ],
    failHints: {
      stuck: 'Stuck on the canyon wall! Stick something on the back to push.',
      fell: 'Whoa, it rolled off! Wheels at the front and the back keep it steady.',
      timeout: 'Too slow for Kevin! Round wheels roll fastest.',
    },
    solution: [
      ['wheelCircle', -45, 'spring'],
      ['wheelCircle', -135, 'spring'],
      ['fan', 180],
    ],
    altSolutions: [
      [['wheelCircle', -30], ['wheelCircle', -150], ['fan', 180]],
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['beans', 0], ['stove', 180]],
      [['wheelCircle', -30, 'spring'], ['wheelCircle', -90, 'spring'], ['wheelCircle', -150, 'spring'], ['fan', 180]],
      [['wheelCircle', -45], ['wheelCircle', -135], ['wheelCircle', 45], ['wheelCircle', 135], ['feather', 90], ['fan', 180]],
      [['wheelStar', -45, 'spring'], ['wheelStar', -135, 'spring'], ['feather', 90], ['fan', 180]],
    ],
  }),

  // 10. ridge ----------------------------------------------------------------------------------
  // Four 0.2 m rock stairs (x 10), a plateau, a 1.6 m drop at x 30, flat ground, then 20 m of
  // 0.15 m bumps (x 40-60) and the beacon at x 76. Stiff wheels stall at the first stair or tumble
  // on the bumps (25 of 1069 stiff builds pass, nearly all with a push); 98 of 845 spring builds
  // pass: round, square or star wheels on springs, with or without a push, some with wheels on top
  // to drive on after a tumble.
  level({
    id: 'ridge',
    planet: 'mars',
    title: 'Rocky ridge',
    bruno: 'Rock stairs up the ridge, a big drop, then a bumpy valley! What soaks up all those bumps?',
    terrain: RIDGE_TERRAIN,
    budget: 14,
    extentW: 80,
    palette: ALL_PARTS,
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
      [['wheelCircle', -30, 'spring'], ['wheelCircle', -150, 'spring']],
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['fan', 150]],
      [['wheelCircle', -60, 'spring'], ['wheelCircle', -120, 'spring'], ['wheelCircle', 60, 'spring'], ['wheelCircle', 120, 'spring']],
      [['wheelSquare', -45, 'spring'], ['wheelSquare', -135, 'spring'], ['feather', 0], ['stove', 180]],
      [['wheelStar', -30, 'spring'], ['wheelStar', -150, 'spring'], ['fan', 180]],
    ],
  }),

  // 11. hops -----------------------------------------------------------------------------------
  // Four 15 degree ramps to a 0.6 m lip, each over a wider gap: 2.5, 4, 5.5, then 7.5 m (HOP_GAPS,
  // ~1.5x the old gaps: Mars lets a rover jump farther), 8 m apart, the beacon at x 80. Plain
  // wheels hop the first three and drop into the last (no wheels-only build passes); a push
  // carries round wheels over all four (fan 63 of 164 round-wheel builds, stove 46 of 156, jet 35
  // of 130: on Mars a jet throws a light rover so high it often lands on its roof). Star and square
  // wheels are too slow up the ramps.
  level({
    id: 'hops',
    planet: 'mars',
    title: 'Crater hops',
    bruno: 'Ramp, gap, ramp, gap! Mars lets you jump farther, so these gaps are extra wide. And the last one is HUGE.',
    terrain: HOPS_TERRAIN,
    budget: 15,
    extentW: 84,
    palette: ALL_PARTS,
    finishX: 80,
    timeout: LONG_TIMEOUT,
    hints: [
      'Plain wheels hop the small gaps, but not the last one.',
      'Faster means farther. On Mars a little push goes a long way.',
      'Two round wheels on springs and a fan on the back fly over every gap.',
    ],
    failHints: {
      fell: 'Into the crater! Faster means farther. Try something that pushes.',
      stuck: 'Landed on its roof? A gentler push, springs, or wheels on top!',
      timeout: 'Too slow for Kevin! Try something that pushes.',
    },
    solution: [
      ['wheelCircle', -45, 'spring'],
      ['wheelCircle', -135, 'spring'],
      ['fan', 180],
    ],
    altSolutions: [
      [['wheelCircle', -45], ['wheelCircle', -135], ['feather', 90], ['fan', 180]],
      [['wheelCircle', -30, 'spring'], ['wheelCircle', -150, 'spring'], ['stove', 180]],
      [['wheelCircle', -30, 'spring'], ['wheelCircle', -90, 'spring'], ['wheelCircle', -150, 'spring'], ['jet', 180]],
      [['wheelCircle', -45], ['wheelCircle', -135], ['wheelCircle', 45], ['wheelCircle', 135], ['fan', 180]],
      [['wheelCircle', -20, 'spring'], ['wheelCircle', -65, 'spring'], ['wheelCircle', -115, 'spring'], ['wheelCircle', -160, 'spring'], ['stove', 180]],
    ],
  }),

  // 12. marathon -------------------------------------------------------------------------------
  // The whole chapter across the whole world, under 30 s: rubble and three rock steps (springs), a
  // 5.5 m jump (a push), 28 m of sand with a dune and three rocks (grip or a push, and bounce), a
  // rise and the beacon at x 87. The hardest level (17 of 2365 builds pass): no wheels-only build
  // gets through (stiff round wheels stall at the rubble, squares drop into the gap, round wheels
  // on springs clear the jump but stall on the sandy dune); round wheels on springs with a fan or
  // a stove make it, so do star wheels with a jet.
  level({
    id: 'marathon',
    planet: 'mars',
    title: 'Mars marathon',
    bruno: 'The big one! Rubble, steps, a jump, dunes and rocks, all the way across Mars. And Kevin is in a hurry!',
    terrain: MARATHON_TERRAIN,
    surfaces: MARATHON_SAND,
    rocks: MARATHON_ROCKS,
    budget: 20,
    extentW: 90,
    palette: ALL_PARTS,
    finishX: 87,
    timeout: LONG_TIMEOUT,
    goals: [
      ...REACH,
      { metric: 'time', op: '<=', value: 30, label: 'Under 30 seconds' },
    ],
    hints: [
      'Rubble? Springs. A jump? Speed. Sand and rocks? Grip and bounce!',
      'Wheels alone get stuck somewhere. Something has to push!',
      'Two round wheels on springs and a fan on the back. Go, Kevin, go!',
    ],
    failHints: {
      stuck: 'Stuck! Springs soak up rubble, steps and rocks.',
      fell: 'Into the gap! The rover needs more speed for the jump.',
      timeout: 'Too slow for Kevin! Add something that pushes.',
    },
    solution: [
      ['wheelCircle', -45, 'spring'],
      ['wheelCircle', -135, 'spring'],
      ['fan', 180],
    ],
    altSolutions: [
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['stove', 150]],
      [['wheelStar', -30], ['wheelStar', -150], ['jet', 180]],
      [['wheelCircle', -30, 'spring'], ['wheelCircle', -150, 'spring'], ['wheelCircle', 30, 'spring'], ['wheelCircle', 150, 'spring'], ['stove', 180]],
    ],
  }),

  // 13. free play -------------------------------------------------------------------------------
  // Two hills (the free play of 2026-10-02) and the beacon at x 27 on rock, then sand from x 30 to
  // 62 with a dune and four rocks to play in, then rock to the right edge.
  level({
    id: 'free',
    planet: 'mars',
    title: 'Roam Mars',
    bruno: 'No rules! Lots of coins. Build the wildest rover you can and roam Mars: hills, sand, rocks and all.',
    terrain: withHill(withHill(withHill(flat(), 8, 12, 0.8), 18, 22, 0.6), 36, 44, 1),
    surfaces: [sand(30, 62)],
    rocks: [rockAt(33, 'small'), rockAt(48), rockAt(53, 'big'), rockAt(58)],
    budget: 40,
    extentW: 90,
    palette: ALL_PARTS,
    goals: [],
    hints: [
      'Try fifteen wheels all around. Or two wheels and three jets!',
      'Drag any part around the dome to stick it somewhere else.',
      'There is no wrong rover in free play. Build it, drive it, watch what happens!',
    ],
    failHints: {},
  }),
];
