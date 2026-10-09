// Europa (2026-10-09): Jupiter's icy moon, the third chapter. Gao, 2026-10-09: "i want new
// challenge levels on europa, where the surface is covered ice". Europa's gravity is 1.3 m/s^2 and
// its ground is ice wherever a level's `surfaces` say nothing (planets.ts): round and square
// wheels spin and slide there, star wheels bite in, and fans, stoves and jets push no matter what
// (surfaces.ts). Levels go in EUROPA_LEVELS with `planet: 'europa'` (shared.ts has the how-to).
//
// The chapter comes after Mars, so the child knows every part, the mount, sand and rocks: a gentle
// "meet the ice" level, then challenges (Gao: "im ok with multiple solutions per level"). What
// Europa changes, and what the levels are built around:
//  - Ice: on the planet's ice a round or square wheel grips 0.06-0.07, so it cannot climb more
//    than a ~3 degree rise and creeps on the flat (two round wheels: 0.4 m/s after 6 s); a star
//    wheel grips 0.5 (climbs ~25 degrees, ~2 m/s on the flat). A fan, stove or jet pushes the
//    same on ice as anywhere, and nothing slows the rover down, so a pushed rover just keeps
//    speeding up (two round wheels and a fan: 9 m/s after 10 s).
//  - Tiny gravity: a rover weighs 0.13 of what it does on Flooftopia, so it floats a long way off
//    a ramp (a fan rover clears a 6 m crack) and every crest, rock or kink throws it into the air.
//    The wheel motors are scaled with gravity (planets.ts) but pushers are not: a jet (12 N) is
//    three times a light rover's weight and launches it off the first bump (it flies over the
//    beacon, or tumbles), and a fan (4 N) is about its weight, so a rover tipped onto its tail
//    hovers on its fan.
//  - Rock (`rock(a, b)`, `rocks`) grips every wheel again: round wheels drive (and keep their
//    speed sliding onto ice), star wheels are slow on it (1.9 m/s).
// So each level asks one question, and no single cheap build answers them all: two plain round
// wheels pass only the Rock runway (on purpose: there the runway is rock); two round or square
// wheels and a jet on the back pass one level at most, the round ones none within budget
// (europa.test.ts checks both). A push is the strong
// answer on ice, as Bruno says: two round wheels and a fan pass four levels, all but the frozen
// rocks, where they tumble.
//
// Tuning: every level was searched with the sim (2-4 wheels of one shape in five layouts, cup or
// spring; plus one weight on the top, front, back or bottom and/or one pusher at 180, -150, 150,
// -120 or -90 degrees, cup or spring; pushers alone; and for the trek six more layouts with wheels
// on top: 800-3054 builds per level). The comment on each level gives the counts and what passes.
// Low gravity makes landings chaotic (moving a wheel 5 degrees can turn a landing into a tumble),
// so every `solution` and `altSolutions` build was also checked with its wheels moved -15..+15
// degrees, and only builds that pass most of those are listed.
import { flat, jumpEnd, withHill, withJump, withSlope } from '../terrain';
import { rock } from '../surfaces';
import type { Vec2, VehicleLevel } from '../types';
import { ALL_PARTS, LONG_TIMEOUT, REACH, level, rockAt } from './shared';

/** The frozen rocks also ask the rover not to tumble: no metres driven on its roof (upsideDown, which
 * catches a rover that slides in upside down; the flips counter only sees full turns). */
const STAY_UPRIGHT: VehicleLevel['goals'][number] = { metric: 'upsideDown', op: '==', value: 0, label: 'Stay right side up' };

// ---- terrains ----------------------------------------------------------------------------------

/** Icy hill: one smooth hill 2 m tall from x 8 to 24 (21 degrees at its steepest: a star wheel
 * grips up it, a round wheel spins at its foot). */
const ICE_HILL: Vec2[] = withHill(flat(), 8, 24, 2);

/** Floaty jump: an icy 15 degree ramp up to a 0.6 m lip at x 12.2, a 6 m crack, the landing 0.6 m
 * below the start. */
const CRACK: Vec2[] = withJump(flat(), 10, 15, 0.6, 6, -0.6);

/** Frozen rocks: flat ice with three medium rocks (0.7 x 0.25 m) standing in it, 4 m apart. (Four
 * small ones were too low: the dome alone with a stove hovered over them, see the level.) */
const FROZEN_ROCKS = [rockAt(10), rockAt(14), rockAt(18)];

/** Rock runway: the Floaty jump's shape one size smaller (ramp from x 14, a 5 m crack), with rock
 * from the start to the lip and ice after the crack. */
const RUNWAY_RAMP_X = 14;
const RUNWAY: Vec2[] = withJump(flat(), RUNWAY_RAMP_X, 15, 0.6, 5, -0.6);
/** Where the runway's rock ends: its ramp's lip. */
const RUNWAY_LIP = RUNWAY_RAMP_X + 0.6 / Math.tan((15 * Math.PI) / 180);

/** Europa trek: a straight icy climb (1.2 m over x 10-20), a rock road on top (x 22-32), a 12
 * degree ramp at x 36 over a 3 m crack down to the lower ice (1.2 m down, back to the start's
 * height), three frozen rocks, then a straight icy climb (1.5 m) to the beacon on the far
 * plateau. Straight slopes and a straight ramp, not smooth hills: a pushed rover reaches 8-9 m/s
 * here, and a smooth crest at that speed throws it nose-first into a tumble. */
const TREK_RAMP_X = 36;
const TREK_LANDING = jumpEnd(TREK_RAMP_X, 12, 0.5, 3);
const TREK: Vec2[] = (() => {
  let t = withSlope(flat(), 10, 20, 1.2);
  t = withJump(t, TREK_RAMP_X, 12, 0.5, 3, -1.2);
  return withSlope(t, TREK_LANDING + 16, TREK_LANDING + 26, 1.5);
})();
const TREK_ROCKS = [rockAt(TREK_LANDING + 5, 'small'), rockAt(TREK_LANDING + 8), rockAt(TREK_LANDING + 11, 'small')];

export const EUROPA_LEVELS: VehicleLevel[] = [
  // 1. ice -------------------------------------------------------------------------------------
  // Meet the ice (the gentle first level: one idea, no extra goals). Every wheels-only build of
  // round or square wheels (2-4 of them, cup or spring) spins at the foot of the hill and slides
  // back (stuck): the lesson. Two star wheels climb it (16 s), on springs faster (12 s). A fan or
  // a stove on the back pushes any wheels up; a jet mostly launches the rover off the top into a
  // tumble. 198 of 800 builds pass: 10 star builds without a pusher, 188 with one (10 with a jet).
  level({
    id: 'ice',
    planet: 'europa',
    title: 'Icy hill',
    bruno: "Welcome to Europa, one of Jupiter's moons! It's all ice, with an ocean underneath. Gravity is tiny here, so Kevin floats!",
    terrain: ICE_HILL,
    budget: 8,
    extentW: 30,
    palette: ALL_PARTS,
    hints: [
      'Ice is slippery! Round and square wheels just spin and slide back down the hill.',
      "Star wheels' points bite into the ice. And fans, stoves and jets push no matter what is under you.",
      'Try two star wheels on the bottom. Or two round wheels and a fan on the back.',
    ],
    failHints: {
      stuck: 'The wheels spin on the ice! Star wheels bite in. Or push with a fan!',
      timeout: 'Too slow! Star wheels climb the ice. A fan pushes even faster.',
    },
    solution: [
      ['wheelStar', -45],
      ['wheelStar', -135],
    ],
    altSolutions: [
      [['wheelCircle', -45], ['wheelCircle', -135], ['fan', 180]],
      [['wheelStar', -45, 'spring'], ['wheelStar', -135, 'spring']],
      [['wheelSquare', -45, 'spring'], ['wheelSquare', -135, 'spring'], ['stove', 180]],
    ],
  }),

  // 2. crack -----------------------------------------------------------------------------------
  // Floaty jump. Round and square wheels spin at the foot of the icy ramp; star wheels climb it
  // but leave the lip at 2 m/s and drop into the crack (every star build without a pusher). A fan
  // or a stove has the rover at 5-6 m/s by the lip, and in tiny gravity it floats right over: 207
  // of 800 builds pass, all with a pusher (121 fan, 65 stove, 21 jet; and, for fun, the dome alone
  // with a stove tilted down at the back, -150: in tiny gravity it hovers over like a sled). Just reaching the beacon is the goal, no flips
  // goal: the float is long (2-3 s) and tips every rover nose-down. With a fan straight on the
  // back the rover comes down nose-first at x ~20 and often rolls onto its roof and slides into
  // the beacon (fine on ice, and funny, but a "land on the wheels" goal would read wrong next to
  // it: flips only counts full turns); a fan low on the back (-150) also lifts it, so it floats
  // all the way to the beacon, which is why the hints suggest it.
  level({
    id: 'crack',
    planet: 'europa',
    title: 'Floaty jump',
    bruno: 'A crack in the ice! Gravity is tiny here, so a fast rover floats a LONG way. But how do you go fast on ice?',
    terrain: CRACK,
    budget: 8,
    extentW: 30,
    palette: ALL_PARTS,
    hints: [
      'Star wheels climb the icy ramp, but they are too slow to float over the crack.',
      'A fan keeps pushing on the slippery ice, and in the air too!',
      'Two round wheels and a fan low on the back float right over.',
    ],
    failHints: {
      fell: 'Into the crack! Kevin needs more speed. What pushes on ice?',
      stuck: 'Stuck! Wheels slip on the ice: push with a fan. Landed upside down? Try the fan lower on the back.',
    },
    solution: [
      ['wheelCircle', -45],
      ['wheelCircle', -135],
      ['fan', -150],
    ],
    altSolutions: [
      [['wheelCircle', -30], ['wheelCircle', -90], ['wheelCircle', -150], ['fan', 180]],
      [['wheelCircle', -45], ['wheelCircle', -135], ['feather', 90], ['fan', 180]],
      [['wheelCircle', -45], ['wheelCircle', -135], ['stove', 180]],
      [['wheelCircle', -45], ['wheelCircle', -135], ['beans', 90], ['fan', 180]],
    ],
  }),

  // 3. frozen ----------------------------------------------------------------------------------
  // Frozen rocks: three rocks in flat ice, and the rover must not flip. Rigid wheels bounce off
  // each rock, and in tiny gravity the rover flies, tumbles or bounces to a stop: two star wheels
  // on cups pass 0 times in 7 (wheels moved -15..+15 degrees), on springs 7 in 7 (18-25 s); round
  // and square wheels spin. A pushed rover hits the rocks fast: round wheels on springs with a fan
  // low on the back (-150) mostly hold on (6 in 7), on cups with a fan on the back they mostly
  // flip (1 in 7); a jet tumbles but for a few square-wheel builds. 94 of 1240 builds pass: 7 star
  // builds on springs without a pusher (alone or with a feather), 87 with one (44 fan, 36 stove, 7
  // jet). With four small rocks instead, the dome alone with a stove tilted down at the back (-150,
  // 3 coins) hovered over them in tiny gravity and passed; these rocks stop it.
  level({
    id: 'frozen',
    planet: 'europa',
    title: 'Frozen rocks',
    bruno: 'Rocks frozen in the ice! Every bump bounces Kevin up high here. Keep the rover right side up!',
    terrain: flat(),
    rocks: FROZEN_ROCKS,
    budget: 10,
    extentW: 30,
    palette: ALL_PARTS,
    goals: [...REACH, STAY_UPRIGHT],
    hints: [
      'Stiff wheels bounce off the rocks, and in tiny gravity Kevin flies and flips.',
      'Springs soak up bumps. Star wheels grip the ice.',
      'Two star wheels on springs roll right over the rocks.',
    ],
    failHints: {
      stuck: 'Stuck! Spinning on the ice? Star wheels grip. Bounced over? Springs soak up the rocks.',
      timeout: 'Too slow! Star wheels on springs roll over the rocks.',
    },
    solution: [
      ['wheelStar', -45, 'spring'],
      ['wheelStar', -135, 'spring'],
    ],
    altSolutions: [
      [['wheelStar', -45, 'spring'], ['wheelStar', -135, 'spring'], ['feather', 90]],
      [['wheelStar', -60, 'spring'], ['wheelStar', -120, 'spring']],
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['fan', -150]],
    ],
  }),

  // 4. runway ----------------------------------------------------------------------------------
  // Rock runway: the Floaty jump again, but the run-up is rock, so round wheels grip: two round
  // wheels reach 3.4 m/s by the lip and float over the 5 m crack (8 of 8 with the wheels moved
  // -15..+20 degrees, cup or spring). The twist on the ice levels: star wheels, the heroes so far,
  // are slow on rock (1.9 m/s) and drop into the crack (every star build without a pusher), and
  // so do square wheels. Pushers fly over too, unless they go so fast they crash (208 of 800 pass:
  // 25 round-wheel builds without a pusher, the rest with one). The one Europa level two plain
  // round wheels pass, on purpose.
  level({
    id: 'runway',
    planet: 'europa',
    title: 'Rock runway',
    bruno: 'Look, this runway is rock, not ice! Rock is rough, so every wheel grips again. Can Kevin fly over the crack?',
    terrain: RUNWAY,
    surfaces: [rock(-1, RUNWAY_LIP)],
    budget: 8,
    extentW: 30,
    palette: ALL_PARTS,
    hints: [
      'Star wheels grip the rock, but they are slow. Too slow to float over the crack.',
      'Round wheels are the fastest wheels on rock.',
      'Two round wheels speed up on the rock and float right over the crack!',
    ],
    failHints: {
      fell: 'Into the crack! Which wheels are fastest on rock?',
      stuck: 'Stuck! Round wheels race along the rock.',
    },
    solution: [
      ['wheelCircle', -45],
      ['wheelCircle', -135],
    ],
    altSolutions: [
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring']],
      [['wheelCircle', -45], ['wheelCircle', -135], ['feather', 90]],
      [['wheelCircle', -40], ['wheelCircle', -140], ['fan', 180]],
    ],
  }),

  // 5. trek ------------------------------------------------------------------------------------
  // The long one (the scrolling camera), everything at once: an icy climb (round wheels spin at
  // its foot), a rock road, a crack (star wheels on cups drop in), frozen rocks and a last icy
  // climb to the beacon at x 80. Pushed rovers reach 8-9 m/s and often tumble a full turn on the
  // way, so there is no flips goal: springs and a fan carry the rover through whichever way it
  // lands (two round wheels on springs and a fan: 7 of 7 with the wheels moved -15..+15 degrees,
  // ~15 s, tumbling twice and sliding in on the roof). A third round wheel on top keeps it from
  // tumbling at all (7 of 7, 14.5 s, never upside down), so the hints and the solution use that.
  // Star wheels on springs crawl the whole way (~40 s of the 45). Jets tumble or fly off. 559 of
  // 3054 builds pass (none of round or square wheels without a pusher; 12 slow star builds on
  // springs; 282 with a fan, 180 with a stove, 85 with a jet).
  level({
    id: 'trek',
    planet: 'europa',
    title: 'Europa trek',
    bruno: 'The big Europa trek! An icy climb, a rock road, a crack and frozen rocks, all the way to the far beacon.',
    terrain: TREK,
    surfaces: [rock(22, 32)],
    rocks: TREK_ROCKS,
    budget: 14,
    extentW: 84,
    palette: ALL_PARTS,
    finishX: 80,
    timeout: LONG_TIMEOUT,
    hints: [
      'Round wheels spin on the icy climbs. Star wheels grip, but they are slow.',
      'A fan pushes on the ice AND over the crack. Springs soak up the rocks and the landings.',
      'Two round wheels on springs, one more on top for when Kevin tumbles, and a fan on the back. Go, Kevin, go!',
    ],
    failHints: {
      stuck: 'Stuck! Spinning on the ice? Push with a fan. Upside down? Springs and a wheel on top help.',
      fell: 'Into the crack! Kevin needs more speed. What pushes on ice?',
      timeout: 'Too slow for Kevin! A fan pushes all the way.',
    },
    solution: [
      ['wheelCircle', -45, 'spring'],
      ['wheelCircle', -135, 'spring'],
      ['wheelCircle', 90, 'spring'],
      ['fan', 180],
    ],
    altSolutions: [
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['fan', 180]],
      [['wheelStar', -45, 'spring'], ['wheelStar', -135, 'spring'], ['fan', 180]],
      [['wheelSquare', -45, 'spring'], ['wheelSquare', -135, 'spring'], ['fan', 180]],
      [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring'], ['fan', -150]],
      [['wheelStar', -45, 'spring'], ['wheelStar', -135, 'spring']],
    ],
  }),
];
