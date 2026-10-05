// Marstopia Rover course spec. Stakeholder direction 2026-10-02 (Gao): "Revamp the rover building
// completely ... putting parts onto a rover base ... wheels, or different ways to propel the rover,
// or different weights, and choose the suspension. Each part will cost a different amount. Parts
// can be placed anywhere on the base." The level places the glass dome with Kevin inside; the
// child taps parts in the palette (each with its coin cost, against the level's budget), drags
// them anywhere around the dome's rim, picks each part's mount (suction cup or spring) in the
// drawer, then presses the green DRIVE button and watches the rover behave. See src/kit/types.ts
// for the frozen CourseSpec contract this course plugs into.
//
// 2026-10-05 (Gao): "Allow the car to be upside down" (no `flipped` outcome; core/sim.ts) and
// "More challenge levels with more varied terrain and a scrolling camera": the world is WORLD_W
// (90 m) wide, the panel shows a VIEW_W (30 m) window of it, the kit scrolls the camera (follow in
// play mode, a scrollbar in edit mode), and a level whose beacon is out of the first view opens
// with a pan from the beacon back to the start (`intro`).
import type { CameraFrame, CourseSpec, PlacedPart, RenderItem, Vec2, Widget } from '../../kit/types';
import type { AttachmentKind, Metrics, Outcome, PartKind, VehicleLevel } from './core/types';
import {
  ATTACHMENT_KINDS,
  CATALOG,
  LABELS,
  ICONS,
  PART_LIMIT,
  buildCost,
  defaultProps,
  isAttachment,
  mountOf,
  partCost,
} from './core/catalog';
import { ART_DIR } from './core/art';
import { GROUND_DEPTH, WORLD_H } from './core/build';
import { ROVER_R, SPAWN, layoutRover, normalizeRoverParts, rotate, roverTextures } from './core/geometry';
import { VIEW_W, WORLD_W, heightAt } from './core/terrain';
import { createVehicleSim } from './core/sim';
import { LEVELS } from './core/levels';

/** The world camera's panel is 960 x 490 stage px at ppm 32 (see the catapult spec's note); the
 * drawer (src/kit/builder.css, 340 px wide) is now ALWAYS open while building this course (every
 * palette kind lives on the parts shelf, see `hud.partInfo` below), covering its right 340 px.
 *
 * Fit arithmetic (measured in spec.test.ts on BIG_BUILD: 3 wheels, a jet on the FRONT and the
 * BACK, a watermelon on top, a stove — denser than any level's own solution):
 *  - At zoom z the camera's own view is 960/(32 z) m wide, 490/(32 z) m tall: 10.714 x 5.469 m at
 *    2.8. The drawer leaves 620/960 = 0.6458 of the width uncovered: 6.920 m at 2.8.
 *  - cx wants the dome mid-way across that uncovered strip: rover.x + (1 - 0.6458)/2 * viewW =
 *    rover.x + 1.897 at 2.8. But the kit's camera clamp keeps the WHOLE view (not just the
 *    uncovered part) inside the world (x in [0, WORLD_W]), clamping cx >= viewW/2 = 15/zoom =
 *    5.357 at 2.8; every level places the dome at x 3 (levels.ts ROVER_X), so this clamp always
 *    wins and the uncovered strip's left edge sits exactly on the world wall (x0 = 0).
 *  - BIG_BUILD spans rover.x +/- 1.690 m (symmetric: a wheel/jet at 0 and at 180 degrees reaches
 *    the same ROVER_R 0.75 m + mount + reach/picture-halfwidth either way). At zoom 2.8 that
 *    leaves 1.310 m clear on the left of the strip and 2.229 m on the right (x0 1.310, x1 4.690
 *    of the strip's [0, 6.920]) — the extra room on the right is for the DRIVE button.
 *  - cy = heightAt(terrain, rover.x) + FOCUS_CY_ABOVE_GROUND: the watermelon on top reaches
 *    rover.y + 1.742, a rear jet dips to rover.y - 1.641. At zoom 2.8 the view's y-range (+/-
 *    2.734 around cy) clears both, with 0.909 m of air above the build (room for DRIVE + its
 *    caption) and 1.177 m of ground showing under the wheels.
 *  - DRIVE (96 px -> 0.536 m radius at 2.8) goes beside the build, not above it, on BIG_BUILD:
 *    above the build it would need ext.y1 + DRIVE_CAPTION + radius = 4.412 m of headroom under
 *    the view's top edge, which only has 4.384 (minus FRAME_MARGIN) — 0.027 m short, so
 *    `driveButtonAt` falls back to beside, landing with 0.858 m still clear of the strip's right
 *    edge.
 *  - Zoom is not what makes BIG_BUILD fit: the view, the build's extent and DRIVE's radius are
 *    all in world meters, and only the view's width (and the clamp's own margin) scale with
 *    1/zoom, so a LOWER zoom buys MORE room, not less (checked at 2.4: the uncovered strip grows
 *    to 8.073 m and DRIVE fits ABOVE the build instead of beside it). The 2.4 floor is a screen
 *    real-estate rule, not an overflow one: below it the 0.75 m dome and its attachments (suction
 *    cups, mounts, the Mount drawer row's own pictures) read too small on the panel for a
 *    child's finger to place precisely (Jon's tactile-variables rule). 2.8 is the zoom the build
 *    already used before the drawer went always-open; this spec keeps it, since the fit above
 *    holds with room to spare. */
export const FOCUS_ZOOM = 2.8;
const PANEL_W_PX = 960;
const PANEL_H_PX = 490;
const DRAWER_PX = 340;
const PPM = 32;
/** The DRIVE button's size (stage px). Its caption hangs ~22 px under it: DRIVE_CAPTION (m at the
 * focus zoom, plus a little air) between the build's top and the button's bottom edge. */
export const DRIVE_SIZE = 96;
const DRIVE_CAPTION = 0.35;
const DRIVE_SIDE_GAP = 0.3;
const FRAME_MARGIN = 0.05;
/** The focus frame's centre sits this high above the ground under the dome. */
const FOCUS_CY_ABOVE_GROUND = 1.7;

/** The intro pan's length (ms): from the beacon back to the start. */
export const INTRO_MS = 2800;

/** The level's beacon. */
function levelFinish(level: VehicleLevel): PlacedPart<PartKind> | undefined {
  return level.parts.find((p) => p.kind === 'finish');
}

/** A zoom-1 frame (the whole view: VIEW_W x 15 m, the full-panel height) centred on world x
 * `x`, kept inside the world the way the kit clamps it: cx in [VIEW_W / 2, WORLD_W - VIEW_W / 2];
 * cy shows the panel's full height (y -GROUND_DEPTH .. 15 - GROUND_DEPTH). */
export function viewFrameAt(x: number): CameraFrame {
  return {
    cx: Math.max(VIEW_W / 2, Math.min(WORLD_W - VIEW_W / 2, x)),
    cy: WORLD_H / 2 - GROUND_DEPTH,
    zoom: 1,
  };
}

/** `CourseSpec.intro`: a level whose beacon lies beyond the first view (the start frame shows
 * x 0..VIEW_W) pans from a frame centred on the beacon to one centred on the start (the dome)
 * over INTRO_MS, so the child sees the whole course once. null for a level that fits the view. */
export function introPan(level: VehicleLevel): { from: CameraFrame; to: CameraFrame; ms: number } | null {
  const finish = levelFinish(level);
  const rover = levelRover(level);
  if (!finish || !rover) return null;
  const start = viewFrameAt(rover.x);
  if (finish.x + FINISH_HALF_W <= start.cx + VIEW_W / 2) return null;
  return { from: viewFrameAt(finish.x), to: start, ms: INTRO_MS };
}
/** Half the beacon's width (core/build.ts buildFinish). */
const FINISH_HALF_W = 0.3;

/** The level's dome (every level places exactly one). */
function levelRover(level: VehicleLevel): PlacedPart<PartKind> | undefined {
  return level.parts.find((p) => p.kind === 'rover');
}

/** The camera frame for building: the same for the dome and every attachment (stable while the
 * child adds and drags parts), from the level's dome x and the ground under it. At zoom 2.8 the
 * view is 10.7 x 5.5 m; cx puts the dome mid-way across the part the drawer leaves uncovered
 * (the kit clamps cx >= 15 / zoom, so a dome at x 3 sits a little left of that); cy leaves
 * ~1 m of ground under the wheels and room for the DRIVE button over a part on top. */
export function buildFrame(level: VehicleLevel): { cx: number; cy: number; zoom: number } | null {
  const rover = levelRover(level);
  if (!rover) return null;
  const viewW = PANEL_W_PX / (PPM * FOCUS_ZOOM);
  const uncovered = (PANEL_W_PX - DRAWER_PX) / PANEL_W_PX;
  return {
    cx: rover.x + ((1 - uncovered) / 2) * viewW,
    cy: heightAt(level.terrain, rover.x) + FOCUS_CY_ABOVE_GROUND,
    zoom: FOCUS_ZOOM,
  };
}

/** The world box (x0..x1, y0..y1) the build's pictures cover: the dome and every part on it. */
export function buildExtent(parts: PlacedPart<PartKind>[], level: VehicleLevel): { x0: number; x1: number; y0: number; y1: number } | null {
  const layout = layoutRover(parts, level.terrain);
  if (!layout) return null;
  const { rover } = layout;
  const ext = { x0: rover.x - ROVER_R, x1: rover.x + ROVER_R, y0: rover.y - ROVER_R, y1: rover.y + ROVER_R };
  for (const { geometry: g } of layout.attachments) {
    const items = g.pictures.map((p) => ({ shape: p.shape, pos: g.body.pos, angle: g.body.angle }));
    if (g.mountPicture) items.push({ shape: g.mountPicture.shape, pos: g.rim, angle: g.theta - Math.PI / 2 });
    for (const { shape, pos, angle } of items) {
      const cx = shape.cx ?? 0;
      const cy = shape.cy ?? 0;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const p = rotate({ x: cx + (sx * shape.w) / 2, y: cy + (sy * shape.h) / 2 }, angle);
        ext.x0 = Math.min(ext.x0, rover.x + pos.x + p.x);
        ext.x1 = Math.max(ext.x1, rover.x + pos.x + p.x);
        ext.y0 = Math.min(ext.y0, rover.y + pos.y + p.y);
        ext.y1 = Math.max(ext.y1, rover.y + pos.y + p.y);
      }
    }
  }
  return ext;
}

/** The green DRIVE button: over the build when its button and caption fit under the build
 * frame's top edge, otherwise beside the build on the right (toward where the rover drives). */
export function driveButtonAt(parts: PlacedPart<PartKind>[], level: VehicleLevel): Vec2 | null {
  const rover = parts.find((p) => p.kind === 'rover');
  const ext = buildExtent(parts, level);
  const frame = buildFrame(level);
  if (!rover || !ext || !frame) return null;
  const viewH = PANEL_H_PX / (PPM * FOCUS_ZOOM);
  const radius = DRIVE_SIZE / (2 * PPM * FOCUS_ZOOM);
  const frameTop = frame.cy + viewH / 2;
  const above = ext.y1 + DRIVE_CAPTION + radius;
  if (above + radius <= frameTop - FRAME_MARGIN) return { x: rover.x, y: above };
  return { x: ext.x1 + radius + DRIVE_SIDE_GAP, y: Math.min(rover.y + ROVER_R, frameTop - radius - FRAME_MARGIN) };
}

/** Result-card rows: how many of each part, the springs, and the coins. */
function buildRows(parts: PlacedPart<PartKind>[], level: VehicleLevel): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const kind of ATTACHMENT_KINDS) {
    const n = parts.filter((p) => p.kind === kind).length;
    if (n > 0) rows.push({ label: `${ICONS[kind]} ${LABELS[kind]}`, value: `× ${n}` });
  }
  const springs = parts.filter((p) => isAttachment(p.kind) && mountOf(p.props) === 'spring').length;
  if (springs > 0) rows.push({ label: 'On springs', value: `× ${springs}` });
  if (rows.length === 0) rows.push({ label: 'Parts', value: 'none yet' });
  const coins = buildCost(parts);
  rows.push({ label: '🪙 Coins', value: level.budget !== undefined ? `${coins} of ${level.budget}` : `${coins}` });
  return rows;
}

const FILL = (item: RenderItem): { color: number; alpha: number } => ({ color: item.color, alpha: item.alpha ?? 1 });

/** Parts-shelf section each attachment kind is grouped under (`hud.partInfo.group`, kit/types.ts):
 * the three groups a build chooses from (Jon, huddle 2026-09-16: wheels, propulsion, weights). */
const SHELF_GROUP: Record<AttachmentKind, string> = {
  wheelCircle: 'Wheels', wheelSquare: 'Wheels', wheelStar: 'Wheels',
  fan: 'Power', stove: 'Power', jet: 'Power',
  feather: 'Weights', beans: 'Weights', watermelon: 'Weights',
};

/** Parts-shelf picture each attachment kind shows (`hud.partInfo.image`). The wheel and power
 * pictures are already near-square (manifest.json), so the shelf uses them as-is. Feather
 * (586x193) and watermelon (627x398) are far from square; `icon-feather.png` / `icon-watermelon
 * .png` are square-padded (256x256, ~8% margin, prepared with Pillow) stand-ins for the shelf
 * button ONLY — the in-scene textures (`roverTextures()`) keep using the real, non-square files,
 * same as before. Beans (267x324) is close enough to square to use its real picture too. */
const SHELF_IMAGE: Record<AttachmentKind, string> = {
  wheelCircle: `${ART_DIR}wheel-circle.png`,
  wheelSquare: `${ART_DIR}wheel-square.png`,
  wheelStar: `${ART_DIR}wheel-star1.png`,
  fan: `${ART_DIR}power-fan.png`,
  stove: `${ART_DIR}power-stove.png`,
  jet: `${ART_DIR}power-jet.png`,
  feather: `${ART_DIR}icon-feather.png`,
  beans: `${ART_DIR}weight-beans.png`,
  watermelon: `${ART_DIR}icon-watermelon.png`,
};

export const vehicleSpec: CourseSpec<PartKind, Metrics, Outcome, VehicleLevel> = {
  id: 'vehicle',
  levels: LEVELS,
  catalog: CATALOG,
  defaultProps,
  partLimit: PART_LIMIT,

  createSim: (parts, level) => createVehicleSim(parts, level),

  editMetrics: () => ({ reachedFinish: 0, time: 0, flips: 0, distance: 0, upsideDown: 0, topSpeed: 0 }),

  canPlay: (parts) => parts.some((p) => p.kind === 'rover'),

  passed: (outcome, goalsPass) => outcome !== 'running' && goalsPass,

  // A palette part appears here; normalizeParts then gives it a free spot on the rim by kind
  // (wheels low, propulsion at the back, weights on top) and the child drags it from there.
  spawn: SPAWN,
  normalizeParts: (parts, level) => normalizeRoverParts(parts, level.terrain),
  // Several parts may share a spot on the rim; the dome's height comes from normalizeParts.
  resolveOverlaps: false,
  writeBackSettled: false,
  partCost,

  // `stars: false`: the mars-sky picture already carries its own starfield/nebula glow; the sky
  // colours stay as the fallback for wherever the picture doesn't reach.
  // `worldW` 90 (WORLD_W): one width for the whole course (the kit reads `world` once); the first
  // nine levels keep their 30 m and the camera just has room to the right.
  world: {
    worldW: WORLD_W,
    worldH: WORLD_H,
    ppm: PPM,
    sky: { top: 0x0b1030, bottom: 0x3a1c3f, stars: false },
    groundStrip: { top: 0xb5532e, bottom: 0x8a3c1f },
    // Lets a focus/follow frame centre lower; GROUND_DEPTH (core/build.ts) is the same number
    // buildTerrain's darker "under" layer closes at (see terrainPolygon's doc comment).
    groundDepth: GROUND_DEPTH,
    // The course draws its own ground (buildTerrain's under/crust/chasm layers): a level's
    // terrain can dip below y = 0 (a jump's lower landing) or open into a pit.
    groundBand: false,
    backgrounds: [
      // The whole world wide, extended down to -GROUND_DEPTH so the picture covers the sky below
      // y = 0 too. mars-sky-wide.jpg is mars-sky.jpg three times over (7200 x 1300 px, each copy
      // cross-faded into the next over 300 px, so there is no seam and nothing is stretched: its
      // aspect matches the 90 x 16.5 m rectangle).
      { url: 'bg/mars-sky-wide.jpg', x: WORLD_W / 2, y: WORLD_H / 2 - GROUND_DEPTH / 2, w: WORLD_W, h: WORLD_H + GROUND_DEPTH },
      // The planet hangs over the start, in the first view.
      { url: 'bg/mars-planet.png', x: 24, y: 11.5, w: 3.2, h: 3.2 },
    ],
  },

  // The drawer shows the selected part's Mount row (suction cup / spring pictures). Every part
  // is drawn with the real art (core/art.ts has the scale rule and the anchors).
  drawer: true,
  textures: {
    ...roverTextures(),
    'rv-boulder': { url: 'parts/rover/cargo-Heavy.png' },
  },

  roles: {
    finish: { fill: (item: RenderItem) => ({ color: item.color, alpha: 0.45 }), decorate: 'flag' },
    rover: { fill: (item: RenderItem) => ({ color: item.color, alpha: 0.35 }) },
    kevin: { fill: FILL },
    shadow: { fill: FILL },
    wheel: { fill: FILL },
    power: { fill: FILL },
    weight: { fill: FILL },
    mount: { fill: FILL },
    block: { fill: FILL },
    terrain: { fill: FILL },
  },

  focusFrame: (_part, level) => buildFrame(level),

  intro: (level) => introPan(level),

  follow: (_level, outcome) =>
    outcome === 'running' ? { roles: ['rover'], zoom: 1.6, lerp: 0.1, offset: { x: 1.5, y: 0.5 } } : null,

  // The only in-scene control: the green DRIVE button over the dome, shown when the child taps
  // the dome. (An attachment shows its selection ring and the drawer instead.)
  widgets: (part, parts, level): Widget[] => {
    if (part.kind !== 'rover') return [];
    const at = driveButtonAt(parts, level);
    if (!at) return [];
    return [{ kind: 'tap', id: 'drive', action: 'play', at, size: DRIVE_SIZE, icon: '🚀', label: 'DRIVE', color: 0x61bb46 }];
  },

  // A new mount flies to the rim point the part is stuck on.
  partTargets: (part, code) => (isAttachment(part.kind) && code === 'mount' ? [{ at: { x: part.x, y: part.y }, size: 0.35 }] : []),

  resultCard: (parts, level, m, outcome, passed) => {
    let outcomeText: string;
    switch (outcome) {
      case 'finished':
        outcomeText = `Reached the beacon in ${m.time.toFixed(1)} s!`;
        break;
      case 'fell':
        outcomeText = 'The rover fell into the crevasse.';
        break;
      case 'stuck':
        outcomeText = `Stuck at ${m.distance.toFixed(1)} m.`;
        break;
      case 'timeout':
        outcomeText = 'Ran out of time.';
        break;
      default:
        outcomeText = '';
    }
    return { title: 'Your rover', rows: buildRows(parts, level), outcome: outcomeText, tone: passed ? 'pass' : 'fail' };
  },

  hud: {
    // Every attachment kind gets a picture and a group, so the whole palette lives on the parts
    // shelf in the (now always open) drawer; `rover`, `block` and `finish` never appear in any
    // level's palette (they are level-placed), so they keep no image and never show anywhere.
    partInfo: (Object.keys(CATALOG) as PartKind[]).reduce(
      (acc, kind) => {
        acc[kind] = {
          label: LABELS[kind],
          icon: ICONS[kind],
          ...(isAttachment(kind)
            ? { image: SHELF_IMAGE[kind as AttachmentKind], group: SHELF_GROUP[kind as AttachmentKind] }
            : {}),
        };
        return acc;
      },
      {} as Record<PartKind, { label: string; icon: string; image?: string; group?: string }>,
    ),
    chipLabels: { cup: 'Suction cup', spring: 'Spring' },
    meters: [
      { id: 'meter-finish', label: 'Finish', metric: 'reachedFinish', format: (v) => (v >= 1 ? 'yes' : 'not yet') },
      { id: 'meter-time', label: 'Time', metric: 'time', format: (v) => `${v.toFixed(1)} s` },
      { id: 'meter-flips', label: 'Flips', metric: 'flips', format: (v) => `${Math.round(v)}` },
      { id: 'meter-distance', label: 'Distance', metric: 'distance', format: (v) => `${v.toFixed(1)} m` },
      { id: 'meter-upside', label: 'Upside down', metric: 'upsideDown', format: (v) => `${v.toFixed(1)} m` },
      { id: 'meter-speed', label: 'Top speed', metric: 'topSpeed', format: (v) => `${v.toFixed(1)} m/s` },
    ],
    goalValueText: (goal, current) => {
      switch (goal.metric) {
        case 'reachedFinish':
          return current >= 1 ? 'yes' : 'not yet';
        case 'time':
          return `${current.toFixed(1)} of ${goal.value.toFixed(1)} s`;
        case 'flips':
          return `${Math.round(current)} of ${Math.round(goal.value)}`;
        case 'distance':
        case 'upsideDown':
          return `${current.toFixed(1)} of ${goal.value.toFixed(1)} m`;
        default:
          return `${current} of ${goal.value}`;
      }
    },
    barlessMetrics: ['reachedFinish'],
    lines: {
      play: 'Drive, rover, drive!',
      pass: 'Kevin made it! What a rover!',
      doneNotPassed: 'The rover stopped. Check the goals, then change your build.',
      freePlay: 'Build any rover you like and roam Marstopia!',
      launch: '▶ DRIVE',
      playAgain: '▶ Drive again',
      reset: '↺ Reset',
      refused: 'Not enough coins! Take a part off first.',
      locked: "Kevin's dome stays put. Build onto it!",
    },
    failOutcomes: ['fell', 'stuck', 'timeout'],
  },
};

