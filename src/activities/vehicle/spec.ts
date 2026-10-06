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
//
// 2026-10-05 playtest review (Jon; Gao agrees): one obvious start control, originally the DRIVE
// button floating over the rover (no bottom-bar Play, `hud.playInBar: false`), and a BUILD button
// over the rover (tapping the dome was not apparent, `idleWidgets`); tap tutorials on the first
// levels (`coach`, coach.ts); a win banner with a clear Next button (`hud.winBanner`); what each
// part does and an unlock moment for the parts a level introduces (`hud.partInfo.blurb`,
// levels.ts `part:<kind>` entries); a live rim-snap preview while dragging (`dragSnap`); the
// spring says what it does (catalog.ts MOUNT_DESCRIPTOR).
//
// 2026-10-05 playtest review, part 2 (Jon via Gao): "Move the DRIVE button back to the bottom,
// but center it" — DRIVE is the kit's own bar Play button again (`hud.lines.launch`/`playAgain`,
// no `hud.playInBar` override), centred and the biggest button in the bar (kit/builder.css); the
// BUILD pill stays the only in-scene idle widget, and the selected-part DRIVE pill is gone (the
// bar handles it everywhere). Every bottom-bar/win/shelf/dash/card surface is reskinned with the
// carnival's plain white box_curved art (kit/builder.css), tinted via CSS mask-border instead of
// solid fills/borders.
import type { CameraFrame, CourseSpec, PlacedPart, RenderItem, Vec2, Widget } from '../../kit/types';
import type { AttachmentKind, Metrics, Outcome, PartKind, VehicleLevel } from './core/types';
import {
  ATTACHMENT_KINDS,
  BLURBS,
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
import { ROVER_R, SPAWN, layoutRover, normalizeRoverParts, rotate, roverTextures, thetaOf } from './core/geometry';
import { VIEW_W, WORLD_W, heightAt } from './core/terrain';
import { createVehicleSim } from './core/sim';
import { LEVELS } from './core/levels';
import { BUILD_WIDGET, roverCoach } from './coach';

/** Building zooms in on the dome (`focusFrame`, the same frame for the dome and every attachment)
 * with the drawer open over the panel's right 340 px (src/kit/builder.css; BuilderHud opens it
 * only while a part is selected). The world panel is 960 x 612 stage px at ppm 32 (WORLD_H *
 * PPM since 2026-10-06, was the kit's default 480: the course has no dash, `hud.goalsOverlay`, so
 * the panel grows upward to y 78; the 10 px earth margin under it is not world view).
 *
 * Fit arithmetic while a part is selected (spec.test.ts checks every level on HUGE_BUILD: a
 * square wheel on a spring under the dome (lifts it highest), a melon on a spring on top (the
 * tallest part), melons on springs at the front and back (the widest), two more sprung wheels):
 *  - At zoom z the view is 960/(32 z) x 612/(32 z) m: 10.714 x 6.830 m at 2.8. The drawer leaves
 *    620/960 of the width uncovered: 6.920 m at 2.8.
 *  - cx wants the dome mid-way across that strip, rover.x + 1.897, but the kit clamps cx >=
 *    15/zoom = 5.357 and every level places the dome at x 3 (levels.ts ROVER_X), so the strip
 *    always runs x 0..6.920. HUGE_BUILD spans rover.x -1.742..+1.742 (x 1.258..4.742).
 *  - The view's bottom sits FOCUS_GROUND_BELOW (0.78 m) under the ground beneath the dome, so cy
 *    = ground + 2.635 and the view runs ground - 0.78 .. ground + 6.050. Until 2026-10-06 (the
 *    480 px panel) cy was ground + 1.9, the same bottom edge: the build sits where it always did
 *    on screen and the taller panel only adds sky above it (where the goals overlay sits).
 *    HUGE_BUILD's dome rests at ground + 1.784 and its melon reaches ground + 3.525, leaving
 *    2.525 m of air above it. The flip level's mesa (ground 9) puts the view's top at 15.05,
 *    under the world's 17.625 (no clamp).
 *  - The selected part's DRIVE pill (DRIVE_SIZE 64 px, budget 202 x 70 px with the pulse, see
 *    `bigPillPx`: 2.259 x 0.786 m at 2.8) sits over the dome: centre ext.y1 + DRIVE_GAP + 0.393 =
 *    ground + 3.998, top ground + 4.391 under the view's top minus FRAME_MARGIN (ground + 6.000),
 *    x 1.870..4.130 inside the strip. `driveButtonAt` falls back to the strip's top-right corner
 *    beside the build if a build ever outgrows that.
 *  - Zoom 2.8 is kept, above the 2.4 tactile-size floor: below it the 0.75 m dome and its
 *    attachments read too small for a child's finger (Jon's tactile-variables rule). */
export const FOCUS_ZOOM = 2.8;
const PPM = 32;
const PANEL_W_PX = 960;
/** The world panel's height (stage px): the whole world's height, 612 (kit view.ts `panelTopY`). */
const PANEL_H_PX = WORLD_H * PPM;
const DRAWER_PX = 340;
/** The selected part's DRIVE pill (stage px tall): smaller than the idle one, so the child can
 * drive straight from the drawer. */
export const DRIVE_SIZE = 64;
/** The idle BUILD and DRIVE pills (stage px tall). DRIVE is the bigger one: the start control. */
export const BUILD_SIZE = 84;
export const IDLE_DRIVE_SIZE = 96;
/** Kodable accent blue (BUILD) and the "go" green (DRIVE). */
export const BUILD_BLUE = 0x05aeed;
export const DRIVE_GREEN = 0x61bb46;
/** World meters between the build's top and the selected DRIVE pill. */
const DRIVE_GAP = 0.08;
const FRAME_MARGIN = 0.05;
/** World meters of ground the focus frame shows under the dome (its view's bottom edge sits this
 * far below the ground there): 0.78, what cy = ground + 1.9 showed on the 480 px panel. */
const FOCUS_GROUND_BELOW = 0.78;
/** The focus frame's centre sits this high above the ground under the dome: half the view's
 * height at FOCUS_ZOOM, less FOCUS_GROUND_BELOW (2.635 m). */
const FOCUS_CY_ABOVE_GROUND = PANEL_H_PX / (2 * PPM * FOCUS_ZOOM) - FOCUS_GROUND_BELOW;

/** A 'big' tap widget is a pill `size` px tall with its icon and a 24 px bold label inside (kit
 * TapWidget.style). The kit sizes it to its content; this course budgets BIG_CONTENT_PX for the
 * icon, the gap and a five-letter label ("BUILD", "DRIVE": about 28 + 8 + 75 px) on top of the
 * pill's rounded ends (`size`), and BIG_PULSE for the soft pulse, so a layout that keeps these
 * boxes clear keeps the drawn pills clear. */
const BIG_CONTENT_PX = 120;
const BIG_PULSE = 1.1;
export function bigPillPx(size: number): { w: number; h: number } {
  return { w: BIG_PULSE * (size + BIG_CONTENT_PX), h: BIG_PULSE * size };
}
function bigPillM(size: number, zoom: number): { w: number; h: number } {
  const px = bigPillPx(size);
  return { w: px.w / (PPM * zoom), h: px.h / (PPM * zoom) };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** The intro pan's length (ms): from the beacon back to the start. */
export const INTRO_MS = 2800;

/** The level's beacon. */
function levelFinish(level: VehicleLevel): PlacedPart<PartKind> | undefined {
  return level.parts.find((p) => p.kind === 'finish');
}

/** A zoom-1 frame (the whole view: VIEW_W x WORLD_H m, the full-panel height) centred on world
 * x `x`, kept inside the world the way the kit clamps it: cx in [VIEW_W / 2, WORLD_W - VIEW_W /
 * 2]; cy shows the panel's full height (y -GROUND_DEPTH .. WORLD_H - GROUND_DEPTH). */
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
 * view is 10.7 x 6.8 m; cx puts the dome mid-way across the part the drawer leaves uncovered
 * (the kit clamps cx >= 15 / zoom, so a dome at x 3 sits a little left of that); cy leaves
 * ~0.8 m of ground under the wheels and room for the DRIVE pill over a part on top. */
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

/** The world rectangle a frame shows, clamped the way the kit's camera clamps it (kit camera.ts
 * `clampFrame`: the view stays inside x 0..WORLD_W and y -GROUND_DEPTH..WORLD_H - GROUND_DEPTH),
 * and with `drawer` only the part left of the open drawer. */
export function frameView(frame: CameraFrame, drawer: boolean): { x0: number; x1: number; y0: number; y1: number } {
  const viewW = PANEL_W_PX / (PPM * frame.zoom);
  const viewH = PANEL_H_PX / (PPM * frame.zoom);
  const cx = clamp(frame.cx, viewW / 2, WORLD_W - viewW / 2);
  const cy = clamp(frame.cy, -GROUND_DEPTH + viewH / 2, WORLD_H - GROUND_DEPTH - viewH / 2);
  const x0 = cx - viewW / 2;
  const w = drawer ? (viewW * (PANEL_W_PX - DRAWER_PX)) / PANEL_W_PX : viewW;
  return { x0, x1: x0 + w, y0: cy - viewH / 2, y1: cy + viewH / 2 };
}

/** The selected part's DRIVE pill (world centre): over the build, centred on the dome, when it
 * fits under the build frame's top edge (every build of every level, see the fit arithmetic);
 * otherwise in the top-right corner of the strip left of the drawer, beside the build. */
export function driveButtonAt(parts: PlacedPart<PartKind>[], level: VehicleLevel): Vec2 | null {
  const rover = parts.find((p) => p.kind === 'rover');
  const ext = buildExtent(parts, level);
  const frame = buildFrame(level);
  if (!rover || !ext || !frame) return null;
  const view = frameView(frame, true);
  const { w, h } = bigPillM(DRIVE_SIZE, FOCUS_ZOOM);
  const top = view.y1 - FRAME_MARGIN;
  const xMin = view.x0 + FRAME_MARGIN + w / 2;
  const xMax = view.x1 - FRAME_MARGIN - w / 2;
  const above = ext.y1 + DRIVE_GAP + h / 2;
  if (above + h / 2 <= top) return { x: clamp(rover.x, xMin, xMax), y: above };
  return { x: Math.min(xMax, ext.x1 + DRIVE_GAP + w / 2), y: top - h / 2 };
}

/** World meters between the build (or the ground) and the idle pills, between the two pills,
 * and between the pills and the view's edges. */
const IDLE_GAP = 0.4;
const IDLE_PILL_GAP = 0.75;
const IDLE_MARGIN = 0.15;

/** The highest ground (m) anywhere in x0..x1. */
function groundTop(terrain: Vec2[], x0: number, x1: number): number {
  let top = Math.max(heightAt(terrain, x0), heightAt(terrain, x1));
  for (const p of terrain) if (p.x > x0 && p.x < x1) top = Math.max(top, p.y);
  return top;
}

/** Where the idle BUILD and DRIVE pills go (world centres), shown while NOTHING is selected. The
 * drawer is closed then and the camera rests on the zoom-1 view (x 0..30, y -1.5..17.625; kit
 * `fullFrame`, or the intro pan's `to` frame, the same one), where a pill is big in world terms:
 * BUILD (84 px) budgets 224 x 92 px = 7.0 x 2.9 m, DRIVE (96 px) 238 x 106 px = 7.4 x 3.3 m.
 *  - One row, BUILD then DRIVE to its right (toward the beacon), IDLE_PILL_GAP apart. BUILD is
 *    centred over the dome, nudged right only as far as the view's left edge needs (a dome at
 *    x 3 puts it at x 3.66, spanning 0.15..7.16; DRIVE at 11.63 spans 7.91..15.34).
 *  - The row's bottom sits IDLE_GAP over the build's top AND over the highest ground under the
 *    row (the power level's 2.5 m crater rim at x 10..16 is under DRIVE), so the pills never
 *    cover the build or the obstacle. HUGE_BUILD on flat ground: build top 3.525, row centre
 *    5.575, row top 7.225 of the view's 17.625. On the flip level's 9 m mesa: build top 12.525,
 *    row top 16.238 (it fitted only beside the build in the 13.5 m view before 2026-10-06).
 *  - When the row does not fit over the build (no level's build does any more), both pills move
 *    to the right of the build at the top of the view. */
export function idleButtonsAt(parts: PlacedPart<PartKind>[], level: VehicleLevel): { build: Vec2; drive: Vec2 } | null {
  const rover = parts.find((p) => p.kind === 'rover');
  const ext = buildExtent(parts, level);
  if (!rover || !ext) return null;
  const view = frameView(viewFrameAt(rover.x), false);
  const b = bigPillM(BUILD_SIZE, 1);
  const d = bigPillM(IDLE_DRIVE_SIZE, 1);
  const h = Math.max(b.h, d.h);
  const pitch = b.w / 2 + IDLE_PILL_GAP + d.w / 2;
  const top = view.y1 - IDLE_MARGIN - h / 2;
  let x = clamp(rover.x, view.x0 + IDLE_MARGIN + b.w / 2, view.x1 - IDLE_MARGIN - d.w / 2 - pitch);
  let y = Math.max(ext.y1, groundTop(level.terrain, x - b.w / 2, x + pitch + d.w / 2)) + IDLE_GAP + h / 2;
  if (y > top) {
    x = ext.x1 + IDLE_GAP + b.w / 2;
    y = top;
  }
  return { build: { x, y }, drive: { x: x + pitch, y } };
}

/** `CourseSpec.dragSnap`: an attachment's ghost sits on the rim point it will snap to on release
 * (normalizeParts' rule: the direction from the dome's centre to the pointer, in 5 degree
 * notches); anything else follows the pointer. */
export function rimSnap(part: PlacedPart<PartKind>, at: Vec2, parts: PlacedPart<PartKind>[]): Vec2 {
  if (!isAttachment(part.kind)) return at;
  const rover = parts.find((p) => p.kind === 'rover');
  if (!rover) return at;
  const theta = thetaOf(at, rover);
  return { x: rover.x + ROVER_R * Math.cos(theta), y: rover.y + ROVER_R * Math.sin(theta) };
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
  rows.push({ label: 'Coins', value: level.budget !== undefined ? `${coins} of ${level.budget}` : `${coins}` });
  return rows;
}

const FILL = (item: RenderItem): { color: number; alpha: number } => ({ color: item.color, alpha: item.alpha ?? 1 });

/** The Mars sky picture (public/bg/mars-sky-wide.jpg, 7200 x 1300 px): its aspect, and its height
 * in world meters (the whole world's height plus the ground band under y = 0). */
const SKY_ASPECT = 7200 / 1300;
const SKY_H = WORLD_H + GROUND_DEPTH;

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
  // While dragging, the ghost lands where normalizeParts will put the part (a clear landing).
  dragSnap: (part, at, parts) => rimSnap(part, at, parts),
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
      // The whole world tall, extended down to -GROUND_DEPTH so the picture covers the sky below
      // y = 0 too. mars-sky-wide.jpg is mars-sky.jpg three times over (7200 x 1300 px, each copy
      // cross-faded into the next over 300 px, so there is no seam). Its aspect matched the old
      // 90 x 16.5 m world; since the world grew to 19.125 m (2026-10-06) the picture keeps that
      // aspect (SKY_ASPECT, nothing stretched, the round glows stay round) and so runs past the
      // world's right end (x 0..114.2), which the camera never shows.
      { url: 'bg/mars-sky-wide.jpg', x: (SKY_H * SKY_ASPECT) / 2, y: WORLD_H / 2 - GROUND_DEPTH / 2, w: SKY_H * SKY_ASPECT, h: SKY_H },
      // The planet hangs over the start, in the first view.
      { url: 'bg/mars-planet.png', x: 24, y: 11.5, w: 3.2, h: 3.2 },
    ],
  },

  // The drawer shows the parts shelf and the selected part's Mount row (suction cup / spring
  // pictures); it opens only while a part is selected (BUILD selects the dome). Every part
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

  // Nothing selected: BUILD over the dome (selects it, which opens the drawer and its parts
  // shelf) is the only in-scene widget now (2026-10-05 playtest review, part 2: "Move the DRIVE
  // button back to the bottom, but center it" — the bar's own Play button is DRIVE, see
  // `hud.lines.launch`/`playInBar` below). `idleButtonsAt` still computes a `drive` slot (its
  // geometry math and tests are untouched), it is just no longer turned into a widget here.
  idleWidgets: (parts, level): Widget[] => {
    const rover = parts.find((p) => p.kind === 'rover');
    const at = idleButtonsAt(parts, level);
    if (!rover || !at) return [];
    return [
      { kind: 'tap', id: BUILD_WIDGET, style: 'big', action: 'select', partId: rover.id, at: at.build, size: BUILD_SIZE, icon: '🔧', label: 'BUILD', color: BUILD_BLUE },
    ];
  },

  // The dome or any part on it selected: no in-scene DRIVE any more (the bar's Play button, now
  // centred, handles it — `driveButtonAt` stays as dead-but-tested geometry for now).
  widgets: (): Widget[] => [],

  // Tap tutorials on the five intro levels (coach.ts).
  coach: roverCoach,

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
            ? { image: SHELF_IMAGE[kind], group: SHELF_GROUP[kind], blurb: BLURBS[kind] }
            : {}),
        };
        return acc;
      },
      {} as Record<PartKind, { label: string; icon: string; image?: string; group?: string; blurb?: string }>,
    ),
    // No chipLabels: the Mount options' own labels are what the drawer should show
    // ("Mount · Spring (bouncy, +1 coin)", catalog.ts MOUNT_DESCRIPTOR).
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
      playAgain: '▶ DRIVE again',
      reset: '↺ Reset',
      refused: 'Not enough coins for that part!',
      locked: "Kevin's dome stays put. Build onto it!",
    },
    failOutcomes: ['fell', 'stuck', 'timeout'],
    // 2026-10-05 playtest review, part 2 (Jon via Gao): "Move the DRIVE button back to the
    // bottom, but center it" — back to the kit's own bar Play button (now centred, see
    // kit/builder.css), no course-level override.
    winBanner: true,
    // The six meters as a small translucent panel over the scene's top-right, only while driving.
    metersOverlay: true,
    // 2026-10-06: no dash. The goals sit in a small translucent panel over the scene's top-left
    // (the result card under them once the run ends) and the world panel takes the dash's room
    // (core/build.ts WORLD_H). Fine without the dash: the drawer holds every part's options and
    // no part has stat bars.
    goalsOverlay: true,
  },
};

