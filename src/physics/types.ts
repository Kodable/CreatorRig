/**
 * The one engine-specific seam the runtime will keep. Scenarios call this interface and
 * never import an engine. Units are meters and radians, y up, gravity negative y.
 * Rendering (pixels, y down) is the scenario's job.
 */
export type AdapterId = 'rapier';

export interface Vec2 {
  x: number;
  y: number;
}

export type BodyType = 'static' | 'kinematic' | 'dynamic';

export interface BodyDef {
  type?: BodyType;
  position?: Vec2;
  angle?: number;
  linearVelocity?: Vec2;
  angularVelocity?: number;
  fixedRotation?: boolean;
  /** Continuous collision for fast bodies (pinball ball, projectiles). */
  bullet?: boolean;
  linearDamping?: number;
  angularDamping?: number;
  /** Let the engine put the body to sleep at rest. Default true. Set false on slow rollers. */
  canSleep?: boolean;
}

export interface ShapeOptions {
  density?: number;
  friction?: number;
  restitution?: number;
  /** Sensor shapes report contacts but do not collide. */
  sensor?: boolean;
  /** Emit contact events for this shape. Default true. */
  events?: boolean;
  /** Collision filter: this shape is in `group` (bit flags) and collides only with shapes whose
   * group intersects `mask`. Default: group 1, mask everything. Shapes of one vehicle use
   * group 0x2 / mask 0xFFFD so they never collide with each other. */
  filter?: { group: number; mask: number };
}

export type Shape =
  | { kind: 'circle'; radius: number; center?: Vec2 }
  | { kind: 'box'; halfWidth: number; halfHeight: number; center?: Vec2; angle?: number }
  | { kind: 'polygon'; vertices: Vec2[] }
  /**
   * Open or closed line of segments for terrain. Attach to a static body.
   * Solid on the LEFT of the walking direction: a ground listed left to right is solid from
   * above, and a counter-clockwise loop is solid inside. (Rapier is two-sided; Box2D is adapted.)
   */
  | { kind: 'chain'; vertices: Vec2[]; loop?: boolean };

export type BodyId = number;
export type JointId = number;

export interface MotorOptions {
  enabled: boolean;
  /** Target angular speed in rad/s. */
  speed: number;
  /** Maximum torque the motor may apply. */
  maxTorque: number;
}

export interface AngleLimits {
  lower: number;
  upper: number;
}

export interface SpringOptions {
  /** Spring frequency in Hz (with the reduced mass of the two bodies). */
  hertz: number;
  /** Damping ratio, 1 = critically damped. */
  dampingRatio: number;
  /** Absolute stiffness in N/m; when set, `hertz` is ignored. A truss rod uses K1 / length so its
   * stiffness does not depend on which bodies it joins. */
  stiffness?: number;
}

interface JointBase {
  bodyA: BodyId;
  bodyB: BodyId;
  /** Anchor in body A's local frame. */
  anchorA: Vec2;
  /** Anchor in body B's local frame. */
  anchorB: Vec2;
  /**
   * World distance between the two anchor points above which the joint is destroyed.
   * Measured after every step by the interface layer. Use it on `distance` joints with a spring:
   * those stretch measurably on every engine. Revolute and weld joints only stretch on engines
   * with soft joints (Box2D), so a gap rule on them is not portable.
   */
  breakDistance?: number;
}

export type JointDef =
  | ({ kind: 'revolute'; motor?: MotorOptions; limits?: AngleLimits } & JointBase)
  /** A wheel is a revolute joint with a motor. Suspension is not in v1. */
  | ({ kind: 'wheel'; motor?: MotorOptions } & JointBase)
  /**
   * Keeps the anchors at `length` apart. With `spring` it stretches like a spring.
   * Without `spring` it is rigid on Box2D and a stiff spring on Rapier (parity gap, documented).
   */
  | ({ kind: 'distance'; length: number; spring?: SpringOptions } & JointBase)
  /**
   * Slides along `axis` (body A's local frame). `limits` are along the axis in meters. With
   * `spring` the joint pulls back to zero offset like a spring; `mass` overrides the reduced mass
   * used to turn hertz into stiffness (a suspension passes half the chassis mass).
   */
  | ({ kind: 'prismatic'; axis: Vec2; limits?: AngleLimits; spring?: SpringOptions & { mass?: number } } & JointBase)
  | ({ kind: 'weld' } & JointBase);

export interface ContactEvent {
  bodyA: BodyId;
  bodyB: BodyId;
  /** true when the shapes started touching, false when they stopped. */
  began: boolean;
}

export interface RayHit {
  body: BodyId;
  point: Vec2;
  /** 0..1 along the translation vector. */
  fraction: number;
}

export interface Transform {
  position: Vec2;
  angle: number;
}

export interface StepResult {
  contacts: ContactEvent[];
  /** Joints destroyed this step because their anchors exceeded breakDistance. */
  broken: JointId[];
}

export interface PhysicsWorld {
  readonly adapter: AdapterId;
  setGravity(gravity: Vec2): void;

  createBody(def?: BodyDef): BodyId;
  addShape(body: BodyId, shape: Shape, options?: ShapeOptions): void;
  destroyBody(body: BodyId): void;
  /** Switch a body between static, kinematic and dynamic; keeps its id and shapes. */
  setBodyType(body: BodyId, type: BodyType): void;
  isSleeping(body: BodyId): boolean;

  createJoint(def: JointDef): JointId;
  destroyJoint(joint: JointId): void;
  /** Velocity motor on a revolute, wheel or prismatic joint. `factor` scales the correction
   * (torque = factor * speed error, capped at maxTorque); 10 behaves like a speed controller. */
  setMotor(joint: JointId, speed: number, maxTorque: number, factor?: number): void;

  getTransform(body: BodyId): Transform;
  getLinearVelocity(body: BodyId): Vec2;
  setLinearVelocity(body: BodyId, velocity: Vec2): void;
  getAngularVelocity(body: BodyId): number;
  /** Sets the angular velocity (rad/s). On a kinematic body this drives its rotation. */
  setAngularVelocity(body: BodyId, omega: number): void;
  getMass(body: BodyId): number;
  /** Sets the friction of every collider on the body; takes effect from the next step. The
   * engine combines it with the other collider's friction per contact (Rapier: the average), so a
   * slippery pair needs BOTH sides low. 2026-10-09: the rover's wheels change grip with the ground
   * under them (sand, ice) every fixed step. */
  setFriction(body: BodyId, friction: number): void;
  applyForce(body: BodyId, force: Vec2): void;
  applyImpulse(body: BodyId, impulse: Vec2): void;
  /** Local point on a body to world coordinates. */
  worldPoint(body: BodyId, local: Vec2): Vec2;

  /** Advance by dt seconds using subSteps fixed sub-steps. Never pass a wall-clock delta. */
  step(dt: number, subSteps: number): StepResult;

  /** Closest hit along the translation. Reflects the world after the last step(). */
  castRay(origin: Vec2, translation: Vec2): RayHit | null;

  /** Live bodies in creation order. */
  bodies(): BodyId[];
  jointCount(): number;

  /** FNV-1a hash of every live body's position and angle, quantized to 4 decimals. */
  hash(): string;

  destroy(): void;
}

export interface WorldOptions {
  gravity?: Vec2;
}

/** The fixed step every scenario uses. 1/60 s with 4 sub-steps. */
export const FIXED_DT = 1 / 60;
export const FIXED_SUBSTEPS = 4;
