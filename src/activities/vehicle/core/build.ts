// Turns placed parts into Rapier bodies, joints and the RenderItems the scene draws: the level's
// terrain (kept from 2026-09-22: the under layer, the rust crust that hugs the surface, a dark
// chasm per gap), the walls, the rover (the dome with Kevin inside plus every attachment the
// child stuck on it), the boulder and the finish beacon. The old two-wheel buggy lives on in
// buggy.ts for the Bridge course, which builds it through `buildPart`.
import { PICS, ROVER_R } from './art';
import { buildBuggy, VEHICLE_FILTER } from './buggy';
import {
  PART_SPRING_DAMPING,
  ROVER_FRICTION,
  ROVER_MASS,
  SPRING_HZ,
  SPRING_TRAVEL,
  WHEEL_SPRING_DAMPING,
  isPower,
  isWheel,
} from './catalog';
import { layoutRover, roverPictures } from './geometry';
import type { AttachmentGeometry, PictureItem } from './geometry';
import { GROUND_DIR, ROCK_PICS, groundPictures } from './art';
import { SURFACES, surfaceRuns } from './surfaces';
import type { Rock, SurfaceKind, SurfaceRange } from './surfaces';
import { WORLD_W, bandPolygons, clipProfile, crustPolygons, findGaps, heightAt, nearGap, terrainPolygon, withoutRocks } from './terrain';
import type { BodyId, Bounds, JointId, PartHandle, PlacedPart, RenderItem, RoverPart, Shape, Transform, Vec2 } from './types';
import type { PhysicsWorld } from '../../../physics/types';

export { VEHICLE_FILTER };

/** The world is WORLD_W (90 m, terrain.ts) wide since 2026-10-05; the panel shows a 30 m window
 * of it and the kit scrolls. 19.125 m tall since 2026-10-06 (was 15): the course has no dash
 * (spec.ts `hud.goalsOverlay`), so the kit's panel grows upward into its room. At ppm 32 that is
 * 612 px, the panel's top at stage y 690 - 612 = 78 (where the dash started, 6 px under the top
 * bar; kit view.ts `panelTopY`). Every level keeps its ground where it was: the extra height is
 * all sky. */
export { WORLD_W };
export const WORLD_H = 19.125;
/** Meters of ground the kit shows below world y = 0 (`WorldSpec.groundDepth` in spec.ts - keep
 * this in sync with that value). `buildTerrain`'s darker "under" layer closes at this depth
 * instead of the rust top layer's thin 0.3 m crust, so it covers the kit's whole ground band
 * (see `terrainPolygon`'s doc comment for why that also keeps a pit reading as a real hole). */
export const GROUND_DEPTH = 1.5;
/** How deep (m) the drawn ground (the under layer and the chasms) actually reaches: past
 * GROUND_DEPTH, through the 10 px earth margin the kit's panel keeps under the world view
 * (`PANEL_Y_MARGIN`, 0.31 m at ppm 32). 2026-10-09: the planets' skies are light at the horizon
 * (Flooftopia's pale blue, Mars's tan), and a ground that stopped at GROUND_DEPTH let that sky show
 * as a light strip along the panel's bottom edge (the old night sky hid it). */
export const GROUND_FILL_DEPTH = GROUND_DEPTH + 0.5;

const TERRAIN_COLOR = 0xb5532e; // rust
const TERRAIN_UNDER_COLOR = 0x8a3c1f; // darker rock layer, filling down to GROUND_FILL_DEPTH
// Deep shadow fill for a gap/pit's chasm (see `findGaps`): drawn over the kit's own ground band
// (`WorldSpec.groundDepth`) so a hole still reads as an open hole where the top/under layers
// above degenerate to zero height across it (see `terrainPolygon`'s doc comment).
const CHASM_COLOR = 0x1a0d14;
const FINISH_COLOR = 0x05aeed; // beacon
const BOULDER_COLOR = 0x8a6a5a;
// Fallback fills, used only if a picture failed to load.
const DOME_COLOR = 0xcfe8f5;
const KEVIN_COLOR = 0x7fd3f7;
const WHEEL_COLOR = 0x3a3f4b;
const POWER_COLOR = 0xd0d4dc;
const WEIGHT_COLOR = 0x6aa84f;
const MOUNT_COLOR = 0xe0392f;
const SHADOW_COLOR = 0x000000;

/** partId used for the terrain's synthetic RenderItem (no placed part owns it). */
export const TERRAIN_PART_ID = -1;
/** partId of the rover's ground shadow (drawn only; no part owns it). */
export const SHADOW_PART_ID = -3;

function boxBounds(x: number, y: number, w: number, h: number): Bounds {
  return { x, y, w, h };
}

// ---- terrain and walls ------------------------------------------------------------------

/** What each kind of ground looks like (2026-10-09): the 0.3 m crust along the surface and the
 * darker under layer down to GROUND_FILL_DEPTH. Rock is the course's old rust (Mars); grass is green
 * turf (`GRASS_BAND` of it) over brown soil; sand is pale tan-orange with ripples; ice is pale
 * blue-white with a glossy line and cracks over a deep blue. */
export const GROUND_COLORS: Record<SurfaceKind, { crust: number; under: number }> = {
  grass: { crust: 0x8d5a34, under: 0x6b4226 },
  rock: { crust: TERRAIN_COLOR, under: TERRAIN_UNDER_COLOR },
  sand: { crust: 0xe2a868, under: 0xc0844a },
  ice: { crust: 0xe4f4fc, under: 0x5d9fd0 },
};
const GRASS_COLOR = 0x6cc04a;
const GRASS_LIGHT = 0x8ed468;
const GRASS_TUFT = 0x5fb043;
/** Meters of green turf over the soil. */
export const GRASS_BAND = 0.16;
const SAND_LIGHT = 0xefc185;
const SAND_RIPPLE = 0xc98d52;
const ICE_GLOSS = 0xffffff;
const ICE_CRACK = 0x8fc3e0;
/** A rock's fill if its picture failed to load. */
const ROCK_COLOR = 0x9a4a2c;
/** How deep (m) a rock picture reaches under the ground around it: the rock stands IN the sand. */
export const ROCK_EMBED = 0.1;

/** The ground a level is built on: its surface runs (surfaces.ts `surfaceRuns`; absent = all rock,
 * the course's ground before 2026-10-09) and the rocks standing in it. `drawRuns` are the runs
 * the ground is DRAWN with (default `runs`): `levelGround` leaves the rocks' own rock ranges out of
 * them, so the sand runs on under a rock and the rock's picture stands in it, instead of a rock
 * column reaching down through the sand. */
export interface GroundOptions {
  runs?: SurfaceRange[];
  drawRuns?: SurfaceRange[];
  rocks?: readonly Rock[];
  /** The planet's own ground: a run of another kind (sand on a Mars mesa, a rock road on Europa)
   * is drawn as a layer GROUND_FILL_DEPTH thick over this ground's under colour, not as a column
   * of its own colour down to the fill depth (2026-10-09: sand on a cliff top read as a pillar). */
  base?: SurfaceKind;
}

/** Small deterministic hash in [0, 1) for decoration jitter (no Math.random: the same level
 * always draws the same tufts and cracks). */
function jitter(i: number, salt: number): number {
  let h = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

function terrainItem(body: BodyId, vertices: Vec2[], color: number, alpha?: number): RenderItem {
  return {
    partId: TERRAIN_PART_ID,
    body,
    shape: { kind: 'polygon', vertices },
    color,
    ...(alpha !== undefined ? { alpha } : {}),
    role: 'terrain',
    locked: true,
    lockPosition: true,
  };
}

/** Surface detail for one run of ground (drawn over its crust): turf and tufts on grass, a light
 * edge and ripples in sand, a glossy line and cracks in ice. Rock gets none (the old look). */
function surfaceDetail(body: BodyId, kind: SurfaceKind, sub: Vec2[], profile: Vec2[], from: number, to: number): RenderItem[] {
  const out: RenderItem[] = [];
  const x0 = Math.max(0, from);
  const x1 = Math.min(WORLD_W, to);
  if (x1 - x0 < 0.05) return out;
  const salt = Math.round(from * 100);
  if (kind === 'grass') {
    for (const v of bandPolygons(sub, 0, GRASS_BAND)) out.push(terrainItem(body, v, GRASS_COLOR));
    for (const v of bandPolygons(sub, 0, 0.035)) out.push(terrainItem(body, v, GRASS_LIGHT));
    // Tufts of three blades every ~0.8 m, skipped on steep ground and at a gap's lip.
    for (let i = 0, x = x0 + 0.3; x < x1 - 0.2; i++, x += 0.6 + 0.5 * jitter(i, salt)) {
      const slope = (heightAt(profile, x + 0.1) - heightAt(profile, x - 0.1)) / 0.2;
      if (Math.abs(slope) > 0.8 || nearGap(profile, x, 0.3)) continue;
      const y = heightAt(profile, x) - 0.01;
      const h = 0.09 + 0.07 * jitter(i, salt + 1);
      const w = 0.07 + 0.04 * jitter(i, salt + 2);
      out.push(terrainItem(body, [
        { x: x - w, y },
        { x: x - w * 0.9, y: y + h * 0.75 },
        { x: x - w * 0.35, y: y + h * 0.3 },
        { x: x, y: y + h },
        { x: x + w * 0.35, y: y + h * 0.3 },
        { x: x + w * 0.95, y: y + h * 0.7 },
        { x: x + w, y },
      ], GRASS_TUFT));
    }
  } else if (kind === 'sand') {
    for (const v of bandPolygons(sub, 0, 0.035)) out.push(terrainItem(body, v, SAND_LIGHT));
    // Wind ripples on the surface: low humps, gentle on the windward side, steep on the lee.
    for (let i = 0, x = x0 + 0.1; x < x1 - 0.4; i++, x += 0.3 + 0.2 * jitter(i, salt)) {
      const len = 0.22 + 0.12 * jitter(i, salt + 7);
      if (nearGap(profile, x + len / 2, len)) continue;
      const h = 0.03 + 0.02 * jitter(i, salt + 8);
      out.push(terrainItem(body, [
        { x, y: heightAt(profile, x) - 0.01 },
        { x: x + 0.65 * len, y: heightAt(profile, x + 0.65 * len) + h },
        { x: x + len, y: heightAt(profile, x + len) - 0.01 },
      ], SAND_LIGHT));
    }
    // Ripple lines in the crust: long faint wavy streaks, staggered at different depths.
    for (let i = 0, x = x0 + 0.2; x < x1 - 0.6; i++, x += 1.1 + 0.9 * jitter(i, salt)) {
      const len = 0.9 + 0.9 * jitter(i, salt + 3);
      const end = Math.min(x1, x + len);
      if (nearGap(profile, (x + end) / 2, len)) continue;
      const depth = 0.08 + 0.15 * jitter(i, salt + 4);
      out.push(terrainItem(body, wavyBand(profile, x, end, depth, 0.02, 0.012, 0.45, i), SAND_RIPPLE, 0.55));
    }
  } else if (kind === 'ice') {
    for (const v of bandPolygons(sub, 0.025, 0.05)) out.push(terrainItem(body, v, ICE_GLOSS, 0.85));
    // Cracks: thin zig-zag slivers from just under the surface down into the blue, every ~2.4 m.
    for (let i = 0, x = x0 + 0.8; x < x1 - 0.3; i++, x += 1.6 + 1.6 * jitter(i, salt)) {
      if (nearGap(profile, x, 0.3)) continue;
      const top = heightAt(profile, x) - 0.06;
      const len = 0.45 + 0.6 * jitter(i, salt + 5);
      const lean = (jitter(i, salt + 6) - 0.5) * 0.3;
      const pts: Vec2[] = [];
      const steps = 4;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const zig = (k % 2 === 0 ? -1 : 1) * 0.05 * (1 - t) * (k === 0 ? 0 : 1);
        pts.push({ x: x + lean * t + zig, y: top - len * t });
      }
      const half = (k: number): number => 0.018 * (1 - k / (steps + 1));
      out.push(terrainItem(body, [
        ...pts.map((p, k) => ({ x: p.x - half(k), y: p.y })),
        ...[...pts].reverse().map((p, j) => ({ x: p.x + half(steps - j), y: p.y })),
      ], ICE_CRACK, 0.9));
    }
  }
  return out;
}

/** A thin wavy ribbon `depth` m under the surface from x0 to x1 (a sand ripple line): its top
 * edge waves by `amp` over `wavelength`, `thickness` thick, its ends tapered. */
function wavyBand(profile: Vec2[], x0: number, x1: number, depth: number, thickness: number, amp: number, wavelength: number, phase: number): Vec2[] {
  const n = Math.max(2, Math.ceil((x1 - x0) / 0.08));
  const top: Vec2[] = [];
  const bottom: Vec2[] = [];
  for (let k = 0; k <= n; k++) {
    const x = x0 + ((x1 - x0) * k) / n;
    const taper = Math.sin((Math.PI * k) / n);
    const y = heightAt(profile, x) - depth + amp * Math.sin((2 * Math.PI * (x - x0)) / wavelength + phase);
    top.push({ x, y });
    bottom.push({ x, y: y - thickness * taper });
  }
  return [...top, ...bottom.reverse()];
}

/** One rock standing in the ground: its picture over its lump of terrain (`withRocks` raised the
 * lump; this only draws it), a little wider than the lump and reaching ROCK_EMBED under `ground`
 * (the drawn ground, lumps taken out), so the rock stands in the sand. Picture `index % 3`. */
function rockItem(body: BodyId, ground: Vec2[], r: Rock, index: number): RenderItem {
  const base = heightAt(ground, r.x);
  const top = base + r.h + 0.03;
  const bottom = base - ROCK_EMBED;
  const pic = ROCK_PICS[index % ROCK_PICS.length]!;
  return {
    partId: TERRAIN_PART_ID,
    body,
    shape: { kind: 'box', w: r.w * 1.12, h: top - bottom, cx: r.x, cy: (top + bottom) / 2 },
    color: ROCK_COLOR,
    role: 'terrain',
    locked: true,
    lockPosition: true,
    textureKey: pic.key,
  };
}

/** Texture keys for the ground pictures (`CourseSpec.textures`): the rocks and the wheel effects
 * (sand puff, sand berm, ice chips; sim.ts draws those as overlay sprites). */
export function groundTextures(): Record<string, { url: string }> {
  const out: Record<string, { url: string }> = {};
  for (const p of groundPictures()) out[p.key] = { url: `${GROUND_DIR}${p.file}` };
  return out;
}

/** Static chain body carrying the level's ground profile, plus the filled polygon RenderItems
 * the scene draws it as: a darker "under" layer (the same silhouette, but closed all the way down
 * at `GROUND_FILL_DEPTH`, just past GROUND_DEPTH, instead of the crust's 0.3 m, so it fills the
 * kit's whole below-ground band
 * for a layered-rock look, and still degenerates to nothing across a pit/gap - see
 * `terrainPolygon`'s doc comment) painted first, then the rust top "crust" (one 0.3 m-thick
 * polygon per contiguous run of real terrain, `crustPolygons` - it hugs the surface everywhere,
 * including below y = 0, e.g. a jump's lower landing, instead of closing at a fixed absolute
 * depth), then one chasm visual per gap (`findGaps`): the under layer and the crust both draw
 * NOTHING across a gap's x-range (there is no real surface there for either to follow/close
 * against), which would otherwise let the kit's own ground band show through and hide the hole -
 * except the kit draws no band at all here (`WorldSpec.groundBand: false`), so without the chasm
 * the hole would show bare sky instead. Each chasm visual is a dark quad from the gap's own lips
 * (its real height just outside the gap on each side, which may differ - e.g. a ramp's takeoff
 * lip vs. a lower landing) down past the panel bottom (`-GROUND_FILL_DEPTH`), so it fills the gap without
 * covering any real terrain on either side. It carries no collider: it reuses this same static
 * body purely for its RenderItem, adding no shape, so physics/colliders are unchanged.
 *
 * 2026-10-09 (planets and surfaces): `ground.runs` splits the ground into stretches of grass,
 * rock, sand and ice (surfaces.ts). Each run gets its own chain collider (with that surface's
 * ground friction; neighbouring chains share their end point) and its own under/crust colours
 * (`GROUND_COLORS`) plus surface detail; `ground.rocks` adds a rock picture per rock. Without runs
 * (or with one rock run, e.g. any Mars level without `surfaces`) the colliders and items are
 * exactly the old ones: one chain at friction 0.8, the under layer, the rust crust, the chasms. */
export function buildTerrain(world: PhysicsWorld, profile: Vec2[], ground: GroundOptions = {}): { body: BodyId; items: RenderItem[] } {
  const body = world.createBody({ type: 'static', position: { x: 0, y: 0 } });
  const first = profile[0]!.x;
  const last = profile[profile.length - 1]!.x;
  const allRock = [{ from: first, to: last, kind: 'rock' as SurfaceKind }];
  const piecesOf = (prof: Vec2[], runs: SurfaceRange[]): { run: SurfaceRange; sub: Vec2[] }[] =>
    runs.length === 1 ? [{ run: runs[0]!, sub: prof }] : runs.map((run) => ({ run, sub: clipProfile(prof, run.from, run.to) }));
  const runs = ground.runs && ground.runs.length > 0 ? ground.runs : allRock;
  for (const { run, sub } of piecesOf(profile, runs)) {
    world.addShape(body, { kind: 'chain', vertices: sub }, { friction: SURFACES[run.kind].groundFriction });
  }
  // The drawing: the ground around the rocks (their lumps taken out, `withoutRocks`), in the
  // drawn runs, only over the world (x 0..WORLD_W; a run wholly outside it draws nothing).
  const rocks = ground.rocks ?? [];
  const drawProfile = rocks.length > 0 ? withoutRocks(profile, rocks) : profile;
  const drawRuns = ground.drawRuns && ground.drawRuns.length > 0 ? ground.drawRuns : runs;
  const pieces = piecesOf(drawProfile, drawRuns);
  const drawn = pieces.filter(({ run }) => run.to > 0 && run.from < WORLD_W);
  const single = pieces.length === 1;
  const base = ground.base;
  const underItems = drawn.flatMap(({ run, sub }) => {
    const fill = single ? terrainPolygon(sub, GROUND_FILL_DEPTH) : terrainPolygon(sub, GROUND_FILL_DEPTH, Math.max(0, run.from), Math.min(WORLD_W, run.to));
    if (single || base === undefined || run.kind === base) return [terrainItem(body, fill, GROUND_COLORS[run.kind].under)];
    // On flat ground (surface at y 0) the layer ends exactly at the fill depth, so it looks as before.
    return [
      terrainItem(body, fill, GROUND_COLORS[base].under),
      ...bandPolygons(sub, 0, GROUND_FILL_DEPTH).map((v) => terrainItem(body, v, GROUND_COLORS[run.kind].under)),
    ];
  });
  const topItems = drawn.flatMap(({ run, sub }) => crustPolygons(sub).map((v) => terrainItem(body, v, GROUND_COLORS[run.kind].crust)));
  const detailItems = drawn.flatMap(({ run, sub }) => surfaceDetail(body, run.kind, sub, drawProfile, run.from, run.to));
  const rockItems = rocks.map((r, i) => rockItem(body, drawProfile, r, i));
  // The chasm's top is flat at the LOWER lip: above it, between a ramp's takeoff lip and a lower
  // landing, is open air the rover flies through, not rock in shadow.
  const chasmItems: RenderItem[] = findGaps(profile).map((gap) =>
    terrainItem(
      body,
      [
        { x: gap.x0, y: Math.min(gap.y0, gap.y1) },
        { x: gap.x1, y: Math.min(gap.y0, gap.y1) },
        { x: gap.x1, y: -GROUND_FILL_DEPTH },
        { x: gap.x0, y: -GROUND_FILL_DEPTH },
      ],
      CHASM_COLOR,
    ),
  );
  return { body, items: [...underItems, ...topItems, ...detailItems, ...rockItems, ...chasmItems] };
}

/** The ground of a level, for `buildTerrain`: its `surfaces` over its planet's ground, across the
 * whole profile, for the colliders; for the drawing, the same without the rocks' own rock ranges
 * (surfaces.ts `rockRanges`, which levels/shared.ts `level()` appends for every rock). */
export function levelGround(profile: Vec2[], surfaces: readonly SurfaceRange[] | undefined, ground: SurfaceKind, rocks?: readonly Rock[]): GroundOptions {
  const x0 = profile[0]!.x;
  const x1 = profile[profile.length - 1]!.x;
  const lumps = rocks ?? [];
  const isLump = (r: SurfaceRange): boolean =>
    r.kind === 'rock' && lumps.some((k) => Math.abs(r.from - (k.x - k.w / 2)) < 1e-9 && Math.abs(r.to - (k.x + k.w / 2)) < 1e-9);
  return {
    base: ground,
    runs: surfaceRuns(surfaces, ground, x0, x1),
    ...(lumps.length > 0 ? { drawRuns: surfaceRuns(surfaces?.filter((r) => !isLump(r)), ground, x0, x1), rocks: lumps } : {}),
  };
}

/** Static walls just past the play field, at x -0.5 and WORLD_W + 0.5 (no visuals). */
export function buildWalls(world: PhysicsWorld): BodyId[] {
  const walls: BodyId[] = [];
  for (const x of [-0.5, WORLD_W + 0.5]) {
    const wall = world.createBody({ type: 'static', position: { x, y: WORLD_H / 2 } });
    world.addShape(wall, { kind: 'box', halfWidth: 0.5, halfHeight: WORLD_H / 2 });
    walls.push(wall);
  }
  return walls;
}

// ---- render-item bounds ----------------------------------------------------------------------

/** World-space corners of one RenderItem drawn at its body's transform `t`. */
function itemPoints(shape: Shape, t: Transform): Vec2[] {
  const c = Math.cos(t.angle);
  const s = Math.sin(t.angle);
  const toWorld = (p: Vec2): Vec2 => ({ x: t.position.x + c * p.x - s * p.y, y: t.position.y + s * p.x + c * p.y });
  if (shape.kind === 'polygon') return shape.vertices.map(toWorld);
  const cx = shape.cx ?? 0;
  const cy = shape.cy ?? 0;
  if (shape.kind === 'circle') {
    const centre = toWorld({ x: cx, y: cy });
    return [
      { x: centre.x - shape.r, y: centre.y - shape.r },
      { x: centre.x + shape.r, y: centre.y + shape.r },
    ];
  }
  const hw = shape.w / 2;
  const hh = shape.h / 2;
  return [
    { x: cx - hw, y: cy - hh },
    { x: cx + hw, y: cy - hh },
    { x: cx + hw, y: cy + hh },
    { x: cx - hw, y: cy + hh },
  ].map(toWorld);
}

/** The axis-aligned box around `items`, each drawn at its body's transform from `transformOf`.
 * Used for a part's edit-mode hit box. */
export function itemsBounds(items: RenderItem[], transformOf: (body: BodyId) => Transform): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of items) {
    for (const p of itemPoints(item.shape, transformOf(item.body))) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

// ---- the rover --------------------------------------------------------------------------------

/** One attachment as built: its part handle plus what the sim drives. */
export interface AttachmentHandle extends PartHandle {
  geometry: AttachmentGeometry;
  /** The wheel, the propulsion box, or the plate + weight. */
  main: BodyId;
  /** Wheels: the revolute joint the motor drives, and the body it turns against (the dome, or
   * the axle on a spring). */
  wheelJoint?: JointId;
  wheelParent?: BodyId;
  /** Spring mounts: the prismatic spring joint. */
  spring?: JointId;
}

export interface RoverBuild {
  /** The dome's own handle (Kevin and the glass on one body). */
  rover: PartHandle;
  roverBody: BodyId;
  attachments: AttachmentHandle[];
  /** Kinematic, shapeless body carrying the ground shadow; the sim keeps it under the dome. */
  shadowBody: BodyId;
  shadowItem: RenderItem;
}

/** Dome density (kg/m^2) for ROVER_MASS. */
export const ROVER_DENSITY = ROVER_MASS / (Math.PI * ROVER_R * ROVER_R);
/** The shadow picture's drawn width (m), on the ground under the dome, its centre SHADOW_LIFT
 * above the ground. (A body-borne picture, not an overlay sprite: overlay sprites draw over every
 * part, and the shadow belongs under the wheels.) */
export const SHADOW_W = 2;
export const SHADOW_LIFT = 0.02;
/** The light axle (wheel on a spring) and slider (propulsion/weight on a spring) bodies. */
const AXLE_R = 0.08;
const AXLE_DENSITY = 10;
const SLIDER_R = 0.05;
const SLIDER_DENSITY = 10;
/** The cosmetic body that carries a suction cup / spring picture, welded to the dome. */
const MOUNT_BODY_R = 0.03;

function pictureItem(partId: number, body: BodyId, pic: PictureItem, role: string, color: number, part: RoverPart): RenderItem {
  return {
    partId,
    body,
    shape: pic.shape,
    color,
    role,
    locked: !!part.locked,
    lockPosition: !!part.lockPosition,
    textureKey: pic.key,
  };
}

function roleOf(kind: string): 'wheel' | 'power' | 'weight' {
  if (isWheel(kind)) return 'wheel';
  if (isPower(kind)) return 'power';
  return 'weight';
}

const COLOR_BY_ROLE = { wheel: WHEEL_COLOR, power: POWER_COLOR, weight: WEIGHT_COLOR };

/** Builds the dome (at `layout`'s rest height, from `normalizeParts`) and every attachment on
 * it. Every collider is in the vehicle collision group, so the rover's own parts never collide
 * with each other or with the dome. Joints per attachment:
 *  - wheel, suction cup: a revolute joint (the motor) between the dome and the wheel;
 *  - wheel, spring: a prismatic spring along the outward axis between the dome and a light axle
 *    body, and the revolute wheel joint on the axle;
 *  - propulsion / weight, suction cup: a weld to the dome;
 *  - propulsion / weight, spring: a prismatic spring between the dome and a light slider body,
 *    and the part welded to the slider. (Rapier's prismatic joint keeps the two bodies at the
 *    same angle, so the part, turned to face out of the dome, needs that slider in between.)
 * The suction cup / spring picture rides a tiny sensor body welded to the dome at the rim point
 * (turned to the attachment frame), so it stays on the rim while the part bounces. Returns null
 * when there is no dome. */
export function buildRover(world: PhysicsWorld, parts: RoverPart[], terrain: Vec2[]): RoverBuild | null {
  const layout = layoutRover(parts, terrain);
  if (!layout) return null;
  const { rover } = layout;
  const roverBody = world.createBody({
    type: 'dynamic',
    position: { x: rover.x, y: rover.y },
    linearDamping: 0.1,
    canSleep: false,
  });
  world.addShape(
    roverBody,
    { kind: 'circle', radius: ROVER_R },
    { density: ROVER_DENSITY, friction: ROVER_FRICTION, filter: VEHICLE_FILTER },
  );
  const origin: Vec2 = { x: rover.x, y: rover.y };
  const at = (local: Vec2): Vec2 => ({ x: origin.x + local.x, y: origin.y + local.y });

  const attachments: AttachmentHandle[] = layout.attachments.map(({ part, geometry: g }) => {
    const role = roleOf(part.kind);
    const bodies: { id: BodyId; role: string }[] = [];
    const joints: JointId[] = [];
    const visuals: RenderItem[] = [];

    // The suction cup / spring picture first, so the part is drawn over its end.
    if (g.mountPicture) {
      const mountBody = world.createBody({ type: 'dynamic', position: at(g.rim), angle: g.theta - Math.PI / 2, canSleep: false });
      world.addShape(mountBody, { kind: 'circle', radius: MOUNT_BODY_R }, { density: 1, sensor: true, filter: VEHICLE_FILTER });
      world.createJoint({ kind: 'weld', bodyA: roverBody, bodyB: mountBody, anchorA: g.rim, anchorB: { x: 0, y: 0 } });
      bodies.push({ id: mountBody, role: 'mount' });
      visuals.push(pictureItem(part.id, mountBody, g.mountPicture, 'mount', MOUNT_COLOR, part));
    }

    const main = world.createBody({
      type: 'dynamic',
      position: at(g.body.pos),
      angle: g.body.angle,
      canSleep: false,
      bullet: role === 'wheel',
    });
    for (const shape of g.shapes) {
      world.addShape(main, shape, { density: g.density, friction: g.friction, restitution: 0, filter: VEHICLE_FILTER });
    }
    bodies.push({ id: main, role });
    for (const pic of g.pictures) visuals.push(pictureItem(part.id, main, pic, role, COLOR_BY_ROLE[role], part));

    const handle: AttachmentHandle = {
      partId: part.id,
      kind: part.kind,
      bodies,
      joints,
      visuals,
      bounds: boxBounds(part.x, part.y, 0, 0),
      geometry: g,
      main,
    };

    if (role === 'wheel') {
      if (g.mount === 'spring') {
        const axle = world.createBody({ type: 'dynamic', position: at(g.body.pos), canSleep: false });
        world.addShape(axle, { kind: 'circle', radius: AXLE_R }, { density: AXLE_DENSITY, sensor: true, filter: VEHICLE_FILTER });
        bodies.push({ id: axle, role: 'axle' });
        handle.spring = world.createJoint({
          kind: 'prismatic',
          bodyA: roverBody,
          bodyB: axle,
          anchorA: g.body.pos,
          anchorB: { x: 0, y: 0 },
          axis: g.u,
          limits: { lower: -SPRING_TRAVEL, upper: SPRING_TRAVEL },
          spring: { hertz: SPRING_HZ, dampingRatio: WHEEL_SPRING_DAMPING, mass: ROVER_MASS / 2 },
        });
        handle.wheelJoint = world.createJoint({
          kind: 'wheel',
          bodyA: axle,
          bodyB: main,
          anchorA: { x: 0, y: 0 },
          anchorB: { x: 0, y: 0 },
          motor: { enabled: false, speed: 0, maxTorque: 0 },
        });
        handle.wheelParent = axle;
        joints.push(handle.spring, handle.wheelJoint);
      } else {
        handle.wheelJoint = world.createJoint({
          kind: 'wheel',
          bodyA: roverBody,
          bodyB: main,
          anchorA: g.body.pos,
          anchorB: { x: 0, y: 0 },
          motor: { enabled: false, speed: 0, maxTorque: 0 },
        });
        handle.wheelParent = roverBody;
        joints.push(handle.wheelJoint);
      }
    } else if (g.mount === 'spring') {
      const slider = world.createBody({ type: 'dynamic', position: at(g.body.pos), canSleep: false });
      world.addShape(slider, { kind: 'circle', radius: SLIDER_R }, { density: SLIDER_DENSITY, sensor: true, filter: VEHICLE_FILTER });
      bodies.push({ id: slider, role: 'slider' });
      handle.spring = world.createJoint({
        kind: 'prismatic',
        bodyA: roverBody,
        bodyB: slider,
        anchorA: g.body.pos,
        anchorB: { x: 0, y: 0 },
        axis: g.u,
        limits: { lower: -SPRING_TRAVEL, upper: SPRING_TRAVEL },
        spring: { hertz: SPRING_HZ, dampingRatio: PART_SPRING_DAMPING, mass: world.getMass(main) + world.getMass(slider) },
      });
      const weld = world.createJoint({ kind: 'weld', bodyA: slider, bodyB: main, anchorA: { x: 0, y: 0 }, anchorB: { x: 0, y: 0 } });
      joints.push(handle.spring, weld);
    } else {
      joints.push(world.createJoint({ kind: 'weld', bodyA: roverBody, bodyB: main, anchorA: g.body.pos, anchorB: { x: 0, y: 0 } }));
    }
    return handle;
  });

  const { kevin, dome } = roverPictures();
  const roverVisuals: RenderItem[] = [
    pictureItem(rover.id, roverBody, kevin, 'kevin', KEVIN_COLOR, rover),
    // The glass is see-through in the picture itself; `alpha` only matters for the fill fallback.
    { ...pictureItem(rover.id, roverBody, dome, 'rover', DOME_COLOR, rover), alpha: 0.9 },
  ];
  const roverHandle: PartHandle = {
    partId: rover.id,
    kind: rover.kind,
    bodies: [{ id: roverBody, role: 'rover' }],
    joints: [],
    visuals: roverVisuals,
    bounds: boxBounds(rover.x, rover.y, 2 * ROVER_R, 2 * ROVER_R),
  };

  const groundY = heightAt(terrain, rover.x);
  const shadowBody = world.createBody({ type: 'kinematic', position: { x: rover.x, y: groundY + SHADOW_LIFT } });
  const shadowItem: RenderItem = {
    partId: SHADOW_PART_ID,
    body: shadowBody,
    shape: { kind: 'box', w: SHADOW_W, h: (SHADOW_W * PICS.shadow.h) / PICS.shadow.w },
    color: SHADOW_COLOR,
    alpha: 0.2,
    role: 'shadow',
    locked: true,
    lockPosition: true,
    textureKey: PICS.shadow.key,
  };

  const build: RoverBuild = { rover: roverHandle, roverBody, attachments, shadowBody, shadowItem };
  refreshBounds(world, build);
  return build;
}

/** Recomputes every rover handle's hit box from where its pictures are drawn now. */
export function refreshBounds(world: PhysicsWorld, build: RoverBuild): void {
  const transformOf = (b: BodyId): Transform => world.getTransform(b);
  build.rover.bounds = itemsBounds(build.rover.visuals.filter((v) => v.role === 'rover'), transformOf);
  for (const a of build.attachments) a.bounds = itemsBounds(a.visuals, transformOf);
}

// ---- scenery ----------------------------------------------------------------------------------

/** Boulder density (kg/m^2) by `material`. */
export const BLOCK_DENSITY: Record<string, number> = { light: 1.0, rock: 2.0, heavy: 3.0 };

/** Boulder size (m) from its `size` prop, "<w>x<h>" (e.g. "1x1", "1.4x1.6"); 1 x 1 when it does
 * not parse. */
export function blockSize(size: string): { w: number; h: number } {
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(size);
  if (!m) return { w: 1, h: 1 };
  return { w: Number(m[1]), h: Number(m[2]) };
}

/** A pushable boulder: a dynamic box drawn with the boulder picture. */
function buildBlock(world: PhysicsWorld, part: PlacedPart): PartHandle {
  const { w, h } = blockSize(part.props.size ?? '1x1');
  const density = BLOCK_DENSITY[part.props.material ?? 'rock'] ?? BLOCK_DENSITY.rock!;
  const id = world.createBody({ type: 'dynamic', position: { x: part.x, y: part.y } });
  world.addShape(id, { kind: 'box', halfWidth: w / 2, halfHeight: h / 2 }, { density, friction: 0.7 });
  const shape: Shape = { kind: 'box', w, h };
  return {
    partId: part.id,
    kind: part.kind,
    bodies: [{ id, role: 'block' }],
    joints: [],
    visuals: [
      {
        partId: part.id,
        body: id,
        shape,
        color: BOULDER_COLOR,
        role: 'block',
        locked: !!part.locked,
        lockPosition: !!part.lockPosition,
        textureKey: 'rv-boulder',
      },
    ],
    bounds: boxBounds(part.x, part.y, w, h),
  };
}

function buildFinish(world: PhysicsWorld, part: PlacedPart): PartHandle {
  const w = 0.6;
  const h = 2;
  const cy = part.y + 1;
  const id = world.createBody({ type: 'static', position: { x: part.x, y: cy } });
  world.addShape(id, { kind: 'box', halfWidth: w / 2, halfHeight: h / 2 }, { sensor: true });
  const shape: Shape = { kind: 'box', w, h };
  return {
    partId: part.id,
    kind: part.kind,
    bodies: [{ id, role: 'finish' }],
    joints: [],
    visuals: [{ partId: part.id, body: id, shape, color: FINISH_COLOR, role: 'finish', locked: !!part.locked, lockPosition: !!part.lockPosition }],
    bounds: boxBounds(part.x, cy, w, h),
  };
}

/** Builds one stand-alone part: the boulder, the finish beacon, or the Bridge course's legacy
 * buggy (kind 'vehicle'; `profile` seats its wheels on the ground). The rover and its
 * attachments are built together by `buildRover`. */
export function buildPart(world: PhysicsWorld, part: PlacedPart, profile: Vec2[]): PartHandle {
  switch (part.kind) {
    case 'vehicle':
      return buildBuggy(world, part, profile);
    case 'block':
      return buildBlock(world, part);
    case 'finish':
      return buildFinish(world, part);
    default:
      throw new Error(`vehicle: ${part.kind} is built by buildRover, not buildPart`);
  }
}
