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
  WORLD_H,
} from './core/build';
import { createCatapultSim } from './core/sim';
import { LEVELS } from './core/levels';

/** Stage px per world meter (`world.ppm`). */
const PPM = 32;
/** The world camera's viewport height (stage px): the world panel, WORLD_H * PPM = 612 since
 * 2026-10-07 (no dash, `hud.goalsOverlay`: the panel grows up to y 78), plus the kit's 10 px earth
 * margin under it (BuilderScene PANEL_Y_MARGIN), which the camera's viewport includes: 622. */
const VIEWPORT_H_PX = WORLD_H * PPM + 10;
/** The same viewport before 2026-10-07 (the 480 px panel under the dash, plus the margin). */
const OLD_VIEWPORT_H_PX = 490;
/** World meters a camera frame at `zoom` rises so the view's bottom edge, and everything on the
 * ground with it, stays where it was on screen: half the viewport's growth (66 px) at that zoom.
 * The viewport keeps its bottom edge (stage y 700) and grew upward, so its centre moved 66 px up;
 * a frame centred that much higher puts every world point back on its old stage y and the taller
 * panel only adds sky above. */
function riseFor(zoom: number): number {
  return (VIEWPORT_H_PX - OLD_VIEWPORT_H_PX) / 2 / (PPM * zoom);
}
/** Building: the machine's zoom, and the frame centre's height over the catapult's anchor: 1.5 m in
 * the 490 px viewport, + riseFor(3.6) = 0.573 m since 2026-10-07 (2.073 m; see `focusFrame`). */
const FOCUS_ZOOM = 3.6;
const FOCUS_CY_ABOVE = 1.5 + riseFor(FOCUS_ZOOM);
/** The run: the follow camera's zoom, and how far over the followed point it centres: 0.5 m in the
 * 490 px viewport, + riseFor(1.6) = 1.289 m since 2026-10-07 (1.789 m; see `follow`). */
const FOLLOW_ZOOM = 1.6;
const FOLLOW_DY = 0.5 + riseFor(FOLLOW_ZOOM);
/** park.jpg's own sky (158, 190, 249): the picture's top 650 of its 1678 px rows are this one flat
 * blue, so a kit sky of exactly it carries the picture on up past its top edge without a seam. */
const PARK_SKY = 0x9ebef9;

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
  // not a different material.
  //
  // 2026-10-07: the world is WORLD_H = 19.125 m tall (was 15; core/build.ts): no dash
  // (`hud.goalsOverlay`), so the 612 px panel starts at stage y 78 and shows y -1.5 .. 17.625. The
  // park picture keeps its 30 x 15 m rectangle over y 0 .. 15: its own 2:1 aspect (3356 x 1678 px,
  // nothing stretched) and its horizon, trees and grass exactly where they were on screen. The
  // 2.625 m of panel above its top edge (the 480 px panel's top at y 13.5 used to cut its top 1.5 m
  // off) is the kit's sky set to the picture's own flat top colour (PARK_SKY), so the sky simply
  // runs on up behind the goals and meters overlays.
  world: {
    worldW: 30,
    worldH: WORLD_H,
    ppm: PPM,
    groundDepth: 1.5,
    groundStrip: { top: 0x0d8f3d, bottom: 0x5a3d1e },
    sky: { top: PARK_SKY, bottom: PARK_SKY },
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
  // 622 px panel (VIEWPORT_H_PX: 490 until 2026-10-07, when the world grew to 19.125 m), so at zoom
  // z the view is 960 / (32 z) x 622 / (32 z) m: 8.333 x 5.399 m at 3.6. The open drawer
  // (src/kit/builder.css: 340 px wide, from x 652 of the panel's 32..992) covers the right 340 of
  // the 960 px, leaving 620 / 960 of the width, 5.382 m: x in [cx - 4.167, cx + 1.215], y in
  // [cy - 2.700, cy + 2.700]. (The old note here said 300 px; the drawer has been 340 px wide since
  // the kit's drawer pass.)
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
  // the loaded fuzz's body, the knob and FIRE.
  //
  // Vertical (2026-10-07, the 622 px viewport): the view's bottom edge stays 0.627 m under the
  // anchor, where cy = y + 1.5 put it in the 490 px one (1.5 - 490 / (2 * 32 * 3.6)), so cy =
  // y + FOCUS_CY_ABOVE = y + 2.073 and the view runs y - 0.627 .. y + 4.773. The machine, its
  // lever and FIRE sit exactly where they did on screen (the anchor at stage y 627.8 either way)
  // and the taller panel only adds 1.146 m of sky over the lever, where the goals overlay sits.
  // Vertical span 3.72 m of the 5.399 m: 1.39 m over the pad (1.72 m over the knob) and
  // (y - 0.34) - (y - 0.627) = 0.29 m under the caption. The kit clamps cy >= -1.5 + 19.125 /
  // 3.6 / 2 = 1.156, well under every level's y + 2.073 (every catapult stands on y = 0).
  //
  // Left clamp: the kit clamps cx to >= 15/zoom = 4.167 (`clampFrame`, src/kit/camera.ts). The
  // 'move' level starts its catapult at x = 3.5, the lowest x any level ever places one at: cx =
  // 4.2, just clear of the clamp.
  focusFrame: (part) =>
    part.kind === 'catapult' ? { cx: part.x + 0.7, cy: part.y + FOCUS_CY_ABOVE, zoom: FOCUS_ZOOM } : null,

  // 'impact' first: from the fuzz's first hit on a target the sim adds an invisible item on that
  // target, so the camera swings to the collapse and stays there (huddle 2026-09-22: "lean into
  // the chain reactions"); before the hit there is none and the fuzz is followed. 2026-10-07: the
  // centre sits FOLLOW_DY (1.789 m, was 0.5) over the followed point, so in the taller 622 px
  // viewport (12.15 m at 1.6, was 9.57) the point keeps its old height over the view's bottom edge:
  // the flight and the collapse show where they did, with 2.58 m more sky over them.
  follow: (_level, outcome) =>
    outcome === 'running'
      ? { roles: ['impact', 'fuzz'], zoom: FOLLOW_ZOOM, lerp: 0.08, offset: { x: 1, y: FOLLOW_DY } }
      : null,

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
    // 2026-10-07: no dash, like the rover (2026-10-06). The goals sit in a small translucent panel
    // over the scene's top-left (the result card under them once a shot ends), the five meters in
    // a twin over its top-right during and after a shot only, and the world panel takes the dash's
    // room (core/build.ts WORLD_H). Fine without the dash: the drawer holds every catapult
    // property and no part has stat bars (this course defines no `stats`).
    goalsOverlay: true,
  },
};
