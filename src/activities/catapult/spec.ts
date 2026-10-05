// Catapult course spec: the child sets power (rubber bands), the fuzz and the arm length in the
// properties drawer, drags the angle lever on the machine itself, then taps the in-scene FIRE
// button to snip the trigger string and launch within a shot budget, knocking down cans and block
// towers, sometimes chasing a bullseye. Product direction 2026-09-22: the PULL ring is gone - FIRE
// is a plain button, angle is a lever dragged on the machine, power is visible rubber bands.
// Huddle 2026-09-22: line levels ask for nothing left above a line, and the camera stays on the
// collapse. Stakeholder direction 2026-10-01: weight and shot type merge into one Fuzz row - five
// fuzzes, each its own weight, the Donut splitting in three at the top of its arc. The machine is
// drawn with the art lead's real exports (core/build.ts's ART_PPM block). See src/kit/types.ts for
// the frozen CourseSpec contract this course plugs into.
import type { CourseSpec, PlacedPart, RenderItem, ResultCard, Vec2, Widget } from '../../kit/types';
import type { PartKind, Metrics, Outcome, CatapultLevel } from './core/types';
import { ARM, BAND_COUNT, CATALOG, FUZZ, FUZZ_NAMES, PART_LIMIT, blockSize, defaultProps, fuzzName } from './core/catalog';
import {
  armAngleFor,
  BAND_ASPECTS,
  bandSegments,
  catapultPocketAtRest,
  crossbarPoseFor,
  fireSpot,
  LEVER_LENGTH,
  PIVOT_DX,
  PIVOT_DY,
  REST_ANGLE,
} from './core/build';
import { createCatapultSim } from './core/sim';
import { LEVELS } from './core/levels';

/** Where the part a property value swaps in sits on the machine (world meters, centre + width),
 * for the drawer's "part flies to the machine" animation. Only the catapult part has targets. */
function catapultPartTargets(
  part: PlacedPart<PartKind>,
  code: string,
  value: string,
): { at: Vec2; size: number }[] {
  if (part.kind !== 'catapult') return [];
  const { x, y } = part;

  switch (code) {
    case 'power': {
      // Power is now the rubber bands (build.ts's bandSegments); band 0 (present for every power
      // option) is always there, so its span midpoint at rest is a stable single target.
      const preview: PlacedPart<PartKind> = { ...part, props: { ...part.props, power: value } };
      const [first] = bandSegments(preview, REST_ANGLE);
      if (!first) return [];
      return [{ at: { x: (first.a.x + first.b.x) / 2, y: (first.a.y + first.b.y) / 2 }, size: 0.6 }];
    }

    case 'angle': {
      // The crossbar's pose at the NEW angle - same formula the machine itself uses to rotate
      // the stop bar with the angle chip.
      const preview: PlacedPart<PartKind> = { ...part, props: { ...part.props, angle: value } };
      const { pos } = crossbarPoseFor(preview);
      return [{ at: pos, size: 0.6 }];
    }

    case 'fuzz': {
      // The new fuzz hops into the cup: the loaded-fuzz pocket at rest, sized to the NEW fuzz's
      // diameter (with a little headroom).
      const fuzzSpec = FUZZ[value] ?? FUZZ.Fur!;
      return [{ at: catapultPocketAtRest(part), size: 2 * fuzzSpec.r * 1.5 }];
    }

    case 'arm': {
      // The arm's own midpoint at rest, for the NEW arm length.
      const armSpec = ARM[value] ?? ARM.Short!;
      const L = armSpec.length;
      const pivot: Vec2 = { x: x + PIVOT_DX, y: y + PIVOT_DY };
      const at: Vec2 = {
        x: pivot.x + (L / 2) * Math.cos(REST_ANGLE),
        y: pivot.y + (L / 2) * Math.sin(REST_ANGLE),
      };
      return [{ at, size: L }];
    }

    default:
      return [];
  }
}

/** Scale per fuzz for its picture (public/parts/catapult/fuzz-<name>.png, a square canvas centred
 * on the fuzz's round body). Circle textures draw at diameter x scale, so scale = canvas px / body
 * diameter px makes the drawn body exactly the collider's diameter, the petals, spikes, mohawk and
 * helmet overhanging it: Flower 218 / 120 (petals), Donut 208 / 206, Fur 338 / 230 (mohawk, fur
 * tips), Helmet 296 / 288, Metal 542 / 339 (spiked cap). */
const FUZZ_ART_SCALE: Record<string, number> = {
  Flower: 218 / 120,
  Donut: 208 / 206,
  Fur: 338 / 230,
  Helmet: 296 / 288,
  Metal: 542 / 339,
};

/** `fuzz-<name>[-excited]` for the five fuzzes (no excited art yet: both keys show the same
 * picture). */
function fuzzTextures(): Record<string, { url: string; scale: number }> {
  const out: Record<string, { url: string; scale: number }> = {};
  for (const name of FUZZ_NAMES) {
    const tex = { url: FUZZ[name]!.image, scale: FUZZ_ART_SCALE[name]! };
    out[`fuzz-${name}`] = tex;
    out[`fuzz-${name}-excited`] = { ...tex };
  }
  return out;
}

/** `real-band-<n>` for every band length in BAND_ASPECTS (see build.ts's `bandSprite`). */
function bandTextures(): Record<string, { url: string }> {
  const out: Record<string, { url: string }> = {};
  for (const n of BAND_ASPECTS) out[`real-band-${n}`] = { url: `parts/catapult/real-band-${n}.png` };
  return out;
}

/** Concept codes known by `level.id` for the result card: the union of `introduces` from every
 * level up to and including it, in `LEVELS` order - the same rule the kit uses to hide drawer
 * rows and widgets (see `Level.introduces`'s doc comment in kit/types.ts), so the card never shows
 * a row for a mechanic the child has not met yet. Falls back to "all five" when no level in the
 * course sets `introduces` (the kit's own default) or the level id is not found. Option-level
 * entries (`fuzz:Donut`) land in the set too; they never match a row code, so they change nothing. */
function knownConcepts(levelId: string): Set<string> {
  const ALL = new Set(['power', 'angle', 'fuzz', 'arm']);
  const hasAnyIntroduces = LEVELS.some((l) => (l.introduces?.length ?? 0) > 0);
  const idx = LEVELS.findIndex((l) => l.id === levelId);
  if (!hasAnyIntroduces || idx === -1) return ALL;
  const known = new Set<string>();
  for (let i = 0; i <= idx; i++) {
    for (const code of LEVELS[i]!.introduces ?? []) known.add(code);
  }
  return known;
}

/** Edit-mode `aboveLine` before a sim exists: targets whose placed box top is above the line. */
function placedAboveLine(parts: PlacedPart<PartKind>[], level: CatapultLevel): number {
  if (level.line === undefined) return 0;
  const line = level.line;
  return parts.filter((p) => {
    if (p.kind === 'can') return p.y + 0.4 > line + 1e-3;
    if (p.kind === 'block') return p.y + blockSize(p.props.size ?? '1x1').h / 2 > line + 1e-3;
    return false;
  }).length;
}

/** The two in-scene widgets left (product direction 2026-09-22): a plain FIRE button (a string
 * ties the arm down; FIRE snips it) and the angle lever's drag handle. Power (rubber bands), the
 * fuzz and the arm are set from the properties drawer instead. */
function catapultWidgets(part: PlacedPart<PartKind>): Widget[] {
  if (part.kind !== 'catapult') return [];
  const { x, y } = part;
  const pivot: Vec2 = { x: x + PIVOT_DX, y: y + PIVOT_DY };
  const angleOptions = CATALOG.catapult.descriptors.find((d) => d.code === 'angle')!.options;

  return [
    {
      kind: 'tap',
      id: 'fire',
      action: 'play',
      // Stakeholder feedback 2026-09-22: "the fire button should be next to the string to be
      // cut". `fireSpot` (build.ts) sits just right of the string's new tie-down point (the arm's
      // underside, near the tip - see stringAnchor), between the string and the cart, computed
      // from this part's own arm so it moves with the Short/Long chip. See the final report for
      // the fit check against the string, the cart and the arm above it, for both arms.
      at: fireSpot(part),
      size: 72,
      icon: '✂️',
      label: 'FIRE',
      color: 0x61bb46,
    },
    {
      kind: 'dial',
      id: 'angle',
      code: 'angle',
      pivot,
      radiusPx: 150,
      // World-meter radius overrides radiusPx: the handle rides the lever stick itself (its own
      // length, LEVER_LENGTH) at any camera zoom, and option i lands exactly on the lever's tip
      // for that angle (armAngleFor(deg) is the same stop-direction formula the lever's own
      // geometry uses).
      radiusM: LEVER_LENGTH,
      arcFrom: armAngleFor(15),
      arcTo: armAngleFor(75),
      options: angleOptions,
      value: part.props.angle ?? '45',
      track: 'none', // the lever stick itself is the track; no separate arc band drawn
      readout: 'knob',
      live: true, // the lever (and the crossbar it drives) moves with the finger, not just on release
      size: 72,
    },
  ];
}

export const catapultSpec: CourseSpec<PartKind, Metrics, Outcome, CatapultLevel> = {
  id: 'catapult',
  levels: LEVELS,
  catalog: CATALOG,
  defaultProps,
  partLimit: PART_LIMIT,

  createSim: (parts, level) => createCatapultSim(parts, level),

  editMetrics: (parts, level, sim) => ({
    knockedDown: 0,
    hits: 0,
    shotsUsed: 0,
    shotsLeft: level.shots,
    targetsLeft: parts.filter((p) => p.kind === 'can' || p.kind === 'block').length,
    maxRange: 0,
    // The settled sim knows the real rest pose; without one, read the placed boxes.
    aboveLine: sim ? sim.metrics().aboveLine : placedAboveLine(parts, level),
  }),

  canPlay: (parts) => parts.some((p) => p.kind === 'catapult'),

  passed: (outcome, goalsPass) => outcome !== 'running' && goalsPass,

  tuneBetweenRuns: true,
  spawn: { x: 15, y: 6 },
  // Stakeholder feedback 2026-09-22: "make the ground thicker so we can zoom in better to the
  // catapult (it's really low on the screen)." The kit's own ground strip now draws the band (see
  // `groundRenderItem`'s removal from sim.ts's renderItems - the ground BODY/physics is
  // unchanged); groundStrip's colours are sampled from public/bg/park.jpg's own bottom edge
  // (a grass green around #05-0a8f3d there) over a warm earth brown matching the old
  // catapult-drawn ground fill (0x5a3d1e), so the thicker band reads as more of the same ground,
  // not a different material. The park backdrop covers the whole world; `world.sky` (unset here
  // => the kit's default daytime sky) still shows at the very top edge the picture doesn't reach.
  world: {
    worldW: 30,
    worldH: 15,
    ppm: 32,
    groundDepth: 1.5,
    groundStrip: { top: 0x0d8f3d, bottom: 0x5a3d1e },
    backgrounds: [{ url: 'bg/park.jpg', x: 15, y: 7.5, w: 30, h: 15 }],
  },

  roles: {
    // Every fuzz item carries its own textureKey (fuzz-<name>), which always wins; this role
    // texture is only the fallback should one be missing.
    fuzz: { texture: { key: 'fuzz', url: 'blueFuzz_idle.png', scale: 1.25 } },
    // The camera's invisible stand-in on the first target hit (sim.ts): never drawn.
    impact: { fill: () => ({ color: 0, alpha: 0 }) },
    bullseye: {
      fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }),
      decorate: 'rings',
    },
    shelf: { decorate: 'stripe' },
    wall: { decorate: 'stripe' },
    base: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
    wheel: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
    arm: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
    frame: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
    can: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
    block: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
    post: { fill: (item: RenderItem) => ({ color: item.color, alpha: 1 }) },
    // No 'ground' role RenderItem any more (the kit's ground strip draws it - see world.groundDepth
    // above), so no role entry for it either.
  },

  // Stakeholder feedback 2026-09-22: "make the ground thicker so we can zoom in better to the
  // catapult (it's really low on the screen)." zoom 3.6. The world camera's viewport is the 960 x
  // 490 px panel, so at zoom z the view is 960 / (32 z) x 490 / (32 z) m: 8.333 x 4.253 m at 3.6.
  // The open drawer (src/kit/builder.css: 340 px wide, from x 652 of the panel's 32..992) covers
  // the right 340 of the 960 px, leaving 620 / 960 of the width, 5.382 m: x in [cx - 4.167,
  // cx + 1.215], y in [cy - 2.127, cy + 2.127]. (The old note here said 300 px; the drawer has been
  // 340 px wide since the kit's drawer pass.)
  //
  // Re-fit for the real art (2026-10-01), measured on the prepared pictures' opaque pixels
  // (relative to the part's anchor):
  //  - leftmost: the Long arm's cup at rest, x - 3.31 (its Metal fuzz reaches x - 3.14)
  //  - rightmost: the base picture's plank, x + 1.74 (BASE_ART in build.ts)
  //  - top: the lever's pad at 15 degrees, y + 3.38 (the knob itself, LEVER_LENGTH out, tops out at
  //    y + 3.05; its 72 px handle reaches about y + 3.36)
  //  - bottom: the FIRE button's caption (~16 px under the button, in the ground band), about
  //    y - 0.34 (an estimate: the caption's own text height)
  // Horizontal span 5.05 m of the 5.382 m, so the old 0.3 m margin all round no longer fits at 3.6
  // (that would take zoom 3.4); the picture edges get about 0.16 m instead, the parts the child
  // touches far more: cx = x + 0.7 leaves (x - 3.31) - (x + 0.7 - 4.167) = 0.16 m left of the Long
  // cup's rim and (x + 0.7 + 1.215) - (x + 1.74) = 0.18 m right of the plank, and >= 0.36 m round
  // the loaded fuzz's body, the knob and FIRE. Vertical span 3.72 m of the 4.253 m: cy = y + 1.5 leaves
  // (y + 1.5 + 2.127) - (y + 3.38) = 0.25 m over the pad (0.58 m over the knob) and
  // (y - 0.34) - (y + 1.5 - 2.127) = 0.29 m under the caption.
  //
  // Left clamp: the kit clamps cx to >= 15/zoom = 4.167 (`clampFrame`, src/kit/camera.ts). The
  // 'move' level starts its catapult at x = 3.5, the lowest x any level ever places one at: cx =
  // 4.2, just clear of the clamp.
  focusFrame: (part) => (part.kind === 'catapult' ? { cx: part.x + 0.7, cy: part.y + 1.5, zoom: 3.6 } : null),

  // 'impact' first: from the fuzz's first hit on a target the sim adds an invisible item on that
  // target, so the camera swings to the collapse and stays there (huddle 2026-09-22: "lean into
  // the chain reactions"); before the hit there is none and the fuzz is followed.
  follow: (_level, outcome) =>
    outcome === 'running' ? { roles: ['impact', 'fuzz'], zoom: 1.6, lerp: 0.08, offset: { x: 1, y: 0.5 } } : null,

  widgets: catapultWidgets,

  partTargets: catapultPartTargets,

  // Picture-button properties drawer instead of the chip panel; pictures are the real parts
  // (under public/parts/catapult/), and the fuzz pictures double as scene textures, so a swapped
  // fuzz looks the same in the drawer and in the cup.
  drawer: true,
  textures: {
    // `fuzz-<name>[-excited]` (see fuzzTextures above).
    ...fuzzTextures(),
    'arm-Short': { url: 'parts/catapult/arm-Short.svg', scale: 1 },
    'arm-Long': { url: 'parts/catapult/arm-Long.svg', scale: 1 },
    // The machine itself: the art lead's exports, prepared (cut, turned, recoloured) into
    // public/parts/catapult/real-*.png and stretched to each RenderItem's box (core/build.ts's
    // ART_PPM block has every box's arithmetic), so no scale beyond the plain 1 is needed.
    'real-base': { url: 'parts/catapult/real-base.png' },
    'real-arm-Short': { url: 'parts/catapult/real-arm-Short.png' },
    'real-arm-Long': { url: 'parts/catapult/real-arm-Long.png' },
    'real-gear': { url: 'parts/catapult/real-gear.png' },
    'real-cup': { url: 'parts/catapult/real-cup.png' },
    'real-lever': { url: 'parts/catapult/real-lever.png' },
    // Overlay sprites (core/sim.ts): the rubber bands and the trigger string, and their hooks.
    ...bandTextures(),
    'real-hook': { url: 'parts/catapult/real-hook.png' },
    // The trigger-string snip burst (same pop/hold/fade treatment as the hit bursts below).
    'fx-snip': { url: 'fx/snip.svg' },
    // Hit-burst sprites (core/sim.ts): a comic BOOM on a block, POW on a can/bullseye.
    'fx-boom': { url: 'fx/boom.png' },
    'fx-pow': { url: 'fx/pow.png' },
    // The collapse payoff (core/sim.ts): a dust puff where a falling target lands, a CRASH! burst
    // when one shot knocks down three. The dust also marks the Donut's split.
    'fx-dust': { url: 'fx/dust.svg' },
    'fx-crash': { url: 'fx/crash.svg' },
  },

  resultCard: (parts, level, m, outcome, passed) => {
    const catapult = parts.find((p) => p.kind === 'catapult');
    const power = catapult?.props.power ?? 'Medium';
    const angle = catapult?.props.angle ?? '45';
    const arm = catapult?.props.arm ?? 'Short';
    const fuzz = FUZZ[fuzzName(catapult?.props ?? {})]!.label;

    const hasHitsGoal = level.goals.some((g) => g.metric === 'hits');
    let outcomeText: string;
    if (outcome === 'cleared') {
      outcomeText = 'Every target down!';
    } else if (hasHitsGoal && m.hits >= 1) {
      outcomeText = 'Bullseye!';
    } else if (outcome === 'outOfShots') {
      outcomeText = 'Out of shots. Change the setup and try again.';
    } else {
      // A bullseye-only level has nothing to knock down, so "0 down, 0 to go" would be noise.
      const hasTargets = m.knockedDown + m.targetsLeft > 0;
      outcomeText = hasTargets
        ? `Landed at ${m.maxRange.toFixed(1)} m. ${Math.round(m.knockedDown)} down, ${Math.round(m.targetsLeft)} to go.`
        : `Landed at ${m.maxRange.toFixed(1)} m.`;
    }

    const tone: ResultCard['tone'] = passed ? 'pass' : outcome === 'outOfShots' ? 'fail' : 'neutral';

    // Only show rows for concepts the child has met by this level (see `knownConcepts`); an
    // intro level's card should not spoil a mechanic that is still locked and hidden.
    const known = knownConcepts(level.id);
    const allRows: { code: string; label: string; value: string }[] = [
      { code: 'power', label: 'Rubber bands', value: `${BAND_COUNT[power] ?? BAND_COUNT.Medium!}` },
      { code: 'angle', label: 'Angle', value: `${angle}°` },
      { code: 'fuzz', label: 'Fuzz', value: fuzz },
      { code: 'arm', label: 'Arm', value: arm },
    ];

    return {
      title: 'Your experiment',
      rows: allRows.filter((r) => known.has(r.code)).map(({ label, value }) => ({ label, value })),
      outcome: outcomeText,
      tone,
    };
  },

  hud: {
    partInfo: {
      catapult: { label: 'Catapult', icon: '🏹' },
      can: { label: 'Can', icon: '🥫' },
      block: { label: 'Block', icon: '🧱' },
      shelf: { label: 'Shelf', icon: '▬' },
      wall: { label: 'Wall', icon: '▮' },
      bullseye: { label: 'Bullseye', icon: '🎯' },
    },
    chipLabels: {
      Low: 'Low',
      Medium: 'Medium',
      High: 'High',
      Max: 'Max',
      '1x1': '1 x 1',
      '2x1': '2 wide',
      '1x2': '2 tall',
      wood: 'Wood',
      brick: 'Brick',
      steel: 'Steel',
      '15': '15°',
      '30': '30°',
      '45': '45°',
      '60': '60°',
      '75': '75°',
    },
    meters: [
      {
        id: 'meter-knocked',
        label: 'Knocked down',
        metric: 'knockedDown',
        format: (v, m) => `${Math.round(v)} of ${Math.round(v + m.targetsLeft)}`,
      },
      { id: 'meter-hits', label: 'Hits', metric: 'hits', format: (v) => `${Math.round(v)}` },
      {
        id: 'meter-shots',
        label: 'Shots',
        metric: 'shotsUsed',
        format: (v, m) => (m.shotsLeft + v > 0 ? `${Math.round(v)} of ${Math.round(v + m.shotsLeft)}` : `${Math.round(v)}`),
      },
      { id: 'meter-range', label: 'Distance', metric: 'maxRange', format: (v) => `${v.toFixed(1)} m` },
      { id: 'meter-line', label: 'Above the line', metric: 'aboveLine', format: (v) => `${Math.round(v)}` },
    ],
    goalValueText: (goal, current) => {
      switch (goal.metric) {
        case 'knockedDown':
          return `${Math.round(current)} of ${Math.round(goal.value)}`;
        case 'hits':
          return `${Math.round(current)} of ${Math.round(goal.value)}`;
        case 'shotsUsed':
          return `${Math.round(current)} of ${Math.round(goal.value)} shots`;
        case 'maxRange':
          return `${current.toFixed(1)} of ${goal.value.toFixed(1)} m`;
        case 'aboveLine':
          return `${Math.round(current)} above the line`;
        default:
          return `${current} of ${goal.value}`;
      }
    },
    // aboveLine == 0 is met or not; a 0%/100% bar would only repeat the tick.
    barlessMetrics: ['aboveLine'],
    lines: {
      play: 'Fly, fuzz, fly!',
      pass: 'Bullseye! Great aim!',
      doneNotPassed: 'The fuzz landed. Now check the goals.',
      freePlay: 'Fling fuzzes at anything you like!',
      launch: '▶ Start experiment',
      playAgain: '▶ Run it again',
      reset: '↺ Reset',
      shotDone: 'Not yet! Change something and launch again.',
      locked: 'That one is bolted down for this experiment!',
    },
    failOutcomes: ['outOfShots'],
  },
};
