// Catapult course spec: the child sets power (rubber bands), the fuzz and the arm length in the
// properties drawer, drags the angle lever on the machine itself, then taps FIRE (the bottom
// bar's yellow button) to snip the trigger string and launch within a shot budget, knocking down
// cans and block towers, sometimes chasing a bullseye. Product direction 2026-09-22: the PULL ring
// is gone - FIRE is a plain button, angle is a lever dragged on the machine, power is visible
// rubber bands. 2026-10-15 (Gao: "remove the fire button from in-world, and put fire on the yellow
// button at the bottom"): the in-scene FIRE button is gone; the bar's Play button reads FIRE and
// fires each shot (`hud.lines.launch` / `playAgain`). Intro levels have a coach (coach.ts).
// Huddle 2026-09-22: line levels ask for nothing left above a line, and the camera stays on the
// collapse. Stakeholder direction 2026-10-01: weight and shot type merge into one Fuzz row - five
// fuzzes, each its own weight, the Donut splitting in three at the top of its arc. The machine is
// drawn with the art lead's real exports (core/build.ts's ART_PPM block). See src/kit/types.ts for
// the frozen CourseSpec contract this course plugs into.
import type { CourseSpec, PlacedPart, RenderItem, ResultCard, Vec2, Widget, WorldSpec } from '../../kit/types';
import type { PartKind, Metrics, Outcome, CatapultLevel } from './core/types';
import { ARM, BAND_COUNT, CATALOG, FUZZ, FUZZ_NAMES, PART_LIMIT, blockSize, defaultProps, fuzzName } from './core/catalog';
import {
  armAngleFor,
  BAND_ASPECTS,
  bandSegments,
  CAN_TEXTURE,
  catapultPocketAtRest,
  crossbarPoseFor,
  LEVER_LENGTH,
  PIVOT_DX,
  PIVOT_DY,
  REST_ANGLE,
  WORLD_H,
} from './core/build';
import { PARALLAX } from '../../kit/parallax';
import { createCatapultSim } from './core/sim';
import { LEVELS } from './core/levels';
import { catapultCoach } from './coach';

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
/** Building: the machine's zoom, and the frame centre's height over the catapult's anchor. Until
 * 2026-10-15 zoom 3.6 and 1.5 m in the 490 px viewport + riseFor(3.6) = 2.073 m. 2026-10-15 (Gao:
 * "dont zoom into the catapult as much, maybe just a little less so we can see the dotted line
 * more"): zoom 2.8, and the same rule with the anchor kept on its stage y (627.8, the ground line
 * where it was): 1.5 m at 3.6 is 172.8 stage px between the anchor and the 490 px viewport's
 * centre, i.e. 172.8 / (32 * 2.8) = 1.929 m at 2.8, + riseFor(2.8) = 0.737 m: 2.665 m (see
 * `focusFrame`). */
const FOCUS_ZOOM = 2.8;
const OLD_FOCUS_ZOOM = 3.6;
const FOCUS_CY_ABOVE = (1.5 * OLD_FOCUS_ZOOM) / FOCUS_ZOOM + riseFor(FOCUS_ZOOM);
/** The frame centre's x over the catapult's anchor (m): the machine near the view's left edge (the
 * Long arm's cup 0.3 m in), so the open drawer leaves the most room on the right for the shot
 * preview's arc (see `focusFrame`). */
const FOCUS_DX = 1.75;
/** The run: the follow camera's zoom, and how far over the followed point it centres: 0.5 m in the
 * 490 px viewport, + riseFor(1.6) = 1.289 m since 2026-10-07 (1.789 m; see `follow`). */
const FOLLOW_ZOOM = 1.6;
const FOLLOW_DY = 0.5 + riseFor(FOLLOW_ZOOM);
/** 2026-10-15 (Gao: "add the roller coaster course bg into it"): the coaster's theme-park backdrop
 * (public/bg/coaster/, README "Theme-park backdrop"), laid out in world metres so it reads as on
 * the coaster. Both panels are 960 stage px wide (30 m here at 32 px/m), so every layer keeps the
 * coaster's stage-px sizes and its height over the ground line (the coaster's ground is stage y
 * 690, its panel bottom 700; here world y 0). The catapult's copies of the far hills, the trees
 * and the ferris wheel are 4x stage px (the coaster's are 2x) for the 3.6x build view; the trees
 * are re-placed and the wheel is the coaster's code-drawn one as pictures (a Pillow script,
 * compose_catapult.py, not in the repo). Later the same day (Gao: it "lost the coaster's life")
 * the layers move again, through the kit's `BackgroundLayer` fields: each lags the camera by the
 * coaster's depth factor (`PARALLAX`; the composed picture is the full view, and the build
 * view's 3.6x and the follow camera's 1.6x slide the layers apart), the clouds drift and the
 * wheel turns with its cars hanging level. Every layer that lags covers the whole panel (or
 * stands on the ground and only shifts sideways), so no frame shows a gap. Back to front: */
const BG = 'bg/coaster/';
/** px (stage) -> m. */
const M = (px: number): number => px / PPM;
/** The top of the visible sky (world y): the panel's top edge, 1.5 m of ground below y 0. */
const SKY_TOP_Y = WORLD_H - 1.5;
/** The bottom of the world camera's viewport (world y): the 1.5 m of ground plus the kit's 10 px
 * earth margin. The sky picture reaches down to it so its vertical parallax never lifts its
 * bottom edge into view (the ground band covers it anyway). */
const VIEW_BOTTOM_Y = -1.5 - M(10);
/** The ferris wheel's hub: x 10 m, 104 px (3.25 m) up as on the coaster; rim radius 84 px. */
const WHEEL_HUB = { x: 10, y: M(104) };
/** The coaster's calm turn (CoasterScene WHEEL_SPEED), rad/s clockwise. */
const WHEEL_SPIN = 0.12;
/** The wheel moves nearly with the world here (the coaster's wheel depth is { x: 0.55, y: 1 }):
 * the catapult's 3.6x build view sits near x 6 m, and at the coaster's depth the wheel slid ~4 m
 * left and filled the space behind the machine (2026-10-15). At 0.9 it shifts ~0.6 m. Since the
 * build view went to 2.8x later that day (centred near x 7 m) the wheel stands behind the shot
 * preview's arc, right of the machine; the arc's dark-rimmed dots read on it. */
const CATAPULT_WHEEL_PARALLAX = { x: 0.9, y: 1 };

const COASTER_BACKDROP: NonNullable<WorldSpec['backgrounds']> = [
  // The sky gradient + cloud puffs (1920 x 1244, the coaster's whole 622 px panel) over the whole
  // 622 px viewport, y -1.8125 .. 17.625 (unsquashed), at the coaster's sky depth.
  {
    url: `${BG}sky.jpg`,
    x: 15,
    y: (SKY_TOP_Y + VIEW_BOTTOM_Y) / 2,
    w: 30,
    h: SKY_TOP_Y - VIEW_BOTTOM_Y,
    parallax: PARALLAX.sky,
  },
  // The coaster's three clouds from its start positions (stage x 300 / 720 / 860 and y 300 / 175
  // / 420, i.e. 390 / 515 / 270 px over the ground line), half their 2x size, creeping right at
  // the coaster's 5 / 3.5 / 6 stage px a second and wrapping out of view.
  { url: `${BG}cloud1.png`, x: M(300 - 32), y: M(690 - 300), w: M(170), h: M(35.5), parallax: PARALLAX.flyers, drift: M(5) },
  { url: `${BG}cloud2.png`, x: M(720 - 32), y: M(690 - 175), w: M(170), h: M(49), parallax: PARALLAX.flyers, drift: M(3.5) },
  { url: `${BG}cloud3.png`, x: M(860 - 32), y: M(690 - 420), w: M(130), h: M(29.5), parallax: PARALLAX.flyers, drift: M(6) },
  // Hazy hills + a tree line: the coaster's 300 px band, its ground line 10 px over its bottom.
  { url: `${BG}catapult-far.png`, x: 15, y: M(300 / 2 - 10), w: 30, h: M(300), parallax: PARALLAX.far },
  // The ferris wheel, standing on the ground in the open sky between the catapult (x 3.5 .. 6) and
  // the near targets in the full view. Two layers at the coaster's wheel depth: the still A-frame
  // legs (stage px -50 .. 50 across, -6 .. 110 down from the hub, the feet 2 px under the ground
  // line), then the rim, spokes and hub (a 180 px square on the hub) turning at the coaster's
  // speed, with its 10 cars (22 x 20 px, five colours in turn) hung from the rim by their hanger
  // tops and kept upright. 70 % opaque on top of the coaster's colour haze: the 1.6x follow camera
  // makes it big right where every shot starts, and the fuzz must stay the boldest thing there.
  {
    url: `${BG}wheel-stand.png`,
    x: WHEEL_HUB.x,
    y: WHEEL_HUB.y - M(52),
    w: M(100),
    h: M(116),
    alpha: 0.7,
    parallax: CATAPULT_WHEEL_PARALLAX,
  },
  {
    url: `${BG}wheel-rim.png`,
    x: WHEEL_HUB.x,
    y: WHEEL_HUB.y,
    w: M(180),
    h: M(180),
    alpha: 0.7,
    parallax: CATAPULT_WHEEL_PARALLAX,
    spin: WHEEL_SPIN,
    satellites: {
      url: [1, 2, 3, 4, 5].map((n) => `${BG}wheel-car-${n}.png`),
      count: 10,
      r: M(84),
      w: M(22),
      h: M(20),
      pivot: { x: 0.5, y: 1 / 20 },
    },
  },
  // The trees (the coaster's 230 px band, ground line 10 px over its bottom), re-placed at x 1,
  // 23.6 and 29.3 m: none behind the catapult, the wheel or the near targets in the full view
  // (only the bullseye poles at 23.5 and 28.5 cross a trunk; their discs, 4 .. 5 m up, clear the
  // treetops). At the coaster's near-tree depth.
  { url: `${BG}catapult-mid.png`, x: 15, y: M(230 / 2 - 10), w: 30, h: M(230), parallax: PARALLAX.mid },
];
/** sky.jpg's own top and bottom rows (40, 105, 197) / (184, 223, 250), for the kit sky under it. */
const COASTER_SKY = { top: 0x2869c5, bottom: 0xb8dffa };
/** The coaster's grass strip (ground.png, (44, 190, 75)) for the kit ground band's grass. */
const COASTER_GRASS = 0x2cbe4b;

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

/** The one in-scene widget left: the angle lever's drag handle. Power (rubber bands), the fuzz and
 * the arm are set from the properties drawer; FIRE is the bottom bar's yellow button since
 * 2026-10-15 (it was an in-scene tap button by the trigger string, `action: 'play'`; the string's
 * snip burst still plays there, core/build.ts `fireSpot`). */
/** How far past the lever's tip the angle knob rides (m): clear of the lever's blue pad. */
const KNOB_OUT_M = 0.55;

function catapultWidgets(part: PlacedPart<PartKind>): Widget[] {
  if (part.kind !== 'catapult') return [];
  const { x, y } = part;
  const pivot: Vec2 = { x: x + PIVOT_DX, y: y + PIVOT_DY };
  const angleOptions = CATALOG.catapult.descriptors.find((d) => d.code === 'angle')!.options;

  return [
    {
      kind: 'dial',
      id: 'angle',
      code: 'angle',
      pivot,
      radiusPx: 150,
      // World-meter radius overrides radiusPx: the handle rides the lever's line at any camera
      // zoom, KNOB_OUT_M past its tip (2026-10-15, Gao: "move the angle drag handle out so that
      // it doesnt overlap with the object"), and option i lands on that line for that angle
      // (armAngleFor(deg) is the same stop-direction formula the lever's own geometry uses).
      radiusM: LEVER_LENGTH + KNOB_OUT_M,
      arcFrom: armAngleFor(15),
      arcTo: armAngleFor(75),
      options: angleOptions,
      value: part.props.angle ?? '45',
      track: 'none', // the lever stick itself is the track; no separate arc band drawn
      readout: 'knob',
      live: true, // the lever (and the crossbar it drives) moves with the finger, not just on release
      // 2026-10-15 (Gao: "for the angle adjustment, remove the indicator dots, and make the drag
      // handle smaller"): no notch dots along the arc, and a 56 px knob (was 72; its "60°" stays
      // 16 px bold, its grab circle 78 px across, widgetLayout's DIAL_MIN_KNOB_PX).
      notches: false,
      size: 56,
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
  // catapult (it's really low on the screen)." The kit's own ground strip draws the band (the
  // ground BODY/physics is sim.ts's, unchanged): the coaster's grass green over a warm earth brown
  // matching the old catapult-drawn ground fill (0x5a3d1e).
  //
  // 2026-10-07: the world is WORLD_H = 19.125 m tall (was 15; core/build.ts): no dash
  // (`hud.goalsOverlay`), so the 612 px panel starts at stage y 78 and shows y -1.5 .. 17.625.
  // 2026-10-15: the backdrop is the coaster's theme park (COASTER_BACKDROP above; it was the park
  // picture public/bg/park.jpg as a 30 x 15 m rectangle).
  world: {
    worldW: 30,
    worldH: WORLD_H,
    ppm: PPM,
    groundDepth: 1.5,
    groundStrip: { top: COASTER_GRASS, bottom: 0x5a3d1e },
    sky: COASTER_SKY,
    backgrounds: COASTER_BACKDROP,
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
  // catapult (it's really low on the screen)": zoom 3.6, cx = x + 0.7, the machine filling the
  // view left of the drawer. 2026-10-15 (Gao: "dont zoom into the catapult as much, maybe just a
  // little less so we can see the dotted line more"): zoom 2.8, the machine moved to the view's
  // left so the room it frees goes to the shot preview's arc (up and to the right of the cup).
  //
  // The world camera's viewport is the 960 x 622 px panel (VIEWPORT_H_PX), so at zoom 2.8 the view
  // is 960 / 89.6 x 622 / 89.6 = 10.714 x 6.942 m. The open drawer (src/kit/builder.css: 340 px
  // wide, from x 652 of the panel's 32..992) covers the right 340 px, leaving 620 / 960 of the
  // width, 6.920 m: x in [cx - 5.357, cx + 1.563].
  //
  // The machine, measured on the prepared pictures' opaque pixels (relative to the part's anchor,
  // 2026-10-01): leftmost the Long arm's cup at rest, x - 3.31; rightmost the base picture's plank,
  // x + 1.74; top the lever's pad at 15 degrees, y + 3.38 (the knob, LEVER_LENGTH out, tops out at
  // y + 3.05). cx = x + FOCUS_DX = x + 1.75 puts the view's left edge at x - 3.607, 0.30 m left of
  // the Long cup, and the drawer's edge at x + 3.313: 1.57 m of open sky right of the plank (none
  // at 3.6) for the arc, which also has 2.76 m over the lever's pad.
  //
  // Vertical: the anchor keeps its stage y (627.8, as since 2026-10-07), so the ground line does
  // not move when the camera zooms in: cy = y + FOCUS_CY_ABOVE = y + 2.665 and the view runs
  // y - 0.806 .. y + 6.136 (72 px of the ground band under the anchor, as before). The kit clamps
  // cy >= -1.5 + 19.125 / 2.8 / 2 = 1.915, under every level's y + 2.665 (every catapult stands on
  // y = 0).
  //
  // Left clamp: the kit clamps cx to >= 15 / zoom = 5.357 (`clampFrame`, src/kit/camera.ts); the
  // frame asks for that itself (the 'move' level starts its catapult at x = 3.5, the lowest x any
  // level places one at: cx 5.357 instead of 5.25, the Short arm's cup still 1.2 m in). On the move
  // level the frame follows the dragged catapult's x.
  focusFrame: (part) =>
    part.kind === 'catapult'
      ? { cx: Math.max(15 / FOCUS_ZOOM, part.x + FOCUS_DX), cy: part.y + FOCUS_CY_ABOVE, zoom: FOCUS_ZOOM }
      : null,

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

  // No BUILD pill (2026-10-15: tried above, then under the catapult; Gao: "just remove the build
  // button, it doesnt look good"): the child taps the catapult itself, and the coach points there.

  // Tap tutorials on the five intro levels (coach.ts): tap the catapult, the new control, FIRE.
  coach: catapultCoach,

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
    // 2026-10-15 (Gao): the cans are the rover's can of beans (public/parts/rover/real/
    // weight-beans.png, 267 x 324) centred on a transparent 267 x 534 canvas: the 0.4 x 0.8 m can
    // box stretches the 1:2 canvas, so a scale of 534 / 324 draws the beans 0.8 m tall at their own
    // aspect (0.659 m wide), centred on the box (core/build.ts's CAN_TEXTURE).
    [CAN_TEXTURE]: { url: 'parts/catapult/can-beans.png', scale: 534 / 324 },
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
      pass: 'It worked. Good plan!',
      doneNotPassed: 'The fuzz landed. Now check the goals.',
      freePlay: 'Fling fuzzes at anything you like!',
      // 2026-10-15: FIRE is the bar's yellow button: one tap = one shot, from the first shot
      // (edit mode) and again between shots (done mode while shots are left, `canReplay`).
      launch: '▶ FIRE',
      playAgain: '▶ FIRE',
      reset: '↺ Reset',
      shotDone: 'Not yet! Change something and tap FIRE again.',
      refused: "That won't fit there. Let's try another spot.",
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
