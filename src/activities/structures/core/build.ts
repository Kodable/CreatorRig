// Turns a PlacedPart into Rapier bodies/shapes plus the RenderItems the scene draws.
import { MATERIALS, beamSize, blockSize } from './catalog';
import type { BodyId, Bounds, PartHandle, PlacedPart, RenderItem, Shape } from './types';
import type { PhysicsWorld } from '../../../physics/types';

export const WORLD_W = 24;
export const WORLD_H = 12;

/** Ground is wider than the walls so a kinematic shake never opens a gap at the extremes
 * (kinematic bodies never collide with static walls). 32 m wide, per the plan. */
export const GROUND_W = WORLD_W + 8; // 32 m wide
export const GROUND_H = 1;
export const WALL_H = 40;
export const WALL_W = 1;

/** partId used for the ground's synthetic RenderItem (no placed part owns it). */
export const GROUND_PART_ID = -1;
export const GROUND_COLOR = 0x5a3d1e;

export interface GroundAndWalls {
  ground: BodyId;
  walls: BodyId[];
}

/** Kinematic ground (top at y = 0) + two static walls just past the play field. */
export function buildGround(world: PhysicsWorld): GroundAndWalls {
  const ground = world.createBody({ type: 'kinematic', position: { x: WORLD_W / 2, y: -GROUND_H / 2 } });
  world.addShape(ground, { kind: 'box', halfWidth: GROUND_W / 2, halfHeight: GROUND_H / 2 }, { friction: 0.8 });

  const walls: BodyId[] = [];
  for (const x of [-0.5, WORLD_W + 0.5]) {
    const wall = world.createBody({ type: 'static', position: { x, y: WALL_H / 2 } });
    world.addShape(wall, { kind: 'box', halfWidth: WALL_W / 2, halfHeight: WALL_H / 2 });
    walls.push(wall);
  }

  return { ground, walls };
}

/** RenderItem for the ground so the scene draws it (and it visibly shakes). */
export function groundRenderItem(ground: BodyId): RenderItem {
  return {
    partId: GROUND_PART_ID,
    body: ground,
    // Narrower than the collider so the drawn ground stays inside the panel while it shakes.
    shape: { kind: 'box', w: WORLD_W - 0.6, h: GROUND_H },
    color: GROUND_COLOR,
    role: 'ground',
    locked: true,
    lockPosition: true,
  };
}

function boxBounds(x: number, y: number, w: number, h: number): Bounds {
  return { x, y, w, h };
}

/** Dynamic body for one placed part (block, beam or fuzz). Anchor = body centre. */
export function buildPart(world: PhysicsWorld, part: PlacedPart): PartHandle {
  if (part.kind === 'fuzz') {
    const r = 0.4;
    const id = world.createBody({
      type: 'dynamic',
      position: { x: part.x, y: part.y },
      canSleep: true,
      linearDamping: 0.2,
    });
    world.addShape(id, { kind: 'circle', radius: r }, { density: 1, friction: 0.5, restitution: 0.05 });
    const shape: Shape = { kind: 'circle', r };
    const color = 0x05aeed;
    return {
      partId: part.id,
      kind: part.kind,
      bodies: [{ id, role: 'fuzz' }],
      joints: [],
      visuals: [{ partId: part.id, body: id, shape, color, role: 'fuzz', locked: !!part.locked, lockPosition: !!part.lockPosition }],
      bounds: boxBounds(part.x, part.y, r * 2, r * 2),
    };
  }

  const material = (part.props.material as keyof typeof MATERIALS) ?? 'wood';
  const spec = MATERIALS[material] ?? MATERIALS.wood;
  const { w, h } =
    part.kind === 'block' ? blockSize(part.props.size ?? '1x1') : beamSize(part.props.length ?? '3');

  const id = world.createBody({ type: 'dynamic', position: { x: part.x, y: part.y } });
  world.addShape(id, { kind: 'box', halfWidth: w / 2, halfHeight: h / 2 }, { density: spec.density, friction: spec.friction });
  const shape: Shape = { kind: 'box', w, h };
  const role = part.kind; // 'block' | 'beam'

  return {
    partId: part.id,
    kind: part.kind,
    bodies: [{ id, role }],
    joints: [],
    visuals: [{ partId: part.id, body: id, shape, color: spec.color, role, locked: !!part.locked, lockPosition: !!part.lockPosition }],
    bounds: boxBounds(part.x, part.y, w, h),
  };
}
