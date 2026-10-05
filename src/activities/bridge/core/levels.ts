// Bridge Builder: "Bruno's toolbox." The fuzzes' buggy has to cross the park's river. Rods can
// be 5 m at most (cable 8 m), triangles are strong, and every crossing has a budget. Units are
// meters, y up, banks at y 4, world 30 m wide (see core/build.ts).
//
// core/{types,catalog,rules}.ts had already landed when this file was written; core/sim.ts landed
// partway through and every design below has since been run against it (`npx vitest run
// .../levels.test.ts`, all green) and tuned to what it actually does, not just to hand computation
// against `MATERIALS`/`rodLength`/`totalCost` or the plan's own worked examples. sim.ts and
// build.ts were themselves still moving while this ran (a build.ts edit landed mid-tuning and
// changed several margins), so every number below comes from the sim as it stood when this file
// was finished, not from hand analysis - if core/build.ts or core/sim.ts change again, rerun
// `levels.test.ts` before trusting these numbers. Two shapes ended up needing a taller brace than
// the plan's own sketch, and one cable needed dropping outright, each forced by either the
// catalog's hard rules or by what the live sim actually measures (never by taste):
//  - `cable`: the plan's second cable ("pylon to the far anchor") is geometrically impossible
//    under the 8 m cable cap for an 8 m gap with a 6 m pylon (minimum possible distance is
//    exactly 8.0 m at zero height, so any positive pylon height already exceeds the cap) - and a
//    rod between two static anchors carries zero stress regardless, so it would have been inert
//    even if legal. The solution here uses one cable, to the middle joint, which is enough to
//    hold that joint up since the two road deck rods are horizontal two-force members and
//    contribute no vertical support of their own to fight.
//  - `long`: the plan's mixed wood/steel bracing (wood verticals and interior diagonals, steel
//    only for the chord and end diagonals) runs hot from dead load alone against the live sim -
//    one interior wood diagonal already sits at 33% of its break strain before the buggy ever
//    gets on - and cascades into a 7-rod collapse partway across. Steel throughout (3x wood's
//    stiffness) settles at 72.5% peak stress with zero breaks and cost 111 (comfortably under the
//    130 budget), so every brace is steel, not just the chord and end diagonals.
//  - `triangle`/`material` share `kingpost6m`, a joint above the middle of a 6 m span with two
//    struts down to the banks and a tie down to the deck. At the plan's own 1.5 m rise (peak 5.5)
//    the *tie* has plenty of margin even under Heavy, but the *struts* snap under ordinary Light
//    traffic - a shallower rise means more compression in the struts for the same vertical support.
//    A 2.5 m rise (peak 6.5, strut length 3.905 m, under the 4 m cap) is the shallowest that keeps
//    wood under Light comfortably under its break strain (77%); at that same rise wood still snaps
//    under Heavy (in the struts, `material`'s failing preset) while steel holds Heavy at 42%.
//  - `budget`/`tight`/`heavy` share `queenTruss8m`, two 4 m road panels plus a top chord. At the
//    plan's own 2 m chord height the wood version already sits at 85-88% peak stress under Light
//    (too close to its break strain to trust) and fails outright under Medium (needed for `tight`).
//    A 2.5 m chord height (diagonal 3.202 m, under the cap) settles wood at 52% (Light, `budget`)
//    and 66% (Medium, `tight`), and steel at 37% (Heavy, `heavy`) - comfortable margin on all three.
//    `tight`'s budget (35) is `budget`'s wood-truss cost at this height (~32.8) plus about 10%, per
//    the plan's own instruction to size it from what the sim shows holds.
import type { BridgeLevel, Goal, Material, Metrics, PlacedPart } from './types';

// ---- small builders --------------------------------------------------------------------------

interface Node {
  id: number;
  x: number;
  y: number;
}

function anchor(id: number, x: number, y: number): PlacedPart {
  return { id, kind: 'anchor', x, y, props: {}, locked: true, lockPosition: true };
}

/** A child-placed joint. `locked` is only used by the `material` preset, which is pre-built in
 * full (the child may only swap a rod's material, not move or remove anything). */
function joint(id: number, x: number, y: number, locked = false): PlacedPart {
  return locked
    ? { id, kind: 'joint', x, y, props: {}, locked: true, lockPosition: true }
    : { id, kind: 'joint', x, y, props: {} };
}

function rod(id: number, material: Material, a: Node, b: Node, locked = false): PlacedPart {
  return {
    id,
    kind: 'rod',
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    props: { material, from: String(a.id), to: String(b.id) },
    lockPosition: true,
    ...(locked ? { locked: true } : {}),
  };
}

function crossedGoal(): Goal<Metrics> {
  return { metric: 'crossed', op: '==', value: 1, label: 'The buggy crosses' };
}
function noBreaksGoal(): Goal<Metrics> {
  return { metric: 'rodsBroken', op: '<=', value: 0, label: 'No rod breaks' };
}
function budgetGoal(budget: number): Goal<Metrics> {
  return { metric: 'cost', op: '<=', value: budget, label: 'Cost within budget' };
}

// ---- shared structures ------------------------------------------------------------------------

/** The 6 m "kingpost" truss shared by `triangle` (wood, unlocked - the child builds it from
 * scratch) and `material` (wood then steel, locked - pre-placed, the child only swaps material by
 * tapping a rod). The deck is always road; only the two struts and the tie change material.
 * `peakY` defaults to 6.5 (a 2.5 m rise, strut length hypot(3, 2.5) ~= 3.905 m, under the 4 m rod
 * cap) - measured against the live sim, this is the shallowest peak that keeps the wood version
 * comfortably under its break strain (77%) crossing Light; a 1.5 m rise (peak 5.5, closer to the
 * plan's own sketch) is strong enough in the *tie* but not in the *struts*, which snap under
 * ordinary Light traffic at that angle. At 6.5 the wood version still snaps (in the struts) under
 * Heavy, and steel holds Heavy at 42% of its limit, which is exactly `material`'s lesson. */
function kingpost6m(strutMaterial: 'wood' | 'steel', locked: boolean, peakY = 6.5): PlacedPart[] {
  const aL = anchor(1, 12, 4);
  const aR = anchor(2, 18, 4);
  const mid = joint(3, 15, 4, locked);
  const top = joint(4, 15, peakY, locked);
  return [
    aL,
    aR,
    mid,
    top,
    rod(5, 'road', aL, mid, locked),
    rod(6, 'road', mid, aR, locked),
    rod(7, strutMaterial, aL, top, locked),
    rod(8, strutMaterial, aR, top, locked),
    rod(9, strutMaterial, top, mid, locked),
  ];
}

/** The 8 m "queenpost" truss shared by `budget` (wood chord, Light), `tight` (wood chord, Medium)
 * and `heavy` (steel chord, Heavy): two 4 m road panels plus a 2.5 m tall top chord that carries
 * the middle joint's load out to both banks. Diagonal length is hypot(2, 2.5) ~= 3.202 m, under
 * the 4 m cap. Measured against the live sim: a 2 m chord height leaves the wood version at 85-88%
 * peak stress even under Light (too close to its break strain to trust as a "holds" design, and it
 * does fail outright under Medium); 2.5 m settles it at 52-66% for wood (Light and Medium) and 37%
 * for steel (Heavy), with comfortable margin on every one of the three levels that reuse this. */
function queenTruss8m(chordMaterial: 'wood' | 'steel'): PlacedPart[] {
  const aL = anchor(1, 11, 4);
  const aR = anchor(2, 19, 4);
  const mid = joint(3, 15, 4);
  const t1 = joint(4, 13, 6.5);
  const t2 = joint(5, 17, 6.5);
  return [
    aL,
    aR,
    mid,
    t1,
    t2,
    rod(6, 'road', aL, mid),
    rod(7, 'road', mid, aR),
    rod(8, chordMaterial, t1, t2),
    rod(9, chordMaterial, aL, t1),
    rod(10, chordMaterial, aR, t2),
    rod(11, chordMaterial, mid, t1),
    rod(12, chordMaterial, mid, t2),
  ];
}

/** The 12 m truss for `long`: four 3 m road panels (three deck joints) plus a fully triangulated
 * 2.5 m tall truss above them (steel top chord, steel end diagonals to the banks, steel verticals
 * and steel interior diagonals) - a road deck alone cannot be the chord of a 12 m truss. Measured
 * against the live sim: with wood verticals/diagonals the whole truss runs hot from dead load
 * alone (one interior diagonal already sits at 33% of its limit before the buggy ever gets on)
 * and cascades into a 7-rod collapse within the first crossing; steel throughout (3x wood's
 * stiffness) settles at 72.5% peak stress with zero breaks and comfortable budget room, so this
 * uses steel for every brace, not just the chord and end diagonals. End diagonal length is
 * hypot(3, 2.5) ~= 3.905 m, under the 4 m cap. */
function longTruss12m(): PlacedPart[] {
  const aL = anchor(1, 9, 4);
  const aR = anchor(2, 21, 4);
  const m1 = joint(3, 12, 4);
  const m2 = joint(4, 15, 4);
  const m3 = joint(5, 18, 4);
  const t1 = joint(6, 12, 6.5);
  const t2 = joint(7, 15, 6.5);
  const t3 = joint(8, 18, 6.5);
  return [
    aL,
    aR,
    m1,
    m2,
    m3,
    t1,
    t2,
    t3,
    // road deck, four 3 m panels
    rod(9, 'road', aL, m1),
    rod(10, 'road', m1, m2),
    rod(11, 'road', m2, m3),
    rod(12, 'road', m3, aR),
    // steel top chord
    rod(13, 'steel', t1, t2),
    rod(14, 'steel', t2, t3),
    // steel end diagonals, straight from each bank to the nearest top joint
    rod(15, 'steel', aL, t1),
    rod(16, 'steel', aR, t3),
    // steel verticals
    rod(17, 'steel', m1, t1),
    rod(18, 'steel', m2, t2),
    rod(19, 'steel', m3, t3),
    // steel diagonals triangulating the interior panels
    rod(20, 'steel', t1, m2),
    rod(21, 'steel', m2, t3),
  ];
}

/** The 8 m suspension deck for `cable`: two 4 m road panels and one cable from the pylon to the
 * middle joint (hypot(4, 6) ~= 7.211 m, under the 8 m cable cap). See the file header for why this
 * has one cable rather than the plan's two. */
function cable8m(): PlacedPart[] {
  const aL = anchor(1, 11, 4);
  const aR = anchor(2, 19, 4);
  const pylon = anchor(3, 11, 10);
  const mid = joint(4, 15, 4);
  return [aL, aR, pylon, mid, rod(5, 'road', aL, mid), rod(6, 'road', mid, aR), rod(7, 'cable', pylon, mid)];
}

// ---- levels -------------------------------------------------------------------------------

export const LEVELS: BridgeLevel[] = [
  // 1. span --------------------------------------------------------------------------------
  (() => {
    const aL = anchor(1, 12, 4);
    const aR = anchor(2, 16, 4);
    return {
      id: 'span',
      title: 'Cross the gap',
      bruno: "Here's the park's river, fuzz! Only four meters across right here. Grab a rod from my toolbox and lay it bank to bank.",
      goals: [crossedGoal()],
      parts: [aL, aR],
      palette: [],
      hints: [
        'Four meters is not far at all, one good rod should reach all the way across.',
        'Pick the Road tool from the tray and drag from the left bank to the right bank.',
        'Draw a single road rod straight from one anchor to the other. That is the whole bridge.',
      ],
      failHints: {
        fell: "My buggy splashed right into the river! There is no rod bridging the gap yet.",
        stuck: "The buggy cannot find a way across. Make sure a rod really reaches both banks.",
        timeout: "We are not making progress. Check that a rod connects the two anchors.",
      },
      banks: { leftX: 12, rightX: 16, y: 4 },
      load: { weight: 'Light' },
      budget: 10,
      solution: [aL, aR, rod(3, 'road', aL, aR)],
    } satisfies BridgeLevel;
  })(),

  // 2. triangle ------------------------------------------------------------------------------
  (() => {
    const aL = anchor(1, 12, 4);
    const aR = anchor(2, 18, 4);
    return {
      id: 'triangle',
      title: 'Triangles!',
      bruno: "Six meters of water this time, fuzz. A flat rod alone will sag and snap, but triangles are strong. Remember that.",
      goals: [crossedGoal(), noBreaksGoal()],
      parts: [aL, aR],
      palette: [],
      hints: [
        'A single flat rod across six meters sags in the middle and snaps clean in half.',
        'Try placing a Joint above the middle of the span, then brace it down to both banks.',
        'Build a little peak: a Joint in the middle of the deck, a Joint about two and a half meters above it, two Wood rods from the banks up to the peak, and one Wood rod straight down from the peak to the middle. That triangle holds.',
      ],
      failHints: {
        fell: 'That flat rod snapped in the middle and dunked my buggy! Brace the span with a triangle instead.',
        stuck: 'The buggy cannot get across a broken bridge. Check which rods are still standing.',
        timeout: 'We are stuck partway. A triangle above the middle should hold the deck steady.',
      },
      banks: { leftX: 12, rightX: 18, y: 4 },
      load: { weight: 'Light' },
      budget: 30,
      solution: kingpost6m('wood', false),
    } satisfies BridgeLevel;
  })(),

  // 3. material ------------------------------------------------------------------------------
  (() => {
    return {
      id: 'material',
      title: 'Stronger stuff',
      bruno: "Same little bridge, but the fuzzes packed the heavy wagon today. Keep an eye on that wood tie, I am not sure it can take the extra weight.",
      goals: [crossedGoal(), noBreaksGoal()],
      parts: kingpost6m('wood', true),
      palette: [],
      hints: [
        'That wood tie is straining hard under the heavy wagon, watch it closely.',
        'Tap a rod to see its material chips. Wood is not the only option.',
        'Switch the tie and the two struts to steel. Steel shrugs off loads that snap wood.',
      ],
      failHints: {
        fell: 'The wood tie snapped under the heavy wagon and the bridge dropped my buggy! Try steel instead.',
        stuck: 'The buggy cannot cross once a rod gives way. Check which parts turned red before they broke.',
        timeout: 'We are not getting across in time. A stronger tie and struts should hold steady under this load.',
      },
      banks: { leftX: 12, rightX: 18, y: 4 },
      load: { weight: 'Heavy' },
      budget: 45,
      solution: kingpost6m('steel', true),
    } satisfies BridgeLevel;
  })(),

  // 4. budget --------------------------------------------------------------------------------
  (() => {
    const aL = anchor(1, 11, 4);
    const aR = anchor(2, 19, 4);
    return {
      id: 'budget',
      title: 'On a budget',
      bruno: "Eight meters of river and not a lot of coin left in the toolbox. Build smart, fuzz. Wood goes a long way when it is braced right.",
      goals: [crossedGoal(), budgetGoal(40)],
      parts: [aL, aR],
      palette: [],
      hints: [
        'Steel would span this easily, but there is nowhere near enough budget for that much steel.',
        'Two road panels with a joint in the middle keep the deck cheap. Now brace it from above.',
        'Add two joints about two meters up, a wood rod between them, and wood rods fanning down to the banks and the middle joint. That truss comes in well under budget.',
      ],
      failHints: {
        fell: 'The unbraced deck sagged and dropped my buggy in! A light truss above should hold it up cheaply.',
        stuck: 'The buggy is not getting across. Check that the truss actually reaches both banks.',
        timeout: 'We are running out of time. Make sure the whole truss is connected before pressing play.',
      },
      banks: { leftX: 11, rightX: 19, y: 4 },
      load: { weight: 'Light' },
      budget: 40,
      solution: queenTruss8m('wood'),
    } satisfies BridgeLevel;
  })(),

  // 5. cable ---------------------------------------------------------------------------------
  (() => {
    const aL = anchor(1, 11, 4);
    const aR = anchor(2, 19, 4);
    const pylon = anchor(3, 11, 10);
    return {
      id: 'cable',
      title: 'Hang it',
      bruno: "I planted a tall post on the bank for you. Hang a cable off it and let the bridge float on tension instead of timber.",
      goals: [crossedGoal()],
      parts: [aL, aR, pylon],
      palette: [],
      hints: [
        'That tall post is not just for decoration, fuzz. It is there to hold cables.',
        'Build the road deck first: two panels with a joint in the middle of the span.',
        'Pick the Cable tool and drag from the top of the post down to the middle joint. The cable holds the deck up without needing a truss underneath.',
      ],
      failHints: {
        fell: 'The deck sagged into the river with nothing holding it up! Run a cable from the post to the middle joint.',
        stuck: 'The buggy is stuck on a sagging deck. Check the cable actually reaches the post and the middle joint.',
        timeout: 'We are not crossing in time. Make sure the cable is taut between the post and the deck.',
      },
      banks: { leftX: 11, rightX: 19, y: 4 },
      load: { weight: 'Light' },
      budget: 32,
      solution: cable8m(),
    } satisfies BridgeLevel;
  })(),

  // 6. heavy -----------------------------------------------------------------------------------
  (() => {
    const aL = anchor(1, 11, 4);
    const aR = anchor(2, 19, 4);
    return {
      id: 'heavy',
      title: 'Heavy load',
      bruno: "Same wide river, but the heavy wagon is crossing today. That wooden truss will not take it, fuzz. Time for steel.",
      goals: [crossedGoal(), noBreaksGoal()],
      parts: [aL, aR],
      palette: [],
      hints: [
        'A wood truss like the one from the budget crossing snaps its top chord under this much weight.',
        'Build the same shape again: two road panels, a joint in the middle, two joints up top with a chord and diagonals.',
        'This time use steel for the top chord and every diagonal. Steel carries the heavy wagon with room to spare.',
      ],
      failHints: {
        fell: 'The top chord snapped under the heavy wagon and the deck dropped my buggy in! Steel holds where wood breaks.',
        stuck: 'The buggy cannot cross once the truss gives way. Check which rods turned red before they broke.',
        timeout: 'We are not making it across in time. Make sure the whole steel truss is connected.',
      },
      banks: { leftX: 11, rightX: 19, y: 4 },
      load: { weight: 'Heavy' },
      budget: 78,
      solution: queenTruss8m('steel'),
    } satisfies BridgeLevel;
  })(),

  // 7. long ------------------------------------------------------------------------------------
  (() => {
    const aL = anchor(1, 9, 4);
    const aR = anchor(2, 21, 4);
    return {
      id: 'long',
      title: 'Long span',
      bruno: "Twelve meters, the longest crossing yet! No single rod comes close, you will need a proper truss, panel by panel.",
      goals: [crossedGoal()],
      parts: [aL, aR],
      palette: [],
      hints: [
        'Twelve meters is three times the longest rod allowed, so the deck needs several joints in a row.',
        'Lay four 3 meter road panels across the gap, then build a tall chord above the three deck joints.',
        'Brace the chord down to the deck with verticals and diagonals every step of the way, and use steel for every brace. A span this long sags too much for wood alone to hold.',
      ],
      failHints: {
        fell: 'The deck buckled partway across and dropped my buggy! A taller, fully braced truss should carry this span.',
        stuck: 'The buggy stalls partway over. Check that every panel and every brace actually connects.',
        timeout: 'We are not reaching the far bank in time. Make sure the whole truss runs bank to bank.',
      },
      banks: { leftX: 9, rightX: 21, y: 4 },
      load: { weight: 'Medium' },
      budget: 130,
      solution: longTruss12m(),
    } satisfies BridgeLevel;
  })(),

  // 8. tight -----------------------------------------------------------------------------------
  (() => {
    const aL = anchor(1, 11, 4);
    const aR = anchor(2, 19, 4);
    return {
      id: 'tight',
      title: 'Tight budget',
      bruno: "Eight meters again, fuzz, but I am watching every coin this time. Find the cheapest design that still holds the medium wagon.",
      goals: [crossedGoal(), budgetGoal(35)],
      parts: [aL, aR],
      palette: [],
      hints: [
        'Steel would hold easily, but there is barely any budget for it here.',
        'Try the same light wood truss that worked for the budget crossing: two road panels, a middle joint, and a wood chord above.',
        'That wood truss holds the medium wagon just fine and comes in right under this tight budget.',
      ],
      failHints: {
        fell: 'The deck sagged into the river! A light wood truss above the middle joint should hold this load cheaply.',
        stuck: 'The buggy is not getting across. Check the truss actually spans both banks.',
        timeout: 'We are running out of time. Make sure the whole truss is connected before pressing play.',
      },
      banks: { leftX: 11, rightX: 19, y: 4 },
      load: { weight: 'Medium' },
      budget: 35,
      solution: queenTruss8m('wood'),
    } satisfies BridgeLevel;
  })(),

  // 9. free play -------------------------------------------------------------------------------
  (() => {
    return {
      id: 'free',
      title: 'Free play',
      bruno: 'No rules this time, fuzz! Build any bridge you like across the river and try it out.',
      goals: [],
      parts: [anchor(1, 10, 4), anchor(2, 20, 4)],
      palette: [],
      hints: [
        'Try a flat road rod first and see how far it gets you.',
        'Mix materials: road for the deck, wood or steel to brace it, cable if you plant a tall post.',
        "There's no wrong answer in free play, just build and see what holds.",
      ],
      failHints: {},
      banks: { leftX: 10, rightX: 20, y: 4 },
      load: { weight: 'Medium' },
      budget: 999,
    } satisfies BridgeLevel;
  })(),
];

export function findLevel(id: string): BridgeLevel | undefined {
  return LEVELS.find((level) => level.id === id);
}
