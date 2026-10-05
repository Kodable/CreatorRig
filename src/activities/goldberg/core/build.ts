// Turns a PlacedPart into Rapier bodies/shapes plus the RenderItems the scene draws.
import { propNumber } from './catalog';
import type { BodyId, BodyRole, Bounds, PartHandle, PlacedPart, RenderItem, Shape, Vec2 } from './types';
import type { PhysicsWorld } from '../../../physics/types';

export const WORLD_W = 30;
export const WORLD_H = 15;

const DEG2RAD = Math.PI / 180;

function rotateVec(v: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

function addVec(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** Body-local point to world coordinates given the body's own position/angle. */
function toWorld(bodyPos: Vec2, bodyAngle: number, local: Vec2): Vec2 {
  return addVec(bodyPos, rotateVec(local, bodyAngle));
}

/** Static bounds: ground across the full width, walls at x=0 and x=30. Returns the body ids. */
export function buildBounds(world: PhysicsWorld): BodyId[] {
  const groundHalfH = 0.5;
  const ground = world.createBody({ type: 'static', position: { x: WORLD_W / 2, y: -groundHalfH } });
  world.addShape(ground, { kind: 'box', halfWidth: WORLD_W / 2, halfHeight: groundHalfH }, { friction: 0.6 });

  const wallHalfW = 0.5;
  const wallHalfH = WORLD_H;
  const left = world.createBody({ type: 'static', position: { x: -wallHalfW, y: wallHalfH } });
  world.addShape(left, { kind: 'box', halfWidth: wallHalfW, halfHeight: wallHalfH });

  const right = world.createBody({ type: 'static', position: { x: WORLD_W + wallHalfW, y: wallHalfH } });
  world.addShape(right, { kind: 'box', halfWidth: wallHalfW, halfHeight: wallHalfH });

  return [ground, left, right];
}

/** Accumulates world-space points to derive a part's AABB bounds. */
class BoundsTracker {
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  point(p: Vec2): void {
    if (p.x < this.minX) this.minX = p.x;
    if (p.y < this.minY) this.minY = p.y;
    if (p.x > this.maxX) this.maxX = p.x;
    if (p.y > this.maxY) this.maxY = p.y;
  }

  circle(center: Vec2, r: number): void {
    this.point({ x: center.x - r, y: center.y - r });
    this.point({ x: center.x + r, y: center.y + r });
  }

  box(bodyPos: Vec2, bodyAngle: number, halfW: number, halfH: number, cx = 0, cy = 0): void {
    for (const corner of [
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH },
    ]) {
      this.point(toWorld(bodyPos, bodyAngle, { x: corner.x + cx, y: corner.y + cy }));
    }
  }

  polygon(bodyPos: Vec2, bodyAngle: number, vertices: Vec2[]): void {
    for (const v of vertices) this.point(toWorld(bodyPos, bodyAngle, v));
  }

  bounds(): Bounds {
    if (!Number.isFinite(this.minX)) return { x: 0, y: 0, w: 0, h: 0 };
    return {
      x: (this.minX + this.maxX) / 2,
      y: (this.minY + this.maxY) / 2,
      w: this.maxX - this.minX,
      h: this.maxY - this.minY,
    };
  }
}

interface BuiltBody {
  id: BodyId;
  role: BodyRole;
}

function buildFuzz(world: PhysicsWorld, part: PlacedPart, bt: BoundsTracker): { bodies: BuiltBody[]; visuals: RenderItem[] } {
  const r = propNumber('fuzz', 'size', part.props.size ?? '');
  // Created static; GoldbergSim.play() switches it to dynamic via setBodyType.
  const id = world.createBody({
    type: 'static',
    position: { x: part.x, y: part.y },
    bullet: true,
    canSleep: false,
    linearDamping: 0.05,
    angularDamping: 0.3,
  });
  world.addShape(id, { kind: 'circle', radius: r }, { density: 1, friction: 0.4, restitution: 0.1 });
  bt.circle({ x: part.x, y: part.y }, r);
  const shape: Shape = { kind: 'circle', r };
  return {
    bodies: [{ id, role: 'fuzz' }],
    visuals: [{ partId: part.id, body: id, shape, color: 0x05aeed, role: 'fuzz', locked: !!part.locked, lockPosition: !!part.lockPosition }],
  };
}

function buildPlatform(world: PhysicsWorld, part: PlacedPart, bt: BoundsTracker): { bodies: BuiltBody[]; visuals: RenderItem[] } {
  const length = propNumber('platform', 'length', part.props.length ?? '');
  const rotationDeg = propNumber('platform', 'rotation', part.props.rotation ?? '');
  const angle = rotationDeg * DEG2RAD;
  const halfW = length / 2;
  const halfH = 0.15;
  const id = world.createBody({ type: 'static', position: { x: part.x, y: part.y }, angle });
  world.addShape(id, { kind: 'box', halfWidth: halfW, halfHeight: halfH }, { friction: 0.6 });
  bt.box({ x: part.x, y: part.y }, angle, halfW, halfH);
  const shape: Shape = { kind: 'box', w: length, h: halfH * 2 };
  return {
    bodies: [{ id, role: 'solid' }],
    visuals: [{ partId: part.id, body: id, shape, color: 0x8a6a3a, role: 'solid', locked: !!part.locked, lockPosition: !!part.lockPosition }],
  };
}

function buildRamp(world: PhysicsWorld, part: PlacedPart, bt: BoundsTracker): { bodies: BuiltBody[]; visuals: RenderItem[] } {
  const angleDeg = propNumber('ramp', 'angle', part.props.angle ?? '');
  const flip = (part.props.flip ?? 'No') === 'Yes';
  const b = propNumber('ramp', 'size', part.props.size ?? '');
  const h = b * Math.tan(angleDeg * DEG2RAD);
  const apexX = flip ? b / 2 : -b / 2;
  const vertices: Vec2[] = [
    { x: -b / 2, y: 0 },
    { x: b / 2, y: 0 },
    { x: apexX, y: h },
  ];
  const id = world.createBody({ type: 'static', position: { x: part.x, y: part.y } });
  world.addShape(id, { kind: 'polygon', vertices }, { friction: 0.5 });
  bt.polygon({ x: part.x, y: part.y }, 0, vertices);
  const shape: Shape = { kind: 'polygon', vertices };
  return {
    bodies: [{ id, role: 'solid' }],
    visuals: [{ partId: part.id, body: id, shape, color: 0xa77b4a, role: 'solid', locked: !!part.locked, lockPosition: !!part.lockPosition }],
  };
}

function buildDomino(world: PhysicsWorld, part: PlacedPart, bt: BoundsTracker): { bodies: BuiltBody[]; visuals: RenderItem[] } {
  const count = propNumber('domino', 'count', part.props.count ?? '');
  const bodies: BuiltBody[] = [];
  const visuals: RenderItem[] = [];
  const halfW = 0.125;
  const halfH = 0.6;
  for (let i = 0; i < count; i++) {
    const pos = { x: part.x + 0.8 * i, y: part.y + 0.6 };
    const id = world.createBody({ type: 'dynamic', position: pos });
    world.addShape(id, { kind: 'box', halfWidth: halfW, halfHeight: halfH }, { density: 2, friction: 0.6 });
    bt.box(pos, 0, halfW, halfH);
    const shape: Shape = { kind: 'box', w: halfW * 2, h: halfH * 2 };
    bodies.push({ id, role: 'domino' });
    visuals.push({ partId: part.id, body: id, shape, color: 0xf7e7c6, role: 'domino', locked: !!part.locked, lockPosition: !!part.lockPosition });
  }
  return { bodies, visuals };
}

/** Shared seesaw/lever construction: a static fulcrum triangle + a dynamic plank on a revolute joint. */
function buildBeam(
  world: PhysicsWorld,
  part: PlacedPart,
  bt: BoundsTracker,
  opts: {
    length: number;
    pivotK: number; // plank-local x (as a fraction of length) that sits on the pivot
    startAngle: number;
    limits: [number, number];
    plankRole: 'plank' | 'beam';
    plankColor: number;
    hooks: ('Left' | 'Right')[];
  },
): { bodies: BuiltBody[]; visuals: RenderItem[]; joints: number[] } {
  const pivot = { x: part.x, y: part.y };
  const L = opts.length;
  const k = opts.pivotK;

  // Static fulcrum: triangle with its apex at the pivot (the body's own origin), for drawing
  // and bounds. The joint has no "don't collide with the body I'm attached to" option in this
  // adapter, so the apex used for the COLLIDER is pulled back a hair below the plank's underside
  // (plankHalfH + margin) to avoid the fulcrum solid physically wedging against the plank and
  // fighting the revolute joint. Deviation from the plan's exact triangle, reported in the sim README notes.
  const plankHalfH = 0.1;
  const fulcrumId = world.createBody({ type: 'static', position: pivot });
  const fulcrumVerts: Vec2[] = [
    { x: -0.5, y: -1 },
    { x: 0.5, y: -1 },
    { x: 0, y: 0 },
  ];
  const fulcrumColliderVerts: Vec2[] = [
    { x: -0.5, y: -1 },
    { x: 0.5, y: -1 },
    { x: 0, y: -(plankHalfH + 0.05) },
  ];
  world.addShape(fulcrumId, { kind: 'polygon', vertices: fulcrumColliderVerts });
  bt.polygon(pivot, 0, fulcrumVerts);

  // Dynamic plank: position it so the plank-local point (k*L, 0) lands on the pivot.
  const localPivotPoint = { x: k * L, y: 0 };
  const rotatedPivot = rotateVec(localPivotPoint, opts.startAngle);
  const plankPos = { x: pivot.x - rotatedPivot.x, y: pivot.y - rotatedPivot.y };
  const plankId = world.createBody({ type: 'dynamic', position: plankPos, angle: opts.startAngle });
  const plankHalfW = L / 2;
  world.addShape(plankId, { kind: 'box', halfWidth: plankHalfW, halfHeight: plankHalfH }, { density: 1, friction: 0.6 });
  bt.box(plankPos, opts.startAngle, plankHalfW, plankHalfH);

  const visuals: RenderItem[] = [
    {
      partId: part.id,
      body: fulcrumId,
      shape: { kind: 'polygon', vertices: fulcrumVerts },
      color: 0x3a4470,
      role: 'fulcrum',
      locked: !!part.locked,
      lockPosition: !!part.lockPosition,
    },
    {
      partId: part.id,
      body: plankId,
      shape: { kind: 'box', w: plankHalfW * 2, h: plankHalfH * 2 },
      color: opts.plankColor,
      role: opts.plankRole,
      locked: !!part.locked,
      lockPosition: !!part.lockPosition,
    },
  ];

  const hookHalfW = 0.075;
  const hookHalfH = 0.15;
  for (const side of opts.hooks) {
    const cx = side === 'Left' ? -(plankHalfW - hookHalfW) : plankHalfW - hookHalfW;
    const cy = 0.25;
    world.addShape(plankId, { kind: 'box', halfWidth: hookHalfW, halfHeight: hookHalfH, center: { x: cx, y: cy } }, { friction: 0.6 });
    bt.box(plankPos, opts.startAngle, hookHalfW, hookHalfH, cx, cy);
    visuals.push({
      partId: part.id,
      body: plankId,
      shape: { kind: 'box', w: hookHalfW * 2, h: hookHalfH * 2, cx, cy },
      color: opts.plankColor,
      role: opts.plankRole,
      locked: !!part.locked,
      lockPosition: !!part.lockPosition,
    });
  }

  const jointId = world.createJoint({
    kind: 'revolute',
    bodyA: fulcrumId,
    bodyB: plankId,
    anchorA: { x: 0, y: 0 },
    anchorB: { x: k * L, y: 0 },
    limits: { lower: opts.limits[0], upper: opts.limits[1] },
  });

  return {
    bodies: [
      { id: fulcrumId, role: 'fulcrum' },
      { id: plankId, role: opts.plankRole },
    ],
    visuals,
    joints: [jointId],
  };
}

function buildSeesaw(world: PhysicsWorld, part: PlacedPart, bt: BoundsTracker) {
  const length = propNumber('seesaw', 'length', part.props.length ?? '');
  const pivotK = propNumber('seesaw', 'fulcrumPos', part.props.fulcrumPos ?? '');
  const startAngle = propNumber('seesaw', 'startState', part.props.startState ?? '');
  const hookProp = part.props.hook ?? 'None';
  const hooks: ('Left' | 'Right')[] = hookProp === 'Both' ? ['Left', 'Right'] : hookProp === 'Left' || hookProp === 'Right' ? [hookProp] : [];
  return buildBeam(world, part, bt, {
    length,
    pivotK,
    startAngle,
    limits: [-0.35, 0.35],
    plankRole: 'plank',
    plankColor: 0xc98a4b,
    hooks,
  });
}

function buildLever(world: PhysicsWorld, part: PlacedPart, bt: BoundsTracker) {
  const length = propNumber('lever', 'length', part.props.length ?? '');
  const edge = (part.props.fulcrumPos ?? 'Middle') === 'Edge';
  const dirSign = propNumber('lever', 'direction', part.props.direction ?? 'Right'); // +1 Right, -1 Left
  const pivotK = edge ? 0.25 * dirSign : 0;
  const startAngle = 0.5 * dirSign;
  return buildBeam(world, part, bt, {
    length,
    pivotK,
    startAngle,
    limits: [-0.5, 0.5],
    plankRole: 'beam',
    plankColor: 0xe0392f,
    hooks: [],
  });
}

function buildGate(world: PhysicsWorld, part: PlacedPart, bt: BoundsTracker): { bodies: BuiltBody[]; visuals: RenderItem[] } {
  const openTime = propNumber('gate', 'openTime', part.props.openTime ?? '');
  const bodies: BuiltBody[] = [];
  const visuals: RenderItem[] = [];

  const sensorHalfW = 0.5;
  const sensorHalfH = 0.6;
  const sensorPos = { x: part.x, y: part.y + 0.6 };
  const sensorId = world.createBody({ type: 'static', position: sensorPos });
  world.addShape(sensorId, { kind: 'box', halfWidth: sensorHalfW, halfHeight: sensorHalfH }, { sensor: true });
  bt.box(sensorPos, 0, sensorHalfW, sensorHalfH);
  bodies.push({ id: sensorId, role: 'sensor' });
  visuals.push({
    partId: part.id,
    body: sensorId,
    shape: { kind: 'box', w: sensorHalfW * 2, h: sensorHalfH * 2 },
    color: 0x61bb46,
    role: 'sensor',
    locked: !!part.locked,
    lockPosition: !!part.lockPosition,
  });

  if (openTime > 0) {
    const doorHalfW = 0.15;
    const doorHalfH = 0.6;
    const doorPos = { x: part.x - 0.65, y: part.y + 0.6 };
    const doorId = world.createBody({ type: 'static', position: doorPos });
    world.addShape(doorId, { kind: 'box', halfWidth: doorHalfW, halfHeight: doorHalfH });
    bt.box(doorPos, 0, doorHalfW, doorHalfH);
    bodies.push({ id: doorId, role: 'door' });
    visuals.push({
      partId: part.id,
      body: doorId,
      shape: { kind: 'box', w: doorHalfW * 2, h: doorHalfH * 2 },
      color: 0xc32f96,
      role: 'door',
      locked: !!part.locked,
      lockPosition: !!part.lockPosition,
    });
  }

  return { bodies, visuals };
}

export function buildPart(world: PhysicsWorld, part: PlacedPart): PartHandle {
  const bt = new BoundsTracker();
  let bodies: BuiltBody[];
  let visuals: RenderItem[];
  let joints: number[] = [];

  switch (part.kind) {
    case 'fuzz': {
      const r = buildFuzz(world, part, bt);
      bodies = r.bodies;
      visuals = r.visuals;
      break;
    }
    case 'platform': {
      const r = buildPlatform(world, part, bt);
      bodies = r.bodies;
      visuals = r.visuals;
      break;
    }
    case 'ramp': {
      const r = buildRamp(world, part, bt);
      bodies = r.bodies;
      visuals = r.visuals;
      break;
    }
    case 'domino': {
      const r = buildDomino(world, part, bt);
      bodies = r.bodies;
      visuals = r.visuals;
      break;
    }
    case 'seesaw': {
      const r = buildSeesaw(world, part, bt);
      bodies = r.bodies;
      visuals = r.visuals;
      joints = r.joints;
      break;
    }
    case 'lever': {
      const r = buildLever(world, part, bt);
      bodies = r.bodies;
      visuals = r.visuals;
      joints = r.joints;
      break;
    }
    case 'gate': {
      const r = buildGate(world, part, bt);
      bodies = r.bodies;
      visuals = r.visuals;
      break;
    }
  }

  return {
    partId: part.id,
    kind: part.kind,
    bodies,
    joints,
    visuals,
    bounds: bt.bounds(),
  };
}
