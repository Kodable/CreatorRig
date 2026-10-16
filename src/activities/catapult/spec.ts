// Catapult course spec: the child builds the catapult by hand - stretches each rubber band from the
// arm to the angle lever (2026-10-16), drags fuzzes out of the SUPPLY BIN into the cup, drags the
// angle lever and the arm's slide knob on the machine itself, then taps FIRE (the bottom bar's yellow button) to snip the trigger
// string and launch within a shot budget, knocking down cans and block towers, sometimes chasing a
// bullseye. Product direction 2026-09-22: the PULL ring is gone - FIRE is a plain button, angle is
// a lever dragged on the machine, power is visible rubber bands. 2026-10-15 (Gao: "remove the fire
// button from in-world, and put fire on the yellow button at the bottom"): the bar's Play button
// reads FIRE and fires each shot (`hud.lines.launch` / `playAgain`). Intro levels have a coach
// (coach.ts). Huddle 2026-09-22: line levels ask for nothing left above a line, and the camera
// stays on the collapse. Stakeholder direction 2026-10-01: one Fuzz row - five fuzzes, each its
// own weight, the Donut splitting in three at the top of its arc. The machine is drawn with the art
// lead's real exports (core/build.ts's ART_PPM block).
//
// 2026-10-16 (Jon's huddle 2026-10-15: "the entirety of your effort for catapult should be on the
// catapult right now" - building it must feel tactile): rubber bands are unlimited (~10+ bands is
// a space shot, core/catalog.ts SPACE_SPEED), a small "−" badge takes one off, the arm length is a
// knob slid along the arm (1.5 .. 4 m), the backdrop is the coaster's theme park without its ferris
// wheel (backdrop.ts; Gao: "for the background, just use the roller coaster's bg but without the
// ferris wheel"), and the goals are the coaster's big goal cards (Gao: "change to use goal cards
// like in roller coaster"; `catapultGoalCard`). Later on 2026-10-16 (Gao: "i want the player to
// actually build the catapult's rubber bands. i want them to drag the rubber band from one arm to
// the other to install it"): a band is no longer a bin tile; the child stretches it from a hook on
// the arm to a hook on the angle lever (kit `StretchWidget`, id 'band-on'). See src/kit/types.ts for the CourseSpec contract this course plugs into.
import type { BinItem, CourseSpec, Goal, KitGoalCard, PlacedPart, RenderItem, ResultCard, Vec2, Widget } from '../../kit/types';
import type { PartKind, Metrics, Outcome, CatapultLevel } from './core/types';
import { BAND_COLOR, CATALOG, FUZZ, FUZZ_NAMES, MAX_BANDS, PART_LIMIT, armLength, bandCount, blockSize, defaultProps, fuzzName } from './core/catalog';
import {
  ARM_TEXTURES,
  armAngleFor,
  armSlide,
  BAND_ASPECTS,
  BLOCK_SIZES,
  CAN_TEXTURE,
  crateTexture,
  cupAtRest,
  LEVER_LENGTH,
  nextBandHooks,
  PIVOT_DX,
  PIVOT_DY,
  REST_ANGLE,
  WORLD_H,
} from './core/build';
import { createCatapultSim, DEBRIS_TEXTURES } from './core/sim';
import { LEVELS } from './core/levels';
import { CATAPULT_BACKDROP, CATAPULT_EARTH, CATAPULT_GRASS, CATAPULT_SKY } from './backdrop';
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
/** The stage y the catapult's anchor (the ground line under it) keeps in the build view at every
 * zoom since 2026-10-07: the world camera's viewport is stage y 78 .. 700, centre 389. */
const ANCHOR_STAGE_Y = 627.8;
const VIEWPORT_CENTRE_Y = (78 + 700) / 2;
/** Building: the machine's zoom. Until 2026-10-15 3.6; 2026-10-15 (Gao: "dont zoom into the
 * catapult as much, maybe just a little less so we can see the dotted line more") 2.8. 2026-10-16:
 * 2.5, so a 4 m arm (Jon: "arm length fully customizable"), its slide knob and the band bundle all
 * fit left of the open drawer with about the 1.5 m of open view right of the base that 2.8 gave the
 * shot preview (at 2.8 the 4 m cup left the view). */
export const FOCUS_ZOOM = 2.5;
/** The frame centre's height over the catapult's anchor (m): the anchor stays on its stage y
 * (ANCHOR_STAGE_Y), so the ground line does not move as the camera zooms in: (627.8 - 389) /
 * (32 * 2.5) = 2.985 m. */
const FOCUS_CY_ABOVE = (ANCHOR_STAGE_Y - VIEWPORT_CENTRE_Y) / (PPM * FOCUS_ZOOM);
/** How far left of the catapult's anchor the build view's left edge sits (m): the 4 m arm's cup
 * picture reaches x - 4.4 (its whole box, transparent corners included; the slide knob under it
 * reaches x - 3.9); 4.6 m keeps it in with a little air. */
const FOCUS_LEFT_M = 4.6;
/** The run: the follow camera's zoom, and how far over the followed point it centres: 0.5 m in the
 * 490 px viewport, + riseFor(1.6) = 1.289 m since 2026-10-07 (1.789 m; see `follow`). */
const FOLLOW_ZOOM = 1.6;
const FOLLOW_DY = 0.5 + riseFor(FOLLOW_ZOOM);

/** Where a bin item lands on the machine (world meters, centre + width), for the tap's "part
 * flies to the machine" animation (kit `partTargets`): a fuzz into the cup. The bands are stretched
 * on by hand and the angle and the arm are dragged on the machine itself (widgets), so nothing
 * flies for them. Only the catapult part has targets. */
function catapultPartTargets(
  part: PlacedPart<PartKind>,
  code: string,
  value: string,
): { at: Vec2; size: number }[] {
  if (part.kind !== 'catapult') return [];
  switch (code) {
    case 'fuzz': {
      // Sized to the NEW fuzz's diameter (with a little headroom).
      const fuzzSpec = FUZZ[value] ?? FUZZ.Fur!;
      return [{ at: cupAtRest(part), size: 2 * fuzzSpec.r * 1.5 }];
    }
    default:
      return [];
  }
}

// ---- the SUPPLY BIN (2026-10-16) -----------------------------------------------------------
// Jon (huddle 2026-10-15): "a classroom supply bin / toolbox you pull parts from instead of menu
// rows". The child drags a fuzz tile into the cup (or taps it). Items for a code the level has not
// introduced yet are hidden by the kit (the Donut tile waits for its own level, `fuzz:Donut`); a code
// in the catapult's lockedProps shows padlocked. Until later on 2026-10-16 the bin also held an
// endless Rubber band tile dropped onto the band bundle; the bands are stretched on by hand now
// (Gao: "drag the rubber band from one arm to the other to install it", `catapultWidgets`), so on
// Fling it the bin is empty and the drawer stays shut (kit `drawerHasContent`).

/** A fuzz tile's drop zone radius around the cup centre (m): 0.7 m (56 px at 2.5x) covers the
 * cup and the biggest fuzz (the Metal's spiky cap) with a finger's slack. */
export const CUP_DROP_R = 0.7;

/** `CourseSpec.bin`: the catapult's supply bin (other parts keep their drawer rows). */
export function catapultBin(part: PlacedPart<PartKind>): BinItem[] | null {
  if (part.kind !== 'catapult') return null;
  const loaded = fuzzName(part.props);
  const cup = cupAtRest(part);
  return FUZZ_NAMES.map(
    (name): BinItem => ({
      id: `fuzz-${name}`,
      image: FUZZ[name]!.image,
      label: FUZZ[name]!.label,
      group: 'Fuzzes',
      code: 'fuzz',
      value: name,
      active: name === loaded,
      drop: { at: cup, r: CUP_DROP_R },
    }),
  );
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
  const ALL = new Set(['bands', 'angle', 'fuzz', 'armLen']);
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

// ---- in-scene widgets ------------------------------------------------------------------------
// The rubber band stretched from arm to lever (2026-10-16), the angle lever's drag handle
// (2026-09-22), the arm's slide knob and the "take one band off" badge (2026-10-16). FIRE is the
// bottom bar's yellow button since 2026-10-15 (it was an in-scene tap button by the trigger string;
// the string's snip burst still plays there, core/build.ts `fireSpot`). The fuzz comes from the
// supply bin (`catapultBin`). The kit drops a widget whose code the level has not introduced yet and
// mutes one whose code is locked.

/** How far past the lever's tip the angle knob rides (m): clear of the lever's blue pad. */
const KNOB_OUT_M = 0.55;
/** How far under the cup centre the arm's slide knob rides (m), square to the arm at rest: the
 * knob sits just under the cup (the fuzz in the cup stays in sight and takes the fuzz drop), and
 * its track runs parallel to the arm like a ruler, 1.5 m nearest the base, 4 m out at the left.
 * Above the cup it would sit on the angle knob at 60-75 degrees with a short arm. */
export const SLIDE_UNDER_M = 0.7;
/** The "−" badge (2026-10-16): BAND_OFF_ALONG m out along the arm at rest from the pivot (the
 * innermost a band ever hooks on, core/build.ts BAND_ARM_MIN), then BAND_OFF_UNDER m square to the
 * arm, downward: on the base's A-frame under the arm, 72 px (at the build zoom) from the nearest arm
 * hook a band can have and on the far side of the arm from the lever hooks and the stretch path, so
 * its 64 px hit circle never sits on a hook; clear of the pivot gear and the slide knob. */
const BAND_OFF_ALONG = 0.55;
const BAND_OFF_UNDER = 0.9;
/** The band picture the stretch widget draws while a band is held (core/build.ts BAND_ASPECTS). */
const STRETCH_BAND_TEXTURE = 'real-band-8';

/** The slide knob's track: `armSlide` (the cup centre at 1.5 m and at 4 m, core/build.ts) moved
 * SLIDE_UNDER_M square to the arm at rest, downward. Option i (ARM_LENGTHS[i]) sits under that
 * length's cup. */
export function armSlideTrack(part: PlacedPart<PartKind>): { from: Vec2; to: Vec2 } {
  const { from, to } = armSlide(part);
  // Square to the arm at rest (REST_ANGLE, 195 degrees: down-left), on the ground side.
  const nx = Math.sin(REST_ANGLE);
  const ny = -Math.cos(REST_ANGLE);
  const down = ny > 0 ? { x: -nx, y: -ny } : { x: nx, y: ny };
  const shift = (p: Vec2): Vec2 => ({ x: p.x + down.x * SLIDE_UNDER_M, y: p.y + down.y * SLIDE_UNDER_M });
  return { from: shift(from), to: shift(to) };
}

/** Where the "−" badge sits (world m): see BAND_OFF_ALONG. */
export function bandOffAt(part: PlacedPart<PartKind>): Vec2 {
  const px = part.x + PIVOT_DX;
  const py = part.y + PIVOT_DY;
  const c = Math.cos(REST_ANGLE);
  const s = Math.sin(REST_ANGLE);
  // Square to the arm, on the ground side: (-sin, cos) of 195 degrees points down-right.
  return { x: px + BAND_OFF_ALONG * c - BAND_OFF_UNDER * s, y: py + BAND_OFF_ALONG * s + BAND_OFF_UNDER * c };
}

export function catapultWidgets(part: PlacedPart<PartKind>): Widget[] {
  if (part.kind !== 'catapult') return [];
  const { x, y } = part;
  const pivot: Vec2 = { x: x + PIVOT_DX, y: y + PIVOT_DY };
  const options = (code: string) => CATALOG.catapult.descriptors.find((d) => d.code === code)!.options;
  const bands = bandCount(part.props);
  const widgets: Widget[] = [];
  // 2026-10-16 (Gao: "i want the player to actually build the catapult's rubber bands. i want them
  // to drag the rubber band from one arm to the other to install it"): two pulsing hooks where the
  // next band goes (`nextBandHooks`: on the arm and on the angle lever, where the machine then draws
  // it); stretch a band from either one to the other and it hooks on: one band more, through the
  // normal prop path (undo, locks, `CoachContext.changed`, the between-shots live update). First in
  // the list, so the angle knob and the slide knob win a press where their grab circles overlap a
  // hook. Gone at MAX_BANDS. Kept while the bands are locked, muted by the kit (a touch gets Bruno's
  // "bolted down" line): the widget is what keeps the Rubber bands row (60 options) out of the
  // drawer. The kit drops it before the 'bands' row is introduced.
  if (bands < MAX_BANDS) {
    widgets.push({
      kind: 'stretch',
      id: 'band-on',
      code: 'bands',
      value: String(bands + 1),
      ...nextBandHooks(part),
      textureKey: STRETCH_BAND_TEXTURE,
      color: BAND_COLOR,
    });
  }
  widgets.push(
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
      options: options('angle'),
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
    {
      // 2026-10-16 (Jon: "arm length fully customizable"): pull the knob out along the arm and the
      // arm grows a quarter metre a notch, live (the arm picture, the cup and the shot preview
      // follow the finger); the knob reads the length ("2.5 m").
      kind: 'slide',
      id: 'armLen',
      code: 'armLen',
      ...armSlideTrack(part),
      options: options('armLen'),
      value: String(armLength(part.props)),
      live: true,
      readout: 'knob',
    },
  );
  // Take one band off (2026-10-16, bands are unlimited): a small red "−" badge on the A-frame under
  // the arm (`bandOffAt`). It sets one band fewer through the normal prop path (`values`: the one
  // next value), so undo, locks, `CoachContext.changed` and the between-shots live update all hold.
  // Hidden at 1 band (a catapult always keeps one) and while the bands are locked (a muted "−" next
  // to the muted hooks is noise).
  if (bands > 1 && !part.lockedProps?.includes('bands')) {
    widgets.push({
      kind: 'tap',
      id: 'band-off',
      code: 'bands',
      style: 'mini',
      icon: '−',
      at: bandOffAt(part),
      values: [String(bands - 1)],
    });
  }
  return widgets;
}

// ---- goal cards (2026-10-16) -----------------------------------------------------------------
// Gao: "change to use goal cards like in roller coaster": one big white card per goal - the target
// number over a picture (public/ui/goals/catapult-*.svg), a short Title Case caption (the card is
// 104 px wide, so about 12 letters), green when met, red once the level is failed (kit
// goalCards.ts). The level labels ("Can knocked down", "Block and can knocked down", "Targets
// knocked down") all read as one action with the number on top: "2 / Knock Down"; the pink numbered
// markers over the targets (core/sim.ts) show which ones. No unit on counts ("×" has no glyph in
// the Kodable font); distances in "m".

const GOAL_ICON = (name: string): string => `ui/goals/catapult-${name}.svg`;

/** A goal's target as kids read it: whole numbers bare, else one decimal. */
function targetText(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** `hud.goalCards`: the card for one catapult goal. */
export function catapultGoalCard(goal: Goal<Metrics>): KitGoalCard {
  const number = targetText(goal.value);
  const under = goal.op === '<=';
  switch (goal.metric) {
    case 'knockedDown':
      return { icon: GOAL_ICON('knocked'), number, unit: '', caption: 'Knock Down', under };
    case 'hits':
      return { icon: GOAL_ICON('hits'), number, unit: '', caption: goal.value === 1 ? 'Bullseye' : 'Bullseyes', under };
    case 'shotsUsed':
      return { icon: GOAL_ICON('shots'), number, unit: '', caption: 'Shots', under };
    case 'maxRange':
      return { icon: GOAL_ICON('range'), number, unit: 'm', caption: 'Distance', under };
    case 'smashed':
      return { icon: GOAL_ICON('smash'), number, unit: '', caption: goal.value === 1 ? 'Smash Crate' : 'Smash Crates', under };
    case 'aboveLine':
      // "Nothing left above the line" is yes/no: the picture alone (a check card).
      return goal.op === '==' && goal.value === 0
        ? { icon: GOAL_ICON('line'), number: '', unit: '', caption: 'Clear the Line', check: true }
        : { icon: GOAL_ICON('line'), number, unit: '', caption: 'Above the Line', under };
    default:
      return { icon: GOAL_ICON('knocked'), number, unit: '', caption: goal.label, under };
  }
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
    smashed: 0,
  }),

  canPlay: (parts) => parts.some((p) => p.kind === 'catapult'),

  // A space shot (2026-10-16) never passes, not even in free play (no goals): Bruno says why instead.
  passed: (outcome, goalsPass) => outcome !== 'running' && outcome !== 'space' && goalsPass,

  tuneBetweenRuns: true,
  spawn: { x: 15, y: 6 },
  // Stakeholder feedback 2026-09-22: "make the ground thicker so we can zoom in better to the
  // catapult (it's really low on the screen)." The kit's own ground strip draws the band (the
  // ground BODY/physics is sim.ts's, unchanged).
  //
  // 2026-10-07: the world is WORLD_H = 19.125 m tall (was 15; core/build.ts): no dash
  // (`hud.goalsOverlay`), so the 612 px panel starts at stage y 78 and shows y -1.5 .. 17.625.
  // 2026-10-16 (Gao: "for the background, just use the roller coaster's bg but without the ferris
  // wheel"): the coaster's sky, drifting clouds, hazy hills and trees (backdrop.ts), its ferris
  // wheel left out; the coaster's grass over warm earth. (Earlier that day a placeholder backyard
  // with a fence and a shed stood here, after the coaster's park with its wheel on 2026-10-15.)
  world: {
    worldW: 30,
    worldH: WORLD_H,
    ppm: PPM,
    groundDepth: 1.5,
    groundStrip: { top: CATAPULT_GRASS, bottom: CATAPULT_EARTH },
    sky: CATAPULT_SKY,
    backgrounds: CATAPULT_BACKDROP,
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
  // catapult (it's really low on the screen)": zoom 3.6, the machine filling the view left of the
  // drawer. 2026-10-15 (Gao: "dont zoom into the catapult as much"): 2.8, the machine at the view's
  // left so the freed room goes to the shot preview's arc. 2026-10-16: 2.5, for arms up to 4 m.
  //
  // The world camera's viewport is the 960 x 622 px panel (VIEWPORT_H_PX), so at zoom 2.5 the view
  // is 12 x 7.775 m. The open drawer (src/kit/builder.css: 340 px wide, from x 652 of the panel's
  // 32..992) covers the right 340 px, leaving 620 / 960 of the width, 7.75 m: x in
  // [cx - 6, cx + 1.75].
  //
  // Horizontal: the view's left edge sits FOCUS_LEFT_M (4.6 m) left of the anchor, so the 4 m arm's
  // cup picture (x - 4.4) and its slide knob are in; cx = x + 1.4 and the drawer's edge falls at
  // x + 3.15, 1.4 m of open sky right of the base's plank (x + 1.74) for the arc. The band bundle
  // (x - 0.7, y + 1.9), the "−" badge and the angle knob at every angle sit in between. The kit
  // clamps cx >= 15 / zoom = 6 (`clampFrame`, src/kit/camera.ts); the frame asks for that itself, so
  // a catapult at x 4.5 (Timber!, free play) gets cx 6.0, its 4 m cup picture 0.1 m inside the
  // world's left edge.
  //
  // Vertical: the anchor keeps its stage y (627.8, as since 2026-10-07), so the ground line does not
  // move when the camera zooms in: cy = y + 2.985 and the view runs y - 0.9 .. y + 6.87. The kit
  // clamps cy >= -1.5 + 19.125 / 2.5 / 2 = 2.325, under every level's y + 2.985 (every catapult
  // stands on y = 0). The frame is fixed per catapult (the kit asks on selection only), so it holds
  // every arm length while the knob slides.
  focusFrame: (part) =>
    part.kind === 'catapult'
      ? {
          cx: Math.max(15 / FOCUS_ZOOM, part.x - FOCUS_LEFT_M + 15 / FOCUS_ZOOM),
          cy: part.y + FOCUS_CY_ABOVE,
          zoom: FOCUS_ZOOM,
        }
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

  // The supply bin for the catapult (the fuzzes); the targets and free-play parts keep their drawer
  // rows.
  bin: catapultBin,

  // No BUILD pill (2026-10-15: tried above, then under the catapult; Gao: "just remove the build
  // button, it doesnt look good"): the child taps the catapult itself, and the coach points there.

  // Tutorials on the four intro levels (coach.ts): tap the catapult, the new thing (a band stretched
  // from arm to arm, the angle knob dragged, the Flower dropped in the cup, the arm knob slid), FIRE.
  coach: catapultCoach,

  partTargets: catapultPartTargets,

  // The drawer holds the supply bin for the catapult (shut while it has no tile to show, kit
  // `drawerHasContent`) and picture-button rows for the other parts;
  // the fuzz tiles are the same pictures as the scene textures, so a swapped fuzz looks the same in
  // the bin and in the cup.
  drawer: true,
  textures: {
    // `fuzz-<name>[-excited]` (see fuzzTextures above).
    ...fuzzTextures(),
    // The machine itself: the art lead's exports, prepared (cut, turned, recoloured) into
    // public/parts/catapult/real-*.png and stretched to each RenderItem's box (core/build.ts's
    // ART_PPM block has every box's arithmetic), so no scale beyond the plain 1 is needed.
    'real-base': { url: 'parts/catapult/real-base.png' },
    // 2026-10-16: one arm picture per arm length, 1.5 .. 4 m (core/build.ts ARM_TEXTURES).
    ...ARM_TEXTURES,
    'real-gear': { url: 'parts/catapult/real-gear.png' },
    'real-cup': { url: 'parts/catapult/real-cup.png' },
    'real-lever': { url: 'parts/catapult/real-lever.png' },
    // 2026-10-15 (Gao): the cans are the rover's can of beans (public/parts/rover/real/
    // weight-beans.png, 267 x 324) centred on a transparent 267 x 534 canvas: the 0.4 x 0.8 m can
    // box stretches the 1:2 canvas, so a scale of 534 / 324 draws the beans 0.8 m tall at their own
    // aspect (0.659 m wide), centred on the box (core/build.ts's CAN_TEXTURE).
    [CAN_TEXTURE]: { url: 'parts/catapult/can-beans.png', scale: 534 / 324 },
    // Overlay sprites (core/sim.ts): the rubber bands and the trigger string, and their hooks. The
    // stretch widget draws a held band with real-band-8 (STRETCH_BAND_TEXTURE).
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
    // Breakable crates (2026-10-15, core/sim.ts): one picture per block size, drawn at that size's
    // aspect so the planks never stretch (core/build.ts crateTexture); a SMASH! burst and three
    // plank pictures for the debris that tumbles out when one breaks.
    ...Object.fromEntries(BLOCK_SIZES.map((size) => [crateTexture(size), { url: `parts/catapult/${crateTexture(size)}.png` }])),
    ...Object.fromEntries(DEBRIS_TEXTURES.map((key) => [key, { url: `parts/catapult/${key}.png` }])),
    'fx-smash': { url: 'fx/smash.svg' },
  },

  resultCard: (parts, level, m, outcome, passed) => {
    const catapult = parts.find((p) => p.kind === 'catapult');
    const bands = bandCount(catapult?.props ?? {});
    const angle = catapult?.props.angle ?? '45';
    const armLen = armLength(catapult?.props ?? {});
    const fuzz = FUZZ[fuzzName(catapult?.props ?? {})]!.label;

    const hasHitsGoal = level.goals.some((g) => g.metric === 'hits');
    let outcomeText: string;
    if (outcome === 'cleared') {
      outcomeText = 'Every target down!';
    } else if (hasHitsGoal && m.hits >= 1) {
      outcomeText = 'Bullseye!';
    } else if (outcome === 'outOfShots') {
      outcomeText = 'Out of shots. Change the setup and try again.';
    } else if (outcome === 'space') {
      outcomeText = 'Into space! Too many bands.';
    } else {
      // A bullseye-only level has nothing to knock down, so "0 down, 0 to go" would be noise.
      const hasTargets = m.knockedDown + m.targetsLeft > 0;
      // A passed level with a target left over (Long shot's crate pedestal) says so plainly instead
      // of "1 to go" (2026-10-15).
      outcomeText = passed
        ? `Landed at ${m.maxRange.toFixed(1)} m. Goal done!`
        : hasTargets
          ? `Landed at ${m.maxRange.toFixed(1)} m. ${Math.round(m.knockedDown)} down, ${Math.round(m.targetsLeft)} to go.`
          : `Landed at ${m.maxRange.toFixed(1)} m.`;
    }

    const tone: ResultCard['tone'] = passed ? 'pass' : outcome === 'outOfShots' || outcome === 'space' ? 'fail' : 'neutral';

    // Only show rows for concepts the child has met by this level (see `knownConcepts`); an
    // intro level's card should not spoil a mechanic that is still locked and hidden.
    const known = knownConcepts(level.id);
    const allRows: { code: string; label: string; value: string }[] = [
      { code: 'bands', label: 'Rubber bands', value: `${bands}` },
      { code: 'angle', label: 'Angle', value: `${angle}°` },
      { code: 'fuzz', label: 'Fuzz', value: fuzz },
      { code: 'armLen', label: 'Arm length', value: `${armLen} m` },
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
      '1x1': '1 x 1',
      '2x1': '2 wide',
      '1x2': '2 tall',
      wood: 'Wood',
      brick: 'Brick',
      steel: 'Steel',
      crate: 'Crate',
      // No '15' -> '15°' entries any more (2026-10-16): the band counts 1..60 share those values, and
      // the angle options carry their own '15°' labels.
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
        case 'smashed':
          return `${Math.round(current)} of ${Math.round(goal.value)}`;
        default:
          return `${current} of ${goal.value}`;
      }
    },
    // aboveLine == 0 is met or not; a 0%/100% bar would only repeat the tick.
    barlessMetrics: ['aboveLine'],
    // 2026-10-16 (Gao: "change to use goal cards like in roller coaster"): the goals overlay is the
    // coaster's row of big cards (`catapultGoalCard`). No card fills while building: every goal
    // metric is 0 until a shot (aboveLine is real in edit mode, but a yes/no card shows no bar, and
    // no level starts with its line already clear).
    goalCards: catapultGoalCard,
    goalCardEditMetrics: [],
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
    // 'space' (2026-10-16): a space shot shows the level's `failHints.space` in the fail colour, even
    // with shots left (FIRE still works then, `canReplay`).
    failOutcomes: ['outOfShots', 'space'],
    // 2026-10-07: no dash, like the rover (2026-10-06). The goals sit over the scene's top-left (the
    // goal cards since 2026-10-16; the result card under them once a shot ends), the five meters in
    // a panel over its top-right during and after a shot only, and the world panel takes the dash's
    // room (core/build.ts WORLD_H). Fine without the dash: the bin and the widgets hold every
    // catapult property and no part has stat bars (this course defines no `stats`).
    goalsOverlay: true,
  },
};
