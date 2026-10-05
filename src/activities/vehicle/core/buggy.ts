// The old two-wheel buggy (the Vehicle course's machine until 2026-10-02), kept verbatim because
// the Bridge course drives it over the child's bridge as the load (see
// src/activities/bridge/core/sim.ts, which builds it through `buildPart` with kind 'vehicle').
// The Marstopia rover itself no longer uses any of this: see build.ts for the dome + attachments.
import { heightAt } from './terrain';
import type { BodyId, Bounds, JointId, PartHandle, PlacedPart, RenderItem, Vec2 } from './types';
import type { PhysicsWorld } from '../../../physics/types';

/** All vehicle colliders share this filter so a car's wheels never collide with its own chassis
 * or its other wheel/axle bodies (they physically overlap by construction). */
export const VEHICLE_FILTER = { group: 0x2, mask: 0xfffd };

/** Wheel radius (m) by `wheelSize`. */
export const WHEEL_R: Record<string, number> = { S: 0.3, M: 0.45, L: 0.6 };

/** Ground speed (m/s) and per-wheel torque cap (N.m) by `power`. */
export const POWER: Record<string, { speed: number; torque: number }> = {
  Low: { speed: 4, torque: 2 },
  Medium: { speed: 6, torque: 4 },
  High: { speed: 8, torque: 7 },
};

/** Suspension spring frequency in Hz. `None` uses a rigid `wheel` joint (no prismatic/axle). */
export const SUSPENSION: Record<string, number> = { Stiff: 6, Soft: 2.5, None: 0 };

/** Total car mass (kg, chassis + 2 wheels) by `weight`. */
export const CAR_MASS: Record<string, number> = { Light: 2.1, Medium: 2.8, Heavy: 4.3 };

/** Mass (kg) of one wheel, whatever its shape (density is normalised per wheel). */
export const WHEEL_MASS = 0.64;

/** Chassis box half-dimensions (m): 2.0 x 0.5 full size. */
export const CHASSIS_W = 2.0;
export const CHASSIS_H = 0.5;

/** Chassis density (kg/m^2) so chassis + 2 wheels totals CAR_MASS[weight]. Chassis box area is
 * CHASSIS_W * CHASSIS_H = 1.0 m^2. */
export function chassisDensity(weight: string): number {
  const mass = CAR_MASS[weight] ?? CAR_MASS.Medium!;
  return (mass - 2 * WHEEL_MASS) / (CHASSIS_W * CHASSIS_H);
}

const CHASSIS_COLOR = 0xc9c3b5; // pale rover body
const RIDER_COLOR = 0x05aeed;
const WHEEL_COLOR = 0x3a3f4b;
const MAST_COLOR = 0xd9dde8;
const DISH_COLOR = 0xf2f4f8;
const PANEL_COLOR = 0x2f6fb8;
const ENGINE_COLOR = 0x4a4a52;
const SPRING_COLOR = 0x8f95a8;
const CARGO_COLOR = 0xc9a869;

function boxBounds(x: number, y: number, w: number, h: number): Bounds {
  return { x, y, w, h };
}

function unionBounds(a: Bounds, b: Bounds): Bounds {
  const minX = Math.min(a.x - a.w / 2, b.x - b.w / 2);
  const maxX = Math.max(a.x + a.w / 2, b.x + b.w / 2);
  const minY = Math.min(a.y - a.h / 2, b.y - b.h / 2);
  const maxY = Math.max(a.y + a.h / 2, b.y + b.h / 2);
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}
// ---- rover option -> visual size tables (visual-only; no physics here) ------------------

/** Engine block box size (m) by `power`: bigger with more pipes at higher power. Mounted at the
 * front nose (chassis-local (+0.78, 0.42)). Aspect 1.25 throughout, matching the real engine art
 * (public/parts/rover/engine-{Low,Medium,High}.svg, viewBox 320x256). */
export const ENGINE_SIZE: Record<string, { w: number; h: number }> = {
  Low: { w: 0.5, h: 0.4 },
  Medium: { w: 0.6, h: 0.48 },
  High: { w: 0.7, h: 0.56 },
};

/** Suspension-unit box size (m): a strut / loose coil / tight coil between two plates. Same size
 * for every option; only the picture (`textureKey`) differs. */
const SPRING_W = 0.28;
const SPRING_H = 0.34;

/** Cargo box size (m) + local y by `weight`, always centred at local x -0.55 (the rear deck). Big
 * and clearly visible: the rider (fuzz, centred at (0, 0.5) r 0.35) spans x -0.35..0.35, and every
 * one of these keeps its right edge at or left of -0.125, clear of it. Light and Heavy are real
 * picture art now (public/parts/rover/cargo-{Light,Heavy}.png), so w/h match the art's own aspect
 * instead of a generic box: Light (a bunch of balloons, 289x480, w/h 0.602) is tall and centred
 * higher (0.9) so the bunch rises above the deck; Heavy (a boulder, 400x373, w/h 1.07) sits low
 * (0.72). Medium is the cargo-Medium.svg juice box art (164x256, aspect 0.64), sized 0.5 x 0.78
 * (0.5/0.78 = 0.641) with its bottom on the deck (cy 0.79 - h/2 = 0.4). */
export const CARGO_SIZE: Record<string, { w: number; h: number; cy: number }> = {
  Light: { w: 0.62, h: 1.03, cy: 0.9 },
  Medium: { w: 0.5, h: 0.78, cy: 0.79 },
  Heavy: { w: 0.8, h: 0.75, cy: 0.72 },
};

// ---- vehicle wheel geometry --------------------------------------------------------------

/** A convex 4-vertex polygon for one star tip: a trapezoid-ish rectangle running from radius
 * 0.3r to r, width 0.35r, in the wheel's local frame, rotated by `angle`. */
function tipVertices(r: number, angle: number): Vec2[] {
  const halfW = (0.35 * r) / 2;
  const innerR = 0.3 * r;
  const outerR = r;
  const local: Vec2[] = [
    { x: innerR, y: -halfW },
    { x: innerR, y: halfW },
    { x: outerR, y: halfW },
    { x: outerR, y: -halfW },
  ];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return local.map((p) => ({ x: c * p.x - s * p.y, y: s * p.x + c * p.y }));
}

/** Adds the wheel's collider shape(s) to `wheelBody` (physics unchanged from before: square gets
 * a box, star a hub circle + 5 tip polygons, round a single circle) but returns just ONE
 * RenderItem for the whole wheel - a circle of radius `r` carrying `textureKey: 'wheel-<shape>'`
 * - so the rover visibly shows the picture of the part it actually has, instead of the old
 * hand-drawn per-shape fills. `density` is the SAME number for every shape kind (normalised from
 * the round wheel's area, per the plan), so square and star wheels are not each individually
 * mass-tuned to 0.64 kg. */
function buildWheelGeometry(
  world: PhysicsWorld,
  wheelBody: BodyId,
  wheelShape: string,
  r: number,
  density: number,
  part: PlacedPart,
): RenderItem[] {
  const locked = !!part.locked;
  const lockPosition = !!part.lockPosition;
  const shapeOpts = { density, friction: 1.0, restitution: 0, filter: VEHICLE_FILTER };

  if (wheelShape === 'square') {
    const half = 0.75 * r;
    world.addShape(wheelBody, { kind: 'box', halfWidth: half, halfHeight: half }, shapeOpts);
  } else if (wheelShape === 'star') {
    const hubR = 0.45 * r;
    world.addShape(wheelBody, { kind: 'circle', radius: hubR }, shapeOpts);
    for (let k = 0; k < 5; k++) {
      const angle = (k * 72 * Math.PI) / 180;
      const vertices = tipVertices(r, angle);
      world.addShape(wheelBody, { kind: 'polygon', vertices }, shapeOpts);
    }
  } else {
    // round (default)
    world.addShape(wheelBody, { kind: 'circle', radius: r }, shapeOpts);
  }

  return [
    {
      partId: part.id,
      body: wheelBody,
      shape: { kind: 'circle', r },
      color: WHEEL_COLOR,
      role: 'wheel',
      locked,
      lockPosition,
      textureKey: `wheel-${wheelShape}`,
    },
  ];
}

// ---- part builders ------------------------------------------------------------------------

/** Local (chassis-frame) x offset of each wheel/axle anchor. */
export const WHEEL_LOCAL_X = [-0.8, 0.8];
export const WHEEL_LOCAL_Y = -0.2;

export function buildBuggy(world: PhysicsWorld, part: PlacedPart, profile: Vec2[]): PartHandle {
  const wheelShape = part.props.wheelShape ?? 'round';
  const wheelSizeKey = part.props.wheelSize ?? 'M';
  const r = WHEEL_R[wheelSizeKey] ?? WHEEL_R.M!;
  const suspensionKey = part.props.suspension ?? 'Stiff';
  const weightKey = part.props.weight ?? 'Medium';
  const powerKey = part.props.power ?? 'Medium';

  const cx = part.x;
  const wheelXs = WHEEL_LOCAL_X.map((lx) => cx + lx);
  // Both wheels start level at the HIGHER of the two terrain heights under them (sampled a wheel
  // radius to each side), so a wheel over a pit edge hangs in the air and drops during the
  // pre-roll instead of being built inside the pit wall and flung out of the world.
  const groundY = Math.max(
    ...wheelXs.flatMap((wx) => [heightAt(profile, wx - r), heightAt(profile, wx), heightAt(profile, wx + r)]),
  );
  const wheelYs = wheelXs.map(() => groundY + r + 0.02);
  const chassisY = groundY + r + 0.02 + 0.2;

  const density = chassisDensity(weightKey);
  const chassis = world.createBody({
    type: 'dynamic',
    position: { x: cx, y: chassisY },
    linearDamping: 0.1,
    canSleep: false,
  });
  world.addShape(
    chassis,
    { kind: 'box', halfWidth: CHASSIS_W / 2, halfHeight: CHASSIS_H / 2 },
    { density, friction: 0.6, filter: VEHICLE_FILTER },
  );
  const chassisMass = world.getMass(chassis);

  const locked = !!part.locked;
  const lockPosition = !!part.lockPosition;

  const bodies: { id: BodyId; role: string }[] = [{ id: chassis, role: 'chassis' }];
  const visuals: RenderItem[] = [
    {
      partId: part.id,
      body: chassis,
      shape: { kind: 'box', w: CHASSIS_W, h: CHASSIS_H },
      color: CHASSIS_COLOR,
      role: 'chassis',
      locked,
      lockPosition,
      textureKey: 'tex-chassis',
    },
    // Decorative only, no colliders: a mast + dish, a solar panel, an engine block (front nose),
    // and cargo (rear deck), all drawn off the chassis body at a local offset (the kit's
    // box/circle Shape both carry cx/cy). Deck layout, front to rear: engine, mast+dish (just
    // ahead of the rider), panel, rider (fuzz, centre), cargo.
    {
      partId: part.id,
      body: chassis,
      shape: { kind: 'box', w: 0.12, h: 0.7, cx: 0.35, cy: 0.55 },
      color: MAST_COLOR,
      role: 'mast',
      locked,
      lockPosition,
      textureKey: 'tex-mast',
    },
    {
      partId: part.id,
      body: chassis,
      shape: { kind: 'circle', r: 0.22, cx: 0.35, cy: 0.98 },
      color: DISH_COLOR,
      role: 'mast',
      locked,
      lockPosition,
      textureKey: 'tex-dish',
    },
    {
      partId: part.id,
      body: chassis,
      shape: { kind: 'box', w: 0.5, h: 0.08, cx: 0.35, cy: 0.28 },
      color: PANEL_COLOR,
      role: 'panel',
      locked,
      lockPosition,
      textureKey: 'tex-panel',
    },
  ];

  {
    const engineSize = ENGINE_SIZE[powerKey] ?? ENGINE_SIZE.Medium!;
    visuals.push({
      partId: part.id,
      body: chassis,
      shape: { kind: 'box', w: engineSize.w, h: engineSize.h, cx: 0.78, cy: 0.42 },
      color: ENGINE_COLOR,
      role: 'engine',
      locked,
      lockPosition,
      textureKey: `engine-${powerKey}`,
    });

    // Cargo on the rear deck, fixed local x -0.55 (local y by weight, see CARGO_SIZE) - clear of
    // the rider (fuzz, centred at (0, 0.5) r 0.35, spanning x -0.35..0.35) for every weight.
    const cargoSize = CARGO_SIZE[weightKey] ?? CARGO_SIZE.Medium!;
    visuals.push({
      partId: part.id,
      body: chassis,
      shape: { kind: 'box', w: cargoSize.w, h: cargoSize.h, cx: -0.55, cy: cargoSize.cy },
      color: CARGO_COLOR,
      role: 'cargo',
      locked,
      lockPosition,
      textureKey: `cargo-${weightKey}`,
    });

    // Suspension None: no axle body rides with the wheel, so the spring unit is drawn straight
    // off the chassis (one per wheel side), between the chassis bottom and the wheel hub.
    if (suspensionKey === 'None') {
      for (const localX of WHEEL_LOCAL_X) {
        visuals.push({
          partId: part.id,
          body: chassis,
          shape: { kind: 'box', w: SPRING_W, h: SPRING_H, cx: localX, cy: -0.1 },
          color: SPRING_COLOR,
          role: 'springs',
          locked,
          lockPosition,
          textureKey: `springs-${suspensionKey}`,
        });
      }
    }
  }

  // Deviation: the kit's `circle` Shape carries no local offset (only `box` has optional cx/cy),
  // and the scene draws a texture-backed RenderItem (the rider uses `roles.rider.texture`) at
  // its own body's transform with no per-item offset either - see BuilderScene.syncTransforms.
  // A rider drawn straight off the chassis body would sit at the chassis's own origin, not at
  // chassis-local (0, 0.5), and the kit's PhysicsWorld has no "set transform" method to hand-pose
  // a body every tick. So the rider gets its own body, held at (0, 0.5) relative to the chassis
  // by a rigid `weld` joint - physics carries it along (position AND rotation) with no per-tick
  // code needed. It needs a shape for the weld to have something to be rigid about (a body with
  // no shapes has ~0 mass, which is exactly what we want physically), so it gets a tiny sensor
  // circle: `sensor: true` means it never collides or pushes back, so it stays purely cosmetic
  // (no "collider" in the physical sense) while still being a normal dynamic body for the joint.
  const riderBody = world.createBody({ type: 'dynamic', position: { x: cx, y: chassisY + 0.5 }, canSleep: false });
  world.addShape(riderBody, { kind: 'circle', radius: 0.05 }, { density: 1, sensor: true, filter: VEHICLE_FILTER });
  world.createJoint({
    kind: 'weld',
    bodyA: chassis,
    bodyB: riderBody,
    anchorA: { x: 0, y: 0.5 },
    anchorB: { x: 0, y: 0 },
  });
  bodies.push({ id: riderBody, role: 'rider' });
  visuals.push({
    partId: part.id,
    body: riderBody,
    shape: { kind: 'circle', r: 0.35 },
    color: RIDER_COLOR,
    role: 'rider',
    locked,
    lockPosition,
  });

  const joints: JointId[] = [];
  let bounds = boxBounds(cx, chassisY, CHASSIS_W, CHASSIS_H);

  const wheelDensity = 0.64 / (Math.PI * r * r);

  for (let i = 0; i < 2; i++) {
    const wx = wheelXs[i]!;
    const wy = wheelYs[i]!;
    const localX = WHEEL_LOCAL_X[i]!;

    const wheelBody = world.createBody({
      type: 'dynamic',
      position: { x: wx, y: wy },
      canSleep: false,
      bullet: true,
    });
    const wheelVisuals = buildWheelGeometry(world, wheelBody, wheelShape, r, wheelDensity, part);
    bodies.push({ id: wheelBody, role: 'wheel' });
    visuals.push(...wheelVisuals);
    bounds = unionBounds(bounds, boxBounds(wx, wy, r * 2, r * 2));

    if (suspensionKey === 'None') {
      const joint = world.createJoint({
        kind: 'wheel',
        bodyA: chassis,
        bodyB: wheelBody,
        anchorA: { x: localX, y: WHEEL_LOCAL_Y },
        anchorB: { x: 0, y: 0 },
        motor: { enabled: false, speed: 0, maxTorque: 0 },
      });
      joints.push(joint);
    } else {
      const axle = world.createBody({
        type: 'dynamic',
        position: { x: wx, y: wy },
        canSleep: false,
      });
      world.addShape(axle, { kind: 'circle', radius: 0.1 }, { density: 15, filter: VEHICLE_FILTER });
      bodies.push({ id: axle, role: 'axle' });

      // Soft/Stiff: the spring unit rides with the axle (drawn at the axle's own local origin),
      // so it visually travels with the wheel as the suspension compresses.
      visuals.push({
        partId: part.id,
        body: axle,
        shape: { kind: 'box', w: SPRING_W, h: SPRING_H, cx: 0, cy: 0.22 },
        color: SPRING_COLOR,
        role: 'springs',
        locked,
        lockPosition,
        textureKey: `springs-${suspensionKey}`,
      });

      const hertz = SUSPENSION[suspensionKey] ?? SUSPENSION.Stiff!;
      world.createJoint({
        kind: 'prismatic',
        bodyA: chassis,
        bodyB: axle,
        anchorA: { x: localX, y: WHEEL_LOCAL_Y },
        anchorB: { x: 0, y: 0 },
        axis: { x: 0, y: 1 },
        limits: { lower: -0.15, upper: 0.15 },
        spring: { hertz, dampingRatio: 0.7, mass: chassisMass / 2 },
      });

      const joint = world.createJoint({
        kind: 'wheel',
        bodyA: axle,
        bodyB: wheelBody,
        anchorA: { x: 0, y: 0 },
        anchorB: { x: 0, y: 0 },
        motor: { enabled: false, speed: 0, maxTorque: 0 },
      });
      joints.push(joint);
    }
  }

  return { partId: part.id, kind: part.kind, bodies, joints, visuals, bounds };
}

