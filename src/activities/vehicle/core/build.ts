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
import { WORLD_W, crustPolygons, findGaps, heightAt, terrainPolygon } from './terrain';
import type { BodyId, Bounds, JointId, PartHandle, PlacedPart, RenderItem, RoverPart, Shape, Transform, Vec2 } from './types';
import type { PhysicsWorld } from '../../../physics/types';

export { VEHICLE_FILTER };

/** The world is WORLD_W (90 m, terrain.ts) wide since 2026-10-05; the panel shows a 30 m window
 * of it and the kit scrolls. 15 m tall. */
export { WORLD_W };
export const WORLD_H = 15;
/** Meters of ground the kit shows below world y = 0 (`WorldSpec.groundDepth` in spec.ts - keep
 * this in sync with that value). `buildTerrain`'s darker "under" layer closes at this depth
 * instead of the rust top layer's thin 0.3 m crust, so it covers the kit's whole ground band
 * (see `terrainPolygon`'s doc comment for why that also keeps a pit reading as a real hole). */
export const GROUND_DEPTH = 1.5;

const TERRAIN_COLOR = 0xb5532e; // rust
const TERRAIN_UNDER_COLOR = 0x8a3c1f; // darker rock layer, filling down to GROUND_DEPTH
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

/** Static chain body carrying the level's ground profile, plus the filled polygon RenderItems
 * the scene draws it as: a darker "under" layer (the same silhouette, but closed all the way down
 * at `GROUND_DEPTH` instead of the crust's 0.3 m, so it fills the kit's whole below-ground band
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
 * lip vs. a lower landing) down to the panel bottom (`-GROUND_DEPTH`), so it fills the gap without
 * covering any real terrain on either side. It carries no collider: it reuses this same static
 * body purely for its RenderItem, adding no shape, so physics/colliders are unchanged. */
export function buildTerrain(world: PhysicsWorld, profile: Vec2[]): { body: BodyId; items: RenderItem[] } {
  const body = world.createBody({ type: 'static', position: { x: 0, y: 0 } });
  world.addShape(body, { kind: 'chain', vertices: profile }, { friction: 0.8 });
  const underVertices = terrainPolygon(profile, GROUND_DEPTH);
  const underItem: RenderItem = {
    partId: TERRAIN_PART_ID,
    body,
    shape: { kind: 'polygon', vertices: underVertices },
    color: TERRAIN_UNDER_COLOR,
    role: 'terrain',
    locked: true,
    lockPosition: true,
  };
  const topItems: RenderItem[] = crustPolygons(profile).map((vertices) => ({
    partId: TERRAIN_PART_ID,
    body,
    shape: { kind: 'polygon', vertices },
    color: TERRAIN_COLOR,
    role: 'terrain',
    locked: true,
    lockPosition: true,
  }));
  // The chasm's top is flat at the LOWER lip: above it, between a ramp's takeoff lip and a lower
  // landing, is open air the rover flies through, not rock in shadow.
  const chasmItems: RenderItem[] = findGaps(profile).map((gap) => ({
    partId: TERRAIN_PART_ID,
    body,
    shape: {
      kind: 'polygon',
      vertices: [
        { x: gap.x0, y: Math.min(gap.y0, gap.y1) },
        { x: gap.x1, y: Math.min(gap.y0, gap.y1) },
        { x: gap.x1, y: -GROUND_DEPTH },
        { x: gap.x0, y: -GROUND_DEPTH },
      ],
    },
    color: CHASM_COLOR,
    role: 'terrain',
    locked: true,
    lockPosition: true,
  }));
  return { body, items: [underItem, ...topItems, ...chasmItems] };
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
